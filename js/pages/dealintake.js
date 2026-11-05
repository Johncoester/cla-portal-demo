// INTAKE BY PERSON (Matt, Nov 3 (b), note 10: "combine buyers', sellers' and agents' tasks so they can be opened as a user and each individual section
// doesn't need to be opened to see all the intake sections for each user"). Order -> Tasks -> "Intake by person" (#/deals/<id>/tasks?view=people).
// One expandable block per person on the order (each buyer, each seller, the buyer's agent, the listing agent): name, role, entity (if any), how many of
// their tasks are done / overdue, and EVERY one of their intake sections with its status and answers on one page (no need to open each form).
// Same data and permissions as the task pages: listTasks + getTask / getAgentTask (answers only where the viewer may already read them, bank
// numbers masked as before). Expand all / Collapse all; everything starts expanded.
import { html, $, $$, fmtDate, fmtDateTime, pill } from '../ui.js?v=202611052122';
import { fieldActive, fieldsForRole } from '../data/templates.js?v=202611052122';
import { localDate, fmtPhone, isRefi } from '../data/constants.js?v=202611052122';
import { CLS, LABEL } from './dealtasks.js?v=202611052122';
import { entityLine } from './deal.js?v=202611052122';

const ORDER = ['Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent'];
const ROLE_NAME = { 'Client-Buyer': 'Buyer', 'Client-Seller': 'Seller', 'Buyer Agent': "Buyer's agent", 'Listing Agent': 'Listing agent' };
const open = (t) => ['todo', 'in_progress', 'blocked'].includes(t.status);
const human = (k) => String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
// agent-task answers are nested (clients, commissions, fees ...): shown as a flat list, never edited here
function flat(v, prefix = '') {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.flatMap((x, i) => flat(x, `${prefix} ${i + 1}`));
  if (typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => flat(x, prefix ? `${prefix} \u00b7 ${human(k)}` : human(k)));
  return [[prefix.trim(), v === true ? 'Yes' : v === false ? 'No' : String(v)]];
}
function formAnswers(t) {
  if (t.formHidden) return html`<p class="muted small" data-answers-hidden>Answers are visible to the person, their own agent (where allowed) and CLA Title.</p>`;
  const v = t.formData || {}; const docName = (id) => ((t.documents || []).find((z) => z.id === id) || {}).name || 'attached';
  const fields = fieldsForRole(t.fields || [], t.assignedRole).filter((f) => f.type !== 'info' && fieldActive(f, v) && v[f.k] !== undefined && v[f.k] !== '');
  if (!fields.length) return html`<p class="muted small" data-no-answers>No answers yet.</p>`;
  return html`${t.maskedAnswers ? html`<p class="muted small">Bank account numbers show the last 4 digits only.</p>` : ''}<dl class="answers" data-answers>${fields.map((f) => html`<dt>${f.label}</dt><dd>${f.type === 'checkbox' ? 'Yes' : f.type === 'doc' ? docName(v[f.k]) : f.type === 'phone' ? fmtPhone(v[f.k]) : v[f.k]}</dd>`)}</dl>`;
}
function agentAnswers(t) {
  if (!t || t.answersHidden || !t.answers) return html`<p class="muted small" data-answers-hidden>Answers are not shown to you.</p>`;
  if (!(t.submitted || t.savedAt)) return html`<p class="muted small" data-no-answers>Not submitted yet.</p>`;
  const rows = flat(t.answers); return rows.length ? html`<dl class="answers" data-answers>${rows.map(([k, x]) => html`<dt>${k}</dt><dd>${x}</dd>`)}</dl>` : html`<p class="muted small" data-no-answers>No answers yet.</p>`;
}

export async function render({ api, deal }) {
  const tasks = (await api.listTasks(deal.id)).filter((t) => t.participantId && ORDER.includes(t.assignedRole) && t.status !== 'cancelled');
  // full detail of every intake section (fields + answers), in parallel; one that cannot be read is listed with its status only
  const full = new Map(await Promise.all(tasks.map(async (t) => { try { return [t.id, t.kind === 'agent' ? await api.getAgentTask(t.id) : t.kind === 'form' ? await api.getTask(t.id) : t]; } catch (e) { return [t.id, t]; } })));
  const today = localDate(); const parts = deal.participants || [];
  // Refinance (John, Nov 3): the Client-Buyer rows are the BORROWERS; there are no seller or agent sections (none can be added to a refinance)
  const refi = isRefi(deal); const roleName = (r) => (refi && r === 'Client-Buyer' ? 'Borrower' : ROLE_NAME[r]);
  const people = new Map(); tasks.forEach((t) => { const k = t.participantId; if (!people.has(k)) people.set(k, { pid: k, role: t.assignedRole, name: t.ownerName || roleName(t.assignedRole), tasks: [] }); people.get(k).tasks.push(t); });
  const list = [...people.values()].sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  const section = (t) => { const f = full.get(t.id) || t; const late = open(t) && t.dueDate && t.dueDate < today;
    return html`<div class="intake-form" data-intake-task="${t.id}"><strong>${t.title}</strong> ${pill(LABEL[t.status], CLS[t.status])}${late ? html` ${pill('overdue', 'bad')}` : ''}
      <span class="muted small">${t.dueDate ? `due ${fmtDate(t.dueDate)}` : ''}${t.status === 'done' && t.completedAt ? ` \u00b7 completed ${fmtDateTime(t.completedAt)}` : ''}</span>
      <a class="ghost small" href="#/deals/${deal.id}/tasks/${t.id}">Open</a>
      ${t.completedByLabel ? html`<br><span class="muted small done-by">${t.completedByLabel}</span>` : ''}
      ${t.kind === 'form' ? formAnswers(f) : t.kind === 'agent' ? agentAnswers(f) : ''}</div>`; };
  const block = (p) => { const done = p.tasks.filter((t) => t.status === 'done').length; const late = p.tasks.filter((t) => open(t) && t.dueDate && t.dueDate < today).length;
    const part = parts.find((z) => z.id === p.pid);
    return html`<details class="intake-party" data-intake-party="${p.pid}" data-role="${p.role}" open><summary><strong>${p.name}</strong> &middot; ${roleName(p.role)}
      &middot; <span data-progress>${done} of ${p.tasks.length} done</span>${late ? html` ${pill(late + ' overdue', 'bad')}` : ''}${part && part.entity ? html` &middot; <span class="muted">entity: ${part.entity.name}</span>` : ''}</summary>
      ${part && part.entity ? entityLine(part.entity) : ''}${p.tasks.map(section)}</details>`; };
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Intake by person</h2><a class="ghost right" href="#/deals/${deal.id}/tasks">Task list</a></div>
    <p class="muted">${refi ? html`<span data-refi-intake>Refinance: every borrower on this order (no sellers or agents)</span>` : 'Every buyer, seller and agent on this order'} with all of their intake sections and answers in one place. Click a name to collapse or expand it.</p>
    <p><button type="button" class="ghost" data-expand="1">Expand all</button> <button type="button" class="ghost" data-expand="0">Collapse all</button></p>
    ${list.length ? list.map(block) : html`<p class="muted" data-no-people>${refi ? 'No borrower tasks on this order yet.' : 'No buyer, seller or agent tasks on this order yet.'}</p>`}`;
  return { title: 'Intake by person', crumbs: [['All Tasks', `#/deals/${deal.id}/tasks`], ['Intake by person']], body, mount(root) {
    $$('[data-expand]', root).forEach((b) => b.addEventListener('click', () => $$('details.intake-party', root).forEach((d) => { d.open = b.dataset.expand === '1'; })));
  } };
}
