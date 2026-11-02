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
  const VERSION = '1.0.0';
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
        zoneWorkTitle: '工作方式',
        zoneWorkHint: '五类开关与派发策略；只影响之后的任务，进行中的任务不中断。',
        switchBoardTitle: '工作开关',
        switchBoardHint: '点行尾「说明」展开该开关的完整指引；开关写入 .dsh/supervisor.config.json。',
        beginnerShort: '默认开；开工前读配置决定是否引导，安全底线始终保留。',
        autoWorkShort: '默认关；开启后主管按排队任务继续推进，危险动作只写清单。',
        collabShort: '默认关；开启后按任务类型给 subagent 选模型。',
        polishShort: '默认开；开启时主管先把每条指令工程化再执行。',
        interviewShort: '默认开；只在「提出新项目」那轮追问需求，够用就停。',
        zoneRuntimeTitle: '运行状态',
        zoneRuntimeHint: '并行对话框在会话页头「智能体团队」里查看；下方只读展示成员、任务与待投递消息。',
        zoneChecksTitle: '规则自检',
        zoneWorkSummary: '2 张设置卡',
        zoneRuntimeSummary: '成员 {members} · 任务 {tasks} · 待投递 {pending}',
        zoneRuntimeDegraded: '团队看板暂不可用',
        zoneChecksSummary: '{ready} / 9 项就绪',
        zoneActionsSummary: '7 个快捷动作',
        zoneGuideSummary: '主管四步流程',
        zoneExpand: '展开',
        zoneCollapse: '收起',
        currentProject: '当前项目',
        versionTag: '主管插件 v1.0.0',
        modeCardTitle: '主管工作模式',
        modeHint: '决定主管亲自做还是派给对话框；只影响之后的任务，进行中的任务不中断。',
        modeEfficiency: '效率优先',
        modeEfficiencyDesc: '紧耦合跨文件改动、测试迭代、10 分钟内小修补由主管亲自做；独立新文件、调研、评审、文档包、可独立验收的模块派给对话框。',
        modeStrict: '严格派发',
        modeStrictDesc: '所有文件写入都交给对话框；主管只拆解、登记任务、写命令、评审、验收、集成。更慢、token 更多，但主管不亲自写文件。',
        modeAria: '主管工作模式选择',
        modeSaved: '已切换工作模式（已写入 .dsh/supervisor.config.json）',
        modeLocalSaved: '已切换工作模式（已存浏览器；重启 DSH 后请再选一次）',
        autoWorkTitle: '自动工作',
        autoWorkHint: '默认关。开启后主管不再因提问/授权弹窗卡住，会从「排队任务」继续推进可完成项；危险动作只写清单、不执行。改 host 后需重启 dsh web。',
        autoWorkOn: '开',
        autoWorkOff: '关',
        autoWorkAria: '自动工作开关',
        autoWorkQueue: '排队',
        autoWorkBlocked: '阻塞',
        autoWorkQuestions: '待回答',
        autoWorkFileHint: '队列文件：.dsh/auto-work-queue.md（只读展示）',
        autoWorkQueueEmpty: '还没有队列文件 .dsh/auto-work-queue.md：让主管按模板创建并登记排队任务后，自动工作才会推进。',
        autoWorkUnavailable: '队列状态暂不可用：host 半侧未重启或路由不可用；开关本身仍可保存。',
        autoWorkHostPending: '面板 host 未生效：开关先存浏览器，重启 DSH 后再点一次即可写入工作区配置。',
        autoWorkSaved: '自动工作设置已保存（已写入 .dsh/supervisor.config.json）',
        autoWorkLocalSaved: '自动工作设置已存浏览器（重启 DSH 后请重新设置）',
        ecoAutoWorkTitle: '更经济的自动化',
        ecoAutoWorkShort: '仅在谷价时段推进自动工作（更省额度）',
        ecoAutoWorkHint: '高峰时段为北京时间周一至周五 09:00–12:00、14:00–18:00；其余时间（含周末/节假日）为谷价。高峰前 20 分钟只收尾，进入谷价后自动续跑；只约束自动工作，不影响手动使用。',
        ecoAutoWorkAria: '更经济的自动化开关',
        ecoAutoWorkSaved: '更经济的自动化设置已保存（已写入 .dsh/supervisor.config.json）',
        ecoAutoWorkLocalSaved: '更经济的自动化设置已存浏览器（重启 DSH 后请重新设置）',
        ecoAutoWorkNeedsAutoWork: '请先开启「自动工作」再启用此项',
        teamCardTitle: '团队与任务',
        teamCardHint: '只读：从 lead 会话日志解析 Agent Teams 成员、任务板（取最新 revision）与待投递消息；随顶部「刷新」按钮一起更新。',
        teamMembers: '成员',
        teamTasks: '任务',
        teamPending: '待投递',

        teamEmpty: '还没有团队数据：本次会话还没有成员/任务，或当前项目选中的不是 lead 会话；有待投递消息时会显示在这里。',

        teamDegraded: '团队看板暂不可用：host 半侧未重启或会话日志缺失；任务板以会话文件为准。',
        teamLead: '主管',
        teamScopes: '写范围',
        teamStatusPending: '待开始',
        teamStatusInProgress: '进行中',
        teamStatusCompleted: '已完成',
        teamStatusOther: '其他',
        teamPhaseProvisioning: '调度中',
        teamPhaseActive: '活跃',
        teamPhaseFailed: '失败',
        copyHandoff: '复制交接单模板',
        copyHandoffDone: '已复制交接单模板',
        copyTeamSnapshot: '复制团队状态快照',
        copyTeamSnapshotDone: '已复制团队状态快照',
        copyDoctor: '复制环境体检口令',
        copyDoctorDone: '已复制环境体检口令',
        copyVerify: '复制一键验收口令',
        copyVerifyDone: '已复制一键验收口令',
        quickHandoffWhy: '作用：把标准交接单模板放进剪贴板。写进 .dsh/handoff.md 后，用 fresh 对话框接手未完成任务；新对话框先读 handoff+LEDGER+plan 再动手，避免用 fork 继承长上下文。',
        quickTeamSnapshotWhy: '作用：把当前团队状态（成员/任务/待投递消息）复制成一段文本，粘给新对话框或写进交接单，替代口述进度。',
        quickDoctorWhy: '作用：复制环境体检命令。开工前/收尾前跑一次，检查 Node/python 版本、规则与技能文件预算、插件安装状态、同步一致性与 git 卫生，输出 PASS/WARN/FAIL 表。',
        quickVerifyWhy: '作用：复制一键验收命令。每批交付或评审前跑，串起体检、同步检查、插件测试与 git 卫生，输出即可作为验收证据。',
        handoffTemplate:
          '## 交接单（手写补全后存到 {cwd}/.dsh/handoff.md）\n'
          + '- 目标 / 完成定义：<一句话目标 + 可执行验收检查>\n'
          + '- 已改文件清单：<路径 + 改动摘要>\n'
          + '- 任务板状态：<task-xxx 状态 / owner / 阻塞>\n'
          + '- 已验证命令与输出：<命令 + 关键输出/退出码>\n'
          + '- 未完成 + 下一步：<按顺序列 1-3 条>\n'
          + '- 阻塞与风险：<需要用户拍板 / 不可逆动作 / 写范围冲突>\n'
          + '- 接手开工指令：先读 {cwd}/.dsh/handoff.md、LEDGER.md、plan.md，再按任务板继续；不要重新做已验收部分。\n',
        doctorCmd: 'bash {cwd}/setup/supervisor-doctor.sh',
        verifyCmd: 'bash {cwd}/setup/supervisor-verify.sh --fast',
        collabTitle: '模型协作',
        collabHint: '开启后主管按任务类型给 subagent 选模型；只影响之后的派发。',
        collabOn: '开',
        collabOff: '关',
        collabAria: '模型协作开关',
        collabModeAria: '模型选择方式',
        collabSaved: '模型协作设置已保存（已写入 .dsh/supervisor.config.json）',
        collabLocalSaved: '模型协作设置已存浏览器（重启 DSH 后请重新设置）',
        collabAuto: 'AI 自动选择',
        collabAutoDesc: '按任务类型自动挑模型：规划/评审用更强模型，实现/调研/文档用快模型。',
        collabManual: '用户手动选择',
        collabManualDesc: '为每类任务单独指定模型；未指定的用 DSH 默认。',
        collabAssignAria: '任务类型到模型的选择',
        collabTaskPlanning: '规划 / 架构',
        collabTaskImplement: '实现编码',
        collabTaskReview: '独立评审',
        collabTaskResearch: '调研检索',
        collabTaskDocs: '文档整理',
        collabTaskVerify: '测试验证',
        collabModelDefault: '默认（不指定）',
        collabRouteHint: '可选路由来自本机 list_subagent_models；选完立即保存。',
        collabAutoRoutesAria: '自动模式的路由表',
        collabAutoRoutesHint: '自动模式按这张表派发；「推荐默认」= 按任务强弱自动挑。模型列表来自本机 LLM 路由。',
        collabAutoDefault: '推荐默认',
        collabNote: '仅对 subagent 派发生效；team 成员（teammate）不能选模型。',
        projectTitle: '选择项目',
        refresh: '刷新',
        refreshing: '刷新中…',
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
        beginnerHint: '主管开工前先读配置，决定是否开启零基础引导；密钥、不可逆动作确认等安全底线始终保留。',
        guardOn: '开',
        guardOff: '关',
        guardAria: '零基础保护开关',
        guardOnToast: '零基础保护已开启（已写入 .dsh/supervisor.config.json）',
        guardOffToast: '零基础保护已关闭（已写入 .dsh/supervisor.config.json）',
        guardOnLocalToast: '零基础保护已开启（已存浏览器；重启 DSH 后请再点一次开关）',
        guardOffLocalToast: '零基础保护已关闭（已存浏览器；重启 DSH 后请再点一次开关）',
        guardOffNote: '已关闭：主管不再主动做零基础引导；密钥、不可逆动作确认等安全底线仍保留。',
        polishTitle: '提示词润色',
        polishHint: '开启时主管先把每条指令工程化再执行。',
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
        interviewHint: '只在「你提出新项目」的那轮追问需求，够用就停；默认开启。',
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
        copyBootstrap: '复制一键安装口令（新工作区）',
        copyBootstrapDone: '已复制一键安装口令',
        quickHelpShow: '说明',
        quickHelpHide: '收起',
        quickHelpAria: '展开说明：',
        quickKickoffWhy: '作用：把一段标准开工口令放进剪贴板，粘贴给主管即可。口令含目标占位、完成定义/分解/并行/验收要求，并附上规则文件路径（AGENTS.md、SKILL.md、主管手册），主管开工先读。',
        quickInstallWhy: '作用：复制一条命令，把主管规则、技能、手册和调研资料安装到另一个工作区。对方解压分享包后运行即可；换电脑、给朋友用都靠它。',
        quickBootstrapWhy: '作用：复制一段「一键安装口令」。粘贴到任意新工作区的新会话，agent 会自己从 GitHub 下载套件并装进当前工作区、逐项验收；装完再新建会话让常驻规则生效。',
        copyFallbackTitle: '手动复制',
        copyFallbackHint: '浏览器拒绝了自动复制，下面是文本（已全选），按 Ctrl/⌘+C 复制即可。',
        copyFallbackClose: '关闭',
        footerRules: '规则载体：AGENTS.md（常驻）+ .dsh/skills/project-supervisor/SKILL.md（详细流程）。',
        footerReadonly: '本面板基本只读；写操作仅限五个开关、派发模式与模型协作（写 .dsh/supervisor.config.json）。',


        kickoff:
          '你当项目主管，帮我做：<在这里写目标>。要求：先定完成定义与工作分解；能并行就开多个对话框，写范围互不重叠；完成后你亲自验收，并给我验证结果（命令 + 输出）。\n\n'
          + '规则文件（开工先读）：\n'
          + '- 常驻规则：{cwd}/AGENTS.md\n'
          + '- 详细流程与模板：{cwd}/.dsh/skills/project-supervisor/SKILL.md\n'
          + '- 使用说明：{cwd}/主管手册.md',
        bootstrap:
          '请把「项目主管套件」一键装到当前工作区（cwd 即目标），不要改已有文件、不要 git commit/push。\n'
          + '1) 下载套件（任选其一，失败换下一个）：\n'
          + '   仓库路线：git clone --depth 1 https://github.com/Midnight-1991/dsh-project-supervisor.git /tmp/dsh-project-supervisor-kit && bash /tmp/dsh-project-supervisor-kit/kit/install-supervisor.sh . --with-research --with-setup\n'
          + '   zip 路线（无 git）：从 https://github.com/Midnight-1991/dsh-project-supervisor/releases 下载 project-supervisor-kit-*.zip，解压后运行 bash <解压目录>/install-supervisor.sh . --with-research --with-setup\n'
          + '   Windows：把上面脚本换成 node <目录>\\install-supervisor.mjs . --with-research --with-setup\n'
          + '2) 验收并逐项告诉我：AGENTS.md 是否以「# 项目主管作业规则（本工作区）」开头；.dsh/skills/project-supervisor/SKILL.md 与 templates/ 五个模板；主管手册.md；research/README.md 与 research/DECISIONS.md；setup/ 下 sync-kit.sh、selftest.sh、verify-facts.sh；.dsh/supervisor-kit.json 的版本号与 withResearch/withSetup。\n'
          + '3) 装完提醒我在同一目录「新建会话」让常驻规则生效；本会话先按 AGENTS.md 规则继续。\n'
          + '4) 失败就原样贴出错误与退出码，不要擅自删文件重试。',
        installCmd: 'bash {cwd}/setup/install-supervisor.sh /path/to/workspace --with-research --with-setup',
        noCwd: '<工作区路径>',
      };

      const COPY_EN = {
        nav: 'Supervisor',
        title: 'Project Supervisor',
        subtitle: 'Central decisions · parallel dispatch · verified delivery',
        zoneWorkTitle: 'Work modes',
        zoneWorkHint: 'Five switches and the dispatch policy; they only affect later tasks, never the one in flight.',
        switchBoardTitle: 'Switches',
        switchBoardHint: 'Use the Details button at each row end to expand its full guide; switches are saved to .dsh/supervisor.config.json.',
        beginnerShort: 'On by default; read at kickoff to decide whether to guide; safety bottom lines always stay on.',
        autoWorkShort: 'Off by default; when on, the supervisor keeps pushing queued tasks and only lists dangerous actions.',
        collabShort: 'Off by default; when on, picks a model per task type for subagents.',
        polishShort: 'On by default; engineers every instruction before executing.',
        interviewShort: 'On by default; asks about requirements only for new projects and stops when enough.',
        zoneRuntimeTitle: 'Runtime',
        zoneRuntimeHint: 'Parallel dialogues live under Agent Team in the session header; the card below lists members, tasks and pending messages (read-only).',
        zoneChecksTitle: 'Baseline checks',
        zoneWorkSummary: '2 settings cards',
        zoneRuntimeSummary: 'Members {members} · Tasks {tasks} · Pending {pending}',
        zoneRuntimeDegraded: 'Team board unavailable',
        zoneChecksSummary: '{ready} / 9 ready',
        zoneActionsSummary: '7 quick actions',
        zoneGuideSummary: '4-step supervisor flow',
        zoneExpand: 'Expand',
        zoneCollapse: 'Collapse',
        currentProject: 'Project',
        versionTag: 'Supervisor plugin v1.0.0',
        modeCardTitle: 'Supervisor mode',
        modeHint: 'Choose whether the supervisor writes itself or dispatches every write to a dialog; applies to new tasks only.',
        modeEfficiency: 'Efficiency first',
        modeEfficiencyDesc: 'Tightly-coupled cross-file edits, test iterations and small fixes (<10 min) stay with the supervisor; independent files, research, reviews, doc bundles and self-contained modules go to dialogs.',
        modeStrict: 'Strict dispatch',
        modeStrictDesc: 'Every file write goes to a dialog, even a one-file fix; the supervisor only plans, registers tasks, reviews, verifies and integrates. Slower, but it never writes files.',
        modeAria: 'Supervisor mode selector',
        modeSaved: 'Mode switched (written to .dsh/supervisor.config.json)',
        modeLocalSaved: 'Mode switched (saved in browser; re-select after a DSH restart)',
        autoWorkTitle: 'Auto work',
        autoWorkHint: 'Off by default. When on, the supervisor is no longer blocked by question/approval prompts and keeps pushing the queued tasks; dangerous actions are listed, never executed. Restart dsh web after updating the host half.',
        autoWorkOn: 'On',
        autoWorkOff: 'Off',
        autoWorkAria: 'Auto work switch',
        autoWorkQueue: 'Queued',
        autoWorkBlocked: 'Blocked',
        autoWorkQuestions: 'Questions',
        autoWorkFileHint: 'Queue file: .dsh/auto-work-queue.md (read-only view)',
        autoWorkQueueEmpty: 'No queue file yet (.dsh/auto-work-queue.md): have the supervisor create it from the template and register queued tasks before auto work can push.',
        autoWorkUnavailable: 'Queue status unavailable: the host half was not reloaded or the route failed; the switch still saves.',
        autoWorkHostPending: 'Panel host half inactive: the switch is saved in the browser; click it again after a DSH restart to write workspace config.',
        autoWorkSaved: 'Auto work saved (written to .dsh/supervisor.config.json)',
        autoWorkLocalSaved: 'Auto work saved in browser (re-set after a DSH restart)',
        ecoAutoWorkTitle: 'More economical automation',
        ecoAutoWorkShort: 'Only push auto work during off-peak hours (saves quota)',
        ecoAutoWorkHint: 'Peak hours are Mon–Fri 09:00–12:00 and 14:00–18:00 Beijing time; all other times (incl. weekends and holidays) are off-peak. The last 20 minutes before peak only wrap up, and work resumes automatically after the boundary. This only constrains auto work, not manual use.',
        ecoAutoWorkAria: 'More economical automation switch',
        ecoAutoWorkSaved: 'More economical automation saved (written to .dsh/supervisor.config.json)',
        ecoAutoWorkLocalSaved: 'More economical automation saved in browser (re-set after a DSH restart)',
        ecoAutoWorkNeedsAutoWork: 'Turn on \"Auto work\" first',
        teamCardTitle: 'Team & tasks',
        teamCardHint: 'Read-only: members, task board (latest revision) and pending messages parsed from the Lead session log; updated together with the top Refresh button.',
        teamMembers: 'Members',
        teamTasks: 'Tasks',
        teamPending: 'Pending',

        teamEmpty: 'No team data yet: no members/tasks in this session, or the selected project is not the Lead session; pending messages will appear here.',

        teamDegraded: 'Team board unavailable: the host half was not reloaded or the session log is missing; the session file stays authoritative.',
        teamLead: 'lead',
        teamScopes: 'scopes',
        teamStatusPending: 'pending',
        teamStatusInProgress: 'in progress',
        teamStatusCompleted: 'done',
        teamStatusOther: 'other',
        teamPhaseProvisioning: 'provisioning',
        teamPhaseActive: 'active',
        teamPhaseFailed: 'failed',
        copyHandoff: 'Copy handoff template',
        copyHandoffDone: 'Handoff template copied',
        copyTeamSnapshot: 'Copy team snapshot',
        copyTeamSnapshotDone: 'Team snapshot copied',
        copyDoctor: 'Copy health-check command',
        copyDoctorDone: 'Health-check command copied',
        copyVerify: 'Copy one-shot verify command',
        copyVerifyDone: 'Verify command copied',
        quickHandoffWhy: 'What it does: puts the standard handoff template on the clipboard. Save it as .dsh/handoff.md and hand pending work to a fresh dialog; the new dialog reads handoff+LEDGER+plan first. Do not use fork as a handoff.',
        quickTeamSnapshotWhy: 'What it does: copies the current team state (members/tasks/pending messages) as text for a new dialog or the handoff file, instead of narrating progress.',
        quickDoctorWhy: 'What it does: copies the environment health-check command. Run it before starting or closing a batch to check Node/python versions, rule/skill budgets, plugin installation, kit sync and git hygiene; it prints a PASS/WARN/FAIL table.',
        quickVerifyWhy: 'What it does: copies the one-shot verify command. Run it before review or delivery; it chains doctor, sync checks, plugin tests and git hygiene, and its output is acceptance evidence.',
        handoffTemplate:
          '## Handoff (fill in, then save as {cwd}/.dsh/handoff.md)\n'
          + '- Goal / definition of done: <one-line goal + executable acceptance checks>\n'
          + '- Changed files: <path + change summary>\n'
          + '- Task board state: <task-xxx status / owner / blockers>\n'
          + '- Verified commands & output: <command + key output/exit code>\n'
          + '- Remaining + next steps: <1-3 ordered items>\n'
          + '- Blockers & risks: <needs user decision / irreversible action / write-scope conflict>\n'
          + '- Kickoff instruction: read {cwd}/.dsh/handoff.md, LEDGER.md and plan.md first, then continue from the task board; do not redo accepted work.\n',
        doctorCmd: 'bash {cwd}/setup/supervisor-doctor.sh',
        verifyCmd: 'bash {cwd}/setup/supervisor-verify.sh --fast',
        collabTitle: 'Model collaboration',
        collabHint: 'When on, the supervisor picks a model per task type for subagent dispatch only.',
        collabOn: 'On',
        collabOff: 'Off',
        collabAria: 'Model collaboration switch',
        collabModeAria: 'Model selection mode',
        collabSaved: 'Model collaboration saved (written to .dsh/supervisor.config.json)',
        collabLocalSaved: 'Model collaboration saved in browser (re-set after a DSH restart)',
        collabAuto: 'AI auto-select',
        collabAutoDesc: 'Pick per task type automatically: stronger model for planning/review, fast model for implementation/research/docs.',
        collabManual: 'Manual per task',
        collabManualDesc: 'Assign a model for each task type; unset ones use the DSH default.',
        collabAssignAria: 'Task-type to model assignment',
        collabTaskPlanning: 'Planning / architecture',
        collabTaskImplement: 'Implementation',
        collabTaskReview: 'Independent review',
        collabTaskResearch: 'Research',
        collabTaskDocs: 'Documentation',
        collabTaskVerify: 'Testing / verification',
        collabModelDefault: 'Default (unset)',
        collabRouteHint: 'Routes come from list_subagent_models on this machine; changes save immediately.',
        collabAutoRoutesAria: 'Auto-mode routing table',
        collabAutoRoutesHint: 'Auto mode dispatches by this table; "Recommended default" picks by task difficulty. Models come from this machine\'s LLM routes.',
        collabAutoDefault: 'Recommended default',
        collabNote: 'Only subagent dispatch can pick models; team members (teammates) cannot.',
        projectTitle: 'Choose project',
        refresh: 'Refresh',
        refreshing: 'Refreshing…',
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
        beginnerHint: 'The supervisor reads this at kickoff to decide whether to enable beginner safeguards; key handling and irreversible-action confirmations always stay on.',
        guardOn: 'On',
        guardOff: 'Off',
        guardAria: 'Beginner safeguards switch',
        guardOnToast: 'Beginner safeguards on (written to .dsh/supervisor.config.json)',
        guardOffToast: 'Beginner safeguards off (written to .dsh/supervisor.config.json)',
        guardOnLocalToast: 'Beginner safeguards on (saved in browser; reopen the switch after a DSH restart)',
        guardOffLocalToast: 'Beginner safeguards off (saved in browser; reopen the switch after a DSH restart)',
        guardOffNote: 'Off: the supervisor no longer volunteers beginner guidance; secret and irreversible-action safety still applies.',
        polishTitle: 'Prompt polish',
        polishHint: 'When on, the supervisor engineers every instruction before executing.',
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
        interviewHint: 'Only in the turn where you propose a new project; stops once it has enough. On by default.',
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
        copyBootstrap: 'Copy one-paste install prompt (new workspace)',
        copyBootstrapDone: 'Install prompt copied',
        quickHelpShow: 'Why',
        quickHelpHide: 'Hide',
        quickHelpAria: 'Expand explanation: ',
        quickKickoffWhy: 'What it does: puts a standard kickoff prompt on the clipboard. It includes the goal placeholder, done/decompose/parallel/verify requirements, and the rules file paths (AGENTS.md, SKILL.md, user guide) the supervisor reads first.',
        quickInstallWhy: 'What it does: copies a command that installs the rules, skill, manual and research into another workspace. Run it from the unpacked kit to set up a new machine or share with a teammate.',
        quickBootstrapWhy: 'What it does: copies a one-paste install prompt. Paste it into any new workspace session; the agent downloads the kit from GitHub, installs it into the current workspace and verifies it. Open a new session afterwards for the standing rules.',
        copyFallbackTitle: 'Copy manually',
        copyFallbackHint: 'The browser refused automatic copy. The text below is selected; press Ctrl/⌘+C to copy.',
        copyFallbackClose: 'Close',
        footerRules: 'Rules live in AGENTS.md (standing) + .dsh/skills/project-supervisor/SKILL.md (detailed flow).',
        footerReadonly: 'Read-only except the five switches, dispatch mode and model collaboration (written to .dsh/supervisor.config.json).',


        kickoff:
          'Act as the project supervisor and build: <describe the goal here>. Define "done" and decompose the work first; open parallel conversations when independent, with disjoint write scopes; verify the result yourself and report evidence (commands + output).\n\n'
          + 'Rules files (read first at kickoff):\n'
          + '- standing rules: {cwd}/AGENTS.md\n'
          + '- detailed flow & templates: {cwd}/.dsh/skills/project-supervisor/SKILL.md\n'
          + '- user guide: {cwd}/主管手册.md',
        bootstrap:
          'Install the project-supervisor kit into this workspace (cwd), then verify it. Do not modify existing files, do not git commit/push.\n'
          + '1) Download the kit (try in order):\n'
          + '   repo route: git clone --depth 1 https://github.com/Midnight-1991/dsh-project-supervisor.git /tmp/dsh-project-supervisor-kit && bash /tmp/dsh-project-supervisor-kit/kit/install-supervisor.sh . --with-research --with-setup\n'
          + '   zip route (no git): download project-supervisor-kit-*.zip from https://github.com/Midnight-1991/dsh-project-supervisor/releases, then run bash <unzipped>/install-supervisor.sh . --with-research --with-setup\n'
          + '   Windows: use node <dir>\\install-supervisor.mjs . --with-research --with-setup\n'
          + '2) Verify and report: AGENTS.md starts with "# 项目主管作业规则（本工作区）」"; .dsh/skills/project-supervisor/SKILL.md + five templates; 主管手册.md; research/README.md + research/DECISIONS.md; setup/ has sync-kit.sh, selftest.sh, verify-facts.sh; version + withResearch/withSetup in .dsh/supervisor-kit.json.\n'
          + '3) Remind me to open a NEW session in the same directory for the standing rules to load; continue this session per AGENTS.md.\n'
          + '4) On failure, paste the exact error and exit code; do not delete files and retry blindly.',
        installCmd: 'bash {cwd}/setup/install-supervisor.sh /path/to/workspace --with-research --with-setup',
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
  /* T17 布局可调参数：按截图微调信息密度时只改这一组变量。 */
  --psup-max-width: 1080px;
  --psup-zone-gap: 20px;
  --psup-zone-head-gap: 13px;
  --psup-card-gap: 12px;
  --psup-card-pad-y: 16px;
  --psup-card-pad-x: 18px;
  box-sizing: border-box;
  container-type: inline-size;
  container-name: psup;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding: calc(var(--dsh-frame-top-clearance, 48px) + 16px) 32px 48px;
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-bg-base, transparent);
}
.psup-inner {
  max-width: var(--psup-max-width, 1080px);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--psup-zone-gap, 26px);
}
.psup-head { display: flex; align-items: center; gap: 14px; }
.psup-logo {
  width: 42px; height: 42px; border-radius: 12px; flex: none;
  display: flex; align-items: center; justify-content: center;
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-bg-layer-2, #f5f6f7);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.08));
}
.psup-heading { min-width: 0; flex: 1; }
.psup-title { margin: 0; font-size: 22px; line-height: 1.25; font-weight: 600; letter-spacing: .2px; }
.psup-subtitle { margin: 3px 0 0; font-size: 13px; line-height: 1.4; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-version {
  align-self: center; flex: none; font-size: 11px; line-height: 1;
  padding: 5px 9px; border-radius: 999px;
  color: var(--dsw-alias-label-secondary, #646a73);
  background: var(--dsw-alias-bg-layer-2, #f5f6f7);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.08));
}

/* 顶部 slim 当前项目条：chips 切换 / 统一刷新（单行小按钮 + title/aria） / 路径省略 */
.psup-project-bar {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 9px 14px; border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2, #f7f8fa);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.06));
}
.psup-project-label {
  flex: none; font-size: 12px; font-weight: 600; line-height: 1;
  color: var(--dsw-alias-label-secondary, #646a73);
}
.psup-project-bar .psup-chips {
  flex: 1 1 auto; min-width: 0; gap: 6px;
  /* 项目条保持单行高度：chips 不换行、超出横向滚动，避免高分位置把「运行状态」标题挤出首屏 */
  flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; scrollbar-width: none;
}
.psup-project-bar .psup-chips::-webkit-scrollbar { display: none; }
.psup-project-bar .psup-chip {
  flex: none; font-size: 12px; padding: 5px 10px;
  max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.psup-project-actions { display: flex; align-items: center; gap: 10px; flex: none; flex-wrap: nowrap; margin-left: auto; }
.psup-project-bar .psup-path {
  margin: 0; max-width: 280px; flex: 0 1 280px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; line-height: 1.4; word-break: normal;
  color: var(--dsw-alias-label-secondary, #646a73);
}
.psup-project-bar .psup-btn {
  padding: 5px 10px; font-size: 12px; line-height: 1.2;
  /* 真实环境里按钮被挤成两行（刷新/状态）：禁止换行、不参与压缩，超长时让路径先省略 */
  white-space: nowrap; flex: none;
}
.psup-project-bar .psup-btn-ghost {
  border-radius: 8px;
  background: var(--dsw-alias-bg-base, #fff);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.12));
  color: var(--dsw-alias-label-primary, #1f2329);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
.psup-project-bar .psup-btn-ghost:hover {
  background: var(--dsw-alias-bg-layer-2, #eef0f3);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l1, rgba(0,0,0,.18));
}
.psup-project-bar .psup-btn-ghost[disabled] { opacity: 0.55; cursor: default; }
.psup-project-bar .psup-empty { margin: 0; }

/* 分区（工作方式 / 运行状态 / 规则自检 / 快捷动作）：标题 + 24–28px 区间距 */
.psup-zone { display: flex; flex-direction: column; gap: var(--psup-zone-head-gap, 13px); }
.psup-zone-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; padding: 0 2px; }
.psup-zone-title {
  margin: 0; display: flex; align-items: center; gap: 8px;
  font-size: 13px; line-height: 1.35; font-weight: 600; letter-spacing: .04em;
  color: var(--dsw-alias-label-secondary, #646a73);
}
.psup-zone-title::before {
  content: ''; width: 3px; height: 13px; border-radius: 2px;
  background: var(--dsw-alias-border-l1, rgba(0,0,0,.28));
}
.psup-zone-hint { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary, #646a73); }
/* 分区级折叠：标题行右侧 chevron；收起时标题行显示灰色摘要，标题行本身可点击 */
.psup-zone-head.is-toggleable { cursor: pointer; }
.psup-zone-head.is-toggleable:hover .psup-zone-title { color: var(--dsw-alias-label-primary, #1f2329); }
.psup-zone-head .psup-zone-hint { flex: 1 1 auto; min-width: 0; }
.psup-zone-summary {
  flex: 1 1 auto; min-width: 0; margin-left: 2px;
  font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary, #646a73);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.psup-zone-toggle {
  appearance: none; cursor: pointer; flex: none; margin-left: auto;
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-secondary, #646a73);
  transition: background 0.12s ease, color 0.12s ease;
}
.psup-zone-toggle:hover {
  background: var(--dsw-alias-bg-base, #fff);
  color: var(--dsw-alias-label-primary, #1f2329);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08));
}
.psup-zone-toggle:focus-visible { outline: 2px solid var(--dsw-alias-label-primary, #1f2329); outline-offset: 1px; }
.psup-zone-toggle .psup-chevron { transform: rotate(90deg); }
.psup-zone-toggle[aria-expanded='false'] .psup-chevron { transform: rotate(0deg); }
.psup-zone-body[hidden] { display: none; }
.psup-zone.is-collapsed { gap: 0; }
/* 工作方式区：两张全宽卡纵向堆叠（不再成对等高，避免状态相关卡内空洞）。 */
.psup-work-stack { display: flex; flex-direction: column; gap: var(--psup-card-gap, 14px); }
.psup-work-stack > .psup-card { min-width: 0; }

/* 卡片：12px 圆角 / 16px 18px 内边距 / 轻 ring，避免厚重嵌套 */
.psup-card {
  background: var(--dsw-alias-bg-layer-2, #f7f8fa);
  border-radius: 12px;
  padding: var(--psup-card-pad-y, 16px) var(--psup-card-pad-x, 18px);
  min-width: 0;
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.06));
}
.psup-card-head { display: flex; align-items: center; gap: 10px; min-height: 22px; margin-bottom: 4px; }
.psup-card-title { margin: 0; flex: 1; min-width: 0; font-size: 15px; line-height: 1.35; font-weight: 600; }
.psup-card-body { margin: 0; }
.psup-muted { margin: 4px 0 0; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-empty { margin: 6px 0 0; font-size: 12.5px; line-height: 1.55; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-note { margin: 8px 0 0; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-guard-off { margin: 4px 0 0; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-warn {
  margin-top: 8px; font-size: 12px; line-height: 1.6; padding: 9px 11px; border-radius: 10px;
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-state-warning-bg, rgba(217,119,6,.1));
  box-shadow: 0 0 0 1px var(--dsw-alias-state-warning-primary, rgba(217,119,6,.35));
}

/* 模式 / 模型协作选项：全宽卡内 2 列；内容宽 <720px 时单列（容器查询）。 */
.psup-mode-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.psup-mode-option, .psup-collab-option {
  appearance: none; display: flex; flex-direction: column; gap: 4px; text-align: left;
  padding: 8px 11px; border-radius: 10px; border: none; cursor: pointer; font: inherit; color: inherit;
  background: var(--dsw-alias-bg-base, #fff);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.08));
  transition: box-shadow .12s ease, background .12s ease;
}
.psup-mode-option:hover, .psup-collab-option:hover { box-shadow: 0 0 0 1px var(--dsw-alias-border-l1, rgba(0,0,0,.18)); }
.psup-mode-option.is-active, .psup-collab-option.is-active {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--dsw-alias-label-primary, #1f2329);
}
.psup-mode-option:focus-visible, .psup-collab-option:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: 2px; }
.psup-mode-name { font-size: 13px; font-weight: 600; }
.psup-mode-option.is-active .psup-mode-name::after, .psup-collab-option.is-active .psup-mode-name::after { content: ' ✓'; }
.psup-mode-desc { font-size: 12px; line-height: 1.45; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-model-table { display: grid; gap: 6px; margin-top: 10px; }
.psup-model-row {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(150px, 210px); gap: 10px; align-items: center;
  padding: 7px 9px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.08));
}
.psup-model-label { font-size: 12.5px; min-width: 0; }
.psup-model-row select {
  font: inherit; font-size: 12.5px; color: inherit; width: 100%;
  background: var(--dsw-alias-bg-base, transparent);
  border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.35));
  border-radius: 6px; padding: 4px 6px;
}
.psup-model-note { margin-top: 8px; }
.psup-collab-note { margin-top: 10px; }
@container psup (max-width: 559px) { .psup-model-row { grid-template-columns: minmax(0, 1fr); } }
@container psup (max-width: 719px) { .psup-mode-row { grid-template-columns: minmax(0, 1fr); } }
@container psup (max-width: 559px) { .psup-model-row select { font-size: 12px; } }

/* 开关：行内右对齐；说明行在下方 */
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
.psup-switch-label { font-size: 12px; color: var(--dsw-alias-label-secondary, #646a73); min-width: 13px; font-variant-numeric: tabular-nums; }
.psup-switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: 3px; border-radius: 999px; }
.psup-switch:disabled { cursor: not-allowed; opacity: .55; }
.psup-switch-small .psup-switch-track { width: 32px; height: 18px; }
.psup-switch-small .psup-switch-knob { top: 2px; left: 2px; width: 14px; height: 14px; }
.psup-switch-small.is-on .psup-switch-knob { transform: translateX(14px); }
/* 自动工作行内的缩进次级开关：单行紧凑，主开关关闭时置灰但保留已存值 */
.psup-switch-subrow { display: flex; align-items: center; gap: 10px; margin: 6px 0 0 14px; padding: 4px 10px; border-radius: 9px; background: var(--dsw-alias-bg-base, #fff); box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.08)); }
.psup-switch-subrow.is-disabled { background: transparent; box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.06)); }
.psup-switch-subrow-text { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; }
.psup-switch-subrow-name { margin: 0; flex: none; font-size: 12.5px; line-height: 1.5; font-weight: 600; color: var(--dsw-alias-label-primary, #1f2329); }
.psup-switch-subrow-hint { margin: 0; flex: 1 1 auto; min-width: 0; font-size: 12px; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-switch-subrow.is-disabled .psup-switch-subrow-name,
.psup-switch-subrow.is-disabled .psup-switch-subrow-hint { color: var(--dsw-alias-label-tertiary, #8f959e); }

/* 工作开关清单：5 行开关（名称 + 单行 hint + 右侧开关 + 行尾「说明」展开） */
.psup-switch-rows { display: flex; flex-direction: column; margin-top: 6px; }
.psup-switch-board-card { padding: 14px 16px; }
.psup-switch-row { display: flex; flex-direction: column; padding: 6px 0; border-top: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.06)); }
.psup-switch-row:first-child { border-top: none; padding-top: 2px; }
.psup-switch-row-main { display: flex; align-items: center; gap: 12px; }
.psup-switch-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.psup-switch-row-name { margin: 0; font-size: 14px; line-height: 1.4; font-weight: 600; }
.psup-switch-row-hint {
  margin: 0; font-size: 12px; line-height: 1.45; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--dsw-alias-label-secondary, #646a73);
}
.psup-switch-row-controls { flex: none; display: flex; align-items: center; gap: 6px; }
.psup-row-disclosure { margin-left: 0; }
.psup-row-disclosure .psup-chevron { font-size: 12px; }
.psup-row-disclosure[aria-expanded='true'] .psup-chevron { transform: rotate(90deg); }
.psup-row-body { margin: 10px 0 2px; padding-top: 10px; border-top: 1px dashed var(--dsw-alias-border-l2, rgba(128,128,128,.25)); }
.psup-row-extra { margin-top: 10px; }

/* 折叠按钮与说明正文 */
.psup-collapse {
  appearance: none; cursor: pointer; flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0; border: none; border-radius: 8px;
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
.psup-list { margin: 6px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 7px; }
.psup-list li { display: flex; gap: 8px; font-size: 12.5px; line-height: 1.55; }
.psup-list-num {
  flex: none; width: 17px; height: 17px; border-radius: 50%; margin-top: 2px;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 600;
  color: var(--dsw-alias-label-secondary, #646a73);
  background: var(--dsw-alias-bg-layer-3, rgba(0,0,0,.05));
}
.psup-guide-hint { margin: 0 0 2px; }

/* 计数 / 标签 / 路径 */
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
  margin-top: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; line-height: 1.5; word-break: break-all;
  color: var(--dsw-alias-label-secondary, #646a73);
}
.psup-counts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 10px; }
.psup-count {
  font-size: 12px; line-height: 1; padding: 6px 10px; border-radius: 999px;
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-bg-base, #fff);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.1));
  font-variant-numeric: tabular-nums;
}
.psup-count-file {
  width: 100%; margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; line-height: 1.5; word-break: break-all;
  color: var(--dsw-alias-label-secondary, #646a73);
}
.psup-autowork-status { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 10px; }
.psup-autowork-count { font-size: 12px; line-height: 1; padding: 6px 10px; border-radius: 999px;
  color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-base, #fff);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.1)); font-variant-numeric: tabular-nums; }
.psup-autowork-file { width: 100%; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; line-height: 1.5; word-break: break-all; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-team-row {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px;
  padding: 7px 10px; border-radius: 8px; font-size: 12.5px; line-height: 1.5;
  background: var(--dsw-alias-bg-base, #fff);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.07));
}
.psup-team-subject { min-width: 0; flex: 1 1 220px; word-break: break-word; }
.psup-team-meta { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #646a73); font-variant-numeric: tabular-nums; }
.psup-badge {
  flex: none; font-size: 11px; line-height: 1; padding: 4px 8px; border-radius: 999px;
  color: var(--dsw-alias-label-secondary, #646a73);
  background: var(--dsw-alias-bg-layer-3, rgba(0,0,0,.06));
  font-variant-numeric: tabular-nums;
}
.psup-badge.is-in_progress { color: var(--dsw-alias-state-warning-primary, #d97706); }
.psup-badge.is-completed { color: var(--dsw-alias-state-success-primary, #2da44e); }

/* 规则自检：分数 + 进度条 + 9 项两列 */
.psup-score { display: flex; align-items: baseline; gap: 10px; margin: 4px 0 10px; }
.psup-score-num { font-size: 26px; font-weight: 650; letter-spacing: .3px; font-variant-numeric: tabular-nums; }
.psup-score-label { font-size: 12px; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-bar { display: inline-block; flex: 1; height: 6px; border-radius: 999px; overflow: hidden; vertical-align: middle;
  background: var(--dsw-alias-border-l2, rgba(0,0,0,.08)); }
.psup-bar-fill { display: block; height: 100%; border-radius: 999px; background: var(--dsw-alias-state-success-primary, #2da44e); transition: width .25s ease; }
.psup-checks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 22px; }
.psup-check { display: flex; gap: 9px; padding: 6px 0; align-items: flex-start; }
.psup-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: none; background: var(--dsw-alias-border-l1, rgba(0,0,0,.25)); }
.psup-check.is-ok .psup-dot { background: var(--dsw-alias-state-success-primary, #2da44e); }
.psup-check.is-missing .psup-dot { background: var(--dsw-alias-state-warning-primary, #d97706); }
.psup-check-body { min-width: 0; }
.psup-check-label { font-size: 12.5px; line-height: 1.45; }
.psup-check-hint { font-size: 11.5px; line-height: 1.5; margin-top: 1px; color: var(--dsw-alias-label-secondary, #646a73); }
@container psup (max-width: 559px) { .psup-checks { grid-template-columns: minmax(0, 1fr); } }
/* 缺失项建议：网格只留状态点+名称，建议统一移到网格下方列表 */
.psup-check-suggestions { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--dsw-alias-border-l2, rgba(128,128,128,.25)); }
.psup-check-suggestions-title { margin: 0 0 4px; font-size: 11.5px; font-weight: 600; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-check-suggestion { margin: 3px 0 0; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-check-suggestion strong { font-weight: 600; color: var(--dsw-alias-label-primary, #1f2329); }

/* 快捷动作：主动作突出 + 其余 2 列紧凑行，说明可展开 */
.psup-actions-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.psup-action-item {
  display: flex; flex-direction: column; min-width: 0;
  padding: 6px 8px; border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, #f7f8fa);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.22));
}
.psup-action-item.is-open { background: var(--dsw-alias-bg-base, #fff); }
.psup-action-primary { grid-column: 1 / -1; padding: 0; background: transparent; box-shadow: none; }
.psup-action-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.psup-action-item .psup-btn { flex: 0 1 auto; padding: 7px 12px; font-size: 12px; }
.psup-action-primary .psup-btn-primary { flex: 0 0 auto; justify-content: center; padding: 9px 16px; font-size: 13px; }
.psup-disclosure {
  margin-left: auto; appearance: none; cursor: pointer; font: inherit;
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border: none; border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px;
}
.psup-disclosure:hover { color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.12)); }
.psup-disclosure:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: 2px; }
.psup-chevron { display: inline-block; font-size: 14px; line-height: 1; transition: transform 0.16s ease; }
.psup-action-item.is-open .psup-chevron { transform: rotate(90deg); }
.psup-help {
  margin: 6px 0 2px; padding-top: 6px;
  border-top: 1px dashed var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.25));
  font-size: 12.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #646a73);
}
/* 按内容宽度（容器查询）收紧：侧栏固定后 1000–1199 视口内容宽约 656–856px，动作行改单列。 */
@container psup (max-width: 859px) { .psup-actions-grid { grid-template-columns: minmax(0, 1fr); } }

/* 使用说明（轻量，无重卡片）：与四个分区同级的标题 + 4 步 + 两行页脚 */
.psup-guide { padding: 0 2px; }
.psup-guide-title { margin: 0; }
.psup-guide-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.psup-step { padding: 10px 12px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2, #f7f8fa);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.05)); }
.psup-step-t { margin: 0 0 4px; font-size: 12.5px; font-weight: 600; }
.psup-step-d { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary, #646a73); }
@container psup (max-width: 859px) { .psup-guide-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container psup (max-width: 559px) { .psup-guide-steps { grid-template-columns: minmax(0, 1fr); } }
.psup-footer {
  display: flex; flex-direction: column; gap: 2px; padding: 0 2px;
  font-size: 11.5px; line-height: 1.55; color: var(--dsw-alias-label-secondary, #646a73);
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
.psup-btn-primary { color: var(--dsw-alias-bg-base, #fff); background: var(--dsw-alias-label-primary, #1f2329); box-shadow: none; font-weight: 600; }
.psup-btn-ghost { background: transparent; box-shadow: 0 0 0 1px transparent; color: var(--dsw-alias-label-secondary, #646a73); }
.psup-btn-ghost:hover { box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.12)); }
/* 复制失败兜底：可全选的文本域弹层（不再给「请手动选择文本」这种死路 toast） */
.psup-copy-fallback {
  position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: rgba(17, 20, 24, 0.28);
}
.psup-copy-fallback-card {
  width: min(560px, 100%); max-height: 80vh; overflow: auto;
  display: flex; flex-direction: column; gap: 10px;
  padding: 18px 20px; border-radius: 12px;
  background: var(--dsw-alias-bg-base, #fff);
  box-shadow: 0 12px 40px rgba(0,0,0,.24), 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.08));
}
.psup-copy-fallback-title { margin: 0; font-size: 15px; line-height: 1.35; font-weight: 600; }
.psup-copy-fallback-text {
  width: 100%; min-height: 140px; max-height: 40vh; resize: vertical; box-sizing: border-box;
  padding: 10px; border-radius: 8px; font: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; line-height: 1.5; color: inherit;
  background: var(--dsw-alias-bg-layer-2, #f7f8fa);
  border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.14));
}
.psup-copy-fallback-actions { display: flex; justify-content: flex-end; gap: 8px; }
.psup-toast {
  position: sticky; bottom: 12px; align-self: center; margin-top: -8px;
  font-size: 12px; padding: 8px 14px; border-radius: 999px;
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-bg-layer-3, #fff);
  box-shadow: 0 4px 18px rgba(0,0,0,.16), 0 0 0 1px var(--dsw-alias-border-l2, rgba(0,0,0,.08));
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

      // 路径保留末尾两级（项目名可见），中间省略。
      function shortenPath(value) {
        const raw = String(value == null ? '' : value);
        if (!raw) return raw;
        const parts = raw.replace(/[\\/]+$/, '').split(/[\\/]/);
        if (parts.length <= 2) return raw;
        return '…/' + parts.slice(-2).join('/');
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
          h('div', { className: 'psup-check-body' }, h('div', { className: 'psup-check-label' }, t('check_' + def.key))),
        );
      }

      const MODEL_TASK_TYPES = ['planning', 'implement', 'review', 'research', 'docs', 'verify'];
      const FALLBACK_MODEL_ROUTES = [
        { value: 'deepseek-official/deepseek-flash', label: 'deepseek-flash' },
        { value: 'deepseek-official/deepseek-v4-pro', label: 'deepseek-v4-pro' },
      ];
      const normalizeCollab = (value) => {
        const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const rawAssignments =
          raw.assignments && typeof raw.assignments === 'object' && !Array.isArray(raw.assignments)
            ? raw.assignments
            : {};
        const assignments = {};
        for (const task of MODEL_TASK_TYPES) {
          const route = rawAssignments[task];
          assignments[task] = typeof route === 'string' ? route : '';
        }
        const rawAutoRoutes =
          raw.autoRoutes && typeof raw.autoRoutes === 'object' && !Array.isArray(raw.autoRoutes)
            ? raw.autoRoutes
            : {};
        const autoRoutes = {};
        for (const task of MODEL_TASK_TYPES) {
          const route = rawAutoRoutes[task];
          autoRoutes[task] = typeof route === 'string' ? route : '';
        }
        return { enabled: raw.enabled === true, mode: raw.mode === 'manual' ? 'manual' : 'auto', assignments, autoRoutes };
      };

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
        // 自动复制失败时的兜底弹层文本（空串 = 不显示）。
        const [copyFallback, setCopyFallback] = useState('');
        const [modes, setModes] = useState({ beginnerGuard: true, promptPolish: true, requirementInterview: true, autoWork: false, economicalAutoWork: false, dispatchMode: 'efficiency', host: true, loaded: false });
        const [modelCollab, setModelCollab] = useState(() => normalizeCollab(null));
        const [modelRoutes, setModelRoutes] = useState(() => []);
        // 自动工作队列状态（只读）：GET host 路由拿排队/阻塞/待回答计数；失败不报错。
        const [autoQueue, setAutoQueue] = useState(() => ({ status: 'idle', exists: false, sections: null }));
        // 团队看板（只读 GET 路由；失败降级成静态提示，不影响其余面板）。
        const [board, setBoard] = useState(() => ({ status: 'idle', data: null }));
        const routeOptions = [{ value: '', labelKey: 'collabModelDefault' }].concat(
          modelRoutes.length > 0 ? modelRoutes : FALLBACK_MODEL_ROUTES,
        );

        // 工作开关清单每行「说明」的展开偏好：默认收起；用户选择存 localStorage，下次打开页面沿用。
        const COLLAPSE_FIELDS = ['beginnerGuard', 'autoWork', 'modelCollaboration', 'promptPolish', 'requirementInterview'];
        const readCollapsed = (field) => {
          try {
            // 默认收起：只有显式存过 '0'（用户展开过）才展开。
            return window.localStorage.getItem('psup.collapsed.' + field) !== '0';
          } catch (error) {
            return true;
          }
        };
        const [collapsed, setCollapsed] = useState(() => {
          const result = {};
          for (const field of COLLAPSE_FIELDS) result[field] = readCollapsed(field);
          return result;
        });
        const setCollapsedValue = (field, value) => {
          try {
            window.localStorage.setItem('psup.collapsed.' + field, value ? '1' : '0');
          } catch (error) {
            // 隐私模式等存储不可用时只影响记忆，不影响本次展开
          }
          setCollapsed((prev) => (prev[field] === value ? prev : { ...prev, [field]: value }));
        };
        const toggleCollapsed = (field) => setCollapsedValue(field, !collapsed[field]);

        // 分区级折叠：默认把只读/说明性分区收起来，状态存 localStorage（psup.zone.<zone>），
        // 与行级 psup.collapsed.<field> 互不影响。
        const ZONE_DEFAULTS = { 'work-modes': false, runtime: true, checks: true, actions: false, guide: true };
        const ZONE_KEYS = ['work-modes', 'runtime', 'checks', 'actions', 'guide'];
        const readZoneCollapsed = (key) => {
          try {
            const raw = window.localStorage.getItem('psup.zone.' + key);
            if (raw === '1') return true;
            if (raw === '0') return false;
          } catch (error) {
            // 存储不可用时回落到默认值
          }
          return !!ZONE_DEFAULTS[key];
        };
        const [zoneCollapsed, setZoneCollapsed] = useState(() => {
          const result = {};
          for (const key of ZONE_KEYS) result[key] = readZoneCollapsed(key);
          return result;
        });
        const toggleZone = (key) => {
          const next = !zoneCollapsed[key];
          try {
            window.localStorage.setItem('psup.zone.' + key, next ? '1' : '0');
          } catch (error) {
            // 隐私模式等存储不可用时只影响记忆，不影响本次展开
          }
          setZoneCollapsed((prev) => (prev[key] === next ? prev : { ...prev, [key]: next }));
        };
        const rowDisclosure = (field, title) =>
          h(
            'button',
            {
              type: 'button',
              className: 'psup-disclosure psup-row-disclosure',
              'aria-expanded': collapsed[field] ? 'false' : 'true',
              'aria-label': (collapsed[field] ? t('quickHelpShow') : t('quickHelpHide')) + '：' + title,
              title: collapsed[field] ? t('quickHelpShow') : t('quickHelpHide'),
              onClick: () => toggleCollapsed(field),
            },
            h('span', { className: 'psup-chevron', 'aria-hidden': 'true' }, '›'),
            h('span', null, collapsed[field] ? t('quickHelpShow') : t('quickHelpHide')),
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

        // 模型协作行：开启时自动展开设置，关闭时收起（用户仍可手动展开看说明）。
        useEffect(() => {
          setCollapsedValue('modelCollaboration', !modelCollab.enabled);
        }, [modelCollab.enabled]);

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
        const copy = async (text, doneKey) => {
          try {
            await copyText(text);
            showToast(doneKey);
          } catch (err) {
            // 自动复制被拒是浏览器常见限制：弹一个可全选的文本域兜底，不再提示「请手动选择文本复制」。
            setCopyFallback(String(text == null ? '' : text));
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
            const readLocalCollab = () => {
              try {
                return JSON.parse(readLocal('modelCollaboration') || 'null');
              } catch (error) {
                return null;
              }
            };
            if (server) {
              setModes({
                beginnerGuard: server.beginnerGuard !== false,
                promptPolish: server.promptPolish !== false,
                requirementInterview: server.requirementInterview !== false,
                // 服务端 undefined/older host -> false: auto work defaults OFF.
                autoWork: server.autoWork === true,
                economicalAutoWork: server.economicalAutoWork === true,
                dispatchMode: server.dispatchMode === 'strict' ? 'strict' : 'efficiency',
                host: true,
                loaded: true,
              });
              setModelCollab(
                normalizeCollab(
                  server.modelCollaboration !== undefined ? server.modelCollaboration : readLocalCollab(),
                ),
              );
              return;
            }
            setModelCollab(normalizeCollab(readLocalCollab()));
            setModes({
              beginnerGuard: readLocal('beginnerGuard') !== 'false',
              promptPolish: readLocal('promptPolish') !== 'false',
              requirementInterview: readLocal('requirementInterview') !== 'false',
              autoWork: readLocal('autoWork') === 'true',
              economicalAutoWork: readLocal('economicalAutoWork') === 'true',
              dispatchMode: readLocal('dispatchMode') === 'strict' ? 'strict' : 'efficiency',
              host: false,
              loaded: true,
            });
          })();
          return () => {
            alive = false;
          };
        }, [cwd]);

        // Load the live model routes from the host half (falls back to the
        // built-in route list when the host is older / not restarted yet).
        useEffect(() => {
          let alive = true;
          (async () => {
            try {
              const response = await fetch('/plugins/dsh-project-supervisor/models', { credentials: 'include' });
              const contentType = response.headers.get('content-type') || '';
              if (!response.ok || !contentType.includes('application/json')) return;
              const data = await response.json();
              if (!alive || !data || !data.ok || !Array.isArray(data.routes)) return;
              const routes = data.routes
                .filter((route) => route && typeof route.provider === 'string' && typeof route.model === 'string')
                .map((route) => ({ value: route.provider + '/' + route.model, label: route.name || route.model }));
              if (routes.length > 0) setModelRoutes(routes);
            } catch (error) {
              // keep the static fallback
            }
          })();
          return () => {
            alive = false;
          };
        }, []);

        // Read the auto-work queue counts from the host half (read-only route).
        // A younger/missing host half or a page without the route degrades to a
        // static hint; it must never throw or block the rest of the panel.
        useEffect(() => {
          if (!cwd) {
            setAutoQueue({ status: 'idle', exists: false, sections: null });
            return undefined;
          }
          let alive = true;
          setAutoQueue((prev) => ({ ...prev, status: 'loading' }));
          (async () => {
            let data = null;
            try {
              const response = await fetch(
                '/plugins/dsh-project-supervisor/auto-work?cwd=' + encodeURIComponent(cwd),
                { credentials: 'include' },
              );
              const contentType = response.headers.get('content-type') || '';
              if (response.ok && contentType.includes('application/json')) {
                const parsed = await response.json();
                if (parsed && parsed.ok) data = parsed;
              }
            } catch (error) {
              data = null;
            }
            if (!alive) return;
            if (!data) {
              setAutoQueue({ status: 'unavailable', exists: false, sections: null });
              return;
            }
            setAutoQueue({ status: 'ready', exists: data.exists === true, sections: data.sections || null });
          })();
          return () => {
            alive = false;
          };
        }, [cwd]);

        // Load the read-only team board for the selected project/session. The
        // route degrades to JSON, so a younger host half (404) or a missing
        // session log simply shows a static hint.
        const activeSessionId = project ? project.sessionId : '';
        useEffect(() => {
          if (!cwd) {
            setBoard({ status: 'idle', data: null });
            return undefined;
          }
          let alive = true;
          const query =
            '?cwd=' + encodeURIComponent(cwd) + (activeSessionId ? '&session=' + encodeURIComponent(activeSessionId) : '');
          const loadRoute = async (route, setter) => {
            setter((prev) => ({ ...prev, status: 'loading' }));
            let data = null;
            try {
              const response = await fetch('/plugins/dsh-project-supervisor/' + route + query, { credentials: 'include' });
              const contentType = response.headers.get('content-type') || '';
              if (response.ok && contentType.includes('application/json')) {
                const parsed = await response.json();
                if (parsed && parsed.ok) data = parsed;
              }
            } catch (error) {
              data = null;
            }
            if (!alive) return;
            setter({ status: data ? 'ready' : 'unavailable', data });
          };
          loadRoute('team-board', setBoard);
          return () => {
            alive = false;
          };
        }, [cwd, activeSessionId, reloadToken]);

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

        const toggleAutoWork = async () => {
          if (!cwd) return;
          const next = !modes.autoWork;
          setModes({ ...modes, autoWork: next });
          let saved = false;
          try {
            const response = await fetch('/plugins/dsh-project-supervisor/config', {
              method: 'POST',
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ cwd, autoWork: next }),
            });
            const contentType = response.headers.get('content-type') || '';
            if (response.ok && contentType.includes('application/json')) {
              const data = await response.json();
              saved = Boolean(data && data.ok && data.autoWork === next);
            }
          } catch (error) {
            saved = false;
          }
          if (!saved) {
            // Host half not reloaded / offline: remember the choice in the
            // browser under psup.autoWork:<cwd> and mark the host as pending.
            try {
              window.localStorage.setItem('psup.autoWork:' + cwd, next ? 'true' : 'false');
            } catch (error) {
              // ignore private-mode storage failures
            }
            setModes({ ...modes, autoWork: next, host: false });
          }
          showToast(saved ? 'autoWorkSaved' : 'autoWorkLocalSaved');
        };

        // 次级开关：仅在「自动工作」开启时可切换；关闭自动工作时仅置灰、保留已存值。
        const toggleEconomicalAutoWork = async () => {
          if (!cwd || !modes.autoWork) return;
          const next = !modes.economicalAutoWork;
          setModes({ ...modes, economicalAutoWork: next });
          let saved = false;
          try {
            const response = await fetch('/plugins/dsh-project-supervisor/config', {
              method: 'POST',
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ cwd, economicalAutoWork: next }),
            });
            const contentType = response.headers.get('content-type') || '';
            if (response.ok && contentType.includes('application/json')) {
              const data = await response.json();
              saved = Boolean(data && data.ok && data.economicalAutoWork === next);
            }
          } catch (error) {
            saved = false;
          }
          if (!saved) {
            try {
              window.localStorage.setItem('psup.economicalAutoWork:' + cwd, next ? 'true' : 'false');
            } catch (error) {
              // ignore private-mode storage failures
            }
            setModes({ ...modes, economicalAutoWork: next, host: false });
          }
          showToast(saved ? 'ecoAutoWorkSaved' : 'ecoAutoWorkLocalSaved');
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

        const saveModelCollab = async (patch) => {
          if (!cwd) return;
          const next = normalizeCollab({
            ...modelCollab,
            ...patch,
            assignments: { ...modelCollab.assignments, ...(patch.assignments || {}) },
            autoRoutes: { ...modelCollab.autoRoutes, ...(patch.autoRoutes || {}) },
          });
          setModelCollab(next);
          let saved = false;
          try {
            const response = await fetch('/plugins/dsh-project-supervisor/config', {
              method: 'POST',
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ cwd, modelCollaboration: patch }),
            });
            const contentType = response.headers.get('content-type') || '';
            if (response.ok && contentType.includes('application/json')) {
              const data = await response.json();
              if (data && data.ok && data.modelCollaboration) {
                setModelCollab(normalizeCollab(data.modelCollaboration));
                saved = true;
              }
            }
          } catch (error) {
            saved = false;
          }
          if (!saved) {
            try {
              window.localStorage.setItem('psup.modelCollaboration:' + cwd, JSON.stringify(next));
            } catch (error) {
              // ignore private-mode storage failures
            }
            showToast('collabLocalSaved');
          } else {
            showToast('collabSaved');
          }
        };

        // 团队快照文本（「复制团队状态快照」用）：字段标签保持中英通用的简短英文。
        const buildTeamSnapshotText = () => {
          const lines = ['Team snapshot (read-only, from the supervisor panel)'];
          lines.push('cwd: ' + (cwd || t('noCwd')));
          lines.push('at: ' + new Date().toISOString());
          if (!board || board.status !== 'ready' || !board.data) {
            lines.push('team board: ' + t('teamDegraded'));
            return lines.join('\n');
          }
          const data = board.data;
          const members = (data.members || []).map((member) => member.name + ' (' + member.phase + ')');
          lines.push('members(' + members.length + '): ' + (members.length ? members.join(', ') : '-'));
          const tasks = data.tasks || [];
          lines.push('tasks(' + tasks.length + '):');
          if (tasks.length === 0) lines.push('  - (none)');
          for (const task of tasks.slice(0, 20)) {
            lines.push(
              '  - #' + task.id + ' [' + task.status + '] ' + task.subject +
                ' | owner=' + (task.ownerName || 'lead') +
                ' | scopes=' + (task.writeScopes || []).length +
                ' | blockedBy=' + ((task.blockedBy || []).join(',') || '-'),
            );
          }
          const messages = data.messages || { pending: 0, items: [] };
          lines.push('pending messages(' + (messages.pending || 0) + '):');
          for (const item of (messages.items || []).slice(0, 20)) {
            lines.push('  - ' + item.senderName + ': ' + item.preview);
          }
          return lines.join('\n');
        };
        const taskStatusKey = (status) =>
          status === 'in_progress'
            ? 'teamStatusInProgress'
            : status === 'completed'
              ? 'teamStatusCompleted'
              : status === 'pending'
                ? 'teamStatusPending'
                : 'teamStatusOther';
        const phaseKey = (phase) =>
          phase === 'provisioning' ? 'teamPhaseProvisioning' : phase === 'failed' ? 'teamPhaseFailed' : 'teamPhaseActive';

        // Safe queue counters: unknown/malformed host payloads render as 0.
        const autoSectionCount = (sectionKey) => {
          const section = autoQueue && autoQueue.sections ? autoQueue.sections[sectionKey] : null;
          const value = section && Number.isFinite(Number(section.count)) ? Number(section.count) : 0;
          return value < 0 ? 0 : Math.floor(value);
        };

        // ---- 布局辅助：分区 / 开关清单行 / 动作行，保持结构与交互契约不变 ----
        const switchButton = (field, enabled, ariaKey, onClick, hintKey, onKey, offKey) =>
          h(
            'button',
            {
              type: 'button',
              role: 'switch',
              'data-field': field,
              'aria-checked': enabled ? 'true' : 'false',
              'aria-label': t(ariaKey),
              title: hintKey ? t(hintKey) : undefined,
              className: 'psup-switch' + (enabled ? ' is-on' : ''),
              onClick,
            },
            h('span', { className: 'psup-switch-track' }, h('span', { className: 'psup-switch-knob' })),
            h('span', { className: 'psup-switch-label' }, enabled ? t(onKey || 'guardOn') : t(offKey || 'guardOff')),
          );

        // 分区：标题行右侧 chevron 折叠整区；收起时标题行显示一行摘要，展开时显示分区 hint。
        const zone = (key, titleKey, hintKey, body, options) => {
          const opts = options || {};
          const toggleable = opts.toggleable === true;
          const collapsedZone = toggleable && zoneCollapsed[key] === true;
          const title = t(titleKey);
          const bodyId = 'psup-zone-body-' + key;
          const sectionProps = { className: 'psup-zone' + (collapsedZone ? ' is-collapsed' : '') };
          if (opts.dataZone !== false) sectionProps['data-zone'] = key;
          if (opts.extraClass) sectionProps.className += ' ' + opts.extraClass;
          return h(
            'section',
            sectionProps,
            h(
              'div',
              {
                className: 'psup-zone-head' + (toggleable ? ' is-toggleable' : ''),
                onClick: toggleable ? () => toggleZone(key) : undefined,
              },
              h('h2', { className: 'psup-zone-title' }, title),
              collapsedZone
                ? h('span', { className: 'psup-zone-summary' }, opts.summary || '')
                : hintKey
                  ? h('p', { className: 'psup-zone-hint' }, t(hintKey))
                  : null,
              toggleable
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'psup-zone-toggle',
                      'aria-expanded': collapsedZone ? 'false' : 'true',
                      'aria-controls': bodyId,
                      'aria-label': (collapsedZone ? t('zoneExpand') : t('zoneCollapse')) + '：' + title,
                      title: collapsedZone ? t('zoneExpand') : t('zoneCollapse'),
                      onClick: (event) => {
                        event.stopPropagation();
                        toggleZone(key);
                      },
                    },
                    h('span', { className: 'psup-chevron', 'aria-hidden': 'true' }, '›'),
                  )
                : null,
            ),
            h('div', { className: 'psup-zone-body', id: bodyId, hidden: collapsedZone || undefined }, body),
          );
        };

        const panelCard = (className, children) =>
          h('section', { className: 'psup-card' + (className ? ' ' + className : '') }, children);

        // 5 行工作开关：左侧名称 + 单行 hint，右侧开关 + 行尾「说明」展开该行完整指引。
        const switchBoardRow = (field, options) => {
          const expanded = !collapsed[field];
          return h(
            'div',
            { className: 'psup-switch-row' + (expanded ? ' is-open' : ''), 'data-field': field },
            h(
              'div',
              { className: 'psup-switch-row-main' },
              h(
                'div',
                { className: 'psup-switch-row-text' },
                h('p', { className: 'psup-switch-row-name' }, t(options.nameKey)),
                h('p', { className: 'psup-switch-row-hint', title: t(options.hintKey) }, t(options.shortKey)),
              ),
              h(
                'div',
                { className: 'psup-switch-row-controls' },
                switchButton(field, options.enabled, options.ariaKey, options.onToggle, options.hintKey, options.onKey, options.offKey),
                rowDisclosure(field, t(options.nameKey)),
              ),
            ),
            options.extra ? h('div', { className: 'psup-row-extra' }, options.extra) : null,
            expanded
              ? h('div', { className: 'psup-row-body psup-card-body', id: 'psup-row-body-' + field }, options.body())
              : null,
          );
        };

        const listBody = (hintKey, enabled, count, itemPrefix, offKey) => [
          h('p', { className: 'psup-muted' }, t(hintKey)),
          enabled
            ? h(
                'ul',
                { className: 'psup-list' },
                Array.from({ length: count }, (unused, index) => index + 1).map((index) =>
                  h('li', { key: index }, h('span', { className: 'psup-list-num' }, String(index)), h('span', null, t(itemPrefix + index))),
                ),
              )
            : h('p', { className: 'psup-guard-off' }, t(offKey)),
        ];

        // 自动工作行：缩进次级开关「更经济的自动化」（主开关关闭时置灰但保留值），
        // 开启后只读展示排队/阻塞/待回答计数（放在可折叠说明之外，收起也可见）。
        const autoWorkExtra = () => {
          const ecoToggleable = modes.autoWork === true;
          const ecoRow = h(
            'div',
            {
              key: 'eco',
              className: 'psup-switch-subrow' + (ecoToggleable ? '' : ' is-disabled'),
              'data-subfield': 'economicalAutoWork',
            },
            h(
              'div',
              { className: 'psup-switch-subrow-text' },
              h('p', { className: 'psup-switch-subrow-name' }, t('ecoAutoWorkTitle')),
              h(
                'p',
                { className: 'psup-switch-subrow-hint', title: t('ecoAutoWorkHint') },
                ecoToggleable ? t('ecoAutoWorkShort') : t('ecoAutoWorkNeedsAutoWork'),
              ),
            ),
            h(
              'button',
              {
                type: 'button',
                role: 'switch',
                className: 'psup-switch psup-switch-small' + (modes.economicalAutoWork ? ' is-on' : ''),
                'data-field': 'economicalAutoWork',
                'aria-checked': modes.economicalAutoWork ? 'true' : 'false',
                'aria-label': t('ecoAutoWorkAria'),
                title: t('ecoAutoWorkHint'),
                disabled: !ecoToggleable,
                onClick: toggleEconomicalAutoWork,
              },
              h('span', { className: 'psup-switch-track' }, h('span', { className: 'psup-switch-knob' })),
            ),
          );
          if (!modes.autoWork) return [ecoRow];
          if (autoQueue.status === 'unavailable') {
            return [ecoRow, h('div', { key: 'warn', className: 'psup-warn' }, t('autoWorkUnavailable'))];
          }
          if (autoQueue.status !== 'ready') return [ecoRow];
          return [
            ecoRow,
            h(
              'div',
              { key: 'status', className: 'psup-autowork-status' },
              [
                ['queue', 'autoWorkQueue'],
                ['blocked', 'autoWorkBlocked'],
                ['questions', 'autoWorkQuestions'],
              ].map((pair) =>
                h('span', { key: pair[0], className: 'psup-autowork-count' }, t(pair[1]) + ' ' + autoSectionCount(pair[0])),
              ),
              h('span', { className: 'psup-autowork-file' }, t('autoWorkFileHint')),
            ),
            autoQueue.exists === false
              ? h('p', { key: 'empty', className: 'psup-guard-off' }, t('autoWorkQueueEmpty'))
              : null,
          ];
        };

        const modelRouteRows = (mode) => {
          const enabled = modelCollab.enabled && modelCollab.mode === mode;
          if (!enabled) return null;
          const source = mode === 'manual' ? modelCollab.assignments : modelCollab.autoRoutes;
          return h(
            'div',
            { className: 'psup-model-table', 'aria-label': t(mode === 'manual' ? 'collabAssignAria' : 'collabAutoRoutesAria') },
            [
              { key: 'planning', labelKey: 'collabTaskPlanning' },
              { key: 'implement', labelKey: 'collabTaskImplement' },
              { key: 'review', labelKey: 'collabTaskReview' },
              { key: 'research', labelKey: 'collabTaskResearch' },
              { key: 'docs', labelKey: 'collabTaskDocs' },
              { key: 'verify', labelKey: 'collabTaskVerify' },
            ].map((row) =>
              h(
                'label',
                { key: row.key, className: 'psup-model-row' },
                h('span', { className: 'psup-model-label' }, t(row.labelKey)),
                h(
                  'select',
                  {
                    value: source[row.key] || '',
                    onChange: (event) =>
                      saveModelCollab(
                        mode === 'manual'
                          ? { assignments: { [row.key]: event.target.value } }
                          : { autoRoutes: { [row.key]: event.target.value } },
                      ),
                  },
                  routeOptions.map((route) =>
                    h('option', { key: route.value || 'default', value: route.value }, route.label || t(route.labelKey || 'collabAutoDefault')),
                  ),
                ),
              ),
            ),
          );
        };

        const collabBody = () => [
          h('p', { className: 'psup-muted' }, t('collabHint')),
          modelCollab.enabled
            ? h(
                'div',
                { className: 'psup-mode-row', role: 'radiogroup', 'aria-label': t('collabModeAria') },
                [
                  { value: 'auto', nameKey: 'collabAuto', descKey: 'collabAutoDesc' },
                  { value: 'manual', nameKey: 'collabManual', descKey: 'collabManualDesc' },
                ].map((option) =>
                  h(
                    'button',
                    {
                      key: option.value,
                      type: 'button',
                      role: 'radio',
                      'aria-checked': modelCollab.mode === option.value ? 'true' : 'false',
                      className: 'psup-collab-option' + (modelCollab.mode === option.value ? ' is-active' : ''),
                      onClick: () => saveModelCollab({ mode: option.value }),
                    },
                    h('span', { className: 'psup-mode-name' }, t(option.nameKey)),
                    h('span', { className: 'psup-mode-desc' }, t(option.descKey)),
                  ),
                ),
              )
            : null,
          modelRouteRows('auto'),
          modelCollab.enabled && modelCollab.mode === 'auto'
            ? h('p', { className: 'psup-muted psup-model-note' }, t('collabAutoRoutesHint'))
            : null,
          modelRouteRows('manual'),
          modelCollab.enabled && modelCollab.mode === 'manual'
            ? h('p', { className: 'psup-muted psup-model-note' }, t('collabRouteHint'))
            : null,
          h('p', { className: 'psup-muted psup-collab-note' }, t('collabNote')),
        ];

        // 规则自检：缺失项的建议统一移到网格下方，网格只保留状态点 + 名称。
        const missingChecks = CHECK_DEFS.filter((def) => {
          const row = checks.checks.find((item) => item.key === def.key);
          return !(row && row.ok);
        });
        const suggestions =
          checks.status === 'ready' && missingChecks.length > 0
            ? h(
                'div',
                { className: 'psup-check-suggestions' },
                h('p', { className: 'psup-check-suggestions-title' }, t('suggestion')),
                missingChecks.map((def) =>
                  h(
                    'p',
                    { key: def.key, className: 'psup-check-suggestion' },
                    h('strong', null, t('check_' + def.key) + '：'),
                    t(def.hint),
                  ),
                ),
              )
            : null;

        const actionItems = [
          {
            id: 'kickoff',
            label: t('copyKickoff'),
            primary: true,
            onClick: () => copy(fillCopy(t('kickoff'), cwd || t('noCwd')), 'copyKickoffDone'),
            help: t('quickKickoffWhy'),
          },
          {
            id: 'bootstrap',
            label: t('copyBootstrap'),
            onClick: () => copy(t('bootstrap'), 'copyBootstrapDone'),
            help: t('quickBootstrapWhy'),
          },
          {
            id: 'install',
            label: t('copyInstall'),
            onClick: () => copy(fillCopy(t('installCmd'), cwd || t('noCwd')), 'copyInstallDone'),
            help: t('quickInstallWhy'),
          },
          {
            id: 'handoff',
            label: t('copyHandoff'),
            onClick: () => copy(fillCopy(t('handoffTemplate'), cwd || t('noCwd')), 'copyHandoffDone'),
            help: t('quickHandoffWhy'),
          },
          {
            id: 'teamSnapshot',
            label: t('copyTeamSnapshot'),
            onClick: () => copy(buildTeamSnapshotText(), 'copyTeamSnapshotDone'),
            help: t('quickTeamSnapshotWhy'),
          },
          {
            id: 'doctor',
            label: t('copyDoctor'),
            onClick: () => copy(fillCopy(t('doctorCmd'), cwd || t('noCwd')), 'copyDoctorDone'),
            help: t('quickDoctorWhy'),
          },
          {
            id: 'verify',
            label: t('copyVerify'),
            onClick: () => copy(fillCopy(t('verifyCmd'), cwd || t('noCwd')), 'copyVerifyDone'),
            help: t('quickVerifyWhy'),
          },
        ];

        // 分区级折叠摘要：收起时标题行右侧显示一行概览。
        const boardReady = board.status === 'ready';
        const boardMembers = boardReady ? (board.data.members || []).length : 0;
        const boardTasks = boardReady ? (board.data.tasks || []).length : 0;
        const boardPending = boardReady ? ((board.data.messages && board.data.messages.pending) || 0) : 0;
        const fillTemplate = (template, values) =>
          String(template).replace(/\{(\w+)\}/g, (match, name) =>
            values && values[name] != null ? String(values[name]) : match,
          );
        const workZoneSummary = t('zoneWorkSummary');
        const runtimeZoneSummary = boardReady
          ? fillTemplate(t('zoneRuntimeSummary'), { members: boardMembers, tasks: boardTasks, pending: boardPending })
          : t('zoneRuntimeDegraded');
        const checksZoneSummary = fillTemplate(t('zoneChecksSummary'), { ready: okCount });
        const actionsZoneSummary = t('zoneActionsSummary');
        const guideZoneSummary = t('zoneGuideSummary');

        return h(
          'div',
          { className: 'psup-page' },
          h(
            'div',
            { className: 'psup-inner' },
            // header：logo / 标题+副标题 / 版本徽标
            h(
              'header',
              { className: 'psup-head' },
              h('div', { className: 'psup-logo' }, h(SupervisorIcon, { size: 21 })),
              h(
                'div',
                { className: 'psup-heading' },
                h('h1', { className: 'psup-title' }, t('title')),
                h('p', { className: 'psup-subtitle' }, t('subtitle')),
              ),
              h('span', { className: 'psup-version' }, t('versionTag')),
            ),

            // 顶部 slim 当前项目条：chips 切换 + 统一刷新 + 路径（保留末尾项目名，中间省略）
            h(
              'section',
              { className: 'psup-project-bar', role: 'group', 'aria-label': t('projectTitle') },
              h('span', { className: 'psup-project-label' }, t('currentProject')),
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
              h(
                'div',
                { className: 'psup-project-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'psup-btn psup-btn-ghost',
                    disabled: loading,
                    title: loading ? t('refreshing') : t('refresh'),
                    'aria-label': loading ? t('refreshing') : t('refresh'),
                    onClick: () => setReloadToken((value) => value + 1),
                  },
                  loading ? t('refreshing') : t('refresh'),
                ),
                project ? h('span', { className: 'psup-path', title: project.cwd }, shortenPath(project.cwd)) : null,
              ),
            ),

            // ── 工作方式：主管工作模式（全宽）+ 工作开关清单（全宽）──────────
            zone(
              'work-modes',
              'zoneWorkTitle',
              'zoneWorkHint',
              h(
                'div',
                { className: 'psup-work-stack' },
                // 主管工作模式：只影响之后的任务，进行中的任务不中断。
                panelCard('psup-mode-card', [
                  h('div', { className: 'psup-card-head' }, h('h2', { className: 'psup-card-title' }, t('modeCardTitle'))),
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
                ]),
                // 工作开关清单：5 行开关，说明默认收起，模型协作开启时自动展开设置。
                panelCard('psup-switch-board-card', [
                  h('div', { className: 'psup-card-head' }, h('h2', { className: 'psup-card-title' }, t('switchBoardTitle'))),
                  h('p', { className: 'psup-muted' }, t('switchBoardHint')),
                  h(
                    'div',
                    { className: 'psup-switch-rows' },
                    [
                      switchBoardRow('beginnerGuard', {
                        nameKey: 'beginnerTitle',
                        hintKey: 'beginnerHint',
                        shortKey: 'beginnerShort',
                        enabled: modes.beginnerGuard,
                        ariaKey: 'guardAria',
                        onToggle: () => toggleMode('beginnerGuard'),
                        body: () => listBody('beginnerHint', modes.beginnerGuard, 6, 'beginner', 'guardOffNote'),
                      }),
                      switchBoardRow('autoWork', {
                        nameKey: 'autoWorkTitle',
                        hintKey: 'autoWorkHint',
                        shortKey: 'autoWorkShort',
                        enabled: modes.autoWork,
                        ariaKey: 'autoWorkAria',
                        onToggle: toggleAutoWork,
                        onKey: 'autoWorkOn',
                        offKey: 'autoWorkOff',
                        extra: autoWorkExtra(),
                        body: () => [
                          h('p', { key: 'hint', className: 'psup-muted' }, t('autoWorkHint')),
                          h('p', { key: 'eco', className: 'psup-muted' }, t('ecoAutoWorkHint')),
                          modes.host === false
                            ? h('p', { key: 'host', className: 'psup-guard-off' }, t('autoWorkHostPending'))
                            : null,
                        ],
                      }),
                      switchBoardRow('modelCollaboration', {
                        nameKey: 'collabTitle',
                        hintKey: 'collabHint',
                        shortKey: 'collabShort',
                        enabled: modelCollab.enabled,
                        ariaKey: 'collabAria',
                        onToggle: () => saveModelCollab({ enabled: !modelCollab.enabled }),
                        onKey: 'collabOn',
                        offKey: 'collabOff',
                        body: collabBody,
                      }),
                      switchBoardRow('promptPolish', {
                        nameKey: 'polishTitle',
                        hintKey: 'polishHint',
                        shortKey: 'polishShort',
                        enabled: modes.promptPolish,
                        ariaKey: 'polishAria',
                        onToggle: () => toggleMode('promptPolish'),
                        body: () => listBody('polishHint', modes.promptPolish, 4, 'polish', 'polishOffNote'),
                      }),
                      switchBoardRow('requirementInterview', {
                        nameKey: 'interviewTitle',
                        hintKey: 'interviewHint',
                        shortKey: 'interviewShort',
                        enabled: modes.requirementInterview,
                        ariaKey: 'interviewAria',
                        onToggle: () => toggleMode('requirementInterview'),
                        body: () => listBody('interviewHint', modes.requirementInterview, 4, 'interview', 'interviewOffNote'),
                      }),
                    ],
                  ),
                ]),
              ),
              { toggleable: true, summary: workZoneSummary },
            ),

            // ── 运行状态：团队与任务看板（全宽，只读；数据随顶部统一「刷新」按钮更新）──
            zone(
              'runtime',
              'zoneRuntimeTitle',
              'zoneRuntimeHint',
              panelCard('psup-team-card', [
                h('div', { className: 'psup-card-head' }, h('h2', { className: 'psup-card-title' }, t('teamCardTitle'))),
                h('p', { className: 'psup-muted' }, t('teamCardHint')),
                board.status !== 'ready'
                  ? h('div', { className: 'psup-guard-off' }, t('teamDegraded'))
                  : [
                      h(
                        'div',
                        { key: 'stats', className: 'psup-counts' },
                        h('span', { className: 'psup-count' }, t('teamMembers') + ' ' + String((board.data.members || []).length)),
                        h('span', { className: 'psup-count' }, t('teamTasks') + ' ' + String((board.data.tasks || []).length)),
                        h('span', { className: 'psup-count' }, t('teamPending') + ' ' + String((board.data.messages && board.data.messages.pending) || 0)),
                      ),
                      (board.data.members || []).length > 0
                        ? h(
                            'div',
                            { key: 'members', className: 'psup-chips' },
                            board.data.members.slice(0, 12).map((member) =>
                              h(
                                'span',
                                { key: member.id, className: 'psup-chip', title: member.description || '' },
                                member.name + ' · ' + t(phaseKey(member.phase)),
                              ),
                            ),
                          )
                        : null,
                      (board.data.tasks || []).length > 0
                        ? h(
                            'div',
                            { key: 'tasks', className: 'psup-model-table' },
                            board.data.tasks.slice(0, 20).map((task) =>
                              h(
                                'div',
                                { key: task.id, className: 'psup-team-row' },
                                h('span', { className: 'psup-badge is-' + String(task.status || 'other') }, t(taskStatusKey(task.status))),
                                h('span', { className: 'psup-team-subject' }, '#' + task.id + ' ' + task.subject),
                                h(
                                  'span',
                                  { className: 'psup-team-meta' },
                                  (task.ownerName || t('teamLead')) +
                                    ' · ' +
                                    t('teamScopes') +
                                    ' ' +
                                    String((task.writeScopes || []).length),
                                ),
                              ),
                            ),
                          )
                        : null,
                      (board.data.members || []).length === 0 && (board.data.tasks || []).length === 0
                        ? h('p', { key: 'empty', className: 'psup-empty' }, t('teamEmpty'))
                        : null,
                      (board.data.messages && board.data.messages.items || []).length > 0
                        ? h(
                            'div',
                            { key: 'pending', className: 'psup-model-table' },
                            board.data.messages.items.slice(0, 10).map((item) =>
                              h(
                                'div',
                                { key: item.id, className: 'psup-team-row' },
                                h('span', { className: 'psup-badge' }, t('teamPending')),
                                h('span', { className: 'psup-team-subject' }, item.senderName + ': ' + item.preview),
                              ),
                            ),
                          )
                        : null,
                    ],
              ]),
              { toggleable: true, summary: runtimeZoneSummary },
            ),

            // ── 规则自检：分数 + 进度条 + 9 项两列，缺失建议统一放网格下方 ─────
            zone(
              'checks',
              'zoneChecksTitle',
              'healthHint',
              panelCard('psup-check-card', [
                h('div', { className: 'psup-card-head' }, h('h2', { className: 'psup-card-title' }, t('healthTitle'))),
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
                      checks.status === 'ready'
                        ? h(
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
                          )
                        : h(
                            'p',
                            { className: 'psup-empty', key: 'state' },
                            checks.status === 'error' ? t('healthError') + checks.error : loading ? t('healthLoading') : '',
                          ),
                      checks.status === 'ready' ? suggestions : null,
                    ],
              ]),
              { toggleable: true, summary: checksZoneSummary },
            ),

            // ── 快捷动作：主动作突出（宽度随内容）+ 其余 6 个两列紧凑行 ──────
            zone(
              'actions',
              'actionsTitle',
              'actionsHint',
              h(
                'div',
                { className: 'psup-actions-grid' },
                actionItems.map((action) => {
                  const open = openHelp === action.id;
                  return h(
                    'div',
                    {
                      key: action.id,
                      className:
                        'psup-action-item' + (action.primary ? ' psup-action-primary' : '') + (open ? ' is-open' : ''),
                    },
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
              { toggleable: true, summary: actionsZoneSummary },
            ),

            // ── 使用说明（轻量）：与四个分区同级、可折叠；4 步紧凑 + 两行页脚 ──
            zone(
              'guide',
              'flowTitle',
              null,
              [
                h(
                  'div',
                  { key: 'steps', className: 'psup-guide-steps' },
                  [1, 2, 3, 4].map((index) =>
                    h(
                      'div',
                      { key: index, className: 'psup-step' },
                      h('p', { className: 'psup-step-t' }, t('flow' + index + 'T')),
                      h('p', { className: 'psup-step-d' }, t('flow' + index + 'D')),
                    ),
                  ),
                ),
                h(
                  'footer',
                  { key: 'footer', className: 'psup-footer' },
                  h('span', null, t('footerRules')),
                  h('span', null, t('footerReadonly')),
                ),
              ],
              { toggleable: true, dataZone: false, extraClass: 'psup-guide', summary: guideZoneSummary },
            ),

            // 复制兜底弹层：浏览器拒绝自动复制时显示可全选文本域
            copyFallback
              ? h(
                  'div',
                  { className: 'psup-copy-fallback' },
                  h(
                    'div',
                    { className: 'psup-copy-fallback-card', role: 'dialog', 'aria-label': t('copyFallbackTitle') },
                    h('h2', { className: 'psup-copy-fallback-title' }, t('copyFallbackTitle')),
                    h('p', { className: 'psup-muted' }, t('copyFallbackHint')),
                    h('textarea', {
                      className: 'psup-copy-fallback-text',
                      readOnly: true,
                      autoFocus: true,
                      value: copyFallback,
                      onFocus: (event) => event.target.select(),
                      onMouseDown: (event) => {
                        event.preventDefault();
                        event.target.select();
                      },
                    }),
                    h(
                      'div',
                      { className: 'psup-copy-fallback-actions' },
                      h(
                        'button',
                        { type: 'button', className: 'psup-btn psup-btn-primary', onClick: () => setCopyFallback('') },
                        t('copyFallbackClose'),
                      ),
                    ),
                  ),
                )
              : null,

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
