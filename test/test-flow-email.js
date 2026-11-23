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

const { cleanEmailStep, emailStepText, htmlToText, renderFlowEmail, testCopy, cleanSender, signatureText, withSignature } = await import('../js/data/flow-email.js');
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
const box = m.querySelector('[data-tb-step="0"]');
ok(!!box.querySelector('[data-tb-email-tpl]') && !!box.querySelector('[data-tb-step-field="subject"]') && !!box.querySelector('[data-tb-step-field="body"]') && [...box.querySelectorAll('[data-tb-insert] option')].some((o) => o.getAttribute('value') === 'buyer_first_name'), 'a written email shows subject, message and an Insert field list');
ok(!m.querySelector('[data-tb-step="1"] [data-tb-step-field="subject"]') && m.querySelector('[data-tb-step="1"] [data-tb-email-tpl]').value === tpls[0].id, 'a template step shows the template, not the boxes');
const sel = box.querySelector('[data-tb-email-tpl]'); sel.value = tpls[0].id; fire(sel, 'change');
ok(!m.querySelector('[data-tb-step="0"] [data-tb-step-field="subject"]'), 'choosing a template hides the subject and message');
const sel2 = m.querySelector('[data-tb-step="0"] [data-tb-email-tpl]'); sel2.value = ''; fire(sel2, 'change');
const body = m.querySelector('[data-tb-step="0"] [data-tb-step-field="body"]'); body.value = 'Hi {{nickname}}'; fire(body, 'input');
fire(m.querySelector('#tbf'), 'submit'); await settle();
const errBox = m.querySelector('[data-tb-err]');
ok(!errBox.hidden && /Step 1: \{\{nickname\}\} is not a merge field/.test(errBox.textContent) && !!document.getElementById('modal'), 'a wrong merge field is caught before saving and the window stays open');


// ---------- Nov 21 (John): intro email to the agents who didn't refer the file; plain timing; every staff member as sales person ----------
const { isNonReferringAgent, emailRecipients, EMAIL_ROLES: ER } = await import('../js/data/flow-email.js');
const { stepTimeline, whenText } = await import('../js/data/task-builder.js');
const ba = { role: 'Buyer Agent', contactId: 'c1' }; const ba2 = { role: 'Buyer Agent', contactId: 'c3' }; const la = { role: 'Listing Agent', contactId: 'c2' }; const buyer = { role: 'Client-Buyer', contactId: 'c9' };
ok(ER.some(([v]) => v === 'non_referring_agents'), 'an email can go to the agents who did not refer the file');
ok(emailRecipients([ba, la, buyer], 'non_referring_agents', 'buyer_agent:c1').map((p) => p.contactId).join() === 'c2', 'the referring buyer agent is left out');
ok(emailRecipients([ba, ba2, la], 'non_referring_agents', 'buyer_agent:c1').map((p) => p.contactId).join() === 'c3,c2', 'another buyer agent who did not refer it still gets it');
ok(emailRecipients([ba, ba2, la], 'non_referring_agents', 'listing_agent').map((p) => p.contactId).join() === 'c1,c3', 'a listing-agent source with no person: the listing side is the referrer');
ok(emailRecipients([ba, la, buyer], 'non_referring_agents', 'buyer').length === 2 && emailRecipients([ba, la], 'non_referring_agents', '').length === 2 && emailRecipients([ba, la], 'non_referring_agents', 'zillow').length === 2, 'any other source, or none: every agent gets it');
ok(!isNonReferringAgent(buyer, '') && emailRecipients([ba, la, buyer], 'Client-Buyer', 'buyer_agent:c1').length === 1, 'only agents count, and the other recipients are unchanged');
ok(cleanEmailStep({ sendTo: 'non_referring_agents', subject: 'Welcome from CLA', body: 'Hi {{recipient_first_name}}' }).sendTo === 'non_referring_agents' && /non-referring agent/.test(emailStepText({ sendTo: 'non_referring_agents', subject: 'Welcome' })), 'the step saves and reads in plain words');

