#!/usr/bin/env node
/**
 * Cross-platform installer for the dsh-project-supervisor panel plugin.
 *
 * Works on Windows / macOS / Linux with a plain Node.js (>= 18) install —
 * no bash, no python, no symlink privileges required (it falls back to copying).
 *
 * Usage:
 *   node install-plugin.mjs                     # install into ${DSH_HOME:-~/.dsh}/profiles/${PROFILE:-web}
 *   node install-plugin.mjs --profile <dir>     # install into another profile dir (wins over env)
 *   node install-plugin.mjs --uninstall         # remove dependency, bundle entry and node_modules entry
 *   node install-plugin.mjs --copy              # force copy instead of symlink
 *   node install-plugin.mjs --dry-run           # print what would change, write nothing
 *   node install-plugin.mjs --plugin <dir>      # install a plugin folder other than this one
 *   node install-plugin.mjs --help
 *
 * Env: DSH_HOME (default ~/.dsh), PROFILE (default web), PROFILE_DIR (default profile dir;
 * --profile wins). Fix, no python3 involved.
 *
 * What it does (idempotent):
 *   1. backs up the profile's package.json + cordis.patch.yml under .backups/<ts>/;
 *   2. puts the plugin into <profile>/node_modules/<name> (symlink/junction, or copy);
 *   3. adds "dsh-project-supervisor": "link:<plugin dir>" to profile dependencies
 *      and appends the package name to dsh.profile.bundles;
 *   4. records {version, installedAt, mode, pluginDir} in <profile>/.dsh-project-supervisor.json.
 *
 * Re-running reports the installed version and only refreshes the link/copy — it never
 * duplicates config backups. After installing, refresh the DSH page (or restart `dsh web`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_NAME = 'dsh-project-supervisor';
const STATE_FILE = '.dsh-project-supervisor.json';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const IS_WINDOWS = process.platform === 'win32';
/** Always copied even if package.json "files" forgets them. */
const ALWAYS_KEEP = ['package.json', 'index.js', 'client.js', 'cordis.patch.yml', 'README.md', 'LICENSE'];
/** Never copied, at any depth, even if listed in package.json "files". */
const NEVER_COPY = new Set(['.git', 'node_modules', 'screenshots', 'kit', 'dist', '.backups']);

const USAGE = [
  '用法（Node.js >= 18；不依赖 bash / python3）：',
  '  node install-plugin.mjs                     # 安装到 ${DSH_HOME:-~/.dsh}/profiles/${PROFILE:-web}',
  '  node install-plugin.mjs --profile <目录>     # 安装到指定 profile 目录（优先于环境变量）',
  '  node install-plugin.mjs --uninstall         # 卸载（先备份配置，再删依赖/bundle 条目与 node_modules 条目）',
  '  node install-plugin.mjs --copy              # 强制复制安装（默认链接；链接失败自动复制）',
  '  node install-plugin.mjs --dry-run           # 只预览，不写任何文件',
  '  node install-plugin.mjs --plugin <目录>      # 安装本目录之外的插件副本',
  '  node install-plugin.mjs --help',
  '',
  '环境变量：DSH_HOME（默认 ~/.dsh）、PROFILE（默认 web）、PROFILE_DIR（默认 profile 目录）',
  '状态文件：<profile>/' + STATE_FILE + '（记录 version / installedAt / mode / pluginDir）',
  '重复运行只刷新链接/复制，不会重复备份配置；配置变更前备份到 <profile>/.backups/<时间戳>/。',
].join('\n');

function fail(message) {
  console.error('\n错误：' + message);
  process.exit(1);
}

function warn(message) {
  console.warn('  提示：' + message);
}

/** ${DSH_HOME:-~/.dsh}/profiles/${PROFILE:-web} — used when neither --profile nor PROFILE_DIR is given. */
function defaultProfileDir() {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(dshHome, 'profiles', process.env.PROFILE || 'web');
}

