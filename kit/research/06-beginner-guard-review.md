# 06 · 「零基础用户保护」独立评审

- 评审人：reviewer-beginner（只读评审，未参与实现，不给自己签收）
- 任务：task-8；日期：2026-10-24
- 评审对象：AGENTS.md 新增「零基础用户保护（默认开启）」段（L33–43）；`.dsh/skills/project-supervisor/SKILL.md` 新增同名章节（L36–69）与立项零基础检查（L91）；`主管手册.md` 新增用户向导章节（L80–97）；`setup/DECISIONS.template.md` L10–16；`setup/VERSION` 1.1.0；`setup/CHANGELOG.md` [1.1.0]
- 唯一写入：本文件。其余文件只读。
- 简称：`AGENTS` = `AGENTS.md`；`SKILL` = `.dsh/skills/project-supervisor/SKILL.md`；`手册` = `主管手册.md`；`模板` = `setup/DECISIONS.template.md`；`KIT` = `setup/`。

## 结论摘要

**有条件通过**：机制方向正确、动作大多可执行（git 安全网、MVP/完成定义、架构二选一、密钥隔离、不可逆确认、文档外置），与既有规则无实质冲突，kit 模板同步检查通过。但存在 **3 个 blocking**：①用户侧「密钥/账号/素材怎么交付」没有落地路径，安全规则反而把新手逼回「贴聊天」；②「文档即记忆」只写不读，立项流程没有读回 README/DECISIONS 的步骤，换会话不丢的承诺落空；③本机全局技能与 `dist/` 分享包仍是旧版（零基础章节 0 命中），「换一个新会话/换工作区照做」实际拿不到新规则。

---

## A. 覆盖度（20 类新手常见错误 → 载体 → 形态）

形态说明：**可执行动作** = 有明确动作/命令/检查；**半口号** = 有动作但缺命令或验收手段；**口号** = 只有原则性表述；**未覆盖** = 三处载体均无。

