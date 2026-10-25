#!/usr/bin/env node
/**
 * Cross-platform installer for the project-supervisor kit.
 *
 * Works on Windows / macOS / Linux with plain Node.js (>= 18) — no bash needed.
 * Same behavior as install-supervisor.sh:
 *   node install-supervisor.mjs <workspace>                # AGENTS + skills + manual + patches
 *   node install-supervisor.mjs <workspace> --with-research
 *   node install-supervisor.mjs <workspace> --global-skill  # also install global skills
 *   node install-supervisor.mjs <workspace> --force         # overwrite AGENTS.md / 主管手册.md
 *   options: --dsh-home <dir> (global skill target), --dry-run, --help
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IS_WINDOWS = process.platform === 'win32';
const PROJECT_SKILL_TEMPLATES = ['plan.md', 'task-brief.md', 'ledger.md', 'review-gate.md'];

function fail(message) {
  console.error('\n错误：' + message);
  process.exit(1);
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
    else if (arg === '--dsh-home') options.dshHome = argv[++index];
    else if (arg === '-h' || arg === '--help') {
      const text = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
      console.log(text.split('\n').slice(1, 16).map((line) => line.replace(/^ \* ?/, '')).join('\n'));
      process.exit(0);
    } else if (arg.startsWith('-')) fail('未知参数：' + arg);
    else options.target = arg;
  }
  options.target = path.resolve(options.target || '.');
  if (options.dshHome) options.dshHome = path.resolve(options.dshHome);
  return options;
}

function copyFile(source, target, force) {
  if (!fs.existsSync(source)) fail('安装包缺少文件：' + source);
  if (fs.existsSync(target) && !force) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

function copyDir(source, target) {
  if (!fs.existsSync(source)) fail('安装包缺少目录：' + source);
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function hasSupervisorRules(file) {
  try {
    return fs.readFileSync(file, 'utf8').includes('项目主管' + '作业规则') || fs.readFileSync(file, 'utf8').includes('项目主管');
  } catch {
    return false;
  }
}

function setSkillWorkspace(skillPath, workspace) {
  const text = fs.readFileSync(skillPath, 'utf8');
  const next = text.replace(/^(\s*workspace:\s*)".*"/m, (match, prefix) => prefix + '"' + workspace.replace(/\\/g, '/') + '"');
  fs.writeFileSync(skillPath, next, 'utf8');
}

function assertProjectSkillTemplates(kit) {
  const skillDir = path.join(kit, 'skill');
  if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
    fail('安装包缺少 skill/SKILL.md（先在源工作区运行 setup/sync-kit.sh 生成 kit 副本）');
  }
  const templateDir = path.join(skillDir, 'templates');
  if (!fs.existsSync(templateDir)) {
    fail('安装包缺少 skill/templates/（先在源工作区运行 setup/sync-kit.sh 生成 kit 副本）');
  }
  for (const name of PROJECT_SKILL_TEMPLATES) {
    const file = path.join(templateDir, name);
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
      fail('安装包缺少或为空：skill/templates/' + name + '（先在源工作区运行 setup/sync-kit.sh 生成 kit 副本）');
    }
  }
}

function install(options) {
  const kit = HERE;
  const target = options.target;
  if (!fs.existsSync(target)) fail('目标目录不存在：' + target);
  if (!fs.statSync(target).isDirectory()) fail('目标不是目录：' + target);
  const plan = [];
  const step = (message) => {
    plan.push(message);
    if (!options.dryRun) console.log('    ' + message);
  };

  // 1) AGENTS.md
  const agentsSource = path.join(kit, 'AGENTS.supervisor.md');
  const agentsPath = path.join(target, 'AGENTS.md');
  if (fs.existsSync(agentsPath) && hasSupervisorRules(agentsPath)) {
    step('AGENTS.md 已含主管规则，跳过');
  } else if (fs.existsSync(agentsPath) && !options.force) {
    if (copyFile(agentsSource, path.join(target, 'AGENTS.supervisor.md'), true)) {
      step('已有 AGENTS.md：已生成 AGENTS.supervisor.md，请合并规则（或加 --force 覆盖）');
    }
  } else if (copyFile(agentsSource, agentsPath, true)) {
    step('写入 AGENTS.md（主管常驻规则）');
  }

  // 2) project-supervisor skill (whole directory: SKILL.md + templates/)
  assertProjectSkillTemplates(kit);
  const skillDir = path.join(target, '.dsh', 'skills', 'project-supervisor');
  fs.mkdirSync(skillDir, { recursive: true });
  copyDir(path.join(kit, 'skill'), skillDir);
  setSkillWorkspace(path.join(skillDir, 'SKILL.md'), target);
  step('写入 .dsh/skills/project-supervisor/（SKILL.md + templates/ 4 个模板；workspace 元数据已指向目标目录）');

  // 2.5) improving-prompts skill (full directory: SKILL.md + LICENSE + references + templates)
  const polishDir = path.join(target, '.dsh', 'skills', 'improving-prompts');
  copyDir(path.join(kit, 'skill-improving-prompts'), polishDir);
  step('写入 .dsh/skills/improving-prompts/（SKILL.md + LICENSE + references/ + templates/）');

  // 3) manual
  const manual = path.join(target, '主管手册.md');
  if (!fs.existsSync(manual) || options.force) {
    fs.copyFileSync(path.join(kit, '主管手册.md'), manual);
    step('写入 主管手册.md');
  } else {
    step('主管手册.md 已存在，跳过（--force 覆盖）');
  }

  // 4) optional research + DECISIONS template
  if (options.research) {
    const researchDir = path.join(target, 'research');
    fs.mkdirSync(researchDir, { recursive: true });
    for (const name of fs.readdirSync(path.join(kit, 'research'))) {
      if (!name.endsWith('.md')) continue;
      fs.copyFileSync(path.join(kit, 'research', name), path.join(researchDir, name));
    }
    const decisions = path.join(researchDir, 'DECISIONS.md');
    if (!fs.existsSync(decisions)) {
      fs.copyFileSync(path.join(kit, 'DECISIONS.template.md'), decisions);
    }
    step('写入 research/（调研资料 + DECISIONS 模板）');
  }

  // 4.5) optional permission patch tools
  const patches = path.join(kit, 'patches');
  if (fs.existsSync(patches)) {
    copyDir(patches, path.join(target, 'patches'));
    step('写入 patches/team-permissions（可选：给对话框设权限范围，见该目录 README）');
  }

  // 5) optional global skills
  if (options.globalSkill) {
    assertProjectSkillTemplates(kit);
    const projectSkill = path.join(options.dshHome, 'skills', 'project-supervisor');
    fs.mkdirSync(projectSkill, { recursive: true });
    copyDir(path.join(kit, 'skill'), projectSkill);
    setSkillWorkspace(path.join(projectSkill, 'SKILL.md'), '*');
    copyDir(path.join(kit, 'skill-improving-prompts'), path.join(options.dshHome, 'skills', 'improving-prompts'));
    step('已安装全局技能: ' + projectSkill + '/（SKILL.md + templates/ 4 个模板，任意工作区可用）');
    step('已安装全局技能: ' + path.join(options.dshHome, 'skills', 'improving-prompts') + '/');
  }

  console.log('');
  if (options.dryRun) {
    console.log('[dry-run] 目标：' + target);
    for (const line of plan) console.log('  - ' + line);
    return;
  }
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
  fail((error && error.stack) || String(error));
}
