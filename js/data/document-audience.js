/* Who can see a file upload (MF-006).
 * Matt (Nov 9): checkboxes, so one file can include more than one party.
 * The control lists each named buyer, seller, and agent, plus CLA only.
 * AUDIENCE_CONTROL is 'checkbox'. Set it to 'radio' only if that decision changes:
 * audienceChoices, audienceSync, and the input type all read this one constant.
 * Either way the saved value is the existing visibility: all, buyer, seller, or staff.
 * Checking one person on a side shares that whole side, which is what the current
 * rules already do. CLA only is staff. Share-with-buyer / share-with-seller stay separate. */
export const AUDIENCE_CONTROL = 'checkbox';
export const CLA_ONLY = 'cla';

const NAMED = {
  'Client-Buyer': { side: 'buyer', label: 'Buyer', refiLabel: 'Borrower' },
  'Buyer Agent': { side: 'buyer', label: "Buyer's agent" },
  'Client-Seller': { side: 'seller', label: 'Seller' },
  'Listing Agent': { side: 'seller', label: "Seller's agent" },
};
const ROLE_ORDER = ['Client-Buyer', 'Buyer Agent', 'Client-Seller', 'Listing Agent'];

export const AUDIENCE_NOTE = 'Checking a person shares that whole side: every buyer and the buyer\'s agent, or every seller and the seller\'s agent. Both sides means everyone on the file. CLA only keeps it with CLA staff. CLA staff can open the file either way. A buyer or seller still does not see another party\'s upload until Share with buyer or Share with seller.';

export function audienceParties(participants, { refinance = false } = {}) {
  return (participants || [])
    .filter((p) => p && !p.removed && NAMED[p.role])
    .map((p) => {
      const spec = NAMED[p.role];
      const contact = p.contact || {};
      const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || String(contact.company || '').trim() || 'Unnamed';
      const roleLabel = refinance && spec.refiLabel ? spec.refiLabel : spec.label;
      return {
        id: String(p.id), name, role: p.role, roleLabel, side: spec.side, exclusive: false,
        label: `${name}, ${roleLabel}`,
      };
    })
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/* Clients keep one Share with CLA Title choice. It still stores their existing visibility
 * (buyer: staff, seller: seller). A file with no named parties offers Everyone and CLA only. */
export function audienceChoices({ parties = [], allowed = [], role = '', control = AUDIENCE_CONTROL } = {}) {
  const can = new Set(allowed);
  if (role === 'Client-Buyer' || role === 'Client-Seller') {
    const grants = allowed[0] || 'staff';
    return [{ id: CLA_ONLY, side: '', exclusive: true, grants, label: 'Share with CLA Title' }];
  }
  const named = (parties || []).filter((p) => can.has('all') || can.has(p.side));
  const list = named.map((p) => ({ ...p }));
  if (!named.length && can.has('all')) list.push({ id: 'all', side: '', exclusive: false, label: 'Everyone on the file' });
  if (control === 'radio' && named.length && can.has('all')) list.unshift({ id: 'all', side: '', exclusive: false, label: 'Everyone on the file' });
  if (can.has('staff')) list.push({ id: CLA_ONLY, side: '', exclusive: true, label: 'CLA only' });
  return list;
}

export function checkedForVisibility(visibility, choices) {
  const rows = choices || [];
  const granted = rows.find((c) => c.grants && c.grants === visibility);
  if (granted && rows.every((c) => c.grants)) return [granted.id];
  if (visibility === 'staff') {
    const cla = rows.find((c) => c.id === CLA_ONLY || c.exclusive);
    return cla ? [cla.id] : [];
  }
  if (rows.some((c) => c.id === 'all') && visibility === 'all' && !rows.some((c) => c.side)) return ['all'];
  const parties = rows.filter((c) => c.side);
  if (visibility === 'all') return parties.map((p) => p.id);
  return parties.filter((p) => p.side === visibility).map((p) => p.id);
}

/* checked ids in, one visibility code out. A mix the role cannot save is an error. */
export function visibilityFromChecked(checked, choices, allowed) {
  const allow = new Set(allowed || []);
  const on = new Set(checked || []);
  const picked = (choices || []).filter((c) => on.has(c.id));
  if (picked.length === 1 && picked[0].grants) {
    const vis = picked[0].grants;
    return allow.has(vis) ? { visibility: vis, error: '' } : { visibility: '', error: 'Choose who can see this file.' };
  }
  if (picked.some((c) => c.id === 'all')) {
    return allow.has('all') ? { visibility: 'all', error: '' } : { visibility: '', error: 'Choose who can see this file.' };
  }
  const cla = picked.some((c) => c.id === CLA_ONLY || c.exclusive);
  const sides = new Set(picked.filter((c) => c.side).map((c) => c.side));
  let vis = '';
  if (cla && sides.size === 0) vis = 'staff';
  else if (sides.size === 2) vis = 'all';
  else if (sides.size === 1) {
    const side = [...sides][0];
    const named = (choices || []).filter((c) => c.side);
    const otherSide = named.some((c) => c.side !== side);
    const everyNamed = named.length > 0 && named.every((c) => on.has(c.id));
    if (!otherSide && everyNamed && allow.has('all')) vis = 'all';
    else vis = side;
  }
  if (!vis) return { visibility: '', error: 'Choose who can see this file.' };
  if (!allow.has(vis)) return { visibility: '', error: 'That choice is not available for your role on this file.' };
  return { visibility: vis, error: '' };
}

/* After a click: CLA only stands alone, and a side is all of that side or none of it.
 * Radio mode keeps the one value that was just chosen. */
export function audienceSync(checked, changedId, choices, control = AUDIENCE_CONTROL) {
  if (control === 'radio') return changedId ? [changedId] : [];
  const set = new Set(checked || []);
  const changed = (choices || []).find((c) => c.id === changedId);
  if (!changed) return [...set];
  if (changed.id === CLA_ONLY || changed.exclusive || changed.id === 'all' || changed.grants) return set.has(changed.id) ? [changed.id] : [];
  if (set.has(changed.id)) {
    for (const c of choices) {
      if (c.id === CLA_ONLY || c.exclusive || c.id === 'all') set.delete(c.id);
      if (c.side && c.side === changed.side) set.add(c.id);
    }
  } else if (changed.side) {
    for (const c of choices) if (c.side === changed.side) set.delete(c.id);
  }
  return [...set];
}

/* What a CLA staff upload with this visibility already does. Not a new rule. */
export function staffUploadSees(visibility) {
  const buyerSide = visibility === 'all' || visibility === 'buyer';
  const sellerSide = visibility === 'all' || visibility === 'seller';
  return { staff: true, buyer: buyerSide, buyerAgent: buyerSide, seller: sellerSide, sellerAgent: sellerSide };
}
