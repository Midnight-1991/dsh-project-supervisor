# 研究④：DSH 对话框/团队语义（本机文档核实）

本机 DSH 版本 `0.2.0-rc.2`（`~/.npm/_npx/<npx-hash>/node_modules/@deepseek-ai/dsh/package.json`）；当前 web profile 的 `package.json:21` 已启用 `@deepseek-ai/dsh-experimental-agent-team-profile`，即本工作区「项目主管 + Agent Teams」正是该机制的官方入口。下文结论均据本机安装包 README 与代码/文件抽查，非外部资料。

> 事实快照：2026-10-24（DSH 0.2.0-rc.2）。DSH 升级后版本号与源码行号都会变化，复检用 `setup/verify-facts.sh`。

## 【对象模型】

DSH 里对象分三层，工作区的「对话框」= **Session**：

1. **Workspace（工作区/项目）**：持久「项目目录登记」，不是目录本身。`ctx.workspaceRegistry` 维护 `workspaces` 表（键 `WorkspaceId`）与全局状态 `workspaceIds`（显示顺序）、`archivedSessionIds`、`pinnedSessionIds`、`defaultWorkspaceId`。会话按「运行目录」自动归组，一个 Session 只能属一个项目；目录丢失的会话留在 Ungrouped；移除项目、归档会话都不删除文件与会话历史。
2. **Session（GUI 的「对话框」）**：一次独立对话，带 cwd 与持久会话日志。Web 侧按标准 addressed-subagent 地址打开子会话；侧边栏按 `origin: 'subagent'` 隐藏子代理来源会话——**teammate 的会话不会出现在左侧对话列表里**，只能从会话页头的「智能体团队」面板进入。面板是只读的：可看 roster 与任务板、点成员行打开其子会话，但不显示 peer 消息、不能 spawn/rename/interrupt/改任务；会话启用 Teams 后需刷新页面才接收投影。
3. **Team（隐式）**：每个普通运行时 root 就是一个隐式 Team 的 Lead，`TeamId` = Lead 的 `SessionId`；没有跨会话的独立「团队对象」。`spawn_teammate` 创建持久 child 会话 + roster 记录，roster/消息/任务状态全部从 Lead 会话日志回放。roster 状态：`running`、`inactive`（没有轮次在执行，含未加载/需冷恢复，**不代表任务完成**）、`provisioning`、`failed`。

## 【Agent Teams 能力与边界（表格）】

| 能力 | 语义与边界 |
|---|---|
| `spawn_teammate` | 仅 Lead 可调；`context=fresh`（默认，不继承 Lead 记忆）或 `fork`（只捕获一次 Lead 已完成 turn 前缀）；名字小写 kebab、永久保留、绝不复用；`maxMembers=16`（含失败成员） |
| `send_message` | 任何成员→任何成员/Lead，持久不丢不重复；running 目标在最近步骤边界 Steer，inactive 目标启动或冷恢复；结果 `accepted`/`queued`，**queued 已持久化，绝不能重发**；`maxPendingMessagesPerMember=64`、`maxMessageBytes=65536` |
| `list_agents` | 返回成员 `target` 与可用性（`running`/`inactive`/`provisioning`/`failed`）；`inactive` 只表示无轮次执行 |
| `wait_agent` | 等待下一次 roster/消息/任务变化；10s–1h（默认 30s），只报告超时与否；不唤醒 inactive 成员；无 running/provisioning 时立即 `noProgress` |
| `interrupt_agent` | 仅 Lead；停止 teammate 当前轮次、保留排队消息（keepInbox），**不释放任务 owner** |
| `team_task_*` | create/list/get/update；`blocked_by` 依赖 DAG，依赖全完成才可 claim；每次变更 CAS `expected_revision`，过期被拒；`write_scopes` 仅作重叠提示、绝不阻塞；`maxTasks=256`（活动）、list `limit≤100`、`cursor` 分页；owner 不会自动释放 |

## 【主管可操作规则】

- **先登记再开工**：每个工作流一个 `team_task_create`，写清目标、输入、验收标准与唯一写范围（`write_scopes`）；teammate 先 `team_task_get` 取当前 revision → `claim` → 干完 `complete`。
- **并行**：上限 16 成员，但按独立性默认 2–4 个（工作区 AGENTS.md 亦如此）；无共享文件、无先后依赖才并行，有依赖用 `blocked_by` 串行；同一文件同一时间只许一个对话框写。
- **命令自包含**：teammate 是 fresh 子会话，不继承你的记忆；命令里必须给绝对路径、约束、唯一写范围、交付格式。共享同一 cwd，改动立即可见。
- **消息纪律**：`accepted`/`queued` 都算发送成功，绝不重发；`inactive` 不是完成，也不是结果。`wait_agent` 前先 `list_agents`，确认有成员 running/provisioning，否则立即 `noProgress`——此时应先用 `send_message` 唤醒所需 inactive 成员；超时/唤醒后重新 `list_agents`。
- **验收**：产出以工作区文件 + 任务板 revision 为准，聊天摘要不作证据；Bash、formatter、codegen 与直接外部写入可绕过文件版本校验，Lead 必须亲自看 diff、跑测试。给出最终答复前必须等待必需的 teammate（`wait_agent`）。
- **任务 owner 手动管理**：成员失败/中断/退出都不会自动释放 owner，需 Lead 用 `team_task_update` 的 reassign/complete/edit 处理。
- **导航**：teammate 会话藏在页头 Team 面板后，不在侧边栏；向用户汇报时给「文件名 + 路径」而非会话入口。

## 【限制与坑】

