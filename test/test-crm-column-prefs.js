/* CRM column preferences follow the login (Janine, Nov 10). Fake data only. No hosted project. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { loadColumns, saveColumns, beginColumnPrefs, scheduleColumnSave, resetColumnPrefSession, cleanUiModule, cleanUiPrefs } from '../js/data/crm-columns.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const known = ['name', 'email', 'phone', 'city'];
const defaults = ['name', 'email'];

resetColumnPrefSession();
const store = mem();
let reads = 0;
let writes = [];
const api = {
  async getUserUiPrefs(module) {
    reads += 1;
    if (module === 'contacts') return { module, prefs: { order: ['email', 'name'] }, updatedAt: '2026-11-10T12:00:00Z' };
    return null;
  },
  async saveUserUiPrefs(module, prefs) { writes.push([module, prefs.order.join(',')]); },
};

const first = beginColumnPrefs({ api, storage: store, userId: 'u1', module: 'contacts', known, defaults, local: ['name', 'email'] });
const second = beginColumnPrefs({ api, storage: store, userId: 'u1', module: 'contacts', known, defaults, local: ['name', 'email'] });
ok(first.local.join() === 'name,email', 'the list paints from this browser before the login row loads');
const shown = await first.ready;
const again = await second.ready;
ok(shown.join() === 'email,name' && again.join() === 'email,name', 'the login row replaces the browser copy once it loads');
ok(loadColumns(store, 'u1', 'contacts', { known, defaults }).join() === 'email,name', 'the browser copy becomes the login row');
ok(reads === 1, 'a list reads column preferences once per module per session');
const leads = await beginColumnPrefs({ api, storage: store, userId: 'u1', module: 'leads', known, defaults, local: defaults }).ready;
ok(leads.join() === defaults.join() && reads === 2, 'another list is its own read, and an empty login row keeps the browser copy');
await beginColumnPrefs({ api, storage: store, userId: 'u1', module: 'contacts', known, defaults }).ready;
ok(reads === 2, 'opening the same list again does not read again');

resetColumnPrefSession();
let failedReads = 0;
const down = {
  async getUserUiPrefs() { failedReads += 1; throw new Error('unavailable'); },
  async saveUserUiPrefs() { throw new Error('unavailable'); },
};
saveColumns(store, 'u1', 'deals', ['phone', 'name'], known);
let rejected = 0;
process.on('unhandledRejection', () => { rejected += 1; });
const fallback = beginColumnPrefs({ api: down, storage: store, userId: 'u1', module: 'deals', known, defaults, local: ['phone', 'name'] });
const kept = await fallback.ready;
ok(kept.join() === 'phone,name' && loadColumns(store, 'u1', 'deals', { known, defaults }).join() === 'phone,name', 'a failed read keeps the browser copy');
await beginColumnPrefs({ api: down, storage: store, userId: 'u1', module: 'deals', known, defaults }).ready;
ok(failedReads === 1, 'a failed read is not retried this session');

resetColumnPrefSession();
writes = [];
const localNow = scheduleColumnSave({ api, storage: store, userId: 'u1', module: 'accounts', order: ['city', 'name', 'email'], known, delay: 40 });
scheduleColumnSave({ api, storage: store, userId: 'u1', module: 'accounts', order: ['name', 'city'], known, delay: 40 });
scheduleColumnSave({ api, storage: store, userId: 'u1', module: 'accounts', order: ['email', 'city'], known, delay: 40 });
ok(localNow[0] === 'city' && loadColumns(store, 'u1', 'accounts', { known, defaults }).join() === 'email,city', 'the browser copy updates on each change');
await wait(15);
ok(writes.length === 0, 'a burst of changes waits before writing');
await wait(80);
ok(writes.length === 1 && writes[0][0] === 'accounts' && writes[0][1] === 'email,city', 'one write sends the last order');
scheduleColumnSave({ api: down, storage: store, userId: 'u1', module: 'accounts', order: ['name'], known, delay: 20 });
await wait(50);
ok(rejected === 0 && loadColumns(store, 'u1', 'accounts', { known, defaults }).join() === 'name', 'a failed write stays on the browser copy and does not surface');

resetColumnPrefSession();
let release = () => {};
const slow = {
  getUserUiPrefs() { return new Promise((resolve) => { release = () => resolve({ prefs: { order: ['city', 'name'] } }); }); },
  async saveUserUiPrefs() {},
};
const pending = beginColumnPrefs({ api: slow, storage: store, userId: 'u2', module: 'leads', known, defaults, local: ['name'] });
scheduleColumnSave({ api: slow, storage: store, userId: 'u2', module: 'leads', order: ['email'], known, delay: 500 });
release();
ok((await pending.ready).join() === 'email', 'an edit during the read is kept');

ok(cleanUiModule('deals') === 'deals', 'deals is a column list');
let unknown = false; try { cleanUiModule('home'); } catch (e) { unknown = /unknown list/i.test(e.message); }
ok(unknown, 'a list that is not Manage columns is refused');
ok(cleanUiPrefs({ order: [' email ', 'email', 'name', 'x'.repeat(81), 'phone'] }).order.join() === 'email,name,phone', 'a saved order is trimmed, de-duplicated, and capped');

const bag = mem();
const session = mem();
const demo = createMockAdapter({ storage: bag, sessionStorage: session });
await demo.signInDev('u-admin');
const saved = await demo.saveUserUiPrefs('contacts', { order: ['email', 'name', 'email'] });
ok(saved.prefs.order.join() === 'email,name', 'demo mode stores the column order for that login');
ok((await demo.getUserUiPrefs('contacts')).prefs.order.join() === 'email,name', 'demo mode reads that login back');
ok(await demo.getUserUiPrefs('leads') === null, 'another list has no row until it is saved');
await demo.signOut();
await demo.signInDev('u-sp');
ok(await demo.getUserUiPrefs('contacts') === null, 'another person does not see the first login');
await demo.saveUserUiPrefs('contacts', { order: ['phone'] });
await demo.signOut();
const other = createMockAdapter({ storage: bag, sessionStorage: mem() });
await other.signInDev('u-admin');
ok((await other.getUserUiPrefs('contacts')).prefs.order.join() === 'email,name', 'the demo row is still there for the first login');

const mig = read('supabase/migrations/20261112070000_user_ui_prefs.sql');
const rb = read('supabase/rollbacks/20261112070000_user_ui_prefs.sql');
ok(mig.includes('create table if not exists public.user_ui_prefs') && mig.includes('user_id uuid not null default auth.uid()') && mig.includes('primary key (user_id, module)'), 'the migration adds user_ui_prefs');
ok(mig.includes('enable row level security') && !/private\./.test(mig) && !/for delete/i.test(mig), 'RLS is on, with no private helper and no delete policy');
const policyHits = mig.match(/user_id = \(select auth\.uid\(\)\)/g) || [];
ok(policyHits.length === 4, 'select, insert, and update each check auth.uid()');
ok(/revoke all on table public\.user_ui_prefs from public, anon, authenticated/i.test(mig) && /grant select, insert, update on table public\.user_ui_prefs to authenticated/i.test(mig), 'anon and public lose the table; authenticated can select, insert, and update');
ok(rb.includes('drop table if exists public.user_ui_prefs') && rb.includes('drop policy if exists user_ui_prefs_select'), 'the rollback drops the table and its policies');

const app = read('js/app.js');
const kit = read('js/pages/crm-kit.js');
const deals = read('js/pages/crm-deals.js');
ok(!app.includes('getUserUiPrefs') && !app.includes('beginColumnPrefs') && !read('js/pages/crm.js').includes('beginColumnPrefs'), 'boot and CRM routing do not fetch column preferences');
ok(kit.indexOf('beginColumnPrefs(') > kit.indexOf('function mount(root)'), 'Leads, Clients, and Companies load preferences when the list is shown');
ok(deals.indexOf('beginColumnPrefs(') > deals.indexOf('function mount(root)'), 'Deals loads preferences when the list is shown');
ok(read('js/data/adapter.js').includes('getUserUiPrefs(module)') && read('js/data/supabase-crm.js').includes('async getUserUiPrefs') && read('js/data/mock-part-crm-janine.js').includes('async getUserUiPrefs'), 'both adapters implement the same preference calls');

const migHash = createHash('sha256').update(mig).digest('hex');
const rbHash = createHash('sha256').update(rb).digest('hex');
console.log('HASH migration', migHash);
console.log('HASH rollback', rbHash);
console.log(fail ? fail + ' failed' : 'crm column prefs passed');
if (fail) process.exit(1);
