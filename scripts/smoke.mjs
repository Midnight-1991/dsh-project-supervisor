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
const fakeLocalStorage = {
  store: new Map(),
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  },
  setItem(key, value) {
    this.store.set(key, String(value));
  },
  removeItem(key) {
    this.store.delete(key);
  },
};
const fakeWindow = {
  __ModuleLoader__: {
    load(def) {
      definition = def;
    },
  },
  localStorage: fakeLocalStorage,
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
const AUTO_WORK_KEYS = [
  'autoWorkTitle',
  'autoWorkHint',
  'autoWorkOn',
  'autoWorkOff',
  'autoWorkAria',
  'autoWorkQueue',
  'autoWorkBlocked',
  'autoWorkQuestions',
  'autoWorkFileHint',
  'autoWorkQueueEmpty',
  'autoWorkUnavailable',
  'autoWorkHostPending',
  'autoWorkSaved',
  'autoWorkLocalSaved',
];
for (const key of AUTO_WORK_KEYS) {
  assert.equal(typeof dictionary.zh[key], 'string', 'zh auto-work copy missing: ' + key);
  assert.equal(typeof dictionary.en[key], 'string', 'en auto-work copy missing: ' + key);
}
assert.ok(
  dictionary.zh.autoWorkTitle.includes('自动工作'),
  'zh auto-work title must say 自动工作',
);
const EFFICIENCY_CARD_KEYS = [
  'teamCardTitle',
  'teamCardHint',
  'teamMembers',
  'teamTasks',
  'teamPending',
  'teamEmpty',
  'teamDegraded',
];
for (const key of EFFICIENCY_CARD_KEYS) {
  assert.equal(typeof dictionary.zh[key], 'string', 'zh efficiency card copy missing: ' + key);
  assert.equal(typeof dictionary.en[key], 'string', 'en efficiency card copy missing: ' + key);
}
// T20 工作开关清单：5 行开关的名称 + 单行 hint + 行尾「说明」。
const SWITCH_BOARD_KEYS = [
  'switchBoardTitle',
  'switchBoardHint',
  'beginnerTitle',
  'beginnerShort',
  'autoWorkTitle',
  'autoWorkShort',
  'collabTitle',
  'collabShort',
  'polishTitle',
  'polishShort',
  'interviewTitle',
  'interviewShort',
  'quickHelpShow',
  'quickHelpHide',
];
for (const key of SWITCH_BOARD_KEYS) {
  assert.equal(typeof dictionary.zh[key], 'string', 'zh switch-board copy missing: ' + key);
  assert.equal(typeof dictionary.en[key], 'string', 'en switch-board copy missing: ' + key);
}
// T27 自动工作次级开关「更经济的自动化」：名称 / 短说明 / 完整峰谷口径 / aria / 保存文案 / 前置提示。
const ECO_AUTO_WORK_KEYS = [
  'ecoAutoWorkTitle',
  'ecoAutoWorkShort',
  'ecoAutoWorkHint',
  'ecoAutoWorkAria',
  'ecoAutoWorkSaved',
  'ecoAutoWorkLocalSaved',
  'ecoAutoWorkNeedsAutoWork',
];
for (const key of ECO_AUTO_WORK_KEYS) {
  assert.equal(typeof dictionary.zh[key], 'string', 'zh economical auto-work copy missing: ' + key);
  assert.equal(typeof dictionary.en[key], 'string', 'en economical auto-work copy missing: ' + key);
}
assert.ok(dictionary.zh.ecoAutoWorkTitle.includes('更经济'), 'zh economical auto-work title must say 更经济');
assert.ok(dictionary.zh.ecoAutoWorkHint.includes('09:00–12:00'), 'zh economical hint must spell out the peak window');
assert.ok(dictionary.zh.ecoAutoWorkHint.includes('周末'), 'zh economical hint must mention weekends/holidays as off-peak');
assert.ok(dictionary.zh.ecoAutoWorkNeedsAutoWork.includes('自动工作'), 'zh pre-req hint must point at 自动工作');
const QUICK_ACTION_KEYS = [
  'copyHandoff',
  'copyHandoffDone',
  'copyTeamSnapshot',
  'copyTeamSnapshotDone',
  'copyDoctor',
  'copyDoctorDone',
  'copyVerify',
  'copyVerifyDone',
  'quickHandoffWhy',
  'quickTeamSnapshotWhy',
  'quickDoctorWhy',
  'quickVerifyWhy',
  'handoffTemplate',
  'doctorCmd',
  'verifyCmd',
];
for (const key of QUICK_ACTION_KEYS) {
  assert.equal(typeof dictionary.zh[key], 'string', 'zh quick-action copy missing: ' + key);
  assert.equal(typeof dictionary.en[key], 'string', 'en quick-action copy missing: ' + key);
}
assert.ok(dictionary.zh.handoffTemplate.includes('{cwd}'), 'handoff template must keep the {cwd} placeholder');
assert.ok(dictionary.zh.copyTeamSnapshot.includes('团队'), 'team snapshot action label must mention the team');
assert.ok(dictionary.zh.copyDoctor.includes('体检'), 'doctor action label must mention the health check');

// T17 information architecture: four named zones + slim project bar (copy keys).
const ZONE_KEYS = [
  'zoneWorkTitle',
  'zoneWorkHint',
  'zoneRuntimeTitle',
  'zoneRuntimeHint',
  'zoneChecksTitle',
  'currentProject',
];
for (const key of ZONE_KEYS) {
  assert.equal(typeof dictionary.zh[key], 'string', 'zh zone copy missing: ' + key);
  assert.equal(typeof dictionary.en[key], 'string', 'en zone copy missing: ' + key);
}
// T22 分区级折叠：默认收起的只读/说明分区摘要 + 折叠控件文案。
const ZONE_COLLAPSE_KEYS = [
  'zoneWorkSummary',
  'zoneRuntimeSummary',
  'zoneRuntimeDegraded',
  'zoneChecksSummary',
  'zoneActionsSummary',
  'zoneGuideSummary',
  'zoneExpand',
  'zoneCollapse',
];
for (const key of ZONE_COLLAPSE_KEYS) {
  assert.equal(typeof dictionary.zh[key], 'string', 'zh zone-collapse copy missing: ' + key);
  assert.equal(typeof dictionary.en[key], 'string', 'en zone-collapse copy missing: ' + key);
}
assert.ok(dictionary.zh.zoneRuntimeSummary.includes('{members}') && dictionary.zh.zoneRuntimeSummary.includes('{pending}'), 'runtime summary must keep count placeholders');
assert.ok(dictionary.zh.zoneChecksSummary.includes('{ready}'), 'checks summary must keep the ready count placeholder');
assert.equal(Object.keys(dictionary.zh).length, 214, 'locale dictionary must keep the T27 key count (214 per language)');

// Regression guard (B1): a duplicate key inside one dictionary literal silently
// overwrites earlier copy (teamHint/healthHint were reused by the new efficiency
// cards, so the cards rendered the legacy footer/baseline hint instead). Parse
// the two literal blocks from the source and assert every key is defined once.
function dictionaryKeys(label, pattern) {
  const match = pattern.exec(source);
  assert.ok(match, 'missing dictionary literal: ' + label);
  const counts = new Map();
  for (const line of match[1].split('\n')) {
    const keyMatch = /^\s{8}([A-Za-z_$][\w$]*):/.exec(line);
    if (keyMatch) counts.set(keyMatch[1], (counts.get(keyMatch[1]) || 0) + 1);
  }
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
  assert.deepEqual(duplicates, [], label + ' must not define duplicate keys: ' + duplicates.join(', '));
  return counts;
}
const zhSourceKeys = dictionaryKeys('COPY_ZH', /const COPY_ZH = \{([\s\S]*?)\n      \};/);
const enSourceKeys = dictionaryKeys('COPY_EN', /const COPY_EN = \{([\s\S]*?)\n      \};/);
assert.deepEqual(
  [...zhSourceKeys.keys()].sort(),
  [...enSourceKeys.keys()].sort(),
  'zh/en copy keys must match in the source scan',
);
assert.ok(zhSourceKeys.has('teamCardHint'), 'team card must use a unique hint key');
assert.ok(!zhSourceKeys.has('healthCardHint') && !zhSourceKeys.has('usageCardTitle'), 'off-topic cards must be removed from the copy');
assert.ok(
  !zhSourceKeys.has('projectHint') && !zhSourceKeys.has('teamHint'),
  'copy replaced by the top project bar / zone hints must be deleted',
);
assert.ok(zhSourceKeys.has('healthHint'), 'baseline-check hint key must stay defined for the checks zone');
assert.ok(!zhSourceKeys.has('teamBlockedBy'), 'dead copy key teamBlockedBy must be deleted');
for (const deadKey of ['teamRefresh', 'teamNoPending', 'collapseShow', 'collapseHide', 'copyFailed']) {
  assert.ok(!zhSourceKeys.has(deadKey), 'dead copy key must be deleted: ' + deadKey);
}
assert.ok(
  zhSourceKeys.has('switchBoardTitle') && zhSourceKeys.has('beginnerShort') && zhSourceKeys.has('copyFallbackTitle'),
  'T20 switch-board / manual-copy fallback copy must be defined',
);
assert.ok(
  dictionary.zh.teamCardHint.includes('只读') && dictionary.zh.teamCardHint.includes('会话日志'),
  'team card hint must be the team-board copy: ' + dictionary.zh.teamCardHint,
);
assert.ok(
  dictionary.zh.healthHint.includes('只看文件是否存在'),
  'baseline-check hint must stay the checks-zone hint',
);
assert.ok(
  dictionary.zh.zoneRuntimeHint.includes('并行对话框') && dictionary.zh.zoneRuntimeHint.includes('智能体团队'),
  'runtime zone hint must point at the Agent Team entry in the conversation header',
);
assert.ok(
  !dictionary.zh.zoneWorkHint.includes('.dsh/supervisor.config.json') &&
    dictionary.zh.zoneWorkHint.includes('只影响之后的任务'),
  'work-modes zone hint must not repeat the config path (kept once in the switch-board hint)',
);
assert.ok(
  dictionary.zh.switchBoardHint.includes('.dsh/supervisor.config.json'),
  'switch-board hint must be the single place that names the config file',
);
assert.ok(
  !dictionary.zh.autoWorkTitle.includes('（') && !dictionary.zh.collabTitle.includes('（'),
  'T20: default-state parentheses must move out of card titles into the hints',
);
assert.ok(!zhSourceKeys.has('projectHint') && dictionary.zh.currentProject === '当前项目', 'project bar must use the new 当前项目 label');

// Negative guard: the plugin must not reference the external compression proxy
// anywhere in its copy. Terms are assembled from fragments so this guard itself
// does not reintroduce the literal strings.
const BANNED_COPY_RE = new RegExp(
  [
    String.fromCharCode(98, 105, 108, 108, 105),
    String.fromCharCode(98, 105, 108, 108, 105, 111, 110, 45, 99, 111, 110, 116, 101, 120, 116),
    String.fromCharCode(21387, 32553, 20195, 29702),
    String.fromCharCode(30452, 36830),
    String.fromCharCode(65, 67, 80),
    String.fromCharCode(20195, 29702, 23454, 20363),
  ].join('|'),
  'i',
);
// Self-check: the guard must actually match the forbidden words.
assert.ok(BANNED_COPY_RE.test(String.fromCharCode(98, 105, 108, 108, 105)), 'copy guard must match the forbidden proxy name');
assert.ok(BANNED_COPY_RE.test(String.fromCharCode(21387, 32553, 20195, 29702)), 'copy guard must match the forbidden Chinese term');
assert.ok(BANNED_COPY_RE.test(String.fromCharCode(65, 67, 80)), 'copy guard must match the removed proxy stack acronym');
assert.ok(BANNED_COPY_RE.test(String.fromCharCode(20195, 29702, 23454, 20363)), 'copy guard must match the forbidden proxy-instance term');
for (const lang of ['zh', 'en']) {
  for (const [key, value] of Object.entries(dictionary[lang])) {
    assert.ok(!BANNED_COPY_RE.test(key), lang + ' copy key must not reference the external proxy: ' + key);
    assert.ok(
      !BANNED_COPY_RE.test(String(value)),
      lang + ' copy value must not reference the external proxy: ' + key,
    );
  }
}
assert.ok(
  !BANNED_COPY_RE.test(source),
  'client source must not reference the external compression proxy anywhere',
);
assert.ok(
  !source.includes('/plugins/dsh-project-supervisor/runtime'),
  'client must not read the removed runtime route',
);
assert.ok(
  !source.includes('psup-health-card') && !source.includes('psup-usage-card'),
  'client must not render the removed health/usage cards',
);

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

// The main panel renders an auto-work card whose switch is off by default
// (only the i18n dictionary + registration surface is checked elsewhere; this
// walks the shallow element tree the fake React factory returns).
function walkTree(node, visit) {
  if (Array.isArray(node)) {
    for (const item of node) walkTree(item, visit);
    return;
  }
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const child of node.children || []) walkTree(child, visit);
}
function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    let out = '';
    for (const item of node) out += textOf(item);
    return out;
  }
  if (typeof node !== 'object') return '';
  let out = '';
  for (const child of node.children || []) out += textOf(child);
  return out;
}
const page = main.component({});
assert.equal(page.props.className, 'psup-page', 'panel root must be .psup-page');
const inner = (page.children || []).find(
  (child) => child && child.props && child.props.className === 'psup-inner',
);
assert.ok(inner, 'panel root must contain .psup-inner');

