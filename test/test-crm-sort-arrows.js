/* Leads and Clients sort from column arrows (JN-49). Fake data only. No network and no hosted database. */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { toText } from '../js/ui.js';
import { savedListSort, listView } from '../js/pages/crm-kit.js';
import { resetColumnPrefSession } from '../js/data/crm-columns.js';
import { createMockAdapter, STORAGE_KEY } from '../js/data/mock-adapter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear() { m.clear(); }, key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const local = mem();
window.localStorage = local; window.sessionStorage = mem();
globalThis.window = window; globalThis.document = document;
globalThis.localStorage = local; globalThis.sessionStorage = window.sessionStorage;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
globalThis.FormData = class {
  constructor(form) { this._v = {}; if (form && form.querySelectorAll) form.querySelectorAll('[name]').forEach((el) => { if (!el.disabled) this._v[el.name] = el.value || ''; }); }
  entries() { return Object.entries(this._v); }
};
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
  configurable: true,
  get() { return selectValue.get.call(this); },
  set(v) {
    const want = String(v);
    const opts = [...this.options];
    opts.forEach((o) => { o.selected = o.getAttribute('value') === want; });
    if (selectValue.get.call(this) !== want) {
      const hit = opts.find((o) => o.getAttribute('value') === want);
      if (hit) hit.setAttribute('selected', '');
      opts.forEach((o) => { if (o !== hit) o.removeAttribute('selected'); });
    }
  },
});
const nameForms = (host) => { host.querySelectorAll('form').forEach((f) => { f.querySelectorAll('[name]').forEach((el) => { f[el.name] = el; }); if (!f.elements) Object.defineProperty(f, 'elements', { configurable: true, get() { return f.querySelectorAll('[name]'); } }); }); };
const paint = (view) => { const host = document.getElementById('app'); host.innerHTML = toText(view.body); nameForms(host); view.mount(host); return host; };
const ids = (host) => [...host.querySelectorAll('tbody tr[data-row]')].map((tr) => tr.dataset.row);
const change = (el) => el.dispatchEvent(new window.Event('change', { bubbles: true }));

const sorts = [['name', 'Name'], ['company', 'Company'], ['createdAt', 'Created Time'], ['lastContactedOn', 'Last contacted']];
const cols = [['name', 'Name'], ['company', 'Company'], ['createdAt', 'Created Time'], ['email', 'Email']];
const fields = ['name', 'company', 'email'];
const many = Array.from({ length: 25 }, (_, i) => ({
  id: 'r' + String(i).padStart(2, '0'),
  name: 'Person ' + String(i).padStart(2, '0'),
  company: i % 2 ? 'North' : 'South',
  email: 'p' + i + '@example.test',
  createdAt: i < 12 ? '2026-11-01T15:00:00Z' : '2026-10-01T15:00:00Z',
  archived: false,
  converted: false,
}));

ok(savedListSort({ prefs: { sort: 'company:desc' } }, new Set(['company'])).dir === 'desc', 'a stored field:dir sort is read');
ok(savedListSort({ sortField: 'name', sortDir: 'desc' }, new Set(['name'])).field === 'name', 'sortField and sortDir are read');
ok(savedListSort({ sort: { field: 'company', dir: 'asc' } }, new Set(['company'])).dir === 'asc', 'an object sort is read');
ok(savedListSort({ prefs: { sort: 'missing:desc' } }, new Set(['name'])) === null, 'a sort for a field this list does not offer is ignored');

resetColumnPrefSession();
const leadView = listView({
  key: 'leads', userId: 'u-sort', rows: many, cols, sorts, fields, dates: true, headerSort: true, sortDefault: 'createdAt:desc',
  bulk: { module: 'lead', me: { canEdit: false } },
});
const host = paint(leadView);
ok(!host.querySelector('[name=sort]') && host.querySelectorAll('button.th-sort').length === cols.length, 'Leads have column arrows and no Sort menu');
ok(host.querySelector('th[data-sort="createdAt"]').getAttribute('aria-sort') === 'descending' && host.querySelector('th[data-sort="createdAt"] .dn').classList.contains('on'), 'Leads still open on Created Time, newest first');
ok(host.querySelector('th[data-sort="company"] .sort-arrows'), 'the arrow markup matches Deals');

host.querySelector('th[data-sort="company"] button').click();
let order = ids(host);
ok(host.querySelector('th[data-sort="company"]').getAttribute('aria-sort') === 'ascending' && order[0] === 'r01' && order[1] === 'r03', 'the first click sorts Company ascending');
host.querySelector('th[data-sort="company"] button').click();
order = ids(host);
ok(host.querySelector('th[data-sort="company"]').getAttribute('aria-sort') === 'descending' && order[0] === 'r00' && order[1] === 'r02', 'the second click sorts Company descending');

