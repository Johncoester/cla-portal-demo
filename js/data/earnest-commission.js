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
  }
  if (earnest.commissionPaidBy === 'buyer') {
    patch.buyerCommissionPct = earnest.commissionPercent;
    patch.buyerCommissionAmount = earnest.commissionTotal;
  }
  return { earnest, patch, financial };
}

export const EARNEST_KEYS = ['emdHeldBy', 'commissionBase', 'commissionPercent', 'commissionAdditional', 'commissionPaidBy'];

export function earnestTouched(patch = {}) {
  return EARNEST_KEYS.some((k) => patch[k] !== undefined) || patch.financial !== undefined;
}

export function earnestView(deal = {}) {
  const f = deal.financial && typeof deal.financial === 'object' ? deal.financial : {};
  const held = String(f.emdHeldBy || deal.emdHolder || '').trim();
  const base = f.commissionBase != null ? f.commissionBase : null;
  const percent = f.commissionPercent != null ? f.commissionPercent : null;
  const additional = f.commissionAdditional != null ? f.commissionAdditional : null;
  const total = f.commissionTotal != null ? f.commissionTotal : commissionTotal({ base, percent, additional });
  const paid = String(f.commissionPaidBy || '').trim();
  const paidLabel = (COMMISSION_PAID_BY.find(([code]) => code === paid) || [null, ''])[1];
  const any = !!(held || base != null || percent != null || additional != null || paid);
  return { held, base, percent, additional, total, paid, paidLabel, any };
}
