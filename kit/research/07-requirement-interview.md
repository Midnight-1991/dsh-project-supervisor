# 07 · 「新项目开局需求追问」开源参考（MIT 为主）

> 调研日期：2026-10-24。方法：GitHub 仓库搜索 → `codeload.github.com` 拉源码包 → 逐个读 LICENSE 原文 + 追问相关文件原文。星数为当日 API 抓取值，会漂移。
> 用途：为「AI 项目主管」`requirementInterview` 开关找可照抄/改写的机制与模板。工作区既定设计（每批 3–5 问、每题给默认答案、最多 3 批、用户喊停即停）在第四节与各仓库做法做了对齐。

## 一句话结论

这类项目里真正成熟的是**追问的预算与节奏控制**，不是问题清单本身：spec-kit 的 `clarify` 把追问做成「最多 5 问 / 每题 2–5 个选项 / 推荐项置顶 / 回 `yes` 即接受 / 每接受一答立刻写回文档」的定额流程；superpowers 的 `brainstorming` 把它做成「先读上下文 → 一条消息一个问题 → 每段答完回放 200–300 字 → 设计稿批准前不许动手」的门禁；BMAD 用「快路径 / 教练路径」把「被问多深」的选择权交给用户。**可直接照抄的是这三个骨架**，问题内容可归约为同一张 10 类检查表。

## 一、候选仓库（8 个，其中 6 个 MIT）

