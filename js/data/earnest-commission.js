/* Earnest & commissions captured on Place Order.
 * Stored on the order as financial JSON (emd held by, base, percent, additional, total, paid by).
 * When a paid-by side is set, the percent and total also mirror the existing listing or buyer
 * commission columns, and EMD held by mirrors emdHolder. A refinance keeps none of these. */
import { moneyAmount } from './constants.js?v=202611101015';

export const COMMISSION_PAID_BY = [['buyer', 'Buyer'], ['seller', 'Seller']];
const PAID = new Set(COMMISSION_PAID_BY.map(([code]) => code));

function blank(v) {
  return v == null || String(v).trim() === '';
}

function percentOf(v) {
  if (blank(v)) return null;
  const n = Number(String(v).replace(/[%,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Commission % must be a number from 0 to 100.');
  return Math.round(n * 10000) / 10000;
}

export function commissionTotal({ base, percent, additional } = {}) {
  if (base == null && percent == null && additional == null) return null;
  const raw = (base || 0) * ((percent || 0) / 100) + (additional || 0);
  return Math.round(raw * 100) / 100;
}

export function readEarnest(input = {}, { refinance = false } = {}) {
  const emdHeldBy = String(input.emdHeldBy == null ? '' : input.emdHeldBy).trim().slice(0, 200);
  const commissionBase = blank(input.commissionBase) ? null : moneyAmount(input.commissionBase);
  const commissionPercent = percentOf(input.commissionPercent);
  const commissionAdditional = blank(input.commissionAdditional) ? null : moneyAmount(input.commissionAdditional);
  const paid = String(input.commissionPaidBy || '').trim().toLowerCase();
  if (paid && !PAID.has(paid)) throw new Error('Commission paid by must be Buyer or Seller.');
  const any = !!(emdHeldBy || commissionBase != null || commissionPercent != null || commissionAdditional != null || paid);
  if (refinance && any) throw new Error('A refinance has no earnest money or commission. Leave Earnest & Commissions empty.');
  const commissionTotalValue = commissionTotal({ base: commissionBase, percent: commissionPercent, additional: commissionAdditional });
  return {
    emdHeldBy,
    commissionBase,
    commissionPercent,
    commissionAdditional,
    commissionTotal: commissionTotalValue,
    commissionPaidBy: paid,
  };
}

export function earnestFinancial(earnest) {
  const financial = {};
  if (!earnest) return financial;
  if (earnest.emdHeldBy) financial.emdHeldBy = earnest.emdHeldBy;
  if (earnest.commissionBase != null) financial.commissionBase = earnest.commissionBase;
  if (earnest.commissionPercent != null) financial.commissionPercent = earnest.commissionPercent;
  if (earnest.commissionAdditional != null) financial.commissionAdditional = earnest.commissionAdditional;
  if (earnest.commissionTotal != null) financial.commissionTotal = earnest.commissionTotal;
  if (earnest.commissionPaidBy) financial.commissionPaidBy = earnest.commissionPaidBy;
  return financial;
}

/* Columns this order already has, plus financial JSON for the fields that have no column. */
export function earnestDealPatch(input = {}, opts = {}) {
  const earnest = readEarnest(input, opts);
  const financial = earnestFinancial(earnest);
  const patch = {};
  if (Object.keys(financial).length) patch.financial = financial;
  if (earnest.emdHeldBy) patch.emdHolder = earnest.emdHeldBy;
  if (earnest.commissionPaidBy === 'seller') {
    patch.listingCommissionPct = earnest.commissionPercent;
    patch.listingCommissionAmount = earnest.commissionTotal;
    patch.buyerCommissionPct = null;
    patch.buyerCommissionAmount = null;
  } else if (earnest.commissionPaidBy === 'buyer') {
    patch.buyerCommissionPct = earnest.commissionPercent;
    patch.buyerCommissionAmount = earnest.commissionTotal;
    patch.listingCommissionPct = null;
    patch.listingCommissionAmount = null;
  } else {
    patch.listingCommissionPct = null;
    patch.listingCommissionAmount = null;
    patch.buyerCommissionPct = null;
    patch.buyerCommissionAmount = null;
  }
  return { earnest, patch, financial };
}

export const EARNEST_KEYS = ['emdHeldBy', 'commissionBase', 'commissionPercent', 'commissionAdditional', 'commissionPaidBy'];

export function earnestTouched(patch = {}) {
  return EARNEST_KEYS.some((k) => patch[k] !== undefined) || patch.financial !== undefined;
}

export function earnestView(deal = {}) {
  const f = deal.financial && typeof deal.financial === 'object' ? deal.financial : {};
  const held = String(deal.emdHolder || f.emdHeldBy || '').trim();
  const base = f.commissionBase != null ? f.commissionBase : null;
  const additional = f.commissionAdditional != null ? f.commissionAdditional : null;
  let paid = String(f.commissionPaidBy || '').trim();
  let percent = f.commissionPercent != null ? f.commissionPercent : null;
  let total = f.commissionTotal != null ? f.commissionTotal : null;
  if (deal.listingCommissionPct != null || deal.listingCommissionAmount != null) {
    paid = paid || 'seller';
    if (percent == null) percent = deal.listingCommissionPct ?? null;
    if (total == null) total = deal.listingCommissionAmount ?? null;
  } else if (deal.buyerCommissionPct != null || deal.buyerCommissionAmount != null) {
    paid = paid || 'buyer';
    if (percent == null) percent = deal.buyerCommissionPct ?? null;
    if (total == null) total = deal.buyerCommissionAmount ?? null;
  }
  if (total == null) total = commissionTotal({ base, percent, additional });
  const paidLabel = (COMMISSION_PAID_BY.find(([code]) => code === paid) || [null, ''])[1];
  const any = !!(held || base != null || percent != null || additional != null || paid);
  return { held, base, percent, additional, total, paid, paidLabel, any };
}

// Earnest money and commissions live on the order. Accounting reads and writes these
// same fields. The contract sheet does not keep a second copy.
export const SHARED_EARNEST_KEYS = ['emdAmount', 'emdHolder', 'emdDueOn', 'listingCommissionPercent', 'listingCommissionAmount', 'buyerBrokerPercent', 'buyerBrokerAmount'];

function firstSet(...vals) {
  for (const v of vals) if (v != null && v !== '') return v;
  return null;
}

export function earnestFromDeal(deal = {}) {
  if (deal.transactionType === 'Refinance' || deal.transaction_type === 'Refinance') {
    return { emdAmount: null, emdHolder: '', emdDueOn: null, listingCommissionPercent: null, listingCommissionAmount: null, buyerBrokerPercent: null, buyerBrokerAmount: null };
  }
  const f = deal.financial && typeof deal.financial === 'object' ? deal.financial : {};
  const seller = f.commissionPaidBy === 'seller';
  const buyer = f.commissionPaidBy === 'buyer';
  return {
    emdAmount: deal.emdAmount == null || deal.emdAmount === '' ? null : deal.emdAmount,
    emdHolder: String(deal.emdHolder || f.emdHeldBy || '').trim(),
    emdDueOn: deal.emdDueDate || null,
    listingCommissionPercent: firstSet(deal.listingCommissionPct, f.listingCommissionPercent, seller ? f.commissionPercent : null),
    listingCommissionAmount: firstSet(deal.listingCommissionAmount, f.listingCommissionAmount, seller ? f.commissionTotal : null),
    buyerBrokerPercent: firstSet(deal.buyerCommissionPct, f.buyerCommissionPercent, buyer ? f.commissionPercent : null),
    buyerBrokerAmount: firstSet(deal.buyerCommissionAmount, f.buyerCommissionAmount, buyer ? f.commissionTotal : null),
  };
}

export function applyEarnestToDeal(deal, fields = {}) {
  if (!deal) return deal;
  if ('emdAmount' in fields) deal.emdAmount = fields.emdAmount == null || fields.emdAmount === '' ? null : fields.emdAmount;
  if ('emdHolder' in fields) deal.emdHolder = String(fields.emdHolder || '').trim();
  if ('emdDueOn' in fields) deal.emdDueDate = fields.emdDueOn || null;
  if ('listingCommissionPercent' in fields) deal.listingCommissionPct = fields.listingCommissionPercent == null || fields.listingCommissionPercent === '' ? null : fields.listingCommissionPercent;
  if ('listingCommissionAmount' in fields) deal.listingCommissionAmount = fields.listingCommissionAmount == null || fields.listingCommissionAmount === '' ? null : fields.listingCommissionAmount;
  if ('buyerBrokerPercent' in fields) deal.buyerCommissionPct = fields.buyerBrokerPercent == null || fields.buyerBrokerPercent === '' ? null : fields.buyerBrokerPercent;
  if ('buyerBrokerAmount' in fields) deal.buyerCommissionAmount = fields.buyerBrokerAmount == null || fields.buyerBrokerAmount === '' ? null : fields.buyerBrokerAmount;
  const financial = { ...(deal.financial && typeof deal.financial === 'object' ? deal.financial : {}) };
  const keep = (key, value) => { if (value == null || value === '') delete financial[key]; else financial[key] = value; };
  keep('emdHeldBy', deal.emdHolder);
  keep('listingCommissionPercent', deal.listingCommissionPct);
  keep('listingCommissionAmount', deal.listingCommissionAmount);
  keep('buyerCommissionPercent', deal.buyerCommissionPct);
  keep('buyerCommissionAmount', deal.buyerCommissionAmount);
  if (deal.listingCommissionPct != null || deal.listingCommissionAmount != null) {
    financial.commissionPaidBy = 'seller';
    financial.commissionPercent = deal.listingCommissionPct;
    financial.commissionTotal = deal.listingCommissionAmount;
  } else if (deal.buyerCommissionPct != null || deal.buyerCommissionAmount != null) {
    financial.commissionPaidBy = 'buyer';
    financial.commissionPercent = deal.buyerCommissionPct;
    financial.commissionTotal = deal.buyerCommissionAmount;
  } else {
    delete financial.commissionPaidBy;
    delete financial.commissionPercent;
    delete financial.commissionTotal;
    delete financial.commissionBase;
    delete financial.commissionAdditional;
  }
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
