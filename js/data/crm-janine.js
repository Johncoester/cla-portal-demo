/* crm-janine.js : pure helpers for Janine's Nov 3 CRM feedback (John approved). FAKE DATA ONLY. Nothing here talks to the network.
 *   - ZIP -> county (bundled Census 2020 ZCTA-to-county table, lazy-loaded: zip-county-data.js),
 *   - CSV import (parse, column mapping, sample templates with fake data),
 *   - meeting invite preview + .ics file (NOTHING IS SENT: Gmail is not connected),
 *   - the "+ Create New" module list. See docs/CRM-JANINE-NOV3.md. */
import { US_STATES } from './constants.js?v=202611041516';

// ---------------- ZIP -> county ----------------
let ZIP_TABLE = null;
// Census names "Montgomery County" -> "Montgomery" (the portal's county style); "Baltimore city" -> "Baltimore City"; Louisiana parishes etc. stay as named.
export const countyName = (raw) => String(raw || '').replace(/ County$/, '').replace(/ city$/, ' City').trim();
export function parseZipTable(COUNTIES, ZIPS) { const m = new Map();
  String(ZIPS).split(';').forEach((part) => { const i = part.indexOf(':'); if (i < 0) return; m.set(part.slice(0, i), part.slice(i + 1).split(',').map((x) => COUNTIES[parseInt(x, 36)]).filter(Boolean)); });
  return m; }
export async function loadZipTable() { if (ZIP_TABLE) return ZIP_TABLE; const mod = await import('./zip-county-data.js?v=202611041516'); ZIP_TABLE = parseZipTable(mod.COUNTIES, mod.ZIPS); return ZIP_TABLE; }
// [{ state, county, primary }] for a ZIP (5 digits or ZIP+4), primary (largest land share) first; [] when unknown (e.g. a PO-box-only ZIP)
export function countiesFor(table, zip) { const z = String(zip || '').trim().slice(0, 5); if (!/^\d{5}$/.test(z) || !table) return [];
  return (table.get(z) || []).map((k, i) => { const [state, name] = k.split('|'); return { state, county: countyName(name), primary: i === 0 }; }); }
export async function lookupCounty(zip) { return countiesFor(await loadZipTable(), zip); }
export const ZIP_SOURCE = 'U.S. Census Bureau, 2020 ZCTA to County Relationship File (bundled; no lookups leave the browser)';

// ---------------- CSV ----------------
// RFC 4180: quoted fields, "" escapes, CRLF / LF, a BOM is dropped. Returns rows of strings (blank lines skipped).
export function parseCsv(text) {
  const s = String(text == null ? '' : text).replace(/^\uFEFF/, ''); const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) { const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell === '') { q = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((c) => c.trim() !== '')) rows.push(row); row = []; continue; }
    cell += ch; }
  row.push(cell); if (row.some((c) => c.trim() !== '')) rows.push(row);
  if (q) throw new Error('The CSV has a quote (") that is never closed.');
  return rows;
}
const CSV_CELL = (v) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsvText = (rows) => rows.map((r) => r.map(CSV_CELL).join(',')).join('\r\n') + '\r\n';
export const IMPORT_MAX_ROWS = 2000, IMPORT_MAX_BYTES = 2_000_000;

