/* FF-091 (Francis Santos, Nov 16 2026): Taxes & Fees documents. Amounts must match the vendored calculator.
 * Samples: Maryland (Baltimore City), Virginia (Fairfax), the District of Columbia, and Florida (Miami-Dade). No network. */
import { readFileSync } from 'node:fs';
import { closingDisclosure, altaStatement, cleanFee, calcFields, CALC_SOURCE_ID, isOverridden } from '../js/data/accounting.js';
import { vendoredTables } from '../js/data/fee-engine.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import {
  TAX_DOC_TYPES, defaultDocuments, exemptionAsks, taxesFeesSetup, worksheetProblem, proposeTaxesFees, diffTaxesFees, previewTaxesFees, savedWorksheet, locateForFees,
  RATE_NOT_SET, ENTERED_BY_HAND, manualAmountProblem, isGovernmentKey
} from '../js/data/taxes-fees.js';
import { addressOnFile } from '../js/data/fee-place.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.02;
const R = vendoredTables();
const purchase = (state, county, price, loan, extra = {}) => ({ state, county, transactionType: 'Purchase', purchasePrice: price, loanAmount: loan, primaryResidence: 'yes', firstTimeBuyer: 'no', ...extra });
const line = (P, key) => P.lines.find((l) => l.key === key);
const amount = (P, key) => { const l = line(P, key); return l ? l.amount : null; };

ok(TAX_DOC_TYPES.join('|') === 'Affidavit|Assignment of Mortgage or Lease|Deed|Deed of Trust|Lis Pendens|Power of Attorney|Release of Mortgage|UCC|Lease|Easement', 'the document list is the one Francis asked for');

const mdAsks = exemptionAsks(R, purchase('MD', 'Baltimore City', 325000, 315250));
ok(mdAsks.occ && mdAsks.fthb && /22,000/.test(mdAsks.occNote), 'Maryland shows primary residence and first-time buyer, and names the owner-occupied exemption');
ok(!exemptionAsks(R, purchase('VA', 'Fairfax', 700000, 560000)).occ && !exemptionAsks(R, purchase('FL', 'Miami-Dade', 400000, 320000)).fthb, 'Virginia and Florida hide exemptions the rate sheet does not use');
ok(!exemptionAsks(R, { state: 'MD', county: 'Montgomery', transactionType: 'Refinance', loanAmount: 250000 }).fthb, 'a refinance does not ask the first-time buyer question');

const financed = defaultDocuments(purchase('MD', 'Montgomery', 600000, 480000), mdAsks).map((d) => d.type);
ok(financed.join(',') === 'Deed,Deed of Trust', 'a purchase with a loan starts as a deed and a deed of trust');
const cash = defaultDocuments(purchase('MD', 'Montgomery', 600000, 0), mdAsks).map((d) => d.type);
ok(cash.join(',') === 'Deed', 'a purchase with no loan starts as a deed only');
const refiPay = defaultDocuments({ state: 'MD', county: 'Montgomery', transactionType: 'Refinance', loanAmount: 250000, payoffCount: 1 }, mdAsks).map((d) => d.type);
ok(refiPay.join(',') === 'Deed of Trust,Release of Mortgage', 'a refinance with a payoff starts as a deed of trust and a release');
const refiNone = defaultDocuments({ state: 'MD', county: 'Montgomery', transactionType: 'Refinance', loanAmount: 250000, payoffCount: 0 }, mdAsks).map((d) => d.type);
ok(refiNone.join(',') === 'Deed of Trust', 'a refinance with no payoff does not add a release');

const prefilled = defaultDocuments(purchase('MD', 'Baltimore City', 325000, 315250, { primaryResidence: 'yes', firstTimeBuyer: 'yes' }), mdAsks);
const deed0 = prefilled.find((d) => d.type === 'Deed');
const dot0 = prefilled.find((d) => d.type === 'Deed of Trust');
ok(deed0.occ === true && deed0.fthb === true && deed0.consideration === 325000 && deed0.pages === 3, 'the file\'s primary residence and first-time buyer prefill the deed');
ok(dot0.consideration === 315250 && dot0.pages === 30 && dot0.taxable === true, 'the deed of trust starts from the loan amount and 30 pages');
ok(defaultDocuments(purchase('MD', 'Baltimore City', 325000, 315250, { primaryResidence: 'no' }), mdAsks)[0].occ === false, 'Primary residence No on the file prefills the exemption as No');

