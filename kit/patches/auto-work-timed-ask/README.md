# auto-work-timed-ask：把 `ask_user_question` 改成限时模式（可选补丁）

> 给「自动工作（无人值守）」场景用：模型提问 180 秒没人回答就返回 `pending` 继续干活，问题仍可事后回答。
> **只改 DSH 安装里的一个 YAML 文件的一处条目**；`selftest` 只在临时副本演练，**真实安装零写入**（sha256 前后一致作证）。
> 本机验证版本：**DSH 0.2.0-rc.2**（`python3 patch.py status` 会打印识别到的版本）。

## 是什么 / 为什么

DSH 的 `standard` Agent 预设以**阻塞式**挂载 `@deepseek-ai/dsh-tool-ask-user`：

- 目标文件：`<dsh node_modules>/@deepseek-ai/dsh-web-app/presets/standard.patch.yml`
- 本机行号（0.2.0-rc.2，7,511 B，sha256 `6cd2f197…973eda8`）：
  - `:5` → `- id: preset-standard`
  - `:131-132` → `- id: tool-ask-user` / `name: '@deepseek-ai/dsh-tool-ask-user'`（**没有** `config:`）
- 默认预设就是 `standard`：`@deepseek-ai/dsh-web-app/cordis.patch.yml:562-565` 的 `agent-preset-registry.config.default: standard`
- 该插件支持 timed 模式（官方文档 `@deepseek-ai/dsh-tool-ask-user/README.zh.md:30-40`；
  schema 在 `@deepseek-ai/dsh-tool-ask-user/lib/index.js:211-220`：`mode: legacy|timed`、`timeout: -1|1..2147483` 秒）

无人值守时，模型一旦调用 `ask_user_question` 就会一直等用户回来，整条自动流程被一个弹窗卡住。
timed 模式的行为（同一 README「模型得到什么」「调用何时失败」）：

- 到期仍无回答 → 工具返回 `{"pending": true, "callId": "…"}`，**模型可以继续独立工作**；
- 问题没有丢：用户之后回答会以 `kind: answer_to_pending_question` 的用户消息送达；
- **超时绝不表示批准**，需要授权的动作仍走审批链（本补丁不碰审批策略）。

## 改了什么（1 个文件，1 处条目）

```diff
           - id: tool-ask-user
             name: '@deepseek-ai/dsh-tool-ask-user'
+            config:
+              mode: timed
+              timeout: 180
```

等价于官方 README 的 timed 示例（示例用 `timeout: 120`，本补丁按自动工作需求取 180 秒/次）。
插入的 `# [auto-work-timed-ask]` 注释行是本补丁的幂等 marker；`revert` 依据它 + `.bak` 备份还原。

## 命令（在补丁目录里执行；Python 3 标准库，无第三方依赖、不联网）

```bash
cd setup/patches/auto-work-timed-ask

python3 patch.py status              # 默认子命令，只读
python3 patch.py apply --dry-run     # 只打印将改内容（diff），不写盘
python3 patch.py --dry-run apply     # 同上（--dry-run 也可放在子命令前）
python3 patch.py apply               # 真正打补丁：先建 .bak 备份，再原子写入
python3 patch.py revert --dry-run    # 预览回滚（不写盘）
python3 patch.py revert              # 从最近的 .bak.<YYYYMMDD-HHMMSS> 逐字节还原
python3 patch.py selftest            # 只在 mktemp 副本上演练 apply→幂等→revert，真实安装零写入
```

退出码：`0` 成功；`1` 断言/版本/冲突等失败（**失败自动整体回滚，不会写坏文件**）；`2` 找不到 DSH 安装或目标文件（附可执行提示）。

### 输出示例（本机实测，未应用状态）

```text
$ python3 patch.py status
补丁: auto-work-timed-ask v1（DSH 定时提问）
目标文件: <HOME>/<you>/.npm/_npx/<hash>/node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml
DSH 版本: 0.2.0-rc.2（与本补丁验证版本一致）
当前 sha256: 6cd2f197737fc94a45e487d0bb57869461dd6f392d45f6429b576e75d973eda8
状态: NOT APPLIED（未应用，仍是原生阻塞式提问）
apply 后: 提问弹窗 180 秒到期返回 pending，模型继续；问题仍可事后回答。
备份: 无（尚未 apply 过）
```

```text
$ python3 patch.py --dry-run apply
DRY-RUN: 将修改 …/@deepseek-ai/dsh-web-app/presets/standard.patch.yml（不写盘、不创建备份）
--- 原版 @deepseek-ai/dsh-web-app/presets/standard.patch.yml
+++ 补丁后 @deepseek-ai/dsh-web-app/presets/standard.patch.yml
@@ -128,8 +128,12 @@
                 config:
                   subagentProvider: spawn
                   maxRounds: 64
+            # [auto-work-timed-ask] 自动工作：提问弹窗 180 秒到期返回 pending，模型可继续；问题仍可事后回答
           - id: tool-ask-user
             name: '@deepseek-ai/dsh-tool-ask-user'
+            config:
+              mode: timed
+              timeout: 180
           - id: tool-todo
             name: '@deepseek-ai/dsh-tool-todo'
DRY-RUN: 未写入任何文件。
```

```text
$ python3 patch.py apply
备份: …/standard.patch.yml.bak.20261101-021500
已应用: …/standard.patch.yml
  - 条目: - id: tool-ask-user → config: {mode: timed, timeout: 180}
  - 原文件 sha256: 6cd2f197…
  - 新文件 sha256: <应用后哈希>
生效条件: **完整重启 DSH**（当前进程已加载旧预设）后**新建**的会话才生效；已有会话不变。
回滚: python3 patch.py revert
```

