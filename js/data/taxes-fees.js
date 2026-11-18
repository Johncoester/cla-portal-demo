/* FF-091 (Francis Santos, Nov 16 2026): documents to record on Taxes & Fees, and the recording / transfer-tax lines they produce.
 * Amounts come from the vendored CLA calculator (fee-engine.js → calc-core.js). This file does not copy rate tables.
 * The worksheet is saved on the calculated fee (calc_inputs.taxDocs), the same place the document counts already live. No new database file.
 * A county the rate sheet does not name still cannot be calculated. REC-CALC-6 (PR 296) widens that list; this file does not. */
import {
  proposeFees, diffProposal, previewView, defaultRecordingDocs, RECORDING_DOCS, calcTypeOf, countyOf, countyIsKnown,
  COUNTY_UNKNOWN, CALC_STATES, NO_OO, calculatorCore as C, isCalculated, isOverridden
} from './fee-engine.js?v=202611243300';
import { addressOnFile, textField, zipCounties } from './fee-place.js?v=202611242400';
import { calculateRateSheet, questionsFor } from './tax-rate-calc.js?v=202611244001';

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

export const RATE_NOT_SET = 'Rate Not Set';
export const ENTERED_BY_HAND = 'Entered by hand';
export const unsetKey = (type) => 'unset:' + type;
export const isGovernmentKey = (key) => key === 'lien' || String(key || '').startsWith('rec:') || String(key || '').startsWith('tax:') || String(key || '').startsWith('unset:');

// Francis Santos, Nov 17 2026, 3:55 PM ET (message 1a1eb4b8017fcabf).
// Order: figure the tax from the rate sheet, take exemptions off that total, then allocate.
// The jurisdiction default is the sheet's Paid By. Staff may change it for the executed contract.
// A line the law fixes stays locked. Maryland state transfer tax for a first-time buyer who will live there is one.
// The owner-occupant exemption comes off the total before that split. It is not taken from one side only.
export const OWNER_OCCUPANT_EXEMPTION_SIDE = 'exempted-total';
export const STATE_TRANSFER_LOCK = 'Maryland law keeps this with the seller. A first-time buyer who will live in the home pays none of the state transfer tax (Tax-Property 13-203). The contract cannot change it.';
export const TAX_PAYER_CHOICES = [['buyer', 'Buyer pays'], ['seller', 'Seller pays'], ['split', '50/50 split']];
const PAYER_LABEL = Object.fromEntries(TAX_PAYER_CHOICES);

const priceOf = (deal) => Number(deal && (deal.purchasePrice ?? deal.purchase_price)) || 0;
const loanOf = (deal) => Number(deal && (deal.loanAmount ?? deal.loan_amount)) || 0;
const residenceOf = (deal) => (deal && deal.primaryResidence) || '';
const normPayer = (raw) => {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (s === 'buyer' || s === 'borrower') return 'buyer';
  if (s === 'seller') return 'seller';
  if (s === 'split') return 'split';
  return '';
};

