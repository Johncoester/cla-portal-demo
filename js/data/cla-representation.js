/* Who CLA represents on a file. Not a portal role, not a buyer or listing agent,
 * not the referral source, and not who can see the file. */
export const CLA_REPRESENTATION = Object.freeze([
  Object.freeze({ code: 'both', label: 'Both buyer and seller' }),
  Object.freeze({ code: 'buyer', label: 'Buyer only' }),
  Object.freeze({ code: 'seller', label: 'Seller only' }),
]);
export const CLA_REPRESENTATION_UNRECORDED = 'Not recorded';
const CODES = new Set(CLA_REPRESENTATION.map((row) => row.code));

export function claRepresentationCode(value) {
  if (value == null || value === '') return null;
  const code = String(value);
  if (!CODES.has(code)) {
    const err = new Error('Choose who CLA represents: Both buyer and seller, Buyer only, or Seller only.');
    err.code = 'cla-representation';
    throw err;
  }
  return code;
}

export function claRepresentationLabel(value) {
  if (value == null || value === '') return CLA_REPRESENTATION_UNRECORDED;
  const hit = CLA_REPRESENTATION.find((row) => row.code === value);
  return hit ? hit.label : CLA_REPRESENTATION_UNRECORDED;
}

/* A draft saved before this choice existed has no answer. Restoring it must not check Both. */
export function draftKeepsUnrecordedRepresentation(fields) {
  return !fields || !Object.prototype.hasOwnProperty.call(fields, 'claRepresentation');
}

/* Mock stores the choice. A hosted adapter asks for it only when it says the deals.cla_representation column exists (claRepresentationReady). */
export function claRepresentationWritesEnabled(api) {
  return !!api && (api.mode === 'mock' || api.claRepresentationReady === true);
}

/* Drop the key only when the screen is not asking. A present key on an inactive hosted write is refused by the adapter. */
export function representationPayload(api, fields) {
  const src = fields && typeof fields === 'object' ? { ...fields } : {};
  if (!claRepresentationWritesEnabled(api)) delete src.claRepresentation;
  return src;
}

export function guardInactiveRepresentation(record, action) {
  if (!record || !Object.prototype.hasOwnProperty.call(record, 'claRepresentation')) return;
  const err = new Error(action === 'update'
    ? 'CLA representation cannot be saved on this database yet. The order was not changed.'
    : 'CLA representation cannot be saved on this database yet. The order was not created.');
  err.code = 'cla-representation-not-migrated';
  throw err;
}
