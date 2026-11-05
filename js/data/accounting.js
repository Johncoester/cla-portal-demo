/* accounting.js : ACCOUNTING TAB (John, Nov 3: "an accounting tab that will allow fees to be added to an ALTA and CD"). PURE helpers, no storage.
 * ONE fee ledger per order feeds two read-only views:
 *   (a) an ALTA Settlement Statement (combined, borrower/buyer view, seller view) in the standard ALTA sections, and
 *   (b) a TRID Closing Disclosure fee view (Loan Costs A/B/C, Other Costs E/F/G/H, D / I / J totals, Seller-Paid and Paid by Others columns,
 *       and the Summaries of Transactions K / L / M / N).
 * TEST ONLY: every printed page says "TEST - not a legal disclosure". Preset amounts are EXAMPLE amounts, never real rates or rate tables.
 * Behind the `accounting` FEATURE FLAG (features.js; off unless config says features.accounting === true; the database has its own switch).
 *
 * Ledger entry (stored fee):
 *   kind 'charge'  a fee / charge. amount = what the payee gets. split = { buyer, seller, lender, other } (who pays what; the parts should add up
 *                  to the amount, otherwise the ledger is flagged OUT OF BALANCE by the difference). timing 'at' | 'before' closing; poc = paid outside
 *                  of closing (always "before"; shown as a memo on the ALTA, in the Before Closing column on the CD). titlePrefix = "Title - " on the CD.
 *   kind 'credit'  money moved between the sides: from (buyer | seller | lender | deposit | other) -> to (buyer | seller). The "from" side is
 *                  debited, the "to" side credited. Prorations / adjustments, seller credits, deposits and the loan amount are credits.
 * Auto entries (never stored, always in step with the order): Sales price (buyer -> seller), Deposit / EMD (deposit -> buyer), Loan amount
 * (lender -> buyer). A refinance has no seller side: no sales price, no deposit, no seller amounts. */
export const ACCOUNTING_OFF = 'Accounting is turned off on this portal.';
export const ACCOUNTING_STAFF_ONLY = 'Accounting is for CLA staff only.';
export const ACCOUNTING_READ_ONLY = 'Accounting is read-only for your role.';
export const TEST_MARK = 'TEST - not a legal disclosure';
export const EXAMPLE_MARK = 'EXAMPLE amount - not a real rate. Enter the real figure.';
export const ACCT_EDIT_ROLES = ['Processor', 'Admin', 'Super admin'];      // + anyone with the Admin flag
export const ACCT_READ_ROLES = ['Sales Person', 'Sales Team', 'Transaction Coordinator'];   // read-only (Caroline Kim, Nov 4 2026: "TCs get read-only access")
export const acctCanRead = (u) => !!u && (u.isAdmin || ACCT_EDIT_ROLES.includes(u.role) || ACCT_READ_ROLES.includes(u.role));
export const acctCanEdit = (u) => !!u && (u.isAdmin || ACCT_EDIT_ROLES.includes(u.role));

export const ALTA_SECTIONS = [
  ['financial', 'Financial'], ['prorations', 'Prorations / Adjustments'], ['loanCharges', 'Loan Charges'], ['otherLoanCharges', 'Other Loan Charges'],
  ['impounds', 'Impounds'], ['title', 'Title Charges & Escrow / Settlement Charges'], ['commission', 'Commission'],
  ['government', 'Government Recording and Transfer Charges'], ['payoffs', 'Payoffs'], ['misc', 'Miscellaneous']];
export const ALTA_KEYS = ALTA_SECTIONS.map(([k]) => k);
export const altaLabel = (k) => (ALTA_SECTIONS.find(([x]) => x === k) || [k, k])[1];
export const CD_FEE_SECTIONS = [
  ['A', 'Origination Charges'], ['B', 'Services Borrower Did Not Shop For'], ['C', 'Services Borrower Did Shop For'],
  ['E', 'Taxes and Other Government Fees'], ['F', 'Prepaids'], ['G', 'Initial Escrow Payment at Closing'], ['H', 'Other']];
export const CD_SUMMARY_SECTIONS = [['K', 'Due from Borrower at Closing'], ['L', 'Paid Already by or on Behalf of Borrower at Closing'], ['M', 'Due to Seller at Closing'], ['N', 'Due from Seller at Closing']];
export const CD_SECTIONS = [...CD_FEE_SECTIONS, ...CD_SUMMARY_SECTIONS, ['', 'Not on the CD fee pages']];
export const CD_KEYS = CD_SECTIONS.map(([k]) => k);
export const cdLabel = (k) => (CD_SECTIONS.find(([x]) => x === k) || [k, k])[1];
export const DEFAULT_CD = { financial: '', prorations: '', loanCharges: 'A', otherLoanCharges: 'B', impounds: 'G', title: 'C', commission: 'H', government: 'E', payoffs: 'N', misc: 'H' };
export const PAYERS = [['buyer', 'Borrower / buyer'], ['seller', 'Seller'], ['lender', 'Lender'], ['other', 'Other']];
export const PAYER_KEYS = PAYERS.map(([k]) => k);
export const FROM_KEYS = ['buyer', 'seller', 'lender', 'deposit', 'other'];
export const FROM_LABEL = { buyer: 'Borrower / buyer', seller: 'Seller', lender: 'Lender (loan funds)', deposit: 'Deposit held', other: 'Other' };
export const TO_KEYS = ['buyer', 'seller'];
export const MAX_AMOUNT = 100000000;

