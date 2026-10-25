# 更新记录

格式：`## [版本] 日期` + 变更分类。版本号与 `setup/VERSION` 保持一致。

## [1.8.3] 2026-10-25

### 配置生效语义修补（切换选项的生效范围）

- 背景：此前 AGENTS/SKILL 只写「开工前读」配置，用户中途切换开关/工作模式后，同一会话的后续任务是否生效存在歧义；面板承诺「只影响之后的任务」但规则没写重读时机。
- 修补：`AGENTS.md` 派发模式新增「**重读**：每个新任务/每次派发前重读配置；切换只影响之后的新任务，进行中的任务保持开工选择；开工选项记入 `DECISIONS.md`」；`SKILL.md` 同步；《主管手册》「已知限制」补「切换选项的生效范围」。
- 语义定稿：① 后续新任务用切换后值；② 进行中的任务不中途改；③ 开工选项留档可审计；④ 配置仍是工作区级共享（不同工作区互不影响）。
- 回归：selftest 18/18、verify-facts 离线 9/9、sync 一致；插件不变（0.5.1），套件 1.8.3。

## [1.8.2] 2026-10-25

### 协作纪律补充（子智能体“超时”语义）

- `AGENTS.md`「并行纪律」新增两条：① `wait_agent` 超时（`timedOut:true`）只是观察窗口到期、不是失败；超时后重新 `list` 继续，不重发消息、不重复派发。② 预计 >8 分钟的任务拆成 2–3 个可独立验收阶段，或先落盘中间产物再跑长测试。
- `.dsh/skills/project-supervisor/SKILL.md`「工作流硬化 · 并行派发纪律」同步两句；《主管手册》「已知限制」补「超时是等待窗口」一行。
- 背景：DSH 无子智能体墙钟超时配置，也没有 `timeout` 成员状态；观察到的是等待窗口到期 + 长任务耗时（10–15 分钟）。此为流程硬化，不是缺陷修复。
- 回归：selftest 18/18、verify-facts 离线 9/9、sync 一致；插件版本不变（0.5.1），套件 1.8.2。

## [1.8.1] 2026-10-25

### 安装器审查修复（第三方静态审查）

- **kit 安装器**（`install-supervisor.sh` / `.mjs`）：`--dry-run` 改为真正的零写入（只预检 + 输出计划）；`--force` 优先且按模板首行标记精确判断（覆盖前备份 `*.bak.<YYYYmmdd-HHMMSS>`）；安装成功后写 `<工作区>/.dsh/supervisor-kit.json`（name/version/installedAt/installer，重复安装报告已装版本）；默认只补缺失文件（`research/`、`patches/`、`AGENTS.supervisor.md` 不再被无条件覆盖）；任何写操作前完整预检，缺文件一次列全并 exit 1；`--dsh-home` 缺值显式报错；**bash 版不再依赖 python3**（用 Node 改写技能 workspace 元数据），仅需 Node ≥18；修 bash 3.2 + 中文 locale 下全角字符吞变量的 bug（`${VAR}`）。
- **插件安装器**（`plugin/dsh-project-supervisor/install-plugin.sh` / `.mjs`）：**删除 python3 依赖**（Node helper；退出码只把 10 当「未安装/已最新」，损坏 JSON/权限错误一律 exit 1，不再静默成功）；安装后写 `<profile>/.dsh-project-supervisor.json`（version/installedAt/mode/pluginDir）；卸载前备份 profile、copy 模式真实目录递归删除、重复卸载幂等；建链/复制前安全删除旧条目（修 `ln -sfn` 遇真实目录产生嵌套的问题）；mjs 默认 profile 支持 `DSH_HOME` / `PROFILE`；copy 回退按 `files` 白名单且排除 `.git`/`node_modules`/`screenshots`/`kit`/`dist`/`.backups`；Windows 卸载提示补齐 `--profile`。
- **测试与文档**：`selftest.sh` 13 → **18 项**（新增 dry-run 零写入、force 升级 + 版本记录、预检失败零写入、无 python3 动态断言、插件安装器健壮性）；实测 selftest 18/18、插件安装器 26 条断言 PASS、kit 安装器 46 条断言 PASS、真实 profile 未被触碰；`安装说明.md` / `朋友测试指南.md` / 插件 README / 公开 README 同步安装行为与新参数。
- **版本**：套件 1.8.0 → **1.8.1**；插件 0.5.0 → **0.5.1**。

