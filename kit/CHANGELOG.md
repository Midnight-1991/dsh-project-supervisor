# 更新记录

格式：`## [版本] 日期` + 变更分类。版本号与同目录 `VERSION` 一致（源工作区为 `setup/VERSION`）。

## [2.0.0] 2026-11-03

大版本发布：插件 **1.0.0** / 套件 **2.0.0**（自 1.11.2 以来全部未发布批次合并发布；1.13.0 及以下为内部开发批次）。

### 新增
- **自动工作（无人值守，默认关）**：面板「自动工作」开关 + 队列文件 `.dsh/auto-work-queue.md`（五节：排队任务 / 阻塞 / 待回答的问题 / 自动工作日志 / 经济模式状态）+ tick 周期脉冲；规则含不弹窗提问、不请求授权（推送/发布/删除/花钱等不可逆动作只记「阻塞」）、连续 2 tick 无进展或用户回来即收尾；只读 mailbox 脚本 `peek-mailbox.mjs`；P1 两个可选补丁（timed ask-user / auto-work 权限预设，默认不应用）。
- **只读队列消息（含用户「排队发送」）**：`peek-mailbox.mjs` 回放 `agent/inbox/spliced`（next-turn / next-step），文本输出 `pending user prompts`，JSON 新增 `userPending{nextTurn,nextStep,nextTurnCount,nextStepCount}`；预览自动脱敏（`sk-`/`ghp_`/`AKIA`/`xox`/`glpat`/`AIza` 等模式 → `sk-***`/`[REDACTED]`），只读、不打断在跑 agent。
- **更经济的自动化**（`economicalAutoWork`，默认关）：面板「自动工作」行内缩进次级开关（`autoWork` 关闭时置灰、不可单独开启）；开启后自动工作只在 **DeepSeek 谷价时段**推进——谷价 = 北京时间周一至周五 09:00–12:00、14:00–18:00（UTC 01:00–04:00、06:00–10:00）之外的全部时间 + 周末/中国法定节假日全天，峰价约 50%（来源 DeepSeek 官方价格页 2026-11-01 核实）；高峰前 20 分钟只收尾、高峰开始后 ≤10 分钟到检查点暂停（暂停期间零模型调用）、谷价开始后由 tick 续跑（下次 tick 定在谷价开始后 1–3 分钟）；连续性协议（暂停前把结论写盘到队列「经济模式状态」节 + LEDGER + 任务 brief，恢复读状态节 + 任务板 + `list_agents` 幂等续跑）、节假日无内置日历保守处理、仅约束自动工作发起的模型调用。
- **面板 UI 四分区重排 + 分区级折叠**：「当前项目 → 工作方式 → 运行状态 → 规则自检 → 快捷动作 → 使用说明」单列滚动页；工作方式区两张全宽卡（主管工作模式 + 5 行「工作开关」清单，行尾「说明」在行内展开完整指引）；四个 `[data-zone]` 分区与「使用说明」可折叠（默认只展开工作方式/快捷动作，其余收起为一行摘要，偏好存 `psup.zone.<zone>`）；快捷动作 1 个主按钮 + 6 个 2 列次动作；规则自检 `x / 9` + 进度条 + 9 项网格；复制失败改「手动复制」只读文本层；响应式改容器查询。
- **效率工具**：`setup/supervisor-doctor.sh`（只读环境体检 16 项，PASS/WARN/FAIL/SKIP + `--json` + `--no-network` 兼容参数）、`setup/supervisor-verify.sh`（12 步一键验收：doctor → sync-kit → verify-facts → 插件三测 → 脚本自测 → 补丁自测 → selftest → git 卫生/密钥扫描）、第 7 个技能模板 `templates/handoff.md`（交接单，上下文风险/换对话框时用）+ 规则触发点（AGENTS「效率工具与交接」、SKILL、主管手册）。
- **公开仓库正式版化**：公开 README 与市场条目改为正式版标注，状态写「插件 1.0.0 / 规则套件 2.0.0」；`package.json` description 去掉测试期字样；公开截图更新为 v1.0.0 版式（`panel.jpg` / `panel-middle.jpg` / `panel-bottom.jpg` / `panel-mode-strict.jpg` / `panel-interview-off.jpg` 五个文件名，内容由维护者替换）；`build-public-repo.sh` 提交提示改 `v1.0.0`。

