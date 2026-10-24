# 研究②：多智能体 supervisor / orchestrator 模式

检索日期：2026-10-24。「事实」均对应下方可核实链接；「推断」是我对 DSH Agent Teams 的映射判断，非检索结论。事实快照 2026-10-24；链接与框架版本会漂移，复检用 `setup/verify-facts.sh`。

## 【模式清单】（事实）

| 来源 | 编排结构 | 主管职责 | 适用规模 |
|---|---|---|---|
| Claude Code subagents | 主会话按需派生 subagent，各自独立上下文与工具权限 | 依据 description 决定委派时机，只收结果摘要，不把搜索日志搬回主上下文 | 单会话内、上下文易被调研结果淹没的任务 |
| Claude Code Agent Teams | 多个独立会话 + 共享任务板 + 成员间直接消息 | Lead 建任务、分配、综合结论；可要求先交计划再实施，用 hooks 做质量门 | 官方建议 3–5 名队友起步，每人约 5–6 个任务 |
| OpenAI Swarm | 两个原语：Agent 与 handoff；调用间无状态 | 当前活跃 Agent 决定把会话交给谁，context_variables 显式携带共享状态 | 轻量、可测试的对话路由；已被 Agents SDK 取代 |
| CrewAI hierarchical | 默认 sequential，可切 hierarchical；manager agent 分配并验收 | manager 按角色分派、验证产出是否达标 | 角色清晰、流程固定的团队 |
| AutoGen GroupChat | 由 GroupChatManager 选下一位发言者，消息按 topic 投递 | manager 选人、记住上一发言人防单人主导，并设显式终止条件 | 小规模、需多角色讨论收敛的问题 |
| LangGraph supervisor | 中心 supervisor 掌控全部通信与委派，tool-based handoff | supervisor 决定下一跳；官方现推荐用 tools 手写该模式以更好控制上下文 | 需要检查点与人工介入的长流程 |
| MetaGPT | 角色化 SOP：产品经理→架构师→项目经理→工程师 | 项目经理协调，靠需求/设计文档等结构化产物交接，而非自由聊天 | 软件项目从需求到实现的完整链路 |
| ChatDev | ChatChain 按设计/编码/测试/文档分阶段对话 | 阶段配置驱动，角色对话完成交接并互相纠错 | 中小型软件生成 |
| AgentScope（阿里通义系） | agent team：leader 派生 worker，内置团队工具与任务规划 | leader 建队、分派、统筹 | 中文生态、需可观测性的多智能体应用 |

## 【可复用的调度规则】（事实+来源）

- **拆解单位是「可独立验收的产物」**：过小则协调开销大于收益，过大则长时间无检查点（Claude Code 文档均列为反例）；每人维护多个自包含任务便于重新分配。
- **子代理只回传摘要**：subagent 在独立上下文窗口工作，主会话只拿到压缩结果，这是控制主管上下文的主要手段。
- **共享任务板 + 显式依赖**：Claude Code Agent Teams 用三态任务与依赖协调，文件锁防止多人抢同一任务；状态外置（任务板/检查点）是可恢复性基础。
- **按复杂度给预算**：Anthropic 经验是 lead 显式规定简单查询少而浅、复杂调研才多派代理；早期常见失败是对简单问题过度投入。
- **交接带上下文**：Swarm handoff 会交 messages 与 context_variables；MetaGPT 用标准文档而非全量聊天记录。
- **终止条件必须显式**：AutoGen GroupChat 用关键字/轮数终止；没有终止条件的自由群聊会空转。
- **失败与阻塞回到主管**：Claude Code 队友空闲或失败会通知 Lead 并附最终答复/错误文本，由 Lead 决定重新分配。

## 【反模式】（事实+推断）

1. **过度拆分**：协调与消息开销超过并行收益；Claude Code 明确说三个聚焦成员常优于五个分散成员。
2. **上下文断裂与隐式决策冲突**：Cognition 提出两条原则——共享完整上下文、行动携带隐含决策；子代理各自局部决策会产出不一致结果，故默认优先单线程 agent。
3. **写冲突**：多代理同改一个文件；Claude Code 把「避免文件冲突」列为团队最佳实践，要求按文件划分归属。
4. **验证缺失**：主管只信队友摘要、不看产物本身；应由主管跑验收命令、看 diff。
5. **循环等待/空转**：依赖未完成就 claim、把 inactive 当成完成、主管自己抢活而不等队友——Claude Code 文档专门警告 Lead 不要抢活。
6. **成本放大**：Anthropic 实测多智能体约比单轮聊天多用 15 倍 token，只有高价值任务才划算；简单任务用多代理是负收益。

