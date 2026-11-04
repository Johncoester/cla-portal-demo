/* prorations.js : PRORATIONS calculated from the settlement date (Caroline Kim, Nov 4 2026, item 2). PURE: no storage, no network.
 * "Prorations (property taxes, HOA dues, etc.): calculated automatically from the settlement date; the settlement day is charged to the
 * buyer. Option for per-diem basis of 360, 365, or 366 days. An 'Installment' option. Payment cycles: Annual, Semi-Annual, Quarterly, Monthly."
 *
 * A proration is stored on the Accounting fee ledger as a CREDIT in the ALTA "Prorations / Adjustments" section with a `proration` block:
 *   { item, cycle, cycleAmount, periodStart, basis, status, calc }
 *     item         what it is (County property taxes, HOA dues, ...); the fee description is the label shown on the ALTA / CD
 *     cycle        annual | semiannual | quarterly | monthly   (the payment cycle of the bill)
 *     cycleAmount  the bill for ONE payment period (e.g. the semi-annual tax bill); annual amount = cycleAmount x periods per year
 *     periodStart  first day of the CURRENT payment period (the one the settlement date falls in); the period ends cycle months later - 1 day
 *     basis        '365' | '360' | '366' : per diem = annual amount / basis (360 = 30/360 day count, 30-day months)
 *                  'installment'        : per diem = cycleAmount / actual days in that payment period (the installment on its own)
 *     status       'paid'   = PAID IN ADVANCE by the seller (through the period end): the BUYER credits the seller for the buyer's days
 *                             (K "Adjustments for Items Paid by Seller in Advance" / M on the CD; ALTA buyer debit, seller credit)
 *                  'unpaid' = UNPAID / IN ARREARS (the buyer will pay the bill later): the SELLER credits the buyer for the seller's days
 *                             (L "Adjustments for Items Unpaid by Seller" / N on the CD; ALTA seller debit, buyer credit)
 *     calc         the last saved calculation: { settlementDate, amount, ... } (the amount stored on the fee)
 * The SETTLEMENT DAY IS CHARGED TO THE BUYER: the seller has the days from the period start up to the day BEFORE settlement, the buyer has
 * the settlement day through the period end. The statements always use the CURRENT settlement date (accounting.js allEntries recomputes);
 * when the order's settlement date changed since the proration was saved the ledger says so and an editor re-saves it (logged). */
export const PRORATION_CYCLES = [['annual', 'Annual', 12], ['semiannual', 'Semi-Annual', 6], ['quarterly', 'Quarterly', 3], ['monthly', 'Monthly', 1]];
export const PRORATION_BASES = [['365', '365-day year'], ['360', '360-day year (30/360)'], ['366', '366-day year'], ['installment', 'Installment (days in the payment period)']];
export const PRORATION_STATUS = [['paid', 'Paid in advance by the seller (buyer credits the seller)'], ['unpaid', 'Unpaid / in arrears (seller credits the buyer)']];
export const PRORATION_ITEMS = [['countyTaxes', 'County property taxes'], ['cityTaxes', 'City / town taxes'], ['hoa', 'HOA dues'], ['condo', 'Condo fees'],
  ['water', 'Water / sewer'], ['schoolTaxes', 'School taxes'], ['assessments', 'Assessments'], ['groundRent', 'Ground rent'], ['ffb', 'Front foot benefit'], ['other', 'Other']];
// QUALIA Taxes & Prorations (Francis video, Nov 4 2026; feature/payoffs-hoa-ffb-gr). Optional keys on the proration block, all backwards compatible:
//   debitedTo   'buyer' (default, Caroline's rule: the settlement day is the buyer's) | 'seller' (Qualia gear "PRORATION DATE DEBITED TO Seller":
//               the proration date is the seller's, e.g. HOA 11/01-12/01, proration 11/19 -> buyer has 11 days)
//   perDiemDp   4 = Qualia rounds the per diem to 4 decimals BEFORE multiplying (FFB $560 / 365 = $1.5342 x 72 days = $110.46)
//   tab / name / prorateUsing / daysPerYear / taxInfo  the Qualia tab this came from and its display fields (no effect on the math)
export const QUALIA_TABS = [['city', 'City/Town Taxes', 'tax', 'cityTaxes'], ['county', 'County Taxes', 'tax', 'countyTaxes'], ['assessments', 'Assessments', 'tax', 'assessments'],
  ['school', 'School Taxes', 'tax', 'schoolTaxes'], ['hoa', 'HOA/Condo Fee', 'basic', 'hoa'], ['groundRent', 'Ground Rent/Annual', 'rent', 'groundRent']];
