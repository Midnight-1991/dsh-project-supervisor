# team-permissions：给单个对话框指定权限范围与工具面（可选补丁 v2）

DSH 0.2.0-rc.2 里，主管（Lead）派发任务时**无法为单个对话框设置权限范围**：
`spawn_teammate` 只有 `name / description / prompt / context` 四个参数，子会话的权限在创建时固定
（沿用父会话的显式沙箱覆盖，审批策略固定 `never`）。补丁 v2 给 `spawn_teammate` 增加两个可选的
扁平参数，让主管按任务风险决定新对话框的**沙箱范围**和**可用工具面**：

| 参数 | 取值 | 效果 |
|---|---|---|
| `sandbox` | `read-only` | 只读沙箱：写文件、bash 写操作等会被沙箱拒绝（调研/评审/检查类） |
| | `workspace-write` | 只能写当前工作区（默认推荐，实现类任务） |
| | `danger-full-access` | 不限制（只有用户明确要求时才用） |
| `tools` | `read-only` | 工具面收窄到只读/查询类白名单（见下节），隐藏 write/edit/bash/子代理等工具 |
| | `full` | 保持原生工具集（显式写出来等价于不传） |

两个参数都不传时行为与原生完全一致（继承父会话范围、原生工具集）。两者相互独立、建议组合使用：
只读调研对话框通常 `sandbox: "read-only", tools: "read-only"` 一起传；`tools` 只影响工具可见性，
真正的写保护由 `sandbox` 提供。

## 改了什么（3 个包，4 个文件）

| 包 | 文件 | 改动 |
|---|---|---|
| `@deepseek-ai/dsh-experimental-tool-agent-team` | `lib/index.js` | `spawn_teammate` 增加可选参数 `sandbox`（三档枚举）与 `tools`（`read-only`/`full` 枚举）；execute 时透传 `permission: { sandbox?, tools? }`（两者都未传时不注入任何字段） |
| `@deepseek-ai/dsh-experimental-agent-team` | `lib/index.js`、`lib/types/roster.js` | 创建成员时把 `request.permission` 传给 `subagents.startContinuable`；`tools: "read-only"` 时向子会话 start request 注入 `toolFilter: { allow: [...] }` |
| `@deepseek-ai/dsh-subagent` | `lib/index.js` | `captureDelegatedPolicyOverrides(parent, permission)` 优先采用请求里的 `sandbox`，并在指定时不继承父会话的权限预设身份 |

改动全部带 `[team-permissions-patch]` 标记，逐条替换并做唯一性断言；每个文件写盘前先做 ESM 语法校验；
任何一步失败自动整体回滚。

## 只读工具白名单（`tools: "read-only"`）

`tools: "read-only"` 的实现用的是 DSH 已有的正式能力：`SubagentStartRequest.toolFilter`
（`ToolRestriction = { allow?: string[]; deny?: string[] }`），在子会话创建窗口内变成
`childCtx.tools.restrict()`，命中的工具**从子会话提示词里消失、也无法执行**；该限制还会写入子会话
descriptor（含 `allow/deny` 校验），所以**冷恢复（DSH 重启后继续）的对话框仍保持工具面**，直到该
对话框结束。相关源码：`@deepseek-ai/dsh-subagent/lib/types/types.d.ts:177-183`、
`@deepseek-ai/dsh-tools/lib/types/index.d.ts:508`、`@deepseek-ai/dsh-subagent/lib/index.js:522` /
`:1402` / `:1931`。

白名单共 7 个工具（`patch.py` 里的 `READ_ONLY_TOOLS`），来源均可查：

| 工具 | 来源包 | 源码位置 |
|---|---|---|
| `read` | `@deepseek-ai/dsh-tool-fs` | `lib/index.js:262` |
| `grep` | `@deepseek-ai/dsh-tool-fs-search` | `lib/index.js:1090` |
| `glob` | `@deepseek-ai/dsh-tool-fs-search` | `lib/index.js:782` |
| `skill` | `@deepseek-ai/dsh-tool-skill` | `lib/index.js:60` |
| `todo_write` | `@deepseek-ai/dsh-tool-todo` | `lib/index.js:96` |
| `web_search` | `@deepseek-ai/dsh-tool-web` | `lib/index.js:262` |
| `web_fetch` | `@deepseek-ai/dsh-tool-web` | `lib/index.js:737` |