| # | 新手常见错误 | 载体覆盖（文件:行） | 形态 | 说明 |
|---|---|---|---|---|
| 1 | 不建 git、不提交 | `AGENTS.md:37`；`SKILL.md:44`；`主管手册.md:86`；`模板:12` | 可执行动作 | `git init` + 首次提交 + 每步 commit，证据 `git log --oneline` / `git status` |
| 2 | 不写 `.gitignore`、垃圾入库 | `AGENTS.md:37`；`SKILL.md:45`；`主管手册.md:86` | 可执行动作 | 两处给了具体清单；手册未列内容（仅让主管做） |
| 3 | 不选架构、技术栈飘 | `AGENTS.md:39`；`SKILL.md:46`、`:65`；`主管手册.md:87`；`模板:14` | 可执行动作 | 2–3 选 1 + 理由写入 DECISIONS.md；默认策略给了选择树 |
| 4 | 一次做太大、无 MVP | `AGENTS.md:38`；`SKILL.md:47`；`主管手册.md:88`；`模板:15` | 可执行动作 | 完成定义必须写成命令；手册要求用户先确认第一版范围 |
| 5 | 不跑起来/不跑测试就继续加功能 | `AGENTS.md:40`；`SKILL.md:48`；`主管手册.md:89` | 半口号 | 「跑通/跑测试」在无测试框架的新项目里没有最低证据定义 |
| 6 | 没有回滚点 | `AGENTS.md:37`；`SKILL.md:49`；`主管手册.md:86` | 可执行动作 | 每步一个 commit；`git log` 可查 |
| 7 | 密钥/密码写进代码或提交 | `AGENTS.md:41`；`SKILL.md:50`；`主管手册.md:90`；`模板:16` | 半口号 | `.env` + `.env.example` + 不提交有动作，但「用户怎么把 key 交给项目」缺失（见 BLK-1） |
| 8 | 不写 README、换会话丢上下文 | `AGENTS.md:42`；`SKILL.md:51`、`:60`；`主管手册.md:91`；`模板:13` | 半口号 | 写入动作明确，但立项无读回步骤（见 BLK-2） |
| 9 | 报错不读、靠猜 | `AGENTS.md:40`；`SKILL.md:52`；`主管手册.md:92` | 可执行动作 | 先读完整报错定位文件与行 |
| 10 | 依赖乱装/版本不明 | `SKILL.md:53`；`AGENTS.md:42`；`主管手册.md:95` | 半口号 | 只要求「记录依赖与版本」，未要求 lockfile、安装命令、Node/Python 版本检测 |
| 11 | 没有验收标准 | `AGENTS.md:38`；`SKILL.md:54`、`:62`；`主管手册.md:95`；`模板:15` | 可执行动作 | 3 条可执行检查；但「能点」本身不是命令 |
| 12 | 删库/发布/花钱不确认 | `AGENTS.md:41`、`:76`；`SKILL.md:55`；`主管手册.md:93` | 可执行动作 | 列动作/目标/影响/可恢复性/确切命令再确认；确认记录无落盘位置 |
| 13 | 不备份（本地磁盘坏/目录误删即全丢） | — | 未覆盖 | 只有本地 git commit；无远程仓库/导出/数据备份规则 |
| 14 | 成本/费用失控（API 费、服务器、自动续费） | `AGENTS.md:41`（花钱需确认，间接）；`AGENTS.md:51`、`SKILL.md:81`（主管侧多智能体 15× token） | 口号 | 面向新手项目的预算/免费额度/自动续费提醒缺失 |
| 15 | 部署上线坑（本地能跑≠别人能访问、环境变量、域名/HTTPS） | — | 未覆盖 | 完成定义示例停在 `npm run dev`（本地） |
| 16 | 环境安装坑（Node/Python 版本、装依赖失败、终端不熟） | `SKILL.md:53`、`:60`（README 记录依赖与版本） | 半口号 | 无开工时的环境检查/安装命令 |
| 17 | 需求频繁变更/范围蔓延 | `SKILL.md:69`、`:186`（对主管的沟通与过度设计约束）；`主管手册.md:97` ① | 口号 | 无「变更先记 DECISIONS 再改」的规则 |
| 18 | 隐私/账号安全（个人数据、公司账号、key 权限） | `AGENTS.md:41`（仅密钥） | 口号 | 未覆盖数据出境、第三方上传、权限最小化 |
| 19 | 不知道文件在哪/不会操作终端 | `SKILL.md:51`、`:60`（README 目录说明）；`主管手册.md:95` | 半口号 | 用户侧无「怎么找到/编辑 `.env`」这类零基础操作指引 |
| 20 | 乱用不可逆命令（`rm -rf`、`git reset --hard`、drop table） | `AGENTS.md:76`；`SKILL.md:55` | 半口号 | 有「删除类需确认」原则，无命令级黑名单/先打备份点要求 |

**未覆盖/明显薄弱汇总**：备份与异地恢复（#13）、部署上线（#15）、成本费用（#14）、环境安装（#16）、隐私与账号（#18）、需求变更（#17）。以上 6 类建议进 advisory 补齐（其中备份/部署/成本对「做完能给别人用」影响最大）。

**正向发现**：SKILL 的「常见错误 → 动作 → 证据」表实测 12 行数据行（`awk 'NR>=44 && NR<=55 && /^\|/' … | wc -l` → `12`），与 `setup/CHANGELOG.md:10` 写的「12 类」一致；开工五件套 5 项与 `模板:12–16` 5 个勾选项一一对应；三载体覆盖的 12 类核心错误一致。

---

## B. 可执行性

