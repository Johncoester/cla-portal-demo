// Role dashboards: Processor = Work Queue; Sales Person / Sales Team = Team Dashboard (view-only);
// Transaction Coordinator = Dashboard; Buyer/Listing Agent = Transactions; clients = My Closing.
import { html, toText, fmtDate, fmtDateTime, fmtMoney, pill, raw, $, guard, toast } from '../ui.js?v=202611161500';
import { runsOrders, STAGES, isProcessor, isClient, isAgent, isOutside, localDate } from '../data/constants.js?v=202611247700';
import { boardForm, boardResults, mountBoard, BOARD_DEFAULTS } from './taskboard.js?v=202611300600';
import { themeOn } from '../theme.js?v=202611070139';
import { pendingMine } from '../data/task-actions.js?v=202611269900';
import { unassignedOpen } from '../data/processor-assign.js?v=202611091600';
import { workQueueFrom, DASHBOARD_PAGE } from '../data/dashboard-load.js?v=202611291400';

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

const viewOf = (user) => user.isAdmin ? 'admin' : runsOrders(user) ? 'processor' : user.role === 'Transaction Coordinator' ? 'coordinator' : isAgent(user.role) ? 'agent' : isClient(user.role) ? 'client' : isOutside(user.role) ? 'outside' : 'team';

export async function render(ctx) {
  const { api, user } = ctx;
  const view = viewOf(user);
  const state = { openOffset: 0, otherOffset: 0, showOther: false };
  const unreadP = view === 'processor' && api.unreadCount ? api.unreadCount() : Promise.resolve(0);
  const adminP = view === 'admin' ? Promise.all([api.adminListUsers(), api.listTeams(), api.listActivity(null, { type: 'user' })]) : Promise.resolve(null);
  const [dash, unread, adminBits] = await Promise.all([
    api.loadDashboard({ openOffset: 0, openLimit: DASHBOARD_PAGE, includeTasks: view !== 'admin', includeOther: false }),
    unreadP, adminP,
  ]);
  state.openRows = dash.openRows; state.openTotal = dash.openTotal; state.otherRows = dash.otherRows || []; state.otherTotal = dash.otherTotal; state.closedTotal = dash.closedTotal; state.tasks = dash.tasks || []; state.taskTotal = dash.taskTotal;
  const paint = () => {
    const open = state.openRows; const deals = state.showOther ? open.concat(state.otherRows) : open; const all = state.tasks; const today = localDate();
    const pick = { admin, processor, coordinator, agent, client, outside, team }[view];
    return pick({ ...ctx, deals, open, all, today, unread, adminBits, openTotal: state.openTotal, otherTotal: state.otherTotal, closedTotal: state.closedTotal });
  };
  const first = await paint();
  const bar = () => html`${state.openRows.length < state.openTotal ? html`<p data-dash-more><button type="button" data-show-more-open>Show more open files</button> <span class="muted">${state.openRows.length} of ${state.openTotal} open</span></p>` : ''}${state.otherTotal && !state.showOther ? html`<p data-dash-other><button type="button" data-show-other>Show closed, on hold, and cancelled</button> <span class="muted">${state.otherTotal} file(s)</span></p>` : ''}`;
  const tc = themeOn() && (user.isAdmin || runsOrders(user) || ['Sales Person', 'Sales Team', 'Transaction Coordinator'].includes(user.role));
  const cards = tc ? (await import('./theme-cards.js?v=202611247700')).dashCards(state.showOther ? state.openRows.concat(state.otherRows) : state.openRows) : '';
  return { title: first.title, crumbs: [[first.title]], body: html`<div data-dash-root>${cards}${first.body}${bar()}</div>`, mount(root) {
    const wire = (viewMount) => {
      viewMount && viewMount(root);
      const more = $('[data-show-more-open]', root); const other = $('[data-show-other]', root);
      if (more) more.addEventListener('click', guard(async () => {
        const next = await api.loadDashboard({ openOffset: state.openRows.length, openLimit: DASHBOARD_PAGE, includeTasks: false, includeOther: false });
        state.openRows = state.openRows.concat(next.openRows); state.openTotal = next.openTotal; await redraw();
      }));
      if (other) other.addEventListener('click', guard(async () => {
        const next = await api.loadDashboard({ openOffset: 0, openLimit: DASHBOARD_PAGE, includeTasks: false, includeOther: true, otherOffset: 0 });
        state.otherRows = next.otherRows; state.otherTotal = next.otherTotal; state.showOther = true; await redraw();
      }));
    };
    const redraw = async () => {
      const again = await paint();
      const box = $('[data-dash-root]', root); if (!box) return;
      const top = tc ? (await import('./theme-cards.js?v=202611247700')).dashCards(state.showOther ? state.openRows.concat(state.otherRows) : state.openRows) : '';
      box.innerHTML = toText(html`${top}${again.body}${bar()}`);
      wire(again.mount);
    };
    wire(first.mount);
  } };
}

