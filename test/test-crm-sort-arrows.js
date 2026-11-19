/* Leads and Clients sort from column arrows (JN-49). Fake data only. No network and no hosted database. */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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
    if (statSync(full).isDirectory()) { if (name !== 'vendor' && name !== 'node_modules') walk(full, out); else if (name === 'vendor' && existsSync(path.join(full, 'cla-calculator'))) walk(path.join(full, 'cla-calculator'), out); }   // CLA's own vendored calculator imports its rate snapshot with a stamp; third-party vendor code stays skipped
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
const allowed = new Set(['202611141400', '202611160300', '202611160400', '202611160500', '202611160600', '202611160700', '202611160800', '202611160900', '202611161100', '202611161200', '202611161400', '202611161500', '202611161800', '202611161900', '202611162000', '202611162100', '202611162200', '202611162300', '202611170700', '202611170800', '202611170900', '202611171000', '202611171100', '202611171200', '202611171400', '202611182100', '202611182110', '202611182120', '202611182130', '202611182140', '202611190500', '202611190600', '202611190700', '202611190800', '202611190900', '202611191000', '202611191100', '202611191200', '202611191400', '202611191500', '202611191600', '202611191700', '202611191800', '202611201000', '202611211000', '202611211100', '202611221000', '202611221100', '202611221200', '202611221300', '202611221600', '202611221700', '202611221800', '202611221900', '202611222000', '202611222100', '202611222200', '202611222300', '202611222400', '202611222500', '202611222600', '202611222700', '202611222800', '202611223000', '202611223100', '202611241000', '202611241300', '202611241400', '202611241500', '202611241600', '202611241700', '202611241800', '202611241900', '202611242000', '202611242010', '202611242020', '202611242030', '202611242060', '202611242100', '202611242200', '202611242210', '202611242220', '202611242270', '202611242280', '202611242290', '202611242400', '202611242500', '202611242600', '202611242700', '202611242710', '202611242720', '202611242730', '202611242740', '202611242750', '202611242760', '202611242770', '202611242780', '202611242781', '202611242782', '202611242783', '202611242784', '202611242790', '202611242800', '202611242810', '202611242820', '202611242830', '202611242840', '202611242850', '202611242860', '202611242870', '202611242880', '202611242900', '202611242901', '202611242902', '202611242903', '202611242904', '202611242905', '202611242906', '202611242907', '202611242908', '202611242909', '202611242910', '202611242911', '202611242912', '202611242913', '202611242914', '202611242915', '202611242916', '202611242917', '202611242918', '202611242919', '202611242920', '202611242921', '202611242922', '202611243000', '202611243001', '202611243002', '202611243003', '202611243004', '202611243005', '202611243006', '202611243007', '202611243008', '202611243009', '202611243010', '202611243011', '202611243012', '202611243013', '202611243014', '202611243015', '202611243016', '202611243017', '202611243018', '202611243019', '202611243020', '202611243021', '202611243022', '202611243023', '202611243024', '202611243025', '202611243026', '202611243027', '202611243028', '202611243029', '202611243030', '202611243031', '202611243032', '202611243033', '202611243034', '202611243035', '202611243036', '202611243037', '202611243038', '202611243039', '202611243040', '202611243041', '202611243042', '202611243043', '202611243044', '202611243045', '202611243046', '202611243047', '202611243048', '202611243049', '202611243050', '202611243051', '202611243052', '202611243053', '202611243054', '202611243055', '202611243056', '202611243057', '202611243058', '202611243059', '202611243060', '202611243061', '202611243062', '202611243063', '202611243064', '202611243065', '202611243066', '202611243067', '202611243068', '202611243069', '202611243070', '202611243071', '202611243072', '202611243073', '202611243074', '202611243075', '202611243076', '202611243077', '202611243078', '202611243079', '202611243080', '202611243081', '202611243082', '202611243083', '202611243100', '202611243101', '202611243102', '202611243103', '202611243104', '202611243105', '202611243106', '202611243107', '202611243108', '202611243109', '202611243110', '202611243111', '202611243112', '202611243200', '202611243210', '202611243220', '202611243221', '202611243222', '202611243223', '202611243224', '202611243225', '202611243226', '202611243227', '202611243228', '202611243229', '202611243230', '202611243231', '202611243232', '202611243233', '202611243234', '202611243235', '202611243300', '202611243600', '202611243601', '202611243602', '202611243603', '202611243604', '202611243605', '202611243606', '202611243607', '202611243608', '202611243609', '202611243610', '202611243611', '202611243612', '202611243613', '202611243614', '202611243615', '202611243616', '202611243617', '202611243618', '202611243619', '202611243620', '202611243621', '202611243622', '202611243623', '202611243624', '202611243625', '202611243626', '202611243627', '202611243628', '202611243800', '202611243801', '202611243802', '202611243803', '202611243804', '202611243805', '202611243806', '202611243807', '202611243808', '202611243809', '202611243810', '202611243811', '202611243812', '202611243813', '202611243814', '202611243815', '202611243816', '202611243817', '202611243818', '202611243819', '202611243820', '202611243821', '202611243822', '202611243823', '202611243824', '202611243825', '202611243826', '202611243827', '202611243900', '202611244000', '202611244001', '202611244002', '202611244003', '202611244004', '202611244005', '202611244010', '202611244011', '202611244012', '202611244013', '202611244014', '202611244015', '202611244020', '202611244021', '202611244022', '202611244023', '202611244024', '202611244025', '202611244026', '202611244027', '202611244028', '202611244029', '202611244030', '202611244031', '202611244032', '202611244033', '202611244034', '202611244035', '202611244300', '202611244500', '202611244600', '202611244900', '202611245000', '202611245200', '202611245400', '202611245800', '202611245900', '202611246000', '202611247100', '202611247200', '202611247000', '202611246900', '202611246800', '202611246200', '202611247700', '202611246300', '202611246400', '202611246500', '202611247800', '202611247600', '202611246600', '202611246700', '202611247900', '202611248300', '202611248100', '202611248110', '202611248120', '202611248130', '202611248140', '202611248150', '202611248160', '202611248170', '202611248180', '202611248190', '202611248200', '202611249100']);
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
