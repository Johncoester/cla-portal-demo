/* task-board.js (Matt, Nov 2): pure helpers shared by the screens, both adapters and the tests. No data access here:
 * the adapters decide WHAT a person may see (mock rules / RLS); these only filter, sort, group and lay out what came back.
 *   filterTasks / sortTasks / groupTasks : the cross-file task list (Tasks page, Work Queue "incomplete tasks by Buyer / Seller / Agent")
 *   filterDeals / sortDeals              : the order list (Open Orders) filters + sort
 *   buildTaskGrid                        : Processor / Admin grid, file numbers across (columns), tasks down (rows) */
import { isAgent } from './constants.js?v=202611060249';

export const OPEN_STATUSES = ['todo', 'in_progress', 'blocked'];
export const isOpenTask = (t) => OPEN_STATUSES.includes(t.status);
export const isOverdue = (t, today) => isOpenTask(t) && !!t.dueDate && t.dueDate < today;
// Buyer = Client-Buyer copies/tasks, Seller = Client-Seller, Agent = Buyer Agent + Listing Agent, Staff = CLA roles (Processor, TC, sales)
export const TASK_GROUPS = [['buyer', 'Buyer'], ['seller', 'Seller'], ['agent', 'Agent (buyer agent / listing agent)'], ['staff', 'CLA staff (Processor / coordinator)']];
export const groupOfRole = (role) => (role === 'Client-Buyer' ? 'buyer' : role === 'Client-Seller' ? 'seller' : isAgent(role) ? 'agent' : 'staff');
const ROLE_SHORT = { 'Client-Buyer': 'Buyer', 'Client-Seller': 'Seller', 'Buyer Agent': "Buyer's agent", 'Listing Agent': 'Listing agent' };
export const roleShort = (role) => ROLE_SHORT[role] || role;
const STATUS_ORDER = { blocked: 0, todo: 1, in_progress: 2, done: 3, cancelled: 4 };
const lc = (v) => String(v == null ? '' : v).toLowerCase();
// file number sorts by its number part (MD-26-97183 < MD-26-97201), then text
const fileKey = (n) => { const m = /(\d+)\D*$/.exec(String(n || '')); return m ? m[1].padStart(10, '0') : lc(n); };

// What one task row needs from its file (both adapters attach t.deal = { id, fileNumber, street, city, state, zip, address, closingDate, status }).
export const taskSearchText = (t) => lc([t.title, t.ownerName, t.assignedRole, t.deal && t.deal.fileNumber, t.deal && t.deal.address, t.deal && t.deal.street, t.deal && t.deal.city].join(' '));

/* Task filters. f = { status: 'open' (default: incomplete) | 'done' | 'all' | a task status, fileStatus: 'Open' (default) | 'All' | a deal status,
 *   group: '' | 'buyer' | 'seller' | 'agent' | 'staff', role: '' | an assigned role, overdue: bool, dueFrom, dueTo, closingFrom, closingTo (YYYY-MM-DD), q: text } */