// Walk the shallow element tree and collect every structural contract.
const zones = [];
const switches = [];
const cards = [];
const modeOptions = [];
const actionNodes = [];
const primaryButtons = [];
const disclosures = [];
const helps = [];
const steps = [];
const scoreNums = [];
const zoneTitles = [];
const zoneToggles = [];
const zoneSummaries = [];
const zoneBodies = [];
const projectBars = [];
const footers = [];
function classList(node) {
  const value = node && node.props ? node.props.className : '';
  return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
}
walkTree(page, (node) => {
  const props = (node && node.props) || {};
  const classes = classList(node);
  if (props['data-zone']) zones.push(node);
  if (props.role === 'switch' && props['data-field']) switches.push(node);
  if (classes.includes('psup-card')) cards.push(node);
  if (classes.includes('psup-mode-option')) modeOptions.push(node);
  if (classes.includes('psup-action-item')) actionNodes.push(node);
  if (classes.includes('psup-btn-primary')) primaryButtons.push(node);
  if (classes.includes('psup-disclosure')) disclosures.push(node);
  if (classes.includes('psup-help')) helps.push(node);
  if (classes.includes('psup-step')) steps.push(node);
  if (classes.includes('psup-score-num')) scoreNums.push(node);
  if (classes.includes('psup-zone-title')) zoneTitles.push(node);
  if (classes.includes('psup-zone-toggle')) zoneToggles.push(node);
  if (classes.includes('psup-zone-summary')) zoneSummaries.push(node);
  if (classes.includes('psup-zone-body')) zoneBodies.push(node);
  if (classes.includes('psup-project-bar')) projectBars.push(node);
  if (classes.includes('psup-footer')) footers.push(node);
});
function nodesIn(root, predicate) {
  const found = [];
  walkTree(root, (node) => {
    if (predicate(node)) found.push(node);
  });
  return found;
}

