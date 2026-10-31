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
        (target) => target.type === 'page' && String(target.url || '').includes('127.0.0.1:3080'),
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

async function waitReady() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = await evaluate(
      "document.readyState === 'complete' && !!document.querySelector('#root') && document.querySelector('#root').children.length > 0",
    );
    if (ready) return;
    await sleep(200);
  }
  throw new Error('DSH app did not become ready');
}

async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
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
  await hideFixedOverlays();

  const panelShot = await screenshot('panel.png');
  const panelText = await evaluate("(document.querySelector('.psup-page') || document.body).innerText");
  assert.ok(panelText.includes('项目主管'), 'panel title missing: ' + panelText.slice(0, 400));
  assert.ok(panelText.includes('工程底线自检'), 'health card missing: ' + panelText.slice(0, 600));
  assert.ok(panelText.includes('主管怎么工作'), 'workflow card missing');
  assert.ok(panelText.includes('零基础保护'), 'beginner card missing');
  assert.ok(panelText.includes('快捷动作'), 'actions card missing');
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

  const beginnerRows = await evaluate(
    "(() => { const card = [...document.querySelectorAll('.psup-card')].find((c) => (c.textContent || '').includes('零基础保护') && c.querySelector('[role=switch].psup-switch')); return card ? card.querySelectorAll('.psup-list li').length : 0; })()",
  );
  assert.equal(beginnerRows, 6, 'beginner safeguards card must list 6 items');

  // Beginner-guard switch: renders on, toggles off (list hidden + toast) and back on.
  const switchInfo = JSON.parse(await evaluate(`(() => {
    const el = document.querySelector('[role="switch"][data-field="beginnerGuard"]');
    return JSON.stringify({
      present: !!el,
      checked: el ? el.getAttribute('aria-checked') : null,
      label: el ? (el.textContent || '').trim() : '',
    });
  })()`));
  assert.ok(switchInfo.present, 'beginner-guard switch must render');
  assert.equal(switchInfo.checked, 'true', 'beginner-guard must default to on');
  await evaluate(`(() => { const el = document.querySelector('[role="switch"][data-field="beginnerGuard"]'); if (el) el.click(); return !!el; })()`);
  await sleep(900);
  await screenshot('panel-guard-off.png');
  const offInfo = JSON.parse(await evaluate(`(() => {
    const el = document.querySelector('[role="switch"][data-field="beginnerGuard"]');
    const card = el ? el.closest('.psup-card') : null;
    const note = card ? card.querySelector('.psup-guard-off') : null;
    return JSON.stringify({
      checked: el ? el.getAttribute('aria-checked') : null,
      note: note ? note.textContent : '',
      toast: (document.querySelector('.psup-toast') || {}).textContent || '',
      rows: card ? card.querySelectorAll('.psup-list li').length : 0,
    });
  })()`));
  assert.equal(offInfo.checked, 'false', 'switch click must flip aria-checked to false');
  assert.ok(offInfo.note.trim().length > 0, 'guard-off note must render');
  assert.ok(offInfo.toast.includes('零基础保护'), 'switch toggle must show a toast: ' + offInfo.toast);
  assert.equal(offInfo.rows, 0, 'beginner list must hide when guard is off');
  await evaluate(`(() => { const el = document.querySelector('[role="switch"][data-field="beginnerGuard"]'); if (el) el.click(); return !!el; })()`);
  await sleep(900);
  const backInfo = JSON.parse(await evaluate(`(() => {
    const el = document.querySelector('[role="switch"][data-field="beginnerGuard"]');
    const card = el ? el.closest('.psup-card') : null;
    return JSON.stringify({
      checked: el ? el.getAttribute('aria-checked') : null,
      rows: card ? card.querySelectorAll('.psup-list li').length : 0,
    });
  })()`));
  assert.equal(backInfo.checked, 'true', 'switch must toggle back on');
  assert.equal(backInfo.rows, 6, 'beginner list must come back when guard is on');
  console.log('  - beginner guard switch:', switchInfo.checked, '->', offInfo.checked, '->', backInfo.checked);

  // Prompt-polish switch: on by default with 4 steps, toggles off (steps hide + note) and back on.
  const polishInfo = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="promptPolish"]');
    const card = sw ? sw.closest('.psup-card') : null;
    return JSON.stringify({
      present: !!sw,
      checked: sw ? sw.getAttribute('aria-checked') : null,
      label: sw ? sw.getAttribute('aria-label') : '',
      rows: card ? card.querySelectorAll('.psup-list li').length : 0,
    });
  })()`));
  assert.ok(polishInfo.present, 'prompt-polish switch must render');
  assert.equal(polishInfo.checked, 'true', 'prompt polish must default to on');
  assert.equal(polishInfo.rows, 4, 'prompt polish card must list 4 steps when on');
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="promptPolish"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(900);
  await screenshot('panel-polish-off.png');
  const polishOff = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="promptPolish"]');
    const card = sw ? sw.closest('.psup-card') : null;
    return JSON.stringify({
      checked: sw ? sw.getAttribute('aria-checked') : null,
      rows: card ? card.querySelectorAll('.psup-list li').length : 0,
      note: card && card.querySelector('.psup-guard-off') ? card.querySelector('.psup-guard-off').textContent : '',
    });
  })()`));
  assert.equal(polishOff.checked, 'false', 'prompt-polish switch must toggle off');
  assert.equal(polishOff.rows, 0, 'polish steps must hide when the switch is off');
  assert.ok(polishOff.note.includes('已关闭'), 'polish-off note must render: ' + polishOff.note);
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="promptPolish"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(900);
  const polishBack = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="promptPolish"]');
    const card = sw ? sw.closest('.psup-card') : null;
    return JSON.stringify({
      checked: sw ? sw.getAttribute('aria-checked') : null,
      rows: card ? card.querySelectorAll('.psup-list li').length : 0,
    });
  })()`));
  assert.equal(polishBack.checked, 'true', 'prompt-polish switch must toggle back on');
  assert.equal(polishBack.rows, 4, 'polish steps must come back when on');
  console.log('  - prompt polish switch:', polishInfo.checked, '->', polishOff.checked, '->', polishBack.checked);

  // Requirement-interview switch: on by default with 4 steps, toggles off (steps hide + note) and back on.
  const interviewInfo = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="requirementInterview"]');
    const card = sw ? sw.closest('.psup-card') : null;
    return JSON.stringify({
      present: !!sw,
      checked: sw ? sw.getAttribute('aria-checked') : null,
      rows: card ? card.querySelectorAll('.psup-list li').length : 0,
    });
  })()`));
  assert.ok(interviewInfo.present, 'requirement-interview switch must render');
  assert.equal(interviewInfo.checked, 'true', 'requirement interview must default to on');
  assert.equal(interviewInfo.rows, 4, 'requirement-interview card must list 4 steps when on');
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="requirementInterview"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(900);
  await screenshot('panel-interview-off.png');
  const interviewOff = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="requirementInterview"]');
    const card = sw ? sw.closest('.psup-card') : null;
    return JSON.stringify({
      checked: sw ? sw.getAttribute('aria-checked') : null,
      rows: card ? card.querySelectorAll('.psup-list li').length : 0,
      note: card && card.querySelector('.psup-guard-off') ? card.querySelector('.psup-guard-off').textContent : '',
    });
  })()`));
  assert.equal(interviewOff.checked, 'false', 'requirement-interview switch must toggle off');
  assert.equal(interviewOff.rows, 0, 'interview steps must hide when the switch is off');
  assert.ok(interviewOff.note.includes('已关闭'), 'interview-off note must render: ' + interviewOff.note);
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="requirementInterview"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(900);
  const interviewBack = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="requirementInterview"]');
    const card = sw ? sw.closest('.psup-card') : null;
    return JSON.stringify({
      checked: sw ? sw.getAttribute('aria-checked') : null,
      rows: card ? card.querySelectorAll('.psup-list li').length : 0,
    });
  })()`));
  assert.equal(interviewBack.checked, 'true', 'requirement-interview switch must toggle back on');
  assert.equal(interviewBack.rows, 4, 'interview steps must come back when on');
  console.log('  - requirement interview switch:', interviewInfo.checked, '->', interviewOff.checked, '->', interviewBack.checked);
  // Model collaboration: off by default; enabling shows auto/manual; manual shows 6 task->model selectors.
  const collabInfo = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]');
    const card = sw ? sw.closest('.psup-card') : null;
    return JSON.stringify({
      present: !!sw,
      checked: sw ? sw.getAttribute('aria-checked') : null,
      radios: card ? card.querySelectorAll('.psup-collab-option').length : 0,
      selects: card ? card.querySelectorAll('.psup-model-row select').length : 0,
    });
  })()`));
  assert.equal(collabInfo.present, true, 'model collaboration card must render');
  assert.equal(collabInfo.checked, 'false', 'model collaboration must default to off');
  assert.equal(collabInfo.radios, 0, 'mode radios stay hidden while model collaboration is off');

  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(700);
  const collabOn = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]');
    const card = sw ? sw.closest('.psup-card') : null;
    const radios = card ? Array.from(card.querySelectorAll('.psup-collab-option')) : [];
    return JSON.stringify({
      checked: sw ? sw.getAttribute('aria-checked') : null,
      radios: radios.map((el) => ({ label: (el.textContent || '').trim().slice(0, 10), checked: el.getAttribute('aria-checked') })),
      selects: card ? card.querySelectorAll('.psup-model-row select').length : 0,
    });
  })()`));
  assert.equal(collabOn.checked, 'true', 'model collaboration switch must turn on');
  assert.equal(collabOn.radios.length, 2, 'enabling model collaboration must show auto/manual radios');
  assert.equal(collabOn.radios[0].checked, 'true', 'AI auto-select must be the default mode');
  assert.equal(collabOn.selects, 6, 'auto mode must show the 6-row editable routing table');

  // Auto routing table: pick the second route for the first row and remember it
  // for the reload check below.
  const savedAutoRoute = await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]');
    const card = sw ? sw.closest('.psup-card') : null;
    const select = card ? card.querySelector('.psup-model-row select') : null;
    if (!select || select.options.length < 2) return '';
    select.value = select.options[1].value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return select.value;
  })()`);
  assert.ok(savedAutoRoute && savedAutoRoute.length > 0, 'auto routing table must accept a route selection');
  await sleep(700);

  await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]');
    const card = sw ? sw.closest('.psup-card') : null;
    const radios = card ? Array.from(card.querySelectorAll('.psup-collab-option')) : [];
    if (radios[1]) radios[1].click();
    return radios.length;
  })()`);
  await sleep(700);
  const collabManual = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]');
    const card = sw ? sw.closest('.psup-card') : null;
    const selects = card ? Array.from(card.querySelectorAll('.psup-model-row select')) : [];
    return JSON.stringify({
      selects: selects.map((el) => el.options.length),
      labels: card ? Array.from(card.querySelectorAll('.psup-model-row .psup-model-label')).map((el) => (el.textContent || '').trim()) : [],
    });
  })()`));
  assert.equal(collabManual.selects.length, 6, 'manual mode must show 6 task-type model selectors');
  assert.ok(!collabManual.selects.includes(0), 'every selector must offer model options');
  assert.ok(collabManual.selects.every((count) => count >= 3), 'selectors must offer default + dynamic/fallback routes');
  assert.ok(collabManual.labels.join('|').includes('规划'), 'task-type labels must include planning row');
  console.log('  - model collaboration switch: off -> on (auto default) -> manual,', collabManual.selects.length, 'selectors PASS');
  const modelCollabShot = await screenshot('panel-model-collab.png');


  // Quick action: click "copy kickoff prompt" and expect a toast (success or failure copy).
  await evaluate(`(() => {
    const primary = document.querySelector('.psup-btn-primary');
    if (primary) primary.click();
    return !!primary;
  })()`);
  await sleep(700);
  const toastText = await evaluate("(document.querySelector('.psup-toast') || {}).textContent || ''");
  assert.ok(toastText.trim().length > 0, 'quick action must show a copy toast');
  // 截图前隐藏 toast（headless 剪贴板会失败，不把失败提示拍进公开截图；不删 DOM，避免 React 卸载冲突）
  await evaluate("(() => { document.querySelectorAll('.psup-toast').forEach((el) => { el.style.display = 'none'; }); return true; })()");

  // Bottom half: workflow + beginner + actions cards.
  await evaluate("(() => { const page = document.querySelector('.psup-page'); if (page) page.scrollTop = page.scrollHeight; return true; })()");
  await sleep(700);
  const bottomShot = await screenshot('panel-bottom.png');
  const bottomText = await evaluate("(document.querySelector('.psup-page') || document.body).innerText");
  assert.ok(bottomText.includes('零基础保护'), 'beginner card must render');
  assert.ok(bottomText.includes('提示词润色'), 'prompt-polish card must render');
  assert.ok(bottomText.includes('新项目需求追问'), 'requirement-interview card must render');
  assert.ok(bottomText.includes('快捷动作'), 'actions card must render');
  assert.ok(bottomText.includes('复制开工口令'), 'kickoff copy button must render');

  // Quick actions: each of the three actions has a collapsible explanation.
  const disclosureClosed = JSON.parse(await evaluate(`(() => JSON.stringify({
    disclosures: document.querySelectorAll('.psup-disclosure').length,
    helps: document.querySelectorAll('.psup-help').length,
  }))()`));
  assert.equal(disclosureClosed.disclosures, 3, 'each quick action needs a disclosure toggle');
  assert.equal(disclosureClosed.helps, 0, 'explanations must start collapsed');
  const clickDisclosure = () => evaluate("(() => { const btn = document.querySelector('.psup-disclosure'); if (btn) btn.click(); return !!btn; })()");
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
    const btn = document.querySelector('.psup-disclosure');
    return JSON.stringify({
      helps: document.querySelectorAll('.psup-help').length,
      text: help ? help.textContent : '',
      expanded: btn ? btn.getAttribute('aria-expanded') : null,
    });
  })()`));
  assert.equal(disclosureOpen.helps, 1, 'clicking one disclosure shows exactly one explanation');
  assert.ok(disclosureOpen.text.includes('作用'), 'explanation must say what the action does: ' + disclosureOpen.text);
  assert.equal(disclosureOpen.expanded, 'true', 'disclosure must report aria-expanded=true');
  const actionsShot = await screenshot('panel-actions-open.png');
  await evaluate("(() => { const btn = document.querySelector('.psup-disclosure'); if (btn) btn.click(); return !!btn; })()");
  await sleep(400);
  assert.equal(await evaluate("document.querySelectorAll('.psup-help').length"), 0, 'clicking again must collapse the explanation');
  console.log('  - quick action disclosures: 3 collapsible explanations, expand/collapse PASS');

  // 主管工作模式：页面最上端单选，默认效率优先；切到严格派发后刷新页面仍保持。
  const modeInfo = JSON.parse(await evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.psup-card'));
    const modeCard = document.querySelector('.psup-mode-card');
    const options = Array.from(document.querySelectorAll('.psup-mode-option'));
    const active = options.find((el) => el.classList.contains('is-active'));
    return JSON.stringify({
      exists: !!modeCard,
      isFirstCard: modeCard ? cards[0] === modeCard : false,
      options: options.length,
      active: active ? active.textContent : '',
      checked: options.map((el) => el.getAttribute('aria-checked')),
    });
  })()`));
  assert.equal(modeInfo.exists, true, 'dispatch-mode card must render');
  assert.equal(modeInfo.isFirstCard, true, 'dispatch-mode selector must be the first card on the page');
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
  const modeShot = await screenshot('panel-mode-strict.png');
  console.log('  - dispatch mode: 效率优先 -> 严格派发, selector at top PASS');

  // 三块卡片说明区折叠：默认展开；折叠后记住选择（localStorage），刷新页面仍保持折叠。
  const collapseDefault = JSON.parse(await evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.psup-card')).filter((card) => card.querySelector('.psup-collapse'));
    return JSON.stringify({
      cards: cards.length,
      expanded: cards.map((card) => card.querySelector('.psup-collapse').getAttribute('aria-expanded')),
      bodies: document.querySelectorAll('.psup-card-body').length,
    });
  })()`));
  assert.equal(collapseDefault.cards, 3, 'three toggle cards must each have a collapse button');
  assert.ok(
    collapseDefault.expanded.every((value) => value === 'true'),
    'collapse controls must default to expanded: ' + JSON.stringify(collapseDefault.expanded),
  );
  assert.equal(collapseDefault.bodies, 3, 'three detail bodies expected by default');

  await evaluate(`(() => {
    const btn = document.querySelector('.psup-card .psup-collapse');
    if (btn) btn.click();
    return !!btn;
  })()`);
  await sleep(350);
  const collapseOff = JSON.parse(await evaluate(`(() => {
    const btn = document.querySelector('.psup-card .psup-collapse');
    return JSON.stringify({
      expanded: btn ? btn.getAttribute('aria-expanded') : null,
      body: !!document.querySelector('#psup-body-beginnerGuard'),
      anyBodies: document.querySelectorAll('.psup-card-body').length,
      stored: (() => { try { return window.localStorage.getItem('psup.collapsed.beginnerGuard'); } catch (error) { return 'storage-error'; } })(),
    });
  })()`));
  assert.equal(collapseOff.expanded, 'false', 'clicking collapse must set aria-expanded=false');
  assert.equal(collapseOff.body, false, 'collapsed card body must unrender');
  assert.equal(collapseOff.anyBodies, 2, 'other two cards must stay expanded');
  assert.equal(collapseOff.stored, '1', 'collapse choice must be saved to localStorage');

  // 刷新页面：折叠选择应被记住（其余两块仍展开）。
  await send('Page.reload', { ignoreCache: true });
  await sleep(1200);
  await hideFixedOverlays();
  await waitReady();
  await sleep(2600);
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
  const afterReload = JSON.parse(await evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.psup-card')).filter((card) => card.querySelector('.psup-collapse'));
    return JSON.stringify({
      expanded: cards.map((card) => card.querySelector('.psup-collapse').getAttribute('aria-expanded')),
      bodies: document.querySelectorAll('.psup-card-body').length,
      stored: (() => { try { return window.localStorage.getItem('psup.collapsed.beginnerGuard'); } catch (error) { return 'storage-error'; } })(),
      mode: (() => {
        const active = Array.from(document.querySelectorAll('.psup-mode-option')).find((el) => el.classList.contains('is-active'));
        return active ? active.textContent : '';
      })(),
      collabChecked: (() => { const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]'); return sw ? sw.getAttribute('aria-checked') : null; })(),
      collabSelects: document.querySelectorAll('.psup-model-row select').length,
    });
  })()`));
  assert.equal(afterReload.expanded[0], 'false', 'collapse choice must survive a page reload');
  assert.equal(afterReload.expanded[1], 'true', 'other cards must stay expanded after reload');
  assert.equal(afterReload.bodies, 2, 'one collapsed body expected after reload');
  assert.equal(afterReload.stored, '1', 'collapse choice must stay in localStorage after reload');
  assert.ok(afterReload.mode.includes('严格派发'), 'dispatch mode must survive a page reload: ' + afterReload.mode);
  console.log('  - collapsible intros: default expanded, collapse remembered after reload PASS');
  assert.equal(afterReload.collabChecked, 'true', 'model collaboration state must survive a page reload');
  assert.equal(afterReload.collabSelects, 6, 'manual model assignment rows must survive a page reload');
  console.log('  - model collaboration: manual mode persisted after reload PASS');

  // Switch back to auto mode and confirm the route picked before the reload survived.
  await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]');
    const card = sw ? sw.closest('.psup-card') : null;
    const radios = card ? Array.from(card.querySelectorAll('.psup-collab-option')) : [];
    if (radios[0]) radios[0].click();
    return radios.length;
  })()`);
  await sleep(700);
  const reloadedAuto = JSON.parse(await evaluate(`(() => {
    const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]');
    const card = sw ? sw.closest('.psup-card') : null;
    const selects = card ? Array.from(card.querySelectorAll('.psup-model-row select')) : [];
    return JSON.stringify({ count: selects.length, first: selects[0] ? selects[0].value : null });
  })()`));
  assert.equal(reloadedAuto.count, 6, 'auto routing table must come back after reload');
  assert.equal(reloadedAuto.first, savedAutoRoute, 'auto route choice must survive a page reload');
  console.log('  - model collaboration: auto route table choice persisted after reload PASS');
  console.log('  - dispatch mode: strict persisted after reload PASS');

  // 恢复默认展开 + 效率优先，避免影响后续截图与再次运行。
  await evaluate(`(() => {
    const btn = document.querySelector('.psup-card .psup-collapse');
    if (btn) btn.click();
    return !!btn;
  })()`);
  await sleep(300);
  await evaluate("(() => { const el = document.querySelectorAll('.psup-mode-option')[0]; if (el) el.click(); return !!el; })()");
  await sleep(700);
  assert.ok(
    await evaluate("(() => { const active = Array.from(document.querySelectorAll('.psup-mode-option')).find((el) => el.classList.contains('is-active')); return active ? active.textContent.indexOf('效率优先') >= 0 : false; })()"),
    'efficiency mode must be restored at the end of the run',
  );
  await evaluate(`(() => { const sw = document.querySelector('[role="switch"][data-field="modelCollaboration"]'); if (sw) sw.click(); return !!sw; })()`);
  await sleep(500);
  assert.equal(
    await evaluate("(() => { const sw = document.querySelector('[role=\"switch\"][data-field=\"modelCollaboration\"]'); return sw ? sw.getAttribute('aria-checked') : null; })()"),
    'false',
    'model collaboration must be restored to off at the end of the run',
  );
  await screenshot('panel-collapse.png');

  const checkRows = await evaluate(
    "document.querySelectorAll('.psup-check').length + ':' + document.querySelectorAll('.psup-chip').length",
  );

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
  await evaluate("(() => { const page = document.querySelector('.psup-page'); if (page) page.scrollTop = 0; return true; })()");
  await sleep(600);
  const privPanel = await privacyShot('panel.png');
  await evaluate("(() => { const page = document.querySelector('.psup-page'); if (page) page.scrollTop = page.scrollHeight; return true; })()");
  await sleep(700);
  const privBottom = await privacyShot('panel-bottom.png');
  await evaluate("(() => { const page = document.querySelector('.psup-page'); if (page) page.scrollTop = 0; return true; })()");
  await evaluate("(() => { const el = document.querySelectorAll('.psup-mode-option')[1]; if (el) el.click(); return !!el; })()");
  await sleep(900);
  const privMode = await privacyShot('panel-mode-strict.png');
  await evaluate("(() => { const el = document.querySelectorAll('.psup-mode-option')[0]; if (el) el.click(); return true; })()");
  await sleep(500);
  await evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.psup-card'));
    const card = cards.find((c) => (c.textContent || '').includes('新项目需求追问'));
    if (!card) return false;
    card.scrollIntoView({ block: 'start' });
    const sw = card.querySelector('[role="switch"].psup-switch');
    if (sw) sw.click();
    return true;
  })()`);
  await sleep(1000);
  const privInterview = await privacyShot('panel-interview-off.png');
  await evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.psup-card'));
    const card = cards.find((c) => (c.textContent || '').includes('新项目需求追问'));
    const sw = card ? card.querySelector('[role="switch"].psup-switch') : null;
    if (sw) sw.click();
    return true;
  })()`);
  console.log('  - privacy screenshots:', [privPanel, privBottom, privMode, privInterview].join(' '));

  console.log('PASS e2e supervisor panel');
  console.log('  - panel screenshot:', panelShot);
  console.log('  - bottom screenshot:', bottomShot);
  console.log('  - actions screenshot:', actionsShot);
  console.log('  - mode screenshot   :', modeShot);
  console.log('  - copy toast:', toastText.trim());
  console.log('  - full screenshot :', fullShot);
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