function parseArgs(argv) {
  const options = {
    profile: process.env.PROFILE_DIR || defaultProfileDir(),
    plugin: HERE,
    uninstall: false,
    copy: false,
    dryRun: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') {
      const value = argv[++index];
      if (!value) fail('--profile 需要一个目录参数');
      options.profile = value;
    } else if (arg === '--plugin') {
      const value = argv[++index];
      if (!value) fail('--plugin 需要一个目录参数');
      options.plugin = value;
    } else if (arg === '--uninstall') options.uninstall = true;
    else if (arg === '--copy') options.copy = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '-h' || arg === '--help') options.help = true;
    else fail('未知参数：' + arg + '（可用：--profile、--plugin、--uninstall、--copy、--dry-run、--help）');
  }
  if (!options.profile) fail('缺少 --profile 目录');
  if (!options.plugin) fail('缺少 --plugin 目录');
  options.profile = path.resolve(options.profile);
  options.plugin = path.resolve(options.plugin);
  return options;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Atomic write: temp file + rename, so a crash never leaves a truncated profile package.json. */
function writeJson(file, value) {
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, file);
}

/** `link:` spec must use forward slashes even on Windows (JSON + pnpm friendly). */
function linkSpec(pluginDir) {
  return 'link:' + pluginDir.replace(/\\/g, '/');
}

function pluginVersion(pluginDir) {
  try {
    const manifest = readJson(path.join(pluginDir, 'package.json'));
    return manifest.version || 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

function statePath(profileDir) {
  return path.join(profileDir, STATE_FILE);
}

function readState(profileDir) {
  try {
    return readJson(statePath(profileDir));
  } catch (error) {
    return null;
  }
}

function writeState(profileDir, mode, pluginDir, previous) {
  const now = new Date().toISOString();
  const state = {
    version: pluginVersion(pluginDir),
    installedAt: previous && previous.installedAt ? previous.installedAt : now,
    refreshedAt: now,
    mode,
    pluginDir,
    profile: profileDir,
    manager: 'install-plugin.mjs',
  };
  writeJson(statePath(profileDir), state);
  return state;
}

function removeState(profileDir) {
  const file = statePath(profileDir);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file, { force: true });
  return true;
}

/** 'symlink' | 'copy' | 'none' — lstat only, never follows the link. */
function entryMode(profileDir) {
  const target = path.join(profileDir, 'node_modules', PLUGIN_NAME);
  try {
    const stat = fs.lstatSync(target);
    return stat.isSymbolicLink() ? 'symlink' : 'copy';
  } catch (error) {
    return 'none';
  }
}

/**
 * H5: remove only the exact `node_modules/<name>` path (symlink or real dir/file),
 * so a stale real directory can never turn into `.../<name>/<name>` nesting.
 */
function removeEntry(profileDir) {
  const target = path.join(profileDir, 'node_modules', PLUGIN_NAME);
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    return 'none';
  }
  if (stat.isSymbolicLink() || stat.isFile()) fs.unlinkSync(target);
  else fs.rmSync(target, { recursive: true, force: true });
  return stat.isSymbolicLink() ? 'symlink' : 'copy';
}

/**
 * fs.cpSync filter for the copy fallback: package.json "files" whitelist plus
 * ALWAYS_KEEP, minus NEVER_COPY. This keeps .git / screenshots / kit / dist out
 * of the profile instead of blindly copying the whole plugin folder.
 */
function copyFilter(pluginDir) {
  let manifest = {};
  try {
    manifest = readJson(path.join(pluginDir, 'package.json'));
  } catch (error) {
    manifest = {};
  }
  const entries = [];
  for (const name of ALWAYS_KEEP.concat(Array.isArray(manifest.files) ? manifest.files : [])) {
    const entry = String(name).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
    if (!entry) continue;
    if (NEVER_COPY.has(entry.split('/')[0])) continue;
    if (!entries.includes(entry)) entries.push(entry);
  }
  return (source) => {
    const rel = path.relative(pluginDir, source).replace(/\\/g, '/');
    if (rel === '' || rel === '.') return true;
    const parts = rel.split('/');
    if (parts.some((part) => NEVER_COPY.has(part))) return false;
    // allow whitelist entries, their ancestors (needed for directories) and descendants
    return entries.some((entry) => rel === entry || rel.startsWith(entry + '/') || entry.startsWith(rel + '/'));
  };
}

