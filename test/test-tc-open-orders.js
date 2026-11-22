/* TC-OPENORDERS-1 (tracker row 423). John Coester, Nov 21 2026 (video as TC Portal Jc, list confirmed 11:56 AM ET): Open Orders
 * showed "-" for Your Role, Task Pending and Stage for an outside coordinator. The hosted list now fills Stage from the stage
 * number and Task Pending from one my_task_list read; Your Role reads Transaction Coordinator for a coordinator (TC-PROFILE-1 label).
 * Fake data only. No hosted project. */
import { readFileSync } from 'node:fs';

globalThis.location = { hash: '#/orders?s=Open', search: '', pathname: '/', href: 'http://localhost/' };
const { render } = await import('../js/pages/orders.js');

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const row = (id, extra) => ({ id, fileNumber: 'MD-26-0000' + id.slice(-1), street: '1 Fake St', city: 'Rockville', state: 'MD', zip: '20850', address: '1 Fake St, Rockville, MD 20850',
  openDate: '2026-11-01', closingDate: '2026-12-01', status: 'Open', stage: 3, transactionType: 'Purchase', ...extra });
// hosted shape: stage number only, no stageName, no myOpenTasks
const hosted = [row('d1', { myRole: 'Buyer Agent', myRoleLabel: 'Transaction Coordinator' }), row('d2', { myRole: 'Listing Agent', myRoleLabel: 'Listing Agent', stage: 0 }),
  row('d3', { myRole: 'Client-Buyer', myRoleLabel: 'Client-Buyer' })];
let taskReads = 0; let order = [];
const api = {
  async listDeals() { order.push('deals'); return hosted.map((d) => ({ ...d })); },
  async listMyTasks({ fileStatus }) { taskReads += 1; order.push('tasks:' + fileStatus); return [
    { id: 't1', dealId: 'd1', status: 'todo' }, { id: 't2', dealId: 'd1', status: 'done' }, { id: 't3', dealId: 'd3', status: 'in_progress' }]; },
};
const out = String((await render({ api, user: { id: 'u-tc', role: 'Outside user', firstName: 'TC', lastName: 'Test' } })).body);
const cells = (id, attr) => { const tr = out.slice(out.indexOf(`data-deal="${id}"`)); const i = tr.indexOf(attr); return tr.slice(i, tr.indexOf('</td>', i)); };
ok(taskReads === 1 && order[0] === 'tasks:Open', 'one task read for the open tab, started before the order list');
ok(cells('d1', 'data-your-role').includes('Transaction Coordinator'), 'Your Role reads Transaction Coordinator for the coordinator');
ok(cells('d2', 'data-your-role').includes('Listing Agent') && cells('d3', 'data-your-role').includes('Buyer'), 'an agent and a client keep their side');
ok(cells('d1', 'data-task-pending').includes('Action Required') && cells('d3', 'data-task-pending').includes('Action Required'), 'Task Pending shows Action Required where the person has an open task');
ok(!cells('d2', 'data-task-pending').includes('Action Required'), 'no Action Required where nothing is open for them (a done task does not count)');
ok(cells('d1', 'data-stage').includes('Schedule Closing') && cells('d2', 'data-stage').includes('Opened'), 'Stage shows the stage name from the stage number');

// staff: no per-person task read (they have no Your Role column)
taskReads = 0; order = [];
const staffOut = String((await render({ api, user: { id: 'u-proc', role: 'Processor', firstName: 'P', lastName: 'Q' } })).body);
ok(taskReads === 0, 'staff do not pay for the extra task read');
ok(staffOut.includes('Schedule Closing'), 'staff also see the stage name on hosted rows');

// mock rows already carry myOpenTasks: the read does not overwrite them
taskReads = 0;
const mockApi = { async listDeals() { return [row('d9', { myRole: 'Buyer Agent', myRoleLabel: 'Buyer Agent', myOpenTasks: 0, stageName: 'Processing' })]; }, async listMyTasks() { taskReads += 1; return [{ id: 'x', dealId: 'd9', status: 'todo' }]; } };
const mockOut = String((await render({ api: mockApi, user: { id: 'u-bagent', role: 'Outside user', firstName: 'A', lastName: 'B' } })).body);
ok(!mockOut.includes('Action Required') && mockOut.includes('Processing'), 'a count and stage the adapter already set are kept');

const src = readFileSync(new URL('../js/pages/orders.js', import.meta.url), 'utf8');
ok(src.indexOf('const minePromise') < src.indexOf('await api.listDeals'), 'the task read starts before the page waits for the order list');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ok');
