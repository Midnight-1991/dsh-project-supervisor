#!/usr/bin/env node
/**
 * peek-mailbox.mjs — 主管只读「邮件箱」窥视工具（Auto Work P0-3）
 *
 * 从一个 DSH 会话日志（session.v4.jsonl.zstd，多帧 zstd JSONL）中只读解析：
 *   1) Agent Teams 消息事件，对 `team/message/queued` − `team/message/delivered`
 *      求差，列出「排队中（queued 但未 delivered）」的 Team 消息内容；
 *   2) `agent/inbox/spliced` 事件回放 Agent 的 next-turn / next-step inbox
 *      （`state[target] = state[target].toSpliced(start ?? 0, removedCount ?? 0, ...inserted)`），
 *      列出「运行中用户排队发送、尚未投递」的用户消息（`message.source.kind === 'user'`）。
 *      这是 T24 针对「运行中主管没读排队发送的用户消息」的补齐；Team 消息仍走上面的差集，不重复计入。
 *
 * 契约（见 .dsh/auto-work/brief-T3-mailbox.md；T24 扩展见任务板 task-24）：
 *   node peek-mailbox.mjs [--json] [--limit N] [--session <id>] [--cwd <path>] [--self-test]
 *
 * 只读保证：
 *   - 只以只读方式 open 会话日志（不写 session/log/任何状态文件）；
 *   - `--self-test` 只在 os.tmpdir() 下创建临时目录并在 finally 中清理；
 *   - 不联网、无第三方依赖。
 *
 * 解压策略：
 *   1) Node >= 22.15：node:zlib 的 zstdDecompressSync 按 zstd 帧魔数切分并逐帧
 *      解压（Node 22 的流式 ZstdDecompress 只解首帧、Node 24 才跨帧；逐帧解压
 *      让两代 Node 行为一致）；容忍正在写入造成的截断尾帧（保留已解出的完整帧）。
 *   2) 回退：`python3 -c "import zstandard; …"` 子进程流式解压（同样容忍截断尾帧）。
 *   3) 两者都不可用：exit 3 + 可执行的修复提示。
 *
 * 退出码：0 成功；1 运行期错误；2 参数/会话定位错误；3 无可用 zstd 解压能力。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EXIT_OK = 0;
const EXIT_RUNTIME = 1;
const EXIT_USAGE = 2;
const EXIT_NO_ZSTD = 3;

const DEFAULT_LIMIT = 20;
const PREVIEW_LIMIT = 120;
const LOG_FILE = 'session.v4.jsonl.zstd';
// zstd 帧魔数（小端 0xFD2FB528），用于切分拼接的多帧日志。
const ZSTD_FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const INBOX_TARGETS = ['next-turn', 'next-step'];
/** 预览脱敏规则：[正则, 替换]（按顺序应用；避免把正常人话误伤成密文）。 */
const SECRET_RULES = [
  [/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-***'],
  [/\bghp_[A-Za-z0-9]{20,}/g, 'ghp_***'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{8,}/g, 'xox-***'],
  [/\bglpat-[A-Za-z0-9_-]{20,}/g, '[REDACTED]'],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, '[REDACTED]'],
];

const HELP = `peek-mailbox.mjs — 只读查看 Team 消息 + 用户「排队发送」消息（不打断在跑会话）

用法：
  node peek-mailbox.mjs [选项]

选项：
  --json             以 JSON 输出：{ok, sessionId, path, queued, delivered, pending, items, userPending}
                     items[i] = {id, senderName, targetId, direction, queuedAt, preview}（Team 未投递消息）
                     userPending = {nextTurn:[...], nextStep:[...], nextTurnCount, nextStepCount}
                     用户项 = {id, queuedAt, target, source:'user', preview}
  --limit N          每类最多输出 N 条 pending（默认 ${DEFAULT_LIMIT}；Team items 与 userPending 的
                     nextTurn/nextStep 各自最多 N 条；JSON 的计数仍是全量）
  --session <id>     指定会话 id；可带或不带 "session-" 前缀
  --cwd <path>       按工作区目录定位该目录下最新会话（仅当 --session/env 都未命中时使用）
  --self-test        离线自测：在 os.tmpdir() 生成多帧 zstd fixture（含 Team 消息、agent/inbox/spliced
                     回放序列与截断尾帧），断言差分/回放/脱敏/JSON 形状且全程只读；
                     Node 无 zstd 时打印 SKIP 并 exit 0
  -h, --help         显示本帮助

输出（文本模式）：
  mailbox peek (read-only) — session <id>
  queued N · delivered M · pending P
  [Team pending 明细]
  pending user prompts (next-turn N, next-step M):
  - [HH:mm:ss] <预览>        ← 运行中用户排队发送、尚未投递的消息（预览 ≤${PREVIEW_LIMIT} 字、单行）
  无用户排队时输出：pending user prompts: 0

脱敏：预览中的 sk-… / ghp_… / AKIA… / xox[bap]-… 等明显密钥会被替换为 sk-*** / [REDACTED]，
      不会打印完整密钥；Team 消息与用户排队消息的预览都适用。

会话定位优先级：--session > 环境变量 DSH_SESSION_ID > --cwd 对应目录最新会话
                  > $DSH_HOME/sessions/*/ 下全局最新会话（会打印 warning 说明推测依据）

只读承诺：绝不写会话日志、状态文件或任何工作区文件；不联网、无第三方依赖。
退出码：0 成功；1 运行期错误；2 参数/会话定位错误；3 无可用 zstd 解压能力。
`;

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/** 生成带退出码的错误对象。 */
function fail(exitCode, message) {
  const err = new Error(message);
  err.exitCode = exitCode;
  return err;
}

/** 断言（仅 --self-test 使用）。 */
function assert(condition, message) {
  if (!condition) throw new Error(`self-test FAIL: ${message}`);
}

