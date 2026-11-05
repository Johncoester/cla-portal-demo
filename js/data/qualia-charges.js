/* qualia-charges.js : the Accounting tab laid out like QUALIA's Closing › Charges screens (John Coester, Nov 4 2026: "mimic everything that
 * you see in the accounting tab video and update our system ... keep everything the same for now"). Source: Francis Santos's 32-minute Qualia
 * screen recording; spec in /workspace/francis-videos/fees-cd/QUALIA-FEES-SPEC.md. PURE helpers: no storage, no network. TEST ONLY.
 *
 * The SAME fee ledger (accounting.js) still feeds the ALTA and the CD. This module adds Qualia's view of it:
 *  - CD section pages A B C E F G H (+ J Lender Credits, K/M and L/N Debits / Credits) with Qualia's labels, columns and line numbering
 *    (# | Description | Payee | Paid by Borrower At / Before Closing | Paid by Seller At / Before Closing | By Others; rows to 08; template rows);
 *  - per-line META (stored on the fee as `meta`, migration 40 `charge_meta`): payments (Check / Wire / Net Funded / Aggregate / Transfer /
 *    Holdback, payee, label, memo, mailing address, order transfer, holdback release note / date) and the section settings Qualia shows:
 *    A.01 Loan Amount % override, F # of months, F.03 prepaid interest per-diem calculation, G $ per month x # of months, E.01 recording types;
 *  - the CD text of a line (e.g. "Prepaid Interest ($53.42 per day from 11/30/26 to 12/01/26)", "Homeowner's Insurance Premium (12 mo.)").
 * WIRE INSTRUCTIONS: bank routing / account numbers are NEVER stored (the meta has no such keys; cleanMeta and the database refuse unknown keys). */