// Header + slim project bar at the top.
assert.equal(nodesIn(page, (node) => classList(node).includes('psup-head')).length, 1, 'panel header must render');
assert.ok(textOf(page).includes('项目主管'), 'panel title must render');
assert.equal(projectBars.length, 1, 'exactly one slim project bar');
const projectBarText = textOf(projectBars[0]);
assert.ok(projectBarText.includes('当前项目'), 'project bar must render the 当前项目 label');
assert.ok(projectBarText.includes('还没有会话记录'), 'project bar must degrade to the no-project hint');
assert.equal(projectBars[0].props.role, 'group', 'project bar must expose role=group');

// Four zones with the expected order and titles.
assert.deepEqual(
  zones.map((node) => node.props['data-zone']),
  ['work-modes', 'runtime', 'checks', 'actions'],
  'panel must render the four zones in order',
);
assert.deepEqual(
  zoneTitles.map(textOf),
  ['工作方式', '运行状态', '规则自检', '快捷动作', '主管怎么工作'],
  'zone titles must render the four zones + the guide title at the same visual level',
);
assert.deepEqual(
  zones.map((node) => node.props.className),
  ['psup-zone', 'psup-zone is-collapsed', 'psup-zone is-collapsed', 'psup-zone'],
  'zone containers must keep the .psup-zone class (collapsed zones add is-collapsed)',
);
const workZone = zones[0];
const runtimeZone = zones[1];
const checksZone = zones[2];
const actionsZone = zones[3];

