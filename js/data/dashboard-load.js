/* Dashboard reads. Open files only (status Open, the same set the dashboard already calls open).
 * Narrow columns, a page size, and the other statuses only when Show more asks for them.
 * The deals and tasks selects still go through row security; this does not add a role filter of its own. */
import { STAGES } from './constants.js?v=202611101015';
import { PROCESSOR_PICK_ROLES } from './place-order.js?v=202611191500';
import { nameOfProfile, processorFields } from './processor-assign.js?v=202611091600';

export const DASHBOARD_PAGE = 40;
export const DASHBOARD_TASK_PAGE = 200;
export const OPEN_STATUS = 'Open';
export const OTHER_STATUSES = ['Closed', 'On Hold', 'Cancelled'];
export const OPEN_TASK_STATUSES = ['todo', 'in_progress', 'blocked'];

export const DASHBOARD_DEAL_COLUMNS = 'id,file_number,status,street,city,state,zip,stage,closing_date,open_date,transaction_type,purchase_price,loan_amount,lender_name,lender_contact,lender_email,processor_id';
export const DASHBOARD_TASK_COLUMNS = 'id,deal_id,title,status,due_date,kind,assigned_role,completed_at,participant_id,owner_profile_id,template_id,template_code,deals!inner(id,file_number,status,street,city,state,zip,closing_date)';

const camel = (o) => Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o;

export function dashboardDealFilter(scope) {
  if (scope === 'open') return { op: 'eq', column: 'status', value: OPEN_STATUS };
  if (scope === 'other') return { op: 'neq', column: 'status', value: OPEN_STATUS };
  throw new Error('Dashboard files are open, or the other statuses behind Show more.');
}

export function shapeDashboardDeal(row, extra = {}) {
  const d = camel(row) || {};
  const stage = Number(d.stage) || 0;
  const address = [d.street, d.city, d.state, d.zip].filter(Boolean).join(', ');
  const named = processorFields({ processorId: d.processorId || null }, extra.names || new Map());
  return {
    id: d.id, fileNumber: d.fileNumber || '', status: d.status || '', street: d.street || '', city: d.city || '', state: d.state || '', zip: d.zip || '',
    address, stage, stageName: STAGES[stage] || '', closingDate: d.closingDate || null, openDate: d.openDate || null,
    transactionType: d.transactionType || '', purchasePrice: d.purchasePrice == null ? null : Number(d.purchasePrice), loanAmount: d.loanAmount == null ? null : Number(d.loanAmount),
    lenderName: d.lenderName || '', lenderContact: d.lenderContact || '', lenderEmail: d.lenderEmail || '', processorId: d.processorId || null,
    processorName: named.processorName, processorUnassigned: named.processorUnassigned,
    fileTitle: extra.fileTitle || '', myRole: extra.myRole || null, myRoles: extra.myRoles || [], myRoleLabel: extra.myRoleLabel || '', selfRep: !!extra.selfRep,
    openTasks: extra.openTasks || 0, unread: extra.unread || 0, overdueTasks: extra.overdueTasks || 0,
  };
}

export function shapeDashboardTask(row) {
  const raw = row || {};
  const deal = raw.deals || raw.deal || {};
  const d = camel(deal) || {};
  const t = camel({ ...raw, deals: undefined }) || {};
  delete t.deals;
  const address = [d.street, d.city, d.state, d.zip].filter(Boolean).join(', ');
  return {
    ...t,
    dealId: t.dealId || d.id,
    deal: { id: d.id, fileNumber: d.fileNumber || '', street: d.street || '', city: d.city || '', state: d.state || '', zip: d.zip || '', address, closingDate: d.closingDate || null, status: d.status || '' },
  };
}

function rangeEnd(offset, limit) { return offset + limit - 1; }

function openDeals(sb, offset, limit) {
  return sb.from('deals').select(DASHBOARD_DEAL_COLUMNS, { count: 'exact' }).eq('status', OPEN_STATUS).order('open_date', { ascending: false }).order('file_number', { ascending: false }).range(offset, rangeEnd(offset, limit));
}
function otherCount(sb) {
  return sb.from('deals').select('id', { count: 'exact', head: true }).neq('status', OPEN_STATUS);
}
function otherDeals(sb, offset, limit) {
  return sb.from('deals').select(DASHBOARD_DEAL_COLUMNS, { count: 'exact' }).neq('status', OPEN_STATUS).order('open_date', { ascending: false }).order('file_number', { ascending: false }).range(offset, rangeEnd(offset, limit));
}
function taskQuery(sb, { fileStatus, taskStatus, offset, limit }) {
  let q = sb.from('tasks').select(DASHBOARD_TASK_COLUMNS, { count: 'exact' });
  if (fileStatus && fileStatus !== 'All') q = q.eq('deals.status', fileStatus);
  if (taskStatus === 'open') q = q.in('status', OPEN_TASK_STATUSES);
  else if (taskStatus && taskStatus !== 'all') q = q.eq('status', taskStatus);
  return q.order('due_date', { ascending: true }).range(offset, rangeEnd(offset, limit));
}

