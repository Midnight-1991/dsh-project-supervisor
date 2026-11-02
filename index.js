// Host half of dsh-project-supervisor.
//
// The panel is a read-only viewer for the supervisor rules, but the mode
// switches (incl. auto work, off by default) need to persist into the session
// workspace so that the *model* (which only reads files) can honor them. Client
// plugins cannot write files, so this host entry registers small same-origin
// HTTP endpoints:
//
//   GET  /plugins/dsh-project-supervisor/config?cwd=<abs>
//        -> { ok, exists, beginnerGuard, promptPolish, requirementInterview, autoWork,
//             economicalAutoWork, dispatchMode, path }
//   POST /plugins/dsh-project-supervisor/config
//        -> { ok, exists, beginnerGuard, promptPolish, requirementInterview, autoWork,
//             economicalAutoWork, dispatchMode, path }
//        body: { cwd, beginnerGuard?: boolean, promptPolish?: boolean,
//                requirementInterview?: boolean, autoWork?: boolean,
//                economicalAutoWork?: boolean, dispatchMode?: 'efficiency'|'strict' }
//        (at least one)
//   GET  /plugins/dsh-project-supervisor/auto-work?cwd=<abs>
//        -> { ok, exists, path, enabled, sections: { queue, blocked, questions }, updatedAt }
//        Read-only view of <workspace>/.dsh/auto-work-queue.md: parses the three
//        fixed sections (排队任务 / 阻塞 / 待回答的问题) for the panel's
//        "auto work" card. Never writes: a GET must not mutate any file.
//   GET  /plugins/dsh-project-supervisor/team-board?cwd=<abs>&session=<id>
//        -> { ok, exists, sessionId, path, members, tasks, messages, updatedAt }
//        Read-only view of the Lead session log's durable Team events (members,
//        task board, queued-minus-delivered messages) for the panel's
//        "team & tasks" card. Never writes.
//
// The config lives at <workspace>/.dsh/supervisor.config.json and is read by
// the supervisor rules at kickoff: "零基础保护" reads beginnerGuard,
// "提示词润色" reads promptPolish, "新项目需求追问" reads requirementInterview
// (all on by default), "自动工作" reads autoWork (off by default) and the
// nested "更经济的自动化" reads economicalAutoWork (off by default; only
// effective while autoWork is on); dispatchMode picks how the supervisor dispatches work
// (efficiency = default, strict = every write goes to a teammate dialog).
//
// Cross-platform notes (Windows / macOS / Linux):
// - never relies on a shell, symlinks or POSIX-only env vars when running;
// - home directory comes from `os.homedir()` (Windows has no $HOME by default);
// - path containment compares with the platform separator and is
//   case-insensitive on Windows;
// - every failure path answers JSON / is swallowed so a bad workspace or a
//   closed browser tab can never take the DSH process down;
// - importing this module has no side effects.
import { createReadStream, promises as fs, realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

export const inject = ['webServer'];

const ROUTE_PATH = '/plugins/dsh-project-supervisor/config';
const MODELS_PATH = '/plugins/dsh-project-supervisor/models';
const AUTO_WORK_PATH = '/plugins/dsh-project-supervisor/auto-work';
const TEAM_BOARD_PATH = '/plugins/dsh-project-supervisor/team-board';
const MODELS_CACHE_MS = 60_000;
let modelsCache = { at: 0, routes: [] };
const CONFIG_SEGMENTS = ['.dsh', 'supervisor.config.json'];
const AUTO_WORK_QUEUE_SEGMENTS = ['.dsh', 'auto-work-queue.md'];
const MAX_BODY_BYTES = 8192;
const IS_WINDOWS = process.platform === 'win32';
const BOOLEAN_KEYS = ['beginnerGuard', 'promptPolish', 'requirementInterview', 'autoWork', 'economicalAutoWork'];
// Fixed second-level sections of the auto-work queue file, in display order.
const AUTO_WORK_SECTIONS = [
  { key: 'queue', title: '排队任务' },
  { key: 'blocked', title: '阻塞' },
  { key: 'questions', title: '待回答的问题' },
];
const AUTO_WORK_ITEM_MAX_CHARS = 200;
const AUTO_WORK_ITEMS_MAX = 20;
const AUTO_WORK_PLACEHOLDERS = new Set(['（空）', '(空)']);
// Team board (read-only) limits: mirror the peek-mailbox contract so the panel
// and the CLI agree on what "pending" means, with hard caps to stay responsive.
const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SESSION_LOG_FILE = 'session.v4.jsonl.zstd';
const TEAM_BOARD_MAX_ITEMS = 200;
const TEAM_PREVIEW_CHARS = 120;
const TEAM_MAX_COMPRESSED_BYTES = 50 * 1024 * 1024;
const TEAM_MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;

const DISPATCH_MODES = ['efficiency', 'strict'];
const MODEL_MODES = ['auto', 'manual'];
const MODEL_TASK_TYPES = ['planning', 'implement', 'review', 'research', 'docs', 'verify'];
// 空字符串表示「不指定，用 DSH 默认」；否则必须是 provider/model 形式。
const MODEL_ROUTE_RE = /^$|^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const DEFAULT_MODEL_COLLAB = {
  enabled: false,
  mode: 'auto',
  assignments: { planning: '', implement: '', review: '', research: '', docs: '', verify: '' },
  autoRoutes: { planning: '', implement: '', review: '', research: '', docs: '', verify: '' },
};
const DEFAULT_CONFIG = {
  beginnerGuard: true,
  promptPolish: true,
  requirementInterview: true,
  autoWork: false,
  // 自动工作的次级开关：只在 DeepSeek 谷价时段推进（默认关，且需 autoWork 已开）。
  economicalAutoWork: false,
  dispatchMode: 'efficiency',
  modelCollaboration: DEFAULT_MODEL_COLLAB,
};

/** Normalize a task -> provider/model map; empty string means "use DSH default". */
function normalizeRouteSet(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const routes = {};
  for (const task of MODEL_TASK_TYPES) {
    const route = raw[task];
    routes[task] = typeof route === 'string' && MODEL_ROUTE_RE.test(route.trim()) ? route.trim() : '';
  }
  return routes;
}

/** Normalize the model-collaboration group (tolerates partial/legacy values). */
function normalizeModelCollaboration(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    enabled: raw.enabled === true,
    mode: raw.mode === 'manual' ? 'manual' : 'auto',
    assignments: normalizeRouteSet(raw.assignments),
    autoRoutes: normalizeRouteSet(raw.autoRoutes),
  };
}

