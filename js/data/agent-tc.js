/* FF-088 (Francis Santos, Nov 16 2026, 3:10 PM ET).
 * The buyer's transaction coordinator and the listing transaction coordinator are the agents'
 * coordinators: outside contacts, with or without a portal login.
 * They are not the CLA Title Transaction Coordinator. That role stays an active staff login. */
export const BUYER_AGENT_TC = 'Buyer Agent TC';
export const LISTING_AGENT_TC = 'Listing Agent TC';
export const AGENT_TC_ROLES = Object.freeze([BUYER_AGENT_TC, LISTING_AGENT_TC]);
export const STAFF_TC_ROLE = 'Transaction Coordinator';
export const STAFF_TC_MESSAGE = 'Only an active staff login can be the Transaction Coordinator on an order.';

export function isAgentTcRole(role) {
  return role === BUYER_AGENT_TC || role === LISTING_AGENT_TC;
}

export function agentTcLabel(role) {
  if (role === BUYER_AGENT_TC) return "Buyer's transaction coordinator";
  if (role === LISTING_AGENT_TC) return 'Listing transaction coordinator';
  return role || '';
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
