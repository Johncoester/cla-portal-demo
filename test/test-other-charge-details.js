/* FF-094 follow-up: warranty, HOA, condo, and deferred figures are edited on Other Charges.
 * They use the columns already on the contract sheet. Fake orders only. */
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { blankContract, mergeOtherChargeDetails, otherChargeDetailsChanged } from '../js/data/contract-terms.js';
import { otherChargeDetailsHtml } from '../js/pages/dealaccounting-charges.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const stored = { fields: { ...blankContract('d').fields, salePrice: 485000, sellerCreditAmount: 2000, taxLevy: 3200, emdAmount: 10000, warrantyCap: 500 }, flags: { warrantyCap: { basis: 'explicit', provisional: true, source: 'page 4' }, taxLevy: { basis: 'historical', provisional: true, source: 'bill' } } };
const merged = mergeOtherChargeDetails(stored, {
  warrantyCap: '1500.00', warrantyPayer: 'Seller', hoaName: 'Maple Ridge HOA (fake)', hoaMonthly: '85', hoaCertificateBalance: '120.50', hoaCertificateAsOf: '2026-11-01',
  condoName: 'Oak Condo (fake)', condoMonthly: '', condoCertificateBalance: '', condoCertificateAsOf: '', deferredAmount: '400', deferredSchedule: 'per year', deferredPayee: 'City',
});
ok(merged.fields.salePrice === 485000 && merged.fields.sellerCreditAmount === 2000 && merged.fields.taxLevy === 3200 && merged.fields.emdAmount === 10000, 'the other stored figures stay');
ok(merged.fields.warrantyCap === 1500 && merged.fields.warrantyPayer === 'Seller' && merged.fields.hoaName === 'Maple Ridge HOA (fake)' && merged.fields.hoaMonthly === 85 && merged.fields.hoaCertificateBalance === 120.5 && merged.fields.hoaCertificateAsOf === '2026-11-01', 'warranty and HOA figures are kept');
ok(merged.fields.condoName === 'Oak Condo (fake)' && merged.fields.condoMonthly == null && merged.fields.deferredAmount === 400 && merged.fields.deferredSchedule === 'per year' && merged.fields.deferredPayee === 'City', 'condo name and deferred figures are kept, and a blank condo due stays unknown');
ok(merged.flags.warrantyCap.basis === 'explicit' && merged.flags.warrantyCap.source === 'page 4' && merged.flags.taxLevy.source === 'bill' && merged.flags.hoaCertificateBalance.basis === 'historical', 'an existing marker stays, and a certificate balance is marked historical');
ok(otherChargeDetailsChanged(stored, merged), 'a real edit is a change');
const same = mergeOtherChargeDetails(merged, { warrantyCap: '1500', warrantyPayer: 'Seller', hoaName: 'Maple Ridge HOA (fake)', hoaMonthly: '85', hoaCertificateBalance: '120.50', hoaCertificateAsOf: '2026-11-01', condoName: 'Oak Condo (fake)', condoMonthly: '', condoCertificateBalance: '', condoCertificateAsOf: '', deferredAmount: '400', deferredSchedule: 'per year', deferredPayee: 'City' });
ok(!otherChargeDetailsChanged(merged, same), 'saving the same figures again is not a change');
const cleared = mergeOtherChargeDetails(merged, { warrantyCap: '', warrantyPayer: '', hoaName: '', hoaMonthly: '', hoaCertificateBalance: '', hoaCertificateAsOf: '', condoName: '', condoMonthly: '', condoCertificateBalance: '', condoCertificateAsOf: '', deferredAmount: '', deferredSchedule: '', deferredPayee: '' });
ok(cleared.fields.warrantyCap == null && !cleared.flags.warrantyCap && cleared.flags.taxLevy && cleared.fields.salePrice === 485000, 'clearing a figure drops its marker and leaves the tax levy');
let bad = '';
try { mergeOtherChargeDetails(stored, { warrantyCap: 'nope', warrantyPayer: '', hoaName: '', hoaMonthly: '', hoaCertificateBalance: '', hoaCertificateAsOf: '', condoName: '', condoMonthly: '', condoCertificateBalance: '', condoCertificateAsOf: '', deferredAmount: '', deferredSchedule: '', deferredPayee: '' }); }
catch (e) { bad = e.message; }
ok(/Warranty cap must be blank or an amount/.test(bad), 'a warranty cap that is not an amount is refused');
let badDate = '';
try { mergeOtherChargeDetails(stored, { warrantyCap: '', warrantyPayer: '', hoaName: '', hoaMonthly: '', hoaCertificateBalance: '', hoaCertificateAsOf: '2026-02-31', condoName: '', condoMonthly: '', condoCertificateBalance: '', condoCertificateAsOf: '', deferredAmount: '', deferredSchedule: '', deferredPayee: '' }); }
catch (e) { badDate = e.message; }
ok(/HOA certificate date/.test(badDate), 'a certificate date that is not a real date is refused');