| 仓库 | 许可证（核验方式） | 星数 | 追问机制（触发 / 问多少 / 停止） | 可借鉴点 |
|---|---|---|---|---|
| [github/spec-kit](https://github.com/github/spec-kit) | **MIT**；`api.github.com/repos/github/spec-kit` → `license.spdx_id: MIT`，[LICENSE](https://raw.githubusercontent.com/github/spec-kit/main/LICENSE) 原文 | 142,686 | `/speckit.clarify` 在写 spec 之后、`plan` 之前跑；**单条消息只问 1 个**，全会话**最多 5 个**；用户回 `yes/recommended/suggested` 即采纳推荐项；关键歧义提前解完 / 用户说 `done` / 满 5 个 → 停 | 全套定额机制 + 10 类覆盖度扫描表 + 每答即写回 + 剩余项列 Deferred |
| [obra/superpowers](https://github.com/obra/superpowers) | **MIT**；`api.github.com/search/repositories?q=repo:obra/superpowers` → MIT，[LICENSE](https://raw.githubusercontent.com/obra/superpowers/main/LICENSE) | 304,515 | `brainstorming` skill 在任何「造东西」之前触发；**一条消息一个问题**（不挂选项）；先读代码/规格再开口；每段答完回放 200–300 字再问下一段；**设计稿批准前 HARD-GATE 禁止动手** | 「先看再问」「一句话退出通道」「回放式确认」「反模式红牌表」 |
| [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | **MIT 正文 + 商标声明**；API 报 `NOASSERTION`（因为附加了 TRADEMARK NOTICE 与 CONTRIBUTORS 行），[LICENSE](https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/LICENSE) 原文首行即 `MIT License` | 54,500 | `bmad-prd`：Brain dump → 风险等级校准（hobby / internal / launch）→ **用户选快路径或教练路径**；「两三轮内进入工作模式，不是十轮」；`advanced-elicitation` 在任一段落后 HALT，给 5 个追问方法菜单 + Reshuffle + Proceed | 快慢双路径、风险分档、「启发而非代笔」的边界、候选方法菜单（`methods.csv` 71 条方法） |
| [buildermethods/agent-os](https://github.com/buildermethods/agent-os) | **MIT**；`api.github.com/search/repositories?q=repo:buildermethods/agent-os` → MIT，`LICENSE` 首行 `MIT License` | 5,538 | `plan-product`：先查已有产物，有则给「重来 / 只改某几个 / 取消」三选；全程 AskUserQuestion 且**一次一个**；`shape-spec` 只在范围不清时问 **1–2 个** | 「先查存量再决定要不要问」、三选式开场、问题数量随清晰度浮动 |
| [TexasBedouin/vibe-check](https://github.com/TexasBedouin/vibe-check) | **MIT**；API → MIT，[LICENSE](https://raw.githubusercontent.com/TexasBedouin/vibe-check/master/LICENSE) | 624 | 开场一个「信心旋钮」问题定档：新手→一次一问，自信用户→可 2–3 问一批；**每个问题都自带「我建议 X」**；用户说「不知道」就替他定并说明可改；三条入口（全程 / 只验证 / 已有调研直接规划） | 面向零基础用户的语气与默认值规则，最贴合本工作区「零基础保护」 |
| [cookiy-ai/user-research-skill](https://github.com/cookiy-ai/user-research-skill) | **MIT**；[LICENSE](https://raw.githubusercontent.com/cookiy-ai/user-research-skill/main/LICENSE) 原文 `MIT License / Copyright (c) 2026 Cookiy AI` | 1,569 | 相关性中等：面向**用户访谈**而非项目需求；筛选问题 **2–4 个、绝不超 4 个**；禁止是非题与引导题；给探针库（含「Oh?」技巧） | 「别问引导题 / 别问是非题」的具体判据，可反向约束 AI 的提问质量 |
| [RobMitt/grill-me-skill](https://github.com/RobMitt/grill-me-skill) | **无许可证**（API `license: null`，仓库只有 README + SKILL.md，无 LICENSE）→ **只能读思路，不可照抄** | 1,100 | 「像审讯一样问到共识」：一条消息一问，每题 2–4 个具体选项 + Other；**探索代码能答的就不问用户**；结束给决策汇总 | 「能自己查的绝不问」这条硬规则；它的选项写法 |
| [Jekudy/grillme-skill](https://github.com/Jekudy/grillme-skill) | **无许可证**（API `license: null`，无 LICENSE 文件）→ **只能读思路，不可照抄** | 75 | 苏格拉底式分波：**波 1 问 3–5 个**（目标/上下文/约束）→ **波 2 问 2–4 个**（边界/冲突）→ **波 3+ 问 1–3 个**（矛盾/隐含假设）；波间给小结；一旦发现矛盾就弃题追这条线 | 「分波 + 波间小结」的节奏；按域给问题类目（产品/架构/决策/计划） |

排除：无许可证仓库（上两行）不进入「可照抄」清单；纯论文无代码、SaaS 型产品（如 Cookiy 的托管访谈服务本身）不计入。

## 二、三个可直接复用的机制

### A. 覆盖度扫描表（spec-kit `clarify`，MIT，可整段改写）
对当前需求逐类打 `Clear / Partial / Missing`，只对 Partial/Missing 生成候选问题，且**过滤掉「不影响实现与验收」的项**。10 个类目：
功能范围与行为（核心目标、明确不做的事、角色区分）/ 领域与数据模型（实体、唯一性、状态流转、数据量）/ 交互与流程（关键路径、错误-空-加载态）/ 非功能（性能、扩展、可靠、可观测、安全隐私、合规）/ 集成与外部依赖 / 边界与失败处理 / 约束与取舍 / 术语一致性 / 完成信号（验收可测）/ 占位与含糊形容词（"robust"、"intuitive" 没量化）。
排序用 `Impact × Uncertainty`；spec 阶段另有硬规则：`[NEEDS CLARIFICATION]` 标记**最多 3 个**，优先级 `范围 > 安全隐私 > 体验 > 技术细节`（[specify.md](https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/specify.md)）。

### B. 追问预算 + 默认答案（spec-kit + vibe-check）
每题二选一形态：① 2–5 个互斥选项 + 一行 `**Recommended:** Option A - 理由`，用户回 `yes` 即接受；② 强制短答（`Answer in <=5 words`）+ 一行 `**Suggested:** ... - 理由`。用户答模糊时**只做一次消歧、不推进到下一题**（不占新配额）。vibe-check 的对应规则是「每个问题都说一句『我建议…』，否则纯开放题会把新手冻住」，以及「用户说不知道，就替他选并标注可改」。

### C. 节奏与门禁（superpowers + BMAD + vibe-check）
- **先看再问**：项目里已有的规格/代码/上下文，绝不重复问；superpowers 的原话是 "Never ask what the project or their context already answers"。
- **一条消息一个问题**（默认）+ 每段答完**回放**再继续，避免一口气问崩。
- **退出通道**：不请自来的追问要附一句「或者你想让我直接开干，说一声」（"Or if you'd rather I just dive in, say so"）。
- **快慢双路径**（BMAD）：快路径=把剩余缺口合并成 1–2 个问题，其余用 `[ASSUMPTION]` 标注后直接出稿；教练路径=逐节走。
- **落盘**：每接受一个答案就立刻写回文档（spec-kit 明确「Save the spec file AFTER each integration」），BMAD 用 append-only 的 `.memlog.md` 记决策——对应本工作区「一页纸摘要写进 README.md + DECISIONS.md」。

## 三、可照抄/改写的问题模板

每场景 8 题；标「本报告归纳」的为按第二节类目自拟，其余为改写来源。

### 3.1 网页 / 工具类（来源：spec-kit 类目表 + vibe-check 语气 + 本报告归纳）
1. 谁会在什么场景下打开它？打开之前他刚做完什么？（本报告归纳）
2. 打开第一屏看到什么，才算「没白来」？（vibe-check Phase 2「aha moment」改写）
3. 核心动作 1–2 个是什么？做完之后留下什么结果？（spec-kit「核心用户目标与成功标准」改写）
4. 明确**不做**的是什么？（spec-kit「Explicit out-of-scope declarations」直译）
5. 单人本机用，还是要登录 / 多人协作？（本报告归纳）
6. 出错、空数据、加载中这三种状态怎么表现？（spec-kit「错误/空/加载状态」改写）
7. 怎么算做完：哪 3 个动作点一遍不报错就算过？（spec-kit「验收标准可测试性」改写）
8. 跑在哪：本机、局域网、还是公网？（本报告归纳）

### 3.2 脚本 / 自动化类（来源：spec-kit 非功能类目 + 本报告归纳）
1. 多久跑一次，谁触发（手动 / 定时 / 事件）？（本报告归纳）
2. 输入形态与量级：文件、目录、接口还是参数？一次多少条？（spec-kit「数据量与规模假设」改写）
3. 失败要不要重试？重试几次、间隔多久？（spec-kit「可靠性与恢复期望」改写）
4. 重复跑同一批会不会写重（幂等）？（本报告归纳）
5. 结果落在哪、给谁看（终端 / 文件 / 消息 / 数据库）？（本报告归纳）
6. 能不能中途停、下次接着跑？（BMAD `.memlog.md` 断点续跑思想改写）
7. 怎么验证跑对了：抽样对账还是全量比对？（spec-kit「可测验收」改写）
8. 有密钥或个人信息吗？日志里能不能打？（spec-kit「安全与隐私」改写）

### 3.3 内容 / 文档类（来源：BMAD PRD Discovery + 本报告归纳）
1. 这份东西给谁看，他看完要做什么决定？（BMAD「受众 + 风险分档」改写）
2. 多长、什么语气、要不要中英双语？（本报告归纳）
3. 有没有必须沿用的模板或术语表？（spec-kit「术语与一致性」改写）
4. 事实从哪来：你给的材料、我上网查、还是我先留占位？（BMAD「Brain dump / 已有输入」改写）
5. 不确定的地方怎么标：`[待确认]`，还是写成 `[ASSUMPTION]` 并在末尾列清单？（BMAD 标签法直用）
6. 要不要配图、表格、目录？（本报告归纳）
7. 交付格式：md / docx / pdf / 网页？（本报告归纳）
8. 交稿前要不要先过一遍检查清单再给你？（BMAD「Reviewer Gate」减配版）

### 3.4 数据 / API 类（来源：spec-kit 集成与数据模型类目 + 本报告归纳）
1. 数据源是哪个接口或库？有文档或一条示例响应吗？（本报告归纳）
2. 认证与额度：密钥放哪、有没有调用上限或产生费用？（BMAD「concern scan」+ 本工作区 `.env` 规则）
3. 一条记录的关键字段有哪些？哪几个唯一？（spec-kit「身份与唯一性」改写）
4. 全量拉还是增量拉？按时间戳还是游标？（spec-kit「生命周期/状态流转」改写）
5. 字段缺失或类型不一致时：跳过、报错、还是填默认？（spec-kit「边界与失败处理」改写）
6. 要不要落库？落到哪（SQLite / CSV / 表格）？（本报告归纳）
7. 谁消费这份数据？字段名能不能改？（spec-kit「集成与外部依赖」改写）
8. 出问题怎么发现：日志、告警、还是每次跑完打印汇总？（spec-kit「可观测性」改写）

## 四、停止条件与追问节奏（参考值对照）

| 参数 | 开源做法 | 本工作区取值 | 依据 |
|---|---|---|---|
| 单条消息问几个 | 1 个（spec-kit / superpowers / grill-me / agent-os 一致）；自信用户可 2–3 个（vibe-check） | **3–5 个/批** | IM 里一次一个太慢；用「每题带默认」抵消一次多问的压迫感 |
| 全会话上限 | 5 个（spec-kit 硬上限）；1–2 个（agent-os 范围不清时）；分波 3–5 / 2–4 / 1–3（grillme） | **最多 3 批** | spec-kit 的 5 问上限适合「已有一份 spec」，新项目 0→1 需要更多 |
| 默认值 | 每题必须给（spec-kit 推荐项置顶 + `yes` 接受；vibe-check「Always offer your own answer」） | **每题给默认，可回「用默认」** | 零基础用户不会答开放题 |
| 跳过表达 | `yes / recommended / suggested` 接受推荐；`done / good / no more / stop` 停 | 「够了 / 直接做 / 开始吧」 | spec-kit 与 superpowers 都显式尊重提前终止 |
| 停止条件 | 关键歧义解完 / 用户喊停 / 配额用尽 | 能定 MVP、验收、主要约束即停 | 三者取并集，任一满足即停 |
| 配额用尽 | 未解项写 Deferred + 理由，不硬挤（spec-kit） | 写进摘要「未定事项」 | 避免为了问完而问 |
| 落盘时机 | 每答一题即写回（spec-kit 原子覆盖）；决策 append-only（BMAD） | 一轮结束后写一页纸摘要 | 中途崩溃也不丢 |
| 不该问时 | 规格已完整 → 直接做并说明做了什么（superpowers） | 已有 PRD/清单 → 最多确认一句 | 见第五节 |

## 五、反模式：什么时候不该追问

1. **已有明确规格**：superpowers 的判据是「一切重要的都在请求里（如『把图标改成矢车菊蓝』）→ 直接做，并说明做了什么」；只有「非平凡信息缺失」才开对话。
2. **用户说直接做**：追问必须自带一句退出通道；用户接住就立刻停止追问，把已做的技术选择用一句话声明后开工。
3. **能从工作区推断**：grill-me 的硬规则——「能在代码或文件里查到的，自己去查，别问用户」。开工先读 `README.md` / `DECISIONS.md` / `git log` 再决定问什么。
4. **一次抛 8–10 个问题**：vibe-check 原话「Never stack questions on a beginner」。
5. **只给开放题、不给默认**：会让新手卡死；开放题先问，卡住了再降级成 2–4 个选项。
6. **用选项引导答案**：superpowers 红牌表写着「给个选项菜单 → 选项会带偏，先让他自己描述」。
7. **问引导题 / 是非题**：「这样好用吗？」这类问法只会得到附和（cookiy 的明确禁令，改写为：别问「这个需求清楚了吗」，要问「这两个场景哪个先做」）。
8. **追问变审讯**：每题补一句「为什么问」——答案会影响什么（spec-kit 的 `Why it matters`、superpowers 的「说清你想学到什么」）。
9. **把技术选型混进需求追问**：spec-kit 明确「除非缺了它功能就说不清，否则别问技术栈」。
10. **问完不落盘**：没有写进文件的答案等于没问；下一轮换个会话又从头问。

## 六、来源链接

- spec-kit 仓库 <https://github.com/github/spec-kit>｜clarify 原文 <https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/clarify.md>｜specify 原文 <https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/specify.md>｜LICENSE <https://raw.githubusercontent.com/github/spec-kit/main/LICENSE>｜API 核验 <https://api.github.com/repos/github/spec-kit>
- superpowers 仓库 <https://github.com/obra/superpowers>｜brainstorming <https://raw.githubusercontent.com/obra/superpowers/main/skills/brainstorming/SKILL.md>｜LICENSE <https://raw.githubusercontent.com/obra/superpowers/main/LICENSE>
- BMAD 仓库 <https://github.com/bmad-code-org/BMAD-METHOD>｜PRD <https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/skills/bmad-prd/SKILL.md>｜Advanced Elicitation <https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/skills/bmad-advanced-elicitation/SKILL.md>｜LICENSE <https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/LICENSE>
- agent-os 仓库 <https://github.com/buildermethods/agent-os>｜plan-product <https://raw.githubusercontent.com/buildermethods/agent-os/main/commands/agent-os/plan-product.md>｜shape-spec <https://raw.githubusercontent.com/buildermethods/agent-os/main/commands/agent-os/shape-spec.md>
- vibe-check 仓库 <https://github.com/TexasBedouin/vibe-check>｜SKILL.md <https://raw.githubusercontent.com/TexasBedouin/vibe-check/master/SKILL.md>｜LICENSE <https://raw.githubusercontent.com/TexasBedouin/vibe-check/master/LICENSE>
- cookiy user-research-skill <https://github.com/cookiy-ai/user-research-skill>｜访谈规划参考 <https://raw.githubusercontent.com/cookiy-ai/user-research-skill/main/references/qualitative-research-planner/qualitative-research-planner.md>｜LICENSE <https://raw.githubusercontent.com/cookiy-ai/user-research-skill/main/LICENSE>
- grill-me-skill（无许可证，仅参考）<https://github.com/RobMitt/grill-me-skill>｜SKILL.md <https://raw.githubusercontent.com/RobMitt/grill-me-skill/main/SKILL.md>
- grillme-skill（无许可证，仅参考）<https://github.com/Jekudy/grillme-skill>｜SKILL.md <https://raw.githubusercontent.com/Jekudy/grillme-skill/main/skills/grillme/SKILL.md>

## 局限

- 未运行这些仓库，只读源码/文档；星数、路径会漂移。
- BMAD 的 MIT 正文附带商标声明：代码可照抄，但 `BMad™/BMad Method™` 等名称不能用于自己的产品或宣传。
- 两个 grill 类仓库无许可证，法律上不可复制，本报告只提取「一条消息一问」「能查就不问」这类通用做法。
- 各仓库面向英文用户与 Claude Code 工具链（AskUserQuestion 弹窗），迁到 IM 场景时「选项」需降级为文本编号。
