/* cd-pages.js : THE REST OF THE CLOSING DISCLOSURE (Caroline Kim, Nov 4 2026, item 3: "build the rest of the CD: lender credits, prepaids
 * (Section F), initial escrow payment at closing (Section G, with the escrow account calculation), and whatever else is needed so the CD pages
 * are complete (loan terms / projected payments can be manual entry fields)"). PURE: no storage, no network. TEST ONLY, not a legal disclosure.
 *
 *  - CD DETAILS: one record per order of MANUAL entries (flat keys, CD_DETAIL_FIELDS): Loan Terms, Projected Payments, Loan Estimate column of
 *    Calculating Cash to Close, Loan Disclosures, Loan Calculations, Other Disclosures, contact NMLS / license numbers, and the inputs of the
 *    prepaids / escrow calculator. Every save is logged field by field (who, when, old -> new). Nothing is deleted.
 *  - PREPAIDS / ESCROW CALCULATOR: turns those inputs into fee lines (CD section F prepaids, section G initial escrow payment + the aggregate
 *    adjustment from a RESPA-style aggregate escrow analysis) that go on the fee ledger with presetKey 'cdcalc:<line>'.
 *  - cdPages(): CD pages 1-5 built from the ledger (closingDisclosure) + the details: page 1 Loan Terms / Projected Payments / Costs at Closing,
 *    page 2 Loan Costs / Other Costs (with Lender Credits in J), page 3 Calculating Cash to Close + Summaries of Transactions, page 4 Loan
 *    Disclosures + Escrow Account, page 5 Loan Calculations, Other Disclosures, Contact Information. */