## [1.8.0] 2026-10-25

### 工作流硬化与技能模板分发（套件）

- **规则硬化（14 条）**：AGENTS.md 与主管 SKILL 写入计划即文件、实现者+独立评审两段式、完成声明过 Gate、有界 fix loop、任务账本 LEDGER、调试 Iron Law、技能写作 TDD、隔离基线、模型分级、收尾菜单、多平台适配等硬化规则与红旗借口表；常驻体量预算 8000B → **10000B**（实测约 9.7KB）。
- **技能模板随包分发**：主管技能从「单文件」升级为「技能目录」，新增 `skill/templates/` 四个模板——`plan.md`（计划）、`task-brief.md`（任务简报）、`ledger.md`（任务账本）、`review-gate.md`（评审门禁）；安装后位于 `<工作区>/.dsh/skills/project-supervisor/templates/`。
- **同步**：`sync-kit.sh` 同步整个 `.dsh/skills/project-supervisor/`（SKILL.md 转换 workspace 元数据 + templates 逐字节复制），`--check` 覆盖模板文件与多余文件；`--global` 同样安装整目录并逐文件 `.bak` 备份。
- **安装**：`install-supervisor.sh` / `install-supervisor.mjs` 复制整个技能目录（含 `templates/`）到目标工作区与全局技能；安装包缺少模板时明确报错并提示先运行 sync-kit.sh。
- **回归/打包**：`selftest.sh` 13 项断言补充「kit / 目标工作区 / 全局技能都含模板且非空、逐字节一致、模板漂移可被 --check 检出」；`build-dist.sh` 必需文件清单加入 4 个模板并校验数量与非空；`verify-facts.sh` AGENTS 预算改为 10KB，新增「工作流硬化」软检查（缺失只记 WARN，不阻塞）。
- **回归/打包**：`selftest.sh` 增加第 13 项「真实工作区 sync --check（改源后须先 sync）」，把漂移从前置 INFO 改为必过检查；`verify-facts.sh` 新增「主管 SKILL ≤32000B」硬检查与「模板 ≤80 行」软检查。
- **轻量化**：截图从 1000px 降到 800px、内部评审报告（05/06/08/10）不进分享包、SKILL 正文压缩到 31950B；分享包从 542KB 降到约 400KB。
- **许可证合规（superpowers 引用）**：`THIRD_PARTY_NOTICES.md` 新增「superpowers（工作流机制参考）」节——记录上游 MIT、`Copyright (c) 2025 Jesse Vincent`、阅读范围与使用方式（只借鉴流程、独立撰写、未复制代码或长段原文）、MIT 全文与再分发引用要求；公开 README 增加致谢与链接；`research/09` 增加许可证与引用声明。
- **文档**：安装说明、朋友测试指南补 `templates/` 与新硬化规则说明；本套件版本 1.8.0。

## [1.7.0] 2026-10-25

### 主管工作模式（插件 0.5.0）

- 面板**最上端**新增「主管工作模式」二选一：**效率优先**（默认）/ **严格派发**；状态写 `.dsh/supervisor.config.json` 的 `dispatchMode`，主管开工先读。
- 效率优先：紧耦合跨文件改动、测试迭代、≤10 分钟小修由主管亲自做；独立新文件、调研/评审、文档包、可独立验收模块必须派给对话框。
- 严格派发：所有文件写入都必须由对话框完成（含单文件小修）；主管只拆解、登记、写命令、评审、验收、集成，不亲自 Edit/Write；派不出时明确报阻塞，不静默自己写。
- 规则同步：AGENTS.md 新增「派发模式」段、SKILL 新增同名章节、主管手册新增说明节；host 四字段配置（新增 `dispatchMode`，非法值 400 `invalid-dispatch-mode`）；client 顶部模式卡片与持久化；e2e 增模式选择/刷新保持断言；host-smoke 16 项。
- 文档：插件 README 模式节 + 截图、安装说明 FAQ、朋友测试指南 B3、DECISIONS D30。

