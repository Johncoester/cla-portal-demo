/* TC-NEW-TASKS-PAGE-1 (tracker row 424). John Coester, Nov 21 2026 (video as TC Portal Jc, list confirmed 11:56 AM ET): a new
 * "Open Tasks" page in the left menu listing all of the person's tasks across files, like Open Orders lists every order.
 * Fake data only. No hosted project. */
import { readFileSync } from 'node:fs';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
globalThis.location = { hash: '#/orders?view=tasks', search: '', pathname: '/', href: 'http://localhost/' };
globalThis.localStorage = mem(); globalThis.sessionStorage = mem();
const { render: ordersRender, openTasksFor } = await import('../js/pages/orders.js');
const { openTaskRows, sortOpenTasks } = await import('../js/pages/open-tasks.js');

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const deal = (id, extra) => ({ id, fileNumber: 'MD-26-0' + id, street: id + ' Fake St', city: 'Rockville', state: 'MD', zip: '20850', status: 'Open', stage: 2, ...extra });
const deals = [deal('1', { myRole: 'Buyer Agent', myRoleLabel: 'Transaction Coordinator' }), deal('2', { myRole: 'Listing Agent', myRoleLabel: 'Listing Agent', stage: 5 })];
const task = (id, dealId, extra) => ({ id, title: 'Task ' + id, status: 'todo', mine: true, dealId, deal: { id: dealId, status: 'Open' }, myRoleLabel: 'Buyer Agent', ...extra });
const tasks = [task('a', '1', { dueDate: '2026-12-09' }), task('b', '2', { dueDate: '2026-11-01' }), task('c', '1', { status: 'done' }), task('d', '2', { status: 'in_progress' }),
  task('e', '9', { deal: { id: '9', status: 'Closed' } })];
let reads = [];
const api = { async listMyTasks(o) { reads.push('tasks:' + o.fileStatus); return tasks; }, async listDeals(o) { reads.push('deals:' + o.status); return deals; } };

const page = await ordersRender({ api, user: { id: 'u-tc', role: 'Outside user' } });
const out = String(page.body);
ok(page.title === 'Open Tasks', 'the Open Tasks view opens for an outside user');
ok(reads.sort().join() === 'deals:Open,tasks:Open', 'one task read and one order-list read');
ok(out.includes('class="tbl striped" id="ttable"'), 'the table uses the Open Orders look');
ok((out.match(/data-open-task="/g) || []).length === 3, 'only open tasks on open files are listed (done and closed-file tasks are left out)');
ok(out.indexOf('data-open-task="b"') < out.indexOf('data-open-task="a"'), 'earliest due first');
ok(out.includes('data-open-task-role>Transaction Coordinator<') && out.includes('data-open-task-role>Listing Agent<'), 'Your Role uses the file label (Transaction Coordinator for a coordinator)');
ok(out.includes('overdue'), 'a past-due task is marked overdue');
ok(out.includes('Buyer Info Received') && out.includes('Processing'), 'Stage shows the file stage name');

reads = [];
const staff = await ordersRender({ api: { ...api, async listDeals() { reads.push('deals'); return []; }, orderMailUnread: async () => null }, user: { id: 'u-proc', role: 'Processor' } });
ok(staff.title === 'Orders' && !reads.includes('tasks:Open'), 'staff get Open Orders, not the task view');
ok(openTasksFor({ role: 'Buyer Agent' }) && openTasksFor({ role: 'Outside user' }) && !openTasksFor({ role: 'Processor' }) && !openTasksFor({ role: 'Client-Buyer' }), 'who gets the page: outside users and agents');

const rows = openTaskRows(tasks, deals, '2026-11-21');
ok(sortOpenTasks(rows, 'fileNumber', 'desc')[0].fileNumber === 'MD-26-02', 'columns sort both ways');

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
ok(app.includes("add('open-tasks', 'Open Tasks', '#/orders?view=tasks', 'task')") && app.includes('if (isOutside(u.role) || isAgent(u.role)) add(\'open-tasks\''), 'the left menu has Open Tasks for outside users and agents');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ok');
