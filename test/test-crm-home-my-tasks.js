/* CRM Home My Tasks. Every view is the signed-in user's tasks. Fake data and a fake hosted client. No network. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { HOME_TASK_FILTERS, homeTaskFilter } from '../js/data/crm.js';
import { localDate } from '../js/data/constants.js';
import { crmSupabase } from '../js/data/supabase-crm.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const sameIds = (a, b) => a.slice().sort().join() === b.slice().sort().join();

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true, get() { return selectValue.get.call(this); },
  set(v) { const want = String(v); [...this.options].forEach((o) => { if (o.getAttribute('value') === want || o.value === want) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); } });

const { homePage } = await import('../js/pages/crm-home.js');
const { toText } = await import('../js/ui.js');

const homeSrc = read('js/pages/crm-home.js');
const homeLoad = homeSrc.slice(homeSrc.indexOf('export async function homePage'), homeSrc.indexOf('export async function taskPage'));
ok(homeLoad.includes('api.listCrmTasks({ ownerId: me.id })') && !homeLoad.includes('api.listCrmTasks()'), 'Home asks for this user on the task query and does not load every task');
ok(!/isAdmin[\s\S]{0,120}listCrmTasks/.test(homeLoad), 'an admin uses the same owner filter as everyone else');
const taskLoad = homeSrc.slice(homeSrc.indexOf('export async function taskPage'), homeSrc.indexOf('export async function meetingPage'));
ok(taskLoad.includes('api.listCrmTasks({ ownerId: me.id })'), 'previous and next stay on this user when the Home order is missing');

const hostedSrc = read('js/data/supabase-crm.js');
const hostedFn = hostedSrc.slice(hostedSrc.indexOf('async listCrmTasks'), hostedSrc.indexOf('async getCrmTask'));
ok(hostedFn.includes(".eq('kind', 'task')") && hostedFn.includes(".eq('owner_id', ownerId)") && !hostedFn.includes('.filter('), 'the hosted list adds owner_id to the query and does not filter the rows afterwards');
ok(read('supabase/migrations/20261105222910_crm.sql').includes('crm_activities_owner_idx on public.crm_activities (owner_id, status)'), 'owner_id already has an index; this change adds no database file');

const rows = [
  { id: 't-mine', kind: 'task', owner_id: 'user-a', subject: 'Mine', status: 'Not Started', due_date: '2026-11-01', entity: 'lead', entity_id: 'lead-1', reminder: false, participants: [] },
  { id: 't-other', kind: 'task', owner_id: 'user-b', subject: 'Theirs', status: 'Not Started', due_date: '2026-11-01', entity: 'lead', entity_id: 'lead-1', reminder: false, participants: [] },
];
function hostedClient() {
  const calls = [];
  const from = (table) => {
    const filters = [];
    const run = () => {
      calls.push({ table, filters: filters.map((pair) => pair.slice()) });
      const data = table === 'crm_activities' ? rows.filter((r) => filters.every(([k, v]) => r[k] === v)) : [];
      return Promise.resolve({ data, error: null });
    };
    const api = { select() { return api; }, eq(k, v) { filters.push([k, v]); return api; }, then(res, rej) { return run().then(res, rej); } };
    return api;
  };
  const sb = {
    from,
    rpc: async (name) => {
      calls.push({ rpc: name });
      if (name === 'crm_assignees') return { data: [{ id: 'user-a', name: 'Ada Admin', role: 'Super admin' }, { id: 'user-b', name: 'Bea Sales', role: 'Sales Person' }], error: null };
      return { data: [], error: null };
    },
  };
  const okFn = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
  const camel = (o) => (Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o);
  const api = crmSupabase({ sb, ok: okFn, camel, me: async () => { throw new Error('Home must not look the user up again'); }, flags: { crm: true } });
  return { api, calls };
}
const hosted = hostedClient();
const mineRows = await hosted.api.listCrmTasks({ ownerId: 'user-a' });
const mineRead = hosted.calls.filter((c) => c.table === 'crm_activities');
ok(mineRead.length === 1 && mineRead[0].filters.join() === 'kind,task,owner_id,user-a' && mineRows.length === 1 && mineRows[0].id === 't-mine', 'the hosted query keeps kind and owner_id and returns only that owner');
ok(hosted.calls.filter((c) => c.rpc).map((c) => c.rpc).join() === 'crm_assignees', 'naming the owners reuses the assignee read and does not add a profile read');
const allRows = await hosted.api.listCrmTasks();
const taskReads = hosted.calls.filter((c) => c.table === 'crm_activities');
ok(taskReads.length === 2 && taskReads[1].filters.join() === 'kind,task' && allRows.map((t) => t.id).sort().join() === 't-mine,t-other', 'a dashboard list with no owner is still one read of every visible task');

function shown(host, filter) {
  const sel = host.querySelector('[data-task-filter]');
  sel.value = filter;
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  return [...host.querySelectorAll('#home-tasks tbody tr[data-task]')].map((tr) => tr.getAttribute('data-task'));
}

const today = localDate();
for (const userId of ['u-admin', 'u-proc', 'u-sp', 'u-team']) {
  const session = mem();
  globalThis.sessionStorage = session;
  window.sessionStorage = session;
  const api = createMockAdapter({ storage: mem(), sessionStorage: session });
  await api.signInDev(userId);
  const me = await api.crmMe();
  const calls = [];
  const orig = api.listCrmTasks.bind(api);
  api.listCrmTasks = async (opts) => { calls.push(opts || null); return orig(opts); };
  if (userId === 'u-admin') {
    const lead = (await api.listCrmLeads())[0];
    await api.createCrmTask({ entity: 'lead', entityId: lead.id, subject: 'Only King John', dueDate: '2026-11-01', ownerId: me.id, status: 'Not Started' });
  }
  const cfg = await api.getCrmSettings();
  const before = calls.length;
  const view = await homePage({ api, me, params: {}, cfg, refresh() {}, assignees: [] });
  ok(calls.length === before + 1 && calls[calls.length - 1] && calls[calls.length - 1].ownerId === me.id, userId + ' Home asks once for their own tasks');
  const host = document.getElementById('app');
  host.innerHTML = toText(view.body);
  view.mount(host);
  const all = await orig();
  const mine = await orig({ ownerId: me.id });
  const foreign = all.filter((t) => t.ownerId !== me.id).map((t) => t.id);
  ok(me.id === userId && foreign.length > 0 && mine.every((t) => t.ownerId === me.id) && mine.length < all.length, userId + ' can see other people\'s tasks in the CRM, and the owner read leaves them out');
  ok(userId !== 'u-admin' || (me.isAdmin && mine.some((t) => t.subject === 'Only King John')), 'the admin still has their own task');
  for (const filter of HOME_TASK_FILTERS) {
    const ids = shown(host, filter);
    const expect = homeTaskFilter(mine, filter, me.id, today).map((t) => t.id);
    const foreignShown = ids.filter((id) => foreign.includes(id));
    ok(sameIds(ids, expect) && foreignShown.length === 0, userId + ' ' + filter + ' is only their tasks' + (foreignShown.length ? ' (showed ' + foreignShown.join(',') + ')' : ''));
  }
}

console.log(fail ? fail + ' failed' : 'crm home my tasks passed');
if (fail) process.exit(1);
