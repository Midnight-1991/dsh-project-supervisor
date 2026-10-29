# 模型分工 P0 跨模型独立评审（2026-10-29）

> 评审者：`deepseek-official/deepseek-v4-pro`（只读）；实现者：`deepseek-flash`。评审对象为 P0「模型分工」规则层，不改 DSH 包。
> 评审输入：AGENTS.md / SKILL.md / `references/model-routing.md` / 四个模板 / 主管手册 / `research/13-model-routing-p0.md` / 分发链（sync-kit、build-dist、两安装器、selftest、VERSION、CHANGELOG）。

## 1. 结论

**有条件通过**（1 项 blocking，修后即通过）。

机制本身事实准确、三载体一致、P0/P1 边界清楚、隐私与降级可执行；唯一 blocking 是分发链漂移：`sync-kit.sh --check` 现为 **exit 1**（39 一致 + 1 漂移），导致打包进 dist zip 的 `research/README.md` 缺 13 号新文档索引行，且 `research/DECISIONS.md` D50 记的「sync 40/40 一致」与现状不符。

## 2. blocking（必须修）

**B1 · 分发链未重新同步，`sync-kit.sh --check` exit 1，dist 内 README 缺新文档索引**

- 现象：`research/README.md:23` 新增了 `| 13 | [模型分工 P0…](13-model-routing-p0.md) | …` 索引行，但 `setup/research/README.md` 仍是旧版（缺该行），两文件漂移。
- 命令证据：`bash setup/sync-kit.sh --check` 输出「漂移 setup/research/README.md」「结果: 1 个文件漂移（39 个一致）—— 运行 bash setup/sync-kit.sh 同步」，exit 1。
- 连带影响：`dist/project-supervisor-kit-2026-10-29.zip` 内的 `research/README.md`（10952B）**不含** `13-model-routing` 行，而 `research/13-model-routing-p0.md` 本身在 zip 里（2377B）。用户按打包后的 README 索引找不到新文档。
- 连带影响：`research/DECISIONS.md:288`（D50）写「sync 40/40 一致」，与当前 39/40 事实不符。
- 为什么 blocking：验收标准明确要求 `--check` exit 0、40 个文件一致；分发包索引与内容不一致属于交付缺陷。
- 修法：`bash setup/sync-kit.sh`（非 `--check`）重新同步，再 `--check` 确认 exit 0、`结果: 全部一致`；重打 dist zip 使 README 含 13 行；同步校正 D50 的「40/40」表述（若已同步则自然成立）。

## 3. advisory（建议，不阻塞）

**A1 · P1 补丁的 `reasoningEffort` 命名口径与 P0 文档不一致**

- `references/model-routing.md:10` 用 `reasoning_effort`（DSH 工具层 snake_case），`research/13-model-routing-p0.md:30` 写 P1 给 `spawn_teammate` 加 `provider/model/reasoningEffort`（camelCase）。DSH 现状：工具参数是 `reasoning_effort`，内部 `agentOptions` 字段是 `reasoningEffort`。建议 P1 落地时明确采用 snake_case（与工具层一致）并在文档统一，避免派发命令照抄 `reasoningEffort` 却不生效。

**A2 · P1 补丁可行性表述可更精确（非「一行」补丁）**

- `research/13:10` 说「startContinuable 的 request 支持 agentOptions，为 P1 补丁留了口子」——事实属实（见事实核验表第 4 条）。但 `spawn_teammate` 的调用链是 `tool(schema) → agentTeams.spawnTeammate() → startContinuable()`，当前 `dsh-experimental-agent-team/lib/index.js:579-584` 只向 `startContinuable` 传 `{ prompt, parent, toolFilter }`，**未转发 `agentOptions`**；要给 teammate 选模型，需同时改①`dsh-experimental-tool-agent-team/lib/index.js` 的 `spawn_teammate` schema（加 model 参数）②`dsh-experimental-agent-team/lib/index.js` 的 `spawnTeammate`（向 `startContinuable` 转发 `agentOptions`）。建议 P1 说明里写清是「两处补丁 + 重启」，避免读者误以为只靠 startContinuable 即可。

**A3 · 角色→effort 映射不完全自洽**

- `references/model-routing.md:27` 角色表给 planner/implementer/reviewer 标了 effort，但 researcher/docs/mechanical 未标；而 §5 配置 JSON 里 docs=low。建议 §3 表补 effort 列或注明「effort 见 §5」，消除两处取值来源的歧义。

**A4 · 本机路由描述里的「默认」语义可加一句**

- 文档多处写「实现/文档用默认 `deepseek-flash`」。`list_subagent_models` 实测返回 `deepseek-official/deepseek-flash`（显示名 DeepSeek-V41-Flash）与 `deepseek-official/deepseek-v4-pro`。建议在 §2 注明「默认模型 = 会话当前配置，本机实测为 flash」，避免用户换了会话默认模型后文档语义漂移。

## 4. evidence（实际执行的命令与关键输出）

