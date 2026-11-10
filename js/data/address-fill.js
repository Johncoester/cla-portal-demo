/* Property address helpers. City, state and ZIP come from a typed address. County and state
 * come from the bundled Census ZIP table (crm-janine lookupCounty). Nothing is fetched. */
import { US_STATES, US_STATE_NAMES } from './constants.js?v=202611101015';
import { lookupCounty } from './crm-janine.js?v=202611101015';

const STATE_BY_NAME = new Map(US_STATE_NAMES.map(([code, name]) => [name.toLowerCase(), code]));

export function parsePropertyAddress(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text.includes(',')) return { street: text, city: '', state: '', zip: '', parsed: false };
  const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return { street: text, city: '', state: '', zip: '', parsed: false };
  let tail = parts[parts.length - 1];
  let zip = '';
  const zipMatch = tail.match(/(\d{5})(?:-\d{4})?$/);
  if (zipMatch) {
    zip = zipMatch[0];
    tail = tail.slice(0, zipMatch.index).trim();
  }
  let state = '';
  if (US_STATES.includes(tail.toUpperCase())) state = tail.toUpperCase();
  else if (STATE_BY_NAME.has(tail.toLowerCase())) state = STATE_BY_NAME.get(tail.toLowerCase());
  if (!state && !zip) return { street: text, city: '', state: '', zip: '', parsed: false };
  const city = parts.length >= 3 ? parts[parts.length - 2] : '';
  const street = parts.slice(0, city ? -2 : -1).join(', ').trim();
  return { street: street || text, city, state, zip, parsed: true };
}

/* Fills only boxes that are still empty. A city, state, ZIP or county already typed is kept.
 * A full address typed in the street box is split, and the street box keeps the street. */
export async function fillProperty(fields = {}) {
  const parsed = parsePropertyAddress(fields.street);
  const out = {
    street: parsed.parsed ? parsed.street : String(fields.street || '').trim(),
    city: String(fields.city || '').trim() || (parsed.parsed ? parsed.city : ''),
    state: String(fields.state || '').trim().toUpperCase() || (parsed.parsed ? parsed.state : ''),
    zip: String(fields.zip || '').trim() || (parsed.parsed ? parsed.zip : ''),
    county: String(fields.county || '').trim(),
    parsed: parsed.parsed,
  };
  const zip5 = String(out.zip || '').slice(0, 5);
  if (!/^\d{5}$/.test(zip5)) return out;
  let hits = [];
  try { hits = await lookupCounty(zip5); } catch (e) { hits = []; }
  if (!out.state) {
    const primary = hits.find((h) => h.primary) || hits[0];
    if (primary) out.state = primary.state;
  }
  if (!out.county && out.state) {
    const hit = hits.find((h) => h.state === out.state);
    if (hit) out.county = hit.county;
  }
  return out;
}

export function cleanParcel(value) {
  const s = String(value == null ? '' : value).trim();
  if (s.length > 80) throw new Error('Parcel ID is too long (80 characters or fewer).');
  return s;
}
