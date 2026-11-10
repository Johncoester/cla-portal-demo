/* offices.js : CLA Title OFFICES (John, Nov 4: "In the admin section create a way for us to add offices so we can add them in that show in the
 * scheduling section"). Pure (no storage): the field rules, the SAMPLE offices, the nearest-office rule and the display text. The mock adapter
 * (mock-part-offices.js) and public.offices / public.office_counties (migration 57) store them; Admin > Offices edits them.
 * SAMPLE DATA: the 5 starting offices are made-up placeholders, labelled "(sample)", until Francis sends the real office list. No real addresses.
 * An office is never deleted: it is retired (active = false). A retired office stays on closings that already use it but cannot be picked again.
 * "Nearest" office for a property = 1) the active office that serves the property's county (same state), else 2) the state's main office,
 * else 3) any active office in the state (lowest sort order), else none (the person picks). */
import { OFFICE_STATES, COUNTY_LIST } from './office-county-list.js?v=202611070139';
import { phoneOk, fmtPhone, PHONE_MSG } from './constants.js?v=202611101015';
export { OFFICE_STATES, COUNTY_LIST };
export const OFFICE_LOCATION = 'CLA Title office';   // the CLOSING_LOCATIONS entry an office belongs to
export const SAMPLE_TAG = '(sample)';
export const canManageOffices = (u) => !!(u && u.isAdmin && (u.status || 'active') === 'active');   // Admin and Super admin
export const OFFICE_ADMIN_ONLY = 'Only an Admin or Super admin can change offices.';
// a county name compared loosely: case, apostrophes, periods and a trailing "County" do not matter
export const normCounty = (s) => String(s == null ? '' : s).toLowerCase().replace(/['’.]/g, '').replace(/\s+county$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const countiesFor = (state) => COUNTY_LIST[String(state || '').toUpperCase()] || [];
// the list spelling of a county in a state ('anne arundel county' -> 'Anne Arundel'), or null when it is not one of that state's counties
export const countyIn = (state, county) => { const n = normCounty(county); return countiesFor(state).find((c) => normCounty(c) === n) || null; };
const C = (state, list) => list.map((county) => ({ state, county }));
// SAMPLE offices: placeholder streets and 555-01xx (fictional) phone numbers. Same ids as migrations 56 / 57.
export const SAMPLE_OFFICES = [
  { id: 'off-rockville', name: 'CLA Title - Rockville, MD office (sample)', addressLine1: '100 Placeholder Pike', addressLine2: '', city: 'Rockville', state: 'MD', zip: '20850',
    phone: '301-555-0100', email: '', isMainOfficeForState: true, sortOrder: 1, counties: C('MD', ['Montgomery', 'Frederick', 'Howard', 'Carroll', 'Washington']) },
  { id: 'off-annapolis', name: 'CLA Title - Annapolis, MD office (sample)', addressLine1: '200 Placeholder Street', addressLine2: '', city: 'Annapolis', state: 'MD', zip: '21401',
    phone: '410-555-0100', email: '', isMainOfficeForState: false, sortOrder: 2,
    counties: C('MD', ['Anne Arundel', "Prince George's", 'Calvert', 'Charles', "St. Mary's", 'Baltimore', 'Baltimore City', "Queen Anne's", 'Talbot', 'Kent']) },
  { id: 'off-dc', name: 'CLA Title - Washington, DC office (sample)', addressLine1: '300 Placeholder Avenue NW', addressLine2: '', city: 'Washington', state: 'DC', zip: '20001',
    phone: '202-555-0100', email: '', isMainOfficeForState: true, sortOrder: 3, counties: C('DC', ['District of Columbia']) },
  { id: 'off-fairfax', name: 'CLA Title - Fairfax, VA office (sample)', addressLine1: '400 Placeholder Road', addressLine2: '', city: 'Fairfax', state: 'VA', zip: '22030',
    phone: '703-555-0100', email: '', isMainOfficeForState: true, sortOrder: 4,
    counties: C('VA', ['Fairfax', 'Arlington', 'Loudoun', 'Prince William', 'Alexandria City', 'Fairfax City', 'Falls Church City']) },
  { id: 'off-ftlauderdale', name: 'CLA Title - Fort Lauderdale, FL office (sample)', addressLine1: '500 Placeholder Boulevard', addressLine2: '', city: 'Fort Lauderdale', state: 'FL', zip: '33301',
    phone: '954-555-0100', email: '', isMainOfficeForState: true, sortOrder: 5, counties: C('FL', ['Broward', 'Miami-Dade', 'Palm Beach']) },
];
export const SAMPLE_IDS = SAMPLE_OFFICES.map((o) => o.id);
// one line: "100 Placeholder Pike, Suite 2, Rockville, MD 20850"
export const officeAddress = (o) => (!o ? '' : [o.addressLine1, o.addressLine2, o.city, `${o.state || ''} ${o.zip || ''}`.trim()].map((s) => String(s || '').trim()).filter(Boolean).join(', '));
export const officeSort = (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name).localeCompare(String(b.name));
const t = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
export const ZIP_RE = /^\d{5}(-\d{4})?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// FIELD RULES (Admin > Offices; mirrored by checks in migration 57). Returns clean values or throws one plain message per problem (all at once).
export function cleanOffice(input = {}) {
  const errs = []; const v = {
    name: t(input.name, 120), addressLine1: t(input.addressLine1, 120), addressLine2: t(input.addressLine2, 120), city: t(input.city, 80),
    state: t(input.state, 2).toUpperCase(), zip: t(input.zip, 10), phone: t(input.phone, 20), email: t(input.email, 200).toLowerCase(),
    isMainOfficeForState: input.isMainOfficeForState === true || input.isMainOfficeForState === 'true' || input.isMainOfficeForState === 'on' };
  if (!v.name) errs.push('Office name is required.');
  if (!v.addressLine1) errs.push('Address line 1 is required.');
  if (!v.city) errs.push('City is required.');
  if (!OFFICE_STATES.includes(v.state)) errs.push('Pick the state: MD, VA, DC or FL.');
  if (!v.zip) errs.push('ZIP code is required.'); else if (!ZIP_RE.test(v.zip)) errs.push('ZIP code must be 5 digits (or 5+4, like 20850-1234).');
  if (v.phone) { if (!phoneOk(v.phone)) errs.push(`Main phone ${PHONE_MSG}.`); else v.phone = fmtPhone(v.phone); }
  if (v.email && !EMAIL_RE.test(v.email)) errs.push('Email must look like name@example.com (or leave it blank).');
  // counties served: [{ state, county }] or ['County'] (in the office's state); each must be one of that state's counties
  const raw = Array.isArray(input.counties) ? input.counties : []; const seen = new Set(); v.counties = [];
  raw.forEach((c) => { const st = (typeof c === 'string' ? v.state : t(c && c.state, 2).toUpperCase()); const name = typeof c === 'string' ? c : c && c.county;
    if (st !== v.state) { errs.push(`An office serves counties in its own state only (${name || '?'} is in ${st || '?'}).`); return; }
    const hit = countyIn(st, name); if (!hit) { errs.push(`${t(name, 80) || 'A blank county'} is not a county in ${st || 'that state'}.`); return; }
    const k = `${st}|${normCounty(hit)}`; if (!seen.has(k)) { seen.add(k); v.counties.push({ state: st, county: hit }); } });
  if (errs.length) { const e = new Error(errs.join(' ')); e.errors = errs; throw e; }
  return v;
}
// the default office for a property: { officeId, reason: 'county' | 'state' | 'none', text }. offices: [{ id, name, state, active, isMainOfficeForState, sortOrder, counties }]
export function nearestOffice(prop = {}, offices = SAMPLE_OFFICES) {
  const st = String(prop.state || '').toUpperCase().trim(); const co = normCounty(prop.county);
  const live = offices.filter((o) => o.active !== false).slice().sort(officeSort);
  const byCounty = co ? live.find((o) => o.state === st && (o.counties || []).some((c) => (typeof c === 'string' ? o.state : c.state) === st && normCounty(typeof c === 'string' ? c : c.county) === co)) : null;
  if (byCounty) return { officeId: byCounty.id, reason: 'county', text: `${byCounty.name} (serves ${String(prop.county).trim().replace(/\s+county$/i, '')} County, ${st})` };
  const byState = live.find((o) => o.state === st && (o.isMainOfficeForState || o.stateDefault)) || live.find((o) => o.state === st);
  if (byState) return { officeId: byState.id, reason: 'state', text: `${byState.name} (the ${st} main office)` };
  return { officeId: null, reason: 'none', text: 'No CLA office near this property: pick one.' };
}
// the text shown for a closing place. An office closing shows the office's own name (given by the adapter, so retired offices still show).
export const placeText = (location, officeId, officeName) => (location === OFFICE_LOCATION && officeId && officeName ? officeName : location || '');
