/* FF-091 (Francis Santos, Nov 16 2026): documents to record on Taxes & Fees, and the recording / transfer-tax lines they produce.
 * Amounts come from the vendored CLA calculator (fee-engine.js → calc-core.js). This file does not copy rate tables.
 * The worksheet is saved on the calculated fee (calc_inputs.taxDocs), the same place the document counts already live. No new database file.
 * A county the rate sheet does not name still cannot be calculated. REC-CALC-6 (PR 296) widens that list; this file does not. */
import {
  proposeFees, diffProposal, previewView, defaultRecordingDocs, RECORDING_DOCS, calcTypeOf, countyOf, countyIsKnown,
  COUNTY_UNKNOWN, CALC_STATES, NO_OO, calculatorCore as C, isCalculated
} from './fee-engine.js?v=202611243009';
import { addressOnFile, textField, zipCounties } from './fee-place.js?v=202611242400';

export const TAX_DOC_TYPES = ['Affidavit', 'Assignment of Mortgage or Lease', 'Deed', 'Deed of Trust', 'Lis Pendens', 'Power of Attorney', 'Release of Mortgage', 'UCC', 'Lease', 'Easement'];
const CALC_DOC = { Deed: 'Deed', 'Deed of Trust': 'Deed of Trust', 'Release of Mortgage': 'Release', 'Power of Attorney': 'Power of Attorney' };
const PAGES = { Deed: 3, 'Deed of Trust': 30, 'Release of Mortgage': 3, 'Power of Attorney': 3 };
const PLAIN = {
  Affidavit: 'affidavit', 'Assignment of Mortgage or Lease': 'assignment of mortgage or lease', Deed: 'deed', 'Deed of Trust': 'deed of trust',
  'Lis Pendens': 'lis pendens', 'Power of Attorney': 'power of attorney', 'Release of Mortgage': 'release of mortgage', UCC: 'UCC', Lease: 'lease', Easement: 'easement'
};
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const moneyText = (raw) => String(raw == null ? '' : raw).replace(/[$,\s]/g, '');
const whole = (raw) => { const s = String(raw == null ? '' : raw).trim(); if (!/^\d+$/.test(s)) return null; const n = Number(s); return Number.isSafeInteger(n) ? n : null; };

export const isGovernmentKey = (key) => key === 'lien' || String(key || '').startsWith('rec:') || String(key || '').startsWith('tax:');

const fileExempt = (deal) => ({
  occ: !deal || deal.primaryResidence !== 'no',
  fthb: !!(deal && deal.firstTimeBuyer === 'yes')
});

const priceOf = (deal) => Number(deal && (deal.purchasePrice ?? deal.purchase_price)) || 0;
const loanOf = (deal) => Number(deal && (deal.loanAmount ?? deal.loan_amount)) || 0;

function blankDoc(type, deal, asks) {
  const file = fileExempt(deal);
  const showOcc = !!(asks && asks.occ) && (type === 'Deed' || type === 'Deed of Trust');
  const showFthb = !!(asks && asks.fthb) && type === 'Deed';
  return {
    type, pages: PAGES[type] || 3,
    consideration: type === 'Deed' ? priceOf(deal) : type === 'Deed of Trust' ? loanOf(deal) : 0,
    taxable: type === 'Deed' || type === 'Deed of Trust',
    occ: showOcc ? file.occ : true,
    fthb: showFthb ? file.fthb : false
  };
}

export function exemptionAsks(R, deal) {
  const state = String((deal && deal.state) || '').toUpperCase();
  const type = calcTypeOf(deal || {});
  const county = countyOf(R, deal || {});
  if (NO_OO.test(state) || !CALC_STATES.includes(state)) return { occ: false, fthb: false, occNote: '', fthbNote: '' };
  let rows = [];
  try { rows = C.pick(R.Transfer_Taxes, state, county, type === 'cash' ? 'purchase' : type, (r) => r['Tax Name'] + '|' + r.Transaction); } catch (e) { rows = []; }
  const occAmounts = rows.map((r) => C.num(r['Owner-Occ Exempt ($)']) || 0).filter((n) => n > 0);
  const fthbRow = rows.find((r) => C.num(r['FTHB Rate']) != null || (C.num(r['FTHB Exempt ($)']) || 0) > 0);
  const occ = state === 'MD' || state === 'DC' || occAmounts.length > 0;
  const fthb = type !== 'refi' && !!fthbRow;
  const occNote = occAmounts.length ? `Owner-occupied exemption on this county's rate sheet: the first $${Math.max(...occAmounts).toLocaleString('en-US')}.` : (state === 'MD' ? 'In Maryland, a deed of trust that is not a principal residence records at the higher fee.' : '');
  let fthbNote = '';
  if (fthbRow) {
    const max = C.num(fthbRow['FTHB Max Price ($)']);
    fthbNote = max ? `First-time buyer treatment applies at a price of $${max.toLocaleString('en-US')} or less, and the buyer must live in the home.` : 'First-time buyer treatment needs the buyer to live in the home.';
  }
  return { occ, fthb, occNote, fthbNote };
}