/** Send JSON; never throws (a closed response must not bubble up). */
function sendJson(res, status, value) {
  try {
    const body = JSON.stringify(value);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    });
    res.end(body);
  } catch {
    try {
      if (res && !res.headersSent && typeof res.writeHead === 'function') res.writeHead(500);
      if (res && typeof res.end === 'function') res.end();
    } catch {
      // response already destroyed; nothing left to do
    }
  }
}

function isLoopback(req) {
  const address = req.socket && req.socket.remoteAddress;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/** Same-origin check: browser writes must come from the DSH page itself. */
function isSameOrigin(req) {
  const origin = req.headers && req.headers.origin;
  if (origin) {
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }
  // Fetch GETs from same-origin pages omit Origin; only accept them from loopback.
  return isLoopback(req);
}

/**
 * True when `child` equals `parent` or lives inside it.
 * Exported for cross-platform tests: pass `{ sep: '\\', caseInsensitive: true }`
 * to exercise the Windows branch on any OS.
 */
export function isInsideHomePath(child, parent, options = {}) {
  if (typeof child !== 'string' || typeof parent !== 'string' || !child || !parent) return false;
  const sep = options.sep || path.sep;
  const caseInsensitive =
    options.caseInsensitive === undefined ? IS_WINDOWS : Boolean(options.caseInsensitive);
  const stripTrailing = (value) => {
    let out = value;
    while (out.length > 1) {
      const last = out[out.length - 1];
      if (last !== '/' && last !== '\\') break;
      // keep the trailing separator of roots like "/" or "C:\"
      if (out.length <= 3 && out[1] === ':') break;
      out = out.slice(0, -1);
    }
    return out;
  };
  const normalize = (value) => {
    const stripped = stripTrailing(value);
    return caseInsensitive ? stripped.toLowerCase() : stripped;
  };
  const childValue = normalize(child);
  const parentValue = normalize(parent);
  return childValue === parentValue || childValue.startsWith(parentValue + sep);
}

/** Path of the config file; exported so tests can run the Windows branch via path.win32. */
export function configPathFor(target, pathImpl = path) {
  return pathImpl.join(target, ...CONFIG_SEGMENTS);
}

/** Path of the auto-work queue file (<workspace>/.dsh/auto-work-queue.md). */
function autoWorkQueuePath(target) {
  return path.join(target, ...AUTO_WORK_QUEUE_SEGMENTS);
}

/**
 * Parse the auto-work queue markdown into the three fixed sections.
 * Items are top-level `- ` lines; the `- （空）` placeholder is skipped; each
 * item is capped at 200 chars and each section at 20 items. Unknown sections
 * and malformed lines are ignored, so a hand-edited file can never break the
 * panel. Pure + read-only.
 */
function parseAutoWorkQueue(text) {
  const sections = {};
  for (const def of AUTO_WORK_SECTIONS) {
    sections[def.key] = { title: def.title, count: 0, items: [] };
  }
  let current = null;
  for (const rawLine of String(text == null ? '' : text).split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      const title = heading[1].trim();
      const def = AUTO_WORK_SECTIONS.find((item) => item.title === title);
      current = def ? sections[def.key] : null;
      continue;
    }
    if (!current || !line.startsWith('- ')) continue;
    const value = line.slice(2).trim();
    if (!value || AUTO_WORK_PLACEHOLDERS.has(value)) continue;
    if (current.items.length >= AUTO_WORK_ITEMS_MAX) continue;
    current.items.push(value.length > AUTO_WORK_ITEM_MAX_CHARS ? value.slice(0, AUTO_WORK_ITEM_MAX_CHARS) : value);
    current.count = current.items.length;
  }
  return sections;
}

