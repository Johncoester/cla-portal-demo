/* Earnest money captured on Place Order, Edit order details and Accounting: "EMD held by" (financial JSON emdHeldBy, mirrored to emdHolder).
 * Excess deposit (Qualia "excess earnest", CD line N.01; John, Nov 15 2026 "whatever Qualia does"): the part of the deposit another holder already
 * paid to the seller (financial JSON emdToSeller, a number). It is entered on Accounting, Contract figures, Earnest money.
 * Commissions no longer live on the order (Agent fees follow-ups, John Nov 13 2026): they are Agent fees (agent-fees.js, deal_agent_fees),
 * the one place buyers and sellers can't read. The database refuses a commission written to the order (migration 20261119030000).
 * A refinance keeps none of these. */

// commission keys older pages kept in deals.financial (always removed now)
export const OLD_COMMISSION_KEYS = ['commissionBase', 'commissionPercent', 'commissionAdditional', 'commissionTotal', 'commissionPaidBy',
  'listingCommissionPercent', 'listingCommissionAmount', 'buyerCommissionPercent', 'buyerCommissionAmount'];
export const OLD_COMMISSION_REFUSED = 'Commissions are now kept in the Agent fees box on the file overview. Reload the page and enter them there. Nothing was saved.';
export function withoutOldCommission(financial) {
  const out = { ...(financial && typeof financial === 'object' ? financial : {}) };
  OLD_COMMISSION_KEYS.forEach((k) => { delete out[k]; });
  return out;
}

export const EXCESS_OVER_DEPOSIT = 'The deposit already paid to the seller cannot be more than the EMD amount.';
const excessAmount = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) throw new Error('Enter the deposit already paid to the seller as a dollar amount, or leave it empty.');
  return n > 0 ? Math.round(n * 100) / 100 : null;
};
// emdAmount (when the caller knows it) is the deposit on the order: the part paid to the seller cannot be more than the whole deposit
export function readEarnest(input = {}, { refinance = false, emdAmount } = {}) {
  const emdHeldBy = String(input.emdHeldBy == null ? '' : input.emdHeldBy).trim().slice(0, 200);
  if (refinance && emdHeldBy) throw new Error('A refinance has no earnest money. Leave EMD held by empty.');
  const emdToSeller = excessAmount(input.emdToSeller);
  if (refinance && emdToSeller) throw new Error('A refinance has no earnest money. Leave the deposit paid to the seller empty.');
  if (emdToSeller && emdAmount !== undefined && emdToSeller > (Number(emdAmount) || 0)) throw new Error(EXCESS_OVER_DEPOSIT);
  return { emdHeldBy, emdToSeller };
}

export function earnestFinancial(earnest) {
  const financial = {};
  if (earnest && earnest.emdHeldBy) financial.emdHeldBy = earnest.emdHeldBy;
  if (earnest && earnest.emdToSeller) financial.emdToSeller = earnest.emdToSeller;
  return financial;
}

// the deposit already paid to the seller on this order (a number), or null. A refinance has none.
export function excessDepositOf(deal = {}) {
  if (!deal || deal.transactionType === 'Refinance' || deal.transaction_type === 'Refinance') return null;
  const f = deal.financial && typeof deal.financial === 'object' ? deal.financial : {};
  const n = Number(f.emdToSeller);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/* Columns this order already has, plus financial JSON for the fields that have no column. */
export function earnestDealPatch(input = {}, opts = {}) {
  const earnest = readEarnest(input, opts);
  const financial = earnestFinancial(earnest);
  const patch = {};
  if (Object.keys(financial).length) patch.financial = financial;
  if (earnest.emdHeldBy) patch.emdHolder = earnest.emdHeldBy;
  return { earnest, patch, financial };
}

export const EARNEST_KEYS = ['emdHeldBy', 'emdToSeller'];

export function earnestTouched(patch = {}) {
  return EARNEST_KEYS.some((k) => patch[k] !== undefined) || patch.financial !== undefined;
}

export function earnestView(deal = {}) {
  const f = deal.financial && typeof deal.financial === 'object' ? deal.financial : {};
  const held = String(deal.emdHolder || f.emdHeldBy || '').trim();
  const toSeller = excessDepositOf(deal);
  return { held, toSeller, any: !!held };
}

// Earnest money lives on the order. Accounting reads and writes these same fields. The contract sheet does not keep a second copy.
export const SHARED_EARNEST_KEYS = ['emdAmount', 'emdHolder', 'emdDueOn'];

export function earnestFromDeal(deal = {}) {
  if (deal.transactionType === 'Refinance' || deal.transaction_type === 'Refinance') return { emdAmount: null, emdHolder: '', emdDueOn: null };
  const f = deal.financial && typeof deal.financial === 'object' ? deal.financial : {};
  return {
    emdAmount: deal.emdAmount == null || deal.emdAmount === '' ? null : deal.emdAmount,
    emdHolder: String(deal.emdHolder || f.emdHeldBy || '').trim(),
    emdDueOn: deal.emdDueDate || null,
  };
}

export function applyEarnestToDeal(deal, fields = {}) {
  if (!deal) return deal;
  if ('emdAmount' in fields) deal.emdAmount = fields.emdAmount == null || fields.emdAmount === '' ? null : fields.emdAmount;
  if ('emdHolder' in fields) deal.emdHolder = String(fields.emdHolder || '').trim();
  if ('emdDueOn' in fields) deal.emdDueDate = fields.emdDueOn || null;
  const financial = withoutOldCommission(deal.financial);
  if (deal.emdHolder) financial.emdHeldBy = deal.emdHolder; else delete financial.emdHeldBy;
  deal.financial = financial;
  return deal;
}

export function overlayEarnestFields(deal, fields = {}) {
  return { ...fields, ...earnestFromDeal(deal) };
}

export function blankSharedEarnest(fields = {}) {
  const next = { ...fields };
  for (const key of SHARED_EARNEST_KEYS) next[key] = key === 'emdHolder' ? '' : null;
  return next;
}
