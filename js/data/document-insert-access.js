/* The insert check for an assigned agent. It does not replace row security.
 * CLA staff only, the agent's own side, and everyone on the file are allowed.
 * The other side, wire files, and another file are not. */
const OWN = { 'Listing Agent': 'seller', 'Buyer Agent': 'buyer' };

export function agentMayInsertDocument({ role = '', onThisFile = false, visibility = '', wire = false } = {}) {
  if (!onThisFile) return false;
  if (wire) return false;
  const own = OWN[role];
  if (!own) return false;
  return visibility === 'staff' || visibility === 'all' || visibility === own;
}