### 变更
- **移除与外部上下文压缩组件的全部集成**（按用户要求，2026-11-01；该组件不在主管引用范围内）：doctor 不再做外部组件健康检查，`--json` 不再输出相关字段；面板删除两张运行态卡（上下文健康 / 成本用量）及其只读运行态接口；规则/套件/文档与测试不再引用该组件（历史过程记录保留原文并加注）。
- **CI（GitHub Actions `verify`）**：Node 20/22 双版本矩阵（原先固定 Node 20 导致失败）；Node 20 无 `zlib` zstd API，`host-smoke` 的 team-board fixture 检查按能力打印 SKIP（运行时路由本来就会降级为 `zstd-unavailable`），Node 22 全量执行 50 项。
- **安全脱敏修复**：`build-public-repo.sh` 的 `sk-`/`ghp_` 等模式改为运行时拼接的正则替换（原先按字面量替换可能导致公开包漏脱敏），公开包密钥断言保留；`peek-mailbox.mjs` 自测 fixture 改为运行时拼接假 key，源码不再出现形似真实密钥的字面量。
- **版本推进**：套件 **1.13.0 → 2.0.0**、插件 **0.9.0 → 1.0.0**；面板「自动工作」行内新增缩进次级开关「更经济的自动化」（配置字段 `economicalAutoWork`，默认 `false`），config 路由 GET/POST 字段集合同步。
- 1.13.0 及以下条目为内部开发批次（含自动工作 P0/P1、队列消息只读、更经济的自动化、四分区重排+分区折叠、doctor/verify/handoff、去外部组件引用等），已全部并入本版本。

### 验证
- `bash setup/sync-kit.sh --check` → 全部一致（**45** 个文件）；`bash setup/selftest.sh` → **PASS 24 / FAIL 0**；`bash setup/verify-facts.sh --offline` → **PASS 11 / WARN 0 / FAIL 0**；`bash setup/supervisor-verify.sh` → **PASS 12 / FAIL 0 / SKIP 0**。
- 插件：i18n **214** keys×2（中英对齐）、`smoke` PASS、`host-smoke` **50** 项、`compat-check` **34** 项 PASS、`node --check` 6 个文件全绿。
- 面板 e2e（临时 DSH 实例 1440×900，innerHeight 813）：默认收起态整页 `scrollHeight` **1196px**（旧基线 2957px、上一轮全展开 1812px，**-60%**）、cards 4、switchRows 5、首屏最后一行开关 bottom 770 ≤ 813、运行状态标题 top 806 < 813、四分区按序、console error 0 / runtime exception 0。
- 构建：发布前重建 `build-dist.sh` / `build-public-repo.sh`；zip **836,711B**、sha256 `3139063816a8095c8ddc2f9ed841630e16badfdff7ad9e28234f46c4d8920271`（记录值；zip 时间戳与内嵌文档使独立重建 ±20B，发布资产以 Release 页随附的 `.sha256` sidecar 为准）。`build-public-repo.sh` → **102** 文件。

## [1.13.0] 2026-11-01（内部开发批次，随 2.0.0 合并发布）