// import targets: [key, label, aliases]. The same list for Leads and Clients (Company on a lead = a lookup to an existing company by name).
export const PERSON_IMPORT_FIELDS = [
  ['firstName', 'First Name', ['first', 'firstname', 'given name']], ['lastName', 'Last Name *', ['last', 'lastname', 'surname', 'family name']],
  ['email', 'Email', ['email address', 'e-mail']], ['phone', 'Phone', ['phone number', 'work phone', 'office phone']], ['mobile', 'Mobile', ['cell', 'cell phone', 'mobile phone']],
  ['company', 'Company', ['company name', 'brokerage', 'account', 'account name']], ['roleInCompany', 'Role in Company', ['role']], ['title', 'Title', ['job title']],
  ['leadSource', 'Lead Source', ['source']], ['relationshipStatus', 'Relationship Status', ['status', 'lead status']],
  ['street', 'Street', ['address', 'street address', 'mailing street']], ['city', 'City', ['mailing city']], ['state', 'State', ['st', 'mailing state']],
  ['zip', 'Zip Code', ['zip', 'zipcode', 'postal code', 'mailing zip']], ['county', 'County', []],
  ['links.zillowProfile', 'Zillow Profile', ['zillow', 'zillow url', 'zillow link']], ['links.website', 'Website', ['web', 'url']], ['links.linkedin', 'LinkedIn Profile', ['linkedin']],
  ['links.facebookProfile', 'Facebook Profile', ['facebook']], ['links.instagram', 'Instagram Profile', ['instagram']], ['licenseNo', 'Real Estate License #', ['license', 'license number']],
  ['ownerId', 'Owner (name or email of a salesperson)', ['owner', 'lead owner', 'client owner']], ['description', 'Description', ['notes', 'comments']]];
export const NOTE_IMPORT_FIELDS = [['email', 'Email (links the note)', ['email address', 'e-mail']], ['firstName', 'First Name', ['first']], ['lastName', 'Last Name', ['last', 'surname']],
  ['fullName', 'Full Name (if no first / last)', ['name', 'lead name', 'client name', 'contact name']], ['noteTitle', 'Note Title', ['title', 'subject']], ['note', 'Note *', ['note', 'body', 'note content', 'notes', 'text']]];