function blankDoc(type, deal, asks) {
  const residence = residenceOf(deal);
  const showOcc = !!(asks && asks.occ) && (type === 'Deed' || type === 'Deed of Trust');
  const showFthb = !!(asks && asks.fthb) && type === 'Deed';
  // The owner-occupant exemption applies only when the file says the buyer will live there.
  // The higher deed-of-trust recording fee applies only when the file says it is not a principal residence.
  const occ = type === 'Deed of Trust' ? residence !== 'no' : residence === 'yes';
  const fthb = showFthb && !!(deal && deal.firstTimeBuyer === 'yes' && residence === 'yes');
  return {
    type, pages: PAGES[type] || 3,
    consideration: type === 'Deed' ? priceOf(deal) : type === 'Deed of Trust' ? loanOf(deal) : 0,
    taxable: type === 'Deed' || type === 'Deed of Trust',
    occ: showOcc ? occ : true,
    fthb
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
  const occNote = occAmounts.length ? `Owner-occupied exemption on this county's rate sheet: the first $${Math.max(...occAmounts).toLocaleString('en-US')} comes off the total before the tax is split.` : (state === 'MD' ? 'In Maryland, a deed of trust that is not a principal residence records at the higher fee.' : '');
  let fthbNote = '';
  if (fthbRow) {
    const max = C.num(fthbRow['FTHB Max Price ($)']);
    fthbNote = (max ? `First-time buyer treatment applies at a price of $${max.toLocaleString('en-US')} or less, and the buyer must live in the home. ` : 'First-time buyer treatment needs the buyer to live in the home. ') + 'It changes the tax first. Who pays is the county default after that, unless the law fixes the line.';
  }
  return { occ, fthb, occNote, fthbNote };
}

const bracketHolds = (row, price) => {
  const from = C.num(row['Bracket From ($)']) || 0;
  const to = C.num(row['Bracket To ($)']);
  const hi = to == null ? Infinity : to;
  if (!(price > 0)) return from <= 0;
  return price + 1e-9 >= from && price <= hi + 1e-9;
};
const locksWhenFirstTime = (state, name) => String(state || '').toUpperCase() === 'MD' && /^state transfer tax$/i.test(String(name || '').trim());
const deedOf = (documents) => (documents || []).find((d) => d.type === 'Deed');
export const firstTimeHome = (documents) => { const deed = deedOf(documents); return !!(deed && deed.occ === true && deed.fthb === true); };

// One row per tax the rate sheet charges on a purchase. Amounts stay in the calculator. This only reads who pays.
export function taxAllocation(R, deal, documents) {
  const state = String((deal && deal.state) || '').toUpperCase();
  const type = calcTypeOf(deal || {});
  if (type === 'refi' || !CALC_STATES.includes(state)) return [];
  let rows = [];
  try { rows = C.pick(R.Transfer_Taxes, state, countyOf(R, deal || {}), type === 'cash' ? 'purchase' : type, (r) => r['Tax Name'] + '|' + r.Transaction); } catch (e) { rows = []; }
  const price = (() => { const deed = deedOf(documents); const n = deed && Number(deed.consideration); return n > 0 ? n : priceOf(deal); })();
  const byName = new Map();
  for (const row of rows) {
    const name = String(row['Tax Name'] || '').trim();
    if (!name) continue;
    const holds = bracketHolds(row, price);
    const prev = byName.get(name);
    if (prev && prev.holds && !holds) continue;
    const plain = normPayer(row['Paid By']);
    const firstTime = normPayer(row['FTHB Paid By']);
    const locked = locksWhenFirstTime(state, name);
    const rowInfo = { name, plain, firstTime, holds, locksWhenFirstTime: locked, lockReason: locked ? STATE_TRANSFER_LOCK : '' };
    if (prev && !prev.holds && holds) byName.set(name, rowInfo);
    else if (!prev) byName.set(name, rowInfo);
    else if (holds && prev.holds && plain && plain !== prev.plain) prev.plain = '';
  }
  return [...byName.values()].map(({ holds, ...rest }) => rest);
}

function payerFor(info, explicit, qualified) {
  if (info.locksWhenFirstTime && qualified) return { payer: 'seller', locked: true, from: 'law' };
  const picked = explicit && normPayer(explicit[info.name]);
  if (picked) return { payer: picked, locked: false, from: 'contract' };
  if (info.plain) return { payer: info.plain, locked: false, from: 'jurisdiction' };
  return { payer: '', locked: false, from: '' };
}

function payerProblem(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return { message: 'Choose Buyer pays, Seller pays, or 50/50 split for each tax.' };
  for (const [name, value] of Object.entries(raw)) {
    if (!name || name.length > 80) return { message: 'Choose a tax from this file.' };
    if (!normPayer(value)) return { message: `Choose Buyer pays, Seller pays, or 50/50 split for ${name}.`, name };
  }
  return null;
}

const halvesOf = (amount) => { const cents = Math.round((Number(amount) || 0) * 100); const buyer = Math.floor(cents / 2); return { buyer: buyer / 100, seller: (cents - buyer) / 100 }; };

function withPayer(line, how, from) {
  const amount = r2(line.amount);
  let paidBy, split;
  if (how === 'seller') { paidBy = 'seller'; split = { buyer: 0, seller: amount, lender: 0, other: 0 }; }
  else if (how === 'buyer') { paidBy = 'buyer'; split = { buyer: amount, seller: 0, lender: 0, other: 0 }; }
  else { const h = halvesOf(amount); paidBy = 'split'; split = { buyer: h.buyer, seller: h.seller, lender: 0, other: 0 }; }
  const base = String(line.description || '').replace(/ \([^)]*\)$/, '');
  const tag = how === 'seller' ? 'paid by seller' : how === 'buyer' ? 'paid by buyer' : 'split 50/50';
  const description = from === 'jurisdiction' ? line.description : `${base} (${tag})`;
  let calculation = line.calculation || '';
  if (from === 'contract') {
    const who = how === 'split' ? 'the buyer and the seller, 50/50' : `the ${how}`;
    calculation = calculation.replace(/Paid by [^.]*\(sheet "Paid By"[^)]*\)\./, `Paid by ${who}.`);
    calculation += ` Who pays was set to ${PAYER_LABEL[how]} from the executed contract on this file.`;
  }
  if (OWNER_OCCUPANT_EXEMPTION_SIDE === 'exempted-total' && /exemption/.test(calculation) && !/comes off the total before/.test(calculation)) calculation += ' The exemption comes off the total before it is split between the buyer and the seller.';
  return { ...line, description, paidBy, split, calculation };
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

