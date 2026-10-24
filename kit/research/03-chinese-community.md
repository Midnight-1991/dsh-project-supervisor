# 中文社区「vibe coding 项目主管 / AI 项目经理 / AI 开发主管」资料调研

> 调研时间：2026-10-24。检索渠道：GitHub API、掘金、腾讯云开发者社区、网易号（人人都是产品经理）、微信公众号、联网搜索。
> 说明：本文只采信本人实际抓取并读到正文的来源；抓不到的页面在【未找到/存疑项】中如实标注，不引用其内容。
>
> 事实快照：2026-10-24；链接与仓库星数会漂移，复检用 `setup/verify-facts.sh`。

## 【中文语境角色划分】

中文社区没有统一的「vibe coding 项目主管」岗位定义，但有三类可辨识的命名习惯，职责边界高度一致：

1. **「项目总监固件 / 工程团队」隐喻**（`pi-super-devteam`）：不设单一「主管」，而是把 Agent 组织成 8 个专业席位——产品经理、架构师、UI/UX 设计师、前端工程师、后端工程师、QA 工程师、安全工程师、DevOps 工程师；由「意图路由 + 计划 DAG + 单写者纪律 + 只读评审 + 确定性验收」承担主管职责，角色按任务动态召集而非全员出动。
2. **「主 Agent / 流水线」隐喻**（腾讯云 CodeBuddy 实践）：主 Agent 只做调度与传递工件，角色拆成 PM（愿景）→ BA（业务规格，禁止出现 Redis、建表等技术词）→ 方案审查官（两次审批+终审准出）→ 架构师（只画框线、定接口约束，不下沉代码）→ 全栈开发（逐字实现，不自行补设计缺陷）→ QA（只写缺陷报告，不附修复代码）。另设「快反通道」处理线上 Bug，跳过 PM/BA。
3. **「虚拟公司 / 多智能体辩论」隐喻**：`ShanchunAI_Protocol_16Layers` 的「蓝图指挥部」用 PM / Dev / QA / 用户代表四人组，以「强制辩论 + 三轮强制闭环 + 回归测试 + 量化验收」模拟团队；`agency-agents-zh` 则直接按 22 个部门、328 个专家角色命名（CEO/CTO/CMO/COO/CPO/CFO 等），说明中文社区偏好「公司职位」语感。

共同点：**主管的活不是写代码，而是定完成定义、切任务、控写权限、组织交叉评审、按证据验收**。差异在于是否把「主管」外化成独立角色：`pi-super-devteam` 外化为工具与流程，CodeBuddy 实践外化为主 Agent，善春方案则内化为同一 Prompt 里的辩论机制。

## 【代表仓库/资料清单（表格）】