几个刻意排除项及其原因：

- **`read_image` 不在白名单**：它在 `@deepseek-ai/dsh-tool-fs/lib/index.js:975` 注册，但是条件注册
  （源码 `:1191` 注释：`plus read_image while attachments is mounted`）。在没挂载 attachments 的
  部署里把它写进 `allow`，`restrict()` 会因未知工具名直接报错。只读评审通常看文本 diff 足够；确实需要
  看图再按部署调整 `READ_ONLY_TOOLS`。
- **团队协作/任务板/消息类工具（`send_message`、`list_agents`、`wait_agent`、`team_task_*` 等）
  不写进白名单**，但它们**仍然可见可用**：这些工具由 `@deepseek-ai/dsh-experimental-tool-agent-team`
  在成员自己的作用域里注册（`lib/index.js:230-231`），而 `tools.restrict()` 只过滤"继承的工具"
  （`@deepseek-ai/dsh-tools/lib/index.js:2944`、`:2969`），自身作用域注册的工具天然豁免；把它们写进
  `allow` 反而会因为不是全局继承工具而报 unknown。所以只读子会话**照样能汇报任务、发消息**。
- `bash`/`write`/`edit`/`subagent`/`workflow` 等工具不在白名单，被隐藏。

注意：`allow` 语义是"只保留列出的工具，其余全部移除"，所以工作区自定义插件工具（例如 `oil_ui_*`
之类）在 `tools: "read-only"` 下也会一起不可见。若你的部署用了 `minimal` 等非标准 agent preset、
缺少白名单里的某个工具名，`spawn_teammate` 会以 `tools.restrict() names unknown global tool "..."`
这类明确错误失败——按报错调整 `patch.py` 的 `READ_ONLY_TOOLS` 后重新 `revert` + `apply` 即可（标准
preset 已确认 7 个都在，见 `@deepseek-ai/dsh-web-app/presets/standard.patch.yml`）。

## 用法

```bash
# 在补丁目录里执行（需要 python3 + node）
python3 patch.py selftest     # 先在临时副本上验证：可应用、语法通过、可完整回滚
python3 patch.py status       # 查看 DSH 版本是否匹配、是否已应用
python3 patch.py apply        # 应用（自动备份到 ~/.dsh/patches/team-permissions/）
# 完整重启 DSH 后生效（当前进程已加载旧模块，刷新页面不会重载模块）
python3 patch.py status
python3 patch.py revert       # 一条命令回滚到原始文件
```

- 自动定位 DSH 安装：从 `dsh` 命令反查 `node_modules`；也可 `--nm /path/to/node_modules`
- 备份与清单：`~/.dsh/patches/team-permissions/backup-<时间戳>/manifest.json`
  （可用 `--dsh-home` 或环境变量 `DSH_HOME` 改位置，测试时建议指向临时目录）
- 重复 `apply` 幂等；部分应用（异常状态）会提示先 `revert` 再重跑

重启后主管即可这样派发（其余参数不变）：

```text
spawn_teammate({ name: "reviewer", description: "只读评审", prompt: "...", context: "fresh",
                 sandbox: "read-only", tools: "read-only" })
spawn_teammate({ name: "builder",  description: "实现",     prompt: "...", context: "fresh",
                 sandbox: "workspace-write" })
```

补丁装上后，主管规则里会按任务风险自动选择档位：调研/评审用只读组合，实现用
`workspace-write`，`danger-full-access` 只有用户明确要求才用。

## DSH 版本要求

本补丁只针对 **DSH 0.2.0-rc.2** 的安装布局与文件内容（锚点按该版本源码行编写）：

- `status` 会读取 `<node_modules>/@deepseek-ai/dsh/package.json` 的 `version`，打印检测到的版本并说明
  是否与本补丁目标版本一致。
- `apply` 在版本不一致时**默认拒绝**，并提示：
  `ERROR: 当前 DSH 版本 X 与本补丁目标版本 0.2.0-rc.2 不一致。`；确认要在其他版本上尝试，加
  `--force` 继续（断言失败会自动整体回滚，不会写坏文件）。找不到 `@deepseek-ai/dsh/package.json`
  时打印警告并按未知版本继续。
- 备份清单的 `manifest.json` 会记录 `dshVersion`，升级 DSH 后回滚/排查可对照。

