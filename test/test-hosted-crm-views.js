/* Hosted CRM views, pins, and saved filters. The Supabase client is an in-memory stub. No network. Fake rows only. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { toText } from '../js/ui.js';
import { viewsBar } from '../js/pages/crm-views.js';
import { feedbackNov4Supabase } from '../js/data/supabase-feedback-nov4.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const rejects = async (fn, re) => { try { await fn(); return false; } catch (e) { return !re || re.test(e.message); } };

const admin = { id: '11111111-1111-4111-8111-111111111111', name: 'Janine Admin', firstName: 'Janine', lastName: 'Admin', role: 'Admin', isAdmin: true };
const proc = { id: '22222222-2222-4222-8222-222222222222', name: 'Pat Processor', role: 'Processor', isAdmin: false };
const sales = { id: '33333333-3333-4333-8333-333333333333', name: 'Sam Sales', role: 'Sales Person', isAdmin: false };

function memorySb() {
  const tables = { crm_views: [], crm_view_criteria: [], crm_view_columns: [], crm_view_shares: [], crm_view_pins: [], crm_saved_filters: [], crm_saved_filter_values: [], deal_disbursements: [] };
  const calls = [];
  let n = 1;
  const uuid = () => `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const match = (row, filters) => filters.every((f) => f.op === 'eq' ? row[f.col] === f.val : f.op === 'is' ? (f.val == null ? row[f.col] == null : row[f.col] === f.val) : f.op === 'in' ? (f.val || []).includes(row[f.col]) : false);
  const sortRows = (rows, orders) => rows.slice().sort((a, b) => {
    for (const [col, desc] of orders) {
      if (a[col] === b[col]) continue;
      const c = String(a[col] ?? '').localeCompare(String(b[col] ?? ''), undefined, { numeric: true });
      return desc ? -c : c;
    }
    return 0;
  });
  function run(q) {
    const list = () => tables[q.table] || [];
    if (!tables[q.table]) throw new Error('unexpected table ' + q.table);
    if (q.op === 'insert') {
      const incoming = Array.isArray(q.payload) ? q.payload : [q.payload];
      const saved = incoming.map((row) => {
        const copy = clone(row);
        if ((q.table === 'crm_views' || q.table === 'crm_saved_filters') && !copy.id) copy.id = uuid();
        if (q.table === 'crm_views' || q.table === 'crm_saved_filters') {
          copy.created_at = copy.created_at || '2026-11-09T00:00:00Z';
          copy.modified_at = copy.modified_at || copy.created_at;
          if (!('retired_at' in copy)) copy.retired_at = null;
        }
        tables[q.table].push(copy);
        return clone(copy);
      });
      return q.one === 'single' ? saved[0] : saved;
    }
    if (q.op === 'update') {
      const hit = list().filter((r) => match(r, q.filters));
      hit.forEach((r) => Object.assign(r, clone(q.payload), { modified_at: '2026-11-09T01:00:00Z' }));
      const out = hit.map(clone);
      if (q.one === 'single') { if (!out[0]) throw new Error('0 rows'); return out[0]; }
      return out;
    }
    if (q.op === 'delete') {
      if (q.table === 'crm_views' || q.table === 'crm_saved_filters' || q.table === 'crm_saved_filter_values') throw new Error('permission denied for table ' + q.table);
      const keep = [], gone = [];
      list().forEach((r) => (match(r, q.filters) ? gone : keep).push(r));
      tables[q.table] = keep;
      return gone.map(clone);
    }
    if (q.op === 'upsert') {
      const incoming = Array.isArray(q.payload) ? q.payload : [q.payload];
      const keys = String(q.onConflict || 'id').split(',').map((s) => s.trim());
      incoming.forEach((row) => {
        const copy = clone(row);
        const found = list().find((r) => keys.every((k) => r[k] === copy[k]));
        if (found) Object.assign(found, copy); else tables[q.table].push(copy);
      });
      return incoming.map(clone);
    }
    const found = sortRows(list().filter((r) => match(r, q.filters)), q.orders).map(clone);
    if (q.one === 'single' && !found[0]) throw new Error('0 rows');
    if (q.one) return found[0] || null;
    return found;
  }
  const from = (table) => {
    const q = { table, filters: [], orders: [], op: 'select', payload: null, one: null, onConflict: '' };
    const api = {
      select() { return api; },
      eq(col, val) { q.filters.push({ op: 'eq', col, val }); return api; },
      is(col, val) { q.filters.push({ op: 'is', col, val }); return api; },
      in(col, val) { q.filters.push({ op: 'in', col, val }); return api; },
      order(col, opts) { q.orders.push([col, !!(opts && opts.ascending === false)]); return api; },
      limit() { return api; },
      maybeSingle() { q.one = 'maybe'; return api; },
      single() { q.one = 'single'; return api; },
      insert(payload) { q.op = 'insert'; q.payload = payload; return api; },
      update(payload) { q.op = 'update'; q.payload = payload; return api; },
      delete() { q.op = 'delete'; return api; },
      upsert(payload, opts) { q.op = 'upsert'; q.payload = payload; q.onConflict = opts && opts.onConflict; return api; },
      then(resolve) {
        try {
          calls.push({ table: q.table, op: q.op, filters: q.filters.map((f) => f.op + ':' + f.col), n: Array.isArray(q.payload) ? q.payload.length : (q.payload ? 1 : 0) });
          resolve({ data: run(q), error: null });
        } catch (e) { resolve({ data: null, error: { message: e.message } }); }
      },
    };
    return api;
  };
  return {
    calls, tables, from,
    rpc(name) {
      calls.push({ table: name, op: 'rpc', filters: [], n: 0 });
      if (name === 'crm_assignees') return Promise.resolve({ data: [{ id: admin.id, name: admin.name, role: admin.role }, { id: sales.id, name: sales.name, role: sales.role }], error: null });
      return Promise.resolve({ data: null, error: { message: 'unexpected rpc ' + name } });
    },
  };
}

const leads = [
  { id: 'l1', name: 'Ada Agent', email: 'ada@example.test', company: 'Harbor', phone: '555', leadSource: 'Call in/Walk in', relationshipStatus: 'Hot Prospect', ownerId: admin.id, ownerName: 'Janine Admin', archived: false, converted: false },
  { id: 'l2', name: 'Bea Broker', email: 'bea@example.test', company: 'Other', phone: '556', leadSource: 'Google Ads', relationshipStatus: 'Prospecting', ownerId: admin.id, ownerName: 'Janine Admin', archived: false, converted: false },
];
let current = admin;
const sb = memorySb();
const pass = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
const api = feedbackNov4Supabase({ sb, ok: pass, me: async () => current });
api.getCrmSettings = async () => ({});
api.listCrmLeads = async () => leads.map((r) => ({ ...r }));

const targets = await api.listCrmShareTargets();
ok(targets.users.some((u) => u.id === sales.id) && targets.users.some((u) => u.id === admin.id), 'the share list is the hosted assignee list, including the signed-in person');

const view = await api.createCrmView({ module: 'leads', name: 'Janine pin check', criteria: [{ field: 'leadSource', op: 'is', value: 'Call in/Walk in' }, { field: 'name', op: 'contains', value: 'Ada' }], columns: ['email', 'name'] });
ok(view.pinned === true && view.canEdit === true && view.mine === true && view.columns[0] === 'name' && view.columns.includes('email'), 'a new hosted view is saved, owned, editable, and pinned');
ok(sb.tables.crm_view_criteria.length === 2 && sb.tables.crm_view_criteria.every((r) => typeof r.value_text === 'string' && r.view_id === view.id), 'both criteria are inserted together as text rows on that view');
ok(sb.calls.filter((c) => c.table === 'crm_view_columns' && c.op === 'insert').every((c) => c.n === view.columns.length), 'columns are one insert, not one insert per column');
ok(sb.calls.filter((c) => c.table === 'crm_view_criteria' && c.op === 'insert').length === 1, 'criteria are one insert');

const unpinned = await api.createCrmView({ module: 'leads', name: 'Janine unpinned', criteria: [], pin: false });
ok(unpinned.pinned === false, 'pin false stays unpinned');
ok(await rejects(() => api.createCrmView({ module: 'leads', name: 'janine pin check', criteria: [] }), /already have a leads view/), 'the same name is refused');

const ran = await api.runCrmView(view.id);
ok(ran.total === 1 && ran.rows[0].id === 'l1' && ran.rows[0].cells.name.text === 'Ada Agent' && ran.rows[0].cells.name.link === '#/crm/leads/l1', 'running the view keeps the lead that matches and links the name');
ok(!ran.rows.some((r) => r.id === 'l2') && !sb.calls.some((c) => c.table === 'deal_disbursements'), 'the other lead is left out, and a leads view does not read disbursements');

sb.calls.length = 0;
const listed = await api.listCrmViews('leads');
ok(listed.length === 2 && listed.find((v) => v.id === view.id).pinned === true, 'both views list, and the first stays pinned');
const critReads = sb.calls.filter((c) => c.table === 'crm_view_criteria' && c.op === 'select');
const colReads = sb.calls.filter((c) => c.table === 'crm_view_columns' && c.op === 'select');
ok(critReads.length === 1 && critReads[0].filters.includes('in:view_id') && colReads.length === 1 && colReads[0].filters.includes('in:view_id'), 'listing two views reads criteria and columns once each');

const bar = toText(await viewsBar(api, 'leads'));
const { document } = parseHTML(`<div id="bar">${bar}</div>`);
const menu = document.querySelector(`[data-pin-menu="${view.id}"]`);
ok(!!menu, 'the new view is a pinned tab');
for (const [sel, label] of [['[data-pin-edit]', 'Edit'], ['[data-pin-unpin]', 'Unpin'], ['[data-pin-clone]', 'Clone'], ['[data-pin-close]', 'Close'], ['[data-pin-delete]', 'Delete']]) {
  const el = menu && menu.querySelector(sel);
  ok(!!el && el.textContent.includes(label), `${label} renders on the new pinned view`);
}
ok(!document.querySelector(`[data-pin-menu="${unpinned.id}"]`) && !!document.querySelector(`[data-view-pick="${unpinned.id}"]`), 'an unpinned view stays in the Views list without the pin menu');

await api.pinCrmView(view.id, false);
const after = (await api.listCrmViews('leads')).find((v) => v.id === view.id);
ok(after && after.pinned === false && sb.tables.crm_views.some((v) => v.id === view.id && !v.retired_at), 'unpin keeps the view and only removes the pin');
await api.pinCrmView(view.id, true);
const repinned = (await api.listCrmViews('leads')).find((v) => v.id === view.id);
ok(repinned && repinned.pinned === true, 'pinning again puts the view back on the tab row');
const copy = await api.cloneCrmView(view.id, { name: 'Janine copy' });
ok(copy.id !== view.id && copy.name === 'Janine copy' && copy.visibility === 'me' && copy.pinned === true && copy.criteria.length === 2, 'clone saves a private pinned copy and does not change the original');

const shared = await api.createCrmView({ module: 'leads', name: 'Shared with Sam', visibility: 'custom', shareUsers: [sales.id], criteria: [], pin: false });
current = sales;
const asSam = await api.listCrmViews('leads');
ok(asSam.some((v) => v.id === shared.id) && !asSam.some((v) => v.id === view.id) && asSam.find((v) => v.id === shared.id).canEdit === false, 'a shared view is visible to that person and a private view is not');
current = admin;

const saved = await api.saveCrmSavedFilter({ listKey: 'leads', name: 'Harbor search', values: { q: 'ada', sort: 'name' } });
ok(saved.values.length === 1 && saved.values[0].name === 'q' && saved.values[0].value === 'ada', 'a saved filter keeps the search and drops the sort');
const onView = await api.saveCrmSavedFilter({ listKey: 'view:' + view.id, name: 'Inside the view', values: { q: 'ada' } });
ok(onView.listKey === 'view:' + view.id && sb.tables.crm_saved_filters.find((f) => f.id === onView.id).view_id === view.id, 'a filter saved on a view stores that view id');
ok((await api.listCrmSavedFilters('leads')).length === 1 && (await api.listCrmSavedFilters('view:' + view.id)).length === 1, 'a module filter and a view filter stay on their own lists');
await api.renameCrmSavedFilter(saved.id, 'Harbor only');
ok((await api.listCrmSavedFilters('leads'))[0].name === 'Harbor only', 'rename keeps the same filter');
await api.retireCrmSavedFilter(saved.id);
ok((await api.listCrmSavedFilters('leads')).length === 0 && sb.tables.crm_saved_filters.some((f) => f.id === saved.id && f.retired_at) && sb.tables.crm_saved_filter_values.some((v) => v.filter_id === saved.id), 'retiring a filter hides it and does not delete the value rows');
ok(!sb.calls.some((c) => (c.table === 'crm_views' || c.table === 'crm_saved_filters' || c.table === 'crm_saved_filter_values') && c.op === 'delete'), 'views and saved filters are never deleted');

await api.retireCrmView(view.id);
ok(!(await api.listCrmViews('leads')).some((v) => v.id === view.id) && (await api.listCrmLeads()).length === leads.length, 'retiring a view removes it from the list and leaves the leads');
const edited = await api.updateCrmView(unpinned.id, { name: 'Janine renamed', criteria: [] });
ok(edited.name === 'Janine renamed' && edited.id === unpinned.id, 'the owner can rename the view that is still saved');

current = proc;
ok(await rejects(() => api.createCrmView({ module: 'leads', name: 'Processor shared', visibility: 'all', criteria: [] }), /CLA staff only/), 'a processor cannot open CRM views');
ok(await rejects(() => api.createCrmView({ module: 'leads', name: 'Processor private', criteria: [] }), /CLA staff only/), 'a processor cannot keep a private CRM view');
ok(await rejects(() => api.listCrmViews('leads'), /CLA staff only/), 'a processor cannot list CRM views');

console.log(fail ? fail + ' failed' : 'hosted crm views passed');
if (fail) process.exit(1);
