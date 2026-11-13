/* FF-071 #23 (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis confirm-back Nov 12 6:14 PM ET) and FF-052 / MF-050:
 * the file's disbursement date.
 *  - Purchase: the closing date.
 *  - Refinance (right of rescission): the 4th business day after closing. The 3-day rescission period skips Sundays and federal
 *    legal holidays; Saturdays count. Disbursement is the next business day after the 3rd one.
 *  - The processor can set a different date (for example a refinance with no right of rescission); that date wins.
 * Pure helpers on 'YYYY-MM-DD' strings (no time zones involved). */
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const nthWeekday = (y, m, wd, n) => { const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); return 1 + ((wd - first + 7) % 7) + (n - 1) * 7; };
const lastWeekday = (y, m, wd) => { const last = new Date(Date.UTC(y, m, 0)); return last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7); };

// Federal legal public holidays (5 U.S.C. 6103(a)), on their actual dates.
export function federalHolidays(y) {
  return new Set([iso(y, 1, 1), iso(y, 1, nthWeekday(y, 1, 1, 3)), iso(y, 2, nthWeekday(y, 2, 1, 3)), iso(y, 5, lastWeekday(y, 5, 1)), iso(y, 6, 19), iso(y, 7, 4),
    iso(y, 9, nthWeekday(y, 9, 1, 1)), iso(y, 10, nthWeekday(y, 10, 1, 2)), iso(y, 11, 11), iso(y, 11, nthWeekday(y, 11, 4, 4)), iso(y, 12, 25)]);
}
const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
const fmt = (d) => iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
export function isRescissionBusinessDay(s) { const d = parse(s); if (!d) return false; return d.getUTCDay() !== 0 && !federalHolidays(d.getUTCFullYear()).has(fmt(d)); }

export function refinanceDisbursement(closing) {
  const d = parse(closing); if (!d) return '';
  let counted = 0;
  while (counted < 4) { d.setUTCDate(d.getUTCDate() + 1); if (isRescissionBusinessDay(fmt(d))) counted += 1; }
  return fmt(d);
}

const closingOf = (deal) => { const sc = deal && deal.scheduledClosing; return (deal && deal.closingDate) || (sc && sc.at ? String(sc.at).slice(0, 10) : ''); };
const refi = (deal) => !!deal && (deal.transactionType === 'Refinance' || deal.transaction_type === 'Refinance');

// { date, source: 'set' | 'auto' | '' , note }
export function disbursementFor(deal) {
  if (deal && deal.disbursementDate) return { date: String(deal.disbursementDate).slice(0, 10), source: 'set', note: 'set by CLA Title' };
  const closing = closingOf(deal);
  if (!closing) return { date: '', source: '', note: 'set when the closing date is set' };
  return refi(deal) ? { date: refinanceDisbursement(closing), source: 'auto', note: '4th business day after closing (refinance)' } : { date: closing, source: 'auto', note: 'same day as closing' };
}
