#!/usr/bin/env node
/**
 * Offline checks for the host half (index.js) of the supervisor plugin.
 *
 * Boots the plugin with a fake Cordis context, then exercises the registered
 * HTTP handler with fake IncomingMessage / ServerResponse objects: config read,
 * write, validation and same-origin checks. No DSH process needed.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';
import { apply, escapeWorkspacePath, inject } from '../index.js';

const HOME_BACKUP = process.env.HOME;
const DSH_HOME_BACKUP = process.env.DSH_HOME;
const root = mkdtempSync(path.join(tmpdir(), 'psup-host-'));
process.env.HOME = root;
process.env.DSH_HOME = path.join(root, '.dsh');
const workspace = path.join(root, 'ws');
mkdirSync(workspace, { recursive: true });
const realWorkspace = realpathSync(workspace);
const configFile = path.join(workspace, '.dsh', 'supervisor.config.json');

const routes = new Map();
const fakeLlm = {
  listProviders() {
    return [{ id: 'deepseek-official', name: 'DeepSeek' }];
  },
  async listModels(providerId) {
    if (providerId !== 'deepseek-official') return [];
    return [
      { id: 'deepseek-flash', name: 'DeepSeek Flash' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    ];
  },
};
const ctx = {
  get(name) {
    return name === 'llm' ? fakeLlm : undefined;
  },
  webServer: {
    register(value) {
      routes.set(value.path, value);
      return () => {};
    },
  },
  effect(fn) {
    return fn();
  },
};

let passed = 0;
function pass(name) {
  passed += 1;
  console.log('PASS  ' + name);
}

let skipped = 0;
function skip(name) {
  skipped += 1;
  console.log('SKIP  ' + name);
}

function makeRes() {
  const state = { status: 0, headers: {}, body: '', ended: false };
  const res = {
    writeHead(status, headers) {
      state.status = status;
      Object.assign(state.headers, headers || {});
      return res;
    },
    end(chunk) {
      if (chunk !== undefined) state.body += String(chunk);
      state.ended = true;
    },
    get statusCode() {
      return state.status;
    },
    state,
  };
  return res;
}

function makeReq({ method = 'GET', url = '/', origin, host = '127.0.0.1:3080', body, remoteAddress = '127.0.0.1' } = {}) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  stream.method = method;
  stream.url = url;
  stream.headers = {};
  if (origin !== undefined) stream.headers.origin = origin;
  stream.headers.host = host;
  stream.socket = { remoteAddress };
  return stream;
}

async function call({ body, handler: targetHandler, ...options } = {}) {
  const req = makeReq({ ...options, body });
  const res = makeRes();
  await (targetHandler || route).handler(req, res);
  let json = null;
  try {
    json = JSON.parse(res.state.body);
  } catch {
    json = null;
  }
  return { status: res.state.status, json, raw: res.state.body, headers: res.state.headers };
}

function urlFor(cwd) {
  return '/plugins/dsh-project-supervisor/config?cwd=' + encodeURIComponent(cwd);
}

function autoWorkUrlFor(cwd) {
  return '/plugins/dsh-project-supervisor/auto-work?cwd=' + encodeURIComponent(cwd);
}

const queueFile = path.join(workspace, '.dsh', 'auto-work-queue.md');
const autoWorkRoutePath = '/plugins/dsh-project-supervisor/auto-work';
const configPost = (extra) =>
  call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, ...extra }),
  });

let configRoute;
let modelsRoute;
let autoWorkRoute;
let teamBoardRoute;
let route;

try {
  assert.ok(inject.includes('webServer'), 'host half must declare webServer injection');
  apply(ctx);
  configRoute = routes.get('/plugins/dsh-project-supervisor/config');
  modelsRoute = routes.get('/plugins/dsh-project-supervisor/models');
  autoWorkRoute = routes.get(autoWorkRoutePath);
  teamBoardRoute = routes.get('/plugins/dsh-project-supervisor/team-board');
  route = configRoute;
  assert.ok(configRoute, 'config route must be registered');
  assert.ok(modelsRoute, 'models route must be registered');
  assert.ok(autoWorkRoute, 'auto-work queue route must be registered');
  assert.equal(configRoute.kind, 'exact');
  assert.equal(configRoute.path, '/plugins/dsh-project-supervisor/config');
  assert.equal(typeof configRoute.handler, 'function');
  assert.equal(modelsRoute.kind, 'exact');
  assert.equal(modelsRoute.path, '/plugins/dsh-project-supervisor/models');
  assert.equal(autoWorkRoute.kind, 'exact');
  assert.equal(autoWorkRoute.path, autoWorkRoutePath);
  assert.equal(typeof autoWorkRoute.handler, 'function');
  assert.ok(teamBoardRoute, 'team-board route must be registered');
  assert.equal(teamBoardRoute.kind, 'exact');
  assert.equal(teamBoardRoute.path, '/plugins/dsh-project-supervisor/team-board');
  assert.equal(typeof teamBoardRoute.handler, 'function');
  assert.equal(
    routes.has('/plugins/dsh-project-supervisor/runtime'),
    false,
    'the removed runtime route must not be registered',
  );
  pass('host half registers the exact config, models, auto-work and team-board routes (no runtime route)');

  let result = await call({ url: urlFor(workspace) });
  assert.equal(result.status, 200);
  assert.deepEqual(
    {
      ok: result.json.ok,
      exists: result.json.exists,
      beginnerGuard: result.json.beginnerGuard,
      promptPolish: result.json.promptPolish,
      requirementInterview: result.json.requirementInterview,
      autoWork: result.json.autoWork,
      economicalAutoWork: result.json.economicalAutoWork,
      dispatchMode: result.json.dispatchMode,
    },
    {
      ok: true,
      exists: false,
      beginnerGuard: true,
      promptPolish: true,
      requirementInterview: true,
      autoWork: false,
      economicalAutoWork: false,
      dispatchMode: 'efficiency',
    },
  );
  pass('GET without config file reports defaults (three switches true, autoWork + economicalAutoWork false)');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, beginnerGuard: false }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.beginnerGuard, false);
  const written = JSON.parse(readFileSync(configFile, 'utf8'));
  assert.equal(written.beginnerGuard, false);
  assert.equal(written.promptPolish, true, 'writing one switch must keep the other switch at its default');
  assert.equal(written.updatedAt.length > 0, true);
  assert.equal(written.source, 'dsh-project-supervisor');
  pass('POST writes supervisor.config.json (beginnerGuard=false, promptPolish kept)');

  result = await call({ url: urlFor(workspace) });
  assert.equal(result.status, 200);
  assert.equal(result.json.exists, true);
  assert.equal(result.json.beginnerGuard, false);
  assert.equal(result.json.promptPolish, true);
  pass('GET reads back the persisted switch state');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, beginnerGuard: true }),
  });
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(readFileSync(configFile, 'utf8')).beginnerGuard, true);
  pass('POST can switch beginnerGuard back on');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, promptPolish: false }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.promptPolish, false);
  assert.equal(result.json.beginnerGuard, true);
  const withPolish = JSON.parse(readFileSync(configFile, 'utf8'));
  assert.equal(withPolish.promptPolish, false);
  assert.equal(withPolish.beginnerGuard, true, 'writing promptPolish must not reset beginnerGuard');
  pass('POST can switch promptPolish off without touching beginnerGuard');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, promptPolish: true }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.promptPolish, true);
  pass('POST can switch promptPolish back on');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, requirementInterview: false }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.requirementInterview, false);
  assert.equal(result.json.beginnerGuard, true);
  assert.equal(result.json.promptPolish, true);
  const withInterview = JSON.parse(readFileSync(configFile, 'utf8'));
  assert.equal(withInterview.requirementInterview, false);
  assert.equal(withInterview.beginnerGuard, true, 'writing requirementInterview must not reset beginnerGuard');
  assert.equal(withInterview.promptPolish, true, 'writing requirementInterview must not reset promptPolish');
  pass('POST can switch requirementInterview off without touching the other two switches');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, requirementInterview: true }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.requirementInterview, true);
  pass('POST can switch requirementInterview back on');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, dispatchMode: 'strict' }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.dispatchMode, 'strict');
  assert.equal(result.json.beginnerGuard, true);
  const withMode = JSON.parse(readFileSync(configFile, 'utf8'));
  assert.equal(withMode.dispatchMode, 'strict');
  assert.equal(withMode.promptPolish, true, 'writing dispatchMode must not reset promptPolish');
  pass('POST can switch dispatchMode to strict without touching switches');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, dispatchMode: 'fast' }),
  });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-dispatch-mode');
  pass('POST rejects an unknown dispatchMode value');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, dispatchMode: 'efficiency' }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.dispatchMode, 'efficiency');
  pass('POST can switch dispatchMode back to efficiency');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://evil.example',
    body: JSON.stringify({ cwd: workspace, beginnerGuard: false, promptPolish: false }),
  });
  assert.equal(result.status, 403);
  const untouched = JSON.parse(readFileSync(configFile, 'utf8'));
  assert.equal(untouched.beginnerGuard, true);
  assert.equal(untouched.promptPolish, true);
  assert.equal(untouched.dispatchMode, 'efficiency');
  pass('cross-origin POST is rejected and leaves the file unchanged');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace }),
  });
  assert.equal(result.status, 400);
  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, promptPolish: 'yes' }),
  });
  assert.equal(result.status, 400);
  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, requirementInterview: 'yes' }),
  });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-requirement-interview');
  pass('POST with no boolean switch, or a non-boolean switch, is rejected');

  // ---- model collaboration group ----
  result = await call({ url: '/plugins/dsh-project-supervisor/config?cwd=' + encodeURIComponent(workspace) });
  assert.equal(result.status, 200);
  assert.equal(result.json.modelCollaboration.enabled, false);
  assert.equal(result.json.modelCollaboration.mode, 'auto');
  assert.equal(result.json.modelCollaboration.assignments.review, '');
  pass('GET returns modelCollaboration defaults (off / auto / empty assignments)');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({
      cwd: workspace,
      modelCollaboration: {
        enabled: true,
        mode: 'manual',
        assignments: { review: 'deepseek-official/deepseek-v4-pro', implement: 'deepseek-official/deepseek-flash' },
      },
    }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.modelCollaboration.enabled, true);
  assert.equal(result.json.modelCollaboration.mode, 'manual');
  assert.equal(result.json.modelCollaboration.assignments.review, 'deepseek-official/deepseek-v4-pro');
  let storedCollab = JSON.parse(readFileSync(configFile, 'utf8'));
  assert.equal(storedCollab.modelCollaboration.assignments.implement, 'deepseek-official/deepseek-flash');
  pass('POST can enable modelCollaboration with manual assignments');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, modelCollaboration: { enabled: false } }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.modelCollaboration.enabled, false);
  assert.equal(result.json.modelCollaboration.mode, 'manual');
  assert.equal(result.json.modelCollaboration.assignments.review, 'deepseek-official/deepseek-v4-pro');
  pass('partial modelCollaboration update keeps mode and assignments');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, modelCollaboration: { mode: 'sometimes' } }),
  });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-model-mode');
  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, modelCollaboration: { assignments: { review: 'not a route' } } }),
  });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-model-route');
  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, modelCollaboration: { assignments: { deploy: 'x/y' } } }),
  });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-model-task');
  storedCollab = JSON.parse(readFileSync(configFile, 'utf8'));
  assert.equal(storedCollab.modelCollaboration.assignments.review, 'deepseek-official/deepseek-v4-pro');
  pass('invalid model mode / route / task are rejected without touching the file');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://evil.example',
    body: JSON.stringify({ cwd: workspace, modelCollaboration: { enabled: true } }),
  });
  assert.equal(result.status, 403);
  storedCollab = JSON.parse(readFileSync(configFile, 'utf8'));
  assert.equal(storedCollab.modelCollaboration.enabled, false);
  pass('cross-origin modelCollaboration POST is rejected');

  result = await call({ url: '/plugins/dsh-project-supervisor/config?cwd=relative/path' });
  assert.equal(result.status, 400);
  result = await call({ url: '/plugins/dsh-project-supervisor/config?cwd=/etc' });
  assert.equal(result.status, 400);
  pass('invalid / outside-home workspace paths are rejected');

  // ---- live model routes endpoint ----
  result = await call({ handler: modelsRoute, url: '/plugins/dsh-project-supervisor/models' });
  assert.equal(result.status, 200);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.routes.length, 2);
  assert.equal(result.json.routes[0].provider, 'deepseek-official');
  assert.equal(result.json.routes[0].model, 'deepseek-flash');
  assert.equal(result.json.routes[1].model, 'deepseek-v4-pro');
  pass('GET /models enumerates the live provider/model routes');

  result = await call({ handler: modelsRoute, method: 'POST', url: '/plugins/dsh-project-supervisor/models' });
  assert.equal(result.status, 405);
  result = await call({
    handler: modelsRoute,
    url: '/plugins/dsh-project-supervisor/models',
    origin: 'http://evil.example',
  });
  assert.equal(result.status, 403);
  pass('/models rejects non-GET and cross-origin requests');

  // ---- auto routing table (autoRoutes) ----
  result = await call({ url: '/plugins/dsh-project-supervisor/config?cwd=' + encodeURIComponent(workspace) });
  assert.equal(result.json.modelCollaboration.autoRoutes.review, '');
  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({
      cwd: workspace,
      modelCollaboration: {
        enabled: true,
        mode: 'auto',
        autoRoutes: { review: 'deepseek-official/deepseek-v4-pro', implement: 'deepseek-official/deepseek-flash' },
      },
    }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.modelCollaboration.autoRoutes.review, 'deepseek-official/deepseek-v4-pro');
  assert.equal(result.json.modelCollaboration.mode, 'auto');
  pass('POST can write the auto routing table');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, modelCollaboration: { assignments: { docs: 'deepseek-official/deepseek-flash' } } }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.modelCollaboration.autoRoutes.review, 'deepseek-official/deepseek-v4-pro');
  assert.equal(result.json.modelCollaboration.assignments.docs, 'deepseek-official/deepseek-flash');
  pass('partial update keeps autoRoutes and assignments independent');

  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, modelCollaboration: { autoRoutes: { deploy: 'x/y' } } }),
  });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-model-task');
  result = await call({
    method: 'POST',
    url: '/plugins/dsh-project-supervisor/config',
    origin: 'http://127.0.0.1:3080',
    body: JSON.stringify({ cwd: workspace, modelCollaboration: { autoRoutes: { review: 'not a route' } } }),
  });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-model-route');
  pass('autoRoutes rejects unknown tasks and malformed routes');

  result = await call({ method: 'PUT', url: '/plugins/dsh-project-supervisor/config' });
  assert.equal(result.status, 405);
  pass('unsupported method returns 405');

  // ---- auto work switch (default off) ----
  result = await call({ url: urlFor(workspace) });
  assert.equal(result.status, 200);
  assert.equal(result.json.autoWork, false, 'autoWork must default to off');
  pass('GET reports autoWork=false by default');

  result = await configPost({ autoWork: true });
  assert.equal(result.status, 200);
  assert.equal(result.json.autoWork, true);
  let storedAutoWork = JSON.parse(readFileSync(configFile, 'utf8'));
  assert.equal(storedAutoWork.autoWork, true);
  assert.equal(storedAutoWork.beginnerGuard, true, 'writing autoWork must not reset beginnerGuard');
  assert.equal(storedAutoWork.dispatchMode, 'efficiency', 'writing autoWork must not reset dispatchMode');
  pass('POST turns autoWork on and persists it without resetting other fields');

  result = await call({ url: urlFor(workspace) });
  assert.equal(result.json.autoWork, true);
  pass('GET reads back autoWork=true');

  result = await configPost({ autoWork: 'yes' });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-auto-work');
  storedAutoWork = JSON.parse(readFileSync(configFile, 'utf8'));
  assert.equal(storedAutoWork.autoWork, true, 'an invalid autoWork value must leave the file unchanged');
  result = await configPost({ autoWork: 1 });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-auto-work');
  result = await configPost({ autoWork: null });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-auto-work');
  pass('POST rejects non-boolean autoWork with 400 invalid-auto-work');

  result = await configPost({ dispatchMode: 'strict' });
  assert.equal(result.status, 200);
  assert.equal(result.json.autoWork, true, 'partial update must keep autoWork');
  assert.equal(result.json.dispatchMode, 'strict');
  assert.equal(JSON.parse(readFileSync(configFile, 'utf8')).autoWork, true);
  pass('partial update keeps autoWork while changing dispatchMode');

  result = await configPost({ dispatchMode: 'efficiency' });
  assert.equal(result.status, 200);
  assert.equal(result.json.autoWork, true);
  pass('dispatchMode can change back without losing autoWork');

  // ---- economical auto work switch (nested, default off, only meaningful while autoWork is on) ----
  result = await call({ url: urlFor(workspace) });
  assert.equal(result.json.economicalAutoWork, false, 'economicalAutoWork must default to off');
  pass('GET reports economicalAutoWork=false by default');

  result = await configPost({ economicalAutoWork: true });
  assert.equal(result.status, 200);
  assert.equal(result.json.economicalAutoWork, true);
  let storedEconomical = JSON.parse(readFileSync(configFile, 'utf8'));
  assert.equal(storedEconomical.economicalAutoWork, true);
  assert.equal(storedEconomical.autoWork, true, 'writing economicalAutoWork must not reset autoWork');
  assert.equal(storedEconomical.beginnerGuard, true, 'writing economicalAutoWork must not reset beginnerGuard');
  pass('POST turns economicalAutoWork on and persists it without resetting other fields');

  result = await call({ url: urlFor(workspace) });
  assert.equal(result.json.economicalAutoWork, true, 'GET must read back economicalAutoWork=true');
  pass('GET reads back economicalAutoWork=true');

  result = await configPost({ economicalAutoWork: 'yes' });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-economical-auto-work');
  result = await configPost({ economicalAutoWork: 1 });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-economical-auto-work');
  result = await configPost({ economicalAutoWork: null });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-economical-auto-work');
  storedEconomical = JSON.parse(readFileSync(configFile, 'utf8'));
  assert.equal(storedEconomical.economicalAutoWork, true, 'invalid economicalAutoWork values must leave the file unchanged');
  pass('POST rejects non-boolean economicalAutoWork with 400 invalid-economical-auto-work');

  result = await configPost({ dispatchMode: 'strict' });
  assert.equal(result.status, 200);
  assert.equal(result.json.economicalAutoWork, true, 'partial update must keep economicalAutoWork');
  assert.equal(result.json.autoWork, true, 'partial update must keep autoWork');
  assert.equal(result.json.dispatchMode, 'strict');
  result = await configPost({ dispatchMode: 'efficiency' });
  assert.equal(result.status, 200);
  assert.equal(result.json.economicalAutoWork, true);
  pass('partial update keeps economicalAutoWork while dispatchMode changes');

  result = await configPost({ economicalAutoWork: false });
  assert.equal(result.status, 200);
  assert.equal(result.json.economicalAutoWork, false);
  assert.equal(result.json.autoWork, true, 'turning economicalAutoWork off must keep autoWork');
  pass('economicalAutoWork can turn back off without losing autoWork');

  // ---- auto-work queue route (read-only) ----
  const configSnapshot = readFileSync(configFile, 'utf8');
  result = await call({ handler: autoWorkRoute, url: autoWorkUrlFor(workspace) });
  assert.equal(result.status, 200);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.exists, false, 'missing queue file must report exists=false');
  assert.equal(result.json.enabled, true, 'enabled must mirror the persisted autoWork switch');
  assert.ok(result.json.path.endsWith(path.join('.dsh', 'auto-work-queue.md')), 'queue path must point at .dsh/auto-work-queue.md: ' + result.json.path);
  assert.equal(result.json.updatedAt, null);
  assert.deepEqual(
    {
      queue: { title: result.json.sections.queue.title, count: result.json.sections.queue.count, items: result.json.sections.queue.items },
      blocked: { title: result.json.sections.blocked.title, count: result.json.sections.blocked.count, items: result.json.sections.blocked.items },
      questions: {
        title: result.json.sections.questions.title,
        count: result.json.sections.questions.count,
        items: result.json.sections.questions.items,
      },
    },
    {
      queue: { title: '排队任务', count: 0, items: [] },
      blocked: { title: '阻塞', count: 0, items: [] },
      questions: { title: '待回答的问题', count: 0, items: [] },
    },
  );
  assert.equal(readFileSync(configFile, 'utf8'), configSnapshot, 'auto-work GET must not write the config file');
  pass('GET auto-work reports exists=false and zero counts for a missing queue file');

  writeFileSync(
    queueFile,
    [
      '# 自动工作队列',
      '',
      '## 排队任务',
      '- 收拾 backlog：给 smoke 增加断言',
      '- 只读 mailbox 脚本自测',
      '- （空）',
      '',
      '## 阻塞',
      '- 等待用户确认发布节奏',
      '',
      '## 待回答的问题',
      '- 自动工作默认开还是关？',
      '- （空）',
      '',
      '## 自动工作日志',
      '- 2026-11-01 建立队列',
      '',
    ].join('\n'),
    'utf8',
  );
  result = await call({ handler: autoWorkRoute, url: autoWorkUrlFor(workspace) });
  assert.equal(result.status, 200);
  assert.equal(result.json.exists, true);
  assert.equal(result.json.sections.queue.count, 2, 'placeholder - （空） must not count');
  assert.deepEqual(result.json.sections.queue.items, ['收拾 backlog：给 smoke 增加断言', '只读 mailbox 脚本自测']);
  assert.equal(result.json.sections.blocked.count, 1);
  assert.deepEqual(result.json.sections.blocked.items, ['等待用户确认发布节奏']);
  assert.equal(result.json.sections.questions.count, 1);
  assert.deepEqual(result.json.sections.questions.items, ['自动工作默认开还是关？']);
  assert.equal(result.json.sections.queue.title, '排队任务');
  assert.equal(result.json.sections.blocked.title, '阻塞');
  assert.equal(result.json.sections.questions.title, '待回答的问题');
  assert.ok(typeof result.json.updatedAt === 'string' && result.json.updatedAt.length > 0, 'existing queue file must report updatedAt');
  assert.ok(!Number.isNaN(Date.parse(result.json.updatedAt)), 'updatedAt must be a valid ISO timestamp');
  pass('GET auto-work parses the three fixed sections, skips placeholders and the log section');

  const longItem = 'x'.repeat(260);
  const manyItems = ['- ' + longItem].concat(
    Array.from({ length: 24 }, (_, index) => '- 排队项 ' + String(index + 1)),
  );
  writeFileSync(
    queueFile,
    ['## 排队任务', ...manyItems, '', '## 阻塞', '- （空）', '', '## 待回答的问题', '- （空）', ''].join('\n'),
    'utf8',
  );
  result = await call({ handler: autoWorkRoute, url: autoWorkUrlFor(workspace) });
  assert.equal(result.json.sections.queue.count, 20, 'each section must cap at 20 items');
  assert.equal(result.json.sections.queue.items.length, 20);
  assert.equal(result.json.sections.queue.items[0].length, 200, 'each item must truncate to 200 chars');
  assert.equal(result.json.sections.blocked.count, 0, 'placeholder-only section counts as empty');
  assert.equal(result.json.sections.questions.count, 0);
  pass('GET auto-work truncates items to 200 chars and caps each section at 20 items');

  // A read-only GET must not mutate the queue file either.
  const queueSnapshot = readFileSync(queueFile, 'utf8');
  result = await call({ handler: autoWorkRoute, url: autoWorkUrlFor(workspace) });
  assert.equal(result.status, 200);
  assert.equal(readFileSync(queueFile, 'utf8'), queueSnapshot, 'auto-work GET must not write the queue file');
  pass('GET auto-work is read-only (queue file unchanged)');

  result = await call({ handler: autoWorkRoute, url: '/plugins/dsh-project-supervisor/auto-work?cwd=relative/path' });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-cwd');
  result = await call({ handler: autoWorkRoute, url: '/plugins/dsh-project-supervisor/auto-work?cwd=' + encodeURIComponent('/etc') });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-cwd');
  result = await call({ handler: autoWorkRoute, url: '/plugins/dsh-project-supervisor/auto-work' });
  assert.equal(result.status, 400);
  assert.equal(result.json.error, 'invalid-cwd');
  pass('GET auto-work rejects non-absolute, outside-home and missing cwd');

  result = await call({ handler: autoWorkRoute, method: 'POST', url: autoWorkRoutePath });
  assert.equal(result.status, 405);
  assert.equal(result.json.error, 'method-not-allowed');
  result = await call({ handler: autoWorkRoute, method: 'PUT', url: autoWorkRoutePath });
  assert.equal(result.status, 405);
  pass('auto-work route rejects non-GET methods with 405');

  result = await call({ handler: autoWorkRoute, url: autoWorkUrlFor(workspace), origin: 'http://evil.example' });
  assert.equal(result.status, 403);
  assert.equal(result.json.error, 'forbidden');
  pass('auto-work route rejects cross-origin requests');

  result = await configPost({ autoWork: false });
  assert.equal(result.status, 200);
  assert.equal(result.json.autoWork, false);
  result = await call({ handler: autoWorkRoute, url: autoWorkUrlFor(workspace) });
  assert.equal(result.json.enabled, false, 'enabled must follow autoWork=false');
  pass('auto-work enabled flag follows the switch back to off');

  // Node < 22.15 / < 23.8 has no zlib zstd API. The runtime route itself
  // degrades gracefully (zstd-unavailable), so exercise the fixture checks only
  // where compression exists and report the rest as skipped.
  const hasNodeZstd =
    typeof zlib.zstdCompressSync === 'function' && typeof zlib.zstdDecompressSync === 'function';
  if (!hasNodeZstd) {
    skip('team-board route fixture checks (Node zlib zstd API unavailable; requires Node >=22.15 / >=23.8)');
  } else {
    // ---- team-board route (read-only Lead session log parsing) ----
    function writeZstdJsonlLog(file, events) {
      const frames = events.map((event) =>
        zlib.zstdCompressSync(Buffer.from(JSON.stringify(event) + '\n', 'utf8')),
      );
      writeFileSync(file, Buffer.concat(frames));
    }

    const teamSessionId = 'session-11111111-2222-3333-4444-555555555555';
    const teamSessionDir = path.join(
      process.env.DSH_HOME,
      'sessions',
      escapeWorkspacePath(realWorkspace),
      teamSessionId,
    );
    mkdirSync(teamSessionDir, { recursive: true });
    const longText = 'y'.repeat(400);
    writeZstdJsonlLog(path.join(teamSessionDir, 'session.v4.jsonl.zstd'), [
      { type: 'session', id: teamSessionId, cwd: realWorkspace },
      {
        type: 'team/member',
        time: 1793468000000,
        data: { version: 2, teamId: 'team-1', member: { id: 'session-aaa', name: 'rules-engineer', description: 'steward', provider: 'deepseek', context: 'fresh', phase: 'provisioning' } },
      },
      {
        type: 'team/member',
        time: 1793468001000,
        data: { version: 2, teamId: 'team-1', member: { id: 'session-aaa', name: 'rules-engineer', description: 'steward', provider: 'deepseek', context: 'fresh', phase: 'active' } },
      },
      {
        type: 'team/task',
        time: 1793468002000,
        data: { version: 2, teamId: 'team-1', task: { id: 'task-1', revision: 1, subject: 'rev1 subject', description: '', status: 'pending', ownerId: 'session-aaa', blockedBy: [], writeScopes: [] } },
      },
      {
        type: 'team/task',
        time: 1793468003000,
        data: { version: 2, teamId: 'team-1', task: { id: 'task-1', revision: 2, subject: 'rev2 subject', description: '', status: 'in_progress', ownerId: 'session-aaa', blockedBy: [], writeScopes: ['plugin/dsh-project-supervisor/'] } },
      },
      {
        type: 'team/task',
        time: 1793468004000,
        data: { version: 2, teamId: 'team-1', task: { id: 'task-2', revision: 1, subject: 'second task', description: '', status: 'pending', blockedBy: ['task-1'], writeScopes: ['setup/'] } },
      },
      {
        type: 'team/message/queued',
        time: 1793468005000,
        data: { version: 2, teamId: 'team-1', message: { id: 'message-1', senderId: 'session-aaa', senderName: 'rules-engineer', targetId: teamSessionId, content: [{ type: 'text', text: 'already delivered' }] } },
      },
      {
        type: 'team/message/delivered',
        time: 1793468006000,
        data: { version: 2, teamId: 'team-1', messageId: 'message-1', targetId: teamSessionId },
      },
      {
        type: 'team/message/queued',
        time: 1793468007000,
        data: { version: 2, teamId: 'team-1', message: { id: 'message-2', senderId: 'session-aaa', senderName: 'rules-engineer', targetId: teamSessionId, content: [{ type: 'text', text: longText }] } },
      },
      {
        type: 'team/message/queued',
        time: 1793468008000,
        data: { version: 2, teamId: 'team-1', message: { id: 'message-3', senderId: 'session-aaa', senderName: 'rules-engineer', targetId: teamSessionId, content: [{ type: 'text', text: 'pending two' }] } },
      },
    ]);
    const teamLogFile = path.join(teamSessionDir, 'session.v4.jsonl.zstd');
    const teamLogBytesBefore = readFileSync(teamLogFile);
    const teamBoardUrl = (cwd, session) =>
      '/plugins/dsh-project-supervisor/team-board?cwd=' + encodeURIComponent(cwd) + '&session=' + encodeURIComponent(session);

    result = await call({ handler: teamBoardRoute, url: teamBoardUrl(workspace, teamSessionId) });
    assert.equal(result.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.exists, true);
    assert.equal(result.json.members.length, 1, 'members must be deduped by id');
    assert.deepEqual(
      { name: result.json.members[0].name, phase: result.json.members[0].phase, context: result.json.members[0].context },
      { name: 'rules-engineer', phase: 'active', context: 'fresh' },
    );
    assert.equal(result.json.tasks.length, 2);
    const firstTask = result.json.tasks.find((task) => task.id === 'task-1');
    assert.equal(firstTask.revision, 2, 'tasks must keep the highest revision');
    assert.equal(firstTask.subject, 'rev2 subject');
    assert.equal(firstTask.status, 'in_progress');
    assert.equal(firstTask.ownerName, 'rules-engineer', 'ownerName must resolve the member id');
    const secondTask = result.json.tasks.find((task) => task.id === 'task-2');
    assert.deepEqual(secondTask.blockedBy, ['task-1']);
    assert.deepEqual(secondTask.writeScopes, ['setup/']);
    assert.equal(result.json.messages.queued, 3);
    assert.equal(result.json.messages.delivered, 1);
    assert.equal(result.json.messages.pending, 2, 'pending must be queued-minus-delivered');
    assert.deepEqual(result.json.messages.items.map((item) => item.id), ['message-2', 'message-3']);
    assert.equal(result.json.messages.items[0].preview.length, 120, 'message preview must truncate to 120 chars');
    assert.ok(typeof result.json.messages.items[0].queuedAt === 'string');
    assert.ok(result.json.path.endsWith(path.join(teamSessionId, 'session.v4.jsonl.zstd')));
    assert.ok(!Number.isNaN(Date.parse(result.json.updatedAt)), 'updatedAt must be a valid timestamp');
    assert.ok(readFileSync(teamLogFile).equals(teamLogBytesBefore), 'team-board GET must not modify the session log');
    pass('team-board parses members/tasks/messages (revision dedupe, pending diff, preview truncate)');

    result = await call({
      handler: teamBoardRoute,
      url: teamBoardUrl(workspace, teamSessionId.slice('session-'.length)),
    });
    assert.equal(result.status, 200);
    assert.equal(result.json.exists, true, 'bare uuid must resolve the session-<uuid> directory');
    assert.equal(result.json.sessionId, teamSessionId);
    pass('team-board accepts both bare uuid and session-<uuid> directory names');

    result = await call({ handler: teamBoardRoute, url: teamBoardUrl(workspace, 'session-does-not-exist') });
    assert.equal(result.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.exists, false);
    assert.equal(result.json.warning, 'session-log-not-found');
    assert.deepEqual(result.json.members, []);
    assert.deepEqual(result.json.messages, { queued: 0, delivered: 0, pending: 0, items: [] });
    pass('team-board degrades to an empty board when the session log is missing');

    result = await call({ handler: teamBoardRoute, url: '/plugins/dsh-project-supervisor/team-board?cwd=' + encodeURIComponent(workspace) });
    assert.equal(result.status, 400);
    assert.equal(result.json.error, 'invalid-session');
    result = await call({ handler: teamBoardRoute, url: teamBoardUrl(workspace, 'bad session id') });
    assert.equal(result.status, 400);
    assert.equal(result.json.error, 'invalid-session');
    result = await call({ handler: teamBoardRoute, url: teamBoardUrl('relative/path', teamSessionId) });
    assert.equal(result.status, 400);
    assert.equal(result.json.error, 'invalid-cwd');
    result = await call({ handler: teamBoardRoute, method: 'POST', url: '/plugins/dsh-project-supervisor/team-board' });
    assert.equal(result.status, 405);
    result = await call({ handler: teamBoardRoute, url: teamBoardUrl(workspace, teamSessionId), origin: 'http://evil.example' });
    assert.equal(result.status, 403);
    pass('team-board rejects missing/invalid session, bad cwd, non-GET and cross-origin with 400/405/403');
  }

  console.log('\nPASS host smoke: ' + passed + ' checks' + (skipped ? ' (' + skipped + ' skipped on this Node)' : ''));
} finally {
  process.env.HOME = HOME_BACKUP;
  if (DSH_HOME_BACKUP === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = DSH_HOME_BACKUP;
  rmSync(root, { recursive: true, force: true });
}