const pageSizeEl = host.querySelector('[data-page-size]');
pageSizeEl.value = '10';
change(pageSizeEl);
ok(ids(host).length === 10 && host.querySelector('[data-count]').textContent.includes('10 on this page') && host.querySelector('[data-count]').textContent.includes('25 of 25'), 'page size still pages the sorted list');
const page1 = ids(host).slice();
host.querySelector('[data-bulk-next]').click();
const page2 = ids(host);
ok(page2[0] !== page1[0] && page2.length === 10 && !page2.some((id) => page1.includes(id)), 'the next page is the next sorted rows');
ok(host.querySelector('th[data-sort="company"]').getAttribute('aria-sort') === 'descending', 'paging keeps the column sort');

host.querySelector('[name=createdAtOp]').value = 'on';
host.querySelector('[name=createdAtValue]').value = '2026-11-01';
change(host.querySelector('[name=createdAtOp]'));
ok(host.querySelector('[data-count]').textContent.includes('10 on this page') && host.querySelector('[data-count]').textContent.includes('12 of 25'), 'the Created Time filter still narrows the sorted page');
host.querySelector('[data-bulk-page]').checked = true;
change(host.querySelector('[data-bulk-page]'));
const offer = host.querySelector('[data-match-banner]');
ok(offer && !offer.hidden && offer.textContent.includes('Select all 12'), 'select all matching still offers the filtered rows');
host.querySelector('[data-select-all-matching]').click();
ok(host.querySelector('[data-match-banner]').textContent.includes('All 12 matching records are selected'), 'select all matching still selects the filtered set');

host.querySelector('[data-crm-reset]').click();
ok(!host.querySelector('[name=createdAtOp]').value && host.querySelector('th[data-sort="company"]').getAttribute('aria-sort') === 'descending', 'reset clears the date filter and keeps the column sort');

resetColumnPrefSession();
let reads = 0;
const prefApi = { async getUserUiPrefs() { reads += 1; return { module: 'leads', prefs: { sort: 'company:desc', pageSize: 20 }, updatedAt: '2026-11-11T00:00:00Z' }; } };
const savedView = listView({
  key: 'leads', userId: 'u-pref', rows: many, cols, sorts, fields, headerSort: true, sortDefault: 'name:asc',
  saved: { api: prefApi, listKey: 'leads' },
});
const prefHost = paint(savedView);
await wait(); await wait(); await wait();
ok(reads === 1 && prefHost.querySelector('th[data-sort="company"]').getAttribute('aria-sort') === 'descending' && ids(prefHost)[0] === 'r00', 'a saved sort in user_ui_prefs replaces the default once it loads');
ok(prefHost.querySelector('[data-page-size]').value === '20' && ids(prefHost).length === 20, 'the same preference read still applies the page size');
const again = listView({ key: 'leads', userId: 'u-pref', rows: many, cols, sorts, fields, headerSort: true, sortDefault: 'name:asc', saved: { api: prefApi, listKey: 'leads' } });
const againHost = paint(again);
await wait(); await wait();
ok(reads === 1 && againHost.querySelector('th[data-sort="company"]').getAttribute('aria-sort') === 'descending', 'opening the list again uses the sort already read');

resetColumnPrefSession();
const fieldApi = { async getUserUiPrefs() { return { prefs: { sortField: 'name', sortDir: 'desc' } }; } };
const fieldHost = paint(listView({ key: 'contacts', userId: 'u-field', rows: many, cols, sorts, fields, headerSort: true, sortDefault: 'name:asc', saved: { api: fieldApi, listKey: 'contacts' } }));
await wait(); await wait(); await wait();
ok(fieldHost.querySelector('th[data-sort="name"]').getAttribute('aria-sort') === 'descending' && ids(fieldHost)[0] === 'r24', 'sortField and sortDir on the login row still sort Clients');

resetColumnPrefSession();
const company = paint(listView({ key: 'accounts', userId: 'u-co', rows: many, cols, sorts, fields, sortDefault: 'name:asc' }));
ok(!!company.querySelector('[name=sort]') && !company.querySelector('button.th-sort'), 'Companies keep the Sort menu');
company.querySelector('[name=sort]').value = 'company:desc';
change(company.querySelector('[name=sort]'));
ok(ids(company)[0] === 'r00', 'the Company Sort menu still sorts');