**已具备（可直接照做）**：`git init`、`.gitignore` 具体条目（`node_modules/`、`.env`、`dist/`、`*.log`、`.DS_Store`）、`git log --oneline`/`git status` 证据、首次提交、`README.md` 必含字段（目标/启动/依赖/目录）、`DECISIONS.md` 选型行、3 条验收标准、不可逆动作五要素、`npm run dev` 完成定义示例、架构选择树、每步节奏「改一件事→跑→贴证据→commit→汇报」（`SKILL.md:67`）。换工作区安装后靠 KIT 模板（`setup/AGENTS.supervisor.md:33`、`setup/skill/SKILL.md:36`、`setup/主管手册.md:79`、`setup/DECISIONS.template.md:10`）可复制这套规则。

**不可执行/含糊清单**：

1. **密钥交付断头路**：`SKILL.md:50` 只给「用 `.env` + `.gitignore`，示例写 `.env.example`」，证据写「仓库搜不到真实密钥」但没给扫描命令（全仓库 grep `gitleaks|git grep|密钥扫描|npm audit` 无命中，exit 1）；`主管手册.md:90` 让用户「给 key 时说明用途，不要贴进聊天记录」，却没说用户该把 key 放哪、怎么编辑 `.env`；`SKILL.md:69` 又说「需要他提供东西时写清单（账号、API key、素材）」。零基础用户实际只有两条路：违反规则贴进聊天，或卡住。→ **BLK-1**
2. **文档只写不读**：`SKILL.md:51` 的验收证据是「新会话能只靠文件继续」，但立项第 1 步（`SKILL.md:90`）只读 `ls`/`git status`/`AGENTS.md`/`team_task_list`，全仓库无「立项先读 README/DECISIONS」的指令（`grep -n '先读'` 无 README 命中，exit 1；唯一相关是 `SKILL.md:82` 的原则性表述「状态与决策外置…事实源」，非流程步骤）。→ **BLK-2**
3. **「跑测试」无最低定义**：`AGENTS.md:40`、`SKILL.md:48` 要求「跑通/跑测试」，但五件套（`SKILL.md:57–63`）不要求建最小测试；新项目通常没有测试框架，主管执行时只能自行解释。
4. **验收证据不可执行**：`SKILL.md:42–55` 表里的「命令输出」「仓库搜不到真实密钥」「新会话能只靠文件继续」「用户确认记录」不是可执行检查，也没有落盘位置（确认记录写哪？）。
5. **「能点」不是命令**：`SKILL.md:54`、`:62` 的验收「能打开、能点、测试过」需落成「浏览器打开 `http://localhost:3000`，点 X 出现 Y，截图/输出存哪」。
6. **托管默认方案含糊**：`SKILL.md:65`「需要托管 → 先用平台默认方案」没给平台名，换新会话时无法落实。
7. **完成定义示例与默认架构不匹配**：`AGENTS.md:38` 用 `npm run dev` 做示例，但同一套规则的静态页默认是「单文件 HTML/JS」（`SKILL.md:65`，无 npm）；新手项目可能就是单 HTML，示例反引向 Node。
8. **五件套顺序矛盾**：`SKILL.md:59` 第 1 条「空仓库也可以先提交一次 README」，而 `README.md` 在第 2 条（`:60`）才创建，照做会卡在「没有 README 可提交」。
9. **`git commit` 前置条件缺失**：全新机器未配置 `user.name`/`user.email` 时首次 commit 会报 `fatal: unable to auto-detect email address`；五件套未提示先配置，零基础用户会在第一步失败。
10. **验收标准落盘位置二选一**：`AGENTS.md:38` 说范围写 `README.md`/`DECISIONS.md`，`SKILL.md:61` 明确放 `DECISIONS.md`，而 `模板:15` 只有勾选项、没有「完成定义/3 条验收标准」填写区，照模板填完无处置放。

**换新会话推演**：本工作区内，新会话能读到 `AGENTS.md` + 项目级 SKILL，规则可落地；但换到其他工作区时依赖全局技能或 KIT，而两者当前都是旧版（见 BLK-3），等于「照做拿不到新规则」。

