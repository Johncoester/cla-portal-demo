/* Spouse section, extra parcel IDs, and earnest on the order. Fake data only. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { parcelList } from '../js/data/parcels.js';
import { toText } from '../js/ui.js';
import { spouseSectionHtml } from '../js/pages/spouse.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const section = toText(spouseSectionHtml({ participantId: 'p1', taskId: 't1', fullName: 'Ada Spouse', ssn: '***-**-1234' }, false));
ok(section.includes('Spouse information') && section.includes('Ada Spouse') && section.includes('data-spouse-ssn-input') && section.includes('***-**-1234'), 'the personal-information spouse section keeps the same fields');
ok(!readFileSync('js/app.js', 'utf8').includes("link('spouse'"), 'the sidebar does not link to a Spouse tab');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const made = await api.createDeal({ street: '4 Parcel Way', city: 'Miami', state: 'FL', zip: '33131', parcelId: 'PARCEL-1', parcelIds: ['PARCEL-1', 'PARCEL-2'], emdAmount: 5000, emdHeldBy: 'CLA Title', commissionBase: 10000, commissionPercent: 3, commissionPaidBy: 'seller' });
ok(made.parcelId === 'PARCEL-1' && made.parcelIds[1] === 'PARCEL-2', 'the first parcel stays the primary and the list is kept');
await api.updateDeal(made.id, { parcelId: 'PARCEL-9', parcelIds: ['PARCEL-9', 'PARCEL-2'], emdHeldBy: 'Listing brokerage', commissionBase: 10000, commissionPercent: 3, commissionPaidBy: 'seller' });
const again = await api.getDeal(made.id);
ok(again.parcelId === 'PARCEL-9' && parcelList(again).join(',') === 'PARCEL-9,PARCEL-2', 'editing the list updates the primary parcel');
ok(again.financial.emdHeldBy === 'Listing brokerage' && again.financial.commissionPaidBy === 'seller', 'earnest and commission stay on the order financial record');
const acct = readFileSync('js/pages/dealaccounting-contract.js', 'utf8');
ok(acct.includes('data-earnest-accounting') && acct.includes('emdHeldBy') && acct.includes('commissionPaidBy'), 'the accounting page edits the same earnest fields');

const sql = readFileSync('supabase/migrations/20261112060000_parcel_id_list.sql');
const roll = readFileSync('supabase/rollbacks/20261112060000_parcel_id_list.sql');
console.log('parcel-migration-sha256', createHash('sha256').update(sql).digest('hex'));
console.log('parcel-rollback-sha256', createHash('sha256').update(roll).digest('hex'));
console.log(fail ? fail + ' failed' : 'spouse parcel accounting passed');
if (fail) process.exit(1);
