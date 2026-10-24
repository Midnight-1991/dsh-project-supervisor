#!/usr/bin/env node
/**
 * Offline checks for the host half (index.js) of the supervisor plugin.
 *
 * Boots the plugin with a fake Cordis context, then exercises the registered
 * HTTP handler with fake IncomingMessage / ServerResponse objects: config read,
 * write, validation and same-origin checks. No DSH process needed.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { apply, inject } from '../index.js';

const HOME_BACKUP = process.env.HOME;
const root = mkdtempSync(path.join(tmpdir(), 'psup-host-'));
process.env.HOME = root;
const workspace = path.join(root, 'ws');
mkdirSync(workspace, { recursive: true });
const configFile = path.join(workspace, '.dsh', 'supervisor.config.json');

let route;
const ctx = {
  webServer: {
    register(value) {
      route = value;
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

async function call({ body, ...options } = {}) {
  const req = makeReq({ ...options, body });
  const res = makeRes();
  await route.handler(req, res);
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

try {
  assert.ok(inject.includes('webServer'), 'host half must declare webServer injection');
  apply(ctx);
  assert.equal(route.kind, 'exact');
  assert.equal(route.path, '/plugins/dsh-project-supervisor/config');
  assert.equal(typeof route.handler, 'function');
  pass('host half registers the exact config route on webServer');

  let result = await call({ url: urlFor(workspace) });
  assert.equal(result.status, 200);
  assert.deepEqual(
    {
      ok: result.json.ok,
      exists: result.json.exists,
      beginnerGuard: result.json.beginnerGuard,
      promptPolish: result.json.promptPolish,
      requirementInterview: result.json.requirementInterview,
      dispatchMode: result.json.dispatchMode,
    },
    { ok: true, exists: false, beginnerGuard: true, promptPolish: true, requirementInterview: true, dispatchMode: 'efficiency' },
  );
  pass('GET without config file reports defaults (all three switches true)');

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

  result = await call({ url: '/plugins/dsh-project-supervisor/config?cwd=relative/path' });
  assert.equal(result.status, 400);
  result = await call({ url: '/plugins/dsh-project-supervisor/config?cwd=/etc' });
  assert.equal(result.status, 400);
  pass('invalid / outside-home workspace paths are rejected');

  result = await call({ method: 'PUT', url: '/plugins/dsh-project-supervisor/config' });
  assert.equal(result.status, 405);
  pass('unsupported method returns 405');

  console.log('\nPASS host smoke: ' + passed + ' checks');
} finally {
  process.env.HOME = HOME_BACKUP;
  rmSync(root, { recursive: true, force: true });
}