export function filterTasks(tasks, f = {}, today) {
  const st = f.status || 'open'; const fs = f.fileStatus || 'Open'; const q = lc(f.q).trim();
  return tasks.filter((t) => {
    if (st === 'open' ? !isOpenTask(t) : st === 'done' ? t.status !== 'done' : st !== 'all' && t.status !== st) return false;
    if (fs !== 'All' && t.deal && t.deal.status !== fs) return false;
    if (f.group && groupOfRole(t.assignedRole) !== f.group) return false;
    if (f.role && t.assignedRole !== f.role) return false;
    if (f.overdue && !isOverdue(t, today)) return false;
    if (f.dueFrom && !(t.dueDate && t.dueDate >= f.dueFrom)) return false;
    if (f.dueTo && !(t.dueDate && t.dueDate <= f.dueTo)) return false;
    const cd = t.deal && t.deal.closingDate;
    if (f.closingFrom && !(cd && cd >= f.closingFrom)) return false;
    if (f.closingTo && !(cd && cd <= f.closingTo)) return false;
    if (q && !taskSearchText(t).includes(q)) return false;
    return true;
  });
}
export const TASK_SORTS = [['dueDate', 'Due date'], ['fileNumber', 'File number'], ['address', 'Property address'], ['closingDate', 'Closing date'], ['status', 'Status'], ['title', 'Task']];
// Missing dates always sort last, in either direction. Ties fall back to due date, then file number, then title.
export function sortTasks(tasks, key = 'dueDate', dir = 'asc') {
  const s = dir === 'desc' ? -1 : 1;
  const get = (t, k) => ({ dueDate: t.dueDate, closingDate: t.deal && t.deal.closingDate, fileNumber: fileKey(t.deal && t.deal.fileNumber), address: lc(t.deal && (t.deal.address || t.deal.street)),
    status: String(STATUS_ORDER[t.status] ?? 9), title: lc(t.title) }[k]);
  const cmp = (a, b, k) => { const x = get(a, k); const y = get(b, k); if (!x && !y) return 0; if (!x) return 1; if (!y) return -1; return x < y ? -1 : x > y ? 1 : 0; };
  const missingLast = (a, b) => { const x = get(a, key); const y = get(b, key); if (!x && !y) return 0; if (!x) return 1; if (!y) return -1; return cmp(a, b, key) * s; };
  return [...tasks].sort((a, b) => missingLast(a, b) || cmp(a, b, 'dueDate') || cmp(a, b, 'fileNumber') || cmp(a, b, 'title'));
}
// File Tasks tab (John, Nov 4): one box per side. Same side logic as the Tasks page (groupOfRole on the task's typed assigned_role field),
// with the agent group split by WHICH agent (Buyer Agent vs Listing Agent). Every task lands in exactly one box (Other = CLA staff, lender, anything else).
export const FILE_TASK_BOXES = [['buyer', 'Buyer tasks'], ['seller', 'Seller tasks'], ['buyer-agent', "Buyer's Agent tasks"], ['listing-agent', "Listing (Seller's) Agent tasks"], ['other', 'Other / File tasks']];
export const boxOfRole = (role) => { const g = groupOfRole(role); return g === 'agent' ? (role === 'Buyer Agent' ? 'buyer-agent' : 'listing-agent') : g === 'staff' ? 'other' : g; };
export const boxTasks = (tasks) => FILE_TASK_BOXES.map(([key, label]) => ({ key, label, tasks: tasks.filter((t) => boxOfRole(t.assignedRole) === key) }));
// [{ key, label, tasks }] in Buyer, Seller, Agent, Staff order; empty groups kept (so the screen can say "none")
export const groupTasks = (tasks, groups = TASK_GROUPS) => groups.map(([key, label]) => ({ key, label, tasks: tasks.filter((t) => groupOfRole(t.assignedRole) === key) }));

/* Order-list filters (the status tab is applied by listDeals). f = { closingFrom, closingTo, noClosing: bool, role: '' | a role on the file
 *   (outside users: their role there; staff: 'agent-party' = an agent is a party), overdue: bool (has overdue tasks), txType, q } */
export const dealSearchText = (d) => lc([d.fileNumber, d.address, d.street, d.city, d.zip, d.county || '', d.fileTitle || '', d.transactionType, ...(d.partyNames || []), ...(d.salesPeople || []).map((s) => s.name)].join(' '));
export function filterDeals(deals, f = {}) {
  const q = lc(f.q).trim();
  return deals.filter((d) => {
    if (f.closingFrom && !(d.closingDate && d.closingDate >= f.closingFrom)) return false;
    if (f.closingTo && !(d.closingDate && d.closingDate <= f.closingTo)) return false;
    if (f.noClosing && d.closingDate) return false;
    if (f.role === 'agent-party' ? !(d.agentParties && d.agentParties.length) : f.role && !(d.myRoles || [d.myRole]).includes(f.role)) return false;
    if (f.overdue && !(d.overdueTasks > 0)) return false;
    if (f.txType && d.transactionType !== f.txType) return false;
    if (q && !dealSearchText(d).includes(q)) return false;
    return true;
  });
}
// Matt, Nov 3: every Open Orders column header sorts (click = up / down arrows). role = your role on the file (outside users), tasks = Task Pending
// (action required for you, then overdue, then open tasks), txType = transaction type. DEAL_SORT_DIR = the direction a first click uses.
export const DEAL_SORTS = [['openDate', 'Open date'], ['fileNumber', 'File number'], ['address', 'Property address'], ['closingDate', 'Closing date'], ['status', 'Status / stage'],
  ['role', 'Your role'], ['tasks', 'Task pending'], ['txType', 'Transaction type']];