// 工作方式: two full-width cards (mode + switch board), five switch rows.
const workCards = nodesIn(workZone, (node) => classList(node).includes('psup-card'));
assert.equal(workCards.length, 2, 'the work-modes zone must contain exactly two full-width cards');
// T20：模式卡后是全宽「工作开关」清单卡，不再两列成对等高（消除状态相关的卡内空洞）。
assert.deepEqual(
  workCards.map((node) => classList(node).filter((name) => name !== 'psup-card' && name.endsWith('-card'))[0] || ''),
  ['psup-mode-card', 'psup-switch-board-card'],
  'T20: work-modes must render the mode card + the switch-board card',
);
const switchRows = nodesIn(workZone, (node) => classList(node).includes('psup-switch-row'));
assert.deepEqual(
  switchRows.map((node) => node.props['data-field']),
  ['beginnerGuard', 'autoWork', 'modelCollaboration', 'promptPolish', 'requirementInterview'],
  'T20: the switch board must render five rows in the original reading order',
);
assert.deepEqual(
  switches.map((node) => node.props['data-field']),
  ['beginnerGuard', 'autoWork', 'economicalAutoWork', 'modelCollaboration', 'promptPolish', 'requirementInterview'],
  'the five row switches plus the nested economical-auto-work switch must render once each',
);
assert.deepEqual(
  switchRows.map((node) => textOf(nodesIn(node, (child) => classList(child).includes('psup-switch-row-name'))[0])),
  ['零基础保护', '自动工作', '模型协作', '提示词润色', '新项目需求追问'],
  'every switch row must render its own name',
);
for (const row of switchRows) {
  const hint = nodesIn(row, (node) => classList(node).includes('psup-switch-row-hint'))[0];
  assert.ok(hint && textOf(hint).length > 0, 'every switch row must render a one-line hint');
}
const rowDisclosures = nodesIn(workZone, (node) => classList(node).includes('psup-row-disclosure'));
assert.equal(rowDisclosures.length, 5, 'every switch row keeps a 说明 disclosure button');
assert.deepEqual(
  rowDisclosures.map((node) => node.props['aria-expanded']),
  ['false', 'false', 'false', 'false', 'false'],
  'row guides must start collapsed',
);
assert.equal(nodesIn(workZone, (node) => classList(node).includes('psup-row-body')).length, 0, 'no row body may render by default');
assert.equal(nodesIn(page, (node) => classList(node).includes('psup-copy-fallback')).length, 0, 'manual-copy layer must stay hidden until a copy fails');
const autoWorkSwitch = switches.find((node) => node.props['data-field'] === 'autoWork');
assert.equal(autoWorkSwitch.type, 'button', 'autoWork switch must be a button element');
assert.equal(autoWorkSwitch.props['aria-checked'], 'false', 'autoWork must default to off (aria-checked=false)');
// T27: 自动工作行内必须常驻缩进次级行；autoWork 关闭时次级开关置灰不可点、但保留已存值。
const autoWorkRow = switchRows.find((node) => node.props['data-field'] === 'autoWork');
const ecoSubrow = nodesIn(autoWorkRow, (node) => classList(node).includes('psup-switch-subrow'))[0];
assert.ok(ecoSubrow, 'autoWork row must render the nested economical-auto-work sub-row');
assert.equal(ecoSubrow.props['data-subfield'], 'economicalAutoWork', 'sub-row must expose data-subfield for e2e/manual');
assert.ok(classList(ecoSubrow).includes('is-disabled'), 'sub-row must look disabled while autoWork is off');
const ecoName = nodesIn(ecoSubrow, (node) => classList(node).includes('psup-switch-subrow-name'))[0];
assert.equal(textOf(ecoName), '更经济的自动化', 'sub-row must render its own name');
const ecoHint = nodesIn(ecoSubrow, (node) => classList(node).includes('psup-switch-subrow-hint'))[0];
assert.ok(textOf(ecoHint).includes('请先开启'), 'disabled sub-row hint must explain the autoWork pre-requisite');
const ecoSwitch = switches.find((node) => node.props['data-field'] === 'economicalAutoWork');
assert.ok(ecoSwitch, 'economical auto-work switch must render inside the autoWork row');
assert.equal(ecoSwitch.type, 'button', 'economical auto-work switch must be a button element');
assert.equal(ecoSwitch.props['aria-checked'], 'false', 'economical auto-work must default to off');
assert.equal(ecoSwitch.props.disabled, true, 'economical auto-work switch must be disabled while autoWork is off');
assert.ok(classList(ecoSwitch).includes('psup-switch-small'), 'economical auto-work must use the small switch style');
assert.ok(String(ecoSwitch.props.title || '').includes('09:00–12:00'), 'small switch title must carry the full peak/off-peak policy');
assert.equal(modeOptions.length, 2, 'dispatch mode must render two radio options');
assert.deepEqual(modeOptions.map((node) => node.props.role), ['radio', 'radio']);
assert.deepEqual(modeOptions.map((node) => node.props['aria-checked']), ['true', 'false']);
const autoWorkStatus = nodesIn(page, (node) => classList(node).includes('psup-autowork-status'));
assert.equal(autoWorkStatus.length, 0, 'queue status bar must stay hidden while autoWork is off');