const ANSWER_KEYS = {
  owner_occupied: 'ownerOccupied', primary_residence: 'primaryResidence', first_time_buyer: 'firstTimeBuyer',
  other_exemption: 'otherExemption', mortgage_concurrent: 'mortgageConcurrent', contract_payer: 'contractPayer'
};
function yn(v) {
  if (v === true || v === 'yes' || v === 'true') return true;
  if (v === false || v === 'no' || v === 'false') return false;
  return null;
}
function cleanAnswers(raw) {
  const a = raw && raw.answers && typeof raw.answers === 'object' ? raw.answers : {};
  const out = {};
  for (const [from, to] of Object.entries(ANSWER_KEYS)) {
    const v = a[to] != null ? a[to] : a[from];
    if (to === 'contractPayer') {
      if (v == null || v === '') continue;
      const p = String(v).toLowerCase();
      if (p !== 'buyer' && p !== 'seller' && p !== 'split') { const err = new Error('Choose Buyer pays, Seller pays, or 50/50 split for who pays under the contract.'); err.field = 'payer'; throw err; }
      out.contractPayer = p;
      continue;
    }
    const b = yn(v);
    if (b != null) out[to] = b;
  }
  return out;
}
function cleanPayers(raw) {
  const src = raw && raw.payers && typeof raw.payers === 'object' ? raw.payers : {};
  const out = {};
  for (const [name, want] of Object.entries(src)) {
    if (!want) continue;
    const p = String(want).toLowerCase();
    if (p !== 'buyer' && p !== 'seller' && p !== 'split') { const err = new Error(`Choose Buyer pays, Seller pays, or 50/50 split for ${name}.`); err.field = 'payer'; throw err; }
    out[name] = p;
  }
  return out;
}
function cleanManual(raw) {
  const src = raw && raw.manual && typeof raw.manual === 'object' ? raw.manual : {};
  const out = {};
  for (const [key, val] of Object.entries(src)) {
    if (val == null || val === '') continue;
    const text = moneyText(val);
    if (!/^\d+(\.\d{1,2})?$/.test(text)) { const err = new Error('Enter the fee as a dollar amount, like 250.00.'); err.field = 'manual'; throw err; }
    out[key] = r2(text);
  }
  return out;
}
function sheetInput(deal, clean, recorded) {
  const type = calcTypeOf(deal);
  const deed = clean.documents.find((d) => d.type === 'Deed');
  const dot = clean.documents.find((d) => d.type === 'Deed of Trust');
  const answers = clean.answers || {};
  const ownerOccupied = answers.ownerOccupied != null ? answers.ownerOccupied : (deed ? deed.occ : true);
  const primaryResidence = answers.primaryResidence != null ? answers.primaryResidence : (deed ? deed.occ : dot ? dot.occ : true);
  const documents = [];
  for (const [name, row] of Object.entries(recorded)) {
    if (!(row[0] > 0)) continue;
    const src = clean.documents.find((d) => CALC_DOC[d.type] === name);
    documents.push({ type: name, pages: row[1], occ: src ? src.occ !== false : true });
  }
  const price = type === 'refi' ? 0 : (deed && deed.taxable ? deed.consideration : priceOf(deal));
  const loan = type === 'cash' ? 0 : (dot && dot.taxable ? dot.consideration : loanOf(deal));
  return {
    state: String(deal.state || '').toUpperCase(), county: deal.county || '', city: textField(deal, 'city'), type,
    price, loan, payoff: clean.payoff, assessed: clean.assessed, documents,
    answers: { ...answers, ownerOccupied, primaryResidence, firstTimeBuyer: answers.firstTimeBuyer != null ? answers.firstTimeBuyer : !!(deed && deed.fthb) },
    payers: clean.payers || {}, manual: clean.manual || {}
  };
}

