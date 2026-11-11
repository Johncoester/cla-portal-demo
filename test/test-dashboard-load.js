/* Dashboard loading. Open files, narrow columns, concurrent reads. Fake client only. */
import { fetchDashboard, dashboardDealFilter, DASHBOARD_DEAL_COLUMNS, DASHBOARD_TASK_COLUMNS, OPEN_TASK_STATUSES } from '../js/data/dashboard-load.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { render } from '../js/pages/dashboard.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

ok(dashboardDealFilter('open').value === 'Open' && dashboardDealFilter('other').value === 'Open' && dashboardDealFilter('other').op === 'neq', 'open files are status Open; everything else is the Show more set');
ok(!DASHBOARD_DEAL_COLUMNS.split(',').includes('*') && !DASHBOARD_DEAL_COLUMNS.includes('notes') && !DASHBOARD_DEAL_COLUMNS.includes('financial') && DASHBOARD_DEAL_COLUMNS.includes('file_number') && DASHBOARD_DEAL_COLUMNS.includes('closing_date') && DASHBOARD_DEAL_COLUMNS.includes('processor_id'), 'the deal query names the columns the dashboard renders');
ok(DASHBOARD_TASK_COLUMNS.includes('title') && DASHBOARD_TASK_COLUMNS.includes('due_date') && DASHBOARD_TASK_COLUMNS.includes('deals!inner') && !DASHBOARD_TASK_COLUMNS.includes('form_data'), 'the task query names list columns and not form answers');
ok(OPEN_TASK_STATUSES.join() === 'todo,in_progress,blocked', 'the first task read is the incomplete set');

function fakeSb() {
  const calls = [];
  const from = (table) => {
    const state = { table, select: '', filters: [], head: false, range: null, started: 0 };
    calls.push(state);
    const run = () => { state.started = Date.now(); return wait(40).then(() => ({ data: [], count: 0, error: null })); };
    const b = {
      select(cols, opts = {}) { state.select = cols; state.head = !!opts.head; return b; },
      eq(k, v) { state.filters.push(['eq', k, v]); return b; },
      neq(k, v) { state.filters.push(['neq', k, v]); return b; },
      in(k, v) { state.filters.push(['in', k, v]); return b; },
      order() { return b; },
      range(a, c) { state.range = [a, c]; return run(); },
      then(res, rej) { return run().then(res, rej); },
    };
    return b;
  };
  return { calls, from, rpc() { const state = { table: 'rpc', select: '', filters: [], started: 0 }; calls.push(state); const run = () => { state.started = Date.now(); return wait(40).then(() => ({ data: [], error: null })); }; return { then: (res, rej) => run().then(res, rej) }; } };
}

const sb = fakeSb();
const t0 = Date.now();
const loaded = await fetchDashboard(sb);
const elapsed = Date.now() - t0;
const dealCalls = sb.calls.filter((c) => c.table === 'deals');
const taskCalls = sb.calls.filter((c) => c.table === 'tasks');
ok(sb.calls.length === 7 && dealCalls.length === 3 && taskCalls.length === 1 && sb.calls.filter((c) => c.table === 'rpc').length === 2, 'one open page, one other count, one closed count, titles, roles, processor names, and one task read');
ok(dealCalls.every((c) => c.select !== '*' && !String(c.select).includes('*')) && dealCalls[0].select === DASHBOARD_DEAL_COLUMNS, 'deal reads use the narrow column list');
ok(dealCalls[0].filters.some((f) => f[0] === 'eq' && f[1] === 'status' && f[2] === 'Open') && !dealCalls[0].filters.some((f) => f[2] === 'All'), 'the file read is open files only');
ok(taskCalls[0].filters.some((f) => f[0] === 'eq' && f[1] === 'deals.status' && f[2] === 'Open') && taskCalls[0].filters.some((f) => f[0] === 'in' && f[1] === 'status'), 'tasks are the incomplete ones on open files');
ok(Array.isArray(dealCalls[0].range) && elapsed < 40 * sb.calls.length / 2, 'the independent reads run together');
ok(loaded.openTotal === 0 && loaded.closedTotal === 0, 'empty counts stay zero');

const roles = ['Processor', 'Sales Person', 'Transaction Coordinator', 'Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'];
for (const role of roles) {
  const starts = [];
  const api = {
    async loadDashboard() { starts.push(['files', Date.now()]); await wait(30); return { openRows: [{ id: 'o', status: 'Open', fileNumber: 'MD-1', address: '1 Main', stageName: 'Opened', stage: 0, openTasks: 0, closingDate: null, processorName: 'Pat' }], openTotal: 1, otherRows: [], otherTotal: 0, closedTotal: 2, tasks: [{ id: 't', status: 'todo', deal: { id: 'o', status: 'Open', fileNumber: 'MD-1', address: '1 Main' }, dealId: 'o', title: 'ID', assignedRole: role === 'Client-Buyer' ? 'Client-Buyer' : 'Processor', mine: true }], taskTotal: 1 }; },
    async unreadCount() { starts.push(['unread', Date.now()]); await wait(30); return 1; },
    async adminListUsers() { starts.push(['users', Date.now()]); await wait(30); return []; },
    async listTeams() { starts.push(['teams', Date.now()]); await wait(30); return []; },
    async listActivity() { starts.push(['log', Date.now()]); await wait(30); return { items: [] }; },
    async queueOverdueReminders() { return { queued: 0 }; },
  };
  const user = { id: 'u', role, isAdmin: role === 'Processor' ? false : false, firstName: 'A', lastName: 'B' };
  if (role === 'Processor') user.role = 'Processor';
  const t = Date.now();
  const view = await render({ api, user });
  ok(Date.now() - t < 80, role + ' dashboard requests overlap');
  ok(!starts.some((s) => s[0] === 'all-deals' || s[0] === 'all-tasks'), role + ' does not ask for every deal and every task');
  const text = String(view.body);
  ok(text.includes('data-show-more-open') === false && text.includes('MD-1'), role + ' shows the open file that was returned');
}

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-buyer');
const buyer = await api.loadDashboard();
ok(buyer.openRows.every((d) => d.status === 'Open') && buyer.openRows.some((d) => d.id === 'deal-1') && !buyer.openRows.some((d) => d.status === 'Closed' || d.status === 'Cancelled'), 'a buyer dashboard is open files only, still only files they can see');
await api.signInDev('u-seller');
const seller = await api.loadDashboard();
ok(seller.openRows.every((d) => d.status === 'Open'), 'a seller dashboard is open files only');
await api.signInDev('u-proc');
const proc = await api.loadDashboard();
const all = await api.listDeals({ status: 'All' });
ok(proc.openTotal === all.filter((d) => d.status === 'Open').length && proc.openRows.every((d) => d.status === 'Open') && proc.closedTotal === all.filter((d) => d.status === 'Closed').length, 'a processor gets the same open files as before, without the closed rows');
ok(proc.tasks.every((t) => t.deal.status === 'Open' && ['todo', 'in_progress', 'blocked'].includes(t.status)), 'a processor task read stays on incomplete tasks of open files');

console.log(fail ? fail + ' failed' : 'dashboard load passed');
if (fail) process.exit(1);