function realHome() {
  const home = os.homedir();
  if (!home) return '';
  try {
    return realpathSync(home);
  } catch {
    return home;
  }
}

function resolveWorkspace(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0 || cwd.length > 4096) return null;
  if (!path.isAbsolute(cwd)) return null;
  let real;
  try {
    real = realpathSync(cwd);
    if (!statSync(real).isDirectory()) return null;
  } catch {
    return null;
  }
  // Only write inside the user's home tree; refuse system paths.
  const home = realHome();
  if (!home || !isInsideHomePath(real, home)) return null;
  return real;
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('body too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    const error = new Error('invalid json');
    error.status = 400;
    throw error;
  }
}

function configFile(target) {
  return configPathFor(target);
}

async function readStoredConfig(target) {
  const file = configFile(target);
  let raw;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return { ...DEFAULT_CONFIG, exists: false, path: file };
    throw error;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // Corrupt/hand-edited file: fall back to defaults instead of failing the panel forever.
    return { ...DEFAULT_CONFIG, exists: false, path: file };
  }
  return { ...DEFAULT_CONFIG, ...data, exists: true, path: file };
}

async function readConfig(target) {
  const stored = await readStoredConfig(target);
  return {
    exists: stored.exists,
    beginnerGuard: stored.beginnerGuard !== false,
    promptPolish: stored.promptPolish !== false,
    requirementInterview: stored.requirementInterview !== false,
    // Auto work is the only switch that defaults OFF: undefined/garbage -> false.
    autoWork: stored.autoWork === true,
    // 次级开关同样默认 OFF；缺省/非法 -> false（不含对 autoWork 的联动，UI 侧负责置灰）。
    economicalAutoWork: stored.economicalAutoWork === true,
    dispatchMode: stored.dispatchMode === 'strict' ? 'strict' : 'efficiency',
    modelCollaboration: normalizeModelCollaboration(stored.modelCollaboration),
    path: stored.path,
  };
}