---

## C. 一致性

**三载体对照**：`AGENTS.md:33–43`（7 条底线）、`SKILL.md:36–69`（触发信号 + 12 类表 + 五件套 + 架构策略 + 节奏 + 沟通）、`主管手册.md:80–97`（8 行对照表 + 五件事 + 三件事）。三处**无实质矛盾**，分层合理（常驻规则摘要 / 技能详细版 / 用户向导），关键措辞一致：都是「先自建安全网→MVP→架构二选一→每步跑通→密钥隔离→文档外置→不可逆确认」。

**冗余与轻微漂移**（建议收敛，非阻塞）：
- `.gitignore` 清单：`AGENTS.md:37` 4 项（无 `.DS_Store`）vs `SKILL.md:45` 5 项（有 `.DS_Store`）。
- `.env.example`：`SKILL.md:50`、`:63` 有，`AGENTS.md:41` 没有（只有 `.env` + `.gitignore`）。
- 手册用户表 8 行 vs SKILL 12 行（用户向取舍，可接受）。
- `AGENTS.md:37–43` 与 `SKILL.md:44–55` 约 7 项近逐条重复，三处手改易漂移；建议 AGENTS 只留一句「细则见 `.dsh/skills/project-supervisor/SKILL.md` 零基础章节」。

**与既有规则冲突检查**：
- 授权口径（`AGENTS.md:14`）：无冲突；新增规则未改变「用户交目标即授权 Agent Teams」。
- 权限口径（`AGENTS.md:15`、`SKILL.md:34`）：无冲突；新章节未授予更高权限。
- 写者不给自己签收（`AGENTS.md:71`、`SKILL.md:77`）：无直接冲突。但注意单会话降级时主管既执行开工五件套又自检，属于既有降级设计的固有局限，建议在手册「已知限制」补一句。
- 有限返工（`AGENTS.md:75`）、信息缺口（`AGENTS.md:26–29`）：无冲突。
- 不可逆动作确认与「备份」潜在张力：`AGENTS.md:41` 把「推送」列为需确认不可逆动作，而 #13 备份若用远程仓库恰好需要 push；将来补备份规则时要写清「首次推送外链仓库算新增动作，逐次确认」，否则会自相矛盾。

**Kit 同步检查（要求项）**：`bash setup/sync-kit.sh --check` → `结果: 全部一致（9 个文件）`，`EXIT_CODE=0`，涵盖 `setup/AGENTS.supervisor.md`、`setup/主管手册.md`、`setup/skill/SKILL.md`、`setup/research/01–05`、`setup/research/README.md`。KIT 副本中零基础章节实测存在：`setup/AGENTS.supervisor.md:33`、`setup/skill/SKILL.md:36`、`setup/主管手册.md:79`、`setup/DECISIONS.template.md:10`。
注意：`--check` 只覆盖 9 个模板文件，**不覆盖** `~/.dsh` 全局技能、也不覆盖 `dist/` 分享包——这两处当前是旧版（见下）。

**版本与变更日志**：`setup/VERSION` = `1.1.0`（L1），`setup/CHANGELOG.md:5` 有 `## [1.1.0] 2026-10-24`，内容与实际改动对应（AGENTS/SKILL/手册/模板四处），一致。

**落地载体未更新（→ BLK-3）**：
- `~/.dsh/skills/project-supervisor/SKILL.md`：`grep -c '零基础'` → `0`（exit 1），11762 字节，工作区版 15327 字节；`主管手册.md:47` 还写着「全局技能已安装…升级时重跑安装脚本即可」，与现状不符。
- `dist/project-supervisor-kit-2026-10-24.zip`（构建于 21:48）内 `skill/SKILL.md` 零基础 0 命中、`AGENTS.supervisor.md` 6158B、`DECISIONS.template.md` 535B，均早于源文件 22:11 的修改；即分享给朋友/别的工区拿到的是旧版。