## [1.6.3] 2026-10-24

### Windows 兼容性与崩溃安全（插件 0.4.2）

- **host 半侧跨平台加固**：home 目录改用 `os.homedir()`（Windows 无 `$HOME`）；home 归属判断按平台分隔符、Windows 大小写不敏感；原子写在 Windows 被占用时回退直写；`apply()` 与 HTTP handler 全链路 try/catch（host API 缺失/路由注册失败只禁用面板，不让 DSH profile 加载失败）；损坏的 `supervisor.config.json` 回退默认值；导入插件无副作用。
- **双平台 Node 安装脚本**：新增 `plugin/dsh-project-supervisor/install-plugin.mjs`（Windows 默认 junction 链接，失败自动复制；幂等、备份、可 `--uninstall`）与 `setup/install-supervisor.mjs`（跨平台安装主管套件，等价 bash 脚本）；Windows 朋友不再需要 Git Bash/WSL/python。
- **自动化验证**：新增 `plugin/dsh-project-supervisor/scripts/compat-check.mjs`（32 项：win32 盘符/反斜杠/大小写/UNC/越界路径、apply 异常注入、HTTP 403/400/405/413/损坏配置/断连响应、两个安装器的安装/幂等/卸载/回滚）；selftest 增加该项（12 项）。
- **文档**：安装说明、朋友测试指南（新增第 8 节 Windows 专项与崩溃恢复）、主管手册、插件 README 同步；明确「已验证 = win32 语义模拟 + 自动化，不含真机 Windows 硬件」。
- 无规则或配置字段变更；分享包同步重建。

## [1.6.2] 2026-10-24

### 三块简介可折叠（插件 0.4.1）

- 「零基础保护」「提示词润色」「新项目需求追问」三张卡片的简介与清单可折叠：默认展开；标题左侧箭头可收起/展开；选择写入浏览器 `localStorage`（`psup.collapsed.<字段>`），下次打开主管页面沿用，但不影响开关与 `.dsh/supervisor.config.json`。
- 顺带修正英文 footer 仍写「two panel switches」的旧文案（改为 three）。
- 验证：client smoke 109 keys、e2e 默认展开 → 折叠（卡片体消失 + localStorage 写入）→ 刷新后仍折叠 → 其余卡片不受影响；截图刷新。无规则/配置字段变更。

## [1.6.1] 2026-10-24

### 分享包轻量化 + 内容检查

- 截图：6 张 PNG（约 1.2MB）→ 3 张 JPEG（约 220KB，1000px 宽、质量 70），去掉重复的关闭态/展开态截图；分享包从 1.4MB（1,417,698B）降到 417KB（427,301B）。
- **build-dist 修复**：打包前先删旧 zip（`zip -r` 会保留已删除的旧条目，导致删掉的截图仍留在包里），并新增对应注释。
- 文档修正：主管手册截图路径改为 `plugin/dsh-project-supervisor/screenshots/`；README 预览图同步为 `.jpg`。
- 兼容提示：安装说明/朋友测试指南补充「文件名为 UTF-8 中文，Windows 用 7-Zip 解压」与包体积说明。
- 无规则、插件逻辑或配置字段变更（插件仍为 0.4.0）。

## [1.6.0]

- **评审修复（research/08）**：触发判据排除套件文件（避免把装过套件的空目录判成旧项目）、统一最多 3 批；术语统一「新项目需求追问」、停止条件补「连续两批用默认」、项目根 README/DECISIONS 与 research/DECISIONS 区分、手册 smoke 13 项三字段、重启后需重新点开关的文案、e2e 增加 console error=0 断言（过滤预期内 config 端点 404/405）。
2026-10-24