const TAB_KEYS = /^(city|county|assessments|school|hoa|groundRent|custom-[a-z0-9]{1,12})$/;
const short = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const MONTHS = Object.fromEntries(PRORATION_CYCLES.map(([k, , m]) => [k, m]));
const fail = (m) => { throw new Error(m); };
const iso = (dt) => dt.toISOString().slice(0, 10);
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) && iso(new Date(s + 'T00:00:00Z')) === s;
const D = (s) => new Date(s + 'T00:00:00Z');
const addDays = (s, n) => { const x = D(s); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
// first day of the month `n` months after s's month, keeping the day (clamped to the month's last day)
export function addMonths(s, n) { const [y, m, d] = s.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last)); return iso(t); }
export const actualDays = (a, b) => Math.round((D(b) - D(a)) / 86400000);      // days from a up to (not including) b
// US (NASD) 30/360 day count from a up to (not including) b
export function days360(a, b) { let [y1, m1, d1] = a.split('-').map(Number); let [y2, m2, d2] = b.split('-').map(Number);
  if (d1 === 31) d1 = 30; if (d2 === 31 && d1 >= 30) d2 = 30; return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1); }
export const periodEnd = (start, cycle) => addDays(addMonths(start, MONTHS[cycle]), -1);
const money = (v, label) => { const t = String(v == null ? '' : v).replace(/[$,\s]/g, ''); if (!/^\d+(\.\d{1,2})?$/.test(t)) fail(`${label} must be an amount like 1,250.00 (no minus sign, at most 2 decimals).`);
  const n = Number(t); if (!(n > 0)) fail(`${label} must be more than zero.`); if (n > 10000000) fail(`${label} is too large.`); return Math.round(n * 100) / 100; };
const usd = (n, dp = 2) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const mdy = (s) => (s ? `${s.slice(5, 7)}/${s.slice(8, 10)}/${s.slice(0, 4)}` : '');

