/* Custom views use the All list's checkboxes and mass actions, on the view's own rows.
 * Fake data only. No network. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { toText } from '../js/ui.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { viewPage } from '../js/pages/crm-views.js';
import { bulkBar } from '../js/pages/crm-bulk.js';
import { listView } from '../js/pages/crm-kit.js';
import { pageSizeKey } from '../js/data/crm-bulk.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.location = { hash: '#/crm', pathname: '/', search: '' };
if (typeof globalThis.localStorage === 'undefined') {
  const m = new Map();
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), get length() { return m.size; }, key: (i) => [...m.keys()][i] }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const tick = () => new Promise((r) => setTimeout(r, 30));
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));
const nameFields = (form, field, value) => {
  Object.defineProperty(form, 'field', { configurable: true, value: { value: field } });
  Object.defineProperty(form, 'value', { configurable: true, value: { value } });
};
const labels = (root, sel) => [...root.querySelectorAll(sel)].map((el) => el.textContent.trim());
const barLabels = (html) => { const host = document.createElement('div'); host.innerHTML = toText(html); return labels(host, 'button'); };

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const me = await api.crmMe();
const cfg = await api.getCrmSettings();
const owners = await api.listCrmOwners();
const root = document.getElementById('app');

const allList = listView({ key: 'leads', userId: me.id, rows: [{ id: 'a', name: 'Ada' }], cols: [['name', 'Name']], bulk: { module: 'lead', api, me, owners } });
root.innerHTML = toText(allList.body);
ok(root.querySelector('[data-bulk-page]') && root.querySelector('[data-bulk-bar]') && root.querySelector('[data-select-all-matching]') == null, 'the All list still paints the header checkbox and the selection bar');
const allLeadButtons = labels(root, '[data-bulk-bar] button');

const MODULES = [['leads', 'lead', 'Change owner'], ['contacts', 'contact', 'Change owner'], ['accounts', 'account', 'Change owner'], ['deals', 'deal', 'Change salesperson']];
for (const [module, bulkModule, ownerLabel] of MODULES) {
  const made = await api.createCrmView({ module, name: module + ' bulk rows', criteria: [], columns: ['name'], pin: false });
  const page = await viewPage({ api, me, cfg, owners, params: { id: made.id }, refresh() {} });
  root.innerHTML = toText(page.body);
  page.mount(root);
  const check = root.querySelector('thead [data-bulk-page]');
  const checkTh = check && check.closest('th');
  const heads = [...root.querySelectorAll('thead th[data-sort]')].map((th) => th.dataset.sort);
  const rows = root.querySelectorAll('tbody [data-bulk-row]');
  const buttons = labels(root, '[data-bulk-bar] button');
  ok(!!check && check.getAttribute('aria-label') === 'Select all on this page' && checkTh && !checkTh.dataset.sort && !checkTh.dataset.col && checkTh.getAttribute('draggable') !== 'true', module + ' has a header checkbox that is not a column');
  ok(heads[0] === 'name' && rows.length > 0 && [...rows].every((box) => box.closest('td') && !box.closest('td').dataset.col), module + ' puts a checkbox on every row and keeps the name column');
  ok(buttons.join('|') === barLabels(bulkBar(bulkModule)).join('|') && buttons.some((t) => t === 'Update a field') && buttons.some((t) => t === 'Email (draft only)') && buttons.some((t) => t === ownerLabel), module + ' uses the All list selection bar (' + buttons.join(', ') + ')');
  ok(!root.querySelector('[data-vcol-list] [data-col-key]'), module + ' the open list is not the column chooser');
}
ok(allLeadButtons.join('|') === barLabels(bulkBar('lead')).join('|'), 'All Leads keeps the same selection buttons');

const editor = await viewPage({ api, me, cfg, owners, params: { id: 'new', sub: 'contacts' } });
root.innerHTML = toText(editor.body);
editor.mount(root);
const chosen = [...root.querySelectorAll('[data-vcol-list] [data-col-key]')].map((el) => el.dataset.colKey);
const available = [...root.querySelectorAll('[data-vcol-avail] option')].map((el) => el.value);
ok(!root.querySelector('[data-bulk-page]') && !chosen.includes('checkbox') && !available.includes('checkbox') && chosen.includes('name'), 'Choose Columns has no checkbox to add or drag, and the editor is not a list');

const outside = (await api.listCrmContacts()).find((row) => row.notes != null);
const outsideBefore = (await api.getCrmContact(outside.id)).notes;
for (let i = 0; i < 105; i += 1) {
  await api.createCrmContact({ firstName: 'Row' + i, lastName: 'Bulkview', email: 'bulk-view-' + i + '@example.test', roleInCompany: 'Realtor', relationshipStatus: 'Prospecting', state: 'MD', ownerId: 'u-sp' });
}
const view = await api.createCrmView({ module: 'contacts', name: 'Bulkview only', criteria: [{ field: 'name', op: 'contains', value: 'Bulkview' }], logic: 'and', columns: ['name', 'email'], pin: false });
const ran = await api.runCrmView(view.id);
ok(ran.rows.length === 105 && ran.rows.every((row) => !outside || row.id !== outside.id), 'the view criteria keep the other clients out (' + ran.rows.length + ')');

const updates = [];
const realUpdate = api.crmMassUpdate.bind(api);
api.crmMassUpdate = async function (input) { updates.push(JSON.parse(JSON.stringify(input))); return realUpdate(input); };

localStorage.setItem(pageSizeKey(me.id, 'view:' + view.id), '10');
const shown = await viewPage({ api, me, cfg, owners, params: { id: view.id }, refresh() {} });
root.innerHTML = toText(shown.body);
shown.mount(root);
ok(root.querySelector('[data-page-size]').value === '10' && root.querySelectorAll('tbody [data-bulk-row]').length === 10, 'the view pages the same way as the All list');
const pageBox = root.querySelector('[data-bulk-page]');
pageBox.checked = true;
fire(pageBox, 'change');
const offer = root.querySelector('[data-select-all-matching]');
ok(offer && /Select all 105/.test(offer.textContent) && root.querySelector('[data-bulk-bar]') && !root.querySelector('[data-bulk-bar]').hidden, 'selecting the page offers every client in the view');

const search = root.querySelector('[data-view-q]');
search.value = 'Row0 Bulkview';
fire(search, 'input');
ok(root.querySelectorAll('tbody [data-bulk-row]').length === 1 && !root.querySelector('[data-select-all-matching]'), 'the search box narrows the checkboxes to the view rows that match');
search.value = '';
fire(search, 'input');
root.querySelector('[data-bulk-page]').checked = true;
fire(root.querySelector('[data-bulk-page]'), 'change');
root.querySelector('[data-select-all-matching]').click();
ok(/105 matching records selected/.test(root.querySelector('[data-bulk-count]').textContent) && root.querySelector('[data-clear-matching]'), 'Select all matching uses the view, not only this page');

root.querySelector('[data-bulk-field]').click();
await tick();
const blank = document.querySelector('#bulk-field');
nameFields(blank, 'notes', '   ');
fire(blank, 'submit');
await tick();
const blankErr = document.querySelector('#toasts .toast.err');
ok(blankErr && /Enter the new value/.test(blankErr.textContent) && updates.length === 0 && (await api.getCrmContact(outside.id)).notes === outsideBefore, 'a blank new value is refused and nothing is saved');
if (blankErr) blankErr.remove();

root.querySelector('[data-bulk-field]').click();
await tick();
const form = document.querySelector('#bulk-field');
nameFields(form, 'notes', 'Called the view');
fire(form, 'submit');
await tick();
const counts = document.querySelector('[data-bulk-counts]');
const idSet = new Set(updates.flatMap((call) => call.ids || []));
const viewIds = new Set(ran.rows.map((row) => row.id));
ok(updates.length === 2 && updates.every((call) => !call.filter || !call.filter.viewId) && updates.every((call) => !call.filter || !call.filter.criteria) && updates.every((call) => (call.ids || []).length <= 100) && updates[0].ids.length === 100 && updates[1].ids.length === 5, 'Select all matching sends the view rows through the existing id list, one page at a time');
ok(idSet.size === 105 && [...idSet].every((id) => viewIds.has(id)) && !idSet.has(outside.id), 'the mass update does not include a client the view filtered out');
ok(counts && /105 saved/.test(counts.textContent) && /0 not saved/.test(counts.textContent) && (await api.getCrmContact(ran.rows[0].id)).notes.includes('Called the view') && (await api.getCrmContact(outside.id)).notes === outsideBefore, 'the result says how many were saved, and the other client is unchanged');

const sales = { id: 'u-sp', name: 'Sam Sales', role: 'Sales Person', canEdit: true, isAdmin: false };
const calls = [];
const stub = {
  async runCrmView() {
    return { view: { id: 'v-mix', module: 'leads', name: 'Mixed owners', visibility: 'me', ownerName: 'Sam', canEdit: false, pinned: false, logic: 'or', criteria: [{ field: 'ownerId', op: 'is', value: 'u-sp' }], columns: ['name'] },
      columns: [{ key: 'name', label: 'Lead Name', type: 'text' }], total: 2,
      rows: [{ id: 'own-1', cells: { name: { text: 'Mine', link: '#/crm/leads/own-1' } } }, { id: 'other-1', cells: { name: { text: 'Theirs', link: '#/crm/leads/other-1' } } }] };
  },
  async listCrmViews() { return []; },
  async listCrmSavedFilters() { return []; },
  async listCrmLeads() { return [{ id: 'own-1', name: 'Mine', ownerId: 'u-sp' }, { id: 'other-1', name: 'Theirs', ownerId: 'u-admin' }]; },
  async crmMassUpdate(input) { calls.push(input); return { updated: (input.ids || []).length, failed: 0, skipped: 0 }; },
};
const mixed = await viewPage({ api: stub, me: sales, cfg, owners, params: { id: 'v-mix' }, refresh() {} });
root.innerHTML = toText(mixed.body);
mixed.mount(root);
const mixBox = root.querySelector('[data-bulk-page]');
mixBox.checked = true;
fire(mixBox, 'change');
root.querySelector('[data-bulk-field]').click();
await tick();
const mixForm = document.querySelector('#bulk-field');
nameFields(mixForm, 'notes', 'Only mine');
fire(mixForm, 'submit');
await tick();
const mixCounts = document.querySelector('[data-bulk-counts]');
ok(calls.length === 1 && calls[0].ids.join() === 'own-1' && mixCounts && /1 saved/.test(mixCounts.textContent) && /1 skipped/.test(mixCounts.textContent) && /Only the owner or an admin can change this record/.test(mixCounts.textContent), 'a salesperson saves their own row and the result says the other was skipped');

console.log(fail ? fail + ' failed' : 'crm view bulk passed');
if (fail) process.exit(1);