// 运行状态: one full-width team card.
assert.equal(
  nodesIn(runtimeZone, (node) => classList(node).includes('psup-card')).length,
  1,
  'runtime zone must be a single full-width card',
);
const teamCards = cards.filter((node) => classList(node).includes('psup-team-card'));
assert.equal(teamCards.length, 1, 'the team card must render in the runtime zone');
const teamCardText = textOf(teamCards[0]);
assert.ok(teamCardText.includes('团队与任务'), 'team card title must render');
assert.ok(teamCardText.includes('从 lead 会话日志解析'), 'team card must render the team-board hint');
assert.ok(!teamCardText.includes('并行对话框'), 'team card must not render the runtime-zone hint');

// 规则自检: single wide card with the score + progress bar; checks arrive later.
assert.equal(
  nodesIn(checksZone, (node) => classList(node).includes('psup-card')).length,
  1,
  'checks zone must be a single full-width card',
);
assert.equal(scoreNums.length, 1, 'self-check score must render');
assert.equal(textOf(scoreNums[0]), '0 / 9', 'self-check score must render ok/total before the host answers');
assert.equal(nodesIn(checksZone, (node) => classList(node).includes('psup-bar-fill')).length, 1);

// 快捷动作: seven actions, exactly one primary, disclosures collapsed by default.
assert.equal(actionNodes.length, 7, 'quick actions must keep all seven actions');
assert.equal(primaryButtons.length, 1, 'exactly one quick action must be primary');
assert.equal(nodesIn(actionsZone, (node) => node === primaryButtons[0]).length, 1, 'the primary action must live in the actions zone');
const actionDisclosures = nodesIn(actionsZone, (node) => classList(node).includes('psup-disclosure'));
assert.equal(actionDisclosures.length, 7, 'every quick action keeps its disclosure button');
assert.deepEqual(
  actionDisclosures.map((node) => node.props['aria-expanded']),
  ['false', 'false', 'false', 'false', 'false', 'false', 'false'],
  'quick-action help must start collapsed',
);
assert.equal(disclosures.length, 12, 'panel must render 5 row guides + 7 action disclosures');
assert.equal(helps.length, 0, 'no quick-action help may be expanded by default');

