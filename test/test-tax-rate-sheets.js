/* FF-091c (Francis Santos, Nov 17 2026, 3:55 PM ET). Dollar examples from the rates already in the fee sheet.
 * Baltimore City, $200,000, owner-occupied: city transfer $2,670 and recordation $1,780 after the $22,000 exemption, then split.
 * A first-time buyer: state transfer tax $500, paid by the seller, and that line stays locked. */
import { TAX_RATE_SEED } from '../js/data/tax-rate-seed.js';
import { calculateRateSheet, questionsFor, RATE_NOT_SET } from '../js/data/tax-rate-calc.js';
import { cleanOptionalNumber, cleanPayer, cleanJurisdiction } from '../js/data/tax-rate-edit.js';
import { proposeTaxesFees, defaultDocuments, exemptionAsks } from '../js/data/taxes-fees.js';
import { vendoredTables } from '../js/data/fee-engine.js';
import { readFileSync } from 'node:fs';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.02;
const R = vendoredTables();
const line = (rows, key) => rows.find((l) => l.key === key);

function sheetFor(deal, extra = {}) {
  const asks = exemptionAsks(R, deal);
  const documents = extra.documents || defaultDocuments(deal, asks);
  return proposeTaxesFees(deal, { documents, payoff: extra.payoff || 0, assessed: extra.assessed || 0, answers: extra.answers || {}, payers: extra.payers || {}, manual: extra.manual || {} }, R, null, TAX_RATE_SEED);
}
const purchase = (county, price, loan, extra = {}) => ({ state: 'MD', county, transactionType: 'Purchase', purchasePrice: price, loanAmount: loan, primaryResidence: 'yes', firstTimeBuyer: 'no', ...extra });

const city = sheetFor(purchase('Baltimore City', 200000, 160000), { answers: { ownerOccupied: true, firstTimeBuyer: false } });
const stateTax = line(city.lines, 'tax:State transfer tax');
const transfer = line(city.lines, 'tax:County transfer tax');
const recordation = line(city.lines, 'tax:County recordation tax');
ok(near(stateTax.amount, 1000) && stateTax.paidBy === 'split' && near(stateTax.split.buyer, 500) && near(stateTax.split.seller, 500), 'Baltimore City $200,000 state transfer tax is $1,000, split $500 / $500');
ok(near(transfer.amount, 2670) && transfer.paidBy === 'split' && near(transfer.split.buyer, 1335) && near(transfer.split.seller, 1335), 'owner-occupied city transfer tax is $2,670 after the $22,000 exemption, then split $1,335 / $1,335');
ok(near(recordation.amount, 1780) && recordation.paidBy === 'split' && near(recordation.split.buyer, 890) && near(recordation.split.seller, 890), 'owner-occupied recordation is $1,780 after the $22,000 exemption, then split $890 / $890');
ok(/less \$22,000 exemption/.test(transfer.calculation) && /then split/.test(transfer.calculation), 'the note shows the exemption coming off before the split');

const fthb = sheetFor(purchase('Baltimore City', 200000, 160000, { firstTimeBuyer: 'yes' }), { answers: { ownerOccupied: true, firstTimeBuyer: true } });
const fState = line(fthb.lines, 'tax:State transfer tax');
ok(near(fState.amount, 500) && fState.paidBy === 'seller' && fState.lawMandated, 'a first-time buyer\'s state transfer tax is $500, paid by the seller, and the line is locked');
ok(line(fthb.lines, 'tax:County transfer tax').paidBy === 'seller' && near(line(fthb.lines, 'tax:County transfer tax').amount, 2670), 'the rate sheet starts the city transfer tax with the seller for that buyer');

const moved = sheetFor(purchase('Baltimore City', 200000, 160000, { firstTimeBuyer: 'yes' }), { answers: { ownerOccupied: true, firstTimeBuyer: true }, payers: { 'County transfer tax': 'buyer', 'State transfer tax': 'buyer' } });
ok(line(moved.lines, 'tax:County transfer tax').paidBy === 'buyer' && near(line(moved.lines, 'tax:County transfer tax').amount, 2670), 'staff can move the city transfer tax to the buyer');
ok(line(moved.lines, 'tax:State transfer tax').paidBy === 'seller' && line(moved.lines, 'tax:State transfer tax').lawMandated, 'staff cannot move the state transfer tax off the seller');

let bad = '';
try { sheetFor(purchase('Baltimore City', 200000, 160000), { payers: { 'County transfer tax': 'half' } }); } catch (e) { bad = e.message; }
ok(/Choose Buyer pays, Seller pays, or 50\/50 split for County transfer tax/.test(bad), 'a payer that is not Buyer, Seller, or 50/50 is explained: ' + bad);