### 新增
- **P0 环境体检** `setup/supervisor-doctor.sh`（只读，16 项检查）：运行时（node/python3/git）、工作区（git HEAD/脏文件、AGENTS.md ≤13000B、SKILL.md ≤38000B）、套件（VERSION、sync-kit --check、selftest）、插件（版本、node --check、`link:` 安装）、残留（.backups/.bak/临时产物）；输出 PASS/WARN/FAIL/SKIP + 证据/建议，`--json`、`--no-network`（保留兼容参数，脚本不做网络探测）、`--workspace`，exit 0/1/2，兼容 bash 3.2。
- **P0 一键验收** `setup/supervisor-verify.sh`（只写系统临时目录）：12 步串行编排——doctor(--no-network) → sync-kit --check → verify-facts --offline → 插件 node --check/smoke/host-smoke/compat → `peek-mailbox.mjs --self-test` → `patches/*/patch.py selftest` → selftest（`--fast` 跳过）→ git 卫生 → 密钥扫描；逐步 PASS/FAIL/SKIP + 失败输出尾部，`--json`，单步失败继续、最终统一 exit 1，**不递归调用自身**。
- **第 7 个技能模板** `templates/handoff.md`（交接单，≤80 行：目标/完成定义/已改文件/任务板状态/验证命令与输出/未完成与下一步/阻塞风险/接手开工指令）+ 规则触发点（AGENTS「效率工具与交接」、SKILL、主管手册）。
- 插件 **0.9.0**：只读路由 `GET /plugins/dsh-project-supervisor/team-board?cwd=&session=`（成员/任务/待投递消息）；面板运行态卡只剩「团队与任务」一张（放在「运行状态」区，host 未重启时降级提示）；快捷动作 3→7（新增交接单模板、团队状态快照、环境体检口令、一键验收口令）；i18n **214** keys×2（中英对齐）、host-smoke **50** checks、compat **34** PASS。
- **公开包脱敏修正 + 测试 fixture 去真实密钥**：`build-public-repo.sh` 的 `sk-`/`ghp_` 等正则模式此前按字面量替换导致可能漏脱敏（现按正则替换，公开包密钥断言保留）；`peek-mailbox.mjs` 自测 fixture 改为运行时拼接的假 key，源码不再出现形似真实密钥的字面量。
- **自动工作读取用户「排队发送」消息**（`peek-mailbox.mjs`）：新增 `agent/inbox/spliced` 回放（next-turn/next-step），文本输出 `pending user prompts`、JSON 新增 `userPending{nextTurn,nextStep,nextTurnCount,nextStepCount}`（条目含 id/queuedAt/target/preview，密钥自动脱敏 `sk-***`/`[REDACTED]` 等；旧字段不变）；`--self-test` 扩为 10 项（inbox 回放/claim/非 user 过滤/脱敏/JSON 形状/limit/空态）；AGENTS/SKILL 自动工作规则补「排队发送 vs 插话发送（Cmd/Ctrl+Enter）」语义、每 tick/长任务前 peek 触发、`userPending > 0` 时尽快收尾当前轮；`--limit` 按列表限条数并 stderr 提示。
- **面板 UI 重排 + 结构收口**（插件 0.9.0）：「当前项目 → 工作方式 → 运行状态 → 规则自检 → 快捷动作 → 使用说明」单列滚动页；工作方式区改为两张全宽卡——①「主管工作模式」卡内效率优先/严格派发二选一（内容宽 <720px 单列）；②「工作开关」清单卡 5 行：零基础保护 → 自动工作 → 模型协作 → 提示词润色 → 新项目需求追问，每行名称 + 一句话说明 + 右侧开关 + 行尾「说明」展开该行完整指引（默认收起、折叠偏好存 localStorage，模型协作开启时自动展开 auto/manual 两选项与 6 行路由表），不再用卡片墙或两列配对，任何开关状态下都不会出现卡内大片空白；顶部 slim 当前项目条（工作区 chips + 小号「刷新」按钮 + 保留项目名的中间省略路径）；快捷动作 1 个主按钮「复制开工口令」（宽度随内容）+ 6 个 2 列次动作；规则自检改 `x / 9` 分数 + 进度条 + 9 项网格，缺失建议统一列在网格下方；复制失败改为「手动复制」只读文本层；**分区级折叠**：四个 `[data-zone]` 分区（工作方式/运行状态/规则自检/快捷动作）与「使用说明」各带标题行右侧 chevron 折叠按钮（支持键盘、`aria-expanded`/`aria-controls`，点标题行或按钮切换），默认只展开工作方式与快捷动作，其余收起为「标题 + 一行灰色摘要」（运行状态「成员 n · 任务 n · 待投递 n」、规则自检「n / 9 项就绪」、快捷动作「7 个快捷动作」、使用说明「主管四步流程」、工作方式收起时「2 张设置卡」），偏好存 localStorage `psup.zone.<zone>`（'1' 收起/'0' 展开，刷新保持），与行级 `psup.collapsed.<field>` 互不影响；响应式改容器查询（模式 <720px、模型路由/自检 <560px、动作网格 <860px、四步说明 860→两列 / 560→单列）；首屏口径：1440×900（inner 813）下完整呈现工作方式区（最后一行开关 bottom=770 ≤ 813），运行状态区标题（top=806）与团队卡顶部进入首屏、完整内容次屏可达；e2e 默认收起态整页 `scrollHeight` 2957→1812→**1196**px（较旧基线 **-60%**；全展开约 1500px）、cards **4**、switchRows **5**、首屏最后一行开关 bottom **770** ≤ 813 / 运行状态标题 top **806**、console error 0 / runtime exception 0、弹窗自动关闭、公开截图隐藏 toast、按 top/45%/bottom/运行状态区/动作区多档截图；离线 smoke 断言两卡结构、5 行开关顺序、行说明默认收起、5 个分区折叠按钮与默认 `aria-expanded`/`aria-controls`、收起摘要文案、`psup.zone.<zone>` 落盘、214 keys×2。
- **更经济的自动化**（`economicalAutoWork`，默认关）：面板「自动工作」行内新增缩进次级开关（`autoWork` 关闭时置灰、不可单独开启）；开启后自动工作只在 **DeepSeek 谷价时段**推进——谷价=北京时间周一至周五 **09:00–12:00、14:00–18:00**（UTC 01:00–04:00、06:00–10:00）之外的全部时间 + 周末/中国法定节假日全天（峰价 50%，来源 DeepSeek 官方价格页 2026-11-01 核实）；规则含适用模型条件（模型集合含 `deepseek-official/*` 即适用，全部显式非 DeepSeek 不限制，无法判定保守按适用）、高峰前 **20 分钟**起只收尾、高峰开始后 **≤10 分钟**到检查点暂停、暂停期间零模型调用、谷价开始后由 tick 续跑（下次 tick 在谷价开始后 1–3 分钟）、暂停前结论落盘、恢复幂等（读队列状态节 + 任务板 + `list_agents`，已完成不重派）、节假日保守口径、仅约束自动工作（手动使用不受影响）；状态写入队列文件 `## 经济模式状态` 节；AGENTS / SKILL / 队列模板同步该协议。