const badPages = worksheetProblem({ documents: [{ type: 'Deed', pages: '3.5', consideration: '100', taxable: true }] }, purchase('MD', 'Montgomery', 100, 0));
ok(badPages && /whole number from 1 to 500/.test(badPages.message) && badPages.field === 'pages', 'a page count that is not a whole number is explained: ' + (badPages && badPages.message));
const badMoney = worksheetProblem({ documents: [{ type: 'Deed', pages: '3', consideration: 'abc', taxable: true }] }, purchase('MD', 'Montgomery', 100, 0));
ok(badMoney && /dollar amount/.test(badMoney.message), 'a consideration that is not an amount is explained');
const blank = worksheetProblem({ documents: [] }, purchase('MD', 'Montgomery', 100, 0));
ok(blank && /Add a document/.test(blank.message), 'calculating with no document is explained');

const city = purchase('MD', 'Baltimore City', 325000, 315250, { firstTimeBuyer: 'yes' });
const cityDocs = defaultDocuments(city, mdAsks).map((d) => d.type === 'Deed of Trust' ? { ...d, pages: 25, occ: false } : d);
const cityP = proposeTaxesFees(city, { documents: cityDocs }, R);
ok(near(amount(cityP, 'rec:Deed'), 60) && line(cityP, 'rec:Deed').paidBy === 'buyer', 'Baltimore City deed records for $60, paid by the borrower');
ok(near(amount(cityP, 'rec:Deed of Trust'), 115) && /not a principal residence/.test(line(cityP, 'rec:Deed of Trust').description), 'a deed of trust that is not a principal residence records for $115');
ok(near(amount(cityP, 'tax:State transfer tax'), 812.5) && line(cityP, 'tax:State transfer tax').paidBy === 'seller', 'Maryland first-time buyer state transfer tax is $812.50, paid by the seller');
ok(near(amount(cityP, 'tax:County transfer tax'), 4875) && line(cityP, 'tax:County transfer tax').paidBy === 'split', 'Baltimore City transfer tax is $4,875, split');
ok(near(amount(cityP, 'lien'), 55), 'Baltimore City lien certificate is $55');
ok(cityP.lines.every((l) => l.key === 'lien' || l.key.startsWith('rec:') || l.key.startsWith('tax:')), 'only recording fees, the lien certificate, and transfer / recordation taxes are returned');
ok(!cityP.lines.some((l) => /title policy|settlement fee|endorsement/i.test(l.description)), 'title premiums and CLA fees are not part of this calculation');

const occOn = proposeTaxesFees(city, { documents: defaultDocuments(city, mdAsks) }, R);
ok(near(amount(occOn, 'rec:Deed of Trust'), 60), 'a principal-residence deed of trust in Baltimore City records for $60');

const fairfax = purchase('VA', 'Fairfax', 700000, 560000);
const va = proposeTaxesFees(fairfax, { documents: defaultDocuments(fairfax, exemptionAsks(R, fairfax)) }, R);
ok(near(amount(va, 'tax:Grantor tax'), 700) && line(va, 'tax:Grantor tax').paidBy === 'seller', 'Fairfax grantor tax is $700, paid by the seller');
ok(near(amount(va, 'tax:State recordation tax (deed of trust)'), 1400), 'Fairfax deed of trust recordation tax is $1,400');
ok(near(amount(va, 'rec:Deed'), 50) && near(amount(va, 'rec:Deed of Trust'), 63), 'Fairfax recording fees are $50 and $63');

const dcDeal = purchase('DC', 'District of Columbia', 350000, 280000);
const dc = proposeTaxesFees(dcDeal, { documents: defaultDocuments(dcDeal, exemptionAsks(R, dcDeal)) }, R);
ok(near(amount(dc, 'tax:Deed transfer tax'), 3850) && line(dc, 'tax:Deed transfer tax').paidBy === 'seller', 'DC deed transfer tax under $400,000 is $3,850, paid by the seller');
ok(near(amount(dc, 'tax:Deed recordation tax'), 3850), 'DC deed recordation tax under $400,000 is $3,850');
ok(near(amount(dc, 'rec:Deed'), 30) && near(amount(dc, 'rec:Deed of Trust'), 155), 'DC recording fees are $30 and $155');