export function cleanProration(p) {
  const v = p || {};
  const item = PRORATION_ITEMS.some(([k]) => k === v.item) ? v.item : v.item == null || v.item === '' ? 'other' : fail('Pick what is being prorated from the list.');
  const cycle = MONTHS[v.cycle] ? v.cycle : fail('Payment cycle must be Annual, Semi-Annual, Quarterly or Monthly.');
  const basis = PRORATION_BASES.some(([k]) => k === String(v.basis)) ? String(v.basis) : v.basis == null || v.basis === '' ? '365' : fail('Per-diem basis must be 365, 360, 366 days or Installment.');
  const status = v.status === 'paid' || v.status === 'unpaid' ? v.status : fail('Pick paid in advance or unpaid (in arrears).');
  const cycleAmount = money(v.cycleAmount, 'Amount for one payment period');
  const periodStart = isDate(v.periodStart) ? v.periodStart : fail('Enter the first day of the current payment period (YYYY-MM-DD).');
  const out = { item, cycle, cycleAmount, periodStart, basis, status };
  if (v.debitedTo != null && v.debitedTo !== '') { if (v.debitedTo !== 'buyer' && v.debitedTo !== 'seller') fail('Proration date debited to must be Buyer or Seller.'); out.debitedTo = v.debitedTo; }
  if (v.perDiemDp != null && v.perDiemDp !== '') { if (Number(v.perDiemDp) !== 4) fail('Per diem decimals must be 4 (Qualia) or not set.'); out.perDiemDp = 4; }
  if (v.tab != null && v.tab !== '') { if (!TAB_KEYS.test(String(v.tab))) fail('Unknown Taxes & Prorations tab.'); out.tab = String(v.tab); }
  if (v.name != null && v.name !== '') out.name = short(v.name, 80);
  if (v.prorateUsing != null && v.prorateUsing !== '') { if (!['installment', 'perDiem'].includes(v.prorateUsing)) fail('Prorate using must be Installment Amount or Per Diem.'); out.prorateUsing = v.prorateUsing; }
  if (v.daysPerYear != null && v.daysPerYear !== '') { if (!['360', '365', '366'].includes(String(v.daysPerYear))) fail('Days per year must be 360, 365 or 366.'); out.daysPerYear = String(v.daysPerYear); }
  if (v.taxInfo != null) { const t = v.taxInfo; if (typeof t !== 'object' || Array.isArray(t)) fail('Tax info: bad fields.');
    const ti = {}; for (const k of Object.keys(t)) if (!['annualAmount', 'parcelId', 'paidThru', 'nextDue', 'schedule'].includes(k)) fail(`Unknown tax info field: ${k}.`);
    if (t.annualAmount != null && t.annualAmount !== '') ti.annualAmount = money(t.annualAmount, 'Annual amount');
    for (const k of ['paidThru', 'nextDue']) if (t[k]) { if (!isDate(t[k])) fail(`${k === 'paidThru' ? 'Paid thru' : 'Next due'} must be a date (YYYY-MM-DD).`); ti[k] = t[k]; }
    if (t.parcelId) ti.parcelId = short(t.parcelId, 40); if (t.schedule) { if (!MONTHS[t.schedule]) fail('Payment schedule must be Annual, Semi-Annual, Quarterly or Monthly.'); ti.schedule = t.schedule; }
    if (Object.keys(ti).length) out.taxInfo = ti; }
  return out;
}
// the calculation for a settlement date (YYYY-MM-DD). Throws when there is no settlement date or it is outside the payment period.
export function computeProration(p, settlementDate) {
  const x = cleanProration(p);
  if (!isDate(settlementDate)) fail('Set the settlement (closing) date on the order first: prorations are calculated from it.');
  const start = x.periodStart; const end = periodEnd(start, x.cycle); const months = MONTHS[x.cycle]; const perYear = 12 / months;
  if (settlementDate < start || settlementDate > end) fail(`The settlement date ${mdy(settlementDate)} is not in the payment period ${mdy(start)} to ${mdy(end)}. Enter the period the settlement date falls in.`);
  const annual = Math.round(x.cycleAmount * perYear * 100) / 100;
  let sellerDays, buyerDays, totalDays, perDiem, basisText;
  const sOwn = x.debitedTo === 'seller' ? 1 : 0;   // Qualia "proration date debited to Seller": the settlement day is the seller's
  if (x.basis === '360') { totalDays = months * 30; sellerDays = Math.min(totalDays, days360(start, settlementDate) + sOwn); buyerDays = totalDays - sellerDays; perDiem = annual / 360; basisText = `annual ${usd(annual)} ÷ 360`; }
  else { totalDays = actualDays(start, addDays(end, 1)); sellerDays = actualDays(start, settlementDate) + sOwn; buyerDays = totalDays - sellerDays;
    if (x.basis === 'installment') { perDiem = x.cycleAmount / totalDays; basisText = `installment ${usd(x.cycleAmount)} ÷ ${totalDays} days in the period`; }
    else { perDiem = annual / Number(x.basis); basisText = `annual ${usd(annual)} ÷ ${x.basis}`; } }
  if (x.perDiemDp === 4) perDiem = Math.round(perDiem * 10000) / 10000;
  const paid = x.status === 'paid'; const days = paid ? buyerDays : sellerDays;
  const amount = Math.round(perDiem * days * 100) / 100;
  const sellerTo = sOwn ? settlementDate : addDays(settlementDate, -1); const buyerFrom = sOwn ? addDays(settlementDate, 1) : settlementDate;
  const out = { settlementDate, periodStart: start, periodEnd: end, annual, perDiem: Math.round(perDiem * 100000) / 100000, sellerDays, buyerDays, totalDays, days, amount,
    from: paid ? 'buyer' : 'seller', to: paid ? 'seller' : 'buyer',
    // the CD shows the date range the adjustment covers: paid in advance = the buyer's days, unpaid = the seller's days
    rangeFrom: paid ? buyerFrom : start, rangeTo: paid ? end : sellerTo, endExclusive: addDays(end, 1), debitedTo: sOwn ? 'seller' : 'buyer' };
  const cyc = PRORATION_CYCLES.find(([k]) => k === x.cycle)[1].toLowerCase();
  out.text = `${usd(x.cycleAmount)} ${cyc} (${mdy(start)} to ${mdy(end)}); per diem ${basisText} = ${usd(out.perDiem, 5)}/day. `
    + `Seller ${sellerDays ? `${mdy(start)} to ${mdy(sellerTo)} (${sellerDays} day${sellerDays === 1 ? '' : 's'})` : 'no days'}, buyer ${buyerDays ? `${mdy(buyerFrom)} to ${mdy(end)} ` : ''}(${buyerDays} day${buyerDays === 1 ? '' : 's'}; the settlement day is charged to the ${sOwn ? 'seller' : 'buyer'}). `
    + (paid ? `Paid in advance by the seller: the buyer credits the seller ${buyerDays} day${buyerDays === 1 ? '' : 's'} = ${usd(amount)}.` : `Unpaid (in arrears): the seller credits the buyer ${sellerDays} day${sellerDays === 1 ? '' : 's'} = ${usd(amount)}.`);
  return out;
}
export const prorationRange = (c) => (c ? `${mdy(c.rangeFrom)} to ${mdy(c.rangeTo)}` : '');