### 变更
- **按用户要求（2026-11-01）移除与外部上下文压缩组件的全部集成**（该组件不在主管引用范围内）：doctor 不再做外部组件健康检查（安装版本/宿主进程/实例数/状态接口/版本一致性等），`--json` 不再输出外部组件健康字段；面板删除两张运行态卡（上下文健康/成本用量）及其只读运行态接口；规则/套件/文档与测试不再引用该组件（历史过程记录保留原文并加注）。
- `sync-kit.sh`：主管模板 6→7（`handoff.md`），kit 镜像同步；`--check`/`--global` 覆盖。
- 安装器（`install-supervisor.sh` / `.mjs`）：技能预检与 `SETUP_FILES` 加两个 P0 脚本与第 7 模板（sh 增加「模板数=7」硬断言）；`--with-setup` 安装后可直接 `bash setup/supervisor-doctor.sh` / `supervisor-verify.sh`。
- `selftest.sh`：模板计数 6→7 全部位置；新增 3 项用例——两脚本 `bash -n`/`--help`/未知参数 exit 2、doctor 真实机只读（`--no-network`）+`--json` 可解析、`supervisor-verify.sh --fast` 集成后全绿（其内部 selftest 步在 `--fast` 下 SKIP，不递归）。
- `build-dist.sh` / `build-public-repo.sh`：主管模板 6→7、必需文件加 `handoff.md` 与两个 P0 脚本、非空断言。
- `verify-facts.sh`：预算按用户 2026-11-01 授权放宽 **AGENTS.md ≤13000B**（原 10000）、**SKILL.md ≤38000B**（原 35000），并新增「两 P0 脚本存在且可执行」断言。
- 公开 README / market-entry 补「环境体检 / 一键验收 / 交接单 + 面板团队与任务卡」一句（不夸大）；`安装说明.md` / `一键安装口令.md` / `朋友测试指南.md` / `主管手册.md` 同步面板四分区布局（当前项目条 + 工作方式区两张全宽卡（模式卡 + 5 行工作开关清单）+ 运行状态团队卡 + 规则自检 + 快捷动作主次 + 首屏可见性口径）与模板/脚本计数；T22 后补分区级折叠行为（默认收起状态与一行摘要、`psup.zone.<zone>` 持久化、默认收起 1196px / -60%）。
- 面板「自动工作」行内新增缩进次级开关「更经济的自动化」（配置字段 `economicalAutoWork`，默认 `false`、`autoWork` 关闭时置灰）；config 路由 GET/POST 收发的布尔字段集合同步新增该字段。
- 套件 **1.13.0**、插件 **0.9.0**。