const flDeal = purchase('FL', 'Miami-Dade', 400000, 320000);
const fl = proposeTaxesFees(flDeal, { documents: defaultDocuments(flDeal, exemptionAsks(R, flDeal)) }, R);
ok(near(amount(fl, 'tax:Doc stamps on deed'), 2400) && line(fl, 'tax:Doc stamps on deed').paidBy === 'seller', 'Miami-Dade doc stamps on the deed are $2,400, paid by the seller');
ok(near(amount(fl, 'tax:Doc stamps on note'), 1120) && line(fl, 'tax:Doc stamps on note').paidBy === 'buyer', 'Miami-Dade doc stamps on the note are $1,120, paid by the borrower');
ok(near(amount(fl, 'tax:Intangible tax on mortgage'), 640), 'Miami-Dade intangible tax is $640');
const hills = purchase('FL', 'Hillsborough', 400000, 320000);
ok(taxesFeesSetup(hills, [], R, null).covered, 'Hillsborough is a known Florida county (REC-CALC-6 statewide rates)');
const hillsP = proposeTaxesFees(hills, { documents: defaultDocuments(hills, exemptionAsks(R, hills)) }, R);
ok(near(amount(hillsP, 'tax:Doc stamps on deed'), 2800) && near(amount(hillsP, 'tax:Doc stamps on note'), 1120) && near(amount(hillsP, 'tax:Intangible tax on mortgage'), 640), 'Hillsborough uses the Florida statewide doc stamps and intangible tax');
const cashFl = purchase('FL', 'Miami-Dade', 400000, 0);
const cashP = proposeTaxesFees(cashFl, { documents: defaultDocuments(cashFl, exemptionAsks(R, cashFl)) }, R);
ok(!cashP.lines.some((l) => l.key === 'tax:Doc stamps on note' || l.key === 'rec:Deed of Trust') && near(amount(cashP, 'tax:Doc stamps on deed'), 2400), 'a cash purchase charges the deed stamps and not the mortgage taxes');

const refi = { state: 'MD', county: 'Montgomery', transactionType: 'Refinance', loanAmount: 250000, payoffCount: 1 };
const refiDocs = defaultDocuments(refi, exemptionAsks(R, refi));
const refiP = proposeTaxesFees(refi, { documents: refiDocs, payoff: 100000 }, R);
ok(near(amount(refiP, 'rec:Release'), 50), 'Montgomery release records for $50');
ok(near(amount(refiP, 'tax:County recordation tax'), 1335), 'Montgomery refinance recordation tax on the new money is $1,335');
ok(refiP.warnings.some((w) => /original mortgagor affidavit/.test(w)), 'a Maryland refinance with a payoff keeps the original mortgagor note');
const vaRefi = { state: 'VA', county: 'Arlington', transactionType: 'Refinance', loanAmount: 350000, payoffCount: 0 };
const vaRefiP = proposeTaxesFees(vaRefi, { documents: defaultDocuments(vaRefi, exemptionAsks(R, vaRefi)), payoff: 0 }, R);
ok(near(amount(vaRefiP, 'tax:State recordation tax (deed of trust)'), 875), 'a Virginia refinance with no payoff keeps the full deed-of-trust recordation tax ($875)');

const untaxed = proposeTaxesFees(city, { documents: cityDocs.map((d) => ({ ...d, taxable: false })) }, R);
ok(!untaxed.lines.some((l) => l.key.startsWith('tax:')) && untaxed.lines.some((l) => l.key === 'rec:Deed'), 'marking the documents not taxable drops the taxes and still records the deed');