`selftest` 会逐项打印 PASS/FAIL，末尾给出**真实目标文件 sha256（selftest 前/后）**并断言一致，例如：

```text
SELFTEST: PASS（18/18 项；真实 DSH 安装零写入）
```

## 影响面与生效条件

- **只影响新会话**：Agent 预设按会话解析/绑定；已运行的会话保留启动时的工具定义，行为不变。
- **必须完整重启 DSH** 才生效（当前进程已加载旧模块；刷新 Web 页面不够）。
- **DSH 升级/npx 换目录后补丁丢失**：`npx` 升级会生成新的 `~/.npm/_npx/<hash>/` 目录，旧目录被弃用；
  请在新版本上重新 `status`/`apply`。`status` 会按 `command -v dsh`/npx glob 自动定位当前安装，不会写到旧目录。
- 不改变工具可见性/审批策略/沙箱；只把该工具从阻塞换成「默认等 180 秒」。

## 安全边界与设计

- **只写一个文件**：`<node_modules>/@deepseek-ai/dsh-web-app/presets/standard.patch.yml`；不改任何 JS、不写 `~/.dsh`。
- 目标定位不硬编码绝对路径：`--nm` → `DSH_NM` → `command -v dsh` 的 realpath 向上找 `node_modules` →
  `~/.npm/_npx/*/node_modules` glob（要求 dsh 包与目标 YAML 同时存在），取最近修改的。
  显式 `--nm` / `DSH_NM` 是**权威**的：该路径缺目标文件时直接 exit 2，**不会**静默回退到其他安装（避免误改）。
- 写入前做**唯一性断言**：目标两行片段必须恰好命中 1 次、`- id: preset-standard` 唯一、插入点在 `plugins:` 之下；
  条目已有 `config:` 时**拒绝覆盖**（可能被其他补丁/Agent Preset 编辑器改过）。
- 写入前先 `copy2` 生成同目录 `.bak.<YYYYMMDD-HHMMSS>` 并校验 sha256；写入用临时文件 + `os.replace` 原子替换；
  任何一步失败（含写后校验）**自动整体回滚**并校验回滚后 sha256。
- **幂等**：`apply` 检测到 marker 直接返回 0、不重复写、不新增备份；`revert` 检测到未应用直接返回 0。
- `revert` 若发现目标文件在 apply 之后又被改动（当前内容 ≠ 备份+补丁预期），默认拒绝覆盖，需 `--force`。
- 版本门槛：`apply` 在其他 DSH 版本上默认拒绝（`--force` 可强制，失败会自动回滚）。断言用文本不变量，
  **不依赖 PyYAML**（DSH 未自带；开发期已用 DSH 自带 `yaml` 包验证过补丁后文件可解析且语义正确）。
- 用户 patch 层提示：`status`/`apply` 会扫描 `~/.dsh/cordis.patch.yml` 与 `~/.dsh/profiles/*/cordis.patch.yml`，
  若发现 `- id: preset-standard` 整行覆盖（Agent Preset 编辑器保存过的编辑会写在这里，且**替换整行 config**），
  会给出 ⚠ 警告——那种情况下本补丁对 bundle 文件的修改会被覆盖，需要在编辑器/该层里确认 timed 配置仍在。

## 已知限制

- 只改 `standard` 预设；如果用户日常用 `ptc`/`cordis`/`minimal` 预设（各文件里也有 `tool-ask-user` 条目），不生效。
- 180 秒是默认值；单次调用模型仍可传自己的 `timeout`（`-1` 会无限期等待）。想换默认值：改 patch.py 里的 `AFTER` 后重跑（或先 revert）。
- Web 卡片上开始编辑或点「慢慢回答」会延长该 Client 的等待（DSH 原生行为），不属本补丁范围。
- 若用户从 Web Agent Preset 编辑器保存过预设，profile patch 层会生成 `- id: preset-standard` 整行覆盖；本补丁不会自动改那层。
- `timed` 模式下「超时」只代表 pending，不代表同意；需要用户明确决定的事项仍应写进队列等用户回答。

## 替代方案（为什么不那么做）

更「抗升级」的位置是用户 patch 层 `~/.dsh/cordis.patch.yml`：写一条 `- id: preset-standard` 覆盖。
但 DSH 的 patch 语义是**整行替换 config**（`@deepseek-ai/dsh-app-boot/README.zh.md:61`），
必须把 `config.plugins` 的完整插件列表（约 80 行、含 `!!js` 条件）抄进去；DSH 升级后内置列表一变，
这份副本就过时，仍需重跑。本补丁选择改 bundle 文件里的一处条目，改动面最小、升级后重跑即可。

## 附：文件清单与来源

| 文件 | 说明 |
|---|---|
| `patch.py` | 补丁脚本（Python 3 标准库）：`status/apply[--dry-run]/revert[--dry-run]/selftest`，`--nm/--dsh-home/--force` |
| `README.md` | 本文件 |

关键来源（DSH 0.2.0-rc.2 安装包内）：

- `@deepseek-ai/dsh-web-app/presets/standard.patch.yml:5`（`preset-standard`）、`:131-132`（`tool-ask-user` 条目）
- `@deepseek-ai/dsh-web-app/cordis.patch.yml:562-565`（`agent-preset-registry.default: standard`）
- `@deepseek-ai/dsh-tool-ask-user/README.zh.md:12,30-40,44,66,74`（timed 语义与配置示例）
- `@deepseek-ai/dsh-tool-ask-user/lib/index.js:211-220`（Config schema 与 timed 分支）
- `@deepseek-ai/dsh-app-boot/README.zh.md:61`（patch 层替换整行 config、空文件/纯注释文件会启动失败）