const c = (n) => Math.round((Number(n) || 0) * 100);         // cents
const d = (n) => n / 100;                                      // dollars
export const round2 = (n) => d(c(n));
const fail = (m) => { throw new Error(m); };
const s = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
import { computeProration, cleanProration, prorationRange, PRORATION_ITEMS } from './prorations.js?v=202611041931';
const flag0 = (x) => !!x && x !== 'false' && x !== '0';
// QUALIA layout (John, Nov 4 2026): per-line payments + section settings (meta), the CD text of a line, E.01 recording fees as one line
import { cleanMeta, cdText, recTypeOf, recordingText } from './qualia-charges.js?v=202611041931';
export const closingDateOf = (deal) => (deal && (deal.closingDate ?? deal.closing_date)) || null;
const isRefiDeal = (deal) => !!deal && (deal.transactionType === 'Refinance' || deal.transaction_type === 'Refinance');
const buyerWord = (deal) => (isRefiDeal(deal) ? 'Borrower' : 'Buyer');

export function money(v, label, { allowZero = true } = {}) {
  if (v === '' || v == null) return 0;
  const t = String(v).replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) fail(`${label} must be an amount like 1,250.00 (no minus sign, at most 2 decimals).`);
  const n = Number(t); if (!isFinite(n) || n > MAX_AMOUNT) fail(`${label} is too large.`);
  if (!allowZero && n <= 0) fail(`${label} must be more than zero.`);
  return round2(n);
}

// ---------- validation (same rules in the mock adapter, the Supabase adapter and migration 34) ----------
export function cleanFee(input, deal, prev = null) {
  const v = { ...(prev || {}), ...(input || {}) }; const refi = isRefiDeal(deal);
  // PRORATION (Caroline, Nov 4): a credit in Prorations / Adjustments whose amount and direction are CALCULATED from the order's settlement date
  if (v.proration) {
    if (refi) fail('A refinance has no seller side, so there is nothing to prorate between a buyer and a seller.');
    const p = cleanProration(v.proration); const c = computeProration(p, closingDateOf(deal));
    if (!(c.amount > 0)) fail(`Nothing to prorate: the ${c.from === 'buyer' ? "buyer's" : "seller's"} share for this period is $0.00 on the settlement date ${c.settlementDate}.`);
    const label = (PRORATION_ITEMS.find(([k]) => k === p.item) || [, 'Proration'])[1];
    Object.assign(v, { kind: 'credit', altaSection: 'prorations', cdSection: '', amount: c.amount.toFixed(2), from: c.from, to: c.to, lenderCredit: false, description: s(input && input.description != null ? input.description : v.description, 200) || label,
      proration: { ...p, calc: { settlementDate: c.settlementDate, amount: c.amount, perDiem: c.perDiem, days: c.days, sellerDays: c.sellerDays, buyerDays: c.buyerDays, totalDays: c.totalDays, periodEnd: c.periodEnd, rangeFrom: c.rangeFrom, rangeTo: c.rangeTo, text: c.text } } });
  }
  const kind = v.kind === 'credit' ? 'credit' : v.kind === 'charge' || v.kind == null ? 'charge' : fail('Type must be a charge or a credit.');
  const description = s(v.description, 200) || fail('Description is required.');
  const altaSection = s(v.altaSection, 40) || 'misc'; if (!ALTA_KEYS.includes(altaSection)) fail('Pick an ALTA section from the list.');
  let cdSection = v.cdSection == null ? (kind === 'credit' ? '' : DEFAULT_CD[altaSection]) : s(v.cdSection, 2).toUpperCase(); if (!CD_KEYS.includes(cdSection)) fail('Pick a CD section from the list.');
  const cdLine = s(v.cdLine, 2); if (cdLine && !/^(0[1-9]|[1-9][0-9])$/.test(cdLine)) fail('CD line must be 01 to 99.');
  // Qualia shows description-only lines (e.g. "H.01 Home Warranty" with no amount yet): a charge on a NUMBERED line of a CD fee section A-H may be
  // $0.00; anything else must be more than zero (as before)
  const amount = money(v.amount, 'Amount', { allowZero: kind === 'charge' && !!cdLine && CD_FEE_SECTIONS.some(([k]) => k === cdSection) && !flag0(v.reduces) });
  const payee = s(v.payee, 120); const note = s(v.note, 1000);
  const out = { kind, description, altaSection, cdSection, cdLine, payee, amount, note, presetKey: s(v.presetKey, 160) || null, reduces: undefined, lenderCredit: undefined, proration: undefined, meta: cleanMeta(v.meta) || undefined };
  const flag = (x) => !!x && x !== 'false' && x !== '0';
  if (kind === 'charge') {
    if (['K', 'L', 'M'].includes(cdSection)) fail('A charge goes in a CD fee section (A-H), N (seller) or none.');
    const paidBy = v.paidBy || (v.split ? 'split' : 'buyer');
    let split;
    if (paidBy === 'split') { split = {}; for (const k of PAYER_KEYS) split[k] = money((v.split || {})[k], `Paid by ${PAYERS.find(([x]) => x === k)[1]}`); }
    else if (PAYER_KEYS.includes(paidBy)) { split = { buyer: 0, seller: 0, lender: 0, other: 0 }; split[paidBy] = amount; }
    else fail('Paid by must be borrower / buyer, seller, lender, other or split.');
    if (refi && split.seller > 0) fail('A refinance has no seller side: nothing can be seller-paid.');
    const parts = PAYER_KEYS.reduce((t, k) => t + c(split[k]), 0);
    if (parts > c(amount)) fail('The paid-by amounts add up to more than the fee amount.');
    if (cdSection === 'N' && c(split.seller) === 0) fail('Section N is for seller-paid items.');
    const poc = !!v.poc && v.poc !== 'false' && v.poc !== '0';
    const timing = poc ? 'before' : v.timing === 'before' ? 'before' : v.timing == null || v.timing === 'at' ? 'at' : fail('Paid must be at closing or before closing.');
    const titlePrefix = !!v.titlePrefix && v.titlePrefix !== 'false' && v.titlePrefix !== '0';
    if (titlePrefix && altaSection !== 'title') fail('The "Title -" prefix is only for title charges (ALTA Title Charges section).');
    Object.assign(out, { paidBy: c(amount) === 0 && paidBy !== 'split' ? paidBy : PAYER_KEYS.filter((k) => split[k] > 0).length === 1 && parts === c(amount) ? PAYER_KEYS.find((k) => split[k] > 0) : 'split', split, timing, poc, titlePrefix, from: null, to: null });
    // AGGREGATE ADJUSTMENT (Caroline, Nov 4: initial escrow payment, CD section G): a charge that REDUCES the borrower's total (shown negative)
    if (flag(v.reduces)) { if (cdSection !== 'G' || altaSection !== 'impounds') fail('Only an escrow aggregate adjustment (ALTA Impounds, CD section G) can reduce the total.');
      if (out.paidBy !== 'buyer' || poc) fail('An aggregate adjustment is borrower-side, at closing.'); out.reduces = true; }
  } else {
    if (CD_FEE_SECTIONS.some(([k]) => k === cdSection)) fail('A credit or adjustment is not a CD fee: use K / L / M / N or none.');
    const from = s(v.from, 20); const to = s(v.to, 20);
    if (!FROM_KEYS.includes(from)) fail('Credit from: pick borrower / buyer, seller, lender, deposit held or other.');
    if (!TO_KEYS.includes(to)) fail('Credit to: pick borrower / buyer or seller.');
    if (from === to) fail('A credit must go from one side to the other.');
    if (refi && (from === 'seller' || to === 'seller')) fail('A refinance has no seller side.');
    if (v.titlePrefix === true) fail('The "Title -" prefix is only for title charges.');
    Object.assign(out, { paidBy: null, split: null, timing: 'at', poc: false, titlePrefix: false, from, to });
    // LENDER CREDIT (Caroline, Nov 4): lender money toward the borrower's closing costs. On the CD it is the "Lender Credits" line in J (it
    // lowers Total Closing Costs), not a line in L; on the ALTA it is a borrower credit. Stored with cd section '' (not a K-N line).
    if (flag(v.lenderCredit)) { if (from !== 'lender' || to !== 'buyer') fail('A lender credit goes from the lender to the borrower / buyer.'); out.lenderCredit = true; out.cdSection = ''; }
    if (v.proration) { if (out.altaSection !== 'prorations') fail('A proration belongs in Prorations / Adjustments.'); out.proration = v.proration; out.cdSection = ''; }
  }
  return out;
}
export const FEE_FIELDS = ['kind', 'description', 'altaSection', 'cdSection', 'cdLine', 'payee', 'amount', 'paidBy', 'split', 'timing', 'poc', 'titlePrefix', 'from', 'to', 'note', 'reduces', 'lenderCredit', 'proration', 'meta'];
export function feeChanges(before, after) {
  const n = (k, x) => ((k === 'reduces' || k === 'lenderCredit' || k === 'meta') && !x ? null : x ?? null);   // false / missing = the same (older fees have neither)
  const out = []; for (const k of FEE_FIELDS) { const a = n(k, before ? before[k] : undefined); const b = n(k, after[k]); if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: k, old: a, new: b }); }
  return out;
}

