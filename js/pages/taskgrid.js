// Task grid (Matt, Nov 2; FLIPPED Matt, Nov 3 (b)): Processor and Admin. File numbers DOWN THE SIDE (one row per file, with its address and closing date),
// the buyer / seller / agent tasks ACROSS THE TOP (grouped Buyer / Seller / Agent). Every column header sorts (up / down arrows, click again to reverse).
// Cell: green check + completion date = completed; red X = overdue (past due, not complete); blank = not complete and not yet due;
// dash = that task is not on that file. Existing status colours only (ok-text / bad-text / muted).
import { html, fmtDate, raw, $, $$ } from '../ui.js?v=202611060249';
import { TASK_GROUPS } from '../data/task-board.js?v=202611060249';
import { sortGridFiles } from '../data/task-grid-sort.js?v=202611060249';
import { isRefi } from '../data/constants.js?v=202611060249';

const FILES = [['Open', 'Open files'], ['On Hold', 'On-hold files'], ['Closed', 'Closed files'], ['All', 'All files']];
const cell = (c, taskKey) => {
  const part = c.total > 1 ? html`<br><span class="muted small">${c.done}/${c.total} done</span>` : '';
  if (c.state === 'done') return html`<td class="center" data-task="${taskKey}" data-state="done" title="Completed ${fmtDate(c.date)}"><span class="ok-text" aria-label="Completed">&#10004;</span><br><span class="muted small">${fmtDate(c.date)}</span></td>`;
  if (c.state === 'overdue') return html`<td class="center" data-task="${taskKey}" data-state="overdue" title="Overdue${c.dueDate ? ' - was due ' + fmtDate(c.dueDate) : ''}"><span class="bad-text" aria-label="Overdue">&#10008;</span>${c.dueDate ? html`<br><span class="muted small">due ${fmtDate(c.dueDate)}</span>` : ''}${part}</td>`;
  if (c.state === 'pending') return html`<td class="center" data-task="${taskKey}" data-state="pending" title="${c.dueDate ? 'Not yet due - due ' + fmtDate(c.dueDate) : 'Not complete, no due date'}">${part}</td>`;
  return html`<td class="center muted" data-task="${taskKey}" data-state="na" title="${c.refi ? 'Refinance: no sellers or agents' : 'Not on this file'}">&ndash;</td>`;
};
const arrows = html`<span class="sort-arrows" aria-hidden="true"><span class="up">&#9650;</span><span class="dn">&#9660;</span></span>`;
const sortTh = (key, label, extra = '') => html`<th data-sort="${key}" class="${extra}"><button type="button" class="th-sort" title="Sort by ${label}">${label} ${arrows}</button></th>`;

export async function render({ api }) {
  const q = new URLSearchParams(location.hash.split('?')[1] || ''); const fs = FILES.some((f) => f[0] === q.get('s')) ? q.get('s') : 'Open';
  const g = await api.getTaskGrid({ fileStatus: fs });
  const groups = TASK_GROUPS.filter(([k]) => k !== 'staff').map(([k, label]) => [k, label, g.rows.filter((r) => r.group === k)]).filter(([, , rs]) => rs.length);
  const tasks = groups.flatMap(([, , rs]) => rs);
  const head = html`<tr data-grid-groups><th colspan="3"></th>${groups.map(([k, label, rs]) => html`<th class="center" colspan="${rs.length}" data-grid-group="${k}">${label}</th>`)}</tr>
    <tr>${sortTh('fileNumber', 'File No')}${sortTh('address', 'Property')}${sortTh('closingDate', 'Closing Date')}${tasks.map((r) => html`<th data-sort="task:${r.key}" data-col-task="${r.key}" class="center"><button type="button" class="th-sort" title="Sort by ${r.label}">${r.title}<br><span class="muted small">${r.roleLabel}</span> ${arrows}</button></th>`)}</tr>`;
  const fileRow = (f) => html`<tr data-file="${f.id}"><th scope="row" class="nowrap"><a href="#/deals/${f.id}/tasks">${f.fileNumber}</a>${isRefi(f) ? html`<br><span class="pill" data-refi-file>Refinance</span>` : ''}</th><td>${f.street}</td>
    <td class="nowrap" data-closing="${f.closingDate || ''}">${f.closingDate ? fmtDate(f.closingDate) : html`<span class="muted">not set</span>`}</td>${tasks.map((r) => cell({ ...(r.cells[f.id] || { state: 'na' }), refi: isRefi(f) && r.group !== 'buyer' }, r.key))}</tr>`;
  const t = g.totals;
  return { title: 'Task grid', crumbs: [['Task Grid']], body: html`
    <div class="page-head"><div><div class="eyebrow">PROCESSOR</div><h2 class="page-title">Task grid</h2>
      <div class="muted">Files down the side, buyer / seller / agent tasks across the top. Click a column header to sort (click again to reverse). ${g.columns.length} file(s) &middot; ${t.done} done &middot; ${t.overdue} overdue &middot; ${t.pending} not yet due.</div></div>
      <div><a class="ghost" href="#/tasks">Task list</a></div></div>
    <ul class="nav-tabs">${FILES.map(([k, label]) => html`<li><a class="${k === fs ? 'active' : ''}" href="#/task-grid?s=${encodeURIComponent(k)}" ${k === fs ? raw('aria-current="page"') : ''}>${label}</a></li>`)}</ul>
    <p class="muted small" data-legend><span class="ok-text">&#10004;</span> completed (date) &nbsp; <span class="bad-text">&#10008;</span> overdue &nbsp; blank = not yet due &nbsp; &ndash; = not on this file. Sorting a task column puts overdue first, then not yet due, then completed.</p>
    ${g.columns.length ? html`<div class="grid-scroll"><table class="tbl" data-taskgrid data-orientation="files-down"><thead>${head}</thead><tbody>${sortGridFiles(g.columns, g.rows, 'fileNumber', 'asc').map(fileRow)}</tbody></table></div>` : html`<p class="muted" data-grid-empty>No files.</p>`}`,
  mount(root) {
    const tb = $('[data-taskgrid] tbody', root); if (!tb) return; let sort = 'fileNumber'; let dir = 'asc';
    const marks = () => $$('th[data-sort]', root).forEach((th) => { const on = th.dataset.sort === sort; if (on) th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
      $('.up', th).classList.toggle('on', on && dir === 'asc'); $('.dn', th).classList.toggle('on', on && dir === 'desc'); });
    const apply = () => { sortGridFiles(g.columns, g.rows, sort, dir).forEach((f) => { const tr = $(`tr[data-file="${f.id}"]`, tb); if (tr) tb.appendChild(tr); }); marks(); };
    $$('th[data-sort] button', root).forEach((b) => b.addEventListener('click', () => { const k = b.closest('th').dataset.sort; dir = k === sort ? (dir === 'asc' ? 'desc' : 'asc') : 'asc'; sort = k; apply(); }));
    marks();
  } };
}
