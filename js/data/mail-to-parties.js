/* MF-066 (Matt Landsberg, Portal Feedback Nov 25 2026): To is a multi-select of file parties, shown as "Name (Role) — email". */
import { introRecipients, INTRO_ROLES } from './gmail-email.js?v=202611191000';

export function partyRecipientLabel(p, roleText) {
  const email = String(p && p.email || '').trim();
  const name = String(p && p.name || '').trim() || email;
  const role = String(roleText || (p && p.role) || '').trim() || 'on this file';
  return `${name} (${role}) — ${email}`;
}

export function fileEmailParties(deal, nameOf) {
  const intro = introRecipients(deal);
  const seen = new Set(intro.map((r) => r.email));
  const rest = [];
  for (const part of (deal && deal.participants) || []) {
    if (part.removed || !part.contact || !part.contact.email || part.contact.contactHidden) continue;
    if (INTRO_ROLES.includes(part.role)) continue;
    const email = String(part.contact.email).trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const fallback = `${part.contact.firstName || ''} ${part.contact.lastName || ''}`.trim();
    rest.push({ name: nameOf ? (nameOf(part) || fallback) : fallback, email, role: part.role });
  }
  return intro.concat(rest);
}
