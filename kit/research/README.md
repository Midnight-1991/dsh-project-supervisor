# 调研总览：vibe coding「项目主管」怎么当

> 调研日期：2026-10-24。方法：项目主管并行开启 4 个研究对话框（各写各的文件、写范围互不重叠），产出 4 份调研报告；后续按功能/评审/学习追加 6 份专题报告（05 验收评审、06 零基础保护评审、07 新项目需求追问、08 追问评审、09 superpowers 学习笔记、10 工作流硬化评审）。主管再抽样核验引用（GitHub API 核对仓库与星数、抽查链接可访问性、核对官方文档原文）。
>
> 事实快照：2026-10-24。星数、外部链接、DSH 版本与源码行号都会漂移；复检用 `setup/verify-facts.sh`（自动抽查链接 / GitHub 星数 / DSH 常量，DSH 升级后跑）；精确数值请以复检输出为准。

## 报告索引

| 文件 | 主题 | 一句话结论 |
|---|---|---|
| [01-vibe-coding-supervisor.md](01-vibe-coding-supervisor.md) | vibe coding 主管的概念、GitHub 实践、可复用规则 | 「vibe coding 项目主管」不是标准术语；最接近的成熟形态是「自主主管」：状态外置、规划—派发—评审—落地分离、证据验收、人类 gate 最小化 |
| [02-multi-agent-supervisor.md](02-multi-agent-supervisor.md) | 多智能体 supervisor / orchestrator 模式 | 主管的核心职责是「定可验收产物 + 切分写范围 + 显式终止/依赖 + 只收摘要 + 亲自验收」；多智能体 token 约为单会话 15×，只适合高价值任务 |
| [03-chinese-community.md](03-chinese-community.md) | 中文社区「AI 项目经理 / 项目总监 / 主 Agent」资料 | 中文实践把主管职责外化为流程：意图路由、计划 DAG、单写者纪律、只读评审、确定性验收、Clean/Partial/Blocked 交付分级 |
| [04-dsh-agent-teams.md](04-dsh-agent-teams.md) | DSH 工作区 / 会话（对话框）/ Agent Teams 的真实语义 | 「对话框」= Session；teammate 是持久 child 会话，藏在会话页头 Team 面板；写范围只是提示、消息不重发、owner 不自动释放 |
| [05-acceptance-review.md](05-acceptance-review.md) | 主管载体与调研报告的独立只读验收 | 「有条件通过」：1 项 blocking（授权口径与 DSH 固定策略冲突）已修 |
| [06-beginner-guard-review.md](06-beginner-guard-review.md) | 零基础用户保护 20 类错误覆盖度评审 | 「有条件通过」：3 项 blocking（密钥落地、先读回、载体旧版）已修，复审判定通过 |
| [07-requirement-interview.md](07-requirement-interview.md) | 新项目需求追问的开源参考（MIT 为主） | 可照抄的是「追问预算与节奏」：spec-kit 的 5 问定额 + superpowers 的一条一问/HARD-GATE + BMAD 的快慢双路径；8 个仓库中 6 个 MIT |
| [08-interview-review.md](08-interview-review.md) | 新项目需求追问功能的独立只读评审 | 「有条件通过」：2 项 blocking（触发判据把套件 AGENTS.md 当旧项目证据、批数上限矛盾）已修，9 条 advisory 已处理 |
| [09-superpowers-learning.md](09-superpowers-learning.md) | superpowers 项目（MIT）可迁移的 14 个工作流机制 | 值得学的是流程而非口号：计划落文件 + 任务 brief、每任务实现/评审分离、完成声明过验证门、返工有上限、裁决进账本 |
| [10-hardening-review.md](10-hardening-review.md) | 工作流硬化 14 条与套件 v1.8.0 的独立只读评审 | 「有条件通过」：3 项 blocking（AGENTS 命令模板与两段式冲突/套件漂移/SKILL 体积口径）已修，修后 scoped re-review 复核通过 |

## 交叉结论（至少两份报告共同支持）

1. **完成定义先行**：写不出验收标准就不派发（01、02、03 一致）。
2. **状态外置**：任务状态放任务板/文件，不放在对话里；换会话能恢复（01、02）。
3. **实现与评审分离**：写文件的对话框不能给自己签收；主管或独立评审只读核验（01、03）。
4. **证据取代断言**：完成必须附 diff / 测试日志 / 命令输出；「流程跑完」≠「质量通过」（01、02、03）。
5. **写范围单写者**：按文件/目录切分，同一文件同时只有一个写者（02、03、04）。
6. **并行只给独立工作流**：过度拆分时协调开销超过收益；默认 2–4 个，Claude Code 官方建议 3–5 人、每人 5–6 个任务（02）。
7. **主管不要抢活**：派发后自己重写会浪费并行收益；主管做决策、整合、验收（02、03）。
8. **显式终止与有限返工**：同一问题最多定点返工 2 次，禁止无限「再优化」；失败回到主管重新分派（02、03）。
9. **人类 gate 最小化**：只在取舍、花钱、不可逆操作时打断（01、03）。
10. **仪式随风险伸缩**：小改动直达实现，大改动才走完整 spec / 架构 / 评审（01、03）；简单任务不该用多代理（02）。
11. **追问要有预算与节奏**：先查已有上下文再问、每题带推荐答案、明确退出通道、问完落盘；spec-kit 把澄清做成「最多 5 问」，superpowers 用「一条消息一问 + HARD-GATE」，BMAD 用「快路径/教练路径」让用户选深度（07）。
12. **工作流硬化**：计划写成文件、每任务实现与评审分离、完成声明必须过验证门、返工与轮次有上限、裁决进账本；规则用模板/命令固化而不是靠记忆（09）。