async function processor({ api, open, all, today, unread, openTotal, otherTotal }) {
  const wq = workQueueFrom({ open, openTotal, otherTotal, tasks: all, unread, today, soon: localDate(21) });
  const tasks = all;
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

async function team({ user, open, all, today, openTotal, closedTotal }) {
  const overdue = all.filter((t) => t.deal.status === 'Open' && ['todo', 'in_progress', 'blocked'].includes(t.status) && t.dueDate && t.dueDate < today).length;
  const rows = open.map((d) => html`<tr><td>${dealLink(d)}</td><td>${d.address}</td><td>${d.processorName}</td><td>${d.stageName}</td><td>${fmtDate(d.closingDate)}</td><td>${d.openTasks}</td></tr>`);
  return { title: 'Team dashboard', body: html`
    <div class="page-head"><div><div class="eyebrow">CLA TEAM &middot; ${user.role.toUpperCase()}</div><h2 class="page-title">Team dashboard</h2><div class="muted">View-only. Your processor updates files and tasks.</div></div></div>
    <div class="stat-row">${stat('Open files', openTotal == null ? open.length : openTotal, 'right now', '', true)}${stat('Closed', closedTotal || 0, 'all time')}
      ${stat('Overdue tasks', overdue, 'on open files', overdue ? 'bad' : '', true)}${stat('Closing in 21 days', open.filter((d) => d.closingDate && d.closingDate >= today && d.closingDate <= localDate(21)).length, 'files')}</div>
    <div class="card"><h3>Open files</h3><table class="tbl"><thead><tr><th>Order</th><th>Property</th><th>Processor</th><th>Stage</th><th>Closing</th><th>Open tasks</th></tr></thead><tbody>${rows}</tbody></table></div>` };
}

async function coordinator({ api, user, open, all, today }) {
  const mine = all.filter((t) => ['todo', 'in_progress', 'blocked'].includes(t.status) && t.deal.status === 'Open' && (t.assignedRole === user.role || t.mine))
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const summaries = {};
  if (open.length && api.getTcFileSummaries) {
    const rows = await api.getTcFileSummaries(open.map((d) => d.id));
    for (const row of rows || []) summaries[row.dealId] = row;
  }
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

async function admin({ user, deals, open, openTotal, otherTotal, adminBits }) {
  const [users, teams, log] = adminBits;
  const count = (st) => users.filter((u) => u.status === st).length;
  const rows = log.items.slice(0, 8).map((a) => html`<tr><td class="nowrap">${fmtDateTime(a.createdAt)}</td><td>${a.actorName}</td><td>${a.detail}</td></tr>`);
  return { title: 'Admin', body: html`
    <div class="page-head"><div><div class="eyebrow">${user.role === 'Admin' ? 'ADMIN' : html`ADMIN &middot; ${user.role.toUpperCase()}`}</div><h2 class="page-title">Admin overview</h2><div class="muted">Admins (role Admin, or the Admin flag on another role) manage users and teams and can see every order and file.</div></div>
      <div><a class="ghost" href="#/teams">Teams</a> <a class="m-btn" href="#/users/new">+ Create user</a></div></div>
    <div class="stat-row">${stat('Active users', count('active'), users.length + ' accounts')}${stat('Disabled', count('disabled'), 'cannot sign in', count('disabled') ? 'warn' : '')}
      ${stat('Removed', count('removed'), 'history kept')}${stat('Teams', teams.length, 'coordinator access')}${stat('Orders', (openTotal == null ? deals.length : openTotal + (otherTotal || 0)), 'visible to Admin')}${stat('Unassigned', unassignedOpen(open).length, html`<a href="${UNASSIGNED_LINK}">open files with no Processor</a>`, unassignedOpen(open).length ? 'warn' : '')}</div>
    ${unassignedCard(open)}
    <div class="two-col"><div class="card"><h3>Recent user changes</h3>${rows.length ? html`<table class="tbl"><tbody>${rows}</tbody></table>` : html`<p class="muted">None yet.</p>`}<a class="ghost" href="#/activity?type=user">Full log</a></div>
      <div class="card"><h3>Teams</h3><ul class="plain">${teams.map((t) => html`<li><strong>${t.name}</strong><br><span class="muted">${t.members.map((m) => `${m.name} (${m.memberRole})`).join(', ') || 'No members'}</span></li>`)}</ul></div></div>` };
}

// OUTSIDE USER (per-file roles): one login, a role per file. Clients' "what we need from you" blocks list the files where they are the client.
// a self-represented file (client + own agent) counts as a client file, with an agent badge
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
// TC-DASHBOARD-1 (John, Nov 21 2026: "this layout looks horrible"): the outside user's home (named Dashboard since John, Nov 22 2026: "my files should be called Dashboard") is a dashboard in the Open Orders table look.
// Outstanding tasks are grouped by file (File No, Property Address and Your Role each in their own column, once per file), then a file
// overview with Stage, Closing Date, tasks for you and, for the agent side only, the commission. Clients' "What we need from you" stays.
const TC_LABEL = 'Transaction Coordinator';
const OPEN_TASK = ['todo', 'in_progress', 'blocked'];
const roleText = (d) => (!d ? '' : d.selfRep || d.myRoleLabel === TC_LABEL ? d.myRoleLabel : ({ 'Client-Buyer': 'Buyer', 'Client-Seller': 'Seller' })[d.myRole] || d.myRoleLabel || d.myRole || '');
// Commission: only for files where this person is on the agent side (Buyer Agent / Listing Agent, including a coordinator for that agent).
const FEE_SIDE = { 'Buyer Agent': 'buyer', 'Listing Agent': 'listing' };
const feeSideOf = (d) => FEE_SIDE[d.myRole] || ((d.myRoles || []).map((r) => FEE_SIDE[r]).find(Boolean)) || null;
export const DASH_FEE_FILES = 12;   // speed: at most this many commission reads, after the page is drawn
const commissionText = (side) => { const c = side && side.commission; if (!c || (c.amount == null && c.percent == null)) return '';
  return `${c.percent != null ? `${Number(c.percent).toLocaleString('en-US', { maximumFractionDigits: 4 })}% / ` : ''}${c.amount != null ? fmtMoney(c.amount) : ''}`; };
// TC dashboard (John, Nov 22 2026): outstanding / overdue EMDs and ALTA review (files closing in the next 2 days).
// EMD fields are the existing deal columns: emd_received, emd_amount, emd_due_date, emd_holder. Refinance has no EMD.
export const ALTA_REVIEW_DAYS = 2;
const hasEmdInfo = (d) => d && (d.emdAmount != null || d.emdDueDate || (d.emdHolder && String(d.emdHolder).trim()));
export const emdReceivedLabel = (d) => (!d || d.transactionType === 'Refinance' ? '—' : d.emdReceived ? 'Yes' : 'No');
export const outstandingEmds = (open, today) => (open || []).filter((d) => d.status !== 'Closed' && d.status !== 'On Hold' && d.status !== 'Cancelled' && d.transactionType !== 'Refinance' && !d.emdReceived && hasEmdInfo(d))
  .map((d) => ({ deal: d, overdue: !!(d.emdDueDate && d.emdDueDate < today) }))
  .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.deal.emdDueDate || '9999-12-31').localeCompare(b.deal.emdDueDate || '9999-12-31') || (a.deal.fileNumber || '').localeCompare(b.deal.fileNumber || ''));