// ---------- CLA RATES (fee-engine.js; John, Nov 3: "start working on having our fees recording fees into the system") ----------
// A fee added by "Calculate fees from CLA rates" carries source 'cla-rates' and a calc block { key, fields, rateSource, calculation, inputs,
// version, at }: fields = what the calculation set. A person changing any CALC_FIELDS value makes it OVERRIDDEN (derived, never stored as the
// truth): re-running the calculation keeps overridden lines as they are and only updates untouched ones. The note is free to edit.
export const CALC_SOURCE_ID = 'cla-rates';
export const CALC_TAG = 'From CLA rates';
export const CALC_FIELDS = ['description', 'altaSection', 'cdSection', 'cdLine', 'payee', 'amount', 'paidBy', 'split', 'titlePrefix', 'timing', 'poc'];
const normSplit = (sp) => (sp ? { buyer: round2(sp.buyer), seller: round2(sp.seller), lender: round2(sp.lender), other: round2(sp.other) } : null);
export const calcFields = (x) => Object.fromEntries(CALC_FIELDS.map((k) => [k, k === 'split' ? normSplit(x.split) : k === 'amount' ? round2(x.amount) : x[k] ?? (k === 'cdLine' || k === 'payee' ? '' : k === 'titlePrefix' || k === 'poc' ? false : null)]));
export const isCalculated = (f) => !!f && f.source === CALC_SOURCE_ID && !!f.calc && !!f.calc.key;
const sameJ = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export const isOverridden = (f) => isCalculated(f) && CALC_FIELDS.some((k) => !sameJ(calcFields(f)[k], (f.calc.fields || {})[k]));
// what the page and the statements see: the stored fee + overridden (derived)
export const withCalcFlags = (f) => (isCalculated(f) ? { ...f, overridden: isOverridden(f) } : f);

