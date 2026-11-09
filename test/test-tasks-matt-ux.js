/* Processor file Tasks: denser list, Expand all edits buyer and seller intake, green/navy/red status.
   Buyer, seller, and agent lists keep their own tasks and do not get the processor editor. No hosted project. */
import { readFileSync } from 'node:fs';
import { toText } from '../js/ui.js';
import { render } from '../js/pages/dealtasks.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
globalThis.location = { hash: '#/deals/d1/tasks', search: '', pathname: '/' };

const deal = { id: 'd1', transactionType: 'Purchase', participants: [] };
const form = (over) => ({ id: 't-buyer', title: 'Personal information', status: 'todo', assignedRole: 'Client-Buyer', kind: 'form', participantId: 'p-buyer', ownerName: 'Ann Buyer', dueDate: '2099-01-01', canFill: true, templateVersion: 4, dealId: 'd1', description: 'Contact details and closing preferences that used to take a second line', ...over });
const tasks = [
  form({ id: 't-done', title: 'Upload photo ID', status: 'done', dueDate: '2000-01-01' }),
  form({ id: 't-late', title: 'Lender information', status: 'todo', dueDate: '2000-01-01' }),
  form({ id: 't-open', title: 'Personal information', status: 'in_progress', dueDate: '2099-06-01' }),
  form({ id: 't-seller', title: 'Outstanding mortgage', status: 'todo', assignedRole: 'Client-Seller', participantId: 'p-seller', ownerName: 'Sam Seller', dueDate: '2099-06-01' }),
  form({ id: 't-cancel', title: 'Home warranty', status: 'cancelled', assignedRole: 'Client-Seller', participantId: 'p-seller', ownerName: 'Sam Seller', dueDate: '2000-01-01' }),
  { id: 't-agent', title: 'Commission information', status: 'todo', assignedRole: 'Buyer Agent', kind: 'agent', participantId: 'p-agent', ownerName: 'Blake Agent', dueDate: '2099-01-01', dealId: 'd1', mine: false, canFill: false },
  { id: 't-staff', title: 'Send contract', status: 'todo', assignedRole: 'Processor', kind: 'simple', dueDate: '2099-01-01', dealId: 'd1', canTick: true },
];
const api = { listTasks: async () => tasks, listAgreements: async () => ({ agreements: [] }) };
const htmlOf = async (user, id = 'd1') => toText((await render({ api, user, deal: { ...deal, id }, refresh() {} })).body);

const proc = await htmlOf({ id: 'u-proc', role: 'Processor', roles: ['Processor'] });
ok(proc.includes('data-file-tasks="dense"') && proc.includes('>Expand all<') && proc.includes('data-expand-all="1"'), 'a processor gets a dense list and Expand all');
ok(proc.includes('data-expand-side="buyer"') && proc.includes('data-expand-side="seller"') && !proc.includes('data-expand-side="buyer-agent"'), 'Expand all is on the buyer group and the seller group');
ok(proc.includes('data-intake-slot="t-open"') && proc.includes('data-intake-slot="t-seller"') && !proc.includes('data-intake-slot="t-agent"'), 'intake slots are buyer and seller forms');
ok(proc.includes('data-task-tone="is-done"') && proc.includes('data-task-tone="is-open"') && proc.includes('data-task-tone="is-overdue"') && proc.includes('data-task-tone="is-cancelled"'), 'done, open, overdue, and cancelled are different cues');
ok(!proc.includes('data-task-row="t-done" class="is-open"') && proc.includes('data-task-row="t-done"') && proc.includes('class="is-done"'), 'a completed task is marked done');
const emptyAgent = proc.match(/<details class="side-box side-listing-agent"[^>]*>/);
ok(emptyAgent && !/\sopen[\s>]/.test(emptyAgent[0]), 'an empty processor group starts collapsed');
const buyerBox = proc.match(/<details class="side-box side-buyer"[^>]*>/);
ok(buyerBox && /\sopen[\s>]/.test(buyerBox[0]), 'a processor group with tasks stays open');

const buyerTasks = tasks.map((t) => ({ ...t, mine: t.participantId === 'p-buyer' }));
const buyerHtml = toText((await render({ api: { ...api, listTasks: async () => buyerTasks }, user: { id: 'u-buyer', role: 'Client-Buyer', roles: ['Client-Buyer'], accountRole: 'Outside user' }, deal, refresh() {} })).body);
ok(buyerHtml.includes('To-do list') && buyerHtml.includes('Personal information') && buyerHtml.includes('Upload photo ID') && !buyerHtml.includes('Outstanding mortgage'), 'a buyer sees only their own tasks');
ok(!buyerHtml.includes('data-expand-all') && !buyerHtml.includes('data-file-tasks="dense"') && !buyerHtml.includes('data-intake-by-person') && !buyerHtml.includes('data-sidebox="seller"') && !buyerHtml.includes('data-sidebox="listing-agent"'), 'a buyer does not get the processor editor or the other side');
ok(buyerHtml.includes('data-task-tone="is-done"') && buyerHtml.includes('Agreements to acknowledge'), 'a buyer still gets the done cue and the agreement to-dos');

const sellerTasks = tasks.map((t) => ({ ...t, mine: t.participantId === 'p-seller' }));
const sellerHtml = toText((await render({ api: { ...api, listTasks: async () => sellerTasks }, user: { id: 'u-seller', role: 'Client-Seller', roles: ['Client-Seller'], accountRole: 'Outside user' }, deal, refresh() {} })).body);
ok(sellerHtml.includes('Outstanding mortgage') && !sellerHtml.includes('Personal information') && !sellerHtml.includes('data-sidebox="buyer-agent"') && !sellerHtml.includes('data-expand-all'), 'a seller sees only their own tasks');

