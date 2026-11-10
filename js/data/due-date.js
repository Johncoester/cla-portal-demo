// Task due dates. Days are added to an anchor date. A missing anchor stays blank.
export const DUE_ANCHORS = ['opened', 'contract', 'closing'];

export function addCalendarDays(ymd, days) {
  if (!ymd || !Number.isInteger(days)) return null;
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  if (![y, m, d].every((n) => Number.isFinite(n))) return null;
  const t = new Date(Date.UTC(y, m - 1, d + days));
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

export function cleanDueRule(input = {}) {
  const anchor = DUE_ANCHORS.includes(input.dueAnchor) ? input.dueAnchor : 'opened';
  const raw = input.dueDays == null || input.dueDays === '' ? 7 : input.dueDays;
  const days = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(days) || days === 0 || days < -90 || days > 90) {
    throw new Error('Due days must be from -90 to 90, not zero. Positive is after the anchor and negative is before it.');
  }
  return { dueAnchor: anchor, dueDays: days };
}

export function taskDueDate({ dueAnchor = 'opened', dueDays = 7, openDate, contractDate, closingDate, override = null } = {}) {
  if (override) return String(override).slice(0, 10);
  const anchor = dueAnchor === 'closing' ? closingDate : dueAnchor === 'contract' ? contractDate : openDate;
  let days = 7;
  try { days = cleanDueRule({ dueAnchor, dueDays }).dueDays; } catch (e) { return null; }
  return addCalendarDays(anchor, days);
}
