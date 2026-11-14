/* TB-2 Task Builder form (John, Nov 13 2026): an admin builds the EMD reminder in the New flow window: trigger + days, which files,
 * and steps added, changed, moved and removed. A mistake shows in the window and nothing typed is lost. Runs in a DOM (linkedom). */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>');
globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
globalThis.location = { origin: 'https://test.example', pathname: '/portal/', hash: '#/task-builder', reload() {} };
globalThis.FormData = class { constructor(form) { this._v = {}; form.querySelectorAll('[name]').forEach((el) => { if (!el.disabled) this._v[el.name] = el.value || ''; }); } entries() { return Object.entries(this._v); } };
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true, get() { return selectValue.get.call(this); },
  set(v) { const want = String(v); [...this.options].forEach((o) => { if (o.getAttribute('value') === want) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); } });
globalThis.confirm = () => true;

const { createMockAdapter } = await import('../js/data/mock-adapter.js');
const { toText } = await import('../js/ui.js');
const { render } = await import('../js/pages/task-builder.js');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
const set = (el, v) => { el.value = v; fire(el, 'input'); fire(el, 'change'); };
const wait = () => new Promise((r) => setTimeout(r, 0));

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const user = { id: 'u-admin', role: 'Super admin', isAdmin: true, status: 'active' };
let refreshed = 0;
async function show() { const app = document.getElementById('app'); const v = await render({ api, user, refresh() { refreshed++; } }); app.innerHTML = toText(v.body); v.mount(app); return app; }
const app = await show();
app.querySelector('[data-tb-new]').click();
const m = document.getElementById('modal');
ok(!!m && !!m.querySelector('[data-tb-steps-box]') && !!m.querySelector('[data-tb-conds]'), 'New flow opens with Which files and Steps');
set(m.querySelector('[data-tb-name-input]'), 'EMD reminder');
set(m.querySelector('[data-tb-trigger-input]'), 'emd_not_received');
ok(!m.querySelector('[data-tb-days]').hidden, 'EMD not received shows the Days box');
set(m.querySelector('[data-tb-days-input]'), '2');
m.querySelector('[data-tb-cond="states"][value="MD"]').checked = true;
const add = m.querySelector('[data-tb-add-step]');
add.click(); add.click(); add.click();
ok(m.querySelectorAll('[data-tb-step]').length === 3, 'three steps added');
let s1 = m.querySelector('[data-tb-step="0"]');
set(s1.querySelector('[data-tb-step-field="title"]'), 'Chase the EMD');
set(s1.querySelector('[data-tb-step-field="assignTo"]'), 'Buyer Agent');
set(m.querySelector('[data-tb-step="1"] [data-tb-step-type]'), 'wait');
set(m.querySelector('[data-tb-step="1"] [data-tb-step-field="days"]'), '1');
set(m.querySelector('[data-tb-step="2"] [data-tb-step-type]'), 'call_task');
const s3 = m.querySelector('[data-tb-step="2"]');
set(s3.querySelector('[data-tb-step-field="title"]'), 'Call about the EMD');
set(s3.querySelector('[data-tb-step-field="assignTo"]'), 'Processor');
set(s3.querySelector('[data-tb-step-field="dueDays"]'), '0');
// insert "stop if EMD received" before the call: add at the end, move it up once
add.click();
set(m.querySelector('[data-tb-step="3"] [data-tb-step-type]'), 'stop_if_emd_received');
m.querySelector('[data-tb-step="3"] [data-tb-step-up]').click();
ok(m.querySelector('[data-tb-step="2"] [data-tb-step-type]').value === 'stop_if_emd_received' && m.querySelector('[data-tb-step="3"] [data-tb-step-field="title"]').value === 'Call about the EMD', 'moving a step up keeps what was typed');
ok(m.querySelector('[data-tb-step="0"] [data-tb-step-field="title"]').value === 'Chase the EMD', 'redrawing keeps the first step');

// a mistake: blank the first task name
set(m.querySelector('[data-tb-step="0"] [data-tb-step-field="title"]'), '');
fire(m.querySelector('#tbf'), 'submit'); await wait(); await wait();
const errBox = m.querySelector('[data-tb-err]');
ok(!errBox.hidden && /Step 1: give the task a name/.test(errBox.textContent) && document.getElementById('modal') === m, 'a blank task name shows "Step 1: give the task a name" and the window stays open');
ok(m.querySelector('[data-tb-step="3"] [data-tb-step-field="title"]').value === 'Call about the EMD' && m.querySelector('[data-tb-name-input]').value === 'EMD reminder', 'nothing typed is lost');
set(m.querySelector('[data-tb-step="0"] [data-tb-step-field="title"]'), 'Chase the EMD');
fire(m.querySelector('#tbf'), 'submit'); await wait(); await wait(); await wait();
ok(!document.getElementById('modal') && refreshed === 1, 'saving closes the window and refreshes the list');
const flows = (await api.listTaskFlows()).flows;
const f = flows.find((x) => x.name === 'EMD reminder');
ok(f && f.active === false && f.triggerDays === 2 && f.conditions.states.join() === 'MD' && f.steps.map((s) => s.type).join() === 'create_task,wait,stop_if_emd_received,call_task', 'the flow saved Off with its days, state and four steps in order');

// remove a step while editing
const app2 = await show();
app2.querySelector(`[data-tb-edit="${f.id}"]`).click();
const m2 = document.getElementById('modal');
ok(m2.querySelectorAll('[data-tb-step]').length === 4 && m2.querySelector('[data-tb-cond="states"][value="MD"]').hasAttribute('checked'), 'Edit opens with the saved steps and states');
m2.querySelector('[data-tb-step="2"] [data-tb-step-remove]').click();
fire(m2.querySelector('#tbf'), 'submit'); await wait(); await wait(); await wait();
const f2 = (await api.listTaskFlows()).flows.find((x) => x.id === f.id);
ok(f2.steps.length === 3 && (await api.listTaskFlows()).log.some((l) => l.flowId === f.id && /steps changed \(3\)/.test(l.detail)), 'removing a step saves and shows in the history');

console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
