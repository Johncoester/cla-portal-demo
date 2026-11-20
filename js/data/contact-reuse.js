/* CONTACT-REUSE-1. John Coester, Nov 20 2026, 11:33 AM ET.
 * A person (a TC, agent, buyer, or anyone else) can be on many files. When someone
 * types an email that is already on a contact, use that contact. Do not create a
 * second record, and do not overwrite the saved name, phone, or company. */
export function normContactEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function existingContactByEmail(people, email) {
  const want = normContactEmail(email);
  if (!want) return null;
  return (people || []).find((c) => c && normContactEmail(c.email) === want) || null;
}

export function isUniqueEmailError(error) {
  const msg = String((error && error.message) || error || '');
  const details = String((error && (error.details || error.detail)) || '');
  const code = String((error && error.code) || '');
  const text = `${code} ${msg} ${details}`;
  if (code === '23505' && /email|contacts_email_uq/i.test(text)) return true;
  return /contacts_email_uq|another record already uses this email|a contact with this email already exists/i.test(text);
}

export function contactDisplayLabel(contact) {
  const name = `${(contact && contact.firstName) || ''} ${(contact && contact.lastName) || ''}`.trim();
  return name || (contact && contact.company) || 'This person';
}

export function reuseContactMessage(contact) {
  return `${contactDisplayLabel(contact)} is already a contact. They were added to this file. A second record was not created.`;
}
