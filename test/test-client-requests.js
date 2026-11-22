/* Task Builder TB-6, Nov 20 2026 (John): client requests ("Request a form from a party") and ONE email per person and file.
 * Rules, the demo portal, and the step editor in a DOM (linkedom). The database twin is test-task-flow-requests-sql.sh. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>');
globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
globalThis.location = { origin: 'https://test.example', pathname: '/portal/', hash: '#/task-builder', reload() {} };
globalThis.FormData = class { constructor(form) { this._v = {}; form.querySelectorAll('[name]').forEach((el) => { if (!el.disabled) this._v[el.name] = el.value || ''; }); } entries() { return Object.entries(this._v); } };
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true, get() { return selectValue.get.call(this); },
  set(v) { const want = String(v); [...this.options].forEach((o) => { if (o.getAttribute('value') === want) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); } });

const { REQUEST_FORMS, cleanRequestStep, requestStepText, afterSent, digestsDue, digestEmail, newRequestState } = await import('../js/data/client-requests.js');
const { cleanSteps, stepText, hasTaskStep, advanceRun, newRun, STEP_TYPES } = await import('../js/data/task-builder.js');
const { TEMPLATE_DEFS } = await import('../js/data/templates.js');
const { createMockAdapter } = await import('../js/data/mock-adapter.js');
const { toText } = await import('../js/ui.js');
const { render } = await import('../js/pages/task-builder.js');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const thrown = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
const aerr = async (p) => { try { await p; return ''; } catch (e) { return e.message; } };
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
const wait = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await wait(); };

// ---------- the form list matches the intake templates ----------
const latest = new Map(); TEMPLATE_DEFS.forEach((t) => { if (!latest.has(t.code) || latest.get(t.code).version < t.version) latest.set(t.code, t); });
REQUEST_FORMS.forEach(([code, title, roles]) => {
  const t = latest.get(code);
  ok(!!t && t.title === title && JSON.stringify([...t.roles].sort()) === JSON.stringify([...roles].sort()), `${code}: title and roles match the template's latest version`);
});
const sqlText = (await import('node:fs')).readFileSync(new URL('../supabase/migrations/20261126010000_task_flow_client_requests.sql', import.meta.url), 'utf8');
ok(REQUEST_FORMS.every(([code, title]) => sqlText.includes(`('${code}', '${title.replace(/'/g, "''")}'`)), 'the database lists the same forms');

// ---------- checking a step ----------
ok(STEP_TYPES.some(([v, l]) => v === 'client_request' && l === 'Request a form from a party'), 'the new step type is offered');
const good = cleanRequestStep({ formCode: 'personal_info', sendTo: 'Client-Buyer', dueDays: '3', remindEvery: '2', remindTimes: '3' }, 'Step 1');
ok(JSON.stringify(good) === JSON.stringify({ type: 'client_request', formCode: 'personal_info', sendTo: 'Client-Buyer', dueDays: 3, remindEvery: 2, remindTimes: 3 }), 'a good step is cleaned to numbers');
ok(/Step 2: "Title vesting" is not filled in by the seller\. Choose the buyer\./.test(thrown(() => cleanSteps([{ type: 'wait', days: 1 }, { type: 'client_request', formCode: 'title_vesting', sendTo: 'Client-Seller', dueDays: 3 }]))), 'a form asked of the wrong party says who fills it in');
ok(/choose which form/.test(thrown(() => cleanRequestStep({ sendTo: 'Client-Buyer', dueDays: 3 }))), 'no form chosen');
ok(/choose who the request goes to/.test(thrown(() => cleanRequestStep({ formCode: 'personal_info', dueDays: 3 }))), 'no party chosen');
ok(/due in must be/.test(thrown(() => cleanRequestStep({ formCode: 'personal_info', sendTo: 'Client-Buyer', dueDays: '61' }))), 'due in over 60 is refused');
ok(/remind every must be/.test(thrown(() => cleanRequestStep({ formCode: 'personal_info', sendTo: 'Client-Buyer', dueDays: 3, remindEvery: 15 }))), 'remind every over 14 is refused');
ok(/say how many reminders/.test(thrown(() => cleanRequestStep({ formCode: 'personal_info', sendTo: 'Client-Buyer', dueDays: 3, remindEvery: 2, remindTimes: 0 }))), 'reminders on with no count is refused');
ok(cleanRequestStep({ formCode: 'commissions', sendTo: 'Listing Agent', dueDays: 0, remindEvery: 0, remindTimes: 4 }).remindTimes === 0, 'no reminders clears the count');
ok(requestStepText(good) === 'Request "Personal information" from the buyer, due in 3 days, reminder every 2 days, up to 3 times' && stepText(good) === requestStepText(good), 'the step reads in plain words');
ok(hasTaskStep([good]), 'a flow with only request steps can be turned on');

// ---------- the engine ----------
const run = newRun({ id: 'f' }, 'd', '2026-11-20T15:00:00.000Z');
const specs = advanceRun(run, { id: 'f', active: true, conditions: {}, steps: [good, { type: 'wait', days: 2 }] }, { deal: { status: 'Open' }, nowIso: '2026-11-20T15:00:00.000Z' });
ok(specs.length === 1 && specs[0].request && specs[0].formCode === 'personal_info' && specs[0].assignTo === 'Client-Buyer' && specs[0].dueDate === '2026-11-23' && run.status === 'waiting', 'a request step asks the adapter for the form and goes on to the wait');

// ---------- reminders and the one email ----------
const T0 = '2026-11-20T15:00:00.000Z'; const day = (n) => new Date(Date.parse(T0) + n * 86400000).toISOString();
const st = newRequestState('t1', 'd', 'p1', good, T0);
afterSent(st, T0); ok(st.sent === 1 && st.nextAt === day(2), 'after the request email, the next reminder is in 2 days');
afterSent(st, day(2)); afterSent(st, day(4)); ok(st.sent === 3 && st.nextAt === day(6), 'counts the reminders');
afterSent(st, day(6)); ok(st.sent === 4 && st.nextAt === null, 'stops after 3 reminders');
const none = newRequestState('t1', 'd', 'p1', { remindEvery: 0, remindTimes: 0 }, T0); afterSent(none, T0); ok(none.nextAt === null, 'no reminders: only the request email');
const row = (id, key, deal, sent, nextAt, status = 'todo', title = id) => ({ id, taskId: id, recipientKey: key, dealId: deal, sent, nextAt, task: { status, title, dueDate: '2026-11-23' } });
let groups = digestsDue([row('a', 'p1', 'd1', 0, T0), row('b', 'p1', 'd1', 0, T0), row('c', 'p2', 'd1', 0, T0), row('e', 'p1', 'd2', 0, T0)], T0);
ok(groups.length === 3 && groups.find((g) => g.recipientKey === 'p1' && g.dealId === 'd1').items.length === 2, 'one email per person and file: two requests to the same buyer are one email');
groups = digestsDue([row('a', 'p1', 'd1', 1, day(2)), row('b', 'p1', 'd1', 1, day(9))], day(2));
ok(groups.length === 1 && groups[0].items.length === 2 && groups[0].due.length === 1, 'a reminder lists everything still needed, not only the item that came due');
ok(digestsDue([row('a', 'p1', 'd1', 1, day(2))], day(2), () => day(1.5)).length === 0, 'never two reminder emails to the same person within 20 hours');
ok(digestsDue([row('a', 'p1', 'd1', 0, day(2))], day(2), () => day(1.9)).length === 1, 'a brand-new request still goes straight away');
ok(digestsDue([row('a', 'p1', 'd1', 1, day(2), 'done')], day(2)).length === 0, 'a submitted form is never reminded');
const mail = digestEmail({ firstName: 'Bea', fileNumber: 'MD-26-1', address: '1 Main St, Bowie', isReminder: true,
  items: [{ task: { title: 'Upload identification', dueDate: '2026-11-25' } }, { task: { title: 'Personal information', dueDate: '2026-11-23' } }] });
ok(mail.subject === 'Reminder: 2 items still needed for MD-26-1' && /Hello Bea,/.test(mail.body) && mail.body.indexOf('Personal information') < mail.body.indexOf('Upload identification'), 'the email: count in the subject, items soonest due first');

// ---------- the demo portal ----------
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const flow = await api.createTaskFlow({ name: 'Intake requests', trigger: 'closing_date_set', steps: [
  { type: 'client_request', formCode: 'title_vesting', sendTo: 'Client-Buyer', dueDays: 3, remindEvery: 2, remindTimes: 2 },
  { type: 'client_request', formCode: 'home_warranty', sendTo: 'Client-Buyer', dueDays: 3, remindEvery: 2, remindTimes: 2 },
  { type: 'client_request', formCode: 'personal_info', sendTo: 'Client-Seller', dueDays: 3 },
  { type: 'client_request', formCode: 'forwarding_address', sendTo: 'Client-Seller', dueDays: 5 }] });
ok(flow.steps[0].text.startsWith('Request "Title vesting" from the buyer'), 'the saved flow lists the request in plain words');
const forms = async () => (await api.listTasks('deal-1')).filter((t) => t.kind === 'form' && t.status !== 'cancelled');
const formsBefore = (await forms()).length;
const outBefore = (await api.listOutbox()).length;
const tr = await api.tryTaskFlowOnFile(flow.id, 'deal-1');
ok(tr.status === 'done' && tr.log.some((l) => /Request "Home warranty" from the buyer/.test(l.text)), 'Try on one file runs the request steps');
ok(tr.log.some((l) => /"Personal information" was already submitted by Sally Seller, so it was not requested again\./.test(l.text)), 'a form the party already submitted is not asked again, and the history says so');
ok((await api.listOutbox()).length === outBefore, 'a test run emails nobody');
ok((await forms()).length === formsBefore, 'the parties\' existing open forms are used, not duplicated');
await api.setTaskFlowActive(flow.id, true, { scope: 'all' });
await api.updateDeal('deal-1', { closingDate: '2026-12-19' });
const digests = (await api.listOutbox()).filter((o) => o.templateKey === 'client_request_digest' && o.dealId === 'deal-1');
const buyerMail = digests.filter((o) => o.toProfileId === 'u-buyer'); const sellerMail = digests.filter((o) => o.toProfileId === 'u-seller');
ok(digests.length === 2 && buyerMail.length === 1 && sellerMail.length === 1, 'the real run queues ONE email for the buyer and ONE for the seller');
ok(buyerMail[0].subject === `2 items still needed for ${tr.fileNumber}` && /- Title vesting/.test(buyerMail[0].body) && /- Home warranty/.test(buyerMail[0].body), 'the buyer\'s email lists both forms');
ok(sellerMail[0].subject === `1 item still needed for ${tr.fileNumber}` && /- Forwarding address/.test(sellerMail[0].body), 'the seller\'s email lists only what is still needed');
ok(digests.every((o) => o.status === 'queued' && /Please sign in to the portal/.test(o.body)), 'the emails are queued in the outbox, not sent');
ok((await api.runTaskFlowsNow()).emails === 0, 'checking again right away sends nothing more');

// ---------- the step editor ----------
const user = { id: 'u-admin', role: 'Super admin', isAdmin: true, status: 'active' };
const app = document.getElementById('app');
const v = await render({ api, user, refresh() {} }); app.innerHTML = toText(v.body); v.mount(app);
ok(!!app.querySelector(`[data-tb-try="${flow.id}"]`), 'a flow with only request steps can be tried on one file');
app.querySelector(`[data-tb-edit="${flow.id}"]`).click(); await settle();
const m = document.getElementById('modal');
const box = m.querySelector('[data-tb-step="0"]');
ok(!!box.querySelector('[data-tb-req-form]') && !!box.querySelector('[data-tb-step-field="remindEvery"]') && !!box.querySelector('[data-tb-step-field="remindTimes"]') && /ONE email per file/.test(box.textContent), 'the step shows form, send to, due in, reminders and the one-email note');
const form = box.querySelector('[data-tb-req-form]'); form.value = 'title_vesting'; fire(form, 'change');
const sendTo = m.querySelector('[data-tb-step="0"] [data-tb-step-field="sendTo"]');
ok([...sendTo.options].map((o) => o.getAttribute('value')).filter(Boolean).join(',') === 'Client-Buyer' && sendTo.value === 'Client-Buyer', 'choosing a form narrows Send to to who fills it in');
m.querySelector('[data-tb-step="2"] [data-tb-step-field="dueDays"]').value = ''; fire(m.querySelector('[data-tb-step="2"] [data-tb-step-field="dueDays"]'), 'input');
fire(m.querySelector('#tbf'), 'submit'); await settle();
const errBox = m.querySelector('[data-tb-err]');
ok(!errBox.hidden && /Step 3: due in must be/.test(errBox.textContent) && !!document.getElementById('modal'), 'a blank due in is caught before saving and the window stays open');

console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