const shown = toText(otherChargeDetailsHtml({ fields: merged.fields, canEdit: true }, true));
for (const label of ['Warranty cap', 'Warranty payer', 'HOA name', 'HOA dues / month', 'HOA certificate balance', 'HOA certificate date', 'Condo association', 'Condo dues / month', 'Condo certificate balance', 'Condo certificate date', 'Deferred charge amount', 'Deferred schedule', 'Deferred payee']) {
  ok(shown.includes(label), 'Other Charges shows ' + label);
}
ok(shown.includes('data-save-details') && shown.includes('value="1500.00"') && shown.includes('Maple Ridge HOA (fake)'), 'the saved figures are in the boxes');
const locked = toText(otherChargeDetailsHtml({ fields: merged.fields, canEdit: false }, false));
ok(locked.includes('disabled') && !locked.includes('data-save-details') && locked.includes('Read only'), 'a reader sees the figures and cannot change them');
const blocked = toText(otherChargeDetailsHtml({ blocked: 'Warranty, HOA, condo, and deferred figures are not on this database yet. Nothing was saved.', fields: {} }, true));
ok(blocked.includes('data-details-blocked') && !blocked.includes('name="warrantyCap"'), 'a missing sheet says so and does not offer empty boxes');

const adapter = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await adapter.signInDev('u-proc');
const before = await adapter.getDeal('deal-1');
await adapter.saveContractTerms('deal-1', { salePrice: '485000', salePriceBasis: 'explicit', emdAmount: String(before.emdAmount || ''), taxLevy: '3200', taxLevyBasis: 'historical' });
const saved = await adapter.saveOtherChargeDetails('deal-1', { warrantyCap: '900', warrantyPayer: 'Buyer', hoaName: 'Maple Ridge HOA (fake)', hoaMonthly: '85', hoaCertificateBalance: '', hoaCertificateAsOf: '', condoName: '', condoMonthly: '', condoCertificateBalance: '', condoCertificateAsOf: '', deferredAmount: '50', deferredSchedule: 'per year', deferredPayee: 'City' });
const again = await adapter.getContractTerms('deal-1');
const deal = await adapter.getDeal('deal-1');
ok(saved.saved === true && again.fields.warrantyCap === 900 && again.fields.hoaName === 'Maple Ridge HOA (fake)' && again.fields.deferredPayee === 'City', 'Other Charges writes the warranty, HOA, and deferred figures');
ok(again.fields.salePrice === 485000 && again.fields.taxLevy === 3200 && deal.purchasePrice === before.purchasePrice && deal.loanAmount === before.loanAmount && deal.emdAmount === before.emdAmount, 'the sale price, tax levy, order price, loan, and earnest money stay');
let refused = '';
try { await adapter.saveOtherChargeDetails('deal-1', { warrantyCap: '1.234', warrantyPayer: 'Buyer', hoaName: 'Maple Ridge HOA (fake)', hoaMonthly: '85', hoaCertificateBalance: '', hoaCertificateAsOf: '', condoName: '', condoMonthly: '', condoCertificateBalance: '', condoCertificateAsOf: '', deferredAmount: '50', deferredSchedule: 'per year', deferredPayee: 'City' }); }
catch (e) { refused = e.message; }
ok(/blank or an amount/.test(refused) && (await adapter.getContractTerms('deal-1')).fields.warrantyCap === 900, 'a refused amount leaves the stored warranty cap');
await adapter.signInDev('u-sp');
ok(await (async () => { try { await adapter.saveOtherChargeDetails('deal-1', { warrantyCap: '1' }); return false; } catch (e) { return /read-only/i.test(e.message); } })(), 'sales cannot save these figures');

console.log(fail ? fail + ' failed' : 'other charge details passed');
if (fail) process.exit(1);