export const DEAL_SORT_DIR = { openDate: 'desc', tasks: 'desc' };
const pad = (n) => String(1e6 + (Number(n) || 0));
const DEAL_STATUS_ORDER = { Open: 0, 'On Hold': 1, Closed: 2, Cancelled: 3 };
export function sortDeals(deals, key = 'openDate', dir) {
  const s = (dir || DEAL_SORT_DIR[key] || 'asc') === 'desc' ? -1 : 1;
  const val = (d) => ({ openDate: d.openDate, closingDate: d.closingDate, fileNumber: fileKey(d.fileNumber), address: lc(d.address || d.street),
    status: `${DEAL_STATUS_ORDER[d.status] ?? 9}-${String(d.stage ?? 0).padStart(2, '0')}`,
    role: lc(d.selfRep ? d.myRoleLabel : roleShort(d.myRole)), tasks: `${d.myOpenTasks ? 1 : 0}-${pad(d.overdueTasks)}-${pad(d.openTasks)}`, txType: lc(d.transactionType) }[key]);
  const cmp = (a, b) => { const x = val(a); const y = val(b); if (!x && !y) return 0; if (!x) return 1; if (!y) return -1; return (x < y ? -1 : x > y ? 1 : 0) * s; };
  return [...deals].sort((a, b) => cmp(a, b) || fileKey(a.fileNumber).localeCompare(fileKey(b.fileNumber)) * s);
}

/* PROCESSOR TASK GRID: columns = files, rows = the agent / buyer / seller tasks (one row per template + role, or per role + title for a one-off task).
 * Cell state per file: 'done' (every live copy complete; date = last completion), 'overdue' (an incomplete copy is past its due date),
 * 'pending' (not complete, not yet due or no due date), 'na' (that task is not on that file, or only cancelled copies). CLA staff tasks are left out. */
export const GRID_ROLES = ['Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent'];
const rowKey = (t) => `${t.assignedRole}|${t.templateCode ? 'tpl:' + t.templateCode : 'task:' + lc(t.title).trim()}`;
const dayOf = (iso) => { if (!iso) return ''; const s = String(iso); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const d = new Date(s); if (isNaN(d)) return s.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function buildTaskGrid(tasks, deals, today) {
  const columns = sortDeals(deals, 'fileNumber', 'asc').map((d) => ({ id: d.id, fileNumber: d.fileNumber, address: d.address || `${d.street}, ${d.city}`, street: d.street, closingDate: d.closingDate || null, status: d.status, transactionType: d.transactionType || 'Purchase' }));
  const ids = new Set(columns.map((c) => c.id)); const rows = new Map();
  tasks.filter((t) => GRID_ROLES.includes(t.assignedRole) && ids.has(t.dealId)).forEach((t) => { const k = rowKey(t);
    if (!rows.has(k)) rows.set(k, { key: k, title: t.title, role: t.assignedRole, roleLabel: roleShort(t.assignedRole), group: groupOfRole(t.assignedRole), byDeal: {} });
    (rows.get(k).byDeal[t.dealId] ||= []).push(t); });
  const order = { buyer: 0, seller: 1, agent: 2 };
  const out = [...rows.values()].sort((a, b) => order[a.group] - order[b.group] || GRID_ROLES.indexOf(a.role) - GRID_ROLES.indexOf(b.role) || lc(a.title).localeCompare(lc(b.title))).map((r) => ({
    key: r.key, title: r.title, role: r.role, roleLabel: r.roleLabel, group: r.group, label: `${r.roleLabel}: ${r.title}`,
    cells: Object.fromEntries(columns.map((c) => { const live = (r.byDeal[c.id] || []).filter((t) => t.status !== 'cancelled');
      if (!live.length) return [c.id, { state: 'na', total: 0, done: 0 }];
      const done = live.filter((t) => t.status === 'done'); const base = { total: live.length, done: done.length, taskIds: live.map((t) => t.id),
        dueDate: live.filter(isOpenTask).map((t) => t.dueDate).filter(Boolean).sort()[0] || null };
      if (done.length === live.length) return [c.id, { ...base, state: 'done', date: done.map((t) => dayOf(t.completedAt)).filter(Boolean).sort().pop() || null }];
      if (live.some((t) => isOverdue(t, today))) return [c.id, { ...base, state: 'overdue' }];
      return [c.id, { ...base, state: 'pending' }]; })) }));
  const count = (s) => out.reduce((n, r) => n + Object.values(r.cells).filter((c) => c.state === s).length, 0);
  return { columns, rows: out, today, totals: { done: count('done'), overdue: count('overdue'), pending: count('pending'), na: count('na') } };
}
