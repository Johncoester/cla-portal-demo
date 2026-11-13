/* CRM Clients list times. Fake data only. No network and no hosted database. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const crm = read('js/pages/crm.js');
const leads = crm.slice(crm.indexOf('async function leadsList'), crm.indexOf('async function leadPage'));
const clients = crm.slice(crm.indexOf('async function contactsList'), crm.indexOf('async function contactPage'));
const companies = crm.slice(crm.indexOf('async function accountsList'), crm.indexOf('async function accountPage'));
const timeCols = crm.slice(crm.indexOf('const TIME_COLS'), crm.indexOf('const CLIENT_TIME_COLS'));
ok(clients.includes('...CLIENT_TIME_COLS') && clients.includes('row.modifiedAt || row.createdAt'), 'the clients list shows modified time, or created time when modified time is blank');
ok(crm.includes('when(r.modifiedAt || r.createdAt)') && crm.includes("r.modifiedAt || r.createdAt || ''"), 'the Modified Time cell and its export use that fallback');
ok(timeCols.includes('when(r.modifiedAt)') && !timeCols.includes('r.modifiedAt || r.createdAt'), 'the shared time columns still show a blank modified time as blank');
ok(leads.includes('...TIME_COLS') && !leads.includes('CLIENT_TIME_COLS') && !leads.includes('r.modifiedAt || r.createdAt'), 'leads keep modified time as stored');
ok(companies.includes('...TIME_COLS') && !companies.includes('CLIENT_TIME_COLS') && !companies.includes('r.modifiedAt || r.createdAt'), 'companies keep modified time as stored');
ok(!clients.includes('createdByName') && !clients.includes('modifiedByName'), 'the clients list does not look up Created By or Modified By');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const before = await api.listCrmContacts();
ok(before.length > 0 && before.every((r) => Object.prototype.hasOwnProperty.call(r, 'createdAt') && Object.prototype.hasOwnProperty.call(r, 'modifiedAt') && r.createdAt), 'the mock client list already returns createdAt and modifiedAt');
const blank = before.find((r) => !r.modifiedAt && r.createdAt);
ok(!!blank && (blank.modifiedAt || blank.createdAt) === blank.createdAt, 'a client with no modified time still has a created time to show');
const saved = await api.updateCrmContact(blank.id, { notes: 'Fake note for the modified time.' });
ok(!!saved.modifiedAt && !blank.modifiedAt && saved.createdAt === blank.createdAt, 'saving a client sets modifiedAt and keeps createdAt');
const made = await api.createCrmContact({ firstName: 'Ada', lastName: 'Times', email: 'ada.times@example.test', roleInCompany: 'Realtor', relationshipStatus: 'Potential/Warm', state: 'MD', leadSource: 'Personal Network' });
ok(!!made.createdAt && !!made.modifiedAt && made.modifiedAt === made.createdAt, 'a new fake client has both times');

const migRel = 'supabase/migrations/20261112090000_crm_contact_times.sql';
const rbRel = 'supabase/rollbacks/20261112090000_crm_contact_times.sql';
const mig = read(migRel);
const rb = read(rbRel);
ok(mig.includes("md5(pg_get_functiondef('private.crm_contact_json(uuid)'::regprocedure))") && mig.includes("'a1ea62a930abe15fdddf1e2b5acc1854'") && mig.includes("'ea5203bd6388e3dc63c7c188e11a2005'"), 'the migration aborts unless both function definitions still match TEST');
ok(mig.includes("'createdAt', c.created_at") && mig.includes("'modifiedAt', c.modified_at") && mig.includes('modified_at = now()') && mig.includes('modified_by = private.effective_uid()'), 'the migration adds the two times and stamps modified_at on update');
const replaced = mig.match(/create or replace function private\.\w+/gi) || [];
ok(replaced.length === 2 && replaced.join(' ').includes('crm_contact_json') && replaced.join(' ').includes('rpc_crm_update_contact') && !/create policy/i.test(mig) && !/create or replace function private\.crm_row_guard/i.test(mig) && !/modified_at is null/i.test(mig), 'the migration replaces only the two functions and does not backfill');
const restored = rb.split('do $restored$')[0];
ok(restored.includes('CREATE OR REPLACE FUNCTION private.crm_contact_json') && restored.includes('CREATE OR REPLACE FUNCTION private.rpc_crm_update_contact') && !restored.includes('modified_at = now()') && !restored.includes("'createdAt'"), 'the rollback restores the before-definitions');
ok(rb.includes("'a1ea62a930abe15fdddf1e2b5acc1854'") && rb.includes("'ea5203bd6388e3dc63c7c188e11a2005'"), 'the rollback checks the restored definition hashes');
const migSha = createHash('sha256').update(readFileSync(path.join(root, migRel))).digest('hex');
const rbSha = createHash('sha256').update(readFileSync(path.join(root, rbRel))).digest('hex');
console.log('crm-contact-times-migration-sha256', migSha);
console.log('crm-contact-times-rollback-sha256', rbSha);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== 'vendor') walk(full, out); }
    else if (/\.(js|html)$/.test(name)) out.push(full);
  }
  return out;
}
const files = walk(path.join(root, 'js')).concat(readdirSync(root).filter((n) => n.endsWith('.html')).map((n) => path.join(root, n)));
const specRe = /(['"])([^'"\s]+?)\?v=([A-Za-z0-9]+)\1/g;
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
const want = new Map([['js/pages/crm.js', '202611161500'], ['js/app.js', '202611191500']]);
const issues = [];
const dual = [];
const missing = [];
for (const [target, stamp] of want) {
  const list = hits.get(target) || [];
  const stamps = [...new Set(list.map((h) => h.stamp))];
  if (!list.length) missing.push(target);
  if (stamps.length !== 1 || stamps[0] !== stamp) issues.push(target + ' ' + (stamps.join(',') || 'none'));
  if (stamps.length > 1) dual.push(target + ' ' + stamps.join(','));
}
const at1800 = [...hits.entries()].filter(([, list]) => list.some((h) => h.stamp === '202611121800')).map(([target]) => target);
ok(issues.length === 0, 'cache stamps agree' + (issues.length ? ': ' + issues.join('; ') : ''));
ok(dual.length === 0, 'dual-stamp scan ' + dual.length + (dual.length ? ': ' + dual.join('; ') : ''));
ok(missing.length === 0, 'recursive import check missing ' + missing.length + (missing.length ? ': ' + missing.join('; ') : ''));
ok(at1800.length === 0, 'the previous crm.js stamp 202611121800 is unused' + (at1800.length ? ': ' + at1800.join(',') : ''));
const appImporters = (hits.get('js/app.js') || []).map((h) => h.from + '@' + h.stamp);
ok(appImporters.length === 1 && appImporters[0] === 'index.html@202611191500', 'index.html loads app.js at 202611191200');
const crmImporters = (hits.get('js/pages/crm.js') || []).map((h) => h.from + '@' + h.stamp);
ok(crmImporters.length === 1 && crmImporters[0] === 'js/app.js@202611161500', 'app.js loads the CRM page at 202611161500');
console.log('cache-stamp issues', issues.length);
console.log('dual-stamp', dual.length);
console.log('recursive-import missing', missing.length);

const dirty = new Set(execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean));
const servedDirty = [...dirty].filter((f) => f.startsWith('js/') || f === 'index.html');
const anyrole = new Set(['js/data/adapter.js', 'js/data/dashboard-load.js', 'js/data/mock-adapter.js', 'js/data/mock-part-crm-nov3b.js', 'js/data/mock-part-crm.js', 'js/data/mock-part-deals.js', 'js/data/mock-part-docs.js', 'js/data/mock-part-nov3b.js', 'js/data/order-duplicates.js', 'js/data/place-order.js', 'js/data/supabase-adapter.js', 'js/data/supabase-staff.js', 'js/pages/dashboard.js', 'js/pages/deal-buyer-legacy.js', 'js/pages/deal-tab.js', 'js/pages/deal.js', 'js/pages/dealagenttask.js', 'js/pages/dealcontacts.js', 'js/pages/dealintake.js', 'js/pages/dealtaskform.js', 'js/pages/dealtasks.js', 'js/pages/ordernew.js', 'js/pages/person-picker.js', 'js/pages/taskboard.js', 'js/pages/tasks.js']);
const unstamped = servedDirty.filter((f) => f.endsWith('.js') && f !== 'js/pages/crm.js' && f !== 'js/app.js' && !anyrole.has(f));
ok(unstamped.length === 0, 'no other served module changed' + (unstamped.length ? ': ' + unstamped.join(', ') : ''));

console.log(fail ? fail + ' failed' : 'crm contact times passed');
if (fail) process.exit(1);
