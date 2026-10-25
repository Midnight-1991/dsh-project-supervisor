#!/usr/bin/env node
/**
 * Offline smoke test for the dsh-project-supervisor client bundle.
 *
 * No DSH host needed: run the bundle inside a node:vm sandbox with a fake
 * window.__ModuleLoader__, then ask the registered factory for its plugin
 * object and apply it to a fake client context. Asserts the registration
 * surface that the DSH client plugin host relies on.
 *
 * Usage: node scripts/smoke.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');

let definition;
const fakeWindow = {
  __ModuleLoader__: {
    load(def) {
      definition = def;
    },
  },
};

const sandbox = {
  window: fakeWindow,
  console,
  setTimeout,
  clearTimeout,
  AbortController,
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'client.js' });

assert.ok(definition, 'client bundle must call window.__ModuleLoader__.load');
assert.equal(definition.id, 'dsh-project-supervisor');
assert.equal(typeof definition.factory, 'function');

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
};
const plugin = definition.factory((specifier) => {
  if (specifier === 'react') return fakeReact;
  throw new Error('unexpected require: ' + specifier);
});

assert.ok(Array.isArray(plugin.inject), 'plugin.inject must be an array');
for (const service of ['slots', 'locale', 'remote', 'remote.workspaceFiles']) {
  assert.ok(plugin.inject.includes(service), 'plugin must inject ' + service);
}
assert.equal(typeof plugin.apply, 'function', 'plugin.apply must be a function');

const effects = [];
const locales = [];
const registrations = [];
const fakeCtx = {
  effect(fn, label) {
    effects.push(label);
    const dispose = fn();
    return typeof dispose === 'function' ? dispose : () => {};
  },
  locale: {
    register(namespace, dictionary) {
      locales.push({ namespace, dictionary });
      return () => {};
    },
    bind(namespace) {
      return (key) => key;
    },
  },
  slots: {
    inject(name, callback) {
      callback();
      return () => {};
    },
    register(options, component) {
      registrations.push({ options, component });
      return { dispose() {} };
    },
  },
  remote: {
    workspaceFiles: {
      stat: async () => ({ ok: true, value: {} }),
    },
  },
};

plugin.apply(fakeCtx);

assert.equal(locales.length, 1, 'locale dictionary must be registered exactly once');
const { namespace, dictionary } = locales[0];
assert.equal(namespace, 'projectSupervisor');
assert.equal(typeof dictionary.zh, 'object');
assert.equal(typeof dictionary.en, 'object');
for (const key of ['nav', 'title', 'subtitle', 'healthTitle', 'flowTitle', 'beginnerTitle', 'actionsTitle']) {
  assert.equal(typeof dictionary.zh[key], 'string', 'zh copy missing: ' + key);
  assert.equal(typeof dictionary.en[key], 'string', 'en copy missing: ' + key);
}
assert.deepEqual(Object.keys(dictionary.zh).sort(), Object.keys(dictionary.en).sort(), 'zh/en copy keys must match');

const main = registrations.find((item) => item.options.name === 'main');
assert.ok(main, 'main slot must be registered');
assert.equal(main.options.key, 'supervisor');
assert.equal(main.options.locale, 'projectSupervisor');
assert.equal(typeof main.component, 'function');
const face = main.options.inject();
assert.equal(typeof face.probe, 'function');
const probeResult = await face.probe('session-1', '.git');
assert.equal(probeResult.ok, true);

const nav = registrations.find((item) => item.options.name === 'sidebar.panellist');
assert.ok(nav, 'sidebar entry must be registered');
assert.equal(nav.options.id, 'supervisor');
assert.equal(nav.options.order, 30);
assert.equal(typeof nav.options.label, 'function');
assert.equal(typeof nav.component, 'function');

assert.ok(effects.includes('project-supervisor: styles'), 'style effect must be installed');
assert.ok(effects.includes('project-supervisor: copy'), 'copy effect must be installed');

console.log('PASS dsh-project-supervisor smoke test');
console.log('  - bundle id:', definition.id);
console.log('  - inject:', plugin.inject.join(', '));
console.log('  - locale:', namespace, '(' + Object.keys(dictionary.zh).length + ' keys x2)');
console.log('  - slots:', registrations.map((item) => item.options.name + ':' + (item.options.key || item.options.id)).join(', '));