// ---------- auto entries from the order (not stored; always in step with the order) ----------
export function autoEntries(deal) {
  if (!deal) return []; const refi = isRefiDeal(deal); const out = []; const pp = Number(deal.purchasePrice ?? deal.purchase_price) || 0; const la = Number(deal.loanAmount ?? deal.loan_amount) || 0; const emd = Number(deal.emdAmount ?? deal.emd_amount) || 0;
  const base = { auto: true, kind: 'credit', altaSection: 'financial', cdLine: '', payee: '', note: 'From the order (change it on File Overview).', split: null, timing: 'at', poc: false, titlePrefix: false, retired: false };
  if (!refi && pp > 0) out.push({ ...base, id: 'auto-salesPrice', autoKey: 'salesPrice', description: 'Sale Price of Property', amount: round2(pp), from: 'buyer', to: 'seller', cdSection: 'K', cdLine: '01' });
  if (!refi && emd > 0) out.push({ ...base, id: 'auto-deposit', autoKey: 'deposit', description: 'Deposit (earnest money)', amount: round2(emd), from: 'deposit', to: 'buyer', cdSection: 'L', cdLine: '01' });
  if (la > 0) out.push({ ...base, id: 'auto-loanAmount', autoKey: 'loanAmount', description: 'Loan Amount', amount: round2(la), from: 'lender', to: 'buyer', cdSection: 'L', cdLine: '02' });
  return out;
}
// PRORATIONS follow the order's CURRENT settlement date (Caroline, Nov 4: "calculated automatically from the settlement date"): the statements
// use the live calculation; prorationStale says the saved amount / date differ (an editor re-saves it, which logs the change).
export function liveProration(f, deal) {
  if (!f || !f.proration || f.retired) return f;
  try { const c = computeProration(f.proration, closingDateOf(deal)); const saved = f.proration.calc || {};
    const stale = c.amount !== Number(f.amount) || c.settlementDate !== saved.settlementDate || c.from !== f.from;
    if (!(c.amount > 0)) return { ...f, prorationError: `Nothing to prorate on the settlement date ${c.settlementDate}: the saved amount is kept.`, prorationLive: c };
    return { ...f, amount: c.amount, from: c.from, to: c.to, prorationLive: c, prorationStale: stale ? { savedAmount: Number(f.amount), savedDate: saved.settlementDate || null } : null };
  } catch (e) { return { ...f, prorationError: e.message }; }
}
export const allEntries = (deal, fees, { includeRetired = false } = {}) => [...autoEntries(deal), ...(fees || []).filter((f) => includeRetired || !f.retired).map((f) => liveProration(f, deal))];

// ---------- running totals + balance check ----------
export function ledgerTotals(deal, fees) {
  const refi = isRefiDeal(deal); const L = allEntries(deal, fees);
  const t = { bD: 0, bC: 0, sD: 0, sC: 0, lender: 0, other: 0, poc: 0, receiptsIn: 0, disbursed: 0, unallocated: 0 }; const issues = []; const warnings = [];
  for (const e of L) { if (e.prorationError) warnings.push(`Proration "${e.description}": ${e.prorationError}`); else if (e.prorationStale) warnings.push(`Proration "${e.description}": the settlement date changed, so the statements now use ${fmt(c(e.amount))} (saved ${fmt(c(e.prorationStale.savedAmount))}). Re-save prorations to log it.`); }
  for (const e of L) {
    if (e.kind === 'charge') {
      const sp = e.split || {}; const parts = PAYER_KEYS.reduce((x, k) => x + c(sp[k]), 0); const amt = c(e.amount);
      if (parts !== amt) { t.unallocated += amt - parts; issues.push(`"${e.description}": paid-by amounts add up to ${fmt(parts)}, not ${fmt(amt)} (${fmt(amt - parts)} not assigned).`); }
      if (refi && c(sp.seller) > 0) issues.push(`"${e.description}": seller-paid on a refinance.`);
      if (e.timing === 'before' || e.poc) { t.poc += amt; continue; }
      const g = e.reduces ? -1 : 1;   // an aggregate adjustment lowers the borrower's escrow deposit
      t.bD += g * c(sp.buyer); t.sD += c(sp.seller); t.lender += c(sp.lender); t.other += c(sp.other);
      t.receiptsIn += c(sp.lender) + c(sp.other); t.disbursed += g * amt;
    } else {
      const amt = c(e.amount);
      if (e.from === 'buyer') t.bD += amt; else if (e.from === 'seller') t.sD += amt; else t.receiptsIn += amt;   // lender / deposit / other money comes in
      if (e.to === 'buyer') t.bC += amt; else if (e.to === 'seller') t.sC += amt; else issues.push(`"${e.description}": credit has no receiving side.`);
    }
  }
  const dueFromBuyer = Math.max(0, t.bD - t.bC), dueToBuyer = Math.max(0, t.bC - t.bD), dueFromSeller = Math.max(0, t.sD - t.sC), dueToSeller = Math.max(0, t.sC - t.sD);
  const receipts = t.receiptsIn + dueFromBuyer + dueFromSeller; const disbursements = t.disbursed + dueToBuyer + dueToSeller;
  const totalDebits = t.bD + t.sD, totalCredits = t.bC + t.sC;
  const balanced = receipts === disbursements && !issues.length;
  if (receipts !== disbursements && !t.unallocated) issues.push(`Funds in ${fmt(receipts)} do not equal funds out ${fmt(disbursements)}.`);
  return { refi, buyerDebits: d(t.bD), buyerCredits: d(t.bC), sellerDebits: d(t.sD), sellerCredits: d(t.sC), paidByLender: d(t.lender), paidByOther: d(t.other), paidOutsideClosing: d(t.poc),
    dueFromBuyer: d(dueFromBuyer), dueToBuyer: d(dueToBuyer), dueFromSeller: d(dueFromSeller), dueToSeller: d(dueToSeller),
    totalDebits: d(totalDebits), totalCredits: d(totalCredits), receipts: d(receipts), disbursements: d(disbursements), difference: d(receipts - disbursements),
    // combined statement check: each side's debits + due-to = credits + due-from (always true when every fee's parts add up)
    buyerBalanced: t.bD + dueToBuyer === t.bC + dueFromBuyer, sellerBalanced: t.sD + dueToSeller === t.sC + dueFromSeller,
    balanced, issues, warnings, entries: L.length };
}
const fmt = (cents) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- ALTA Settlement Statement ----------
// view 'combined' | 'buyer' | 'seller'. Columns: seller debit / credit, buyer debit / credit. Paid-outside-closing items and lender / other-paid
// parts are memo text ("POC", "paid by lender"), not in the columns.
export function altaStatement(deal, fees, view = 'combined') {
  const refi = isRefiDeal(deal); const v = refi && view === 'seller' ? 'buyer' : view; const L = allEntries(deal, fees); const T = ledgerTotals(deal, fees);
  const sections = ALTA_SECTIONS.map(([key, label]) => ({ key, label, rows: [] }));
  for (const e of L) {
    const row = { id: e.id, auto: !!e.auto, description: e.description, payee: e.payee, buyerDebit: 0, buyerCredit: 0, sellerDebit: 0, sellerCredit: 0, memo: [] };
    if (e.kind === 'charge') {
      const sp = e.split || {};
      if (e.timing === 'before' || e.poc) { const who = PAYER_KEYS.filter((k) => Number(sp[k]) > 0).map((k) => (k === 'buyer' ? buyerWord(deal) : PAYERS.find(([x]) => x === k)[1]).toLowerCase()); row.memo.push(`POC ${fmt(c(e.amount))}${who.length ? ' by ' + who.join(' / ') : ''}`); }
      else { row.buyerDebit = round2((e.reduces ? -1 : 1) * (sp.buyer || 0)); row.sellerDebit = round2(sp.seller || 0); if (e.reduces) row.memo.push('aggregate adjustment (reduces the escrow deposit)'); if (Number(sp.lender) > 0) row.memo.push(`${fmt(c(sp.lender))} paid by lender`); if (Number(sp.other) > 0) row.memo.push(`${fmt(c(sp.other))} paid by others`); }
      if (e.payee) row.memo.unshift(`to ${e.payee}`);
    } else {
      if (e.from === 'buyer') row.buyerDebit = e.amount; if (e.from === 'seller') row.sellerDebit = e.amount;
      if (e.to === 'buyer') row.buyerCredit = e.amount; if (e.to === 'seller') row.sellerCredit = e.amount;
      if (e.lenderCredit) row.memo.push('Lender credit (CD section J)'); else if (['lender', 'deposit', 'other'].includes(e.from)) row.memo.push(FROM_LABEL[e.from]);
      if (e.proration && e.prorationLive) row.memo.push(`${prorationRange(e.prorationLive)} · ${e.prorationLive.days} day${e.prorationLive.days === 1 ? '' : 's'} × $${e.prorationLive.perDiem.toFixed(5)}/day (${e.proration.basis === 'installment' ? 'installment' : e.proration.basis + '-day year'}, ${e.from === 'buyer' ? 'paid in advance by seller' : 'unpaid by seller'})`);
      if (e.prorationError) row.memo.push('CHECK: ' + e.prorationError);
    }
    const shows = v === 'combined' ? true : v === 'buyer' ? row.buyerDebit || row.buyerCredit || (e.kind === 'charge' && Number((e.split || {}).buyer) > 0) : row.sellerDebit || row.sellerCredit || (e.kind === 'charge' && Number((e.split || {}).seller) > 0);
    if (!shows) continue;
    row.memo = row.memo.join('; ');
    (sections.find((x) => x.key === e.altaSection) || sections[sections.length - 1]).rows.push(row);
  }
  return { view: v, refi, buyerLabel: refi ? 'Borrower' : 'Buyer / Borrower', sections,
    subtotals: { buyerDebit: T.buyerDebits, buyerCredit: T.buyerCredits, sellerDebit: T.sellerDebits, sellerCredit: T.sellerCredits },
    due: { fromBuyer: T.dueFromBuyer, toBuyer: T.dueToBuyer, fromSeller: T.dueFromSeller, toSeller: T.dueToSeller },
    totals: { buyerDebit: round2(T.buyerDebits + T.dueToBuyer), buyerCredit: round2(T.buyerCredits + T.dueFromBuyer), sellerDebit: round2(T.sellerDebits + T.dueToSeller), sellerCredit: round2(T.sellerCredits + T.dueFromSeller) },
    balance: T, mark: TEST_MARK };
}

