/* PRORATE-1 defaults (Caroline Kim, Nov 16 2026, 2:18 PM ET; John confirmed 2:50 PM ET; tracker row 322).
 * PURE: no storage, no network. A saved proration or a saved water escrow is never rewritten here.
 *
 * Taxes and HOA start on a 365-day year, and the buyer pays for the settlement day. Staff can switch
 * either one on that file. Water escrow is a flat holdback, not a day-count proration:
 *   MD and DC $400, Florida $250, Virginia none. */
export const DEFAULT_DEBITED_TO = 'buyer';
export const DEFAULT_DAYS_PER_YEAR = '365';
export const WATER_ESCROW_KEY = 'waterEscrow';
export const WATER_ESCROW_DESCRIPTION = 'Water escrow';

export function waterEscrowDefault(state) {
  const s = String(state || '').trim().toUpperCase();
  if (s === 'MD' || s === 'DC') return 400;
  if (s === 'FL') return 250;
  return 0;
}

const isRefi = (deal) => !!deal && ((deal.transactionType || deal.transaction_type) === 'Refinance');

// The fee a NEW purchase file starts with. Null for Virginia, a refinance, or any other state.
// The seller pays it at closing (a holdback for the final water bill). Staff can change the amount,
// who pays, or retire the line. Nothing here changes a file that already has the line.
export function waterEscrowFeeInput(deal) {
  if (!deal || isRefi(deal)) return null;
  const state = String(deal.state || '').trim().toUpperCase();
  const amount = waterEscrowDefault(state);
  if (!(amount > 0)) return null;
  return {
    presetKey: WATER_ESCROW_KEY,
    kind: 'charge',
    description: WATER_ESCROW_DESCRIPTION,
    altaSection: 'misc',
    cdSection: 'H',
    cdLine: '',
    payee: 'CLA Title & Escrow',
    amount,
    paidBy: 'seller',
    timing: 'at',
    poc: false,
    note: `Default for ${state}. The seller pays this at closing. It is held for the final water bill. Change the amount on this file if it should be different.`,
  };
}

// A blank Taxes & Prorations tab. Taxes keep Installment + a 365-day year. HOA uses Per diem + a 365-day year.
// Both charge the settlement day to the buyer.
export function defaultProrationDraft(tab, type) {
  return {
    cycle: type === 'basic' && tab === 'hoa' ? 'monthly' : 'annual',
    debitedTo: DEFAULT_DEBITED_TO,
    prorateUsing: type === 'tax' ? 'installment' : 'perDiem',
    daysPerYear: DEFAULT_DAYS_PER_YEAR,
    status: 'paid',
  };
}

// What computeProration stores as `basis`. Per diem uses the year the staff picked (365, 360, or 366).
// Installment uses the days in that bill, except a 360-day year, which keeps the 30/360 day count.
export function prorationBasis(prorateUsing, daysPerYear) {
  const dpy = ['360', '365', '366'].includes(String(daysPerYear)) ? String(daysPerYear) : DEFAULT_DAYS_PER_YEAR;
  if (prorateUsing === 'perDiem') return dpy;
  return dpy === '360' ? '360' : 'installment';
}
