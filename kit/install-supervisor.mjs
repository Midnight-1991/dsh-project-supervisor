#!/usr/bin/env node
/**
 * Cross-platform installer for the project-supervisor kit.
 *
 * 用法（Node >= 18；不需要 python）：
 *   node install-supervisor.mjs <workspace>                    # AGENTS + 技能 + 手册 + patches
 *   node install-supervisor.mjs <workspace> --with-research    # 另装调研资料 + DECISIONS 模板
 *   node install-supervisor.mjs <workspace> --global-skill     # 另装全局技能（所有工作区可用）
 *   node install-supervisor.mjs <workspace> --force            # 覆盖升级（覆盖前旧文件备份为 *.bak.<时间戳>）
 *   node install-supervisor.mjs <workspace> --dry-run          # 只预检 + 输出计划，不写任何文件
 *   node install-supervisor.mjs <workspace> --dsh-home <dir>   # 指定全局技能目录（默认 $DSH_HOME 或 ~/.dsh）
 *
 * 覆盖策略（默认保守）：
 *   - 默认只写缺失文件；已存在的文件跳过并提示「已存在，跳过（--force 覆盖）」。
 *   - 只有 --force 才覆盖已有文件，覆盖前逐个备份为 <文件>.bak.<YYYYmmdd-HHMMSS>。
 *   - 已有 AGENTS.md 且不是主管规则时：默认生成 AGENTS.supervisor.md 供合并；--force 时备份并覆盖 AGENTS.md。
 *     主管规则判定：首行标题「# 项目主管作业规则（本工作区）」或含标记「<!-- dsh-project-supervisor -->」。
 *   - 安装成功后写 <workspace>/.dsh/supervisor-kit.json（name/version/installedAt/installer）；
 *     同版本且无 force 时重复安装不改动任何已有文件（幂等）。
 *   - --dry-run 只做源文件预检并输出计划（含将写入的路径），一次写操作都不执行。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IS_WINDOWS = process.platform === 'win32';
const PROJECT_SKILL_TEMPLATES = ['plan.md', 'task-brief.md', 'ledger.md', 'review-gate.md'];
const AGENTS_TITLE = '# 项目主管作业规则（本工作区）';
const AGENTS_MARKER = '<!-- dsh-project-supervisor -->';
const KIT_NAME = 'project-supervisor-kit';
const INSTALLER = 'install-supervisor.mjs';

function fail(message) {
  console.error('\n错误：' + message);
  process.exit(1);
}

function printHelp() {
  const lines = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
  const end = lines.findIndex((line) => line.trim() === '*/');
  const body = lines.slice(2, end < 0 ? 21 : end).map((line) => line.replace(/^ \* ?/, ''));
  console.log(body.join('\n').trim());
}

function parseArgs(argv) {
  const options = {
    target: '',
    research: false,
    globalSkill: false,
    force: false,
    dryRun: false,
    dshHome: process.env.DSH_HOME || path.join(os.homedir(), '.dsh'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--with-research') options.research = true;
    else if (arg === '--global-skill') options.globalSkill = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--dsh-home' || arg.startsWith('--dsh-home=')) {
      let value = '';
      if (arg === '--dsh-home') {
        const next = argv[index + 1];
        if (next === undefined || next.startsWith('-')) fail('缺少 --dsh-home 的目录参数');
        value = next;
        index += 1;
      } else {
        value = arg.slice('--dsh-home='.length);
      }
      if (!value) fail('缺少 --dsh-home 的目录参数');
      options.dshHome = value;
    } else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('-')) fail('未知参数：' + arg);
    else options.target = arg;
  }
  options.target = path.resolve(options.target || '.');
  options.dshHome = path.resolve(options.dshHome);
  return options;
}

// ---- 基础工具 --------------------------------------------------------------
const exists = (file) => fs.existsSync(file);
const readText = (file) => fs.readFileSync(file, 'utf8');

function listFiles(dir) {
  const result = [];
  const walk = (current, prefix) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const rel = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isDirectory()) walk(path.join(current, entry.name), rel);
      else result.push(rel);
    }
  };
  if (exists(dir)) walk(dir, '');
  return result.sort();
}

function isSupervisorRules(file) {
  try {
    const text = readText(file).replace(/^\uFEFF/, '');
    return text.startsWith(AGENTS_TITLE) || text.includes(AGENTS_MARKER);
  } catch {
    return false;
  }
}

function timestamp() {
  const value = new Date();
  const pad = (number) => String(number).padStart(2, '0');
  return String(value.getFullYear()) + pad(value.getMonth() + 1) + pad(value.getDate())
    + '-' + pad(value.getHours()) + pad(value.getMinutes()) + pad(value.getSeconds());
}

