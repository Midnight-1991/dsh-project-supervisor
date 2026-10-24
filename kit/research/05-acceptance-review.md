# 验收评审：项目主管载体与调研报告（独立只读评审）

- 评审人：reviewer-accept（只读评审对话框，实现者不给自己签收）
- 评审时间：2026-10-24 20:20–20:40（预算 ≤12 分钟）
- 事实快照：2026-10-24；文中文件行数（如 AGENTS.md 76 行）与星数为当时值，后续载体已更新，属历史评审记录，保留原样不追改。
- 评审对象（实际 8 个文件；任务书写「6 个」，口径见 advisory A6）：
  - `AGENTS.md`（76 行）、`.dsh/skills/project-supervisor/SKILL.md`（154 行）、`主管手册.md`（54 行）
  - `research/README.md`（56 行）、`research/01-vibe-coding-supervisor.md`（74）、`research/02-multi-agent-supervisor.md`（72）、`research/03-chinese-community.md`（74）、`research/04-dsh-agent-teams.md`（57）
- 方法：不采信报告自述，独立跑命令核验——GitHub API / HTML 内嵌星数 / shields.io、curl HTTP 状态、`@deepseek-ai/*` 包源码 grep 与 README 对照、原文抓取（Karpathy、Collins、Anthropic、Cognition、Claude Code Docs、pi-super-devteam、DevSupervisor）。

## 结论

**有条件通过**：A（完整性）PASS，B（准确性）PASS（仅有数字漂移与引用小瑕疵），C（可用性）FAIL——1 处 blocking（与 DSH 团队工具固定策略的授权口径冲突），D（风险）PASS（已列 5 项），E 结论=有条件通过。修掉 B1 一句授权对齐即可通过。

## blocking（必须修）

### B1. 「自主并行、不必先征求同意」与 DSH 团队工具固定策略的授权口径冲突
- 位置：`AGENTS.md:34`、`.dsh/skills/project-supervisor/SKILL.md:29`、`主管手册.md:16`、`主管手册.md:25-26`
- 问题：三份载体都承诺「两个及以上工作流彼此独立时，自主开启多个对话框并行执行，不必先征求用户同意」「独立工作流直接并行，不必等你批准」。但 DSH 团队工具包的固定模型策略写死了相反口径：
  - `~/.npm/_npx/<npx-hash>/node_modules/@deepseek-ai/dsh-experimental-tool-agent-team/lib/index.js:21`
    `const POLICY = \`Agent Teams is available in this session, but create teammates only when the user explicitly asks to use Agent Teams or teammates.`
  - 同包 README.zh.md（何时选择）：「固定策略只在明确要求团队或 teammate 时创建成员，因此普通任务永远不会自行触发委派。」
  这份 POLICY 属会话内较高优先级的模型策略；`AGENTS.md` 是工作区指令。新会话收到「把目标丢给主管」后，模型对「用户是否已明确要求使用 Agent Teams」的解释不确定：按 POLICY 从紧 → 拒绝自主 spawn，退化为「主管自己干」，直接与 `AGENTS.md:9`「主体实现必须派发」及 `主管手册.md:16`「AGENTS.md 会自动让这个会话以主管方式工作」矛盾；从宽 → 有违反包策略之嫌。核心卖点（自动进入主管模式并并行）因此不可复现。
- 建议修法（一句话即可）：在 `AGENTS.md`「对话框 = 会话」小节（第 12–21 行之间）加：
  「用户在本工作区把项目目标交给会话，即视为对使用 Agent Teams / teammate 的明确授权；若当前会话未启用 Team 组合包，则降级为单会话执行并在汇报中说明。」
  并在 `主管手册.md:16` 补同义句、`SKILL.md:29` 的「自主并行」条目引用该授权句。改完后再跑一次「新会话只发目标」的冒烟即可。

## advisory（建议修，不阻塞）