### 验证
- `bash setup/sync-kit.sh --check` → 全部一致（**45** 个文件）；`bash setup/selftest.sh` → **PASS 24 / FAIL 0**（P0 用例全过）；`bash setup/verify-facts.sh --offline` → **PASS 11 / WARN 0 / FAIL 0**；`bash setup/supervisor-verify.sh` → **PASS 12 / FAIL 0 / SKIP 0**（含 peek-mailbox self-test 10 项）；`bash setup/build-dist.sh` → exit 0（必需文件 **43/43**、主管模板 **7** 个、zip 大小 **685,905B**、sha256 `1c2dd47ecd2c095593f777c63231c99dacc5ddaad5782db9829fecf6e7403ba1`；独立重建 ±20B 因 zip 时间戳与内嵌文档、非产品差异）；`bash setup/build-public-repo.sh` → exit 0（文件数 **102**）；安装器 `--dry-run` + sh/mjs 真实安装（含 `--with-setup`）→ exit 0，安装目录抽检 **7 模板 + 两 P0 脚本**（Lead 已实跑确认）；面板 e2e（临时 DSH 实例 1440×900）：四分区按序、默认收起态整页 **1196px**（旧基线 2957px、上一版全展开 1812px，-60%；全展开约 1500px）、cards 4、switchRows 5、首屏最后一行开关 bottom 770 ≤ 813 / 运行状态标题 top 806、console error 0 / runtime exception 0；本次「更经济的自动化」：e2e 默认收起态整页 **1196px**（cards 4、switchRows 5、bottom 770、top 806）、i18n **214** keys×2、host-smoke **50**、verify **PASS 12 / FAIL 0 / SKIP 0**。e2e 脚本经修复（B1）：运行前备份并临时移走工作区 `.dsh/supervisor.config.json`、`EXIT trap` 无条件恢复，因此**在最终交付状态（economicalAutoWork=true）也可直接复跑**，配置恢复后 sha256 一致。

## [1.12.0] 2026-11-01

### 新增
- **自动工作（无人值守，默认关）**：配置字段 `autoWork`（默认 `false`，关闭时行为完全不变）；面板新增「自动工作」开关卡片与只读队列状态卡（`GET /plugins/dsh-project-supervisor/auto-work`）；规则写入 `AGENTS.md`（常驻短节）、主管 SKILL（开关读回 / tick 循环 / 停止与收尾 / 安全禁区）与《主管手册》；队列文件 `<工作区>/.dsh/auto-work-queue.md` 固定四节（`## 排队任务` / `## 阻塞` / `## 待回答的问题` / `## 自动工作日志`），模板随主管技能分发（`templates/auto-work-queue.md`）。
- **只读排队消息脚本**：`skill/scripts/peek-mailbox.mjs`（读会话日志求 `team/message/queued` − `delivered` 差集；Node ≥24 用内置 zstd，回退 python3 zstandard；只读、不改会话状态），随技能目录安装到 `.dsh/skills/project-supervisor/scripts/`。
- **两个可选补丁目录**（默认不应用、需手动装）：`patches/auto-work-timed-ask`（preset standard 的 ask-user 条目改为 `timed`+短超时）与 `patches/auto-work-permission`（新增「自动工作」权限预设 = workspace-write + 审批 never）；各含 `patch.py`（status/apply/revert/selftest，带 `.bak` 备份、幂等、失败回滚）与 README。
- 插件 **0.8.0**：开关从四个增至五个（新增 `autoWork`）、新增只读队列状态路由、smoke/host-smoke 断言与插件 README 同步。