**工程纪律自检**：本次改动全部未提交（`git status --porcelain | wc -l` → `10`，`git log --oneline -1` → `920020a`），与本次新增「每个能跑通的小步都提交一次」自相矛盾，也不利于评审按 diff 复核。

---

## D. 新手视角

**用户被要求做什么**（`主管手册.md:80–97`）：说清目标和使用场景（易）→ 项目跑起来后点一点、说哪里不对（易，但无界面项目不适用）→ 对不可逆/花钱做确认（易）→ 说「回到上一版」「继续上次的项目」（易，只是说话）。**没有让用户看代码、跑命令、做技术决策**，这个承诺成立，是本次设计最大的正确点。

**「用户最少只需做三件事」是否真的够：不够。**
- 漏了「提供必要材料」：`主管手册.md:90` 要求用户「给 key」，`SKILL.md:69` 要求主管向用户要「账号、API key、素材」；但三件事（`主管手册.md:97`）里没有这一项，也没写怎么给、放哪里（见 BLK-1）。
- 漏了「确认第一版范围」：`主管手册.md:88` 明确让用户「先确认『第一版要能做什么』」，这属于用户决策动作，未列入三件事。
- 「点一点页面」不是所有项目都有界面：API/脚本/命令行/爬虫类项目无法「点」，手册没给替代反馈方式（看运行输出/截图/结果文件）。
- 结论：实际最少是 **4–5 件事**：①说目标 ②确认第一版范围 ③按主管给的模板提供 key/账号（写进 `.env`，不发聊天）④跑起来后反馈（有界面点一点，没界面看结果）⑤确认不可逆/花钱动作。

**术语门槛**：用户向导段落直接出现 `git init`、`.gitignore`、`.env`、`DECISIONS.md`、MVP（`主管手册.md:86–91`、`:95`），零基础用户即使「不用管」也会困惑。建议用户段改成「效果语言 + 术语括号」，例如「主管会先给项目存一个安全版本（git），改坏了能退回去」；`主管手册.md:82` 的「你不需要懂代码」开场很好，可把这条贯彻到表格每格。

**其他体验点**：手册第 91 行「新会话直接说『继续上次的项目』」依赖主管先读回文件，当前流程没保证（BLK-2），修好后这句话才成立；「改坏了直接说『回到上一版』」（`:86`）对零基础用户是友好的，但没写清「多版时回到哪一版」，建议补一句「主管会说清会退到哪一步再执行」。

---

## E. 评审结论

### 结论：**有条件通过**

方向正确、大部分动作可执行、与既有规则无实质冲突、kit 模板同步通过；但 3 个 blocking 会让零基础用户实际卡住或让核心承诺落空，修完可转通过。

### Blocking（必须修，3 条）

**BLK-1｜用户侧「密钥/账号/素材」没有落地路径（安全规则形同断头路）**
- 证据：`SKILL.md:50`（动作只到 `.env`/`.env.example`，证据「仓库搜不到真实密钥」但无扫描命令）；`主管手册.md:90`（「给 key 时…不要贴进聊天记录」，未说放哪、怎么放）；`SKILL.md:69`（要求用户提供账号/API key/素材）；全仓库 grep `gitleaks|git grep|密钥扫描|npm audit` 无命中（exit 1）。
- 后果：零基础用户要么把 key 贴进聊天（违反刚写的安全规则），要么卡住无法继续。
- 修复：加固定流程——主管生成含占位符的 `.env` + `.env.example`，给用户「在项目里打开 `.env`，把 key 粘在 `=` 后面保存，不要发给我」这类傻瓜指令；验收补具体扫描命令（如 `git grep -nE 'sk-[A-Za-z0-9]{20,}|(api[_-]?key|token)\s*=\s*["'\''][^"'\'' ]+'`）；三处载体同步。

