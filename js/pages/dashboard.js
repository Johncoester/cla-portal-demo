// Role dashboards: Sales Processor = Work Queue; Sales Person / Sales Team = Team Dashboard (view-only);
// Transaction Coordinator = Dashboard; Buyer/Listing Agent = Transactions; clients = My Closing.
import { html, fmtDate, fmtDateTime, fmtMoney, pill, raw, $, guard, toast } from '../ui.js';
import { STAGES, isProcessor, isClient, isAgent } from '../data/constants.js';

const dealLink = (d, tab = '') => html`<a href="#/deals/${d.id}/${tab}">${d.fileNumber}</a>`;
const stat = (label, value, sub, cls = '') => html`<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value ${cls}">${value}</div><div class="stat-sub">${sub}</div></div>`;
const bar = (d) => html`<div class="progress" title="${d.stageName}"><div style="width:${Math.round(((d.stage + 1) / STAGES.length) * 100)}%"></div></div>`;

export async function render(ctx) {
  const { api, user } = ctx;
  const deals = await api.listDeals({ status: 'All' });
  const tasksByDeal = {}; for (const d of deals) tasksByDeal[d.id] = await api.listTasks(d.id);
  const all = Object.entries(tasksByDeal).flatMap(([id, ts]) => ts.map((t) => ({ ...t, deal: deals.find((d) => d.id === id) })));
  const open = deals.filter((d) => d.status === 'Open'); const today = new Date().toISOString().slice(0, 10);
  const pick = user.isAdmin ? admin : isProcessor(user.role) ? processor : user.role === 'Transaction Coordinator' ? coordinator : isAgent(user.role) ? agent : isClient(user.role) ? client : team;
  const v = await pick({ ...ctx, deals, open, all, today });
  return { title: v.title, crumbs: [[v.title]], body: v.body, mount: v.mount };
}

