/* mock adapter: Matt Landsberg's Nov 2 notes. FAKE DATA ONLY.
 *  - listAllTasks: every task the signed-in person may see, across the files they may see (same rules as listTasks, one file at a time),
 *    each with its file (number, address, closing date, status) so the Tasks page / Work Queue can filter, sort and group by Buyer / Seller / Agent.
 *  - getTaskGrid: the Processor / Admin grid (file numbers across, agent / buyer / seller tasks down). Uses the Processor's normal access (every file).
 * Mirrored in SQL by public.task_board() / public.task_grid() (migration 16). */
import { buildTaskGrid, groupOfRole, isOverdue } from './task-board.js?v=202611022207';

export function mattNov2(x) {
  const { load, needUser, dealsFor, scopeTo, taskVisible, nameOf, fail, localDate, C } = x;
  const fileOf = (q) => ({ id: q.id, fileNumber: q.fileNumber, street: q.street, city: q.city, state: q.state, zip: q.zip, address: `${q.street}, ${q.city}, ${q.state} ${q.zip}`,
    closingDate: q.closingDate || null, status: q.status, stage: q.stage, stageName: C.STAGES[q.stage], transactionType: q.transactionType });
  function allTasks(u, { fileStatus = 'All' } = {}) {
    const d = load(); const today = localDate();
    const deals = dealsFor(u).filter((q) => fileStatus === 'All' || q.status === fileStatus);
    const rows = deals.flatMap((q) => { const su = scopeTo(u, q.id); const file = fileOf(q);
      return d.tasks.filter((t) => t.dealId === q.id && taskVisible(su, t)).map((t) => { const o = x.taskOut(su, t);
        return { ...o, deal: file, group: groupOfRole(t.assignedRole), overdue: isOverdue(t, today), personName: o.ownerName || '', completedByName: t.completedBy ? nameOf(t.completedBy) : '' }; }); });
    return { deals, rows };
  }
  return {
    // fileStatus: 'All' (default) or a deal status. Status / side / overdue / date / text filters and sorting are applied by the screen (task-board.js).
    async listAllTasks({ fileStatus = 'All' } = {}) { const u = needUser(); return allTasks(u, { fileStatus }).rows; },
    // Processor (and Admin) only. fileStatus 'Open' (default) or 'All' / a deal status.
    async getTaskGrid({ fileStatus = 'Open' } = {}) {
      const u = needUser(); if (!(u.isAdmin || C.runsOrders(u))) fail('Only a Processor or Admin can open the task grid.');
      const { deals, rows } = allTasks(u, { fileStatus }); return buildTaskGrid(rows, deals.map(fileOf), localDate());
    },
  };
}
