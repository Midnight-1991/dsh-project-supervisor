# 08 · 「新项目需求追问」独立评审（只读）

- 评审对象：插件 0.4.0 / 套件 1.6.0；评审人未参与实现，只读检查。
- 结论：**有条件通过**。代码链路、测试、dist 包均成立；2 个 blocking 都在规则文本，修完即可发。

## A 需求符合度（最重要）

| 需求要点 | 覆盖情况 | 证据 |
|---|---|---|
| ① 新项目先追问具体需求 | 覆盖 | `AGENTS.md:42`（谁用/问题/场景/形态/数据/验收/预算）、`.dsh/skills/project-supervisor/SKILL.md:88-90`（三批分域）、`主管手册.md:112` |
| ② 追问到主管或用户认为不用继续 | 覆盖 | `SKILL.md:96-100` 四类停止条件；`AGENTS.md:42` 与 `主管手册.md:112` 列用户口令版 |
| ③ 仅新项目当轮生效 | 有边界，但存在漏触发洞（见 B1） | `SKILL.md:83-86`、`AGENTS.md:42`、`主管手册.md:114` |
| ④ 默认开 + 读回 | 实现与文档一致 | `plugin/dsh-project-supervisor/index.js:95` 三字段 true、`:116-118` 读回 `!== false`；`client.js:738-740`、`747-749`；`主管手册.md:203` |

- 本工作区无 `.dsh/supervisor.config.json`（`cat` → No such file），按缺省 true 生效，符合「默认开」。
- 弱表述：`AGENTS.md:41` 只写「false 不追问」，未写「缺省按 true」（SKILL/手册有），见 advisory 7。

## B 一致性

- **批数上限矛盾（blocking B2）**：`SKILL.md:94` 写「最多 3 批；出现重大分叉时可再问 1 批」，上限实际为 4；而 `AGENTS.md:42`、`主管手册.md:112`、`:191`、`朋友测试指南.md:205` 均为「最多 3 批」，`SKILL.md:113` 自己也写「最多 3 批」。
- **触发边界三处粒度不同（B1 根因）**：`SKILL.md:84` 把「本工作区已有 `README.md`/`AGENTS.md`/`DECISIONS.md`/git 历史」当作旧项目证据；`AGENTS.md:42` 与 `主管手册.md:114` 只写旧项目/日常改动不触发，无此判据。
- 每批 3–5 个：四处一致（`AGENTS.md:42`、`SKILL.md:90`、`主管手册.md:112/191`、`朋友测试指南.md:203`）。
- 停止条件：`SKILL.md:100` 多两类（连续两批用默认、已有 PRD 确认一句），AGENTS/手册未列；非矛盾，但执行者可能少停（advisory 2）。
- 落盘：三处都写 README + DECISIONS（`AGENTS.md:42`、`SKILL.md:102`、`主管手册.md:112`）；但 `AGENTS.md:74` 又要求「收尾把关键决策写 `research/DECISIONS.md`」，同名文件两个位置（advisory 3）。
- 术语：`AGENTS.md:39`、`主管手册.md:110` 用「新项目开局追问」，`SKILL.md:79` 用「新项目需求追问流程」，面板/README 用「新项目需求追问」（advisory 1）。
- `SKILL.md:108` 示例第 2 批只有「追问共享方式 / 权限 / 是否要登录…」，未给默认答案，与 `:90`「每题给默认答案」略不一致（advisory 8）。

## C 开关链路（源码 + 实测）

- `index.js:95` `DEFAULT_CONFIG` 三字段 true；`:116-118` GET 按 `!== false` 读回；`:130-136` 部分更新保留其他字段；`:172-195` 非布尔 400（`invalid-requirement-interview`）、无字段 400、非法 cwd 400；跨域 403、方法 405 在 `:42`/`:202`；写盘 tmp+rename（`:137-142`）。
- `node plugin/dsh-project-supervisor/scripts/host-smoke.mjs` 实测 13 项全 PASS（含追问开关关→开、互不影响、非法值），`PASS host smoke: 13 checks`，exit 0。
- `client.js:738-740` 服务端按 `!== false`；`:747-749` localStorage 按 `!== 'false'`，默认开语义正确。
- 「host 半侧需重启 dsh web 才写文件」与实现一致：路由由 host 注册（`index.js:207-213`），未重启时 POST 失败 → 落 localStorage + toast。但 toast 承诺「重启 DSH 后同步到工作区」（`client.js:88-113`），加载路径只读 server、不会回写 localStorage（`client.js:738-750`），重启后需重新点一次（advisory 5）。
- 文档过时：`主管手册.md:208` 仍写「11 项离线 smoke（两字段…）」，实际 13 项三字段（advisory 4）。

## D 测试可信度