## 落地映射（调研做法 → DSH 机制 → 本工作区文件）

| 调研做法 | DSH 对应机制 | 落地点 |
|---|---|---|
| 共享任务板 + 三态 + 依赖 | `team_task_create` / `blocked_by` / `claim` / `complete` / CAS `expected_revision` | `AGENTS.md`「对话框 = 会话」一节；`SKILL.md` 第三、五步 |
| 每工作流一个独立执行者 | `spawn_teammate(context=fresh)` | `AGENTS.md`「并行纪律」；`SKILL.md` 第四步 |
| 命令自包含（防止上下文断裂） | fresh 子会话不继承 Lead 记忆 | `AGENTS.md`「命令模板」；`SKILL.md` 命令模板 |
| 写范围隔离（无文件锁，靠主管切分） | `write_scopes` 仅提示 | `AGENTS.md`「并行纪律」；`SKILL.md` 反模式 |
| 只读评审 / 证据验收 | Lead 亲自跑测试、看 diff、抽查文件 | `AGENTS.md`「验收与收敛」；`SKILL.md` 第六步 |
| 有限返工 + 失败回到主管 | `send_message` 修正重派 / `interrupt_agent` / 任务 reassign | `AGENTS.md`「验收与收敛」；`SKILL.md` 第五步 |
| 人类 gate 最小化 | 用户只对主管下目标；主管按授权边界决定是否问 | `AGENTS.md`「中枢决策」「沟通」 |
| 状态与决策外置 | `AGENTS.md` / 任务板 / `research/DECISIONS.md` | `AGENTS.md`「项目收尾」 |
| 计划与任务简报文件化 | 工作区文件 + fresh 对话框读 brief，不依赖 Lead 记忆 | `templates/plan.md`、`templates/task-brief.md`；`SKILL.md`「计划与任务简报」 |
| 每任务两段式评审 | 实现者与评审者分离；评审输入 brief+report+diff | `templates/review-gate.md`；`SKILL.md`「两段式交付」 |
| 裁决账本 | 每轮决定/裁决/阻塞记一行，换会话可恢复 | `templates/ledger.md`；`SKILL.md`「任务账本」 |

## 核验记录（主管抽样，非口头采信）

- GitHub API 逐个核对被引仓库：DevSupervisor 27★、vibectl 5★（原 jonradoff 301 迁移）、spec-kit 142,666★、BMAD 54,493★、agent-os 5,538★、pi-super-devteam 0★、AIPM-Wiki 430★、aipm-skill-pack 1★、agency-agents-zh 21,550★、vibe-coding-guide 16★、project-dev-orchestration 0★、MetaGPT 71,004★、ChatDev 34,584★、Swarm 22,073★、LangGraph-supervisor 1,657★、AgentScope 33,812★、AutoGen 61,545★——均存在；星数为 2026-10-24 抓取值，允许 ±1★ 正常漂移（spec-kit 实测 142,665 vs 报告 142,666）；评审补核 4 个中文仓库 ShanchunAI_Protocol_16Layers 0★、vibe-coding-cn≈18k、ai-guide≈22k、Vibe_coding_guide 239★，均一致（仓库存档说明 `agency-agents-zh` 的 About 写 277 角色/20 部门，README 写 328 角色/22 部门，报告采用 README 数字）。
- 链接可访问性抽查：`code.claude.com/docs/en/agent-teams`（官方文档原文核对，含「避免文件冲突」「Lead 不要抢活」「3–5 人」等说法）、`raw.githubusercontent.com/.../DevSupervisor/main/docs/agent-loop.md` 200、掘金/腾讯云文章 200、langgraph-supervisor-py 与 AgentScope 仓库 200。
- 以下来源 2026-10-24 复核可访问（HTTP 200）并读到原文，已从「二手」升级为已核验：`anthropic.com/engineering/built-multi-agent-research-system`（原文「multi-agent systems use about 15× more tokens than chats」）、`cognition.ai/blog/dont-build-multi-agents`（两原则「Share context」「Actions carry implicit decisions」）。若换网络环境被反爬，按二手对待。
- DSH 侧核验：`AGENTS.md` 与 `.dsh/skills/project-supervisor/SKILL.md` 创建后均在当前会话即时生效（无需重启/新会话）；`maxMembers=16`、`maxTasks=256`、`maxPendingMessagesPerMember=64`、`maxMessageBytes=65536` 已在 `dsh-experimental-agent-team/lib/index.js` 行号级核对。

## 局限与存疑

- 四份报告均为一手 README / 官方文档 / 文章级调研，未运行或深度审计这些项目；小星数项目只能当「案例」不当「最佳实践」。
- 「vibe coding 项目主管」不是行业标准岗位，中文与英文社区命名不统一；规则是从实践归纳的，不是权威规范。
- 中文社区部分文章受微信/知乎风控无法核验正文，报告中已如实标注、未引用其内容。
- DSH 的 Agent Teams 是实验能力：无 worktree、无文件锁、无跨进程 exactly-once；主管的纪律（单写者、亲自验收）比机制约束更重要。
- superpowers 部分为上游仓库静态阅读（2026-10-25，MIT），未运行其技能或钩子；其「多 harness 钩子」不适用于 DSH。

## 一句话给未来会话

**主管负责把模糊目标变成可验证的契约，并把契约派给独立的对话框；验收看证据，不看口头承诺。**