import { addMonths, isDate, mdy, PRORATION_CYCLES } from './prorations.js?v=202611050803';
const fail = (m) => { throw new Error(m); };
const c = (n) => Math.round((Number(n) || 0) * 100); const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const usd = (n) => (Number(n) < 0 ? '-' : '') + '$' + Math.abs(Number(n || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const YN = [['', '—'], ['yes', 'YES'], ['no', 'NO']];
const CYC = PRORATION_CYCLES.map(([k, l]) => [k, l]);
// [key, type, label, options] ; types: text | money | pct | int | date | select | yn
export const CD_DETAIL_GROUPS = [
  // Qualia Basic Info › Dates (John, Nov 4 2026): the disbursement date is F.03 Prepaid Interest's From Date default
  ['dates', 'Basic Info dates (Qualia)', [['dates.disbursement', 'date', 'Disbursement date (blank = settlement date; F.03 prepaid interest starts here)'], ['dates.funding', 'date', 'Funding date']]],
  ['loan', 'Loan Information & Loan Terms (page 1)', [
    ['loan.term', 'text', 'Loan term (e.g. 30 years)'], ['loan.purpose', 'select', 'Purpose', [['', '—'], ['Purchase', 'Purchase'], ['Refinance', 'Refinance'], ['Construction', 'Construction'], ['Home Equity Loan', 'Home Equity Loan']]],
    ['loan.product', 'text', 'Product (e.g. Fixed Rate)'], ['loan.type', 'select', 'Loan type', [['', '—'], ['Conventional', 'Conventional'], ['FHA', 'FHA'], ['VA', 'VA'], ['Other', 'Other']]],
    ['loan.id', 'text', 'Loan ID #'], ['loan.mic', 'text', 'MIC #'], ['loan.rate', 'pct', 'Interest rate (%)'], ['loan.monthlyPI', 'money', 'Monthly principal & interest'],
    ['loan.amountCanIncrease', 'yn', 'Loan amount can increase after closing?', YN], ['loan.rateCanIncrease', 'yn', 'Interest rate can increase?', YN], ['loan.piCanIncrease', 'yn', 'Monthly P&I can increase?', YN],
    ['loan.prepaymentPenalty', 'yn', 'Prepayment penalty?', YN], ['loan.prepaymentMax', 'money', 'Prepayment penalty: as high as'], ['loan.balloon', 'yn', 'Balloon payment?', YN], ['loan.balloonAmount', 'money', 'Balloon payment amount'],
    ['tx.appraised', 'money', 'Appraised property value'], ['tx.closingDisclosureDate', 'date', 'Date issued']]],
  ['projected', 'Projected Payments (page 1)', [
    ...[1, 2, 3, 4].flatMap((n) => [[`pp${n}.years`, 'text', `Column ${n}: years (e.g. ${n === 1 ? '1-7' : n === 2 ? '8' : n === 3 ? '9-30' : '—'})`], [`pp${n}.pi`, 'money', `Column ${n}: principal & interest`], [`pp${n}.mi`, 'money', `Column ${n}: mortgage insurance`], [`pp${n}.escrow`, 'money', `Column ${n}: estimated escrow`]]),
    ['pp.taxesInsMonthly', 'money', 'Estimated taxes, insurance & assessments (monthly)'], ['pp.inEscrowTaxes', 'yn', 'Property taxes in escrow?', YN], ['pp.inEscrowIns', 'yn', "Homeowner's insurance in escrow?", YN],
    ['pp.inEscrowOther', 'yn', 'Other (e.g. HOA) in escrow?', YN], ['pp.otherText', 'text', 'Other: what']]],
  ['le', 'Calculating Cash to Close: Loan Estimate column (page 3)', [
    ['le.totalClosingCosts', 'money', 'LE: Total Closing Costs (J)'], ['le.beforeClosing', 'money', 'LE: Closing Costs Paid Before Closing'], ['le.financed', 'money', 'LE: Closing Costs Financed'],
    ['le.downPayment', 'money', 'LE: Down Payment / Funds from Borrower'], ['le.deposit', 'money', 'LE: Deposit'], ['le.fundsForBorrower', 'money', 'LE: Funds for Borrower'],
    ['le.sellerCredits', 'money', 'LE: Seller Credits'], ['le.adjustments', 'money', 'LE: Adjustments and Other Credits'], ['le.cashToClose', 'money', 'LE: Cash to Close']]],
  ['disc', 'Loan Disclosures (page 4)', [
    ['disc.assumption', 'select', 'Assumption', [['', '—'], ['will allow', 'will allow'], ['will not allow', 'will not allow']]], ['disc.demandFeature', 'yn', 'Demand feature?', YN],
    ['disc.lateDays', 'int', 'Late payment: days late'], ['disc.lateFee', 'text', 'Late payment fee (e.g. 5% of the monthly P&I)'],
    ['disc.negAm', 'select', 'Negative amortization', [['', '—'], ['scheduled', 'Scheduled'], ['may', 'May have'], ['none', 'Do not have']]],
    ['disc.partial', 'select', 'Partial payments', [['', '—'], ['may accept', 'May accept'], ['may hold', 'May hold'], ['does not accept', 'Does not accept']]],
    ['disc.securityProperty', 'text', 'Security interest: property address (blank = the order address)'],
    ['disc.escrowAccount', 'select', 'Escrow account', [['will', 'Will have an escrow account'], ['will not', 'Will not have an escrow account']]],
    ['disc.nonEscrowed', 'money', 'Non-escrowed property costs over year 1'], ['disc.escrowWaiverFee', 'money', 'Escrow waiver fee (no escrow)']]],
  ['calc', 'Loan Calculations & Other Disclosures (page 5)', [
    ['calc.totalOfPayments', 'money', 'Total of payments'], ['calc.financeCharge', 'money', 'Finance charge'], ['calc.amountFinanced', 'money', 'Amount financed'],
    ['calc.apr', 'pct', 'Annual percentage rate (APR %)'], ['calc.tip', 'pct', 'Total interest percentage (TIP %)'],
    ['other.liability', 'select', 'Liability after foreclosure', [['', '—'], ['protected', 'State law may protect from liability'], ['not protected', 'State law does not protect']]],
    ['other.refinance', 'text', 'Refinance note'],
    ['ct.lenderNmls', 'text', 'Lender NMLS ID'], ['ct.lenderContact', 'text', 'Lender contact'], ['ct.lenderContactNmls', 'text', 'Lender contact NMLS ID'], ['ct.brokerName', 'text', 'Mortgage broker (if any)']]],
  ['pre', 'Prepaids (section F)', [
    ['pre.interestBasis', 'select', 'Prepaid interest per-diem basis', [['365', '365 days'], ['360', '360 days']]], ['pre.interestFrom', 'date', 'Prepaid interest from (blank = settlement date)'],
    ['pre.interestTo', 'date', 'Prepaid interest to (blank = last day of the settlement month)'],
    ['pre.hoiAnnual', 'money', "Homeowner's insurance: annual premium"], ['pre.hoiMonths', 'int', "Homeowner's insurance: months prepaid (F)"], ['pre.hoiPayee', 'text', "Homeowner's insurance company"],
    ['pre.miMonthly', 'money', 'Mortgage insurance: monthly premium'], ['pre.miMonths', 'int', 'Mortgage insurance: months prepaid (F)'], ['pre.miPayee', 'text', 'Mortgage insurer'],
    ['pre.taxMonths', 'int', 'Property taxes: months prepaid (F, usually blank)'], ['pre.taxPayee', 'text', 'Property tax office']]],
  ['esc', 'Initial escrow payment (section G) & escrow account', [
    ['esc.firstPayment', 'date', 'First loan payment date'], ['esc.cushion', 'select', 'Cushion (RESPA max 2 months)', [['2', '2 months'], ['1', '1 month'], ['0', 'None']]],
    ['esc.hoiDue', 'date', "Homeowner's insurance: next renewal due"],
    ['esc.taxAnnual', 'money', 'Property taxes: annual amount'], ['esc.taxCycle', 'select', 'Property taxes: payment cycle', CYC], ['esc.taxDue', 'date', 'Property taxes: next installment due'],
    ['esc.otherLabel', 'text', 'Other escrow item (e.g. Flood insurance)'], ['esc.otherAnnual', 'money', 'Other: annual amount'], ['esc.otherCycle', 'select', 'Other: payment cycle', CYC], ['esc.otherDue', 'date', 'Other: next payment due']]],
];
export const CD_DETAIL_FIELDS = CD_DETAIL_GROUPS.flatMap(([, , f]) => f);
const FIELD = Object.fromEntries(CD_DETAIL_FIELDS.map((f) => [f[0], f]));
export const cdFieldLabel = (k) => (FIELD[k] ? FIELD[k][2] : k);
export function cleanCdDetails(input, prev = {}) {
  const v = { ...(prev || {}), ...(input || {}) }; const out = {};
  for (const [k, raw] of Object.entries(v)) {
    const f = FIELD[k]; if (!f) fail(`Unknown Closing Disclosure field: ${k}`); const [, type, label, opts] = f;
    const t = String(raw == null ? '' : raw).trim(); if (!t) continue;
    if (type === 'money') { const x = t.replace(/[$,\s]/g, ''); if (!/^\d+(\.\d{1,2})?$/.test(x) || Number(x) > 100000000) fail(`${label} must be an amount like 1,250.00.`); out[k] = r2(x); }
    else if (type === 'pct') { if (!/^\d{1,2}(\.\d{1,5})?$/.test(t)) fail(`${label} must be a percentage like 6.875.`); out[k] = Number(t); }
    else if (type === 'int') { if (!/^\d{1,3}$/.test(t) || Number(t) > 360) fail(`${label} must be a whole number (0-360).`); out[k] = Number(t); }
    else if (type === 'date') { if (!isDate(t)) fail(`${label} must be a date (YYYY-MM-DD).`); out[k] = t; }
    else if (type === 'select' || type === 'yn') { if (!opts.some(([o]) => o === t)) fail(`${label}: pick one from the list.`); out[k] = t; }
    else out[k] = t.slice(0, 200);
  }
  return out;
}
export function cdDetailChanges(before = {}, after = {}) {
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
  return keys.filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)).map((k) => ({ field: k, label: cdFieldLabel(k), old: before[k] ?? null, new: after[k] ?? null }));
}