export function taxesFeesSetup(deal, fees, R, rate, bundle = null) {
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
  const savedPayers = saved && saved.payers && typeof saved.payers === 'object' && !Array.isArray(saved.payers) ? { ...saved.payers } : {};
  const base = {
    covered: false, reason: '', state, type, county: '', documents, types: TAX_DOC_TYPES, asks, taxes: [], payers: savedPayers,
    payoff, assessed, showPayoff: type === 'refi', showAssessed: state === 'VA' && type !== 'refi',
    fromOrder: { occ: deal && deal.primaryResidence ? deal.primaryResidence : '', fthb: deal && deal.firstTimeBuyer ? deal.firstTimeBuyer : '' },
    rateNote: rate && rate.note ? rate.note : '',
    countyNote: '',
    source: rate && rate.source ? { label: rate.source.label || '', snapshot: rate.source.snapshot || '' } : null
  };
  if (!CALC_STATES.includes(state)) return { ...base, questions: [], answers: {}, manual: {}, reason: `CLA rates cover MD, VA, DC and FL only (this order is in ${state || 'no state'}).` };
  if (!countyIsKnown(R, deal || {})) return { ...base, questions: [], answers: {}, manual: {}, reason: unknownReason(place) };
  const county = countyOf(R, deal || {});
  const qs = bundle ? questionsFor(bundle, { state, county, city: textField(deal, 'city') }, type) : [];
  const fileQuestions = qs.filter((q) => q.scope === 'file' && !['assessed', 'primary_residence', 'first_time_buyer', 'contract_payer', 'owner_occupied'].includes(q.key));
  return {
    ...base, covered: true, county, countyNote: countyNote(place),
    taxes: taxAllocation(R, deal, documents),
    questions: fileQuestions,
    answers: saved && saved.answers ? saved.answers : {},
    manual: saved && saved.manual ? saved.manual : {},
    rateNote: bundle ? `Rates for ${placeLabel(county, state)} come from the tax rate sheet. An Admin can change them on Tax rates.` : base.rateNote
  };
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
  const payer = payerProblem(raw.payers);
  if (payer) return { message: payer.message, field: 'payers', type: payer.name || '' };
  return null;
}