// 轻量使用说明: zone-level title + four compact steps + a two-line footer.
const guideSections = nodesIn(page, (node) => classList(node).includes('psup-guide'));
assert.equal(guideSections.length, 1, 'guide must render as a zone-level section');
assert.ok(classList(guideSections[0]).includes('psup-zone'), 'guide section must reuse the zone container styling');
assert.equal(steps.length, 4, 'the guide must keep four compact steps');
assert.equal(footers.length, 1, 'exactly one panel footer');
const footerSpans = nodesIn(footers[0], (node) => node.type === 'span');
assert.equal(footerSpans.length, 2, 'the footer must be reduced to two lines');
const footerText = textOf(footers[0]);
assert.ok(footerText.includes('AGENTS.md') && footerText.includes('只读'), 'footer must keep the rules carrier + read-only hints');

// T22 分区级折叠：4 个数据分区 + 使用说明各一个折叠按钮；默认只展开工作方式与快捷动作。
assert.equal(zoneToggles.length, 5, 'T22: four data zones + the guide must each render a zone toggle');
assert.deepEqual(
  zoneToggles.map((node) => node.props['aria-expanded']),
  ['true', 'false', 'false', 'true', 'false'],
  'T22: work-modes/actions expanded by default; runtime/checks/guide collapsed',
);
assert.deepEqual(
  zoneToggles.map((node) => node.props['aria-controls']),
  ['psup-zone-body-work-modes', 'psup-zone-body-runtime', 'psup-zone-body-checks', 'psup-zone-body-actions', 'psup-zone-body-guide'],
  'T22: each toggle must point at its zone body via aria-controls',
);
assert.deepEqual(
  zoneBodies.map((node) => node.props['id']),
  ['psup-zone-body-work-modes', 'psup-zone-body-runtime', 'psup-zone-body-checks', 'psup-zone-body-actions', 'psup-zone-body-guide'],
  'T22: every zone must render an addressable body wrapper',
);
assert.deepEqual(
  zoneBodies.map((node) => node.props.hidden === true),
  [false, true, true, false, true],
  'T22: only collapsed zone bodies may be hidden',
);
assert.deepEqual(
  zoneSummaries.map((node) => textOf(node)),
  ['团队看板暂不可用', '0 / 9 项就绪', '主管四步流程'],
  'T22: collapsed zones must show one-line summaries (runtime degrades before host data arrives)',
);
assert.equal(zoneToggles[0].props.title !== undefined, true, 'T22: zone toggle must expose a tooltip title');

