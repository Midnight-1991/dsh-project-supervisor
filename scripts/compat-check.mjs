#!/usr/bin/env node
/**
 * Cross-platform compatibility & crash-safety check for the supervisor panel
 * plugin (runs on any OS; does not need DSH, Chrome or network).
 *
 * Why this exists: the plugin must be safe to download on a Windows (Huawei)
 * laptop — a broken host plugin could stop the DSH profile from loading. This
 * script verifies, as far as is possible without real Windows hardware:
 *   A. Windows-specific path logic (drive letters, backslashes, case-insensitivity,
 *      UNC paths, home containment) via injected win32 semantics;
 *   B. host half has no POSIX-only assumptions and no side effects at import;
 *   C. `apply()` never throws even when the host API is missing/broken;
 *   D. HTTP handler always answers / never throws on bad input (403/400/405/413,
 *      corrupt config fallback, closed-response safety);
 *   E. both installers are Node-only (no bash/python), idempotent and reversible.
 *
 * Usage: node scripts/compat-check.mjs [--verbose]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  apply,
  configPathFor,
  inject,
  isInsideHomePath,
} from '../index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.resolve(HERE, '..');
const KIT_DIR = (() => {
  // In the source workspace the kit lives under setup/; inside the extracted
  // share package the plugin sits at <kit>/plugin/dsh-project-supervisor, so the
  // kit root is two levels up.
  const sourceLayout = path.resolve(PLUGIN_DIR, '..', '..', 'setup');
  if (fs.existsSync(path.join(sourceLayout, 'install-supervisor.mjs'))) return sourceLayout;
  // Public-repo layout: <repo>/scripts/compat-check.mjs, kit at <repo>/kit.
  const repoKit = path.resolve(PLUGIN_DIR, 'kit');
  if (fs.existsSync(path.join(repoKit, 'install-supervisor.mjs'))) return repoKit;
  return path.resolve(PLUGIN_DIR, '..', '..');
})();
const VERBOSE = process.argv.includes('--verbose');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    pass += 1;
    if (VERBOSE) console.log('PASS  ' + name);
  } catch (error) {
    fail += 1;
    failures.push(name + ' :: ' + ((error && error.message) || error));
    console.log('FAIL  ' + name + ' :: ' + ((error && error.message) || error));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    encoding: 'utf8',
    cwd: options.cwd || PLUGIN_DIR,
    env: { ...process.env, ...(options.env || {}) },
    timeout: 120000,
  });
}

const tempRoots = [];
function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

function cleanup() {
  for (const dir of tempRoots) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
}

// ---------------------------------------------------------------------------
// A. Windows path semantics
// ---------------------------------------------------------------------------
const WIN = { sep: '\\', caseInsensitive: true };

check('A1 Windows: normal workspace inside home', () => {
  assert(isInsideHomePath('C:\\Users\\Alice\\proj', 'C:\\Users\\Alice', WIN) === true, 'expected true');
});
check('A2 Windows: case-insensitive drive/user match', () => {
  assert(isInsideHomePath('c:\\users\\alice\\Desktop\\demo', 'C:\\Users\\Alice', WIN) === true, 'expected true');
});
check('A3 Windows: sibling prefix must not pass (AliceEvil)', () => {
  assert(isInsideHomePath('C:\\Users\\AliceEvil\\proj', 'C:\\Users\\Alice', WIN) === false, 'expected false');
});
check('A4 Windows: other drive rejected', () => {
  assert(isInsideHomePath('D:\\projects\\x', 'C:\\Users\\Alice', WIN) === false, 'expected false');
});
check('A5 Windows: UNC path rejected', () => {
  assert(isInsideHomePath('\\\\server\\share\\x', 'C:\\Users\\Alice', WIN) === false, 'expected false');
});
check('A6 Windows: trailing separators normalized', () => {
  assert(isInsideHomePath('C:\\Users\\Alice\\proj\\', 'C:\\Users\\Alice\\', WIN) === true, 'expected true');
  assert(isInsideHomePath('C:\\Users\\Alice', 'C:\\Users\\Alice\\', WIN) === true, 'home itself expected true');
});
check('A7 POSIX: containment still works', () => {
  assert(isInsideHomePath('/home/bob/proj', '/home/bob') === true, 'expected true');
  assert(isInsideHomePath('/home/bobby/proj', '/home/bob') === false, 'expected false');
  assert(isInsideHomePath('/tmp/x', '/home/bob') === false, 'expected false');
});
check('A8 empty inputs are safe', () => {
  assert(isInsideHomePath('', '/home/bob') === false, 'empty child');
  assert(isInsideHomePath('/home/bob/x', '') === false, 'empty parent');
});
check('A9 config path uses platform separators', () => {
  const win = configPathFor('C:\\Users\\Alice\\proj', path.win32);
  assert(win === 'C:\\Users\\Alice\\proj\\.dsh\\supervisor.config.json', 'got ' + win);
  const posix = configPathFor('/home/bob/proj', path.posix);
  assert(posix === '/home/bob/proj/.dsh/supervisor.config.json', 'got ' + posix);
});

// ---------------------------------------------------------------------------
// B. No POSIX-only assumptions / no import side effects
// ---------------------------------------------------------------------------
const hostSource = fs.readFileSync(path.join(PLUGIN_DIR, 'index.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(PLUGIN_DIR, 'client.js'), 'utf8');
const installerSource = fs.readFileSync(path.join(PLUGIN_DIR, 'install-plugin.mjs'), 'utf8');

check('B1 host half uses os.homedir (Windows has no $HOME)', () => {
  assert(hostSource.includes('os.homedir'), 'os.homedir missing');
  assert(!/process\.env\.HOME/.test(hostSource), 'still reads process.env.HOME');
});
check('B2 host half has no shell / child process / POSIX-only modules', () => {
  assert(!/child_process|execSync|spawnSync|spawn\(/.test(hostSource), 'shell usage found');
  assert(!/require\(['"]os['"]\)/.test(hostSource), 'CJS require in ESM');
});
check('B3 client half handles backslash cwd (Windows chips)', () => {
  assert(clientSource.includes('replace(/[\\\\/]+$/,') || clientSource.includes('split(/[\\\\/]/)'), 'backslash path handling missing');
});
check('B4 installer is Node-only and cross-platform', () => {
  assert(!/child_process|execSync|spawnSync|spawn\(/.test(installerSource), 'installer still shells out');
  assert(!/require\(['"](?:fs|os|path)['"]\)/.test(installerSource), 'installer uses CJS require');
  assert(installerSource.includes('junction'), 'Windows junction fallback missing');
  assert(installerSource.includes('cpSync'), 'copy fallback missing');
  assert(installerSource.includes("replace(/\\\\/g, '/')"), 'forward-slash link spec missing');
});
check('B5 plugin runtime files avoid absolute developer paths', () => {
  for (const name of ['index.js', 'client.js', 'install-plugin.mjs', 'package.json']) {
    const text = fs.readFileSync(path.join(PLUGIN_DIR, name), 'utf8');
    assert(!text.includes('<HOME>/'), name + ' contains <HOME>/ absolute path');
  }
});
check('B6 importing the host module has no side effects (no fs writes at import)', () => {
  const probe = tempDir('psup-compat-import-');
  const result = runNode(['-e', `import('${path.join(PLUGIN_DIR, 'index.js').replace(/\\/g, '/')}').then(m => { if (typeof m.apply !== 'function') process.exit(3); })`], { cwd: probe });
  assert(result.status === 0, 'import failed: ' + (result.stderr || result.stdout));
  assert(fs.readdirSync(probe).length === 0, 'import wrote files into cwd');
});
check('B7 package.json declares all runtime files', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'package.json'), 'utf8'));
  assert(manifest.type === 'module', 'type must be module');
  for (const name of ['index.js', 'client.js', 'cordis.patch.yml', 'install-plugin.mjs', 'install-plugin.sh']) {
    assert(fs.existsSync(path.join(PLUGIN_DIR, name)), 'missing runtime file ' + name);
    assert(manifest.files.includes(name), 'package.json files[] misses ' + name);
  }
});

// ---------------------------------------------------------------------------
// C. apply() never throws (DSH crash safety)
// ---------------------------------------------------------------------------
check('C1 inject declares webServer', () => {
  assert(Array.isArray(inject) && inject.includes('webServer'), 'inject[] wrong');
});
check('C2 apply tolerates an empty ctx', () => {
  apply({});
});
check('C3 apply tolerates ctx.effect throwing', () => {
  apply({ effect() { throw new Error('boom'); } });
});
check('C4 apply tolerates webServer.register throwing', () => {
  apply({ effect(callback) { callback(); }, webServer: { register() { throw new Error('no route'); } } });
});

// ---------------------------------------------------------------------------
// D. HTTP handler: always answers, never throws
// ---------------------------------------------------------------------------
const routes = new Map();
apply({
  effect(callback) {
    callback();
  },
  webServer: {
    register(options) {
      routes.set(options.path, options);
      return () => {};
    },
  },
});
const route = routes.get('/plugins/dsh-project-supervisor/config');
const modelsRoute = routes.get('/plugins/dsh-project-supervisor/models');

function fakeRequest({ method = 'GET', url = '/', headers = {}, body = null, remoteAddress = '127.0.0.1' } = {}) {
  const chunks = [];
  if (body != null) chunks.push(Buffer.from(body, 'utf8'));
  const req = {
    method,
    url,
    headers: { host: '127.0.0.1:3080', ...headers },
    socket: { remoteAddress },
    [Symbol.asyncIterator]: async function* iterator() {
      for (const chunk of chunks) yield chunk;
    },
  };
  return req;
}

function fakeResponse({ throwOnWrite = false } = {}) {
  const res = {
    status: 0,
    headers: {},
    body: '',
    headersSent: false,
    writeHead(status, headers) {
      if (throwOnWrite) throw new Error('socket closed');
      this.status = status;
      this.headers = headers || {};
      this.headersSent = true;
    },
    end(body) {
      this.body = body == null ? '' : String(body);
    },
  };
  return res;
}

async function request(req, resOptions) {
  const res = fakeResponse(resOptions);
  await route.handler(req, res);
  return res;
}

await check.async || (check.async = null);
async function checkAsync(name, fn) {
  try {
    await fn();
    pass += 1;
    if (VERBOSE) console.log('PASS  ' + name);
  } catch (error) {
    fail += 1;
    failures.push(name + ' :: ' + ((error && error.message) || error));
    console.log('FAIL  ' + name + ' :: ' + ((error && error.message) || error));
  }
}

await checkAsync('D1 config route registered as exact path', () => {
  assert(route && route.kind === 'exact', 'config route not registered');
  assert(route.path === '/plugins/dsh-project-supervisor/config', 'unexpected route path: ' + route.path);
});
await checkAsync('D1b models route registered as exact path', () => {
  assert(modelsRoute && modelsRoute.kind === 'exact', 'models route not registered');
  assert(modelsRoute.path === '/plugins/dsh-project-supervisor/models', 'unexpected route path: ' + modelsRoute.path);
});
await checkAsync('D1c models route returns an empty list when llm is unavailable', async () => {
  const res = fakeResponse();
  await modelsRoute.handler(fakeRequest({ url: '/plugins/dsh-project-supervisor/models' }), res);
  assert(res.status === 200, 'expected 200 got ' + res.status);
  const body = JSON.parse(res.body);
  assert(body.ok === true && Array.isArray(body.routes) && body.routes.length === 0, 'expected empty routes');
});
await checkAsync('D2 cross-origin request rejected 403', async () => {
  const res = await request(fakeRequest({ headers: { origin: 'http://evil.example' } }));
  assert(res.status === 403, 'expected 403 got ' + res.status);
});
await checkAsync('D3 non-loopback without Origin rejected 403', async () => {
  const res = await request(fakeRequest({ remoteAddress: '10.0.0.5' }));
  assert(res.status === 403, 'expected 403 got ' + res.status);
});
await checkAsync('D4 bad cwd rejected 400', async () => {
  const res = await request(fakeRequest({ url: '/?cwd=' + encodeURIComponent('relative/path') }));
  assert(res.status === 400, 'expected 400 got ' + res.status);
  assert(JSON.parse(res.body).error === 'invalid-cwd', 'wrong error: ' + res.body);
});
await checkAsync('D5 unsupported method 405', async () => {
  const res = await request(fakeRequest({ method: 'PUT' }));
  assert(res.status === 405, 'expected 405 got ' + res.status);
});
await checkAsync('D6 oversized body 413', async () => {
  const res = await request(fakeRequest({ method: 'POST', body: 'x'.repeat(9000) }));
  assert(res.status === 413, 'expected 413 got ' + res.status);
});
await checkAsync('D7 invalid json 400', async () => {
  const res = await request(fakeRequest({ method: 'POST', body: '{not json' }));
  assert(res.status === 400, 'expected 400 got ' + res.status);
});
await checkAsync('D8 closed response never throws', async () => {
  const res = await request(fakeRequest(), { throwOnWrite: true });
  assert(res.status === 0, 'responder must swallow closed-socket errors');
});
await checkAsync('D9 full config roundtrip inside home', async () => {
  const workspace = fs.mkdtempSync(path.join(os.homedir(), '.psup-compat-ws-'));
  tempRoots.push(workspace);
  try {
    const post = await request(
      fakeRequest({
        method: 'POST',
        body: JSON.stringify({ cwd: workspace, beginnerGuard: false }),
      }),
    );
    assert(post.status === 200, 'POST failed: ' + post.body);
    const parsed = JSON.parse(post.body);
    assert(parsed.ok === true, 'POST not ok: ' + post.body);
    assert(parsed.beginnerGuard === false, 'beginnerGuard not false: ' + post.body);
    assert(parsed.promptPolish === true && parsed.requirementInterview === true, 'other switches must stay on: ' + post.body);
    assert(parsed.dispatchMode === 'efficiency', 'dispatchMode must default to efficiency: ' + post.body);
    const file = path.join(workspace, '.dsh', 'supervisor.config.json');
    assert(fs.existsSync(file), 'config file not written at ' + file);
    const get = await request(fakeRequest({ url: '/?cwd=' + encodeURIComponent(workspace) }));
    assert(get.status === 200, 'GET failed: ' + get.body);
    assert(JSON.parse(get.body).beginnerGuard === false, 'GET did not persist false: ' + get.body);
    // corrupt config must fall back to defaults instead of failing forever
    fs.writeFileSync(file, '{broken', 'utf8');
    const corrupt = await request(fakeRequest({ url: '/?cwd=' + encodeURIComponent(workspace) }));
    assert(corrupt.status === 200, 'corrupt config should fall back, got ' + corrupt.status);
    assert(JSON.parse(corrupt.body).beginnerGuard === true, 'corrupt config should return defaults: ' + corrupt.body);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// E. Installers (Node-only, idempotent, reversible)
// ---------------------------------------------------------------------------
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

check('E1 install-plugin.mjs: install + idempotent + uninstall', () => {
  const profile = tempDir('psup-profile-');
  fs.writeFileSync(
    path.join(profile, 'package.json'),
    JSON.stringify({ name: 'dsh-profile-web', private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } }, dependencies: {} }, null, 2) + '\n',
    'utf8',
  );
  const installer = path.join(PLUGIN_DIR, 'install-plugin.mjs');
  const first = runNode([installer, '--profile', profile, '--plugin', PLUGIN_DIR, '--copy']);
  assert(first.status === 0, 'install failed: ' + (first.stderr || first.stdout));
  const manifest = readJson(path.join(profile, 'package.json'));
  assert(manifest.dependencies['dsh-project-supervisor'], 'dependency missing');
  assert(/^link:[A-Za-z]:\//.test(manifest.dependencies['dsh-project-supervisor']) || manifest.dependencies['dsh-project-supervisor'].startsWith('link:/'), 'link spec should be forward slashed: ' + manifest.dependencies['dsh-project-supervisor']);
  assert(manifest.dsh.profile.bundles.includes('dsh-project-supervisor'), 'bundle missing');
  assert(fs.existsSync(path.join(profile, 'node_modules', 'dsh-project-supervisor', 'client.js')), 'copy fallback did not copy');
  const backupsAfterFirst = fs.readdirSync(path.join(profile, '.backups')).length;
  const second = runNode([installer, '--profile', profile, '--plugin', PLUGIN_DIR, '--copy']);
  assert(second.status === 0, 'second install failed: ' + (second.stderr || second.stdout));
  assert(fs.readdirSync(path.join(profile, '.backups')).length === backupsAfterFirst, 'idempotent run must not create new backup');
  const uninstall = runNode([installer, '--profile', profile, '--uninstall']);
  assert(uninstall.status === 0, 'uninstall failed: ' + (uninstall.stderr || uninstall.stdout));
  const after = readJson(path.join(profile, 'package.json'));
  assert(!after.dependencies['dsh-project-supervisor'], 'dependency not removed');
  assert(!after.dsh.profile.bundles.includes('dsh-project-supervisor'), 'bundle not removed');
  assert(!fs.existsSync(path.join(profile, 'node_modules', 'dsh-project-supervisor')), 'node_modules entry not removed');
});

check('E2 install-plugin.mjs: dry-run changes nothing, bad profile exits 1', () => {
  const profile = tempDir('psup-profile2-');
  fs.writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ name: 'p', dsh: { profile: { bundles: [] } }, dependencies: {} }, null, 2) + '\n', 'utf8');
  const before = fs.readFileSync(path.join(profile, 'package.json'), 'utf8');
  const dry = runNode([path.join(PLUGIN_DIR, 'install-plugin.mjs'), '--profile', profile, '--plugin', PLUGIN_DIR, '--dry-run']);
  assert(dry.status === 0, 'dry-run failed: ' + (dry.stderr || dry.stdout));
  assert(fs.readFileSync(path.join(profile, 'package.json'), 'utf8') === before, 'dry-run mutated profile');
  const bad = runNode([path.join(PLUGIN_DIR, 'install-plugin.mjs'), '--profile', path.join(profile, 'missing'), '--plugin', PLUGIN_DIR]);
  assert(bad.status === 1, 'missing profile must exit 1');
});

check('E3 install-supervisor.mjs: install + research + global + fallback', () => {
  const kitInstaller = path.join(KIT_DIR, 'install-supervisor.mjs');
  assert(fs.existsSync(kitInstaller), 'install-supervisor.mjs missing');
  const workspace = tempDir('psup-ws-');
  const dshHome = tempDir('psup-dsh-');
  const install = runNode([kitInstaller, workspace, '--with-research', '--global-skill', '--dsh-home', dshHome], { cwd: KIT_DIR });
  assert(install.status === 0, 'kit install failed: ' + (install.stderr || install.stdout));
  for (const rel of ['AGENTS.md', '主管手册.md', 'patches/team-permissions/patch.py', 'research/DECISIONS.md', 'research/01-vibe-coding-supervisor.md', '.dsh/skills/project-supervisor/SKILL.md', '.dsh/skills/improving-prompts/SKILL.md', '.dsh/skills/improving-prompts/LICENSE']) {
    assert(fs.existsSync(path.join(workspace, rel)), 'missing installed file: ' + rel);
  }
  const references = fs.readdirSync(path.join(workspace, '.dsh', 'skills', 'improving-prompts', 'references')).filter((name) => name.endsWith('.md'));
  assert(references.length === 14, 'expected 14 references, got ' + references.length);
  const skill = fs.readFileSync(path.join(workspace, '.dsh', 'skills', 'project-supervisor', 'SKILL.md'), 'utf8');
  assert(skill.includes('workspace: "' + workspace.replace(/\\/g, '/') + '"'), 'project skill workspace metadata not rewritten');
  const globalSkill = fs.readFileSync(path.join(dshHome, 'skills', 'project-supervisor', 'SKILL.md'), 'utf8');
  assert(globalSkill.includes('workspace: "*"'), 'global skill workspace metadata must be *');
  // idempotent rerun
  const again = runNode([kitInstaller, workspace, '--with-research', '--dsh-home', dshHome], { cwd: KIT_DIR });
  assert(again.status === 0, 'rerun failed: ' + (again.stderr || again.stdout));
  // existing AGENTS.md must be preserved and a merge file generated
  const other = tempDir('psup-ws2-');
  fs.writeFileSync(path.join(other, 'AGENTS.md'), '# 我的项目规则\n\n自定义内容\n', 'utf8');
  const install2 = runNode([kitInstaller, other, '--dsh-home', dshHome], { cwd: KIT_DIR });
  assert(install2.status === 0, 'install2 failed: ' + (install2.stderr || install2.stdout));
  assert(fs.readFileSync(path.join(other, 'AGENTS.md'), 'utf8').includes('自定义内容'), 'existing AGENTS.md was overwritten');
  assert(fs.existsSync(path.join(other, 'AGENTS.supervisor.md')), 'AGENTS.supervisor.md missing for existing AGENTS.md');
  const dry = runNode([kitInstaller, workspace, '--dry-run'], { cwd: KIT_DIR });
  assert(dry.status === 0, 'kit dry-run failed: ' + (dry.stderr || dry.stdout));
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
cleanup();
console.log('');
if (VERBOSE) console.log('');
console.log('compat-check: PASS ' + pass + ' / FAIL ' + fail);
if (fail > 0) {
  console.log('失败项：');
  for (const line of failures) console.log('  - ' + line);
  process.exit(1);
}
console.log('结果: 通过（Windows 路径逻辑模拟 + 崩溃安全 + 双平台安装脚本）');
