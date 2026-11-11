/* Who an agent may be offered in Send. Same side and CLA staff on this file only.
 * A person on the file with no portal login is shown as unavailable, not added to the send list.
 * The other side is not listed. */
const SIDE = { 'Listing Agent': 'seller', 'Client-Seller': 'seller', 'Buyer Agent': 'buyer', 'Client-Buyer': 'buyer' };

export function recipientLabel(p) {
  const name = `${(p && p.firstName) || ''} ${(p && p.lastName) || ''}`.trim() || 'Unnamed';
  const mail = p && p.email ? ` <${p.email}>` : '';
  return `${name}${mail} (${(p && p.role) || 'contact'})`;
}

export function explainRecipients({ myRole = '', participants = [], allowed = [] } = {}) {
  const side = SIDE[myRole] || '';
  const allowedIds = new Set((allowed || []).map((p) => p.id));
  const unavailable = [];
  for (const p of participants || []) {
    if (p.removed) continue;
    const theirSide = SIDE[p.role] || '';
    if (!side || theirSide !== side) continue;
    const contact = p.contact || {};
    const id = contact.profileId || p.profileId || '';
    const name = `${contact.firstName || p.firstName || ''} ${contact.lastName || p.lastName || ''}`.trim() || 'Unnamed contact';
    if (id && allowedIds.has(id)) continue;
    unavailable.push({ name, role: p.role, reason: id ? 'On this file, but this sign-in cannot message them.' : 'On this file, but they have no portal login yet.' });
  }
  return { selectable: allowed || [], unavailable };
}