// Global copy / layout contracts.
const renderedText = textOf(page);
for (const label of ['工作方式', '工作开关', '运行状态', '规则自检', '快捷动作', '当前项目', '团队与任务', '主管怎么工作', '复制开工口令']) {
  assert.ok(renderedText.includes(label), 'panel must render: ' + label);
}
assert.ok(renderedText.includes('零基础保护') && renderedText.includes('说明'), 'switch rows must render names + row disclosures');
assert.ok(!renderedText.includes('（默认关）') && !renderedText.includes('（无人值守）'), 'default-state parentheses must be removed from titles');
assert.ok(!renderedText.includes('刷新团队状态'), 'duplicated team-card refresh button must be removed');
for (const label of ['复制交接单模板', '复制团队状态快照', '复制环境体检口令', '复制一键验收口令']) {
  assert.ok(renderedText.includes(label), 'quick action must render: ' + label);
}
assert.ok(!renderedText.includes('压缩与上下文健康'), 'compression/context card must be removed');
assert.ok(!renderedText.includes('成本与用量'), 'cost/usage card must be removed');
assert.ok(!renderedText.includes('NaN'), 'degraded cards must not render NaN before the host data arrives');
assert.ok(!BANNED_COPY_RE.test(renderedText), 'rendered panel must not reference the external proxy');

// Source-level wiring contracts kept from the previous rounds.
assert.ok(
  source.includes("window.localStorage.setItem('psup.autoWork:' + cwd"),
  'autoWork save fallback must use localStorage key psup.autoWork:<cwd>',
);
assert.ok(
  source.includes("'/plugins/dsh-project-supervisor/auto-work?cwd='"),
  'client must read the auto-work queue from the read-only host route',
);
assert.ok(
  source.includes("'/plugins/dsh-project-supervisor/' + route + query"),
  'client must read the read-only team-board host route',
);
assert.ok(source.includes("'data-zone'"), 'the client source must render zone containers with data-zone');
assert.ok(source.includes('psup-project-bar'), 'the client source must render the slim project bar');
assert.ok(source.includes('psup-actions-grid'), 'the client source must render the compact actions grid');
assert.ok(!source.includes('psup-mode-current'), 'the old mode pill must be removed');
assert.ok(!source.includes('psup-zone-grid'), 'T20: the paired work-modes grid must be removed');
assert.ok(!source.includes('align-items: stretch'), 'T20: no stretch pairing may remain');
assert.ok(source.includes('.psup-work-stack'), 'T20: work-modes cards must stack full width');
assert.ok(source.includes('psup-switch-row'), 'T20: five switch rows must be rendered');
assert.ok(source.includes('psup-row-disclosure'), 'T20: row guides must use the disclosure style');
assert.ok(source.includes('psup-copy-fallback'), 'T20: copy failure must fall back to a selectable textarea layer');
assert.ok(!source.includes("'copyFailed'"), 'T20: the dead-end copy-failed toast copy must be gone');
assert.ok(
  source.includes('container-type: inline-size') && source.includes('@container psup'),
  'T20: layout breakpoints must follow the container width, not the viewport',
);
assert.ok(source.includes('shortenPath(project.cwd)'), 'T20: project path must keep the tail (project name) visible');
assert.ok(!source.includes("t('teamRefresh')"), 'T20: duplicated team-card refresh button must be removed');
assert.ok(source.includes('.psup-project-bar .psup-btn-ghost'), 'F5: project-bar refresh must render as a small ghost button');
assert.ok(source.includes('economicalAutoWork: next'), 'T27: economical switch must POST economicalAutoWork');
assert.ok(source.includes("'psup.economicalAutoWork:' + cwd"), 'T27: economical switch must fall back to psup.economicalAutoWork:<cwd>');
assert.ok(source.includes('server.economicalAutoWork === true'), 'T27: economical switch must read the host config');
assert.ok(source.includes('disabled: !ecoToggleable'), 'T27: economical switch must stay disabled until autoWork is on');

// T20 展开态：给 localStorage 预置「零基础保护已展开」，再渲染一次验证行内展开体与持久化键。
fakeWindow.localStorage.setItem('psup.collapsed.beginnerGuard', '0');
const expandedPage = main.component({});
const expandedRows = nodesIn(expandedPage, (node) => classList(node).includes('psup-switch-row'));
assert.equal(expandedRows.length, 5, 'expanded render must keep five switch rows');
const expandedBodies = nodesIn(expandedPage, (node) => classList(node).includes('psup-row-body'));
assert.equal(expandedBodies.length, 1, 'only the saved-open row may render its body');
assert.equal(expandedBodies[0].props.id, 'psup-row-body-beginnerGuard', 'expanded row body must keep its id');
assert.equal(nodesIn(expandedBodies[0], (node) => node.type === 'li').length, 6, 'beginner guide must render its six steps when expanded');
assert.ok(
  nodesIn(expandedPage, (node) => classList(node).includes('psup-row-disclosure')).some((node) => node.props['aria-expanded'] === 'true'),
  'the saved-open row must report aria-expanded=true',
);
assert.ok(source.includes("'psup.collapsed.' + field"), 'row guide state must persist under psup.collapsed.<field>');
assert.ok(source.includes("'psup.zone.' + key"), 'T22: zone collapse state must persist under psup.zone.<zone>');
fakeWindow.localStorage.removeItem('psup.collapsed.beginnerGuard');

