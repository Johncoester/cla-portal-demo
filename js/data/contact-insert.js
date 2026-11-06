/* Place Order and the file contact form save a contact with a direct insert.
 * They do not call the CRM contact RPC, and they do not invent a last name. */
const CONTACT_TYPES = new Set(['realtor', 'lender', 'buyer_seller']);

export function contactInsertRow(input) {
  const src = input || {};
  const first = src.firstName == null ? '' : String(src.firstName);
  const last = src.lastName == null ? '' : String(src.lastName);
  const company = src.company == null ? '' : String(src.company);
  if (!first.trim() && !company.trim()) throw new Error('A name or a company name is required.');
  const type = src.contactType == null ? '' : String(src.contactType);
  if (type && !CONTACT_TYPES.has(type)) throw new Error('That contact type cannot be saved.');
  return {
    first_name: first,
    last_name: last,
    email: String(src.email || '').toLowerCase(),
    phone: src.phone == null ? '' : String(src.phone),
    company,
    contact_type: type || null,
  };
}
