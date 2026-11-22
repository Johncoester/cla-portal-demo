/* New Custom View starts from the All list's columns, in that order.
 * Leads, Clients, Companies, and Deals. An existing view keeps its own columns.
 * Fake data only. No network. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { toText } from '../js/ui.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { render } from '../js/pages/crm.js';
import { viewPage } from '../js/pages/crm-views.js';
import { VIEW_DEFAULT_COLUMNS, viewModuleFields } from '../js/data/crm-views.js';
import { allListBuiltInKeys, allListCatalogKeys, allListDefaultKeys, viewColumnsFromList } from '../js/data/crm-all-columns.js';
import { columnKey, resetColumnPrefSession, saveColumns } from '../js/data/crm-columns.js';
import { colsKey, saveHidden, DEFAULT_HIDDEN } from '../js/data/crm-deal-cols.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear() { m.clear(); }, key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
const local = mem();
window.localStorage = local;
window.sessionStorage = mem();
globalThis.window = window;
globalThis.document = document;
globalThis.localStorage = local;
globalThis.sessionStorage = window.sessionStorage;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.location = { hash: '#/crm', pathname: '/', search: '' };
globalThis.FormData = class {
  constructor(form) { this._v = {}; if (form && form.querySelectorAll) form.querySelectorAll('[name]').forEach((el) => { if (!el.disabled) this._v[el.name] = el.value || ''; }); }
  entries() { return Object.entries(this._v); }
};
const nameForms = (host) => { host.querySelectorAll('form').forEach((f) => { f.querySelectorAll('[name]').forEach((el) => { f[el.name] = el; }); if (!f.elements) Object.defineProperty(f, 'elements', { configurable: true, get() { return f.querySelectorAll('[name]'); } }); }); };

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const wait = () => new Promise((r) => setTimeout(r, 30));
const keysOf = (sel) => [...document.querySelectorAll(sel)].map((el) => el.dataset.sort || el.dataset.col || el.dataset.vcol || el.dataset.colPick);

const hiddenLead = { fields: { person: { leadSource: { hidden: true } } } };
const hiddenKeys = allListBuiltInKeys('leads', hiddenLead);
ok(!hiddenKeys.includes('leadSource') && hiddenKeys[0] === 'name' && hiddenKeys.includes('ownerName'), 'a hidden Lead Source drops out of the All Leads column source');
ok(allListDefaultKeys('accounts', {}).includes('place') && !allListDefaultKeys('accounts', {}).includes('phone'), 'All Companies starts with its City column, not the short view list');

resetColumnPrefSession();
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const me = await api.crmMe();
const owners = await api.listCrmOwners();
const cfg = await api.getCrmSettings();
const root = document.getElementById('app');

const MODULES = [
  ['leads', 'Leads'],
  ['contacts', 'Clients'],
  ['accounts', 'Companies'],
  ['deals', 'Deals'],
];

async function paintList(module, source = api) {
  location.hash = '#/crm/' + module;
  resetColumnPrefSession();
  const page = await render({ api: source, params: { section: module }, refresh() {}, go() {} });
  root.innerHTML = toText(page.body);
  nameForms(root);
  if (page.mount) page.mount(root);
  await wait();
  return {
    headers: keysOf('#crm-t-' + module + ' thead th[data-sort], [data-deals-table] thead th[data-sort]'),
    catalog: keysOf('[data-col-pick]'),
  };
}
async function paintNew(module, source = api, who = me, settings = cfg) {
  const page = await viewPage({ api: source, me: who, cfg: settings, owners, params: { id: 'new', sub: module } });
  root.innerHTML = toText(page.body);
  nameForms(root);
  page.mount(root);
  return keysOf('[data-vcol]');
}
function wipeBrowser(userId) {
  for (const module of ['leads', 'contacts', 'accounts', 'deals']) local.removeItem(columnKey(userId, module));
  local.removeItem(colsKey(userId));
}

for (const [module, label] of MODULES) {
  const fields = viewModuleFields(module, cfg);
  const shown = await paintList(module);
  const defaults = allListDefaultKeys(module, cfg);
  const catalog = allListCatalogKeys(module, cfg);
  ok(shown.headers.join() === defaults.join(), label + ' All list shows the shared default columns (' + shown.headers.join() + ')');
  ok(shown.catalog.join() === catalog.join(), label + ' Manage columns lists the shared catalog');
  const selected = await paintNew(module);
  const fromList = viewColumnsFromList(module, shown.headers, fields);
  ok(selected.join() === fromList.join(), label + ' new view starts in the All list order (' + selected.join() + ')');
  ok(selected.join() !== VIEW_DEFAULT_COLUMNS[module].join(), label + ' new view does not start from the short default list');
  ok(selected.includes('name') && selected.every((k) => fields.some((f) => f.key === k)), label + ' new view columns are real fields and keep the name');
  const removable = selected.find((k) => k !== 'name');
  const remove = root.querySelector(`[data-vcol-x="${removable}"]`);
  ok(!!remove && !root.querySelector('[data-vcol="name"] [data-vcol-x]'), label + ' a chosen column can be removed and the name cannot');
  if (remove) remove.click();
  const afterRemove = keysOf('[data-vcol]');
  ok(!afterRemove.includes(removable) && afterRemove.includes('name'), label + ' removing a column leaves the rest, including the name');
}

ok(viewColumnsFromList('accounts', allListDefaultKeys('accounts', cfg), viewModuleFields('accounts', cfg)).includes('city'), 'Companies City on the All list becomes the City field on a new view');
ok(!viewColumnsFromList('deals', allListDefaultKeys('deals', cfg), viewModuleFields('deals', cfg)).includes('sourceText'), 'a list column a view cannot store is not selected');

for (const [module, label] of MODULES) {
  const saved = await api.createCrmView({ module, name: label + ' kept columns', columns: ['ownerId', 'name', 'city'], criteria: [], pin: false });
  ok(saved.columns.join() === 'ownerId,name,city', label + ' stores a column order that is not the All list');
  const edit = await viewPage({ api, me, cfg, owners, params: { id: saved.id, sub: 'edit' } });
  root.innerHTML = toText(edit.body);
  nameForms(root);
  edit.mount(root);
  const shown = keysOf('[data-vcol]');
  const still = (await api.listCrmViews(module)).find((v) => v.id === saved.id);
  ok(shown.join() === 'ownerId,name,city' && still && still.columns.join() === 'ownerId,name,city', label + ' editing leaves the saved columns untouched');
}

const chosen = {
  leads: ['email', 'ownerName', 'name'],
  contacts: ['phone', 'name', 'mobile'],
  accounts: ['website', 'name', 'kind'],
  deals: ['fileNumber', 'name', 'stage'],
};
wipeBrowser(me.id);
for (const [module, order] of Object.entries(chosen)) {
  await api.saveUserUiPrefs(module, { order });
}
for (const [module, label] of MODULES) {
  const fields = viewModuleFields(module, cfg);
  const shown = await paintList(module);
  const selected = await paintNew(module);
  ok(shown.headers.join() === chosen[module].join(), label + ' All list shows the saved column choice');
  ok(selected.join() === viewColumnsFromList(module, shown.headers, fields).join(), label + ' new view starts from that saved choice (' + selected.join() + ')');
  ok(selected.join() !== VIEW_DEFAULT_COLUMNS[module].join(), label + ' the saved choice replaces the short default list');
}

wipeBrowser(me.id);
resetColumnPrefSession();
await api.saveUserUiPrefs('leads', { order: ['email', 'company'] });
const noNameList = await paintList('leads');
const noNameView = await paintNew('leads');
ok(noNameList.headers.join() === 'email,company' && noNameView.join() === 'name,email,company', 'a saved All list with no name column still puts the name first on a new view');

wipeBrowser(me.id);
resetColumnPrefSession();
await api.saveUserUiPrefs('contacts', { order: ['email', 'name', 'phone'] });
const movedList = await paintList('contacts');
const movedView = await paintNew('contacts');
ok(movedList.headers.join() === 'email,name,phone' && movedView.join() === 'email,name,phone', 'a saved name position on All Clients stays in that place on a new view');

wipeBrowser(me.id);
await api.saveUserUiPrefs('leads', { order: ['name'] });
const browserOnly = saveColumns(local, me.id, 'leads', ['county', 'name', 'email'], allListCatalogKeys('leads', cfg));
const browserList = await paintList('leads');
const browserView = await paintNew('leads');
ok(browserOnly.join() === 'county,name,email' && browserList.headers.join() === 'name' && browserView[0] === 'name', 'a login column choice replaces this browser\'s older copy on the All list and on a new view');

const freshStore = mem();
const fresh = createMockAdapter({ storage: freshStore, sessionStorage: mem() });
await fresh.signInDev('u-admin');
const freshMe = await fresh.crmMe();
const freshCfg = await fresh.getCrmSettings();
wipeBrowser(freshMe.id);
saveHidden(local, freshMe.id, [...DEFAULT_HIDDEN, 'stage']);
const legacy = await paintList('deals', fresh);
const legacyView = await paintNew('deals', fresh, freshMe, freshCfg);
ok(!legacy.headers.includes('stage') && legacy.headers.includes('name') && legacy.headers.includes('amount'), 'with no saved login columns, All Deals still uses the older hide-list (' + legacy.headers.join() + ')');
ok(legacyView.includes('name') && !legacyView.includes('stage') && legacyView.join() === viewColumnsFromList('deals', legacy.headers, viewModuleFields('deals', freshCfg)).join(), 'a new Deals view follows that hide-list');

console.log(fail ? fail + ' failed' : 'crm new view all columns passed');
if (fail) process.exit(1);
