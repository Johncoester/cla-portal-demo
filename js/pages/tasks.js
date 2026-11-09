// Tasks page (Matt, Nov 2): every task on the files this person can see, in one list. Filters (status, files, side / role, overdue, due and
// closing date ranges, search by file number / address / name) and sort (due date, file number, address, closing date, status). Default view:
// incomplete tasks on open files, grouped by Buyer, Seller and Agent. Staff logins only (Processor, coordinator, sales, Admin); access is the adapter's.
import { html } from '../ui.js?v=202611070139';
import { localDate } from '../data/constants.js?v=202611090935';
import { boardForm, boardResults, mountBoard, BOARD_DEFAULTS } from './taskboard.js?v=202611100100';

export async function render({ api, user }) {
  const tasks = await api.listAllTasks({ fileStatus: 'All' }); const today = localDate();
  const files = new Set(tasks.map((t) => t.dealId)).size;
  const body = html`<div class="page-head" data-all-tasks-ready data-task-count="${tasks.length}"><div><div class="eyebrow">${user.isAdmin ? 'ADMIN' : user.role.toUpperCase()}</div><h2 class="page-title">All tasks</h2>
      <div class="muted">${tasks.length} task(s) on ${files} file(s) you can see. Showing incomplete tasks on open files, grouped by Buyer, Seller and Agent; change the filters to see more.</div></div>
      ${user.isAdmin ? html`<div><a class="ghost" href="#/task-grid">Task grid</a></div>` : ''}</div>
    <div class="card">${boardForm(BOARD_DEFAULTS)}<div data-board-results>${boardResults(tasks, BOARD_DEFAULTS, today)}</div></div>`;
  return { title: 'All tasks', crumbs: [['All Tasks']], body, mount(root) { mountBoard(root, tasks, today); } };
}