async function writeFileAtomic(file, payload) {
  const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
  await fs.writeFile(tmp, payload, 'utf8');
  try {
    await fs.rename(tmp, file);
  } catch (error) {
    // Windows: antivirus/indexer may briefly lock the target; write in place as a fallback.
    const code = error && error.code;
    if (IS_WINDOWS && (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY' || code === 'EEXIST')) {
      await fs.writeFile(file, payload, 'utf8');
      try {
        await fs.unlink(tmp);
      } catch {
        // best effort
      }
      return;
    }
    try {
      await fs.unlink(tmp);
    } catch {
      // best effort
    }
    throw error;
  }
}

async function writeConfig(target, patch) {
  const dir = path.join(target, '.dsh');
  const file = configFile(target);
  const current = await readStoredConfig(target);
  await fs.mkdir(dir, { recursive: true });
  const payload = JSON.stringify(
    {
      beginnerGuard:
        typeof patch.beginnerGuard === 'boolean' ? patch.beginnerGuard : current.beginnerGuard !== false,
      promptPolish:
        typeof patch.promptPolish === 'boolean' ? patch.promptPolish : current.promptPolish !== false,
      requirementInterview:
        typeof patch.requirementInterview === 'boolean'
          ? patch.requirementInterview
          : current.requirementInterview !== false,
      autoWork: typeof patch.autoWork === 'boolean' ? patch.autoWork : current.autoWork === true,
      economicalAutoWork:
        typeof patch.economicalAutoWork === 'boolean' ? patch.economicalAutoWork : current.economicalAutoWork === true,
      dispatchMode:
        DISPATCH_MODES.includes(patch.dispatchMode)
          ? patch.dispatchMode
          : current.dispatchMode === 'strict'
            ? 'strict'
            : 'efficiency',
      modelCollaboration: (() => {
        const prev = normalizeModelCollaboration(current.modelCollaboration);
        if (!patch.modelCollaboration || typeof patch.modelCollaboration !== 'object') return prev;
        const incomingAssignments =
          patch.modelCollaboration.assignments && typeof patch.modelCollaboration.assignments === 'object'
            ? patch.modelCollaboration.assignments
            : {};
        const incomingAutoRoutes =
          patch.modelCollaboration.autoRoutes && typeof patch.modelCollaboration.autoRoutes === 'object'
            ? patch.modelCollaboration.autoRoutes
            : {};
        return normalizeModelCollaboration({
          ...prev,
          ...patch.modelCollaboration,
          assignments: { ...prev.assignments, ...incomingAssignments },
          autoRoutes: { ...prev.autoRoutes, ...incomingAutoRoutes },
        });
      })(),
      updatedAt: new Date().toISOString(),
      source: 'dsh-project-supervisor',
    },
    null,
    2,
  );
  await writeFileAtomic(file, payload + '\n');
  return file;
}

/** Enumerate registered LLM provider/model routes for the panel (best effort). */
async function discoverModelRoutes(ctx) {
  try {
    const llm = ctx && typeof ctx.get === 'function' ? ctx.get('llm') : undefined;
    if (!llm || typeof llm.listProviders !== 'function') return [];
    const routes = [];
    for (const provider of llm.listProviders()) {
      let models = [];
      try {
        models = typeof llm.listModels === 'function' ? await llm.listModels(provider.id) : [];
      } catch {
        models = [];
      }
      for (const model of models || []) {
        if (model && typeof model.id === 'string' && model.id.length > 0) {
          routes.push({ provider: provider.id, model: model.id, name: model.name || model.id });
        }
      }
    }
    return routes;
  } catch {
    return [];
  }
}

async function sendModels(ctx, res) {
  const now = Date.now();
  if (now - modelsCache.at > MODELS_CACHE_MS) {
    let routes = [];
    try {
      routes = await discoverModelRoutes(ctx);
    } catch {
      routes = [];
    }
    modelsCache = { at: Date.now(), routes };
    sendJson(res, 200, { ok: true, routes });
    return;
  }
  sendJson(res, 200, { ok: true, routes: modelsCache.routes });
}

async function modelsHandler(ctx, req, res) {
  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'method-not-allowed' });
      return;
    }
    if (!isSameOrigin(req)) {
      sendJson(res, 403, { ok: false, error: 'forbidden' });
      return;
    }
    await sendModels(ctx, res);
  } catch {
    sendJson(res, 200, { ok: true, routes: [] });
  }
}

/**
 * Read-only queue status for the panel's auto-work card.
 * GET only; same-origin/loopback and home-containment are the same helpers as
 * the config route. A missing/unreadable queue file is not an error: it reports
 * exists:false with zero counts so the panel can show a static hint instead.
 */
async function autoWorkHandler(req, res) {
  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'method-not-allowed' });
      return;
    }
    if (!isSameOrigin(req)) {
      sendJson(res, 403, { ok: false, error: 'forbidden' });
      return;
    }
    let url;
    try {
      url = new URL(req.url || '/', 'http://127.0.0.1');
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid-url' });
      return;
    }
    const target = resolveWorkspace(url.searchParams.get('cwd') || '');
    if (!target) {
      sendJson(res, 400, { ok: false, error: 'invalid-cwd' });
      return;
    }
    const file = autoWorkQueuePath(target);
    const config = await readConfig(target);
    let exists = false;
    let updatedAt = null;
    let text = '';
    try {
      const info = await fs.stat(file);
      if (info.isFile()) {
        exists = true;
        updatedAt = new Date(info.mtimeMs).toISOString();
        text = await fs.readFile(file, 'utf8');
      }
    } catch (error) {
      // ENOENT (no queue file yet) and unreadable files both degrade to an
      // empty view; the panel only needs counts, never an error page.
      if (!error || error.code !== 'ENOENT') {
        exists = false;
        updatedAt = null;
      }
    }
    sendJson(res, 200, {
      ok: true,
      exists,
      path: file,
      enabled: config.autoWork === true,
      sections: parseAutoWorkQueue(exists ? text : ''),
      updatedAt,
    });
  } catch (error) {
    sendJson(res, (error && error.status) || 500, { ok: false, error: (error && error.code) || 'internal' });
  }
}

