/* MF-053 (Matt, Processor User-Task Grid notes Nov 11; confirmed Nov 12 8:47 AM ET).
 * One status per party. Task cells come from the grid rows already loaded.
 * partyRoles, when the screen has them, is the list of roles actually on that file (one read for the whole grid, not one per row).
 *   done    = every live task for that party on the file is complete (green check)
 *   overdue = any live task for that party is overdue (red X). This wins over "done".
 *   open    = the party is on the file and tasks are not all done and none are overdue (the cell stays empty).
 *             That includes a party who is on the file but has no tasks yet.
 *   blank   = that party is not on the file. Cancelled tasks do not count as the party being on the file.
 * When partyRoles is omitted, a party counts as on the file only when they have a live task. */
export const PARTY_COLUMNS = [
  ['buyer', 'Buyer', 'Client-Buyer'],
  ['seller', 'Seller', 'Client-Seller'],
  ['buyer-agent', "Buyer's Agent", 'Buyer Agent'],
  ['listing-agent', 'Listing Agent', 'Listing Agent'],
];

export function partyStatusForFile(rows, fileId, partyRoles) {
  const knowParties = Array.isArray(partyRoles);
  const onFile = new Set(knowParties ? partyRoles : []);
  const byRole = new Map();
  for (const row of rows || []) {
    if (!row || !row.role) continue;
    const cell = (row.cells && row.cells[fileId]) || { state: 'na' };
    if (!byRole.has(row.role)) byRole.set(row.role, []);
    byRole.get(row.role).push(cell);
  }
  const out = {};
  for (const [key, , role] of PARTY_COLUMNS) {
    const live = (byRole.get(role) || []).filter((c) => c && c.state && c.state !== 'na');
    if (!live.length) out[key] = (knowParties && onFile.has(role)) ? { state: 'open' } : { state: 'blank' };
    else if (live.some((c) => c.state === 'overdue')) out[key] = { state: 'overdue' };
    else if (live.every((c) => c.state === 'done')) out[key] = { state: 'done' };
    else out[key] = { state: 'open' };
  }
  return out;
}
