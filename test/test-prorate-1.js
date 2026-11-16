/* PRORATE-1 (Caroline Kim, Nov 16 2026, 2:18 PM ET, Gmail 1a1e5cced6d02205; John confirmed 2:50 PM ET; tracker row 322).
 * Taxes and HOA start on a 365-day year and the buyer pays the settlement day.
 * Water escrow on a new file: $400 MD and DC, $250 FL, none for VA. A saved amount is left alone.
 * Run: node test/test-prorate-1.js */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { computeProration } from '../js/data/prorations.js';
import { liveProration } from '../js/data/accounting.js';
import { paymentSummary } from '../js/data/qualia-charges.js';
import { defaultProrationDraft, prorationBasis, waterEscrowDefault, waterEscrowFeeInput } from '../js/data/prorate-defaults.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const tax = defaultProrationDraft('county', 'tax');
const hoa = defaultProrationDraft('hoa', 'basic');
ok(tax.daysPerYear === '365' && tax.debitedTo === 'buyer' && tax.prorateUsing === 'installment', 'a new tax proration keeps a 365-day year and charges the settlement day to the buyer');
ok(hoa.daysPerYear === '365' && hoa.debitedTo === 'buyer' && hoa.prorateUsing === 'perDiem' && hoa.cycle === 'monthly', 'a new HOA proration uses a 365-day year, per diem, and the buyer pays the settlement day');
ok(prorationBasis('perDiem', '365') === '365' && prorationBasis('perDiem', '360') === '360' && prorationBasis('installment', '365') === 'installment' && prorationBasis('installment', '360') === '360', 'per diem uses the year picked; installment keeps the days in the bill, and 360 keeps the 30/360 count');

const page = readFileSync(new URL('../js/pages/dealpayoffs.js', import.meta.url), 'utf8');
ok(page.includes('defaultProrationDraft') && page.includes('prorationBasis') && !/debitedTo:\s*'seller'/.test(page), 'Taxes & Prorations no longer hard-codes the settlement day to the seller');

const year = { item: 'countyTaxes', cycle: 'annual', cycleAmount: '3650', periodStart: '2026-01-01', basis: '365', status: 'unpaid', debitedTo: 'buyer' };
const buyerDay = computeProration(year, '2026-07-01');
const sellerDay = computeProration({ ...year, debitedTo: 'seller' }, '2026-07-01');
ok(buyerDay.perDiem === 10 && buyerDay.sellerDays === 181 && buyerDay.buyerDays === 184 && buyerDay.amount === 1810 && buyerDay.debitedTo === 'buyer', 'a 365-day year charges July 1 to the buyer: 181 seller days is $1,810.00');
ok(sellerDay.sellerDays === 182 && sellerDay.buyerDays === 183 && sellerDay.amount === 1820 && sellerDay.debitedTo === 'seller', 'staff can still charge the settlement day to the seller, and that saved choice is one day more');

const hoaBill = { item: 'hoa', cycle: 'monthly', cycleAmount: '100', periodStart: '2026-07-01', basis: prorationBasis(hoa.prorateUsing, hoa.daysPerYear), status: 'paid', debitedTo: hoa.debitedTo, daysPerYear: '365', prorateUsing: 'perDiem' };
const hoaCalc = computeProration(hoaBill, '2026-07-15');
ok(hoaCalc.annual === 1200 && hoaCalc.buyerDays === 17 && hoaCalc.sellerDays === 14 && hoaCalc.amount === 55.89 && hoaCalc.debitedTo === 'buyer' && hoaCalc.from === 'buyer', 'HOA $100 a month on a 365-day year: the buyer has July 15 through July 31, $55.89');
ok(computeProration({ ...hoaBill, basis: 'installment' }, '2026-07-15').amount !== hoaCalc.amount, 'that HOA amount is the 365-day year, not the days in the month alone');

const savedSeller = liveProration({ id: 'old', retired: false, amount: 1820, from: 'seller', to: 'buyer', description: 'County Taxes', proration: { ...year, debitedTo: 'seller', calc: { settlementDate: '2026-07-01', amount: 1820 } } }, { closingDate: '2026-07-01' });
ok(savedSeller.amount === 1820 && savedSeller.from === 'seller' && savedSeller.proration.debitedTo === 'seller' && !savedSeller.prorationStale, 'a file already saved with the seller paying the settlement day is not rewritten');