async function processor({ api, open, deals }) {
  const wq = await api.getWorkQueue();
  const rows = wq.needsAttention.map((r) => html`<tr><td>${dealLink(r.deal)} &middot; ${r.deal.stageName}</td><td>${r.deal.address}</td>
    <td>${r.overdue ? pill(r.overdue + ' overdue', 'bad') : ''} ${r.blocked ? pill(r.blocked + ' blocked', 'warn') : ''} ${r.waitingOnClients ? pill(r.waitingOnClients + ' waiting on clients', 'info') : ''}</td>
    <td><a class="ghost" href="#/deals/${r.deal.id}/tasks">Tasks</a></td></tr>`);
  const soon = wq.closingSoon.map((d) => html`<li>${dealLink(d)} <span class="muted">${d.address}</span><br><strong>${fmtDate(d.closingDate)}</strong></li>`);
  return { title: 'Work queue', body: html`
    <div class="page-head"><div><div class="eyebrow">SALES PROCESSOR</div><h2 class="page-title">Work queue</h2><div class="muted">${wq.assigned} open &middot; ${wq.totalAssigned} total assigned</div></div>
      <div><button class="ghost" id="remind">Queue reminders for overdue tasks</button> <a class="ghost" href="#/outbox">Outbox</a> <a class="m-btn" href="#/orders/new">+ New order</a></div></div>
    <div class="stat-row">${stat('Open orders', wq.assigned, wq.totalAssigned + ' total')}${stat('Waiting on clients', wq.blockedOnClients, 'client tasks open', 'warn')}
      ${stat('Overdue tasks', wq.overdueTasks, 'past due date', wq.overdueTasks ? 'bad' : '')}${stat('Unread messages', wq.unreadMessages, 'across open orders')}</div>
    <div class="two-col"><div class="card"><h3>Needs attention</h3>
      ${rows.length ? html`<table class="tbl"><thead><tr><th>Order</th><th>Property</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : html`<p class="muted">Nothing needs attention.</p>`}</div>
      <div class="card"><h3>Closing in the next 3 weeks</h3>${soon.length ? html`<ul class="plain">${soon}</ul>` : html`<p class="muted">No closings scheduled soon.</p>`}</div></div>`,
    mount(root) { $('#remind', root).addEventListener('click', guard(async () => { const r = await api.queueOverdueReminders(); toast(`${r.queued} reminder(s) queued in the outbox (nothing is sent)`); })); } };
}

async function team({ user, open, all, deals, today }) {
  const overdue = all.filter((t) => t.deal.status === 'Open' && ['todo', 'in_progress', 'blocked'].includes(t.status) && t.dueDate && t.dueDate < today).length;
  const rows = open.map((d) => html`<tr><td>${dealLink(d)}</td><td>${d.address}</td><td>${d.processorName}</td><td>${d.stageName}</td><td>${fmtDate(d.closingDate)}</td><td>${d.openTasks}</td></tr>`);
  return { title: 'Team dashboard', body: html`
    <div class="page-head"><div><div class="eyebrow">CLA TEAM &middot; ${user.role.toUpperCase()}</div><h2 class="page-title">Team dashboard</h2><div class="muted">View-only. Your processor updates files and tasks.</div></div></div>
    <div class="stat-row">${stat('Open files', open.length, 'right now')}${stat('Closed', deals.filter((d) => d.status === 'Closed').length, 'all time')}
      ${stat('Overdue tasks', overdue, 'on open files', overdue ? 'bad' : '')}${stat('Closing in 21 days', open.filter((d) => d.closingDate && d.closingDate <= new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10)).length, 'files')}</div>
    <div class="card"><h3>Open files</h3><table class="tbl"><thead><tr><th>Order</th><th>Property</th><th>Processor</th><th>Stage</th><th>Closing</th><th>Open tasks</th></tr></thead><tbody>${rows}</tbody></table></div>` };
}

async function coordinator({ user, open, all, today }) {
  const mine = all.filter((t) => t.assignedRole === user.role && ['todo', 'in_progress', 'blocked'].includes(t.status) && t.deal.status === 'Open');
  const rows = mine.map((t) => html`<tr><td>${t.title}</td><td>${dealLink(t.deal, 'tasks')}</td><td class="${t.dueDate && t.dueDate < today ? 'bad-text' : ''}">${fmtDate(t.dueDate)}</td><td>${pill(t.status, t.status === 'blocked' ? 'warn' : 'info')}</td></tr>`);
  const files = open.map((d) => html`<tr><td>${dealLink(d)}</td><td>${d.address}</td><td>${d.stageName}</td><td>${fmtDate(d.closingDate)}</td><td>${d.unread ? pill(d.unread + ' new', 'info') : ''}</td></tr>`);
  return { title: 'Dashboard', body: html`
    <div class="page-head"><div><div class="eyebrow">TRANSACTION COORDINATOR</div><h2 class="page-title">Coordination board</h2></div></div>
    <div class="stat-row">${stat('My open tasks', mine.length, 'assigned to coordinators')}${stat('Files', open.length, 'open')}${stat('Unread messages', open.reduce((n, d) => n + d.unread, 0), 'in my threads')}</div>
    <div class="two-col"><div class="card"><h3>My tasks</h3>${rows.length ? html`<table class="tbl"><thead><tr><th>Task</th><th>Order</th><th>Due</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` : html`<p class="muted">You're all caught up.</p>`}</div>
      <div class="card"><h3>My files</h3><table class="tbl"><thead><tr><th>Order</th><th>Property</th><th>Stage</th><th>Closing</th><th></th></tr></thead><tbody>${files}</tbody></table></div></div>` };
}

async function agent({ user, deals, all }) {
  const side = user.role === 'Buyer Agent' ? 'Buyer' : 'Listing';
  const cards = deals.map((d) => { const mine = all.filter((t) => t.deal.id === d.id && t.mine && ['todo', 'in_progress'].includes(t.status));
    return html`<div class="card deal-card"><div class="deal-card-head">${dealLink(d)} ${pill(d.status, d.status === 'Open' ? 'ok' : '')}</div><div><strong>${d.address}</strong></div>
      <div class="muted">${d.transactionType} &middot; ${side} side &middot; closing ${fmtDate(d.closingDate) || 'TBD'} &middot; ${fmtMoney(d.purchasePrice)}</div>${bar(d)}<div class="muted">${d.stageName}</div>
      <div class="deal-card-foot">${mine.length ? pill(mine.length + ' task(s) for you', 'warn') : pill('Nothing needed from you', '')} ${d.unread ? pill(d.unread + ' new message(s)', 'info') : ''}
      <span class="spacer"></span><a class="ghost" href="#/deals/${d.id}">Open</a> <a class="ghost" href="#/deals/${d.id}/documents">Documents</a></div></div>`; });
  return { title: 'Transactions', body: html`<div class="page-head"><div><div class="eyebrow">${user.role.toUpperCase()}</div><h2 class="page-title">My transactions</h2><div class="muted">${deals.length} file(s) you are on</div></div></div>
    <div class="card-grid">${cards.length ? cards : html`<p class="muted">You are not on any files yet.</p>`}</div>` };
}

async function client({ user, deals, all }) {
  const blocks = deals.filter((d) => d.status === 'Open').map((d) => { const todo = all.filter((t) => t.deal.id === d.id && t.mine && ['todo', 'in_progress', 'blocked'].includes(t.status)); const done = all.filter((t) => t.deal.id === d.id && t.mine && t.status === 'done');
    const items = todo.map((t) => html`<li><a href="#/deals/${d.id}/tasks${t.kind === 'form' ? '/' + t.id : ''}">${t.title}</a> ${t.status === 'in_progress' ? pill('started', 'info') : ''} <span class="muted">${t.dueDate ? 'due ' + fmtDate(t.dueDate) : ''}</span></li>`);
    return html`<div class="card"><div class="deal-card-head">${dealLink(d)} <strong>${d.address}</strong></div><div class="muted">Closing ${fmtDate(d.closingDate) || 'to be scheduled'} &middot; ${d.stageName}</div>${bar(d)}
      <h4>What we need from you</h4>${items.length ? html`<ul class="plain">${items}</ul>` : html`<p class="muted">Nothing right now. Thank you!</p>`}<p class="muted">${done.length} item(s) already done.</p>
      <a class="ghost" href="#/deals/${d.id}/inbox">Message your closing team ${d.unread ? html`(${d.unread} new)` : ''}</a></div>`; });
  return { title: 'My closing', body: html`<div class="page-head"><div><div class="eyebrow">${user.role === 'Client-Buyer' ? 'BUYER' : 'SELLER'}</div><h2 class="page-title">My closing</h2></div></div>${blocks.length ? blocks : html`<p class="muted">You have no open closings.</p>`}` };
}

async function admin({ api, user, deals }) {
  const users = await api.adminListUsers(); const teams = await api.listTeams(); const log = await api.listActivity(null, { type: 'user' });
  const count = (st) => users.filter((u) => u.status === st).length;
  const rows = log.items.slice(0, 8).map((a) => html`<tr><td class="nowrap">${fmtDateTime(a.createdAt)}</td><td>${a.actorName}</td><td>${a.detail}</td></tr>`);
  return { title: 'Admin', body: html`
    <div class="page-head"><div><div class="eyebrow">ADMIN &middot; ${user.role.toUpperCase()}</div><h2 class="page-title">Admin overview</h2><div class="muted">Admin is a flag on the account, separate from role. Admins manage users and teams and can see every order and file.</div></div>
      <div><a class="ghost" href="#/teams">Teams</a> <a class="m-btn" href="#/users/new">+ Create user</a></div></div>
    <div class="stat-row">${stat('Active users', count('active'), users.length + ' accounts')}${stat('Disabled', count('disabled'), 'cannot sign in', count('disabled') ? 'warn' : '')}
      ${stat('Removed', count('removed'), 'history kept')}${stat('Teams', teams.length, 'coordinator access')}${stat('Orders', deals.length, 'all visible to Admin')}</div>
    <div class="two-col"><div class="card"><h3>Recent user changes</h3>${rows.length ? html`<table class="tbl"><tbody>${rows}</tbody></table>` : html`<p class="muted">None yet.</p>`}<a class="ghost" href="#/activity?type=user">Full log</a></div>
      <div class="card"><h3>Teams</h3><ul class="plain">${teams.map((t) => html`<li><strong>${t.name}</strong><br><span class="muted">${t.members.map((m) => `${m.name} (${m.memberRole})`).join(', ') || 'No members'}</span></li>`)}</ul></div></div>` };
}
