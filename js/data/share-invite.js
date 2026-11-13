/* FF-055 / MF-048 (Francis, Nov 11; John, Nov 13): Share Files to someone on the file who has no portal login yet.
 * The portal invites them and holds the message and the files until they sign in.
 * Pure helpers, plus one function that makes (or finds) the invite through the data layer. Nothing here sends by itself. */

// Only these file roles can be invited to the portal (the same four as File Contacts > Invite to portal).
export const SHARE_INVITE_ROLES = ['Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent'];

/* The contact id behind a recipient row when that person has no portal login, or '' when they have one.
 * For CLA staff the recipient list also carries file contacts with an email and no login, by their contact id
 * (the demo data marks them "contact:<id>"). A row whose id is a portal login is never matched. */
export function noLoginContactId(person, participants = []) {
  const id = String((person && person.id) || '');
  if (!id) return '';
  if (id.startsWith('contact:')) return id.slice(8);
  const hit = (participants || []).find((p) => p && !p.removed && String(p.contactId || (p.contact && p.contact.id) || '') === id);
  if (!hit) return '';
  return (hit.contact && hit.contact.profileId) || hit.profileId ? '' : id;
}

/* Can that person be invited from Share Files? Only when one of their roles on this file is one of the four above.
 * Rows from the demo data, or with no matching file contact, are judged by the role on the recipient row. */
export function canShareInvite(person, participants = []) {
  const cid = noLoginContactId(person, participants);
  if (!cid) return false;
  const roles = (participants || []).filter((p) => p && !p.removed && String(p.contactId || (p.contact && p.contact.id) || '') === cid).map((p) => p.role);
  if (!roles.length) roles.push((person && person.role) || '');
  return roles.some((r) => SHARE_INVITE_ROLES.includes(r));
}

// What the To list adds after the name, and the line under it once that person is picked.
export const NO_LOGIN_TAG = 'no portal login yet; will be invited';
export const NO_INVITE_TAG = 'no portal login; cannot be invited';
export function noLoginNote(person) {
  const name = `${(person && person.firstName) || ''} ${(person && person.lastName) || ''}`.trim() || 'This person';
  const mail = person && person.email ? ` (${person.email})` : '';
  return `${name}${mail} has no portal login yet. When you click Send, the portal emails them an invite and holds this message and the files. They see both after they sign in.`;
}

/* Make the invite, or find the one that is already waiting.
 * Returns { link, already, email, name }. link is '' when an invite was already pending (that email keeps working, so nothing is re-sent). */
export async function ensureShareInvite(api, { dealId, contactId } = {}) {
  if (!api || typeof api.createPortalInvite !== 'function') throw new Error('The portal was updated while this page was open. Reload the page (Ctrl+Shift+R) and share again.');
  try {
    const r = await api.createPortalInvite({ dealId, contactId });
    return { link: r.link || '', already: false, email: r.email || '', name: `${r.firstName || ''} ${r.lastName || ''}`.trim() };
  } catch (err) {
    if (/pending invite/i.test(String((err && err.message) || ''))) return { link: '', already: true, email: '', name: '' };
    throw err;
  }
}

// The line shown after Send. r = the `invited` part of what sendMessage returns.
export function shareInviteToast(r = {}, fileCount = 0) {
  const who = r.name || 'They';
  const what = fileCount > 0 ? (fileCount === 1 ? 'this file' : 'these files') : 'this message';
  const held = `${who === 'They' ? 'They' : who} will see ${what} after they sign in.`;
  if (r.sent) return `Invite emailed to ${r.name || r.email}${r.name && r.email ? ` (${r.email})` : ''}. ${held}`;
  if (r.already) return `${r.name || 'This person'} already has an invite waiting, so no new email was sent. ${held}`;
  const why = String(r.error || '').trim().replace(/[.\s]+$/, '');
  return `Held for ${r.name || 'this person'}, but the invite was not emailed${why ? `: ${why}` : ''}. Use Invite to portal on File Contacts to send it. ${held}`;
}

// A person a conversation is still waiting for, shaped like a conversation participant.
export function waitingParticipant(row = {}) {
  const name = String(row.displayName || row.display_name || '').trim() || 'Invited contact';
  const role = String(row.role || '').trim();
  return { id: `contact:${row.contactId || row.contact_id || ''}`, name, role: `${role ? `${role}, ` : ''}invited, not signed in yet`, wireOk: false, waiting: true };
}