- **新功能「新项目需求追问」**（默认开，仅新项目当轮及其追问轮生效）：用户提出新项目的那轮，主管先追问需求（每批 3–5 个、每题给默认答案、最多 3 批），能定 MVP/验收/主要约束或用户说「够了/直接做」即停；答案落盘 README + DECISIONS 再开工。
- 面板新增第三个开关「新项目需求追问」（插件 0.4.0）：host config endpoint 扩为三字段（GET/POST 均回 `requirementInterview`，部分更新不重置其他开关，非法值 400）；client 新增卡片与 4 步说明，localStorage 兜底。
- 规则载体：AGENTS.md 新增同名段（简短版）；SKILL.md 新增流程（触发边界、三批问题、停止条件、示例、反模式）；主管手册新增「新项目开局追问」。
- 调研：`research/07-requirement-interview.md`（GitHub MIT 许可开源项目的追问机制与问题模板参考）。
- 测试：host-smoke 13 项（三字段读/写/校验）、client smoke 107 keys、e2e 三开关 `true → false → true`；selftest 同步覆盖。

## [1.5.0] 2026-10-24

### 体量优化 + MIT 合规 + 朋友测试包

- 体量：`AGENTS.md` 10462B → **7278B**（细节下沉到按需加载的 SKILL.md）；improving-prompts 的 catalog 元数据 description+whenToUse 从 1692 字符压到 **553 字符**；project-supervisor catalog 从 653 → **361 字符**。每会话常驻成本约减少 4.2KB。
- MIT 合规：补齐 improving-prompts 的 `LICENSE`（Copyright (c) 2026 Igor Wnek）与上游 `references/`、`templates/` 文件（正文链接不再失效）；新增 `setup/THIRD_PARTY_NOTICES.md`；修正 plugin LICENSE 拼写。
- 朋友测试：新增 `setup/朋友测试指南.md`（解压→校验→安装→测试清单→反馈模板→卸载），分享包包含插件安装脚本与插件源码。
- 验证：见 `research/DECISIONS.md` D25 与最终交付报告。

## [1.4.0] 2026-10-24

### 提示词润色开关 + improving-prompts 集成（插件 0.3.0）

- 随套件安装 improving-prompts 技能：`.dsh/skills/improving-prompts/SKILL.md`（kit 模板 `setup/skill-improving-prompts/SKILL.md`，`--global-skill` 同时装全局技能）。
- 主管规则新增「提示词润色（默认开启）」：开工先读 `.dsh/supervisor.config.json` 的 `promptPolish`；开启时先工程化用户指令（判断场景 → 诊断缺口 → 补全专业提示词/占位符 → 一行「润色要点」），然后立即执行；关闭时直接执行原话；用户可单次说「这次别润色」。
- DSH「主管」面板新增「提示词润色」卡片与滑块（四步说明，关闭时隐藏并给提示）；host endpoint 扩展为可独立读写 `beginnerGuard` / `promptPolish` 两个字段（旧配置缺字段按 true），写入互不重置；host-smoke 8 → 11 项。
- 同步机制：`sync-kit.sh` 增加 improving-prompts 映射与全局技能同步；`install-supervisor.sh` 安装技能；`selftest.sh` 覆盖新技能、双开关与 12 项打包抽查；`build-dist.sh` 打包并抽查技能文件。
- 验证：e2e 双开关 `true → false → true`、host-smoke 11 项 PASS、selftest 11/11。

## [1.3.1] 2026-10-24

### 快捷动作可折叠阐释（插件 0.2.1）

- 「快捷动作」卡片改为三条动作项，每条右侧加「说明」折叠按钮（`aria-expanded`、chevron 旋转、展开时高亮）：点开显示该动作的作用与使用时机，再点收起；同一时间只展开一条。
- 附一行提示「每个动作右侧「说明」可展开，看它做什么、什么时候用」；中英双语。
- e2e 新增断言：3 个折叠默认收起、点开恰好 1 条阐释（文本含「作用」）、再点收起；截图 `panel-actions-open.png`。
- 纯 client bundle 改动：刷新 DSH 页面即生效，无需重启。

## [1.3.0] 2026-10-24

### 零基础保护开关（插件 0.2.0）