- **A1 命令模板两处不同步**：`AGENTS.md:41` 要求「命令模板（下发给对话框时必须完整）」，但 `AGENTS.md:43-52` 模板缺 `网络：<可用/不可用>` 与 `预算：<检索次数/时间上限>` 两行；`SKILL.md:124-134` 模板有。建议 AGENTS 模板补齐，或注明「以 SKILL.md 模板为准」。
- **A2 决策落盘会污染调研总览**：`AGENTS.md:63` 与 `SKILL.md:120` 都建议「把关键决策写入 `research/README.md` 或 `DECISIONS.md`」。`research/README.md` 是调研总览，实际不存在 `DECISIONS.md`；新会话照做会覆盖总览。建议统一为 `research/DECISIONS.md`（或项目根 `DECISIONS.md`）。
- **A3 精确星数会漂移 + 核验清单漏项**：`research/README.md:42` 称「星数与报告一致」。本次实测 `github/spec-kit` HTML 内嵌 `"stargazerCount":142665`（报告 142,666，差 1★，属正常漂移）；且「逐个核对被引仓库」的 17 个仓库漏列报告 03 的 4 个仓库：`ShanchunAI_Protocol_16Layers`（实测 0★）、`vibe-coding-cn`（≈18k）、`ai-guide`（≈22k）、`Vibe_coding_guide`（239★）——本次已补核，星数与报告一致。建议精确值改「约」或注明抓取日期，并补全清单。
- **A4 「反爬不可核验」结论已过时（取决于网络环境）**：`research/README.md:44` 称 `anthropic.com` 与 `cognition.ai`「在本机不可直接抓取，未独立核验全文」。本次评审两条链接均 200 且读到正文：Anthropic 原文「multi-agent systems use about 15× more tokens than chats」（对应 `research/02:36` 的 15× 结论）；Cognition 两原则「Share context / Actions carry implicit decisions」（对应 `research/02:32`）。建议升级为已核验或注明抓取条件。
- **A5 报告 04 一处行号引用偏移**：`research/04:50` 写「`:244/:297/:324/:355` 各工具描述」；实测 spawn=244 ✓、send=297 ✓、interrupt=355 ✓，但 `:324` 是 `list_agents` 的描述，`wait_agent` 描述实际在 `:333`（超时参数在 `:336`，「10s–3600000ms、默认 3e4」引用准确）。不影响结论。
- **A6 任务书文件数口径**：任务书写「6 个文件存在且非空」，实际待评审为 8 个（3 个载体 + README + 4 份分报告）；本评审按 8 个全部核验。
- **A7 角色数口径不明（报告 01）**：`research/01:19` 称 DevSupervisor「内置 12 种角色」。其 README 角色表为 11 行 / 13 个角色名（含 `supervisor`；不含 supervisor 为 12）。数字可解释，建议注明「不含 supervisor」。另 `research/01:20` 的「MCP server 24 个工具」本次未能独立核到（raw `main` README 404），建议补核或标「未核」。
- **A8 实测记录可复核性**：`research/04:44` 的活体生效时间戳（20:14:55 / 20:15:09）无法从现状复现（文件 mtime 已是 20:19）；建议实测类证据附「命令 + 输出」，而非只记时间点。

## evidence（核验命令与结果）

