// Host half of dsh-project-supervisor.
//
// The panel is a read-only viewer for the supervisor rules, but the
// three mode switches need to persist into the session workspace so that the
// *model* (which only reads files) can honor them. Client plugins cannot write
// files, so this host entry registers one tiny same-origin HTTP endpoint:
//
//   GET  /plugins/dsh-project-supervisor/config?cwd=<abs>
//        -> { ok, exists, beginnerGuard, promptPolish, requirementInterview, dispatchMode, path }
//   POST /plugins/dsh-project-supervisor/config
//        -> { ok, exists, beginnerGuard, promptPolish, requirementInterview, dispatchMode, path }
//        body: { cwd, beginnerGuard?: boolean, promptPolish?: boolean,
//                requirementInterview?: boolean, dispatchMode?: 'efficiency'|'strict' }
//        (at least one)
//
// The config lives at <workspace>/.dsh/supervisor.config.json and is read by
// the supervisor rules at kickoff: "零基础保护" reads beginnerGuard,
// "提示词润色" reads promptPolish, "新项目需求追问" reads requirementInterview
// (all on by default); dispatchMode picks how the supervisor dispatches work
// (efficiency = default, strict = every write goes to a teammate dialog).
//
// Cross-platform notes (Windows / macOS / Linux):
// - never relies on a shell, symlinks or POSIX-only env vars at runtime;
// - home directory comes from `os.homedir()` (Windows has no $HOME by default);
// - path containment compares with the platform separator and is
//   case-insensitive on Windows;
// - every failure path answers JSON / is swallowed so a bad workspace or a
//   closed browser tab can never take the DSH process down;
// - importing this module has no side effects.
import { promises as fs, realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const inject = ['webServer'];

const ROUTE_PATH = '/plugins/dsh-project-supervisor/config';
const MODELS_PATH = '/plugins/dsh-project-supervisor/models';
const MODELS_CACHE_MS = 60_000;
let modelsCache = { at: 0, routes: [] };
const CONFIG_SEGMENTS = ['.dsh', 'supervisor.config.json'];
const MAX_BODY_BYTES = 8192;
const IS_WINDOWS = process.platform === 'win32';
const BOOLEAN_KEYS = ['beginnerGuard', 'promptPolish', 'requirementInterview'];
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
  } catch (error) {
    warn('[dsh-project-supervisor] plugin disabled: ' + ((error && error.message) || 'unknown error'));
  }
}