- 面板「零基础保护」卡片加滑块：状态写入 `<工作区>/.dsh/supervisor.config.json`（`beginnerGuard`/`updatedAt`/`source`，tmp+rename 原子写）。
- `AGENTS.md` / `SKILL.md` 加「开关读回」规则：开工先读该文件，`false` 时跳过主动新手引导，保留密钥/不可逆动作等安全底线；文件缺失默认开启。
- host 半侧 `index.js` 新增同源 HTTP endpoint（GET/POST `/plugins/dsh-project-supervisor/config`）：同源校验、`$HOME` 路径校验、body ≤8KB、仅 GET/POST；host 未重启时 client 退回 localStorage 并提示。
- 验证：host-smoke 8 项 PASS；e2e 开关 `true → false → true`；selftest 仍 11/11（插件项含 client/host 双 smoke）。

## [1.2.0] 2026-10-24

### 插件版 UI（新增，可选）

- 新增 `plugin/dsh-project-supervisor/`：DSH Web 客户端插件，侧栏「主管」只读面板——项目切换（按会话 cwd 去重，自动优先带 `AGENTS.md` 的项目）、9 项工程底线自检（`.git`/README/.gitignore/DECISIONS/AGENTS/.env.example/research/setup/.dsh skills）与 `x/9` 进度、主管四步工作流、零基础保护六条、三个复制口令按钮。
- 手写客户端 bundle（免构建，`window.__ModuleLoader__` + `dsh.client` + bundle patch），host 半侧 `apply()` 为空、无副作用；`install-plugin.sh` 幂等安装/卸载，改动 profile 前自动备份到 `.backups/<时间戳>/`。
- 验证：`scripts/smoke.mjs` 离线注册断言 PASS；headless Chrome 真实 GUI e2e PASS（侧栏入口、面板渲染、项目切换 `0/9 → 7/9`、快捷动作 toast、无 console error），截图见 `plugin/dsh-project-supervisor/screenshots/`。
- 工程化：`build-dist.sh` 把 `plugin/` 一并打进分享包（必需文件抽查 8→11 项）；`selftest.sh` 新增插件语法 + smoke 回归（10→11 项）。
- 规则载体不变：`AGENTS.md` 与 `SKILL.md` 仍是唯一规则来源，插件只读、不写文件、不改配置。

## [1.1.0] 2026-10-24

### 零基础用户保护（新增）

- `AGENTS.md` 新增「零基础用户保护（默认开启）」段：git 安全网（`git init`/`README`/`.gitignore`/git 身份/每步提交/远端备份）、新会话先读回 `README.md`/`DECISIONS.md`/`git log`、MVP 与可执行完成定义、架构 2–3 选 1 及默认平台、密钥落地流程（`.env.example` + 用户自填 + `git grep` 扫描）、不可逆确认、成本/隐私/需求变更、每步跑通、文档即记忆、说人话汇报。
- `SKILL.md` 新增同名章节：触发信号、18 类新手常见错误 → 主管动作 → 验收证据表、新项目开工五件套（含 git 身份、环境检查、备份）、架构选型默认策略（含托管平台）、每步节奏与验收三查、对零基础用户的沟通方式；第一步「立项」加入「先读回 README/DECISIONS/git log」。
- `主管手册.md` 新增「给零基础用户：主管会自动帮你避开的坑」：常见错误对照表（含备份/成本/部署）、开工五件事、用户最少只需做的四件事。
- `setup/DECISIONS.template.md`：开工检查清单更新，并新增「完成定义」「验收标准（3 条）」可填写小节。
- 独立只读评审 `research/06-beginner-guard-review.md`：20 类错误覆盖表 + 3 项 blocking（密钥落地路径、文档只写不读、全局技能/dist 未更新）已全部修复，10 条 advisory 按批采纳；VERSION 1.1.0。

## [1.0.0] 2026-10-24

首个可移植版本：本工作区的「项目主管」体系（常驻规则 + 技能 + 使用手册 + 调研结论 + 可选权限补丁 + 工程化脚本）整理为一键安装包。

### 主管规则 / 技能 / 手册

