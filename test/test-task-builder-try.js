/* Task Builder, Nov 14 2026 (John): "Turn on" asks new files only (default) or existing open files too, and "Try on one file" runs a
 * flow once on a chosen file. Rules, the demo portal, and both windows in a DOM (linkedom). The database twin is test-task-flow-try-sql.sh. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>');
globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
globalThis.location = { origin: 'https://test.example', pathname: '/portal/', hash: '#/task-builder', reload() {} };
globalThis.FormData = class { constructor(form) { this._v = {}; form.querySelectorAll('[name]').forEach((el) => { if (!el.disabled) this._v[el.name] = el.value || ''; }); } entries() { return Object.entries(this._v); } };
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true, get() { return selectValue.get.call(this); },
  set(v) { const want = String(v); [...this.options].forEach((o) => { if (o.getAttribute('value') === want) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); } });

const { inScope, mayStart, advanceRun, newRun, cleanScope, scopeText } = await import('../js/data/task-builder.js');
const { createMockAdapter } = await import('../js/data/mock-adapter.js');
const { toText } = await import('../js/ui.js');
const { render } = await import('../js/pages/task-builder.js');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const aerr = async (p) => { try { await p; return ''; } catch (e) { return e.message; } };
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
const wait = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await wait(); };

// rules
const on = '2026-11-14T15:00:00.000Z';
ok(cleanScope('all') === 'all' && cleanScope('x') === 'new' && cleanScope() === 'new', 'new files only is the default');
ok(!inScope({ scope: 'new', activatedAt: on }, { createdAt: '2026-11-10T00:00:00Z' }) && inScope({ scope: 'new', activatedAt: on }, { createdAt: '2026-11-14T16:00:00Z' }), 'new files only: a file opened before turning on is left alone; one opened after is in');
ok(inScope({ scope: 'all', activatedAt: on }, { createdAt: '2026-11-10T00:00:00Z' }) && inScope({ scope: 'new' }, {}), 'existing too covers old files; a flow never turned on with a date is treated as before');
ok(scopeText({ scope: 'all' }) === 'New and existing open files' && scopeText({}) === 'New files only', 'which files reads in plain words');
ok(mayStart({ id: 'f', trigger: 'emd_not_received' }, [{ flowId: 'f', trial: true, status: 'done' }]), 'a test run never blocks the real run');
const steps = [{ type: 'create_task', title: 'Chase the EMD', assignTo: 'Buyer Agent', dueDays: 1 }, { type: 'wait', days: 3 }, { type: 'call_task', title: 'Call about the EMD', assignTo: 'Processor', dueDays: 0 }];
const trial = newRun({ id: 'f' }, 'd', on, true);
const made = advanceRun(trial, { id: 'f', active: false, steps, conditions: {} }, { deal: { status: 'Open' }, nowIso: on });
ok(made.length === 2 && trial.status === 'done' && trial.log.some((l) => /wait 3 days \(skipped in a test run\)/.test(l.text)), 'a test run runs with the flow Off and skips its waits');

// the demo portal
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const f = await api.createTaskFlow({ name: 'EMD reminder', trigger: 'emd_not_received', triggerDays: 2, steps });
await api.signInDev('u-proc');
ok(/Only an Admin or Super admin/.test(await aerr(api.tryTaskFlowOnFile(f.id, 'deal-1'))), 'a Processor cannot try a flow');
await api.signInDev('u-admin');
ok(/not open/.test(await aerr(api.tryTaskFlowOnFile(f.id, 'deal-3'))) && /Choose a file/.test(await aerr(api.tryTaskFlowOnFile(f.id, 'nope'))), 'a closed or missing file gives a plain message');
const empty = await api.createTaskFlow({ name: 'No steps', trigger: 'order_opened' });
ok(/Add at least one/.test(await aerr(api.tryTaskFlowOnFile(empty.id, 'deal-1'))), 'a flow with no task step cannot be tried');
const t = await api.tryTaskFlowOnFile(f.id, 'deal-1');
const testTasks = (await api.listTasks('deal-1')).filter((x) => /^Test run\. /.test(x.description || ''));
ok(t.status === 'done' && t.tasks >= 2 && testTasks.length === t.tasks && testTasks.some((x) => x.title === 'Call about the EMD'), 'Try on one file makes every step\'s tasks on that file, marked Test run');
ok((await api.listTaskFlows()).flows.find((x) => x.id === f.id).active === false, 'trying does not turn the flow on');
await api.setTaskFlowActive(f.id, true, { scope: 'new' });
ok((await api.runTaskFlowsNow()).started === 0, 'turned on for new files only: the open files already there get nothing');
await api.setTaskFlowActive(f.id, false);
await api.setTaskFlowActive(f.id, true, { scope: 'all' });
const r = await api.runTaskFlowsNow();
const runs = (await api.listTaskFlows()).runs.filter((x) => x.flowId === f.id);
ok(r.started >= 1 && runs.some((x) => x.dealId === 'deal-1' && !x.trial && x.status === 'waiting') && runs.some((x) => x.dealId === 'deal-1' && x.trial), 'existing files too: deal-1 gets its real run even after the test run');
ok((await api.listTaskFlows()).log.some((l) => l.flowId === f.id && l.action === 'turned on' && l.detail === 'New files only.') && (await api.listTaskFlows()).log.some((l) => l.detail === 'New and existing open files.'), 'History says which files each time it was turned on');

// the windows
const user = { id: 'u-admin', role: 'Super admin', isAdmin: true, status: 'active' };
let refreshed = 0;
async function show() { const app = document.getElementById('app'); const v = await render({ api, user, refresh() { refreshed++; } }); app.innerHTML = toText(v.body); v.mount(app); return app; }
await api.setTaskFlowActive(f.id, false);
let app = await show();
ok(!!app.querySelector(`[data-tb-try="${f.id}"]`) && !app.querySelector(`[data-tb-try="${empty.id}"]`), 'Try on one file shows only for flows with a task step');
ok(app.querySelector('[data-tb-run] .pill.warn') && /Test run/.test(app.querySelector('[data-tb-runs]').textContent), 'Recent runs marks test runs');
app.querySelector(`[data-tb-on="${f.id}"]`).click();
let m = document.getElementById('modal');
ok(!!m && m.querySelector('[data-tb-scope-opt="new"]').hasAttribute('checked') && !!m.querySelector('[data-tb-scope-opt="all"]'), 'Turn on asks which files, with New files only picked');
m.querySelector('[data-tb-scope-opt="new"]').checked = false; m.querySelector('[data-tb-scope-opt="all"]').checked = true;
fire(m.querySelector('#tbon'), 'submit'); await settle();
ok(!document.getElementById('modal') && (await api.listTaskFlows()).flows.find((x) => x.id === f.id).scope === 'all', 'choosing Existing open files too turns it on that way');
const opened = await api.createTaskFlow({ name: 'Welcome call', trigger: 'order_opened', steps: [{ type: 'call_task', title: 'Welcome call', assignTo: 'Processor', dueDays: 0 }] });
app = await show();
app.querySelector(`[data-tb-on="${opened.id}"]`).click(); m = document.getElementById('modal');
ok(!m.querySelector('[data-tb-scope-pick]') && /orders placed from now on/.test(m.textContent), 'an Order opened flow says it only runs on new orders (no choice to make)');
document.querySelector('#modal [data-close]').click();
app.querySelector(`[data-tb-try="${opened.id}"]`).click(); await settle();
m = document.getElementById('modal');
ok(!!m && m.querySelectorAll('[data-tb-try-file] option').length > 1 && /even while the flow is Off/.test(m.textContent), 'Try on one file lists open files and explains what it does');
fire(m.querySelector('#tbtry'), 'submit'); await settle();
ok(!m.querySelector('[data-tb-try-err]').hidden && /Choose a file/.test(m.querySelector('[data-tb-try-err]').textContent), 'running with no file chosen says to choose one');
m.querySelector('[data-tb-try-file]').value = 'deal-2';
fire(m.querySelector('#tbtry'), 'submit'); await settle();
const res = m.querySelector('[data-tb-try-done]');
ok(!!res && /1 task\(s\) created/.test(res.textContent) && res.querySelector('[data-tb-try-open]').getAttribute('href') === '#/deals/deal-2/tasks', 'the window shows what happened and links to the file\'s tasks');
const before = refreshed; m.querySelector('[data-close]').click();
ok(refreshed === before + 1, 'closing after a test refreshes the page');

console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
