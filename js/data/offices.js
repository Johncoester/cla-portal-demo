/* offices.js : CLA Title OFFICES (John, Nov 4: "In the admin section create a way for us to add offices so we can add them in that show in the
 * scheduling section"). Pure (no storage): the field rules, the SAMPLE offices, the nearest-office rule and the display text. The mock adapter
 * (mock-part-offices.js) and public.offices / public.office_counties (migration 57) store them; Admin > Offices edits them.
 * The starting offices are the public closing locations listed at https://clatitle.com/locations/ (read 2026-11-10).
 * A name keeps "(sample)" only when the address was not on that page. Latitude / longitude are the Census geocoder
 * address match when it returned one (coordSource "address"); otherwise the Census ZIP center (coordSource "zip").
 * An office is never deleted: it is retired (active = false). A retired office stays on closings that already use it but cannot be picked again.
 * Closest office for a property (Matt): straight-line miles from the property's latitude/longitude, or from its ZIP center when it has no point.
 * An office is placed the same way (its own latitude/longitude, else its ZIP center). Then, if a distance cannot be worked out: an active office
 * in the same state (the state's main office first), then the main office (lowest sort order), then any active office. Staff can still pick another. */
import { OFFICE_STATES, COUNTY_LIST } from './office-county-list.js?v=202611070139';
import { phoneOk, fmtPhone, PHONE_MSG } from './constants.js?v=202611101015';
import { zipCentroid } from './zip-centroids.js?v=202611101215';
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
// Public closing locations from https://clatitle.com/locations/ . Names are the headings on that page.
// Phone is stored only where that page prints one (Rockville's direct number). No county service area is listed, so counties stay empty.
// coordSource "address" = Census Bureau geocoder address match (Public_AR_Current). "zip" = Census 2024 ZCTA internal point, used when the address did not match.
// Rockville is the main office: it is listed first and is the only location with a direct phone. The site does not name a main office for VA, DC, or FL.
// Left out, not guessed: a second heading that only says "VIRGINIA" with the text "8000 Towers Crescent Drive Vienna VA 22183".
// Its View Map link is 8000 Towers Crescent Dr, Tysons, VA 22182, so the city and ZIP on the page do not match the pin.
const pub = (id, name, line1, line2, city, state, zip, lat, lng, source, sort, extra = {}) => ({
  id, name, addressLine1: line1, addressLine2: line2, city, state, zip, latitude: lat, longitude: lng, coordSource: source,
  phone: extra.phone || '', email: '', isMainOfficeForState: !!extra.main, sortOrder: sort, counties: C(state, extra.counties || []) });
export const SAMPLE_OFFICES = [
  pub('off-rockville', 'Rockville', '9210 Corporate Blvd', '#150', 'Rockville', 'MD', '20850', 39.107612, -77.189877, 'address', 1, { phone: '888-924-9008', main: true }),
  pub('off-white-plains', 'White Plains', '4560 Crain Highway', 'Suite 11', 'White Plains', 'MD', '20695', 38.587387, -76.945010, 'address', 2),
  pub('off-bethesda', 'Bethesda', '7201 Wisconsin Avenue', '', 'Bethesda', 'MD', '20814', 38.981338, -77.092659, 'address', 3),
  pub('off-annapolis', 'Annapolis', '1910 Towne Centre Boulevard', 'Ste. 250', 'Annapolis', 'MD', '21401', 38.980745, -76.540246, 'address', 4),
  pub('off-chester', 'Chester', '110 S. Piney Road', 'Ste. 106', 'Chester', 'MD', '21619', 38.972726, -76.269768, 'address', 5),
  pub('off-frederick', 'Frederick', '201 Broadway Street', 'Suite 320', 'Frederick', 'MD', '21701', 39.410733, -77.412707, 'address', 6),
  pub('off-hagerstown', 'Hagerstown', '201 Prospect Avenue', '', 'Hagerstown', 'MD', '21742', 39.6782, -77.6527, 'zip', 7),
  pub('off-towson', 'Towson', '200 Towsontown Blvd W', 'Ste 413', 'Towson', 'MD', '21204', 39.396086, -76.618924, 'address', 8),
  pub('off-arlington-courthouse', 'Arlington Courthouse', '2311 Wilson Boulevard', '', 'Arlington', 'VA', '22201', 38.891038, -77.086702, 'address', 9),
  pub('off-ballston', 'Ballston', '4201 Wilson Boulevard', '', 'Arlington', 'VA', '22203', 38.879927, -77.110308, 'address', 10),
  pub('off-venture-x-fairfax', 'Venture X Fairfax', '3060 Williams Dr', 'Suite 300', 'Fairfax', 'VA', '22031', 38.8589, -77.2603, 'zip', 11),
  pub('off-dc-closing', 'DC Closing', '1050 Connecticut Avenue NW', 'Suite 500', 'Washington', 'DC', '20036', 38.903131, -77.039741, 'address', 12),
  pub('off-thomas-circle', 'Thomas Circle', 'One Thomas Circle', '', 'Washington', 'DC', '20005', 38.905587, -77.032489, 'address', 13),
  pub('off-west-palm-beach', 'West Palm Beach', '2054 Vista Parkway', 'Ste 400', 'West Palm Beach', 'FL', '33411', 26.710708, -80.147471, 'address', 14),
  pub('off-fort-lauderdale', 'Fort Lauderdale', '2455 E Sunrise Blvd.', 'Suite 1205', 'Fort Lauderdale', 'FL', '33304', 26.138072, -80.113710, 'address', 15),
  pub('off-sarasota', 'Sarasota', '1990 Main Street', '', 'Sarasota', 'FL', '34236', 27.336405, -82.531219, 'address', 16),
  pub('off-new-smyrna-beach', 'New Smyrna Beach', '100 S Riverside Dr', '', 'New Smyrna Beach', 'FL', '32168', 29.025586, -80.920889, 'address', 17),
  pub('off-st-petersburg', 'St. Petersburg', '360 Central Ave', 'Ste 800', 'St. Petersburg', 'FL', '33701', 27.771150, -82.637924, 'address', 18),
  pub('off-naples', 'Naples', '999 Vanderbilt Beach Rd.', 'Ste 224', 'Naples', 'FL', '34108', 26.250602, -81.798886, 'address', 19),
  pub('off-miami', 'Miami', '1111 Brickell Ave', 'Floor 10', 'Miami', 'FL', '33131', 25.762700, -80.191546, 'address', 20),
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