export function defaultDocuments(deal, asks) {
  const type = calcTypeOf(deal || {});
  const loan = loanOf(deal);
  const payoffCount = Number(deal && deal.payoffCount) || 0;
  const docs = [];
  if (type === 'refi') {
    docs.push(blankDoc('Deed of Trust', deal, asks));
    if (payoffCount > 0) docs.push(blankDoc('Release of Mortgage', deal, asks));
  } else {
    docs.push(blankDoc('Deed', deal, asks));
    if (loan > 0) docs.push(blankDoc('Deed of Trust', deal, asks));
  }
  return docs;
}

const newestCalc = (fees) => (fees || []).filter((f) => f && f.calc && f.calc.inputs).sort((a, b) => String(b.calc.at || '').localeCompare(String(a.calc.at || '')))[0];

export function savedWorksheet(fees) {
  const f = (fees || []).filter((x) => x && x.calc && x.calc.inputs && x.calc.inputs.taxDocs && Array.isArray(x.calc.inputs.taxDocs.documents)).sort((a, b) => String(b.calc.at || '').localeCompare(String(a.calc.at || '')))[0];
  return f ? f.calc.inputs.taxDocs : null;
}

/* "Baltimore City" stays the city. "Baltimore" and "Baltimore County" stay the county. A saved county wins.
 * A blank county uses the ZIP when that ZIP is in the file's state, then the city when the city is itself a county. */
export function locateForFees(deal, R) {
  const street = textField(deal, 'street');
  const city = textField(deal, 'city');
  const state = textField(deal, 'state').toUpperCase();
  const zip = textField(deal, 'zip');
  const savedCounty = textField(deal, 'county');
  let county = savedCounty;
  let countyFrom = savedCounty ? 'file' : '';
  const hits = zip ? zipCounties(zip) : [];
  const same = state ? hits.find((h) => h.state === state) : null;
  const otherHit = hits.find((h) => h.primary) || hits[0] || null;
  if (!county && same && countyIsKnown(R, { state, county: same.county })) {
    county = countyOf(R, { state, county: same.county });
    countyFrom = 'zip';
  }
  // A ZIP in another state means the address does not agree with the file. Do not guess the county from the city.
  const zipDisagrees = !!(otherHit && state && otherHit.state !== state && !same);
  if (!county && !zipDisagrees && city && state && countyIsKnown(R, { state, county: city })) {
    county = countyOf(R, { state, county: city });
    countyFrom = 'city';
  }
  const other = !county && zipDisagrees ? otherHit : null;
  return {
    deal: { ...(deal || {}), street, city, state: state || textField(deal, 'state'), zip, county },
    addressOnFile: addressOnFile({ street, city, zip }),
    savedCounty, countyFrom,
    other: other && other.state !== state ? other : null
  };
}

export function placeLabel(county, state) {
  const name = String(county || '').trim();
  const shown = /city$/i.test(name) || /^district of columbia$/i.test(name) ? name : (name ? name + ' County' : '');
  return [shown, String(state || '').trim()].filter(Boolean).join(', ');
}

export function countyGapReason(place) {
  const state = (place.deal && place.deal.state) || 'this file';
  const zip = place.deal && place.deal.zip;
  if (place.other) return `The property address is on the file, but the county is blank. ZIP ${zip} is in ${placeLabel(place.other.county, place.other.state)}, and this file is in ${state}. Set the state to ${place.other.state} or pick the county, then calculate again.`;
  return 'The property address is on the file, but the county is blank. Pick the county on the file, then calculate again.';
}

function countyNote(place) {
  if (!place || place.countyFrom === 'file' || !place.deal || !place.deal.county) return '';
  const where = placeLabel(place.deal.county, place.deal.state);
  if (place.countyFrom === 'zip') return `The county was blank on the file. ZIP ${place.deal.zip} is in ${where}, so these fees use that county.`;
  if (place.countyFrom === 'city') return `The county was blank on the file. The city is ${place.deal.city}, so these fees use ${where}.`;
  return '';
}

