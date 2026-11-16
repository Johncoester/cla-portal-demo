/* MF-057: a buyer or seller task with two or more people stays open until each of them finishes.
 * Fake tasks only. One person on the side stays as it is today. */
import { readFileSync } from 'node:fs';
import { toText } from '../js/ui.js';
import { buildTaskGrid, filterTasks } from '../js/data/task-board.js';
import { annotatePartyTaskProgress, partyTaskGridCell, staffTaskCounts } from '../js/data/party-task-completion.js';
import { boardResults } from '../js/pages/taskboard.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const TODAY = '2026-11-16';
const copy = (id, role, status, person, title, extra = {}) => ({
  id, dealId: 'd1', assignedRole: role, status,
  title: title || 'Upload ID', templateCode: extra.templateCode || 'id_upload', dueDate: extra.dueDate || '2026-12-01',
  completedAt: status === 'done' ? '2026-11-10T15:00:00Z' : null, ...extra,
  participantId: person,
  ownerName: extra.ownerName != null ? extra.ownerName : person,
});

const partial = [
  copy('a', 'Client-Buyer', 'done', 'p-ann', 'Upload ID', { ownerName: 'Ann Buyer' }),
  copy('b', 'Client-Buyer', 'todo', 'p-jordan', 'Upload ID', { ownerName: 'Jordan Buyer' }),
];
const marked = annotatePartyTaskProgress(partial);
const ann = marked.find((t) => t.id === 'a');
const jordan = marked.find((t) => t.id === 'b');
ok(ann.partyProgress && ann.partyProgress.label === '1 of 2 done' && ann.partyProgress.complete === false, 'one of two buyers finished is 1 of 2 done');
ok(ann.partyProgress.remainingLabel === 'Still needed: Jordan Buyer', 'the task names who still needs to finish');
ok(ann.partyProgress === jordan.partyProgress, 'both copies share the same side progress');
ok(staffTaskCounts(partial, TODAY).open === 2 && staffTaskCounts(partial, TODAY).overdue === 0, 'the finished copy stays in the open count and is not overdue');

const both = [
  copy('a', 'Client-Buyer', 'done', 'p-ann', 'Upload ID', { ownerName: 'Ann Buyer' }),
  copy('b', 'Client-Buyer', 'done', 'p-jordan', 'Upload ID', { ownerName: 'Jordan Buyer' }),
];
ok(annotatePartyTaskProgress(both)[0].partyProgress.complete === true && staffTaskCounts(both, TODAY).open === 0, 'the task is done only after every buyer finishes');

const one = [copy('a', 'Client-Buyer', 'done', 'p-ann', 'Upload ID', { ownerName: 'Ann Buyer' })];
ok(!annotatePartyTaskProgress(one)[0].partyProgress && staffTaskCounts(one, TODAY).open === 0, 'one buyer who finishes is done, with no 1 of 1 line');

const sellers = [
  copy('s1', 'Client-Seller', 'done', 'p-sam', 'Payoff', { ownerName: 'Sam Seller', templateCode: 'payoff' }),
  copy('s2', 'Client-Seller', 'todo', 'p-sue', 'Payoff', { ownerName: 'Sue Seller', templateCode: 'payoff', dueDate: '2026-11-01' }),
];
const sellerCounts = staffTaskCounts(sellers, TODAY);
ok(annotatePartyTaskProgress(sellers)[0].partyProgress.label === '1 of 2 done' && sellerCounts.open === 2 && sellerCounts.overdue === 1, 'two sellers stay open, and only the unfinished overdue copy counts as overdue');

const otherTask = [
  copy('a', 'Client-Buyer', 'done', 'p-ann', 'Upload ID', { ownerName: 'Ann Buyer' }),
  copy('b', 'Client-Buyer', 'todo', 'p-jordan', 'Personal information', { ownerName: 'Jordan Buyer', templateCode: 'personal_info' }),
];
ok(!annotatePartyTaskProgress(otherTask)[0].partyProgress && staffTaskCounts(otherTask, TODAY).open === 1, 'a different task is not the same party task');

const cancelled = [
  copy('a', 'Client-Buyer', 'done', 'p-ann', 'Upload ID', { ownerName: 'Ann Buyer' }),
  copy('b', 'Client-Buyer', 'cancelled', 'p-jordan', 'Upload ID', { ownerName: 'Jordan Buyer' }),
];
ok(!annotatePartyTaskProgress(cancelled).find((t) => t.id === 'a').partyProgress && staffTaskCounts(cancelled, TODAY).open === 0, 'a cancelled second buyer does not keep the task open');

