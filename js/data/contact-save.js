/* Contact edits on a file. A save counts only when the stored row matches what was submitted.
 * A second party row for the same person (same contact, same email, or the same name and company
 * in the same role) is refused so Edit cannot land on the other row. */

export function normEmail(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

function text(v) {
  return v == null ? '' : String(v);
}

export function contactFields(src) {
  const s = src || {};
  const type = s.contactType == null || s.contactType === '' ? null : String(s.contactType);
  return {
    firstName: text(s.firstName),
    lastName: text(s.lastName),
    company: text(s.company),
    email: normEmail(s.email),
    phone: text(s.phone),
    contactType: type,
  };
}

/* Only fields the person changed. A box left as it was opened is omitted, so a blank
 * email that was already blank is not written back over a stored address. */
export function contactWritePatch(opened, submitted) {
  const before = contactFields(opened);
  const next = contactFields(submitted);
  const patch = {};
  for (const k of ['firstName', 'lastName', 'company']) if (next[k] !== before[k]) patch[k] = next[k];
  if (submitted && submitted.contactType !== undefined && (next.contactType || null) !== (before.contactType || null)) patch.contactType = next.contactType;
  if (next.email !== before.email) patch.email = next.email;
  if (next.phone !== before.phone) patch.phone = next.phone;
  return patch;
}

const LABELS = { firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone', company: 'Company', contactType: 'Contact type' };

function phoneDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

export function assertContactSaved(sent, saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !saved.id) throw new Error('This contact was not saved. Nothing was changed.');
  const got = contactFields(saved);
  const want = contactFields(sent);
  for (const k of Object.keys(LABELS)) {
    if (!sent || sent[k] === undefined) continue;
    if (k === 'phone') {
      if (phoneDigits(want.phone) !== phoneDigits(got.phone)) throw new Error('Phone was not saved.');
      continue;
    }
    const w = k === 'contactType' ? (want.contactType || null) : want[k];
    const g = k === 'contactType' ? (got.contactType || null) : got[k];
    if (String(w || '') !== String(g || '')) throw new Error(`${LABELS[k]} was not saved.`);
  }
  return saved;
}

export function contactSaveMiss(error) {
  const msg = String((error && error.message) || error || '');
  if (/0 rows|PGRST116|multiple \(or no\) rows|Cannot coerce|JSON object requested/i.test(msg)) return new Error('This contact was not saved. Nothing was changed.');
  return error instanceof Error ? error : new Error(msg || 'This contact was not saved.');
}

export function sameParty(rows, contact, role) {
  const key = contactFields(contact);
  const id = contact && (contact.id || contact.contactId);
  const name = `${key.firstName} ${key.lastName}`.trim().toLowerCase().replace(/\s+/g, ' ');
  const company = key.company.trim().toLowerCase().replace(/\s+/g, ' ');
  return (rows || []).find((p) => {
    if (!p || p.removed) return false;
    if (role && p.role !== role) return false;
    const c = p.contact || p;
    if (id && (p.contactId === id || c.id === id)) return true;
    const other = contactFields(c);
    if (key.email && other.email && key.email === other.email) return true;
    const otherName = `${other.firstName} ${other.lastName}`.trim().toLowerCase().replace(/\s+/g, ' ');
    const otherCompany = other.company.trim().toLowerCase().replace(/\s+/g, ' ');
    if (name && otherName === name && otherCompany === company) return true;
    return !name && !otherName && !!company && otherCompany === company;
  }) || null;
}

export function duplicatePartyMessage(contact, role) {
  const name = `${text(contact && contact.firstName)} ${text(contact && contact.lastName)}`.trim() || text(contact && contact.company).trim() || 'This person';
  return `${name} is already a ${role} on this order. Edit that row instead of adding another.`;
}
