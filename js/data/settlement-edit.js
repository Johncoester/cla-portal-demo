/* In-place settlement edits on a file (MF-011). Fake data only. No network.
 * Date, closer, and signing method use columns that already exist.
 * closingTime is deals.closing_time (HH:MM). Agents are the existing participant rows. */
import { runsOrders, isRefi, REFI_BLOCKED_ROLES } from './constants.js?v=202611101015';
import { canManageClosingLocations } from './closing-location.js?v=202611101015';

export const CLOSING_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function cleanClosingTime(value) {
  const t = String(value == null ? '' : value).trim();
  if (!t) return '';
  if (!CLOSING_TIME_RE.test(t)) throw new Error('Enter a time as HH:MM, or clear it.');
  return t;
}

export function settlementClock(deal) {
  const stored = String(deal && deal.closingTime || '').trim();
  if (CLOSING_TIME_RE.test(stored)) return stored;
  const at = deal && deal.scheduledClosing && deal.scheduledClosing.at;
  const m = String(at || '').match(/T(\d{2}:\d{2})/);
  return m && CLOSING_TIME_RE.test(m[1]) ? m[1] : '';
}

export function settlementEditFlags(user, { demoLocked = false } = {}) {
  const staffView = !!(user && !user.accountRole && user.role !== 'Outside user');
  const canEdit = !!(staffView && runsOrders(user) && !demoLocked);
  const canEditSigning = !!(staffView && canManageClosingLocations(user) && !demoLocked);
  return { staffView, canEdit, canEditSigning };
}

export function agentRoleEditable(deal, role) {
  if (isRefi(deal) && REFI_BLOCKED_ROLES.includes(role)) return false;
  return true;
}

/* Swap one agent row. A blank contact removes that row. The contact record stays. */
export async function saveSettlementAgent(api, deal, { role, participantId, contactId } = {}) {
  const rows = (deal.participants || []).filter((p) => p && p.role === role && !p.removed);
  const current = participantId ? rows.find((p) => p.id === participantId) : null;
  const next = String(contactId || '');
  if ((current ? current.contactId : '') === next) return { changed: false };
  if (current) await api.removeParticipant(deal.id, current.id);
  if (next) await api.addParticipant(deal.id, next, role);
  return { changed: true };
}
