/* CRM date filters (JN-48). Day boundaries are America/New_York.
 * Weeks start on Sunday. Months step by the calendar and clamp the day
 * (31 March minus one month is 28 February, or 29 in a leap year).
 * A window is half-open: [start, end). Date-only columns use startDate inclusive
 * and endDate exclusive. N is a whole number of days, weeks, or months. */
export const CRM_ZONE = 'America/New_York';
export const WEEK_START = 0;
export const DATE_UNITS = [['days', 'Days'], ['weeks', 'Weeks'], ['months', 'Months']];
export const DATE_OPS = [
  ['', 'Any time'],
  ['age_in', 'Age in'],
  ['due_in', 'Due in'],
  ['prev_n', 'Previous'],
  ['next_n', 'Next'],
  ['on', 'On'],
  ['before', 'Before'],
  ['after', 'After'],
  ['between', 'Between'],
  ['not_between', 'Not between'],
  ['today', 'Today'],
  ['tomorrow', 'Tomorrow'],
  ['till_yesterday', 'Till Yesterday'],
  ['starting_tomorrow', 'Starting Tomorrow'],
  ['yesterday', 'Yesterday'],
  ['this_week', 'This Week'],
  ['prev_week', 'Previous Week'],
  ['this_month', 'This Month'],
  ['prev_month', 'Previous Month'],
  ['this_year', 'This Year'],
  ['next_year', 'Next Year'],
  ['empty', 'is empty'],
  ['not_empty', 'is not empty'],
];
const NEEDS_N = new Set(['age_in', 'due_in', 'prev_n', 'next_n']);
const NEEDS_ONE = new Set(['on', 'before', 'after']);
const NEEDS_TWO = new Set(['between', 'not_between']);
const MAX_N = { days: 3650, weeks: 520, months: 240 };

export function pad2(n) { return String(n).padStart(2, '0'); }

export function nyParts(instant) {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CRM_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(d);
  const bit = (t) => parts.find((p) => p.type === t).value;
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[bit('weekday')];
  return { ymd: `${bit('year')}-${bit('month')}-${bit('day')}`, weekday, hour: Number(bit('hour')), minute: Number(bit('minute')), second: Number(bit('second')) };
}

export function nyDay(value) {
  const s = String(value || '');
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = nyParts(s);
  return parts ? parts.ymd : '';
}

export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

