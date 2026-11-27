/* MF-078 (Matt, confirmed Nov 27 2026, Gmail 1a21e27a512122fe).
 * Colors for open tasks (to do, started, blocked) on the file's Tasks tab and the Task Grid.
 * Red: the task is still open and the file's settlement / closing date is 7 days away or less
 * (including today and a closing date already past).
 * Orange: the task is 7 or more days past its own due date.
 * If both apply, red wins. 1–6 days past due with settlement more than 7 days out stays the
 * normal status color. Done and cancelled tasks never get red or orange. */

export const OPEN_URGENCY_STATUSES = ['todo', 'in_progress', 'blocked'];

export function calendarDaysBetween(fromYmd, toYmd) {
  const a = ymdParts(fromYmd);
  const b = ymdParts(toYmd);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 864e5);
}

function ymdParts(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '').trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

export function isOpenUrgencyStatus(task) {
  return !!(task && OPEN_URGENCY_STATUSES.includes(task.status));
}

export function closingDateOf(task, closingDate) {
  return closingDate || (task && (task.closingDate || (task.deal && task.deal.closingDate))) || '';
}

/* Returns 'red', 'orange', or '' for a single task. */
export function taskUrgency(task, { today, closingDate } = {}) {
  if (!isOpenUrgencyStatus(task) || !today) return '';
  const close = closingDateOf(task, closingDate);
  if (close) {
    const untilClose = calendarDaysBetween(today, close);
    if (untilClose != null && untilClose <= 7) return 'red';
  }
  const due = task.dueDate || task.due_date || '';
  if (due) {
    const pastDue = calendarDaysBetween(due, today);
    if (pastDue != null && pastDue >= 7) return 'orange';
  }
  return '';
}

export function urgencyTone(urgency) {
  if (urgency === 'red') return 'is-due-soon';
  if (urgency === 'orange') return 'is-past-due';
  return '';
}

/* Task Grid cell / party mark for the strongest open copy. */
export function urgencyGridState(urgency) {
  if (urgency === 'red') return 'due-soon';
  if (urgency === 'orange') return 'past-due';
  return '';
}

export function strongestUrgency(values) {
  if ((values || []).includes('red')) return 'red';
  if ((values || []).includes('orange')) return 'orange';
  return '';
}
