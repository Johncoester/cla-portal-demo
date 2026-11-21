/* CRM custom views: the record name column stays selected, and it can move.
 * Leads, Clients, Companies, and Deals. An older saved view with no name position keeps the name first.
 * Fake data only. No network. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { toText } from '../js/ui.js';
import { createMockAdapter, STORAGE_KEY } from '../js/data/mock-adapter.js';
import { viewPage } from '../js/pages/crm-views.js';
import { cleanColumns, placeNameColumn, VIEW_NAME_KEY } from '../js/data/crm-views.js';
import { moduleFields } from '../js/data/crm-analytics.js';
import { feedbackNov4Supabase } from '../js/data/supabase-feedback-nov4.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.location = { hash: '#/crm', pathname: '/', search: '' };

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), get length() { return m.size; }, key: (i) => [...m.keys()][i] }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const MODULES = [
  ['contacts', 'Clients', 'email'],
  ['leads', 'Leads', 'email'],
  ['accounts', 'Companies', 'phone'],
  ['deals', 'Deals', 'stage'],
];

for (const [module, label, extra] of MODULES) {
  const fields = moduleFields(module, {});
  const nk = VIEW_NAME_KEY[module];
  ok(nk === 'name', label + ' uses the name column');
  const moved = cleanColumns(module, ['ownerId', 'name', extra], fields);
  ok(moved.join() === ['ownerId', 'name', extra].join(), label + ' keeps a saved place for the name column');
  const omitted = cleanColumns(module, [extra, 'ownerId'], fields);
  ok(omitted[0] === 'name' && omitted[1] === extra && omitted[2] === 'ownerId', label + ' puts the name first when the saved list has no name position');
  ok(placeNameColumn(module, ['ownerId', 'name', extra]).join() === 'ownerId,name,extra'.replace('extra', extra), label + ' read of an explicit name position is left alone');
  ok(placeNameColumn(module, [extra, 'ownerId'])[0] === 'name', label + ' read with no name position puts the name first');
  let refused = false;
  try { cleanColumns(module, ['not-a-column'], fields); } catch (e) { refused = /not a column/.test(e.message); }
  ok(refused, label + ' still refuses a column that module does not have');
}

const store = mem();
const api = createMockAdapter({ storage: store, sessionStorage: mem() });
await api.signInDev('u-admin');
const me = await api.crmMe();
const cfg = await api.getCrmSettings();
const owners = await api.listCrmOwners();
const root = document.getElementById('app');

const savedIds = {};
for (const [module, label, extra] of MODULES) {
  const moved = await api.createCrmView({ module, name: label + ' owner first', columns: ['ownerId', 'name', extra], criteria: [], pin: false });
  ok(moved.columns.join() === ['ownerId', 'name', extra].join(), label + ' saves the name column where it was placed');
  const ran = await api.runCrmView(moved.id);
  ok(ran.columns.map((c) => c.key).join() === moved.columns.join(), label + ' list uses the saved column order');
  ok(ran.rows.length > 0 && ran.rows.every((r) => r.cells.name && r.cells.name.link && r.cells.name.link.includes('/' + r.id)), label + ' name cell still links to the record when it is not first');
  const old = await api.createCrmView({ module, name: label + ' name omitted', columns: [extra, 'ownerId'], criteria: [], pin: false });
  ok(old.columns[0] === 'name' && old.columns[1] === extra && old.columns.includes('ownerId'), label + ' save with no name position keeps the name first and selected');
  savedIds[module] = { moved: moved.id, old: old.id, extra };
}

for (const [module, label, extra] of MODULES) {
  const page = await viewPage({ api, me, cfg, owners, params: { id: 'new', sub: module } });
  root.innerHTML = toText(page.body);
  page.mount(root);
  const keys = () => [...root.querySelectorAll('[data-vcol]')].map((li) => li.dataset.vcol);
  const li = (key) => root.querySelector(`[data-vcol="${key}"]`);
  ok(keys()[0] === 'name', label + ' new view still starts with the name column');
  const nameLi = li('name');
  const drag = (fromKey, toKey) => {
    li(fromKey).dispatchEvent(new window.Event('dragstart', { bubbles: true }));
    li(toKey).dispatchEvent(new window.Event('dragover', { bubbles: true, cancelable: true }));
    li(toKey).dispatchEvent(new window.Event('drop', { bubbles: true, cancelable: true }));
  };
  ok(!root.querySelector('[data-vcol-up]') && !root.querySelector('[data-vcol-down]'), label + ' the up and down arrows are gone');
  ok(nameLi.getAttribute('draggable') === 'true' && !nameLi.querySelector('[data-vcol-x]'), label + ' the name column drags and cannot be removed');
  ok(li(keys()[1]) && li(keys()[1]).getAttribute('draggable') === 'true', label + ' the next column drags above the name');
  ok(![...root.querySelectorAll('[data-vcol-avail] option')].some((o) => o.value === 'name'), label + ' name stays out of the available list');
  if (keys()[0] !== 'ownerId') drag('ownerId', keys()[0]);
  ok(keys()[0] === 'ownerId' && keys().includes('name') && !li('name').querySelector('[data-vcol-x]'), label + ' owner can be placed first and the name column stays selected');
  const beforeBlank = keys().join();
  root.querySelector('[data-view-name]').value = '';
  root.querySelector('[data-view-save]').click();
  await new Promise((r) => setTimeout(r, 0));
  const toast = document.querySelector('#toasts .toast.err');
  ok(toast && /name/i.test(toast.textContent) && keys().join() === beforeBlank, label + ' a blank view name is refused and the column order stays');
  if (toast) toast.remove();
  root.querySelector('[data-view-name]').value = label + ' from the builder';
  root.querySelector('[data-view-save]').click();
  await new Promise((r) => setTimeout(r, 20));
  const id = (location.hash.match(/#\/crm\/views\/([^/?]+)/) || [])[1];
  const built = id && (await api.listCrmViews(module)).find((v) => v.id === id);
  ok(!!built && built.columns[0] === 'ownerId' && built.columns.includes('name'), label + ' the builder saves the moved name column');
  if (!built) continue;
  const shown = await viewPage({ api, me, cfg, owners, params: { id } });
  root.innerHTML = toText(shown.body);
  shown.mount(root);
  const heads = [...root.querySelectorAll('thead th')].map((th) => th.dataset.sort);
  const nameCell = root.querySelector('tbody td[data-col="name"] a');
  const rowId = (root.querySelector('tbody tr[data-row]') || {}).dataset;
  ok(heads[0] === 'ownerId' && heads.includes('name') && nameCell && rowId && nameCell.getAttribute('href').includes('/' + rowId.row), label + ' rendered list puts the owner first and the name still opens the record');
}

const raw = JSON.parse(store.getItem(STORAGE_KEY));
for (const [module, label, extra] of MODULES) {
  const row = raw.crmViews.find((v) => v.id === savedIds[module].old);
  row.columns = [extra, 'ownerId'];
  const mid = raw.crmViews.find((v) => v.id === savedIds[module].moved);
  mid.columns = ['ownerId', 'name', extra];
}
store.setItem(STORAGE_KEY, JSON.stringify(raw));
const again = createMockAdapter({ storage: store, sessionStorage: mem() });
await again.signInDev('u-admin');
for (const [module, label, extra] of MODULES) {
  const old = (await again.listCrmViews(module)).find((v) => v.id === savedIds[module].old);
  ok(old && old.columns[0] === 'name' && old.columns[1] === extra && old.columns[2] === 'ownerId', label + ' older view with no stored name position still opens name first');
  const ran = await again.runCrmView(savedIds[module].old);
  ok(ran.columns[0].key === 'name' && ran.rows.length > 0 && ran.rows.every((r) => r.cells.name.link && r.cells.name.link.includes('/' + r.id)), label + ' that older list still links the name in the first column');
  const mid = (await again.listCrmViews(module)).find((v) => v.id === savedIds[module].moved);
  const midRun = await again.runCrmView(savedIds[module].moved);
  ok(mid && mid.columns.join() === ['ownerId', 'name', extra].join() && midRun.columns.map((c) => c.key).join() === mid.columns.join(), label + ' a stored name position is not forced back to first');
}

const admin = { id: '11111111-1111-4111-8111-111111111111', name: 'Janine Admin', role: 'Admin', isAdmin: true };
function memorySb() {
  const tables = { crm_views: [], crm_view_criteria: [], crm_view_columns: [], crm_view_shares: [], crm_view_pins: [], crm_saved_filters: [], crm_saved_filter_values: [], deal_disbursements: [] };
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
    if (!tables[q.table]) throw new Error('unexpected table ' + q.table);
    const list = () => tables[q.table];
    if (q.op === 'insert') {
      const incoming = Array.isArray(q.payload) ? q.payload : [q.payload];
      const saved = incoming.map((row) => {
        const copy = clone(row);
        if ((q.table === 'crm_views' || q.table === 'crm_saved_filters') && !copy.id) copy.id = uuid();
        if (q.table === 'crm_views' || q.table === 'crm_saved_filters') {
          copy.created_at = copy.created_at || '2026-11-17T00:00:00Z';
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
      hit.forEach((r) => Object.assign(r, clone(q.payload)));
      const out = hit.map(clone);
      if (q.one === 'single') { if (!out[0]) throw new Error('0 rows'); return out[0]; }
      return out;
    }
    if (q.op === 'delete') {
      const keep = []; const gone = [];
      list().forEach((r) => (match(r, q.filters) ? gone : keep).push(r));
      tables[q.table] = keep;
      return gone.map(clone);
    }
    const found = sortRows(list().filter((r) => match(r, q.filters)), q.orders).map(clone);
    if (q.one === 'single' && !found[0]) throw new Error('0 rows');
    if (q.one) return found[0] || null;
    return found;
  }
  const from = (table) => {
    const q = { table, filters: [], orders: [], op: 'select', payload: null, one: null };
    const chain = {
      select() { return chain; }, eq(col, val) { q.filters.push({ op: 'eq', col, val }); return chain; },
      is(col, val) { q.filters.push({ op: 'is', col, val }); return chain; }, in(col, val) { q.filters.push({ op: 'in', col, val }); return chain; },
      order(col, opts) { q.orders.push([col, !!(opts && opts.ascending === false)]); return chain; }, limit() { return chain; },
      maybeSingle() { q.one = 'maybe'; return chain; }, single() { q.one = 'single'; return chain; },
      insert(payload) { q.op = 'insert'; q.payload = payload; return chain; }, update(payload) { q.op = 'update'; q.payload = payload; return chain; },
      delete() { q.op = 'delete'; return chain; },
      then(resolve) { try { resolve({ data: run(q), error: null }); } catch (e) { resolve({ data: null, error: { message: e.message } }); } },
    };
    return chain;
  };
  return { tables, from, rpc() { return Promise.resolve({ data: [{ id: admin.id, name: admin.name, role: admin.role }], error: null }); } };
}
const sb = memorySb();
const pass = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
const hosted = feedbackNov4Supabase({ sb, ok: pass, me: async () => admin });
hosted.getCrmSettings = async () => ({});
const row = { id: 'r1', name: 'Ada Record', email: 'ada@example.test', phone: '555', ownerId: admin.id, ownerName: 'Janine Admin', stage: 'Active', amount: 10 };
hosted.listCrmContacts = async () => [{ ...row }];
hosted.listCrmLeads = async () => [{ ...row }];
hosted.listCrmAccounts = async () => [{ ...row }];
hosted.listCrmDeals = async () => [{ ...row }];
for (const [module, label, extra] of MODULES) {
  const view = await hosted.createCrmView({ module, name: label + ' hosted order', columns: ['ownerId', 'name', extra], criteria: [], pin: false });
  ok(view.columns.join() === ['ownerId', 'name', extra].join(), label + ' hosted save keeps the name column where it was placed');
  const ran = await hosted.runCrmView(view.id);
  ok(ran.columns.map((c) => c.key).join() === view.columns.join() && ran.rows[0].cells.name.link.includes('/' + ran.rows[0].id), label + ' hosted list keeps that order and links the name');
  sb.tables.crm_view_columns = sb.tables.crm_view_columns.filter((r) => !(r.view_id === view.id && r.column_key === 'name'));
  const listed = (await hosted.listCrmViews(module)).find((v) => v.id === view.id);
  const rerun = await hosted.runCrmView(view.id);
  ok(listed && listed.columns[0] === 'name' && listed.columns[1] === 'ownerId' && listed.columns[2] === extra, label + ' hosted view with no stored name position keeps the name first');
  ok(rerun.columns[0].key === 'name' && rerun.rows[0].cells.name.link.includes('/' + rerun.rows[0].id), label + ' hosted older list still links the name in the first column');
}

console.log(fail ? fail + ' failed' : 'crm view name column passed');
if (fail) process.exit(1);