## 【对 DSH Agent Teams 的映射建议】（推断）

- DSH 的 `team_task_*` 有三态任务、`blocked_by` 依赖与 `expected_revision` CAS，等价于 Agent Teams 共享任务板；但 `write_scopes` 只是提示性 metadata、无文件锁——**主管必须自己保证写范围不重叠**，必要时串行。
- `spawn_teammate(context=fresh)` 相当于无继承上下文的 subagent：命令必须自包含（绝对路径、约束、验收标准、交付格式），否则复现 Cognition 的上下文断裂问题。
- `send_message` 是持久异步消息（accepted/queued 均成功），不是 AutoGen 式同步群聊；`inactive` 只表示没在跑，不等于完成。`wait_agent` 前先 `list_agents`，无 running/provisioning 立即 noProgress。
- `interrupt_agent` 不释放任务 owner，失败/中断后要由主管 reassign 或 reopen；CrewAI 的 manager 会自动验收，DSH 主管需手动补位。
- 扁平 roster、无嵌套团队、无 worktree/merge：主管不能像 MetaGPT 那样靠无限分层，应自己承担拆解与综合；并行任务按「单文件/单目录」切分，Bash/格式化等绕过版本校验的写入必须由主管复核。

## 【给 DSH 主管的 5 条具体建议】（≤200 字）

1. 先定可验收产物，再建任务：一个任务对应一个文件/结果 + 一条验收命令 + 唯一写范围。
2. 命令自包含：teammate 看不到你的对话，给绝对路径、约束、输入、交付格式和示例。
3. 并行按文件切：默认 2–4 个，无共享文件才并行；写范围重叠就串行。
4. 任务板是唯一真相：claim→complete 走 revision；inactive/failed 不等于完成，需 reassign。
5. 亲自验收再汇总：跑测试、看 diff、抽查产物，等必需成员结束后再给用户结论。

## 【来源链接】

1. Anthropic Engineering《How we built our multi-agent research system》 https://www.anthropic.com/engineering/built-multi-agent-research-system （主从架构、token 15×、预算与失败模式）
2. Cognition《Don't Build Multi-Agents》 https://cognition.ai/blog/dont-build-multi-agents （共享上下文、隐式决策两条原则）
3. Claude Code Docs《Create custom subagents》 https://code.claude.com/docs/en/subagents （独立上下文窗口、摘要回传、description 委派）
4. Claude Code Docs《Orchestrate teams of Claude Code sessions》 https://code.claude.com/docs/en/agent-teams （共享任务板、依赖、文件锁、3–5 人、最佳实践、hooks、失败通知）
5. Claude Code Docs《Dynamic workflows》 https://code.claude.com/docs/en/workflows （脚本化批量编排 subagents）
6. OpenAI Swarm GitHub https://github.com/openai/swarm （Agent/handoff、无状态、context_variables、已被 Agents SDK 取代）
7. OpenAI Agents SDK Docs https://openai.github.io/openai-agents-python/ （Swarm 的生产化后继）
8. CrewAI Docs《Hierarchical Process》 https://docs.crewai.com/en/learn/hierarchical-process （manager 分派与结果校验）
9. AutoGen Docs《Group Chat》 https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/group-chat.html （GroupChatManager 选人与终止）
10. AutoGen 论文 https://arxiv.org/abs/2308.08155
11. LangGraph Supervisor GitHub https://github.com/langchain-ai/langgraph-supervisor-py （中心 supervisor、tool handoff、官方推荐改为 tools 手写）
12. LangGraph Multi-agent 概念 https://langchain-ai.github.io/langgraph/concepts/multi_agent/
13. MetaGPT GitHub https://github.com/FoundationAgents/MetaGPT （PM/架构师/项目经理/工程师、SOP）
14. MetaGPT 论文 https://arxiv.org/abs/2308.00352
15. ChatDev GitHub https://github.com/OpenBMB/ChatDev （ChatChain 分阶段对话）
16. ChatDev 论文 https://arxiv.org/abs/2307.07924
17. AgentScope GitHub https://github.com/agentscope-ai/agentscope （leader 派生 worker 的 agent team）