const crm = read('js/pages/crm.js');
const leadCall = crm.slice(crm.indexOf("listKey: 'leads'"), crm.indexOf("listKey: 'contacts'"));
const contactCall = crm.slice(crm.indexOf("listKey: 'contacts'"), crm.indexOf("listKey: 'accounts'"));
const accountCall = crm.slice(crm.indexOf("listKey: 'accounts'"), crm.indexOf("listKey: 'accounts'") + 800);
ok(leadCall.includes('headerSort: true') && contactCall.includes('headerSort: true') && !accountCall.includes('headerSort'), 'Leads and Clients use header sort and Companies do not');
const deals = read('js/pages/crm-deals.js');
ok(deals.includes('class="th-sort"') && deals.includes('sort-arrows') && read('js/pages/crm-kit.js').includes('class="th-sort"') && read('js/pages/crm-kit.js').includes('sort-arrows'), 'the list arrows use the Deals header markup');

const bag = mem();
const demo = createMockAdapter({ storage: bag, sessionStorage: mem() });
await demo.signInDev('u-admin');
await demo.saveUserUiPrefs('leads', { order: ['name'], pageSize: 30 });
const raw = JSON.parse(bag.getItem(STORAGE_KEY));
const stored = raw.userUiPrefs.find((r) => r.module === 'leads');
stored.prefs.sort = 'company:desc';
stored.prefs.sortField = 'county';
stored.prefs.sortDir = 'asc';
bag.setItem(STORAGE_KEY, JSON.stringify(raw));
const reloaded = createMockAdapter({ storage: bag, sessionStorage: mem() });
await reloaded.signInDev('u-admin');
const got = await reloaded.getUserUiPrefs('leads');
ok(got.prefs.sort === 'company:desc' && got.prefs.sortField === 'county' && got.prefs.sortDir === 'asc' && got.prefs.order.join() === 'name' && got.prefs.pageSize === 30, 'a sort already stored on the login is returned with the columns and page size');
const kept = await reloaded.saveUserUiPrefs('leads', { order: ['email', 'name'] });
ok(kept.prefs.sort === 'company:desc' && kept.prefs.order.join() === 'email,name' && (await reloaded.getUserUiPrefs('leads')).prefs.pageSize === 30, 'saving columns keeps the stored sort and the page size');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== 'vendor' && name !== 'node_modules') walk(full, out); }
    else if (/\.(js|html)$/.test(name)) out.push(full);
  }
  return out;
}
const files = walk(path.join(root, 'js')).concat(readdirSync(root).filter((n) => n.endsWith('.html')).map((n) => path.join(root, n)));
const specRe = /(['"])([^'"\s]+?)\?v=(\d+)\1/g;
const hits = new Map();
for (const file of files) {
  const rel = path.relative(root, file);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(specRe)) {
    if (!m[2].includes('/')) continue;
    const target = path.normalize(path.join(path.dirname(rel), m[2])).replace(/\\/g, '/');
    if (!hits.has(target)) hits.set(target, []);
    hits.get(target).push({ from: rel, stamp: m[3] });
  }
}
const changed = new Set(execFileSync('git', ['diff', '--name-only', 'origin/main'], { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => f.startsWith('js/') || f === 'index.html'));
const closure = new Set([...changed].filter((f) => /\.(js|html)$/.test(f)));
let grew = true;
while (grew) {
  grew = false;
  for (const [target, list] of hits) {
    if (!closure.has(target)) continue;
    for (const h of list) if (!closure.has(h.from)) { closure.add(h.from); grew = true; }
  }
}
const allowed = new Set(['202611141400', '202611160300', '202611160400', '202611160500', '202611160600', '202611160700', '202611160800', '202611160900', '202611161100', '202611161200', '202611161400', '202611161500', '202611161800', '202611161900', '202611162000', '202611162100', '202611162200', '202611162300', '202611170700', '202611170800', '202611170900', '202611171000', '202611171100', '202611171200', '202611171300']);
const issues = [];
const dual = [];
const missing = [];
for (const target of closure) {
  if (target === 'index.html') continue;
  const list = hits.get(target) || [];
  const stamps = [...new Set(list.map((h) => h.stamp))];
  if (!list.length && !files.some((f) => path.relative(root, f) !== target && readFileSync(f, 'utf8').includes(path.basename(target)))) continue;
  if (!list.length) missing.push(target);
  if (stamps.length !== 1 || !allowed.has(stamps[0])) issues.push(target + ' ' + (stamps.join(',') || 'none'));
  if (stamps.length > 1) dual.push(target + ' ' + stamps.join(','));
}
ok(issues.length === 0, 'cache stamps agree' + (issues.length ? ': ' + issues.join('; ') : ''));
ok(dual.length === 0, 'dual-stamp scan ' + dual.length + (dual.length ? ': ' + dual.join('; ') : ''));
ok(missing.length === 0, 'recursive import check missing ' + missing.length + (missing.length ? ': ' + missing.join('; ') : ''));
console.log('cache-stamp issues', issues.length);
console.log('dual-stamp', dual.length);
console.log('recursive-import missing', missing.length);

console.log(fail ? fail + ' failed' : 'crm sort arrows passed');
if (fail) process.exit(1);