function installedVersion(recordPath) {
  try {
    const record = JSON.parse(readText(recordPath));
    return typeof record.version === 'string' ? record.version : '';
  } catch {
    return '';
  }
}

// ---- 预检（任何写操作之前一次性列出全部缺失项） ----------------------------
function precheck(kit, options) {
  const missing = [];
  const requireFile = (rel) => {
    const file = path.join(kit, rel);
    if (!exists(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) missing.push(rel);
  };
  requireFile('AGENTS.supervisor.md');
  requireFile('主管手册.md');
  requireFile('DECISIONS.template.md');
  requireFile('VERSION');
  requireFile('skill/SKILL.md');
  for (const name of PROJECT_SKILL_TEMPLATES) requireFile('skill/templates/' + name);
  requireFile('skill-improving-prompts/SKILL.md');
  requireFile('skill-improving-prompts/LICENSE');
  if (listFiles(path.join(kit, 'skill-improving-prompts', 'references')).filter((name) => name.endsWith('.md')).length === 0) {
    missing.push('skill-improving-prompts/references/*.md');
  }
  if (listFiles(path.join(kit, 'skill-improving-prompts', 'templates')).filter((name) => name.endsWith('.md')).length === 0) {
    missing.push('skill-improving-prompts/templates/*.md');
  }
  if (exists(path.join(kit, 'patches')) && listFiles(path.join(kit, 'patches')).length === 0) {
    missing.push('patches/（目录为空）');
  }
  if (options.research) {
    const research = path.join(kit, 'research');
    if (listFiles(research).filter((name) => name.endsWith('.md')).length === 0) missing.push('research/*.md（--with-research）');
  }
  const version = readText(path.join(kit, 'VERSION')).trim();
  if (!version) missing.push('VERSION（内容为空）');
  return { missing, version };
}

// ---- 安装 ------------------------------------------------------------------
function install(options) {
  const kit = HERE;
  const target = options.target;
  const dry = options.dryRun;

  if (!exists(target)) fail('目标目录不存在：' + target + '（请先创建目录）');
  if (!fs.statSync(target).isDirectory()) fail('目标不是目录：' + target);
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(nodeMajor) || nodeMajor < 18) fail('需要 Node >= 18（当前 ' + process.versions.node + '）');

  // M8：任何写入之前完整预检，缺任何一项都不写文件。
  const check = precheck(kit, options);
  if (check.missing.length > 0) {
    fail('安装包预检失败，缺少 ' + check.missing.length + ' 项（未写入任何文件）：\n  - '
      + check.missing.join('\n  - '));
  }
  const kitVersion = check.version;

  const recordPath = path.join(target, '.dsh', 'supervisor-kit.json');
  const oldVersion = installedVersion(recordPath);
  console.log('==> 目标工作区: ' + target);
  console.log('==> 套件版本: v' + kitVersion + (oldVersion ? '；已安装: v' + oldVersion : '（未安装）'));
  if (oldVersion && oldVersion !== kitVersion) {
    console.log('==> 已安装 v' + oldVersion + ' → 更新到 v' + kitVersion
      + (options.force ? '' : '（未加 --force：已有文件先保持不变，加 --force 覆盖升级）'));
  }

  const actions = [];
  let changed = 0;
  const log = (text, paths) => {
    actions.push({ text, paths: paths || [] });
    if (!dry) console.log('    ' + text);
  };
  const ensureDir = (dir) => {
    if (!dry) fs.mkdirSync(dir, { recursive: true });
  };
  const copyTo = (source, dest) => {
    ensureDir(path.dirname(dest));
    if (!dry) fs.copyFileSync(source, dest);
  };
  const backupOf = (file) => {
    const base = file + '.bak.' + timestamp();
    let backup = base;
    let counter = 1;
    while (exists(backup)) {
      backup = base + '-' + counter;
      counter += 1;
    }
    if (!dry) fs.copyFileSync(file, backup);
    return backup;
  };
  const removeFile = (file) => {
    if (!dry) fs.unlinkSync(file);
  };

  // 1) AGENTS.md（常驻规则）：--force 优先；默认不覆盖已有规则。
  const agentsSource = path.join(kit, 'AGENTS.supervisor.md');
  const agentsPath = path.join(target, 'AGENTS.md');
  const mergePath = path.join(target, 'AGENTS.supervisor.md');
  if (!exists(agentsPath)) {
    copyTo(agentsSource, agentsPath);
    changed += 1;
    log('写入 AGENTS.md（主管常驻规则）', [agentsPath]);
  } else if (options.force) {
    const backup = backupOf(agentsPath);
    copyTo(agentsSource, agentsPath);
    changed += 1;
    log('覆盖 AGENTS.md（主管规则；旧文件已备份：' + path.basename(backup) + '）', [agentsPath, backup]);
    if (exists(mergePath)) {
      const mergeBackup = backupOf(mergePath);
      copyTo(agentsSource, mergePath);
      changed += 1;
      log('覆盖 AGENTS.supervisor.md（旧文件已备份：' + path.basename(mergeBackup) + '）', [mergePath, mergeBackup]);
    }
  } else if (isSupervisorRules(agentsPath)) {
    log('AGENTS.md 已是主管规则，跳过（--force 升级覆盖）');
  } else if (!exists(mergePath)) {
    copyTo(agentsSource, mergePath);
    changed += 1;
    log('已有 AGENTS.md（非主管规则）：已生成 AGENTS.supervisor.md，请合并规则（或加 --force 覆盖）', [mergePath]);
  } else {
    log('AGENTS.supervisor.md 已存在，跳过（--force 覆盖）');
  }

  // 托管目录同步：默认只补缺失文件；--force 逐个备份后覆盖，并清理源中已不存在的多余文件。
  const syncManagedDir = (sourceDir, destDir, label, workspace) => {
    let written = 0;
    let overwritten = 0;
    let skipped = 0;
    const plannedPaths = [];
    const sources = listFiles(sourceDir);
    for (const rel of sources) {
      const source = path.join(sourceDir, rel);
      const dest = path.join(destDir, rel);
      if (!exists(dest)) {
        copyTo(source, dest);
        written += 1;
        changed += 1;
        plannedPaths.push(dest);
      } else if (options.force) {
        const backup = backupOf(dest);
        copyTo(source, dest);
        overwritten += 1;
        changed += 1;
        plannedPaths.push(dest, backup);
      } else {
        skipped += 1;
      }
    }
    let removed = 0;
    if (options.force && exists(destDir)) {
      for (const rel of listFiles(destDir)) {
        if (sources.includes(rel)) continue;
        // 备份产物不当作“多余文件”再备份（否则产生 *.bak.*.bak.* 双后缀）
        if (rel.includes('.bak.')) continue;
        const dest = path.join(destDir, rel);
        backupOf(dest);
        removeFile(dest);
        removed += 1;
        changed += 1;
        plannedPaths.push(dest + '（清理）');
      }
    }
    if (written + overwritten + removed > 0) {
      const parts = ['新增 ' + written];
      if (overwritten > 0) parts.push('覆盖 ' + overwritten);
      if (removed > 0) parts.push('清理 ' + removed);
      log('写入 ' + label + '（' + parts.join('，') + ' 个文件）', plannedPaths);
    } else {
      log(label + ' 已存在（' + skipped + ' 个文件），跳过（--force 覆盖）');
    }
    if (workspace && (written + overwritten > 0) && sources.includes('SKILL.md')) {
      if (!dry) {
        const skillFile = path.join(destDir, 'SKILL.md');
        const text = readText(skillFile);
        const next = text.replace(/^(\s*workspace:\s*)".*"/m,
          (match, prefix) => prefix + '"' + workspace.replace(/\\/g, '/') + '"');
        fs.writeFileSync(skillFile, next, 'utf8');
      }
      log('改写 SKILL.md workspace 元数据 → ' + (workspace || '*'), [path.join(destDir, 'SKILL.md')]);
    }
    return { written, overwritten, skipped, removed };
  };

  // 2) project-supervisor 技能目录（SKILL.md + templates/ 四个模板）
  syncManagedDir(path.join(kit, 'skill'), path.join(target, '.dsh', 'skills', 'project-supervisor'),
    '.dsh/skills/project-supervisor/', target);

  // 2.5) improving-prompts 技能目录（SKILL.md + LICENSE + references/ + templates/）
  syncManagedDir(path.join(kit, 'skill-improving-prompts'), path.join(target, '.dsh', 'skills', 'improving-prompts'),
    '.dsh/skills/improving-prompts/', null);

  // 3) 使用说明：默认不覆盖；--force 备份后覆盖。
  const manualSource = path.join(kit, '主管手册.md');
  const manualPath = path.join(target, '主管手册.md');
  if (!exists(manualPath)) {
    copyTo(manualSource, manualPath);
    changed += 1;
    log('写入 主管手册.md', [manualPath]);
  } else if (options.force) {
    const backup = backupOf(manualPath);
    copyTo(manualSource, manualPath);
    changed += 1;
    log('覆盖 主管手册.md（旧文件已备份：' + path.basename(backup) + '）', [manualPath, backup]);
  } else {
    log('主管手册.md 已存在，跳过（--force 覆盖）');
  }

  // 4) 可选：调研资料 + DECISIONS 模板（默认只补缺失；DECISIONS.md 永不覆盖）
  if (options.research) {
    const researchDir = path.join(target, 'research');
    ensureDir(researchDir);
    const names = listFiles(path.join(kit, 'research')).filter((name) => name.endsWith('.md'));
    let written = 0;
    let overwritten = 0;
    let skipped = 0;
    const plannedPaths = [];
    for (const name of names) {
      const source = path.join(kit, 'research', name);
      const dest = path.join(researchDir, name);
      if (!exists(dest)) {
        copyTo(source, dest);
        written += 1;
        changed += 1;
        plannedPaths.push(dest);
      } else if (options.force) {
        const backup = backupOf(dest);
        copyTo(source, dest);
        overwritten += 1;
        changed += 1;
        plannedPaths.push(dest, backup);
      } else {
        skipped += 1;
      }
    }
    const parts = ['新增 ' + written];
    if (overwritten > 0) parts.push('覆盖 ' + overwritten);
    if (skipped > 0) parts.push('跳过 ' + skipped);
    log('research/（' + parts.join('，') + ' 个文件）', plannedPaths);
    const decisions = path.join(researchDir, 'DECISIONS.md');
    if (!exists(decisions)) {
      copyTo(path.join(kit, 'DECISIONS.template.md'), decisions);
      changed += 1;
      log('生成 research/DECISIONS.md（来自模板，之后由项目维护）', [decisions]);
    } else {
      log('research/DECISIONS.md 已存在，保留（用户决策记录不覆盖，--force 也不覆盖）');
    }
  }

  // 4.5) 可选：权限补丁工具（逐文件处理）
  if (exists(path.join(kit, 'patches'))) {
    syncManagedDir(path.join(kit, 'patches'), path.join(target, 'patches'), 'patches/', null);
  }

  // 5) 可选：全局技能（所有工作区可用）
  if (options.globalSkill) {
    syncManagedDir(path.join(kit, 'skill'), path.join(options.dshHome, 'skills', 'project-supervisor'),
      '全局技能 ' + path.join(options.dshHome, 'skills', 'project-supervisor') + '/', '*');
    syncManagedDir(path.join(kit, 'skill-improving-prompts'),
      path.join(options.dshHome, 'skills', 'improving-prompts'),
      '全局技能 ' + path.join(options.dshHome, 'skills', 'improving-prompts') + '/', null);
  }

  // 6) 版本记录：安装成功后写；同版本且无任何改动时不重写（保持幂等）。
  const noChanges = changed === 0;
  const upToDate = noChanges && oldVersion === kitVersion;
  const record = {
    name: KIT_NAME,
    version: kitVersion,
    installedAt: new Date().toISOString(),
    installer: INSTALLER,
  };
  if (!upToDate) {
    if (dry) {
      log('写入 .dsh/supervisor-kit.json（version=' + kitVersion + '）', [recordPath]);
    } else {
      fs.mkdirSync(path.dirname(recordPath), { recursive: true });
      fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n', 'utf8');
      log('写入 .dsh/supervisor-kit.json（v' + kitVersion + '）', [recordPath]);
    }
  } else if (dry) {
    log('已是最新（v' + kitVersion + '），无需改动任何文件');
  } else {
    console.log('    已是最新（v' + kitVersion + '），未改动任何文件');
  }

  // dry-run：只打印计划，绝不写盘。
  if (dry) {
    console.log('');
    console.log('[dry-run] 目标：' + target + '（只预检 + 计划，未写入任何文件）');
    console.log('[dry-run] 计划（' + actions.length + ' 项）：');
    for (const action of actions) {
      console.log('  - ' + action.text);
      for (const planned of action.paths) console.log('      → ' + planned);
    }
    return;
  }

  console.log('');
  console.log('完成。下一步：');
  console.log('1. 在 DSH 里把 ' + target + ' 注册/打开为工作区，新建一个会话（cwd 必须是该目录）。');
  console.log('2. 直接说项目目标，或说「你当项目主管」进入主管模式。');
  console.log('3. 想看并行对话框：打开会话页头的「智能体团队」面板点成员行。');
  console.log('4. 冒烟清单见 主管手册.md「下次新会话的冒烟清单」。');
  if (IS_WINDOWS) console.log('5. Windows 提示：若 DSH 异常，先删除该工作区，再重启 `dsh web` 排查。');
}

try {
  install(parseArgs(process.argv.slice(2)));
} catch (error) {
  fail((error && error.message) || String(error));
}
