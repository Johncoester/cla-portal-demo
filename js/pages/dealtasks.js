// Tasks tab. Processor + transaction coordinator manage tasks; others tick off tasks assigned to their own role. Tasks are cancelled, never deleted.
import { html, $, $$, guard, formData, modal, closeModal, options, fmtDate, pill, toast } from '../ui.js';
import { ROLES, isProcessor } from '../data/constants.js';

const CLS = { todo: 'info', done: 'ok', blocked: 'warn', cancelled: '' };

export async function render({ api, user, deal, refresh }) {
  const tasks = await api.listTasks(deal.id); const manage = isProcessor(user.role) || user.role === 'Transaction Coordinator'; const today = new Date().toISOString().slice(0, 10);
  const row = (t) => { const mine = t.assignedRole === user.role; const canTick = manage || (mine && ['todo', 'done'].includes(t.status));
    return html`<tr class="${t.status === 'done' || t.status === 'cancelled' ? 'is-done' : ''}"><td class="center">${canTick && t.status !== 'cancelled' ? html`<input type="checkbox" data-tick="${t.id}" ${t.status === 'done' ? html`checked` : ''} aria-label="Done">` : ''}</td>
      <td><strong>${t.title}</strong>${t.description ? html`<br><span class="muted">${t.description}</span>` : ''}</td><td>${t.assignedRole}${mine ? html` ${pill('you', 'info')}` : ''}</td>
      <td class="${t.status === 'todo' && t.dueDate && t.dueDate < today ? 'bad-text' : ''}">${fmtDate(t.dueDate)}</td><td>${pill(t.status, CLS[t.status])}</td>
      <td class="nowrap">${manage ? html`<button class="ghost" data-edit="${t.id}">Edit</button>` : ''}</td></tr>`; };
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>All Tasks</h2>${manage ? html`<button class="m-btn right" id="addtask">+ Add task</button>` : ''}</div>
    ${tasks.length ? html`<table class="tbl striped"><thead><tr><th></th><th>Task</th><th>Assigned to</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${tasks.map(row)}</tbody></table>` : html`<p class="muted">No tasks yet.</p>`}
    <p class="muted small">Tasks are never deleted; use Edit &rarr; Cancelled to retire one.</p>`;
  return { title: 'Tasks', crumbs: [['All Tasks']], body, mount(root) {
    $$('[data-tick]', root).forEach((c) => c.addEventListener('change', guard(async () => { try { await api.updateTask(c.dataset.tick, { status: c.checked ? 'done' : 'todo' }); } finally { refresh(); } })));
    const ab = $('#addtask', root); if (ab) ab.addEventListener('click', () => form(null));
    $$('[data-edit]', root).forEach((b) => b.addEventListener('click', () => form(tasks.find((t) => t.id === b.dataset.edit))));
  } };

  function form(t) {
    const m = modal(t ? 'Edit task' : 'Add task', html`<form id="tf" class="form-grid"><label class="span2">Title *<input name="title" required maxlength="200" value="${t ? t.title : ''}"></label>
      <label class="span2">Details<textarea name="description" rows="2" maxlength="1000">${t ? t.description : ''}</textarea></label>
      <label>Assigned to<select name="assignedRole">${options(ROLES, t ? t.assignedRole : 'Sales Processor')}</select></label><label>Due date<input type="date" name="dueDate" value="${t && t.dueDate ? t.dueDate : ''}"></label>
      ${t ? html`<label>Status<select name="status">${options(['todo', 'done', 'blocked', 'cancelled'], t.status)}</select></label>` : ''}
      <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    $('#tf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); if (t) await api.updateTask(t.id, f); else await api.createTask(deal.id, f); closeModal(); toast('Task saved'); refresh(); }));
  }
}
