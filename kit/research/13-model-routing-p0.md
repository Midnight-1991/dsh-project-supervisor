# 模型分工 P0：让子智能体用不同模型（2026-10-29）

> 决策记录见 `research/DECISIONS.md` D50；规则落点：AGENTS「模型分工」、主管技能 `references/model-routing.md`、主手册同名章节。

## 背景

用户希望「不同模型协作、发挥各自特长」。DSH 现状：
- `subagent` 工具支持 `provider` + `model`（成对）+ `reasoning_effort`，可用 `list_subagent_models` 发现路由；
- `spawn_teammate` 只有 4 个参数（name/description/prompt/context），没有模型参数，teammate 继承会话默认模型；
- 底层 底层 `startContinuable` 的 request 支持 `agentOptions`，但 `teammate` 选模型需**两处补丁**：① `spawn_teammate` schema 加 provider/model/reasoning_effort 参数；② `agent-team` 的 `spawnTeammate` 向 `startContinuable` 转发 `agentOptions`；改后需重启 DSH。

## P0 范围（只做规则层，不改 DSH 包）

1. 角色 → 模型默认策略（规划/评审用强模型，实现/文档用快模型；评审与实现不同模型）；
2. 跨模型评审进入两段式交付（实现用默认模型、评审用 v4-pro）；
3. 派发流程与命令模板加「模型」字段；brief 写计划模型、LEDGER 记实际模型；
4. 可选 `.dsh/model-routing.json`（角色映射 + `allowExternalModels` 隐私开关）；
5. 降级规则：路由不可用/报错回默认并在 report 记一行；
6. 跨模型 A/B 验证方法（blocking 命中/误报/耗时），用数据决定是否扩大。

## 本机可用路由（2026-10-29 实测）

| 路由 | 定位 |
|---|---|
| `deepseek-official/deepseek-flash` | 默认、快、便宜 |
| `deepseek-official/deepseek-v4-pro` | 更强推理/编码，成本更高 |

## 不做什么（留给 P1/P2）

- P1：给 `spawn_teammate` 加 `provider/model/reasoning_effort（沿用工具层 snake_case；内部 agentOptions 字段名为 reasoningEffort）`（补丁，重启生效）；
- P2：面板「模型分工」卡、自动路由、成本统计与 A/B 面板化；
- 不做隐蔽遥测；跨厂商内容外发必须用户知情。

## 验收方式

- 规则：AGENTS/SKILL/手册/模板关键词与预算（AGENTS ≤10000B、SKILL ≤32000B）由 `verify-facts` 检查；
- 行为：用同一评审任务跑「同模型 vs v4-pro」对比，记录结论；
- 分发：sync/selftest/build-dist 覆盖 `references/` 文件。

## 限制与风险

- teammate 选模型需补丁；P0 只对 subagent 生效；
- 跨 provider 继续已有子会话通常不允许，跨模型任务用 fresh；
- 模型多样性收益需 A/B 证明，不应默认扩大；
- DSH 升级不影响 P0（纯规则/文档）。