/* ========================================================================== *
 * Team board (read-only)
 *
 * GET /plugins/dsh-project-supervisor/team-board?cwd=<abs>&session=<id>
 * Parses the Lead's durable session log (multi-frame zstd JSONL) for the Team
 * domain events (team/member, team/task, team/message/queued|delivered). This
 * is the read-only equivalent of the `agentTeam` projection: members are the
 * last lifecycle snapshot, tasks keep the highest revision, and pending
 * messages are queued-minus-delivered, exactly like peek-mailbox.mjs.
 * Degradations (log missing, no zstd, truncated tail, too large) answer JSON
 * with empty/partial data and a warning instead of throwing.
 * ========================================================================== */

/** Absolute $DSH_HOME (env wins, like the supervisor kit scripts). */
function dshHomeDir() {
  const fromEnv = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : '';
  return fromEnv || path.join(os.homedir(), '.dsh');
}

/**
 * Encode an absolute workspace path into DSH's sessions directory name.
 * Mirror of peek-mailbox.mjs: `/` -> `-`, wrapped in `--`, every char outside
 * [A-Za-z0-9._-] becomes `~` + 4 uppercase hex (UTF-16 code units).
 * Exported for the offline Windows/UTF-8 tests.
 */
export function escapeWorkspacePath(absPath) {
  let rel = String(absPath == null ? '' : absPath).replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(rel)) rel = rel.replace(/^([A-Za-z]):/, '-$1-');
  if (rel.startsWith('/')) rel = rel.slice(1);
  let out = '--';
  for (const ch of rel.split('')) {
    if (/[A-Za-z0-9._-]/.test(ch)) out += ch;
    else if (ch === '/') out += '-';
    else out += '~' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
  }
  return out + '--';
}

/** Session directory candidates: raw id, bare uuid, and `session-<uuid>`. */
function sessionDirCandidates(rawId) {
  const id = String(rawId == null ? '' : rawId).trim();
  const bare = id.startsWith('session-') ? id.slice('session-'.length) : id;
  return [...new Set([id, bare, 'session-' + bare])];
}

/** Locate <$DSH_HOME>/sessions/<escaped-cwd>/<session-dir>/session.v4.jsonl.zstd. */
function findTeamBoardLog(target, rawSession) {
  const workspaceDir = path.join(dshHomeDir(), 'sessions', escapeWorkspacePath(target));
  for (const candidate of sessionDirCandidates(rawSession)) {
    const file = path.join(workspaceDir, candidate, SESSION_LOG_FILE);
    let info;
    try {
      info = statSync(file);
    } catch {
      continue;
    }
    if (info.isFile()) {
      return { sessionId: candidate, path: file, mtimeMs: info.mtimeMs, workspaceDir };
    }
  }
  return null;
}

/**
 * Stream-decompress a multi-frame zstd JSONL log and feed complete lines to the
 * collector. Truncated tails (session still being written) are tolerated; a
 * decompressed-size cap protects the DSH process from pathological logs.
 */
function readZstdJsonLines(logPath, onLine) {
  return new Promise((resolve) => {
    const result = { bytes: 0, truncated: false, unavailable: false, tooLarge: false };
    let settled = false;
    const finish = (patch) => {
      if (settled) return;
      settled = true;
      Object.assign(result, patch || {});
      resolve(result);
    };
    if (typeof zlib.createZstdDecompress !== 'function') {
      finish({ unavailable: true });
      return;
    }
    let source;
    let decoder;
    try {
      source = createReadStream(logPath);
      decoder = zlib.createZstdDecompress();
    } catch {
      finish({ unavailable: true });
      return;
    }
    let buffer = '';
    const emit = (final) => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        try {
          onLine(line);
        } catch {
          // a broken line must never abort the whole read
        }
        index = buffer.indexOf('\n');
      }
      if (final && buffer.trim()) {
        try {
          onLine(buffer);
        } catch {
          // ignore
        }
        buffer = '';
      }
    };
    decoder.setEncoding('utf8');
    decoder.on('data', (chunk) => {
      result.bytes += Buffer.byteLength(chunk);
      if (result.bytes > TEAM_MAX_DECOMPRESSED_BYTES) {
        finish({ tooLarge: true });
        try {
          source.destroy();
          decoder.destroy();
        } catch {
          // best effort
        }
        return;
      }
      buffer += chunk;
      emit(false);
    });
    decoder.on('end', () => {
      emit(true);
      finish({});
    });
    decoder.on('error', () => {
      emit(true);
      finish({ truncated: true });
    });
    source.on('error', () => finish({ truncated: true }));
    source.pipe(decoder);
  });
}

