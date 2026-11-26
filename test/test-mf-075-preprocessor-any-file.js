/* MF-075 (Matt Landsberg, confirmed Nov 26 2026): any active Processor or Preprocessor can open and work on any file,
   assigned or not. Answer A: a Preprocessor can place an order without naming themselves as the file's Preprocessor.
   The demo gate stays (deals.is_demo is not distinct from the viewer's is_demo) and no non-staff role gains access. */
import { readFileSync as read } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

// ---- demo mode: a Preprocessor sees and works on a file someone else placed and nobody assigned to them ----
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const other = await api.createDeal({ street: '75 Unassigned Way', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-26', closingDate: '2026-12-30' });
ok(!other.preprocessorUserId, 'a Processor places an order with no Preprocessor named');
const allForProc = (await api.listDeals()).map((d) => d.id);

await api.signInDev('u-preproc');
const seen = (await api.listDeals()).map((d) => d.id);
ok(seen.includes(other.id), 'the Preprocessor sees the unassigned file in the order list');
ok(allForProc.every((id) => seen.includes(id)), 'the Preprocessor sees every file a Processor sees');
const opened = await api.getDeal(other.id);
ok(opened && opened.id === other.id, 'the Preprocessor opens the unassigned file');
const changed = await api.updateDeal(other.id, { county: 'Montgomery' });
ok(changed && changed.county === 'Montgomery', 'the Preprocessor works on the unassigned file (saves a change)');
const mine = await api.createDeal({ street: '76 Not Named Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-26', closingDate: '2026-12-30' });
ok(mine && mine.id && !mine.preprocessorUserId, 'Answer A: a Preprocessor places an order without naming themselves as the Preprocessor');

// ---- non-staff roles are not widened ----
await api.signInDev('u-buyer');
const buyerSees = (await api.listDeals()).map((d) => d.id);
ok(!buyerSees.includes(other.id) && !buyerSees.includes(mine.id), 'a buyer still does not see files they are not on');
await api.signInDev('u-sp');
const spSees = (await api.listDeals()).map((d) => d.id);
ok(!spSees.includes(other.id), 'a Sales Person still only sees their own files');

// ---- the database migration ----
const mig = read(new URL('../supabase/migrations/20261131300000_mf075_preprocessor_any_file.sql', import.meta.url), 'utf8');
const undo = read(new URL('../supabase/rollbacks/20261131300000_mf075_preprocessor_any_file.sql', import.meta.url), 'utf8');
for (const fn of ['can_access_deal(uuid)', 'can_run_deal(uuid)', 'reader_can_deal(uuid,uuid,text,boolean,uuid,boolean)', 'document_readable(uuid)', 'readable_document_ids()']) {
  ok(mig.includes(`'private.${fn}'`) && undo.includes(`'private.${fn}'`), `the migration and its rollback both cover private.${fn}`);
}
ok(/'x\.preprocessor_user_id = private\.effective_uid\(\)',\s*'x\.is_demo is not distinct from private\.viewer_is_demo\(\)'/.test(mig),
  'the Preprocessor branch swaps "assigned to me" for the demo gate (is_demo is not distinct from viewer_is_demo)');
ok(/'x\.preprocessor_user_id = (p_uid|g\.uid)',\s*'x\.is_demo is not distinct from coalesce\(\(select pr\.is_demo from public\.profiles pr where pr\.id = (p_uid|g\.uid)\), false\)'/.test(mig),
  'reader and document gates use the reader\'s own is_demo for the same demo gate');
ok(/if hits <> r\.want then\s+raise exception/.test(mig), 'the migration stops if the live function body is not what it expects');
ok(/create policy deals_insert on public\.deals for insert to authenticated\s+with check \(private\.is_processor\(\) and created_by = private\.effective_uid\(\)\);/.test(mig),
  'deals_insert no longer requires a Preprocessor to name themselves');
ok(/preprocessor_user_id = private\.effective_uid\(\)\)\);/.test(undo), 'the rollback restores the old deals_insert');
ok(/demo_scope[\s\S]*RESTRICTIVE/.test(mig), 'the migration checks the deals demo_scope policy is still restrictive');
ok(!/Sales Person|Client-Buyer|Outside user|deal_participants/.test(mig.split('begin;')[1]), 'the migration does not touch any non-staff branch');

if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log('MF-075 preprocessor any file: all passed');
