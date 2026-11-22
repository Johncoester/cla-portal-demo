// Open Tasks (TC-NEW-TASKS-PAGE-1; John, Nov 21 2026): every open task this person has, across all their open files, in one list that
// looks and sorts like Open Orders. For outside users (agents, clients and coordinators on per-file roles) and agent logins. One my_task_list
// read and the order list (for each file's role label and stage) run at the same time. What shows still follows each file's rules.
import { html, fmtDate, pill, $, $$ } from '../ui.js?v=202611161500';
import { STAGES, localDate } from '../data/constants.js?v=202611247700';

const OPEN = ['todo', 'in_progress', 'blocked'];
const TC_LABEL = 'Transaction Coordinator';
const SIDE = { 'Client-Buyer': 'Buyer', 'Client-Seller': 'Seller', 'Buyer Agent': 'Buyer Agent', 'Listing Agent': 'Listing Agent' };
const roleOf = (d, t) => (d && (d.selfRep || d.myRoleLabel === TC_LABEL) ? d.myRoleLabel : (d && SIDE[d.myRole]) || t.myRoleLabel || '');
const COLS = [['due', 'Due'], ['fileNumber', 'File No'], ['address', 'Property Address'], ['role', 'Your Role'], ['title', 'Task'], ['stage', 'Stage']];
const DIR = { due: 'asc', fileNumber: 'asc', address: 'asc', role: 'asc', title: 'asc', stage: 'asc' };
const key = (r, k) => (k === 'due' ? r.dueDate || '9999-12-31' : k === 'stage' ? String(r.stageNo).padStart(2, '0') : String(r[k] || '').toLowerCase());
export const sortOpenTasks = (rows, k, dir) => [...rows].sort((a, b) => { const c = key(a, k).localeCompare(key(b, k)) || key(a, 'due').localeCompare(key(b, 'due')) || String(a.fileNumber).localeCompare(String(b.fileNumber));
  return dir === 'desc' ? -c : c; });
export function openTaskRows(tasks, deals, today) {
  const byId = new Map((deals || []).map((d) => [d.id, d]));
  return (tasks || []).filter((t) => t.mine !== false && OPEN.includes(t.status) && (!t.deal || !t.deal.status || t.deal.status === 'Open')).map((t) => {
    const id = t.dealId || (t.deal && t.deal.id); const d = byId.get(id) || {}; const f = { ...(t.deal || {}), ...d };
    const stageNo = Number(f.stage) || 0;
    return { id: t.id, dealId: id, title: t.title, status: t.status, kind: t.kind, dueDate: t.dueDate || null, overdue: !!(t.overdue || (t.dueDate && t.dueDate < today)),
      fileNumber: f.fileNumber || '', street: f.street || '', city: f.city || '', state: f.state || '', zip: f.zip || '', address: f.street ? `${f.street}, ${f.city}, ${f.state} ${f.zip}` : (f.address || ''),
      role: roleOf(d.id ? d : null, t), stageNo, stage: f.stageName || STAGES[stageNo] || '' };
  });
}
const href = (r) => `#/deals/${r.dealId}/tasks${['form', 'sign', 'agent'].includes(r.kind) ? '/' + r.id : ''}`;

export async function render({ api }) {
  const today = localDate();
  const [tasks, deals] = await Promise.all([api.listMyTasks ? api.listMyTasks({ fileStatus: 'Open' }) : [], api.listDeals({ status: 'Open' }).catch(() => [])]);
  const rows = sortOpenTasks(openTaskRows(tasks, deals, today), 'due', 'asc');
  const files = new Set(rows.map((r) => r.dealId)).size; const late = rows.filter((r) => r.overdue).length;
  const body = html`
    <div class="box-title"><h2><span class="h-ico"></span>Open Tasks</h2></div>
    <div class="table-tools"><span class="muted" data-open-task-count>${rows.length} open task(s) on ${files} file(s)${late ? ` · ${late} overdue` : ''}</span><span class="muted" data-filter-count></span></div>
    <form class="filter-bar" id="tfilters">
      <label>Search<input name="q" type="search" placeholder="File no, address, task"></label>
      <label>Overdue<select name="overdue"><option value="">Any</option><option value="on">Overdue only</option></select></label></form>
    <table class="tbl striped" id="ttable" data-open-tasks><thead><tr>${COLS.map(([k, label]) => html`<th data-sort="${k}"><button type="button" class="th-sort" title="Sort by ${label}">${label} <span class="sort-arrows" aria-hidden="true"><span class="up ${k === 'due' ? 'on' : ''}">&#9650;</span><span class="dn">&#9660;</span></span></button></th>`)}<th></th></tr></thead>
    <tbody>${rows.length ? [...rows.map((r) => html`<tr data-open-task="${r.id}" data-search="${(r.fileNumber + ' ' + r.address + ' ' + r.title).toLowerCase()}" data-overdue="${r.overdue ? '1' : ''}">
      <td class="nowrap">${r.dueDate ? fmtDate(r.dueDate) : html`<span class="muted">-</span>`}${r.overdue ? html`<br>${pill('overdue', 'bad')}` : ''}</td>
      <td><a href="#/deals/${r.dealId}">${r.fileNumber}</a></td><td>${r.street ? html`${r.street},<br>${r.city}, ${r.state}, ${r.zip}` : r.address}</td>
      <td data-open-task-role>${r.role}</td><td><a href="${href(r)}" data-open-task-link>${r.title}</a>${r.status === 'in_progress' ? html` ${pill('started', 'info')}` : ''}</td>
      <td>${r.stage}</td><td><a class="view-btn" href="${href(r)}">Open Task</a></td></tr>`), html`<tr data-nomatch hidden><td colspan="7" class="muted center">No open tasks match your search.</td></tr>`]
      : html`<tr data-empty><td colspan="7" class="muted center">Nothing needed from you right now.</td></tr>`}</tbody></table>`;
  return { title: 'Open Tasks', crumbs: [['Open Tasks']], body, mount(root) {
    const form = $('#tfilters', root); const tbody = $('tbody', root); let sort = 'due'; let dir = 'asc';
    const apply = () => { const f = new FormData(form); const q = String(f.get('q') || '').trim().toLowerCase(); const od = f.get('overdue') === 'on'; let shown = 0;
      sortOpenTasks(rows, sort, dir).forEach((r) => { const tr = $(`tr[data-open-task="${r.id}"]`, tbody); if (!tr) return; tbody.insertBefore(tr, $('[data-nomatch]', tbody));
        tr.hidden = !((!q || tr.dataset.search.includes(q)) && (!od || tr.dataset.overdue)); if (!tr.hidden) shown += 1; });
      const none = $('[data-nomatch]', root); if (none) none.hidden = shown > 0 || !rows.length;
      $('[data-filter-count]', root).textContent = shown === rows.length ? '' : `${shown} shown`; };
    form.addEventListener('submit', (e) => e.preventDefault()); form.addEventListener('input', apply); form.addEventListener('change', apply);
    $$('th[data-sort] button', root).forEach((b) => b.addEventListener('click', () => { const k = b.closest('th').dataset.sort;
      dir = k === sort ? (dir === 'asc' ? 'desc' : 'asc') : DIR[k]; sort = k;
      $$('th[data-sort]', root).forEach((th) => { const on = th.dataset.sort === sort; $('.up', th).classList.toggle('on', on && dir === 'asc'); $('.dn', th).classList.toggle('on', on && dir === 'desc'); });
      apply(); }));
  } };
}