const norm = (h) => String(h || '').toLowerCase().replace(/\*/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// header -> target key ('' = skip); each target used once
export function guessMapping(headers, fields) { const used = new Set();
  return headers.map((h) => { const n = norm(h); const f = fields.find(([k, l, al]) => !used.has(k) && (norm(l) === n || norm(k.replace(/^links\./, '')) === n || (al || []).some((a) => norm(a) === n)));
    if (f) { used.add(f[0]); return f[0]; } return ''; }); }
// rows (arrays) + mapping -> objects { key: value }; returns { header, records }
export function applyMapping(rows, mapping) { const [header, ...data] = rows;
  return { header, records: data.map((r) => { const o = {}; mapping.forEach((k, i) => { if (k) { const v = String(r[i] == null ? '' : r[i]).trim(); if (v !== '' || o[k] === undefined) o[k] = v; } }); return o; }) }; }

// SAMPLE TEMPLATES (fake people, example.test addresses, 555 numbers)
export function sampleCsv(kind) {
  if (kind === 'notes') return toCsvText([['Email', 'First Name', 'Last Name', 'Note Title', 'Note'],
    ['casey.sample@example.test', 'Casey', 'Sample', 'Intro call', 'Talked about closing in Rockville. FAKE sample note.'],
    ['', 'Robin', 'Template', 'Follow up', 'No email on file, matched by name. FAKE sample note.']]);
  const st = kind === 'contacts' ? 'Prospecting' : 'Hot Prospect';
  return toCsvText([['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Role in Company', 'Lead Source', 'Relationship Status', 'Street', 'City', 'State', 'Zip Code', 'County', 'Zillow Profile', 'Description'],
    ['Casey', 'Sample', 'casey.sample@example.test', '301-555-0101', 'Harbor Realty (fake)', 'Realtor', 'Business Group', st, '1 Fake St', 'Rockville', 'MD', '20852', '', 'https://www.zillow.com/profile/casey-sample-fake', 'FAKE sample row'],
    ['Robin', 'Template', 'robin.template@example.test', '703-555-0102', '', 'Loan Officer', 'Warm Call', kind === 'contacts' ? 'Potential/Warm' : 'Voicemail 1', '2 Example Ave', 'Arlington', 'VA', '22201', '', '', 'FAKE: county comes from the ZIP'],
    ['Jordan', 'Placeholder', 'jordan.placeholder@example.test', '', '', 'Team Lead', '', kind === 'contacts' ? 'Prospecting' : 'Open to Meet', '', 'Miami', 'FL', '33130', '', '', 'FAKE sample row']]);
}

// ---------------- meeting invite (.ics, RFC 5545). NOTHING IS SENT. ----------------
const icsText = (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// fold at 75 octets (continuation lines start with a space)
const fold = (line) => { const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line; const out = []; let cur = '';
  for (const ch of line) { if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; } cur += ch; } out.push(cur); return out.join('\r\n '); };
const icsLocal = (s) => String(s).replace(/[-:]/g, '').slice(0, 13) + '00';   // 'YYYY-MM-DDTHH:MM' -> 'YYYYMMDDTHHMM00' (America/New_York)
const icsDate = (s) => String(s).slice(0, 10).replace(/-/g, '');
const icsUtc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const nextDay = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + 1)); return t.toISOString().slice(0, 10); };
const VTZ = ['BEGIN:VTIMEZONE', 'TZID:America/New_York', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD', 'END:VTIMEZONE'];
// m = { id, subject, body, location, allDay, startsAt, endsAt }, organizer = { name, email }, attendees = [{ name, email }], stamp = ISO time
export function buildIcs(m, organizer, attendees, stamp = new Date().toISOString()) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CLA Title & Escrow//Portal CRM (test)//EN', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST', ...(m.allDay ? [] : VTZ), 'BEGIN:VEVENT',
    `UID:crm-meeting-${String(m.id).replace(/[^A-Za-z0-9-]/g, '')}@portal.clatitle.invalid`, `DTSTAMP:${icsUtc(stamp)}`];
  if (m.allDay) { L.push(`DTSTART;VALUE=DATE:${icsDate(m.startsAt)}`, `DTEND;VALUE=DATE:${icsDate(nextDay(String(m.endsAt || m.startsAt).slice(0, 10)))}`); }
  else L.push(`DTSTART;TZID=America/New_York:${icsLocal(m.startsAt)}`, `DTEND;TZID=America/New_York:${icsLocal(m.endsAt || m.startsAt)}`);
  L.push(`SUMMARY:${icsText(m.subject)}`);
  if (m.location) L.push(`LOCATION:${icsText(m.location)}`);
  if (m.body) L.push(`DESCRIPTION:${icsText(m.body)}`);
  const cn = (s) => String(s || '').replace(/[";:,\r\n]/g, ' ').trim();
  if (organizer && organizer.email) L.push(`ORGANIZER;CN="${cn(organizer.name)}":mailto:${organizer.email}`);
  attendees.filter((a) => a.email).forEach((a) => L.push(`ATTENDEE;CN="${cn(a.name)}";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`));
  L.push('STATUS:CONFIRMED', 'SEQUENCE:0', 'END:VEVENT', 'END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
export const INVITE_NOTE = 'Sending turns on once Gmail is connected. Nothing was sent: this is a preview and an .ics file you can download.';

// ---------------- "+ Create New" (Home and every CRM page) ----------------
// [key, label, route] filtered by what the person may do (me = crmMe()). Processor (read-only), TCs and outside users get nothing to create.
export function createModules(me) {
  if (!me || !me.canEdit) return [];
  return [['lead', 'Lead', '#/crm/new/lead'], ['contact', 'Client', '#/crm/new/contact'], ['account', 'Company', '#/crm/new/account'], ['opportunity', 'Opportunity (Pipeline)', '#/crm/new/opportunity'],
    ['task', 'Task', '#/crm/new/task'], ['meeting', 'Meeting', '#/crm/new/meeting'], ['call', 'Call', '#/crm/new/call'], ['template', 'Email Template', '#/crm/templates/new'],
    ['report', 'Report', '#/crm/reports/new'], ['dashboard', 'Dashboard', '#/crm/new/dashboard'],
    ...(me.isAdmin ? [['import-leads', 'Import Leads (CSV)', '#/crm/import/leads'], ['import-contacts', 'Import Clients (CSV)', '#/crm/import/contacts']] : [])];
}
export const validState = (s) => US_STATES.includes(String(s || '').toUpperCase());
