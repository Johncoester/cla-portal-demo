/* FF-088 (Francis Santos, Nov 16 2026, 3:10 PM ET).
 * TC-1 (John Coester, Nov 18 2026, 11:27 AM). TC-5 (John Coester, Nov 18 2026, ~1:51 PM ET).
 * A transaction coordinator is an outside person who works for one or more real estate agents.
 * On a file, their side follows the agent they are linked to. The picker offers one choice,
 * "Transaction coordinator". Buyer Agent TC and Listing Agent TC stay the stored roles.
 * The old role name Transaction Coordinator is not offered when adding someone.
 * A file that already has that role still keeps the row. */
import { AGENT_TC_TYPE } from './constants.js?v=202611247700';
import { sameContactOrEmail } from './agent-tc-links.js?v=202611248300';

export const BUYER_AGENT_TC = 'Buyer Agent TC';
export const LISTING_AGENT_TC = 'Listing Agent TC';
export const AGENT_TC_ROLES = Object.freeze([BUYER_AGENT_TC, LISTING_AGENT_TC]);
export const STAFF_TC_ROLE = 'Transaction Coordinator';
export const STAFF_TC_MESSAGE = 'Only an active staff login can be the Transaction Coordinator on an order.';
/* The one choice in a role list. It is not stored on the file. */
export const AGENT_TC_PICK = 'Transaction coordinator';
export const AGENT_TC_LABEL = 'Transaction coordinator';
export const TC_WHICH_AGENT = 'Which agent are they linked to?';
export const TC_CHOOSE_AGENT = 'Choose which agent they are linked to.';
export const TC_NEED_AGENT = "Add the buyer's agent or the listing agent on this file first. Then you can add the transaction coordinator.";

export function isAgentTcRole(role) {
  return role === BUYER_AGENT_TC || role === LISTING_AGENT_TC;
}

export function isAgentTcPick(role) {
  return role === AGENT_TC_PICK;
}

export function coordinatorContactType(role) {
  return isAgentTcPick(role) || isAgentTcRole(role) ? AGENT_TC_TYPE : '';
}

/* Shown on the file. The words are always "Transaction coordinator". The agent's name
 * may follow when this screen already shows who that person sits with. */
export function agentTcLabel(role, agentName) {
  if (!isAgentTcRole(role) && !isAgentTcPick(role)) return role || '';
  const name = String(agentName || '').trim();
  return name ? `${AGENT_TC_LABEL} · ${name}` : AGENT_TC_LABEL;
}

/* The choice in a role list. Exactly one label, with no side and no description. */
export function agentTcChoiceLabel(role) {
  if (isAgentTcPick(role) || isAgentTcRole(role)) return AGENT_TC_LABEL;
  return role || '';
}

export function agentTcHelp() {
  return '';
}

/* Roles offered when adding someone to a file. Skip the old staff role.
 * One Transaction coordinator choice stands in for both stored sides.
 * A refinance drops sellers, agents, and that choice. */
export function rolesForNewContact(participantRoles, { refinance = false, blocked = [] } = {}) {
  const roles = [];
  for (const role of participantRoles || []) {
    if (role === STAFF_TC_ROLE) continue;
    roles.push(role);
    if (role === 'Listing Agent') roles.push(AGENT_TC_PICK);
  }
  if (!refinance) return roles;
  return roles.filter((role) => !blocked.includes(role) && !isAgentTcRole(role) && !isAgentTcPick(role));
}

export function personNameOf(contact) {
  const c = contact || {};
  return `${c.firstName || ''} ${c.lastName || ''}`.trim() || String(c.company || '').trim();
}

/* Buyer and listing agents already on this file. */
export function fileAgents(participants) {
  return (participants || [])
    .filter((p) => p && !p.removed && (p.role === 'Buyer Agent' || p.role === 'Listing Agent'))
    .map((p) => ({
      contactId: p.contactId || (p.contact && p.contact.id) || '',
      role: p.role,
      email: (p.contact && p.contact.email) || p.email || '',
      name: personNameOf(p.contact) || (p.role === 'Listing Agent' ? 'Listing agent' : "Buyer's agent"),
    }))
    .filter((a) => a.contactId);
}

export function sideAgentName(participants, storedRole) {
  const want = storedRole === LISTING_AGENT_TC ? 'Listing Agent' : storedRole === BUYER_AGENT_TC ? 'Buyer Agent' : '';
  if (!want) return '';
  const names = [];
  for (const agent of fileAgents(participants)) {
    if (agent.role !== want || !agent.name || names.includes(agent.name)) continue;
    if (agent.name === "Buyer's agent" || agent.name === 'Listing agent') continue;
    names.push(agent.name);
  }
  return names.join(', ');
}

/* Stored roles for a coordinator who is linked to agents on this file.
 * linkedAgentIds are the agent contact ids this person is linked to. */
export function tcRolesFromLinks(agents, linkedAgentIds) {
  const linked = new Set(linkedAgentIds || []);
  const roles = [];
  for (const agent of agents || []) {
    if (!agent || !linked.has(agent.contactId)) continue;
    const role = agent.role === 'Listing Agent' ? LISTING_AGENT_TC : agent.role === 'Buyer Agent' ? BUYER_AGENT_TC : '';
    if (role && !roles.includes(role)) roles.push(role);
  }
  return roles;
}

