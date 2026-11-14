/* CRM list page size (JN-46). Fake data only. No network and no hosted database. */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
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
    if (statSync(full).isDirectory()) { if (name !== 'vendor') walk(full, out); }
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
const allowed = new Set(['202611211100', '202611211000', '202611201000', '202611191800', '202611191700', '202611191600', '202611191500', '202611191400', '202611191200', '202611191000', '202611141400', '202611160300', '202611160400', '202611160500', '202611160600', '202611160700', '202611160800', '202611160900', '202611161100', '202611161200', '202611161400', '202611161500', '202611161800', '202611161900', '202611162000', '202611162100', '202611162200', '202611162300', '202611170700', '202611170800', '202611170900', '202611171000', '202611171100', '202611171200', '202611182100', '202611182110', '202611182120', '202611182130', '202611182140', '202611190500', '202611190600', '202611190700', '202611190800', '202611190900', '202611191100']);
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