### 变更
- `sync-kit.sh`：主管技能目录新增 `scripts/` 逐字节同步（非空 + 必需脚本断言，缺文件显式失败）；`--check` 漂移与 `--global` 备份覆盖 scripts；主管模板由 5 个增至 6 个（新增 `auto-work-queue.md`）。
- 安装器（mjs/sh）技能预检与安装断言覆盖第 6 个模板与 `scripts/`；`selftest.sh` 新增：全部 `setup/patches/*/patch.py` 的 `py_compile`、两个自动工作补丁 `selftest`（只读真实安装）、`skill/scripts` 逐字节一致 + `node --check` + 缺文件失败断言、模板计数 5→6、`--check`/`--global` 的 scripts 漂移与备份断言；`build-dist.sh`/`build-public-repo.sh` 必需文件与计数同步（含 `skill/scripts/peek-mailbox.mjs` 与两个补丁目录）。
- 公开 README 与 market-entry 补充「自动工作（默认关）+ 两个可选补丁」说明（不夸大）；`安装说明.md` / `一键安装口令.md` / `朋友测试指南.md` 同步说明。
- 套件 1.12.0、插件 0.8.0。

### 验证
- `bash setup/sync-kit.sh --check` → 全部一致（44 个文件）；`bash setup/selftest.sh` → PASS 21 / FAIL 0（新增「自动工作补丁 selftest」与 py_compile 全补丁、scripts 逐字节/漂移/缺文件断言）；`bash setup/verify-facts.sh --offline` → PASS 9 / WARN 0 / FAIL 0；`bash setup/build-dist.sh` → exit 0（zip + sha256，约 600KB）；`bash setup/build-public-repo.sh` → exit 0（99 个文件）。

## [1.11.2] 2026-10-31

### 变更
- 发布前独立审查修复（报告 14 号不随包）：公开文档清掉内部评审引用与事故报告条目；`build-dist`/`build-public-repo` 排除 `research/1[0-9]-*` 并新增「公开 research 恰 7 文件 + 文档无内部评审引用」硬断言；安装记录 `withResearch/withSetup` 统一布尔；公开快照截图补齐第 5 张模型协作态图并在 e2e 截图前隐藏第三方 fixed 浮层；client 删除死 i18n 键（`quickRulesWhy`/`rulesPath`）；插件 0.7.3。
- DECISIONS 补 D55（审查结论与发布记录）。

### 验证
- selftest 20/20、verify-facts 离线 9/9、sync 40/40；dist/public 重建后排除断言通过；e2e 复跑通过。

## [1.11.1] 2026-10-31

### 变更
- 面板快捷动作从 4 个精简为 3 个：删除「复制规则文件路径」；「复制开工口令」文本末尾并入规则文件路径（`AGENTS.md`、`.dsh/skills/project-supervisor/SKILL.md`、`主管手册.md`），口令含 `{cwd}` 占位自动填充。
- 面板 footer 文案改为「四个开关、派发模式与模型协作」；插件 0.7.2。

### 验证
- client smoke 145 keys、`node --check` 通过；真实 GUI e2e PASS（3 个折叠说明、无 console error）；截图更新。

## [1.11.0] 2026-10-31

