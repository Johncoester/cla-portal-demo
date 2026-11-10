/* offices.js : CLA Title OFFICES (John, Nov 4: "In the admin section create a way for us to add offices so we can add them in that show in the
 * scheduling section"). Pure (no storage): the field rules, the SAMPLE offices, the nearest-office rule and the display text. The mock adapter
 * (mock-part-offices.js) and public.offices / public.office_counties (migration 57) store them; Admin > Offices edits them.
 * SAMPLE DATA: the 5 starting offices are made-up placeholders, labelled "(sample)", until Francis sends the real office list. No real addresses.
 * Their latitude / longitude are the Census 2024 ZCTA internal point of that placeholder ZIP (public domain), not a surveyed front door.
 * An office is never deleted: it is retired (active = false). A retired office stays on closings that already use it but cannot be picked again.
 * Closest office for a property (Matt): straight-line miles from the property's latitude/longitude, or from its ZIP center when it has no point.
 * An office is placed the same way (its own latitude/longitude, else its ZIP center). Then, if a distance cannot be worked out: an active office
 * in the same state (the state's main office first), then the main office (lowest sort order), then any active office. Staff can still pick another. */
import { OFFICE_STATES, COUNTY_LIST } from './office-county-list.js?v=202611070139';
import { phoneOk, fmtPhone, PHONE_MSG } from './constants.js?v=202611090935';
import { zipCentroid } from './zip-centroids.js?v=202611100830';
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
  { id: 'off-rockville', name: 'CLA Title - Rockville, MD office (sample)', addressLine1: '100 Placeholder Pike', addressLine2: '', city: 'Rockville', state: 'MD', zip: '20850', latitude: 39.0892, longitude: -77.1804,
    phone: '301-555-0100', email: '', isMainOfficeForState: true, sortOrder: 1, counties: C('MD', ['Montgomery', 'Frederick', 'Howard', 'Carroll', 'Washington']) },
  { id: 'off-annapolis', name: 'CLA Title - Annapolis, MD office (sample)', addressLine1: '200 Placeholder Street', addressLine2: '', city: 'Annapolis', state: 'MD', zip: '21401', latitude: 38.9879, longitude: -76.5527,
    phone: '410-555-0100', email: '', isMainOfficeForState: false, sortOrder: 2,
    counties: C('MD', ['Anne Arundel', "Prince George's", 'Calvert', 'Charles', "St. Mary's", 'Baltimore', 'Baltimore City', "Queen Anne's", 'Talbot', 'Kent']) },
  { id: 'off-dc', name: 'CLA Title - Washington, DC office (sample)', addressLine1: '300 Placeholder Avenue NW', addressLine2: '', city: 'Washington', state: 'DC', zip: '20001', latitude: 38.9104, longitude: -77.0177,
    phone: '202-555-0100', email: '', isMainOfficeForState: true, sortOrder: 3, counties: C('DC', ['District of Columbia']) },
  { id: 'off-fairfax', name: 'CLA Title - Fairfax, VA office (sample)', addressLine1: '400 Placeholder Road', addressLine2: '', city: 'Fairfax', state: 'VA', zip: '22030', latitude: 38.8372, longitude: -77.3405,
    phone: '703-555-0100', email: '', isMainOfficeForState: true, sortOrder: 4,
    counties: C('VA', ['Fairfax', 'Arlington', 'Loudoun', 'Prince William', 'Alexandria City', 'Fairfax City', 'Falls Church City']) },
  { id: 'off-ftlauderdale', name: 'CLA Title - Fort Lauderdale, FL office (sample)', addressLine1: '500 Placeholder Boulevard', addressLine2: '', city: 'Fort Lauderdale', state: 'FL', zip: '33301', latitude: 26.1213, longitude: -80.1279,
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
  const coord = (raw) => { if (raw == null || String(raw).trim() === '') return null; const n = Number(raw); return Number.isFinite(n) ? n : NaN; };
  v.latitude = coord(input.latitude); v.longitude = coord(input.longitude);
  if (Number.isNaN(v.latitude) || Number.isNaN(v.longitude)) errs.push('Latitude and longitude must be numbers (or leave both blank).');
  else if ((v.latitude == null) !== (v.longitude == null)) errs.push('Enter both latitude and longitude, or leave both blank.');
  else if (v.latitude != null && (v.latitude < -90 || v.latitude > 90 || v.longitude < -180 || v.longitude > 180)) errs.push('Latitude must be between -90 and 90 and longitude between -180 and 180.');
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
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
// A point to measure from: an explicit latitude/longitude wins, otherwise the ZIP's Census center.
export function geoPoint(rec = {}) {
  const lat = num(rec.latitude != null && rec.latitude !== '' ? rec.latitude : rec.lat);
  const lng = num(rec.longitude != null && rec.longitude !== '' ? rec.longitude : (rec.lng != null && rec.lng !== '' ? rec.lng : rec.lon));
  if (lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { latitude: lat, longitude: lng, source: 'latlong' };
  const z = zipCentroid(rec.zip); return z ? { latitude: z.latitude, longitude: z.longitude, source: 'zip' } : null;
}
const rad = (d) => d * Math.PI / 180;
export function milesBetween(a, b) {
  const dLat = rad(b.latitude - a.latitude); const dLng = rad(b.longitude - a.longitude);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}
const milesText = (m) => (m < 0.1 ? 'under 0.1 miles' : `about ${m < 10 ? m.toFixed(1) : String(Math.round(m))} miles`);
// the default office for a property: { officeId, reason: 'distance' | 'state' | 'main' | 'none', text, miles? }
export function nearestOffice(prop = {}, offices = SAMPLE_OFFICES) {
  const st = String(prop.state || '').toUpperCase().trim();
  const live = offices.filter((o) => o.active !== false).slice().sort(officeSort);
  const here = geoPoint(prop);
  if (here) {
    const located = live.map((o) => ({ o, p: geoPoint(o) })).filter((x) => x.p);
    if (located.length) {
      located.sort((a, b) => milesBetween(here, a.p) - milesBetween(here, b.p) || officeSort(a.o, b.o));
      const best = located[0]; const miles = milesBetween(here, best.p);
      return { officeId: best.o.id, reason: 'distance', miles, text: `${best.o.name} (closest office, ${milesText(miles)})` };
    }
  }
  const inState = live.filter((o) => o.state === st);
  const byState = inState.find((o) => o.isMainOfficeForState || o.stateDefault) || inState[0];
  if (byState) return { officeId: byState.id, reason: 'state', text: `${byState.name} (an office in ${st})` };
  const main = live.find((o) => o.isMainOfficeForState || o.stateDefault) || live[0];
  if (main) return { officeId: main.id, reason: 'main', text: `${main.name} (the main office)` };
  return { officeId: null, reason: 'none', text: 'No CLA office near this property: pick one.' };
}
// the text shown for a closing place. An office closing shows the office's own name (given by the adapter, so retired offices still show).
export const placeText = (location, officeId, officeName) => (location === OFFICE_LOCATION && officeId && officeName ? officeName : location || '');