1. **文件完整性**：`wc -l AGENTS.md 主管手册.md .dsh/skills/project-supervisor/SKILL.md research/*.md` → 76/54/154/74/72/74/57/56 行，8 个文件均存在且非空（PASS）。
2. **SKILL frontmatter 合法性**：`SKILL.md:1-10` 含 `name: project-supervisor`（kebab-case）、`description`、`whenToUse`、`user-invocable: true`、`metadata`。对照 `@deepseek-ai/dsh-skill-filesystem/README.zh.md`（skill 格式）：「必填 `name` 与 `description`，另有可选 `whenToUse`、`metadata`、`disable-model-invocation` 与 `user-invocable`」；`lib/index.js:852-857` 严格解析 `user-invocable` 布尔值。当前会话技能目录已出现 `project-supervisor` 条目（加载成功，非猜断）。
3. **AGENTS ↔ SKILL 逐条对照（4 类关键规则）**：写范围 `AGENTS:16,28,36` ↔ `SKILL:26,31,65`；验收 `AGENTS:56-58` ↔ `SKILL:30,40,99-106`；并行 `AGENTS:34-39` ↔ `SKILL:29,38,44`；返工 `AGENTS:59-60` ↔ `SKILL:32,42,148`。结论：**无实质矛盾**（仅模板字段不同步，见 A1）。
4. **DSH 版本与配置**：`@deepseek-ai/dsh/package.json` → `0.2.0-rc.2`；`~/.dsh/profiles/web/package.json:21` = `"@deepseek-ai/dsh-experimental-agent-team-profile"`（与 `research/04:3` 一致）。
5. **DSH 常量与行号**：`@deepseek-ai/dsh-experimental-agent-team/lib/index.js:1669-1673` → `DEFAULT_MAX_MEMBERS=16`、`DEFAULT_MAX_TASKS=256`、`DEFAULT_MAX_PENDING_MESSAGES=64`、`DEFAULT_MAX_MESSAGE_BYTES=65536`，`:1689-1693` 为 schema 默认值；错误码 `TEAM_MEMBER_LIMIT:564`、`TEAM_MAILBOX_FULL:826`、`TEAM_TASK_LIMIT:1470`。`README.zh.md:51-54` 上限表 16/256/64/65,536。全部与 `research/04:49-50`、`research/README.md:45`、`主管手册.md:44` 一致（PASS）。
6. **DSH 语义**（对照 `@deepseek-ai/*/README.zh.md`）：
   - 「对话框=Session」+ 侧边栏隐藏 `origin: 'subagent'` 行：`dsh-client-ui-workspace/README.zh.md:173`；Team 面板只读、无 mailbox timeline、晚启用需刷新：`dsh-experimental-client-ui-agent-team/README.zh.md:32/40/88/89` → 对应 `主管手册.md:18`、`research/04:10`（一致）。
   - 写范围仅提示：`agent-team/README.zh.md:207`「write scope 仅作提示——Bash、formatter、代码生成器与直接外部写入可以绕过文件版本检查」→ `主管手册.md:42`、`research/04:22`（一致）。
   - 消息不重发：`agent-team/README.zh.md:71`「排队的消息已经安全存储，因此绝不能重发」→ `主管手册.md:41`、`research/04:18`（一致）。
   - owner 不自动释放：`agent-team/README.zh.md:209` → `主管手册.md:45`、`research/04:31`（一致）。
   - `wait_agent` 10s–1h、默认 30s：`tool-agent-team/lib/index.js:332-336` → `主管手册.md:44`、`research/04:20`（一致）。
   - AGENTS.md 刷新语义（无 watcher、由成功的第一方 read/write/edit touch 与恢复对账驱动、`maxBytes=65536`、候选含本地 overlay、项目根 `.git`）：`dsh-agent-instructions/README.zh.md:12/32/36/215`；`lib/index.js:16-19`（`DEFAULT_MAX_SOURCE_BYTES=1048576`）→ `主管手册.md:9`、`research/04:42`（一致）。
   - 技能根 rank 100/200/300/400/500、深度 1、watcher 下一模型步骤生效、`projectRoot`=最近含 `.git` 祖先否则 cwd：`dsh-skill-filesystem/README.zh.md:46-56/81/148` → `主管手册.md:10`、`research/04:43`（一致；本工作区确无 `.git`，`ls -la` 已核）。