/** First text block of a Team message content array, trimmed to a preview. */
function previewFromContent(content) {
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    if (block && block.type === 'text' && typeof block.text === 'string') {
      const normalized = block.text.replace(/\s+/g, ' ').trim();
      return normalized.length > TEAM_PREVIEW_CHARS
        ? Array.from(normalized).slice(0, TEAM_PREVIEW_CHARS).join('')
        : normalized;
    }
  }
  return '';
}

/** Incremental collector for the durable Team events of one Lead session log. */
function createTeamEventCollector() {
  const state = {
    rootId: null,
    teamId: null,
    lineCount: 0,
    badLines: 0,
    queuedCount: 0,
    deliveredCount: 0,
    members: new Map(),
    tasks: new Map(),
    queued: new Map(),
    deliveredIds: new Set(),
  };
  const onEvent = (event) => {
    if (!event || typeof event !== 'object' || typeof event.type !== 'string') return;
    if (event.type === 'session') {
      if (state.rootId === null && typeof event.id === 'string') state.rootId = event.id;
      return;
    }
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (state.teamId === null && typeof data.teamId === 'string') state.teamId = data.teamId;
    if (event.type === 'team/member') {
      const member = data.member;
      if (!member || typeof member.id !== 'string' || typeof member.name !== 'string') return;
      const prior = state.members.get(member.id);
      state.members.set(member.id, {
        id: member.id,
        name: member.name,
        description: typeof member.description === 'string' ? member.description : prior ? prior.description : '',
        phase: typeof member.phase === 'string' ? member.phase : prior ? prior.phase : 'active',
        provider: typeof member.provider === 'string' ? member.provider : prior ? prior.provider : '',
        context: member.context === 'fork' ? 'fork' : prior ? prior.context : 'fresh',
      });
      return;
    }
    if (event.type === 'team/task') {
      const task = data.task;
      if (!task || typeof task.id !== 'string' || !Number.isFinite(Number(task.revision))) return;
      const revision = Number(task.revision);
      const prior = state.tasks.get(task.id);
      if (prior && prior.revision >= revision) return; // highest revision wins
      state.tasks.set(task.id, {
        id: task.id,
        revision,
        subject: typeof task.subject === 'string' ? task.subject : '',
        status: typeof task.status === 'string' ? task.status : 'pending',
        ownerId: typeof task.ownerId === 'string' ? task.ownerId : null,
        blockedBy: Array.isArray(task.blockedBy)
          ? task.blockedBy.filter((value) => typeof value === 'string').slice(0, 50)
          : [],
        writeScopes: Array.isArray(task.writeScopes)
          ? task.writeScopes.filter((value) => typeof value === 'string').slice(0, 50)
          : [],
      });
      return;
    }
    if (event.type === 'team/message/queued') {
      const message = data.message;
      if (!message || typeof message.id !== 'string') return;
      state.queuedCount += 1;
      if (state.queued.has(message.id)) return; // first durable enqueue wins
      const timeMs = typeof event.time === 'number' ? event.time : Date.parse(String(event.time || ''));
      state.queued.set(message.id, {
        id: message.id,
        senderName:
          typeof message.senderName === 'string' ? message.senderName : String(message.senderId || '?'),
        targetId: typeof message.targetId === 'string' ? message.targetId : null,
        preview: previewFromContent(message.content),
        queuedAt: Number.isFinite(timeMs) ? new Date(timeMs).toISOString() : null,
      });
      return;
    }
    if (event.type === 'team/message/delivered') {
      state.deliveredCount += 1;
      if (typeof data.messageId === 'string') state.deliveredIds.add(data.messageId);
    }
  };
  return {
    state,
    onLine(line) {
      const trimmed = line.trim();
      if (!trimmed) return;
      state.lineCount += 1;
      let event;
      try {
        event = JSON.parse(trimmed);
      } catch {
        state.badLines += 1; // truncated tail / corrupt line
        return;
      }
      onEvent(event);
    },
  };
}

