#!/usr/bin/env node
/**
 * Browser end-to-end check for the supervisor panel (dev-only, not shipped).
 *
 * Boots a throwaway headless Chrome, opens the authenticated DSH Web UI,
 * clicks the "主管 / Supervisor" sidebar entry, asserts the panel text and
 * saves screenshots. No DSH source checkout or CDP helper packages needed:
 * Node's global WebSocket talks the DevTools protocol directly.
 *
 * Usage: node scripts/e2e-screenshot.mjs "<authenticated dsh web url> [outDir]"
 * The URL is the one printed by `dsh web`, including `?token=...`; it is only
 * used locally and never written to disk.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2];
if (!url) {
  console.error('usage: node scripts/e2e-screenshot.mjs "<authenticated dsh web url>" [outDir]');
  process.exit(2);
}
const outDir = process.argv[3] || path.join(process.cwd(), 'e2e-artifacts');
fs.mkdirSync(outDir, { recursive: true });
// Derive the expected page host from the authenticated URL instead of hardcoding
// the default port, so the same script can verify a throwaway/alternate-port
// DSH instance (`node scripts/e2e-screenshot.mjs "http://127.0.0.1:3099/?token=..."`).
let targetHost = '127.0.0.1:3080';
try {
  targetHost = new URL(url).host || targetHost;
} catch (error) {
  console.error('usage: node scripts/e2e-screenshot.mjs "<authenticated dsh web url>" [outDir]');
  process.exit(2);
}

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9444;
const profileDir = '/tmp/dsh-plugin-e2e-' + Date.now();

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profileDir,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1440,900',
    url,
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findTarget() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:' + PORT + '/json');
      const targets = await response.json();
      const page = targets.find(
        (target) => target.type === 'page' && String(target.url || '').includes(targetHost),
      );
      if (page) return page;
    } catch (error) {
      // Chrome not up yet.
    }
    await sleep(150);
  }
  throw new Error('headless Chrome page target not found');
}

const page = await findTarget();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const problems = [];
const consoleErrors = [];
socket.addEventListener('message', (event) => {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    problems.push(message.params.exceptionDetails.text || 'exception');
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(
      message.params.args
        .map((arg) => (arg && (arg.value || arg.description || arg.type)) || '')
        .join(' '),
    );
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    const entry = message.params.entry;
    problems.push((entry.text || 'log error') + (entry.url ? ` [${entry.url}]` : ''));
  }
});

function send(method, params) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function hideFixedOverlays() {
  return evaluate(`(() => {
    document.querySelectorAll('body *').forEach((el) => {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' && !el.closest('.psup-page')) el.style.visibility = 'hidden';
    });
    return true;
  })()`);
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

// F1/F6: 临时(fresh) profile 首次打开 DSH Web 会先弹「预览版说明」，关闭后又紧跟
// 「添加一个 API Key 开始使用」引导（按钮「稍后配置 / 保存并继续」）。两者都会整块遮住
// 面板截图，所以做成通用引导弹窗清理循环：识别可见 dialog / 固定遮罩 / 已知标题层，
// 只点安全按钮（稍后配置/跳过/关闭/知道了/继续 等），绝不输入 key，最多 5 轮。
const ONBOARDING_TITLES = ['预览版说明', '添加一个 API Key'];
const ONBOARDING_BUTTON_LABELS = [
  '稍后配置', '稍后', '以后再说', '跳过', '关闭', '知道了', '继续',
  'continue', 'later', 'skip', 'got it', 'dismiss', 'close',
];

function modalScannerScript(mode) {
  // mode = 'dismiss' 返回点击结果；mode = 'detect' 返回是否存在可见弹窗层。
  return `(() => {
    const mode = ${JSON.stringify(mode)};
    const labels = ${JSON.stringify(ONBOARDING_BUTTON_LABELS)};
    const titles = ${JSON.stringify(ONBOARDING_TITLES)};
    const visible = (el) => {
      if (!el || !el.getBoundingClientRect) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
    };
    const normalize = (text) => String(text || '').replace(/[\\s→›·！!。.,，、:：]/g, '').toLowerCase();
    const scopes = [];
    const pushScope = (el) => { if (el && scopes.indexOf(el) < 0) scopes.push(el); };
    Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).forEach((el) => {
      if (visible(el)) pushScope(el);
    });
    Array.from(document.querySelectorAll('body *')).forEach((el) => {
      if (!visible(el)) return;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.position === 'fixed' && rect.width >= window.innerWidth * 0.5 && rect.height >= window.innerHeight * 0.5) {
        pushScope(el);
      }
      const text = String(el.textContent || '').trim();
      if (text.length > 600) return;
      if (titles.some((title) => text.indexOf(title) >= 0)) {
        const panel = el.closest('[role="dialog"], [aria-modal="true"]') || el.parentElement || el;
        pushScope(panel);
      }
    });
    if (mode === 'detect') return { blocked: scopes.length > 0, scopes: scopes.length };
    for (const scope of scopes) {
      const buttons = Array.from(scope.querySelectorAll('button, [role="button"]')).filter(visible);
      const target = buttons.find((node) => labels.indexOf(normalize(node.textContent)) >= 0);
      if (target) {
        const label = String(target.textContent || '').trim().slice(0, 40);
        target.click();
        return { clicked: true, label: label };
      }
    }
    return { clicked: false, blocked: scopes.length > 0 };
  })()`;
}

async function dismissOnboardingModals() {
  let dismissed = 0;
  for (let round = 0; round < 5; round += 1) {
    const result = await evaluate(modalScannerScript('dismiss'));
    if (!result || !result.clicked) break;
    dismissed += 1;
    if (result.label) console.log('  - onboarding modal: clicked "' + result.label + '"');
    await sleep(400);
  }
  return dismissed;
}

async function hasBlockingOnboardingModal() {
  const result = await evaluate(modalScannerScript('detect'));
  return !!(result && result.blocked);
}

// T20：工作开关清单的「说明」展开 / 收起（折叠偏好存在 localStorage psup.collapsed.<field>）。
async function setSwitchRowExpanded(field, expanded) {
  return evaluate(`(() => {
    const row = document.querySelector('.psup-switch-row[data-field="${field}"]');
    if (!row) return false;
    const button = row.querySelector('.psup-row-disclosure');
    if (!button) return false;
    const isOpen = button.getAttribute('aria-expanded') === 'true';
    if (isOpen !== ${expanded}) button.click();
    return true;
  })()`);
}

async function setPanelScrollTop(top) {
  await evaluate(`(() => { const page = document.querySelector('.psup-page'); if (page) page.scrollTop = ${Number(top)}; return true; })()`);
  await sleep(300);
}

// T22：分区级折叠状态（localStorage psup.zone.<zone>）。
async function zoneCollapseStates() {
  return JSON.parse(await evaluate(`(() => {
    const sections = Array.from(document.querySelectorAll('[data-zone], .psup-guide')).filter(
      (node) => node.querySelector('.psup-zone-toggle'),
    );
    return JSON.stringify(sections.map((section) => {
      const toggle = section.querySelector('.psup-zone-toggle');
      const body = section.querySelector('.psup-zone-body');
      const summary = section.querySelector('.psup-zone-summary');
      const title = section.querySelector('.psup-zone-title');
      return {
        zone: section.getAttribute('data-zone') || 'guide',
        title: title ? (title.textContent || '').trim() : '',
        expanded: toggle ? toggle.getAttribute('aria-expanded') === 'true' : null,
        controls: toggle ? toggle.getAttribute('aria-controls') : '',
        bodyId: body ? body.id : '',
        hidden: body ? body.hasAttribute('hidden') : null,
        summary: summary ? (summary.textContent || '').trim() : '',
      };
    }));
  })()`));
}

async function setZoneExpandedAndWait(zone, expanded) {
  await evaluate(`(() => {
    const sections = Array.from(document.querySelectorAll('[data-zone], .psup-guide'));
    const section = sections.find((node) => (node.getAttribute('data-zone') || 'guide') === '${zone}');
    if (!section) return false;
    const button = section.querySelector('.psup-zone-toggle');
    if (!button) return false;
    if ((button.getAttribute('aria-expanded') === 'true') !== ${expanded}) button.click();
    return true;
  })()`);
  await sleep(420);
}

async function zonePanelState() {
  return {
    states: await zoneCollapseStates(),
    scrollHeight: await evaluate("(() => { const page = document.querySelector('.psup-page'); return page ? page.scrollHeight : 0; })()"),
  };
}

// T20：全宽卡片下不应再出现旧配对网格时代的「卡内空洞」（卡片底 - 最后一个子元素底 > 60px）。
async function assertWorkZoneHoles(label) {
  const holes = JSON.parse(await evaluate(`(() => {
    const gap = (card) => {
      if (!card) return -1;
      const last = card.lastElementChild;
      if (!last) return -1;
      return Math.max(0, Math.round(card.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom));
    };
    return JSON.stringify({
      switchBoard: gap(document.querySelector('.psup-switch-board-card')),
      mode: gap(document.querySelector('.psup-mode-card')),
    });
  })()`));
  assert.ok(
    holes.switchBoard >= 0 && holes.switchBoard <= 60,
    label + ': switch-board card must not keep a >60px bottom hole; got ' + JSON.stringify(holes),
  );
  assert.ok(
    holes.mode >= 0 && holes.mode <= 60,
    label + ': mode card must not keep a >60px bottom hole; got ' + JSON.stringify(holes),
  );
  return holes;
}

async function hideToastsForShot() {
  await evaluate("(() => { document.querySelectorAll('.psup-toast').forEach((el) => { el.setAttribute('data-psup-shot-hidden', '1'); el.style.display = 'none'; }); return true; })()");
}

async function restoreToastsAfterShot() {
  await evaluate("(() => { document.querySelectorAll('.psup-toast[data-psup-shot-hidden=\"1\"]').forEach((el) => { el.style.display = ''; el.removeAttribute('data-psup-shot-hidden'); }); return true; })()");
}

async function waitReady() {
  // 临时 DSH 实例首次启动可能 >24s；就绪等待给到 60s，避免误报未就绪。
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const ready = await evaluate(
      "document.readyState === 'complete' && !!document.querySelector('#root') && document.querySelector('#root').children.length > 0",
    );
    if (ready) return;
    await sleep(200);
  }
  throw new Error('DSH app did not become ready');
}

async function screenshot(name) {
  // 截图前兜底：若又有引导弹窗弹出（API Key 引导可能滞后出现），先清理再截。
  if (await hasBlockingOnboardingModal()) {
    const lateDismissed = await dismissOnboardingModals();
    console.log('  - onboarding modals: dismissed=' + lateDismissed + ' (before ' + name + ')');
  }
  await hideToastsForShot();
  let shot;
  try {
    shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  } finally {
    await restoreToastsAfterShot();
  }
  const file = path.join(outDir, name);
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  return file;
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await waitReady();
  await sleep(2500); // let client plugins load/lazy-activate
  const onboardingDismissed = await dismissOnboardingModals();
  console.log('  - onboarding modals:', onboardingDismissed ? 'dismissed=' + onboardingDismissed : 'none');

  const sidebarText = await evaluate(
    "Array.from(document.querySelectorAll('button, a, [role=\"button\"], li')).map((node) => (node.textContent || '').trim()).filter(Boolean).join('\\n')",
  );
  assert.ok(
    sidebarText.includes('主管') || sidebarText.includes('Supervisor'),
    'sidebar must contain the supervisor entry; got: ' + sidebarText.slice(0, 800),
  );

  await evaluate(`(() => {
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], li'));
    const target = candidates.find((node) => {
      const text = (node.textContent || '').trim();
      return text === '主管' || text === 'Supervisor';
    });
    if (!target) return false;
    const clickable = target.closest('button, a, [role="button"]') || target;
    clickable.click();
    return true;
  })()`);
  await sleep(1800);
  // F6：「添加一个 API Key」引导常在面板打开后 1~2s 内弹出，先清理再隐藏固定层。
  const panelOpenDismissed = await dismissOnboardingModals();
  console.log(
    '  - onboarding modals:',
    panelOpenDismissed ? 'dismissed=' + panelOpenDismissed + ' after panel open' : 'none after panel open',
  );
  await hideFixedOverlays();

  // The plugin must not reference the external compression proxy anywhere in
  // its copy. Terms are assembled from fragments so this guard itself does not
  // reintroduce the literal strings.
  const BANNED_PANEL_RE = new RegExp(
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
  assert.ok(BANNED_PANEL_RE.test(String.fromCharCode(65, 67, 80)), 'panel guard must match the removed proxy stack acronym');
  assert.ok(
    BANNED_PANEL_RE.test(String.fromCharCode(20195, 29702, 23454, 20363)),
    'panel guard must match the forbidden proxy-instance term',
  );
  // F6: 弹窗可能在插件入场后再次出现（预览版说明 → API Key 引导会连环弹出）；
  // 首张截图前再兜底关闭一次并断言没有可见弹窗遮罩，避免证据被挡。
  const preShotDismissed = await dismissOnboardingModals();
  console.log(
    '  - onboarding modals:',
    preShotDismissed ? 'dismissed=' + preShotDismissed + ' before screenshots' : 'none before screenshots',
  );
  assert.equal(
    await hasBlockingOnboardingModal(),
    false,
    'no visible onboarding modal / overlay (预览版说明, 添加一个 API Key) may cover the panel screenshots',
  );
  const panelShot = await screenshot('panel.png');
  const panelText = await evaluate("(document.querySelector('.psup-page') || document.body).innerText");
  assert.ok(panelText.includes('项目主管'), 'panel title missing: ' + panelText.slice(0, 400));
  // T22：默认收起只读/说明分区后，首屏只留分区标题 + 一行摘要，内容态在展开后断言。
  assert.ok(panelText.includes('运行状态'), 'runtime zone title missing: ' + panelText.slice(0, 600));
  assert.ok(panelText.includes('规则自检'), 'checks zone title missing: ' + panelText.slice(0, 600));
  assert.ok(panelText.includes('项就绪'), 'T22: collapsed checks summary missing: ' + panelText.slice(0, 600));
  assert.ok(
    panelText.includes('团队看板') || panelText.includes('待投递'),
    'T22: collapsed runtime summary missing: ' + panelText.slice(0, 600),
  );
  assert.ok(panelText.includes('主管四步流程'), 'T22: collapsed guide summary missing: ' + panelText.slice(0, 600));
  assert.ok(!panelText.includes('团队与任务'), 'T22: collapsed runtime must hide the team card from the first screen');
  assert.ok(!panelText.includes('工程底线自检'), 'T22: collapsed checks must hide the score card from the first screen');
  assert.ok(panelText.includes('主管怎么工作'), 'workflow card missing');
  assert.ok(panelText.includes('零基础保护'), 'beginner card missing');
  assert.ok(panelText.includes('自动工作'), 'auto work card missing');
  assert.ok(!panelText.includes('压缩与上下文健康'), 'removed compression/context card must not render');
  assert.ok(!panelText.includes('成本与用量'), 'removed cost/usage card must not render');
  assert.ok(!BANNED_PANEL_RE.test(panelText), 'panel must not reference the external compression proxy');
  assert.ok(panelText.includes('快捷动作'), 'actions card missing');
  // T17 信息架构：四个命名分区（工作方式 / 运行状态 / 规则自检 / 快捷动作），
  // 首屏（scrollTop 0）必须能看到「工作方式」区的起始内容。
  const zoneInfo = JSON.parse(await evaluate(`(() => {
    const zones = Array.from(document.querySelectorAll('[data-zone]'));
    const page = document.querySelector('.psup-page');
    const first = zones[0];
    const rows = Array.from(document.querySelectorAll('[data-zone="work-modes"] .psup-switch-row'));
    const lastRow = rows[rows.length - 1];
    const runtimeTitle = document.querySelector('[data-zone="runtime"] .psup-zone-title');
    return JSON.stringify({
      keys: zones.map((node) => node.getAttribute('data-zone')),
      titles: zones.map((node) => {
        const title = node.querySelector('.psup-zone-title');
        return title ? (title.textContent || '').trim() : '';
      }),
      workCards: Array.from(document.querySelectorAll('[data-zone="work-modes"] .psup-card')).map((node) =>
        String(node.className || '')
          .split(/\\s+/)
          .filter((name) => name !== 'psup-card' && name.endsWith('-card'))[0] || '',
      ),
      switchRows: rows.map((node) => node.getAttribute('data-field')),
      lastSwitchRowBottom: lastRow ? Math.round(lastRow.getBoundingClientRect().bottom) : -1,
      runtimeTitleTop: runtimeTitle ? Math.round(runtimeTitle.getBoundingClientRect().top) : -1,
      firstTop: first ? Math.round(first.getBoundingClientRect().top) : -1,
      scrollTop: page ? Math.round(page.scrollTop) : -1,
      innerHeight: window.innerHeight,
    });
  })()`));
  assert.deepEqual(
    zoneInfo.keys,
    ['work-modes', 'runtime', 'checks', 'actions'],
    'panel must render four named zones in order: ' + JSON.stringify(zoneInfo.keys),
  );
  assert.deepEqual(
    zoneInfo.titles,
    ['工作方式', '运行状态', '规则自检', '快捷动作'],
    'zone titles missing: ' + JSON.stringify(zoneInfo.titles),
  );
  // T20 结构收口：工作方式区两张全宽卡（主管工作模式 + 工作开关），5 行开关不再两列配对。
  assert.deepEqual(
    zoneInfo.workCards,
    ['psup-mode-card', 'psup-switch-board-card'],
    'T20: work-modes must render the mode card + the switch-board card; got ' + JSON.stringify(zoneInfo.workCards),
  );
  assert.deepEqual(
    zoneInfo.switchRows,
    ['beginnerGuard', 'autoWork', 'modelCollaboration', 'promptPolish', 'requirementInterview'],
    'T20: five switch rows in the original reading order expected; got ' + JSON.stringify(zoneInfo.switchRows),
  );
  assert.equal(zoneInfo.scrollTop, 0, 'panel must open at scrollTop 0');
  assert.ok(
    zoneInfo.firstTop < zoneInfo.innerHeight - 120,
    'first screen must reveal the start of the work-modes zone; firstTop=' + zoneInfo.firstTop,
  );
  // T20 首屏目标：5 个开关行完整可见，且运行状态区标题已经进入首屏。
  assert.ok(
    zoneInfo.lastSwitchRowBottom > 0 && zoneInfo.lastSwitchRowBottom <= zoneInfo.innerHeight,
    'all five switch rows must fit on the first screen; lastSwitchRowBottom=' + zoneInfo.lastSwitchRowBottom + ' innerHeight=' + zoneInfo.innerHeight,
  );
  assert.ok(
    zoneInfo.runtimeTitleTop > zoneInfo.lastSwitchRowBottom && zoneInfo.runtimeTitleTop < zoneInfo.innerHeight,
    'runtime zone title must enter the first screen below the switch rows; runtimeTitleTop=' + zoneInfo.runtimeTitleTop,
  );
  assert.ok(panelText.includes('工作开关'), 'switch-board card title missing: ' + panelText.slice(0, 400));
  assert.ok(!panelText.includes('（默认关）') && !panelText.includes('（无人值守）'), 'default-state parentheses must be removed from card titles');
  await assertWorkZoneHoles('default');

  // T22 分区级折叠：默认只展开「工作方式」和「快捷动作」，运行状态 / 规则自检 / 使用说明收起并显示摘要。
  const defaultZones = await zonePanelState();
  assert.deepEqual(
    defaultZones.states.map((item) => item.zone),
    ['work-modes', 'runtime', 'checks', 'actions', 'guide'],
    'T22: five collapsible sections expected in order; got ' + JSON.stringify(defaultZones.states),
  );
  assert.deepEqual(
    defaultZones.states.map((item) => item.expanded),
    [true, false, false, true, false],
    'T22: default collapse must be work-modes/actions open, runtime/checks/guide closed; got ' + JSON.stringify(defaultZones.states),
  );
  for (const item of defaultZones.states) {
    assert.equal(item.controls, 'psup-zone-body-' + item.zone, 'T22: toggle must control its own body: ' + item.zone);
    assert.equal(item.bodyId, item.controls, 'T22: body id must match aria-controls: ' + item.zone);
    assert.equal(item.hidden, !item.expanded, 'T22: body hidden state must match the toggle: ' + item.zone);
    if (!item.expanded) assert.ok(item.summary.length > 0, 'T22: collapsed zone must show a summary: ' + item.zone);
  }
  const collapsedSummaries = defaultZones.states.filter((item) => !item.expanded).map((item) => item.summary);
  assert.ok(
    (collapsedSummaries[0].includes('成员') && collapsedSummaries[0].includes('待投递')) ||
      collapsedSummaries[0].includes('团队看板'),
    'T22: runtime summary must show member/task/pending counts (or the degraded short form); got ' + collapsedSummaries[0],
  );
  assert.ok(/[0-9]+\s*\/\s*9/.test(collapsedSummaries[1]), 'T22: checks summary must show n / 9; got ' + collapsedSummaries[1]);
  assert.ok(collapsedSummaries[2].includes('主管四步流程'), 'T22: guide summary expected; got ' + collapsedSummaries[2]);
  assert.ok(
    defaultZones.scrollHeight > 0 && defaultZones.scrollHeight <= 1250,
    'T22: collapsed default layout must cut scrollHeight to <=1250px; got ' + defaultZones.scrollHeight,
  );
  console.log(
    '  - zone collapse default:',
    JSON.stringify(defaultZones.states.map((item) => item.zone + ':' + (item.expanded ? 'open' : 'closed'))),
    'scrollHeight=' + defaultZones.scrollHeight,
  );
  const zonesDefaultShot = await screenshot('panel-zones-default.png');

  // 展开运行状态 / 规则自检 / 使用说明，供后续内容断言与证据截图使用。
  await setZoneExpandedAndWait('runtime', true);
  await setZoneExpandedAndWait('checks', true);
  await setZoneExpandedAndWait('guide', true);
  const expandedZoneStates = await zoneCollapseStates();
  assert.deepEqual(
    expandedZoneStates.map((item) => item.expanded),
    [true, true, true, true, true],
    'T22: every zone must expand on demand; got ' + JSON.stringify(expandedZoneStates),
  );
  const expandedZonesText = await evaluate("(document.querySelector('.psup-page') || document.body).innerText");
  assert.ok(expandedZonesText.includes('团队与任务'), 'T22: expanded runtime must reveal the team card');
  assert.ok(expandedZonesText.includes('工程底线自检'), 'T22: expanded checks must reveal the score card');
  await evaluate("(() => { const zone = document.querySelector('[data-zone=\"runtime\"]'); if (zone) zone.scrollIntoView({ block: 'start' }); return !!zone; })()");
  await sleep(400);
  const zonesExpandedShot = await screenshot('panel-zones-expanded.png');
  console.log('  - zone collapse expanded: all five zones open for content assertions + evidence shot PASS');

  const contrast = await evaluate(`(() => {
    const parse = (value) => (String(value).match(/[0-9]+/g) || []).slice(0, 3).map(Number);
    const diff = (a, b) => {
      const x = parse(a); const y = parse(b);
      if (x.length < 3 || y.length < 3) return 0;
      return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]);
    };
    const chip = document.querySelector('.psup-chip.is-active');
    const primary = document.querySelector('.psup-btn-primary');
    const bar = document.querySelector('.psup-bar-fill');
    const read = (node) => node ? { bg: getComputedStyle(node).backgroundColor, color: getComputedStyle(node).color } : null;
    const chipStyle = read(chip);
    const primaryStyle = read(primary);
    const barStyle = bar ? { width: getComputedStyle(bar).width, bg: getComputedStyle(bar).backgroundColor } : null;
    return JSON.stringify({
      chipDiff: chipStyle ? diff(chipStyle.bg, chipStyle.color) : -1,
      primaryDiff: primaryStyle ? diff(primaryStyle.bg, primaryStyle.color) : -1,
      chipStyle,
      primaryStyle,
      bar: barStyle,
    });
  })()`);
  const parsedContrast = JSON.parse(contrast);
  assert.ok(parsedContrast.chipDiff > 40, 'active chip text must contrast with its background: ' + contrast);
  assert.ok(parsedContrast.primaryDiff > 40, 'primary button text must contrast with its background: ' + contrast);
  assert.ok(parsedContrast.bar && parseFloat(parsedContrast.bar.width) > 10, 'progress bar fill must render: ' + contrast);

  const chipInfo = await evaluate(`(() => {
    const chips = Array.from(document.querySelectorAll('.psup-chip'));
    return JSON.stringify({
      labels: chips.map((chip) => (chip.textContent || '').trim()),
      titles: chips.map((chip) => chip.getAttribute('title') || ''),
    });
  })()`);
  const parsedChips = JSON.parse(chipInfo);
  assert.ok(parsedChips.labels.length > 0, 'project chips expected');
  assert.ok(
    parsedChips.labels.every((label) => label.length > 0),
    'every project chip needs a visible label; got: ' + JSON.stringify(parsedChips.labels),
  );

  // 默认自动选中「含 AGENTS.md」的工作区，健康分应大于 0。
  await sleep(1200);
  const glowScore = await evaluate("(document.querySelector('.psup-score-num') || {}).textContent || ''");
  assert.ok(
    /[1-9]\s*\/\s*9/.test(glowScore),
    'auto-selected workspace should pass at least one baseline check; got ' + glowScore,
  );

  // T20：零基础保护在「工作开关」清单里；先展开行尾「说明」再检查 6 条 safeguard。
  await setSwitchRowExpanded('beginnerGuard', true);
  await sleep(350);
  const beginnerRows = await evaluate(
    "(() => { const row = document.querySelector('.psup-switch-row[data-field=\"beginnerGuard\"]'); return row ? row.querySelectorAll('.psup-list li').length : 0; })()",
  );
  assert.equal(beginnerRows, 6, 'beginner-guard row guide must list 6 items when expanded');

  // Beginner-guard switch: renders on, toggles off (row body note + toast) and back on.
  const switchInfo = JSON.parse(await evaluate(`(() => {
    const el = document.querySelector('[role="switch"][data-field="beginnerGuard"]');
    const row = el ? el.closest('.psup-switch-row') : null;
    return JSON.stringify({
      present: !!el,
      row: !!row,
      checked: el ? el.getAttribute('aria-checked') : null,
      name: row ? String((row.querySelector('.psup-switch-row-name') || {}).textContent || '') : '',
      hint: row ? String((row.querySelector('.psup-switch-row-hint') || {}).textContent || '') : '',
    });
  })()`));
  assert.ok(switchInfo.present && switchInfo.row, 'beginner-guard switch must render inside a switch row');
  assert.equal(switchInfo.checked, 'true', 'beginner-guard must default to on');
  assert.ok(switchInfo.name.includes('零基础保护'), 'switch row must render its own name');
  assert.ok(switchInfo.hint.length > 0, 'switch row must render a one-line hint');
  await evaluate(`(() => { const el = document.querySelector('[role="switch"][data-field="beginnerGuard"]'); if (el) el.click(); return !!el; })()`);
  // toast 约 1.8s 自动消失：先读 toast，再滚动+截图，避免截图耗时把提示读没。
  await sleep(500);
  const offToast = await evaluate("(document.querySelector('.psup-toast') || {}).textContent || ''");
  await sleep(300);
  await setPanelScrollTop(0);
  await assertWorkZoneHoles('guard-off');
  await screenshot('panel-guard-off.png');
  const offInfo = JSON.parse(await evaluate(`(() => {
    const el = document.querySelector('[role="switch"][data-field="beginnerGuard"]');
    const row = el ? el.closest('.psup-switch-row') : null;
    const note = row ? row.querySelector('.psup-guard-off') : null;
    return JSON.stringify({
      checked: el ? el.getAttribute('aria-checked') : null,
      note: note ? note.textContent : '',
      rows: row ? row.querySelectorAll('.psup-list li').length : 0,
    });
  })()`));
  assert.equal(offInfo.checked, 'false', 'switch click must flip aria-checked to false');
  assert.ok(offInfo.note.trim().length > 0, 'guard-off note must render');
  assert.ok(offToast.includes('零基础保护'), 'switch toggle must show a toast: ' + offToast);
  assert.equal(offInfo.rows, 0, 'beginner list must hide when guard is off');
  await evaluate(`(() => { const el = document.querySelector('[role="switch"][data-field="beginnerGuard"]'); if (el) el.click(); return !!el; })()`);
  await sleep(900);
  const backInfo = JSON.parse(await evaluate(`(() => {
    const el = document.querySelector('[role="switch"][data-field="beginnerGuard"]');
    const row = el ? el.closest('.psup-switch-row') : null;
    return JSON.stringify({
      checked: el ? el.getAttribute('aria-checked') : null,
      rows: row ? row.querySelectorAll('.psup-list li').length : 0,
    });
  })()`));
  assert.equal(backInfo.checked, 'true', 'switch must toggle back on');
  assert.equal(backInfo.rows, 6, 'beginner list must come back when guard is on');
  console.log('  - beginner guard switch:', switchInfo.checked, '->', offInfo.checked, '->', backInfo.checked);

  // Prompt-polish switch: expand the row guide, 4 steps, toggles off (note) and back on.
  await setSwitchRowExpanded('promptPolish', true);
  await sleep(350);
  const polishInfo = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="promptPolish"]');
    const row = sw ? sw.closest('.psup-switch-row') : null;
    return JSON.stringify({
      present: !!sw,
      checked: sw ? sw.getAttribute('aria-checked') : null,
      label: sw ? sw.getAttribute('aria-label') : '',
      rows: row ? row.querySelectorAll('.psup-list li').length : 0,
    });
  })()`));
  assert.ok(polishInfo.present, 'prompt-polish switch must render');
  assert.equal(polishInfo.checked, 'true', 'prompt polish must default to on');
  assert.equal(polishInfo.rows, 4, 'prompt polish row guide must list 4 steps when expanded');
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="promptPolish"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(900);
  await evaluate("(() => { const row = document.querySelector('.psup-switch-row[data-field=\"promptPolish\"]'); if (row) row.scrollIntoView({ block: 'center' }); return true; })()");
  await sleep(300);
  await screenshot('panel-polish-off.png');
  const polishOff = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="promptPolish"]');
    const row = sw ? sw.closest('.psup-switch-row') : null;
    return JSON.stringify({
      checked: sw ? sw.getAttribute('aria-checked') : null,
      rows: row ? row.querySelectorAll('.psup-list li').length : 0,
      note: row && row.querySelector('.psup-guard-off') ? row.querySelector('.psup-guard-off').textContent : '',
    });
  })()`));
  assert.equal(polishOff.checked, 'false', 'prompt-polish switch must toggle off');
  assert.equal(polishOff.rows, 0, 'polish steps must hide when the switch is off');
  assert.ok(polishOff.note.includes('已关闭'), 'polish-off note must render: ' + polishOff.note);
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="promptPolish"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(900);
  const polishBack = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="promptPolish"]');
    const row = sw ? sw.closest('.psup-switch-row') : null;
    return JSON.stringify({
      checked: sw ? sw.getAttribute('aria-checked') : null,
      rows: row ? row.querySelectorAll('.psup-list li').length : 0,
    });
  })()`));
  assert.equal(polishBack.checked, 'true', 'prompt-polish switch must toggle back on');
  assert.equal(polishBack.rows, 4, 'polish steps must come back when on');
  console.log('  - prompt polish switch:', polishInfo.checked, '->', polishOff.checked, '->', polishBack.checked);

  // Requirement-interview switch: expand the row guide, 4 steps, toggles off (note) and back on.
  await setSwitchRowExpanded('requirementInterview', true);
  await sleep(350);
  const interviewInfo = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="requirementInterview"]');
    const row = sw ? sw.closest('.psup-switch-row') : null;
    return JSON.stringify({
      present: !!sw,
      checked: sw ? sw.getAttribute('aria-checked') : null,
      rows: row ? row.querySelectorAll('.psup-list li').length : 0,
    });
  })()`));
  assert.ok(interviewInfo.present, 'requirement-interview switch must render');
  assert.equal(interviewInfo.checked, 'true', 'requirement interview must default to on');
  assert.equal(interviewInfo.rows, 4, 'requirement-interview row guide must list 4 steps when expanded');
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="requirementInterview"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(900);
  await evaluate("(() => { const row = document.querySelector('.psup-switch-row[data-field=\"requirementInterview\"]'); if (row) row.scrollIntoView({ block: 'center' }); return true; })()");
  await sleep(300);
  await screenshot('panel-interview-off.png');
  const interviewOff = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="requirementInterview"]');
    const row = sw ? sw.closest('.psup-switch-row') : null;
    return JSON.stringify({
      checked: sw ? sw.getAttribute('aria-checked') : null,
      rows: row ? row.querySelectorAll('.psup-list li').length : 0,
      note: row && row.querySelector('.psup-guard-off') ? row.querySelector('.psup-guard-off').textContent : '',
    });
  })()`));
  assert.equal(interviewOff.checked, 'false', 'requirement-interview switch must toggle off');
  assert.equal(interviewOff.rows, 0, 'interview steps must hide when the switch is off');
  assert.ok(interviewOff.note.includes('已关闭'), 'interview-off note must render: ' + interviewOff.note);
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="requirementInterview"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(900);
  const interviewBack = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="requirementInterview"]');
    const row = sw ? sw.closest('.psup-switch-row') : null;
    return JSON.stringify({
      checked: sw ? sw.getAttribute('aria-checked') : null,
      rows: row ? row.querySelectorAll('.psup-list li').length : 0,
    });
  })()`));
  assert.equal(interviewBack.checked, 'true', 'requirement-interview switch must toggle back on');
  assert.equal(interviewBack.rows, 4, 'interview steps must come back when on');
  console.log('  - requirement interview switch:', interviewInfo.checked, '->', interviewOff.checked, '->', interviewBack.checked);

  // 自动工作开关（工作开关清单第 2 行）：默认关；开启显示排队/阻塞/待回答状态条；
  // host 保存失败时回落到 localStorage（psup.autoWork:<cwd>）并提示 host 未生效。
  const autoWorkInfo = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="autoWork"]');
    const row = sw ? sw.closest('.psup-switch-row') : null;
    const eco = row ? row.querySelector('[role="switch"][data-field="economicalAutoWork"]') : null;
    const sub = row ? row.querySelector('.psup-switch-subrow') : null;
    return JSON.stringify({
      present: !!sw,
      rowText: row ? row.textContent : '',
      checked: sw ? sw.getAttribute('aria-checked') : null,
      status: row ? row.querySelectorAll('.psup-autowork-status').length : -1,
      ecoPresent: !!eco && !!sub,
      ecoText: sub ? sub.textContent : '',
      ecoChecked: eco ? eco.getAttribute('aria-checked') : null,
      ecoDisabled: eco ? eco.disabled : null,
      pageText: (document.querySelector('.psup-page') || document.body).innerText,
    });
  })()`));
  assert.equal(autoWorkInfo.present, true, 'auto-work switch must render');
  assert.ok(autoWorkInfo.rowText.includes('自动工作'), 'auto-work row name missing');
  assert.ok(!autoWorkInfo.rowText.includes('（无人值守）'), 'auto-work title parenthesis must move into the hint');
  assert.equal(autoWorkInfo.checked, 'false', 'auto work must default to off');
  assert.equal(autoWorkInfo.status, 0, 'queue status stays hidden while auto work is off');
  // T27：次级开关「更经济的自动化」默认常驻、默认关；autoWork 关闭时置灰不可点。
  assert.equal(autoWorkInfo.ecoPresent, true, 'nested economical-auto-work sub-row must render by default');
  assert.equal(autoWorkInfo.ecoChecked, 'false', 'economical auto work must default to off');
  assert.equal(autoWorkInfo.ecoDisabled, true, 'economical switch must be disabled while auto work is off');
  assert.ok(autoWorkInfo.ecoText.includes('更经济'), 'sub-row must render its own name: ' + autoWorkInfo.ecoText);
  assert.ok(autoWorkInfo.ecoText.includes('请先开启'), 'disabled sub-row must explain the autoWork pre-requisite: ' + autoWorkInfo.ecoText);
  await evaluate(`(() => { const sw = document.querySelector('.psup-switch-row[data-field="autoWork"] [role="switch"][data-field="economicalAutoWork"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(350);
  assert.equal(
    await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="economicalAutoWork"]'); return sw ? sw.getAttribute('aria-checked') : null; })()`),
    'false',
    'clicking the disabled economical switch must not change its value',
  );
  await setPanelScrollTop(0);
  await sleep(300);
  const ecoDefaultShot = await screenshot('panel-eco-default.png');
  console.log('  - economical auto work default: visible but disabled until autoWork is on, screenshot', ecoDefaultShot);

  // Simulate an unreachable host: the POST fails, so the switch falls back to
  // localStorage and shows the browser-saved toast + host-pending hint.
  await evaluate(`(() => {
    window.__psupFetch = window.fetch;
    window.fetch = function (input, init) {
      const target = typeof input === 'string' ? input : String((input && input.url) || '');
      if (target.indexOf('/plugins/dsh-project-supervisor/config') >= 0 && init && init.method === 'POST') {
        return Promise.reject(new Error('simulated offline'));
      }
      return window.__psupFetch(input, init);
    };
    return true;
  })()`);
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="autoWork"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(900);
  const autoFallback = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="autoWork"]');
    const keys = [];
    try { for (let i = 0; i < window.localStorage.length; i += 1) keys.push(window.localStorage.key(i)); } catch (error) { /* storage unavailable */ }
    return JSON.stringify({
      checked: sw ? sw.getAttribute('aria-checked') : null,
      stored: keys
        .filter((key) => key && key.indexOf('psup.autoWork:') === 0)
        .map((key) => window.localStorage.getItem(key)),
      text: (document.querySelector('.psup-page') || document.body).innerText,
    });
  })()`));
  assert.equal(autoFallback.checked, 'true', 'auto-work switch must flip on even when the host save fails');
  assert.deepEqual(autoFallback.stored, ['true'], 'failed host save must fall back to localStorage psup.autoWork:<cwd>');
  assert.ok(autoFallback.text.includes('已存浏览器'), 'local fallback must tell the user it was saved in the browser');

  // Restore the real fetch, toggle off then on again so the host persists it,
  // and verify the read-only queue status bar renders without errors/NaN.
  await evaluate(`(() => { window.fetch = window.__psupFetch; delete window.__psupFetch; return true; })()`);
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="autoWork"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(600);
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="autoWork"]'); if (sw) sw.click(); return !!sw; })()`);
  // Toast auto-hides after ~1.8s; read it while the "saved" toast is still up.
  await sleep(500);
  const autoOn = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="autoWork"]');
    const row = sw ? sw.closest('.psup-switch-row') : null;
    const status = row ? row.querySelector('.psup-autowork-status') : null;
    return JSON.stringify({
      checked: sw ? sw.getAttribute('aria-checked') : null,
      status: !!status,
      counts: status ? status.textContent : '',
      warn: row ? !!row.querySelector('.psup-warn') : false,
      toast: (document.querySelector('.psup-toast') || { textContent: '' }).textContent,
    });
  })()`));
  assert.equal(autoOn.checked, 'true', 'auto-work switch must turn on and persist to the workspace config');
  assert.ok(autoOn.status || autoOn.warn, 'queue status bar or its static fallback note must render when auto work is on');
  if (autoOn.status) {
    assert.ok(autoOn.counts.includes('排队') && autoOn.counts.includes('阻塞') && autoOn.counts.includes('待回答'),
      'status bar must show queued / blocked / question counts: ' + autoOn.counts);
    assert.ok(autoOn.counts.includes('队列文件') && autoOn.counts.includes('.dsh/auto-work-queue.md'),
      'status bar must hint at the queue file: ' + autoOn.counts);
    assert.ok(!autoOn.counts.includes('NaN'), 'queue counters must never render NaN: ' + autoOn.counts);
  }
  assert.ok(autoOn.toast.includes('自动工作'), 'auto-work toggle must show a toast: ' + autoOn.toast);
  console.log('  - auto work switch:', autoWorkInfo.checked, '-> local fallback ->', autoOn.checked, 'PASS');

  // T27：自动工作开启后次级开关解除置灰；点开 → 更经济的自动化生效（独立 toast + 完整峰谷口径）。
  const ecoEnabled = JSON.parse(await evaluate(`(() => {
    const row = document.querySelector('.psup-switch-row[data-field="autoWork"]');
    const sw = row ? row.querySelector('[role="switch"][data-field="economicalAutoWork"]') : null;
    const sub = row ? row.querySelector('.psup-switch-subrow') : null;
    return JSON.stringify({
      present: !!sw,
      disabled: sw ? sw.disabled : null,
      checked: sw ? sw.getAttribute('aria-checked') : null,
      text: sub ? sub.textContent : '',
    });
  })()`));
  assert.equal(ecoEnabled.present, true, 'economical switch must stay mounted while autoWork is on');
  assert.equal(ecoEnabled.disabled, false, 'economical switch must become clickable once autoWork is on');
  assert.equal(ecoEnabled.checked, 'false', 'economical auto work stays off until clicked');
  assert.ok(ecoEnabled.text.includes('谷价'), 'enabled sub-row hint must explain the off-peak gate: ' + ecoEnabled.text);
  await evaluate(`(() => { const sw = document.querySelector('.psup-switch-row[data-field="autoWork"] [role="switch"][data-field="economicalAutoWork"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(600);
  const ecoOn = JSON.parse(await evaluate(`(() => {
    const row = document.querySelector('.psup-switch-row[data-field="autoWork"]');
    const sw = row ? row.querySelector('[role="switch"][data-field="economicalAutoWork"]') : null;
    return JSON.stringify({
      checked: sw ? sw.getAttribute('aria-checked') : null,
      toast: (document.querySelector('.psup-toast') || { textContent: '' }).textContent,
    });
  })()`));
  assert.equal(ecoOn.checked, 'true', 'economical switch must toggle on while autoWork is on');
  assert.ok(ecoOn.toast.includes('更经济'), 'economical switch must show its own save toast: ' + ecoOn.toast);
  await setSwitchRowExpanded('autoWork', true);
  await sleep(500);
  const ecoPolicyText = await evaluate(`(() => {
    const body = document.querySelector('#psup-row-body-autoWork');
    return body ? body.textContent : '';
  })()`);
  assert.ok(
    ecoPolicyText.includes('09:00') && ecoPolicyText.includes('周末'),
    'expanded autoWork body must spell out the peak/off-peak policy: ' + ecoPolicyText.slice(0, 90),
  );
  await setSwitchRowExpanded('autoWork', false);
  await sleep(300);
  console.log('  - economical auto work switch: disabled -> enabled ->', ecoOn.checked, ', peak/off-peak policy rendered PASS');

  // 恢复默认（关），避免影响后续截图与再次运行。
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="autoWork"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(700);

  // Model collaboration: off by default; enabling auto-expands the row guide and shows
  // auto/manual radios; manual shows 6 task->model selectors.
  const collabInfo = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]');
    const row = sw ? sw.closest('.psup-switch-row') : null;
    return JSON.stringify({
      present: !!sw,
      checked: sw ? sw.getAttribute('aria-checked') : null,
      radios: row ? row.querySelectorAll('.psup-collab-option').length : 0,
      selects: row ? row.querySelectorAll('.psup-model-row select').length : 0,
    });
  })()`));
  assert.equal(collabInfo.present, true, 'model collaboration switch must render');
  assert.equal(collabInfo.checked, 'false', 'model collaboration must default to off');
  assert.equal(collabInfo.radios, 0, 'mode radios stay hidden while model collaboration is off');

  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(900);
  const collabOn = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]');
    const row = sw ? sw.closest('.psup-switch-row') : null;
    const radios = row ? Array.from(row.querySelectorAll('.psup-collab-option')) : [];
    return JSON.stringify({
      checked: sw ? sw.getAttribute('aria-checked') : null,
      expanded: row && row.querySelector('.psup-row-disclosure') ? row.querySelector('.psup-row-disclosure').getAttribute('aria-expanded') : null,
      radios: radios.map((el) => ({ label: (el.textContent || '').trim().slice(0, 10), checked: el.getAttribute('aria-checked') })),
      selects: row ? row.querySelectorAll('.psup-model-row select').length : 0,
    });
  })()`));
  assert.equal(collabOn.checked, 'true', 'model collaboration switch must turn on');
  assert.equal(collabOn.expanded, 'true', 'enabling model collaboration must auto-expand its row guide');
  assert.equal(collabOn.radios.length, 2, 'enabling model collaboration must show auto/manual radios');
  assert.equal(collabOn.radios[0].checked, 'true', 'AI auto-select must be the default mode');
  assert.equal(collabOn.selects, 6, 'auto mode must show the 6-row editable routing table');

  // Auto routing table: pick the second route for the first row and remember it
  // for the reload check below.
  const savedAutoRoute = await evaluate(`(() => {
    const row = document.querySelector('.psup-switch-row[data-field="modelCollaboration"]');
    const select = row ? row.querySelector('.psup-model-row select') : null;
    if (!select || select.options.length < 2) return '';
    select.value = select.options[1].value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return select.value;
  })()`);
  assert.ok(savedAutoRoute && savedAutoRoute.length > 0, 'auto routing table must accept a route selection');
  await sleep(700);

  await evaluate(`(() => {
    const row = document.querySelector('.psup-switch-row[data-field="modelCollaboration"]');
    const radios = row ? Array.from(row.querySelectorAll('.psup-collab-option')) : [];
    if (radios[1]) radios[1].click();
    return radios.length;
  })()`);
  await sleep(700);
  const collabManual = JSON.parse(await evaluate(`(() => {
    const row = document.querySelector('.psup-switch-row[data-field="modelCollaboration"]');
    const selects = row ? Array.from(row.querySelectorAll('.psup-model-row select')) : [];
    return JSON.stringify({
      selects: selects.map((el) => el.options.length),
      labels: row ? Array.from(row.querySelectorAll('.psup-model-row .psup-model-label')).map((el) => (el.textContent || '').trim()) : [],
    });
  })()`));
  assert.equal(collabManual.selects.length, 6, 'manual mode must show 6 task-type model selectors');
  assert.ok(!collabManual.selects.includes(0), 'every selector must offer model options');
  assert.ok(collabManual.selects.every((count) => count >= 3), 'selectors must offer default + dynamic/fallback routes');
  assert.ok(collabManual.labels.join('|').includes('规划'), 'task-type labels must include planning row');
  console.log('  - model collaboration switch: off -> on (auto default) -> manual,', collabManual.selects.length, 'selectors PASS');
  // T20 状态截图：模型协作开 + 手动。只展开模型协作这一行、折叠其它行，并把该行滚到可见处，
  // 这样截图能直接证明「该状态下的工作方式区没有配对网格时代的卡内空洞」。
  await evaluate("(() => { const buttons = Array.from(document.querySelectorAll('.psup-switch-row .psup-row-disclosure')); buttons.forEach((btn) => { const row = btn.closest('.psup-switch-row'); const field = row ? row.getAttribute('data-field') : ''; if (field !== 'modelCollaboration' && btn.getAttribute('aria-expanded') === 'true') btn.click(); }); return buttons.length; })()");
  await sleep(450);
  await evaluate("(() => { const row = document.querySelector('.psup-switch-row[data-field=\"modelCollaboration\"]'); if (row) row.scrollIntoView({ block: 'start' }); return !!row; })()");
  await sleep(450);
  await assertWorkZoneHoles('model-collab-manual');
  const modelCollabShot = await screenshot('panel-collab-state.png');

  // Quick action: click "copy kickoff prompt"; success shows a toast, headless
  // clipboard failure must fall back to the new selectable manual-copy layer.
  await evaluate(`(() => {
    const primary = document.querySelector('.psup-btn-primary');
    if (primary) primary.click();
    return !!primary;
  })()`);
  await sleep(900);
  const copyOutcome = JSON.parse(await evaluate(`(() => {
    const toast = (document.querySelector('.psup-toast') || {}).textContent || '';
    const fallback = document.querySelector('.psup-copy-fallback');
    const textarea = fallback ? fallback.querySelector('textarea') : null;
    return JSON.stringify({
      toast,
      fallback: !!fallback,
      readOnly: textarea ? textarea.readOnly === true : null,
      value: textarea ? textarea.value : '',
    });
  })()`));
  assert.ok(
    copyOutcome.toast.trim().length > 0 || copyOutcome.fallback,
    'quick action must report the copy result (toast or manual-copy layer)',
  );
  if (copyOutcome.fallback) {
    assert.equal(copyOutcome.readOnly, true, 'manual-copy textarea must be read-only');
    assert.ok(copyOutcome.value.length > 0, 'manual-copy textarea must contain the kickoff prompt');
    await evaluate("(() => { const btn = document.querySelector('.psup-copy-fallback button'); if (btn) btn.click(); return true; })()");
    await sleep(300);
    assert.equal(await evaluate("document.querySelectorAll('.psup-copy-fallback').length"), 0, 'manual-copy layer must close');
  }
  const toastText = copyOutcome.toast;
  // 截图前隐藏 toast（headless 剪贴板会失败，不把失败提示拍进公开截图；不删 DOM，避免 React 卸载冲突）
  await evaluate("(() => { document.querySelectorAll('.psup-toast').forEach((el) => { el.style.display = 'none'; }); return true; })()");

  // Bottom half: workflow + beginner + actions cards（显式滚到「快捷动作」区，与 panel-full 的页面底部去重）。
  await evaluate("(() => { const zone = document.querySelector('[data-zone=\"actions\"]'); if (zone) zone.scrollIntoView({ block: 'center' }); return !!zone; })()");
  await sleep(500);
  const bottomShot = await screenshot('panel-bottom.png');
  const bottomText = await evaluate("(document.querySelector('.psup-page') || document.body).innerText");
  assert.ok(bottomText.includes('零基础保护'), 'beginner card must render');
  assert.ok(bottomText.includes('自动工作'), 'auto-work card must render');
  assert.ok(bottomText.includes('提示词润色'), 'prompt-polish card must render');
  assert.ok(bottomText.includes('新项目需求追问'), 'requirement-interview card must render');
  assert.ok(bottomText.includes('快捷动作'), 'actions card must render');
  assert.ok(bottomText.includes('团队与任务'), 'team card must render');
  assert.ok(bottomText.includes('复制交接单模板'), 'handoff quick action must render');
  assert.ok(bottomText.includes('复制团队状态快照'), 'team snapshot quick action must render');
  assert.ok(bottomText.includes('复制环境体检口令'), 'doctor quick action must render');
  assert.ok(bottomText.includes('复制一键验收口令'), 'verify quick action must render');
  assert.ok(bottomText.includes('复制开工口令'), 'kickoff copy button must render');
  assert.ok(!BANNED_PANEL_RE.test(bottomText), 'panel bottom must not reference the external compression proxy');

  // 团队与任务卡：标题始终渲染；host 未重启/数据缺失时显示降级提示；数值不得出现 NaN。
  const teamCard = JSON.parse(await evaluate(`(() => {
    const card = document.querySelector('.psup-team-card');
    const page = document.querySelector('.psup-page');
    return JSON.stringify({
      present: !!card,
      text: card ? card.innerText : '',
      pageText: page ? page.innerText : '',
      actionItems: document.querySelectorAll('.psup-action-item').length,
      disclosures: document.querySelectorAll('.psup-disclosure').length,
      healthCards: document.querySelectorAll('.psup-health-card').length,
      usageCards: document.querySelectorAll('.psup-usage-card').length,
    });
  })()`));
  assert.equal(teamCard.present, true, 'team card must render');
  assert.equal(teamCard.healthCards, 0, 'the removed compression/context card must not render');
  assert.equal(teamCard.usageCards, 0, 'the removed cost/usage card must not render');
  assert.equal(teamCard.actionItems, 7, 'quick actions must stay at 7');
  assert.equal(teamCard.disclosures, 12, 'T20: 5 switch-row guides + 7 quick-action disclosures expected');
  assert.ok(!teamCard.pageText.includes('NaN'), 'the team card must never render NaN');
  assert.ok(!BANNED_PANEL_RE.test(teamCard.pageText), 'panel must not reference the external compression proxy');
  assert.ok(
    teamCard.text.includes('成员') || teamCard.text.includes('Members'),
    'team card must show a members section or its degraded hint: ' + teamCard.text.slice(0, 200),
  );
  assert.ok(
    teamCard.text.includes('只读') && teamCard.text.includes('会话日志'),
    'team card must show the team-board hint copy: ' + teamCard.text.slice(0, 300),
  );
  assert.ok(
    !teamCard.text.includes('并行对话框在会话页头'),
    'team card must not show the legacy parallel-dialogue footer hint',
  );
  console.log('  - team card: renders with 7 quick actions, degrade-safe, no external-proxy copy PASS');

  // Quick actions: seven disclosures (plus the five switch-row guides, tested separately).
  const disclosureClosed = JSON.parse(await evaluate(`(() => JSON.stringify({
    disclosures: document.querySelectorAll('.psup-actions-grid .psup-disclosure').length,
    rowGuides: document.querySelectorAll('.psup-switch-row .psup-row-disclosure').length,
    helps: document.querySelectorAll('.psup-help').length,
  }))()`));
  assert.equal(disclosureClosed.disclosures, 7, 'each quick action needs a disclosure toggle');
  assert.equal(disclosureClosed.rowGuides, 5, 'each switch row needs a 说明 disclosure toggle');
  assert.equal(disclosureClosed.helps, 0, 'explanations must start collapsed');
  const clickDisclosure = () => evaluate("(() => { const btn = document.querySelector('.psup-actions-grid .psup-disclosure'); if (btn) btn.click(); return !!btn; })()");
  await clickDisclosure();
  let opened = 0;
  for (let i = 0; i < 10; i += 1) {
    await sleep(200);
    opened = Number(await evaluate("document.querySelectorAll('.psup-help').length"));
    if (opened === 1) break;
    if (i === 4) await clickDisclosure(); // 首次点击若被遮挡/未命中，重试一次
  }
  const disclosureOpen = JSON.parse(await evaluate(`(() => {
    const help = document.querySelector('.psup-help');
    const btn = document.querySelector('.psup-actions-grid .psup-disclosure');
    return JSON.stringify({
      helps: document.querySelectorAll('.psup-help').length,
      text: help ? help.textContent : '',
      expanded: btn ? btn.getAttribute('aria-expanded') : null,
    });
  })()`));
  assert.equal(disclosureOpen.helps, 1, 'clicking one disclosure shows exactly one explanation');
  assert.ok(disclosureOpen.text.includes('作用'), 'explanation must say what the action does: ' + disclosureOpen.text);
  assert.equal(disclosureOpen.expanded, 'true', 'disclosure must report aria-expanded=true');
  await evaluate("(() => { const zone = document.querySelector('[data-zone=\"actions\"]'); if (zone) zone.scrollIntoView({ block: 'center' }); return true; })()");
  await sleep(300);
  const actionsShot = await screenshot('panel-actions-open.png');
  await evaluate("(() => { const btn = document.querySelector('.psup-actions-grid .psup-disclosure'); if (btn) btn.click(); return !!btn; })()");
  await sleep(400);
  assert.equal(await evaluate("document.querySelectorAll('.psup-help').length"), 0, 'clicking again must collapse the explanation');
  console.log('  - quick action disclosures: 7 collapsible explanations, expand/collapse PASS');

  // 主管工作模式：位于「工作方式」分区首卡，默认效率优先；切到严格派发后刷新页面仍保持。
  const modeInfo = JSON.parse(await evaluate(`(() => {
    const zone = document.querySelector('[data-zone="work-modes"]');
    const modeCard = document.querySelector('.psup-mode-card');
    const options = Array.from(document.querySelectorAll('.psup-mode-option'));
    const active = options.find((el) => el.classList.contains('is-active'));
    return JSON.stringify({
      exists: !!modeCard,
      inWorkZone: zone && modeCard ? zone.contains(modeCard) : false,
      isFirstZoneCard: zone && modeCard ? zone.querySelector('.psup-card') === modeCard : false,
      options: options.length,
      active: active ? active.textContent : '',
      checked: options.map((el) => el.getAttribute('aria-checked')),
    });
  })()`));
  assert.equal(modeInfo.exists, true, 'dispatch-mode card must render');
  assert.equal(modeInfo.inWorkZone, true, 'dispatch-mode card must live in the work-modes zone');
  assert.equal(modeInfo.isFirstZoneCard, true, 'dispatch-mode selector must be the first card in the work-modes zone');
  assert.equal(modeInfo.options, 2, 'exactly two dispatch modes expected');
  assert.ok(modeInfo.active.includes('效率优先'), 'efficiency must be active by default: ' + modeInfo.active);
  assert.deepEqual(modeInfo.checked, ['true', 'false'], 'efficiency radio must be checked by default');

  await evaluate("(() => { const el = document.querySelectorAll('.psup-mode-option')[1]; if (el) el.click(); return !!el; })()");
  await sleep(900);
  const modeStrict = JSON.parse(await evaluate(`(() => {
    const options = Array.from(document.querySelectorAll('.psup-mode-option'));
    const active = options.find((el) => el.classList.contains('is-active'));
    return JSON.stringify({
      active: active ? active.textContent : '',
      checked: options.map((el) => el.getAttribute('aria-checked')),
    });
  })()`));
  assert.ok(modeStrict.active.includes('严格派发'), 'strict mode must become active after click: ' + modeStrict.active);
  assert.deepEqual(modeStrict.checked, ['false', 'true'], 'strict radio must be checked after click');
  await setPanelScrollTop(0);
  await assertWorkZoneHoles('mode-strict');
  const modeShot = await screenshot('panel-mode-strict.png');
  console.log('  - dispatch mode: 效率优先 -> 严格派发, first card in work-modes zone PASS');

  // T20 开关行「说明」折叠：默认全部收起；展开后记住选择（localStorage psup.collapsed.<field>），刷新仍保持。
  // 前面的交互把零基础保护 / 润色 / 追问行展开过，先统一收起再验证默认态。
  await evaluate("(() => { const buttons = Array.from(document.querySelectorAll('.psup-switch-row .psup-row-disclosure')); buttons.forEach((btn) => { if (btn.getAttribute('aria-expanded') === 'true') btn.click(); }); return buttons.length; })()");
  await sleep(500);
  const collapseDefault = JSON.parse(await evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('.psup-switch-row .psup-row-disclosure'));
    return JSON.stringify({
      rows: buttons.length,
      expanded: buttons.map((btn) => btn.getAttribute('aria-expanded')),
      bodies: document.querySelectorAll('.psup-row-body').length,
    });
  })()`));
  assert.equal(collapseDefault.rows, 5, 'five switch-row guides expected');
  assert.deepEqual(
    collapseDefault.expanded,
    ['false', 'false', 'false', 'false', 'false'],
    'switch-row guides must default to collapsed: ' + JSON.stringify(collapseDefault.expanded),
  );
  assert.equal(collapseDefault.bodies, 0, 'no row body expected by default');

  await setSwitchRowExpanded('beginnerGuard', true);
  await sleep(350);
  const collapseOpen = JSON.parse(await evaluate(`(() => {
    const row = document.querySelector('.psup-switch-row[data-field="beginnerGuard"]');
    const btn = row ? row.querySelector('.psup-row-disclosure') : null;
    return JSON.stringify({
      expanded: btn ? btn.getAttribute('aria-expanded') : null,
      body: !!document.querySelector('#psup-row-body-beginnerGuard'),
      bodies: document.querySelectorAll('.psup-row-body').length,
      stored: (() => { try { return window.localStorage.getItem('psup.collapsed.beginnerGuard'); } catch (error) { return 'storage-error'; } })(),
    });
  })()`));
  assert.equal(collapseOpen.expanded, 'true', 'expanding a row guide must set aria-expanded=true');
  assert.equal(collapseOpen.body, true, 'expanded row guide must render its body');
  assert.equal(collapseOpen.bodies, 1, 'only one row body must be open');
  assert.equal(collapseOpen.stored, '0', 'expanded guide must be saved to localStorage as 0');

  // 刷新页面：展开状态应被记住（其余行保持收起）。
  await send('Page.reload', { ignoreCache: true });
  await sleep(1200);
  await hideFixedOverlays();
  await waitReady();
  await sleep(2600);
  const reloadDismissed = await dismissOnboardingModals();
  console.log('  - onboarding modals:', reloadDismissed ? 'dismissed=' + reloadDismissed + ' after reload' : 'none after reload');
  await evaluate(`(() => {
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], li'));
    const target = candidates.find((node) => {
      const text = (node.textContent || '').trim();
      return text === '主管' || text === 'Supervisor';
    });
    if (!target) return false;
    const clickable = target.closest('button, a, [role="button"]') || target;
    clickable.click();
    return true;
  })()`);
  await sleep(1800);
  const reloadPanelDismissed = await dismissOnboardingModals();
  console.log(
    '  - onboarding modals:',
    reloadPanelDismissed ? 'dismissed=' + reloadPanelDismissed + ' after reload panel open' : 'none after reload panel open',
  );
  const afterReload = JSON.parse(await evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('.psup-switch-row .psup-row-disclosure'));
    return JSON.stringify({
      expanded: buttons.map((btn) => btn.getAttribute('aria-expanded')),
      bodies: document.querySelectorAll('.psup-row-body').length,
      stored: (() => { try { return window.localStorage.getItem('psup.collapsed.beginnerGuard'); } catch (error) { return 'storage-error'; } })(),
      mode: (() => {
        const active = Array.from(document.querySelectorAll('.psup-mode-option')).find((el) => el.classList.contains('is-active'));
        return active ? active.textContent : '';
      })(),
      collabChecked: (() => { const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]'); return sw ? sw.getAttribute('aria-checked') : null; })(),
      collabSelects: document.querySelectorAll('.psup-model-row select').length,
      autoWorkChecked: (() => { const sw = document.querySelector('[role="switch"][data-field="autoWork"]'); return sw ? sw.getAttribute('aria-checked') : null; })(),
      economicalChecked: (() => { const sw = document.querySelector('[role="switch"][data-field="economicalAutoWork"]'); return sw ? sw.getAttribute('aria-checked') : null; })(),
      economicalDisabled: (() => { const sw = document.querySelector('[role="switch"][data-field="economicalAutoWork"]'); return sw ? sw.disabled : null; })(),
    });
  })()`));
  assert.equal(afterReload.expanded[0], 'true', 'expanded row guide must survive a page reload');
  // 模型协作在刷新前已开启：开启状态会把该行自动展开，所以 reload 后应有两行展开。
  assert.equal(afterReload.expanded[2], 'true', 'model-collaboration row must auto-expand on load while enabled');
  assert.equal(
    afterReload.expanded.filter((value) => value === 'true').length,
    2,
    'saved row + auto-expanded collab row expected after reload: ' + JSON.stringify(afterReload.expanded),
  );
  assert.equal(afterReload.bodies, 2, 'two expanded row bodies expected after reload');
  assert.equal(afterReload.stored, '0', 'expanded choice must stay in localStorage after reload');
  assert.ok(afterReload.mode.includes('严格派发'), 'dispatch mode must survive a page reload: ' + afterReload.mode);
  console.log('  - switch-row guides: collapsed by default, expanded state remembered after reload PASS');
  assert.equal(afterReload.autoWorkChecked, 'false', 'auto work must reload back off after it was restored');
  assert.equal(afterReload.economicalChecked, 'true', 'economical auto work state must survive a page reload');
  assert.equal(afterReload.economicalDisabled, true, 'economical switch must load disabled while autoWork is off after reload');
  assert.equal(afterReload.collabChecked, 'true', 'model collaboration state must survive a page reload');
  assert.equal(afterReload.collabSelects, 6, 'manual model assignment rows must survive a page reload');
  console.log('  - model collaboration: manual mode persisted after reload PASS');

  // Switch back to auto mode and confirm the route picked before the reload survived.
  await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]');
    const row = sw ? sw.closest('.psup-switch-row') : null;
    const radios = row ? Array.from(row.querySelectorAll('.psup-collab-option')) : [];
    if (radios[0]) radios[0].click();
    return radios.length;
  })()`);
  await sleep(700);
  const reloadedAuto = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]');
    const row = sw ? sw.closest('.psup-switch-row') : null;
    const selects = row ? Array.from(row.querySelectorAll('.psup-model-row select')) : [];
    return JSON.stringify({ count: selects.length, first: selects[0] ? selects[0].value : null });
  })()`));
  assert.equal(reloadedAuto.count, 6, 'auto routing table must come back after reload');
  assert.equal(reloadedAuto.first, savedAutoRoute, 'auto route choice must survive a page reload');
  console.log('  - model collaboration: auto route table choice persisted after reload PASS');
  console.log('  - dispatch mode: strict persisted after reload PASS');

  // T22：默认与展开的分区选择都要跨刷新保持（runtime/checks/guide 展开态写的是 psup.zone.*='0'）。
  const zonesAfterReload = await zoneCollapseStates();
  assert.equal(zonesAfterReload.length, 5, 'T22: five collapsible sections expected after reload');
  assert.deepEqual(
    zonesAfterReload.map((item) => item.expanded),
    [true, true, true, true, true],
    'T22: expanded zone choices must survive a page reload: ' + JSON.stringify(zonesAfterReload.map((item) => item.zone + ':' + item.expanded)),
  );
  console.log('  - zone collapse: expanded zones remembered after reload PASS');

  // 恢复默认（开关行全部收起 + 效率优先 + 模型协作关），避免影响后续截图与再次运行。
  await evaluate("(() => { const buttons = Array.from(document.querySelectorAll('.psup-switch-row .psup-row-disclosure')); buttons.forEach((btn) => { if (btn.getAttribute('aria-expanded') === 'true') btn.click(); }); return buttons.length; })()");
  await sleep(400);
  await evaluate("(() => { const el = document.querySelectorAll('.psup-mode-option')[0]; if (el) el.click(); return !!el; })()");
  await sleep(700);
  assert.ok(
    await evaluate("(() => { const active = Array.from(document.querySelectorAll('.psup-mode-option')).find((el) => el.classList.contains('is-active')); return active ? active.textContent.indexOf('效率优先') >= 0 : false; })()"),
    'efficiency mode must be restored at the end of the run',
  );
  // T27：把次级开关恢复默认关（autoWork 关闭时它不可点，需临时开启自动工作）。
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="autoWork"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(600);
  await evaluate(`(() => { const sw = document.querySelector('.psup-switch-row[data-field="autoWork"] [role="switch"][data-field="economicalAutoWork"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(600);
  const ecoRestored = JSON.parse(await evaluate(`(() => {
    const row = document.querySelector('.psup-switch-row[data-field="autoWork"]');
    const eco = row ? row.querySelector('[role="switch"][data-field="economicalAutoWork"]') : null;
    const main = row ? row.querySelector('[role="switch"][data-field="autoWork"]') : null;
    return JSON.stringify({
      ecoChecked: eco ? eco.getAttribute('aria-checked') : null,
      autoChecked: main ? main.getAttribute('aria-checked') : null,
    });
  })()`));
  assert.equal(ecoRestored.ecoChecked, 'false', 'economical auto work must be restored to off at the end of the run');
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="autoWork"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(600);
  const ecoFinal = JSON.parse(await evaluate(`(() => {
    const row = document.querySelector('.psup-switch-row[data-field="autoWork"]');
    const eco = row ? row.querySelector('[role="switch"][data-field="economicalAutoWork"]') : null;
    return JSON.stringify({
      autoChecked: (() => { const sw = document.querySelector('[role="switch"][data-field="autoWork"]'); return sw ? sw.getAttribute('aria-checked') : null; })(),
      ecoChecked: eco ? eco.getAttribute('aria-checked') : null,
      ecoDisabled: eco ? eco.disabled : null,
    });
  })()`));
  assert.equal(ecoFinal.autoChecked, 'false', 'auto work must be restored to off at the end of the run');
  assert.equal(ecoFinal.ecoChecked, 'false', 'economical auto work must end the run off');
  assert.equal(ecoFinal.ecoDisabled, true, 'economical switch must end the run disabled (autoWork off)');
  console.log('  - economical auto work: restored off at the end of the run PASS');
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(500);
  assert.equal(
    await evaluate("(() => { const sw = document.querySelector('[role=\"switch\"][data-field=\"modelCollaboration\"]'); return sw ? sw.getAttribute('aria-checked') : null; })()"),
    'false',
    'model collaboration must be restored to off at the end of the run',
  );
  assert.equal(await evaluate("document.querySelectorAll('.psup-row-body').length"), 0, 'all row guides must be collapsed again at the end of the run');
  // T22：恢复默认分区折叠（工作方式/快捷动作展开，运行状态/规则自检/使用说明收起）。
  await setZoneExpandedAndWait('runtime', false);
  await setZoneExpandedAndWait('checks', false);
  await setZoneExpandedAndWait('guide', false);
  assert.deepEqual(
    (await zoneCollapseStates()).map((item) => item.expanded),
    [true, false, false, true, false],
    'T22: default zone collapse states must be restorable at the end of the run',
  );
  console.log('  - zone collapse: default states restored at the end of the run PASS');

  // panel-collapse：收起态 + 显式滚动到运行状态区，与首屏/中段/底部截图区分开（避免同 sha）。
  await evaluate("(() => { const zone = document.querySelector('[data-zone=\"runtime\"]'); if (zone) zone.scrollIntoView({ block: 'start' }); return !!zone; })()");
  await sleep(400);
  await screenshot('panel-collapse.png');

  // T22 布局度量：默认收起态目标 <=1250px（T20 两卡全展开基线 1812，真实 e2e 1851；收起 runtime/checks/guide 后约 -600px）。
  await setPanelScrollTop(0);
  await sleep(300);
  const pageMetrics = JSON.parse(await evaluate(`(() => {
    const page = document.querySelector('.psup-page');
    const zones = Array.from(document.querySelectorAll('[data-zone]')).map((node) => node.getAttribute('data-zone'));
    const rows = Array.from(document.querySelectorAll('.psup-switch-row'));
    const lastRow = rows[rows.length - 1];
    const runtimeTitle = document.querySelector('[data-zone="runtime"] .psup-zone-title');
    return JSON.stringify({
      scrollHeight: page ? page.scrollHeight : 0,
      clientHeight: page ? page.clientHeight : 0,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      cards: document.querySelectorAll('.psup-card').length,
      zones,
      switchRows: rows.length,
      lastSwitchRowBottom: lastRow ? Math.round(lastRow.getBoundingClientRect().bottom) : -1,
      runtimeTitleTop: runtimeTitle ? Math.round(runtimeTitle.getBoundingClientRect().top) : -1,
    });
  })()`));
  assert.deepEqual(
    pageMetrics.zones,
    ['work-modes', 'runtime', 'checks', 'actions'],
    'four named zones expected: ' + JSON.stringify(pageMetrics.zones),
  );
  assert.equal(pageMetrics.cards, 4, 'T20: four cards expected (mode / switch board / team / checks); got ' + pageMetrics.cards);
  assert.equal(pageMetrics.switchRows, 5, 'T20: five switch rows expected');
  assert.ok(pageMetrics.scrollHeight > 0, 'scrollable panel expected');
  assert.ok(
    pageMetrics.scrollHeight <= 1250,
    'T22: collapsed runtime/checks/guide zones must cut the default page to <=1250px; got ' + pageMetrics.scrollHeight,
  );
  assert.ok(
    pageMetrics.lastSwitchRowBottom > 0 && pageMetrics.lastSwitchRowBottom <= pageMetrics.innerHeight,
    'all five switch rows must fit on the first screen; lastSwitchRowBottom=' + pageMetrics.lastSwitchRowBottom + ' innerHeight=' + pageMetrics.innerHeight,
  );
  assert.ok(
    pageMetrics.runtimeTitleTop > pageMetrics.lastSwitchRowBottom && pageMetrics.runtimeTitleTop < pageMetrics.innerHeight,
    'runtime zone title must be visible on the first screen; runtimeTitleTop=' + pageMetrics.runtimeTitleTop,
  );
  await assertWorkZoneHoles('default-restored');
  console.log('  - page metrics:', JSON.stringify(pageMetrics));
  await setPanelScrollTop(0);
  await sleep(350);
  const defaultZoneShot = await screenshot('panel-zones-default.png');
  console.log('  - default zones screenshot:', defaultZoneShot);

  const checkRows = await evaluate(
    "document.querySelectorAll('.psup-check').length + ':' + document.querySelectorAll('.psup-chip').length",
  );

  // F3/T20：三档截图各自显式设置滚动位置（top / 45% / bottom），滚动都留在 .psup-page 内。
  await evaluate("(() => { const page = document.querySelector('.psup-page'); if (page) page.scrollTop = Math.round((page.scrollHeight - page.clientHeight) * 0.45); return true; })()");
  await sleep(400);
  const middleShot = await screenshot('panel-middle.png');
  await setPanelScrollTop(Math.round(await evaluate("(() => { const page = document.querySelector('.psup-page'); return page ? page.scrollHeight - page.clientHeight : 0; })()")));
  await sleep(400);
  const fullShot = await screenshot('panel-full.png');

  // ---- 隐私版截图：只截面板内容区，隐藏侧栏（会话标题/工作区名）、第三方浮层与 toast ----
  const privacyDir = process.env.PSUP_PRIVACY_DIR || '/tmp/psup-privacy-shots';
  fs.mkdirSync(privacyDir, { recursive: true });
  async function hideSensitiveChrome() {
    await evaluate(`(() => {
      // 1) 工作区名/路径脱敏：截图里不出现本机目录名或绝对路径
      Array.from(document.querySelectorAll('.psup-chip')).forEach((el, i) => {
        el.textContent = 'Workspace ' + String.fromCharCode(65 + (i % 26));
        el.setAttribute('title', '');
      });
      Array.from(document.querySelectorAll('.psup-path')).forEach((el) => { el.textContent = '~/<workspace>'; });
      // 2) 隐藏第三方固定浮层（鲸鱼/花销气泡等），保留主管面板本身
      Array.from(document.querySelectorAll('body *')).forEach((el) => {
        if (el.querySelector && el.querySelector('.psup-page')) return;
        const style = getComputedStyle(el);
        if (style.position !== 'fixed' && style.position !== 'sticky') return;
        const rect = el.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) return;
        el.style.display = 'none';
      });
      // 3) toast 不截
      Array.from(document.querySelectorAll('.psup-toast')).forEach((el) => { el.style.display = 'none'; });
      return true;
    })()`);
    await sleep(350);
  }
  async function privacyShot(name) {
    await hideSensitiveChrome();
    // 复用正常截图管线（整屏），浮层/横幅已隐藏；左侧栏由外部脚本裁掉。
    const captured = await screenshot('privacy-' + name);
    const file = path.join(privacyDir, name);
    fs.copyFileSync(captured, file);
    return file;
  }
  await setPanelScrollTop(0);
  const privPanel = await privacyShot('panel.png');
  await evaluate("(() => { const page = document.querySelector('.psup-page'); if (page) page.scrollTop = page.scrollHeight; return true; })()");
  await sleep(700);
  const privBottom = await privacyShot('panel-bottom.png');
  await evaluate("(() => { const page = document.querySelector('.psup-page'); if (page) page.scrollTop = Math.round((page.scrollHeight - page.clientHeight) * 0.45); return true; })()");
  await sleep(500);
  const privMiddle = await privacyShot('panel-middle.png');
  await setPanelScrollTop(0);
  await evaluate("(() => { const el = document.querySelectorAll('.psup-mode-option')[1]; if (el) el.click(); return !!el; })()");
  await sleep(900);
  const privMode = await privacyShot('panel-mode-strict.png');
  await evaluate("(() => { const el = document.querySelectorAll('.psup-mode-option')[0]; if (el) el.click(); return true; })()");
  await sleep(500);
  await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="requirementInterview"]');
    const row = sw ? sw.closest('.psup-switch-row') : null;
    if (row) row.scrollIntoView({ block: 'center' });
    if (sw) sw.click();
    return !!sw;
  })()`);
  await sleep(1000);
  const privInterview = await privacyShot('panel-interview-off.png');
  await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="requirementInterview"]');
    if (sw) sw.click();
    return !!sw;
  })()`);
  console.log('  - privacy screenshots:', [privPanel, privBottom, privMiddle, privMode, privInterview].join(' '));

  console.log('PASS e2e supervisor panel');
  console.log('  - panel screenshot:', panelShot);
  console.log('  - bottom screenshot:', bottomShot);
  console.log('  - actions screenshot:', actionsShot);
  console.log('  - mode screenshot   :', modeShot);
  console.log('  - copy toast:', toastText.trim());
  console.log('  - full screenshot :', fullShot);
  console.log('  - middle screenshot:', middleShot);
  console.log('  - page metrics:', JSON.stringify(pageMetrics));
  console.log('  - default zones screenshot:', defaultZoneShot);
  console.log('  - check rows / project chips:', checkRows);
  console.log('  - chip labels:', parsedChips.labels.join(' | '));
  console.log('  - workspace score:', glowScore);
  console.log('  - contrast/progress:', contrast);
  console.log('  - runtime exceptions:', problems.length ? problems.join(' | ') : 'none');
  console.log('  - console errors:', consoleErrors.length ? consoleErrors.slice(0, 5).join(' | ') : 'none');
  // host 半侧未重启时 config 端点 404/405 属于预期的 localStorage 兜底路径，不算回归失败
  const isExpectedConfigNoise = (text) =>
    /dsh-project-supervisor\/(config|models)/.test(text) && /(400|404|405)/.test(text);
  const unexpectedProblems = problems.filter((p) => !isExpectedConfigNoise(p));
  const unexpectedConsoleErrors = consoleErrors.filter((err) => !isExpectedConfigNoise(err));
  console.log('  - unexpected problems:', unexpectedProblems.length ? unexpectedProblems.join(' | ') : 'none');
  assert.equal(unexpectedProblems.length, 0, `unexpected runtime problems: ${unexpectedProblems.join(' | ')}`);
  assert.equal(unexpectedConsoleErrors.length, 0, `unexpected console errors: ${unexpectedConsoleErrors.join(' | ')}`);
} finally {
  try {
    socket.close();
  } catch {}
  chrome.kill('SIGKILL');
  await sleep(300);
  try {
    fs.rmSync(profileDir, { recursive: true, force: true });
  } catch {}
}
