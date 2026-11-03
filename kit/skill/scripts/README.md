# peek-mailbox.mjs（只读邮件箱窥视 · Auto Work P0-3）

给「主管」用的**只读**脚本：读取 DSH 会话日志中 Agent Teams 的消息事件，对
`team/message/queued` − `team/message/delivered` 求差，列出**排队中（queued 但未 delivered）**
的消息内容。全程不打断任何在跑 agent、不写任何状态。

## 用法

```bash
node .dsh/skills/project-supervisor/scripts/peek-mailbox.mjs [--json] [--limit N] [--session <id>] [--cwd <path>] [--self-test]
```

| 参数 | 说明 |
|---|---|
| `--json` | JSON 输出：`{ok, sessionId, path, queued, delivered, pending, items[]}`；`items[i] = {id, senderName, targetId, direction, queuedAt, preview}` |
| `--limit N` | 最多输出 N 条 pending（默认 20；JSON 只裁剪 `items`，`pending` 计数仍是全量） |
| `--session <id>` | 指定会话 id，可带/不带 `session-` 前缀 |
| `--cwd <path>` | 按工作区目录定位该目录下最新会话（仅当 `--session`/env 都未命中时使用） |
| `--self-test` | 离线自测：`os.tmpdir()` 下生成多帧 zstd fixture（含截断尾帧），断言差分正确、只读、退出码；Node 无 zstd 时打印 SKIP 并 exit 0 |

**会话定位优先级**：`--session` > 环境变量 `DSH_SESSION_ID` > `--cwd` 对应目录下最新日志 >
`$DSH_HOME/sessions` 全局最新日志（回退时会向 stderr 打印 warning 说明推测依据）。

**文本输出**：

```
mailbox peek (read-only) — session <id>
queued N · delivered M · pending P
· [pending] <HH:MM> <sender> → <target>: <preview>   # 每条 pending 一行
pending 0（没有未投递消息）                            # pending 为 0 时
```

## 只读与依赖

- 只以只读方式打开会话日志；**绝不写** session 日志、状态文件或工作区任何文件；不联网、无第三方依赖。
- `--self-test` 只写 `os.tmpdir()` 下的临时目录，并在 `finally` 中清理。
- 解压：优先 Node ≥ 22.15 的 `node:zlib` `zstdDecompressSync`（按帧魔数逐帧解压，Node 22/24 行为一致）；不可用时回退
  `python3 -c "import zstandard; …"`；两者都不可用时 **exit 3** 并给可执行修复提示。
- 容忍正在写入的**截断尾帧**：已解出的完整行先解析，残行/损坏行跳过（stderr 提示一次）。

## 数据源与口径

- 日志：`$DSH_HOME/sessions/<workspace-escaped>/<session-id>/session.v4.jsonl.zstd`
  （DSH 目录名兼容两种风格：`session-<uuid>` 与裸 `<uuid>`）。
- `queued`/`delivered` 按**去重后的消息 id** 计数；`pending` = 未出现在 delivered 列表的 queued 消息。
- `direction`：`targetId === teamId ? "incoming" : "outgoing"`（相对 team 所有者/主管会话而言）。
- `queuedAt` 取会话事件顶层 `time`（毫秒 epoch）的 ISO 8601 表示；`preview` 取首个 text content 块，
  空白折叠后**精确截断 120 字符**（不追加省略号）。
- 退出码：`0` 成功；`1` 运行期错误；`2` 参数/会话定位错误；`3` 无可用 zstd 解压能力。

## 验证

```bash
node --check .dsh/skills/project-supervisor/scripts/peek-mailbox.mjs
node .dsh/skills/project-supervisor/scripts/peek-mailbox.mjs --self-test    # PASS
node .dsh/skills/project-supervisor/scripts/peek-mailbox.mjs --json          # exit 0
```
