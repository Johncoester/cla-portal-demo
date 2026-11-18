/* FF-098 (Francis Santos, Nov 17 2026, 2:49 PM ET, Gmail 1a1eb0eb7ee40f0c, "Proration Amount").
 * A property-tax proration and a ground-rent proration have to land on the Closing Disclosure lines Qualia uses,
 * on the settlement statement, and on the fee ledger.
 *   Paid in advance: buyer is charged, seller is credited, sections K and M
 *     "Adjustments for Items Paid by Seller in Advance".
 *   Unpaid: buyer is credited, seller is charged, sections L and N.
 * Taxes use a 365-day year and the buyer pays for the settlement day, unless the file says otherwise.
 * Worked on a July 1, 2026 settlement, calendar year 2026 (365 days), bill $3,650.00:
 *   per diem $10.00. Seller has Jan 1 through June 30 (181 days) = $1,810.00.
 *   Buyer has July 1 through Dec 31 (184 days) = $1,840.00.
 * Ground rent $365.00 a year is $1.00 a day, so the buyer's 184 days are $184.00.
 * HOA $100.00 a month, settlement July 15, buyer pays that day: 17 buyer days = $55.89 (PRORATE-1).
 * Run: node test/test-proration-cd.js */
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { summaryScreens } from '../js/data/qualia-charges.js';
import { prorationBasis } from '../js/data/prorate-defaults.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const line = (rows, n) => (rows || []).find((r) => r.line === n);
const altaRow = (alta, desc) => alta.sections.flatMap((s) => s.rows).find((r) => r.description === desc);

const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await api.signInDev('u-proc');
const deal = await api.createDeal({ street: '100 Proration CD Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-06-01', closingDate: '2026-07-01',
  purchasePrice: '100000', loanAmount: '50000', emdAmount: '5000' });

const taxBase = { cycle: 'annual', cycleAmount: '3650', periodStart: '2026-01-01', basis: prorationBasis('installment', '365'), debitedTo: 'buyer', perDiemDp: 4, prorateUsing: 'installment', daysPerYear: '365' };
await api.addAccountingFee(deal.id, { kind: 'credit', altaSection: 'prorations', cdSection: '', description: 'County Taxes', presetKey: 'qtab:county', note: '',
  proration: { ...taxBase, item: 'countyTaxes', status: 'paid', tab: 'county', name: 'County Taxes' } });
await api.addAccountingFee(deal.id, { kind: 'credit', altaSection: 'prorations', cdSection: '', description: 'City/Town Taxes', presetKey: 'qtab:city', note: '',
  proration: { ...taxBase, item: 'cityTaxes', status: 'unpaid', tab: 'city', name: 'City/Town Taxes' } });
await api.addAccountingFee(deal.id, { kind: 'credit', altaSection: 'prorations', cdSection: '', description: 'Ground Rent Annual Fee', presetKey: 'qtab:groundRent', note: '',
  proration: { item: 'groundRent', cycle: 'annual', cycleAmount: '365', periodStart: '2026-01-01', basis: prorationBasis('perDiem', '365'), status: 'paid', debitedTo: 'buyer', perDiemDp: 4, tab: 'groundRent', prorateUsing: 'perDiem', daysPerYear: '365', name: 'Ground Rent Annual Fee' } });

const acc = await api.getAccounting(deal.id);
const X = await api.getAccountingCd(deal.id);
const cd = X.cd;
const scr = summaryScreens(deal, cd, acc.entries);
const k09 = line(scr.K, '09'); const m10 = line(scr.M, '10'); const k11 = line(scr.K, '11'); const m12 = line(scr.M, '12');
const l12 = line(scr.L, '12'); const n14 = line(scr.N, '14');
ok(k09 && k09.amount === 1840 && /County Taxes/.test(k09.label) && /07\/01\/2026 to 12\/31\/2026/.test(k09.label), 'paid county tax is K.09, $1,840.00, July 1 through Dec 31');
ok(m10 && m10.amount === 1840 && m10.entry && m10.entry.id === k09.entry.id, 'the same $1,840.00 is M.10, a credit to the seller');
ok(k11 && k11.amount === 184 && /Ground Rent/.test(k11.label) && /07\/01\/2026 to 12\/31\/2026/.test(k11.label), 'paid ground rent is the next K line, $184.00 for 184 days');
ok(m12 && m12.amount === 184, 'ground rent is also M.12, $184.00');
ok(l12 && l12.amount === 1810 && /City\/Town Taxes/.test(l12.label) && /01\/01\/2026 to 06\/30\/2026/.test(l12.label), 'unpaid city tax is L.12, $1,810.00, Jan 1 through June 30');
ok(n14 && n14.amount === 1810, 'the same $1,810.00 is N.14, a charge to the seller');
ok(line(scr.K, '08').amount === 0 && line(scr.K, '10').amount === 0, 'City/Town Taxes and Assessments on K stay blank when those prorations were not paid in advance');
ok(scr.totals.K === 102024 && scr.totals.L === 56810 && scr.totals.M === 102024 && scr.totals.N === 2210, 'K $102,024.00, L $56,810.00, M $102,024.00, N $2,210.00 (the $400.00 water escrow plus the unpaid tax)');
ok(cd.cashToClose === 45214 && cd.cashToSeller === 99814 && scr.totals.K - scr.totals.L === cd.cashToClose && scr.totals.M - scr.totals.N === cd.cashToSeller, 'cash to close is $45,214.00 and cash to the seller is $99,814.00');
ok(cd.summaries.K.rows.some((r) => r.amount === 1840 && r.group === 'advance') && cd.summaries.K.rows.some((r) => r.amount === 184 && r.group === 'advance'), 'the Closing Disclosure data puts both paid items in Adjustments for Items Paid by Seller in Advance');
ok(cd.summaries.L.rows.some((r) => r.amount === 1810 && r.group === 'unpaid') && cd.summaries.N.rows.some((r) => r.amount === 1810 && r.group === 'unpaid'), 'the unpaid tax is in Adjustments for Items Unpaid by Seller on L and N');

