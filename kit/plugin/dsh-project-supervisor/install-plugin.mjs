#!/usr/bin/env node
/**
 * Cross-platform installer for the dsh-project-supervisor panel plugin.
 *
 * Works on Windows / macOS / Linux with a plain Node.js (>= 18) install —
 * no bash, no python, no symlink privileges required (it falls back to copying).
 *
 * Usage:
 *   node install-plugin.mjs                     # install into ~/.dsh/profiles/web
 *   node install-plugin.mjs --profile <dir>     # install into another profile dir
 *   node install-plugin.mjs --uninstall         # remove from the profile
 *   node install-plugin.mjs --copy              # force copy instead of symlink
 *   node install-plugin.mjs --dry-run           # print what would change
 *   node install-plugin.mjs --plugin <dir>      # install a plugin folder other than this one
 *
 * What it does (idempotent):
 *   1. backs up the profile's package.json + cordis.patch.yml under .backups/<ts>/;
 *   2. puts the plugin into <profile>/node_modules/<name> (symlink/junction, or copy);
 *   3. adds "dsh-project-supervisor": "link:<plugin dir>" to profile dependencies
 *      and appends the package name to dsh.profile.bundles.
 *
 * After installing, refresh the DSH page (or restart `dsh web`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_NAME = 'dsh-project-supervisor';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const IS_WINDOWS = process.platform === 'win32';

function fail(message) {
  console.error('\n错误：' + message);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    profile: process.env.PROFILE_DIR || path.join(os.homedir(), '.dsh', 'profiles', 'web'),
    plugin: HERE,
    uninstall: false,
    copy: false,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') options.profile = argv[++index];
    else if (arg === '--plugin') options.plugin = argv[++index];
    else if (arg === '--uninstall') options.uninstall = true;
    else if (arg === '--copy') options.copy = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '-h' || arg === '--help') {
      const text = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
      console.log(text.split('\n').slice(1, 26).map((line) => line.replace(/^ \* ?/, '')).join('\n'));
      process.exit(0);
    } else fail('未知参数：' + arg);
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

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

/** `link:` spec must use forward slashes even on Windows (JSON + pnpm friendly). */
function linkSpec(pluginDir) {
  return 'link:' + pluginDir.replace(/\\/g, '/');
}

function profileState(manifest, pluginDir) {
  const dependencies = manifest.dependencies || {};
  const profile = (manifest.dsh && manifest.dsh.profile) || {};
  const bundles = Array.isArray(profile.bundles) ? profile.bundles : [];
  return { dependencies, profile, bundles, installed: PLUGIN_NAME in dependencies || bundles.includes(PLUGIN_NAME) };
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

function backupProfile(profileDir) {
  const backupDir = path.join(profileDir, '.backups', timestamp());
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

function installEntry(profileDir, pluginDir, forceCopy) {
  const nodeModules = path.join(profileDir, 'node_modules');
  const target = path.join(nodeModules, PLUGIN_NAME);
  fs.mkdirSync(nodeModules, { recursive: true });
  fs.rmSync(target, { recursive: true, force: true });
  if (!forceCopy) {
    try {
      fs.symlinkSync(pluginDir, target, IS_WINDOWS ? 'junction' : 'dir');
      return { mode: 'symlink', target };
    } catch (error) {
      console.warn(
        '  提示：创建链接失败（' +
          ((error && error.code) || 'unknown') +
          '），改用复制方式；以后更新插件后需要重新运行本脚本。',
      );
    }
  }
  fs.cpSync(pluginDir, target, { recursive: true, filter: (source) => !source.includes(`${path.sep}node_modules${path.sep}`) });
  return { mode: 'copy', target };
}

function printNextSteps(profileDir) {
  console.log('');
  console.log('完成。下一步：');
  console.log('  1. 刷新 DSH 页面（或重启 `dsh web`），侧栏出现「主管」入口即成功。');
  console.log('  2. 若页面没有变化：确认当前 profile 就是 ' + profileDir + '（dsh web 默认使用 web profile）。');
  console.log('  3. 如需卸载：node install-plugin.mjs --uninstall' + (IS_WINDOWS ? '' : ' --profile "' + profileDir + '"'));
  if (IS_WINDOWS) {
    console.log('  4. Windows 提示：不要用管理员权限运行 DSH；如果 DSH 起不来，先执行 --uninstall 再重启。');
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
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
  const state = profileState(manifest, pluginDir);
  const expectedLink = linkSpec(pluginDir);

  if (options.uninstall) {
    if (!state.installed) {
      console.log('未安装（无需卸载）：' + PLUGIN_NAME);
      return;
    }
    if (options.dryRun) {
      console.log('[dry-run] 将从 ' + profileDir + ' 移除 ' + PLUGIN_NAME);
      return;
    }
    const backupDir = backupProfile(profileDir);
    delete state.dependencies[PLUGIN_NAME];
    manifest.dependencies = state.dependencies;
    manifest.dsh = manifest.dsh || {};
    manifest.dsh.profile = state.profile;
    state.profile.bundles = state.bundles.filter((item) => item !== PLUGIN_NAME);
    writeJson(profileManifestPath, manifest);
    fs.rmSync(path.join(profileDir, 'node_modules', PLUGIN_NAME), { recursive: true, force: true });
    console.log('已卸载 ' + PLUGIN_NAME + '（配置备份在 ' + backupDir + '）。');
    console.log('刷新 DSH 页面（或重启 dsh web）后生效。');
    return;
  }

  const upToDate = state.dependencies[PLUGIN_NAME] === expectedLink && state.bundles.includes(PLUGIN_NAME);
  const entryExists = fs.existsSync(path.join(profileDir, 'node_modules', PLUGIN_NAME));

  if (options.dryRun) {
    console.log('[dry-run] profile: ' + profileDir);
    console.log('[dry-run] 插件源: ' + pluginDir);
    console.log('[dry-run] 配置' + (upToDate ? '已最新（只需刷新链接/复制）' : '需要更新'));
    console.log('[dry-run] node_modules 条目' + (entryExists ? '已存在' : '不存在'));
    return;
  }

  if (upToDate && entryExists) {
    // Keep the link/copy fresh but do not touch profile config or backups.
    const attached = installEntry(profileDir, pluginDir, options.copy);
    console.log('已安装且配置最新（无需改动）：' + pluginDir + '（' + attached.mode + '）');
    printNextSteps(profileDir);
    return;
  }

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
  writeJson(profileManifestPath, manifest);
  console.log('dependencies["' + PLUGIN_NAME + '"] = "' + expectedLink + '"');
  console.log('dsh.profile.bundles 已包含 ' + PLUGIN_NAME);
  printNextSteps(profileDir);
}

try {
  main();
} catch (error) {
  fail((error && error.stack) || String(error));
}
