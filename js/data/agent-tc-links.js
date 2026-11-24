/* TC-2 (tracker row 366). John Coester, Nov 18 2026, 11:27 AM, confirmed 11:35 AM.
 * A transaction coordinator is an outside assistant linked to one or more real estate agents.
 * The link lives on the agent. It is not the CLA Title staff role "Transaction Coordinator".
 * Fake data only. */
import { phoneOk, fmtPhone, PHONE_MSG } from './constants.js?v=202611302300';

export const TC_NOT_AGENT = 'Transaction coordinators are linked to a real estate agent. This contact is not an agent.';
export const TC_NOT_ALLOWED = 'You cannot change transaction coordinators for this agent. A processor can, and the agent can change their own.';
export const TC_STAFF = 'A transaction coordinator is an outside assistant, not a CLA Title staff login. Pick the assistant, or enter their name.';
export const TC_SELF = 'This agent cannot be their own transaction coordinator.';
export const TC_NEED_PERSON = 'Enter the coordinator\'s name, or pick someone from the list.';
export const TC_BAD_EMAIL = 'Enter a valid email for this coordinator.';
export const TC_BAD_PHONE = `Phone ${PHONE_MSG}.`;
export const TC_EMAIL_TAKEN = 'Someone with that email is already a contact. Pick them from the list instead of typing a new person.';
export const TC_NOT_FOUND = 'That person was not found. Pick someone from the list, or enter their name.';

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());

export function normEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/* Same saved contact, or the same non-blank email. A blank email is not a person. */
export function sameContactOrEmail(a, b) {
  if (!a || !b) return false;
  const idA = String(a.contactId || a.id || '').trim();
  const idB = String(b.contactId || b.id || '').trim();
  if (idA && idB && idA === idB) return true;
  const emailA = normEmail(a.email);
  const emailB = normEmail(b.email);
  return !!(emailA && emailB && emailA === emailB);
}

export function personName(c) {
  const name = `${(c && c.firstName) || ''} ${(c && c.lastName) || ''}`.trim();
  return name || (c && c.company) || 'This person';
}

export function alreadyLinkedMessage(tc) {
  return `${personName(tc)} is already a transaction coordinator for this agent.`;
}

/* A real estate agent: contact type Realtor, or a buyer's agent / listing agent on a file. */
export function isRealEstateAgent(contact, roles = []) {
  if (!contact) return false;
  if (contact.contactType === 'realtor') return true;
  return (roles || []).some((r) => {
    const role = typeof r === 'string' ? r : (r && r.role);
    return role === 'Buyer Agent' || role === 'Listing Agent';
  });
}

/* A CLA staff login cannot be this kind of coordinator. An outside login can. A contact with no login can. */
export function staffLoginProblem(contact, profile) {
  if (!contact && !profile) return '';
  const role = (profile && profile.role) || contact && contact.accountRole || '';
  if (!role || role === 'Outside user') return '';
  if (profile && profile.status === 'removed') return '';
  return TC_STAFF;
}

/* Check a typed new person. Does not change the fields the page is holding. */
export function newCoordinatorProblem(input = {}) {
  const first = String(input.firstName || '').trim();
  const company = String(input.company || '').trim();
  const email = String(input.email || '').trim();
  const phone = String(input.phone || '').trim();
  if (!first && !company) return TC_NEED_PERSON;
  if (email && !emailOk(email)) return TC_BAD_EMAIL;
  if (phone && !phoneOk(phone)) return TC_BAD_PHONE;
  return '';
}

export function formatCoordinatorPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  if (!phoneOk(raw)) return raw;
  return fmtPhone(raw);
}
