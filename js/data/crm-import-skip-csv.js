/* crm-import-skip-csv.js : the CRM import error CSV, including rows skipped as duplicates.
 * FAKE DATA ONLY. Nothing here talks to the network. One pass, so 10000 rows stays cheap. */
import { toCsvText } from './crm-janine.js?v=202611247700';

// The download lists every skipped row. Show it when a row failed or was a duplicate.
export function importSkipCsvReady(counts) {
  const c = counts || {};
  return (Number(c.errors) || 0) + (Number(c.duplicates) || 0) > 0;
}

const digits = (v) => String(v || '').replace(/\D/g, '');
const personName = (v) => String((v && (v.fullName || `${v.firstName || ''} ${v.lastName || ''}`)) || '').replace(/\s+/g, ' ').trim();
const who = (name, extra) => {
  const n = String(name || '').trim();
  const e = String(extra || '').trim();
  if (n && e) return `${n} / ${e}`;
  return n || e || 'this person';
};

// Email, or a phone of at least 7 digits (the same rule as the CRM duplicate check). A note matches another note on the same person with the same title and text.
function matchKeys(row) {
  const v = (row && row.values) || {};
  const note = String(v.note || '').trim();
  if (note) {
    const person = String(v.email || '').trim().toLowerCase() || personName(v).toLowerCase();
    if (!person) return [];
    return ['n:' + person + '\n' + String(v.noteTitle || '').trim().toLowerCase() + '\n' + note];
  }
  const keys = [];
  const email = String(v.email || '').trim().toLowerCase();
  if (email) keys.push('e:' + email);
  const phone = digits(v.phone);
  if (phone.length >= 7) keys.push('p:' + phone);
  return keys;
}

// The first ready or duplicate row keeps each email, phone, or note. A later duplicate of that key names that row.
function earlierDuplicateLines(rows) {
  const seen = new Map();
  const earlier = new Map();
  const ordered = (rows || []).filter((r) => r && (r.status === 'ok' || r.status === 'duplicate'));
  ordered.sort((a, b) => (Number(a.line) || 0) - (Number(b.line) || 0));
  for (const row of ordered) {
    const line = Number(row.line) || 0;
    const keys = matchKeys(row);
    let hit = 0;
    for (const key of keys) {
      const prev = seen.get(key);
      if (prev && prev !== line && (!hit || prev < hit)) hit = prev;
    }
    if (row.status === 'duplicate' && hit) earlier.set(line, hit);
    for (const key of keys) if (!seen.has(key)) seen.set(key, line);
  }
  return earlier;
}

function existingKind(message, module) {
  const msg = String(message || '');
  const client = /\bClient\b/.test(msg);
  const lead = /\bLead\b/.test(msg);
  if (client && !lead) return 'client';
  if (lead && !client) return 'lead';
  return module === 'contacts' ? 'client' : 'lead';
}

// A repeat of an earlier row in this file names that row. Otherwise name the lead or client already on file.
function duplicateReason(row, earlierLine, module) {
  if (earlierLine) return `Duplicate within file, row ${earlierLine}`;
  const msg = String(row && row.message || '');
  const v = (row && row.values) || {};
  const used = msg.match(/already used by (Lead|Client) (.+?) \(owner /i);
  if (used) {
    let extra = '';
    if (/this email is already used/i.test(msg)) extra = v.email;
    else if (/phone number is already used/i.test(msg)) extra = v.phone;
    return `Duplicate of existing ${used[1].toLowerCase()}: ${who(used[2], extra)}`;
  }
  const note = msg.match(/this note is already on (.+?)\.?\s*$/i);
  if (note) return `Duplicate of existing ${existingKind(msg, module)}: ${who(note[1], v.email)}`;
  return `Duplicate of existing ${existingKind(msg, module)}: ${who(personName(v), v.email)}`;
}

// Skipped rows as a CSV: row number, the original field values, the message, and a plain-English reason.
// Error rows stay. Duplicate rows are included.
export function importErrorCsv(rows, fields = [], module = '') {
  const list = Array.isArray(rows) ? rows : [];
  const skipped = list.filter((r) => r && (r.status === 'error' || r.status === 'duplicate'));
  const pairs = fields.length ? fields.map((f) => (Array.isArray(f) ? [f[0], f[1]] : [f, f])) : [];
  const keys = pairs.length ? pairs.map(([k]) => k) : [...new Set(skipped.flatMap((r) => Object.keys(r.values || {})))];
  const labels = pairs.length ? pairs.map(([, l]) => l) : keys;
  const earlier = earlierDuplicateLines(list);
  const header = ['Row', ...labels, 'Error', 'Reason'];
  const body = skipped.map((r) => [
    r.line,
    ...keys.map((k) => (r.values && r.values[k] != null ? r.values[k] : '')),
    r.message || '',
    r.status === 'duplicate' ? duplicateReason(r, earlier.get(Number(r.line) || 0), module) : (r.message || ''),
  ]);
  return toCsvText([header, ...body]);
}