const cleared = JSON.parse(JSON.stringify(TAX_RATE_SEED));
const row = cleared.lines.find((l) => l.jurisdictionId === 'j-md-baltimore-city' && l.name === 'County transfer tax' && l.bracketFrom === 0);
row.rate = null;
const open = calculateRateSheet(cleared, { state: 'MD', county: 'Baltimore City', city: '', type: 'purchase', price: 200000, loan: 160000, payoff: 0, assessed: 0, documents: [{ type: 'Deed', pages: 3, occ: true }, { type: 'Deed of Trust', pages: 30, occ: true }], answers: { ownerOccupied: true, primaryResidence: true, firstTimeBuyer: false, contractPayer: '' }, payers: {}, manual: {} });
ok(open.pending.some((p) => p.name === 'County transfer tax') && open.warnings.some((w) => w.includes(RATE_NOT_SET)), 'a blank rate shows Rate Not Set and does not invent a number');
const typed = calculateRateSheet(cleared, { ...open && {}, state: 'MD', county: 'Baltimore City', city: '', type: 'purchase', price: 200000, loan: 160000, payoff: 0, assessed: 0, documents: [{ type: 'Deed', pages: 3, occ: true }], answers: { ownerOccupied: true, primaryResidence: true, firstTimeBuyer: false }, payers: { 'County transfer tax': 'seller' }, manual: { 'tax:County transfer tax': '10.00' } });
ok(near(line(typed.lines, 'tax:County transfer tax').amount, 10) && line(typed.lines, 'tax:County transfer tax').paidBy === 'seller', 'staff can type the fee when the rate is not set');

const qs = questionsFor(TAX_RATE_SEED, { state: 'MD', county: 'Baltimore City', city: '' }, 'purchase').map((q) => q.key);
for (const key of ['primary_residence', 'owner_occupied', 'first_time_buyer', 'mortgage_concurrent', 'other_exemption', 'contract_payer']) {
  ok(qs.includes(key), 'Baltimore City asks ' + key);
}
ok(!questionsFor(TAX_RATE_SEED, { state: 'VA', county: 'Fairfax', city: '' }, 'purchase').some((q) => q.key === 'first_time_buyer'), 'Virginia does not ask the first-time buyer question');

const calvert = sheetFor(purchase('Calvert', 200000, 160000));
ok(!calvert.lines.some((l) => l.key === 'tax:County transfer tax'), 'Calvert has no county transfer tax in the sheet, so none is invented');

const fallback = proposeTaxesFees(purchase('Baltimore City', 200000, 160000), { documents: defaultDocuments(purchase('Baltimore City', 200000, 160000), exemptionAsks(R, purchase('Baltimore City', 200000, 160000))) }, R);
ok(near(line(fallback.lines, 'tax:County transfer tax').amount, 2670), 'with no rate sheet loaded, the hardcoded calculator is still the fallback');

let rateMsg = '';
try { cleanOptionalNumber('abc', 'the rate'); } catch (e) { rateMsg = e.message; }
ok(/number/.test(rateMsg) && /Rate Not Set/.test(rateMsg), 'a rate that is not a number is explained and the blank is left for Rate Not Set');
ok(cleanOptionalNumber('', 'the rate') === null, 'a blank rate stays blank');
let payerMsg = '';
try { cleanPayer('half', 'County transfer tax'); } catch (e) { payerMsg = e.message; }
ok(/50\/50 split/.test(payerMsg), 'the split choices are named in the error');
let stateMsg = '';
try { cleanJurisdiction({ state: 'M', county: '', city: '', name: '' }); } catch (e) { stateMsg = e.message; }
ok(/two letters/.test(stateMsg), 'a state code that is not two letters is explained');

const page = readFileSync('js/pages/tax-rates.js', 'utf8');
const charges = readFileSync('js/pages/dealaccounting-charges.js', 'utf8');
ok(page.includes('Rate Not Set') && page.includes('Set by law') && page.includes('data-tax-rates-page'), 'the admin page edits rates and the locked split');
ok(charges.includes('Rate Not Set') && charges.includes('Who pays') && charges.includes('The law fixes'), 'Taxes & Fees shows Rate Not Set and locks a line the law fixes');
ok(readFileSync('supabase/migrations/20261125170000_tax_rate_sheets.sql', 'utf8').includes('private.is_staffish()') && readFileSync('supabase/migrations/20261125170000_tax_rate_sheets.sql', 'utf8').includes('private.is_admin()'), 'the database file lets staff read and only an admin write');

console.log(fail ? fail + ' failed' : 'tax rate sheets passed');
process.exit(fail ? 1 : 0);
