/* PROC-1 (John, Nov 14 2026, recording "Adding a processor").
 * File Overview reads deals.processor_id. Contacts reads a deal_participants row
 * with role Processor. These helpers keep the mock copy of both in step.
 * The database file 20261122180000_processor_party_sync.sql does the same on TEST.
 * Any active staff login can be the Processor (ANYROLE-1). */
import { PROCESSOR_PICK_ROLES } from './place-order.js?v=202611243800';

export const PROCESSOR_NO_LOGIN = 'Pick an active staff login. A person with no portal login cannot be the Processor.';
export const PROCESSOR_NOT_STAFF = 'The Processor on an order must be an active staff login.';
export const PROCESSOR_DEMO = 'A real order cannot use a demo login, and a demo order cannot use a real login.';
export const PROCESSOR_OUTSIDE = 'An outside user cannot be added as CLA staff. Pick Buyer Agent, Listing Agent, Client-Buyer or Client-Seller.';
export const PROCESSOR_EMAIL = 'That staff login shares an email with a different contact. Pick the staff login from the list.';

const OPEN = ['todo', 'in_progress', 'blocked'];

export function processorStaffError(profile, actor) {
  if (!profile) return PROCESSOR_NO_LOGIN;
  if (profile.role === 'Outside user' && profile.status !== 'removed') return PROCESSOR_OUTSIDE;
  if (!PROCESSOR_PICK_ROLES.includes(profile.role) || profile.status !== 'active') return PROCESSOR_NOT_STAFF;
  if (!!profile.isDemo !== !!(actor && actor.isDemo)) return PROCESSOR_DEMO;
  return '';
}

function cancelOpenTasks(db, rows) {
  const ids = new Set((rows || []).map((p) => p && p.id).filter(Boolean));
  if (!ids.size || !Array.isArray(db.tasks)) return;
  db.tasks.forEach((t) => { if (ids.has(t.participantId) && OPEN.includes(t.status)) t.status = 'cancelled'; });
}

/* Find or make the contact linked to this staff login. A blank email is left blank. */
export function ensureProcessorContact(db, profile, { newContactId, now, actorId }) {
  let c = (db.contacts || []).find((z) => z.profileId === profile.id);
  if (c) return c;
  const email = String(profile.email || '').trim().toLowerCase();
  c = email ? (db.contacts || []).find((z) => !z.profileId && String(z.email || '').trim().toLowerCase() === email) : null;
  if (c) {
    c.profileId = profile.id;
    if (!String(c.firstName || '').trim()) c.firstName = profile.firstName || '';
    if (!String(c.lastName || '').trim()) c.lastName = profile.lastName || '';
    return c;
  }
  if (email && (db.contacts || []).some((z) => String(z.email || '').trim().toLowerCase() === email)) return { error: PROCESSOR_EMAIL };
  c = {
    id: newContactId(), profileId: profile.id, firstName: profile.firstName || '', lastName: profile.lastName || '',
    email, phone: profile.phone || '', company: 'CLA Title & Escrow', contactType: null, createdBy: actorId || null, createdAt: now(),
  };
  db.contacts.push(c);
  return c;
}

function staffContact(db, contactId) {
  const c = (db.contacts || []).find((z) => z.id === contactId);
  return !!(c && c.profileId);
}

/* The staff login's Processor row. A Contacts row with no portal login is left as it is:
 * Share Files and closing already allow that row, and it is not the file's Processor. */
export function assignProcessorParty(db, { dealId, profile, actor, now, newParticipantId, newContactId, actorId }) {
  const msg = processorStaffError(profile, actor);
  if (msg) return { error: msg };
  const contact = ensureProcessorContact(db, profile, { newContactId, now, actorId });
  if (contact.error) return contact;
  const dropped = (db.participants || []).filter((p) => p.dealId === dealId && p.role === 'Processor' && p.contactId !== contact.id && staffContact(db, p.contactId));
  cancelOpenTasks(db, dropped);
  db.participants = (db.participants || []).filter((p) => !(p.dealId === dealId && p.role === 'Processor' && p.contactId !== contact.id && staffContact(db, p.contactId)));
  if (!db.participants.some((p) => p.dealId === dealId && p.role === 'Processor' && p.contactId === contact.id)) {
    db.participants.push({ id: newParticipantId(), dealId, contactId: contact.id, role: 'Processor', createdAt: now() });
  }
  return { contact };
}

/* Take the staff Processor row off this file. A contact with no login stays on Contacts. */
export function clearProcessorParties(db, dealId) {
  const dropped = (db.participants || []).filter((p) => p.dealId === dealId && p.role === 'Processor' && staffContact(db, p.contactId));
  cancelOpenTasks(db, dropped);
  db.participants = (db.participants || []).filter((p) => !(p.dealId === dealId && p.role === 'Processor' && staffContact(db, p.contactId)));
}
