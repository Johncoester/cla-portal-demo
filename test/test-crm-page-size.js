/* CRM list page size (JN-46). Fake data only. No network and no hosted database. */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { html, toText } from '../js/ui.js';
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE, BULK_PAGE_SIZE, normalizePageSize, pageOf, loadPageSize, savePageSize } from '../js/data/crm-bulk.js';
import { cleanUiPrefs, beginColumnPrefs, scheduleColumnSave, schedulePageSizeSave, resetColumnPrefSession } from '../js/data/crm-columns.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

ok(PAGE_SIZE_OPTIONS.join() === '10,20,30,40,50,100' && DEFAULT_PAGE_SIZE === 100 && BULK_PAGE_SIZE === 100, 'the choices are 10, 20, 30, 40, 50 and 100, and 100 is the default');
ok(normalizePageSize('40') === 40 && normalizePageSize(7) === 100 && normalizePageSize('100') === 100, 'a page size outside the list falls back to 100');

const rows = Array.from({ length: 250 }, (_, i) => ({ id: 'r' + i }));
const first = pageOf(rows, 1);
ok(first.rows.length === 100 && first.pages === 3 && first.rows[0].id === 'r0' && first.rows[99].id === 'r99', 'the first page is 100 records');
const second = pageOf(rows, 2, 100);
ok(second.rows[0].id === 'r100' && second.rows.length === 100, 'the next page is the next 100, not a second copy of the first');

const many = Array.from({ length: 110000 }, (_, i) => ({ id: 'L' + i, name: 'Lead ' + i, email: 'l' + i + '@example.test' }));
const tSlice = performance.now();
const sliced = pageOf(many, 40, 100);
const sliceMs = performance.now() - tSlice;
ok(sliced.rows.length === 100 && sliced.total === 110000 && sliced.rows[0].id === 'L3900' && sliceMs < 50, 'paging 100 out of 110k does not copy the list (' + sliceMs.toFixed(2) + ' ms)');
const tDraw = performance.now();
const drawn = toText(sliced.rows.map((r) => html`<tr data-row="${r.id}"><td>${r.name}</td><td>${r.email}</td></tr>`));
const drawMs = performance.now() - tDraw;
ok(drawn.includes('data-row="L3900"') && drawn.includes('L3999') && !drawn.includes('L4000') && drawMs < 50, '100 rows render without drawing the rest (' + drawMs.toFixed(2) + ' ms)');

const store = mem();
ok(loadPageSize(store, 'u1', 'leads') === 100, 'a new login starts at 100');
ok(savePageSize(store, 'u1', 'leads', 30) === 30 && loadPageSize(store, 'u1', 'leads') === 30, 'this browser remembers the choice');
ok(loadPageSize(store, 'u1', 'contacts') === 100, 'another list keeps its own page size');
ok(savePageSize(store, 'u1', 'opportunities', 50) === 50 && loadPageSize(store, 'u1', 'opportunities') === 50, 'opportunities remember the choice in this browser');

ok(cleanUiPrefs({ order: ['name'], pageSize: 40 }).pageSize === 40, 'a saved row can carry the page size with the columns');
ok(cleanUiPrefs({ pageSize: '20' }).pageSize === 20 && !cleanUiPrefs({ pageSize: 20 }).order, 'a page-size save does not invent a column order');
let badSize = '';
try { cleanUiPrefs({ pageSize: 15 }); } catch (e) { badSize = e.message; }
ok(/10, 20, 30, 40, 50, or 100/.test(badSize), 'any other page size is refused');
ok(cleanUiPrefs({ order: [' email ', 'email', 'name'] }).order.join() === 'email,name' && cleanUiPrefs({ order: ['name'] }).pageSize == null, 'a column save without a page size still returns only the order');

resetColumnPrefSession();
const writes = [];
const api = {
  async getUserUiPrefs(module) {
    if (module === 'leads') return { module, prefs: { order: ['email', 'name'], pageSize: 40 }, updatedAt: '2026-11-11T00:00:00Z' };
    return null;
  },
  async saveUserUiPrefs(module, prefs) { writes.push([module, prefs]); },
};
savePageSize(store, 'u9', 'leads', 30);
const opened = beginColumnPrefs({ api, storage: store, userId: 'u9', module: 'leads', known: ['name', 'email'], defaults: ['name'], local: ['name'] });
ok(opened.pageSize === 30, 'the list paints from this browser before the login row loads');
const readySize = await opened.pageSizeReady;
ok(readySize === 40 && loadPageSize(store, 'u9', 'leads') === 40, 'the login row replaces the browser page size once it loads');
const kept = schedulePageSizeSave({ api, storage: store, userId: 'u9', module: 'leads', pageSize: 50, delay: 20 });
ok(kept === 50 && loadPageSize(store, 'u9', 'leads') === 50, 'changing the page size updates this browser immediately');
await wait(40);
ok(writes.length === 1 && writes[0][0] === 'leads' && writes[0][1].pageSize === 50 && !writes[0][1].order, 'the login row stores the page size and does not rewrite the columns');
schedulePageSizeSave({ api, storage: store, userId: 'u9', module: 'opportunities', pageSize: 10, delay: 15 });
await wait(40);
ok(writes.length === 1 && loadPageSize(store, 'u9', 'opportunities') === 10, 'opportunities stay in this browser because that list is not a user_ui_prefs module');