function unknownReason(place) {
  return place.addressOnFile && !place.savedCounty ? countyGapReason(place) : COUNTY_UNKNOWN;
}

export function taxesFeesSetup(deal, fees, R, rate) {
  const place = locateForFees(deal, R);
  deal = place.deal;
  const state = String((deal && deal.state) || '').toUpperCase();
  const type = calcTypeOf(deal || {});
  const asks = exemptionAsks(R, deal || {});
  const saved = savedWorksheet(fees);
  const last = newestCalc(fees);
  const payoff = saved && saved.payoff != null ? saved.payoff : (last && last.calc.inputs.payoff) || 0;
  const assessed = saved && saved.assessed != null ? saved.assessed : (last && last.calc.inputs.assessed) || 0;
  let documents = saved && saved.documents && saved.documents.length ? saved.documents.map((d) => ({ ...d })) : defaultDocuments({ ...deal, payoffCount: (deal && deal.payoffCount) || (type === 'refi' && Number(payoff) > 0 ? 1 : 0) }, asks);
  if (type === 'refi' && !saved && Number(payoff) > 0 && !documents.some((d) => d.type === 'Release of Mortgage')) documents = documents.concat([blankDoc('Release of Mortgage', deal, asks)]);
  const base = {
    covered: false, reason: '', state, type, county: '', documents, types: TAX_DOC_TYPES, asks,
    payoff, assessed, showPayoff: type === 'refi', showAssessed: state === 'VA' && type !== 'refi',
    fromOrder: { occ: deal && deal.primaryResidence ? deal.primaryResidence : '', fthb: deal && deal.firstTimeBuyer ? deal.firstTimeBuyer : '' },
    rateNote: rate && rate.note ? rate.note : '',
    countyNote: '',
    source: rate && rate.source ? { label: rate.source.label || '', snapshot: rate.source.snapshot || '' } : null
  };
  if (!CALC_STATES.includes(state)) return { ...base, reason: `CLA rates cover MD, VA, DC and FL only (this order is in ${state || 'no state'}).` };
  if (!countyIsKnown(R, deal || {})) return { ...base, reason: unknownReason(place) };
  return { ...base, covered: true, county: countyOf(R, deal || {}), countyNote: countyNote(place) };
}

export function worksheetProblem(raw, deal) {
  const docs = raw && Array.isArray(raw.documents) ? raw.documents : null;
  if (!docs || !docs.length) return { message: 'Add a document, then calculate the fees.', field: 'add' };
  const seen = new Set();
  for (const d of docs) {
    const type = d && d.type;
    if (!TAX_DOC_TYPES.includes(type)) return { message: 'Pick a document from the list.', field: 'add' };
    if (seen.has(type)) return { message: `The ${PLAIN[type]} is already added. Remove it before adding it again.`, type, field: 'add' };
    seen.add(type);
    const pages = whole(d.pages);
    if (pages == null || pages < 1 || pages > 500) return { message: `Enter a whole number from 1 to 500 for how many pages the ${PLAIN[type]} has.`, type, field: 'pages' };
    const taxable = d.taxable === true || d.taxable === 'yes' || d.taxable === 'true';
    const needsMoney = taxable && (type === 'Deed' || type === 'Deed of Trust');
    const text = moneyText(d.consideration);
    if (text === '' || text == null) {
      if (needsMoney) return { message: `Enter the consideration for the ${PLAIN[type]}. Use 0 if there is none.`, type, field: 'consideration' };
    } else if (!/^\d+(\.\d{1,2})?$/.test(text) || Number(text) > 1e8) return { message: `Enter the consideration for the ${PLAIN[type]} as a dollar amount, like 325000.00.`, type, field: 'consideration' };
  }
  const type = calcTypeOf(deal || {});
  if (type === 'refi' && raw.payoff != null && raw.payoff !== '' && !/^\d+(\.\d{1,2})?$/.test(moneyText(raw.payoff))) return { message: 'Enter the payoff as a dollar amount, like 180000.00. Use 0 if there is no payoff.', field: 'payoff' };
  if (raw.assessed != null && raw.assessed !== '' && !/^\d+(\.\d{1,2})?$/.test(moneyText(raw.assessed))) return { message: 'Enter the assessed value as a dollar amount, like 250000.00. Leave it blank if you do not have it.', field: 'assessed' };
  return null;
}

