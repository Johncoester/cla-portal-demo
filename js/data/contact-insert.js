/* Place Order and the file contact form save a contact with a direct insert.
 * They do not call the CRM contact RPC, and they do not invent a last name.
 * lender_role is sent only when a Loan Officer, Lender TC, or Mortgage Broker is chosen, so a company
 * with no person still inserts on a database that has not added that column yet. */
import { cleanLenderRole } from './lender-file.js?v=202611245800';
import { CONTACT_TYPE_CODES } from './constants.js?v=202611245800';
const CONTACT_TYPES = new Set(CONTACT_TYPE_CODES);

/* A database check that still has the old list says so in plain words. CLA staff never get a type. */
export function contactTypeSaveError(error) {
  const msg = String((error && error.message) || error || '');
  if (/CLA staff have no contact type/i.test(msg)) return new Error('CLA staff have no contact type. Leave contact type blank for this person.');
  if (/contact_type/i.test(msg) && /check constraint|23514|violates/i.test(msg)) {
    return new Error('That contact type cannot be saved. Choose Realtor, Lender, Buyer/Seller, or Transaction coordinator (an outside assistant who works for real estate agents), then try again.');
  }
  return null;
}

export function contactInsertRow(input) {
  const src = input || {};
  const first = src.firstName == null ? '' : String(src.firstName);
  const last = src.lastName == null ? '' : String(src.lastName);
  const company = src.company == null ? '' : String(src.company);
  if (!first.trim() && !company.trim()) throw new Error('A name or a company name is required.');
  const type = src.contactType == null ? '' : String(src.contactType);
  if (type && !CONTACT_TYPES.has(type)) throw new Error('That contact type cannot be saved. Choose Realtor, Lender, Buyer/Seller, or Transaction coordinator (an outside assistant who works for real estate agents).');
  const row = {
    first_name: first,
    last_name: last,
    email: String(src.email || '').toLowerCase(),
    phone: src.phone == null ? '' : String(src.phone),
    company,
    contact_type: type || null,
  };
  const lenderRole = cleanLenderRole(src.lenderRole, type);
  if (lenderRole) row.lender_role = lenderRole;
  return row;
}