- `bash setup/selftest.sh` → `PASS: 11  FAIL: 0`，exit 0；含 build-dist 合规检查与「真实工作区 sync-kit --check: 一致」。
- e2e 真覆盖第三开关：`scripts/e2e-screenshot.mjs:336-365` 断言 present / 默认 true / 4 步 → off/false/0 步/「已关闭」→ 回 true/4 步；索引 `[2]` 与渲染顺序 `client.js:931/970/1009`（保护→润色→追问）一致，不是误命中另一张 4 步卡。
- 不足：e2e 只打印 console error（`:432`），未断言为 0；`主管手册.md:208` 的「无 console error」是观察结论，不是回归门槛（advisory 6）。
- dist：`shasum -a 256` = `30654efcfe186e9913e7a4cb9930319f78dd13e62f51fa463a39e750f6e7a37b`，与给定一致。解压含 `research/07-requirement-interview.md`（hash 与工作区相同）、`skill/SKILL.md`、`AGENTS.supervisor.md`、`主管手册.md`；本机绝对路径抽查 → 0 命中；`VERSION` = 1.6.0。
- `skill/SKILL.md` 与工作区仅差 frontmatter `workspace:` 一行（构建归一化），不是旧版。包内 AGENTS 载体是 `AGENTS.supervisor.md`，安装脚本据此写目标 `AGENTS.md`。

## E 许可证与引用

- GitHub API 实测：`github/spec-kit` → MIT；`obra/superpowers` → MIT；`bmad-code-org/BMAD-METHOD` → `NOASSERTION`，与 `research/07-requirement-interview.md:14-16` 的「MIT 正文 + 商标声明，API 报 NOASSERTION」完全吻合。
- 其余 3 个 MIT 仓库因 API 限流（`API rate limit exceeded`）未二次核验，记为未验证项，未发现反证。
- 无许可证声明明确：`research/07-requirement-interview.md:20-21` 标「无许可证…只能读思路，不可照抄」；`:23` 排除出可照抄清单；`:127` 复述「法律上不可复制，只提取通用做法」。满足要求。
- 小瑕疵：`SKILL.md:112`「参考来源（均 MIT…）」只指其下 4 个，易被读成 8 个全 MIT（advisory 9）。

## F 结论与清单

**结论：有条件通过。** 规则可读、开关可写、测试与打包通过；2 个 blocking 均为文本修订，不动代码。

### Blocking（必须修）

1. **B1 触发判据会把「装了套件的新项目」判成旧项目**：`SKILL.md:84` 以「本工作区已有 AGENTS.md」为旧项目证据，但 `setup/install-supervisor.sh:47` 会给每个工作区写 `AGENTS.md`，`朋友测试指南.md:195` 也只让删 README/DECISIONS/.git。按字面执行 → **新项目不追问**。改法：判据限定为「项目自身无可推断需求的产物」，显式排除工作区级 AGENTS.md/主管手册/套件文件，或直接从列表去掉 AGENTS.md。
2. **B2 批数自相矛盾**：`SKILL.md:94` 允许再问 1 批（上限 4），与 `AGENTS.md:42`、`主管手册.md:112/191`、`朋友测试指南.md:205` 的「最多 3 批」冲突，违背需求「最多 3 批」。改法：删例外，或改为「重大分叉并入第 3 批，不新增批次」。

### Advisory（建议修）

1. 术语统一为「新项目需求追问」（`AGENTS.md:39`、`主管手册.md:110` 仍为「新项目开局追问」）。
2. AGENTS/手册补齐停止条件「不用问了」「连续两批用默认」。
3. 明确追问摘要写项目根目录 `README.md`/`DECISIONS.md`，与 `AGENTS.md:74` 的 `research/DECISIONS.md` 区分。
4. `主管手册.md:208` 更新为 13 项、三字段。
5. 「重启后同步到工作区」不实（`client.js:88-113` vs `:738-750`）：补加载时回写，或改文案为「重启后请重新打开开关」。
6. e2e 增加 `assert.equal(consoleErrors.length, 0)`。
7. `AGENTS.md:41` 补「缺省按 true」。
8. `SKILL.md:108` 示例补默认答案。
9. `SKILL.md:112` 改为「所引 4 个均 MIT」。

### 证据

- `node plugin/dsh-project-supervisor/scripts/host-smoke.mjs` → PASS 13，exit 0
- `bash setup/selftest.sh` → PASS 11 / FAIL 0，exit 0
- `shasum -a 256 dist/project-supervisor-kit-2026-10-24.zip` → 30654efc…
- `unzip -l` → research/07 + 三份规则载体；解压后本机绝对路径抽查 → 0 命中
- GitHub API：spec-kit / superpowers = MIT，BMAD = NOASSERTION

### 发布判断

**当前不直接发。** 修完 2 个 blocking（只改规则文本）后可发朋友测试；建议在朋友测试 B2 前增加一步：确认测试目录是否带套件 `AGENTS.md`，避免把 B1 误判成「功能没实现」。
