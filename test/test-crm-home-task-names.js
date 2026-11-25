/* Home My Tasks: no Related To column. Contact Name links to the lead, client, company, or deal. Fake data. No network. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { crmSupabase } from '../js/data/supabase-crm.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true, get() { return selectValue.get.call(this); },
  set(v) { const want = String(v); [...this.options].forEach((o) => { if (o.getAttribute('value') === want || o.value === want) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); } });
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.sessionStorage = mem();
window.sessionStorage = globalThis.sessionStorage;

const { homePage } = await import('../js/pages/crm-home.js');
const { toText } = await import('../js/ui.js');

const tasks = [
  { id: 't-intro', kind: 'task', owner_id: 'janine', subject: 'Intro Call', status: 'Not Started', due_date: '2026-11-20', entity: 'lead', entity_id: 'lead-marcus', reminder: false, participants: [] },
  { id: 't-intro-2', kind: 'task', owner_id: 'janine', subject: 'Intro Call follow-up', status: 'Not Started', due_date: '2026-11-21', entity: 'lead', entity_id: 'lead-marcus', reminder: false, participants: [] },
  { id: 't-other-lead', kind: 'task', owner_id: 'janine', subject: 'Send the one-pager', status: 'Not Started', due_date: '2026-11-22', entity: 'lead', entity_id: 'lead-nina', reminder: false, participants: [] },
  { id: 't-client', kind: 'task', owner_id: 'janine', subject: 'Send November rate sheet', status: 'Not Started', due_date: '2026-11-18', entity: 'contact', entity_id: 'c-ada', reminder: false, participants: [] },
  { id: 't-client-2', kind: 'task', owner_id: 'janine', subject: 'Thank-you card', status: 'Not Started', due_date: '2026-11-19', entity: 'contact', entity_id: 'c-ada', reminder: false, participants: [] },
  { id: 't-company', kind: 'task', owner_id: 'janine', subject: 'Office lunch', status: 'Not Started', due_date: '2026-11-23', entity: 'account', entity_id: 'acc-oak', reminder: false, participants: [] },
  { id: 't-deal', kind: 'task', owner_id: 'janine', subject: 'Order the survey', status: 'Not Started', due_date: '2026-11-25', entity: 'deal', entity_id: 'deal-1', reminder: false, participants: [] },
  { id: 't-deal-2', kind: 'task', owner_id: 'janine', subject: 'Confirm the survey', status: 'Not Started', due_date: '2026-11-26', entity: 'deal', entity_id: 'deal-1', reminder: false, participants: [] },
  { id: 't-deal-gone', kind: 'task', owner_id: 'janine', subject: 'Call about a missing file', status: 'Not Started', due_date: '2026-11-27', entity: 'deal', entity_id: 'deal-gone', reminder: false, participants: [] },
  { id: 't-opp', kind: 'task', owner_id: 'janine', subject: 'Pipeline check-in', status: 'Not Started', due_date: '2026-11-28', entity: 'opportunity', entity_id: 'opp-1', reminder: false, participants: [] },
  { id: 't-missing', kind: 'task', owner_id: 'janine', subject: 'Call the missing lead', status: 'Not Started', due_date: '2026-11-24', entity: 'lead', entity_id: 'lead-gone', reminder: false, participants: [] },
  { id: 't-other-owner', kind: 'task', owner_id: 'someone-else', subject: 'Not mine', status: 'Not Started', due_date: '2026-11-20', entity: 'lead', entity_id: 'lead-marcus', reminder: false, participants: [] },
];
const people = {
  crm_leads: [
    { id: 'lead-marcus', first_name: 'Marcus', last_name: 'Vance' },
    { id: 'lead-nina', first_name: 'Nina', last_name: 'Newagent' },
  ],
  contacts: [{ id: 'c-ada', first_name: 'Ada', last_name: 'Buyer' }],
  crm_accounts: [{ id: 'acc-oak', name: 'Oak Title' }],
  deals: [{ id: 'deal-1', street: '1 Main St', city: 'Baltimore', state: 'MD', zip: '21201' }],
};

function hostedClient({ failContacts = false, failDeals = false } = {}) {
  const calls = [];
  const from = (table) => {
    const filters = [];
    let ids = null;
    let selected = '*';
    const run = () => {
      calls.push({ table, select: selected, filters: filters.map((pair) => pair.slice()), ids: ids ? ids.slice() : null });
      if (failContacts && table === 'contacts') return Promise.resolve({ data: null, error: { message: 'not allowed' } });
      if (failDeals && table === 'deals') return Promise.resolve({ data: null, error: { message: 'not allowed' } });
      let data = [];
      if (table === 'crm_activities') data = tasks.filter((r) => filters.every(([k, v]) => r[k] === v));
      else if (people[table]) data = ids ? people[table].filter((r) => ids.includes(r.id)) : people[table];
      return Promise.resolve({ data, error: null });
    };
    const api = {
      select(s) { selected = s || '*'; return api; },
      eq(k, v) { filters.push([k, v]); return api; },
      in(k, vals) { if (k === 'id') ids = [...vals]; return api; },
      then(res, rej) { return run().then(res, rej); },
    };
    return api;
  };
  const sb = {
    from,
    rpc: async (name) => {
      calls.push({ rpc: name });
      if (name === 'crm_assignees') return { data: [{ id: 'janine', name: 'Janine CRM', role: 'Sales Person' }], error: null };
      return { data: [], error: null };
    },
  };
  const okFn = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
  const camel = (o) => (Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o);
  const api = crmSupabase({ sb, ok: okFn, camel, me: async () => { throw new Error('the name read must not look the user up again'); }, flags: { crm: true } });
  return { api, calls };
}

const same = (a, b) => a.slice().sort().join() === b.slice().sort().join();
const hosted = hostedClient();
const mine = await hosted.api.listCrmTasks({ ownerId: 'janine' });
const reads = hosted.calls.filter((c) => c.table);
const activities = reads.filter((c) => c.table === 'crm_activities');
const leads = reads.filter((c) => c.table === 'crm_leads');
const clients = reads.filter((c) => c.table === 'contacts');
const accounts = reads.filter((c) => c.table === 'crm_accounts');
const deals = reads.filter((c) => c.table === 'deals');
ok(activities.length === 1 && activities[0].select === '*' && activities[0].filters.join() === 'kind,task,owner_id,janine', 'the task read stays one query, filtered by kind and owner');
ok(leads.length === 1 && leads[0].select === 'id, first_name, last_name' && same(leads[0].ids, ['lead-marcus', 'lead-nina', 'lead-gone']), 'every lead on this list is named in one read, once each');
ok(clients.length === 1 && clients[0].select === 'id, first_name, last_name' && same(clients[0].ids, ['c-ada']), 'every client on this list is named in one read');
ok(accounts.length === 1 && accounts[0].select === 'id, name' && same(accounts[0].ids, ['acc-oak']), 'every company on this list is named in one read');
ok(deals.length === 1 && deals[0].select === 'id, street, city, state, zip' && same(deals[0].ids, ['deal-1', 'deal-gone']), 'every deal on this list is named in one read, not once per task');
ok(!reads.some((c) => c.table === 'crm_opportunities'), 'an opportunity task does not add a name read');
ok(hosted.calls.filter((c) => c.rpc).map((c) => c.rpc).join() === 'crm_assignees', 'naming the people reuses the assignee read');
ok(mine.length === 11 && !mine.some((t) => t.id === 't-other-owner'), 'another owner is still left out of this list');

const intro = mine.find((t) => t.subject === 'Intro Call');
ok(intro.contactName === 'Marcus Vance' && intro.contactLink === '#/crm/leads/lead-marcus', 'Intro Call names Marcus Vance and opens his lead');
const client = mine.find((t) => t.id === 't-client');
ok(client.contactName === 'Ada Buyer' && client.contactLink === '#/crm/contacts/c-ada', 'a client task names that client and opens the client');
const other = mine.find((t) => t.id === 't-other-lead');
ok(other.contactName === 'Nina Newagent' && other.contactLink === '#/crm/leads/lead-nina', 'a second lead on the same list keeps its own name');
const missing = mine.find((t) => t.id === 't-missing');
ok(!missing.contactName && !missing.contactLink, 'a lead the read does not return leaves Contact Name blank');
const company = mine.find((t) => t.id === 't-company');
ok(company.contactName === 'Oak Title' && company.contactLink === '#/crm/accounts/acc-oak', 'a company task names that company and opens the company');
const deal = mine.find((t) => t.id === 't-deal');
ok(deal.contactName === '1 Main St, Baltimore, MD 21201' && deal.contactLink === '#/crm/deals/deal-1', 'a deal task names the property and opens the deal');
ok(mine.find((t) => t.id === 't-deal-2').contactLink === '#/crm/deals/deal-1', 'a second task on the same deal uses that same deal');
const gone = mine.find((t) => t.id === 't-deal-gone');
ok(!gone.contactName && !gone.contactLink, 'a deal the read does not return leaves Contact Name blank');
const opp = mine.find((t) => t.id === 't-opp');
ok(!opp.contactName && !opp.contactLink, 'an opportunity task does not invent a contact name');

const leadTasks = tasks.filter((t) => t.entity === 'lead' && t.owner_id === 'janine');
const leadHost = hostedClient();
const saved = tasks.splice(0, tasks.length, ...leadTasks);
const leadRows = await leadHost.api.listCrmTasks({ ownerId: 'janine' });
const leadReads = leadHost.calls.filter((c) => c.table && c.table !== 'crm_activities');
tasks.splice(0, tasks.length, ...saved);
ok(leadReads.length === 1 && leadReads[0].table === 'crm_leads' && leadRows.find((t) => t.subject === 'Intro Call').contactName === 'Marcus Vance', 'a lead-only list, such as Intro Call, asks once for every lead name');

const broken = hostedClient({ failContacts: true });
const still = await broken.api.listCrmTasks({ ownerId: 'janine' });
ok(still.find((t) => t.id === 't-intro').contactName === 'Marcus Vance' && !still.find((t) => t.id === 't-client').contactName && still.find((t) => t.id === 't-company').contactName === 'Oak Title', 'a failed client read leaves that cell blank and still returns the lead and the company');
const brokenDeals = hostedClient({ failDeals: true });
const stillDeals = await brokenDeals.api.listCrmTasks({ ownerId: 'janine' });
ok(!stillDeals.find((t) => t.id === 't-deal').contactName && stillDeals.find((t) => t.id === 't-intro').contactLink === '#/crm/leads/lead-marcus', 'a failed deal read leaves that cell blank and still returns the lead');

const me = { id: 'janine', canEdit: true, isAdmin: false, name: 'Janine CRM' };
const view = await homePage({
  api: { listCrmTasks: (opts) => hosted.api.listCrmTasks(opts), listCrmLeads: async () => [], listCrmOpportunities: async () => [] },
  me, params: {}, cfg: { picklists: {}, customFields: [] }, refresh() {}, assignees: [],
});
const host = document.getElementById('app');
host.innerHTML = toText(view.body);
view.mount(host);
const headers = [...host.querySelectorAll('#home-tasks thead th')].map((th) => th.textContent.replace(/\s+/g, ' ').trim());
ok(!headers.some((h) => h.includes('Related To')) && !host.querySelector('#home-tasks [data-col="relatedTo"]') && !host.querySelector('#home-tasks [data-sort="relatedTo"]'), 'My Tasks has no Related To column');
ok(headers.some((h) => h.startsWith('Due Date')) && headers.some((h) => h.startsWith('Subject')) && headers.some((h) => h.startsWith('Contact Name')) && headers.some((h) => h.startsWith('Status')) && headers.some((h) => h.startsWith('Priority')), 'Due Date, Subject, Contact Name, Status, and Priority stay');
const cell = (id, col) => host.querySelector(`tr[data-task="${id}"] [data-col="${col}"] a`);
const introContact = cell('t-intro', 'contactName');
ok(introContact && introContact.getAttribute('href') === '#/crm/leads/lead-marcus' && introContact.textContent === 'Marcus Vance' && introContact.getAttribute('data-task-contact') === 'lead', 'Contact Name links Marcus Vance to his lead');
const clientContact = cell('t-client', 'contactName');
ok(clientContact && clientContact.getAttribute('href') === '#/crm/contacts/c-ada' && clientContact.textContent === 'Ada Buyer' && clientContact.getAttribute('data-task-contact') === 'contact', 'Contact Name links the client to that profile');
const companyContact = cell('t-company', 'contactName');
ok(companyContact && companyContact.getAttribute('href') === '#/crm/accounts/acc-oak' && companyContact.textContent === 'Oak Title' && companyContact.getAttribute('data-task-contact') === 'account', 'Contact Name links the company to that company');
const dealContact = cell('t-deal', 'contactName');
ok(dealContact && dealContact.getAttribute('href') === '#/crm/deals/deal-1' && dealContact.textContent === '1 Main St, Baltimore, MD 21201' && dealContact.getAttribute('data-task-contact') === 'deal', 'Contact Name links the deal to that deal');
ok(cell('t-intro', 'subject') && cell('t-intro', 'subject').getAttribute('href') === '#/crm/tasks/t-intro', 'the subject still opens the task');
ok(host.querySelector('tr[data-task="t-intro"] [data-quick-edit="t-intro"]'), 'Edit is still on the row');
ok(!cell('t-missing', 'contactName') && !cell('t-deal-gone', 'contactName') && !cell('t-opp', 'contactName'), 'a missing name is not an empty link');
ok(!host.querySelector('tr[data-task="t-other-owner"]'), 'My Open Tasks still hides another owner');
const filter = host.querySelector('[data-task-filter]');
filter.value = 'Closed Tasks';
filter.dispatchEvent(new host.ownerDocument.defaultView.Event('change'));
const empty = host.querySelector('#home-tasks tbody td');
ok(empty && empty.getAttribute('colspan') === '6' && empty.textContent === 'No tasks in this view.', 'a view with no tasks still says so, across the columns that remain');

const homeSrc = read('js/pages/crm-home.js');
const homeList = homeSrc.slice(homeSrc.indexOf('const TASK_COLS'), homeSrc.indexOf('export async function taskPage'));
ok(!homeList.includes('data-col="relatedTo"') && homeList.includes('data-col="contactName"') && homeList.includes('t.contactLink'), 'the Home list prints Contact Name as a link and does not print Related To');
ok(homeSrc.includes('data-f="relatedTo"'), 'the task page still shows Related To');
ok(read('js/pages/crm.js').includes('crm-home.js?v=202611302100') && read('js/app.js').includes('pages/crm.js?v=202611302100') && read('js/data/supabase-adapter.js').includes('supabase-crm.js?v=202611310200') && read('js/data/adapter.js').includes('supabase-adapter.js?v=202611310500') && read('js/app.js').includes('adapter.js?v=202611310500') && read('index.html').includes('js/app.js?v=202611310500'), 'the Home page is at 202611289980 and the shell is 202611290610');
const listFn = read('js/data/supabase-crm.js');
const listBody = listFn.slice(listFn.indexOf('async listCrmTasks'), listFn.indexOf('async getCrmTask'));
ok(listBody.includes('taskPartyNames') && !listBody.includes(".eq('entity_id'") && !listBody.includes('.filter('), 'the task list adds one name read for the whole list and does not filter the rows afterwards');

console.log(fail ? fail + ' failed' : 'crm home task names passed');
if (fail) process.exit(1);