/** Convert collector state into the public read-only team-board payload. */
function buildTeamBoardPayload(state, location) {
  const members = Array.from(state.members.values()).slice(0, TEAM_BOARD_MAX_ITEMS);
  const memberNames = new Map(members.map((member) => [member.id, member.name]));
  const tasks = [];
  for (const task of state.tasks.values()) {
    if (task.status === 'deleted') continue; // deleted tasks stay off the board
    tasks.push({
      id: task.id,
      revision: task.revision,
      subject: task.subject,
      status: task.status,
      ownerName:
        (task.ownerId && memberNames.get(task.ownerId)) ||
        (task.ownerId && state.rootId && task.ownerId === state.rootId ? 'lead' : null),
      blockedBy: task.blockedBy,
      writeScopes: task.writeScopes,
    });
    if (tasks.length >= TEAM_BOARD_MAX_ITEMS) break;
  }
  const pending = [];
  for (const item of state.queued.values()) {
    if (!state.deliveredIds.has(item.id)) pending.push(item);
  }
  return {
    ok: true,
    exists: true,
    sessionId: location.sessionId,
    path: location.path,
    members,
    tasks,
    messages: {
      queued: state.queuedCount,
      delivered: state.deliveredCount,
      pending: pending.length,
      items: pending.slice(0, TEAM_BOARD_MAX_ITEMS),
    },
    updatedAt: new Date(location.mtimeMs).toISOString(),
  };
}

/** Empty/degraded team-board payload (never throws, never 500s the panel). */
function emptyTeamBoard(sessionId, warning, pathValue) {
  return {
    ok: true,
    exists: false,
    sessionId,
    path: pathValue || null,
    members: [],
    tasks: [],
    messages: { queued: 0, delivered: 0, pending: 0, items: [] },
    updatedAt: null,
    warning,
  };
}

async function teamBoardHandler(req, res) {
  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'method-not-allowed' });
      return;
    }
    if (!isSameOrigin(req)) {
      sendJson(res, 403, { ok: false, error: 'forbidden' });
      return;
    }
    let url;
    try {
      url = new URL(req.url || '/', 'http://127.0.0.1');
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid-url' });
      return;
    }
    const target = resolveWorkspace(url.searchParams.get('cwd') || '');
    if (!target) {
      sendJson(res, 400, { ok: false, error: 'invalid-cwd' });
      return;
    }
    const rawSession = String(url.searchParams.get('session') || '').trim();
    if (!SESSION_ID_RE.test(rawSession)) {
      sendJson(res, 400, { ok: false, error: 'invalid-session' });
      return;
    }
    const location = findTeamBoardLog(target, rawSession);
    if (!location) {
      sendJson(res, 200, emptyTeamBoard(rawSession, 'session-log-not-found', null));
      return;
    }
    let info;
    try {
      info = await fs.stat(location.path);
    } catch {
      sendJson(res, 200, emptyTeamBoard(location.sessionId, 'session-log-not-found', location.path));
      return;
    }
    if (info.size > TEAM_MAX_COMPRESSED_BYTES) {
      sendJson(res, 200, { ok: false, error: 'too-large', sessionId: location.sessionId, path: location.path });
      return;
    }
    const collector = createTeamEventCollector();
    const read = await readZstdJsonLines(location.path, (line) => collector.onLine(line));
    if (read.unavailable) {
      sendJson(res, 200, emptyTeamBoard(location.sessionId, 'zstd-unavailable', location.path));
      return;
    }
    if (read.tooLarge) {
      sendJson(res, 200, { ok: false, error: 'too-large', sessionId: location.sessionId, path: location.path });
      return;
    }
    const payload = buildTeamBoardPayload(collector.state, location);
    if (read.truncated) payload.warning = 'log-truncated';
    sendJson(res, 200, payload);
  } catch {
    sendJson(res, 200, emptyTeamBoard('', 'team-board-unavailable', null));
  }
}


