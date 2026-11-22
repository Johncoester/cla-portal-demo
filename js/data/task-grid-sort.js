/* Task grid, flipped (Matt, Nov 3 (b)): FILES DOWN THE SIDE (rows), TASKS ACROSS THE TOP (columns), closing date beside each file, and up / down sort
 * arrows on every column header (like Open Orders). Pure helpers; the data still comes from getTaskGrid() (buildTaskGrid: g.columns = files,
 * g.rows = tasks with cells per file), so both adapters and the SQL task_grid() are unchanged. The screen only transposes and sorts.
 *   key: 'fileNumber' | 'address' | 'closingDate' | 'task:<row key>' | 'party:<buyer|seller|buyer-agent|listing-agent>'   dir: 'asc' | 'desc'
 * A task column sorts by its cell state: asc = most urgent first (overdue, then not yet due, then completed); dates break ties (earliest due /
 * completion first); files where that task is not on the file (dash) and files with no closing date are always last, in either direction.
 * A party column (MF-053) sorts the same way: overdue, then open and not overdue, then complete. A blank party cell (that party is not on the file)
 * stays last in either direction. The screen sets f.parties before sorting. */
const lc = (v) => String(v == null ? '' : v).toLowerCase();
const fileKey = (n) => { const m = /(\d+)\D*$/.exec(String(n || '')); return m ? m[1].padStart(10, '0') : lc(n); };
const STATE_RANK = { overdue: 0, pending: 1, done: 2 };
const PARTY_RANK = { overdue: '0', open: '1', pending: '1', done: '2' };
export function sortGridFiles(files, rows, key = 'fileNumber', dir = 'asc') {
  const s = dir === 'desc' ? -1 : 1;
  const party = String(key).startsWith('party:') ? key.slice(6) : '';
  const row = !party && String(key).startsWith('task:') ? rows.find((r) => r.key === key.slice(5)) : null;
  const val = (f) => {
    if (party) { const c = (f.parties && f.parties[party]) || { state: 'blank' }; return PARTY_RANK[c.state] || null; }
    if (row) { const c = row.cells[f.id] || { state: 'na' }; if (!(c.state in STATE_RANK)) return null;
      return `${STATE_RANK[c.state]}-${(c.state === 'done' ? c.date : c.dueDate) || '9999-99-99'}`; }
    return { fileNumber: fileKey(f.fileNumber), address: lc(f.address || f.street), closingDate: f.closingDate || null }[key] || null; };
  return [...files].sort((a, b) => { const x = val(a); const y = val(b);
    if (!x && !y) return fileKey(a.fileNumber).localeCompare(fileKey(b.fileNumber)); if (!x) return 1; if (!y) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * s || fileKey(a.fileNumber).localeCompare(fileKey(b.fileNumber)) * s; });
}
