# vibe coding 项目主管：概念、GitHub 实践与可复用规则

> 调研时间：2026-10-24。标注约定：带链接且能在 README/官方文档核到的写为「事实」；标〔推断〕的是调研者判断。星数为当日 GitHub 页面/API 核对值，仅表示热度，不代表成熟度。
>
> 事实快照：2026-10-24；星数/链接会漂移，复检用 `setup/verify-facts.sh`。

## 【概念与现状】

**事实**：2025 年 2 月初，Andrej Karpathy 在 X 上提出 "vibe coding"：「你完全交给感觉（vibes），拥抱指数级增长，忘记代码的存在」——不逐行读 diff，遇到问题直接让模型重写（[Simon Willison 引用页](https://simonwillison.net/2025/Feb/6/andrej-karpathy/)）。2025 年 11 月，Collins 词典把 vibe coding 选为年度词汇，定义为「用自然语言经由 AI 生成计算机代码的软件开发方式」（[RTE 报道](https://www.rte.ie/entertainment/2025/1106/1542331-collins-word-of-the-year-for-2025-revealed/)）。

**事实**：2025 年 9 月，GitHub 发布开源工具包 Spec Kit，提出「让规格成为工程流程的中心」，把 spec 一路带到 plan、tasks、实现与收敛（[GitHub 博客](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)）。其文档现给出的 SDD 主流程是 `Specify → Plan → Tasks → Implement → Converge`，constitution 每项目建一次（[Spec Kit 文档](https://github.github.io/spec-kit/)）。

**事实**：「vibe coding 项目主管」并非标准术语，GitHub 上没有唯一权威实现；相近形态至少四类：自主开发主管（supervisor）、面向 agent 的项目管理平台、角色化方法论框架、以及给工程经理的指南与提示词模板。

〔推断〕演进方向是：从「人盯着聊天窗口写提示」转为「人定标准、拆任务、验结果，agent 执行」，主管的价值从写代码转移到**把不可验证的模糊目标变成可验证的契约**。

## 【代表项目清单】

| 仓库 | 做什么（事实） | 主管机制 | 可借鉴点 |
|---|---|---|---|
| [nTony46/DevSupervisor](https://github.com/nTony46/DevSupervisor)（27★） | 自主软件工作主管：给目标，它规划、派发、独立评审、落地并验证 | Python 确定性内核管状态机/调度/租约/审批 gate，模型只做思考；状态存 SQLite 而非对话；内置 12 种角色（不含 supervisor；investigator/planner/architect/build/reviewer/qa/landing/evaluator 等） | 三条硬保证：写者不能批自己、需评审不能跳审、批准后必须落地并验证；人类只在真正属于你的决策处停下；预算未声明不花钱 |
| [metavert-io/vibectl](https://github.com/metavert-io/vibectl)（原 jonradoff/vibectl，301 迁移） | 自托管「agent 时代的项目管理」：issue、部署、健康检查、反馈流水线、用量分析，围绕 Claude Code 构建 | 每项目自动生成 `VIBECTL.md`（含未结 issue、决策、部署信息），agent 每次会话前必读；MCP server 24 个工具（数字未独立核到）；反馈→AI 分诊→issue→生成经安全扫描的 prompt 派发；PM review agent 做项目健康评估 | 「项目当前状态」编译成 agent 可读的单一事实源；人类审批 plan mode；决策变更留审计日志 |
| [vadim-works/vibe-coding-guide](https://github.com/vadim-works/vibe-coding-guide)（16★） | 工程经理视角的端到端 vibe coding 框架：提示词、模板、最佳实践 | 固定文档链：idea → structure → specification → convention → workflow → architecture → issues → 编辑器 rules → 逐 issue 实现；用 `docs/progress.md` 记进度 | DoR/DoD、CI 阻断门、per-issue 可粘贴提示词模板；反模式清单（见下节） |
| [github/spec-kit](https://github.com/github/spec-kit)（142k★） | SDD 工具包：把规格贯穿规划、实现、收敛；另含 bug 修复与想法评估扩展 | constitution（项目宪法）+ specify/plan/tasks/implement/converge 流程；扩展、preset、workflow 可强制组织规范 | 每项目一次的 constitution；converge 迭代到「收敛」而非一次通过；小改动走轻流程 |
| [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)（54k★） | 角色化敏捷 AI 开发方法（AiDD） | 澄清→计划→构建验证→学习调整的交付环；按变更大小自适应流程深度；引入产品、架构、UX、开发、测试等专业视角与多 agent 讨论 | 流程仪式随风险伸缩；用「另一个角色」挑战产出；决策显式化并沉淀为上下文 |
| [buildermethods/agent-os](https://github.com/buildermethods/agent-os)（5.5k★） | 从代码库提取团队标准并注入 agent 上下文，帮助写出更好规格 | Discover Standards（提取约定）→ Deploy Standards（按任务注入）→ Shape Spec | 把 conventions 从静态文档变成按需注入的上下文；标准可索引、可演进 |
| [binerbuddy/project-dev-orchestration](https://github.com/binerbuddy/project-dev-orchestration) | 工具中立的技能集 + 无人值守编排引擎：issue→隔离 worktree 的 agent→QC 评审→PR | System Manager 管一个项目的团队，portfolio manager 管多个项目经理；每仓库有 `project-profile.md`（构建命令、QC 约定等） | 队列/看板驱动 + worktree 隔离 + 休眠空闲 agent；项目画像文件让 agent 自启动 |

## 【可复用规则】

综合以上项目（事实归纳）：

1. **完成定义先行**：每个任务写清验收标准与 DoR/DoD，写不出验收标准就不派发。
2. **状态外置**：任务状态放任务板/SQLite，不放对话；会话丢了也能从状态恢复（DevSupervisor）。
3. **规划—派发—评审—落地分离**：写代码的 agent 不得批准自己的改动；独立评审不过不得落地。
4. **人类 gate 最小化**：只在需要取舍、花钱、不可逆操作时打断；其余自动流转（DevSupervisor 的 gates、VibeCtl 的 plan 审批）。
5. **单一事实源上下文**：`CLAUDE.md`/`AGENTS.md`/`VIBECTL.md`/`project-profile.md` 一类文件，每次会话先读。
6. **按风险定仪式**：小改动直达构建，大改动才走完整 spec/架构（Spec Kit、BMAD 都明确如此）。
7. **证据取代断言**：「做完了」必须附 diff、测试日志、SHA、基准数据；没有证据视为未完成。
8. **预算与隔离**：预算上限、worktree/沙箱隔离、保护路径与危险模式扫描。

**事实**：DevSupervisor 的外层循环是目前看到最完整的主管流水线参照——观察项目状态 → 规划/重规划 → 选就绪任务 → 派发 → 收集结果 → 按策略路由评审 → 修订或落地 → 验证 → 独立评估目标是否达成。它把「主管」定义为状态与策略的持有者，而不是最会写代码的人。

## 【反模式与风险】

- 无 spec、无 conventions 直接生成代码（vibe-coding-guide 反模式清单明列）。
- 上下文只活在聊天里，换会话即失忆，同一问题反复解释。
- agent 自写自批、自评自过；评审与实现同一角色。
- 大而全并行：同时开多个功能，一个都没上线。
- 过度仪式：小改动也走完整 SDD，把流程当目标，拖慢交付。
- 成本与权限失控：默认付费、无预算上限、无危险操作 gate。
- 质量错觉：只看「测试通过」，不验证是否解决了原始症状。

**存疑项**：以上为一手 README/文档级调研，未逐项目运行验证；「项目主管」术语与边界仍在流动；DevSupervisor 等项目规模较小（星数低），不应视为行业标准，引用时宜标为「案例」而非「最佳实践」。

## 【来源链接】

1. Karpathy「vibe coding」原话引用页（Simon Willison）：https://simonwillison.net/2025/Feb/6/andrej-karpathy/
2. Collins 年度词汇报道（RTE）：https://www.rte.ie/entertainment/2025/1106/1542331-collins-word-of-the-year-for-2025-revealed/
3. GitHub 博客：Spec-driven development with AI（Spec Kit 发布）：https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/
4. Spec Kit 文档站：https://github.github.io/spec-kit/
5. DevSupervisor：https://github.com/nTony46/DevSupervisor ；其 agent 循环设计：https://github.com/nTony46/DevSupervisor/blob/main/docs/agent-loop.md
6. VibeCtl：https://github.com/metavert-io/vibectl （旧地址 jonradoff/vibectl 301 指向此处）
7. vibe-coding-guide：https://github.com/vadim-works/vibe-coding-guide
8. GitHub Spec Kit 仓库：https://github.com/github/spec-kit
9. BMAD-METHOD：https://github.com/bmad-code-org/BMAD-METHOD ；文档：https://docs.bmad-method.org/
10. Agent OS：https://github.com/buildermethods/agent-os ；官网：https://buildermethods.com/agent-os
11. project-dev-orchestration：https://github.com/binerbuddy/project-dev-orchestration

## 【给 DSH 主管的 5 条具体建议】

1. 派发前在 `team_task_create` 写死「完成定义 + 唯一写范围 + 验收命令」，写不出验收就不派。
2. 规定回报格式：改了什么文件、跑了什么命令、结果如何、存疑项；无证据的「已完成」一律打回，主管亲自抽查。
3. 把关键决策落盘为单一事实源（如 `research/DECISIONS.md`），每条命令直接引用路径，不依赖「按之前说的」。
4. 实现与验收分离：写文件的对话框不给自己签收；关键交付由主管跑测试或看 diff。
5. 仪式随风险伸缩，并给并行数、时间、成本设上限；不可逆操作单设 gate。