ok(stepTimeline('order_opened', null, [{ type: 'wait', days: 2 }, { type: 'create_task', dueDays: 1 }]).join(' | ') === 'Wait 2 days. The next step happens 2 days after the order opens. | 2 days after the order opens: create this task, due 1 day later.', 'each step says when it happens: "2 days after the order opens: create this task, due 1 day later"');
ok(stepTimeline('order_opened', null, [{ type: 'send_email' }])[0] === 'As soon as the order opens: send this email.', 'with no wait, it happens as soon as the order opens');
ok(stepTimeline('emd_not_received', 2, [{ type: 'create_task', dueDays: 0 }])[0] === '2 days after the order opens: create this task, due the same day.', 'EMD not received counts from the order opening');
ok(stepTimeline('days_before_closing', 3, [{ type: 'wait', days: 3 }, { type: 'call_task', dueDays: 1 }])[1] === 'On the closing date: create this phone call task, due 1 day later.' && whenText('days_before_closing', 3, 5) === '2 days after closing', 'days before closing counts toward and past the closing date');
ok(stepTimeline('file_closed', null, [{ type: 'wait', days: 2 }, { type: 'send_email' }])[1] === '2 days after the file closes: send this email.', 'the thank-you example reads plainly');

// the demo portal: the intro goes to the non-referring agent only
{ const api2 = createMockAdapter({ storage: mem(), sessionStorage: mem() });
  await api2.signInDev('u-proc');
  const dl = await api2.getDeal('deal-1'); const ag = dl.participants.filter((p) => ['Buyer Agent', 'Listing Agent'].includes(p.role));
  const ref = ag.find((p) => p.role === 'Buyer Agent');
  await api2.updateDeal('deal-1', { sourceOfBusiness: `buyer_agent:${ref.contactId}` });
  await api2.signInDev('u-admin');
  const fl = await api2.createTaskFlow({ name: 'Owner intro', trigger: 'order_opened', steps: [{ type: 'send_email', sendTo: 'non_referring_agents', subject: 'Welcome from CLA Title', body: 'Hi {{recipient_first_name}}, I am John, the owner of CLA. Call me anytime.' }] });
  const res = await api2.tryTaskFlowOnFile(fl.id, 'deal-1');
  ok(res && res.log.some((l) => /Test copy queued for you/.test(l.text)), 'Try on one file queues a test copy of the intro');
  const box = ((await api2.listOutbox()) || []).find((o) => /^\[Test\] Welcome from CLA Title/.test(o.subject || ''));
  const others = ag.filter((p) => p.contactId !== ref.contactId && p.contact && p.contact.email).map((p) => p.contact.email.toLowerCase());
  ok(!!box && others.length > 0 && others.every((e) => box.body.toLowerCase().includes(e)) && !(ref.contact && ref.contact.email && box.body.toLowerCase().includes(`<${ref.contact.email.toLowerCase()}>`)), 'the test copy lists the non-referring agents and leaves out the one who referred the file'); }

