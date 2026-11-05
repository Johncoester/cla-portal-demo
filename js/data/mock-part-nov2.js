/* mock adapter: Matt Landsberg's Nov 2 notes. FAKE DATA ONLY.
 *  - listAllTasks: every task the signed-in person may see, across the files they may see (same rules as listTasks, one file at a time),
 *    each with its file (number, address, closing date, status) so the Tasks page / Work Queue can filter, sort and group by Buyer / Seller / Agent.
 *  - getTaskGrid: the Processor / Admin grid (file numbers across, agent / buyer / seller tasks down). Uses the Processor's normal access (every file).
 * Mirrored in SQL by public.task_board() / public.task_grid() (migration 16).
 *  - listMyTasks (John, Nov 4: FILE-FIRST): one combined "everything I need to do" list across ALL the files this person is on. Each task belongs to its
 *    file; which tasks exist there comes from their role on THAT file (buyer's-agent vs listing-agent templates). Rows carry the file and myRoles /
 *    myRoleLabel (their role on that file). Never filtered by one role: every file's own per-file rules (scopeTo + taskVisible) still decide what shows.
 *    Mirrored in SQL by public.my_task_list() (migration 45). */
import { buildTaskGrid, groupOfRole, isOverdue } from './task-board.js?v=202611052140';
import { fileRoleLabel } from './constants.js?v=202611052140';

export function mattNov2(x) {
  const { load, needUser, dealsFor, scopeTo, taskVisible, nameOf, fail, localDate, C } = x;
  const fileOf = (q) => ({ id: q.id, fileNumber: q.fileNumber, street: q.street, city: q.city, state: q.state, zip: q.zip, address: `${q.street}, ${q.city}, ${q.state} ${q.zip}`,
    closingDate: q.closingDate || null, status: q.status, stage: q.stage, stageName: C.STAGES[q.stage], transactionType: q.transactionType });
  function allTasks(u, { fileStatus = 'All' } = {}) {
    const d = load(); const today = localDate();
    const deals = dealsFor(u).filter((q) => fileStatus === 'All' || q.status === fileStatus);
    const rows = deals.flatMap((q) => { const su = scopeTo(u, q.id); const file = fileOf(q);
      const myRoles = su.roles || [su.role]; const myRoleLabel = fileRoleLabel(myRoles);
      return d.tasks.filter((t) => t.dealId === q.id && taskVisible(su, t)).map((t) => { const o = x.taskOut(su, t);
        return { ...o, deal: file, myRoles, myRoleLabel, group: groupOfRole(t.assignedRole), overdue: isOverdue(t, today), personName: o.ownerName || '', completedByName: t.completedBy ? nameOf(t.completedBy) : '' }; }); });
    return { deals, rows };
  }
  return {
    // fileStatus: 'All' (default) or a deal status. Status / side / overdue / date / text filters and sorting are applied by the screen (task-board.js).
    async listAllTasks({ fileStatus = 'All' } = {}) { const u = needUser(); return allTasks(u, { fileStatus }).rows; },
    // FILE-FIRST combined list (Nov 4): the caller's own tasks on every file they are on (default: open files), sorted by due date then file number.
    async listMyTasks({ fileStatus = 'Open' } = {}) { const u = needUser();
      return allTasks(u, { fileStatus }).rows.filter((t) => t.mine).sort((p, q) => (p.dueDate || '9999').localeCompare(q.dueDate || '9999') || p.deal.fileNumber.localeCompare(q.deal.fileNumber) || p.title.localeCompare(q.title)); },
    // Processor (and Admin) only. fileStatus 'Open' (default) or 'All' / a deal status.
    async getTaskGrid({ fileStatus = 'Open' } = {}) {
      const u = needUser(); if (!(u.isAdmin || C.runsOrders(u))) fail('Only a Processor or Admin can open the task grid.');
      const { deals, rows } = allTasks(u, { fileStatus }); return buildTaskGrid(rows, deals.map(fileOf), localDate());
    },
  };
}