function cleanDoc(d) {
  const type = d.type;
  const taxable = d.taxable === true || d.taxable === 'yes' || d.taxable === 'true';
  const text = moneyText(d.consideration);
  const consideration = text === '' ? 0 : r2(text);
  const yes = (v, fallback) => (v === true || v === 'yes' || v === 'true' ? true : v === false || v === 'no' || v === 'false' ? false : fallback);
  return { type, pages: whole(d.pages), consideration, taxable, occ: yes(d.occ, true), fthb: yes(d.fthb, false) };
}

function cleanWorksheet(raw, deal, asks) {
  const problem = worksheetProblem(raw, deal);
  if (problem) { const err = new Error(problem.message); err.field = problem.field; err.docType = problem.type || ''; throw err; }
  const documents = raw.documents.map(cleanDoc);
  const payoff = raw.payoff == null || raw.payoff === '' ? 0 : r2(moneyText(raw.payoff));
  const assessed = raw.assessed == null || raw.assessed === '' ? 0 : r2(moneyText(raw.assessed));
  return { documents, payoff, assessed, asks };
}

function zeroDocs(type) {
  const out = defaultRecordingDocs(type, 0);
  for (const name of RECORDING_DOCS) out[name] = [0, out[name][1]];
  return out;
}

function docsFor(deal, documents) {
  const type = calcTypeOf(deal);
  const loan = loanOf(deal);
  const docs = zeroDocs(type);
  const warnings = [];
  for (const d of documents) {
    const name = CALC_DOC[d.type];
    if (!name) {
      warnings.push(`There is no recording fee on CLA's rate sheet for ${named(d.type)}. No amount was added. Type it on a line below if you have the fee.`);
      continue;
    }
    if (name === 'Deed of Trust' && type !== 'refi' && !(loan > 0)) {
      warnings.push('A deed of trust is recorded when the file has a loan. This file has no loan amount, so no deed of trust fee was calculated. Enter the loan on the file, or remove the deed of trust.');
      continue;
    }
    docs[name] = [1, d.pages];
  }
  return { docs, warnings };
}

const saleBasis = (line) => /sale price|assessed value/.test(line.calculation || '');
const loanBasis = (line) => /loan amount|new money/.test(line.calculation || '');

function dropTax(line, sale, loan) {
  if (!sale && !loan) return true;
  const saleHit = saleBasis(line);
  const loanHit = loanBasis(line);
  if (!sale && saleHit && !loanHit) return true;
  if (!loan && loanHit && !saleHit) return true;
  return false;
}

const keepWarn = (w) => !/premium|endorsement|owner's policy|homeowner/i.test(w);
const named = (type) => (type === 'UCC' ? 'a UCC' : (/^[aeiou]/i.test(PLAIN[type]) ? 'an ' : 'a ') + PLAIN[type]);

function readyDeal(deal, documents) {
  const type = calcTypeOf(deal);
  const next = { ...deal };
  const deed = documents.find((d) => d.type === 'Deed');
  const dot = documents.find((d) => d.type === 'Deed of Trust');
  if (type !== 'refi' && !(priceOf(next) > 0) && deed && deed.consideration > 0) next.purchasePrice = deed.consideration;
  if (type === 'refi' && !(loanOf(next) > 0) && dot && dot.consideration > 0) next.loanAmount = dot.consideration;
  return next;
}