7. **GitHub 仓库存在性与星数**（未认证 API 60 次/时限流，最终 `core.remaining=0`，改用 HTML 内嵌 `stargazerCount` 与 shields.io 交叉）：DevSupervisor `api.github.com` = 27★（与报告一致，`archived=false`，`pushed_at=2026-09-24`）；spec-kit 142,665（报告 142,666）；BMAD 54k、agent-os 5.5k、vibectl 5、pi-super-devteam 0、AIPM-Wiki 430、aipm-skill-pack 1、agency-agents-zh 22k、vibe-coding-guide 16、project-dev-orchestration 0、MetaGPT 71k、ChatDev 35k、swarm 22k、langgraph-supervisor 1.7k、AgentScope 34k、AutoGen 62k、vibe-coding-cn 18k、ai-guide 22k、Vibe_coding_guide 239、Shanchun 0 —— 与 `research/README.md:42`、01/02/03 各表一致（PASS，仅 1★ 漂移与清单漏项，见 A3）。
8. **链接 HTTP 状态**（`curl -sL -o /dev/null -w '%{http_code}'`）：simonwillison（Karpathy 引用页）200、RTE（Collins）200、GitHub Blog（Spec Kit 发布）200、github.github.io/spec-kit 200、DevSupervisor `docs/agent-loop.md` 200、docs.bmad-method.org 200、buildermethods.com/agent-os 200、掘金 200、腾讯云 200、人人都是产品经理 200、`code.claude.com/docs/en/agent-teams` 200、`code.claude.com/docs/en/subagents` 200（首次 000 重试通过）、anthropic.com 200、cognition.ai 200、arxiv 2308.08155 200、npm registry 200。`github.com/jonradoff/vibectl` → **301 → github.com/metavert-io/vibectl**（报告 01/README 的「原 jonradoff 301 迁移」属实）。
9. **内容性事实抽查（原文级）**：
   - Karpathy 页原文「There's a new kind of coding I call "vibe coding", where you fully give in to the vibes, embrace exponentials, and forget that the code even exists.」+ 日期 6th February 2025 → `research/01:7` 属实。
   - RTE 原文「Vibe coding ... has been named Collins' Word of the Year for 2025.」+ 日期 6 Nov 2025 → `research/01:7` 属实。
   - `github.github.io/spec-kit` 原文流程「Specify → Plan → Tasks → Implement → Converge」→ `research/01:9` 属实。
   - Anthropic 原文「multi-agent systems use about 15× more tokens than chats」→ `research/02:36`、`AGENTS.md:39`、`SKILL.md:44` 的 15× 属实。
   - Cognition 博文两原则「Share context」「Actions carry implicit decisions」→ `research/02:32` 属实。
   - Claude Code Docs（agent-teams）原文含「Start with 3-5 teammates for most workflows」「Having 5-6 tasks per teammate」「Task claiming uses file locking to prevent race conditions」「Wait for teammates to finish. Sometimes the lead starts implementing tasks itself」→ `research/02:10/21/23/35` 属实。
   - `registry.npmjs.org/pi-super-devteam` → `latest 0.1.3`、MIT；其 README 含「有界返工…默认最多额外修复 2 次」「accepts/blocking/advisory/evidence」JSON 裁决与不可逆动作清单（`git push --force`、`rm -rf`、`npm publish`、`kubectl delete`…逐条展示动作/目标/影响/可恢复性/命令）→ `research/03:20/38/39` 属实。
   - AIPM-Wiki 文档路径 `docs/02-pm-skills/vibe-coding/from-idea-to-demo.md` → raw 200 → `research/03:57` 属实。
   - `agency-agents-zh` README 写 328 角色/22 部门、About 写 277/20 → `research/README.md:42` 的差异说明与处理方式属实。

## 风险（D，按发生概率/影响排序）

- **R1（高）授权口径冲突**：见 B1。新会话可能不 spawn 或不敢 spawn，表现为「主管自己干」，核心承诺失效。
- **R2（中）写范围只是提示、无锁**：`AGENTS.md:36` 的单写者是纪律不是机制（`agent-team/README.zh.md:207/139`，`writeScopes` 仅警告不阻止 claim）；Bash/formatter/codegen 可绕过版本校验。命令模板未写「越界写入视为失败」，两对话框同写一文件时只能事后看 diff 才发现。
- **R3（中）owner 不自动释放**：成员失败/中断/退出后任务仍被「死领」（`agent-team/README.zh.md:209`、`research/04:31`）。`主管手册.md:45` 只说了限制，没给「如何 reassign/reopen」的操作指引，用户中途打断后容易卡住。
- **R4（中）并行上限表述不一致**：`AGENTS.md:37` 只写「环境上限以 Agent Teams 配置为准」不给数；真实上限 `maxMembers=16`（含失败成员）、默认建议 2–4 只在 `主管手册.md:44`。主管可能把「默认 2–4」误当硬上限。
- **R5（低）模板/落盘不一致**：见 A1/A2。新会话只读 `AGENTS.md` 时用旧模板漏「网络/预算」；按 `AGENTS.md:63` 可能把决策写进 `research/README.md` 覆盖调研总览；`research/DECISIONS.md` 尚不存在。

## 检查项判定

| 检查 | 判定 | 说明 |
|---|---|---|
| A 完整性 | **PASS** | 8 文件存在非空；frontmatter 合法（DSH 规范 + 实载目录佐证）；AGENTS↔SKILL 四条关键规则无实质矛盾（模板差异见 A1/A2） |
| B 准确性 | **PASS** | 抽查 20+ 仓库星数、16+ 链接、7 类 DSH 常量/行号、8 条内容性事实，均与报告一致；仅 spec-kit 1★ 漂移、04 行号 1 处偏移（A3/A5） |
| C 可用性 | **FAIL** | 1 处 blocking：自主并行授权口径 vs DSH 固定策略（B1）；其余 Team 面板/写范围/消息/owner/AGENTS 刷新等表述均与 README 一致 |
| D 风险 | **PASS** | 已列 5 项风险并给缓解方向 |
| E 结论 | **有条件通过** | 修 B1 后可通过；A1–A4 建议同批修 |
