// Tasks tab. Intake forms are per-participant copies of a versioned template (open them to fill in). Simple tasks are ticked.
// Processor + transaction coordinator manage tasks and queue reminders (outbox only, never sent). Tasks are cancelled, never deleted.
import { html, $, $$, guard, formData, modal, closeModal, options, fmtDate, pill, toast } from '../ui.js';
import { DEAL_ROLES as ROLES, isProcessor, localDate } from '../data/constants.js';

export const CLS = { todo: 'info', in_progress: 'info', done: 'ok', blocked: 'warn', cancelled: '' };
export const LABEL = { todo: 'to do', in_progress: 'started', done: 'done', blocked: 'blocked', cancelled: 'cancelled' };

export async function render({ api, user, deal, refresh }) {
  const tasks = await api.listTasks(deal.id); const manage = isProcessor(user.role) || user.role === 'Transaction Coordinator'; const today = localDate();
  const open = (t) => ['todo', 'in_progress', 'blocked'].includes(t.status);
  const row = (t) => html`<tr class="${t.status === 'done' || t.status === 'cancelled' ? 'is-done' : ''}">
      <td class="center">${t.canTick ? html`<input type="checkbox" data-tick="${t.id}" ${t.status === 'done' ? html`checked` : ''} aria-label="Done">` : ''}</td>
      <td><strong>${t.kind === 'form' || t.kind === 'sign' ? html`<a href="#/deals/${deal.id}/tasks/${t.id}">${t.title}</a>` : t.title}</strong>${t.description ? html`<br><span class="muted">${t.description}</span>` : ''}
        ${t.kind === 'form' ? html`<br><span class="muted small">Form &middot; template v${t.templateVersion}</span>` : t.kind === 'sign' ? html`<br><span class="muted small">Signature (demo e-sign)</span>` : ''}</td>
      <td>${t.ownerName || t.assignedRole}${t.ownerName ? html`<br><span class="muted small">${t.assignedRole}</span>` : ''}${t.mine ? html` ${pill(user.selfRep ? `you, as ${t.assignedRole}` : 'you', 'info')}` : ''}${t.forClient && open(t) ? html` ${pill('you can complete this for your client', 'warn')}` : ''}</td>
      <td class="${open(t) && t.dueDate && t.dueDate < today ? 'bad-text' : ''}">${fmtDate(t.dueDate)}</td><td>${pill(LABEL[t.status], CLS[t.status])}${t.completedByLabel ? html`<br><span class="muted small done-by">${t.completedByLabel}</span>` : ''}</td>
      <td class="nowrap">${t.kind === 'sign' ? html`<a class="ghost" href="#/deals/${deal.id}/tasks/${t.id}">${t.mine && open(t) ? 'Sign' : 'View'}</a>` : ''}${t.kind === 'form' && t.canFill ? html`<a class="ghost" href="#/deals/${deal.id}/tasks/${t.id}">${t.status === 'done' ? 'View' : t.mine ? 'Fill in' : t.forClient ? 'Fill in for client' : 'Open'}</a>` : ''}
        ${manage ? html`<button class="ghost" data-edit="${t.id}">Edit</button>` : ''}${manage && open(t) ? html` <button class="ghost" data-remind="${t.id}" title="Queues an email in the outbox. Nothing is sent from this build.">Remind</button>` : ''}</td></tr>`;
  const mineFirst = [...tasks].sort((a, b) => ((b.mine || b.forClient) && open(b)) - ((a.mine || a.forClient) && open(a)));
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>All Tasks</h2>${manage ? html`<button class="m-btn right" id="addtask">+ Add task</button>` : ''}</div>
    ${tasks.length ? html`<table class="tbl striped"><thead><tr><th></th><th>Task</th><th>Assigned to</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${mineFirst.map(row)}</tbody></table>` : html`<p class="muted">No tasks yet.</p>`}
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
      ${t && t.participantId ? html`<p class="span2 muted">Assigned to ${t.ownerName} (${t.assignedRole}). Template v${t.templateVersion}.</p>` : html`<label>Assigned to<select name="assignedRole">${options(ROLES, t ? t.assignedRole : 'Sales Processor')}</select></label>`}
      <label>Due date<input type="date" name="dueDate" value="${t && t.dueDate ? t.dueDate : ''}"></label>
      ${t ? html`<label>Status<select name="status">${options(['todo', 'in_progress', 'done', 'blocked', 'cancelled'], t.status, (s) => LABEL[s])}</select></label>` : ''}
      <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    $('#tf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); if (t) await api.updateTask(t.id, f); else await api.createTask(deal.id, f); closeModal(); toast('Task saved'); refresh(); }));
  }
}