const alta = await api.getAltaStatement(deal.id, 'combined');
const county = altaRow(alta, 'County Taxes'); const ground = altaRow(alta, 'Ground Rent Annual Fee'); const city = altaRow(alta, 'City/Town Taxes');
ok(county && county.buyerDebit === 1840 && county.sellerCredit === 1840 && !county.buyerCredit && !county.sellerDebit, 'the settlement statement charges the buyer $1,840.00 and credits the seller');
ok(ground && ground.buyerDebit === 184 && ground.sellerCredit === 184, 'ground rent is a $184.00 charge to the buyer and credit to the seller');
ok(city && city.buyerCredit === 1810 && city.sellerDebit === 1810 && !city.buyerDebit && !city.sellerCredit, 'the unpaid tax credits the buyer $1,810.00 and charges the seller');
const ledger = acc.entries.filter((e) => e.proration).map((e) => `${e.description} ${e.amount} ${e.from}->${e.to}`).sort();
ok(ledger.join(' | ') === 'City/Town Taxes 1810 seller->buyer | County Taxes 1840 buyer->seller | Ground Rent Annual Fee 184 buyer->seller', 'the fee ledger has the three prorations with the buyer and seller each on the right side');

// Staff can charge the settlement day to the seller on this file. The saved choice stays.
const countyFee = acc.entries.find((e) => e.proration && e.proration.tab === 'county');
await api.updateAccountingFee(countyFee.id, { proration: { ...countyFee.proration, debitedTo: 'seller' }, description: 'County Taxes' });
const flipped = await api.getAccounting(deal.id);
const again = flipped.entries.find((e) => e.id === countyFee.id);
const scr2 = summaryScreens(deal, (await api.getAccountingCd(deal.id)).cd, flipped.entries);
ok(again.amount === 1830 && again.proration.debitedTo === 'seller' && again.from === 'buyer', 'charging the settlement day to the seller makes the paid county tax $1,830.00, and the file keeps that choice');
ok(line(scr2.K, '09').amount === 1830, 'K.09 shows the overridden $1,830.00');

// HOA, same 365-day rule, buyer pays the settlement day. July 15, 2026: 17 buyer days of a $100 month = $55.89.
const hoaDeal = await api.createDeal({ street: '200 HOA Proration Lane', city: 'Rockville', state: 'VA', zip: '20190', openDate: '2026-07-01', closingDate: '2026-07-15',
  purchasePrice: '100000', loanAmount: '50000', emdAmount: '5000' });
await api.addAccountingFee(hoaDeal.id, { kind: 'credit', altaSection: 'prorations', cdSection: '', description: 'HOA/Condo Fee', presetKey: 'qtab:hoa', note: '',
  proration: { item: 'hoa', cycle: 'monthly', cycleAmount: '100', periodStart: '2026-07-01', basis: prorationBasis('perDiem', '365'), status: 'paid', debitedTo: 'buyer', perDiemDp: 4, tab: 'hoa', prorateUsing: 'perDiem', daysPerYear: '365', name: 'HOA/Condo Fee' } });
const hoaAcc = await api.getAccounting(hoaDeal.id);
const hoaScr = summaryScreens(hoaDeal, (await api.getAccountingCd(hoaDeal.id)).cd, hoaAcc.entries);
const hoaLine = line(hoaScr.K, '11');
ok(hoaLine && hoaLine.amount === 55.89 && /HOA/.test(hoaLine.label) && line(hoaScr.M, '12').amount === 55.89, 'HOA $100 a month is $55.89 on K.11 and M.12');
ok(!hoaAcc.entries.some((e) => e.presetKey === 'waterEscrow'), 'this Virginia file has no water escrow, so the HOA amount is not mixed with one');

// The escrow deposit named Property taxes is section G. It is not a proration and does not fill K.09.
const escrowDeal = await api.createDeal({ street: '300 Escrow Not Proration Lane', city: 'Rockville', state: 'VA', zip: '20190', openDate: '2026-06-01', closingDate: '2026-07-01',
  purchasePrice: '147000', loanAmount: '130000', emdAmount: '2500' });
await api.addAccountingFee(escrowDeal.id, { kind: 'charge', description: 'Property taxes', altaSection: 'impounds', cdSection: 'G', cdLine: '03', amount: '3568', paidBy: 'buyer' });
const escAcc = await api.getAccounting(escrowDeal.id);
const escCd = await api.getAccountingCd(escrowDeal.id);
const escScr = summaryScreens(escrowDeal, escCd.cd, escAcc.entries);
ok(line(escScr.K, '09').amount === 0 && line(escScr.K, '08').amount === 0 && line(escScr.K, '03').amount === 3568, 'a section G property-tax escrow stays in closing costs (K.03) and leaves the proration lines blank');
ok(!escCd.cd.summaries.K.rows.some((r) => r.group === 'advance'), 'that escrow line is not an adjustment for an item paid by the seller in advance');

console.log(fail ? fail + ' failed' : 'proration CD lines passed');
process.exit(fail ? 1 : 0);