function installEntry(profileDir, pluginDir, forceCopy) {
  const nodeModules = path.join(profileDir, 'node_modules');
  const target = path.join(nodeModules, PLUGIN_NAME);
  fs.mkdirSync(nodeModules, { recursive: true });
  const replaced = removeEntry(profileDir);
  if (!forceCopy) {
    try {
      fs.symlinkSync(pluginDir, target, IS_WINDOWS ? 'junction' : 'dir');
      return { mode: 'symlink', target, replaced };
    } catch (error) {
      warn(
        '创建链接失败（' +
          ((error && error.code) || 'unknown') +
          '），改用复制方式；以后更新插件后需要重新运行本脚本。',
      );
    }
  }
  fs.cpSync(pluginDir, target, { recursive: true, filter: copyFilter(pluginDir) });
  return { mode: 'copy', target, replaced };
}

function profileState(manifest, profileDir) {
  const dependencies = manifest.dependencies || {};
  const profile = (manifest.dsh && manifest.dsh.profile) || {};
  const bundles = Array.isArray(profile.bundles) ? profile.bundles : [];
  const mode = entryMode(profileDir);
  return {
    dependencies,
    profile,
    bundles,
    mode,
    installed: PLUGIN_NAME in dependencies || bundles.includes(PLUGIN_NAME) || mode !== 'none',
  };
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return (
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    '-' +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

function uniqueBackupDir(profileDir) {
  const base = path.join(profileDir, '.backups', timestamp());
  if (!fs.existsSync(base)) return base;
  for (let index = 2; ; index += 1) {
    const candidate = base + '-' + index;
    if (!fs.existsSync(candidate)) return candidate;
  }
}

function backupProfile(profileDir) {
  const backupDir = uniqueBackupDir(profileDir);
  fs.mkdirSync(backupDir, { recursive: true });
  const files = ['package.json', 'cordis.patch.yml'];
  const copied = [];
  for (const name of files) {
    const source = path.join(profileDir, name);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(backupDir, name));
      copied.push(name);
    }
  }
  return backupDir;
}