DSH 升级或 `npx` 缓存重建后补丁会丢失（`status` 显示 unpatched），重跑 `apply` 即可；若新版本文件
内容变化导致断言失败，补丁会整体回滚并报错。

## selftest：为什么用备份原件

`selftest` 会在临时目录里对目标文件副本跑一遍完整流程（应用补丁 → `node --check` → 检查标记 →
从原始文件恢复 → 哈希校验回环），**不碰真实安装**。

补丁已应用时，真实安装里的文件不是"原始文件"，不能拿它当 selftest 输入，否则断言必然不匹配。
所以 v2 的 `selftest` 优先从最新（以及更早）的备份清单里取**备份原件**做输入，并逐个校验备份文件
的 sha256 与清单记录的 `sha256Before` 一致；输出会注明来源：

```text
selftest 输入: 使用备份原件 4/4（备份清单: .../manifest.json）
SELFTEST PASS: 4 个文件补丁可应用、语法通过、可完整回滚。
```

未应用、也没有可用备份时，退回用当前未打补丁文件；若文件已打补丁但备份缺失或校验失败，`selftest`
会明确失败并列出无法确定原始内容的文件（不会拿补丁后的文件自欺欺人）。因此**已应用和未应用两种
状态都应 PASS**。

## 从 v1 升级到 v2

`PATCH_VERSION` 升为 `"2"`。v1 的安装（4 个文件都带同样的 `[team-permissions-patch]` 标记）不能
直接 `apply` 覆盖，正确升级方式：

```bash
python3 patch.py revert    # 用 v1 的备份清单恢复原始文件
python3 patch.py apply     # 再应用 v2
# 完整重启 DSH
```

`status` 在检测到"文件已打补丁 + 最近清单版本是 v1"时会直接提示升级方式；`apply` 在已应用状态下
也会提示。v2 还新增了"部分应用（几份文件已打补丁、几份没有）"的显式拒绝，避免覆盖出混合状态。

## 边界与限制

- **审批策略仍固定 `never`，这是有意设计，不可配置**。原因：子对话框运行在后台，审批弹窗没有人
  应答（主管自己的审批策略也是 `never`，Team 面板只读，无法代孩子会话点"同意"）；若把子会话审批
  策略做成可配置的 `ask`，实际效果是对话框在需要审批时长期阻塞或失败，比直接拒绝更糟。审批策略属于
  用户的控制面（DSH 权限预设/approval 配置），补丁不应绕过用户设置的策略。需要人工审批的动作，请
  由用户在父会话里手动执行，或由用户调整全局权限预设；给子会话开审批不是正确用法。
- **`tools` 是工具可见性收窄，不是安全边界**：真正的写保护来自 `sandbox`。工具过滤只移除"继承的"
  agent 平面工具；成员自身作用域注册的团队工具（包括 `spawn_teammate`）仍可见——非 Lead 调用
  `spawn_teammate`/`interrupt_agent` 会被授权检查拒绝（`TEAM_LEAD_REQUIRED`），其余协作工具正常。
  不要用 `tools` 代替权限控制。
- **`read-only` 沙箱是沙箱级只读**：通过 DSH 沙箱生效（文件工具与 bash 写操作被拒绝），不是网络
  隔离；对话框仍可读文件、跑只读命令。
- **`write_scopes` 仍然只是提示**，不是锁；这个补丁管的是沙箱范围和工具面，不管文件范围。
- **多个 `npx` 缓存时**，默认只补丁 `dsh` 命令实际使用的那一份；有疑问用 `--nm` 指定。
- **`danger-full-access` 会失去沙箱保护**，**只在你明确知情并要求时使用**。
- `selftest` 验证的是"补丁能应用、语法通过、能回滚"，不覆盖运行期的工具注册与实际限制效果；重启后
  建议用一次只读小任务验证（例如让只读对话框尝试 `write`，应看不到该工具/被拒绝）。

## 附：文件清单与变更记录

```text
patch.py      # 全部逻辑：status / apply / revert / selftest
README.md     # 本文件
```

v2 变更：新增 `tools` 参数与只读工具白名单（roster 注入 `toolFilter`）；`selftest` 改用备份原件；
新增 DSH 版本探测与 `manifest.dshVersion`，版本不符 `apply` 默认拒绝（`--force` 可越过）；
新增部分应用状态拒绝；备份清单版本升到 2；README 补充白名单依据、版本要求、审批策略评估与 v1→v2 升级说明。