const agentHtml = toText((await render({ api, user: { id: 'u-bagent', role: 'Buyer Agent', roles: ['Buyer Agent'], accountRole: 'Outside user' }, deal, refresh() {} })).body);
ok(agentHtml.includes('Commission information') && agentHtml.includes('Personal information') && agentHtml.includes('Outstanding mortgage') && agentHtml.includes('data-intake-by-person'), 'an agent still sees the file tasks and Intake by person');
ok(!agentHtml.includes('data-expand-all') && !agentHtml.includes('data-intake-slot') && !agentHtml.includes('data-file-tasks="dense"') && agentHtml.includes('data-agent-task="t-agent"'), 'an agent does not get the processor expand editor');
ok(agentHtml.includes('data-task-tone="is-done"') && agentHtml.includes('data-sidebox="listing-agent"'), 'an agent still gets every side box and the done cue');

const salesHtml = await htmlOf({ id: 'u-sp', role: 'Sales Person', roles: ['Sales Person'] });
ok(!salesHtml.includes('data-expand-all') && !salesHtml.includes('data-file-tasks="dense"') && salesHtml.includes('All Tasks') && salesHtml.includes('Send contract'), 'a sales rep keeps the task list without the processor editor');

const css = readFileSync(new URL('../css/portal.css', import.meta.url), 'utf8');
ok(css.includes('.file-tasks .tbl.striped tbody tr.is-done td') && css.includes('var(--ok-bg)') && css.includes('var(--ok)'), 'completed rows use green');
ok(css.includes('tr.is-open td') && css.includes('var(--navy-50)') && css.includes('var(--navy-600)'), 'open rows use navy');
ok(css.includes('tr.is-overdue td') && css.includes('var(--bad-bg)') && css.includes('var(--bad)'), 'overdue rows use red');
ok(css.includes('.file-tasks-dense .tbl td') && css.includes('padding: 3px 8px') && css.includes('position: sticky'), 'the processor list uses tighter rows and sticky group headers');

const { parseHTML } = await import('/tmp/domtest/node_modules/linkedom/worker.js');
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
window.HTMLElement = window.HTMLElement;
class ListFormData { constructor(form) { this.pairs = []; if (!form) return; form.querySelectorAll('input, textarea, select').forEach((el) => { if (!el.name || el.type === 'file') return; if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return; this.pairs.push([el.name, el.value]); }); } forEach(fn) { this.pairs.forEach(([k, v]) => fn(v, k)); } }
globalThis.FormData = ListFormData; window.FormData = ListFormData;
const saved = [];
const full = {
  id: 't-open', title: 'Personal information', status: 'todo', assignedRole: 'Client-Buyer', kind: 'form', canFill: true, ownerName: 'Ann Buyer', dealId: 'd-exp',
  fields: [{ k: 'full_name', label: 'Full legal name', type: 'text', req: true }, { k: 'notes', label: 'Notes', type: 'textarea' }],
  formData: { full_name: 'Ann Buyer' }, documents: [],
};
const expDeal = { id: 'd-exp', transactionType: 'Purchase', participants: [] };
const expTasks = [form({ id: 't-open', dealId: 'd-exp' }), form({ id: 't-seller', title: 'Outstanding mortgage', assignedRole: 'Client-Seller', participantId: 'p-seller', ownerName: 'Sam Seller', dealId: 'd-exp' })];
const expApi = { listTasks: async () => expTasks, getTask: async (id) => ({ ...full, id, title: id === 't-seller' ? 'Outstanding mortgage' : full.title, assignedRole: id === 't-seller' ? 'Client-Seller' : 'Client-Buyer' }), saveTaskForm: async (id, data, opts) => { saved.push({ id, data, opts }); return {}; } };
const view = await render({ api: expApi, user: { id: 'u-proc', role: 'Processor', roles: ['Processor'] }, deal: expDeal, refresh() {} });
const host = document.createElement('div'); host.innerHTML = toText(view.body); document.body.appendChild(host);
view.mount(host);
host.querySelector('[data-expand-side="buyer"]').click();
for (let i = 0; i < 20 && !host.querySelector('[data-intake-panel="t-open"]'); i += 1) await new Promise((r) => setTimeout(r, 10));
ok(!!host.querySelector('[data-intake-panel="t-open"] input[name="full_name"]') && !host.querySelector('[data-intake-panel="t-seller"]'), 'buyer Expand all opens that side for editing and leaves the seller closed');
host.querySelector('[data-expand-all="1"]').click();
for (let i = 0; i < 20 && !host.querySelector('[data-intake-panel="t-seller"]'); i += 1) await new Promise((r) => setTimeout(r, 10));
const sellerForm = host.querySelector('[data-intake-panel="t-seller"] form');
ok(!!sellerForm && sellerForm.querySelector('[data-mode="complete"]') && sellerForm.querySelector('[data-mode="save"]'), 'Expand all opens the seller intake editor too');
sellerForm.querySelector('[name="full_name"]').value = 'Sam Seller';
sellerForm.querySelector('[data-mode="save"]').click();
sellerForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
for (let i = 0; i < 20 && !saved.length; i += 1) await new Promise((r) => setTimeout(r, 10));
ok(saved.length === 1 && saved[0].id === 't-seller' && saved[0].data.full_name === 'Sam Seller' && saved[0].opts.complete === false, 'saving an expanded intake writes that task and does not mark it complete');
host.querySelector('[data-expand-all="0"]').click();
ok(host.querySelector('[data-intake-slot="t-open"]').hidden && host.querySelector('[data-intake-slot="t-seller"]').hidden, 'Collapse all hides the intake editors');

console.log(fail ? fail + ' failed' : 'tasks matt ux passed');
process.exit(fail ? 1 : 0);
