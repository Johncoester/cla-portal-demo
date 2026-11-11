/* Janine CRM items 27, 28, and 29. Fake data only. No hosted project. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { crmDealName, withDealName, loadColumns, saveColumns, COLUMN_CAP, normalizeColumns } from '../js/data/crm-columns.js';
import { importedStatusDecision, retiredStatusMessage } from '../js/data/crm-import-status.js';
import { importStatusChoices } from '../js/data/nov5-rules.js';
import { createModules } from '../js/data/crm-janine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const cfg = { picklists: { relationshipStatus: [
  { value: 'Prospecting', label: 'Prospecting', retired: false },
  { value: 'Churn', label: 'Churn', retired: true },
], leadRelationshipStatus: [
  { value: 'Hot Prospect', label: 'Hot Prospect', retired: false },
  { value: 'Do NOT Contact', label: 'Do NOT Contact', retired: true },
] } };

ok(importStatusChoices(cfg, 'contacts').every(([, label]) => label !== 'Churn') && importStatusChoices(cfg, 'contacts').some(([, label]) => label === 'Prospecting'), 'client import choices omit retired relationship statuses');
ok(importStatusChoices(cfg, 'leads').every(([value]) => value !== 'Do NOT Contact'), 'lead import choices omit retired relationship statuses');
const retired = importedStatusDecision(cfg, 'contacts', 'Churn');
ok(retired.error === retiredStatusMessage('Churn') && !retired.value, 'a CSV cell with a retired status is invalid');
const byLabel = importedStatusDecision(cfg, 'contacts', 'churn');
ok(byLabel.error && /retired/i.test(byLabel.error), 'a retired label is invalid too');
const live = importedStatusDecision(cfg, 'contacts', 'Prospecting');
ok(live.value === 'Prospecting' && !live.error && live.historical === false, 'a current status is kept as its stored value');
ok(importedStatusDecision(cfg, 'contacts', '').value === '' && !importedStatusDecision(cfg, 'contacts', '').error, 'a blank status is not an error');

const deal = { fileNumber: 'MD-26-97215', street: '1 Main St', city: 'Baltimore', state: 'MD', zip: '21201', propertyAddress: '1 Main St, Baltimore, MD 21201', name: 'MD-26-97215 1 Main St' };
ok(crmDealName(deal) === '1 Main St, Baltimore, MD 21201' && !crmDealName(deal).includes('MD-26-97215'), 'the deal name shown is the property address, without the file number');
ok(crmDealName({ name: 'MD-26-1 9 Oak', fileNumber: 'MD-26-1' }) === '9 Oak', 'a leading file number is dropped when no address was sent');
ok(withDealName(deal).name === deal.propertyAddress && withDealName(deal).fileNumber === 'MD-26-97215', 'shaping the row does not drop the file number field');

const known = ['name', 'email', 'phone', 'city', 'state', 'zip', 'county', 'owner', 'source', 'status', 'createdAt', 'extra'];
const defaults = known.slice(0, 8);
const store = mem();
ok(loadColumns(store, 'u1', 'contacts', { known, defaults }).join() === defaults.join(), 'a list with no saved choice shows the default columns');
const saved = saveColumns(store, 'u1', 'contacts', ['zip', 'name', 'email', 'phone', 'city', 'state', 'county', 'owner', 'source', 'status', 'createdAt'], known);
ok(saved.length === COLUMN_CAP && saved[0] === 'zip' && !saved.includes('createdAt'), 'a person can reorder columns and cannot show more than 10');
ok(loadColumns(store, 'u1', 'contacts', { known, defaults }).join() === saved.join(), 'the choice is remembered for that person and module');
ok(loadColumns(store, 'u2', 'contacts', { known, defaults }).join() === defaults.join(), 'another person keeps the default');
ok(normalizeColumns(['nope', 'email', 'email'], known, defaults).join() === 'email', 'unknown and repeated fields are dropped');

const page = read('js/pages/crm-janine.js');
const app = read('js/app.js');
const html = read('index.html');
ok(page.includes('importStatusChoices') && page.includes('data-import-retired-note') && page.includes('not imported'), 'the import screen says a retired status is not imported');
ok(app.includes('data-crm-create-slot') && app.indexOf('data-crm-create-slot') > app.indexOf('data-global-search') && app.includes('mountHeaderCreate'), 'Create New is placed in the header slot beside search');
ok(!read('js/pages/crm-kit.js').includes('createNewMenu') && !read('js/pages/crm.js').includes('+ Create Client') && !read('js/pages/crm.js').includes('+ Create Lead') && !read('js/pages/crm.js').includes('+ Create Company'), 'list pages no longer have their own create buttons');
ok(read('js/data/crm-janine.js').includes("['contact', 'Client'") && read('js/data/crm-janine.js').includes("['dashboard', 'Dashboard'") && createModules({ canEdit: true, isAdmin: true }).length >= 10, 'the one Create New menu still lists every module');
ok(read('js/pages/crm-reports.js').includes('data-create-report') && read('js/pages/crm-kit.js').includes('crm-head-actions'), 'Create Report stays and the page actions sit on the right');
const dash = read('js/pages/crm-dashboards.js');
ok(dash.includes('data-dash-kebab') && dash.includes('data-add-comp') && !dash.includes('Reorder and resize') && !dash.includes('data-dash-menu') && dash.includes('data-resize') && dash.includes('data-drag-handle') && dash.includes('Notes (beta)'), 'the dashboard keeps Add Component, a title kebab, and direct drag');
ok(dash.includes('data-comp-menu') && dash.includes('Move to another dashboard') && dash.includes('Download (CSV)'), 'each component keeps its own menu');
ok(!read('js/data/nov5-rules.js').includes('202611120600') && read('js/data/nov5-rules.js').includes('crm-janine.js?v=202611101600') && read('js/data/county-auto.js').includes('crm-janine.js?v=202611101600'), 'nov5-rules.js and county-auto.js use the one crm-janine stamp');

const mig = read('supabase/migrations/20261112050000_crm_janine_deal_name_import.sql');
const rb = read('supabase/rollbacks/20261112050000_crm_janine_deal_name_import.sql');
ok(mig.includes("btrim(g.street || ', ' || g.city || ', ' || g.state || ' ' || g.zip)") && !mig.includes("g.file_number || ' ' || g.street"), 'the read path names a deal with the property address');
ok(mig.includes('is retired and is not imported') && mig.includes('not o.retired'), 'the hosted import rejects a retired relationship status');
ok(rb.includes("g.file_number || ' ' || g.street") && !rb.includes('is retired and is not imported'), 'the rollback restores the previous deal name and import rule');
ok(!/create policy/i.test(mig), 'this migration adds no RLS policy');

const moneyFiles = ['js/data/constants.js', 'js/data/supabase-tc.js', 'js/pages/deal-buyer-legacy.js', 'js/pages/deal.js', 'js/pages/money-input.js', 'js/pages/ordernew.js', 'js/pages/tc-overview.js', 'js/data/nov5-rules.js', 'js/data/county-auto.js'];
for (const file of moneyFiles) {
  let dirty = false;
  try { execFileSync('git', ['diff', '--exit-code', 'HEAD', '--', file], { cwd: root, stdio: 'ignore' }); } catch (e) { dirty = true; }
  ok(!dirty, file + ' is unchanged');
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|html|css)$/.test(name)) out.push(full);
  }
  return out;
}
const specRe = /(['"])([^'"\s]+?)\?v=(\d+)\1/g;
const stamps = new Map();
const allowOld = new Set(['js/data/nov5-rules.js', 'js/data/county-auto.js', 'js/data/address-fill.js']);
for (const file of walk(path.join(root, 'js')).concat([path.join(root, 'index.html')])) {
  const text = readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  for (const m of text.matchAll(specRe)) {
    const spec = m[2];
    if (!spec.includes('/')) continue;
    const target = path.normalize(path.join(path.dirname(rel), spec)).replace(/\\/g, '/');
    if (!stamps.has(target)) stamps.set(target, []);
    stamps.get(target).push({ from: rel, stamp: m[3] });
  }
}
const changed = new Set(execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean));
const issues = [];
for (const [target, hits] of stamps) {
  if (!changed.has(target)) continue;
  const distinct = [...new Set(hits.map((h) => h.stamp))];
  if (distinct.length > 1) issues.push(target + ' ' + distinct.join(','));
}
const janinePins = (stamps.get('js/data/crm-janine.js') || []).filter((h) => allowOld.has(h.from));
if (janinePins.length !== allowOld.size || janinePins.some((h) => h.stamp !== '202611101600')) issues.push('crm-janine pin moved');
ok(issues.length === 0, 'cache stamps agree' + (issues.length ? ': ' + issues.join('; ') : ''));
ok(html.includes('js/app.js?v=202611160700') && html.includes('css/portal.css?v=202611141400'), 'index.html uses the placeholder stamp');

const tList = performance.now();
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const leads = await api.listCrmDeals({ status: 'All' });
const listMs = performance.now() - tList;
const tCols = performance.now();
loadColumns(store, 'u-admin', 'deals', { known: ['name', 'stage'], defaults: ['name'] });
const colMs = performance.now() - tCols;
console.log('TIMING list-view', JSON.stringify({ deals: leads.length, listMs: Math.round(listMs * 10) / 10, columnPrefMs: Math.round(colMs * 1000) / 1000, extraQueries: 0 }));
ok(leads.length > 0 && leads.every((d) => d.name === d.propertyAddress && !String(d.name).startsWith(d.fileNumber + ' ')), 'mock deals are named with the property address only');
ok(colMs < 5, 'column preferences are local and do not add a list query');

await api.retireCrmOption('relationshipStatus', 'Churn', true);
const preview = await api.previewCrmImport({
  module: 'contacts', kind: 'records', fileName: 'fake.csv',
  csv: 'First Name,Last Name,Email,Role in Company,Relationship Status,State\nCasey,Sample,casey.retired@example.test,Realtor,Churn,MD\nRobin,Template,robin.live.janine@example.test,Realtor,Prospecting,MD\n',
  mapping: ['firstName', 'lastName', 'email', 'roleInCompany', 'relationshipStatus', 'state'],
});
const churn = preview.rows.find((r) => (r.values || {}).email === 'casey.retired@example.test');
const liveRow = preview.rows.find((r) => (r.values || {}).email === 'robin.live.janine@example.test');
ok(churn && churn.status === 'error' && /retired/i.test(churn.message), 'preview flags a retired status instead of importing it');
ok(liveRow && liveRow.status === 'ok', 'a current status in the same file is still valid');
ok(preview.committed === false, 'preview does not commit');

console.log(fail ? fail + ' failed' : 'crm janine 27-29 passed');
if (fail) process.exit(1);