### 新增
- 安装器新增 `--with-setup`：除常驻规则/技能/手册外，把工程化脚本与文档（sync-kit / selftest / verify-facts / build-dist / build-public-repo / 一键安装口令 / 安装说明 / 朋友指南 / VERSION / CHANGELOG 等）装进目标工作区的 `setup/`，安装记录增加 `withResearch` / `withSetup` 字段。
- 一键安装口令默认改用 `--with-research --with-setup`，把 `research/`（调研 + DECISIONS 模板）与 `setup/` 一并装好；验收清单同步；不想要可去掉这两个参数。
- 公开仓库 `kit/` 同步携带上述脚本与两个团队模板，zip 路线与仓库路线装出内容一致。
- 插件 0.7.1：面板「复制一键安装口令」与「复制安装到其他工作区命令」同步带上 `--with-research --with-setup`，验收项增加 `research/` 与 `setup/` 检查。

### 验证
- selftest 新增第 20 项：`--with-research --with-setup` 后 `research/` 与 `setup/` 文件齐全、重复安装幂等；selftest 20/20。

## [1.10.0] 2026-10-31

### 新增
- 模型下拉改为**动态读取**本机 LLM 路由：host 新增 `GET /plugins/dsh-project-supervisor/models`（枚举 provider/model，60s 缓存、同源校验、405），client 读不到时回退内置两档。
- 自动模式新增**可编辑路由表** `modelCollaboration.autoRoutes`（6 类任务各选 `provider/model`，空=推荐默认）；自动/手动两套表独立持久化，部分更新互不覆盖。

### 升级
- 插件 0.7.0、套件 1.10.0；host-smoke 26 项、e2e 覆盖自动路由表选择并在刷新后保持；host 半侧需重启 `dsh web` 生效。

## [1.9.0] 2026-10-31

### 新增
- 主管面板「模型协作」卡（默认关）：总开关 + 两种模式（AI 自动选择 / 用户手动选择）+ 手动模式下 6 类任务（规划/架构、实现编码、独立评审、调研检索、文档整理、测试验证）→ 模型选择区；状态写 `.dsh/supervisor.config.json` 的 `modelCollaboration`。
- 插件 0.6.0：host 配置组校验（enabled/mode/assignments）、GET/POST 支持、host-smoke 21 项、e2e 覆盖开关/模式/6 行选择/刷新保持。
- 规则：AGENTS「模型协作（默认关，面板可开）」段 + SKILL 章节（auto/manual 路由、仅 subagent、记录与回落）。

### 说明
- 仅对 subagent 生效（可跨模型）；`spawn_teammate` 不能选模型；模型列表按本机 `list_subagent_models` 静态内置。

## [1.8.6] 2026-10-31

### 团队复用（A–F）+ 名额扩容

- 规则：AGENTS 新增「团队复用（优先复用人）」段；SKILL 新增「团队复用与派发」章（派发顺序、角色卡、warm-start、陈旧上下文、teammate vs subagent、度量与边界）。
- 模板：新增第 5 个技能模板 `templates/wake-brief.md`；新增 `setup/team-roster.template.md`、`setup/team-ledger.template.md`，安装器默认播种为 `.dsh/team-roster.md`/`.dsh/team-ledger.md`（只补缺失、从不覆盖）。
- 机制：本机 profile `cordis.patch.yml` 覆盖 `agent-team.maxMembers=16`（原组合包 8；备份 `.bak.<时间戳>`，重启 `dsh web` 后生效）；SKILL 体量预算从 32000B 提升到 35000B。
- 自测：installer 预检与安装断言加入名册/账本；selftest 模板计数 4→5；build-dist 必需文件加入 wake-brief 与两个模板；verify-facts 预算 35000。
- 验证：selftest/verify/build 回归结果见交付说明。

## [1.8.5] 2026-10-30

### 一键安装口令（复制到新会话即装）

- 新增 `setup/一键安装口令.md`：一段可复制的口令，粘贴到任意新工作区的新会话后，由 agent 使用公开仓库/Release 的安装器把套件装进当前工作区并逐项验收（仓库路线 / zip 路线 / Windows 三种命令，失败换路线、原样报错）。
- 主管面板快捷动作新增「复制一键安装口令（新工作区）」（插件 0.5.2）：一键把上述口令放进剪贴板；说明文案写明“装完新建会话生效”。
- 分发：`build-dist.sh` 必需文件清单加入 `一键安装口令.md`；插件 README / 安装说明 / 主管手册同步；口令安全边界=默认只补缺失、不覆盖已有文件、不自动 git commit/push。
- 验证：client smoke 122 keys、e2e 快捷动作 4 个折叠开关、selftest 18/18、verify-facts 9/9（详见下次回归记录）。

