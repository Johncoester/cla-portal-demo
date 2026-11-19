/* FF-101d: settlement location picker uses offices.used_for_settlements (Towson, Rockville, Bethesda).
 * Fake data only. Migration is present and unapplied. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SAMPLE_OFFICES } from '../js/data/offices.js';
import { createMockAdapter, STORAGE_KEY } from '../js/data/mock-adapter.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const settlement = SAMPLE_OFFICES.filter((o) => o.usedForSettlements).map((o) => o.name).sort();
ok(settlement.join(',') === 'Bethesda,Rockville,Towson', 'sample seed marks Towson, Rockville and Bethesda for settlements');
ok(SAMPLE_OFFICES.filter((o) => !o.usedForSettlements).length >= 10, 'other public offices stay in the list but are not for settlements');

const storage = mem();
const api = createMockAdapter({ storage, sessionStorage: mem() });
await api.signInDev('u-proc');
const def = await api.getClosingOfficeDefault('deal-2');
ok(def.offices.length === 3 && def.offices.every((o) => ['Rockville', 'Bethesda', 'Towson'].includes(o.name)), 'the settlement picker lists only the three settlement offices');
ok(def.offices.every((o) => o.id.startsWith('off-')), 'picker rows come from the offices table ids');
ok(['off-rockville', 'off-bethesda', 'off-towson'].includes(def.officeId), 'the default is one of the settlement offices');

const slots = ['2027-07-15T10:00'];
const created = await api.createSettlementRequest('deal-2', { slots });
ok(created.officeId && ['off-rockville', 'off-bethesda', 'off-towson'].includes(created.officeId), 'a blank request defaults to a settlement office');

let refused = '';
try { await api.createSettlementRequest('deal-4', { slots, location: 'CLA Title office', officeId: 'off-annapolis' }); } catch (e) { refused = e.message; }
ok(/settlements/i.test(refused), 'a non-settlement office is refused for a new request');

const okPick = await api.createSettlementRequest('deal-4', { slots, location: 'CLA Title office', officeId: 'off-towson' });
ok(okPick.officeId === 'off-towson', 'Towson can be picked');

// Pending proposal with another office still shows its name.
const d = JSON.parse(storage.getItem(STORAGE_KEY));
d.closingProposals = d.closingProposals || [];
d.closingProposals.push({
  id: 'cp-old', dealId: 'deal-2', side: 'buyer', proposedBy: 'u-bagent', roleLabel: 'Buyer Agent',
  at: '2027-08-01T11:00', location: 'CLA Title office', officeId: 'off-annapolis', note: '', status: 'proposed', createdAt: '2026-11-18T12:00:00Z',
});
storage.setItem(STORAGE_KEY, JSON.stringify(d));
const api2 = createMockAdapter({ storage, sessionStorage: mem() });
await api2.signInDev('u-proc');
const proposals = await api2.listClosingProposals('deal-2');
const old = proposals.find((p) => p.id === 'cp-old');
ok(old && old.officeName.includes('Annapolis'), 'an existing pending proposal keeps showing its office');

const mig = readFileSync('supabase/migrations/20261125300000_settlement_office_flag.sql', 'utf8');
const back = readFileSync('supabase/rollbacks/20261125300000_settlement_office_flag.sql', 'utf8');
ok(/NOT APPLIED/.test(mig) && /used_for_settlements/.test(mig) && /off-towson/.test(mig) && /off-rockville/.test(mig) && /off-bethesda/.test(mig), 'migration adds the flag and seeds the three offices');
ok(/FF-102/.test(mig) && /20261125310000/.test(mig), 'migration notes FF-102 owns the Admin UI on the same column');
ok(/drop column used_for_settlements/.test(back) && /used_for_settlements/.test(back), 'rollback drops the flag and restores picker functions');
ok(!/delete from public\.offices/i.test(mig) && !/delete from public\.offices/i.test(back), 'neither file deletes office rows');

const md5 = (s) => createHash('md5').update(s).digest('hex');
console.log('ff-101d-migration-md5', md5(mig));
console.log('ff-101d-rollback-md5', md5(back));

console.log(fail ? fail + ' failed' : 'ff-101d settlement offices passed');
if (fail) process.exit(1);