// ---------------- prepaids (F) + initial escrow payment (G) ----------------
const lastOfMonth = (s) => { const [y, m] = s.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const daysIncl = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) + 1;
const ym = (s) => s.slice(0, 7);
const monthIndex = (start, s) => { const [y1, m1] = start.split('-').map(Number); const [y2, m2] = s.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };
const CYCLE_MONTHS = Object.fromEntries(PRORATION_CYCLES.map(([k, , m]) => [k, m]));
// RESPA-style AGGREGATE escrow analysis over the 12-month computation year that starts with the first payment month:
// each month the borrower deposits 1/12 of each item, then the disbursements due that month are paid. The initial deposit at closing is the
// smallest amount that keeps the lowest balance (including the starting balance) at the cushion (cushion months x the monthly deposit, at most
// 2 months = 1/6 of the year's disbursements). Section G shows each item as "$x per month for n mo." (that item analysed on its own, rounded
// up to whole months) and the AGGREGATE ADJUSTMENT = initial deposit - the sum of those lines (zero or negative).
export function escrowAnalysis(items, firstPayment, cushionMonths = 2) {
  if (!isDate(firstPayment)) fail('Enter the first loan payment date (escrow account).');
  const start = firstPayment.slice(0, 8) + '01'; const cm = Math.max(0, Math.min(2, Number(cushionMonths) || 0));
  const its = items.filter((x) => x.annual > 0).map((x) => {
    const monthly = x.monthlyOverride != null ? r2(x.monthlyOverride) : r2(x.annual / 12); const every = CYCLE_MONTHS[x.cycle] || 12; const per = r2(x.annual / (12 / every));
    const dis = Array(12).fill(0);
    if (x.due) { let d = x.due; while (d < start) d = addMonths(d, every); for (; monthIndex(start, d) < 12; d = addMonths(d, every)) dis[monthIndex(start, d)] += per; }
    return { ...x, monthly, dis, per };
  });
  const run = (list, cushion) => { let bal = 0, low = 0; const rows = []; for (let k = 0; k < 12; k++) { const dep = list.reduce((t, x) => t + c(x.monthly), 0); const out = list.reduce((t, x) => t + c(x.dis[k]), 0); bal += dep - out; low = Math.min(low, bal); rows.push({ dep, out, bal }); }
    return { deposit: Math.max(0, cushion - low), rows }; };
  const monthlyTotal = its.reduce((t, x) => t + c(x.monthly), 0); const yearOut = its.reduce((t, x) => t + x.dis.reduce((a, b) => a + c(b), 0), 0);
  const cushion = Math.min(cm * monthlyTotal, Math.floor(yearOut / 6));
  const agg = run(its, cushion);
  const lines = its.map((x) => { const own = run([x], Math.min(cm * c(x.monthly), Math.floor(x.dis.reduce((a, b) => a + c(b), 0) / 6))); const months = c(x.monthly) ? Math.ceil(own.deposit / c(x.monthly) - 1e-9) : 0;
    return { key: x.key, label: x.label, payee: x.payee || '', monthly: x.monthly, months, amount: r2(months * c(x.monthly) / 100) }; });
  const itemized = lines.reduce((t, x) => t + c(x.amount), 0);
  const initialDeposit = agg.deposit;
  const schedule = agg.rows.map((r, k) => ({ month: ym(addMonths(start, k)), deposit: r2(r.dep / 100), disbursed: r2(r.out / 100), balance: r2((initialDeposit + r.bal) / 100) }));
  return { start, cushionMonths: cm, cushion: r2(cushion / 100), monthlyEscrow: r2(monthlyTotal / 100), yearDisbursements: r2(yearOut / 100), initialDeposit: r2(initialDeposit / 100),
    itemized: r2(itemized / 100), aggregateAdjustment: r2((initialDeposit - itemized) / 100), lines, schedule, lowBalance: r2(Math.min(initialDeposit, ...schedule.map((s) => c(s.balance))) / 100) };
}
// the fee lines (for the fee ledger) the prepaids / escrow inputs produce. deal: loanAmount, closingDate. details: cleaned CD details.
export const CDCALC = 'cdcalc:';
export const CDCALC_VIA = 'Prepaids / escrow calculator';
export function prepaidEscrowLines(deal, details = {}) {
  const v = details || {}; const loan = Number(deal.loanAmount ?? deal.loan_amount) || 0; const sd = deal.closingDate ?? deal.closing_date; const lines = []; const warnings = [];
  const L = (key, cd, line, alta, description, payee, amount, calculation, extra = {}) => { if (c(amount) > 0) lines.push({ key: CDCALC + key, kind: 'charge', cdSection: cd, cdLine: line, altaSection: alta, description, payee: payee || '', amount: r2(amount), paidBy: 'buyer', split: null, timing: 'at', poc: false, titlePrefix: false, calculation, ...extra }); };
  const hoiA = v['pre.hoiAnnual'] || 0, hoiM = v['pre.hoiMonths'] ?? (hoiA ? 12 : 0);
  L('F.hoi', 'F', '01', 'otherLoanCharges', `Homeowner's Insurance Premium (${hoiM} mo.)`, v['pre.hoiPayee'] || "Homeowner's insurance company", hoiA * hoiM / 12, `${usd(hoiA)} a year × ${hoiM}/12 = ${usd(r2(hoiA * hoiM / 12))}.`);
  const miM = v['pre.miMonthly'] || 0, miN = v['pre.miMonths'] || 0;
  L('F.mi', 'F', '02', 'otherLoanCharges', `Mortgage Insurance Premium (${miN} mo.)`, v['pre.miPayee'] || 'Mortgage insurer', miM * miN, `${usd(miM)} a month × ${miN} = ${usd(r2(miM * miN))}.`);
  const rate = v['loan.rate'];
  if (rate && loan > 0) {
    const from = v['pre.interestFrom'] || sd; if (!from) warnings.push('Prepaid interest: set the settlement date (or "Prepaid interest from") first.');
    else { const to = v['pre.interestTo'] || lastOfMonth(from); if (to < from) fail('Prepaid interest "to" is before "from".'); const basis = Number(v['pre.interestBasis'] || 365); const perDiem = r2(loan * rate / 100 / basis); const days = daysIncl(from, to);
      L('F.interest', 'F', '03', 'loanCharges', `Prepaid Interest (${usd(perDiem)} per day from ${mdy(from)} to ${mdy(to)})`, deal.lenderName || 'Lender', perDiem * days, `${usd(loan)} × ${rate}% ÷ ${basis} = ${usd(perDiem)} a day (rounded to the cent) × ${days} day${days === 1 ? '' : 's'} (${mdy(from)} to ${mdy(to)}, both days counted) = ${usd(r2(perDiem * days))}.`); } }
  else if (loan > 0) warnings.push('Prepaid interest: enter the interest rate (Loan Terms) to calculate it.');
  const taxA = v['esc.taxAnnual'] || 0, taxN = v['pre.taxMonths'] || 0;
  L('F.taxes', 'F', '04', 'otherLoanCharges', `Property Taxes (${taxN} mo.)`, v['pre.taxPayee'] || 'Tax office', r2(taxA / 12) * taxN, `${usd(r2(taxA / 12))} a month × ${taxN} = ${usd(r2(r2(taxA / 12) * taxN))}.`);
  let escrow = null;
  if ((v['disc.escrowAccount'] || 'will') === 'will' && loan > 0) {
    const items = [{ key: 'hoi', label: "Homeowner's Insurance", annual: hoiA, cycle: 'annual', due: v['esc.hoiDue'], payee: v['pre.hoiPayee'] || '' },
      { key: 'mi', label: 'Mortgage Insurance', annual: r2(miM * 12), monthlyOverride: miM, cycle: 'monthly', due: v['esc.firstPayment'], payee: v['pre.miPayee'] || '' },
      { key: 'taxes', label: 'Property Taxes', annual: taxA, cycle: v['esc.taxCycle'] || 'annual', due: v['esc.taxDue'], payee: v['pre.taxPayee'] || '' },
      { key: 'other', label: v['esc.otherLabel'] || 'Other', annual: v['esc.otherAnnual'] || 0, cycle: v['esc.otherCycle'] || 'annual', due: v['esc.otherDue'] }];
    if (items.some((x) => x.annual > 0)) {
      if (!v['esc.firstPayment']) warnings.push('Initial escrow payment: enter the first loan payment date to run the escrow account calculation.');
      else { for (const x of items) if (x.annual > 0 && !x.due && x.key !== 'mi') warnings.push(`Escrow: ${x.label} has no next due date, so nothing is paid out of escrow for it in the first year.`);
        escrow = escrowAnalysis(items, v['esc.firstPayment'], v['esc.cushion'] ?? 2);
        const N = { hoi: '01', mi: '02', taxes: '03', other: '04' };
        for (const x of escrow.lines) L('G.' + x.key, 'G', N[x.key], 'impounds', `${x.label} ${usd(x.monthly)} per month for ${x.months} mo.`, deal.lenderName || 'Lender', x.amount, `${usd(x.monthly)} a month × ${x.months} month${x.months === 1 ? '' : 's'} (enough on its own to keep the ${escrow.cushionMonths}-month cushion at the low point).`);
        if (c(escrow.aggregateAdjustment) < 0) L('G.aggregate', 'G', '08', 'impounds', 'Aggregate Adjustment', deal.lenderName || 'Lender', -escrow.aggregateAdjustment,
          `Initial escrow deposit ${usd(escrow.initialDeposit)} (aggregate analysis, lowest balance = cushion ${usd(escrow.cushion)}) − itemized ${usd(escrow.itemized)} = ${usd(escrow.aggregateAdjustment)}.`, { reduces: true }); } } }
  return { lines, warnings, escrow };
}
// a ledger fee input for a calculated F / G line
export const cdcalcFeeInput = (l) => ({ kind: 'charge', description: l.description, altaSection: l.altaSection, cdSection: l.cdSection, cdLine: l.cdLine, payee: l.payee, amount: l.amount, paidBy: 'buyer', split: null,
  timing: 'at', poc: false, titlePrefix: false, reduces: !!l.reduces, note: `${CDCALC_VIA}: ${l.calculation}`.slice(0, 1000), presetKey: l.key });