async function handler(req, res) {
  try {
    if (!isSameOrigin(req)) {
      sendJson(res, 403, { ok: false, error: 'forbidden' });
      return;
    }
    let url;
    try {
      url = new URL(req.url || '/', 'http://127.0.0.1');
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid-url' });
      return;
    }
    if (req.method === 'GET') {
      const target = resolveWorkspace(url.searchParams.get('cwd') || '');
      if (!target) {
        sendJson(res, 400, { ok: false, error: 'invalid-cwd' });
        return;
      }
      const config = await readConfig(target);
      sendJson(res, 200, { ok: true, ...config });
      return;
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const target = resolveWorkspace(typeof body.cwd === 'string' ? body.cwd : '');
      if (!target) {
        sendJson(res, 400, { ok: false, error: 'invalid-cwd' });
        return;
      }
      const patch = {};
      let any = false;
      for (const key of BOOLEAN_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
        if (typeof body[key] !== 'boolean') {
          sendJson(res, 400, { ok: false, error: 'invalid-' + key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) });
          return;
        }
        patch[key] = body[key];
        any = true;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'dispatchMode')) {
        if (!DISPATCH_MODES.includes(body.dispatchMode)) {
          sendJson(res, 400, { ok: false, error: 'invalid-dispatch-mode' });
          return;
        }
        patch.dispatchMode = body.dispatchMode;
        any = true;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'modelCollaboration')) {
        const mc = body.modelCollaboration;
        if (!mc || typeof mc !== 'object' || Array.isArray(mc)) {
          sendJson(res, 400, { ok: false, error: 'invalid-model-collaboration' });
          return;
        }
        if (Object.prototype.hasOwnProperty.call(mc, 'enabled') && typeof mc.enabled !== 'boolean') {
          sendJson(res, 400, { ok: false, error: 'invalid-model-collaboration' });
          return;
        }
        if (Object.prototype.hasOwnProperty.call(mc, 'mode') && !MODEL_MODES.includes(mc.mode)) {
          sendJson(res, 400, { ok: false, error: 'invalid-model-mode' });
          return;
        }
        if (Object.prototype.hasOwnProperty.call(mc, 'assignments')) {
          const assignments = mc.assignments;
          if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) {
            sendJson(res, 400, { ok: false, error: 'invalid-model-assignments' });
            return;
          }
          for (const task of Object.keys(assignments)) {
            if (!MODEL_TASK_TYPES.includes(task)) {
              sendJson(res, 400, { ok: false, error: 'invalid-model-task' });
              return;
            }
            const route = assignments[task];
            if (typeof route !== 'string' || !MODEL_ROUTE_RE.test(route.trim())) {
              sendJson(res, 400, { ok: false, error: 'invalid-model-route' });
              return;
            }
          }
        }
        if (Object.prototype.hasOwnProperty.call(mc, 'autoRoutes')) {
          const autoRoutes = mc.autoRoutes;
          if (!autoRoutes || typeof autoRoutes !== 'object' || Array.isArray(autoRoutes)) {
            sendJson(res, 400, { ok: false, error: 'invalid-model-auto-routes' });
            return;
          }
          for (const task of Object.keys(autoRoutes)) {
            if (!MODEL_TASK_TYPES.includes(task)) {
              sendJson(res, 400, { ok: false, error: 'invalid-model-task' });
              return;
            }
            const route = autoRoutes[task];
            if (typeof route !== 'string' || !MODEL_ROUTE_RE.test(route.trim())) {
              sendJson(res, 400, { ok: false, error: 'invalid-model-route' });
              return;
            }
          }
        }
        patch.modelCollaboration = mc;
        any = true;
      }
      if (!any) {
        sendJson(res, 400, { ok: false, error: 'no-field-to-update' });
        return;
      }
      const file = await writeConfig(target, patch);
      const config = await readConfig(target);
      sendJson(res, 200, { ok: true, ...config, path: file });
      return;
    }
    sendJson(res, 405, { ok: false, error: 'method-not-allowed' });
  } catch (error) {
    sendJson(res, (error && error.status) || 500, { ok: false, error: (error && error.code) || 'internal' });
  }
}

/**
 * Register the config route. Defensive by design: if the host API changes or a
 * broken route makes it throw, the plugin logs and disables itself instead of
 * failing the whole DSH profile load.
 */
export function apply(ctx) {
  const warn = (message) => {
    try {
      if (ctx && ctx.logger && typeof ctx.logger.warn === 'function') ctx.logger.warn(message);
    } catch {
      // logging must never throw
    }
  };
  const register = (path, routeHandler, label) => {
    ctx.effect(
      () => {
        try {
          return ctx.webServer.register({ kind: 'exact', path, handler: routeHandler });
        } catch (error) {
          warn('[dsh-project-supervisor] ' + label + ' disabled: ' + ((error && error.message) || 'unknown error'));
          return undefined;
        }
      },
      'project-supervisor: ' + label,
    );
  };
  try {
    register(ROUTE_PATH, handler, 'panel config route');
    register(MODELS_PATH, (req, res) => modelsHandler(ctx, req, res), 'panel models route');
    register(AUTO_WORK_PATH, autoWorkHandler, 'panel auto-work queue route');
    register(TEAM_BOARD_PATH, teamBoardHandler, 'panel team-board route');
  } catch (error) {
    warn('[dsh-project-supervisor] plugin disabled: ' + ((error && error.message) || 'unknown error'));
  }
}