export function proposeTaxesFees(deal, worksheet, R, source) {
  if (!deal) throw new Error('Order not found.');
  const place = locateForFees(deal, R);
  deal = place.deal;
  if (!countyIsKnown(R, deal)) throw new Error(unknownReason(place));
  const asks = exemptionAsks(R, deal);
  const raw = worksheet && Array.isArray(worksheet.documents) ? worksheet : { documents: defaultDocuments(deal, asks), payoff: 0, assessed: 0 };
  const clean = cleanWorksheet(raw, deal, asks);
  const type = calcTypeOf(deal);
  const { docs, warnings } = docsFor(deal, clean.documents);
  const base = readyDeal(deal, clean.documents);
  const deed = clean.documents.find((d) => d.type === 'Deed');
  const dot = clean.documents.find((d) => d.type === 'Deed of Trust');
  const recOcc = dot ? dot.occ : deed ? deed.occ : true;
  const taxOcc = (deed || dot) ? (deed || dot).occ : true;
  const taxFthb = deed ? deed.fthb : false;
  const shared = { docs, payoff: clean.payoff, assessed: clean.assessed };
  const recP = proposeFees(base, { ...shared, occ: recOcc, fthb: false }, R, source);
  const taxDeal = { ...base };
  if (type !== 'refi' && deed && deed.taxable && deed.consideration > 0) taxDeal.purchasePrice = deed.consideration;
  if (dot && dot.taxable && dot.consideration > 0 && type !== 'cash') taxDeal.loanAmount = dot.consideration;
  const taxP = proposeFees(taxDeal, { ...shared, occ: taxOcc, fthb: taxFthb }, R, source);
  const sale = !!(deed && deed.taxable && deed.consideration > 0);
  const loanOn = type === 'refi' ? !!(dot && dot.taxable && dot.consideration > 0) : !!(dot && dot.taxable && dot.consideration > 0 && (loanOf(base) > 0 || loanOf(deal) > 0));
  const recLines = recP.lines.filter((l) => l.key === 'lien' || l.key.startsWith('rec:'));
  const taxLines = taxP.lines.filter((l) => l.key.startsWith('tax:') && !dropTax(l, sale, type === 'refi' ? !!(dot && dot.taxable && dot.consideration > 0) : loanOn));
  const lines = [...recLines, ...taxLines];
  let n = 0;
  for (const x of lines) x.cdLine = String(++n).padStart(2, '0');
  if (deed && deed.taxable && !(deed.consideration > 0)) warnings.push('The deed is marked taxable and the consideration is $0.00, so no transfer or recordation tax was calculated on the deed.');
  if (dot && dot.taxable && !(dot.consideration > 0)) warnings.push('The deed of trust is marked taxable and the consideration is $0.00, so no tax was calculated on the loan.');
  if (!sale && !(type === 'refi' && dot && dot.taxable && dot.consideration > 0) && !loanOn && clean.documents.length) warnings.push('No taxable deed or deed of trust with a consideration, so no transfer or recordation tax was calculated.');
  const merged = [...recP.warnings, ...taxP.warnings, ...warnings].filter(keepWarn);
  const uniq = [...new Set(merged)];
  const stored = { documents: clean.documents, payoff: clean.payoff, assessed: clean.assessed };
  const inputs = { ...taxP.inputs, docs, taxDocs: stored, occ: taxOcc, fthb: !!taxP.inputs.fthb };
  return {
    inputs, lines, warnings: uniq, source: taxP.source,
    totals: { buyer: r2(lines.reduce((t, l) => t + (l.split.buyer || 0), 0)), seller: r2(lines.reduce((t, l) => t + (l.split.seller || 0), 0)) },
    summary: taxP.summary
  };
}

export function diffTaxesFees(proposal, fees) {
  const scoped = (fees || []).filter((f) => !isCalculated(f) || isGovernmentKey(f.calc.key));
  return diffProposal(proposal, scoped);
}

export function attachTaxDocs(block, proposal) {
  if (block && proposal && proposal.inputs && proposal.inputs.taxDocs) block.inputs = { ...block.inputs, taxDocs: proposal.inputs.taxDocs };
  return block;
}

export function feeColumns(line) {
  const sp = (line && line.split) || {};
  const before = line && line.timing === 'before';
  return {
    payee: (line && line.payee) || '',
    borrowerAt: before ? 0 : r2(sp.buyer || 0),
    borrowerBefore: before ? r2(sp.buyer || 0) : 0,
    sellerAt: before ? 0 : r2(sp.seller || 0),
    sellerBefore: before ? r2(sp.seller || 0) : 0,
    others: r2((Number(sp.lender) || 0) + (Number(sp.other) || 0))
  };
}

export function previewTaxesFees(deal, worksheet, fees, R, source) {
  const P = proposeTaxesFees(deal, worksheet, R, source);
  const D = diffTaxesFees(P, fees);
  const view = previewView(P, D, { payoff: P.inputs.payoff, assessed: P.inputs.assessed, occ: P.inputs.occ, fthb: P.inputs.fthb, docs: P.inputs.docs });
  const status = Object.fromEntries(D.rows.map((r) => [r.key, r.status]));
  view.breakdown = P.lines.map((l) => ({ key: l.key, description: l.description, amount: l.amount, paidBy: l.paidBy, calculation: l.calculation, status: status[l.key] || 'new', ...feeColumns(l) }));
  view.warnings = P.warnings;
  view.retire = D.rows.filter((r) => r.status === 'retire').map((r) => ({ key: r.key, description: r.current.description, amount: r.current.amount }));
  return view;
}

export { C as taxCalculator };
