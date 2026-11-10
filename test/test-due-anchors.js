/* Due dates count from opened, contract, or closing. A missing date stays blank.
   A processor can override one copy. A client cannot change a due date or see the other side.
   The Tasks tab already had title, assignee, and due date. Audience is the piece this adds. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { taskDueDate } from '../js/data/due-date.js';
import { shapeListedTask, fetchHostedTaskList } from '../js/data/task-actions.js';
import { taskAdminView } from '../js/pages/task-admin.js';
import { toText } from '../js/ui.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(taskDueDate({ dueAnchor: 'opened', dueDays: 7, openDate: '2026-11-01' }) === '2026-11-08', 'seven days after the file opened');
ok(taskDueDate({ dueAnchor: 'closing', dueDays: -3, closingDate: '2026-12-01' }) === '2026-11-28', 'three days before closing');
ok(taskDueDate({ dueAnchor: 'contract', dueDays: 5, contractDate: '2026-11-10' }) === '2026-11-15', 'five days after the contract date');
ok(taskDueDate({ dueAnchor: 'contract', dueDays: 5, openDate: '2026-11-01' }) === null, 'a missing contract date does not invent a due date');
ok(taskDueDate({ dueAnchor: 'closing', dueDays: 2, openDate: '2026-11-01' }) === null, 'a missing closing date does not invent a due date');
ok(taskDueDate({ dueAnchor: 'opened', dueDays: 7, openDate: '2026-11-01', override: '2026-11-20' }) === '2026-11-20', 'an override keeps the date set on that copy');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const saved = await api.saveTaskTemplate({ code: 'survey_anchor', title: 'Survey anchor', lane: 'portal', audiences: ['buyer'], roles: ['Client-Buyer'], dueDays: -2, dueAnchor: 'closing' });
ok(saved.dueAnchor === 'closing' && saved.dueDays === -2, 'an admin saves the anchor with the task');
let zero = '';
try { await api.saveTaskTemplate({ code: 'survey_zero', title: 'Zero', lane: 'portal', audiences: ['buyer'], roles: ['Client-Buyer'], dueDays: 0, dueAnchor: 'opened' }); }
catch (e) { zero = e.message; }
ok(/not zero|-90 to 90/.test(zero), 'zero due days are refused');

const deal = await api.createDeal({ street: '4 Anchor Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-01', closingDate: '2026-12-15', processorId: 'u-proc' });
await api.updateContractInfo(deal.id, { contractDate: '2026-11-10' });
await api.saveTaskTemplate({ code: 'contract_anchor', title: 'Contract anchor', lane: 'portal', audiences: ['buyer'], roles: ['Client-Buyer'], dueDays: 5, dueAnchor: 'contract' });
await api.saveTaskTemplate({ code: 'opened_anchor', title: 'Opened anchor', lane: 'portal', audiences: ['buyer'], roles: ['Client-Buyer'], dueDays: 4, dueAnchor: 'opened' });
await api.addParticipant(deal.id, 'c-buyer', 'Client-Buyer');
await api.addParticipant(deal.id, 'c-seller', 'Client-Seller');
const tasks = await api.listTasks(deal.id);
const survey = tasks.find((t) => t.templateCode === 'survey_anchor');
const contract = tasks.find((t) => t.templateCode === 'contract_anchor' && t.assignedRole === 'Client-Buyer');
const opened = tasks.find((t) => t.templateCode === 'opened_anchor' && t.assignedRole === 'Client-Buyer');
ok(survey && survey.dueDate === '2026-12-13' && survey.assignedRole === 'Client-Buyer' && survey.dueOverridden === false, 'the buyer copy is due two days before closing');
ok(contract && contract.dueDate === '2026-11-15', 'the contract anchor uses the contract date');
ok(opened && opened.dueDate === '2026-11-05', 'the opened anchor uses the file opened date');
ok(!tasks.some((t) => t.templateCode === 'survey_anchor' && t.assignedRole === 'Client-Seller'), 'the buyer audience does not create a seller copy');

const blank = await api.createDeal({ street: '6 Anchor Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-01', processorId: 'u-proc' });
await api.updateContractInfo(blank.id, { contractDate: '' });
await api.addParticipant(blank.id, 'c-buyer', 'Client-Buyer');
const blankTasks = await api.listTasks(blank.id);
ok(blankTasks.find((t) => t.templateCode === 'survey_anchor').dueDate == null, 'a missing closing date leaves no due date');
ok(blankTasks.find((t) => t.templateCode === 'contract_anchor').dueDate == null, 'a missing contract date leaves no due date');
ok(blankTasks.find((t) => t.templateCode === 'opened_anchor').dueDate === '2026-11-05', 'the opened date is still used when the others are blank');

await api.signInDev('u-proc');
const changed = await api.updateTask(survey.id, { dueDate: '2026-12-01' });
ok(changed.dueDate === '2026-12-01' && changed.dueOverridden === true, 'a processor can override one copy');
await api.signInDev('u-admin');
await api.saveTaskTemplate({ code: 'survey_anchor', title: 'Survey anchor', lane: 'portal', audiences: ['buyer'], roles: ['Client-Buyer'], dueDays: 9, dueAnchor: 'opened' });
await api.addParticipant(deal.id, 'c-tc', 'Transaction Coordinator');
await api.signInDev('u-proc');
const kept = (await api.listTasks(deal.id)).find((t) => t.id === survey.id);
ok(kept.dueDate === '2026-12-01' && kept.dueOverridden === true, 'saving a new template version does not rewrite the overridden copy');

await api.signInDev('u-tc');
const sellerCopy = (await api.listTasks(deal.id)).find((t) => t.assignedRole === 'Client-Seller');
const tcChanged = await api.updateTask(sellerCopy.id, { dueDate: '2026-11-20' });
ok(tcChanged.dueDate === '2026-11-20' && tcChanged.dueOverridden === true, 'a transaction coordinator can override one copy');

await api.signInDev('u-buyer');
const mine = await api.listTasks(deal.id);
ok(mine.some((t) => t.templateCode === 'survey_anchor') && mine.every((t) => t.assignedRole !== 'Client-Seller'), 'the buyer does not see the seller tasks');
let refused = '';
try { await api.updateTask(survey.id, { dueDate: '2026-01-01' }); } catch (e) { refused = e.message; }
ok(/assigned to you|not found|cannot/i.test(refused), 'the buyer cannot override the due date');

await api.signInDev('u-proc');
const oneOff = await api.createTask(deal.id, { title: 'Buyer packet', description: 'One file only', assignedRole: 'Client-Buyer', dueDate: '2026-12-20', audiences: ['buyer'] });
ok(oneOff.dueDate === '2026-12-20' && oneOff.audiences.join() === 'buyer' && oneOff.assignedRole === 'Client-Buyer', 'a processor adds a one-off task with a due date, assignee, and audience');
const sellerPacket = await api.createTask(deal.id, { title: 'Seller only packet', assignedRole: 'Client-Seller', dueDate: '2026-12-21', audiences: ['seller'] });
const blocked = await api.createTask(deal.id, { title: 'Seller role buyer audience', assignedRole: 'Client-Seller', dueDate: '2026-12-22', audiences: ['buyer'] });
await api.signInDev('u-buyer');
const buyerSees = await api.listTasks(deal.id);
ok(buyerSees.some((t) => t.id === oneOff.id) && !buyerSees.some((t) => t.id === sellerPacket.id) && !buyerSees.some((t) => t.id === blocked.id), 'the buyer sees the buyer audience and not the seller tasks');
const outside = { id: 'd3af', role: 'Outside user' };
const packet = shapeListedTask({ id: 't', kind: 'simple', status: 'todo', assignedRole: 'Client-Buyer', participantId: null, ownerProfileId: null, title: 'E2E buyer packet' }, outside, { fileRoles: ['Client-Buyer'] });
ok(packet.mine && packet.canTick && !packet.notYours, 'an outside user who is the buyer on this file owns an unowned buyer task');
const sellerOnly = shapeListedTask({ id: 's', kind: 'simple', status: 'todo', assignedRole: 'Client-Seller', participantId: null, ownerProfileId: null }, outside, { fileRoles: ['Client-Buyer'] });
ok(!sellerOnly.mine && sellerOnly.notYours, 'that buyer does not own an unowned seller task');
const accountOnly = shapeListedTask({ id: 't2', kind: 'simple', status: 'todo', assignedRole: 'Client-Buyer', participantId: null, ownerProfileId: null }, outside);
ok(!accountOnly.mine, 'the Outside user account role alone does not own the buyer task');
const hostedRow = { id: 'pkt', deal_id: 'deal-1', title: 'E2E buyer packet', assigned_role: 'Client-Buyer', status: 'todo', kind: 'simple', participant_id: null, owner_profile_id: null, due_date: '2026-12-20' };
const hosted = {
  from(table) {
    const api = { select() { return api; }, eq() { return api; }, order() { return api; }, then(resolve) { resolve(table === 'tasks' ? { data: [hostedRow], error: null } : { data: [], error: null }); } };
    return api;
  },
  rpc(name) { return name === 'deal_contacts' ? Promise.resolve({ data: [{ profile_id: 'd3af', participant_id: 'p-buyer', role: 'Client-Buyer' }], error: null }) : Promise.resolve({ data: null, error: { message: name } }); },
};
const listed = await fetchHostedTaskList(hosted, 'deal-1', outside);
ok(listed.length === 1 && listed[0].mine && listed[0].canTick && listed[0].dueDate === '2026-12-20', 'the hosted list marks the one-off as the buyer on this file');
const adapterSrc = readFileSync('js/data/supabase-adapter.js', 'utf8');
ok(adapterSrc.includes('viewerOnFile') && adapterSrc.includes('fileRoles: onFile.roles'), 'the signed-in task list passes this file\'s roles into each row');
await api.signInDev('u-seller');
const sellerSees = await api.listTasks(deal.id);
ok(!sellerSees.some((t) => t.id === oneOff.id) && sellerSees.some((t) => t.id === sellerPacket.id) && !sellerSees.some((t) => t.id === blocked.id), 'the seller sees the seller audience and not a buyer audience on their role');

globalThis.location = { hash: '#/admin/templates?tab=admin', search: '', pathname: '/' };
await api.signInDev('u-admin');
const closed = toText((await taskAdminView({ api, refresh() {} })).body);
ok(closed.includes('data-new-task') && closed.includes('>+ New task<') && /id="task-admin-form"[^>]*hidden/.test(closed), 'the new task form stays closed until New task');
ok(closed.includes('data-task-anchor') && closed.includes('min="-90"') && closed.includes('max="90"'), 'the form asks for class, due days, and the anchor');
globalThis.location = { hash: '#/admin/templates?tab=admin&new=1', search: '', pathname: '/' };
const openedForm = toText((await taskAdminView({ api, refresh() {} })).body);
ok(/id="task-admin-form"\s*>/.test(openedForm) && !/id="task-admin-form"[^>]*hidden/.test(openedForm), 'the new=1 link opens the form');

const { parseHTML } = await import('/tmp/domtest/node_modules/linkedom/worker.js');
const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement;
globalThis.location = { hash: '#/admin/templates?tab=admin', search: '', pathname: '/' };
const view = await taskAdminView({ api, refresh() {} });
const host = document.createElement('div');
host.innerHTML = toText(view.body);
document.body.appendChild(host);
view.mount(host);
const form = host.querySelector('#task-admin-form');
ok(form.hidden === true, 'the mounted form is hidden');
host.querySelector('[data-new-task]').click();
ok(form.hidden === false && host.querySelector('[data-task-lane]') && host.querySelector('[data-audience="buyer"]') && host.querySelector('[data-task-anchor]'), 'New task opens class, audience, and anchor');

console.log(fail ? fail + ' failed' : 'due anchors passed');
if (fail) process.exit(1);
