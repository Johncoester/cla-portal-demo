// Task grid (Matt, Nov 2): Processor and Admin. File numbers across the top, the agent / buyer / seller tasks down the side.
// Cell: green check + completion date = completed; red X = overdue (past due, not complete); blank = not complete and not yet due;
// dash = that task is not on that file. Existing status colours only (ok-text / bad-text / muted).
import { html, fmtDate, raw } from '../ui.js?v=202611022207';
import { TASK_GROUPS } from '../data/task-board.js?v=202611022207';

const FILES = [['Open', 'Open files'], ['On Hold', 'On-hold files'], ['Closed', 'Closed files'], ['All', 'All files']];
const cell = (c) => {
  const part = c.total > 1 ? html`<br><span class="muted small">${c.done}/${c.total} done</span>` : '';
  if (c.state === 'done') return html`<td class="center" data-state="done" title="Completed ${fmtDate(c.date)}"><span class="ok-text" aria-label="Completed">&#10004;</span><br><span class="muted small">${fmtDate(c.date)}</span></td>`;
  if (c.state === 'overdue') return html`<td class="center" data-state="overdue" title="Overdue${c.dueDate ? ' - was due ' + fmtDate(c.dueDate) : ''}"><span class="bad-text" aria-label="Overdue">&#10008;</span>${c.dueDate ? html`<br><span class="muted small">due ${fmtDate(c.dueDate)}</span>` : ''}${part}</td>`;
  if (c.state === 'pending') return html`<td class="center" data-state="pending" title="${c.dueDate ? 'Not yet due - due ' + fmtDate(c.dueDate) : 'Not complete, no due date'}">${part}</td>`;
  return html`<td class="center muted" data-state="na" title="Not on this file">&ndash;</td>`;
};

export async function render({ api }) {
  const q = new URLSearchParams(location.hash.split('?')[1] || ''); const fs = FILES.some((f) => f[0] === q.get('s')) ? q.get('s') : 'Open';
  const g = await api.getTaskGrid({ fileStatus: fs });
  const head = html`<tr><th>Task</th>${g.columns.map((c) => html`<th class="center" data-col="${c.id}"><a href="#/deals/${c.id}/tasks">${c.fileNumber}</a><br><span class="muted small">${c.street}</span></th>`)}</tr>`;
  const body = TASK_GROUPS.filter(([k]) => k !== 'staff').map(([k, label]) => { const rows = g.rows.filter((r) => r.group === k); if (!rows.length) return '';
    return html`<tr data-grid-group="${k}"><th colspan="${g.columns.length + 1}">${label}</th></tr>${rows.map((r) => html`<tr data-row="${r.key}"><td>${r.label}</td>${g.columns.map((c) => cell(r.cells[c.id]))}</tr>`)}`; });
  const t = g.totals;
  return { title: 'Task grid', crumbs: [['Task Grid']], body: html`
    <div class="page-head"><div><div class="eyebrow">PROCESSOR</div><h2 class="page-title">Task grid</h2>
      <div class="muted">Files across, buyer / seller / agent tasks down. ${g.columns.length} file(s) &middot; ${t.done} done &middot; ${t.overdue} overdue &middot; ${t.pending} not yet due.</div></div>
      <div><a class="ghost" href="#/tasks">Task list</a></div></div>
    <ul class="nav-tabs">${FILES.map(([k, label]) => html`<li><a class="${k === fs ? 'active' : ''}" href="#/task-grid?s=${encodeURIComponent(k)}" ${k === fs ? raw('aria-current="page"') : ''}>${label}</a></li>`)}</ul>
    <p class="muted small" data-legend><span class="ok-text">&#10004;</span> completed (date) &nbsp; <span class="bad-text">&#10008;</span> overdue &nbsp; blank = not yet due &nbsp; &ndash; = not on this file</p>
    ${g.columns.length ? html`<table class="tbl" data-taskgrid><thead>${head}</thead><tbody>${body}</tbody></table>` : html`<p class="muted" data-grid-empty>No files.</p>`}` };
}
