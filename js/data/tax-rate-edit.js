/* FF-091c: checks an Admin's edits to a tax rate sheet before they are saved.
 * A blank rate is kept blank. That is Rate Not Set, not zero. */
import { canManageModules } from './modules.js?v=202611245600';

export const RATE_ADMIN_ONLY = 'Only an Admin or Super admin can change tax rates.';
export const canEditTaxRates = (user) => canManageModules(user);

const PAYERS = ['buyer', 'seller', 'split'];

export function cleanOptionalNumber(raw, label) {
  const s = String(raw == null ? '' : raw).trim().replace(/[$,\s]/g, '');
  if (s === '') return null;
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error(`Enter ${label} as a number, or leave it blank for Rate Not Set.`);
  const n = Number(s);
  if (n < 0) throw new Error(`Enter ${label} as zero or more, or leave it blank for Rate Not Set.`);
  return n;
}

export function cleanPayer(raw, label) {
  const p = String(raw || '').trim().toLowerCase();
  if (p === 'buyer' || p === 'seller' || p === 'split') return p;
  throw new Error(`Choose Buyer pays, Seller pays, or 50/50 split for ${label}.`);
}

export function cleanStateCode(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(s)) throw new Error('Enter the state as two letters, like MD.');
  return s;
}

export function cleanPlace(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

export function cleanJurisdiction(input) {
  const state = cleanStateCode(input && input.state);
  const county = cleanPlace(input && input.county);
  const city = cleanPlace(input && input.city);
  const name = cleanPlace(input && input.name) || [city, county, state].filter(Boolean).join(', ');
  if (!name) throw new Error('Enter a name for this place.');
  return { state, county, city, name };
}

export function cleanRateLine(input) {
  const name = cleanPlace(input && input.name);
  if (!name) throw new Error('Enter a name for this rate.');
  const kind = input && input.kind === 'recording' ? 'recording' : 'tax';
  const paidBy = cleanPayer(input && input.paidBy || 'buyer', name);
  const rate = cleanOptionalNumber(input && input.rate, 'the rate');
  const flatFee = cleanOptionalNumber(input && input.flatFee, 'the flat fee');
  return { name, kind, paidBy, rate, flatFee };
}

export function cleanExemption(input) {
  const name = cleanPlace(input && input.name);
  if (!name) throw new Error('Enter a name for this exemption.');
  return {
    name,
    amount: cleanOptionalNumber(input && input.amount, 'the exemption amount'),
    alternateRate: cleanOptionalNumber(input && input.alternateRate, 'the other rate')
  };
}

export function cleanAllocation(input) {
  const taxName = cleanPlace(input && input.taxName);
  if (!taxName) throw new Error('Enter the tax this split belongs to.');
  return { taxName, paidBy: cleanPayer(input && input.paidBy, taxName), lawMandated: !!(input && (input.lawMandated === true || input.lawMandated === 'yes' || input.lawMandated === 'on')) };
}

export function cleanQuestionLabel(raw) {
  const label = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!label) throw new Error('Enter the question staff should see.');
  if (label.length > 200) throw new Error('Keep the question under 200 characters.');
  return label;
}

export function payerOk(value) {
  return PAYERS.includes(value);
}
