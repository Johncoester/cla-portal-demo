/* FF-108b (Francis Santos, confirmed Nov 23 2026 5:21 PM ET, Gmail 1a20a80a4cca28a6).
 * On Add Contact and Edit Contact, a Transaction coordinator needs a required Assigned to
 * choice: Buyer's Agent TC or Listing Agent TC. The choice is always shown for that role/type,
 * even when the person already has an agent_tc_links row (that side is pre-selected and can be changed).
 * Place Order and Parties still use the older "Which agent are they linked to?" follow-up. */
import { BUYER_AGENT_TC, LISTING_AGENT_TC, isAgentTcRole, isAlreadyTcMessage } from './agent-tc.js?v=202611301500';

export const ASSIGNED_TO_LABEL = 'Assigned to';
export const BUYER_AGENT_TC_ASSIGN_LABEL = "Buyer's Agent TC";
export const LISTING_AGENT_TC_ASSIGN_LABEL = 'Listing Agent TC';
export const TC_CHOOSE_ASSIGNED = "Choose whether they are the Buyer's Agent TC or the Listing Agent TC.";
export const TC_NEED_BUYER_AGENT = "Add the buyer's agent on this file first. Then you can assign a Buyer's Agent TC.";
export const TC_NEED_LISTING_AGENT = 'Add the listing agent on this file first. Then you can assign a Listing Agent TC.';

export const TC_ASSIGN_CHOICES = Object.freeze([
  { value: BUYER_AGENT_TC, label: BUYER_AGENT_TC_ASSIGN_LABEL },
  { value: LISTING_AGENT_TC, label: LISTING_AGENT_TC_ASSIGN_LABEL },
]);

export function tcAssignedRole(value) {
  return value === BUYER_AGENT_TC || value === LISTING_AGENT_TC ? value : '';
}

export function tcAssignedLabel(value) {
  const role = tcAssignedRole(value);
  if (role === LISTING_AGENT_TC) return LISTING_AGENT_TC_ASSIGN_LABEL;
  if (role === BUYER_AGENT_TC) return BUYER_AGENT_TC_ASSIGN_LABEL;
  return '';
}

/* Prefer the role of the row being edited, then a single role already on the file,
 * then a single known agent_tc_links side. The caller may still let the user change it. */
export function knownTcAssignedRole({ fileRoles = [], linkedRoles = [], preferredRole = '' } = {}) {
  if (tcAssignedRole(preferredRole)) return preferredRole;
  const onFile = [...new Set((fileRoles || []).filter((r) => tcAssignedRole(r)))];
  if (onFile.length === 1) return onFile[0];
  if (onFile.length > 1) return onFile[0];
  const linked = [...new Set((linkedRoles || []).filter((r) => tcAssignedRole(r)))];
  if (linked.length) return linked[0];
  return '';
}

export function tcAssignedProblem({ hasPerson, choice, agents, alreadyOnSide = false } = {}) {
  if (!hasPerson) return '';
  const role = tcAssignedRole(choice);
  if (!role) return TC_CHOOSE_ASSIGNED;
  if (alreadyOnSide) return '';
  const want = role === LISTING_AGENT_TC ? 'Listing Agent' : 'Buyer Agent';
  if (!(agents || []).some((a) => a && a.role === want)) {
    return role === LISTING_AGENT_TC ? TC_NEED_LISTING_AGENT : TC_NEED_BUYER_AGENT;
  }
  return '';
}

/* Add the chosen side on the file. Saving the role also links them to that side's agent
 * (private.link_tcs_from_file / the demo portal's linkFromFile). */
export async function saveAssignedTcOnFile(api, dealId, contactId, role) {
  const assigned = tcAssignedRole(role);
  if (!assigned) throw new Error(TC_CHOOSE_ASSIGNED);
  try { await api.addParticipant(dealId, contactId, assigned); }
  catch (err) { if (!isAlreadyTcMessage(err && err.message)) throw err; }
  return { role: assigned, linkProblem: '' };
}

/* Move an existing coordinator to the chosen side: add the new role first, then drop
 * any other Buyer Agent TC / Listing Agent TC row for this person on the file. A failed
 * add leaves the earlier row in place. */
export async function moveAssignedTcOnFile(api, dealId, contactId, role, existingRows = []) {
  const assigned = tcAssignedRole(role);
  if (!assigned) throw new Error(TC_CHOOSE_ASSIGNED);
  const rows = (existingRows || []).filter((p) => {
    if (!p || p.removed || !isAgentTcRole(p.role)) return false;
    if (!contactId) return true;
    return p.contactId === contactId || (p.contact && p.contact.id) === contactId;
  });
  const already = rows.some((p) => p.role === assigned);
  if (!already) {
    try { await api.addParticipant(dealId, contactId, assigned); }
    catch (err) { if (!isAlreadyTcMessage(err && err.message)) throw err; }
  }
  const removed = [];
  for (const row of rows) {
    if (row.role === assigned || !row.id) continue;
    await api.removeParticipant(dealId, row.id);
    removed.push(row.id);
  }
  return { role: assigned, removed };
}