| 名称 | 链接 | 语言/形态 | 内容要点 | 可采纳度 |
|---|---|---|---|---|
| pi-super-devteam | https://github.com/patrickleehua/pi-super-devteam | 中文 README，npm 包（0.1.3） | 「项目总监固件」：意图路由、可见计划 DAG、单写者纪律、只读评审、确定性验收、有界返工（默认最多再修 2 次）、Clean/Partial/Blocked 交付分级 | 高（结构最接近 DSH 主管） |
| AIPM-Wiki（`from-idea-to-demo.md`） | https://github.com/archlizheng/AIPM-Wiki | 中文，430 star | 《从一句话需求到能跑的原型：AI PM 的 Vibe Coding 实战方法论》：六步工作流、迭代式提示四技巧、调试自查顺序 | 高（PM 视角方法论） |
| 从 Vibe Coding 到 Harness | https://juejin.cn/post/7699753031051362338 | 中文，掘金 | Vibe Coding→Plan→Spec→Harness 四级演进；Harness 四原则（地图式导航、知识嵌入代码库、机械化验证、反馈驱动修复）；完成判定五要素 | 高（交付流程） |
| 如何使 vibecoding 简洁高效 | https://cloud.tencent.com/developer/article/2715522 | 中文，腾讯云社区 | CodeBuddy 多角色流水线：PM/BA/审查官/架构师/全栈/QA 的权限焊死做法 + 双轨快反通道 | 高（角色边界最细） |
| 善春AI·蓝图指挥部 V2.1 | https://github.com/shanchun-ai/ShanchunAI_Protocol_16Layers | 中文，0 star，个人项目 | 「一个 Prompt 变成四人开发团队」：PM/Dev/QA/User 强制辩论、三轮闭环、回归强制、量化验收 | 中（Prompt 模板可借，非权威） |
| aipm-skill-pack | https://github.com/ZeroOnehub/aipm-skill-pack | 中文，21 个 Agent Skill | AI PM 六阶段（立项→PRD→原型→AI 方案→评测→复盘），总控 `aipm-hub` 按风险推荐下一步、维护 `aipm.json` 进度；声称兼容 DeepSeek Harness | 中（可对照 DSH 的 skill 设计） |
| agency-agents-zh | https://github.com/jnMetaCode/agency-agents-zh | 中文，328 角色 | 按 22 个部门提供即插即用专家角色（含 CEO/CTO/CPO 等），用于中文角色命名参考 | 中（命名库） |
| 产品经理要先 Vibe 产品 Demo | https://m.163.com/dy/article/L1PIKFOH0511805E.html | 中文，人人都是产品经理 | PM-Make 系列文档（00-intake、01-product-shaping、03-scope、04-pages-and-flows、05-open-questions、06-shaped-brief）+「信息密度」原则 + 新开会话保持上下文干净 | 高（需求交接物） |
| vibe-coding-cn | https://github.com/tradecatlabs/vibe-coding-cn | 中文，17.7k star | 「非严肃开发的 Vibe Coding 工具箱」：功法体系、Skills、在线提示词库、Pi CLI 安装配置提示词 | 中（提示词素材） |
| 程序员鱼皮 ai-guide | https://github.com/liyupi/ai-guide | 中文，21.5k star | AI 资源大全 + Vibe Coding 零基础教程 + Prompt 提示词大全 | 中（入门与素材） |
| Vibe_coding_guide | https://github.com/Lling0000/Vibe_coding_guide | 中文优先，239 star | 工程化工作流指南：specs、agents、worktrees、skills、CI、review | 中（工程化清单） |

## 【可借用的中文提示词要点】

以下片段均来自上文可访问来源，可直接改写后用于 DSH 主管派单：

1. **角色权限焊死**（腾讯云社区，同上）：
   - 架构师「只画框和线，定义接口和约束，绝对不能下沉到具体代码实现」；BA「产出物里绝不允许出现『Redis 缓存』或『建三张表』这类字眼，只准写业务流程和字段含义」；开发「遇到设计缺陷不准自己补，必须上报」；QA「只写缺陷报告，不准在报告里附上修复代码」。
2. **只读评审的统一裁决格式**（pi-super-devteam README）：`{ "role": "qa-engineer", "accepts": false, "blocking": ["FR-12 的无权限路径没有测试"], "advisory": ["可以增加会话过期的边界测试"], "evidence": ["output/app-prd.md#FR-12"] }`——把「阻塞项 / 建议项 / 证据」三分，评审席缺席不得算通过。
3. **不可逆动作确认**（同上）：`git push --force`、`rm -rf`、`npm publish`、`kubectl delete`、数据库 `DROP` 等执行前，必须逐条展示「动作、目标、影响、可恢复性、确切命令」；「业务批准」不等于「工具授权」。
4. **Harness 启动指令**（掘金，同上）：「请按项目默认 Harness 规则执行：读取指定 Spec，先输出计划并等待确认；确认后按 Task List 分阶段修改代码，每阶段验证并保存状态；遇到歧义或高风险操作时暂停。」
5. **需求下发三句式**（AIPM-Wiki，同上）：① 描述交互而不是实现（「输入关键词后列表要实时更新，不用点搜索按钮」）；② 限定范围（「这一步只做搜索和展示，不用加登录、不用接数据库，数据先写死在代码里」）；③ 给出判断标准（「找不到足够相关的答案就显示『没有找到相关答案』，而不是硬凑」）。
6. **信息密度原则**（人人都是产品经理，同上）：不要把整份 PRD 丢给 Coding Agent，改用 `04-pages-and-flows` 这类「页面清单 + 入口 + 关系 + 功能规则」的高密度交接物，并新开会话开发以避免上下文污染。
7. **多角色互否机制**（善春蓝图指挥部）：「PM 定义需求，Dev 挑战可行性，QA 审查风险，用户代表有一票质疑权」，强制三轮不许一次通过。