function printNextSteps(profileDir) {
  console.log('');
  console.log('完成。下一步：');
  console.log('  1. 刷新 DSH 页面（或重启 `dsh web`），侧栏出现「主管」入口即成功。');
  console.log('  2. 若页面没有变化：确认当前 profile 就是 ' + profileDir + '（dsh web 默认使用 web profile）。');
  console.log('  3. 如需卸载：node install-plugin.mjs --uninstall --profile "' + profileDir + '"');
  if (IS_WINDOWS) {
    console.log('  4. Windows 提示：不要用管理员权限运行 DSH；如果 DSH 起不来，先执行 --uninstall 再重启。');
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const profileDir = options.profile;
  const pluginDir = options.plugin;

  if (!fs.existsSync(pluginDir) || !fs.existsSync(path.join(pluginDir, 'package.json'))) {
    fail('插件目录无效（缺 package.json）：' + pluginDir);
  }
  const profileManifestPath = path.join(profileDir, 'package.json');
  if (!fs.existsSync(profileManifestPath)) {
    fail(
      '找不到 DSH profile：' +
        profileDir +
        '。请先运行一次 `dsh web` 生成 profile，或用 --profile 指定正确目录。',
    );
  }
  let manifest;
  try {
    manifest = readJson(profileManifestPath);
  } catch (error) {
    fail('profile 的 package.json 不是合法 JSON：' + ((error && error.message) || 'parse error'));
  }
  const state = profileState(manifest, profileDir);
  const version = pluginVersion(pluginDir);
  const expectedLink = linkSpec(pluginDir);
  const upToDate = state.dependencies[PLUGIN_NAME] === expectedLink && state.bundles.includes(PLUGIN_NAME);
  const previousState = readState(profileDir);

  if (options.uninstall) {
    if (!state.installed) {
      if (!options.dryRun) removeState(profileDir);
      console.log('未安装（无需卸载）：' + PLUGIN_NAME);
      return;
    }
    if (options.dryRun) {
      console.log('[dry-run] 将从 ' + profileDir + ' 卸载 ' + PLUGIN_NAME + '：');
      console.log('[dry-run]   - dependencies 与 dsh.profile.bundles 中的条目');
      console.log('[dry-run]   - node_modules/' + PLUGIN_NAME + '（当前：' + state.mode + '）');
      console.log('[dry-run]   - 状态文件 ' + STATE_FILE + '；配置会先备份到 .backups/<时间戳>/');
      console.log('[dry-run] 未写入任何文件。');
      return;
    }
    const backupDir = backupProfile(profileDir);
    console.log('已备份 profile 配置到：' + backupDir);
    delete state.dependencies[PLUGIN_NAME];
    manifest.dependencies = state.dependencies;
    manifest.dsh = manifest.dsh || {};
    manifest.dsh.profile = state.profile;
    state.profile.bundles = state.bundles.filter((item) => item !== PLUGIN_NAME);
    try {
      writeJson(profileManifestPath, manifest);
    } catch (error) {
      fail('写入 profile package.json 失败（配置备份在 ' + backupDir + '）：' + ((error && error.message) || error));
    }
    const removed = removeEntry(profileDir);
    removeState(profileDir);
    console.log('已卸载 ' + PLUGIN_NAME + '（node_modules 条目：' + (removed === 'none' ? '原本不存在' : '已删除 ' + removed) + '）。');
    console.log('刷新 DSH 页面（或重启 dsh web）后生效。');
    return;
  }

  if (options.dryRun) {
    console.log('[dry-run] profile: ' + profileDir);
    console.log('[dry-run] 插件源: ' + pluginDir + '（v' + version + '）');
    console.log(
      '[dry-run] 配置' +
        (upToDate ? '已最新' : '需要更新') +
        '；node_modules 条目' +
        (state.mode === 'none' ? '不存在' : '已存在（' + state.mode + '）'),
    );
    if (upToDate && state.mode !== 'none') {
      console.log('[dry-run] 将刷新链接/复制并更新状态文件；未写入任何文件。');
    } else {
      console.log('[dry-run] 将备份配置、写入 dependencies/bundles、刷新 node_modules 条目并写状态文件；未写入任何文件。');
    }
    return;
  }

  if (upToDate && state.mode !== 'none') {
    const attached = installEntry(profileDir, pluginDir, options.copy);
    const written = writeState(profileDir, attached.mode, pluginDir, previousState);
    console.log('已安装 v' + written.version + '（' + attached.mode + '）：配置最新，已刷新链接/复制。');
    printNextSteps(profileDir);
    return;
  }

  const firstInstall = !state.installed;
  const backupDir = backupProfile(profileDir);
  console.log('已备份 profile 配置到：' + backupDir);

  const attached = installEntry(profileDir, pluginDir, options.copy);
  console.log('已写入 node_modules/' + PLUGIN_NAME + '（' + attached.mode + '）');

  manifest.dependencies = manifest.dependencies || {};
  manifest.dependencies[PLUGIN_NAME] = expectedLink;
  manifest.dsh = manifest.dsh || {};
  manifest.dsh.profile = manifest.dsh.profile || {};
  if (!Array.isArray(manifest.dsh.profile.bundles)) manifest.dsh.profile.bundles = [];
  if (!manifest.dsh.profile.bundles.includes(PLUGIN_NAME)) {
    manifest.dsh.profile.bundles.push(PLUGIN_NAME);
  }
  try {
    writeJson(profileManifestPath, manifest);
  } catch (error) {
    removeEntry(profileDir); // roll back the entry so we never leave a half install
    fail('写入 profile package.json 失败，已回滚 node_modules 条目（配置备份在 ' + backupDir + '）：' + ((error && error.message) || error));
  }
  const written = writeState(profileDir, attached.mode, pluginDir, previousState);
  console.log('dependencies["' + PLUGIN_NAME + '"] = "' + expectedLink + '"');
  console.log('dsh.profile.bundles 已包含 ' + PLUGIN_NAME);
  console.log(
    (firstInstall ? '安装完成' : '已安装') +
      '：v' +
      written.version +
      '（' +
      attached.mode +
      '）' +
      (firstInstall ? '，状态记录在 ' + STATE_FILE + '。' : '，配置已更新。'),
  );
  printNextSteps(profileDir);
}

try {
  main();
} catch (error) {
  fail((error && error.stack) || String(error));
}
