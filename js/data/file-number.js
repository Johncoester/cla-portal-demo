/* File number prefix follows the property state (John, Nov 9: MD-26-97220 was a Miami, FL file).
   Format: <STATE>-<YY>-<sequence>, e.g. FL-26-97220. The sequence number is shared by every state, so it stays unique.
   Mirrored in SQL by private.deal_file_number (migration 20261109230000_file_number_state_prefix). */
export const FILE_NUMBER_RE = /^([A-Z]{2})-(\d{2})-(\d+)$/;
export const DEFAULT_PREFIX = 'MD';
const INTERNAL_DOMAIN = '@clatitle.com';

export function filePrefix(state) {
  const s = String(state == null ? '' : state).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : DEFAULT_PREFIX;
}

export function buildFileNumber(state, yy, seq) { return `${filePrefix(state)}-${String(yy).padStart(2, '0').slice(-2)}-${seq}`; }

// FF-050: a staff edit of one file's number. New files still use buildFileNumber. 40 matches the length already used when a file number is stored on a feedback note.
export const FILE_NUMBER_MAX = 40;
export const FILE_NUMBER_TAKEN = 'That file number is already on another file. Enter a different number.';
export function cleanFileNumber(raw) {
  const value = String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
  if (!value) return { ok: false, error: 'Enter a file number.' };
  if (value.length > FILE_NUMBER_MAX) return { ok: false, error: 'A file number can be up to 40 characters. Shorten it and save again.' };
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._/#'-]*$/.test(value)) return { ok: false, error: 'Use letters, numbers, and these marks only: space, hyphen, period, slash, and #.' };
  return { ok: true, value };
}

/* The number with the new state's prefix, or null when it is not a generated number (e.g. DEMO-100) or nothing changes. */
export function retagFileNumber(fileNumber, state) {
  const m = FILE_NUMBER_RE.exec(String(fileNumber || ''));
  if (!m) return null;
  const next = `${filePrefix(state)}-${m[2]}-${m[3]}`;
  return next === fileNumber ? null : next;
}

const outside = (e) => { const s = String(e || '').trim().toLowerCase(); return !!s && !s.endsWith(INTERNAL_DOMAIN); };

/* "Still new": nothing carrying the number has gone to anyone outside CLA (a sent file email or a sent outbox message). */
export function sentOutside({ emails = [], outbox = [] } = {}) {
  const mail = emails.some((m) => m && m.direction === 'out' && [].concat(m.toEmails || [], m.ccEmails || [], m.bccEmails || []).some(outside));
  const box = outbox.some((o) => o && (o.sentAt || o.status === 'sent') && [o.toEmail].concat(o.ccEmails || [], o.bccEmails || []).some(outside));
  return mail || box;
}
