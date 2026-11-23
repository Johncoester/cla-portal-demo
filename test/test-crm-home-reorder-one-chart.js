/* Tracker row 414 / Feedback 31b: Reorder with one Home chart, and a save that is still running.
   Fake data only. No network and no hosted database.
   Run: unshare -rn node --import ./test/register-supabase-fake.mjs test/test-crm-home-reorder-one-chart.js */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { resetHomeChartsProbe } from '../js/data/crm-home-charts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
const sleep = () => new Promise((r) => setTimeout(r, 0));
const ONE_NOTE = 'Add another chart to Home to reorder. There is only one.';

const css = read('css/portal.css');
const rule = '[data-home-charts] .ghost:disabled, [data-home-charts] .ghost:disabled:hover { opacity: .45; cursor: not-allowed; box-shadow: none; background: var(--surface); border-color: var(--line-2); color: var(--ink-2); }';
ok(css.includes(rule), 'a disabled Move button on a Home chart is greyed out');
ok(!/(^|\n)\.ghost:disabled\b/.test(css), 'the disabled look is not a global ghost rule');
const theme = read('css/theme-cards.css');
ok(theme.includes('body.theme-cards .ghost') && !theme.includes('.ghost:disabled') && !theme.includes('[data-home-charts]'), 'the card theme does not override the Home chart disabled look');

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.confirm = () => true;
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
if (selectValue) Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true, get() { return selectValue.get.call(this); },
  set(v) { const want = String(v); [...this.options].forEach((o) => { if (o.getAttribute('value') === want || o.value === want) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); } });

const { homePage } = await import('../js/pages/crm-home.js');
const { toText } = await import('../js/ui.js');

function boot() {
  resetHomeChartsProbe();
  const session = mem();
  globalThis.sessionStorage = session;
  window.sessionStorage = session;
  const api = createMockAdapter({ storage: mem(), sessionStorage: session, features: { crm: true } });
  return { api, ready: api.signInDev('u-admin') };
}

async function openHome(api, me, cfg) {
  const page = await homePage({ api, me, params: {}, cfg, refresh() {}, assignees: [] });
  const host = document.getElementById('app');
  host.innerHTML = toText(page.body);
  page.mount(host);
  await page.chartsReady();
  return host;
}

const one = boot();
await one.ready;
const me = await one.api.crmMe();
const cfg = await one.api.getCrmSettings();
await one.api.addCrmHomeChart('dc-l1');
const alone = await openHome(one.api, me, cfg);
const aloneBtn = alone.querySelector('[data-home-reorder]');
const aloneNote = alone.querySelector('[data-home-reorder-note]');
ok(!!alone.querySelector('[data-home-chart]') && alone.querySelectorAll('[data-home-chart]').length === 1, 'this Home has one chart');
ok(aloneBtn && aloneBtn.disabled && aloneNote && !aloneNote.hidden && aloneNote.textContent === ONE_NOTE, 'Reorder is not offered with one chart, and the note says to add another');
aloneBtn.click();
ok([...alone.querySelectorAll('[data-home-up], [data-home-down]')].every((b) => b.hidden) && !alone.querySelector('[data-home-reordering]'), 'a click on Reorder with one chart does not open Move up or Move down');

const two = boot();
await two.ready;
const me2 = await two.api.crmMe();
const cfg2 = await two.api.getCrmSettings();
await two.api.addCrmHomeChart('dc-l1');
await two.api.addCrmHomeChart('dc-l2');
const host = await openHome(two.api, me2, cfg2);
const offer = host.querySelector('[data-home-reorder]');
ok(offer && !offer.disabled && host.querySelector('[data-home-reorder-note]').hidden, 'Reorder is offered when there are two charts');
offer.click();
ok(host.querySelector('[data-home-reordering]') && [...host.querySelectorAll('[data-home-up]')].every((b) => !b.hidden), 'Reorder is open');
host.querySelector('[data-home-remove]').click();
await sleep();
const left = host.querySelectorAll('[data-home-chart]');
const afterBtn = host.querySelector('[data-home-reorder]');
const afterNote = host.querySelector('[data-home-reorder-note]');
ok(left.length === 1 && !host.querySelector('[data-home-reordering]') && host.querySelector('[data-home-up]').hidden && host.querySelector('[data-home-reorder-done]').hidden && !host.querySelector('[data-home-menu]').hidden, 'removing down to one chart ends Reorder');
ok(afterBtn && afterBtn.disabled && afterNote && !afterNote.hidden && afterNote.textContent === ONE_NOTE, 'one chart left shows the same note and greys out Reorder');

const moveBoot = boot();
await moveBoot.ready;
const me3 = await moveBoot.api.crmMe();
const cfg3 = await moveBoot.api.getCrmSettings();
await moveBoot.api.addCrmHomeChart('dc-l1');
await moveBoot.api.addCrmHomeChart('dc-l2');
const moving = await openHome(moveBoot.api, me3, cfg3);
moving.querySelector('[data-home-reorder]').click();
const before = [...moving.querySelectorAll('[data-home-chart]')].map((el) => el.dataset.homeChart);
let calls = 0;
let gate;
const orig = moveBoot.api.reorderCrmHomeCharts.bind(moveBoot.api);
moveBoot.api.reorderCrmHomeCharts = (ids) => {
  calls += 1;
  return new Promise((resolve) => { gate = { ids: ids.slice(), resolve }; });
};
const down = moving.querySelector('[data-home-down]');
down.click();
const moves = () => [...moving.querySelectorAll('[data-home-up], [data-home-down]')];
ok(calls === 1 && moves().length >= 2 && moves().every((b) => b.disabled), 'every Move button is disabled while the save is still running');
down.click();
moving.querySelector('[data-home-up]').click();
ok(calls === 1, 'a second click during that save does not start another save');
await orig(gate.ids);
gate.resolve();
await sleep();
const afterMove = moves();
const ups = [...moving.querySelectorAll('[data-home-up]')];
const downs = [...moving.querySelectorAll('[data-home-down]')];
ok(afterMove.some((b) => !b.disabled) && ups[0].disabled && !downs[0].disabled && downs[downs.length - 1].disabled && !ups[ups.length - 1].disabled, 'when the save finishes, the end buttons stay grey and the others work again');
ok([...moving.querySelectorAll('[data-home-chart]')].map((el) => el.dataset.homeChart).join() !== before.join(), 'the one save still moved the chart');

const shown = [...moving.querySelectorAll('[data-home-chart]')].map((el) => el.dataset.homeChart);
moveBoot.api.reorderCrmHomeCharts = () => Promise.reject(new Error('db down'));
moving.querySelector('[data-home-down]').click();
ok(moves().every((b) => b.disabled), 'a save that is about to fail still greys out the Move buttons');
await sleep();
ok([...moving.querySelectorAll('[data-home-chart]')].map((el) => el.dataset.homeChart).join() === shown.join() && moves().some((b) => !b.disabled), 'a failed save puts the charts back and turns the Move buttons back on');
const ups2 = [...moving.querySelectorAll('[data-home-up]')];
const downs2 = [...moving.querySelectorAll('[data-home-down]')];
ok(ups2[0].disabled && downs2[downs2.length - 1].disabled && !downs2[0].disabled, 'after a failed save the top Move up and the bottom Move down are grey again');

console.log(fail ? fail + ' failed' : 'crm home reorder one chart passed');
if (fail) process.exit(1);