**BLK-2｜「文档即记忆」只写不读，换会话不丢承诺落空**
- 证据：`SKILL.md:51` 承诺「新会话能只靠文件继续」；但立项第 1 步（`SKILL.md:90`）只读 `ls`/`git status`/`AGENTS.md`/`team_task_list`，未要求读 README/DECISIONS；`grep -n '先读'` 无「先读 README/DECISIONS」命中（exit 1）；`AGENTS.md:42` 也只写不读；`主管手册.md:91` 让用户「新会话直接说继续上次的项目」。
- 后果：换会话后主管可能重新问目标、重做选型，用户感觉「怎么又要说一遍」。
- 修复：`SKILL.md:90` 立项第 1 步改为「先读 `README.md`、`DECISIONS.md`（或 `research/DECISIONS.md`）、`PROJECT.md`（若存在），复述目标/现状/上一步，再动手」；`AGENTS.md:42` 补一句「新会话第一步先读 README/DECISIONS」；手册同步。

**BLK-3｜可落地载体未更新：全局技能与 `dist/` 分享包仍是旧版**
- 证据：`grep -c '零基础' ~/.dsh/skills/project-supervisor/SKILL.md` → `0`（exit 1），`wc -c` 全局 11762 vs 工作区 15327；`unzip -p dist/project-supervisor-kit-2026-10-24.zip '*/skill/SKILL.md' | grep -c '零基础'` → `0`，包内 AGENTS.supervisor.md 6158B / DECISIONS.template.md 535B（源文件 7595B / 912B），包构建时间 21:48 早于源文件 22:11；`sync-kit.sh --check`（exit 0）不覆盖这两处；`主管手册.md:47` 声称全局技能已更新。
- 后果：在别的工区/朋友的机器上说「你当项目主管」，拿到的仍是旧规则，本次改动等于没交付出去。
- 修复：`bash setup/sync-kit.sh --global`（自动备份旧文件）后复检 `grep -c 零基础 ~/.dsh/skills/project-supervisor/SKILL.md` 应 >0；`bash setup/build-dist.sh` 重打 zip 后 `unzip -p dist/*.zip '*/skill/SKILL.md' | grep -c 零基础` 应 >0。

### Advisory（建议，10 条）

1. **覆盖缺口 6 类**：备份/异地恢复、部署上线、成本费用（免费额度/自动续费）、环境安装与版本检测、隐私与账号权限、需求变更管理。至少把「备份」「部署」补进五件套或收尾清单——决定了「做出来能不能长期用/给别人用」。
2. **验收证据可执行化**：把 `SKILL.md:42–55` 的「命令输出/仓库搜不到真实密钥/新会话能只靠文件继续/用户确认记录」落成固定三查：`git log --oneline -3`、`git status --porcelain`、密钥扫描命令；用户确认记录写进 `DECISIONS.md` 表格一行。
3. **收敛三载体冗余**：`AGENTS.md:37–43` 只留一句指针（细则见 SKILL 零基础章节），消除 `.gitignore` 清单（4 项 vs 5 项，缺 `.DS_Store`）与 `.env.example`（SKILL 有、AGENTS 无）的漂移。
4. **架构默认策略给具体平台**：`SKILL.md:65`「需要托管 → 平台默认方案」改为可命名默认（如纯静态 → GitHub Pages/Cloudflare Pages；有后端 → Render/Fly.io + SQLite），并写「什么时候升级」。
5. **完成定义示例对齐默认架构**：`AGENTS.md:38` 的 `npm run dev` 改为「浏览器能打开页面（或 `npm run dev` 能打开）」，避免静态单文件项目被误引向 Node。
6. **五件套第 1 条顺序修正**：`SKILL.md:59` 改「先提交 `.gitignore`（README 建好后再提交）」，并补 `git config user.name/email` 前置步骤（新机首次 commit 会失败）。
7. **无测试项目的最低验收**：明确「没有测试框架时，启动命令跑通 + 主流程 1 次点击/调用（留存输出或截图）」即算通过。
8. **「三件事」改「四件事」**：`主管手册.md:97` 补「按模板提供 key/账号（写进 `.env`，不发聊天）」与「确认第一版范围」；「点一点页面」补无界面项目的替代方式。与 BLK-1 同批修。
9. **模板补填写区**：`setup/DECISIONS.template.md` 在「新项目开工检查」后加「完成定义」「验收标准（3 条）」两个可填写小节，与 `SKILL.md:61` 落盘位置一致。
10. **补交接/收尾清单**：项目收尾时写「怎么启动、怎么部署、数据在哪、找谁维护」，让零基础用户拿到可长期使用的项目；同时补「多版回退时说清退到哪一版」的用户话术。

