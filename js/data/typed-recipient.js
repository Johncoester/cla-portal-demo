/* MF-049 (Francis via Matt's ticket, Nov 11 2026): type a name and email on Start conversation.
 * Someone already on the file is picked from that list. Someone who is not is added to the file
 * as a buyer, seller, buyer's agent, or listing agent, then the existing Share Files path invites
 * them and holds the message. This file does not send anything by itself. */
import { contactTypeForRole } from './constants.js?v=202611101015';
import { noLoginContactId, SHARE_INVITE_ROLES } from './share-invite.js?v=202611191100';

export const TYPED_ROLES = [
  ['Client-Buyer', 'Buyer'],
  ['Client-Seller', 'Seller'],
  ['Buyer Agent', "Buyer's agent"],
  ['Listing Agent', 'Listing agent'],
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanTypedRecipient({ firstName, lastName, email } = {}) {
  const first = String(firstName || '').trim().slice(0, 80);
  const last = String(lastName || '').trim().slice(0, 80);
  const mail = String(email || '').trim().toLowerCase().slice(0, 200);
  if (!first && !last && !mail) return { empty: true };
  if (!first || !last) return { error: 'Enter a first and last name for this recipient.' };
  if (!EMAIL_RE.test(mail)) return { error: 'Enter an email like name@example.com.' };
  return { empty: false, firstName: first, lastName: last, email: mail };
}

export function personByEmail(people, email) {
  const mail = String(email || '').trim().toLowerCase();
  if (!mail) return null;
  return (people || []).find((p) => String((p && p.email) || '').trim().toLowerCase() === mail) || null;
}

export function heldContactId(person, participants) {
  return noLoginContactId(person, participants || []) || '';
}

export function plainMessageHtml(text) {
  const esc = String(text || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return '<p>' + esc.replace(/\r\n|\r|\n/g, '<br>') + '</p>';
}

const sameId = (row, id) => String((row && (row.contactId || (row.contact && row.contact.id))) || '') === String(id || '');

/* Add a typed person to this file when they are not already on it, then return the recipient row
 * the conversation list uses. inviteContactId is set only when they have no portal login. */
export async function addTypedRecipient(api, deal, typed, role) {
  if (!SHARE_INVITE_ROLES.includes(role)) throw new Error("Pick how this person is on the file: buyer, seller, buyer's agent, or listing agent.");
  if (!api || typeof api.listMessageRecipients !== 'function' || typeof api.addParticipant !== 'function') throw new Error('The portal was updated while this page was open. Reload the page (Ctrl+Shift+R) and try again.');
  const mail = typed.email;
  let rows = [];
  try { rows = (await api.listContacts(mail)) || []; } catch (e) { rows = []; }
  const match = (list) => (list || []).find((c) => String((c && c.email) || '').trim().toLowerCase() === mail) || null;
  let contact = match(rows.filter((c) => !String((c && c.id) || '').startsWith('staff:')));
  const staff = !contact ? match(rows) : null;
  const linkId = contact ? contact.id : (staff && String(staff.id).startsWith('staff:') ? staff.id : '');
  if (!linkId) {
    try {
      contact = await api.createContact({ firstName: typed.firstName, lastName: typed.lastName, email: mail, phone: '', company: '', contactType: contactTypeForRole(role) || null });
    } catch (e) {
      let again = [];
      try { again = (await api.listContacts(mail)) || []; } catch (err) { again = []; }
      contact = match(again.filter((c) => !String((c && c.id) || '').startsWith('staff:')));
      if (!contact) throw new Error('That email is already used, and this file does not have that person. Add them on Contacts, then start the conversation again.');
    }
  }
  const id = contact ? contact.id : linkId;
  const onFile = (deal.participants || []).some((p) => p && !p.removed && sameId(p, id) && p.role === role);
  if (!onFile) {
    try { await api.addParticipant(deal.id, id, role); }
    catch (e) { if (!/already a /i.test(String((e && e.message) || ''))) throw e; }
  }
  const people = await api.listMessageRecipients(deal.id);
  const person = personByEmail(people, mail);
  if (!person) throw new Error('That person was added to this file, but they are not in the recipient list yet. Close this window and open Start conversation again.');
  const noLogin = String(person.id) === String(id) || String(person.id) === 'contact:' + id;
  return { person, inviteContactId: noLogin ? String(id).replace(/^contact:/, '') : '' };
}