// the form: timing under each step, staff list with search
{ const api3 = createMockAdapter({ storage: mem(), sessionStorage: mem() });
  await api3.signInDev('u-admin');
  const app3 = document.getElementById('app'); const v3 = await render({ api: api3, user: { id: 'u-admin', role: 'Super admin', isAdmin: true, status: 'active' }, refresh() {} });
  app3.innerHTML = toText(v3.body); v3.mount(app3);
  app3.querySelector('[data-tb-new]').click();
  const m3 = document.getElementById('modal');
  const salesLabels = [...m3.querySelectorAll('[data-tb-cond="salesPeople"]')].map((c) => c.closest('label').textContent.trim());
  ok(salesLabels.some((t) => /King John/.test(t)) && salesLabels.some((t) => /Adam/.test(t)) && salesLabels.length >= 4, 'the sales person list shows every staff member, admins included');
  const findBox = m3.querySelector('[data-tb-sales-search]'); findBox.value = 'king'; findBox.dispatchEvent(new window.Event('input', { bubbles: true }));
  const shown = [...m3.querySelectorAll('[data-tb-cond="salesPeople"]')].filter((c) => !c.closest('label').hidden).map((c) => c.closest('label').textContent.trim());
  ok(shown.length === 1 && /King John/.test(shown[0]), 'typing a name narrows the list');
  const trig = m3.querySelector('[data-tb-trigger-input]'); trig.value = 'order_opened'; trig.dispatchEvent(new window.Event('change', { bubbles: true }));
  const addB = m3.querySelector('[data-tb-add-step]'); addB.click(); addB.click();
  const at1 = m3.querySelector('[data-tb-step="1"] [data-tb-step-at]'); at1.value = '2'; at1.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok(/^2 days after the order opens: create a task for someone \(choose who below\), due 1 day later\.$/.test(m3.querySelector('[data-tb-step="1"] [data-tb-step-when]').textContent), 'the second step says "2 days after the order opens: create a task ..., due 1 day later"');
  ok(/days after it starts \(2 days after the order opens\)/.test(m3.querySelector('[data-tb-step="1"] [data-tb-at-hint]').textContent), 'the When box says what its number means');
  const dd = m3.querySelector('[data-tb-step="1"] [data-tb-step-field="dueDays"]'); dd.value = '0'; dd.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok(/due the same day/.test(m3.querySelector('[data-tb-step="1"] [data-tb-step-when]').textContent) && /Due \(days after it's created\)/.test(m3.querySelector('[data-tb-step="1"]').textContent), 'the line updates as you type, and the due box says days after it is created');
  const em = m3.querySelector('[data-tb-step="1"] [data-tb-step-type]'); em.value = 'send_email'; em.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok([...m3.querySelectorAll('[data-tb-step="1"] [data-tb-step-field="sendTo"] option')].some((o) => o.getAttribute('value') === 'non_referring_agents' && /didn't refer/.test(o.textContent)), 'the email step can be sent to the agents who did not refer the file'); }

// ---------- Nov 22 (John, by voice): send as a named staff member, with that person's signature ----------
ok(JSON.stringify(cleanEmailStep({ ...thanks, from: 'u-admin', signature: true })).includes('"from":"u-admin","signature":true'), 'an email step keeps who it is from and the signature box');
ok(!('from' in cleanEmailStep(thanks)) && !('signature' in cleanEmailStep(thanks)), 'a step saved before this has neither: the processor sends it, no signature');
ok(/choose who the email is from/.test(thrown(() => cleanSender({ from: 'john <x>' }, 'Step 2'))), 'a From that is not a staff member is refused in plain words');
ok(signatureText({ firstName: 'John', lastName: 'Coester', email: 'john@cla.test', phone: '301-555-0100' }) === 'John Coester\nCLA Title & Escrow\njohn@cla.test · 301-555-0100', 'with no saved signature: name, CLA Title & Escrow, email and phone');
ok(signatureText({ firstName: 'John' }, '<p>John Coester<br>CEO</p>') === 'John Coester\nCEO', 'a saved signature is used, as plain text');
ok(withSignature('Hi Bea,\n\nThanks.\n', 'John') === 'Hi Bea,\n\nThanks.\n\nJohn' && withSignature('Hi', '') === 'Hi', 'the signature goes under the message after a blank line');
ok(renderFlowEmail(deal, { email: 'bea@example.com' }, { subject: 'Hi', body: 'This is {{sender_name}}.' }, { senderName: 'John Coester' }).body === 'This is John Coester.', '{{sender_name}} is the person it is from');
{ const api4 = createMockAdapter({ storage: mem(), sessionStorage: mem() });
  await api4.signInDev('u-admin');
  const staff = await api4.listActiveStaff(); const me = staff.find((s) => s.id === 'u-admin'); const meName = `${me.firstName} ${me.lastName}`.trim();
  const fl = await api4.createTaskFlow({ name: 'Owner intro', trigger: 'order_opened', steps: [{ type: 'send_email', sendTo: 'Client-Buyer', subject: 'Welcome from CLA Title', body: 'Hi {{recipient_first_name}}, this is {{sender_name}}, the owner.', from: 'u-admin', signature: true }] });
  ok(fl.steps[0].from === 'u-admin' && fl.steps[0].signature === true, 'the demo portal saves From and the signature box');
  const r1 = await api4.tryTaskFlowOnFile(fl.id, 'deal-1');
  ok(r1.log.some((l) => new RegExp(`Test copy queued for you \\(.+\\), from ${meName}\\.`).test(l.text)), 'the run history says who it is from');
  const box = ((await api4.listOutbox()) || []).find((o) => /^\[Test\] Welcome from CLA Title/.test(o.subject || ''));
  ok(!!box && box.senderType === 'other' && box.fromName === meName && box.senderProfileId === 'u-admin', 'the test copy is from that person, not the processor');
  ok(!!box && box.body.includes(`this is ${meName}, the owner.`) && /\n\n.+\nCLA Title & Escrow/.test(box.body), 'the message names them and ends with their signature');
  if (api4.saveCrmSignature) { await api4.saveCrmSignature('<p>John, CEO</p>');
    await api4.tryTaskFlowOnFile(fl.id, 'deal-1');
    const copies = ((await api4.listOutbox()) || []).filter((o) => /^\[Test\] Welcome from CLA Title/.test(o.subject || ''));
    ok(copies.length === 2 && copies.some((o) => /\n\nJohn, CEO$/.test(o.body)), 'their saved signature is used when they have one'); }
  const fl2 = await api4.createTaskFlow({ name: 'Old style', trigger: 'order_opened', steps: [{ type: 'send_email', sendTo: 'Client-Buyer', subject: 'Plain one', body: 'Hello.' }] });
  await api4.tryTaskFlowOnFile(fl2.id, 'deal-1');
  const box3 = ((await api4.listOutbox()) || []).find((o) => /^\[Test\] Plain one/.test(o.subject || ''));
  ok(!!box3 && box3.senderType !== 'other' && /Hello\.$/.test(box3.body), 'a step with no From still goes from the processor with no signature');
  // the form
  const app4 = document.getElementById('app'); const v4 = await render({ api: api4, user: { id: 'u-admin', role: 'Super admin', isAdmin: true, status: 'active' }, refresh() {} });
  app4.innerHTML = toText(v4.body); v4.mount(app4);
  app4.querySelector('[data-tb-new]').click();
  const m4 = document.getElementById('modal');
  m4.querySelector('[data-tb-add-step]').click();
  const ty = m4.querySelector('[data-tb-step="0"] [data-tb-step-type]'); ty.value = 'send_email'; fire(ty, 'change');
  const fromSel = m4.querySelector('[data-tb-step="0"] [data-tb-step-field="from"]');
  ok(!!fromSel && fromSel.options[0].textContent === "The file's processor" && [...fromSel.options].some((o) => o.getAttribute('value') === 'u-admin'), 'the email step has From: the file\'s processor, or any staff member');
  const sigBox = m4.querySelector('[data-tb-step="0"] [data-tb-step-sig]');
  ok(!!sigBox && sigBox.hasAttribute('checked'), 'Add the sender\'s signature is ticked on a new email step');
  ok([...m4.querySelectorAll('[data-tb-step="0"] [data-tb-insert] option')].some((o) => o.textContent === "Recipient's first name"), 'Insert field says "Recipient\'s first name" (no "from To")');
  document.querySelector('#modal [data-close]').click();
}

console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