const agents = [
  copy('g1', 'Buyer Agent', 'done', 'p-blake', 'Commission', { ownerName: 'Blake Agent', templateCode: 'commissions' }),
  copy('g2', 'Buyer Agent', 'todo', 'p-pat', 'Commission', { ownerName: 'Pat Agent', templateCode: 'commissions' }),
];
ok(!annotatePartyTaskProgress(agents)[0].partyProgress && staffTaskCounts(agents, TODAY).open === 1, 'agent tasks stay one copy at a time');

const unnamed = annotatePartyTaskProgress([
  copy('a', 'Client-Buyer', 'done', 'p-ann', 'Upload ID', { ownerName: '' }),
  copy('b', 'Client-Buyer', 'todo', 'p-jordan', 'Upload ID', { ownerName: '' }),
]);
ok(unnamed[0].partyProgress.remainingLabel === '1 buyer still needs to finish', 'a missing name says how many buyers still need to finish');

const cell = partyTaskGridCell(partial, TODAY);
ok(cell.state === 'pending' && cell.label === '1 of 2 done' && cell.remainingLabel === 'Still needed: Jordan Buyer' && cell.done === 1 && cell.total === 2, 'the grid cell stays open and carries the progress');
ok(partyTaskGridCell(both, TODAY).state === 'done' && partyTaskGridCell(both, TODAY).label === '', 'the grid cell is done, with no progress line, once every buyer finishes');
ok(partyTaskGridCell(one, TODAY).state === 'done' && partyTaskGridCell(one, TODAY).label === '', 'one buyer still makes a completed grid cell');
ok(partyTaskGridCell(sellers, TODAY).state === 'overdue' && partyTaskGridCell(sellers, TODAY).label === '1 of 2 done', 'an unfinished seller past the due date keeps the cell overdue');

const deal = (id) => ({ id, fileNumber: 'MD-' + id, street: id + ' Street', city: 'Baltimore', state: 'MD', zip: '21201', closingDate: '2026-12-01', status: 'Open', transactionType: 'Purchase' });
const grid = buildTaskGrid([
  { ...partial[0] }, { ...partial[1] },
  { id: 'solo', dealId: 'd2', assignedRole: 'Client-Buyer', status: 'done', participantId: 'p-solo', ownerName: 'Solo Buyer', title: 'Upload ID', templateCode: 'id_upload', dueDate: '2026-11-01', completedAt: '2026-11-02T00:00:00Z' },
], [deal('d1'), deal('d2')], TODAY);
const multi = grid.rows.find((row) => row.title === 'Upload ID').cells.d1;
const solo = grid.rows.find((row) => row.title === 'Upload ID').cells.d2;
ok(multi.state === 'pending' && multi.label === '1 of 2 done', 'the task grid uses the shared helper for two buyers');
ok(solo.state === 'done' && !solo.label, 'the task grid leaves a one-buyer file as it is today');

const listed = partial.map((t) => ({ ...t, personName: t.ownerName, deal: { id: 'd1', fileNumber: 'MD-1', address: '1 Main', closingDate: '2026-12-01', status: 'Open' }, group: 'buyer' }));
const openList = filterTasks(annotatePartyTaskProgress(listed), { status: 'open', fileStatus: 'All' }, TODAY);
ok(openList.length === 2 && openList.some((t) => t.id === 'a'), 'the incomplete task list keeps the party task until every buyer finishes');
const doneList = filterTasks(annotatePartyTaskProgress(listed), { status: 'done', fileStatus: 'All' }, TODAY);
ok(doneList.length === 0, 'the completed task list does not show the task while someone is left');
ok(filterTasks(listed, { status: 'open', fileStatus: 'All' }, TODAY).every((t) => t.status !== 'done'), 'without the side progress, a finished copy still leaves the incomplete list');

const board = toText(boardResults(listed, { q: '', status: 'open', fileStatus: 'All', who: '', overdue: false, dueFrom: '', dueTo: '', closingFrom: '', closingTo: '', sort: 'dueDate', dir: 'asc', groupBy: 'none' }, TODAY));
ok(board.includes('1 of 2 done') && board.includes('Still needed: Jordan Buyer') && board.includes('data-party-open="1"'), 'the task list shows 1 of 2 done and who is left');

const doneBoard = toText(boardResults(both.map((t) => ({ ...t, personName: t.ownerName, deal: { id: 'd1', fileNumber: 'MD-1', address: '1 Main', closingDate: '2026-12-01', status: 'Open' } })), { q: '', status: 'open', fileStatus: 'All', who: '', overdue: false, dueFrom: '', dueTo: '', closingFrom: '', closingTo: '', sort: 'dueDate', dir: 'asc', groupBy: 'none' }, TODAY));
ok(doneBoard.includes('No tasks match') && !doneBoard.includes('1 of 2 done'), 'once every buyer finishes, the task leaves the incomplete list');

