/* MF-053 (Matt, Processor User-Task Grid notes Nov 11; confirmed Nov 12 8:47 AM ET and Nov 16 10:45 AM ET, FF-086 item 1).
 * One status per party. Task cells come from the grid rows already loaded.
 * partyRoles, when the screen has them, is the list of roles actually on that file (one read for the whole grid, not one per row).
 *   done    = every live task for that party on the file is complete (green check)
 *   overdue = any live task for that party is overdue (red X). This wins over "done".
 *   open    = the party is on the file and tasks are not all done and none are overdue (the cell stays empty).
 *             That includes a party who is on the file but has no tasks yet.
 *   blank   = that party is not on the file. Cancelled tasks do not count as the party being on the file.
 * When partyRoles is omitted, a party counts as on the file only when they have a live task.
 * partyTaskMark is the only place that decides done / overdue / open. MF-057 plugs in there:
 * a task shared by more than one buyer, or more than one seller, counts as done only when every one of them has finished. */
export const PARTY_COLUMNS = [
  ['buyer', 'Buyer', 'Client-Buyer'],
  ['seller', 'Seller', 'Client-Seller'],
  ['buyer-agent', "Buyer's Agent", 'Buyer Agent'],
  ['listing-agent', 'Listing Agent', 'Listing Agent'],
];

/* Live task cells for one party on one file. Cancelled and not-on-file cells are left out by the caller filter inside.
 *   'done'    every live task is complete
 *   'overdue' any live task is past its due date and not complete (this wins)
 *   'open'    a live task is still open and not overdue
 *   null      no live task (the caller shows a blank cell, or an empty cell when the party is on the file)
 * MF-057 changes taskCopiesDone, which is the line that waits for every buyer or every seller. */
export function partyTaskMark(cells) {
  const live = (cells || []).filter((c) => c && c.state && c.state !== 'na');
  if (!live.length) return null;
  if (live.some((c) => c.state === 'overdue')) return 'overdue';
  if (live.every(taskCopiesDone)) return 'done';
  return 'open';
}

/* One grid cell is one task. Several buyers or sellers share it as copies (total / done).
 * It is complete only when every copy is done. MF-057 changes this check. */
function taskCopiesDone(cell) {
  if (!cell || cell.state !== 'done') return false;
  const total = Number(cell.total);
  if (total > 1) return Number(cell.done) === total;
  return true;
}

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
    const mark = partyTaskMark(byRole.get(role));
    if (!mark) out[key] = (knowParties && onFile.has(role)) ? { state: 'open' } : { state: 'blank' };
    else out[key] = { state: mark };
  }
  return out;
}
