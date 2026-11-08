// Cross-file task list with filters, sort and Buyer / Seller / Agent grouping (Matt, Nov 2). Used by the Tasks page and the Processor's Work Queue.
// Filtering happens in the browser on what the adapter returned (listAllTasks already applies the person's access). Existing styles only.
import { html, $, $$, toText, fmtDate, pill, options } from '../ui.js?v=202611070139';
import { filterTasks, sortTasks, groupTasks, isOverdue, TASK_SORTS, TASK_GROUPS, roleShort } from '../data/task-board.js?v=202611070139';
import { CLS, LABEL } from './dealtasks.js?v=202611082000';

const STATUS_OPTS = [['open', 'Incomplete (to do, started, blocked)'], ['done', 'Completed'], ['blocked', 'Blocked'], ['cancelled', 'Cancelled'], ['all', 'All statuses']];
const FILE_OPTS = [['Open', 'Open files'], ['On Hold', 'On-hold files'], ['Closed', 'Closed files'], ['Cancelled', 'Cancelled files'], ['All', 'All files']];
const WHO_OPTS = [['', 'Everyone'], ['group:buyer', 'Buyer'], ['group:seller', 'Seller'], ['group:agent', 'Agents (both)'], ['role:Buyer Agent', "Buyer's agent"], ['role:Listing Agent', 'Listing agent'], ['group:staff', 'CLA staff']];
export const BOARD_DEFAULTS = { q: '', status: 'open', fileStatus: 'Open', who: '', overdue: false, dueFrom: '', dueTo: '', closingFrom: '', closingTo: '', sort: 'dueDate', dir: 'asc', groupBy: 'side' };
const pairs = (list, sel) => options(list, sel, (o) => o[1], (o) => o[0]);
const toFilter = (s) => ({ ...s, group: s.who.startsWith('group:') ? s.who.slice(6) : '', role: s.who.startsWith('role:') ? s.who.slice(5) : '' });

export function boardForm(s, id = 'tboard') {
  return html`<form class="filter-bar" id="${id}" data-taskfilters>
    <label>Search<input type="search" name="q" value="${s.q}" placeholder="File no, address, name, task"></label>
    <label>Task status<select name="status">${pairs(STATUS_OPTS, s.status)}</select></label>
    <label>Files<select name="fileStatus">${pairs(FILE_OPTS, s.fileStatus)}</select></label>
    <label>Side / role<select name="who">${pairs(WHO_OPTS, s.who)}</select></label>
    <label>Due from<input type="date" name="dueFrom" value="${s.dueFrom}"></label><label>Due to<input type="date" name="dueTo" value="${s.dueTo}"></label>
    <label>Closing from<input type="date" name="closingFrom" value="${s.closingFrom}"></label><label>Closing to<input type="date" name="closingTo" value="${s.closingTo}"></label>
    <label>Sort by<select name="sort">${pairs(TASK_SORTS, s.sort)}</select></label>
    <label>Order<select name="dir">${pairs([['asc', 'Ascending'], ['desc', 'Descending']], s.dir)}</select></label>
    <label>Group<select name="groupBy">${pairs([['side', 'Buyer / Seller / Agent'], ['none', 'No grouping']], s.groupBy)}</select></label>
    <label>Overdue<select name="overdue">${pairs([['', 'Any'], ['on', 'Overdue only']], s.overdue ? 'on' : '')}</select></label>
    <label><button type="button" class="ghost" data-clear>Clear filters</button></label></form>`;
}
const taskLink = (t) => (t.kind === 'form' || t.kind === 'sign' ? `#/deals/${t.dealId}/tasks/${t.id}` : `#/deals/${t.dealId}/tasks`);
const row = (t, today) => { const od = isOverdue(t, today);
  return html`<tr data-task="${t.id}" data-group="${t.group}" class="${t.status === 'done' || t.status === 'cancelled' ? 'is-done' : ''}">
    <td><a href="${taskLink(t)}">${t.title}</a></td><td class="nowrap"><a href="#/deals/${t.dealId}" data-file>${t.deal.fileNumber}</a></td><td>${t.deal.address}</td>
    <td>${t.personName || roleShort(t.assignedRole)}${t.personName ? html`<br><span class="muted small">${roleShort(t.assignedRole)}</span>` : ''}</td>
    <td class="nowrap ${od ? 'bad-text' : ''}">${fmtDate(t.dueDate)}${od ? html`<br>${pill('overdue', 'bad')}` : ''}</td><td class="nowrap">${fmtDate(t.deal.closingDate) || html`<span class="muted">TBD</span>`}</td>
    <td>${pill(LABEL[t.status] || t.status, CLS[t.status])}${t.status === 'done' && t.completedAt ? html`<br><span class="muted small">${fmtDate(String(t.completedAt).slice(0, 10))}</span>` : ''}</td></tr>`; };
const table = (list, today) => html`<table class="tbl striped"><thead><tr><th>Task</th><th>File No</th><th>Property Address</th><th>Who</th><th>Due</th><th>Closing</th><th>Status</th></tr></thead>
  <tbody>${list.map((t) => row(t, today))}</tbody></table>`;

export function boardResults(tasks, s, today) {
  const list = sortTasks(filterTasks(tasks, toFilter(s), today), s.sort, s.dir);
  const head = html`<p class="muted" data-board-count>${list.length} task(s)${list.filter((t) => isOverdue(t, today)).length ? ` · ${list.filter((t) => isOverdue(t, today)).length} overdue` : ''}</p>`;
  if (!list.length) return html`${head}<p class="muted center" data-board-empty>No tasks match these filters.</p>`;
  if (s.groupBy === 'none') return html`${head}${table(list, today)}`;
  const groups = groupTasks(list, TASK_GROUPS).filter((g) => g.tasks.length || g.key !== 'staff');
  return html`${head}${groups.map((g) => html`<section class="role-group" data-taskgroup="${g.key}"><h3 class="group-title">${g.label} <span class="muted small" data-count>${g.tasks.length} task(s)</span></h3>
    ${g.tasks.length ? table(g.tasks, today) : html`<p class="muted">None.</p>`}</section>`)}`;
}
// wire a board rendered as boardForm + <div data-board-results>; re-renders the results on every change (no reload, nothing saved)
export function mountBoard(root, tasks, today, initial = BOARD_DEFAULTS) {
  const form = $('[data-taskfilters]', root); const out = $('[data-board-results]', root); if (!form || !out) return;
  const read = () => { const f = new FormData(form); const s = { ...BOARD_DEFAULTS }; for (const k of Object.keys(BOARD_DEFAULTS)) if (k !== 'overdue') s[k] = String(f.get(k) ?? s[k]); s.overdue = f.get('overdue') === 'on'; return s; };
  const draw = () => { out.innerHTML = toText(boardResults(tasks, read(), today)); };
  form.addEventListener('submit', (e) => e.preventDefault()); form.addEventListener('input', draw); form.addEventListener('change', draw);
  $('[data-clear]', form).addEventListener('click', () => { for (const el of $$('input,select', form)) { const k = el.name; if (!k) continue;
    el.value = k === 'overdue' ? (initial.overdue ? 'on' : '') : initial[k] ?? ''; } draw(); });
}