// FF-091a: a blank fee is not a dollar amount. Blank is allowed: the line stays "Rate Not Set" until someone types it.
export function manualAmountProblem(raw, type) {
  const text = moneyText(raw);
  if (raw == null || String(raw).trim() === '' || text === '') return null;
  const name = PLAIN[type] || 'recording';
  if (!/^\d+(\.\d{1,2})?$/.test(text) || Number(text) > 1e8) return { message: `Enter the ${name} fee as a dollar amount, like 45.00. Leave it blank if you do not have it yet.`, type, field: 'manual' };
  return null;
}

function handNumber(raw, type) {
  const problem = manualAmountProblem(raw, type);
  if (problem) { const err = new Error(problem.message); err.field = problem.field; err.docType = type; throw err; }
  const text = moneyText(raw);
  return raw == null || String(raw).trim() === '' || text === '' ? null : r2(text);
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
  return { documents, payoff, assessed, asks, answers: cleanAnswers(raw), payers: cleanPayers(raw), manual: cleanManual(raw) };
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
  const unrated = [];
  for (const d of documents) {
    const name = CALC_DOC[d.type];
    if (!name) { unrated.push(d); continue; }
    if (name === 'Deed of Trust' && type !== 'refi' && !(loan > 0)) {
      warnings.push('A deed of trust is recorded when the file has a loan. This file has no loan amount, so no deed of trust fee was calculated. Enter the loan on the file, or remove the deed of trust.');
      continue;
    }
    docs[name] = [1, d.pages];
  }
  return { docs, warnings, unrated };
}

