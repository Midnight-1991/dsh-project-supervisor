# superpowers 项目学习笔记：适合「项目主管」借鉴的 14 个点

> 调研日期：2026-10-25。**许可证与引用**：上游 [obra/superpowers](https://github.com/obra/superpowers) 为 MIT，`Copyright (c) 2025 Jesse Vincent`；本文是独立摘要与改写，未复制上游代码或长段原文；引用其机制时请保留上游链接与版权声明（完整声明与 MIT 全文见 `setup/THIRD_PARTY_NOTICES.md` 第四节）。来源：[obra/superpowers](https://github.com/obra/superpowers)（MIT，main 分支 231 个文件 / [15 个技能](https://github.com/obra/superpowers/tree/main/skills)，约 30 万 ★）。方法：直接读上游仓库 README、`skills/` 下各 `SKILL.md`、`hooks/` 与参考文件；未运行其代码。目的：把「流程」而非「口号」迁移到本项目（用户 m02390 要求 14 条全做，v1.8.0 落地）。

## 上游核心闭环

`brainstorm 出 spec → writing-plans 写成任务级计划文件 → 每任务派新子代理实现 → 每任务独立评审（spec 符合度 + 质量）→ verification-before-completion 拿证据 → 有界 fix loop → finishing 分支`

它证明有效的关键不是某个 prompt，而是：**状态外置到文件（计划/账本）、实现与评审分离、完成声明必须过验证门、规则用「可触发技能」而不是长篇说明**。

## 14 个点与本项目落点

| # | superpowers 做法（证据） | 本项目落点（v1.8.0） |
|---|---|---|
| 1 | `writing-plans`：计划存 `plans/日期-功能.md`；Header 固定 Goal / Architecture / Tech Stack / Spec；每任务写 Files / Interfaces(Consumes·Produces)；每步只有一个动作并带验证；写完自检 5 项 | `SKILL.md`「计划与任务简报」；`templates/plan.md`、`templates/task-brief.md`；`AGENTS.md` 命令模板加「计划/简报」 |
| 2 | `subagent-driven-development`：每任务新实现者 + 独立评审者；评审输入三件套（brief / report / diff）；评审必须同时给 spec 符合度与质量结论；禁止给评审者预判（"不要报这个"） | `SKILL.md`「两段式交付」；`templates/review-gate.md`；AGENTS「写者不给自己签收」升级为每任务门禁 |
| 3 | `verification-before-completion`：Gate Function 五步（认定→找命令→完整跑→读输出与退出码→才声明完成）；常见失败表；红旗词 should / probably / seems | `SKILL.md`「完成声明 Gate」；`AGENTS.md`「红旗词表」一行；`templates/review-gate.md` |
| 4 | 有界 fix loop：每轮修复后 scoped re-review；4–5 轮升模型或交人裁决；发现不许静默丢弃，裁决进账本 | `SKILL.md`「有界返工」；AGENTS「有限返工」细化为「每轮必须复审→2 轮不收敛升级/交还」 |
| 5 | Ledger 账本：完成/决定/裁决/阻塞/重派都记一行，压缩或换会话后可恢复 | `templates/ledger.md`；`SKILL.md`「任务账本」；与 DSH 任务板 + `research/DECISIONS.md` 对账 |
| 6 | `using-superpowers` 元技能 + SessionStart 注入：哪怕 1% 相关也必须先读技能；附 12 条红旗借口表 | `AGENTS.md`「开工先查技能」+ 红旗表；等价于本工作区 AGENTS.md 常驻注入 |
| 7 | `systematic-debugging` Iron Law：没找到根因不许提修复；四阶段（读错误 / 稳定复现 / 查最近改动 / 多组件埋点）；3 次修复失败→质疑架构 | `SKILL.md`「调试 Iron Law」；命令模板 bug 类任务要求「先复现 + 根因一句话」 |
| 8 | `dispatching-parallel-agents`：一域一代理；prompt 四要素（聚焦 / 自包含 / 约束 / 明确输出）；同一响应发起=并行；完成后统一 review + 跑全量 + 抽查；不并行派多个实现者 | `AGENTS.md`「并行纪律」补 prompt 四要素与「不并行实现者」；`SKILL.md` 派发节 |
| 9 | batching：同一种小改跨文件时合并成一次派发、审一个 diff | `SKILL.md`「小批量合并派发」；AGENTS 拆解规则 |
| 10 | `writing-skills`：技能也用 TDD——先让子代理在压力场景下失败（基线），再写规则，再验证合规；description 只写触发条件 | `SKILL.md`「技能压力测试」；新规则上线前用一个被诱导的 fresh 对话框验收 |
| 11 | `using-git-worktrees`：先检测是否已隔离，再 native 工具，再 git worktree；动手前验证 clean baseline | 命令模板「前置：git status 干净」；AGENTS 隔离基线；DSH 无 worktree，用单写者 + 每任务 commit 等价替代 |
| 12 | 模型选择：按任务复杂度显式选模型；turn count 比 token 价格更贵；fix loop 升级模型 | `SKILL.md`「模型分级」；任务板建议难度字段；注明 DSH spawn 暂不支持选模型（配置决定 provider） |
| 13 | `finishing-a-development-branch`：先跑全量测试 → 检测环境 → 给 3 个集成选项（合并 / PR / 保留）→ 执行 → 清理 | `SKILL.md`「收尾菜单」；`AGENTS.md` 收尾条目 |
| 14 | 多 harness 适配：同一套 skills，各 harness 插件清单与钩子适配（`.claude-plugin/`、`.codex-plugin/` 等） | `SKILL.md`「多平台适配清单」：DSH Web/CLI、Windows/macOS、模板路径约定；不照搬钩子 |

## 不适合直接照抄

- **git worktree 依赖**：DSH 无 worktree / 合并机制，硬搬会造出管不了的目录；用「单写者 + clean baseline + 每任务 commit」等价替代。
- **强制 TDD**：对零基础/非代码项目过重；只在「严格派发 + 有测试框架」的项目启用。
- **SessionStart 钩子**：DSH 用 AGENTS.md 常驻注入，已等价；不需要再搭钩子。
- **技能规模**：superpowers 15 个技能各自很长；本项目的做法是「AGENTS 常驻一页 + SKILL 按需加载 + 模板文件按需复制」，避免常驻上下文膨胀。

## 与本项目的差异（我们已有、它没有）

- DSH Agent Teams 的**共享任务板**（claim / blocked_by / 写范围）与**多对话框并行**；
- 工作区载体（AGENTS.md + 技能 + 安装包 + 面板 UI + 权限开关）；
- 零基础保护、新项目需求追问、提示词润色、派发模式这些面向用户的功能；
- 跨工作区安装与 Windows/macOS 兼容脚本。

## 一句话给未来会话

**学它的不是「写得更长的 prompt」，而是「计划落文件、每任务过评审、完成要过验证门、返工有上限、裁决进账本」。**

## 核验记录

- 仓库树：`main` 231 个 blob，`skills/*/SKILL.md` 共 15 个；关键技能全文读过：`using-superpowers`、`verification-before-completion`、`dispatching-parallel-agents`、`writing-plans`、`subagent-driven-development`、`systematic-debugging`、`writing-skills`、`brainstorming`、`using-git-worktrees`、`requesting-code-review`、`receiving-code-review`、`finishing-a-development-branch`。
- `hooks/session-start` 与 `.claude-plugin` / `.codex-plugin` / `.cursor-plugin` 等清单一并读过，用于第 6、14 条对照。
- 引用字段（星数、pushed_at）为 2026-10-24 抓取值；如需复检用 GitHub API。
