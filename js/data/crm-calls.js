/* crm-calls.js : Zoho CRM video 11 "Adding a Call" (Janine / John, Nov 3; storage v25, migration 33). PURE helpers shared by the mock adapter,
 * the screens and the unit tests. FAKE DATA ONLY. A call is a crm_activities row with kind 'call':
 *   Schedule a call -> callMode 'scheduled', callStatus 'Scheduled' (open; may be in the future) -> Mark as Completed -> 'Completed' + duration.
 *   Log a call      -> callMode 'logged',    callStatus 'Completed' (start not in the future, duration above zero).
 * Call To = the lead / client the call is on (entity + entityId: the same access rules as every CRM activity). Related To = an optional
 * Company, Opportunity or Deal. Reminders are RECORDED ONLY (shown in the portal; nothing is ever sent). Voice recordings stay in this browser. */
export const CALL_TYPE_CHOICES = ['Outbound', 'Inbound'];            // new calls; 'Missed' (Nov 3 b quick log) stays readable on older calls
export const CALL_TYPES_ALL = ['Outbound', 'Inbound', 'Missed'];
export const CALL_SCHEDULED = 'Scheduled';
export const CALL_COMPLETED = 'Completed';
export const CALL_STATUSES = [CALL_SCHEDULED, CALL_COMPLETED];
export const CALL_REMINDERS = [['', 'None'], ['5', '5 minutes before'], ['10', '10 minutes before'], ['15', '15 minutes before'], ['30', '30 minutes before'], ['60', '1 hour before'], ['120', '2 hours before']];
export const CALL_REMINDER_MINUTES = [5, 10, 15, 30, 60, 120];
export const CALL_OUTCOMES = ['Hot Lead', 'Shows Interest', 'Not Interested', 'Do Not Contact'];   // CRM Settings picklist 'callOutcome' (blank = -None-)
export const CALL_TO_TYPES = [['contact', 'Clients'], ['lead', 'Leads']];
export const RELATED_TO_TYPES = [['account', 'Companies'], ['opportunity', 'Opportunities'], ['deal', 'Deals']];
export const CALL_TO_CODES = CALL_TO_TYPES.map(([c]) => c);
export const RELATED_TO_CODES = RELATED_TO_TYPES.map(([c]) => c);
export const CALL_TIME_MSG = 'Please provide a valid call start time and duration.';
export const CALL_ZERO_MSG = 'Call duration cannot be zero';
export const MAX_CALL_SECONDS = 24 * 3600;
export const VOICE_EXT = ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'webm', 'aac', 'amr'];

const p2 = (n) => String(n).padStart(2, '0');
// MM minutes SS seconds -> seconds. Blank -> 0. Refuses negatives, fractions, seconds over 59 and calls over 24 hours.
export function durationSeconds(min, sec) {
  const m = String(min == null ? '' : min).trim(), s = String(sec == null ? '' : sec).trim();
  const mi = m === '' ? 0 : Number(m), se = s === '' ? 0 : Number(s);
  if (!Number.isInteger(mi) || !Number.isInteger(se) || mi < 0 || se < 0) throw new Error('Call Duration must be whole minutes and seconds.');
  if (se > 59) throw new Error('Seconds must be 0 to 59.');
  const t = mi * 60 + se; if (t > MAX_CALL_SECONDS) throw new Error('A call can last at most 24 hours.');
  return t;
}
// 185 -> '03:05' (Zoho shows mm:ss); null -> ''
export const durationText = (secs) => (secs == null || secs === '' ? '' : `${p2(Math.floor(Number(secs) / 60))}:${p2(Number(secs) % 60)}`);
export const durationWords = (secs) => (secs == null ? '' : `${Math.floor(secs / 60)} minutes ${secs % 60} seconds`);
// the seconds of a stored call: new calls carry callDurationSec; Nov 3 (b) quick logs carried whole minutes (callDuration)
export const callSeconds = (a) => (a.callDurationSec != null ? a.callDurationSec : a.callDuration != null ? a.callDuration * 60 : null);
// 'YYYY-MM-DDTHH:MM' minus n minutes (local) -> same format
export function minusMinutes(stamp, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(stamp || '')); if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5] - Number(n));
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
export const reminderLabel = (m) => (CALL_REMINDERS.find(([v]) => v === String(m == null ? '' : m)) || CALL_REMINDERS[0])[1];
export const callOpen = (a) => a.kind === 'call' && a.callStatus === CALL_SCHEDULED;
export const callStatusOf = (a) => a.callStatus || CALL_COMPLETED;   // every call before video 11 was a log of a call that happened
// Zoho's default subjects (the form keeps the typed text once the user changes it)
export function defaultCallSubject(mode, type, name) {
  const n = String(name || '').trim() || 'this record';
  if (mode === 'scheduled') return `Call scheduled with ${n}`;
  return type === 'Inbound' ? `Incoming call from ${n}` : `Outgoing call to ${n}`;
}
// v24 / v23 / ... -> v25: calls logged with the Nov 3 (b) form (duration in whole minutes) become logged, Completed calls; their minutes are
// kept (callDuration) and copied to seconds (callDurationSec = minutes x 60). Nothing is removed. Idempotent.
export function upgradeCalls(d) {
  (d.crmActivities || []).forEach((a) => {
    if (a.kind !== 'call') return;
    if (!a.callMode) a.callMode = 'logged';
    if (!a.callStatus) a.callStatus = CALL_COMPLETED;
    if (a.callDurationSec === undefined) a.callDurationSec = a.callDuration == null ? null : a.callDuration * 60;
    if (a.callType === undefined) a.callType = '';
    ['fromNumber', 'toNumber', 'callOutcome', 'reasonNotInterested', 'callNotes'].forEach((k) => { if (a[k] === undefined) a[k] = ''; });
    ['relatedEntity', 'relatedId', 'callReminder', 'callReminderAt', 'voiceRecording', 'completedAt'].forEach((k) => { if (a[k] === undefined) a[k] = null; });
    if (a.callStatus === CALL_COMPLETED && !a.completedAt) a.completedAt = a.doneAt || a.createdAt || null;
  });
  d.crmListExports ||= [];
  return d;
}
