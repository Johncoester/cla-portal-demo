/* FF-088 (Francis Santos, Nov 16 2026, 3:10 PM ET).
 * TC-1 (John Coester, Nov 18 2026, 11:27 AM, confirmed 11:35 AM, wording 11:37 AM).
 * A transaction coordinator is an outside assistant to one or more real estate agents.
 * On a file, the buyer's coordinator works for the buyer's agent, and the listing
 * coordinator works for the listing agent. A portal login is optional.
 * The old role name Transaction Coordinator is not offered when adding someone.
 * A file that already has that role still keeps the row. */
export const BUYER_AGENT_TC = 'Buyer Agent TC';
export const LISTING_AGENT_TC = 'Listing Agent TC';
export const AGENT_TC_ROLES = Object.freeze([BUYER_AGENT_TC, LISTING_AGENT_TC]);
export const STAFF_TC_ROLE = 'Transaction Coordinator';
export const STAFF_TC_MESSAGE = 'Only an active staff login can be the Transaction Coordinator on an order.';
export const BUYER_TC_CHOICE = "Buyer's transaction coordinator: works for the buyer's agent";
export const LISTING_TC_CHOICE = 'Listing transaction coordinator: works for the listing agent';

export function isAgentTcRole(role) {
  return role === BUYER_AGENT_TC || role === LISTING_AGENT_TC;
}

export function agentTcLabel(role) {
  if (role === BUYER_AGENT_TC) return "Buyer's transaction coordinator";
  if (role === LISTING_AGENT_TC) return 'Listing transaction coordinator';
  return role || '';
}

/* The choice a person sees when adding a coordinator. The short label stays on the file list. */
export function agentTcChoiceLabel(role) {
  if (role === BUYER_AGENT_TC) return BUYER_TC_CHOICE;
  if (role === LISTING_AGENT_TC) return LISTING_TC_CHOICE;
  return agentTcLabel(role);
}

export function agentTcHelp(role) {
  if (role === BUYER_AGENT_TC) return `${BUYER_TC_CHOICE}. An outside assistant to that agent. A portal login is not required.`;
  if (role === LISTING_AGENT_TC) return `${LISTING_TC_CHOICE}. An outside assistant to that agent. A portal login is not required.`;
  return '';
}

/* Roles offered when adding someone to a file. Skip the old role so it cannot be chosen again.
 * refinance drops sellers, agents, and both coordinators. */
export function rolesForNewContact(participantRoles, { refinance = false, blocked = [] } = {}) {
  const roles = [];
  for (const role of participantRoles || []) {
    if (role === STAFF_TC_ROLE) continue;
    roles.push(role);
    if (role === 'Listing Agent') roles.push(...AGENT_TC_ROLES);
  }
  if (!refinance) return roles;
  return roles.filter((role) => !blocked.includes(role) && !isAgentTcRole(role));
}

/* Place Order used to name both boxes "Transaction Coordinator" and strip ":2",
 * so both were saved as the CLA staff role and both failed with the same sentence. */
export function roleForPartyField(name) {
  const key = String(name || '');
  if (key === 'p:Transaction Coordinator' || key === `p:${BUYER_AGENT_TC}`) return BUYER_AGENT_TC;
  if (key === 'p:Transaction Coordinator:2' || key === `p:${LISTING_AGENT_TC}`) return LISTING_AGENT_TC;
  return key.startsWith('p:') ? key.slice(2).replace(/:\d+$/, '') : '';
}

export function partyProblemLine(name, message) {
  const role = roleForPartyField(name);
  const label = isAgentTcRole(role) ? agentTcLabel(role) : (role || 'Person');
  return `${label}: ${message}`;
}

export function uniqueProblems(lines) {
  const out = [];
  for (const line of lines || []) {
    const text = String(line || '').trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

export function agentTcRefiMessage() {
  return "A refinance has no buyer's or listing transaction coordinator. Its people are the borrower(s), salespeople, the Processor and the Lender.";
}

export function agentTcAlreadyMessage(contact, role) {
  const name = `${(contact && contact.firstName) || ''} ${(contact && contact.lastName) || ''}`.trim() || (contact && contact.company) || 'This person';
  return `${name} is already the ${agentTcLabel(role).toLowerCase()} on this file. Use Change on Parties, or edit them on Contacts.`;
}