export async function fetchDashboard(sb, { openOffset = 0, openLimit = DASHBOARD_PAGE, taskOffset = 0, taskLimit = DASHBOARD_TASK_PAGE, fileStatus = 'Open', taskStatus = 'open', includeTasks = true, includeOther = false, otherOffset = 0 } = {}) {
  const jobs = [
    openDeals(sb, openOffset, openLimit),
    otherCount(sb),
    sb.from('deals').select('id', { count: 'exact', head: true }).eq('status', 'Closed'),
    sb.rpc('deal_file_titles', {}),
    sb.rpc('my_file_roles_full'),
    sb.from('profiles').select('id, first_name, last_name').in('role', PROCESSOR_PICK_ROLES),
  ];
  if (includeTasks) jobs.push(taskQuery(sb, { fileStatus, taskStatus, offset: taskOffset, limit: taskLimit }));
  if (includeOther) jobs.push(otherDeals(sb, otherOffset, openLimit));
  const results = await Promise.all(jobs);
  const failed = results.find((r) => r && r.error);
  if (failed) throw new Error(failed.error.message || 'The dashboard could not be loaded.');
  const open = results[0];
  const other = results[1];
  const closed = results[2];
  let cursor = 6;
  const tasks = includeTasks ? results[cursor++] : { data: [], count: 0 };
  const more = includeOther ? results[cursor++] : null;
  const openRows = open.data || [];
  const otherRows = more ? (more.data || []) : [];
  const ids = [...new Set([...openRows, ...otherRows].map((r) => r.id || r.deal_id).filter(Boolean))];
  let countRows = [];
  if (ids.length) {
    const counted = await sb.rpc('dashboard_file_task_counts', { p_deal_ids: ids.slice(0, 100) });
    if (counted && counted.error) throw new Error(counted.error.message || 'The dashboard could not load file task counts.');
    countRows = (counted && counted.data) || [];
  }
  return {
    openRows, openTotal: open.count || 0,
    otherTotal: other.count || 0, closedTotal: closed.count || 0,
    otherRows,
    taskRows: tasks.data || [], taskTotal: tasks.count || 0,
    titles: results[3].data || [], roles: results[4].data || [], processors: results[5].data || [],
    countRows,
  };
}

export function indexDashboardExtras(raw) {
  const titles = new Map((raw.titles || []).map((r) => [r.deal_id || r.dealId, r.file_title || r.fileTitle || '']));
  const roles = new Map((raw.roles || []).map((r) => [r.deal_id || r.dealId, r]));
  const names = new Map((raw.processors || []).map((p) => [p.id, nameOfProfile(p)]));
  const counts = new Map((raw.countRows || []).map((r) => [r.deal_id || r.dealId, r]));
  return { titles, roles, names, counts };
}

export function decorateDashboardDeals(rows, extra, _taskRows = []) {
  // Per-file open / overdue counts come from dashboard_file_task_counts for the files shown, not from the 200-task page.
  return rows.map((row) => {
    const id = row.id || row.deal_id;
    const role = (extra.roles && extra.roles.get(id)) || {};
    const c = (extra.counts && extra.counts.get(id)) || {};
    const openTasks = c.open_tasks != null ? c.open_tasks : (c.openTasks || 0);
    const overdueTasks = c.overdue_tasks != null ? c.overdue_tasks : (c.overdueTasks || 0);
    return shapeDashboardDeal(row, {
      names: extra.names, fileTitle: (extra.titles && extra.titles.get(id)) || '',
      myRole: role.role || null, myRoles: role.roles || [], myRoleLabel: role.label || '', selfRep: !!role.self_rep || !!role.selfRep,
      openTasks, overdueTasks,
    });
  });
}

export function workQueueFrom({ open, openTotal, otherTotal, tasks, unread, today, soon }) {
  const openTask = (t) => ['todo', 'in_progress', 'blocked'].includes(t.status);
  const clientWait = (t) => ['todo', 'in_progress'].includes(t.status) && /^Client/.test(t.assignedRole || '');
  const list = tasks.filter(openTask);
  const attention = open.map((q) => ({
    deal: q,
    overdue: list.filter((t) => (t.dealId || (t.deal && t.deal.id)) === q.id && t.dueDate && t.dueDate < today).length,
    blocked: list.filter((t) => (t.dealId || (t.deal && t.deal.id)) === q.id && t.status === 'blocked').length,
    waitingOnClients: list.filter((t) => (t.dealId || (t.deal && t.deal.id)) === q.id && clientWait(t)).length,
  })).filter((r) => r.overdue || r.blocked || r.waitingOnClients);
  return {
    assigned: openTotal, totalAssigned: openTotal + otherTotal, blockedOnClients: list.filter(clientWait).length,
    overdueTasks: list.filter((t) => t.dueDate && t.dueDate < today).length,
    closingSoon: open.filter((q) => q.closingDate && q.closingDate >= today && q.closingDate <= soon).sort((a, b) => a.closingDate.localeCompare(b.closingDate)),
    needsAttention: attention, unreadMessages: unread || 0,
  };
}
