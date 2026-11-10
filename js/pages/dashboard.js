// Role dashboards: Processor = Work Queue; Sales Person / Sales Team = Team Dashboard (view-only);
// Transaction Coordinator = Dashboard; Buyer/Listing Agent = Transactions; clients = My Closing.
import { html, fmtDate, fmtDateTime, fmtMoney, pill, raw, $, guard, toast } from '../ui.js?v=202611070139';
import { runsOrders, STAGES, isProcessor, isClient, isAgent, isOutside, localDate } from '../data/constants.js?v=202611101015';
import { boardForm, boardResults, mountBoard, BOARD_DEFAULTS } from './taskboard.js?v=202611122000';
import { themeOn } from '../theme.js?v=202611070139';
import { mapLimit } from '../data/read-batch.js?v=202611111200';
import { pendingMine } from '../data/task-actions.js?v=202611120100';
import { unassignedOpen } from '../data/processor-assign.js?v=202611091600';

const dealLink = (d, tab = '') => html`<a href="#/deals/${d.id}/${tab}">${d.fileNumber}</a>${d.fileTitle ? html` <span class="muted small" data-file-title>${d.fileTitle}</span>` : ''}`;
// CARD THEME (default look): a tile that repeats one of the four dashboard cards (open orders = "in Pipeline" count, overdue tasks) is not drawn;
// the tiles with figures the cards do not show stay. With ?theme=default every tile is drawn as before.
const stat = (label, value, sub, cls = '', dup = false) => (dup && themeOn() ? '' : html`<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value ${cls}">${value}</div><div class="stat-sub">${sub}</div></div>`);
const bar = (d) => html`<div class="progress" title="${d.stageName}"><div style="width:${Math.round(((d.stage + 1) / STAGES.length) * 100)}%"></div></div>`;

// John, Nov 9: open files with no Processor (the AI opener left it blank, or the Processor is out). Assign one from Edit order details on the file.
const UNASSIGNED_LINK = '#/orders?s=Open&p=unassigned';
const unassignedCard = (open) => { const list = unassignedOpen(open);
  return html`<div class="card" data-unassigned-files><h3>Unassigned files <span class="pill ${list.length ? 'warn' : 'ok'}" data-unassigned-count>${list.length}</span></h3>
    ${list.length ? html`<p class="muted small">Open files with no Processor. Open one and use Edit order details to assign a Processor; they get an in-app notification.</p><ul class="plain">${list.slice(0, 8).map((d) => html`<li>${dealLink(d)} <span class="pill warn">Unassigned</span> <span class="muted">${d.address}</span></li>`)}</ul>${list.length > 8 ? html`<p class="muted small">and ${list.length - 8} more</p>` : ''}<a class="ghost" href="${UNASSIGNED_LINK}">See all unassigned in Orders</a>` : html`<p class="muted">Every open file has a Processor.</p>`}</div>`; };

export async function render(ctx) {
  const { api, user } = ctx;
  const deals = await api.listDeals({ status: 'All' });
  const needsTasks = !(user.isAdmin || runsOrders(user));
  // speed (Nov 9): the Supabase adapter reads every file's tasks in one go (listTasksForDeals); the mock keeps one listTasks per file
  const withDeal = (d, ts) => (ts || []).map((t) => ({ ...t, deal: d }));
  const lists = !needsTasks ? [] : api.listTasksForDeals
    ? await api.listTasksForDeals(deals.map((d) => d.id)).then((byDeal) => deals.map((d) => withDeal(d, byDeal.get(d.id))))
    : await mapLimit(deals, 4, (d) => api.listTasks(d.id).then((ts) => withDeal(d, ts)));
  const all = lists.flat();
  const open = deals.filter((d) => d.status === 'Open'); const today = localDate();
  const pick = user.isAdmin ? admin : runsOrders(user) ? processor : user.role === 'Transaction Coordinator' ? coordinator : isAgent(user.role) ? agent : isClient(user.role) ? client : isOutside(user.role) ? outside : team;
  const v = await pick({ ...ctx, deals, open, all, today });
  // CARD THEME MOCKUP (opt-in): four clickable summary cards above the CLA team dashboards (computed from the orders this person can see)
  const tc = themeOn() && (user.isAdmin || runsOrders(user) || ['Sales Person', 'Sales Team', 'Transaction Coordinator'].includes(user.role));
  const top = tc ? (await import('./theme-cards.js?v=202611101015')).dashCards(deals) : '';
  return { title: v.title, crumbs: [[v.title]], body: tc ? html`${top}${v.body}` : v.body, mount: v.mount };
}

