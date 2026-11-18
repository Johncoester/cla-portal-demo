/* Home My Tasks: Related To and Contact Name are the lead or client, as a link. Fake data. No network. */
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
  { id: 't-missing', kind: 'task', owner_id: 'janine', subject: 'Call the missing lead', status: 'Not Started', due_date: '2026-11-24', entity: 'lead', entity_id: 'lead-gone', reminder: false, participants: [] },
  { id: 't-other-owner', kind: 'task', owner_id: 'someone-else', subject: 'Not mine', status: 'Not Started', due_date: '2026-11-20', entity: 'lead', entity_id: 'lead-marcus', reminder: false, participants: [] },
];
const people = {
  crm_leads: [
    { id: 'lead-marcus', first_name: 'Marcus', last_name: 'Vance' },
    { id: 'lead-nina', first_name: 'Nina', last_name: 'Newagent' },
  ],
  contacts: [{ id: 'c-ada', first_name: 'Ada', last_name: 'Buyer' }],
};

function hostedClient({ failContacts = false } = {}) {
  const calls = [];
  const from = (table) => {
    const filters = [];
    let ids = null;
    let selected = '*';
    const run = () => {
      calls.push({ table, select: selected, filters: filters.map((pair) => pair.slice()), ids: ids ? ids.slice() : null });
      if (failContacts && table === 'contacts') return Promise.resolve({ data: null, error: { message: 'not allowed' } });
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
ok(activities.length === 1 && activities[0].select === '*' && activities[0].filters.join() === 'kind,task,owner_id,janine', 'the task read stays one query, filtered by kind and owner');
ok(leads.length === 1 && leads[0].select === 'id, first_name, last_name' && same(leads[0].ids, ['lead-marcus', 'lead-nina', 'lead-gone']), 'every lead on this list is named in one read, once each');
ok(clients.length === 1 && clients[0].select === 'id, first_name, last_name' && same(clients[0].ids, ['c-ada']), 'every client on this list is named in one read');
ok(!reads.some((c) => c.table === 'crm_accounts'), 'a company task does not add its own name read');
ok(hosted.calls.filter((c) => c.rpc).map((c) => c.rpc).join() === 'crm_assignees', 'naming the people reuses the assignee read');
ok(mine.length === 7 && !mine.some((t) => t.id === 't-other-owner'), 'another owner is still left out of this list');

const intro = mine.find((t) => t.subject === 'Intro Call');
ok(intro.relatedTo === 'Marcus Vance' && intro.contactName === 'Marcus Vance', 'Intro Call shows Marcus Vance in Related To and Contact Name');
ok(intro.relatedLink === '#/crm/leads/lead-marcus' && intro.contactLink === '#/crm/leads/lead-marcus', 'both Intro Call names open the lead profile');
const client = mine.find((t) => t.id === 't-client');
ok(client.relatedTo === 'Ada Buyer' && client.contactName === 'Ada Buyer' && client.relatedLink === '#/crm/contacts/c-ada' && client.contactLink === '#/crm/contacts/c-ada', 'a client task shows that client and opens the client profile');
const other = mine.find((t) => t.id === 't-other-lead');
ok(other.relatedTo === 'Nina Newagent' && other.contactLink === '#/crm/leads/lead-nina', 'a second lead on the same list keeps its own name');
const missing = mine.find((t) => t.id === 't-missing');
ok(!missing.relatedTo && !missing.contactName && !missing.relatedLink && !missing.contactLink, 'a lead the read does not return leaves both columns blank');
const company = mine.find((t) => t.id === 't-company');
ok(!company.relatedTo && !company.contactName, 'a company task is not given a lead or client name');

const leadTasks = tasks.filter((t) => t.entity === 'lead' && t.owner_id === 'janine');
const leadHost = hostedClient();
const saved = tasks.splice(0, tasks.length, ...leadTasks);
const leadRows = await leadHost.api.listCrmTasks({ ownerId: 'janine' });
const leadReads = leadHost.calls.filter((c) => c.table && c.table !== 'crm_activities');
tasks.splice(0, tasks.length, ...saved);
ok(leadReads.length === 1 && leadReads[0].table === 'crm_leads' && leadRows.find((t) => t.subject === 'Intro Call').relatedTo === 'Marcus Vance', 'a lead-only list, such as Intro Call, asks once for every lead name');

const broken = hostedClient({ failContacts: true });
const still = await broken.api.listCrmTasks({ ownerId: 'janine' });
ok(still.find((t) => t.id === 't-intro').relatedTo === 'Marcus Vance' && !still.find((t) => t.id === 't-client').contactName, 'a failed client read leaves that cell blank and still returns the lead name');

const me = { id: 'janine', canEdit: true, isAdmin: false, name: 'Janine CRM' };
const view = await homePage({
  api: { listCrmTasks: (opts) => hosted.api.listCrmTasks(opts), listCrmLeads: async () => [], listCrmOpportunities: async () => [] },
  me, params: {}, cfg: { picklists: {}, customFields: [] }, refresh() {}, assignees: [],
});
const host = document.getElementById('app');
host.innerHTML = toText(view.body);
view.mount(host);
const cell = (id, col) => host.querySelector(`tr[data-task="${id}"] [data-col="${col}"] a`);
const introRelated = cell('t-intro', 'relatedTo');
const introContact = cell('t-intro', 'contactName');
ok(introRelated && introRelated.getAttribute('href') === '#/crm/leads/lead-marcus' && introRelated.textContent === 'Marcus Vance', 'the Related To column links Marcus Vance to his lead');
ok(introContact && introContact.getAttribute('href') === '#/crm/leads/lead-marcus' && introContact.textContent === 'Marcus Vance', 'the Contact Name column links Marcus Vance to his lead');
const clientRelated = cell('t-client', 'relatedTo');
const clientContact = cell('t-client', 'contactName');
ok(clientRelated && clientRelated.getAttribute('href') === '#/crm/contacts/c-ada' && clientRelated.textContent === 'Ada Buyer', 'the Related To column links the client to that profile');
ok(clientContact && clientContact.getAttribute('href') === '#/crm/contacts/c-ada' && clientContact.textContent === 'Ada Buyer', 'the Contact Name column links the client to that profile');
ok(!cell('t-missing', 'relatedTo') && !cell('t-missing', 'contactName'), 'a missing name is not an empty link');
ok(!host.querySelector('tr[data-task="t-other-owner"]'), 'My Open Tasks still hides another owner');

const homeSrc = read('js/pages/crm-home.js');
ok(homeSrc.includes('data-col="relatedTo"') && homeSrc.includes('data-col="contactName"') && homeSrc.includes('t.relatedLink') && homeSrc.includes('t.contactLink'), 'Home already prints each name as a link when the task has one');
ok(read('js/data/supabase-adapter.js').includes('supabase-crm.js?v=202611245200') && read('js/data/adapter.js').includes('supabase-adapter.js?v=202611245400') && read('js/app.js').includes('adapter.js?v=202611245500') && read('index.html').includes('js/app.js?v=202611245500'), 'the importer chain through the shell is stamped 202611245500');
const listFn = read('js/data/supabase-crm.js');
const listBody = listFn.slice(listFn.indexOf('async listCrmTasks'), listFn.indexOf('async getCrmTask'));
ok(listBody.includes('taskPartyNames') && !listBody.includes(".eq('entity_id'") && !listBody.includes('.filter('), 'the task list adds one name read for the whole list and does not filter the rows afterwards');

console.log(fail ? fail + ' failed' : 'crm home task names passed');
if (fail) process.exit(1);
