/* CONNECT-4 (John Coester, Nov 25 2026, 7:49 PM ET, t2081u; Connect Live Test Checklist row 7.2, Francis Nov 23 2026):
 * the lender and loan info a seller enters on Outstanding Mortgage Information must land in the order's Payoffs section, ready for
 * the processor to order the payoff. The Payoffs page lists each mortgage the seller entered and whether it is already a payoff.
 * The processor adds one (or all) with one click; each becomes the next free payoff tab with the lender, phone, loan number and a note.
 * Amounts stay blank until the payoff statement comes in. Pure functions; the page does the reads and saves (the existing savePayoff). */
import { MAX_PAYOFFS, PAYOFF_TABS } from './payoffs.js?v=202611070139';

export const MORTGAGE_CODE = 'mortgage_info';
const s = (v) => (v == null ? '' : String(v)).trim();
const loanKey = (v) => s(v).replace(/[^0-9A-Za-z]/g, '').toLowerCase();
const nameKey = (v) => s(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const yes = (v) => v === true || v === 'true' || v === 'on' || v === 'Yes';

/* the mortgages on one saved task's answers: v2 is a list (mortgages), v1 was one set of fields. "No mortgage" -> []. */
export function mortgagesFromAnswers(answers) {
  const a = answers || {};
  if (yes(a.none)) return [];
  let list = [];
  if (a.mortgages != null) {
    try { const raw = Array.isArray(a.mortgages) ? a.mortgages : JSON.parse(String(a.mortgages)); if (Array.isArray(raw)) list = raw; } catch (e) { list = []; }
    list = list.map((m) => ({ lender: s(m && m.lender), phone: s(m && m.phone), loanNumber: s(m && (m.loan_number || m.last4)), loanType: s(m && m.loan_type) }));
  } else if (s(a.lender_name)) {
    list = [{ lender: s(a.lender_name), phone: s(a.lender_phone), loanNumber: s(a.loan_last4), loanType: s(a.loan_type) }];
  }
  return list.filter((m) => m.lender);
}

/* the file's seller mortgages from every saved Outstanding Mortgage copy (not cancelled), the same loan listed twice kept once.
 * taskAnswers: [{ task, answers, sellerName }] */
export function sellerMortgages(taskAnswers) {
  const out = []; const seen = new Set();
  for (const { task, answers, sellerName } of taskAnswers || []) {
    for (const m of mortgagesFromAnswers(answers)) {
      const k = loanKey(m.loanNumber) ? 'L' + loanKey(m.loanNumber) : 'N' + nameKey(m.lender);
      if (seen.has(k)) continue; seen.add(k);
      out.push({ ...m, key: k, taskId: task && task.id, sellerName: s(sellerName) });
    }
  }
  return out;
}

/* the payoff already holding this mortgage: same loan number, or (when either has no loan number) the same lender name */
export function matchingPayoff(m, payoffs) {
  const live = (payoffs || []).filter((p) => p && !p.retired);
  const ln = loanKey(m.loanNumber);
  if (ln) { const hit = live.find((p) => loanKey(p.loanNumber) === ln); if (hit) return hit; }
  return live.find((p) => nameKey(p.lender && p.lender.name) === nameKey(m.lender) && (!ln || !loanKey(p.loanNumber))) || null;
}

export function freePositions(payoffs) {
  const used = new Set((payoffs || []).filter((p) => p && !p.retired).map((p) => p.position));
  return Array.from({ length: MAX_PAYOFFS }, (_, i) => i + 1).filter((n) => !used.has(n));
}

/* rows for the page: each mortgage with the payoff tab it is on, or null */
export function payoffRows(mortgages, payoffs) {
  return (mortgages || []).map((m) => { const p = matchingPayoff(m, payoffs); return { ...m, onTab: p ? PAYOFF_TABS[p.position - 1] : null, position: p ? p.position : null }; });
}

/* the savePayoff input for one seller mortgage at a position. Amounts are left for the payoff statement. */
export function payoffInputFor(m, position) {
  if (!(position >= 1 && position <= MAX_PAYOFFS)) throw new Error(`This file already has ${MAX_PAYOFFS} payoffs (First to Fourth Payoff). Retire one before adding another.`);
  const what = [m.loanType, m.sellerName ? `entered by ${m.sellerName}` : ''].filter(Boolean).join(', ');
  return { position, lender: { name: s(m.lender).slice(0, 120), phone: s(m.phone).slice(0, 40) }, loanNumber: s(m.loanNumber).slice(0, 40), isMortgage: true,
    note: `From the seller's Outstanding Mortgage Information task${what ? ` (${what})` : ''}.`.slice(0, 500) };
}