export function addMonthsClamped(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const idx = (m - 1) + n;
  const ty = y + Math.floor(idx / 12);
  const tm = ((idx % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${pad2(tm + 1)}-${pad2(Math.min(d, last))}`;
}

export function startOfZonedDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  for (let offsetMin = -12 * 60; offsetMin <= 14 * 60; offsetMin += 30) {
    const utc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMin * 60000);
    const parts = nyParts(utc);
    if (parts && parts.ymd === ymd && parts.hour === 0 && parts.minute === 0 && parts.second === 0) return utc;
  }
  throw new Error('No New York midnight for ' + ymd);
}

function ymdOf(date) { return nyParts(date).ymd; }
function monthStart(ymd) { return `${ymd.slice(0, 8)}01`; }
function weekStart(ymd) {
  const parts = nyParts(startOfZonedDay(ymd));
  return addDays(ymd, -parts.weekday);
}
function none() { return { mode: 'none', start: null, end: null, startDate: null, endDate: null }; }
function range(startYmd, endYmd) {
  return {
    mode: 'range',
    start: startYmd ? startOfZonedDay(startYmd) : null,
    end: endYmd ? startOfZonedDay(endYmd) : null,
    startDate: startYmd || null,
    endDate: endYmd || null,
  };
}
function outside(startYmd, endYmd) {
  const win = range(startYmd, endYmd);
  win.mode = 'outside';
  return win;
}

export function cleanDateSpec(spec) {
  const op = String(spec && spec.op || '');
  if (!op) {
    const from = spec && spec.from ? String(spec.from).slice(0, 10) : '';
    const to = spec && spec.to ? String(spec.to).slice(0, 10) : '';
    if (!from && !to) return { op: '' };
    return { op: 'between', value: from || to, value2: to || from };
  }
  if (!DATE_OPS.some(([k]) => k === op)) throw new Error('Unknown date filter.');
  const out = { op };
  if (NEEDS_N.has(op)) {
    const unit = DATE_UNITS.some(([k]) => k === spec.unit) ? spec.unit : 'days';
    const n = Math.trunc(Number(spec.n));
    if (!Number.isFinite(n) || n < 1 || n > MAX_N[unit]) throw new Error('Enter a whole number of ' + unit + '.');
    out.n = n; out.unit = unit;
  }
  if (NEEDS_ONE.has(op) || NEEDS_TWO.has(op)) {
    const value = String(spec.value || spec.from || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Enter a date.');
    out.value = value;
  }
  if (NEEDS_TWO.has(op)) {
    const value2 = String(spec.value2 || spec.to || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value2)) throw new Error('Enter both dates.');
    out.value2 = value2;
  }
  return out;
}

export function dateWindow(spec, now = new Date()) {
  let clean;
  try { clean = cleanDateSpec(spec || {}); }
  catch (e) { return none(); }
  if (!clean.op) return none();
  const today = nyDay(now);
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);
  const n = clean.n || 0;
  const unit = clean.unit || 'days';
  const span = unit === 'weeks' ? n * 7 : n;
  if (clean.op === 'empty') return { mode: 'empty', start: null, end: null, startDate: null, endDate: null };
  if (clean.op === 'not_empty') return { mode: 'present', start: null, end: null, startDate: null, endDate: null };
  if (clean.op === 'today') return range(today, tomorrow);
  if (clean.op === 'tomorrow') return range(tomorrow, addDays(tomorrow, 1));
  if (clean.op === 'yesterday') return range(yesterday, today);
  if (clean.op === 'till_yesterday') return range(null, today);
  if (clean.op === 'starting_tomorrow') return range(tomorrow, null);
  if (clean.op === 'this_week') { const s = weekStart(today); return range(s, addDays(s, 7)); }
  if (clean.op === 'prev_week') { const s = addDays(weekStart(today), -7); return range(s, addDays(s, 7)); }
  if (clean.op === 'this_month') { const s = monthStart(today); return range(s, monthStart(addMonthsClamped(s, 1))); }
  if (clean.op === 'prev_month') { const s = monthStart(addMonthsClamped(monthStart(today), -1)); return range(s, monthStart(today)); }
  if (clean.op === 'this_year') return range(`${today.slice(0, 4)}-01-01`, `${Number(today.slice(0, 4)) + 1}-01-01`);
  if (clean.op === 'next_year') { const y = Number(today.slice(0, 4)) + 1; return range(`${y}-01-01`, `${y + 1}-01-01`); }
  if (clean.op === 'on') return range(clean.value, addDays(clean.value, 1));
  if (clean.op === 'before') return range(null, clean.value);
  if (clean.op === 'after') return range(addDays(clean.value, 1), null);
  if (clean.op === 'between' || clean.op === 'not_between') {
    const a = clean.value <= clean.value2 ? clean.value : clean.value2;
    const b = clean.value <= clean.value2 ? clean.value2 : clean.value;
    const win = range(a, addDays(b, 1));
    if (clean.op === 'not_between') win.mode = 'outside';
    return win;
  }
  if (unit === 'months' && (clean.op === 'prev_n' || clean.op === 'next_n')) {
    const thisMonth = monthStart(today);
    if (clean.op === 'prev_n') return range(monthStart(addMonthsClamped(thisMonth, -n)), thisMonth);
    return range(monthStart(addMonthsClamped(thisMonth, 1)), monthStart(addMonthsClamped(thisMonth, 1 + n)));
  }
  if (unit === 'months' && clean.op === 'age_in') return range(addMonthsClamped(today, -n), tomorrow);
  if (unit === 'months' && clean.op === 'due_in') return range(today, addDays(addMonthsClamped(today, n), 1));
  if (clean.op === 'age_in') return range(addDays(today, -(span - 1)), tomorrow);
  if (clean.op === 'due_in') return range(today, addDays(today, span));
  if (clean.op === 'prev_n') return range(addDays(today, -span), today);
  if (clean.op === 'next_n') return range(tomorrow, addDays(tomorrow, span));
  return none();
}

export function matchesDateWindow(value, spec, now = new Date()) {
  const win = dateWindow(spec, now);
  if (win.mode === 'none') return true;
  const day = nyDay(value);
  if (win.mode === 'empty') return !day;
  if (win.mode === 'present') return !!day;
  if (!day) return false;
  const afterStart = !win.startDate || day >= win.startDate;
  const beforeEnd = !win.endDate || day < win.endDate;
  const inside = afterStart && beforeEnd;
  return win.mode === 'outside' ? !inside : inside;
}

export { ymdOf, outside };
