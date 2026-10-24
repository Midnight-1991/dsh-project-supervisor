/*
 * dsh-project-supervisor — browser half (hand-written client bundle).
 *
 * Registered by the host through package.json `dsh.client` + the `./client`
 * export. The bundle only registers a factory with the DSH module loader;
 * side effects (style tag, slot registration) happen when the factory is
 * materialized by the client plugin host.
 *
 * The panel is deliberately read-only: it probes workspace files through the
 * `workspaceFiles` remote and never writes files, config or session state.
 */
(() => {
  'use strict';

  const loader = typeof window === 'undefined' ? undefined : window.__ModuleLoader__;
  if (!loader || typeof loader.load !== 'function') return;

  const PACKAGE_ID = 'dsh-project-supervisor';
  const NS = 'projectSupervisor';
  const PANEL_ID = 'supervisor';
  const VERSION = '0.5.0';
  const STYLE_ID = 'dsh-project-supervisor/style';

  loader.load({
    id: PACKAGE_ID,
    factory(require) {
      const React = require('react');
      const h = React.createElement;
      const { useCallback, useEffect, useMemo, useRef, useState } = React;

      /* ================================================================ *
       * Copy (zh / en)
       * ================================================================ */

      const COPY_ZH = {
        nav: '主管',
        title: '项目主管',
        subtitle: '中枢决策 · 并行派发 · 验收闭环',
        versionTag: '实验插件 v0.5.0',
        modeCardTitle: '主管工作模式',
        modeHint: '决定主管亲自做还是派给对话框。切换立刻保存，只影响之后的任务，进行中的任务不中断。',
        modeEfficiency: '效率优先',
        modeEfficiencyDesc: '紧耦合跨文件改动、浏览器/测试迭代、10 分钟内小修补由主管亲自做；独立新文件、调研、评审、文档包、可独立验收的模块派给对话框。',
        modeStrict: '严格派发',
        modeStrictDesc: '所有文件写入都交给对话框，包括单文件小修；主管只拆解、登记任务、写命令、评审、验收、集成。更慢、token 更多，但主管不亲自写文件。',
        modeAria: '主管工作模式选择',
        modeSaved: '已切换工作模式（已写入 .dsh/supervisor.config.json）',
        modeLocalSaved: '已切换工作模式（已存浏览器；重启 DSH 后请再选一次）',
        projectTitle: '选择项目',
        projectHint: '自检读取「最近会话所属工作区」的根目录；切换项目可查看其他工作区。',
        refresh: '刷新自检',
        refreshing: '检查中…',
        noProject: '还没有会话记录：先在 DSH 里打开一个工作区并新建会话，再回到本面板。',
        healthTitle: '工程底线自检',
        healthReady: '项就绪',
        healthLoading: '正在读取工作区文件…',
        healthUnavailable: '当前环境未提供 workspace files 服务，无法自检；下方规则与动作为静态内容。',
        healthError: '自检失败：',
        healthHint: '只看文件是否存在，不读取内容；缺失项给出新手可执行的建议。',
        okLabel: '已就绪',
        missingLabel: '待补齐',
        suggestion: '建议：',
        check_git: 'git 仓库（.git）',
        check_git_hint: '新项目先 git init，并配好 user.name/user.email 后首次提交；没有版本历史，改错就回不去。',
        check_readme: 'README.md（目标 / 启动 / 依赖）',
        check_readme_hint: '写清「这是什么、怎么跑起来、依赖什么版本」，换会话或换人也能接上。',
        check_gitignore: '.gitignore（排除不该提交的文件）',
        check_gitignore_hint: '至少排除 node_modules/、.env、dist/、*.log、.DS_Store。',
        check_agents: 'AGENTS.md（主管常驻规则）',
        check_agents_hint: '把 AGENTS.md 放进工作区根目录，主管规则就会在新会话自动生效。',
        check_decisions: '决策记录（DECISIONS.md）',
        check_decisions_hint: '根目录或 research/DECISIONS.md 均可；关键取舍写下来，避免下个会话重复讨论。',
        check_research: 'research/ 目录（调研与决策留痕）',
        check_research_hint: '调研结论、验收报告放这里；主管收尾时会把关键决策写入 DECISIONS.md。',
        check_setup: 'setup/ 目录（安装包与工程化脚本）',
        check_setup_hint: '从主管套件安装的工作区会有 setup/：一键安装、同步、自测、事实复核脚本。',
        check_skill: '.dsh/skills（主管技能）',
        check_skill_hint: '项目级技能目录；没有也可用全局技能 ~/.dsh/skills/project-supervisor/。',
        check_env: '.env.example（密钥占位规范）',
        check_env_hint: '密钥不进代码/git/聊天：提交 .env.example 占位，用户自己填 .env。',
        flowTitle: '主管怎么工作',
        flow1T: '① 你给目标',
        flow1D: '一句话说清想做什么，不需要描述技术方案。',
        flow2T: '② 主管拆解',
        flow2D: '定完成定义、拆工作项、开多个对话框并行，写范围互不重叠。',
        flow3T: '③ 验收产物',
        flow3D: '亲自跑测试、看 diff、抽查内容，不采信口头「已完成」。',
        flow4T: '④ 收尾留痕',
        flow4D: '关键决策写 DECISIONS.md，清理临时文件，报告验证结果。',
        beginnerTitle: '零基础保护',
        beginnerHint: '开关会写入工作区的 .dsh/supervisor.config.json；主管开工前先读它决定是否开启保护。',
        guardOn: '开',
        guardOff: '关',
        guardAria: '零基础保护开关',
        guardOnToast: '零基础保护已开启（已写入 .dsh/supervisor.config.json）',
        guardOffToast: '零基础保护已关闭（已写入 .dsh/supervisor.config.json）',
        guardOnLocalToast: '零基础保护已开启（已存浏览器；重启 DSH 后请再点一次开关）',
        guardOffLocalToast: '零基础保护已关闭（已存浏览器；重启 DSH 后请再点一次开关）',
        guardOffNote: '已关闭：主管不再主动做零基础引导；密钥、不可逆动作确认等安全底线仍保留。',
        polishTitle: '提示词润色',
        polishHint: '开关写入 .dsh/supervisor.config.json；开启时主管先把每条指令工程化再执行。',
        polish1: '读需求：判断这是对话请求、常驻规则、编码任务还是文档处理。',
        polish2: '找缺口：目标、输入、约束、验收、交付里缺什么，只补会挡路的。',
        polish3: '补全为专业提示词：不改你的意图，缺的事实留占位符，不编造。',
        polish4: '一行「润色要点」说明改了什么，然后立即执行。',
        polishOffNote: '已关闭：主管直接按你的原话执行；仍会写明关键假设。说「这次别润色」也可单次跳过。',
        polishOnToast: '提示词润色已开启（已写入 .dsh/supervisor.config.json）',
        polishOffToast: '提示词润色已关闭（已写入 .dsh/supervisor.config.json）',
        polishOnLocalToast: '提示词润色已开启（已存浏览器；重启 DSH 后请再点一次开关）',
        polishOffLocalToast: '提示词润色已关闭（已存浏览器；重启 DSH 后请再点一次开关）',
        polishAria: '提示词润色开关',
        interviewTitle: '新项目需求追问',
        interviewHint: '开关写入 .dsh/supervisor.config.json；只在「你提出新项目」的那轮对话里追问需求，够用就停，默认开启。',
        interview1: '只在开局：你提出一个新项目的那轮，主管先问清需求；继续旧项目或日常改动不追问。',
        interview2: '问关键缺口：谁用、解决什么问题、核心 1–2 个场景、形态与平台、数据从哪来、怎么算做完。',
        interview3: '一次问 3–5 个并附默认答案，你可只回「用默认」；问到能定 MVP 与验收标准就停。',
        interview4: '你说「够了 / 直接做 / 开始吧」立即停；答案写进 README / DECISIONS 后再开工。',
        interviewOffNote: '已关闭：新项目不再自动追问；需要时可以说「先问清需求」。',
        interviewOnToast: '新项目需求追问已开启（已写入 .dsh/supervisor.config.json）',
        interviewOffToast: '新项目需求追问已关闭（已写入 .dsh/supervisor.config.json）',
        interviewOnLocalToast: '新项目需求追问已开启（已存浏览器；重启 DSH 后请再点一次开关）',
        interviewOffLocalToast: '新项目需求追问已关闭（已存浏览器；重启 DSH 后请再点一次开关）',
        interviewAria: '新项目需求追问开关',
        beginner1: '先建安全网：git init + README + .gitignore + 首次提交，之后每跑通一步提交一次。',
        beginner2: '先读回再动手：新会话先读 README / DECISIONS / git log，复述目标与上一步再开工。',
        beginner3: '先定最小可运行目标（MVP），完成定义写成可执行检查。',
        beginner4: '架构由主管给 2–3 个选项并定 1 个默认「最简单能跑」，取舍写进 DECISIONS。',
        beginner5: '密钥不进代码 / git / 聊天：提交 .env.example，你自己在 .env 里填。',
        beginner6: '文档即记忆：目标、启动命令、依赖版本写进 README，决策写进 DECISIONS。',
        actionsTitle: '快捷动作',
        actionsHint: '每个动作右侧「说明」可展开，看它做什么、什么时候用。',
        copyKickoff: '复制开工口令',
        copyKickoffDone: '已复制开工口令',
        copyInstall: '复制「安装到其他工作区」命令',
        copyInstallDone: '已复制安装命令',
        copyRules: '复制规则文件路径',
        copyRulesDone: '已复制规则路径',
        quickHelpShow: '说明',
        quickHelpHide: '收起',
        quickHelpAria: '展开说明：',
        quickKickoffWhy: '作用：把一段标准开工口令放进剪贴板，粘贴给主管即可。口令里已经写死「先定完成定义 → 拆工作项 → 并行派发 → 亲自验收」，避免主管闷头写代码。',
        quickInstallWhy: '作用：复制一条命令，把主管规则、技能、手册和调研资料安装到另一个工作区。对方解压分享包后运行即可；换电脑、给朋友用都靠它。',
        quickRulesWhy: '作用：复制规则文件路径（AGENTS.md 与项目级 SKILL.md）。在别的会话里引用规则、做评审，或自己打开看全文时用。',
        copyFailed: '复制失败，请手动选择文本复制',
        teamHint: '并行对话框在会话页头「智能体团队」里查看：成员、任务板与消息都在那里。',
        footerRules: '规则载体：AGENTS.md（常驻）+ .dsh/skills/project-supervisor/SKILL.md（详细流程）。',
        footerReadonly: '本面板基本只读；写操作仅限三个开关与派发模式（零基础保护 / 提示词润色 / 新项目需求追问 / 效率优先或严格派发，写 .dsh/supervisor.config.json）。',
        collapseShow: '展开说明',
        collapseHide: '收起说明',
        kickoff:
          '你当项目主管，帮我做：<在这里写目标>。要求：先定完成定义与工作分解；能并行就开多个对话框，写范围互不重叠；完成后你亲自验收，并给我验证结果（命令 + 输出）。',
        installCmd: 'bash {cwd}/setup/install-supervisor.sh /path/to/workspace --with-research',
        rulesPath: '{cwd}/AGENTS.md',
        noCwd: '<工作区路径>',
      };

      const COPY_EN = {
        nav: 'Supervisor',
        title: 'Project Supervisor',
        subtitle: 'Central decisions · parallel dispatch · verified delivery',
        versionTag: 'experimental plugin v0.5.0',
        modeCardTitle: 'Supervisor mode',
        modeHint: 'Choose whether the supervisor writes itself or dispatches every write to a dialog. Saved immediately; applies to new tasks only.',
        modeEfficiency: 'Efficiency first',
        modeEfficiencyDesc: 'Tightly-coupled cross-file edits, test/browser iterations and small fixes (<10 min) stay with the supervisor; independent files, research, reviews, doc bundles and self-contained modules go to dialogs.',
        modeStrict: 'Strict dispatch',
        modeStrictDesc: 'Every file write goes to a dialog, even a one-file fix; the supervisor only plans, registers tasks, writes commands, reviews, verifies and integrates. Slower and more tokens, but the supervisor never writes files.',
        modeAria: 'Supervisor mode selector',
        modeSaved: 'Mode switched (written to .dsh/supervisor.config.json)',
        modeLocalSaved: 'Mode switched (saved in browser; re-select after a DSH restart)',
        projectTitle: 'Choose project',
        projectHint: 'Checks run against the workspace root of the most recent session; switch chips to inspect another workspace.',
        refresh: 'Re-check',
        refreshing: 'Checking…',
        noProject: 'No sessions yet: open a workspace in DSH and start a conversation, then come back.',
        healthTitle: 'Engineering baseline check',
        healthReady: 'ready',
        healthLoading: 'Reading workspace files…',
        healthUnavailable: 'The workspace-files service is unavailable; rules and actions below are static.',
        healthError: 'Check failed: ',
        healthHint: 'Existence only — file contents are never read. Missing items come with beginner-friendly advice.',
        okLabel: 'ready',
        missingLabel: 'missing',
        suggestion: 'Suggestion: ',
        check_git: 'Git repository (.git)',
        check_git_hint: 'Run git init, set user.name/user.email, commit once. Without history, mistakes are permanent.',
        check_readme: 'README.md (goal / run / deps)',
        check_readme_hint: 'Explain what this is, how to run it, and required versions — so the next session can continue.',
        check_gitignore: '.gitignore (keep junk out of git)',
        check_gitignore_hint: 'At least node_modules/, .env, dist/, *.log, .DS_Store.',
        check_agents: 'AGENTS.md (standing supervisor rules)',
        check_agents_hint: 'Put AGENTS.md at the workspace root; new sessions pick the rules up automatically.',
        check_decisions: 'Decision log (DECISIONS.md)',
        check_decisions_hint: 'Root DECISIONS.md or research/DECISIONS.md; record trade-offs to avoid re-deciding.',
        check_research: 'research/ (research & decision trail)',
        check_research_hint: 'Keep research conclusions and acceptance reports here; decisions go to DECISIONS.md.',
        check_setup: 'setup/ (kit & maintenance scripts)',
        check_setup_hint: 'Workspaces installed from the supervisor kit ship setup/ scripts: install, sync, selftest, verify-facts.',
        check_skill: '.dsh/skills (supervisor skill)',
        check_skill_hint: 'Project-level skill dir; otherwise the global ~/.dsh/skills/project-supervisor/ is used.',
        check_env: '.env.example (secret placeholder policy)',
        check_env_hint: 'Secrets never go into code/git/chat: commit .env.example placeholders, fill .env yourself.',
        flowTitle: 'How the supervisor works',
        flow1T: '1. You give the goal',
        flow1D: 'One sentence is enough; no technical plan required.',
        flow2T: '2. Supervisor decomposes',
        flow2D: 'Defines done, splits work, opens parallel conversations with disjoint write scopes.',
        flow3T: '3. Verify deliverables',
        flow3D: 'Runs tests, reads diffs, samples output — never trusts a verbal "done".',
        flow4T: '4. Close the loop',
        flow4D: 'Records decisions in DECISIONS.md, cleans temp files, reports evidence.',
        beginnerTitle: 'Beginner safeguards',
        beginnerHint: 'The switch writes <workspace>/.dsh/supervisor.config.json; the supervisor reads it at kickoff.',
        guardOn: 'On',
        guardOff: 'Off',
        guardAria: 'Beginner safeguards switch',
        guardOnToast: 'Beginner safeguards on (written to .dsh/supervisor.config.json)',
        guardOffToast: 'Beginner safeguards off (written to .dsh/supervisor.config.json)',
        guardOnLocalToast: 'Beginner safeguards on (saved in browser; reopen the switch after a DSH restart)',
        guardOffLocalToast: 'Beginner safeguards off (saved in browser; reopen the switch after a DSH restart)',
        guardOffNote: 'Off: the supervisor no longer volunteers beginner guidance; secret and irreversible-action safety still applies.',
        polishTitle: 'Prompt polish',
        polishHint: 'The switch writes .dsh/supervisor.config.json; when on, the supervisor engineers every instruction before executing.',
        polish1: 'Read the ask: decide whether this is a chat request, standing rules, a coding task or a document job.',
        polish2: 'Find gaps: goal, inputs, constraints, acceptance, deliverable; fix only the ones that block the work.',
        polish3: 'Write the engineered prompt: keep the intent, leave unknown facts as placeholders, never invent them.',
        polish4: 'Report one line of polish notes, then execute immediately.',
        polishOffNote: 'Off: the supervisor executes your words directly and still states key assumptions. Say "skip polishing" to skip once.',
        polishOnToast: 'Prompt polish on (written to .dsh/supervisor.config.json)',
        polishOffToast: 'Prompt polish off (written to .dsh/supervisor.config.json)',
        polishOnLocalToast: 'Prompt polish on (saved in browser; reopen the switch after a DSH restart)',
        polishOffLocalToast: 'Prompt polish off (saved in browser; reopen the switch after a DSH restart)',
        polishAria: 'Prompt polish switch',
        interviewTitle: 'New-project requirement interview',
        interviewHint: 'The switch writes .dsh/supervisor.config.json; in the turn where you propose a new project the supervisor interviews you first, stopping once it has enough. On by default.',
        interview1: 'Only at kickoff: in the turn you propose a new project the supervisor asks before building; continuing an existing project does not trigger it.',
        interview2: 'Probe the gaps: who uses it, what problem, 1-2 core scenarios, form & platform, data source, definition of done.',
        interview3: 'Ask 3-5 questions at a time with default answers; reply "use defaults" if you like; stop once MVP and acceptance criteria are clear.',
        interview4: 'Stop immediately on "enough / just build / start"; write the answers into README / DECISIONS before building.',
        interviewOffNote: 'Off: new projects no longer trigger the interview automatically; say "interview me first" when needed.',
        interviewOnToast: 'New-project interview on (written to .dsh/supervisor.config.json)',
        interviewOffToast: 'New-project interview off (written to .dsh/supervisor.config.json)',
        interviewOnLocalToast: 'New-project interview on (saved in browser; reopen the switch after a DSH restart)',
        interviewOffLocalToast: 'New-project interview off (saved in browser; reopen the switch after a DSH restart)',
        interviewAria: 'New-project requirement interview switch',
        beginner1: 'Build the safety net first: git init + README + .gitignore + first commit, then commit each working step.',
        beginner2: 'Read back before acting: new sessions read README / DECISIONS / git log, restate the goal, then work.',
        beginner3: 'Define the minimum viable goal (MVP) with an executable acceptance check.',
        beginner4: 'Architecture: the supervisor offers 2–3 options and picks the simplest by default; records the trade-off.',
        beginner5: 'Secrets stay out of code/git/chat: commit .env.example, fill .env yourself.',
        beginner6: 'Docs are memory: goal, run command and versions in README; decisions in DECISIONS.',
        actionsTitle: 'Quick actions',
        actionsHint: 'Expand "Why" on any action to see what it does and when to use it.',
        copyKickoff: 'Copy kickoff prompt',
        copyKickoffDone: 'Kickoff prompt copied',
        copyInstall: 'Copy "install to another workspace" command',
        copyInstallDone: 'Install command copied',
        copyRules: 'Copy rules file path',
        copyRulesDone: 'Rules path copied',
        quickHelpShow: 'Why',
        quickHelpHide: 'Hide',
        quickHelpAria: 'Expand explanation: ',
        quickKickoffWhy: 'What it does: puts a standard kickoff prompt on the clipboard. Paste it to the supervisor and it will define done, decompose the work, dispatch in parallel and verify the result instead of coding blindly.',
        quickInstallWhy: 'What it does: copies a command that installs the rules, skill, manual and research into another workspace. Run it from the unpacked kit to set up a new machine or share with a teammate.',
        quickRulesWhy: 'What it does: copies the rule file paths (AGENTS.md and the project-level SKILL.md). Handy when quoting the rules in another session or opening the full text yourself.',
        copyFailed: 'Copy failed; select the text manually',
        teamHint: 'Parallel conversations: open "Agent Team" in a conversation header to see members, the task board and messages.',
        footerRules: 'Rules live in AGENTS.md (standing) + .dsh/skills/project-supervisor/SKILL.md (detailed flow).',
        footerReadonly: 'Read-only except the three switches and the dispatch mode (beginner safeguards, prompt polish, new-project interview, efficiency/strict); they write .dsh/supervisor.config.json.',
        collapseShow: 'Expand details',
        collapseHide: 'Collapse details',
        kickoff:
          'Act as the project supervisor and build: <describe the goal here>. Define "done" and decompose the work first; open parallel conversations when independent, with disjoint write scopes; verify the result yourself and report evidence (commands + output).',
        installCmd: 'bash {cwd}/setup/install-supervisor.sh /path/to/workspace --with-research',
        rulesPath: '{cwd}/AGENTS.md',
        noCwd: '<workspace path>',
      };

      const COPY = { zh: COPY_ZH, en: COPY_EN };

      /* ================================================================ *
       * Workspace baseline definitions
       * ================================================================ */

      const CHECK_DEFS = [
        { key: 'git', paths: ['.git'], hint: 'check_git_hint' },
        { key: 'readme', paths: ['README.md', 'readme.md', 'README'], hint: 'check_readme_hint' },
        { key: 'gitignore', paths: ['.gitignore'], hint: 'check_gitignore_hint' },
        { key: 'decisions', paths: ['DECISIONS.md', 'research/DECISIONS.md'], hint: 'check_decisions_hint' },
        { key: 'agents', paths: ['AGENTS.md'], hint: 'check_agents_hint' },
        { key: 'env', paths: ['.env.example'], hint: 'check_env_hint' },
        { key: 'research', paths: ['research'], hint: 'check_research_hint' },
        { key: 'setup', paths: ['setup'], hint: 'check_setup_hint' },
        { key: 'skill', paths: ['.dsh/skills', '.dsh/skills/project-supervisor'], hint: 'check_skill_hint' },
      ];

      /* ================================================================ *
       * Styles
       * ================================================================ */

      const CSS = `
.psup-page {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding: calc(var(--dsh-frame-top-clearance, 48px) + 24px) 32px 56px;
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-bg-base, transparent);
}
.psup-inner { max-width: 960px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
.psup-head { display: flex; align-items: flex-start; gap: 14px; }
.psup-logo {
  width: 44px; height: 44px; border-radius: 13px; flex: none;
  display: flex; align-items: center; justify-content: center;
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-bg-layer-2, #f5f6f7);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.08));
}
.psup-heading { min-width: 0; flex: 1; }
.psup-title { margin: 0; font-size: 22px; line-height: 1.3; font-weight: 600; letter-spacing: .2px; }
.psup-subtitle { margin: 4px 0 0; font-size: 13px; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-version {
  align-self: center; flex: none; font-size: 11px; line-height: 1;
  padding: 5px 9px; border-radius: 999px;
  color: var(--dsw-alias-label-secondary, #646a73);
  background: var(--dsw-alias-bg-layer-2, #f5f6f7);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.08));
}
.psup-card {
  background: var(--dsw-alias-bg-layer-2, #f7f8fa);
  border-radius: 14px;
  padding: 18px 20px;
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.06));
}
.psup-card-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.psup-card-title { margin: 0; font-size: 15px; font-weight: 600; flex: 1; }
.psup-mode-current {
  flex: none; font-size: 11px; line-height: 1; padding: 5px 9px; border-radius: 999px;
  color: var(--dsw-alias-label-secondary, #646a73);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.1));
}
.psup-mode-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
.psup-mode-option {
  appearance: none; display: flex; flex-direction: column; gap: 6px; text-align: left;
  padding: 12px 14px; border-radius: 10px; border: none; cursor: pointer; font: inherit; color: inherit;
  background: var(--dsw-alias-bg-base, #fff);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.08));
  transition: box-shadow .12s ease, background .12s ease;
}
.psup-mode-option:hover { box-shadow: 0 0 0 1px var(--dsw-alias-border-l1, rgba(0,0,0,.18)); }
.psup-mode-option.is-active {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--dsw-alias-label-primary, #1f2329);
}
.psup-mode-option:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: 2px; }
.psup-mode-name { font-size: 13px; font-weight: 600; }
.psup-mode-option.is-active .psup-mode-name::after { content: ' ✓'; }
.psup-mode-desc { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #646a73); }
@media (max-width: 720px) { .psup-mode-row { grid-template-columns: 1fr; } }
.psup-muted { margin: 2px 0 12px; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-empty { margin: 6px 0; font-size: 13px; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.psup-chip {
  appearance: none; cursor: pointer; font: inherit; font-size: 12px;
  padding: 6px 11px; border-radius: 999px; color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-bg-base, #fff);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.1));
  transition: box-shadow .12s ease, background .12s ease;
}
.psup-chip:hover { box-shadow: 0 0 0 1px var(--dsw-alias-border-l1, rgba(0,0,0,.18)); }
.psup-chip.is-active {
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-weight: 600;
  box-shadow: inset 0 0 0 1.5px currentColor;
}
.psup-path {
  margin-top: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; line-height: 1.5; word-break: break-all;
  color: var(--dsw-alias-label-secondary, #646a73);
}
.psup-btn {
  appearance: none; cursor: pointer; font: inherit; font-size: 12px; line-height: 1;
  padding: 8px 13px; border-radius: 9px; border: none;
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-bg-base, #fff);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.1));
  transition: box-shadow .12s ease, transform .12s ease;
}
.psup-btn:hover { box-shadow: 0 0 0 1px var(--dsw-alias-border-l1, rgba(0,0,0,.2)); }
.psup-btn:active { transform: translateY(1px); }
.psup-btn:disabled { opacity: .55; cursor: default; }
.psup-btn-primary {
  color: var(--dsw-alias-bg-base, #fff);
  background: var(--dsw-alias-label-primary, #1f2329);
  box-shadow: none;
  font-weight: 600;
}
.psup-btn-ghost { background: transparent; box-shadow: 0 0 0 1px transparent; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-btn-ghost:hover { box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.12)); }
.psup-switch {
  appearance: none; cursor: pointer; font: inherit; flex: none;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 0; border: none; background: transparent; color: inherit;
}
.psup-switch-track {
  position: relative; width: 38px; height: 21px; border-radius: 999px;
  background: var(--dsw-alias-border-l1, rgba(0,0,0,.25));
  transition: background .16s ease;
}
.psup-switch-knob {
  position: absolute; top: 2.5px; left: 2.5px; width: 16px; height: 16px; border-radius: 50%;
  background: var(--dsw-alias-bg-base, #fff);
  box-shadow: 0 1px 2px rgba(0,0,0,.28);
  transition: transform .16s ease;
}
.psup-switch.is-on .psup-switch-track { background: var(--dsw-alias-state-success-primary, #2da44e); }
.psup-switch.is-on .psup-switch-knob { transform: translateX(17px); }
.psup-switch-label { font-size: 12px; color: var(--dsw-alias-label-secondary, #646a73); min-width: 13px; }
.psup-switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: 3px; border-radius: 999px; }
.psup-guard-off {
  margin: 2px 0 4px; font-size: 12px; line-height: 1.6;
  color: var(--dsw-alias-label-secondary, #646a73);
}
.psup-collapse {
  appearance: none; cursor: pointer; flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; padding: 0; border: none; border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-secondary, #646a73);
  transition: background .12s ease, color .12s ease;
}
.psup-collapse:hover { color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-base, rgba(128,128,128,.10)); }
.psup-collapse:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: 2px; }
.psup-collapse .psup-chevron {
  display: inline-block; width: 7px; height: 7px;
  border-right: 1.6px solid currentColor; border-bottom: 1.6px solid currentColor;
  transform: rotate(45deg) translateY(-1px);
  transition: transform .16s ease;
}
.psup-collapse.is-collapsed .psup-chevron { transform: rotate(-45deg) translateY(1px); }
.psup-card-body { margin: 0; }
.psup-actions { display: flex; flex-direction: column; gap: 8px; }
.psup-action-item { border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.22)); border-radius: 10px; padding: 8px 10px; }
.psup-action-item.is-open { background: var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.08)); }
.psup-actions .psup-btn { flex: 0 0 auto; }
.psup-action-line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.psup-disclosure { margin-left: auto; appearance: none; cursor: pointer; font: inherit; display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border: none; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; }
.psup-disclosure:hover { color: var(--dsw-alias-label-primary, #f9fafb); background: var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.12)); }
.psup-disclosure:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: 2px; }
.psup-chevron { display: inline-block; font-size: 14px; line-height: 1; transition: transform 0.16s ease; }
.psup-action-item.is-open .psup-chevron { transform: rotate(90deg); }
.psup-help { margin: 8px 0 2px; padding-top: 8px; border-top: 1px dashed var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.25)); font-size: 12.5px; line-height: 1.65; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-score { display: flex; align-items: baseline; gap: 10px; margin: 2px 0 14px; }
.psup-score-num { font-size: 26px; font-weight: 650; letter-spacing: .3px; }
.psup-score-label { font-size: 12px; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-bar { display: inline-block; flex: 1; height: 6px; border-radius: 999px; overflow: hidden; vertical-align: middle; background: var(--dsw-alias-border-l2, rgba(0,0,0,.08)); }
.psup-bar-fill { display: block; height: 100%; border-radius: 999px; background: var(--dsw-alias-state-success-primary, #2da44e); transition: width .25s ease; }
.psup-checks { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 2px 22px; }
.psup-check { display: flex; gap: 9px; padding: 8px 0; align-items: flex-start; }
.psup-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: none; background: var(--dsw-alias-border-l1, rgba(0,0,0,.25)); }
.psup-check.is-ok .psup-dot { background: var(--dsw-alias-state-success-primary, #2da44e); }
.psup-check.is-missing .psup-dot { background: var(--dsw-alias-state-warning-primary, #d97706); }
.psup-check-body { min-width: 0; }
.psup-check-label { font-size: 12.5px; line-height: 1.5; }
.psup-check-hint { font-size: 11.5px; line-height: 1.55; margin-top: 2px; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.psup-step { padding: 12px 14px; border-radius: 11px; background: var(--dsw-alias-bg-base, #fff); box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.06)); }
.psup-step-t { margin: 0 0 5px; font-size: 12.5px; font-weight: 600; }
.psup-step-d { margin: 0; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 9px; }
.psup-list li { display: flex; gap: 9px; font-size: 12.5px; line-height: 1.62; }
.psup-list-num {
  flex: none; width: 18px; height: 18px; border-radius: 50%; margin-top: 2px;
  display: flex; align-items: center; justify-content: center;
  font-size: 10.5px; font-weight: 600;
  color: var(--dsw-alias-label-secondary, #646a73);
  background: var(--dsw-alias-bg-layer-3, rgba(0,0,0,.05));
}
.psup-footer { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; font-size: 11.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-toast {
  position: sticky; bottom: 12px; align-self: center; margin-top: 4px;
  font-size: 12px; padding: 8px 14px; border-radius: 999px;
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-bg-layer-3, #fff);
  box-shadow: 0 4px 18px rgba(0,0,0,.16), 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.08));
}
.psup-warn {
  font-size: 12px; line-height: 1.6; padding: 10px 12px; border-radius: 10px;
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-state-warning-bg, rgba(217,119,6,.1));
  box-shadow: 0 0 0 1px var(--dsw-alias-state-warning-primary, rgba(217,119,6,.35));
}
`;

      function installStyles() {
        if (typeof document === 'undefined' || !document.head) return undefined;
        if (document.querySelector('style[data-plugin-style="' + STYLE_ID + '"]')) return undefined;
        const style = document.createElement('style');
        style.dataset.pluginStyle = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
        return style;
      }

      function removeStyles() {
        if (typeof document === 'undefined') return;
        const style = document.querySelector('style[data-plugin-style="' + STYLE_ID + '"]');
        if (style && style.parentNode) style.parentNode.removeChild(style);
      }

      /* ================================================================ *
       * Small helpers
       * ================================================================ */

      function baseName(path) {
        const raw = String(path == null ? '' : path);
        const value = raw.replace(/[\\/]+$/, '');
        if (!value) return raw || '/';
        const parts = value.split(/[\\/]/);
        return parts[parts.length - 1] || value;
      }

      function fillCopy(entry, cwd) {
        return String(entry || '').replace(/\{cwd\}/g, cwd || '<cwd>');
      }

      function fallbackT(key) {
        return COPY_ZH[key] == null ? String(key) : COPY_ZH[key];
      }

      function useTr(props) {
        const t = props && typeof props.t === 'function' ? props.t : fallbackT;
        return useCallback((key) => {
          const value = t(key);
          return value == null || value === key ? fallbackT(key) : value;
        }, [t]);
      }

      function buildProjects(ids, byId) {
        const map = new Map();
        if (!Array.isArray(ids) || !byId) return [];
        for (const id of ids) {
          const row = byId[id];
          if (!row || !row.cwd) continue;
          if (row.origin === 'subagent') continue;
          const updatedAt = Number(row.updatedAt) || 0;
          const existing = map.get(row.cwd);
          if (!existing || updatedAt > existing.updatedAt) {
            map.set(row.cwd, {
              cwd: row.cwd,
              sessionId: id,
              title: row.displayTitle || row.title || baseName(row.cwd),
              updatedAt,
              sessions: existing ? existing.sessions + 1 : 1,
            });
          } else {
            existing.sessions += 1;
          }
        }
        return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      }

      async function probeOne(probe, sessionId, def, signal) {
        for (const candidate of def.paths) {
          let result;
          try {
            result = await probe(sessionId, candidate, signal);
          } catch (err) {
            result = { ok: false, error: { code: 'probe-error', message: String(err) } };
          }
          if (result && result.ok) return { key: def.key, ok: true, path: candidate };
          const code = result && result.error ? result.error.code : undefined;
          if (code === 'workspace-file/not-found') continue;
          if (code) return { key: def.key, ok: true, path: candidate };
        }
        return { key: def.key, ok: false, path: '' };
      }

      function useChecks(probe, sessionId, reloadToken) {
        const [state, setState] = useState({ status: 'idle', checks: [], error: '' });

        useEffect(() => {
          if (!sessionId) {
            setState({ status: 'idle', checks: [], error: '' });
            return undefined;
          }
          if (typeof probe !== 'function') {
            setState({ status: 'unavailable', checks: [], error: '' });
            return undefined;
          }
          let alive = true;
          const controller = new AbortController();
          setState((prev) => ({ status: 'loading', checks: prev.checks, error: '' }));
          Promise.all(CHECK_DEFS.map((def) => probeOne(probe, sessionId, def, controller.signal)))
            .then((checks) => {
              if (!alive) return;
              setState({ status: 'ready', checks, error: '' });
            })
            .catch((err) => {
              if (!alive) return;
              setState({ status: 'error', checks: [], error: String((err && err.message) || err) });
            });
          return () => {
            alive = false;
            controller.abort();
          };
        }, [probe, sessionId, reloadToken]);

        return state;
      }

      async function copyText(text) {
        const value = String(text == null ? '' : text);
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(value);
          return;
        }
        if (typeof document === 'undefined' || !document.body) throw new Error('clipboard-unavailable');
        const area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', 'readonly');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        let ok = false;
        try {
          ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
        } finally {
          if (area.parentNode) area.parentNode.removeChild(area);
        }
        if (!ok) throw new Error('clipboard-unavailable');
      }

      /* ================================================================ *
       * Components
       * ================================================================ */

      function SupervisorIcon(props) {
        const size = props && props.size ? props.size : 20;
        return h(
          'svg',
          {
            width: size,
            height: size,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.7,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': 'true',
          },
          h('circle', { cx: 12, cy: 12, r: 8.6 }),
          h('path', { d: 'M15.1 8.9 13.5 13.5 8.9 15.1 10.5 10.5Z' }),
          h('circle', { cx: 12, cy: 12, r: 1.1, fill: 'currentColor', stroke: 'none' }),
        );
      }

      function CheckRow(props) {
        const { def, check, t } = props;
        const ok = !!(check && check.ok);
        return h(
          'div',
          { className: 'psup-check ' + (ok ? 'is-ok' : 'is-missing') },
          h('span', { className: 'psup-dot' }),
          h(
            'div',
            { className: 'psup-check-body' },
            h('div', { className: 'psup-check-label' }, t('check_' + def.key)),
            ok ? null : h('div', { className: 'psup-check-hint' }, t('suggestion') + t(def.hint)),
          ),
        );
      }

      function SupervisorPage(props) {
        const t = useTr(props);
        const useSessions = props ? props.useSessions : undefined;
        const probe = props ? props.probe : undefined;

        const ids = useSessions ? useSessions((state) => state.ids) : undefined;
        const byId = useSessions ? useSessions((state) => state.byId) : undefined;
        const projects = useMemo(() => buildProjects(ids, byId), [ids, byId]);

        const [pickedCwd, setPickedCwd] = useState('');
        const [autoCwd, setAutoCwd] = useState('');
        const [reloadToken, setReloadToken] = useState(0);
        const [toast, setToast] = useState('');
        const [openHelp, setOpenHelp] = useState(null);
        const [modes, setModes] = useState({ beginnerGuard: true, promptPolish: true, requirementInterview: true, dispatchMode: 'efficiency', host: true, loaded: false });

        // 三块卡片说明区的折叠偏好：默认展开；用户点的选择存 localStorage，下次打开页面沿用。
        const COLLAPSE_FIELDS = ['beginnerGuard', 'promptPolish', 'requirementInterview'];
        const readCollapsed = (field) => {
          try {
            return window.localStorage.getItem('psup.collapsed.' + field) === '1';
          } catch (error) {
            return false;
          }
        };
        const [collapsed, setCollapsed] = useState(() => {
          const result = {};
          for (const field of COLLAPSE_FIELDS) result[field] = readCollapsed(field);
          return result;
        });
        const toggleCollapsed = (field) => {
          setCollapsed((prev) => {
            const next = { ...prev, [field]: !prev[field] };
            try {
              const key = 'psup.collapsed.' + field;
              if (next[field]) window.localStorage.setItem(key, '1');
              else window.localStorage.removeItem(key);
            } catch (error) {
              // 隐私模式等存储不可用时只影响记忆，不影响本次折叠
            }
            return next;
          });
        };
        const collapseButton = (field, title) =>
          h(
            'button',
            {
              type: 'button',
              className: 'psup-collapse' + (collapsed[field] ? ' is-collapsed' : ''),
              'aria-expanded': collapsed[field] ? 'false' : 'true',
              'aria-label': (collapsed[field] ? t('collapseShow') : t('collapseHide')) + '：' + title,
              title: collapsed[field] ? t('collapseShow') : t('collapseHide'),
              onClick: () => toggleCollapsed(field),
            },
            h('span', { className: 'psup-chevron', 'aria-hidden': 'true' }),
          );
        const toastTimer = useRef(null);

        // Prefer the first project that actually has supervisor rules (AGENTS.md),
        // so a fresh page does not default to an unrelated workspace.
        useEffect(() => {
          if (projects.length === 0) {
            setAutoCwd('');
            return undefined;
          }
          if (typeof probe !== 'function') {
            setAutoCwd(projects[0].cwd);
            return undefined;
          }
          let alive = true;
          const controller = new AbortController();
          (async () => {
            for (const item of projects) {
              let result;
              try {
                result = await probe(item.sessionId, 'AGENTS.md', controller.signal);
              } catch (err) {
                result = undefined;
              }
              if (!alive) return;
              if (result && result.ok) {
                setAutoCwd(item.cwd);
                return;
              }
            }
            if (alive) setAutoCwd(projects[0].cwd);
          })();
          return () => {
            alive = false;
            controller.abort();
          };
        }, [projects, probe]);

        useEffect(() => {
          if (toastTimer.current) {
            clearTimeout(toastTimer.current);
            toastTimer.current = null;
          }
          if (!toast) return undefined;
          toastTimer.current = setTimeout(() => {
            setToast('');
            toastTimer.current = null;
          }, 1800);
          return () => {
            if (toastTimer.current) {
              clearTimeout(toastTimer.current);
              toastTimer.current = null;
            }
          };
        }, [toast]);

        const project = useMemo(() => {
          if (projects.length === 0) return undefined;
          const wanted = pickedCwd || autoCwd;
          return projects.find((item) => item.cwd === wanted) || projects[0];
        }, [projects, pickedCwd, autoCwd]);

        const checks = useChecks(probe, project ? project.sessionId : '', reloadToken);
        const okCount = checks.checks.filter((item) => item.ok).length;
        const total = CHECK_DEFS.length;
        const loading = checks.status === 'loading';
        const showToast = (key) => setToast(t(key));
        const copy = async (text, doneKey, failKey) => {
          try {
            await copyText(text);
            showToast(doneKey);
          } catch (err) {
            showToast(failKey);
          }
        };
        const cwd = project ? project.cwd : '';

        // Panel switches: read the persisted config (host endpoint) for both
        // toggles, then let the user flip them. Before the host half is
        // (re)loaded, fall back to localStorage so the UI still remembers the
        // choice per project.
        useEffect(() => {
          if (!cwd) return undefined;
          let alive = true;
          (async () => {
            let server = null;
            try {
              const response = await fetch(
                '/plugins/dsh-project-supervisor/config?cwd=' + encodeURIComponent(cwd),
                { credentials: 'include' },
              );
              const contentType = response.headers.get('content-type') || '';
              if (response.ok && contentType.includes('application/json')) {
                const data = await response.json();
                if (data && data.ok) server = data;
              }
            } catch (error) {
              server = null;
            }
            if (!alive) return;
            const readLocal = (field) => {
              try {
                return window.localStorage.getItem('psup.' + field + ':' + cwd);
              } catch (error) {
                return null;
              }
            };
            if (server) {
              setModes({
                beginnerGuard: server.beginnerGuard !== false,
                promptPolish: server.promptPolish !== false,
                requirementInterview: server.requirementInterview !== false,
                dispatchMode: server.dispatchMode === 'strict' ? 'strict' : 'efficiency',
                host: true,
                loaded: true,
              });
              return;
            }
            setModes({
              beginnerGuard: readLocal('beginnerGuard') !== 'false',
              promptPolish: readLocal('promptPolish') !== 'false',
              requirementInterview: readLocal('requirementInterview') !== 'false',
              dispatchMode: readLocal('dispatchMode') === 'strict' ? 'strict' : 'efficiency',
              host: false,
              loaded: true,
            });
          })();
          return () => {
            alive = false;
          };
        }, [cwd]);

        const toggleMode = async (field) => {
          if (!cwd) return;
          const next = !modes[field];
          setModes({ ...modes, [field]: next });
          let saved = false;
          try {
            const response = await fetch('/plugins/dsh-project-supervisor/config', {
              method: 'POST',
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ cwd, [field]: next }),
            });
            const contentType = response.headers.get('content-type') || '';
            if (response.ok && contentType.includes('application/json')) {
              const data = await response.json();
              saved = Boolean(data && data.ok);
            }
          } catch (error) {
            saved = false;
          }
          if (!saved) {
            try {
              window.localStorage.setItem('psup.' + field + ':' + cwd, String(next));
            } catch (error) {
              // ignore private-mode storage failures
            }
            setModes({ ...modes, [field]: next, host: false });
          }
          const prefix = field === 'beginnerGuard' ? 'guard' : field === 'promptPolish' ? 'polish' : 'interview';
          showToast(
            saved
              ? next
                ? prefix + 'OnToast'
                : prefix + 'OffToast'
              : next
                ? prefix + 'OnLocalToast'
                : prefix + 'OffLocalToast',
          );
        };

        const setDispatchMode = async (mode) => {
          if (!cwd || (mode !== 'efficiency' && mode !== 'strict')) return;
          if (modes.dispatchMode === mode) return;
          setModes({ ...modes, dispatchMode: mode });
          let saved = false;
          try {
            const response = await fetch('/plugins/dsh-project-supervisor/config', {
              method: 'POST',
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ cwd, dispatchMode: mode }),
            });
            const contentType = response.headers.get('content-type') || '';
            if (response.ok && contentType.includes('application/json')) {
              const data = await response.json();
              saved = Boolean(data && data.ok && data.dispatchMode === mode);
            }
          } catch (error) {
            saved = false;
          }
          if (!saved) {
            try {
              window.localStorage.setItem('psup.dispatchMode:' + cwd, mode);
            } catch (error) {
              // ignore storage failures
            }
            setModes({ ...modes, dispatchMode: mode, host: false });
          }
          showToast(saved ? 'modeSaved' : 'modeLocalSaved');
        };

        return h(
          'div',
          { className: 'psup-page' },
          h(
            'div',
            { className: 'psup-inner' },
            h(
              'header',
              { className: 'psup-head' },
              h('div', { className: 'psup-logo' }, h(SupervisorIcon, { size: 22 })),
              h(
                'div',
                { className: 'psup-heading' },
                h('h1', { className: 'psup-title' }, t('title')),
                h('p', { className: 'psup-subtitle' }, t('subtitle')),
              ),
              h('span', { className: 'psup-version' }, t('versionTag')),
            ),

            h(
              'section',
              { className: 'psup-card psup-mode-card' },
              h(
                'div',
                { className: 'psup-card-head' },
                h('h2', { className: 'psup-card-title' }, t('modeCardTitle')),
                h(
                  'span',
                  { className: 'psup-mode-current' },
                  t(modes.dispatchMode === 'strict' ? 'modeStrict' : 'modeEfficiency'),
                ),
              ),
              h('p', { className: 'psup-muted' }, t('modeHint')),
              h(
                'div',
                { className: 'psup-mode-row', role: 'radiogroup', 'aria-label': t('modeAria') },
                [
                  { value: 'efficiency', nameKey: 'modeEfficiency', descKey: 'modeEfficiencyDesc' },
                  { value: 'strict', nameKey: 'modeStrict', descKey: 'modeStrictDesc' },
                ].map((option) =>
                  h(
                    'button',
                    {
                      key: option.value,
                      type: 'button',
                      role: 'radio',
                      'aria-checked': modes.dispatchMode === option.value ? 'true' : 'false',
                      className: 'psup-mode-option' + (modes.dispatchMode === option.value ? ' is-active' : ''),
                      onClick: () => setDispatchMode(option.value),
                    },
                    h('span', { className: 'psup-mode-name' }, t(option.nameKey)),
                    h('span', { className: 'psup-mode-desc' }, t(option.descKey)),
                  ),
                ),
              ),
            ),

            h(
              'section',
              { className: 'psup-card' },
              h(
                'div',
                { className: 'psup-card-head' },
                h('h2', { className: 'psup-card-title' }, t('projectTitle')),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'psup-btn psup-btn-ghost',
                    disabled: loading,
                    onClick: () => setReloadToken((value) => value + 1),
                  },
                  loading ? t('refreshing') : t('refresh'),
                ),
              ),
              h('p', { className: 'psup-muted' }, t('projectHint')),
              projects.length === 0
                ? h('p', { className: 'psup-empty' }, t('noProject'))
                : h(
                    'div',
                    { className: 'psup-chips' },
                    projects.slice(0, 12).map((item) =>
                      h(
                        'button',
                        {
                          key: item.cwd,
                          type: 'button',
                          title: item.cwd,
                          className: 'psup-chip' + (project && item.cwd === project.cwd ? ' is-active' : ''),
                          onClick: () => setPickedCwd(item.cwd),
                        },
                        baseName(item.cwd),
                      ),
                    ),
                  ),
              project ? h('div', { className: 'psup-path' }, project.cwd) : null,
            ),

            h(
              'section',
              { className: 'psup-card' },
              h(
                'div',
                { className: 'psup-card-head' },
                h('h2', { className: 'psup-card-title' }, t('healthTitle')),
              ),
              h('p', { className: 'psup-muted' }, t('healthHint')),
              checks.status === 'unavailable'
                ? h('div', { className: 'psup-warn' }, t('healthUnavailable'))
                : [
                    h(
                      'div',
                      { className: 'psup-score', key: 'score' },
                      h('span', { className: 'psup-score-num' }, String(okCount) + ' / ' + String(total)),
                      h('span', { className: 'psup-score-label' }, t('healthReady')),
                      h('span', { className: 'psup-bar' }, h('span', {
                        className: 'psup-bar-fill',
                        style: { width: Math.round((okCount / total) * 100) + '%' },
                      })),
                    ),
                  ].concat(
                    checks.status === 'ready'
                      ? [
                          h(
                            'div',
                            { className: 'psup-checks', key: 'checks' },
                            CHECK_DEFS.map((def) =>
                              h(CheckRow, {
                                key: def.key,
                                def,
                                t,
                                check: checks.checks.find((item) => item.key === def.key),
                              }),
                            ),
                          ),
                        ]
                      : [
                          h(
                            'p',
                            { className: 'psup-empty', key: 'state' },
                            checks.status === 'error' ? t('healthError') + checks.error : loading ? t('healthLoading') : '',
                          ),
                        ],
                  ),
            ),

            h(
              'section',
              { className: 'psup-card' },
              h('div', { className: 'psup-card-head' }, h('h2', { className: 'psup-card-title' }, t('flowTitle'))),
              h(
                'div',
                { className: 'psup-grid' },
                [1, 2, 3, 4].map((index) =>
                  h(
                    'div',
                    { key: index, className: 'psup-step' },
                    h('p', { className: 'psup-step-t' }, t('flow' + index + 'T')),
                    h('p', { className: 'psup-step-d' }, t('flow' + index + 'D')),
                  ),
                ),
              ),
            ),

            h(
              'section',
              { className: 'psup-card' },
              h(
                'div',
                { className: 'psup-card-head' },
                collapseButton('beginnerGuard', t('beginnerTitle')),
                h('h2', { className: 'psup-card-title' }, t('beginnerTitle')),
                h(
                  'button',
                  {
                    type: 'button',
                    role: 'switch',
                    'aria-checked': modes.beginnerGuard ? 'true' : 'false',
                    'aria-label': t('guardAria'),
                    title: t('beginnerHint'),
                    className: 'psup-switch' + (modes.beginnerGuard ? ' is-on' : ''),
                    onClick: () => toggleMode('beginnerGuard'),
                  },
                  h('span', { className: 'psup-switch-track' }, h('span', { className: 'psup-switch-knob' })),
                  h('span', { className: 'psup-switch-label' }, modes.beginnerGuard ? t('guardOn') : t('guardOff')),
                ),
              ),
              collapsed.beginnerGuard
                ? null
                : h(
                    'div',
                    { className: 'psup-card-body', id: 'psup-body-beginnerGuard' },
                    h('p', { className: 'psup-muted' }, t('beginnerHint')),
                    modes.beginnerGuard
                      ? h(
                          'ul',
                          { className: 'psup-list' },
                          [1, 2, 3, 4, 5, 6].map((index) =>
                            h(
                              'li',
                              { key: index },
                              h('span', { className: 'psup-list-num' }, String(index)),
                              h('span', null, t('beginner' + index)),
                            ),
                          ),
                        )
                      : h('p', { className: 'psup-guard-off' }, t('guardOffNote')),
                  ),
            ),

            h(
              'section',
              { className: 'psup-card' },
              h(
                'div',
                { className: 'psup-card-head' },
                collapseButton('promptPolish', t('polishTitle')),
                h('h2', { className: 'psup-card-title' }, t('polishTitle')),
                h(
                  'button',
                  {
                    type: 'button',
                    role: 'switch',
                    'aria-checked': modes.promptPolish ? 'true' : 'false',
                    'aria-label': t('polishAria'),
                    title: t('polishHint'),
                    className: 'psup-switch' + (modes.promptPolish ? ' is-on' : ''),
                    onClick: () => toggleMode('promptPolish'),
                  },
                  h('span', { className: 'psup-switch-track' }, h('span', { className: 'psup-switch-knob' })),
                  h('span', { className: 'psup-switch-label' }, modes.promptPolish ? t('guardOn') : t('guardOff')),
                ),
              ),
              collapsed.promptPolish
                ? null
                : h(
                    'div',
                    { className: 'psup-card-body', id: 'psup-body-promptPolish' },
                    h('p', { className: 'psup-muted' }, t('polishHint')),
                    modes.promptPolish
                      ? h(
                          'ul',
                          { className: 'psup-list' },
                          [1, 2, 3, 4].map((index) =>
                            h(
                              'li',
                              { key: index },
                              h('span', { className: 'psup-list-num' }, String(index)),
                              h('span', null, t('polish' + index)),
                            ),
                          ),
                        )
                      : h('p', { className: 'psup-guard-off' }, t('polishOffNote')),
                  ),
            ),

            h(
              'section',
              { className: 'psup-card' },
              h(
                'div',
                { className: 'psup-card-head' },
                collapseButton('requirementInterview', t('interviewTitle')),
                h('h2', { className: 'psup-card-title' }, t('interviewTitle')),
                h(
                  'button',
                  {
                    type: 'button',
                    role: 'switch',
                    'aria-checked': modes.requirementInterview ? 'true' : 'false',
                    'aria-label': t('interviewAria'),
                    title: t('interviewHint'),
                    className: 'psup-switch' + (modes.requirementInterview ? ' is-on' : ''),
                    onClick: () => toggleMode('requirementInterview'),
                  },
                  h('span', { className: 'psup-switch-track' }, h('span', { className: 'psup-switch-knob' })),
                  h('span', { className: 'psup-switch-label' }, modes.requirementInterview ? t('guardOn') : t('guardOff')),
                ),
              ),
              collapsed.requirementInterview
                ? null
                : h(
                    'div',
                    { className: 'psup-card-body', id: 'psup-body-requirementInterview' },
                    h('p', { className: 'psup-muted' }, t('interviewHint')),
                    modes.requirementInterview
                      ? h(
                          'ul',
                          { className: 'psup-list' },
                          [1, 2, 3, 4].map((index) =>
                            h(
                              'li',
                              { key: index },
                              h('span', { className: 'psup-list-num' }, String(index)),
                              h('span', null, t('interview' + index)),
                            ),
                          ),
                        )
                      : h('p', { className: 'psup-guard-off' }, t('interviewOffNote')),
                  ),
            ),

            h(
              'section',
              { className: 'psup-card' },
              h('div', { className: 'psup-card-head' }, h('h2', { className: 'psup-card-title' }, t('actionsTitle'))),
              h('p', { className: 'psup-muted' }, t('actionsHint')),
              h(
                'div',
                { className: 'psup-actions' },
                [
                  {
                    id: 'kickoff',
                    label: t('copyKickoff'),
                    primary: true,
                    onClick: () => copy(t('kickoff'), 'copyKickoffDone', 'copyFailed'),
                    help: t('quickKickoffWhy'),
                  },
                  {
                    id: 'install',
                    label: t('copyInstall'),
                    onClick: () => copy(fillCopy(t('installCmd'), cwd || t('noCwd')), 'copyInstallDone', 'copyFailed'),
                    help: t('quickInstallWhy'),
                  },
                  {
                    id: 'rules',
                    label: t('copyRules'),
                    onClick: () => copy(fillCopy(t('rulesPath'), cwd || t('noCwd')), 'copyRulesDone', 'copyFailed'),
                    help: t('quickRulesWhy'),
                  },
                ].map((action) => {
                  const open = openHelp === action.id;
                  return h(
                    'div',
                    { key: action.id, className: 'psup-action-item' + (open ? ' is-open' : '') },
                    h(
                      'div',
                      { className: 'psup-action-line' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'psup-btn' + (action.primary ? ' psup-btn-primary' : ''),
                          onClick: action.onClick,
                        },
                        action.label,
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'psup-disclosure',
                          'aria-expanded': open ? 'true' : 'false',
                          'aria-label': t('quickHelpAria') + action.label,
                          onClick: () => setOpenHelp(open ? null : action.id),
                        },
                        h('span', { className: 'psup-chevron', 'aria-hidden': 'true' }, '›'),
                        h('span', null, open ? t('quickHelpHide') : t('quickHelpShow')),
                      ),
                    ),
                    open ? h('p', { className: 'psup-help' }, action.help) : null,
                  );
                }),
              ),
            ),

            h(
              'footer',
              { className: 'psup-footer' },
              h('span', null, t('footerRules')),
              h('span', null, t('footerReadonly')),
              h('span', null, t('teamHint')),
            ),

            toast ? h('div', { className: 'psup-toast' }, toast) : null,
          ),
        );
      }

      /* ================================================================ *
       * Plugin entry
       * ================================================================ */

      return {
        inject: ['slots', 'locale', 'remote', 'remote.workspaceFiles'],
        apply(ctx) {
          ctx.effect(
            () =>
              ctx.locale.register(NS, {
                zh: COPY_ZH,
                en: COPY_EN,
              }),
            'project-supervisor: copy',
          );

          const t = ctx.locale.bind(NS);

          ctx.effect(() => {
            installStyles();
            return () => removeStyles();
          }, 'project-supervisor: styles');

          const face = {
            probe(sessionId, path, signal) {
              const remote = ctx.remote && ctx.remote.workspaceFiles;
              if (!remote || typeof remote.stat !== 'function') {
                return Promise.resolve({ ok: false, error: { code: 'workspace-files-unavailable', message: 'workspaceFiles.stat unavailable' } });
              }
              return remote.stat(sessionId, path, signal || undefined);
            },
          };

          ctx.slots.inject('main', () =>
            ctx.slots.register(
              {
                name: 'main',
                key: PANEL_ID,
                locale: NS,
                inject: () => face,
              },
              SupervisorPage,
            ),
          );

          ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              {
                name: 'sidebar.panellist',
                id: PANEL_ID,
                order: 30,
                label: () => t('nav'),
                locale: NS,
              },
              SupervisorIcon,
            ),
          );
        },
      };
    },
  });
})();