// ---------- TRID Closing Disclosure fee view ----------
export const cdDescription = (e) => (e.titlePrefix && !/^title\s*-/i.test(e.description) ? 'Title - ' + e.description : e.description);
export function closingDisclosure(deal, fees) {
  const refi = isRefiDeal(deal); const L = allEntries(deal, fees);
  const sec = Object.fromEntries(CD_FEE_SECTIONS.map(([k, label]) => [k, { key: k, label, rows: [], borrowerAt: 0, borrowerBefore: 0, sellerAt: 0, sellerBefore: 0, others: 0 }]));
  const charges = L.filter((e) => e.kind === 'charge');
  for (const e of charges.filter((x) => sec[x.cdSection])) {
    const sp = e.split || {}; const before = e.timing === 'before' || e.poc;
    const g = e.reduces ? -1 : 1;
    const r = { id: e.id, line: e.cdLine, description: cdDescription({ ...e, description: cdText(e, deal) }), payee: e.payee, recType: recTypeOf(e), reduces: !!e.reduces, borrowerAt: before ? 0 : round2(g * (sp.buyer || 0)), borrowerBefore: before ? round2(sp.buyer || 0) : 0,
      sellerAt: before ? 0 : round2(sp.seller || 0), sellerBefore: before ? round2(sp.seller || 0) : 0, others: round2((Number(sp.lender) || 0) + (Number(sp.other) || 0)), othersWho: ['lender', 'other'].filter((k) => Number(sp[k]) > 0).map((k) => (k === 'lender' ? 'L' : 'O')).join('/') };
    sec[e.cdSection].rows.push(r);
  }
  // E.01 RECORDING FEES (TRID / Qualia): every recording-fee line (deed, mortgage, release ...) is ONE line "Recording fees: Deed: $60.00 Mortgage: $60.00"
  { const E = sec.E; const rec = E.rows.filter((r) => r.recType); if (rec.length) { const sumf = (f) => round2(rec.reduce((t, x) => t + c(x[f]), 0) / 100);
    const merged = { id: 'E-recording', line: '01', description: recordingText(rec.map((x) => ({ type: x.recType, amount: round2(x.borrowerAt + x.borrowerBefore + x.sellerAt + x.sellerBefore + x.others) }))), payee: [...new Set(rec.map((x) => x.payee).filter(Boolean))].join(', '),
      borrowerAt: sumf('borrowerAt'), borrowerBefore: sumf('borrowerBefore'), sellerAt: sumf('sellerAt'), sellerBefore: sumf('sellerBefore'), others: sumf('others'), othersWho: [...new Set(rec.map((x) => x.othersWho).filter(Boolean))].join('/'), recording: rec.map((x) => ({ id: x.id, type: x.recType })) };
    E.rows = [merged, ...E.rows.filter((r) => !r.recType).map((r) => (r.line === '01' ? { ...r, line: '' } : r))]; } }
  // ONE CD line per charge (TRID / Qualia: "Title - Settlement Fee" shows the borrower part and the seller part on the same line): a buyer-only fee and a
  // seller-only fee with the same description and payee in the same section are shown as one row; `parts` keeps the two ledger fees.
  for (const k of Object.keys(sec)) { const S = sec[k]; const out = [];
    const sideOf = (r) => { const b = c(r.borrowerAt) + c(r.borrowerBefore), sl = c(r.sellerAt) + c(r.sellerBefore), o = c(r.others); return o ? null : b && !sl ? 'buyer' : sl && !b ? 'seller' : null; };
    for (const r of S.rows) { const side = sideOf(r); const twin = side && !r.recording && !r.reduces && out.find((x) => !x.recording && !x.reduces && x.description === r.description && (x.payee || '') === (r.payee || '') && (!x.line || !r.line || x.line === r.line) && x.parts.length === 1 && x.parts[0].side !== side && x.parts[0].side);
      if (twin) { for (const f of ['borrowerAt', 'borrowerBefore', 'sellerAt', 'sellerBefore']) twin[f] = round2((c(twin[f]) + c(r[f])) / 100); twin.parts.push({ id: r.id, side }); if (!twin.line) twin.line = r.line; continue; }
      out.push({ ...r, parts: [{ id: r.id, side }] }); }
    S.rows = out.map((r) => (r.parts.length > 1 ? r : (({ parts, ...x }) => x)(r))); }
  for (const k of Object.keys(sec)) { const S = sec[k];
    if (k === 'B' || k === 'C') S.rows.sort((a, b) => (a.line && b.line ? a.line.localeCompare(b.line) : a.line ? -1 : b.line ? 1 : a.description.localeCompare(b.description)));   // B and C: alphabetical (TRID)
    else S.rows.sort((a, b) => (a.line && b.line ? a.line.localeCompare(b.line) : a.line ? -1 : b.line ? 1 : 0));
    if (k === 'E' && S.rows[0] && S.rows[0].id === 'E-recording') S.rows.slice(1).forEach((r, i) => { r.line = String(i + 2).padStart(2, '0'); });   // E.01 recording, then E.02+ in order
    { const used = new Set(S.rows.filter((r) => r.line).map((r) => r.line)); let n = 0;   // unnumbered lines take the next free number
      S.rows.forEach((r) => { if (!r.line) { do n++; while (used.has(String(n).padStart(2, '0'))); r.line = String(n).padStart(2, '0'); used.add(r.line); } }); }
    for (const f of ['borrowerAt', 'borrowerBefore', 'sellerAt', 'sellerBefore', 'others']) S[f] = round2(S.rows.reduce((t, r) => t + c(r[f]), 0) / 100); }
  const sum = (keys, f) => round2(keys.reduce((t, k) => t + c(sec[k][f]), 0) / 100);
  const tot = (keys) => ({ borrowerAt: sum(keys, 'borrowerAt'), borrowerBefore: sum(keys, 'borrowerBefore'), sellerAt: sum(keys, 'sellerAt'), sellerBefore: sum(keys, 'sellerBefore'), others: sum(keys, 'others') });
  const D = tot(['A', 'B', 'C']); const I = tot(['E', 'F', 'G', 'H']); const J = tot(['A', 'B', 'C', 'E', 'F', 'G', 'H']);
  // LENDER CREDITS (Caroline, Nov 4): J = D + I - Lender Credits (borrower-paid at closing column)
  const lcRows = L.filter((e) => e.kind === 'credit' && e.lenderCredit).map((e) => ({ id: e.id, description: e.description, amount: round2(e.amount) }));
  J.lenderCredits = round2(lcRows.reduce((t, x) => t + c(x.amount), 0) / 100); J.lenderCreditRows = lcRows; J.beforeCredits = J.borrowerAt;
  J.borrowerAt = round2(J.borrowerAt - J.lenderCredits);
  D.borrower = round2(D.borrowerAt + D.borrowerBefore); I.borrower = round2(I.borrowerAt + I.borrowerBefore); J.borrower = round2(J.borrowerAt + J.borrowerBefore);
  // Summaries of Transactions
  const K = [], Lr = [], M = [], N = [];
  const add = (list, label, amount, id, group) => { if (c(amount)) list.push({ label, amount: round2(amount), id, ...(group ? { group } : {}) }); };
  for (const e of L) {
    if (e.kind === 'credit' && e.lenderCredit) continue;   // in J (Lender Credits), not in L
    if (e.kind === 'credit' && e.proration && e.prorationLive) {   // calculated proration: the CD shows the date range it covers
      const lab = `${e.description} ${prorationRange(e.prorationLive)}`;
      if (e.from === 'buyer') { add(K, lab, e.amount, e.id, 'advance'); add(M, lab, e.amount, e.id, 'advance'); } else { add(Lr, lab, e.amount, e.id, 'unpaid'); add(N, lab, e.amount, e.id, 'unpaid'); }
      continue; }
    if (e.kind === 'credit') {
      const pr = e.altaSection === 'prorations';
      if (e.autoKey === 'salesPrice') { add(K, 'Sale Price of Property', e.amount, e.id); add(M, 'Sale Price of Property', e.amount, e.id); continue; }
      if (e.autoKey === 'deposit') { add(Lr, 'Deposit', e.amount, e.id); continue; }
      if (e.autoKey === 'loanAmount') { add(Lr, 'Loan Amount', e.amount, e.id); continue; }
      const tag = pr ? (e.from === 'buyer' ? 'Adjustment for item paid by seller in advance: ' : 'Adjustment for item unpaid by seller: ') : '';
      if (e.from === 'buyer') add(K, tag + e.description, e.amount, e.id);
      if (e.to === 'buyer') add(Lr, (e.from === 'seller' && !pr ? 'Seller Credit: ' : tag) + e.description, e.amount, e.id);
      if (e.to === 'seller') add(M, tag + e.description, e.amount, e.id);
      if (e.from === 'seller') add(N, (e.to === 'buyer' && !pr ? 'Seller Credit: ' : tag) + e.description, e.amount, e.id);
    } else if (!sec[e.cdSection] && !(e.timing === 'before' || e.poc)) {      // not a CD fee: a summary line (e.g. a payoff in N)
      const sp = e.split || {}; add(K, e.description, sp.buyer || 0, e.id); add(N, (e.altaSection === 'payoffs' && !String(e.presetKey || '').startsWith('payoff:') ? 'Payoff: ' : '') + e.description, sp.seller || 0, e.id);
    }
  }
  if (c(J.borrowerAt) > 0) K.splice(K.findIndex((x) => x.id === 'auto-salesPrice') + 1, 0, { label: 'Closing Costs Paid at Closing (J)', amount: J.borrowerAt, id: 'J-borrower' });
  else if (c(J.borrowerAt) < 0) Lr.push({ label: 'Lender Credits in excess of Closing Costs (J)', amount: round2(-J.borrowerAt), id: 'J-excess' });
  if (!refi && c(J.sellerAt)) N.unshift({ label: 'Closing Costs Paid at Closing (J)', amount: J.sellerAt, id: 'J-seller' });
  const total = (l) => round2(l.reduce((t, x) => t + c(x.amount), 0) / 100);
  const Kt = total(K), Lt = total(Lr), Mt = total(M), Nt = total(N);
  return { refi, sections: CD_FEE_SECTIONS.map(([k]) => sec[k]), D, I, J,
    summaries: { K: { label: 'Due from Borrower at Closing', rows: K, total: Kt }, L: { label: 'Paid Already by or on Behalf of Borrower at Closing', rows: Lr, total: Lt },
      ...(refi ? {} : { M: { label: 'Due to Seller at Closing', rows: M, total: Mt }, N: { label: 'Due from Seller at Closing', rows: N, total: Nt } }) },
    cashToClose: round2(Kt - Lt), cashToSeller: refi ? null : round2(Mt - Nt), mark: TEST_MARK };
}

