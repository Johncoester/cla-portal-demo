/* MF-061 (Matt Landsberg, "Portal Feedback Nov 22"; confirm-back reply Nov 22 2026, 1:54 PM ET, Gmail 1a2049c9ec631d7b).
 * Tasks show the buyer's or seller's own name ("Bob Smith", Seller) instead of the generic "Client-Seller" / "client" label,
 * so staff know whose task they are changing. Buyers the same way. Pure helpers; names come from the file's parties. */
import { partyDisplayName } from './party-name.js?v=202611102000';

const CLIENT = new Set(['Client-Buyer', 'Client-Seller']);
export const isClientRole = (role) => CLIENT.has(role);

/* "Buyer" / "Seller" (a refinance buyer is the Borrower). Other roles keep their own name (Buyer Agent, Processor, ...). */
export function sideWord(role, { refi = false, plural = false } = {}) {
  if (role === 'Client-Buyer') return refi ? (plural ? 'Borrowers' : 'Borrower') : (plural ? 'Buyers' : 'Buyer');
  if (role === 'Client-Seller') return plural ? 'Sellers' : 'Seller';
  return role || '';
}

const named = (n) => !!n && n !== 'Unnamed contact';

/* Fill ownerName from the file's parties: a person's own copy gets that person's name; a task for a whole side
 * (no participant) gets every name on that side ("Bob Smith & Susan Smith"). A name already on the task is kept. */
export function nameTasks(tasks, participants) {
  const parts = (participants || []).filter((p) => p && p.id && !p.removed);
  if (!parts.length) return tasks || [];
  const byId = new Map(parts.map((p) => [p.id, partyDisplayName(p)]));
  const side = (role) => [...new Set(parts.filter((p) => p.role === role).map(partyDisplayName).filter(named))];
  return (tasks || []).map((t) => {
    if (!t || (t.ownerName && String(t.ownerName).trim())) return t;
    const own = t.participantId ? byId.get(t.participantId) : '';
    if (named(own)) return { ...t, ownerName: own };
    if (!t.participantId && CLIENT.has(t.assignedRole)) {
      const names = side(t.assignedRole);
      if (names.length) return { ...t, ownerName: names.join(' & '), ownerIsSide: names.length > 1 };
    }
    return t;
  });
}

/* The small role line under the name: "Seller" rather than "Client-Seller". */
export function taskRoleLabel(t, { refi = false } = {}) {
  if (!t) return '';
  return CLIENT.has(t.assignedRole) ? sideWord(t.assignedRole, { refi, plural: !!t.ownerIsSide }) : (t.assignedRole || '');
}

/* One line: "Bob Smith (Seller)"; with no name on file, just "Seller". */
export function taskWhoText(t, opts = {}) {
  const role = taskRoleLabel(t, opts);
  const name = t && t.ownerName && String(t.ownerName).trim();
  return name ? `${name} (${role})` : role;
}