async function processor({ api, open, deals, today }) {
  const wq = await api.getWorkQueue({ deals });
  const tasks = await api.listAllTasks({ fileStatus: 'All' });   // Matt, Nov 2: default view = incomplete tasks grouped by Buyer / Seller / Agent
  const rows = wq.needsAttention.map((r) => html`<tr><td>${dealLink(r.deal)} &middot; ${r.deal.stageName}</td><td>${r.deal.address}</td>
    <td>${r.overdue ? pill(r.overdue + ' overdue', 'bad') : ''} ${r.blocked ? pill(r.blocked + ' blocked', 'warn') : ''} ${r.waitingOnClients ? pill(r.waitingOnClients + ' waiting on clients', 'info') : ''}</td>
    <td><a class="ghost" href="#/deals/${r.deal.id}/tasks">Tasks</a></td></tr>`);
  const soon = wq.closingSoon.map((d) => html`<li>${dealLink(d)} <span class="muted">${d.address}</span><br><strong>${fmtDate(d.closingDate)}</strong></li>`);
  return { title: 'Work queue', body: html`
    <div class="page-head"><div><div class="eyebrow">PROCESSOR</div><h2 class="page-title">Work queue</h2><div class="muted">${wq.assigned} open &middot; ${wq.totalAssigned} total assigned</div></div>
      <div><button class="ghost" id="remind">Queue reminders for overdue tasks</button> <a class="ghost" href="#/outbox">Outbox</a> <a class="m-btn" href="#/orders/new">+ New order</a></div></div>
    <div class="stat-row">${stat('Open orders', wq.assigned, wq.totalAssigned + ' total', '', true)}${stat('Waiting on clients', wq.blockedOnClients, 'client tasks open', 'warn')}
      ${stat('Overdue tasks', wq.overdueTasks, 'past due date', wq.overdueTasks ? 'bad' : '', true)}${stat('Unread messages', wq.unreadMessages, 'across open orders')}${stat('Unassigned', unassignedOpen(open).length, html`<a href="${UNASSIGNED_LINK}">open files with no Processor</a>`, unassignedOpen(open).length ? 'warn' : '')}</div>
    ${unassignedCard(open)}
    <div class="two-col"><div class="card"><h3>Needs attention</h3>
      ${rows.length ? html`<table class="tbl"><thead><tr><th>Order</th><th>Property</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : html`<p class="muted">Nothing needs attention.</p>`}</div>
      <div class="card"><h3>Closing in the next 3 weeks</h3>${soon.length ? html`<ul class="plain">${soon}</ul>` : html`<p class="muted">No closings scheduled soon.</p>`}</div></div>
    <div class="card" data-wq-tasks><h3>Incomplete tasks by Buyer, Seller and Agent</h3><p class="muted small">Every incomplete task on open files. Filter, sort or regroup below; <a href="#/tasks">All Tasks</a> has the same list on its own page.</p>
      ${boardForm(BOARD_DEFAULTS, 'wqboard')}<div data-board-results>${boardResults(tasks, BOARD_DEFAULTS, today)}</div></div>`,
    mount(root) { $('#remind', root).addEventListener('click', guard(async () => { const r = await api.queueOverdueReminders(); toast(`${r.queued} reminder(s) queued in the outbox (nothing is sent)`); }));
      mountBoard($('[data-wq-tasks]', root), tasks, today); } };
}

async function team({ user, open, all, deals, today }) {
  const overdue = all.filter((t) => t.deal.status === 'Open' && ['todo', 'in_progress', 'blocked'].includes(t.status) && t.dueDate && t.dueDate < today).length;
  const rows = open.map((d) => html`<tr><td>${dealLink(d)}</td><td>${d.address}</td><td>${d.processorName}</td><td>${d.stageName}</td><td>${fmtDate(d.closingDate)}</td><td>${d.openTasks}</td></tr>`);
  return { title: 'Team dashboard', body: html`
    <div class="page-head"><div><div class="eyebrow">CLA TEAM &middot; ${user.role.toUpperCase()}</div><h2 class="page-title">Team dashboard</h2><div class="muted">View-only. Your processor updates files and tasks.</div></div></div>
    <div class="stat-row">${stat('Open files', open.length, 'right now', '', true)}${stat('Closed', deals.filter((d) => d.status === 'Closed').length, 'all time')}
      ${stat('Overdue tasks', overdue, 'on open files', overdue ? 'bad' : '', true)}${stat('Closing in 21 days', open.filter((d) => d.closingDate && d.closingDate >= today && d.closingDate <= localDate(21)).length, 'files')}</div>
    <div class="card"><h3>Open files</h3><table class="tbl"><thead><tr><th>Order</th><th>Property</th><th>Processor</th><th>Stage</th><th>Closing</th><th>Open tasks</th></tr></thead><tbody>${rows}</tbody></table></div>` };
}

async function coordinator({ api, user, open, all, today }) {
  const mine = all.filter((t) => ['todo', 'in_progress', 'blocked'].includes(t.status) && t.deal.status === 'Open' && (t.assignedRole === user.role || t.mine))
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const summaries = {};
  await mapLimit(open, 4, async (d) => { try { summaries[d.id] = await api.getTcFileSummary(d.id); } catch (e) { summaries[d.id] = null; } });
  const tasks = mine.map((t) => html`<tr data-tc-task="${t.id}"><td><a href="#/deals/${t.deal.id}/tasks${['form', 'sign', 'agent'].includes(t.kind) ? '/' + t.id : ''}">${t.title}</a></td><td><a href="#/deals/${t.deal.id}">${t.deal.fileNumber}</a><br><span class="muted small">${t.deal.address}</span></td><td class="${t.dueDate && t.dueDate < today ? 'bad-text' : ''}">${t.dueDate ? fmtDate(t.dueDate) : '—'}</td><td>${pill(t.status, t.status === 'blocked' ? 'warn' : 'info')}</td></tr>`);
  const files = open.slice().sort((a, b) => (a.closingDate || '9999').localeCompare(b.closingDate || '9999')).map((d) => {
    const s = summaries[d.id]; const e = s && s.emdAlta;
    const ms = s && s.milestones.find((m) => m.state === 'current');
    return html`<tr data-tc-file="${d.id}"><td><a href="#/deals/${d.id}">${d.fileNumber}</a><br><span class="muted small">${d.address}</span></td>
      <td>${d.stageName}${ms && ms.date ? html`<br><span class="muted small">${fmtDate(ms.date)}</span>` : ''}<div class="progress" title="${d.stageName}"><div style="width:${Math.round(((d.stage + 1) / 10) * 100)}%"></div></div></td>
      <td data-tc-chips>${e ? html`${e.received ? pill('EMD received', 'ok') : pill('EMD pending', 'warn')} ${e.altaReceived ? pill('ALTA received', 'ok') : pill('ALTA pending', 'warn')}` : '—'}</td>
      <td>${d.closingDate ? fmtDate(d.closingDate) : html`<span class="warn">Not set</span>`}</td><td>${d.openTasks}</td></tr>`; });
  return { title: 'Dashboard', body: html`
    <div class="page-head"><div><div class="eyebrow">TRANSACTION COORDINATOR</div><h2 class="page-title">Coordination dashboard</h2><div class="muted">Tasks first, then your files. Open a file for the five quick tools.</div></div></div>
    <div class="stat-row">${stat('My open tasks', mine.length, 'across all my files')}${stat('Files', open.length, 'open', '', true)}${stat('Unread messages', open.reduce((n, d) => n + d.unread, 0), 'in my threads')}${stat('Next closing', open.filter((d) => d.closingDate && d.closingDate >= today).sort((a, b) => a.closingDate.localeCompare(b.closingDate))[0] ? fmtDate(open.filter((d) => d.closingDate && d.closingDate >= today).sort((a, b) => a.closingDate.localeCompare(b.closingDate))[0].closingDate) : '—', 'next scheduled', 'info')}</div>
    <div class="card" data-tc-dashboard-tasks><h3>Everything I need to do</h3>${tasks.length ? html`<table class="tbl striped"><thead><tr><th>Task</th><th>File</th><th>Due</th><th>Status</th></tr></thead><tbody>${tasks}</tbody></table>` : html`<p class="muted">You're all caught up.</p>`}</div>
    <div class="card" data-tc-dashboard-files><h3>My files</h3><table class="tbl striped"><thead><tr><th>File / property</th><th>Milestone</th><th>EMD &amp; ALTA</th><th>Closing date</th><th>Open tasks</th></tr></thead><tbody>${files}</tbody></table></div>` };
}

const agentCards = (deals, all, role) => deals.map((d) => { const side = (role || d.myRole) === 'Buyer Agent' ? 'Buyer' : 'Listing'; const mine = all.filter((t) => t.deal.id === d.id && t.mine && ['todo', 'in_progress'].includes(t.status));
    const forClient = all.filter((t) => t.deal.id === d.id && t.forClient && ['todo', 'in_progress', 'blocked'].includes(t.status));
    return html`<div class="card deal-card"><div class="deal-card-head">${dealLink(d)} ${pill(d.status, d.status === 'Open' ? 'ok' : '')}</div><div><strong>${d.address}</strong></div>
      <div class="muted">${d.transactionType} &middot; ${side} side &middot; closing ${fmtDate(d.closingDate) || 'TBD'} &middot; ${fmtMoney(d.purchasePrice)}</div>${bar(d)}<div class="muted">${d.stageName}</div>
      <div class="deal-card-foot">${mine.length ? pill(mine.length + ' task(s) for you', 'warn') : pill('Nothing needed from you', '')} ${forClient.length ? html`<a href="#/deals/${d.id}/tasks">${pill(forClient.length + ' task(s) you can complete for your client', 'info')}</a>` : ''} ${d.unread ? pill(d.unread + ' new message(s)', 'info') : ''}
      <span class="spacer"></span><a class="ghost" href="#/deals/${d.id}">Open</a> <a class="ghost" href="#/deals/${d.id}/documents">Documents</a></div></div>`; });
async function agent({ user, deals, all }) {
  const cards = agentCards(deals, all, user.role);
  return { title: 'Transactions', body: html`<div class="page-head"><div><div class="eyebrow">${user.role.toUpperCase()}</div><h2 class="page-title">My transactions</h2><div class="muted">${deals.length} file(s) you are on</div></div></div>
    <div class="card-grid">${cards.length ? cards : html`<p class="muted">You are not on any files yet.</p>`}</div>` };
}

const clientBlocks = (deals, all) => deals.filter((d) => d.status === 'Open').map((d) => { const todo = all.filter((t) => t.deal.id === d.id && t.mine && ['todo', 'in_progress', 'blocked'].includes(t.status)); const done = all.filter((t) => t.deal.id === d.id && t.mine && t.status === 'done');
    const items = todo.map((t) => html`<li><a href="#/deals/${d.id}/tasks${t.kind === 'form' ? '/' + t.id : ''}">${t.title}</a> ${t.status === 'in_progress' ? pill('started', 'info') : ''} <span class="muted">${t.dueDate ? 'due ' + fmtDate(t.dueDate) : ''}</span></li>`);
    const forClient = d.selfRep ? all.filter((t) => t.deal.id === d.id && t.forClient && ['todo', 'in_progress', 'blocked'].includes(t.status)).length : 0;
    return html`<div class="card"${d.selfRep ? raw(' data-self-rep') : ''}><div class="deal-card-head">${dealLink(d)} <strong>${d.address}</strong>${d.selfRep ? html` <span class="pill self-rep">${d.myRoleLabel} &middot; you are also the ${d.myRole === 'Buyer Agent' ? "buyer's agent" : 'listing agent'}</span>` : ''}</div><div class="muted">Closing ${fmtDate(d.closingDate) || 'to be scheduled'} &middot; ${d.stageName}</div>${bar(d)}
      <h4>What we need from you</h4>${items.length ? html`<ul class="plain">${items}</ul>` : html`<p class="muted">Nothing right now. Thank you!</p>`}<p class="muted">${done.length} item(s) already done.${forClient ? ` ${forClient} task(s) you can complete for another client on your side.` : ''}</p>
      <a class="ghost" href="#/deals/${d.id}/inbox">Message your closing team ${d.unread ? html`(${d.unread} new)` : ''}</a></div>`; });
async function client({ user, deals, all }) {
  const blocks = clientBlocks(deals, all);
  return { title: 'My closing', body: html`<div class="page-head"><div><div class="eyebrow">${user.role === 'Client-Buyer' ? 'BUYER' : 'SELLER'}</div><h2 class="page-title">My closing</h2></div></div>${blocks.length ? blocks : html`<p class="muted">You have no open closings.</p>`}` };
}

async function admin({ api, user, deals, open }) {
  const [users, teams, log] = await Promise.all([api.adminListUsers(), api.listTeams(), api.listActivity(null, { type: 'user' })]);
  const count = (st) => users.filter((u) => u.status === st).length;
  const rows = log.items.slice(0, 8).map((a) => html`<tr><td class="nowrap">${fmtDateTime(a.createdAt)}</td><td>${a.actorName}</td><td>${a.detail}</td></tr>`);
  return { title: 'Admin', body: html`
    <div class="page-head"><div><div class="eyebrow">${user.role === 'Admin' ? 'ADMIN' : html`ADMIN &middot; ${user.role.toUpperCase()}`}</div><h2 class="page-title">Admin overview</h2><div class="muted">Admins (role Admin, or the Admin flag on another role) manage users and teams and can see every order and file.</div></div>
      <div><a class="ghost" href="#/teams">Teams</a> <a class="m-btn" href="#/users/new">+ Create user</a></div></div>
    <div class="stat-row">${stat('Active users', count('active'), users.length + ' accounts')}${stat('Disabled', count('disabled'), 'cannot sign in', count('disabled') ? 'warn' : '')}
      ${stat('Removed', count('removed'), 'history kept')}${stat('Teams', teams.length, 'coordinator access')}${stat('Orders', deals.length, 'all visible to Admin')}${stat('Unassigned', unassignedOpen(open).length, html`<a href="${UNASSIGNED_LINK}">open files with no Processor</a>`, unassignedOpen(open).length ? 'warn' : '')}</div>
    ${unassignedCard(open)}
    <div class="two-col"><div class="card"><h3>Recent user changes</h3>${rows.length ? html`<table class="tbl"><tbody>${rows}</tbody></table>` : html`<p class="muted">None yet.</p>`}<a class="ghost" href="#/activity?type=user">Full log</a></div>
      <div class="card"><h3>Teams</h3><ul class="plain">${teams.map((t) => html`<li><strong>${t.name}</strong><br><span class="muted">${t.members.map((m) => `${m.name} (${m.memberRole})`).join(', ') || 'No members'}</span></li>`)}</ul></div></div>` };
}

// OUTSIDE USER (per-file roles): one login, files grouped by the role they hold on each file. Each group uses that role's view
// (agent cards with "tasks you can complete for your client", or the client's "what we need from you"), so counts stay per file.
const GROUPS = [['Buyer Agent', "Files I'm the buyer's agent on"], ['Listing Agent', "Files I'm the listing agent on"], ['Client-Buyer', 'My purchases'], ['Client-Seller', 'My sales'], ['Outside user', 'Other files I can see']];
// a self-represented file (client + own agent) is listed ONCE, under the client group (My purchases / My sales), with an agent badge
const groupOf = (d) => (d.selfRep ? (d.myRoles || []).find((r) => isClient(r)) : d.myRole);
// FILE-FIRST (John, Nov 4): ONE combined "everything I need to do" list across every file this person is on (buyer's-agent AND listing-agent files,
// client files). Each row = its file (address + file number) and their role on THAT file; clicking opens that file at that task. Which tasks exist
// on a file still comes from the role there; what shows inside a file still follows the per-file rules (api.listMyTasks / my_task_list).
const taskHref = (t) => `#/deals/${t.deal.id}/tasks${['form', 'sign', 'agent'].includes(t.kind) ? '/' + t.id : ''}`;
export const myTaskList = (tasks) => { const open = tasks.filter((t) => ['todo', 'in_progress', 'blocked'].includes(t.status));
  return html`<div class="card" data-my-tasks><h3>Everything I need to do <span class="muted small" data-my-tasks-count>${open.length} task(s) on ${new Set(open.map((t) => t.deal.id)).size} file(s)</span></h3>
    ${open.length ? html`<table class="table"><thead><tr><th>Task</th><th>File</th><th>My role on this file</th><th>Due</th></tr></thead><tbody>${open.map((t) => html`<tr data-my-task="${t.id}" data-my-task-deal="${t.deal.id}">
      <td><a href="${taskHref(t)}" data-my-task-link>${t.title}</a> ${t.status === 'in_progress' ? pill('started', 'info') : ''}</td>
      <td><a href="#/deals/${t.deal.id}">${t.deal.fileNumber}</a><br><span class="muted small">${t.deal.address}</span></td>
      <td data-my-task-role>${t.myRoleLabel || (t.deal && t.deal.myRoleLabel) || ''}</td><td class="nowrap ${t.overdue ? 'warn' : ''}">${t.dueDate ? fmtDate(t.dueDate) : html`<span class="muted">-</span>`}</td></tr>`)}</tbody></table>`
      : html`<p class="muted">Nothing needed from you right now.</p>`}</div>`; };
async function outside({ api, deals, all }) {
  const fromFiles = pendingMine(all.filter((t) => !t.deal || t.deal.status === 'Open'));
  const rpc = api.listMyTasks ? await api.listMyTasks({ fileStatus: 'Open' }).catch(() => []) : [];
  // Prefer listMyTasks (carries myRoleLabel per file). fromFiles lacked it, so the agent home "My role on this file" column was blank.
  const mine = (rpc.length ? rpc : fromFiles).map((t) => ({ ...t, myRoleLabel: t.myRoleLabel || (t.deal && t.deal.myRoleLabel) || '' }));
  const mineOpen = (d) => all.filter((t) => t.deal.id === d.id && t.mine && ['todo', 'in_progress', 'blocked'].includes(t.status)).length;
  const sections = GROUPS.map(([role, label]) => { const list = deals.filter((d) => groupOf(d) === role); if (!list.length) return '';
    const isC = isClient(role); const shown = isC ? list.filter((d) => d.status === 'Open') : list;
    const todo = list.filter((d) => d.status === 'Open').reduce((n, d) => n + mineOpen(d), 0);
    const forClient = all.filter((t) => list.some((d) => d.id === t.deal.id) && t.forClient && ['todo', 'in_progress', 'blocked'].includes(t.status)).length;
    return html`<section class="role-group" data-group="${role}"><h3 class="group-title">${label} <span class="muted small" data-count>${list.length} file(s)${isC && shown.length !== list.length ? ` (${shown.length} open)` : ''} &middot; ${todo} task(s) for you${isAgent(role) || (forClient && list.some((d) => d.selfRep)) ? ` · ${forClient} you can complete for your client` : ''}${list.some((d) => d.selfRep) ? ` · ${list.filter((d) => d.selfRep).length} as your own agent` : ''}</span></h3>
      ${isC ? (shown.length ? clientBlocks(list, all) : html`<p class="muted">No open files.</p>`) : html`<div class="card-grid">${isAgent(role) ? agentCards(list, all, role) : list.map((d) => html`<div class="card">${dealLink(d)} <strong>${d.address}</strong></div>`)}</div>`}</section>`; });
  return { title: 'My files', body: html`<div class="page-head"><div><div class="eyebrow">MY FILES</div><h2 class="page-title">My files</h2><div class="muted">${deals.length} file(s). What you can see and do on each file depends on your role on that file.</div></div></div>
    ${deals.length ? myTaskList(mine) : ''}${deals.length ? sections : html`<p class="muted">You are not on any files yet.</p>`}` };
}
