// Tasks tab. Intake forms are per-participant copies of a versioned template (open them to fill in). Simple tasks are ticked.
// Processor + transaction coordinator manage tasks and queue reminders (outbox only, never sent). Tasks are cancelled, never deleted.
import { html, $, $$, guard, formData, modal, closeModal, options, fmtDate, pill, toast } from '../ui.js?v=202611070139';
import { runsOrders, DEAL_ROLES as ROLES, isProcessor, localDate, isRefi } from '../data/constants.js?v=202611090935';
import { boxTasks } from '../data/task-board.js?v=202611091600';
import { isPortalTask, taskLaneOf } from '../data/nov5-rules.js?v=202611090935';
import { taskOpenHref } from '../data/task-actions.js?v=202611090935';

export const CLS = { todo: 'info', in_progress: 'info', done: 'ok', blocked: 'warn', cancelled: '' };
export const LABEL = { todo: 'to do', in_progress: 'started', done: 'done', blocked: 'blocked', cancelled: 'cancelled' };

export async function render(ctx) {
  // Matt, Nov 3 (b): "Intake by person" = every buyer / seller / agent with all their intake sections and answers on one page (dealintake.js)
  if (new URLSearchParams(location.hash.split('?')[1] || '').get('view') === 'people') return (await import('./dealintake.js?v=202611100830')).render(ctx);
  const { api, user, deal, refresh } = ctx;
  const allTasks = await api.listTasks(deal.id);
  // BUYER (Nov 4 call): the agreements are to-dos that open the agreement (no Agreements tab for the buyer); the buyer never gets a Listing Agent box (listing agent never shown)
  // SELLER MIRROR (Nov 4): the pure seller gets the same To-do list (agreements as to-dos) and never a Buyer's Agent box (the buyer's agent is never shown to the seller)
  const { isPureClient, isPureSeller, agreementTasks } = await import('./client-overview.js?v=202611100830'); const pure = user.accountRole && isPureClient(user); const hideBox = pure ? (isPureSeller(user) ? 'buyer-agent' : 'listing-agent') : null;
  // CLIENT TASK PRIVACY (Matt, Nov 5, live40): a buyer / seller only ever sees tasks assigned to them (the adapter already filters; this is the UI guard),
  // only their own side's box, and "You're all caught up" once nothing is left. Never the other parties' boxes or tasks.
  const productionView = !pure && new URLSearchParams(location.hash.split('?')[1] || '').get('lane') === 'production';
  const laneTasks = pure ? allTasks : allTasks.filter((t) => (productionView ? taskLaneOf(t) === 'production' : isPortalTask(t)));
  const tasks = pure ? laneTasks.filter((t) => t.mine) : laneTasks; const ownBox = pure ? (isPureSeller(user) ? 'seller' : 'buyer') : null;
  const answerList = (t) => { if (!manage || t.status !== 'done' || !t.formData) return ''; const rows = Object.entries(t.formData).filter(([, v]) => v != null && v !== '' && v !== false);
    return rows.length ? html`<dl class="task-answers" data-task-answers="${t.id}">${rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>` : ''; };
  let agreements = null; let agreementsFailed = false;
  if (pure) { try { agreements = await api.listAgreements(deal.id); } catch (e) { agreementsFailed = true; } }
  const agTodo = pure && !agreementsFailed ? agreementTasks(deal, agreements) : [];
  const agreementNote = agreementsFailed ? html`<p class="notice warn" data-agreements-state="error">Agreements could not be loaded. Nothing was marked as acknowledged.</p>`
    : !agreements || !(agreements.agreements || []).length ? html`<p class="muted" data-agreements-state="empty">No agreements are on this file yet.</p>`
    : agTodo.length ? html`<table class="tbl striped" data-agreement-todos><tbody>${agTodo.map((a) => html`<tr data-co-agreement="${a.agreement}"><td><strong><a href="${a.href}">${a.title}</a></strong><br><span class="muted small">Opens the agreement to read and acknowledge</span></td><td class="nowrap"><a class="ghost" href="${a.href}">Open</a></td></tr>`)}</tbody></table>`
    : html`<p class="muted" data-agreements-state="done">All agreements acknowledged.</p>`;
  const manage = runsOrders(user) || user.role === 'Transaction Coordinator'; const today = localDate(); const refi = isRefi(deal);
  const open = (t) => ['todo', 'in_progress', 'blocked'].includes(t.status);
  const row = (t) => html`<tr class="${t.status === 'done' || t.status === 'cancelled' ? 'is-done' : ''}">
      <td class="center">${t.canTick ? html`<input type="checkbox" data-tick="${t.id}" ${t.status === 'done' ? html`checked` : ''} aria-label="Done">` : ''}</td>
      <td><strong>${taskOpenHref(t) ? html`<a href="${taskOpenHref(t)}">${t.title}</a>` : t.title}</strong>${t.notYours ? html` <span class="muted small" data-not-yours>Not yours to open</span>` : ''}${t.taskGroup ? html` <span class="pill" data-task-group>${t.taskGroup}</span>` : ''}${t.description ? html`<br><span class="muted">${t.description}</span>` : ''}${t.switchedOff ? html` <span class="pill warn" data-switched-off title="Switched off on Task Templates > Task switches: kept, hidden from everyone except Admin / Super admin">Switched off (admins only)</span>` : ''}
        ${t.kind === 'form' ? html`<br><span class="muted small">Form &middot; template v${t.templateVersion}</span>` : t.kind === 'sign' ? html`<br><span class="muted small">Signature (demo e-sign)</span>` : t.kind === 'agent' ? html`<br><span class="muted small">Agent task</span>` : ''}${answerList(t)}</td>
      <td>${t.ownerName || t.assignedRole}${t.ownerName ? html`<br><span class="muted small">${t.assignedRole}</span>` : ''}${t.mine ? html` ${pill(user.selfRep ? `you, as ${t.assignedRole}` : 'you', 'info')}` : ''}${t.forClient && open(t) ? html` ${pill('you can complete this for your client', 'warn')}` : ''}</td>
      <td class="${open(t) && t.dueDate && t.dueDate < today ? 'bad-text' : ''}">${fmtDate(t.dueDate)}</td><td>${pill(LABEL[t.status], CLS[t.status])}${t.completedByLabel ? html`<br><span class="muted small done-by">${t.completedByLabel}</span>` : ''}</td>
      <td class="nowrap">${t.kind === 'agent' && taskOpenHref(t) ? html`<a class="ghost" href="${taskOpenHref(t)}" data-agent-task="${t.id}">${t.status === 'done' ? 'View Submission' : t.mine ? 'Start' : 'View'}</a>` : ''}${t.kind === 'sign' && taskOpenHref(t) ? html`<a class="ghost" href="${taskOpenHref(t)}">${t.mine && open(t) ? 'Sign' : 'View'}</a>` : ''}${t.kind === 'form' && t.canFill ? html`<a class="ghost" href="${taskOpenHref(t)}">${t.status === 'done' ? 'View' : t.mine ? 'Fill in' : t.forClient ? 'Fill in for client' : 'Open'}</a>` : ''}
        ${manage ? html`<button class="ghost" data-edit="${t.id}">Edit</button>` : ''}${manage && open(t) ? html` <button class="ghost" data-remind="${t.id}" title="Queues an email in the outbox. Nothing is sent from this build.">Remind</button>` : ''}</td></tr>`;
  const mineFirst = [...tasks].sort((a, b) => ((b.mine || b.forClient) && open(b)) - ((a.mine || a.forClient) && open(a)));
  const body = html`${pure ? html`<div class="box-title"><h2><span class="h-ico"></span>Agreements to acknowledge</h2></div>${agreementNote}` : ''}<div class="box-title"><h2><span class="h-ico"></span>${pure ? 'To-do list' : 'All Tasks'}</h2>${manage ? html`<button class="m-btn right" id="addtask">+ Add task</button>` : ''}</div>
    ${!pure && tasks.some((t) => t.participantId) ? html`<p data-view-switch><strong>${productionView ? 'Title Production' : 'Task list'}</strong> &middot; <a href="#/deals/${deal.id}/tasks?view=people" data-intake-by-person>Intake by person</a> <span class="muted small">(each buyer, seller and agent with all their intake answers on one page)</span>${allTasks.some((t) => taskLaneOf(t) === 'production') ? html` &middot; <a href="#/deals/${deal.id}/tasks${productionView ? '' : '?lane=production'}" data-production-tasks>${productionView ? 'Portal tasks' : 'Title Production'}</a>` : ''}</p>` : ''}
    ${pure && !tasks.some(open) && !agTodo.length ? html`<div class="notice info" data-all-caught-up>You’re all caught up. There is nothing for you to do on this order right now; we will let you know when there is.</div>` : ''}
    ${tasks.length ? html`${pure ? '' : html`<p class="muted small" data-side-total>${tasks.length} task(s) on this file, grouped by side (from each task's assigned role).</p>`}${boxTasks(mineFirst).filter((g) => (pure ? g.key === ownBox : g.key !== hideBox)).map((g) => html`<details class="side-box side-${g.key}" data-sidebox="${g.key}" data-count="${g.tasks.length}" open>
      <summary><span class="side-tag">${g.key === 'buyer' && refi ? 'Borrower tasks' : g.label}</span> <span class="side-count">(${g.tasks.length})</span></summary>
      ${g.tasks.length ? html`<div class="side-scroll"><table class="tbl striped"><thead><tr><th></th><th>Task</th><th>Assigned to</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${g.tasks.map(row)}</tbody></table></div>` : html`<p class="muted small" data-side-empty>None on this side.</p>`}</details>`)}` : pure ? '' : html`<p class="muted" data-tasks-empty>No tasks have been created on this file yet.</p>`}
    <p class="muted small">Tasks are never deleted; use Edit &rarr; Cancelled to retire one. Reminders are queued in the outbox only and never sent from this build.</p>`;
  return { title: 'Tasks', crumbs: [['All Tasks']], body, mount(root) {
    $$('[data-tick]', root).forEach((c) => c.addEventListener('change', guard(async () => { try { await api.updateTask(c.dataset.tick, { status: c.checked ? 'done' : 'todo' }); } finally { refresh(); } })));
    $$('[data-remind]', root).forEach((b) => b.addEventListener('click', guard(async () => { const r = await api.sendTaskReminder(b.dataset.remind); toast(r.queued ? 'Reminder queued in the outbox (not sent)' : 'Already queued today'); })));
    const ab = $('#addtask', root); if (ab) ab.addEventListener('click', () => form(null));
    $$('[data-edit]', root).forEach((b) => b.addEventListener('click', () => form(tasks.find((t) => t.id === b.dataset.edit))));
  } };

  function form(t) {
    const m = modal(t ? 'Edit task' : 'Add task', html`<form id="tf" class="form-grid"><label class="span2">Title *<input name="title" required maxlength="200" value="${t ? t.title : ''}"></label>
      <label class="span2">Details<textarea name="description" rows="2" maxlength="1000">${t ? t.description : ''}</textarea></label>
      ${t && t.participantId ? html`<p class="span2 muted">Assigned to ${t.ownerName} (${t.assignedRole}). Template v${t.templateVersion}.</p>` : html`<label>Assigned to<select name="assignedRole">${options(ROLES, t ? t.assignedRole : 'Processor')}</select></label>`}
      <label>Due date<input type="date" name="dueDate" value="${t && t.dueDate ? t.dueDate : ''}"></label>
      ${t ? html`<label>Status<select name="status">${options(['todo', 'in_progress', 'done', 'blocked', 'cancelled'], t.status, (s) => LABEL[s])}</select></label>` : ''}
      <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    $('#tf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); if (t) await api.updateTask(t.id, f); else await api.createTask(deal.id, f); closeModal(); toast('Task saved'); refresh(); }));
  }
}
