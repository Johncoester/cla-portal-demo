/* Place Order: warn when this address is already on a file. No network.
 * An open file at the same address warns even when the buyer and seller are different.
 * A closed or on-hold file warns only when this order also picks that file's buyer or seller.
 * A cancelled file never warns. The warning does not block Place order. */
const SUFFIX = {
  street: 'st', st: 'st', avenue: 'ave', ave: 'ave', drive: 'dr', dr: 'dr', road: 'rd', rd: 'rd',
  lane: 'ln', ln: 'ln', court: 'ct', ct: 'ct', boulevard: 'blvd', blvd: 'blvd', circle: 'cir', cir: 'cir',
  place: 'pl', pl: 'pl', terrace: 'ter', ter: 'ter', highway: 'hwy', hwy: 'hwy', parkway: 'pkwy', pkwy: 'pkwy',
  trail: 'trl', trl: 'trl', way: 'way',
};
const UNIT = new Set(['apartment', 'apt', 'unit', 'suite', 'ste']);

function words(value) {
  return String(value || '').toLowerCase().replace(/#/g, ' unit ').replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean);
}
/* Street key keeps a leading word that is not a house number ("E2E 123 Fake St" stays distinct from "123 Fake St")
 * and folds Street/St, Drive/Dr, and # / Apt / Unit into one form. */
export function streetKey(street) {
  const out = [];
  for (const word of words(street)) {
    const next = UNIT.has(word) ? 'unit' : (SUFFIX[word] || word);
    if (next === 'unit' && out[out.length - 1] === 'unit') continue;
    out.push(next);
  }
  return out.join(' ');
}
export function addressParts({ street, city, state, zip } = {}) {
  const zipDigits = String(zip || '').replace(/\D/g, '');
  return {
    street: streetKey(street),
    city: words(city).join(' '),
    state: String(state || '').trim().toUpperCase(),
    zip: zipDigits.slice(0, 5),
  };
}
export function sameAddress(a, b) {
  const left = addressParts(a);
  const right = addressParts(b);
  if (!left.street || !right.street || left.street !== right.street) return false;
  if (!left.city || !right.city || left.city !== right.city) return false;
  if (!left.state || left.state !== right.state) return false;
  if (left.zip && right.zip && left.zip !== right.zip) return false;
  return true;
}
function idSet(ids) {
  return new Set((ids || []).map((id) => String(id || '')).filter(Boolean));
}
/* orders: { id, fileNumber, street, city, state, zip, status, buyerIds, sellerIds } */
export function duplicateOrders({ street, city, state, zip, buyerIds, sellerIds, orders } = {}) {
  const buyers = idSet(buyerIds);
  const sellers = idSet(sellerIds);
  const here = { street, city, state, zip };
  if (!addressParts(here).street) return [];
  const matches = [];
  for (const order of orders || []) {
    if (!order || order.status === 'Cancelled') continue;
    if (!sameAddress(here, order)) continue;
    const sameBuyer = (order.buyerIds || []).some((id) => buyers.has(String(id)));
    const sameSeller = (order.sellerIds || []).some((id) => sellers.has(String(id)));
    if (order.status !== 'Open' && !sameBuyer && !sameSeller) continue;
    matches.push({
      id: order.id, fileNumber: order.fileNumber || '', street: order.street || '', city: order.city || '',
      state: order.state || '', zip: order.zip || '', status: order.status || '', sameBuyer, sameSeller,
    });
  }
  return matches;
}
export function duplicateNotice(matches) {
  const list = matches || [];
  if (!list.length) return { show: false, title: '', lines: [], proceed: '' };
  const open = list.some((m) => m.status === 'Open');
  const party = list.some((m) => m.sameBuyer || m.sameSeller);
  let title = 'This address matches an existing file.';
  if (open && party) title = 'An open file at this address has the same buyer or seller.';
  else if (open) title = 'An open file already uses this address.';
  else if (party) title = 'This address is already on a file with the same buyer or seller.';
  const lines = list.map((m) => {
    const where = [m.street, [m.city, m.state].filter(Boolean).join(', '), m.zip].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const who = [m.sameBuyer ? 'same buyer' : '', m.sameSeller ? 'same seller' : ''].filter(Boolean).join(', ');
    const kind = m.status === 'Open' ? 'Open file' : `${m.status} file`;
    return { id: m.id, fileNumber: m.fileNumber, text: `${m.fileNumber} — ${kind} at ${where}${who ? ' (' + who + ')' : ''}` };
  });
  return { show: true, title, lines, proceed: 'You can still place this order.' };
}
/* Active Transaction Coordinators on this login's side (demo stays with demo).
 * A profile with no contact is returned as needsContact so Place Order can add the contact the dropdown saves. */
export function coordinatorRoster(profiles, contacts, actor) {
  const demo = !!(actor && (actor.isDemo || actor.is_demo));
  const rows = [];
  const created = [];
  for (const p of profiles || []) {
    if (!p || p.status !== 'active' || p.role !== 'Transaction Coordinator') continue;
    const pDemo = !!(p.isDemo || p.is_demo);
    if (pDemo !== demo) continue;
    const c = (contacts || []).find((z) => z && (z.profileId || z.profile_id) === p.id);
    const firstName = (c && (c.firstName || c.first_name)) || p.firstName || p.first_name || '';
    const lastName = (c && (c.lastName || c.last_name)) || p.lastName || p.last_name || '';
    const email = (c && c.email) || p.email || '';
    const phone = (c && c.phone) || p.phone || '';
    const company = (c && c.company) || '';
    if (!c) {
      created.push({ profileId: p.id, firstName, lastName, email, phone, company, isDemo: pDemo });
      rows.push({ profileId: p.id, contactId: '', firstName, lastName, email, phone, company, needsContact: true });
    } else {
      rows.push({ profileId: p.id, contactId: c.id, firstName, lastName, email, phone, company, needsContact: false });
    }
  }
  return { rows, created };
}