/* One row per agent on the file. The value remembers the side. The label is the agent's name. */
export function tcAgentChoices(agents) {
  return (agents || []).filter((a) => a && a.contactId && (a.role === 'Buyer Agent' || a.role === 'Listing Agent')).map((a) => ({
    value: `${a.role}:${a.contactId}`,
    label: a.name || (a.role === 'Listing Agent' ? 'Listing agent' : "Buyer's agent"),
    storedRole: a.role === 'Listing Agent' ? LISTING_AGENT_TC : BUYER_AGENT_TC,
  }));
}

/* Place Order, before the file exists. buyer and listing are { present, name }. */
export function placeOrderTcChoices(buyer, listing) {
  const out = [];
  if (buyer && buyer.present) out.push({ value: 'buyer', label: buyer.name || "Buyer's agent", storedRole: BUYER_AGENT_TC });
  if (listing && listing.present) out.push({ value: 'listing', label: listing.name || 'Listing agent', storedRole: LISTING_AGENT_TC });
  return out;
}

export function tcRoleFromChoice(value, choices) {
  const hit = (choices || []).find((c) => c.value === value);
  return hit ? hit.storedRole : '';
}

/* Ask listAgentTcs for each agent on the file. A miss or a refusal means that agent is not linked. */
export async function linkedAgentIdsFor(api, tcContactId, agents) {
  const ids = [];
  if (!tcContactId || !api || typeof api.listAgentTcs !== 'function') return ids;
  for (const agent of agents || []) {
    if (!agent || !agent.contactId) continue;
    let rows = [];
    try { rows = await api.listAgentTcs(agent.contactId) || []; } catch (e) { rows = []; }
    if (rows.some((r) => r && r.contactId === tcContactId)) ids.push(agent.contactId);
  }
  return ids;
}

export function tcRolesToSave({ linkedRoles, choice, choices }) {
  if (linkedRoles && linkedRoles.length) return linkedRoles.slice();
  const one = tcRoleFromChoice(choice, choices);
  return one ? [one] : [];
}

/* Blank person: nothing to check. Linked sides: nothing to ask.
 * Otherwise the follow-up is required, and it needs an agent on the file. */
/* The coordinator is the agent they would sit with on this file. Buyer side checks the
 * buyer's agent. Listing side checks the listing agent. A blank email does not match. */
export function tcSelfOnOrderMessage(agentRole) {
  const label = agentRole === 'Listing Agent' ? 'Listing Agent' : 'Buyer Agent';
  return `This person is already the ${label} on this order. A transaction coordinator must be a different person.`;
}

export function selfTcOnOrderProblem(person, agents, rolesToSave) {
  const want = new Set();
  for (const role of rolesToSave || []) {
    if (role === LISTING_AGENT_TC) want.add('Listing Agent');
    else if (role === BUYER_AGENT_TC) want.add('Buyer Agent');
  }
  if (!want.size || !person) return '';
  for (const agent of agents || []) {
    if (!agent || !want.has(agent.role)) continue;
    if (sameContactOrEmail(person, agent)) return tcSelfOnOrderMessage(agent.role);
  }
  return '';
}

export function tcSideProblem({ hasPerson, linkedRoles, choice, choices }) {
  if (!hasPerson) return '';
  if (linkedRoles && linkedRoles.length) return '';
  if (!(choices || []).length) return TC_NEED_AGENT;
  if (!tcRoleFromChoice(choice, choices)) return TC_CHOOSE_AGENT;
  return '';
}

/* FF-108 (Francis, Nov 23 2026): adding a coordinator on Contacts for a chosen agent also links them to that agent
 * (agent_tc_links, the same link the agent's contact record makes). Without the link the file showed them as that side's TC,
 * but "Only communicate with TC" could not be ticked (it needs a TC linked to the agent). Already linked: nothing more to do.
 * Returns { roles, linkProblem }: a link refusal does not undo the add; the page shows it in plain words. */
export async function saveAgentTcOnFile(api, dealId, contactId, { linkedRoles, choice, choices }) {
  const roles = tcRolesToSave({ linkedRoles, choice, choices });
  for (const role of roles) {
    try { await api.addParticipant(dealId, contactId, role); }
    catch (err) { if (!isAlreadyTcMessage(err && err.message)) throw err; }
  }
  // TC-ONLY-3: no separate link call. Saving the role on the file links the coordinator to that side's agent on the server
  // (private.link_tcs_from_file, TC-ASSIGN-1; the demo portal does the same), and the server skips Refinance files on purpose.
  const linkProblem = '';
  return { roles, linkProblem };
}

export function isAlreadyTcMessage(message) {
  return /already the transaction coordinator/i.test(String(message || ''));
}

/* Place Order used to name both boxes "Transaction Coordinator" and strip ":2",
 * so both were saved as the CLA staff role and both failed with the same sentence. */
export function roleForPartyField(name) {
  const key = String(name || '');
  if (key === `p:${AGENT_TC_PICK}`) return AGENT_TC_PICK;
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