const ZERO_SPLIT = { buyer: 0, seller: 0, lender: 0, other: 0 };
function recordingPayee(deal) {
  const state = String((deal && deal.state) || '').toUpperCase();
  const county = (deal && deal.county) || '';
  if (state === 'DC') return 'DC Recorder of Deeds';
  const place = /\bcity$/i.test(county) ? county : (county ? `${county} County` : state);
  return `Clerk of the Circuit Court, ${place}`;
}
function unsetLine(doc, payee) {
  return {
    key: unsetKey(doc.type), docType: doc.type, rateNotSet: true,
    description: `Recording fee: ${doc.type}`, altaSection: 'government', cdSection: 'E', cdLine: '',
    payee: String(payee || '').slice(0, 120), amount: 0, paidBy: 'buyer', split: { ...ZERO_SPLIT },
    titlePrefix: false, timing: 'at', poc: false, replacesPresets: [],
    rateSource: `CLA rates have no recording fee for ${named(doc.type)}`, calculation: RATE_NOT_SET
  };
}
function sameSide(fee, amount) {
  const sp = (fee && fee.split) || ZERO_SPLIT;
  const keys = ['buyer', 'seller', 'lender', 'other'].filter((k) => Number(sp[k]) > 0);
  const split = { ...ZERO_SPLIT };
  if (!keys.length || !(amount > 0)) { split.buyer = amount; return { split, timing: 'at', paidBy: 'buyer', amount }; }
  let used = 0; const cur = r2(keys.reduce((t, k) => t + Number(sp[k]), 0));
  keys.forEach((k, i) => { split[k] = i === keys.length - 1 ? r2(amount - used) : r2(Number(sp[k]) * amount / cur); used = r2(used + split[k]); });
  return { split, timing: (fee && fee.timing) || 'at', paidBy: keys.length === 1 ? keys[0] : 'split', amount };
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

export function proposeTaxesFees(deal, worksheet, R, source, bundle = null) {
  if (!deal) throw new Error('Order not found.');
  const place = locateForFees(deal, R);
  deal = place.deal;
  if (!countyIsKnown(R, deal)) throw new Error(unknownReason(place));
  const asks = exemptionAsks(R, deal);
  const raw = worksheet && Array.isArray(worksheet.documents) ? worksheet : { documents: defaultDocuments(deal, asks), payoff: 0, assessed: 0 };
  const clean = cleanWorksheet(raw, deal, asks);
  const type = calcTypeOf(deal);
  const { docs, warnings, unrated } = docsFor(deal, clean.documents);
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
  const allocation = taxAllocation(R, base, clean.documents);
  const qualified = firstTimeHome(clean.documents);
  const explicit = raw.payers && typeof raw.payers === 'object' && !Array.isArray(raw.payers) ? raw.payers : {};
  const usedPayers = {};
  const taxLinesPaid = taxLines.map((line) => {
    const name = line.key.slice(4);
    const info = allocation.find((t) => t.name === name);
    if (!info) return line;
    const choice = payerFor(info, explicit, qualified);
    if (!choice.payer) { const err = new Error(`Choose Buyer pays, Seller pays, or 50/50 split for ${name}.`); err.field = 'payers'; err.docType = name; throw err; }
    if (choice.locked) {
      let calculation = line.calculation || '';
      if (!calculation.includes('Tax-Property 13-203')) calculation += ' ' + STATE_TRANSFER_LOCK;
      return { ...line, calculation };
    }
    usedPayers[name] = choice.payer;
    return withPayer(line, choice.payer, choice.from);
  });
  const noRate = unrated.slice();
  for (const d of clean.documents) {
    const name = CALC_DOC[d.type];
    if (!name || noRate.some((x) => x.type === d.type)) continue;
    if (recP.warnings.some((w) => w.startsWith(`No recording fee found for ${name} in `))) noRate.push(d);
  }
  const payee = (recLines.find((l) => l.payee) || {}).payee || recordingPayee(base);
  const unsetLines = noRate.map((d) => unsetLine(d, payee));
  const lines = [...recLines, ...unsetLines, ...taxLinesPaid];
  let n = 0;
  for (const x of lines) x.cdLine = String(++n).padStart(2, '0');
  if (deed && deed.taxable && !(deed.consideration > 0)) warnings.push('The deed is marked taxable and the consideration is $0.00, so no transfer or recordation tax was calculated on the deed.');
  if (dot && dot.taxable && !(dot.consideration > 0)) warnings.push('The deed of trust is marked taxable and the consideration is $0.00, so no tax was calculated on the loan.');
  if (!sale && !(type === 'refi' && dot && dot.taxable && dot.consideration > 0) && !loanOn && clean.documents.length) warnings.push('No taxable deed or deed of trust with a consideration, so no transfer or recordation tax was calculated.');
  const ratedGap = (w) => noRate.some((d) => { const name = CALC_DOC[d.type]; return name && w.startsWith(`No recording fee found for ${name} in `); });
  const merged = [...recP.warnings, ...taxP.warnings, ...warnings].filter((w) => keepWarn(w) && !ratedGap(w));
  const uniq = [...new Set(merged)];
  const stored = { documents: clean.documents, payoff: clean.payoff, assessed: clean.assessed, answers: clean.answers, payers: usedPayers, manual: clean.manual };
  if (bundle) {
    const sheet = calculateRateSheet(bundle, sheetInput(base, clean, docs));
    if (sheet) {
      const pendingLines = (sheet.pending || []).map((p) => ({
        key: 'unset:' + p.name, docType: p.name, rateNotSet: true,
        description: p.name, altaSection: 'government', cdSection: 'E', cdLine: '',
        payee: String(p.payee || '').slice(0, 120), amount: 0, paidBy: p.defaultPayer || 'buyer', split: { buyer: 0, seller: 0, lender: 0, other: 0 },
        titlePrefix: false, timing: 'at', poc: false, replacesPresets: [], lawMandated: !!p.lawMandated,
        rateSource: 'Tax rate sheet', calculation: RATE_NOT_SET
      }));
      const lines = [...sheet.lines, ...unsetLines, ...pendingLines];
      let nSheet = 0;
      for (const x of lines) x.cdLine = String(++nSheet).padStart(2, '0');
      const mergedSheet = [...sheet.warnings, ...warnings].filter(keepWarn);
      const inputs = { type, state: String(base.state || '').toUpperCase(), county: base.county || '', price: priceOf(base), loan: loanOf(base), payoff: clean.payoff, assessed: clean.assessed, docs, taxDocs: stored, occ: taxOcc, fthb: taxFthb };
      return {
        inputs, lines, warnings: [...new Set(mergedSheet)], pending: [], source: { ...(source || {}), id: 'tax-rate-sheet', label: 'Tax rate sheet' },
        totals: { buyer: r2(lines.reduce((t, l) => t + ((l.split && l.split.buyer) || 0), 0)), seller: r2(lines.reduce((t, l) => t + ((l.split && l.split.seller) || 0), 0)) },
        summary: `${type === 'refi' ? 'Refinance' : 'Purchase'} · ${base.county || ''}, ${String(base.state || '').toUpperCase()}`
      };
    }
  }
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

export function previewTaxesFees(deal, worksheet, fees, R, source, bundle = null) {
  const P = proposeTaxesFees(deal, worksheet, R, source, bundle);
  const D = diffTaxesFees(P, fees);
  const view = previewView(P, D, { payoff: P.inputs.payoff, assessed: P.inputs.assessed, occ: P.inputs.occ, fthb: P.inputs.fthb, docs: P.inputs.docs });
  const status = Object.fromEntries(D.rows.map((r) => [r.key, r.status]));
  const replace = new Set(worksheet && Array.isArray(worksheet.replace) ? worksheet.replace : []);
  const manual = worksheet && worksheet.manual && typeof worksheet.manual === 'object' ? worksheet.manual : {};
  view.breakdown = P.lines.map((l) => {
    const row = { key: l.key, description: l.description, amount: l.amount, paidBy: l.paidBy, calculation: l.calculation, status: status[l.key] || 'new', rateNotSet: false, enteredByHand: false, locked: !!l.lawMandated, savedByHand: false, docType: l.docType || '', lawMandated: !!l.lawMandated, ...feeColumns(l) };
    if (!l.rateNotSet) return row;
    const cur = (fees || []).find((f) => f && !f.retired && isCalculated(f) && f.calc && f.calc.key === l.key);
    const saved = cur && Number(cur.amount) > 0 ? r2(cur.amount) : 0;
    const savedByHand = !!(cur && saved > 0 && isOverridden(cur));
    const locked = savedByHand && !replace.has(l.docType);
    let amount = locked ? saved : 0;
    let shown = locked ? cur : null;
    const raw = Object.prototype.hasOwnProperty.call(manual, l.docType) ? manual[l.docType] : undefined;
    if (!locked && raw != null && String(raw).trim() !== '') {
      amount = handNumber(raw, l.docType) || 0;
      shown = amount > 0 && cur ? sameSide(cur, amount) : null;
    } else if (!locked && savedByHand) { amount = saved; shown = cur; }
    const cols = shown ? feeColumns({ split: shown.split, timing: shown.timing, paidBy: shown.paidBy, amount: shown.amount || amount }) : feeColumns({ ...l, amount, paidBy: 'buyer', split: { ...ZERO_SPLIT, buyer: amount }, timing: 'at' });
    return { ...row, borrowerAt: cols.borrowerAt, borrowerBefore: cols.borrowerBefore, sellerAt: cols.sellerAt, sellerBefore: cols.sellerBefore, others: cols.others, amount, rateNotSet: true, docType: l.docType, enteredByHand: amount > 0, locked: locked || !!l.lawMandated, savedByHand, calculation: RATE_NOT_SET };
  });
  view.warnings = P.warnings;
  view.retire = D.rows.filter((r) => r.status === 'retire').map((r) => ({ key: r.key, description: r.current.description, amount: r.current.amount }));
  return view;
}

export { C as taxCalculator };