| 命令 | 关键输出 / 退出码 |
|---|---|
| `wc -c AGENTS.md .dsh/skills/project-supervisor/SKILL.md` | `9998 AGENTS.md`、`31938 SKILL.md`（均达标） |
| `wc -l .dsh/skills/project-supervisor/templates/*.md` | task-brief 51 / plan 48 / review-gate 58 / ledger 36（合计 193） |
| `bash setup/verify-facts.sh --offline` | `PASS: 9 WARN: 0 FAIL: 0`、`结果: 通过`、exit 0 |
| `bash setup/sync-kit.sh --check` | `漂移 setup/research/README.md`、`结果: 1 个文件漂移（39 个一致）`、**exit 1** |
| `unzip -l dist/project-supervisor-kit-2026-10-29.zip \| grep -E 'references\|templates'` | 含 `skill/references/model-routing.md`(4866B) + 四个模板；`skill-improving-prompts/references/` 14 个 |
| `unzip -p …zip …/research/README.md \| grep '13-model-routing'` | 无输出（README 缺 13 索引行，见 B1） |
| `cat setup/VERSION` | `1.9.0` |
| `grep -n '1.9.0' setup/CHANGELOG.md` | `## [1.9.0] 2026-10-29`（第 5 行，含模型分工 P0 条目） |
| `list_subagent_models(provider="deepseek-official")` | 返回两条路由：`deepseek-official/deepseek-flash`、`deepseek-official/deepseek-v4-pro` |
| `git status --short` | 见评审者仅新增本文件；实现者改动（AGENTS/SKILL/模板/手册/研究/分发链）已在工作区 |

## 5. 事实核验表（4 条 DSH 能力）

| # | 待核验事实 | 判定 | 证据（DSH 源码） |
|---|---|---|---|
| 1 | `subagent` 支持 `provider`/`model`/`reasoning_effort` | **属实** | `@deepseek-ai/dsh-tool-subagent/lib/index.js:412-425`：`parameters` 含 `provider`/`model`/`reasoning_effort`（`modelSelectionEnabled` 时）；`:68` 强制「provider and model must be supplied together」；`:174` 注册 `list_subagent_models` |
| 2 | `spawn_teammate` 无模型参数 | **属实** | `@deepseek-ai/dsh-experimental-tool-agent-team/lib/index.js:245-278`：`parameters` 仅 `name`/`description`/`prompt`/`context`/`sandbox`/`tools`，无 provider/model；`:302` 的 `provider: context==="fork"?config.forkProvider:config.freshProvider` 是 fork/fresh 继承，非模型选择 |
| 3 | `list_subagent_models` 可查到两条路由 | **属实** | 直接调用返回 `deepseek-official/deepseek-flash` 与 `deepseek-official/deepseek-v4-pro` 两条 |
| 4 | `startContinuable` 的 request 支持 `agentOptions` | **属实** | `@deepseek-ai/dsh-subagent/lib/index.js:1671-1680`：`async startContinuable(spec)` → `const request = spec.request`(`:1672`) → `resolveChildAgentOptions(parent, request.agentOptions, childDepth)`(`:1680`)。P1 补丁可行性表述成立（但需两处转发，见 A2） |

## 6. 一致性检查

**三载体（AGENTS/SKILL/手册）+ 模板 + 研究文档**
- 边界句一致：AGENTS:63「subagent 可选 provider/model/reasoning_effort（成对…）；spawn_teammate 不能选，继承会话默认」；SKILL:169 同义并注明「（P1 补丁再做）」；手册:161 同义并注明「P1 才计划给 spawn_teammate 加补丁」。无矛盾。
- 路由表一致：model-routing.md §3、手册:165-170、research/13:23-26 的 flash/v4-pro 定位一致；与实际 `list_subagent_models` 返回一致。
- 命令模板「模型」行一致：AGENTS:71、SKILL:217（任务板模板）与 SKILL:281（命令模板）均为「模型：<默认 或 provider/model/effort；跨模型仅 subagent（先 list_subagent_models 校验）；评审换模型>」。
- 模板模型字段到位：task-brief:7（模型行）、plan:31（任务表「模型」列头）、review-gate:9（评审模型行）、ledger:29（模型事件类型）。四者与规则层表述一致。

**P0/P1 边界**：说清——P0 只对 `subagent` 生效、teammate 选模型留待 P1 补丁（AGENTS/SKILL/手册/research/13 五处口径一致）。

**隐私与降级可执行**：model-routing.md §5 `allowExternalModels:false` 只用默认 provider、§6 跨厂商需用户知情 + 不把密钥发子代理、§4 step5 不可用→回默认并在 report 记一行；手册:176 同义。规则层可执行，无悬空承诺。

**发现的矛盾**：仅 B1（`research/README.md` 与 `setup/research/README.md` 漂移 + D50「40/40」与事实不符）；其余为 advisory（A1/A2 命名与 P1 表述、A3/A4 描述粒度）。
