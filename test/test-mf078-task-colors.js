/* MF-078 (Matt, confirmed Nov 27 2026, Gmail 1a21e27a512122fe):
   Open to-do / started / blocked tasks: red when settlement is 7 days away or less
   (including past); orange when 7 or more days past the task's own due date; red wins.
   1–6 days past due with settlement more than 7 days out keeps the normal status color.
   Done and cancelled never get red or orange. "To do" has its own pill color.
   Fake dates only. Nothing is applied on a hosted project. */
import { readFileSync } from 'node:fs';
import { taskUrgency, calendarDaysBetween, urgencyTone, urgencyGridState, strongestUrgency } from '../js/data/task-urgency.js';
import { partyTaskGridCell } from '../js/data/party-task-completion.js';
import { buildTaskGrid } from '../js/data/task-board.js';
import { partyStatusForFile, partyTaskMark } from '../js/data/task-grid-parties.js';
import { CLS } from '../js/pages/dealtasks.js';
import { toText } from '../js/ui.js';
import { render } from '../js/pages/dealtasks.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const TODAY = '2026-11-27';
const open = (over) => ({ id: 't1', status: 'todo', dueDate: '2026-12-20', ...over });

ok(calendarDaysBetween('2026-11-27', '2026-12-04') === 7, 'settlement 7 days away is exactly 7 calendar days');
ok(calendarDaysBetween('2026-11-20', '2026-11-27') === 7, '7 days past a due date is exactly 7 calendar days');

ok(taskUrgency(open({ dueDate: '2026-12-20' }), { today: TODAY, closingDate: '2026-12-04' }) === 'red', 'exactly 7 days to settlement is red');
ok(taskUrgency(open({ dueDate: '2026-12-20' }), { today: TODAY, closingDate: '2026-11-27' }) === 'red', 'settlement today is red');
ok(taskUrgency(open({ dueDate: '2026-12-20' }), { today: TODAY, closingDate: '2026-11-26' }) === 'red', 'a past settlement date is still red while the task is open');
ok(taskUrgency(open({ dueDate: '2026-12-20' }), { today: TODAY, closingDate: '2026-12-05' }) === '', '8 days to settlement is not red');
ok(taskUrgency(open({ dueDate: '2026-11-20' }), { today: TODAY, closingDate: '2026-12-20' }) === 'orange', 'exactly 7 days past the due date is orange');
ok(taskUrgency(open({ dueDate: '2026-11-19' }), { today: TODAY, closingDate: '2026-12-20' }) === 'orange', 'more than 7 days past the due date is orange');
ok(taskUrgency(open({ dueDate: '2026-11-21' }), { today: TODAY, closingDate: '2026-12-20' }) === '', '6 days past the due date keeps the normal color when settlement is more than 7 days out');
ok(taskUrgency(open({ dueDate: '2026-11-20' }), { today: TODAY, closingDate: '2026-12-04' }) === 'red', 'red wins when settlement is within 7 days and the task is also 7 days past due');
ok(taskUrgency(open({ status: 'in_progress', dueDate: '2026-11-20' }), { today: TODAY, closingDate: '2026-12-20' }) === 'orange', 'started tasks use the same date rules');
ok(taskUrgency(open({ status: 'blocked', dueDate: '2026-12-20' }), { today: TODAY, closingDate: '2026-12-04' }) === 'red', 'blocked tasks use the same date rules');
ok(taskUrgency(open({ status: 'done', dueDate: '2026-11-20' }), { today: TODAY, closingDate: '2026-12-04' }) === '', 'a done task never gets red or orange');
ok(taskUrgency(open({ status: 'cancelled', dueDate: '2026-11-20' }), { today: TODAY, closingDate: '2026-12-04' }) === '', 'a cancelled task never gets red or orange');
ok(taskUrgency(open({ dueDate: '2026-11-20' }), { today: TODAY }) === 'orange', 'with no closing date, only the 7-day past-due rule can apply');
ok(urgencyTone('red') === 'is-due-soon' && urgencyTone('orange') === 'is-past-due', 'the Tasks tab uses due-soon and past-due row classes');
ok(urgencyGridState('red') === 'due-soon' && urgencyGridState('orange') === 'past-due', 'the Task Grid uses due-soon and past-due cell states');
ok(strongestUrgency(['orange', 'red', '']) === 'red', 'red is the stronger of the two colors');

ok(CLS.todo === 'todo' && CLS.in_progress === 'info' && CLS.todo !== CLS.in_progress, '"to do" uses its own pill class, not the started color');
const css = readFileSync(new URL('../css/portal.css', import.meta.url), 'utf8');
ok(/\.pill\.todo/.test(css) && /\.pill\.info/.test(css), 'the stylesheet has a distinct to-do pill');

