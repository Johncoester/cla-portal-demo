/* Task detail shows the lead or client the task belongs to. Fake data and a fake hosted client. No network. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { crmSupabase } from '../js/data/supabase-crm.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
const session = mem();
globalThis.sessionStorage = session;
window.sessionStorage = session;

const { taskPage } = await import('../js/pages/crm-home.js');
const { toText } = await import('../js/ui.js');

const homeSrc = read('js/pages/crm-home.js');
const taskLoad = homeSrc.slice(homeSrc.indexOf('export async function taskPage'), homeSrc.indexOf('export async function meetingPage'));
ok(taskLoad.includes('api.getCrmTask(params.id)') && !taskLoad.includes('listCrmLeads') && !taskLoad.includes('getCrmLead') && !taskLoad.includes('listCrmContacts') && !taskLoad.includes('getCrmContact'), 'the task page uses the task already loaded and does not open the lead or client list');
ok(!taskLoad.includes('task-board') && !read('js/data/supabase-crm.js').includes('task-board'), 'the file task board is not part of this page');
const hostedSrc = read('js/data/supabase-crm.js');
const listFn = hostedSrc.slice(hostedSrc.indexOf('async listCrmTasks'), hostedSrc.indexOf('async getCrmTask'));
ok(!listFn.includes('crm_leads') && !listFn.includes("from('contacts')") && !listFn.includes('withTaskPerson'), 'the Home task list does not look up each lead or client');
const nameFn = hostedSrc.slice(hostedSrc.indexOf('const taskPersonName'), hostedSrc.indexOf('const withTaskPerson'));
ok(nameFn.includes(".select('first_name,last_name')") && nameFn.includes('.eq(\'id\', id)') && nameFn.includes('maybeSingle'), 'the name read is one row by id, first and last name only');

const cfg = { picklists: {}, customFields: [] };
const me = { id: 'u-sp', canEdit: true, name: 'Sam Salesperson' };
function show(view) {
  const host = document.getElementById('app');
  host.innerHTML = toText(view.body);
  return host;
}
function linkOf(host) {
  return host.querySelector('[data-task-profile-link]');
}

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-sp');
const watched = ['listCrmLeads', 'getCrmLead', 'listCrmContacts', 'getCrmContact', 'listCrmAccounts', 'getCrmAccount'];
const extra = [];
for (const name of watched) {
  const orig = api[name].bind(api);
  api[name] = async (...args) => { extra.push(name); return orig(...args); };
}
session.setItem('crm-home:order', JSON.stringify(['ca-3', 'ca-2']));
const leadView = await taskPage({ api, me, assignees: [], params: { id: 'ca-3' }, cfg, refresh() {}, go() {} });
const leadHost = show(leadView);
const leadLink = linkOf(leadHost);
ok(leadLink && leadLink.closest('dd').previousElementSibling.textContent === 'Lead' && leadLink.getAttribute('href') === '#/crm/leads/lead-1' && leadLink.textContent === 'Rachel Realtor-Lead', 'a lead task links the lead name to that profile');
ok(leadHost.querySelector('[data-task-profile]').getAttribute('data-task-profile') === 'lead' && leadHost.querySelector('[data-task-back]').getAttribute('href') === '#/crm/leads/lead-1', 'the task offers a way back to the lead');
const clientView = await taskPage({ api, me, assignees: [], params: { id: 'ca-2' }, cfg, refresh() {}, go() {} });
const clientHost = show(clientView);
const clientLink = linkOf(clientHost);
ok(clientLink && clientLink.closest('dd').previousElementSibling.textContent === 'Client' && clientLink.getAttribute('href') === '#/crm/contacts/c-bagent' && clientLink.textContent === 'Bianca Buyer-Agent', 'a client task links the client name to that profile');
ok(extra.length === 0, 'opening a task does not load every lead or client');

const made = await api.createCrmTask({ entity: 'account', entityId: 'acc-oak', subject: 'Office follow-up', dueDate: '2026-12-01' });
session.setItem('crm-home:order', JSON.stringify([made.id]));
const companyHost = show(await taskPage({ api, me, assignees: [], params: { id: made.id }, cfg, refresh() {}, go() {} }));
ok(!companyHost.querySelector('[data-task-profile-link]') && companyHost.querySelector('[data-task-profile]').getAttribute('data-task-profile') === '', 'a company task does not invent a lead or client link');

function stub(task) {
  const calls = [];
  const apiStub = {
    async getCrmTask() { calls.push('getCrmTask'); return task; },
    async listCrmTasks() { calls.push('listCrmTasks'); return []; },
    async listCrmLeads() { calls.push('listCrmLeads'); return []; },
    async getCrmLead() { calls.push('getCrmLead'); return null; },
    async listCrmContacts() { calls.push('listCrmContacts'); return []; },
    async getCrmContact() { calls.push('getCrmContact'); return null; },
  };
  return { api: apiStub, calls };
}
session.setItem('crm-home:order', JSON.stringify(['t-bad', 't-miss']));
const bad = stub({ id: 't-bad', entity: 'lead', entityId: 'lead-1', parentName: 'Rachel <script>', parentLink: 'javascript:alert(1)', subject: 'Bad link', status: 'Not Started', priority: 'Normal', ownerName: 'Sam' });
const badHost = show(await taskPage({ api: bad.api, me, assignees: [], params: { id: 't-bad' }, cfg, refresh() {}, go() {} }));
const badLink = linkOf(badHost);
ok(badLink && badLink.getAttribute('href') === '#/crm/leads/lead-1' && badLink.textContent === 'Rachel <script>' && !badHost.innerHTML.includes('javascript:'), 'the profile link is the lead page, and a stored script is shown as text');
ok(bad.calls.join() === 'getCrmTask', 'a name already on the task does not cause another read');
const missing = stub({ id: 't-miss', entity: 'contact', entityId: 'c-gone', subject: 'Missing person', status: 'Not Started', priority: 'Normal', ownerName: 'Sam', parentLink: 'javascript:alert(1)' });
const missHost = show(await taskPage({ api: missing.api, me, assignees: [], params: { id: 't-miss' }, cfg, refresh() {}, go() {} }));
ok(!missHost.querySelector('[data-task-profile-link]') && missHost.querySelector('[data-task-profile-missing]').textContent.includes('Open Clients') && !missHost.innerHTML.includes('javascript:'), 'a client task with no name stays on the page and says where to look');

function hostedClient(tables, failTables = new Set()) {
  const calls = [];
  const from = (table) => {
    const filters = [];
    let cols = '';
    let single = false;
    const run = () => {
      calls.push({ table, cols, filters: filters.map((pair) => pair.slice()), single });
      if (failTables.has(table)) return Promise.resolve({ data: null, error: { message: 'row hidden' } });
      let data = (tables[table] || []).filter((r) => filters.every(([k, v]) => String(r[k]) === String(v)));
      if (single) data = data[0] || null;
      return Promise.resolve({ data, error: null });
    };
    const api = {
      select(c) { cols = c; return api; },
      eq(k, v) { filters.push([k, v]); return api; },
      order() { return api; },
      maybeSingle() { single = true; return run(); },
      then(res, rej) { return run().then(res, rej); },
    };
    return api;
  };
  const sb = {
    from,
    rpc: async (name) => {
      calls.push({ rpc: name });
      if (name === 'crm_assignees') return { data: [{ id: 'user-a', name: 'Ada Admin', role: 'Super admin' }], error: null };
      return { data: [], error: null };
    },
  };
  const okFn = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
  const camel = (o) => (Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o);
  return { api: crmSupabase({ sb, ok: okFn, camel, me: async () => { throw new Error('the task must not look the user up again'); }, flags: { crm: true } }), calls };
}
const taskRow = (id, entity, entityId, extra = {}) => ({ id, kind: 'task', owner_id: 'user-a', subject: 'Intro call', status: 'Not Started', due_date: '2026-11-20', entity, entity_id: entityId, reminder: false, participants: [], ...extra });
const tables = {
  crm_activities: [taskRow('t-lead', 'lead', 'lead-1'), taskRow('t-client', 'contact', 'c-1'), taskRow('t-co', 'account', 'acc-1'), taskRow('t-kept', 'lead', 'lead-9', { parent_name: 'Kept Name' })],
  crm_leads: [{ id: 'lead-1', first_name: 'Marcus', last_name: 'Vance & Co' }],
  contacts: [{ id: 'c-1', first_name: 'Bianca', last_name: 'Buyer-Agent' }],
};
const hosted = hostedClient(tables);
const leadTask = await hosted.api.getCrmTask('t-lead');
const leadReads = hosted.calls.filter((c) => c.table === 'crm_leads');
const contactReads = hosted.calls.filter((c) => c.table === 'contacts');
ok(leadTask.parentName === 'Marcus Vance & Co' && leadTask.contactLink === '#/crm/leads/lead-1' && leadReads.length === 1 && leadReads[0].cols === 'first_name,last_name' && leadReads[0].single && leadReads[0].filters.join() === 'id,lead-1' && contactReads.length === 0, 'a lead task reads that one lead by id and no client list');
const clientTask = await hosted.api.getCrmTask('t-client');
const clientReads = hosted.calls.filter((c) => c.table === 'contacts');
ok(clientTask.parentName === 'Bianca Buyer-Agent' && clientTask.contactLink === '#/crm/contacts/c-1' && clientReads.length === 1 && clientReads[0].filters.join() === 'id,c-1', 'a client task reads that one client by id');
const beforeCompany = hosted.calls.length;
const companyTask = await hosted.api.getCrmTask('t-co');
ok(!companyTask.parentName && hosted.calls.length === beforeCompany + 1 && hosted.calls[hosted.calls.length - 1].table === 'crm_activities', 'a company task does not look up a person');
const beforeKept = hosted.calls.filter((c) => c.table === 'crm_leads').length;
const kept = await hosted.api.getCrmTask('t-kept');
ok(kept.parentName === 'Kept Name' && hosted.calls.filter((c) => c.table === 'crm_leads').length === beforeKept, 'a name already stored on the task is not read again');
const listed = await hosted.api.listCrmTasks({ ownerId: 'user-a' });
ok(listed.length === 4 && hosted.calls.filter((c) => c.table === 'crm_leads').length === beforeKept, 'the Home list still does not look up names');

session.setItem('crm-home:order', JSON.stringify(['t-lead']));
const hostedView = show(await taskPage({ api: hosted.api, me: { id: 'user-a', canEdit: true }, assignees: [], params: { id: 't-lead' }, cfg, refresh() {}, go() {} }));
const hostedLink = linkOf(hostedView);
ok(hostedLink && hostedLink.getAttribute('href') === '#/crm/leads/lead-1' && hostedLink.textContent === 'Marcus Vance & Co', 'the detail page shows the name from that one read');

const hidden = hostedClient(tables, new Set(['crm_leads']));
const hiddenTask = await hidden.api.getCrmTask('t-lead');
ok(hiddenTask.id === 't-lead' && !hiddenTask.parentName, 'a hidden lead still returns the task');
session.setItem('crm-home:order', JSON.stringify(['t-lead']));
const hiddenHost = show(await taskPage({ api: { getCrmTask: async () => hiddenTask }, me: { id: 'user-a', canEdit: false }, assignees: [], params: { id: 't-lead' }, cfg, refresh() {}, go() {} }));
ok(!hiddenHost.querySelector('[data-task-profile-link]') && hiddenHost.querySelector('[data-task-profile-missing]').textContent.includes('Open Leads'), 'a missing lead name tells the user to open Leads');

console.log(fail ? fail + ' failed' : 'crm task profile passed');
if (fail) process.exit(1);