/** 对字符串做 sha256（仅 --self-test 的只读校验使用）。 */
function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** 把预览里的明显密钥替换为占位符（sk-*** / ghp_*** / xox-*** / [REDACTED]），避免窥视日志时泄露。 */
function redactSecrets(text) {
  let out = String(text == null ? '' : text);
  for (const [pattern, replacement] of SECRET_RULES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * 把绝对路径编码为 DSH 的 workspace 目录名（$DSH_HOME/sessions/<escaped>/）。
 * 实测编码规则：`/` → `-`，首尾各包 `--`，非 [A-Za-z0-9._-] 的 UTF-16 code unit
 * 变为 `~` + 4 位大写十六进制（例：`…/源工作区` → `…-~95EA~5149--`）。
 */
function escapeWorkspacePath(absPath) {
  let rel = String(absPath).replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(rel)) rel = rel.replace(/^([A-Za-z]):/, '-$1-');
  if (rel.startsWith('/')) rel = rel.slice(1);
  let out = '--';
  for (const ch of rel.split('')) {
    if (/[A-Za-z0-9._-]/.test(ch)) out += ch;
    else if (ch === '/') out += '-';
    else out += `~${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return `${out}--`;
}

/** 列出目录下的子目录（不抛错；不存在返回 []）。 */
function listSubdirs(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/** 若 file 存在且是文件，返回其 mtimeMs；否则 null。 */
function fileMtimeMs(file) {
  try {
    const st = fs.statSync(file);
    return st.isFile() ? st.mtimeMs : null;
  } catch {
    return null;
  }
}

/** 日志文件是否可读。 */
function hasLog(dir) {
  return fileMtimeMs(path.join(dir, LOG_FILE)) !== null;
}

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

/**
 * @param {string[]} argv
 * @returns {{json:boolean, limit:number, session:string|null, cwd:string|null,
 *            selfTest:boolean, help:boolean}}
 */
function parseArgs(argv) {
  const opts = {
    json: false,
    limit: DEFAULT_LIMIT,
    session: null,
    cwd: null,
    selfTest: false,
    help: false,
  };
  const usageError = (msg) => fail(EXIT_USAGE, `${msg}\n\n${HELP}`);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? null : arg.slice(eq + 1);
    const takeValue = () => {
      if (inline !== null) return inline;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw usageError(`参数 ${name} 缺少取值`);
      i += 1;
      return next;
    };

    switch (name) {
      case '--json':
        if (inline !== null) throw usageError('--json 不接受取值');
        opts.json = true;
        break;
      case '--self-test':
        if (inline !== null) throw usageError('--self-test 不接受取值');
        opts.selfTest = true;
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--limit': {
        const raw = takeValue();
        if (!/^[0-9]+$/.test(raw)) throw usageError(`--limit 需要非负整数，收到: ${raw}`);
        opts.limit = Number(raw);
        break;
      }
      case '--session':
        opts.session = takeValue();
        if (!opts.session.trim()) throw usageError('--session 不能为空');
        break;
      case '--cwd':
        opts.cwd = takeValue();
        if (!opts.cwd.trim()) throw usageError('--cwd 不能为空');
        break;
      default:
        throw usageError(`未知参数: ${arg}`);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// 会话定位
// ---------------------------------------------------------------------------

/** 由用户给的会话 id 生成候选目录名（兼容带/不带 "session-" 前缀）。 */
function sessionDirCandidates(rawId) {
  const id = String(rawId).trim();
  const bare = id.startsWith('session-') ? id.slice('session-'.length) : id;
  return [...new Set([id, bare, `session-${bare}`])];
}

/**
 * 在 $DSH_HOME/sessions/<escaped-workspace>/<session-dir>/session.v4.jsonl.zstd 中
 * 查找指定会话；同 id 多个工作区命中时取日志最新者。
 * @returns {{sessionId:string, logPath:string, workspaceDir:string, mtimeMs:number}|null}
 */
function findSessionLog(sessionsRoot, rawId) {
  const candidates = sessionDirCandidates(rawId);
  let best = null;
  for (const workspace of listSubdirs(sessionsRoot)) {
    for (const candidate of candidates) {
      const dir = path.join(sessionsRoot, workspace, candidate);
      const logPath = path.join(dir, LOG_FILE);
      const mtimeMs = fileMtimeMs(logPath);
      if (mtimeMs === null) continue;
      if (!best || mtimeMs > best.mtimeMs) {
        best = { sessionId: candidate, logPath, workspaceDir: path.join(sessionsRoot, workspace), mtimeMs };
      }
    }
  }
  return best;
}

/** 某 workspace 目录下日志最新的会话。 */
function latestLogInWorkspace(workspaceDir) {
  let best = null;
  for (const name of listSubdirs(workspaceDir)) {
    const dir = path.join(workspaceDir, name);
    const logPath = path.join(dir, LOG_FILE);
    const mtimeMs = fileMtimeMs(logPath);
    if (mtimeMs === null) continue;
    if (!best || mtimeMs > best.mtimeMs) best = { sessionId: name, logPath, workspaceDir, mtimeMs };
  }
  return best;
}

/** 全局最新会话（$DSH_HOME/sessions 下所有 workspace 目录的并集）。 */
function latestLogGlobal(sessionsRoot) {
  let best = null;
  for (const workspace of listSubdirs(sessionsRoot)) {
    const hit = latestLogInWorkspace(path.join(sessionsRoot, workspace));
    if (hit && (!best || hit.mtimeMs > best.mtimeMs)) best = hit;
  }
  return best;
}

/**
 * 按契约优先级定位会话日志：--session > env.DSH_SESSION_ID > --cwd 最新 > 全局最新。
 * @param {{session:string|null, cwd:string|null}} opts
 * @param {Record<string,string|undefined>} env
 */
function resolveSession(opts, env) {
  const dshHome = env.DSH_HOME && env.DSH_HOME.trim() ? env.DSH_HOME.trim() : path.join(os.homedir(), '.dsh');
  const sessionsRoot = path.join(dshHome, 'sessions');
  const warnings = [];

  let rootStat = null;
  try {
    rootStat = fs.statSync(sessionsRoot);
  } catch {
    rootStat = null;
  }
  if (!rootStat || !rootStat.isDirectory()) {
    throw fail(
      EXIT_USAGE,
      [
        `找不到 DSH 会话根目录: ${sessionsRoot}`,
        '提示：检查环境变量 DSH_HOME（当前为 ' + (env.DSH_HOME || '<未设置>') + '），或用 --session/--cwd 指定。',
      ].join('\n'),
    );
  }

  if (opts.session) {
    const hit = findSessionLog(sessionsRoot, opts.session);
    if (!hit) {
      throw fail(
        EXIT_USAGE,
        `找不到会话日志: ${opts.session}\n已查找候选目录：${sessionDirCandidates(opts.session).join(', ')}\n根目录: ${sessionsRoot}`,
      );
    }
    return { ...hit, resolvedBy: '--session', warnings };
  }

  const envId = env.DSH_SESSION_ID && env.DSH_SESSION_ID.trim() ? env.DSH_SESSION_ID.trim() : '';
  if (envId) {
    const hit = findSessionLog(sessionsRoot, envId);
    if (hit) return { ...hit, resolvedBy: 'DSH_SESSION_ID', warnings };
    warnings.push(`warning: 环境变量 DSH_SESSION_ID=${envId} 未找到对应会话日志，继续回退。`);
  }

  if (opts.cwd) {
    const absCwd = path.resolve(opts.cwd);
    const workspaceDir = path.join(sessionsRoot, escapeWorkspacePath(absCwd));
    const hit = latestLogInWorkspace(workspaceDir);
    if (hit) {
      warnings.push(
        `warning: 未用 --session/env 命中，按 --cwd 选择该目录最新会话 ${hit.sessionId}（依据 ${LOG_FILE} mtime）。`,
      );
      return { ...hit, resolvedBy: '--cwd', warnings };
    }
    warnings.push(`warning: --cwd 对应会话目录不存在: ${workspaceDir}`);
  }

  const latest = latestLogGlobal(sessionsRoot);
  if (!latest) {
    throw fail(EXIT_USAGE, `在 ${sessionsRoot} 下没有找到任何 ${LOG_FILE} 日志文件。`);
  }
  warnings.push(
    `warning: 未指定 --session/--cwd 且 DSH_SESSION_ID 未命中，回退到全局最新会话 ${latest.sessionId}（依据 mtime 推测，可能不是你要的会话）。`,
  );
  return { ...latest, resolvedBy: 'latest', warnings };
}

// ---------------------------------------------------------------------------
// 解压：Node zstd 优先，python3 zstandard 回退
// ---------------------------------------------------------------------------

/** 逐行切分器：只吐完整行，避免大日志一次性 split 占内存。 */
function createLineReader(onLine) {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk;
      let idx = buffer.indexOf('\n');
      while (idx !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        onLine(line);
        idx = buffer.indexOf('\n');
      }
    },
    /** 流结束时把剩余内容作为最后一行尝试解析（截断场景下 JSON.parse 会自然丢弃）。 */
    end() {
      const rest = buffer;
      buffer = '';
      if (rest.trim()) onLine(rest);
    },
  };
}

/** 事件收集器：边解压边解析，只保留会话元信息与 Team 消息事件。 */
function createEventCollector() {
  const state = {
    session: { id: null, cwd: null },
    teamId: null,
    queued: [],
    queuedById: new Map(),
    deliveredIds: new Set(),
    deliveredEvents: 0,
    // Agent inbox 回放：target → 插入项数组（保留全部来源/占位项以维持 toSpliced 的下标语义）
    inbox: new Map(INBOX_TARGETS.map((target) => [target, []])),
    inboxSplicedEvents: 0,
    lineCount: 0,
    badLines: 0,
  };

  const previewOf = (content) => {
    if (!Array.isArray(content)) return '';
    for (const block of content) {
      if (block && block.type === 'text' && typeof block.text === 'string') {
        const normalized = redactSecrets(block.text.replace(/\s+/g, ' ').trim());
        return normalized.length > PREVIEW_LIMIT
          ? Array.from(normalized).slice(0, PREVIEW_LIMIT).join('')
          : normalized;
      }
    }
    return '';
  };

  const onEvent = (ev) => {
    if (!ev || typeof ev !== 'object') return;
    if (ev.type === 'session' && state.session.id === null) {
      if (typeof ev.id === 'string') state.session.id = ev.id;
      if (typeof ev.cwd === 'string') state.session.cwd = ev.cwd;
      return;
    }
    if (ev.type === 'agent/inbox/spliced') {
      const data = ev.data || {};
      const target = typeof data.target === 'string' ? data.target : null;
      if (!target || !state.inbox.has(target)) return; // 未知 target（如 tail 类）忽略
      const start = Number.isInteger(data.start) && data.start >= 0 ? data.start : 0;
      const removedCount = Number.isInteger(data.removedCount) && data.removedCount >= 0 ? data.removedCount : 0;
      const inserted = Array.isArray(data.inserted) ? data.inserted : [];
      const before = state.inbox.get(target);
      const at = Math.min(start, before.length);
      const removeN = Math.min(removedCount, before.length - at);
      const timeMs = Number.isFinite(ev.time) ? ev.time : null;
      // 1:1 包装（含非 user 项）后再 toSpliced，保证后续 start/removedCount 下标仍指向完整 inbox。
      const wrapped = inserted.map((message) => ({
        message,
        timeMs,
        preview: previewOf(message && message.content),
      }));
      state.inbox.set(target, before.slice(0, at).concat(wrapped, before.slice(at + removeN)));
      state.inboxSplicedEvents += 1;
      return;
    }
    if (ev.type === 'team/message/queued') {
      const data = ev.data;
      const message = data && data.message;
      if (!message || typeof message.id !== 'string') return;
      if (state.teamId === null && typeof data.teamId === 'string') state.teamId = data.teamId;
      if (state.queuedById.has(message.id)) return; // 同一条消息去重（保留首次入队）
      const teamId = typeof data.teamId === 'string' ? data.teamId : null;
      const timeMs = Number.isFinite(ev.time) ? ev.time : null;
      const item = {
        id: message.id,
        senderName: typeof message.senderName === 'string' ? message.senderName : String(message.senderId || '?'),
        targetId: typeof message.targetId === 'string' ? message.targetId : '?',
        direction: teamId !== null && message.targetId === teamId ? 'incoming' : 'outgoing',
        queuedAt: timeMs === null ? null : new Date(timeMs).toISOString(),
        preview: previewOf(message.content),
        timeMs,
      };
      state.queuedById.set(message.id, item);
      state.queued.push(item);
      return;
    }
    if (ev.type === 'team/message/delivered') {
      const data = ev.data || {};
      state.deliveredEvents += 1;
      if (typeof data.messageId === 'string') state.deliveredIds.add(data.messageId);
      if (state.teamId === null && typeof data.teamId === 'string') state.teamId = data.teamId;
    }
  };

  return {
    state,
    onLine(line) {
      const trimmed = line.trim();
      if (!trimmed) return;
      state.lineCount += 1;
      let ev;
      try {
        ev = JSON.parse(trimmed);
      } catch {
        state.badLines += 1; // 截断尾行 / 损坏行：跳过
        return;
      }
      onEvent(ev);
    },
  };
}

/**
 * Node zstd 多帧解压（Node >= 22.15 的 node:zlib zstdDecompressSync）。
 *
 * 不依赖流式 ZstdDecompress 的跨帧行为：Node 22 的流只解第一帧、Node 24 才
 * 自动跨帧。这里按 zstd 帧魔数切分候选边界并逐帧同步解压；候选边界若落在
 * payload 内部导致解压失败，则与下一候选合并重试。截断尾帧保留已解完整帧。
 *
 * @returns {Promise<{via:string, bytes:number, truncated:boolean, error:Error|null}>}
 */
function readWithNodeZstd(logPath, collector) {
  const result = { via: 'node-zstd', bytes: 0, truncated: false, error: null };
  let raw;
  try {
    raw = fs.readFileSync(logPath);
  } catch (error) {
    result.error = error;
    result.truncated = true;
    return Promise.resolve(result);
  }
  const starts = [];
  let cursor = raw.indexOf(ZSTD_FRAME_MAGIC, 0);
  while (cursor !== -1) {
    starts.push(cursor);
    cursor = raw.indexOf(ZSTD_FRAME_MAGIC, cursor + 4);
  }
  if (starts.length > 0 && starts[0] !== 0) starts.unshift(0);
  const chunks = [];
  let index = 0;
  while (index < starts.length) {
    let decoded = null;
    let next = index + 1;
    while (next <= starts.length) {
      const end = next < starts.length ? starts[next] : raw.length;
      try {
        decoded = zlib.zstdDecompressSync(raw.subarray(starts[index], end));
        break;
      } catch {
        next += 1;
      }
    }
    if (decoded === null) {
      result.truncated = true;
      break;
    }
    // Node 22 的 sync zstd 对截断帧是宽容的（返回部分数据而不抛错，Node 24 抛
    // Z_BUF_ERROR）。会话日志写入方每帧都以换行结尾，因此不以换行结尾的帧即
    // 正在写入的截断尾帧：丢弃该帧内容并标记 truncated。
    if (decoded.length === 0 || decoded[decoded.length - 1] !== 0x0a) {
      result.truncated = true;
      break;
    }
    chunks.push(decoded);
    index = next;
  }
  const text = Buffer.concat(chunks).toString('utf8');
  result.bytes = Buffer.byteLength(text, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      collector.onLine(line);
    } catch {
      /* 损坏行不影响整体解析 */
    }
  }
  if (result.truncated) result.error = new Error('截断尾帧（会话可能正在写入）');
  return Promise.resolve(result);
}

/** python3 + zstandard 回退脚本：流式解压多帧 zstd，容忍截断尾帧。 */
const PYTHON_ZSTD_SCRIPT = `import sys
try:
    import zstandard
except Exception as exc:
    sys.stderr.write("python3 缺少 zstandard 模块: %s\\n" % exc)
    sys.exit(4)
try:
    f = open(sys.argv[1], "rb")
except Exception as exc:
    sys.stderr.write("无法打开会话日志: %s\\n" % exc)
    sys.exit(5)
decompressor = zstandard.ZstdDecompressor()
wrote = False
try:
    with f:
        reader = decompressor.stream_reader(f, read_across_frames=True)
        while True:
            block = reader.read(1 << 20)
            if not block:
                break
            sys.stdout.buffer.write(block)
            sys.stdout.buffer.flush()
            wrote = True
except Exception as exc:
    sys.stderr.write("尾部帧截断，保留已解压部分: %s\\n" % exc)
    sys.exit(0 if wrote else 6)
sys.exit(0)
`;

/**
 * python3 zstandard 回退解压。
 * @returns {Promise<{via:string, bytes:number, truncated:boolean, stderr:string}>}
 */
function readWithPythonZstd(logPath, collector) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn('python3', ['-c', PYTHON_ZSTD_SCRIPT, logPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      reject(Object.assign(error, { spawnError: true }));
      return;
    }
    const result = { via: 'python-zstandard', bytes: 0, truncated: false, stderr: '' };
    const lines = createLineReader((line) => collector.onLine(line));
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      result.bytes += chunk.length;
      lines.push(chunk);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      result.stderr = (result.stderr + chunk).slice(-4000);
    });
    child.on('error', (error) => settle(reject, Object.assign(error, { spawnError: true })));
    child.on('close', (code) => {
      if (code === 0) {
        lines.end();
        result.truncated = /截断/.test(result.stderr);
        settle(resolve, result);
        return;
      }
      const error = fail(code === 4 || code === 6 ? EXIT_NO_ZSTD : EXIT_RUNTIME, result.stderr.trim() || `python3 zstd 回退失败（exit ${code}）`);
      error.pythonExitCode = code;
      settle(reject, error);
    });
  });
}

/** 两者都不可用时给出的可执行修复提示。 */
function noZstdError(detail) {
  return fail(
    EXIT_NO_ZSTD,
    [
      '无法解压 zstd 会话日志：Node 与 python3 两条解压路径都不可用。',
      detail ? `详情：${detail}` : '',
      '可执行修复（任选其一）：',
      '  1) 升级 Node 到 v22.15+ / v24+（内置 node:zlib 的 zstd 解压与压缩）；',
      '  2) 安装 python 依赖：python3 -m pip install --user zstandard；',
      '  3) 安装 zstd CLI 后手动查看：zstd -dc "<会话日志路径>" | grep team/message',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

/**
 * 解压日志并收集事件（Node 优先，python 回退）。
 * @returns {Promise<{collector:ReturnType<typeof createEventCollector>, via:string, warnings:string[]}>}
 */
async function collectLog(logPath) {
  const warnings = [];
  const collector = createEventCollector();

  let st = null;
  try {
    st = fs.statSync(logPath);
  } catch (error) {
    throw fail(EXIT_RUNTIME, `无法读取会话日志: ${logPath}\n${error.message}`);
  }
  if (!st.isFile()) throw fail(EXIT_RUNTIME, `会话日志不是普通文件: ${logPath}`);
  if (st.size === 0) {
    warnings.push('warning: 日志文件为空（0 字节），按 0 条消息处理。');
    return { collector, via: 'empty', warnings };
  }

  const nodeZstdAvailable = typeof zlib.zstdDecompressSync === 'function';
  if (nodeZstdAvailable) {
    const result = await readWithNodeZstd(logPath, collector);
    if (!result.error) {
      if (result.bytes === 0) {
        warnings.push('warning: Node zstd 解压未产出数据，尝试 python3 zstandard 回退。');
      } else {
        return { collector, via: result.via, warnings };
      }
    } else if (result.bytes > 0) {
      warnings.push(
        `warning: 日志尾帧不完整（会话可能正在写入），已解析其中完整部分（${collector.state.lineCount} 行，跳过 ${collector.state.badLines} 行残行/损坏行）。`,
      );
      return { collector, via: result.via, warnings };
    } else {
      warnings.push(`warning: Node zstd 解压失败（${result.error.message}），尝试 python3 zstandard 回退。`);
    }
  } else {
    warnings.push('warning: 当前 Node 无 node:zlib zstd 解压能力，尝试 python3 zstandard 回退。');
  }

  try {
    const result = await readWithPythonZstd(logPath, collector);
    if (result.truncated) {
      warnings.push('warning: 日志尾帧不完整（python3 zstandard 回退），已解析其中完整部分。');
    }
    return { collector, via: result.via, warnings };
  } catch (error) {
    if (error.spawnError) {
      throw noZstdError(`python3 不可用（${error.message}）；Node 侧：${nodeZstdAvailable ? '解压失败' : '无 zstd 支持'}`);
    }
    if (error.exitCode === EXIT_NO_ZSTD) {
      throw noZstdError(error.message);
    }
    throw fail(EXIT_RUNTIME, `解压会话日志失败: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 模型与输出
// ---------------------------------------------------------------------------

/** 事件收集结果 → CLI 模型（pending 列表 + 计数）。 */
function buildModel(collector, location, limit) {
  const state = collector.state;
  const sessionId = state.session.id || location.sessionId;
  const pending = state.queued.filter((item) => !state.deliveredIds.has(item.id));
  const items = pending.slice(0, limit);
  const notes = [];
  if (items.length < pending.length) {
    notes.push(`warning: 仅显示前 ${limit} 条 pending（共 ${pending.length} 条；用 --limit 调整）。`);
  }

  // 用户排队消息：回放后的 inbox 中只取 source.kind === 'user'（Team/系统插入项归 team 差分，不重复计入）
  const userEntriesOf = (target) => {
    const seen = new Set();
    const out = [];
    for (const entry of state.inbox.get(target) || []) {
      const message = entry && entry.message;
      if (!message || !message.source || message.source.kind !== 'user') continue;
      const id = typeof message.id === 'string' ? message.id : null;
      if (id !== null) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      out.push({
        id,
        queuedAt: entry.timeMs === null ? null : new Date(entry.timeMs).toISOString(),
        target,
        source: 'user',
        preview: entry.preview,
        timeMs: entry.timeMs,
      });
    }
    return out;
  };
  const nextTurnAll = userEntriesOf('next-turn');
  const nextStepAll = userEntriesOf('next-step');
  const nextTurn = nextTurnAll.slice(0, limit);
  const nextStep = nextStepAll.slice(0, limit);
  if (nextTurn.length < nextTurnAll.length || nextStep.length < nextStepAll.length) {
    notes.push(
      `warning: 用户排队消息仅显示前 ${limit} 条/类（共 next-turn ${nextTurnAll.length}、next-step ${nextStepAll.length}；用 --limit 调整）。`,
    );
  }
  return {
    sessionId,
    logPath: location.logPath,
    resolvedBy: location.resolvedBy,
    queued: state.queued.length,
    delivered: state.deliveredIds.size,
    pending: pending.length,
    items,
    userPending: {
      nextTurn,
      nextStep,
      nextTurnCount: nextTurnAll.length,
      nextStepCount: nextStepAll.length,
    },
    userItems: [...nextTurn, ...nextStep],
    notes,
  };
}

/** 本地时间 HH:MM。 */
function formatHourMinute(timeMs) {
  if (!Number.isFinite(timeMs)) return '--:--';
  const date = new Date(timeMs);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 本地时间 HH:MM:SS（用户排队消息用）。 */
function formatHourMinuteSecond(timeMs) {
  if (!Number.isFinite(timeMs)) return '--:--:--';
  const date = new Date(timeMs);
  return [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join(':');
}

/** 用户排队消息的对外 JSON 形状（timeMs 等内部字段不外泄）。 */
function toUserJson(item) {
  return {
    id: item.id,
    queuedAt: item.queuedAt,
    target: item.target,
    source: item.source,
    preview: item.preview,
  };
}

/** 契约 JSON 形状（旧字段不变，新增 userPending；向后兼容）。 */
function toJson(model) {
  return {
    ok: true,
    sessionId: model.sessionId,
    path: model.logPath,
    queued: model.queued,
    delivered: model.delivered,
    pending: model.pending,
    items: model.items.map((item) => ({
      id: item.id,
      senderName: item.senderName,
      targetId: item.targetId,
      direction: item.direction,
      queuedAt: item.queuedAt,
      preview: item.preview,
    })),
    userPending: {
      nextTurn: model.userPending.nextTurn.map(toUserJson),
      nextStep: model.userPending.nextStep.map(toUserJson),
      nextTurnCount: model.userPending.nextTurnCount,
      nextStepCount: model.userPending.nextStepCount,
    },
  };
}

/** 契约文本输出。 */
function toText(model) {
  const lines = [];
  lines.push(`mailbox peek (read-only) — session ${model.sessionId || '(未知)'}`);
  lines.push(`queued ${model.queued} · delivered ${model.delivered} · pending ${model.pending}`);
  if (model.pending === 0) {
    lines.push('pending 0（没有未投递消息）');
  } else {
    for (const item of model.items) {
      lines.push(`· [pending] ${formatHourMinute(item.timeMs)} ${item.senderName} → ${item.targetId}: ${item.preview}`);
    }
  }
  const userTotal = model.userPending.nextTurnCount + model.userPending.nextStepCount;
  if (userTotal === 0) {
    lines.push('pending user prompts: 0');
  } else {
    lines.push(
      `pending user prompts (next-turn ${model.userPending.nextTurnCount}, next-step ${model.userPending.nextStepCount}):`,
    );
    for (const item of model.userItems) {
      lines.push(`- [${formatHourMinuteSecond(item.timeMs)}] ${item.preview}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/**
 * 执行一次命令（不直接写 stdout/stderr，便于 --self-test 复用与断言）。
 * @param {string[]} argv
 * @param {Record<string,string|undefined>} env
 * @returns {Promise<{exitCode:number, stdout:string, stderr:string}>}
 */
async function run(argv, env = process.env) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    return { exitCode: error.exitCode || EXIT_USAGE, stdout: '', stderr: `${error.message}\n` };
  }

  if (opts.help) return { exitCode: EXIT_OK, stdout: HELP, stderr: '' };
  if (opts.selfTest) return runSelfTest(env);

  const stderrLines = [];
  try {
    const location = resolveSession(opts, env);
    stderrLines.push(...location.warnings);
    const { collector, warnings } = await collectLog(location.logPath);
    stderrLines.push(...warnings);
    const model = buildModel(collector, location, opts.limit);
    stderrLines.push(...model.notes);
    const stdout = opts.json ? `${JSON.stringify(toJson(model), null, 2)}\n` : `${toText(model)}\n`;
    return { exitCode: EXIT_OK, stdout, stderr: stderrLines.length ? `${stderrLines.join('\n')}\n` : '' };
  } catch (error) {
    const exitCode = error.exitCode || EXIT_RUNTIME;
    if (opts.json) {
      return {
        exitCode,
        stdout: `${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`,
        stderr: `${error.message}\n`,
      };
    }
    return { exitCode, stdout: '', stderr: `${error.message}\n` };
  }
}

// ---------------------------------------------------------------------------
// --self-test：离线、只写 os.tmpdir()、结束清理
// ---------------------------------------------------------------------------

/** 生成一个“会话日志”fixture：6 个完整 zstd 帧（Team 事件 + inbox 回放序列）+ 1 个截断尾帧。 */
function buildFixture() {
  const teamId = 'session-self-test-lead-0001';
  const queued = (id, time, senderId, senderName, targetId, text) => ({
    type: 'team/message/queued',
    seq: time % 100000,
    time,
    data: {
      version: 2,
      teamId,
      message: {
        id,
        senderId,
        senderName,
        targetId,
        content: [{ type: 'text', text }],
      },
    },
  });
  const delivered = (messageId, targetId, time) => ({
    type: 'team/message/delivered',
    seq: time % 100000,
    time,
    data: { version: 2, teamId, messageId, targetId },
  });
  /** inbox 插入项（source.kind 默认 user；传 'team' 可测非 user 过滤）。 */
  const userMessage = (id, text, kind = 'user') => ({
    id,
    role: 'user',
    source: { kind },
    content: [{ type: 'text', text }],
  });
  /** `agent/inbox/spliced` 事件：start 默认 0，removedCount/inserted 按需给。 */
  const spliced = (target, time, inserted, extra = {}) => ({
    type: 'agent/inbox/spliced',
    seq: time % 100000,
    time,
    data: { target, start: 0, ...extra, ...(Array.isArray(inserted) ? { inserted } : {}) },
  });

  const t0 = Date.UTC(2026, 10, 1, 1, 0, 0);
  const sessionEvent = {
    type: 'session',
    version: 4,
    id: 'session-self-test-0001',
    createdAt: t0,
    cwd: '/tmp/peek-mailbox-selftest-workspace',
  };
  const q1 = queued('team-message-q1', t0 + 1000, 'sender-a', 'worker-a', teamId, '第一条 pending 之外的消息');
  const q2 = queued('team-message-q2', t0 + 2000, teamId, 'lead', 'sender-b', '发给别的会话的消息（outgoing）');
  const q3 = queued('team-message-q3', t0 + 3000, 'sender-a', 'worker-a', teamId, '待投递消息 long-preview-test '.repeat(20));
  const d1 = delivered('team-message-q1', teamId, t0 + 4000);
  const d2 = delivered('team-message-q2', 'sender-b', t0 + 5000);

  // inbox 回放序列（顺序敏感）：
  //   next-turn [u1] → next-step [u2] → next-turn start=1 插 u3 → claim 掉 u1（removedCount=1）
  //   → start=0 插 team 来源项 → claim 掉它（不计入用户）→ next-turn start=1 插超长 u5
  // 测试用假 key（运行时拼接，避免在源码/公开包里出现形似真实密钥的字面量）
  const fakeKey = ['s', 'k', '-'].join('') + 'test'.repeat(6);
  const userOne = spliced('next-turn', t0 + 6000, [userMessage('user-m1', '第一条排队用户消息')]);
  const userStep = spliced('next-step', t0 + 7000, [userMessage('user-m2', '下一步插入的用户消息')]);
  const userWithKey = spliced(
    'next-turn',
    t0 + 8000,
    [userMessage('user-m3', `更换 key 为：${fakeKey} 请勿外传`)],
    { start: 1 },
  );
  const claimUser = spliced('next-turn', t0 + 9000, [], { start: 0, removedCount: 1 });
  const teamInsert = spliced('next-turn', t0 + 10000, [userMessage('team-m4', 'Team 插入项不应计入用户消息', 'team')], { start: 0 });
  const claimTeam = spliced('next-turn', t0 + 11000, [], { start: 0, removedCount: 1 });
  const userLong = spliced('next-turn', t0 + 12000, [userMessage('user-m5', '很长的用户排队消息 '.repeat(20))], { start: 1 });

  const frameOf = (events) =>
    zlib.zstdCompressSync(Buffer.from(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8'));

  const completeFrames = [
    frameOf([sessionEvent]),
    frameOf([q1, q2]),
    frameOf([q3]),
    frameOf([d1, d2]),
    frameOf([userOne, userStep, userWithKey, claimUser]),
    frameOf([teamInsert, claimTeam, userLong]),
  ];
  // 截断帧：把一个合法事件的 zstd 帧截掉一半，模拟“正在写入的尾帧”。
  const truncatedSource = frameOf([d1]);
  const truncatedFrame = truncatedSource.subarray(0, Math.max(4, Math.floor(truncatedSource.length / 2)));
  return {
    buffer: Buffer.concat([...completeFrames, truncatedFrame]),
    teamId,
    expectations: {
      queued: 3,
      delivered: 2,
      pending: 1,
      pendingId: 'team-message-q3',
      nextTurnCount: 2,
      nextStepCount: 1,
      nextTurnIds: ['user-m3', 'user-m5'],
      nextStepIds: ['user-m2'],
      queuedAtUserM3: new Date(Date.UTC(2026, 10, 1, 1, 0, 8)).toISOString(),
      fakeKey,
      secretTail: '42a2b4073207499b8e86f2337ab707d5',
    },
  };
}

/** 构造假的 $DSH_HOME/sessions/<escaped>/<session-id>/ 目录树，返回 {fakeHome, fixturePath, cwd}。 */
function stageFakeDshHome(tmpRoot, fixtureBuffer) {
  const fixtureCwd = path.join(tmpRoot, 'fixture-workspace');
  const fakeHome = path.join(tmpRoot, 'fake-dsh-home');
  const sessionDir = path.join(fakeHome, 'sessions', escapeWorkspacePath(fixtureCwd), 'session-self-test-0001');
  fs.mkdirSync(sessionDir, { recursive: true });
  const fixturePath = path.join(sessionDir, LOG_FILE);
  fs.writeFileSync(fixturePath, fixtureBuffer);
  return { fakeHome, fixturePath, fixtureCwd };
}

/** self-test 主体：返回可打印的结果；失败抛错由 run() 兜底为 exit 1。 */
async function runSelfTest() {
  const zstdCompressSync = zlib.zstdCompressSync;
  if (typeof zstdCompressSync !== 'function' || typeof zlib.zstdDecompressSync !== 'function') {
    return {
      exitCode: EXIT_OK,
      stdout: 'self-test SKIP（当前 Node 无 node:zlib zstd 能力；真实日志需 Node ≥22.15 或 python3 zstandard，安装后重跑本自测）\n',
      stderr: '',
    };
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'peek-mailbox-selftest-'));
  const checks = [];
  try {
    const { buffer, expectations } = buildFixture();
    const { fakeHome, fixturePath, fixtureCwd } = stageFakeDshHome(tmpRoot, buffer);
    const fixtureShaBefore = sha256(fs.readFileSync(fixturePath));

    // 1) 解压 + Team 差分：多帧拼接 + 截断尾帧应被容忍
    const collectorA = createEventCollector();
    const nodeResult = await readWithNodeZstd(fixturePath, collectorA);
    assert(nodeResult.truncated === true, '应检测到截断尾帧');
    const modelA = buildModel(collectorA, { sessionId: null, logPath: fixturePath, resolvedBy: 'self-test' }, 20);
    assert(modelA.queued === expectations.queued, `queued 期望 ${expectations.queued}，实际 ${modelA.queued}`);
    assert(modelA.delivered === expectations.delivered, `delivered 期望 ${expectations.delivered}，实际 ${modelA.delivered}`);
    assert(modelA.pending === expectations.pending, `pending 期望 ${expectations.pending}，实际 ${modelA.pending}`);
    assert(modelA.items.length === 1 && modelA.items[0].id === expectations.pendingId, 'pending 项应为唯一未投递消息');
    assert(modelA.items[0].direction === 'incoming', 'pending 项 direction 应为 incoming');
    assert(modelA.items[0].preview.length <= PREVIEW_LIMIT, `preview 应 ≤ ${PREVIEW_LIMIT} 字符`);
    assert(modelA.items[0].preview.length === PREVIEW_LIMIT, `preview 应截断到 ${PREVIEW_LIMIT} 字符`);
    assert(modelA.items[0].queuedAt === new Date(Date.UTC(2026, 10, 1, 1, 0, 3)).toISOString(), 'queuedAt 应取事件 time 的 ISO 时间');
    assert(modelA.sessionId === 'session-self-test-0001', 'sessionId 应来自 session 事件');
    const outgoing = collectorA.state.queued.find((item) => item.id === 'team-message-q2');
    assert(outgoing && outgoing.direction === 'outgoing', 'targetId≠teamId 时应为 outgoing');
    checks.push('多帧解压+截断容忍+Team pending/方向/preview/queuedAt');

    // 1b) inbox 回放：user next-turn/next-step + removedCount claim + 非 user 过滤 + queuedAt/预览
    const up = modelA.userPending;
    assert(up.nextTurnCount === expectations.nextTurnCount, `nextTurnCount 期望 ${expectations.nextTurnCount}，实际 ${up.nextTurnCount}`);
    assert(up.nextStepCount === expectations.nextStepCount, `nextStepCount 期望 ${expectations.nextStepCount}，实际 ${up.nextStepCount}`);
    assert(
      JSON.stringify(up.nextTurn.map((item) => item.id)) === JSON.stringify(expectations.nextTurnIds),
      `nextTurn ids 不符：${JSON.stringify(up.nextTurn.map((item) => item.id))}`,
    );
    assert(
      JSON.stringify(up.nextStep.map((item) => item.id)) === JSON.stringify(expectations.nextStepIds),
      `nextStep ids 不符：${JSON.stringify(up.nextStep.map((item) => item.id))}`,
    );
    assert(up.nextTurn.every((item) => item.source === 'user' && item.target === 'next-turn'), '用户项 source/target 不符');
    assert(up.nextTurn[0].queuedAt === expectations.queuedAtUserM3, `用户项 queuedAt 应取插入事件 time 的 ISO：${up.nextTurn[0].queuedAt}`);
    assert(up.nextTurn[0].preview.includes('sk-***'), '用户预览应保留 sk-*** 脱敏标记');
    assert(!up.nextTurn[0].preview.includes(expectations.secretTail), '用户预览不得包含完整密钥');
    assert(up.nextTurn[1].preview.length === PREVIEW_LIMIT, `长用户消息预览应截断到 ${PREVIEW_LIMIT} 字符`);
    assert(!up.nextTurn.some((item) => item.id === 'team-m4'), 'source.kind≠user 的 spliced 项不应计入用户排队消息');
    checks.push('inbox 回放 user next-turn/next-step + removedCount claim + 非 user 过滤 + queuedAt/预览');

    // 1c) 脱敏规则单测（构造含 sk-/AKIA 的字符串）
    assert(redactSecrets(`key=${expectations.fakeKey} end`) === 'key=sk-*** end', 'sk- 脱敏规则不符');
    const fakeAwsKey = ['AK', 'IA', '1234567890', 'ABCDEF'].join('');
    assert(redactSecrets(fakeAwsKey) === '[REDACTED]', 'AKIA 脱敏规则不符');
    checks.push('密钥脱敏规则（sk-/AKIA）');

    // 2) Node 解压路径不写 fixture（只读）
    assert(sha256(fs.readFileSync(fixturePath)) === fixtureShaBefore, '只读校验失败：fixture 内容被改动');
    checks.push('Node 解压全程只读（fixture sha256 不变）');

    // 3) python3 zstandard 回退路径（可用时验证；不可用则跳过并说明）
    let pythonFallback = '跳过（python3 或 zstandard 不可用）';
    try {
      const collectorB = createEventCollector();
      await readWithPythonZstd(fixturePath, collectorB);
      const modelB = buildModel(collectorB, { sessionId: null, logPath: fixturePath, resolvedBy: 'self-test' }, 20);
      assert(modelB.queued === expectations.queued, `python 回退 queued 不符：${modelB.queued}`);
      assert(modelB.delivered === expectations.delivered, `python 回退 delivered 不符：${modelB.delivered}`);
      assert(modelB.pending === expectations.pending, `python 回退 pending 不符：${modelB.pending}`);
      assert(modelB.userPending.nextTurnCount === expectations.nextTurnCount, 'python 回退 nextTurnCount 不符');
      assert(modelB.userPending.nextStepCount === expectations.nextStepCount, 'python 回退 nextStepCount 不符');
      pythonFallback = '已验证（含 inbox 回放）';
    } catch (error) {
      if (error.exitCode === EXIT_NO_ZSTD || error.spawnError) pythonFallback = '跳过（python3/zstandard 不可用）';
      else throw error;
    }
    checks.push(`python3 zstandard 回退${pythonFallback}`);

    // 4) CLI 端到端：--cwd 定位 + JSON 契约（含 userPending 形状/计数/脱敏）
    const jsonRun = await run(['--json', '--cwd', fixtureCwd], { DSH_HOME: fakeHome, DSH_SESSION_ID: '' });
    assert(jsonRun.exitCode === EXIT_OK, `--json --cwd 应 exit 0，实际 ${jsonRun.exitCode}：${jsonRun.stderr}`);
    const parsed = JSON.parse(jsonRun.stdout);
    assert(parsed.ok === true, 'JSON ok 应为 true');
    assert(parsed.sessionId === 'session-self-test-0001', 'JSON sessionId 不符');
    assert(parsed.path === fixturePath, 'JSON path 应指向会话日志');
    assert(parsed.queued === 3 && parsed.delivered === 2 && parsed.pending === 1, 'JSON 计数不符');
    assert(parsed.items.length === 1 && parsed.items[0].direction === 'incoming', 'JSON items 不符');
    const itemKeys = Object.keys(parsed.items[0]).sort();
    assert(
      JSON.stringify(itemKeys) === JSON.stringify(['direction', 'id', 'preview', 'queuedAt', 'senderName', 'targetId']),
      `JSON items 键不符: ${itemKeys.join(',')}`,
    );
    const userPendingKeys = Object.keys(parsed.userPending).sort();
    assert(
      JSON.stringify(userPendingKeys) === JSON.stringify(['nextStep', 'nextStepCount', 'nextTurn', 'nextTurnCount']),
      `JSON userPending 键不符: ${userPendingKeys.join(',')}`,
    );
    assert(parsed.userPending.nextTurnCount === expectations.nextTurnCount, 'JSON nextTurnCount 不符');
    assert(parsed.userPending.nextStepCount === expectations.nextStepCount, 'JSON nextStepCount 不符');
    assert(parsed.userPending.nextTurn.length === expectations.nextTurnCount, 'JSON nextTurn 数组长度不符');
    assert(parsed.userPending.nextStep.length === expectations.nextStepCount, 'JSON nextStep 数组长度不符');
    const userItemKeys = Object.keys(parsed.userPending.nextTurn[0]).sort();
    assert(
      JSON.stringify(userItemKeys) === JSON.stringify(['id', 'preview', 'queuedAt', 'source', 'target']),
      `JSON 用户项键不符: ${userItemKeys.join(',')}`,
    );
    assert(
      parsed.userPending.nextTurn[0].source === 'user' && parsed.userPending.nextTurn[0].target === 'next-turn',
      'JSON 用户项 source/target 不符',
    );
    assert(!jsonRun.stdout.includes(expectations.secretTail), 'JSON 输出不得包含完整密钥');
    assert(/按 --cwd 选择该目录最新会话/.test(jsonRun.stderr), '--cwd 命中时应打印 warning 说明推测依据');
    checks.push('CLI --cwd 定位 + JSON 契约（含 userPending 形状/计数/脱敏）');

    // 5) --session 端到端 + 文本输出契约（Team 明细 + 用户排队段）
    const textRun = await run(['--session', 'session-self-test-0001'], { DSH_HOME: fakeHome, DSH_SESSION_ID: '' });
    assert(textRun.exitCode === EXIT_OK, `--session 文本模式应 exit 0，实际 ${textRun.exitCode}`);
    const textLines = textRun.stdout.trimEnd().split('\n');
    assert(textLines[0] === 'mailbox peek (read-only) — session session-self-test-0001', `文本首行不符: ${textLines[0]}`);
    assert(textLines[1] === 'queued 3 · delivered 2 · pending 1', `文本第二行不符: ${textLines[1]}`);
    assert(/^· \[pending\] \d{2}:\d{2} worker-a → session-self-test-lead-0001: /.test(textLines[2]), `pending 行不符: ${textLines[2]}`);
    const promptHeaderIndex = textLines.indexOf('pending user prompts (next-turn 2, next-step 1):');
    assert(promptHeaderIndex !== -1, `文本应包含用户排队段标题: ${textRun.stdout}`);
    const promptLines = textLines.slice(promptHeaderIndex + 1);
    assert(promptLines.length === 3, `用户排队行数应为 3（next-turn 2 + next-step 1），实际 ${promptLines.length}`);
    assert(promptLines.every((line) => /^- \[\d{2}:\d{2}:\d{2}\] /.test(line)), `用户排队行格式不符: ${JSON.stringify(promptLines)}`);
    assert(!textRun.stdout.includes(expectations.secretTail), '文本输出不得包含完整密钥');
    assert(textRun.stdout.includes('sk-***'), '文本输出应显示脱敏后的 sk-***');
    checks.push('CLI --session 文本输出契约（Team 明细 + pending user prompts 段/时间格式/脱敏）');

    // 6) --limit 0 只裁剪 items 与用户排队列表，不改计数
    const limitRun = await run(['--json', '--limit', '0', '--session', 'session-self-test-0001'], {
      DSH_HOME: fakeHome,
      DSH_SESSION_ID: '',
    });
    const limitParsed = JSON.parse(limitRun.stdout);
    assert(limitRun.exitCode === EXIT_OK && limitParsed.items.length === 0, '--limit 0 应清空 items');
    assert(limitParsed.pending === 1, '--limit 不应改变 pending 计数');
    assert(
      limitParsed.userPending.nextTurn.length === 0 && limitParsed.userPending.nextStep.length === 0,
      '--limit 0 应清空用户排队列表',
    );
    assert(
      limitParsed.userPending.nextTurnCount === expectations.nextTurnCount &&
        limitParsed.userPending.nextStepCount === expectations.nextStepCount,
      '--limit 不应改变用户排队计数',
    );
    checks.push('--limit 只裁剪 items/用户列表');

    // 7) 无用户排队时文本输出 pending user prompts: 0
    const emptyModel = buildModel(createEventCollector(), { sessionId: null, logPath: fixturePath, resolvedBy: 'self-test' }, 20);
    assert(emptyModel.userPending.nextTurnCount === 0 && emptyModel.userPending.nextStepCount === 0, '空会话用户排队计数应为 0');
    assert(/pending user prompts: 0$/.test(toText(emptyModel)), '无用户排队时应输出 pending user prompts: 0');
    checks.push('无用户排队时输出 pending user prompts: 0');

    // 8) 全程只读：fake session 日志 sha256 不变
    assert(sha256(fs.readFileSync(fixturePath)) === fixtureShaBefore, '只读校验失败：CLI 运行后 fixture 被改动');
    checks.push('CLI 运行全程只读（fixture sha256 不变）');

    return {
      exitCode: EXIT_OK,
      stdout: `self-test PASS · ${checks.join('；')}\n`,
      stderr: '',
    };
  } catch (error) {
    return {
      exitCode: EXIT_RUNTIME,
      stdout: '',
      stderr: `${error.message}\n`,
    };
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* 清理失败不掩盖测试结论 */
    }
  }
}

// ---------------------------------------------------------------------------
// CLI 入口
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const result = await run(argv);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

// 仅当作为脚本直接运行时执行 main（被 import 时不自动跑）。
// 注意：不能直接用 new URL(import.meta.url).pathname（含中文/空格的路径会被百分号编码）；
// 也要用 realpath 比较（macOS 的 /tmp 是指向 /private/tmp 的符号链接，直接字符串比较会失配）。
function isInvokedDirectly() {
  if (typeof process.argv[1] !== 'string' || !process.argv[1]) return false;
  const selfPath = fileURLToPath(import.meta.url);
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(selfPath);
  } catch {
    return path.resolve(process.argv[1]) === path.resolve(selfPath);
  }
}
const invokedDirectly = isInvokedDirectly();
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exitCode = EXIT_RUNTIME;
  });
}