const cell = (copies, close) => partyTaskGridCell(copies, TODAY, close);
ok(cell([open({ status: 'todo', dueDate: '2026-12-20' })], '2026-12-04').state === 'due-soon', 'the grid cell is due-soon at the 7-day settlement boundary');
ok(cell([open({ status: 'todo', dueDate: '2026-11-20' })], '2026-12-20').state === 'past-due', 'the grid cell is past-due at the 7-day due-date boundary');
ok(cell([open({ status: 'todo', dueDate: '2026-11-20' })], '2026-12-04').state === 'due-soon', 'due-soon wins over past-due on the grid');
ok(cell([open({ status: 'todo', dueDate: '2026-11-21' })], '2026-12-20').state === 'pending', '1–6 days past due stays a normal open cell when settlement is more than 7 days out');
ok(cell([open({ status: 'done', dueDate: '2026-11-20' })], '2026-12-04').state === 'done', 'a done grid cell stays done');

const deal = (id, closingDate) => ({ id, fileNumber: 'MD-' + id, street: id + ' St', city: 'Baltimore', state: 'MD', zip: '21201', closingDate, status: 'Open', transactionType: 'Purchase' });
const task = (id, dealId, status, dueDate) => ({ id, dealId, assignedRole: 'Client-Buyer', title: 'Upload ID', status, dueDate, completedAt: status === 'done' ? '2026-11-10T15:00:00Z' : null });
const grid = buildTaskGrid([
  task('soon', 'c1', 'todo', '2026-12-20'),
  task('late', 'c2', 'todo', '2026-11-20'),
  task('done', 'c3', 'done', '2026-11-20'),
], [deal('c1', '2026-12-04'), deal('c2', '2026-12-20'), deal('c3', '2026-12-04')], TODAY);
ok(partyStatusForFile(grid.rows, 'c1').buyer.state === 'due-soon', 'the party mark is due-soon when settlement is 7 days away');
ok(partyStatusForFile(grid.rows, 'c2').buyer.state === 'past-due', 'the party mark is past-due when the task is 7 days past due');
ok(partyStatusForFile(grid.rows, 'c3').buyer.state === 'done', 'a completed party stays a check even when settlement is close');
ok(partyTaskMark([{ state: 'due-soon' }, { state: 'past-due' }]) === 'due-soon', 'a party with both colors shows red');

const dealPage = { id: 'd1', transactionType: 'Purchase', closingDate: '2026-12-04', participants: [] };
const pageTasks = [
  { id: 't-red', title: 'Upload ID', status: 'todo', assignedRole: 'Client-Buyer', kind: 'simple', dueDate: '2026-11-20', dealId: 'd1', canTick: true },
  { id: 't-ok', title: 'Personal information', status: 'in_progress', assignedRole: 'Client-Buyer', kind: 'simple', dueDate: '2026-11-21', dealId: 'd1', canTick: true },
  { id: 't-done', title: 'Home warranty', status: 'done', assignedRole: 'Client-Buyer', kind: 'simple', dueDate: '2026-11-20', dealId: 'd1', canTick: true },
];
// Freeze "today" used by the page: localDate() follows the machine clock. The deal closing
// and due dates above assume TODAY; the page uses localDate(), so only assert class names
// that the helper already covered when the clock is not 2026-11-27. Render still checks pills.
globalThis.location = { hash: '#/deals/d1/tasks', search: '', pathname: '/' };
const api = { listTasks: async () => pageTasks, listAgreements: async () => ({ agreements: [] }) };
const html = toText((await render({ api, user: { id: 'u-proc', role: 'Processor', roles: ['Processor'] }, deal: dealPage, refresh() {} })).body);
ok(html.includes('class="pill todo"') && html.includes('>to do<'), 'the Tasks tab paints "to do" with its own pill');
ok(html.includes('class="pill info"') && html.includes('>started<'), 'started keeps the existing info pill');
ok(!/data-task-row="t-done"[^>]*class="is-due-soon"/.test(html) && !/data-task-row="t-done"[^>]*class="is-past-due"/.test(html) && html.includes('data-task-tone="is-done"'), 'a done task is not red or orange on the Tasks tab');

const page = readFileSync(new URL('../js/pages/dealtasks.js', import.meta.url), 'utf8');
const gridPage = readFileSync(new URL('../js/pages/taskgrid.js', import.meta.url), 'utf8');
ok(page.includes('task-urgency.js') && gridPage.includes('due-soon') && gridPage.includes('past-due'), 'both the Tasks tab and the Task Grid use the new colors');

console.log(fail ? fail + ' failed' : 'mf078 task colors passed');
if (fail) process.exit(1);