import { addMonths, isDate, mdy } from './prorations.js?v=202611051216';
const fail = (m) => { throw new Error(m); };
const c = (n) => Math.round((Number(n) || 0) * 100); const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const usd = (n) => (Number(n) < 0 ? '-' : '') + '$' + Math.abs(Number(n || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const s = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

// ---------------- sections (Qualia's left nav "Charges", in its order, with its letter chips) ----------------
// [key, chip, nav label, page title, kind]
export const QC_SECTIONS = [
  ['A', 'A', 'Origination Charges', 'Origination Charges', 'fee'],
  ['B', 'B', 'Did Not Shop For', 'Services Borrower Did Not Shop For', 'fee'],
  ['C', 'C', 'Did Shop For', 'Services Borrower Did Shop For', 'fee'],
  ['E', 'E', 'Taxes & Fees', 'Taxes and Other Government Fees', 'fee'],
  ['F', 'F', 'Prepaids', 'Prepaids', 'fee'],
  ['G', 'G', 'Escrow', 'Initial Escrow Payment at Closing', 'fee'],
  ['H', 'H', 'Other Charges', 'Other Charges', 'fee'],
  ['J', 'J', 'Lender Credits', 'Lender Credits', 'credits'],
  ['KM', 'K/M', 'Debits/Credits', 'Debits / Credits', 'summary'],
  ['LN', 'L/N', 'Debits/Credits', 'Credits / Debits', 'summary']];
export const QC_KEYS = QC_SECTIONS.map(([k]) => k);
export const qcSection = (k) => QC_SECTIONS.find(([x]) => x === k) || QC_SECTIONS[0];
export const FEE_SECS = ['A', 'B', 'C', 'E', 'F', 'G', 'H'];
// rows shown even when empty (Qualia: A/B/H 01-08, C 01-08 and more when used, E 01-05, F 01-05, G 01-08 with 08 = Aggregate adjustment)
export const MIN_ROWS = { A: 8, B: 8, C: 8, E: 5, F: 5, G: 8, H: 8 };
export const TEMPLATES = {
  A: { '01': '% of Loan Amount (Points)' },
  F: { '01': "Homeowner's Insurance Premium", '02': 'Mortgage Insurance Premium', '03': 'Prepaid Interest', '04': 'Property Taxes' },
  G: { '01': "Homeowner's insurance", '02': 'Mortgage insurance', '03': 'Property taxes', '08': 'Aggregate adjustment' } };
// ALTA section a new line in a CD section lands in (the ALTA keeps working from the same ledger)
export const ALTA_FOR = { A: 'loanCharges', B: 'otherLoanCharges', C: 'title', E: 'government', F: 'otherLoanCharges', G: 'impounds', H: 'misc' };
export const altaForLine = (sec, line, description = '') => (sec === 'F' && line === '03' ? 'loanCharges' : sec === 'H' && /commission/i.test(description) ? 'commission'
  : sec === 'H' && /title\s*-/i.test(description) ? 'title' : sec === 'B' && /^title\s*-/i.test(description) ? 'title' : ALTA_FOR[sec] || 'misc');

// ---------------- payments (Qualia's six options) ----------------
export const PAY_METHODS = [['check', 'Check'], ['wire', 'Wire'], ['netFunded', 'Net Funded'], ['aggregate', 'Aggregate'], ['transfer', 'Transfer'], ['holdback', 'Holdback']];
export const PAY_KEYS = PAY_METHODS.map(([k]) => k);
export const payLabel = (k) => (PAY_METHODS.find(([x]) => x === k) || [k, k])[1];
// labels seen in the video (Unclassified, Excluded, Vendors, Recording Fee, Insurance, Property Tax, Owner's Policy, Water Bill, HOW) + a few CLA ones
export const PAY_LABELS = ['Unclassified', 'Excluded', 'Vendors', 'Recording Fee', 'Taxes', 'Insurance', 'Property Tax', "Owner's Policy", "Lender's Policy", 'Commission', 'Water Bill', 'HOW', 'Payoff'];
export const FOR_BENEFIT = [['', 'Select party...'], ['buyer', 'Buyer / borrower'], ['seller', 'Seller'], ['lender', 'Lender'], ['other', 'Other']];
export const AGGREGATE_PAYEES = ['CLA Title & Escrow', 'Fidelity National Title Group'];
export const UNDERWRITER_PAYEE = 'Fidelity National Title Insurance Company';
export const SETTLEMENT_AGENT = 'CLA Title & Escrow';
// what Qualia preselects (from the frames: A / B / F.02 / F.03 / G net funded, C aggregate, E / F.01 / F.04 / H check, water escrow holdback)
export function defaultMethod(sec, line, description = '') {
  if (sec === 'H' && /escrow|holdback/i.test(description) && !/title/i.test(description)) return 'holdback';
  if (sec === 'H' && /owner'?s title/i.test(description)) return 'aggregate';
  if (sec === 'A' || sec === 'B' || sec === 'G') return 'netFunded';
  if (sec === 'C') return 'aggregate';
  if (sec === 'F') return line === '02' || line === '03' || /interest|mortgage insurance/i.test(description) ? 'netFunded' : 'check';
  return 'check';
}
export function defaultLabel(sec, line, description = '') {
  const d = description.toLowerCase();
  if (/recording/.test(d)) return 'Recording Fee'; if (sec === 'E') return 'Taxes';
  if (/owner'?s title/.test(d)) return "Owner's Policy"; if (/lender'?s title/.test(d)) return "Lender's Policy";
  if (/notary|abstract|search|courier|document/.test(d)) return 'Vendors';
  if (/insurance premium|homeowner/.test(d)) return 'Insurance'; if (/property tax/.test(d)) return 'Property Tax';
  if (/water/.test(d)) return 'Water Bill'; if (/warranty/.test(d)) return 'HOW'; if (/commission/.test(d)) return 'Commission'; if (/payoff/.test(d)) return 'Payoff';
  return 'Unclassified';
}
const PAY_FIELDS = ['payee', 'method', 'label', 'memo', 'amount', 'street', 'unit', 'intl', 'transferOrder', 'forBenefitOf', 'releaseNote', 'releaseDate', 'aggregatePayee'];
export const REC_TYPES = ['Deed', 'Mortgage', 'Release', 'Assignment', 'Power of Attorney', 'Other'];
const META_KEYS = ['payments', 'loanPct', 'months', 'perDiem', 'perMonth', 'recType', 'paidTo', 'group'];   // paidTo + group: H "HOA / Condo / Ground Rent / Payoffs" lines (migration 42)
export const META_GROUPS = ['hoaGr'];
const PD_KEYS = ['from', 'to', 'perDiem', 'rate', 'daysPerYear', 'decimals', 'paidBy'];
const amt2 = (v, label) => { const t = String(v).replace(/[$,\s]/g, ''); if (!/^\d+(\.\d{1,2})?$/.test(t) || Number(t) > 100000000) fail(`${label} must be an amount like 1,250.00.`); return r2(t); };
// validate the per-line meta (same rules in the mock adapter, the Supabase adapter and migration 40's trigger)
export function cleanMeta(meta) {
  if (meta == null || meta === '') return null;
  if (typeof meta !== 'object' || Array.isArray(meta)) fail('Line settings must be a set of named fields.');
  const out = {};
  for (const k of Object.keys(meta)) if (!META_KEYS.includes(k)) fail(`Unknown line setting: ${k}. (Wire instructions / bank details are never stored in the test portal.)`);
  if (meta.payments != null) {
    if (!Array.isArray(meta.payments) || meta.payments.length > 8) fail('Payments: at most 8 payees on one line.');
    out.payments = meta.payments.map((p, i) => {
      if (!p || typeof p !== 'object') fail('Payment: bad entry.');
      for (const k of Object.keys(p)) if (!PAY_FIELDS.includes(k)) fail(`Unknown payment field: ${k}. (Wire instructions / bank details are never stored in the test portal.)`);
      const method = p.method || 'check'; if (!PAY_KEYS.includes(method)) fail('Payment method must be Check, Wire, Net Funded, Aggregate, Transfer or Holdback.');
      const label = s(p.label, 40); if (label && !PAY_LABELS.includes(label)) fail('Payment label: pick one from the list.');
      const q = { payee: s(p.payee, 120), method, label: label || 'Unclassified' };
      if (p.amount != null && p.amount !== '') q.amount = amt2(p.amount, `Payment ${i + 1} amount`);
      const memo = s(p.memo, 200); if (memo) q.memo = memo;
      if (method === 'check') { const st = s(p.street, 120), u = s(p.unit, 40); if (st) q.street = st; if (u) q.unit = u; if (p.intl === true || p.intl === 'true') q.intl = true; }
      if (method === 'aggregate') { const a = s(p.aggregatePayee, 120); if (a) q.aggregatePayee = a; }
      if (method === 'transfer') { const o = s(p.transferOrder, 40); if (o) q.transferOrder = o; const fb = s(p.forBenefitOf, 10); if (fb && !FOR_BENEFIT.some(([x]) => x === fb)) fail('For benefit of: pick a party.'); if (fb) q.forBenefitOf = fb; }
      if (method === 'holdback') { const n = s(p.releaseNote, 300); if (n) q.releaseNote = n; const dt = s(p.releaseDate, 10); if (dt && !isDate(dt)) fail('Release date must be a date (YYYY-MM-DD).'); if (dt) q.releaseDate = dt; }
      return q; });
    if (!out.payments.length) delete out.payments;
  }
  if (meta.loanPct != null && meta.loanPct !== '') { const t = String(meta.loanPct).replace(/[%\s]/g, ''); if (!/^\d{1,2}(\.\d{1,3})?$|^100$/.test(t)) fail('Loan Amount % must be a percentage like 1 or 1.125.'); out.loanPct = Number(t); }
  if (meta.months != null && meta.months !== '') { const t = String(meta.months).trim(); if (!/^\d{1,3}$/.test(t) || Number(t) > 360) fail('# of months must be a whole number (0-360).'); out.months = Number(t); }
  if (meta.perMonth != null && meta.perMonth !== '') out.perMonth = amt2(meta.perMonth, '$ per month');
  if (meta.paidTo != null && meta.paidTo !== '') out.paidTo = s(meta.paidTo, 120);
  if (meta.group != null && meta.group !== '') { if (!META_GROUPS.includes(meta.group)) fail('Unknown line group.'); out.group = meta.group; }
  if (meta.recType != null && meta.recType !== '') { if (!REC_TYPES.includes(meta.recType)) fail('Recording type: pick one from the list.'); out.recType = meta.recType; }
  if (meta.perDiem != null) {
    const p = meta.perDiem; if (typeof p !== 'object' || Array.isArray(p)) fail('Per diem: bad settings.');
    for (const k of Object.keys(p)) if (!PD_KEYS.includes(k)) fail(`Unknown per diem field: ${k}.`);
    const q = {};
    for (const k of ['from', 'to']) if (p[k]) { if (!isDate(p[k])) fail(`Per diem ${k === 'from' ? 'from' : 'to'} date must be a date (YYYY-MM-DD).`); q[k] = p[k]; }
    if (q.from && q.to && q.to < q.from) fail('Prepaid interest: the "to" date is before the "from" date.');
    if (p.perDiem != null && p.perDiem !== '') { const t = String(p.perDiem).replace(/[$,\s]/g, ''); if (!/^\d+(\.\d{1,5})?$/.test(t) || Number(t) > 1000000) fail('Per diem must be an amount like 53.42.'); q.perDiem = Number(t); }
    if (p.rate != null && p.rate !== '') { const t = String(p.rate).replace(/[%\s]/g, ''); if (!/^\d{1,2}(\.\d{1,5})?$/.test(t)) fail('Interest rate must be a percentage like 6.5.'); q.rate = Number(t); }
    q.daysPerYear = [360, 365, 366].includes(Number(p.daysPerYear)) ? Number(p.daysPerYear) : p.daysPerYear == null || p.daysPerYear === '' ? 365 : fail('Days per year: 360, 365 or 366.');
    q.decimals = p.decimals == null || p.decimals === '' ? 2 : /^[0-5]$/.test(String(p.decimals)) ? Number(p.decimals) : fail('Per diem decimal places: 0 to 5.');
    q.paidBy = p.paidBy === 'seller' ? 'seller' : 'buyer';
    out.perDiem = q;
  }
  return Object.keys(out).length ? out : null;
}

// ---------------- section calculators (Qualia's settings) ----------------
// A.01 LOAN AMOUNT %: precalculated = A.01 amount / loan amount; whole number -> no decimals, else 3 decimals (trailing zeros dropped)
export const fmtPct = (n) => { if (n == null || !isFinite(n)) return ''; const t = Math.round(n * 1000) / 1000; return Number.isInteger(t) ? String(t) : String(Number(t.toFixed(3))); };
export function loanPct(amount, loan) { return loan > 0 ? (Number(amount) || 0) / loan * 100 : null; }
// F.03 PREPAID INTEREST: per diem = loan x rate / days-per-year, rounded to the decimal places; days = from -> to (Qualia: 11/30 to 12/01 = 1 day)
const D = (x) => Date.parse(x + 'T00:00:00Z');
export const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 86400000);
export const firstOfNextMonth = (d) => addMonths(d.slice(0, 8) + '01', 1);
export function prepaidInterest(pd = {}, loanAmount, defaults = {}) {
  const from = pd.from || defaults.from || null; const to = pd.to || (from ? firstOfNextMonth(from) : null);
  const rate = pd.rate ?? defaults.rate ?? null; const dpy = pd.daysPerYear || 365; const dec = pd.decimals ?? 2;
  const calcPerDiem = rate != null && loanAmount > 0 ? Math.round(loanAmount * rate / 100 / dpy * 10 ** dec) / 10 ** dec : null;
  const perDiem = pd.perDiem != null ? pd.perDiem : calcPerDiem; const overridden = pd.perDiem != null && pd.perDiem !== calcPerDiem;
  const days = from && to ? Math.max(0, daysBetween(from, to)) : 0;
  const amount = perDiem != null ? r2(perDiem * days) : 0;
  return { from, to, rate, daysPerYear: dpy, decimals: dec, calcPerDiem, perDiem, overridden, days, amount, fromDefaulted: !pd.from && !!from, toDefaulted: !pd.to && !!to,
    text: perDiem != null && from && to ? `${usd(perDiem)} per day from ${mdy(from).replace(/\/(\d\d)(\d\d)$/, '/$2')} to ${mdy(to).replace(/\/(\d\d)(\d\d)$/, '/$2')}` : '',
    calculation: perDiem == null ? 'Enter the interest rate (or a per diem) to calculate it.' : `${calcPerDiem != null ? `${usd(loanAmount)} × ${rate}% ÷ ${dpy} = ${calcPerDiem}/day` : 'per diem entered'}${overridden ? ` (user override ${perDiem})` : ''}; ${days} day${days === 1 ? '' : 's'} (${mdy(from)} to ${mdy(to)}) × ${perDiem} = ${usd(amount)}` };
}
// G: $ per month x # of months
export const escrowLine = (perMonth, months) => r2((Number(perMonth) || 0) * (Number(months) || 0));

// ---------------- recording fees (E.01 "Recording fees: Deed: $60.00 Mortgage: $60.00") ----------------
const REC_OF_KEY = { 'rec:Deed': 'Deed', 'rec:Deed of Trust': 'Mortgage', 'rec:Release': 'Release', 'rec:Power of Attorney': 'Power of Attorney' };
export function recTypeOf(e) {
  if (!e || e.kind !== 'charge' || e.cdSection !== 'E') return null;
  if (e.meta && e.meta.recType) return e.meta.recType;
  if (e.calc && REC_OF_KEY[e.calc.key]) return REC_OF_KEY[e.calc.key];
  if (e.presetKey === 'recordingDeed') return 'Deed'; if (e.presetKey === 'recordingMortgage') return 'Mortgage';
  return null;
}
export const recordingText = (rows) => 'Recording fees: ' + rows.map((r) => `${r.type}: ${usd(r.amount)}`).join(' ');

// ---------------- the CD text of a line ----------------
export function cdText(e, deal) {
  const m = e.meta || {}; let t = e.description;
  if (e.cdSection === 'A' && /% of Loan Amount \(Points\)$/i.test(t)) { const loan = Number(deal && (deal.loanAmount ?? deal.loan_amount)) || 0;
    const pct = m.loanPct != null ? m.loanPct : loanPct(e.amount, loan); if (pct != null && c(e.amount) > 0 || m.loanPct != null) t = `${fmtPct(pct)}% of Loan Amount (Points)`; }
  if (e.cdSection === 'F' && m.months != null && !/\(\s*\d*\s*mo\.\)/.test(t)) t = `${t} (${m.months} mo.)`;
  if (e.cdSection === 'F' && m.perDiem && !/per day/.test(t)) { const p = prepaidInterest(m.perDiem, Number(deal && (deal.loanAmount ?? deal.loan_amount)) || 0); if (p.text) t = `${t} (${p.text})`; }
  if (e.cdSection === 'G' && m.perMonth != null && !/per month/.test(t)) t = `${t} ${usd(m.perMonth)} per month for ${m.months ?? 0} mo.`;
  return t;
}

// ---------------- standard payees (order contacts + the order's county / state offices + CLA + the underwriter) ----------------
const STATE_NAME = { MD: 'Maryland', VA: 'Virginia', DC: 'the District of Columbia', FL: 'Florida', SC: 'South Carolina', DE: 'Delaware', PA: 'Pennsylvania' };
export function standardPayees(deal, extra = []) {
  const out = []; const add = (name, role) => { if (name && !out.some((x) => x.name === name)) out.push({ name, role }); };
  for (const e of extra || []) add(e.name, e.role);   // Other Contacts on the file (HOA, HOA Management Co., Utility Co., Ground Rent Leaseholder, payoff lenders)
  add(SETTLEMENT_AGENT, 'Settlement agent'); add(UNDERWRITER_PAYEE, 'Underwriter'); add('Fidelity National Title Group', 'Underwriter (aggregate payee)');
  if (deal) {
    if (deal.lenderName) add(deal.lenderName, 'Lender');
    for (const p of deal.participants || []) { const n = (p.entity && p.entity.name) || (p.contact ? `${p.contact.firstName || ''} ${p.contact.lastName || ''}`.trim() : ''); if (n && !/^Client-/.test(p.role)) add(n, p.role); }
    const county = deal.county || ''; const st = deal.state || '';
    if (county) { add(`${county} County`, 'Tax authority'); add(st === 'MD' || st === 'VA' ? `Clerk of the Circuit Court for ${county} County` : st === 'DC' ? 'DC Recorder of Deeds' : st === 'FL' ? `${county} County Clerk of Court` : `${county} County Recorder`, 'Recording office'); }
    if (STATE_NAME[st]) add(`State of ${STATE_NAME[st]}`, 'State tax');
  }
  add('Simplifile', 'E-recording');
  return out;
}
// payments as shown: the stored ones, or the defaults Qualia preselects (title premium lines: CLA portion + underwriter portion from the split)
export function paymentsFor(e, { uwSplitPct = null } = {}) {
  if (!e) return [];
  const m = e.meta || {}; if (m.payments && m.payments.length) return m.payments.map((p) => ({ ...p }));
  const sec = e.cdSection; const line = e.cdLine || ''; const method = defaultMethod(sec, line, e.description); const label = defaultLabel(sec, line, e.description);
  const premium = /title (policy|insurance)|title policy|lender's title|owner's title/i.test(e.description) || (e.calc && /Policy$/.test(e.calc.key || ''));
  if (premium && uwSplitPct != null && c(e.amount) > 0) { const uw = Math.round(c(e.amount) * uwSplitPct / 100) / 100; const cla = r2(e.amount - uw);
    return [{ payee: SETTLEMENT_AGENT, method: 'aggregate', aggregatePayee: SETTLEMENT_AGENT, label, amount: cla, defaulted: true },
      { payee: 'Fidelity National Title Group', method: 'aggregate', aggregatePayee: 'Fidelity National Title Group', label, amount: uw, defaulted: true }]; }
  const payee = String(e.payee || '').replace(/\s*\(via CLA Title & Escrow\)$/, '');
  return [{ payee, method, label, ...(method === 'aggregate' ? { aggregatePayee: /fidelity/i.test(payee) ? 'Fidelity National Title Group' : SETTLEMENT_AGENT } : {}), defaulted: true }];
}
// amounts of a line's payments: one payee = the whole line; several = as entered (the rest goes to the first payee)
export function paymentAmounts(e, list) {
  const total = c(e.amount); if (list.length <= 1) return list.map((p) => ({ ...p, amount: r2(total / 100) }));
  const fixed = list.slice(1).reduce((t, p) => t + c(p.amount), 0);
  return list.map((p, i) => ({ ...p, amount: i === 0 ? r2((total - fixed) / 100) : r2(p.amount) }));
}
export const paymentsBalanced = (e, list) => list.length <= 1 || list.reduce((t, p) => t + c(p.amount), 0) === c(e.amount);

// ---------------- a section page: rows 01..N with the CD's line numbers ----------------
// cd = closingDisclosure(deal, fees) (accounting.js): its rows already carry the CD line numbers (B / C alphabetical, TRID), E.01 recording merged.
export function sectionGrid(deal, cd, entries, key) {
  const S = cd.sections.find((x) => x.key === key) || { rows: [] }; const byId = Object.fromEntries((entries || []).map((e) => [e.id, e]));
  const rows = []; const taken = new Set();
  for (const r of S.rows) { const n = Number(r.line) || 0; const fee = byId[r.id] || null; const recording = r.recording ? r.recording.map((x) => ({ ...x, fee: byId[x.id] || null })) : null; const parts = r.parts ? r.parts.map((x) => ({ ...x, fee: byId[x.id] || null })) : null;
    rows.push({ line: r.line, id: r.id, fee, recording, parts, description: r.description, payee: r.payee, borrowerAt: r.borrowerAt, borrowerBefore: r.borrowerBefore, sellerAt: r.sellerAt, sellerBefore: r.sellerBefore, others: r.others,
      calculated: !!(fee && (fee.calc || String(fee.presetKey || '').startsWith('cdcalc:') || (fee.meta && (fee.meta.perDiem || fee.meta.perMonth != null)))) || !!recording, overridden: !!(fee && fee.overridden), reduces: r.reduces });
    taken.add(n); }
  const T = TEMPLATES[key] || {}; const max = Math.max(MIN_ROWS[key] || 8, ...rows.map((r) => Number(r.line) || 0));
  for (let n = 1; n <= max; n++) { const l = String(n).padStart(2, '0'); if (taken.has(n)) continue; rows.push({ line: l, id: null, fee: null, template: T[l] || null, description: T[l] || '', payee: '', borrowerAt: 0, borrowerBefore: 0, sellerAt: 0, sellerBefore: 0, others: 0 }); }
  rows.sort((a, b) => Number(a.line) - Number(b.line) || (a.id ? -1 : 1));
  const tot = (f) => r2(rows.reduce((t, r) => t + c(r[f]), 0) / 100);
  return { key, rows, totals: { borrowerAt: tot('borrowerAt'), borrowerBefore: tot('borrowerBefore'), sellerAt: tot('sellerAt'), sellerBefore: tot('sellerBefore'), others: tot('others') }, sectionTotal: r2(tot('borrowerAt') + tot('borrowerBefore')) };
}
// a patch for a typed cell: who pays what, at / before closing (this portal keeps ONE timing per line)
export const CELL_FIELDS = { borrowerAt: ['buyer', 'at'], borrowerBefore: ['buyer', 'before'], sellerAt: ['seller', 'at'], sellerBefore: ['seller', 'before'], others: ['other', null] };
export function cellPatch(fee, field, value) {
  const [payer, timing] = CELL_FIELDS[field] || fail('Unknown column.'); const v = String(value == null ? '' : value).replace(/[$,\s]/g, '');
  if (v !== '' && !/^\d+(\.\d{1,2})?$/.test(v)) fail('Type an amount like 1,250.00.');
  const n = v === '' ? 0 : r2(v); const sp = { buyer: 0, seller: 0, lender: 0, other: 0, ...((fee && fee.split) || {}) };
  const who = payer === 'other' && Number(sp.lender) > 0 ? 'lender' : payer; sp[who] = n;
  let t = fee ? fee.timing || 'at' : 'at';
  if (timing) { const others = ['buyer', 'seller', 'lender', 'other'].filter((k) => k !== who && Number(sp[k]) > 0);
    if (fee && t !== timing && others.length && n > 0) fail('This portal keeps one line either at closing or before closing. Put the other part on its own line.');
    if (n > 0) t = timing; }
  const amount = r2(['buyer', 'seller', 'lender', 'other'].reduce((x, k) => x + c(sp[k]), 0) / 100);
  const nonzero = ['buyer', 'seller', 'lender', 'other'].filter((k) => Number(sp[k]) > 0);
  return { amount: amount.toFixed(2), paidBy: nonzero.length === 1 ? nonzero[0] : nonzero.length ? 'split' : (fee && fee.paidBy !== 'split' ? fee.paidBy : 'buyer'), split: nonzero.length > 1 ? sp : null, timing: t, poc: t === 'before' ? !!(fee && fee.poc) : false };
}
// allocation buttons (Buyer / Seller / Split / Paid By Others)
export function allocate(amount, how, { buyer = null } = {}) {
  const a = c(amount); if (how === 'buyer') return { paidBy: 'buyer', split: null }; if (how === 'seller') return { paidBy: 'seller', split: null };
  if (how === 'others') return { paidBy: 'other', split: null };
  if (how === 'split') { const b = buyer != null ? c(buyer) : a - Math.floor(a / 2); if (b > a) fail('The buyer part is more than the amount.'); return { paidBy: 'split', split: { buyer: (b) / 100, seller: (a - b) / 100, lender: 0, other: 0 } }; }
  fail('Paid by: Buyer, Seller, Split or Paid By Others.');
}
export const allocationOf = (e) => { if (!e || e.kind !== 'charge') return null; const sp = e.split || {}; const k = ['buyer', 'seller', 'lender', 'other'].filter((x) => Number(sp[x]) > 0);
  return k.length > 1 ? 'split' : k[0] === 'lender' || k[0] === 'other' ? 'others' : k[0] || e.paidBy || 'buyer'; };

// ---------------- Debits / Credits K/M and L/N (the CD summaries laid out like Qualia's screen) ----------------
// [line, statement text | null (blank), group header before it | null, linked side line | null]
export const SUMMARY_LAYOUT = {
  K: [['01', 'Sale Price of Property', null], ['02', 'Sale Price of Any Personal Property Included in Sale', null], ['03', 'Closing Costs Paid at Closing (J)', null], ['04', null, null],
    ['05', null, 'Adjustments'], ['06', null, null], ['07', null, null],
    ['08', 'City/Town Taxes', 'Adjustments for Items Paid by Seller in Advance'], ['09', 'County Taxes', null], ['10', 'Assessments', null], ['11', null, null], ['12', null, null], ['13', null, null], ['14', null, null], ['15', null, null]],
  M: [['01', 'Sale Price of Property', null], ['02', 'Sale Price of Any Personal Property Included in Sale', null], ['03', null, null], ['04', null, null], ['05', null, null], ['06', null, null], ['07', null, null], ['08', null, null],
    ['09', 'City/Town Taxes', 'Adjustments for Items Paid by Seller in Advance'], ['10', 'County Taxes', null], ['11', 'Assessments', null], ['12', null, null], ['13', null, null], ['14', null, null], ['15', null, null], ['16', null, null]],
  L: [['01', 'Deposit', null], ['02', 'Loan Amount', null], ['03', 'Existing Loan(s) Assumed or Taken Subject to', null], ['04', null, null], ['05', 'Seller Credit', null],
    ['06', null, 'Other Credits'], ['07', null, null], ['08', null, 'Adjustments'], ['09', null, null], ['10', null, null], ['11', null, null],
    ['12', 'City/Town Taxes', 'Adjustments for Items Unpaid by Seller'], ['13', 'County Taxes', null], ['14', 'Assessments', null], ['15', null, null], ['16', null, null], ['17', null, null]],
  N: [['01', 'Excess Deposit', null], ['02', 'Closing Costs Paid at Closing (J)', null], ['03', 'Existing Loan(s) Assumed or Taken Subject to', null], ['04', 'Payoff of First Mortgage Loan', null], ['05', 'Payoff of Second Mortgage Loan', null],
    ['06', null, null], ['07', null, null], ['08', 'Seller Credit', null], ['09', null, null], ['10', null, null], ['11', null, null], ['12', null, null], ['13', null, null],
    ['14', 'City/Town Taxes', 'Adjustments for Items Unpaid by Seller'], ['15', 'County Taxes', null], ['16', 'Assessments', null], ['17', null, null], ['18', null, null], ['19', null, null]] };
// which lines of the other side a line is LINKED to (chain icon): the same money on both sides
export const LINKS = { L: { '03': '03', '05': '08', '08': '09', '09': '10', '10': '11', '11': '12', '12': '14', '13': '15', '14': '16', '15': '17', '16': '18', '17': '19' },
  K: { '02': '02', '05': '03', '06': '04', '07': '05', '08': '09', '09': '10', '10': '11', '11': '12', '12': '13', '13': '14', '14': '15', '15': '16' } };
const groupOf = (side, line) => { let g = null; for (const [l, , h] of SUMMARY_LAYOUT[side]) { if (h) g = h; if (l === line) return g; } return null; };
const linesIn = (side, group) => { let g = null; const out = []; for (const [l, , h] of SUMMARY_LAYOUT[side]) { if (h) g = h; if (g === group) out.push(l); } return out; };
const itemSlot = (e) => (/city|town/i.test(e.description + ' ' + ((e.proration || {}).item || '')) ? 0 : /assess/i.test(e.description) ? 2 : /count|property tax/i.test(e.description + ' ' + ((e.proration || {}).item || '')) ? 1 : 3);
// where a credit / summary entry sits: { side, line } on its own side; its linked line (if any) on the other side
export function summaryPlace(e) {
  if (e.autoKey === 'salesPrice') return [['K', '01'], ['M', '01']]; if (e.autoKey === 'deposit') return [['L', '01']]; if (e.autoKey === 'loanAmount') return [['L', '02']];
  const own = e.cdSection && ['K', 'L', 'M', 'N'].includes(e.cdSection) && e.cdLine ? [e.cdSection, e.cdLine] : null;
  if (e.kind === 'charge') { const sp = e.split || {}; if (Number(sp.seller) > 0) return [own && own[0] === 'N' ? own : ['N', /second/i.test(e.description) ? '05' : /payoff|first mortgage/i.test(e.description) ? '04' : null]]; return [own || ['K', '04']]; }
  if (e.lenderCredit) return [];
  if (e.from === 'seller' && e.to === 'buyer') { // L + N (linked)
    if (own && own[0] === 'L') return [own, ['N', LINKS.L[own[1]] || null]]; if (own && own[0] === 'N') return [['N', own[1]]];
    if (e.proration || e.altaSection === 'prorations') { const k = itemSlot(e); const l = ['12', '13', '14', null][k]; return [['L', l || null, 'Adjustments for Items Unpaid by Seller'], ['N', l ? LINKS.L[l] : null, 'Adjustments for Items Unpaid by Seller']]; }
    if (/seller credit/i.test(e.description)) return [['L', '05'], ['N', '08']];
    return [['L', null, 'Adjustments'], ['N', null, null]]; }
  if (e.from === 'buyer' && e.to === 'seller') { // K + M (linked)
    if (own && own[0] === 'K') return [own, ['M', LINKS.K[own[1]] || null]]; if (own && own[0] === 'M') return [['M', own[1]]];
    if (e.proration || e.altaSection === 'prorations') { const k = itemSlot(e); const l = ['08', '09', '10', null][k]; return [['K', l || null, 'Adjustments for Items Paid by Seller in Advance'], ['M', l ? LINKS.K[l] : null, 'Adjustments for Items Paid by Seller in Advance']]; }
    return [['K', null, 'Adjustments'], ['M', null, null]]; }
  if (e.to === 'buyer') return [own && own[0] === 'L' ? own : ['L', null, 'Other Credits']];
  if (e.to === 'seller') return [own && own[0] === 'M' ? own : ['M', null, null]];
  return [];
}
export function summaryScreens(deal, cd, entries) {
  const refi = !!cd.refi; const T = {}; for (const side of ['K', 'L', 'M', 'N']) T[side] = SUMMARY_LAYOUT[side].map(([line, text, header]) => ({ side, line, text, header, entry: null, amount: 0, linked: null, auto: false }));
  const put = (side, line, group, entry, amount, label, linked) => { const rows = T[side]; let r = line ? rows.find((x) => x.line === line && !x.entry) : null;
    if (!r) { const allowed = group ? linesIn(side, group) : rows.map((x) => x.line); r = rows.find((x) => allowed.includes(x.line) && !x.entry && !x.text) || rows.find((x) => allowed.includes(x.line) && !x.entry); }
    if (!r) { r = { side, line: String(rows.length + 1).padStart(2, '0'), text: null, header: null }; rows.push(r); }
    Object.assign(r, { entry, amount: r2(amount), label: label || r.text, linked: linked || null, auto: !!(entry && entry.auto) }); return r; };
  for (const e of entries) { if (e.retired || (e.kind === 'charge' && FEE_SECS.includes(e.cdSection))) continue;
    if (e.kind === 'charge' && (e.timing === 'before' || e.poc)) continue;
    const places = summaryPlace(e); if (!places.length) continue;
    const amount = e.kind === 'charge' ? (Number((e.split || {}).seller) > 0 ? Number(e.split.seller) : Number((e.split || {}).buyer) || 0) : e.amount;
    const label = e.autoKey === 'salesPrice' ? 'Sale Price of Property' : e.autoKey === 'deposit' ? 'Deposit' : e.autoKey === 'loanAmount' ? 'Loan Amount' : e.description;
    const [a, b] = places; const ra = put(a[0], a[1], a[2] || groupOf(a[0], a[1]), e, amount, label);
    if (b) { const rb = put(b[0], b[1], b[2] || null, e, amount, label, ra.side + ra.line); ra.linked = rb.side + rb.line; } }
  // J (closing costs paid at closing) from the CD: K.03 (borrower) and N.02 (seller)
  if (c(cd.J.borrowerAt) > 0) Object.assign(T.K.find((x) => x.line === '03'), { amount: cd.J.borrowerAt, auto: true, j: true });
  if (!refi && c(cd.J.sellerAt) > 0) Object.assign(T.N.find((x) => x.line === '02'), { amount: cd.J.sellerAt, auto: true, j: true });
  const tot = (side) => r2(T[side].reduce((t, r) => t + c(r.amount), 0) / 100);
  return { refi, K: T.K, L: T.L, M: refi ? [] : T.M, N: refi ? [] : T.N, totals: { K: tot('K'), L: tot('L'), M: refi ? 0 : tot('M'), N: refi ? 0 : tot('N') } };
}
// a new summary line typed on the K/M or L/N screen -> a ledger entry
export function summaryInput(side, line, text, amount, deal) {
  const refi = deal && deal.transactionType === 'Refinance'; const g = groupOf(side, line); const desc = s(text, 200) || (SUMMARY_LAYOUT[side].find(([l]) => l === line) || [])[1] || '';
  if (!desc) fail('Type the statement text first.');
  const base = { description: desc, amount, cdSection: side, cdLine: line, note: `Entered on the ${side === 'K' || side === 'M' ? 'K/M' : 'L/N'} Debits / Credits screen.` };
  if (side === 'L') { if (line === '01' || line === '02') fail('Deposit and Loan Amount come from the order (change them on File Overview).');
    if (g === 'Other Credits') return { ...base, kind: 'credit', altaSection: 'misc', from: 'other', to: 'buyer' };
    if (refi) return { ...base, kind: 'credit', altaSection: 'misc', from: 'other', to: 'buyer' };
    return { ...base, kind: 'credit', altaSection: g === 'Adjustments for Items Unpaid by Seller' ? 'prorations' : 'misc', from: 'seller', to: 'buyer' }; }
  if (side === 'N') { if (refi) fail('A refinance has no seller side.'); if (line === '02') fail('N.02 is the seller\'s closing costs from the fee pages (J).');
    if (line === '01') fail('Excess deposit is not handled in the test portal yet.');
    return { ...base, kind: 'charge', altaSection: /payoff/i.test(desc) ? 'payoffs' : 'misc', paidBy: 'seller', timing: 'at' }; }
  if (side === 'K') { if (refi) fail('A refinance has no seller side: K adjustments to the seller are not used.'); if (line === '01' || line === '03') fail('K.01 / K.03 come from the order and the fee pages.');
    return { ...base, kind: 'credit', altaSection: g === 'Adjustments for Items Paid by Seller in Advance' ? 'prorations' : 'misc', from: 'buyer', to: 'seller' }; }
  if (side === 'M') { if (refi) fail('A refinance has no seller side.'); if (line === '01') fail('M.01 comes from the order.');
    return { ...base, kind: 'credit', altaSection: 'misc', from: 'buyer', to: 'seller' }; }
  fail('Pick K, L, M or N.');
}

// ---------------- payment summary (Qualia "View Payment Summary") ----------------
export function paymentSummary(entries, opts = {}) {
  const rows = []; for (const e of entries) { if (e.retired || e.auto || e.kind !== 'charge' || !(c(e.amount) > 0) || e.reduces) continue;
    for (const p of paymentAmounts(e, paymentsFor(e, opts))) rows.push({ feeId: e.id, line: `${e.cdSection || '—'}${e.cdLine ? '.' + e.cdLine : ''}`, description: e.description, payee: p.payee || '(no payee)', method: p.method, label: p.label, amount: p.amount, defaulted: !!p.defaulted, holdback: p.method === 'holdback' ? { releaseNote: p.releaseNote || '', releaseDate: p.releaseDate || '' } : null }); }
  const byMethod = PAY_KEYS.map((k) => ({ method: k, label: payLabel(k), total: r2(rows.filter((r) => r.method === k).reduce((t, r) => t + c(r.amount), 0) / 100), count: rows.filter((r) => r.method === k).length }));
  const missingPayee = rows.filter((r) => r.payee === '(no payee)').length;
  return { rows, byMethod, total: r2(rows.reduce((t, r) => t + c(r.amount), 0) / 100), wires: rows.filter((r) => r.method === 'wire').length, missingPayee };
}
export { usd as qcUsd };
