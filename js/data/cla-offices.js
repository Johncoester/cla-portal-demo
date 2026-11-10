/* cla-offices.js : OLDER NAMES for the closing-office helpers (commit b41dcb1). The office list now lives in the offices table, edited in
 * Admin > Offices (offices.js, mock-part-offices.js, migration 57). This file only keeps the old imports working and reads the SAMPLE offices:
 * screens get the real (stored) office list and office names from the adapter (getClosingOfficeDefault, proposal / scheduled closing officeName). */
import { SAMPLE_OFFICES, OFFICE_LOCATION, officeAddress, nearestOffice as nearest, placeText as place } from './offices.js?v=202611101015';
export { OFFICE_LOCATION };
// legacy shape: { id, name, address (one line, a placeholder), state, stateDefault, counties: ['Montgomery', ...] }
export const CLA_OFFICES = SAMPLE_OFFICES.map((o) => ({ id: o.id, name: o.name, address: `${officeAddress(o)} (sample placeholder)`, state: o.state, stateDefault: o.isMainOfficeForState,
  counties: o.counties.map((c) => c.county) }));
export const CLA_OFFICE_IDS = CLA_OFFICES.map((o) => o.id);
export const officeOf = (id) => CLA_OFFICES.find((o) => o.id === id) || null;
export const officeLabel = (id) => (officeOf(id) || {}).name || '';
export const nearestOffice = (prop = {}, offices = SAMPLE_OFFICES) => nearest(prop, offices);
// officeName from the adapter wins (stored offices, retired ones included); without it, the sample list
export const placeText = (location, officeId, officeName) => place(location, officeId, officeName || officeLabel(officeId));