### 工程纪律建议（随 blocking 一起处理）

- 本次改动 10 个文件未提交（`git status --porcelain | wc -l` → `10`，HEAD 仍为 `920020a`），与新增「每步提交」规则自相矛盾；修完 blocking 后按 `改源文件 → selftest.sh → sync-kit.sh → build-dist.sh → verify-facts.sh`（`主管手册.md:68`）走一遍再 commit，评审 diff 才可复核。

### Evidence（命令 + 结果）

```text
$ bash setup/sync-kit.sh --check; echo "EXIT_CODE=$?"
一致    setup/AGENTS.supervisor.md
一致    setup/主管手册.md
一致    setup/skill/SKILL.md
一致    setup/research/01-vibe-coding-supervisor.md
…（共 9 个文件，全部一致）
结果: 全部一致（9 个文件）
EXIT_CODE=0

$ grep -c '零基础' ~/.dsh/skills/project-supervisor/SKILL.md; echo "EXIT=$?"
0
EXIT=1
$ wc -c ~/.dsh/skills/project-supervisor/SKILL.md .dsh/skills/project-supervisor/SKILL.md
   11762 …/SKILL.md   # 全局（旧）
   15327 .dsh/…/SKILL.md  # 工作区（新）

$ unzip -p dist/project-supervisor-kit-2026-10-24.zip '*/skill/SKILL.md' | grep -c '零基础'
0
$ unzip -l dist/project-supervisor-kit-2026-10-24.zip | grep -E 'SKILL.md|AGENTS|主管手册|DECISIONS'
      535  10-24-2026 21:48   …/DECISIONS.template.md
    11762  10-24-2026 21:48   …/skill/SKILL.md
     6158  10-24-2026 21:48   …/AGENTS.supervisor.md

$ awk 'NR>=44 && NR<=55 && /^\|/' .dsh/skills/project-supervisor/SKILL.md | wc -l
12   # 与 CHANGELOG「12 类」一致

$ grep -nE 'gitleaks|git grep|密钥扫描|npm audit' AGENTS.md .dsh/skills/project-supervisor/SKILL.md 主管手册.md
（无命中，exit 1；密钥泄露无扫描命令）

$ grep -n '先读' .dsh/skills/project-supervisor/SKILL.md AGENTS.md 主管手册.md
AGENTS.md:28（派发用）… SKILL.md:33（信息缺口）… SKILL.md:52（报错）…
（无「立项先读 README/DECISIONS」；`SKILL.md:90` 立项步骤 1 仅 ls/git status/AGENTS.md/team_task_list）

$ git status --porcelain | wc -l
10
$ git log --oneline -1
920020a refactor: 精简 AGENTS.md 至 76 行 / 6.0KB，完成 P1/P2 收尾
```

### 评审范围声明

- 只读评审：未修改任何被评审文件；本文件为唯一写入。
- 未运行会写盘的脚本（`selftest.sh`/`build-dist.sh` 未执行，以保护「唯一写范围」；BLK-3 修复后请实现方自行运行并复检）。
- 证据截止时间：2026-10-24 22:1x（本机当前工作区状态）。
