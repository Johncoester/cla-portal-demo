/* Task Builder TB-11, Nov 22 2026 (John): the "Task completed" trigger. A template starts when a chosen task is checked off on a file
 * (John: "if we received the EMD and we click EMD received, an automatic email should go out"). Any task can be chosen: a standard task, a task
 * another template makes, or any other task by name. Rules, the demo portal, and the window in a DOM (linkedom). Database twin:
 * test-task-flow-task-completed-sql.sh. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>');
globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
globalThis.location = { origin: 'https://test.example', pathname: '/portal/', hash: '#/task-builder', reload() {} };
globalThis.FormData = class { constructor(form) { this._v = {}; form.querySelectorAll('[name]').forEach((el) => { if (!el.disabled) this._v[el.name] = el.value || ''; }); } entries() { return Object.entries(this._v); } };
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true, get() { return selectValue.get.call(this); },
  set(v) { const want = String(v); [...this.options].forEach((o) => { if (o.getAttribute('value') === want) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); } });

const { cleanFlow, taskKeys, taskKeyMatches, taskChoices, triggerText, triggerRuns, flowsForEvent, actionLine, FROM_NOW_TRIGGERS } = await import('../js/data/task-builder.js');
const { createMockAdapter } = await import('../js/data/mock-adapter.js');
const { toText } = await import('../js/ui.js');
const { render } = await import('../js/pages/task-builder.js');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const thrown = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
const wait = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await wait(); };
const email = { type: 'send_email', sendTo: 'Client-Buyer', subject: 'We received your EMD', body: 'Hi {{recipient_first_name}}, we received your deposit.' };

// rules
ok(/Choose which task/.test(thrown(() => cleanFlow({ name: 'EMD thanks', trigger: 'task_completed', steps: [email] }))), 'Task completed needs a task');
ok(/from the list/.test(thrown(() => cleanFlow({ name: 'EMD thanks', trigger: 'task_completed', triggerTask: 'emd', steps: [email] }))), 'a task that is not a list key is refused');
const v = cleanFlow({ name: 'EMD thanks', trigger: 'task_completed', triggerTask: 'tpl:home_warranty', triggerTaskName: 'Home warranty', steps: [email] });
ok(v.triggerTask === 'tpl:home_warranty' && v.triggerTaskName === 'Home warranty', 'the task and its name are kept');
ok(cleanFlow({ name: 'Opened', trigger: 'order_opened', triggerTask: 'tpl:x', steps: [email] }).triggerTask === null, 'other triggers keep no task');
ok(triggerText('task_completed', null, 'EMD Receipt') === 'Task completed: "EMD Receipt"' && triggerRuns('task_completed') && FROM_NOW_TRIGGERS.includes('task_completed'), 'it reads "Task completed: "EMD Receipt"", runs, and needs no which-files question');
ok(JSON.stringify(taskKeys({ templateCode: 'emd', title: 'EMD  Receipt ' })) === '["tpl:emd","title:EMD Receipt"]', 'a task answers to its standard code and its name');
ok(taskKeyMatches('title:chase the emd', ['title:Chase the EMD']) && !taskKeyMatches('tpl:emd', ['title:emd']) && taskKeyMatches('tpl:emd', ['tpl:emd']), 'names match without case; codes match exactly');
ok(actionLine('task_completed', null, { type: 'send_email', at: 0, sendTo: 'Client-Buyer' }) === 'As soon as the task is checked off: email the buyer.', 'each step reads as a sentence');
const ch = taskChoices([{ code: 'a', version: 1, title: 'Old A', active: false }, { code: 'a', version: 2, title: 'Task A' }, { code: 'b', version: 1, title: 'Task B', retiredAt: 'x' }],
  [{ steps: [{ type: 'create_task', title: 'Chase the EMD' }, { type: 'call_task', title: 'task a' }, { type: 'send_email' }] }]);
ok(JSON.stringify(ch.map((c) => c.key)) === '["tpl:a","title:Chase the EMD"]', 'the list has each standard task once and each task a template makes (no repeats, no retired ones)');
ok(flowsForEvent([{ id: 'f', active: true, trigger: 'task_completed', triggerTask: 'tpl:a', steps: [email], conditions: {} }], 'task_completed', null, ['tpl:b']).length === 0, 'another task does not start it');

// the demo portal: check off a task, the email is queued
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const f = await api.createTaskFlow({ name: 'EMD thanks', trigger: 'task_completed', triggerTask: 'title:EMD received', triggerTaskName: 'EMD received', steps: [email] });
ok(f.triggerText === 'Task completed: "EMD received"' && (await api.listTaskFlows()).log.some((l) => l.flowId === f.id && /Task completed: "EMD received"/.test(l.detail)), 'saved, and History names the task');
await api.setTaskFlowActive(f.id, true);
const emdTask = await api.createTask('deal-1', { title: 'EMD received', assignedRole: 'Processor' });
const otherTask = await api.createTask('deal-1', { title: 'Order survey', assignedRole: 'Processor' });
const outN = async () => ((await api.listOutbox()) || []).filter((o) => o.subject === 'We received your EMD').length;
await api.updateTask(otherTask.id, { status: 'done' });
ok((await outN()) === 0, 'checking off another task sends nothing');
await api.updateTask(emdTask.id, { status: 'done' });
ok((await outN()) === 1, 'checking off "EMD received" queues the email straight away (John\'s example)');
await api.updateTask(emdTask.id, { status: 'todo' }); await api.updateTask(emdTask.id, { status: 'done' });
ok((await outN()) === 1, 'unchecking and checking again does not send it twice');
const g = await api.createTaskFlow({ name: 'After the chase', trigger: 'task_completed', triggerTask: 'title:chase buyer photo id', triggerTaskName: 'Chase buyer photo ID',
  steps: [{ type: 'create_task', title: 'Check the photo ID', assignTo: 'Processor', dueDays: 0 }] });
await api.setTaskFlowActive(g.id, true);
await api.updateTask('t-1-tc-id', { status: 'done' });
ok((await api.listTasks('deal-1')).some((t) => t.title === 'Check the photo ID'), 'a task matched by its name (any case) starts its template');

// the window
const user = { id: 'u-admin', role: 'Super admin', isAdmin: true, status: 'active' };
let refreshed = 0;
const app = document.getElementById('app'); const view = await render({ api, user, refresh() { refreshed++; } }); app.innerHTML = toText(view.body); view.mount(app);
ok(/Task completed: "EMD received"/.test(app.querySelector(`[data-tb-row="${f.id}"] [data-tb-trigger]`).textContent), 'the list says which task starts it');
app.querySelector('[data-tb-new]').click();
const m = document.getElementById('modal');
const box = m.querySelector('[data-tb-task]'); const pick = m.querySelector('[data-tb-task-input]');
ok(box.hidden, 'Which task is hidden until Task completed is chosen');
const trig = m.querySelector('[data-tb-trigger-input]'); trig.value = 'task_completed'; fire(trig, 'change');
const keys = [...pick.querySelectorAll('option')].map((o) => o.getAttribute('value'));
ok(!box.hidden && keys.includes('tpl:home_warranty') && keys.includes('title:Check the photo ID') && keys.includes('__other'), 'it lists standard tasks, tasks templates make, and Another task');
pick.value = '__other'; fire(pick, 'change');
const other = m.querySelector('[data-tb-task-other]');
ok(!other.hidden, 'Another task shows a box to type the task name');
m.querySelector('[data-tb-name-input]').value = 'Survey thanks'; other.value = 'Survey  received';
m.querySelector('[data-tb-add-step]').click();
const ty = m.querySelector('[data-tb-step="0"] [data-tb-step-type]'); ty.value = 'send_email'; fire(ty, 'change');
const s0 = m.querySelector('[data-tb-step="0"]');
const set = (sel, val) => { const el = s0.querySelector(sel); el.value = val; fire(el, 'input'); fire(el, 'change'); };
set('[data-tb-step-field="sendTo"]', 'Client-Buyer'); set('[data-tb-step-field="subject"]', 'Survey received'); set('[data-tb-step-field="body"]', 'We have the survey.');
fire(m.querySelector('#tbf'), 'submit'); await settle();
const saved = (await api.listTaskFlows()).flows.find((x) => x.name === 'Survey thanks');
ok(!document.getElementById('modal') && saved && saved.triggerTask === 'title:Survey received' && saved.triggerTaskName === 'Survey received', 'a typed task name saves (spacing tidied)');

console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