- `AGENTS.md`：项目主管常驻作业规则（角色边界、中枢决策四件事、权限与授权口径、并行纪律、命令模板、验收与收敛、沟通规范），会话启动时按 cwd 注入。
- `.dsh/skills/project-supervisor/SKILL.md`：主管技能完整流程与模板；目录热更新，触发词「你当项目主管」「开几个对话框并行做」。
- `主管手册.md`：给用户的使用说明（怎么用、在其他工作区建立主管、工程化维护、并行判据、已知限制、team-permissions 进阶用法）。
- 权限口径：新对话框权限创建时固定（继承父会话沙箱、审批固定 `never`）；用户把项目目标交给会话即视为 Agent Teams 授权；未启用 Team 组合包时降级为单会话并说明。
- 信息缺口规则：外部事实必须写明上网/上 GitHub 查什么、检索次数或时长、来源核验方式、注明抓取日期、不得编造链接；本工作区事实直接指定先读文件；纯机械改动不检索。

### 调研（research/）

- 4 份分报告 + 1 份独立评审：vibe coding 主管（01）、多智能体编排（02）、中文社区实践（03）、DSH Agent Teams 语义（04）、验收评审（05）；`research/README.md` 为交叉结论总览，`research/DECISIONS.md` 记录关键决策。
- 事实快照：链接与 GitHub 星数为 2026-10-24 抓取结果，随包提供 `verify-facts.sh` 复检。

### 安装与分发

- `install-supervisor.sh`：一条命令把主管建到任意工作区；`--with-research` 附带调研与决策模板，`--global-skill` 安装到 `~/.dsh/skills/`，`--force` 覆盖自定义 AGENTS.md；目标已有自定义主管规则时默认不覆盖（生成 `AGENTS.supervisor.md` 供合并）。
- `build-dist.sh`：生成分享包 `dist/project-supervisor-kit-<日期>.zip`（自动脱敏作者本机路径），同目录产出 `.zip.sha256`，并抽查包内必需文件。
- 安装为全局技能（2026-10-24 实测）：`~/.dsh/skills/project-supervisor/SKILL.md` 已安装，任意工作区说「你当项目主管」即可触发；同名时项目级技能优先，升级重跑安装脚本（旧文件自动备份 `.bak.<时间戳>`）。

### 权限补丁（可选）

- `patches/team-permissions/`：给单个对话框指定沙箱范围（`read-only` / `workspace-write` / `danger-full-access`），`python3 patch.py status|apply|revert|selftest` 管理；应用后需完整重启 DSH 生效；审批策略仍固定 `never`（后台子会话无人应答审批，固定拒绝是正确设计，README 有评估说明）。
- 补丁 v2：新增 `tools: "read-only"` 收窄工具可见性（白名单：read / grep / glob / skill / todo_write / web_search / web_fetch；不能写文件或跑 bash，团队/任务板/消息工具天然保留可汇报）；新增 DSH 版本探测（非 `0.2.0-rc.2` 时 `apply` 需 `--force`）；selftest 优先用备份原件验证；`PATCH_VERSION="2"`，v1 升级方式为 `revert` 再 `apply`（两步连续，中间不重启 DSH）。

### 工程化维护（本次新增）

- `setup/VERSION` / `setup/CHANGELOG.md`：版本号与变更记录。
- `setup/sync-kit.sh`：唯一同步入口，把源规则/技能/手册/调研转换为可移植 kit 副本；默认同步、`--check` 只检查（漂移打印 diff 并 exit 1）、`--global` 顺带更新全局技能（旧文件备份）；幂等。
- `setup/selftest.sh`：一键回归（语法检查、临时副本同步一致性、4 组安装、重复安装幂等、权限补丁自测、打包校验），任一失败 exit 1。
- `setup/verify-facts.sh`：联网复检调研引用链接、GitHub 星数、DSH 常量与补丁状态；`--offline` 跳过联网；仅 FAIL 时 exit 1。
- 维护顺序：改源文件 → `bash selftest.sh` → `bash sync-kit.sh` → `bash build-dist.sh` → `bash verify-facts.sh`。