// the EXAMPLE presets the calculator replaces (offered for retirement, never deleted)
export const CDCALC_REPLACES = { 'cdcalc:F.hoi': ['homeownersIns'], 'cdcalc:G.taxes': ['escrowTaxes'] };
export function diffCdcalc(lines, fees) {
  const active = (fees || []).filter((f) => !f.retired); const rows = [];
  for (const l of lines) { const cur = active.find((f) => f.presetKey === l.key);
    const same = cur && c(cur.amount) === c(l.amount) && cur.description === l.description && cur.cdLine === l.cdLine && !!cur.reduces === !!l.reduces && cur.payee === l.payee;
    rows.push({ key: l.key, status: !cur ? 'new' : same ? 'unchanged' : 'changed', proposed: l, current: cur ? { id: cur.id, amount: cur.amount, description: cur.description } : null }); }
  for (const f of active.filter((x) => String(x.presetKey || '').startsWith(CDCALC) && !lines.some((l) => l.key === x.presetKey))) rows.push({ key: f.presetKey, status: 'retire', proposed: null, current: { id: f.id, amount: f.amount, description: f.description } });
  const repl = new Set(lines.flatMap((l) => CDCALC_REPLACES[l.key] || []));
  const examples = active.filter((f) => repl.has(f.presetKey)).map((f) => ({ id: f.id, description: f.description, amount: f.amount }));
  return { rows, examples, applicable: rows.filter((r) => r.status !== 'unchanged').length };
}

