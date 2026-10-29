# 模型分工（Model Routing · P0）

> 目标：让不同角色用不同模型，**规划/评审用强模型、实现/文档用快模型**，并用「跨模型评审」降低相关性盲区。
> 版本：P0（规则层，2026-10-29）。P1 计划给 `spawn_teammate` 加模型参数，让对话框本身也能选模型。

## 1. 能力边界（先认清，不然写了参数也不生效）

| 通道 | 能否选模型 | 说明 |
|---|---|---|
| `subagent`（子智能体） | ✅ | 工具参数 `provider` + `model`（必须成对）+ 可选 `reasoning_effort`；派发前用 `list_subagent_models` 查可用路由；跨 provider 继续已有会话通常不允许 → 用 fresh |
| `spawn_teammate`（对话框） | ❌ | 只有 name/description/prompt/context；provider 是 `spawn`/`fork`（继承方式），模型由会话默认配置决定，所有成员继承 |
| 面板 / 配置文件 | 记录与策略 | 本 P0 不新增面板控件；路由策略写在本文与 `.dsh/model-routing.json` |

## 2. 本机可用路由（实测，2026-10-29）

| 路由 | 特点 | 建议用途 |
|---|---|---|
| `deepseek-official/deepseek-flash` | 快、便宜；默认模型 | 实现、文档、机械批量、常规调研 |
| `deepseek-official/deepseek-v4-pro` | 更强推理/编码，成本更高 | 规划/架构/裁决、**独立评审/红队**、复杂调试、最终质量把关 |

> 路由随 DSH 配置变化；**每次派发前**用 `list_subagent_models`/`list_subagent_models(provider)` 实测，不要写死记忆。

> 默认模型 = **会话当前配置**（本机实测为 `deepseek-flash`）；换会话默认模型后，按 `list_subagent_models` 实际返回调整。

## 3. 角色 → 模型默认策略

| 角色 | 默认路由 | 理由 |
|---|---|---|
| planner / architect / arbiter | `deepseek-v4-pro`（effort high） | 决策错误会放大到所有下游任务 |
| implementer | `deepseek-flash`（effort medium） | 迭代密集，token 成本敏感 |
| reviewer / red-team | `deepseek-v4-pro`，且**与实现者不同** | 跨模型/跨档位降低同模型自洽盲区 |
| researcher / docs | `deepseek-flash` | 产出以资料/格式为主 |
| mechanical（改名/链接/格式化） | `deepseek-flash` | 不必要用强模型 |

原则：**评审必须换模型**；若当前只有单一路由，退化为「同模型 + fresh 上下文」，并在评审 report 里标注「非跨模型」。


> 表中 not 列 effort 的角色默认不指定 effort（取会话默认）；`docs/researcher` 等取值见 §5 配置示例。

## 4. 派发流程（主管照做）

1. `list_subagent_models` 查可用路由（agent 工具；或按上次记录核对）；
2. 读项目可选配置 `.dsh/model-routing.json`（见 §5）；无文件用 §3 默认；
3. 在 task brief 写「计划模型」；命令模板写 `模型：<provider/model/effort 或 默认>`；
4. 调用 `subagent` 时传 `provider`、`model`、可选 `reasoning_effort`；
5. 不可用/报错/超配额 → 回默认模型继续，**在 report 记一行**原因与影响；
6. 完成后在 `LEDGER.md` 记实际模型；重要取舍记 `DECISIONS.md`（含 A/B 结果）。

## 5. 可选配置：`.dsh/model-routing.json`

```json
{
  "enabled": true,
  "allowExternalModels": false,
  "roles": {
    "planner":     { "provider": "deepseek-official", "model": "deepseek-v4-pro", "effort": "high" },
    "implementer": { "provider": "deepseek-official", "model": "deepseek-flash",  "effort": "medium" },
    "reviewer":    { "provider": "deepseek-official", "model": "deepseek-v4-pro", "effort": "high" },
    "docs":        { "provider": "deepseek-official", "model": "deepseek-flash",  "effort": "low" }
  }
}
```

- `allowExternalModels`：`false` 时只允许与默认模型同一 provider（跨厂商=把任务内容发给另一家，必须用户知情）；
- 文件缺失/字段非法：按默认策略，不阻塞；`model` 为空字符串视为「默认」。

## 6. 隐私与安全

- 跨厂商/跨 provider 会把**任务内容**发给对应厂商；涉及用户私有代码/数据时先征得同意；
- 不要把密钥、`.env`、用户隐私数据作为 prompt 发给任何子智能体；
- 子代理权限仍受创建时固定策略约束（审批 never、写范围提示非锁）。

## 7. A/B 验证（用数据判断值不值得扩大）

同一评审任务分别跑：
- A：与实现同模型（如 flash）+ fresh 上下文；
- B：不同模型（如 v4-pro）。
记录：blocking 命中数、误报数、假阴性（人工复核）、耗时、token/成本、是否发现 A 漏掉的问题。
结论写 `DECISIONS.md`；若 B 没有稳定收益，就只在「关键交付」使用跨模型评审。

## 8. 不要做

- ❌ 用强模型跑机械任务（贵且慢，不提升质量）；
- ❌ 为简单任务跨模型（协调/成本 > 收益）；
- ❌ 只改命令模板不传实际参数（“建议模型档位”只是文字，不会生效）；
- ❌ 把“模型多样性”当万能药：同模型 fresh 评审通常已够，跨模型的价值需 A/B 证明；
- ❌ 跨模型继续已有子会话（route 变更通常要求 fresh）。