const plusDays = (iso, n) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); if (!m) return ''; const d = new Date(+m[1], +m[2] - 1, +m[3] + n); const ymd = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; return ymd(d); };
export const altaReviewNeeded = (open, today) => { const end = plusDays(today, ALTA_REVIEW_DAYS);
  return (open || []).filter((d) => d.status === 'Open' && d.closingDate && d.closingDate >= today && d.closingDate <= end)
    .sort((a, b) => a.closingDate.localeCompare(b.closingDate) || (a.fileNumber || '').localeCompare(b.fileNumber || '')); };
// Admin fee plus any other fees the agent entered (not the commission, which has its own column). Same visibility as getAgentFees.
export const adminFeesText = (side) => { if (!side) return '';
  const parts = [];
  if (side.admin && side.admin.amount != null) parts.push(`Admin fee ${fmtMoney(side.admin.amount)}`);
  (side.other || []).forEach((f) => { if (f && f.amount != null) parts.push(`${f.description || 'Other fee'} ${fmtMoney(f.amount)}`); });
  return parts.join('; '); };

export const outsideTaskGroups = (deals, all) => { const byId = new Map(deals.map((d) => [d.id, d])); const groups = new Map();
  pendingMine((all || []).filter((t) => t.deal && (!t.deal.status || t.deal.status === 'Open')), OPEN_TASK).forEach((t) => { const id = t.deal.id;
    if (!groups.has(id)) groups.set(id, { deal: { ...t.deal, ...(byId.get(id) || {}) }, tasks: [] }); groups.get(id).tasks.push(t); });
  const due = (t) => t.dueDate || '9999-12-31';
  return [...groups.values()].map((g) => ({ ...g, tasks: g.tasks.sort((a, b) => due(a).localeCompare(due(b))) })).sort((a, b) => due(a.tasks[0]).localeCompare(due(b.tasks[0]))); };