const affDoc = { type: 'Affidavit', pages: 2, consideration: 0, taxable: false, occ: true, fthb: false };
const affidavit = proposeTaxesFees(city, { documents: [...cityDocs, affDoc] }, R);
const affLine = line(affidavit, 'unset:Affidavit');
ok(!!affLine && affLine.rateNotSet && affLine.calculation === RATE_NOT_SET && affLine.amount === 0 && /Recording fee: Affidavit/.test(affLine.description) && affLine.cdLine && affLine.payee, 'an affidavit with no rate is a line that says Rate Not Set, with no invented amount');
ok(!affidavit.warnings.some((w) => /no recording fee on CLA's rate sheet/i.test(w)), 'the blank-amount warning is replaced by the Rate Not Set line');
ok(isGovernmentKey('unset:Affidavit') && affidavit.lines.some((l) => l.key === 'rec:Deed' && !l.rateNotSet), 'a priced deed stays a calculated recording fee');
const badHand = manualAmountProblem('abc', 'Affidavit');
ok(badHand && /dollar amount/.test(badHand.message) && /Leave it blank/.test(badHand.message) && badHand.field === 'manual', 'a fee that is not an amount says what to type: ' + (badHand && badHand.message));
ok(manualAmountProblem('', 'Affidavit') == null && manualAmountProblem('45.00', 'Affidavit') == null, 'a blank fee and a dollar amount are both allowed');
let refusedHand = '';
try { previewTaxesFees(city, { documents: [...cityDocs, affDoc], manual: { Affidavit: 'abc' } }, [], R); } catch (e) { refusedHand = e.message; }
ok(/dollar amount/.test(refusedHand), 'calculating with a fee that is not an amount is refused');
const typedView = previewTaxesFees(city, { documents: [...cityDocs, affDoc], manual: { Affidavit: '45.00' } }, [], R);
const typedRow = typedView.breakdown.find((r) => r.key === 'unset:Affidavit');
const plainView = previewTaxesFees(city, { documents: [...cityDocs, affDoc] }, [], R);
const buyerOf = (v) => v.breakdown.reduce((t, r) => t + r.borrowerAt + r.borrowerBefore, 0);
ok(typedRow && typedRow.rateNotSet && typedRow.enteredByHand && !typedRow.locked && near(typedRow.borrowerAt, 45) && near(buyerOf(typedView) - buyerOf(plainView), 45), 'a typed fee shows on the affidavit line, is marked entered by hand, and counts in the totals');
const blankRow = plainView.breakdown.find((r) => r.key === 'unset:Affidavit');
ok(blankRow && blankRow.rateNotSet && !blankRow.enteredByHand && blankRow.amount === 0, 'with no typed fee the line stays Rate Not Set');
const handFee = {
  id: 'hand-1', retired: false, source: CALC_SOURCE_ID, description: affLine.description, altaSection: affLine.altaSection, cdSection: affLine.cdSection, cdLine: affLine.cdLine,
  payee: affLine.payee, amount: 45, paidBy: 'buyer', split: { buyer: 45, seller: 0, lender: 0, other: 0 }, titlePrefix: false, timing: 'at', poc: false,
  calc: { key: affLine.key, fields: calcFields({ ...affLine, amount: 0, split: { buyer: 0, seller: 0, lender: 0, other: 0 } }), calculation: RATE_NOT_SET, at: '2026-11-17T00:00:00Z', inputs: {} }
};
ok(isOverridden(handFee), 'a saved manual amount differs from the empty rate, so a re-run can see it was entered by hand');
const kept = previewTaxesFees(city, { documents: [...cityDocs, affDoc] }, [handFee], R).breakdown.find((r) => r.key === 'unset:Affidavit');
ok(kept && kept.locked && kept.savedByHand && kept.enteredByHand && near(kept.amount, 45) && kept.calculation === RATE_NOT_SET, 'recalculating shows the saved manual amount and does not replace it');
ok(diffTaxesFees(affidavit, [handFee]).rows.find((r) => r.key === 'unset:Affidavit').status === 'overridden', 'applying a new calculation keeps the manual amount');
const replaced = previewTaxesFees(city, { documents: [...cityDocs, affDoc], replace: ['Affidavit'], manual: { Affidavit: '12.00' } }, [handFee], R).breakdown.find((r) => r.key === 'unset:Affidavit');
ok(replaced && !replaced.locked && near(replaced.borrowerAt, 12), 'choosing to replace the manual amount shows the new fee');
const dropped = proposeTaxesFees(city, { documents: cityDocs }, R);
ok(diffTaxesFees(dropped, [handFee]).rows.find((r) => r.key === 'unset:Affidavit').status === 'stale-overridden', 'removing the document still keeps a fee that was entered by hand');
const zeroFee = { ...handFee, id: 'hand-0', amount: 0, split: { buyer: 0, seller: 0, lender: 0, other: 0 }, calc: { ...handFee.calc, fields: calcFields({ ...affLine, amount: 0, split: { buyer: 0, seller: 0, lender: 0, other: 0 } }) } };
ok(!isOverridden(zeroFee) && diffTaxesFees(dropped, [zeroFee]).rows.find((r) => r.key === 'unset:Affidavit').status === 'retire', 'a Rate Not Set line with no amount comes off when the document is removed');

const unknown = taxesFeesSetup({ state: 'MD', county: 'Mongomery', transactionType: 'Purchase', purchasePrice: 100, loanAmount: 80 }, [], R, null);
ok(!unknown.covered && /couldn't find this county/.test(unknown.reason), 'a county that is not on the rate sheet is refused, same as the calculator');

const setup = taxesFeesSetup(city, [], R, { note: 'Rates from the saved copy', source: { label: 'saved', snapshot: '2026-11-16' } });
ok(setup.covered && setup.county === 'Baltimore City' && setup.documents.length === 2, 'setup for a known county returns the starting documents');

const savedFees = [{ calc: { at: '2026-11-16T12:00:00Z', inputs: { taxDocs: { documents: [{ type: 'Deed', pages: 9, consideration: 10, taxable: true, occ: false, fthb: false }], payoff: 0, assessed: 0 } } } }];
const again = taxesFeesSetup(city, savedFees, R, null);
ok(again.documents.length === 1 && again.documents[0].pages === 9 && again.documents[0].occ === false, 'a saved worksheet comes back, including an exemption the file does not have');
ok(savedWorksheet(savedFees).documents[0].type === 'Deed', 'the worksheet is read from the calculated fee');

const overridden = (() => {
  const l = line(cityP, 'rec:Deed');
  return {
    id: 'fee-1', retired: false, source: CALC_SOURCE_ID, description: l.description, altaSection: l.altaSection, cdSection: l.cdSection, cdLine: l.cdLine,
    payee: l.payee, amount: l.amount + 10, paidBy: l.paidBy, split: { ...l.split, buyer: l.split.buyer + 10 }, titlePrefix: false, timing: 'at', poc: false,
    calc: { key: l.key, fields: calcFields(l), at: '2026-11-16T00:00:00Z', inputs: {} }
  };
})();
const premium = { id: 'prem', retired: false, source: CALC_SOURCE_ID, description: "Lender's Title Policy", amount: 100, paidBy: 'buyer', split: { buyer: 100, seller: 0, lender: 0, other: 0 }, calc: { key: 'lendersPolicy', fields: {}, at: '2026-11-16T00:00:00Z' } };
const diff = diffTaxesFees(cityP, [overridden, premium]);
ok(diff.rows.find((r) => r.key === 'rec:Deed').status === 'overridden', 'a recording fee changed by hand is kept');
ok(!diff.rows.some((r) => r.key === 'lendersPolicy'), 'title premiums are not retired by a taxes and fees run');

const view = previewTaxesFees(fairfax, { documents: defaultDocuments(fairfax, exemptionAsks(R, fairfax)) }, [], R);
const grantor = view.breakdown.find((r) => r.key === 'tax:Grantor tax');
ok(grantor && near(grantor.sellerAt, 700) && grantor.borrowerAt === 0 && grantor.payee.includes('Fairfax'), 'each line shows the payee and who pays at closing');

const stored = cityP.lines.map((l, i) => ({ id: 'f' + i, retired: false, ...cleanFee({ ...l, kind: 'charge', timing: 'at', poc: false }, city) }));
const cd = closingDisclosure(city, stored);
const sectionE = cd.sections.find((s) => s.key === 'E');
ok(sectionE.rows.some((r) => /Recording fees/.test(r.description)) && sectionE.rows.some((r) => /transfer tax/i.test(r.description)), 'the lines land on Closing Disclosure section E, with recording fees on one line');
const alta = altaStatement(city, stored, 'combined');
const gov = alta.sections.find((s) => s.key === 'government');
ok(gov && gov.rows.some((r) => /Recording fees|transfer tax|recordation/i.test(r.description)), 'the same lines land on the ALTA settlement statement');

const page = readFileSync('js/pages/dealaccounting-charges.js', 'utf8');
const mock = readFileSync('js/data/mock-part-accounting.js', 'utf8');
const remote = readFileSync('js/data/supabase-accounting.js', 'utf8');
ok(page.includes('Add document') && page.includes('Calculate fees') && page.includes('getTaxesFeesSetup') && page.includes('applyTaxesFees'), 'Taxes & Fees on the charges page adds documents and calculates fees');
ok(page.includes('Rate Not Set') && page.includes(ENTERED_BY_HAND) && page.includes('Replace the amount entered by hand') && page.includes('data-tax-manual') && page.includes('data-tax-replace') && page.includes('data-rate-not-set') && page.includes('data-entered-by-hand'), 'the screen shows Rate Not Set, a place to type the fee, Entered by hand, and a choice to replace it');
ok(page.includes('addressOnFile(deal)') && !page.includes('deal.street && deal.city && deal.zip && deal.county'), 'a filled street, city, and ZIP is not treated as a missing property address');

// FF-095 (Francis Santos, Nov 17 2026, 2:12 PM ET). Processor 2 on TEST.
// MD-26-97386 stores county "Baltimore City" (a name, not an id) with the street, city, and ZIP filled.
const file97386 = { street: '315 South Calhoun Street', city: 'Baltimore City', state: 'MD', zip: '21223', county: 'Baltimore City', transactionType: 'Purchase', purchasePrice: 98000, loanAmount: 88000, primaryResidence: 'yes', firstTimeBuyer: 'yes' };
ok(addressOnFile(file97386), 'MD-26-97386 has the property address on the file');
const setup97386 = taxesFeesSetup(file97386, [], R, null);
ok(setup97386.covered && setup97386.county === 'Baltimore City' && !setup97386.countyNote, 'Baltimore City on the file is the county the rates use, and the screen does not ask for the address');
const calc97386 = proposeTaxesFees(file97386, { documents: defaultDocuments(file97386, exemptionAsks(R, file97386)) }, R);
ok(near(amount(calc97386, 'rec:Deed'), 60) && amount(calc97386, 'rec:Deed of Trust') > 0 && calc97386.lines.some((l) => l.key.startsWith('tax:') && l.amount > 0), 'Calculate on that Baltimore City file returns recording fees and a tax, not zeros');

// The same address with the county left blank. The ZIP is Baltimore City, not Baltimore County.
const blankCounty = { ...file97386, county: '' };
const located = locateForFees(blankCounty, R);
ok(located.countyFrom === 'zip' && located.deal.county === 'Baltimore City', 'a blank county uses ZIP 21223, which is Baltimore City, not Baltimore County');
const fromZip = taxesFeesSetup(blankCounty, [], R, null);
ok(fromZip.covered && fromZip.county === 'Baltimore City' && /ZIP 21223 is in Baltimore City/.test(fromZip.countyNote), 'Calculate still prices Baltimore City and says the county came from the ZIP');
const cityOnly = { ...file97386, county: '', zip: '' };
ok(locateForFees(cityOnly, R).countyFrom === 'city' && locateForFees(cityOnly, R).deal.county === 'Baltimore City', 'with no ZIP, the city Baltimore City is the county');
const cityBaltimore = { ...file97386, city: 'Baltimore', county: '' };
ok(locateForFees(cityBaltimore, R).deal.county === 'Baltimore City', 'city Baltimore plus ZIP 21223 is Baltimore City, not Baltimore County');
const savedCounty = { ...file97386, county: 'Baltimore County', city: 'Baltimore City' };
ok(taxesFeesSetup(savedCounty, [], R, null).county === 'Baltimore', 'a saved county wins: Baltimore County stays Baltimore, not Baltimore City');

// MD-26-97407 (Processor 2, Nov 17 2026, 1:17 PM ET): street, city, and ZIP are filled, county is blank, and the ZIP is in Florida.
const file97407 = { street: '6061 North Falls Circle Drive 407', city: 'Lauderhill', state: 'MD', zip: '33319', county: '', transactionType: 'Purchase', purchasePrice: 147000, loanAmount: 130000, primaryResidence: 'yes', firstTimeBuyer: 'no' };
ok(addressOnFile(file97407), 'a Florida street saved on a Maryland file still counts as an address on the file');
const mismatch = taxesFeesSetup(file97407, [], R, null);
ok(!mismatch.covered && /property address is on the file/.test(mismatch.reason) && /Broward County, FL/.test(mismatch.reason) && /Set the state to FL/.test(mismatch.reason) && !/add a complete property address/i.test(mismatch.reason) && !/couldn't find this county/.test(mismatch.reason), 'the county message names the ZIP\'s county and does not ask for the address again: ' + mismatch.reason);
let mismatchCalc = '';
try { proposeTaxesFees(file97407, { documents: defaultDocuments(file97407, exemptionAsks(R, file97407)) }, R); } catch (e) { mismatchCalc = e.message; }
ok(mismatchCalc === mismatch.reason, 'Calculate does not invent Maryland fees when the ZIP is in another state');
ok(mock.includes('applyTaxesFees') && mock.includes('attachTaxDocs') && remote.includes('applyTaxesFees') && remote.includes('attachTaxDocs'), 'mock and Supabase both save the worksheet on the calculated fee');

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const store = mem();
const api = createMockAdapter({ storage: store, sessionStorage: mem(), features: { accounting: true } });
await api.signInDev('u-admin');
const docs = [...defaultDocuments(purchase('MD', 'Montgomery', 485000, 388000), exemptionAsks(R, purchase('MD', 'Montgomery', 485000, 388000))), affDoc];
const first = await api.previewTaxesFees('deal-1', { documents: docs });
await api.applyTaxesFees('deal-1', { documents: docs }, { token: first.token, retireExamples: false });
const opened = await api.getAccounting('deal-1');
const gap = opened.entries.find((e) => e.calc && e.calc.key === 'unset:Affidavit');
ok(gap && gap.amount === 0 && gap.calc.calculation === RATE_NOT_SET && !gap.overridden, 'applying with no typed fee saves the line as Rate Not Set');
const beforeDebits = opened.totals.buyerDebits;
await api.updateAccountingFee(gap.id, { amount: '45.00', paidBy: 'buyer', split: null });
const api2 = createMockAdapter({ storage: store, sessionStorage: mem(), features: { accounting: true } });
await api2.signInDev('u-admin');
const reloaded = await api2.getAccounting('deal-1');
const savedHand = reloaded.entries.find((e) => e.calc && e.calc.key === 'unset:Affidavit');
ok(savedHand && near(savedHand.amount, 45) && savedHand.overridden && near(savedHand.split.buyer, 45) && near(reloaded.totals.buyerDebits - beforeDebits, 45), 'a manual amount saves, survives a reload, and counts in the buyer total');
const rerun = await api2.previewTaxesFees('deal-1', { documents: docs });
await api2.applyTaxesFees('deal-1', { documents: docs }, { token: rerun.token, retireExamples: false });
const keptFee = (await api2.getAccounting('deal-1')).entries.find((e) => e.calc && e.calc.key === 'unset:Affidavit');
ok(keptFee && near(keptFee.amount, 45), 'calculating again does not wipe the manual amount');
await api2.updateAccountingFee(keptFee.id, { amount: '60.00', paidBy: 'buyer', split: null });
const replacedFee = (await api2.getAccounting('deal-1')).entries.find((e) => e.calc && e.calc.key === 'unset:Affidavit');
ok(replacedFee && near(replacedFee.amount, 60) && replacedFee.overridden, 'choosing a new amount replaces the one entered by hand');
await api2.updateAccountingFee(replacedFee.id, { amount: '0.00', paidBy: 'buyer', split: null });
const cleared = (await api2.getAccounting('deal-1')).entries.find((e) => e.calc && e.calc.key === 'unset:Affidavit');
ok(cleared && cleared.amount === 0 && !cleared.overridden && cleared.calc.calculation === RATE_NOT_SET, 'clearing the manual amount returns the line to Rate Not Set');

console.log(fail ? fail + ' failed' : 'taxes and fees passed');
process.exit(fail ? 1 : 0);