resetColumnPrefSession();
writes.length = 0;
const bag = mem();
const demo = createMockAdapter({ storage: bag, sessionStorage: mem() });
await demo.signInDev('u-admin');
await demo.saveUserUiPrefs('contacts', { order: ['email', 'name'] });
const sized = await demo.saveUserUiPrefs('contacts', { pageSize: 30 });
ok(sized.prefs.order.join() === 'email,name' && sized.prefs.pageSize === 30, 'saving the page size keeps the column order on that login');
await demo.saveUserUiPrefs('contacts', { order: ['name'] });
ok((await demo.getUserUiPrefs('contacts')).prefs.pageSize === 30 && (await demo.getUserUiPrefs('contacts')).prefs.order.join() === 'name', 'saving columns keeps the page size');
await demo.signOut();
await demo.signInDev('u-sp');
ok(await demo.getUserUiPrefs('contacts') === null, 'another person does not see the first login page size');

const leadsSrc = read('js/data/supabase-crm.js');
const listFns = ['listCrmLeads', 'listCrmContacts', 'listCrmAccounts', 'listCrmOpportunities', 'listCrmDeals'];
const capped = listFns.filter((name) => {
  const start = leadsSrc.indexOf('async ' + name);
  const body = leadsSrc.slice(start, leadsSrc.indexOf('\n    async ', start + 10));
  const lim = body.match(/\.limit\((\d+)\)/);
  return lim && Number(lim[1]) < 100;
});
ok(capped.length === 0, 'no CRM list call caps the server below 100' + (capped.length ? ': ' + capped.join(', ') : ''));
const screens = ['js/pages/crm-kit.js', 'js/pages/crm-deals.js', 'js/pages/crm-more.js'];
ok(screens.every((f) => read(f).includes('data-page-size') && read(f).includes('pageOf(')), 'Leads, Clients, Companies, Deals, and the pipeline list all page with the control');
ok(read('js/pages/crm.js').includes("key: 'leads'") && read('js/pages/crm.js').includes("key: 'contacts'") && read('js/pages/crm.js').includes("key: 'accounts'"), 'Leads, Clients, and Companies use the shared list');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== 'vendor') walk(full, out); else if (existsSync(path.join(full, 'cla-calculator'))) walk(path.join(full, 'cla-calculator'), out); }   // CLA's own vendored calculator imports its rate snapshot with a stamp; third-party vendor code stays skipped
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
const allowed = new Set(['202611261000', '202611249870', '202611261050', '202611141400', '202611160300', '202611160400', '202611160500', '202611160600', '202611160700', '202611160800', '202611160900', '202611161100', '202611161200', '202611161400', '202611161500', '202611161800', '202611161900', '202611162000', '202611162100', '202611162200', '202611162300', '202611170700', '202611170800', '202611170900', '202611171000', '202611171100', '202611171200', '202611171400', '202611182100', '202611182110', '202611182120', '202611182130', '202611182140', '202611190500', '202611190600', '202611190700', '202611190800', '202611190900', '202611191000', '202611191100', '202611191200', '202611191400', '202611191500', '202611191600', '202611191700', '202611191800', '202611201000', '202611211000', '202611211100', '202611221000', '202611221100', '202611221200', '202611221300', '202611221600', '202611221700', '202611221800', '202611221900', '202611222000', '202611222100', '202611222200', '202611222300', '202611222400', '202611222500', '202611222600', '202611222700', '202611222800', '202611223000', '202611223100', '202611241000', '202611241300', '202611241400', '202611241500', '202611241600', '202611241700', '202611241800', '202611241900', '202611242000', '202611242010', '202611242020', '202611242030', '202611242060', '202611242100', '202611242200', '202611242210', '202611242220', '202611242270', '202611242280', '202611242290', '202611242400', '202611242500', '202611242600', '202611242700', '202611242710', '202611242720', '202611242730', '202611242740', '202611242750', '202611242760', '202611242770', '202611242780', '202611242781', '202611242782', '202611242783', '202611242784', '202611242790', '202611242800', '202611242810', '202611242820', '202611242830', '202611242840', '202611242850', '202611242860', '202611242870', '202611242880', '202611242900', '202611242901', '202611242902', '202611242903', '202611242904', '202611242905', '202611242906', '202611242907', '202611242908', '202611242909', '202611242910', '202611242911', '202611242912', '202611242913', '202611242914', '202611242915', '202611242916', '202611242917', '202611242918', '202611242919', '202611242920', '202611242921', '202611242922', '202611243000', '202611243001', '202611243002', '202611243003', '202611243004', '202611243005', '202611243006', '202611243007', '202611243008', '202611243009', '202611243010', '202611243011', '202611243012', '202611243013', '202611243014', '202611243015', '202611243016', '202611243017', '202611243018', '202611243019', '202611243020', '202611243021', '202611243022', '202611243023', '202611243024', '202611243025', '202611243026', '202611243027', '202611243028', '202611243029', '202611243030', '202611243031', '202611243032', '202611243033', '202611243034', '202611243035', '202611243036', '202611243037', '202611243038', '202611243039', '202611243040', '202611243041', '202611243042', '202611243043', '202611243044', '202611243045', '202611243046', '202611243047', '202611243048', '202611243049', '202611243050', '202611243051', '202611243052', '202611243053', '202611243054', '202611243055', '202611243056', '202611243057', '202611243058', '202611243059', '202611243060', '202611243061', '202611243062', '202611243063', '202611243064', '202611243065', '202611243066', '202611243067', '202611243068', '202611243069', '202611243070', '202611243071', '202611243072', '202611243073', '202611243074', '202611243075', '202611243076', '202611243077', '202611243078', '202611243079', '202611243080', '202611243081', '202611243082', '202611243083', '202611243100', '202611243101', '202611243102', '202611243103', '202611243104', '202611243105', '202611243106', '202611243107', '202611243108', '202611243109', '202611243110', '202611243111', '202611243112', '202611243200', '202611243210', '202611243220', '202611243221', '202611243222', '202611243223', '202611243224', '202611243225', '202611243226', '202611243227', '202611243228', '202611243229', '202611243230', '202611243231', '202611243232', '202611243233', '202611243234', '202611243235', '202611243300', '202611243600', '202611243601', '202611243602', '202611243603', '202611243604', '202611243605', '202611243606', '202611243607', '202611243608', '202611243609', '202611243610', '202611243611', '202611243612', '202611243613', '202611243614', '202611243615', '202611243616', '202611243617', '202611243618', '202611243619', '202611243620', '202611243621', '202611243622', '202611243623', '202611243624', '202611243625', '202611243626', '202611243627', '202611243628', '202611243800', '202611243801', '202611243802', '202611243803', '202611243804', '202611243805', '202611243806', '202611243807', '202611243808', '202611243809', '202611243810', '202611243811', '202611243812', '202611243813', '202611243814', '202611243815', '202611243816', '202611243817', '202611243818', '202611243819', '202611243820', '202611243821', '202611243822', '202611243823', '202611243824', '202611243825', '202611243826', '202611243827', '202611243900', '202611244000', '202611244001', '202611244002', '202611244003', '202611244004', '202611244005', '202611244010', '202611244011', '202611244012', '202611244013', '202611244014', '202611244015', '202611244020', '202611244021', '202611244022', '202611244023', '202611244024', '202611244025', '202611244026', '202611244027', '202611244028', '202611244029', '202611244030', '202611244031', '202611244032', '202611244033', '202611244034', '202611244035', '202611244300', '202611244500', '202611244600', '202611244900', '202611245000', '202611245200', '202611245400', '202611245800', '202611245900', '202611246000', '202611247100', '202611247200', '202611247000', '202611247900', '202611246900', '202611246800', '202611246200', '202611247700', '202611246300', '202611246400', '202611246500', '202611247800', '202611247600', '202611246600', '202611246700', '202611248300', '202611248100', '202611248110', '202611248120', '202611248130', '202611248140', '202611248150', '202611248160', '202611248170', '202611248180', '202611248190', '202611248200', '202611249000', '202611249200', '202611249300', '202611249400', '202611249600', '202611249500', '202611249700', '202611249800', '202611249850', '202611249900', '202611249950']);
const issues = [];

const dual = [];
const missing = [];
for (const target of closure) {
  if (target === 'index.html') continue;
  const list = hits.get(target) || [];
  const stamps = [...new Set(list.map((h) => h.stamp))];
  if (!list.length && !files.some((f) => path.relative(root, f) !== target && readFileSync(f, 'utf8').includes(path.basename(target)))) continue;   // a module nothing imports (deal-buyer-legacy.js) has no stamp to check
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
console.log('page-render-ms', Math.round(drawMs * 100) / 100);
console.log('page-slice-ms', Math.round(sliceMs * 100) / 100);

console.log(fail ? fail + ' failed' : 'crm page size passed');
if (fail) process.exit(1);
