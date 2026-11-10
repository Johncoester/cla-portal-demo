/* The office day is America/New_York. A browser in UTC is already on the next
 * calendar day after 7 PM Eastern, and the hosted open-date check rejects that
 * later day as the future. */
export const OFFICE_TZ = 'America/New_York';

export function officeDate(offsetDays = 0, now = new Date()) {
  const when = now instanceof Date ? now : new Date(now);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OFFICE_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(when);
  const pick = (type) => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  const shifted = new Date(Date.UTC(pick('year'), pick('month') - 1, pick('day') + (Number(offsetDays) || 0)));
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
