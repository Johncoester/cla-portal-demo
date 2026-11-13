/* Buyer-side and seller-side signing on the closing. Loaded with the deal row. No extra read. */
import { US_STATES } from './constants.js?v=202611101015';
import { officeAddress } from './offices.js?v=202611101015';

export const PLACE_KINDS = [['office', 'CLA Title office'], ['mobile_notary', 'Mobile notary address'], ['manual', 'Type an address']];
export const SIGN_STATUSES = [['pending', 'Pending'], ['signed', 'Signed']];
export const MANUAL_OFFICE = '__manual__';
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const trim = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

export function officeOptionLabel(o) {
  if (!o) return '';
  const addr = o.address || officeAddress(o);
  return addr || o.name || 'Office';
}

export function composeAddress({ street, city, state, zip } = {}) {
  return [street, city, [state, zip].filter(Boolean).join(' ')].map((s) => String(s || '').trim()).filter(Boolean).join(', ');
}

export const TYPED_ADDRESS = 'Typed address';

export const MOBILE_NOTARY = 'Mobile notary';

// FF-063 #3: a mobile notary closing can carry the signing address the processor typed (same deal columns as a typed address).
export function scheduledPlace(sc, deal) {
  if (!sc || (sc.location !== TYPED_ADDRESS && sc.location !== MOBILE_NOTARY)) return '';
  const addr = composeAddress({ street: deal && deal.closingManualStreet, city: deal && deal.closingManualCity, state: deal && deal.closingManualState, zip: deal && deal.closingManualZip });
  return sc.location === MOBILE_NOTARY ? (addr ? `Mobile notary at ${addr}` : '') : addr;
}

export function cleanManualAddress(input = {}, { required = false } = {}) {
  const street = trim(input.street, 120);
  const city = trim(input.city, 80);
  const state = trim(input.state, 2).toUpperCase();
  const zip = trim(input.zip, 10);
  const any = street || city || state || zip;
  if (required || any) {
    if (!street || !city || !US_STATES.includes(state) || !ZIP_RE.test(zip)) {
      throw new Error('Enter the street, city, state, and ZIP.');
    }
  }
  return { street, city, state: state || '', zip };
}

export function cleanSideSigning(input = {}) {
  const side = input.side === 'seller' ? 'seller' : input.side === 'buyer' ? 'buyer' : '';
  if (!side) throw new Error('Pick the buyer side or the seller side.');
  const status = input.status === 'signed' ? 'signed' : 'pending';
  const signedOn = status === 'signed' ? trim(input.signedOn, 10) : '';
  if (status === 'signed' && !/^\d{4}-\d{2}-\d{2}$/.test(signedOn)) throw new Error('Enter the date this side signed.');
  const placeKind = PLACE_KINDS.some(([k]) => k === input.placeKind) ? input.placeKind : '';
  const atDate = trim(input.date, 10);
  const atTime = trim(input.time, 5);
  if (atDate && !/^\d{4}-\d{2}-\d{2}$/.test(atDate)) throw new Error('Enter the signing date as YYYY-MM-DD.');
  if (atTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(atTime)) throw new Error('Enter the signing time as HH:MM.');
  const officeId = placeKind === 'office' ? trim(input.officeId, 80) : '';
  const manual = cleanManualAddress(input, { required: placeKind === 'mobile_notary' || placeKind === 'manual' });
  if (placeKind === 'office' && !officeId) throw new Error('Pick the CLA Title office.');
  return { side, status, signedOn, placeKind, officeId, date: atDate, time: atTime, ...manual };
}

export function sideFromDeal(deal, side) {
  const p = side === 'seller' ? 'seller' : 'buyer';
  return {
    side: p,
    status: deal && deal[p + 'SignStatus'] === 'signed' ? 'signed' : 'pending',
    signedOn: (deal && deal[p + 'SignedOn']) || '',
    placeKind: (deal && deal[p + 'PlaceKind']) || '',
    officeId: (deal && deal[p + 'OfficeId']) || '',
    date: (deal && deal[p + 'SigningDate']) || '',
    time: (deal && deal[p + 'SigningTime']) || '',
    street: (deal && deal[p + 'ManualStreet']) || '',
    city: (deal && deal[p + 'ManualCity']) || '',
    state: (deal && deal[p + 'ManualState']) || '',
    zip: (deal && deal[p + 'ManualZip']) || '',
    label: (p === 'seller' ? 'Seller' : 'Buyer') + ' side',
  };
}

export function sidePatch(clean) {
  const p = clean.side;
  const patch = {};
  patch[p + 'SignStatus'] = clean.status;
  patch[p + 'SignedOn'] = clean.signedOn || null;
  patch[p + 'PlaceKind'] = clean.placeKind;
  patch[p + 'OfficeId'] = clean.officeId || null;
  patch[p + 'SigningDate'] = clean.date || null;
  patch[p + 'SigningTime'] = clean.time || null;
  patch[p + 'ManualStreet'] = clean.street;
  patch[p + 'ManualCity'] = clean.city;
  patch[p + 'ManualState'] = clean.state;
  patch[p + 'ManualZip'] = clean.zip;
  return patch;
}
