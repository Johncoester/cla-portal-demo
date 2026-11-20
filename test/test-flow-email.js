/* Task Builder TB-7, Nov 20 2026 (John): "Send an email" steps and the "File closed" trigger (thank-you emails after closing).
 * Rules, the demo portal, and the step editor in a DOM (linkedom). The database twin is test-task-flow-email-sql.sh. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>');
globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
globalThis.location = { origin: 'https://test.example', pathname: '/portal/', hash: '#/task-builder', reload() {} };
globalThis.FormData = class { constructor(form) { this._v = {}; form.querySelectorAll('[name]').forEach((el) => { if (!el.disabled) this._v[el.name] = el.value || ''; }); } entries() { return Object.entries(this._v); } };
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true, get() { return selectValue.get.call(this); },
  set(v) { const want = String(v); [...this.options].forEach((o) => { if (o.getAttribute('value') === want) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); } });

const { cleanEmailStep, emailStepText, htmlToText, renderFlowEmail, testCopy } = await import('../js/data/flow-email.js');
const { cleanSteps, stepText, hasTaskStep, advanceRun, newRun, STEP_TYPES, TRIGGERS, triggerRuns, dealRunsFor } = await import('../js/data/task-builder.js');
const { createMockAdapter } = await import('../js/data/mock-adapter.js');
const { toText } = await import('../js/ui.js');
const { render } = await import('../js/pages/task-builder.js');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const thrown = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
const wait = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await wait(); };

// ---------- checking a step ----------
ok(STEP_TYPES.some(([v, l]) => v === 'send_email' && l === 'Send an email'), 'the email step is offered');
ok(TRIGGERS.some((t) => t.code === 'file_closed' && t.label === 'File closed') && triggerRuns('file_closed'), 'File closed is a trigger that runs');
const thanks = { type: 'send_email', sendTo: 'Client-Buyer', subject: 'Thank you, {{buyer_first_name}}', body: 'Hi {{buyer_first_name}},\n\nThank you so much for closing on {{property_address}}. Enjoy your new home!' };
ok(JSON.stringify(cleanEmailStep(thanks)) === JSON.stringify(thanks), 'a written email is kept as written');
ok(JSON.stringify(cleanEmailStep({ sendTo: 'Client-Seller', templateId: 'fet-seed-2', templateName: 'Order opened / welcome', subject: 'x' })) === JSON.stringify({ type: 'send_email', sendTo: 'Client-Seller', templateId: 'fet-seed-2', templateName: 'Order opened / welcome' }), 'a template step keeps only the template');
ok(/Step 2: choose who the email goes to/.test(thrown(() => cleanSteps([{ type: 'wait', days: 2 }, { type: 'send_email', subject: 'Thanks', body: 'Thanks' }]))), 'no recipient');
ok(/give the email a subject/.test(thrown(() => cleanEmailStep({ sendTo: 'Client-Buyer', subject: '', body: 'Thanks' }))), 'no subject and no template');
ok(/write the message/.test(thrown(() => cleanEmailStep({ sendTo: 'Client-Buyer', subject: 'Thanks', body: ' ' }))), 'no message');
ok(/\{\{buyer_nickname\}\} is not a merge field/.test(thrown(() => cleanEmailStep({ sendTo: 'Client-Buyer', subject: 'Thanks', body: 'Hi {{buyer_nickname}}' }))), 'an unknown merge field is named');
ok(stepText(thanks) === 'Email the buyer: "Thank you, {{buyer_first_name}}"' && emailStepText({ sendTo: 'Listing Agent', templateId: 'x', templateName: 'Closing thank you' }) === 'Email the listing agent: the "Closing thank you" template', 'the step reads in plain words');
ok(hasTaskStep([{ type: 'wait', days: 2 }, thanks]), 'a flow with only an email step can be turned on');
ok(dealRunsFor({ trigger: 'file_closed' }, { status: 'Closed' }) && !dealRunsFor({ trigger: 'closing_date_set' }, { status: 'Closed' }) && !dealRunsFor({ trigger: 'file_closed' }, { status: 'Cancelled' }), 'only a File closed flow runs on a closed file');

// ---------- filling it in ----------
const deal = { fileNumber: 'MD-26-1', street: '1 Main St', city: 'Bowie', state: 'MD', zip: '20715', processorName: 'Pat Processor', processorEmail: 'pat@cla.test',
  participants: [{ role: 'Client-Buyer', contact: { firstName: 'Bea', lastName: 'Buyer', email: 'bea@example.com' } }, { role: 'Client-Seller', contact: { firstName: 'Sam', lastName: 'Seller', email: 'sam@example.com' } }] };
const mail = renderFlowEmail(deal, { email: 'bea@example.com' }, thanks);
ok(mail.subject === 'Thank you, Bea' && mail.body === 'Hi Bea,\n\nThank you so much for closing on 1 Main St, Bowie MD 20715. Enjoy your new home!', 'the buyer\'s name and the address fill in');
const tpl = renderFlowEmail(deal, { email: 'sam@example.com' }, { subject: 'Hello {{recipient_first_name}}', bodyHtml: '<p>Hi {{recipient_first_name}},</p><p>Thanks &amp; welcome. {{processor_line}}</p>' });
ok(tpl.subject === 'Hello Sam' && tpl.body === 'Hi Sam,\n\nThanks & welcome. Pat Processor (pat@cla.test)', 'a saved template becomes plain text and fills in for the person it goes to');
ok(htmlToText('<ul><li>One</li><li>Two</li></ul>') === '- One\n\n- Two', 'lists turn into dashes');
const copy = testCopy(mail, 'Bea Buyer <bea@example.com>');
ok(copy.subject === '[Test] Thank you, Bea' && /On a real run this email goes to: Bea Buyer <bea@example\.com>\./.test(copy.body) && copy.body.endsWith(mail.body), 'the test copy is marked and says who the real email goes to');

// ---------- the engine ----------
const run = newRun({ id: 'f' }, 'd', '2026-11-20T15:00:00.000Z');
const flow = { id: 'f', active: true, trigger: 'file_closed', conditions: {}, steps: [{ type: 'wait', days: 2 }, thanks] };
ok(advanceRun(run, flow, { deal: { status: 'Closed' }, nowIso: '2026-11-20T15:00:00.000Z' }).length === 0 && run.status === 'waiting', 'File closed, then wait 2 days');
const specs = advanceRun(run, flow, { deal: { status: 'Closed' }, nowIso: '2026-11-22T15:00:00.000Z' });
ok(specs.length === 1 && specs[0].email && specs[0].assignTo === 'Client-Buyer' && run.status === 'done', 'after 2 days the email goes, on the closed file');

// ---------- the demo portal ----------
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const tpls = await api.listFileEmailTemplates();
const f = await api.createTaskFlow({ name: 'Closing thank you', trigger: 'file_closed', steps: [{ type: 'wait', days: 2 }, thanks, { type: 'send_email', sendTo: 'Client-Seller', templateId: tpls[0].id, templateName: tpls[0].name }] });
ok(f.steps[1].text === 'Email the buyer: "Thank you, {{buyer_first_name}}"' && f.triggerText === 'File closed', 'the saved flow reads in plain words');
const outBefore = (await api.listOutbox()).length;
const tr = await api.tryTaskFlowOnFile(f.id, 'deal-1');
const out1 = await api.listOutbox(); const copies = out1.slice(0, out1.length - outBefore);
ok(tr.status === 'done' && copies.length === 2 && copies.every((o) => o.toProfileId === 'u-admin' && o.subject.startsWith('[Test] ')), 'Try on one file sends two test copies, only to the admin');
ok(copies.some((o) => /On a real run this email goes to: Ben Buyer/.test(o.body) && /Hi Ben,/.test(o.body)), 'the test copy shows the real buyer\'s name');
ok(tr.log.some((l) => /test run: sent only to you/.test(l.text)) && tr.log.some((l) => /Test copy queued for you/.test(l.text)), 'the history says the test copy went only to you');
await api.setTaskFlowActive(f.id, true, {});
await api.signInDev('u-proc');
const deal1 = await api.getDeal('deal-1');
if (deal1.status !== 'Closed') await api.setDealStatus('deal-1', 'Closed').catch(() => null);
await api.signInDev('u-admin');
const runs = (await api.listTaskFlows()).runs.filter((r) => r.flowId === f.id && !r.trial);
ok(runs.length === 1 && runs[0].status === 'waiting', 'closing a file opened before the flow was turned on starts it, and it waits 2 days');
ok((await api.listOutbox()).filter((o) => o.templateKey === 'task_flow_email' && !o.subject.startsWith('[Test]')).length === 0, 'nothing goes to the client before the wait is over');

// ---------- the step editor ----------
const user = { id: 'u-admin', role: 'Super admin', isAdmin: true, status: 'active' };
const app = document.getElementById('app');
const v = await render({ api, user, refresh() {} }); app.innerHTML = toText(v.body); v.mount(app);
app.querySelector(`[data-tb-on="${f.id}"]`) || app.querySelector(`[data-tb-off="${f.id}"]`).click();
app.querySelector(`[data-tb-edit="${f.id}"]`).click(); await settle();
const m = document.getElementById('modal');
const box = m.querySelector('[data-tb-step="1"]');
ok(!!box.querySelector('[data-tb-email-tpl]') && !!box.querySelector('[data-tb-step-field="subject"]') && !!box.querySelector('[data-tb-step-field="body"]') && /\{\{buyer_first_name\}\}/.test(box.querySelector('[data-tb-merge-list]').textContent), 'a written email shows subject, message and the merge fields');
ok(!m.querySelector('[data-tb-step="2"] [data-tb-step-field="subject"]') && m.querySelector('[data-tb-step="2"] [data-tb-email-tpl]').value === tpls[0].id, 'a template step shows the template, not the boxes');
const sel = box.querySelector('[data-tb-email-tpl]'); sel.value = tpls[0].id; fire(sel, 'change');
ok(!m.querySelector('[data-tb-step="1"] [data-tb-step-field="subject"]'), 'choosing a template hides the subject and message');
const sel2 = m.querySelector('[data-tb-step="1"] [data-tb-email-tpl]'); sel2.value = ''; fire(sel2, 'change');
const body = m.querySelector('[data-tb-step="1"] [data-tb-step-field="body"]'); body.value = 'Hi {{nickname}}'; fire(body, 'input');
fire(m.querySelector('#tbf'), 'submit'); await settle();
const errBox = m.querySelector('[data-tb-err]');
ok(!errBox.hidden && /Step 2: \{\{nickname\}\} is not a merge field/.test(errBox.textContent) && !!document.getElementById('modal'), 'a wrong merge field is caught before saving and the window stays open');

console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