// ---------- presets (EXAMPLE amounts only; never a real rate table) ----------
// basis 'price' / 'loan' = EXAMPLE dollars per $1,000 of the order's purchase price / loan amount (fake round numbers, labeled EXAMPLE).
export const PRESET_STATES = [['ALL', 'Common (any state)'], ['MD', 'Maryland'], ['VA', 'Virginia'], ['DC', 'District of Columbia'], ['FL', 'Florida']];
const P = (key, state, label, o) => ({ key, state, label, description: o.description || label, kind: o.kind || 'charge', altaSection: o.alta, cdSection: o.cd ?? DEFAULT_CD[o.alta], paidBy: o.paidBy || 'buyer',
  titlePrefix: !!o.title, payee: o.payee || '', basis: o.basis || null, example: o.example, note: EXAMPLE_MARK + (o.note ? ' ' + o.note : '') });
export const FEE_PRESETS = [
  P('settlement', 'ALL', 'Settlement / closing fee', { alta: 'title', cd: 'C', title: true, payee: 'CLA Title & Escrow (example)', example: 500 }),
  P('titleSearch', 'ALL', 'Title search / examination', { alta: 'title', cd: 'C', title: true, payee: 'CLA Title & Escrow (example)', example: 250 }),
  P('lendersPolicy', 'ALL', "Lender's title insurance", { alta: 'title', cd: 'C', title: true, payee: 'Example Title Underwriter', basis: 'loan', example: 2 }),
  P('ownersPolicy', 'ALL', "Owner's title insurance (optional)", { alta: 'title', cd: 'H', title: true, payee: 'Example Title Underwriter', basis: 'price', example: 1, note: 'TRID shows the owner\'s policy in H with "(optional)".' }),
  P('endorsements', 'ALL', 'Title endorsements (e.g. ALTA 8.1, 9)', { alta: 'title', cd: 'C', title: true, payee: 'Example Title Underwriter', example: 100 }),
  P('cpl', 'ALL', 'Closing protection letter', { alta: 'title', cd: 'C', title: true, payee: 'Example Title Underwriter', example: 50 }),
  P('courier', 'ALL', 'Courier / wire fee', { alta: 'title', cd: 'C', title: true, payee: 'CLA Title & Escrow (example)', example: 40 }),
  P('recordingDeed', 'ALL', 'Recording fee - deed', { alta: 'government', cd: 'E', payee: 'Clerk of the court (example)', example: 60 }),
  P('recordingMortgage', 'ALL', 'Recording fee - mortgage / deed of trust', { alta: 'government', cd: 'E', payee: 'Clerk of the court (example)', example: 80 }),
  P('originationFee', 'ALL', 'Loan origination fee', { alta: 'loanCharges', cd: 'A', payee: 'Example Lender', example: 1000 }),
  P('appraisal', 'ALL', 'Appraisal fee', { alta: 'otherLoanCharges', cd: 'B', payee: 'Example Appraisal Co.', example: 500 }),
  P('homeownersIns', 'ALL', "Homeowner's insurance premium (12 mo.)", { alta: 'otherLoanCharges', cd: 'F', payee: 'Example Insurance Co.', example: 1200 }),
  P('escrowTaxes', 'ALL', 'Property taxes escrow (initial deposit)', { alta: 'impounds', cd: 'G', payee: 'Example Lender', example: 900 }),
  P('commission', 'ALL', 'Real estate commission', { alta: 'commission', cd: 'H', paidBy: 'seller', payee: 'Example Realty', example: 10000 }),
  P('lenderCredit', 'ALL', 'Lender credit (CD section J)', { alta: 'loanCharges', kind: 'credit', cd: '', payee: '', example: 500, note: 'Lender credits lower Total Closing Costs (J) on the CD.' }),
  P('payoff', 'ALL', 'Payoff of first mortgage loan', { alta: 'payoffs', cd: 'N', paidBy: 'seller', payee: 'Example Mortgage Servicer', example: 150000 }),
  P('md-stateTransfer', 'MD', 'MD state transfer tax', { alta: 'government', cd: 'E', paidBy: 'split', basis: 'price', example: 1, payee: 'Clerk of the Circuit Court (example)', note: 'Split shown 50/50 as an example only.' }),
  P('md-countyTransfer', 'MD', 'MD county transfer tax', { alta: 'government', cd: 'E', paidBy: 'split', basis: 'price', example: 1, payee: 'County finance office (example)', note: 'Split shown 50/50 as an example only.' }),
  P('md-recordation', 'MD', 'MD recordation tax', { alta: 'government', cd: 'E', paidBy: 'split', basis: 'price', example: 1, payee: 'Clerk of the Circuit Court (example)', note: 'Split shown 50/50 as an example only.' }),
  P('md-lienCert', 'MD', 'MD municipal lien certificate', { alta: 'title', cd: 'C', title: true, paidBy: 'seller', payee: 'Example County (example)', example: 75 }),
  P('va-grantor', 'VA', 'VA grantor tax', { alta: 'government', cd: 'E', paidBy: 'seller', basis: 'price', example: 1, payee: 'Clerk of the Circuit Court (example)' }),
  P('va-stateRecordation', 'VA', 'VA state recordation tax (deed)', { alta: 'government', cd: 'E', basis: 'price', example: 1, payee: 'Clerk of the Circuit Court (example)' }),
  P('va-localRecordation', 'VA', 'VA county / city recordation tax', { alta: 'government', cd: 'E', basis: 'price', example: 1, payee: 'Clerk of the Circuit Court (example)' }),
  P('dc-recordation', 'DC', 'DC deed recordation tax', { alta: 'government', cd: 'E', basis: 'price', example: 1, payee: 'DC Recorder of Deeds (example)' }),
  P('dc-transfer', 'DC', 'DC deed transfer tax', { alta: 'government', cd: 'E', paidBy: 'seller', basis: 'price', example: 1, payee: 'DC Recorder of Deeds (example)' }),
  P('fl-docStampsDeed', 'FL', 'FL documentary stamp tax - deed', { alta: 'government', cd: 'E', paidBy: 'seller', basis: 'price', example: 1, payee: 'Clerk of Court (example)' }),
  P('fl-docStampsNote', 'FL', 'FL documentary stamp tax - note', { alta: 'government', cd: 'E', basis: 'loan', example: 1, payee: 'Clerk of Court (example)' }),
  P('fl-intangible', 'FL', 'FL intangible tax - mortgage', { alta: 'government', cd: 'E', basis: 'loan', example: 1, payee: 'Clerk of Court (example)' }),
];
export const presetsFor = (state) => FEE_PRESETS.filter((p) => p.state === 'ALL' || !state || p.state === state);
// EXAMPLE amount for a preset on this order (flat EXAMPLE, or EXAMPLE dollars per $1,000 of price / loan). 0 when the basis is missing.
export function presetAmount(p, deal) {
  if (!p) return 0; if (!p.basis) return round2(p.example);
  const base = p.basis === 'price' ? Number(deal && (deal.purchasePrice ?? deal.purchase_price)) || 0 : Number(deal && (deal.loanAmount ?? deal.loan_amount)) || 0;
  return round2(Math.round(base / 1000 * p.example * 100) / 100);
}
export function presetFee(key, deal) {
  const p = FEE_PRESETS.find((x) => x.key === key) || fail('Unknown fee preset.');
  const refi = isRefiDeal(deal); const amount = presetAmount(p, deal);
  let paidBy = p.paidBy; let split = null;
  if (refi && (paidBy === 'seller' || paidBy === 'split')) paidBy = 'buyer';
  if (paidBy === 'split') { const half = Math.floor(c(amount) / 2); split = { buyer: d(c(amount) - half), seller: d(half), lender: 0, other: 0 }; }
  if (p.kind === 'credit') return { presetKey: p.key, kind: 'credit', description: p.description, altaSection: p.altaSection, cdSection: '', payee: '', amount, from: 'lender', to: 'buyer', lenderCredit: p.key === 'lenderCredit', note: p.note };
  return { presetKey: p.key, kind: p.kind, description: p.description, altaSection: p.altaSection, cdSection: refi && p.cdSection === 'N' ? 'H' : p.cdSection, payee: p.payee, amount, paidBy, split,
    titlePrefix: p.titlePrefix, timing: 'at', poc: false, note: p.note + (p.basis ? ` (EXAMPLE $${p.example} per $1,000 of the ${p.basis === 'price' ? 'purchase price' : 'loan amount'})` : '') };
}
