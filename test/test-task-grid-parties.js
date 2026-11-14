/* MF-053: party status columns on the Processor Task Grid. Fake tasks only.
 * Green check = every live task for that party is done.
 * Red X = any live task is overdue (this wins even when other tasks are done).
 * Empty (open) = a task is still open and not overdue.
 * Empty (blank) = that party has no live task on the file. Cancelled tasks do not count. */
import { buildTaskGrid } from '../js/data/task-board.js';
import { partyStatusForFile, PARTY_COLUMNS } from '../js/data/task-grid-parties.js';
import { sortGridFiles } from '../js/data/task-grid-sort.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const TODAY = '2026-11-14';
const deal = (id, fileNumber, closingDate) => ({ id, fileNumber, street: fileNumber + ' Street', city: 'Baltimore', state: 'MD', zip: '21201', closingDate, status: 'Open', transactionType: 'Purchase' });
const task = (id, dealId, role, status, dueDate, title) => ({ id, dealId, assignedRole: role, title: title || role + ' task', status, dueDate, completedAt: status === 'done' ? '2026-11-10T15:00:00Z' : null });

const tasks = [
  task('b-done', 'd1', 'Client-Buyer', 'done', '2026-11-01', 'Upload ID'),
  task('b-done-2', 'd1', 'Client-Buyer', 'done', '2026-11-02', 'Personal info'),
  task('s-late', 'd1', 'Client-Seller', 'todo', '2026-11-01', 'Payoff'),
  task('s-done', 'd1', 'Client-Seller', 'done', '2026-11-02', 'HOA'),
  task('ba-open', 'd1', 'Buyer Agent', 'todo', '2026-11-20', 'Commission'),
  task('la-cancel', 'd1', 'Listing Agent', 'cancelled', '2026-11-01', 'Repairs'),
  task('b-done-b', 'd2', 'Client-Buyer', 'done', '2026-11-01', 'Upload ID'),
  task('b-open-b', 'd2', 'Client-Buyer', 'in_progress', '2026-12-01', 'Personal info'),
  task('b-over', 'd3', 'Client-Buyer', 'blocked', '2026-11-01', 'Upload ID'),
  task('staff', 'd1', 'Processor', 'todo', '2026-11-01', 'Internal'),
];
const deals = [deal('d1', 'MD-1', '2026-12-01'), deal('d2', 'MD-2', null), deal('d3', 'MD-3', '2026-12-15'), deal('d4', 'MD-4', '2026-12-20')];
const grid = buildTaskGrid(tasks, deals, TODAY);
const status = (id) => partyStatusForFile(grid.rows, id);

ok(PARTY_COLUMNS.map(([key]) => key).join() === 'buyer,seller,buyer-agent,listing-agent', 'the four parties are Buyer, Seller, Buyer\'s Agent, Listing Agent');

const d1 = status('d1');
ok(d1.buyer.state === 'done', 'a green check when every buyer task is complete');
ok(d1.seller.state === 'overdue', 'a red X when any seller task is overdue, even if another is done');
ok(d1['buyer-agent'].state === 'open', 'nothing when the buyer\'s agent tasks are open and not overdue');
ok(d1['listing-agent'].state === 'blank', 'a cancelled listing-agent task leaves the cell blank');

const d2 = status('d2');
ok(d2.buyer.state === 'open', 'one finished buyer task and one still open is not a check');
ok(d2.seller.state === 'blank' && d2['buyer-agent'].state === 'blank' && d2['listing-agent'].state === 'blank', 'parties with no tasks on the file are blank');

ok(status('d3').buyer.state === 'overdue', 'a blocked task past its due date is overdue');
ok(status('d4').buyer.state === 'blank' && status('d4').seller.state === 'blank', 'a file with no party tasks and no party list is blank in every party column');
const onFile = partyStatusForFile(grid.rows, 'd4', ['Client-Buyer']);
ok(onFile.buyer.state === 'open' && onFile.seller.state === 'blank', 'a buyer saved on the file with no tasks shows nothing; a seller who is not on the file stays blank');
ok(partyStatusForFile(grid.rows, 'd1', ['Listing Agent'])['listing-agent'].state === 'open', 'a listing agent on the file whose only task was cancelled shows nothing, not a missing-party cell');
ok(!grid.rows.some((row) => row.role === 'Processor'), 'staff tasks stay off the grid and do not change a party cell');

const ranked = grid.columns.map((f) => ({ ...f, parties: status(f.id) }));
ok(sortGridFiles(ranked, grid.rows, 'party:buyer', 'asc').map((f) => f.id).join() === 'd3,d2,d1,d4', 'sorting Buyer puts overdue first, then open, then complete, and a blank file last');
ok(sortGridFiles(ranked, grid.rows, 'party:buyer', 'desc').map((f) => f.id).join() === 'd1,d2,d3,d4', 'reversing Buyer still leaves the blank file last');
ok(sortGridFiles(ranked, grid.rows, 'fileNumber', 'asc').map((f) => f.fileNumber).join() === 'MD-1,MD-2,MD-3,MD-4', 'file number sort is unchanged');
ok(sortGridFiles(ranked, grid.rows, 'closingDate', 'asc').map((f) => f.id)[3] === 'd2', 'a file with no closing date still sorts last');