const taskRows = (groups, today) => groups.flatMap((g) => g.tasks.map((t, i) => { const late = t.overdue || (t.dueDate && t.dueDate < today);
  return html`<tr data-my-task="${t.id}" data-my-task-deal="${g.deal.id}">${i === 0 ? html`<td rowspan="${g.tasks.length}" data-task-file><a href="#/deals/${g.deal.id}">${g.deal.fileNumber}</a></td>
    <td rowspan="${g.tasks.length}" data-task-address>${g.deal.street ? html`${g.deal.street},<br>${g.deal.city}, ${g.deal.state}, ${g.deal.zip}` : g.deal.address || ''}</td><td rowspan="${g.tasks.length}" data-my-task-role>${roleText(g.deal)}</td>` : ''}
    <td><a href="${taskHref(t)}" data-my-task-link>${t.title}</a> ${t.status === 'in_progress' ? pill('started', 'info') : ''}</td>
    <td class="nowrap">${t.dueDate ? fmtDate(t.dueDate) : html`<span class="muted">-</span>`}${late ? html` ${pill('overdue', 'bad')}` : ''}</td></tr>`; }));
async function outside({ api, deals, all, today }) {
  const open = deals.filter((d) => d.status === 'Open');
  const groups = outsideTaskGroups(deals, all); const taskCount = groups.reduce((n, g) => n + g.tasks.length, 0);
  const overdue = groups.reduce((n, g) => n + g.tasks.filter((t) => t.overdue || (t.dueDate && t.dueDate < today)).length, 0);
  const soon = localDate(14);
  const closing = open.filter((d) => d.closingDate && d.closingDate >= today && d.closingDate <= soon).length;
  const mineOn = (d) => groups.find((g) => g.deal.id === d.id);
  const feeFiles = open.filter(feeSideOf); const showFees = feeFiles.length > 0;
  const clientFiles = open.filter((d) => isClient(groupOf(d) || ''));
  const emdRows = outstandingEmds(open, today);
  const altaRows = altaReviewNeeded(open, today);
  const body = html`<div class="page-head"><div><div class="eyebrow">DASHBOARD</div><h2 class="page-title">Dashboard</h2><div class="muted">${open.length} open file(s). What you can see and do on each file depends on your role on that file.</div></div></div>
    <div class="stat-row" data-dash-stats>${stat('Open files', open.length, html`<a href="#/orders?s=Open">Open Orders</a>`)}${stat('Tasks for you', taskCount, `on ${groups.length} file(s)`, taskCount ? 'warn' : '')}${stat('Overdue', overdue, 'past their due date', overdue ? 'bad' : '')}${stat('Closing soon', closing, 'in the next 14 days')}</div>
    <div class="box-title"><h3 data-my-tasks>Outstanding tasks <span class="muted small" data-my-tasks-count>${taskCount} task(s) on ${groups.length} file(s)</span></h3></div>
    ${taskCount ? html`<table class="tbl striped" data-dash-tasks><thead><tr><th>File No</th><th>Property Address</th><th>Your Role</th><th>Task</th><th>Due</th></tr></thead><tbody>${taskRows(groups, today)}</tbody></table>`
      : html`<p class="muted" data-no-tasks>Nothing needed from you right now.</p>`}
    <div class="two-col" data-dash-alerts>
      <div class="card" data-emd-card><h3>Outstanding / overdue EMDs <span class="muted small">${emdRows.length} file(s)</span></h3>
        ${emdRows.length ? html`<table class="tbl striped" data-emd-table><thead><tr><th>File No</th><th>Property</th><th>EMD amount</th><th>Due date</th><th>Holder</th><th></th></tr></thead><tbody>${emdRows.map(({ deal: d, overdue }) => html`<tr data-emd-file="${d.id}" data-emd-overdue="${overdue ? 'yes' : 'no'}"><td><a href="#/deals/${d.id}">${d.fileNumber}</a></td>
          <td>${d.street ? html`${d.street},<br>${d.city}, ${d.state}, ${d.zip}` : d.address || ''}</td><td class="nowrap">${d.emdAmount != null ? fmtMoney(d.emdAmount) : html`<span class="muted">—</span>`}</td>
          <td class="nowrap ${overdue ? 'bad-text' : ''}">${d.emdDueDate ? fmtDate(d.emdDueDate) : html`<span class="muted">—</span>`}${overdue ? html` ${pill('Overdue', 'bad')}` : ''}</td>
          <td>${d.emdHolder ? d.emdHolder : html`<span class="muted">—</span>`}</td></tr>`)}</tbody></table>`
          : html`<p class="muted" data-no-emd>No outstanding or overdue EMDs.</p>`}</div>
      <div class="card" data-alta-card><h3>ALTA review needed <span class="muted small">${altaRows.length} file(s)</span></h3>
        <p class="muted small">Open files closing today through the next 2 days. This is a closing-date reminder; it does not read an ALTA status.</p>
        ${altaRows.length ? html`<table class="tbl striped" data-alta-table><thead><tr><th>File No</th><th>Property</th><th>Closing date</th></tr></thead><tbody>${altaRows.map((d) => html`<tr data-alta-file="${d.id}"><td><a href="#/deals/${d.id}">${d.fileNumber}</a></td>
          <td>${d.street ? html`${d.street},<br>${d.city}, ${d.state}, ${d.zip}` : d.address || ''}</td><td class="nowrap">${fmtDate(d.closingDate)}</td></tr>`)}</tbody></table>`
          : html`<p class="muted" data-no-alta>No files closing in the next 2 days.</p>`}</div>
    </div>
    <div class="box-title"><h3>File overview <span class="muted small">${open.length} open file(s)</span></h3></div>
    ${open.length ? html`<table class="tbl striped" data-dash-files><thead><tr><th>File No</th><th>Property Address</th><th>Your Role</th><th>Closing Date</th><th>EMD Received</th><th>Stage</th><th>Task Pending</th>${showFees ? html`<th>Commission</th><th>Admin fees</th>` : ''}<th></th></tr></thead><tbody>${open.map((d) => { const g = mineOn(d);
      return html`<tr data-dash-file="${d.id}"><td><a href="#/deals/${d.id}">${d.fileNumber}</a>${d.fileTitle ? html`<br><span class="muted small" data-file-title>${d.fileTitle}</span>` : ''}</td>
        <td>${d.street ? html`${d.street},<br>${d.city}, ${d.state}, ${d.zip}` : d.address}</td><td data-dash-role>${roleText(d)}</td><td class="nowrap">${d.closingDate ? fmtDate(d.closingDate) : html`<span class="muted">Not set</span>`}</td>
        <td data-emd-received="${d.id}">${emdReceivedLabel(d)}</td>
        <td data-dash-stage>${d.stageName || STAGES[Number(d.stage) || 0] || ''}</td><td>${g ? html`<span class="action-req">Action Required</span><br><span class="muted small">${g.tasks.length} task(s)</span>` : ''}</td>
        ${showFees ? html`<td data-commission="${feeSideOf(d) ? d.id : ''}">${feeSideOf(d) ? html`<span class="muted small">Loading...</span>` : ''}</td><td data-admin-fees="${feeSideOf(d) ? d.id : ''}">${feeSideOf(d) ? html`<span class="muted small">Loading...</span>` : ''}</td>` : ''}<td><a class="view-btn" href="#/deals/${d.id}">View Order</a></td></tr>`; })}</tbody></table>`
      : html`<p class="muted">You are not on any open files yet.</p>`}
    ${clientFiles.length ? html`<section class="role-group" data-group="client"><h3 class="group-title">What we need from you</h3>${clientBlocks(clientFiles, all)}</section>` : ''}`;
  return { title: 'Dashboard', body, mount(root) {
    if (!showFees) return;
    // speed: drawn first, then one fee read per agent-side file (at most DASH_FEE_FILES), all at once. A failed read says so in its cells.
    const fill = (sel, d, htmlText) => { const cell = root.querySelector(`[${sel}="${d.id}"]`); if (cell) cell.innerHTML = htmlText; };
    feeFiles.slice(0, DASH_FEE_FILES).forEach(async (d) => {
      try { const r = api.getAgentFees ? await api.getAgentFees(d.id) : null; const side = r && r.fees ? r.fees[feeSideOf(d)] : null;
        const comm = commissionText(side); const admin = adminFeesText(side);
        fill('data-commission', d, comm ? toText(comm) : '<span class="muted small">Not entered yet</span>');
        fill('data-admin-fees', d, admin ? toText(admin) : '<span class="muted small">Not entered yet</span>');
      } catch (e) { fill('data-commission', d, '<span class="muted small">Could not load</span>'); fill('data-admin-fees', d, '<span class="muted small">Could not load</span>'); } });
    feeFiles.slice(DASH_FEE_FILES).forEach((d) => { fill('data-commission', d, '<span class="muted small">Open the file to see it</span>'); fill('data-admin-fees', d, '<span class="muted small">Open the file to see it</span>'); });
  } };
}