## 【未找到/存疑项】

- **未找到**以「vibe coding 项目主管」「AI 开发主管」为固定岗位名、成体系的中文方法论或岗位职责标准。中文社区更多用「AI 项目经理 / PM / Leader / 项目总监 / 主 Agent」；「主管」多为泛指，本文中的角色划分均系个人实践总结，非行业标准或招聘口径。
- 微信公众号文章《我试了两周 Vibe Coding，发现程序员开始变成"AI 项目经理"了》检索到标题与摘要，但正文受微信风控，**未成功核验全文**，故不引用其内容。
- 知乎回答（程墨 Morgan：把自身定位为 Leader、让 AI 既当 Coder 也当 PM）仅见搜索摘要，页面返回 403，**未核验**，不引用。
- 头条文章《AI 提示词高阶学习讲义：从项目经理到 AI 协同主管》标题高度相关，但正文为 JS 渲染无法抓取，**存疑不引用**。
- npm 上仅确认 `pi-super-devteam`（0.1.3）；未找到其他中文「项目主管/总监固件」类 npm 包。该包为个人项目（0 star，MIT），结构与措辞可参考，但不宜视为成熟方案。
- `ShanchunAI_Protocol_16Layers` 属个人协议/prompt 模板（0 star），其「裁判 AI 综合评分 4.8/5.0」等自述无法独立验证，只借鉴其机制设计。

## 【来源链接】

1. https://github.com/patrickleehua/pi-super-devteam —— 项目总监固件：8 席位、计划 DAG、只读评审、Clean/Partial/Blocked。
2. https://github.com/archlizheng/AIPM-Wiki （文档：`docs/02-pm-skills/vibe-coding/from-idea-to-demo.md`）—— AI PM 的 Vibe Coding 六步方法论。
3. https://juejin.cn/post/7699753031051362338 —— 从 Vibe Coding 到 Harness：可验证 AI 交付流程。
4. https://cloud.tencent.com/developer/article/2715522 —— CodeBuddy 多角色流水线与双轨快反通道。
5. https://github.com/shanchun-ai/ShanchunAI_Protocol_16Layers —— 蓝图指挥部四人团队 Prompt（含完整中文 Prompt）。
6. https://github.com/ZeroOnehub/aipm-skill-pack —— AI PM 21 个 Agent Skill，六阶段体系。
7. https://github.com/jnMetaCode/agency-agents-zh —— 328 个中文 AI 专家角色（公司/部门命名）。
8. https://m.163.com/dy/article/L1PIKFOH0511805E.html —— 人人都是产品经理：PM-Make 文档与「信息密度」实践。
9. https://github.com/tradecatlabs/vibe-coding-cn —— 中文 Vibe Coding 工具箱：功法体系、Skills 与在线提示词库。
10. https://github.com/liyupi/ai-guide —— 程序员鱼皮 AI 资源大全与 Vibe Coding 教程。
11. https://github.com/Lling0000/Vibe_coding_guide —— 中文优先的 AI coding 工程化工作流指南。

## 给 DSH 主管的 5 条具体建议

1. **主管只做三件事**：意图路由（闲聊/解释/小改/调试/构建分级）、排计划 DAG、按证据验收；实现全部下发。
2. **评审席必须只读且缺席不算通过**：评审子代理禁止写文件，返回 `blocking/advisory/evidence` 三段式裁决，超时或解析失败记为「缺席」。
3. **写作用域与单写者纪律落盘**：派单写清唯一写范围，同一时刻只允许一个写者；并发步骤产出路径不重叠。
4. **验收机械化 + 有限返工**：以 build/test/lint/exit code 判定，跑不了记 `unavailable` 不算通过；失败后最多定点返工 2 次，禁止无限「再优化」。
5. **交付语言诚实分级**：只输出 Clean / Partial / Blocked，不把「流程跑完」说成「质量通过」；高风险动作（push/rm/发布/删库）逐条确认，业务批准≠工具授权。