ok(waterEscrowDefault('MD') === 400 && waterEscrowDefault('md') === 400 && waterEscrowDefault('DC') === 400 && waterEscrowDefault('FL') === 250 && waterEscrowDefault('VA') === 0 && waterEscrowDefault('TX') === 0, 'water escrow is $400 for MD and DC, $250 for FL, and none for VA');
ok(waterEscrowFeeInput({ state: 'VA', transactionType: 'Purchase' }) === null && waterEscrowFeeInput({ state: 'MD', transactionType: 'Refinance' }) === null, 'Virginia and a refinance get no water escrow line');
const mdFee = waterEscrowFeeInput({ state: 'MD', transactionType: 'Purchase' });
ok(mdFee && mdFee.amount === 400 && mdFee.paidBy === 'seller' && mdFee.cdSection === 'H' && mdFee.altaSection === 'misc' && mdFee.presetKey === 'waterEscrow', 'the Maryland default is a $400 seller charge on CD section H');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await api.signInDev('u-proc');
const open = async (state, extra = {}) => api.createDeal({ street: '1 Water Lane', city: 'Test', state, zip: state === 'FL' ? '33131' : state === 'VA' ? '22201' : '20850', openDate: '2026-11-16', purchasePrice: '100000', loanAmount: '0', ...extra });
const lineOf = async (deal) => (await api.getAccounting(deal.id)).entries.find((e) => e.presetKey === 'waterEscrow' && !e.retired);

const md = await open('MD');
const mdLine = await lineOf(md);
ok(mdLine && mdLine.amount === 400 && mdLine.paidBy === 'seller', 'a new Maryland file has the $400 water escrow on the fee ledger');
const cd = await api.getClosingDisclosure(md.id);
const h = cd.sections.find((s) => s.key === 'H');
ok(h.rows.some((r) => r.description === 'Water escrow' && r.sellerAt === 400), 'the Closing Disclosure section H shows the $400 seller water escrow');
const alta = await api.getAltaStatement(md.id, 'combined');
const altaRow = alta.sections.find((s) => s.key === 'misc').rows.find((r) => r.description === 'Water escrow');
ok(altaRow && altaRow.sellerDebit === 400 && !altaRow.buyerDebit, 'the Settlement Statement shows the $400 as a seller debit');
const pay = paymentSummary((await api.getAccounting(md.id)).entries);
const hold = pay.rows.find((r) => r.description === 'Water escrow');
ok(hold && hold.method === 'holdback' && hold.amount === 400, 'the payment summary holds the water escrow (holdback), it is not cut as a check');

await api.updateAccountingFee(mdLine.id, { amount: '125' });
const kept = await lineOf(md);
ok(kept && kept.amount === 125, 'changing the amount on the file keeps $125.00 and does not put $400.00 back');
await api.retireAccountingFee(kept.id, true);
ok(!(await lineOf(md)), 'retiring the water escrow takes it off the statements and does not add a new default');

const dc = await lineOf(await open('DC', { street: '2 Water Lane', zip: '20001' }));
const fl = await lineOf(await open('FL', { street: '3 Water Lane' }));
const va = await lineOf(await open('VA', { street: '4 Water Lane' }));
const refi = await lineOf(await open('MD', { street: '5 Water Lane', transactionType: 'Refinance', purchasePrice: '', loanAmount: '80000' }));
ok(dc && dc.amount === 400 && fl && fl.amount === 250 && !va && !refi, 'DC is $400, Florida is $250, Virginia and a refinance have no line');

const old = await api.getAccounting('deal-1');
ok(!old.entries.some((e) => e.presetKey === 'waterEscrow' || /^water escrow$/i.test(e.description || '')), 'a file that was already open does not gain a water escrow');

const sql = readFileSync(new URL('../supabase/migrations/20261124120000_water_escrow_default.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../supabase/rollbacks/20261124120000_water_escrow_default.sql', import.meta.url), 'utf8');
ok(/when 'MD' then 400/.test(sql) && /when 'DC' then 400/.test(sql) && /when 'FL' then 250/.test(sql) && /after insert on public.deals/.test(sql) && !/update public\.deals/i.test(sql), 'the database file adds the same amounts only when a file is created');
ok(/drop trigger if exists deals_water_escrow/.test(rollback) && /drop function if exists private.seed_water_escrow/.test(rollback) && !/delete from public.accounting_fees/i.test(rollback), 'the rollback removes the automatic line and leaves saved amounts');

console.log(fail ? fail + ' failed' : 'prorate-1 passed');
process.exit(fail ? 1 : 0);