// T22 展开态：localStorage 预置三个分区为展开，再渲染验证展开体与内容存在。
fakeWindow.localStorage.setItem('psup.zone.runtime', '0');
fakeWindow.localStorage.setItem('psup.zone.checks', '0');
fakeWindow.localStorage.setItem('psup.zone.guide', '0');
const zonesOpenPage = main.component({});
const zonesOpenToggles = nodesIn(zonesOpenPage, (node) => classList(node).includes('psup-zone-toggle'));
assert.deepEqual(
  zonesOpenToggles.map((node) => node.props['aria-expanded']),
  ['true', 'true', 'true', 'true', 'true'],
  'T22: stored overrides must expand every zone after re-render',
);
const zonesOpenBodies = nodesIn(zonesOpenPage, (node) => classList(node).includes('psup-zone-body'));
assert.equal(zonesOpenBodies.filter((node) => node.props.hidden === true).length, 0, 'T22: expanded zone bodies must stay visible');
assert.equal(nodesIn(zonesOpenPage, (node) => classList(node).includes('psup-team-card')).length, 1, 'T22: expanding runtime must render the team card');
assert.equal(nodesIn(zonesOpenPage, (node) => classList(node).includes('psup-check-card')).length, 1, 'T22: expanding checks must render the check card');
assert.equal(nodesIn(zonesOpenPage, (node) => classList(node).includes('psup-guide-steps')).length, 1, 'T22: expanding guide must render the four steps');
assert.deepEqual(zonesOpenToggles.map((node) => node.props.title), ['收起', '收起', '收起', '收起', '收起'], 'T22: expanded zone toggles must expose the 收起 label');
fakeWindow.localStorage.removeItem('psup.zone.runtime');
fakeWindow.localStorage.removeItem('psup.zone.checks');
fakeWindow.localStorage.removeItem('psup.zone.guide');

// T27 展开态：预置「自动工作已展开」，渲染后展开体里必须带完整峰谷口径（不仅靠 title）。
fakeWindow.localStorage.setItem('psup.collapsed.autoWork', '0');
const autoWorkExpandedPage = main.component({});
const ecoExpandedBody = nodesIn(autoWorkExpandedPage, (node) => ((node && node.props) || {}).id === 'psup-row-body-autoWork')[0];
assert.ok(ecoExpandedBody, 'T27: expanding the autoWork row must render its guide body');
const ecoExpandedText = textOf(ecoExpandedBody);
assert.ok(ecoExpandedText.includes('09:00–12:00'), 'T27: expanded autoWork body must render the peak/off-peak window policy');
assert.ok(ecoExpandedText.includes('周末'), 'T27: expanded autoWork body must mention weekends/holidays as off-peak');
fakeWindow.localStorage.removeItem('psup.collapsed.autoWork');

console.log('PASS dsh-project-supervisor smoke test');
console.log('  - bundle id:', definition.id);
console.log('  - inject:', plugin.inject.join(', '));
console.log('  - locale:', namespace, '(' + Object.keys(dictionary.zh).length + ' keys x2)');
console.log('  - slots:', registrations.map((item) => item.options.name + ':' + (item.options.key || item.options.id)).join(', '));
console.log('  - zone IA: work-modes/runtime/checks/actions, 2 full-width cards in 工作方式 (mode + 5 switch rows), 7 quick actions (1 primary), 4 guide steps');
console.log('  - auto work card: switch off by default, ' + AUTO_WORK_KEYS.length + ' i18n keys x2, queue route wired');
console.log('  - team card: rendered in 运行状态, ' + (EFFICIENCY_CARD_KEYS.length + QUICK_ACTION_KEYS.length) + ' related i18n keys x2, no external-proxy copy');
console.log('  - switch board: 5 rows (beginner/autoWork/collab/polish/interview), row guides collapsed by default, ' + SWITCH_BOARD_KEYS.length + ' i18n keys x2');
console.log('  - zone collapse: 5 toggles (work-modes/actions open, runtime/checks/guide collapsed), summaries + psup.zone.<zone> storage, ' + ZONE_COLLAPSE_KEYS.length + ' i18n keys x2');
console.log('  - economical auto work: nested sub-row in the autoWork row, small switch disabled until autoWork is on, peak/off-peak policy, ' + ECO_AUTO_WORK_KEYS.length + ' i18n keys x2');