## [1.8.4] 2026-10-25

### 公开仓库审查修复（对外文档 / 自测 / 分发一致性）

- 背景：工作区另一个对话框对公开仓库与发布链做独立审查，报 2 项 blocking（zip 路线安装命令与目录名错、README/手册版本状态滞后）+ 12 项 advisory；本版逐条修复。
- 对外文档：公开 README 拆「仓库路线 / zip 路线」两套命令、修正 kit 结构块与许可证路径、补 `pnpm` 前置、版本状态更新为 1.8.4 并补 1.8.2/1.8.3；`安装说明.md` 把 `cd project-supervisor-kit` 改为通配、补 `--force` 清理语义、卸载指向完整清单、证据路径修正；《朋友测试指南》包名改 `<日期>` 占位、`--global-skill --force` 语义纠正、三开关 + 工作模式、Windows 表述统一、包大小更新；《主管手册》Release/插件版本/sha 引用/断链修正并补 1.8.4 历史行。
- 自测与分发：`compat-check` 增加 `<repo>/kit` 布局探测（干净克隆 32/32）；repo `kit/` 与 zip 的插件副本统一包含 README/screenshots/scripts，`kit/package.json` 由构建脚本补齐元数据；`install-supervisor.sh` 的 `--force` 清理排除 `*.bak.*`（不再产生双后缀备份）；`THIRD_PARTY_NOTICES` 修正 Python 与维护脚本措辞；分发包继续排除内部评审（新增 12 与 review-public-repo/）。
- 收尾（note 项）：zip 打包前统一权限（文件 644 / 脚本 755，避免解压后 600 无法共享读取）；插件 `files` 补 `scripts`（`npm test` 在 npm 安装场景可用）；加可选 `peerDependencies`（`@deepseek-ai/dsh`，optional）；公开仓库新增 `SECURITY.md` / `CONTRIBUTING.md`；朋友指南措辞修正（sidecar 只对最新版、Windows 无需 Git Bash）。
- 回归：selftest 18/18、sync 一致、干净克隆 compat-check 32/32、build 重建（sha 见 Release sidecar）。

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

- **评审修复（内部独立评审）**：触发判据排除套件文件（避免把装过套件的空目录判成旧项目）、统一最多 3 批；术语统一「新项目需求追问」、停止条件补「连续两批用默认」、项目根 README/DECISIONS 与 research/DECISIONS 区分、手册 smoke 13 项三字段、重启后需重新点开关的文案、e2e 增加 console error=0 断言（过滤预期内 config 端点 404/405）。
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
- 独立只读内部评审（记录不随包分发）：20 类错误覆盖表 + 3 项 blocking（密钥落地路径、文档只写不读、全局技能/dist 未更新）已全部修复，10 条 advisory 按批采纳；VERSION 1.1.0。

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

- `VERSION` / `CHANGELOG.md`：版本号与变更记录（源工作区为 `setup/` 下）。
- `setup/sync-kit.sh`：唯一同步入口，把源规则/技能/手册/调研转换为可移植 kit 副本；默认同步、`--check` 只检查（漂移打印 diff 并 exit 1）、`--global` 顺带更新全局技能（旧文件备份）；幂等。
- `setup/selftest.sh`：一键回归（语法检查、临时副本同步一致性、4 组安装、重复安装幂等、权限补丁自测、打包校验），任一失败 exit 1。
- `setup/verify-facts.sh`：联网复检调研引用链接、GitHub 星数、DSH 常量与补丁状态；`--offline` 跳过联网；仅 FAIL 时 exit 1。
- 维护顺序：改源文件 → `bash selftest.sh` → `bash sync-kit.sh` → `bash build-dist.sh` → `bash verify-facts.sh`。
