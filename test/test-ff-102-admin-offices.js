/* FF-102: Admin > Offices can toggle usedForSettlements. Reuses FF-101d picker.
 * Migration 20261125310000 only adds Admin save path + RLS (no column/seed). */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { cleanOffice, SAMPLE_OFFICES, canManageOffices } from '../js/data/offices.js';
import { createMockAdapter, STORAGE_KEY } from '../js/data/mock-adapter.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

ok(canManageOffices({ isAdmin: true, status: 'active' }), 'Admin can manage offices');
ok(!canManageOffices({ isAdmin: false, status: 'active' }), 'non-Admin cannot manage offices');

const base = SAMPLE_OFFICES.find((o) => o.id === 'off-annapolis');
const cleaned = cleanOffice({ ...base, usedForSettlements: true });
ok(cleaned.usedForSettlements === true, 'cleanOffice keeps Used for settlements');
ok(cleanOffice({ ...base, usedForSettlements: false }).usedForSettlements === false, 'cleanOffice can clear the flag');

const storage = mem();
const api = createMockAdapter({ storage, sessionStorage: mem() });
await api.signInDev('u-admin');
const before = await api.getClosingOfficeDefault('deal-2');
ok(before.offices.every((o) => o.name !== 'Annapolis'), 'Annapolis is not in the settlement picker before toggle');

const annapolis = (await api.listOffices()).offices.find((o) => o.id === 'off-annapolis');
ok(annapolis && !annapolis.usedForSettlements, 'Annapolis starts off for settlements');
const saved = await api.updateOffice('off-annapolis', { ...annapolis, usedForSettlements: true });
ok(saved.usedForSettlements === true, 'Admin can turn Used for settlements on');

const after = await api.getClosingOfficeDefault('deal-2');
ok(after.offices.some((o) => o.id === 'off-annapolis'), 'settlement picker includes Annapolis after Admin toggle');

const off = await api.updateOffice('off-annapolis', { ...saved, usedForSettlements: false });
ok(off.usedForSettlements === false, 'Admin can turn Used for settlements off');
const again = await api.getClosingOfficeDefault('deal-2');
ok(!again.offices.some((o) => o.id === 'off-annapolis'), 'settlement picker drops Annapolis after toggle off');

const proc = createMockAdapter({ storage, sessionStorage: mem() });
await proc.signInDev('u-proc');
let refused = '';
try {
  const list = await proc.listOffices();
  const row = list.offices.find((o) => o.id === 'off-towson');
  await proc.updateOffice('off-towson', { ...row, usedForSettlements: false });
} catch (e) { refused = e.message; }
ok(/Admin or Super admin/i.test(refused), 'a processor cannot change Used for settlements');

const page = readFileSync('js/pages/offices.js', 'utf8');
ok(/usedForSettlements/.test(page) && /data-office-settlements-box/.test(page), 'Admin Offices form has the Used for settlements checkbox');
ok(/data-office-settlements/.test(page), 'Admin Offices list shows a Used for settlements chip');

const sb = readFileSync('js/data/supabase-offices.js', 'utf8');
ok(/p_used_for_settlements/.test(sb), 'hosted save_office sends p_used_for_settlements');

const migPath = 'supabase/migrations/20261125310000_office_used_for_settlements.sql';
const backPath = 'supabase/rollbacks/20261125310000_office_used_for_settlements.sql';
ok(existsSync(migPath) && existsSync(backPath), 'FF-102 migration and rollback files exist');
const mig = readFileSync(migPath, 'utf8');
const back = readFileSync(backPath, 'utf8');
ok(/NOT APPLIED/.test(mig), 'migration is marked not applied');
ok(/p_used_for_settlements/.test(mig) && /private\.is_admin/.test(mig), 'migration extends save_office for Admin only');
ok(/enable row level security/.test(mig) && /revoke insert, update, delete/.test(mig), 'migration protects direct table writes');
ok(!/add column used_for_settlements/i.test(mig), 'migration does not re-add the column (FF-101d owns that)');
ok(!/off-towson/.test(mig) && !/off-rockville/.test(mig) && !/off-bethesda/.test(mig), 'migration does not re-seed Towson/Rockville/Bethesda');
ok(/20261125300000/.test(mig), 'migration requires FF-101d first');
ok(/drop function if exists public\.save_office\(.*boolean\)/.test(back.replace(/\s+/g, ' ')) || /p_used_for_settlements/.test(mig), 'rollback restores prior save_office');
ok(!/drop column used_for_settlements/.test(back), 'rollback leaves the FF-101d column in place');

const md5 = (s) => createHash('md5').update(s).digest('hex');
console.log('ff-102-migration-md5', md5(mig));
console.log('ff-102-rollback-md5', md5(back));

console.log(fail ? fail + ' failed' : 'ff-102 admin offices passed');
if (fail) process.exit(1);