globalThis.location = { hash: '#/task-grid' };
const { render } = await import('../js/pages/taskgrid.js');
const view = await render({ api: { async getTaskGrid() { return grid; } } });
const html = String(view.body);
const rowOf = (id) => html.slice(html.indexOf('data-file="' + id + '"'), html.indexOf('</tr>', html.indexOf('data-file="' + id + '"')));
const cellOf = (row, key) => { const at = row.indexOf('data-party="' + key + '"'); return row.slice(at, row.indexOf('</td>', at)); };
const row = rowOf('d1');
const closingAt = row.indexOf('data-closing=');
const buyerAt = row.indexOf('data-party="buyer"');
const sellerAt = row.indexOf('data-party="seller"');
const agentAt = row.indexOf('data-party="buyer-agent"');
const listingAt = row.indexOf('data-party="listing-agent"');
const taskAt = row.indexOf('data-task=');
ok(html.includes('data-sort="fileNumber"') && html.includes('File No') && html.includes('data-sort="address"') && html.includes('>Property') && html.includes('data-sort="closingDate"') && html.includes('Closing Date'), 'file number, property and closing date columns stay');
ok(html.includes('data-party-columns="4"') && html.includes('Buyer&#39;s Agent') && html.includes('Listing Agent') && html.includes('data-grid-group="parties"'), 'the four party columns are on the grid');
ok(closingAt > 0 && closingAt < buyerAt && buyerAt < sellerAt && sellerAt < agentAt && agentAt < listingAt && listingAt < taskAt, 'party columns sit after closing date and before the task columns');
ok(row.includes('>MD-1<') && row.includes('MD-1 Street') && row.includes('12/01/2026'), 'the file number, property and closing date values are unchanged');
ok(cellOf(row, 'buyer').includes('data-state="done"') && cellOf(row, 'buyer').includes('ok-text') && cellOf(row, 'buyer').includes('&#10004;'), 'the buyer cell is a green check');
ok(cellOf(row, 'seller').includes('data-state="overdue"') && cellOf(row, 'seller').includes('bad-text') && cellOf(row, 'seller').includes('&#10008;'), 'the seller cell is a red X');
const openCell = cellOf(row, 'buyer-agent');
ok(openCell.includes('data-state="open"') && !openCell.includes('&#10004;') && !openCell.includes('&#10008;') && !openCell.includes('&ndash;'), 'an open buyer\'s agent cell shows nothing');
const blankCell = cellOf(row, 'listing-agent');
ok(blankCell.includes('data-state="blank"') && !blankCell.includes('&#10004;') && !blankCell.includes('&#10008;') && !blankCell.includes('&ndash;'), 'a missing listing agent shows a blank cell, not a dash');
ok(rowOf('d2').includes('data-closing=""') && rowOf('d2').includes('not set'), 'a file with no closing date still says not set');
ok(html.includes('No files.') === false, 'files are listed when the grid has rows');

const empty = await render({ api: { async getTaskGrid() { return { columns: [], rows: [], totals: { done: 0, overdue: 0, pending: 0, na: 0 } }; } } });
const emptyHtml = String(empty.body);
ok(emptyHtml.includes('No files.') && emptyHtml.includes('data-file-count="0"') && !emptyHtml.includes('data-party='), 'a grid with no files says so and does not invent party cells');

const { parseHTML } = await import('/tmp/domtest/node_modules/linkedom/worker.js');
const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
const root = document.createElement('div');
root.innerHTML = html;
document.body.appendChild(root);
view.mount(root);
const order = () => [...root.querySelectorAll('tr[data-file]')].map((tr) => tr.getAttribute('data-file')).join();
ok(order() === 'd1,d2,d3,d4', 'the grid starts in file-number order');
root.querySelector('th[data-sort="party:buyer"] button').click();
ok(order() === 'd3,d2,d1,d4', 'clicking Buyer sorts overdue, then open, then complete');
root.querySelector('th[data-sort="party:buyer"] button').click();
ok(order() === 'd1,d2,d3,d4', 'clicking Buyer again reverses that order and keeps the blank file last');
ok(root.querySelector('th[data-sort="party:buyer"]').getAttribute('aria-sort') === 'descending', 'the Buyer header says it is sorted descending');

const { createMockAdapter } = await import('../js/data/mock-adapter.js');
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
let refused = '';
try { await api.getTaskGrid({ fileStatus: 'Open' }); } catch (err) { refused = err.message; }
ok(refused.includes('Only an Admin'), 'a processor still cannot open the task grid');
await api.signInDev('u-admin');
const live = await api.getTaskGrid({ fileStatus: 'Open' });
const states = new Set(['done', 'overdue', 'open', 'blank']);
ok(live.columns.length > 0 && live.columns.every((f) => f.fileNumber && f.street && Array.isArray(f.partyRoles) && PARTY_COLUMNS.every(([key]) => states.has(partyStatusForFile(live.rows, f.id, f.partyRoles)[key].state))), 'each sample open file keeps its file number and property and has a status for all four parties');
const willow = live.columns.find((f) => f.fileNumber === 'MD-26-97262');
const willowParties = partyStatusForFile(live.rows, willow.id, willow.partyRoles);
ok(willow.partyRoles.includes('Client-Buyer') && willow.partyRoles.includes('Client-Seller') && willowParties.buyer.state === 'open' && willowParties.seller.state === 'open' && willowParties['buyer-agent'].state === 'overdue' && willowParties['listing-agent'].state === 'overdue', 'Willow Drive keeps the buyer and seller who are on the file even though they have no tasks yet');
const cedar = live.columns.find((f) => f.fileNumber === 'MD-26-97240');
ok(partyStatusForFile(live.rows, cedar.id, cedar.partyRoles)['listing-agent'].state === 'open', 'Cedar Way shows an empty listing-agent cell because that agent is on the file');

console.log(fail ? fail + ' failed' : 'task grid parties passed');
process.exit(fail ? 1 : 0);