// ---------------- CD pages 1-5 ----------------
export function cashToCloseTable(deal, cd, details = {}) {
  const v = details || {}; const refi = cd.refi; const K = cd.summaries.K, L = cd.summaries.L;
  const price = Number(deal.purchasePrice ?? deal.purchase_price) || 0; const loan = Number(deal.loanAmount ?? deal.loan_amount) || 0; const emd = Number(deal.emdAmount ?? deal.emd_amount) || 0;
  const J = cd.J; const jAt = Math.max(0, c(J.borrowerAt)); const Kc = c(K.total), Lc = c(L.total);
  const sale = refi ? 0 : c(price); const sellerCredits = L.rows.filter((r) => /^Seller Credit/.test(r.label)).reduce((t, r) => t + c(r.amount), 0);
  const financed = Math.max(0, Math.min(jAt, c(loan) - (Kc - jAt)));
  const down = refi ? 0 : Math.max(0, sale - c(loan)); const fundsFor = refi ? Math.max(0, c(loan) - (Kc - jAt) - financed) : Math.max(0, c(loan) - sale - financed);
  const deposit = refi ? 0 : c(emd);
  const final = { totalClosingCosts: c(J.borrower), beforeClosing: -c(J.borrowerBefore), financed: -financed, downPayment: down, deposit: -deposit, fundsForBorrower: -fundsFor, sellerCredits: -sellerCredits };
  const cash = Kc - Lc; const sumKnown = Object.values(final).reduce((a, b) => a + b, 0);
  final.adjustments = cash - sumKnown;            // what is left of K - L: adjustments (prorations etc.) and other credits
  final.cashToClose = cash;
  const ROWS = [['totalClosingCosts', 'Total Closing Costs (J)'], ['beforeClosing', 'Closing Costs Paid Before Closing'], ['financed', 'Closing Costs Financed (Paid from your Loan Amount)'],
    ['downPayment', refi ? 'Down Payment / Funds from Borrower (not used on a refinance)' : 'Down Payment / Funds from Borrower'], ['deposit', 'Deposit'], ['fundsForBorrower', 'Funds for Borrower'], ['sellerCredits', 'Seller Credits'],
    ['adjustments', 'Adjustments and Other Credits'], ['cashToClose', 'Cash to Close']];
  const LE_SIGN = { beforeClosing: -1, financed: -1, deposit: -1, fundsForBorrower: -1, sellerCredits: -1 };
  return ROWS.map(([k, label]) => { const le = v['le.' + k] != null ? r2((LE_SIGN[k] || 1) * v['le.' + k]) : null; const fin = r2(final[k] / 100);
    return { key: k, label, le, final: fin, changed: le == null ? null : c(le) !== c(fin) }; });
}
export function cdPages(deal, cd, details = {}, escrow = null) {
  const v = details || {}; const loan = Number(deal.loanAmount ?? deal.loan_amount) || 0; const refi = cd.refi;
  const G = cd.sections.find((s) => s.key === 'G'); const initialEscrow = G ? r2(G.borrowerAt + G.borrowerBefore) : 0;
  const monthlyEscrow = escrow ? escrow.monthlyEscrow : null;
  const cols = [1, 2, 3, 4].map((n) => ({ years: v[`pp${n}.years`] || '', pi: v[`pp${n}.pi`] ?? null, mi: v[`pp${n}.mi`] ?? null, escrow: v[`pp${n}.escrow`] ?? null })).filter((x) => x.years || x.pi != null);
  if (!cols.length && (v['loan.monthlyPI'] != null)) cols.push({ years: v['loan.term'] ? `1-${String(v['loan.term']).replace(/\D+/g, '') || ''}` : 'Years 1+', pi: v['loan.monthlyPI'], mi: v['pre.miMonthly'] ?? 0, escrow: monthlyEscrow ?? 0, auto: true });
  cols.forEach((x) => { x.total = r2((x.pi || 0) + (x.mi || 0) + (x.escrow || 0)); });
  const cctc = cashToCloseTable(deal, cd, v);
  return {
    page1: { loanTerm: v['loan.term'] || '', purpose: v['loan.purpose'] || (refi ? 'Refinance' : 'Purchase'), product: v['loan.product'] || '', loanType: v['loan.type'] || '', loanId: v['loan.id'] || '', mic: v['loan.mic'] || '',
      issued: v['tx.closingDisclosureDate'] || '', appraised: v['tx.appraised'] ?? null,
      terms: [['Loan Amount', loan ? usd(loan) : '', v['loan.amountCanIncrease']], ['Interest Rate', v['loan.rate'] != null ? `${v['loan.rate']}%` : '', v['loan.rateCanIncrease']],
        ['Monthly Principal & Interest', v['loan.monthlyPI'] != null ? usd(v['loan.monthlyPI']) : '', v['loan.piCanIncrease']],
        ['Prepayment Penalty', v['loan.prepaymentPenalty'] === 'yes' && v['loan.prepaymentMax'] != null ? `as high as ${usd(v['loan.prepaymentMax'])}` : '', v['loan.prepaymentPenalty']],
        ['Balloon Payment', v['loan.balloon'] === 'yes' && v['loan.balloonAmount'] != null ? usd(v['loan.balloonAmount']) : '', v['loan.balloon']]].map(([label, value, yn]) => ({ label, value, yn: yn || '' })),
      projected: cols, taxesIns: v['pp.taxesInsMonthly'] ?? (escrow ? escrow.monthlyEscrow : null), inEscrow: { taxes: v['pp.inEscrowTaxes'] || '', ins: v['pp.inEscrowIns'] || '', other: v['pp.inEscrowOther'] || '', otherText: v['pp.otherText'] || '' },
      costsAtClosing: { closingCosts: cd.J.borrower, loanCosts: cd.D.borrower, otherCosts: cd.I.borrower, lenderCredits: cd.J.lenderCredits, cashToClose: cd.cashToClose } },
    page3: { cctc },
    page4: { assumption: v['disc.assumption'] || '', demandFeature: v['disc.demandFeature'] || '', lateDays: v['disc.lateDays'] ?? null, lateFee: v['disc.lateFee'] || '', negAm: v['disc.negAm'] || '', partial: v['disc.partial'] || '',
      securityProperty: v['disc.securityProperty'] || '', escrowAccount: v['disc.escrowAccount'] || 'will',
      escrowedYear1: escrow ? r2(escrow.monthlyEscrow * 12) : null, nonEscrowed: v['disc.nonEscrowed'] ?? null, initialEscrow, monthlyEscrow, waiverFee: v['disc.escrowWaiverFee'] ?? null, escrow },
    page5: { totalOfPayments: v['calc.totalOfPayments'] ?? null, financeCharge: v['calc.financeCharge'] ?? null, amountFinanced: v['calc.amountFinanced'] ?? null, apr: v['calc.apr'] ?? null, tip: v['calc.tip'] ?? null,
      liability: v['other.liability'] || '', refinance: v['other.refinance'] || '', lenderNmls: v['ct.lenderNmls'] || '', lenderContact: v['ct.lenderContact'] || '', lenderContactNmls: v['ct.lenderContactNmls'] || '', broker: v['ct.brokerName'] || '' },
  };
}
