/* crm-report-schedule.js : RPT-3b (John, Nov 22 2026). A schedule on a saved CRM report.
 * John's rules: only an Admin or Super admin sets up or changes a schedule; it can send to ANY email address;
 * the full list of recipients always shows on the scheduled report. Times are Eastern Time.
 * This file is the shared rule book (what a schedule may hold, how it reads in plain words). It sends nothing. */
export const SCHEDULE_FREQUENCIES = [['daily', 'Every day'], ['weekdays', 'Every weekday (Mon to Fri)'], ['weekly', 'Every week'], ['monthly', 'Every month']];
export const SCHEDULE_WEEKDAYS = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [0, 'Sunday']];
export const SCHEDULE_MAX_RECIPIENTS = 25;
export const SCHEDULE_TZ_LABEL = 'ET';
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;

// "a@x.com, b@y.com; c@z.com" or one per line -> lower-case, trimmed, each once, in the order typed
export function parseRecipients(v) {
  const list = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[\s,;]+/);
  const out = []; list.forEach((x) => { const e = String(x == null ? '' : x).trim().toLowerCase(); if (e && !out.includes(e)) out.push(e); }); return out;
}
export const badRecipients = (list) => parseRecipients(list).filter((e) => !EMAIL.test(e) || e.length > 254);

// "7", "7:5", "07:30" -> "07:30"; anything else -> ''
export function cleanTime(v) {
  const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(String(v == null ? '' : v).trim()); if (!m) return '';
  const h = +m[1]; const mi = m[2] == null ? 0 : +m[2]; if (h > 23 || mi > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
export function timeLabel(t) {
  const c = cleanTime(String(t || '').slice(0, 5)); if (!c) return ''; const h = +c.slice(0, 2); const mi = c.slice(3);
  return `${h % 12 === 0 ? 12 : h % 12}:${mi} ${h < 12 ? 'AM' : 'PM'}`;
}

/* What a schedule may hold. Throws a plain-English message for the first thing wrong. */
export function cleanSchedule(input = {}) {
  const frequency = String(input.frequency || '').trim();
  if (!SCHEDULE_FREQUENCIES.some(([k]) => k === frequency)) throw new Error('Pick how often the report is sent.');
  const time = cleanTime(String(input.time == null ? '' : input.time).slice(0, 5)); if (!time) throw new Error('Pick a time of day, for example 7:00.');
  let weekday = null; let monthDay = null;
  if (frequency === 'weekly') { weekday = Number(input.weekday); if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || input.weekday === '' || input.weekday == null) throw new Error('Pick the day of the week.'); }
  if (frequency === 'monthly') { monthDay = Number(input.monthDay); if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 28) throw new Error('Pick a day of the month from 1 to 28.'); }
  const recipients = parseRecipients(input.recipients);
  if (!recipients.length) throw new Error('Add at least one email address to send the report to.');
  if (recipients.length > SCHEDULE_MAX_RECIPIENTS) throw new Error(`A schedule can send to at most ${SCHEDULE_MAX_RECIPIENTS} email addresses.`);
  const bad = badRecipients(recipients); if (bad.length) throw new Error(`This is not an email address: ${bad[0]}`);
  return { frequency, time, weekday, monthDay, recipients, active: input.active !== false };
}

// "Every weekday at 7:00 AM ET"
export function scheduleText(s) {
  if (!s) return ''; const at = `at ${timeLabel(s.time)} ${SCHEDULE_TZ_LABEL}`;
  if (s.frequency === 'daily') return `Every day ${at}`;
  if (s.frequency === 'weekdays') return `Every weekday ${at}`;
  if (s.frequency === 'weekly') return `Every ${(SCHEDULE_WEEKDAYS.find(([n]) => n === Number(s.weekday)) || [0, 'week'])[1]} ${at}`;
  if (s.frequency === 'monthly') return `On day ${s.monthDay} of every month ${at}`;
  return '';
}
// who may set up or change a schedule (John: "Scheduling stays with admins.")
export const canSchedule = (u) => !!u && !!u.isAdmin;
// addresses that are not on the company's own mail (shown so nobody sends file data outside by accident)
export const outsideRecipients = (list, domain = 'clatitle.com') => parseRecipients(list).filter((e) => !e.endsWith('@' + domain));