globalThis.location = { hash: '#/deals/d1/tasks', search: '', pathname: '/' };
const { render: renderTasks } = await import('../js/pages/dealtasks.js');
const fileDeal = {
  id: 'd1', transactionType: 'Purchase',
  participants: [
    { id: 'p-ann', role: 'Client-Buyer', contact: { firstName: 'Ann', lastName: 'Buyer' } },
    { id: 'p-jordan', role: 'Client-Buyer', contact: { firstName: 'Jordan', lastName: 'Buyer' } },
  ],
};
const fileTasks = [
  { id: 'a', title: 'Upload ID', status: 'done', assignedRole: 'Client-Buyer', kind: 'form', participantId: 'p-ann', ownerName: 'Ann Buyer', dueDate: '2099-01-01', canFill: true, templateVersion: 1, templateCode: 'id_upload', dealId: 'd1', mine: false },
  { id: 'b', title: 'Upload ID', status: 'todo', assignedRole: 'Client-Buyer', kind: 'form', participantId: 'p-jordan', ownerName: 'Jordan Buyer', dueDate: '2099-01-01', canFill: true, templateVersion: 1, templateCode: 'id_upload', dealId: 'd1', mine: false },
  { id: 'solo', title: 'Personal information', status: 'done', assignedRole: 'Client-Buyer', kind: 'form', participantId: 'p-ann', ownerName: 'Ann Buyer', dueDate: '2099-01-01', canFill: true, templateVersion: 1, templateCode: 'personal_info', dealId: 'd1', mine: false },
];
const api = { listTasks: async () => fileTasks, listAgreements: async () => ({ agreements: [] }) };
const proc = toText((await renderTasks({ api, user: { id: 'u-proc', role: 'Processor', roles: ['Processor'] }, deal: fileDeal, refresh() {} })).body);
ok(proc.includes('1 of 2 done') && proc.includes('Still needed: Jordan Buyer') && proc.includes('data-task-row="a"') && !proc.includes('data-task-row="a" class="is-done"') && proc.includes('data-task-tone="is-open"'), 'staff see the buyer task as still open, with who is left');
ok(proc.includes('data-task-row="solo"') && proc.includes('is-done') && !proc.includes('1 of 1 done'), 'a task only one buyer has stays done');

const buyerHtml = toText((await renderTasks({
  api: { ...api, listTasks: async () => fileTasks.map((t) => ({ ...t, mine: t.participantId === 'p-ann' })) },
  user: { id: 'u-buyer', role: 'Client-Buyer', roles: ['Client-Buyer'], accountRole: 'Outside user' },
  deal: fileDeal, refresh() {},
})).body);
ok(buyerHtml.includes('Upload ID') && buyerHtml.includes('data-task-tone="is-done"') && !buyerHtml.includes('1 of 2 done') && !buyerHtml.includes('Jordan Buyer'), 'a buyer still sees their own finished copy, not the other buyer');

globalThis.location = { hash: '#/task-grid' };
const { render: renderGrid } = await import('../js/pages/taskgrid.js');
const view = await renderGrid({ api: { async getTaskGrid() { return grid; } } });
const html = String(view.body);
const row = html.slice(html.indexOf('data-file="d1"'), html.indexOf('</tr>', html.indexOf('data-file="d1"')));
ok(row.includes('1 of 2 done') && row.includes('Still needed: Jordan Buyer') && row.includes('data-state="pending"'), 'the Task Grid shows 1 of 2 done and who is left');
const soloRow = html.slice(html.indexOf('data-file="d2"'), html.indexOf('</tr>', html.indexOf('data-file="d2"')));
ok(soloRow.includes('data-state="done"') && !soloRow.includes('1 of 1') && !soloRow.includes('of 2'), 'a one-buyer file on the grid does not show a progress line');

const sql = readFileSync(new URL('../supabase/migrations/20261124100000_party_task_completion.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../supabase/rollbacks/20261124100000_party_task_completion.sql', import.meta.url), 'utf8');
ok(sql.includes('Client-Buyer') && sql.includes('Client-Seller') && sql.includes('people >= 2') && sql.includes('security invoker'), 'the database count uses the same two-or-more rule and still respects row security');
ok(rollback.includes("t.status in ('todo', 'in_progress', 'blocked')") && !rollback.includes('people >= 2'), 'the rollback puts the previous per-task count back');

console.log(fail ? fail + ' failed' : 'party task completion passed');
process.exit(fail ? 1 : 0);