- **单进程、共享 checkout**：无 worktree、远端成员、merge 或文件锁；`write_scopes` 只是提示性 metadata，执行面靠 Lead 协调与复核。
- **扁平不可变 roster**：只能 Lead 建直接 teammate；不支持嵌套团队、改名、删除、名字复用；Web 面板无生命周期控制。
- **mailbox 只保证进程内重试+目标去重**，不保证跨进程 exactly-once；不要让多个 harness 进程并发操作同一 Team。
- 每次 roster/任务变化会把完整 roster 与未删除任务板广播给所有已连接浏览器（不分 Session）。
- 启用 Teams 组合包后，普通 `subagent`/`subagent_fork` 与同名全局 child control 被禁用；Workflow 的 `agent()` 仍走 base 的 spawn 提供方创建 fresh 一次性子代理，但该工具可见性有已知时序问题（子代理可能短暂拿到 Team 策略与工具，descriptor 到位后被拒）。
- fork 子会话只继承 spawn 那一刻之前已完成的 Lead turn；之后 Lead 的新轮次不会同步给 teammate。
- **AGENTS.md 加载与刷新**：首次请求注入一条持久基线（先用户全局 `$DSH_HOME/AGENTS.md`，再从项目根到会话 cwd 逐级）；无 watcher，刷新由「成功的第一方 read/write/edit touch」「恢复会话对账」驱动；`bash` 里 `cd` 不触发嵌套发现。`dsh-base` 默认预算 `maxBytes=65536`，候选 `AGENTS.md`/`CLAUDE.md` + `AGENTS.local.md`/`CLAUDE.local.md` 本地 overlay；项目根标记 `.git`。
- **技能生效时机**：根目录按 rank 扫描——`<projectRoot>/.dsh/skills`（100）、`<projectRoot>/.agents/skills`（200）、`customSkillDirs`（300）、`~/.dsh/skills`（400）、`~/.agents/skills`（500）；只认一层：`<root>/<name>/SKILL.md` 或 `<root>/<name>.md`（不认嵌套、缺有效 frontmatter 静默跳过）。watcher 使新增/改名/删除在**下一个模型步骤**生效，无需重启或新会话；第一方 write/edit 会同步失效。`projectRoot` = 最近含 `.git` 的祖先，否则回退 cwd——本工作区无 `.git`，故工作区 `.dsh/skills` 直接生效。
- **本会话活体证据（实测，无需新会话）**：`AGENTS.md` 于 20:14:55 创建后，其内容以工作区指令消息注入本对话框；`.dsh/skills/project-supervisor/SKILL.md` 于 20:15:09 创建后，本会话的技能目录在后续步骤被替换为含 `project-supervisor` 的新目录。两者均未重启、未开新会话。
- 两处已核实：`.dsh/skills/project-supervisor/` 目录先建、`SKILL.md` 后到，目录存在但文件缺失期间该 skill 不算有效——给技能必须落 `SKILL.md` 文件。

## 【来源（文件路径）】

- `~/.npm/_npx/<npx-hash>/node_modules/@deepseek-ai/dsh-experimental-agent-team/README.zh.md`（上限表、roster、mailbox、任务板、限制）；同包 `lib/index.js:1669-1673` 默认常量 `DEFAULT_MAX_MEMBERS=16`、`DEFAULT_MAX_TASKS=256`、`DEFAULT_MAX_PENDING_MESSAGES=64`、`DEFAULT_MAX_MESSAGE_BYTES=65536`、`DEFAULT_DISPOSAL_TIMEOUT_MS=5e3`，`:1689-1693` schema 默认值；错误码 `TEAM_MEMBER_LIMIT`(:564)、`TEAM_MAILBOX_FULL`(:826)、`TEAM_TASK_LIMIT`(:1470)
- `.../dsh-experimental-tool-agent-team/README.zh.md`；同包 `lib/index.js:15-27` 固定 Team 策略（显式委派、共享 cwd、写范围仅 advisory、不重发、Lead 必须等待），`:336` wait 10s–3600000ms 默认 `3e4`，`:244/:297/:333/:355` 各工具描述（`:324` 是 `list_agents` 描述；`wait_agent` 描述已校正为 `:333`）；工具名抽查计数 `spawn_teammate`/`send_message`/`wait_agent`/`interrupt_agent`/`team_task_update`
- `.../dsh-experimental-client-ui-agent-team/README.zh.md`（页头 Team 面板、只读、导航、晚启用需刷新、无 mailbox timeline）
- `.../dsh-experimental-agent-team-profile/README.zh.md`（组合包默认关闭、禁用旧 subagent 控件、共享 checkout）
- `.../dsh-workspace/README.zh.md`（持久形态、归档/隐藏/移除语义）
- `.../dsh-client-ui-workspace/README.zh.md`（侧边栏分组、`origin: 'subagent'` 行隐藏、addressed-subagent 导航）
- `.../dsh-agent-instructions/README.zh.md`（基线/刷新/预算）；同包 `lib/index.js:18-19` 本地 overlay 候选与 `DEFAULT_MAX_SOURCE_BYTES=1048576`
- `.../dsh-skill-filesystem/README.zh.md`（rank 表、深度 1、watcher）；同包 `lib/index.js:155-161` 的 `project-dsh`/`project-agents` 根路径定义
- 本机配置：`~/.dsh/profiles/web/package.json:21`；工作区实测文件：`~/Documents/deepseek-harness/<工作区>/AGENTS.md`、`~/Documents/deepseek-harness/<工作区>/.dsh/skills/project-supervisor/SKILL.md`
