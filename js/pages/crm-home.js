// crm-home.js : CRM Home (Zoho Classic View: task list widget, Today's Leads, Amount by Stage) and the Task / Meeting detail pages (John, Nov 2).
// Function first, minimal styling. Reminders show in the portal only; nothing is emailed; meetings are never sent as invitations.
import { html, raw, $, $$, guard, toast, toText, fmtDate, fmtDateTime, fmtMoney, pill } from '../ui.js?v=202611070139';
import { localDate } from '../data/constants.js?v=202611101015';
import { HOME_TASK_FILTERS, HOME_TASK_DEFAULT, homeTaskFilter, sortTasks, amountByStage, entityLabel, REPEAT_EVERY, dueTone, daysOverdue, taskOpen } from '../data/crm.js?v=202611070139';
import { tabs, head } from './crm-kit.js?v=202611102745';
import { taskModal, meetingModal, fmtWhen } from './crm-forms.js?v=202611102745';
import { inviteBtn, invitePreview } from './crm-janine.js?v=202611102745';
import { optionsOf, optLabel } from '../data/crm-config.js?v=202611070139';
import { lbl } from './crm-custom.js?v=202611070139';
const subj = (cfg, s) => optLabel(cfg, 'taskSubject', s, { mark: false });   // Task Subject is free text; a subject that is a list option shows its current name
const orderOf = (cfg) => ({ priority: optionsOf(cfg, 'taskPriority').map((o) => o.value), status: optionsOf(cfg, 'taskStatus').map((o) => o.value) });

const crumbs = (label, extra) => [['CRM', '#/crm'], ...(extra ? [[label, extra[0]], [extra[1]]] : [[label]])];
const SS = (k, v) => { try { if (v === undefined) return sessionStorage.getItem('crm-home:' + k); sessionStorage.setItem('crm-home:' + k, v); } catch (e) { return null; } return null; };
const TASK_COLS = [['dueDate', 'Due Date'], ['subject', 'Subject'], ['relatedTo', 'Related To'], ['contactName', 'Contact Name'], ['status', 'Status'], ['priority', 'Priority']];
const LEADS_PER_PAGE = 5;

// ---------------- HOME ----------------
export async function homePage({ api, me, params, cfg, refresh, assignees }) {
  const [tasks, leads, opps, callRem] = await Promise.all([api.listCrmTasks(), api.listCrmLeads(), api.listCrmOpportunities(), api.listCrmCallReminders ? api.listCrmCallReminders().catch(() => []) : []]);   // video 11: call reminders (recorded only)
  const today = localDate(); const todayLeads = leads.filter((l) => !l.archived && localDay(l.createdAt) === today).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const so = optionsOf(cfg, 'oppStage'); const stages = amountByStage(opps, so.map((o) => o.value), so.filter((o) => o.retired).map((o) => o.value)); const max = Math.max(1, ...stages.map((s) => s.amount));
  const reminders = tasks.filter((t) => t.reminderDue && (t.ownerId === me.id));
  const body = html`${head('CRM: Home', me)}${tabs('home')}
    ${params.section === 'followups' ? html`<p class="muted small" data-followups-moved>My follow-ups are now the tasks on CRM Home ("My Open Tasks").</p>` : ''}
    ${reminders.length ? html`<p class="card" data-reminders>${pill('Reminder', 'warn')} ${reminders.length} task reminder(s) due: ${reminders.map((t, i) => html`${i ? ', ' : ''}<a href="#/crm/tasks/${t.id}">${subj(cfg, t.subject)}</a>`)} <span class="muted small">(shown in the portal only; never emailed)</span></p>` : ''}
    ${callRem.length ? html`<p class="card" data-call-reminders>${pill('Reminder', 'warn')} ${callRem.length} call reminder(s) due: ${callRem.map((a, i) => html`${i ? ', ' : ''}<a href="#/crm/calls/${a.id}" data-call-reminder-link="${a.id}">${a.subject}</a> <span class="muted small">(${String(a.callStart || '').replace('T', ' ')})</span>`)} <span class="muted small">(shown in the portal only; nothing is sent)</span></p>` : ''}
    <div class="card" data-home-tasks><h3><select data-task-filter aria-label="Task view">${HOME_TASK_FILTERS.map((f) => html`<option value="${f}">${f}</option>`)}</select> <span class="muted small" data-task-count></span></h3>
      <table class="tbl" id="home-tasks"><thead><tr>${TASK_COLS.map(([k, l]) => html`<th><a href="#" data-sort="${k}">${l}</a> <span class="muted small" data-sort-mark="${k}"></span></th>`)}<th></th></tr></thead><tbody></tbody></table></div>
    <div class="card" data-home-leads><h3>Today's Leads <a class="right small" href="#/crm/leads" data-view-all>View All</a></h3>
      <table class="tbl" id="home-leads"><thead><tr><th>Lead Name</th><th>Company</th><th>Email</th><th>Lead Source</th></tr></thead><tbody></tbody></table>
      <p><button class="ghost" data-leads-prev>&lsaquo; Prev</button> <span class="muted small" data-leads-page></span> <button class="ghost" data-leads-next>Next &rsaquo;</button></p></div>
    <div class="card" data-home-stages><h3>Amount by Stage</h3>
      <table class="tbl" id="home-stages"><thead><tr><th>Stage</th><th>Opportunities</th><th>Amount (est. yearly volume)</th><th style="width:40%"></th></tr></thead><tbody>
      ${stages.map((s) => html`<tr data-stage-row="${s.stage}"><td>${lbl(cfg, 'oppStage', s.stage)}</td><td>${s.count}</td><td data-amount>${fmtMoney(s.amount)}</td><td><div class="bar" style="background:#7FB539;height:12px;width:${Math.round((s.amount / max) * 100)}%"></div></td></tr>`)}</tbody></table>
      <p class="muted small">From the referral-partner pipeline (open the <a href="#/crm/pipeline">Pipeline</a>). Archived opportunities are left out.</p></div>`;
  return { title: 'CRM Home', crumbs: crumbs('Home'), body, mount(root) {
    const fsel = $('[data-task-filter]', root); fsel.value = HOME_TASK_FILTERS.includes(SS('filter')) ? SS('filter') : HOME_TASK_DEFAULT;
    let [sk, sd] = (SS('sort') || 'dueDate:asc').split(':');
    const draw = () => { SS('filter', fsel.value); SS('sort', `${sk}:${sd}`);
      const list = sortTasks(homeTaskFilter(tasks, fsel.value, me.id, today), sk, sd, orderOf(cfg)); SS('order', JSON.stringify(list.map((t) => t.id)));
      const dueCell = (t) => { const tone = dueTone(t.dueDate, today, taskOpen(t)); const late = tone === 'overdue' ? daysOverdue(t.dueDate, today) : 0;
        return html`<span class="due-${tone}" data-due-tone="${tone}">${t.dueDate ? fmtDate(t.dueDate) : 'No due date'}${late ? html` <span data-days-overdue="${late}">${late} day${late === 1 ? '' : 's'} overdue</span>` : ''}</span>`; };
      $('#home-tasks tbody', root).innerHTML = toText(list.length ? list.map((t) => html`<tr data-task="${t.id}" class="${dueTone(t.dueDate, today, taskOpen(t)) === 'overdue' ? 'overdue' : ''}">
        <td data-col="dueDate">${dueCell(t)}</td>
        <td data-col="subject"><a href="#/crm/tasks/${t.id}" data-task-subject>${subj(cfg, t.subject)}</a>${t.reminderDue ? html` ${pill('Reminder', 'warn')}` : ''}</td>
        <td data-col="relatedTo">${t.relatedLink ? html`<a href="${t.relatedLink}">${t.relatedTo}</a>` : t.relatedTo || ''}</td>
        <td data-col="contactName">${t.contactLink && t.contactName ? html`<a href="${t.contactLink}">${t.contactName}</a>` : t.contactName || ''}</td>
        <td data-col="status">${lbl(cfg, 'taskStatus', t.status)}</td><td data-col="priority">${lbl(cfg, 'taskPriority', t.priority)}</td>
        <td data-col="actions">${me.canEdit && !t.system ? html`<button type="button" class="ghost" data-quick-edit="${t.id}">Edit</button>${t.open ? html` <button type="button" class="ghost" data-quick-close="${t.id}">Close</button>` : ''}` : ''}</td></tr>`) : html`<tr><td colspan="7" class="muted">No tasks in this view.</td></tr>`);
      $('[data-task-count]', root).textContent = `${list.length} task(s)`;
      $$('[data-sort-mark]', root).forEach((s) => { s.innerHTML = s.dataset.sortMark === sk ? (sd === 'asc' ? '&uarr;' : '&darr;') : ''; }); };
    fsel.addEventListener('change', draw);
    $('#home-tasks', root).addEventListener('click', guard(async (e) => {
      const edit = e.target.closest('[data-quick-edit]'); const close = e.target.closest('[data-quick-close]');
      if (!edit && !close) return;
      const id = (edit || close).dataset.quickEdit || (edit || close).dataset.quickClose;
      const t = tasks.find((z) => z.id === id); if (!t || !me.canEdit || t.system) return;
      if (edit) { taskModal(api, { entity: t.entity, entityId: t.entityId, parentName: t.relatedTo || t.contactName, me, assignees: assignees || [], cfg }, t, () => refresh()); return; }
      await api.closeCrmTask(t.id); toast('Task closed'); refresh();
    }));
    $$('[data-sort]', root).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const k = a.dataset.sort; if (k === sk) sd = sd === 'asc' ? 'desc' : 'asc'; else { sk = k; sd = 'asc'; } draw(); }));
    draw();
    let page = 0; const pages = Math.max(1, Math.ceil(todayLeads.length / LEADS_PER_PAGE));
    const drawLeads = () => { const slice = todayLeads.slice(page * LEADS_PER_PAGE, (page + 1) * LEADS_PER_PAGE);
      $('#home-leads tbody', root).innerHTML = toText(slice.length ? slice.map((l) => html`<tr data-lead-row="${l.id}"><td><a href="#/crm/leads/${l.id}">${l.name}</a></td><td>${l.company}</td><td>${l.email}</td><td>${l.leadSource}</td></tr>`) : html`<tr><td colspan="4" class="muted">No leads created today.</td></tr>`);
      $('[data-leads-page]', root).textContent = `${todayLeads.length ? page * LEADS_PER_PAGE + 1 : 0}-${Math.min(todayLeads.length, (page + 1) * LEADS_PER_PAGE)} of ${todayLeads.length}`;
      $('[data-leads-prev]', root).disabled = page === 0; $('[data-leads-next]', root).disabled = page >= pages - 1; };
    $('[data-leads-prev]', root).addEventListener('click', () => { if (page > 0) { page -= 1; drawLeads(); } });
    $('[data-leads-next]', root).addEventListener('click', () => { if (page < pages - 1) { page += 1; drawLeads(); } });
    drawLeads(); } };
}
const localDay = (iso) => { const d = new Date(iso); if (isNaN(d)) return ''; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

// ---------------- TASK detail (Zoho: Edit, Close Task, prev / next) ----------------
export async function taskPage({ api, me, assignees, params, refresh, go, cfg }) {
  const t = await api.getCrmTask(params.id);
  let order = []; try { order = JSON.parse(SS('order') || '[]'); } catch (e) { order = []; }
  if (!order.includes(t.id)) order = sortTasks(await api.listCrmTasks(), 'dueDate', 'asc', orderOf(cfg)).map((x) => x.id);
  const i = order.indexOf(t.id); const prev = i > 0 ? order[i - 1] : null; const next = i >= 0 && i < order.length - 1 ? order[i + 1] : null;
  const rep = t.repeatEvery ? `${(REPEAT_EVERY.find(([k]) => k === t.repeatEvery) || [, t.repeatEvery])[1]}${t.repeatUntil ? ', until ' + fmtDate(t.repeatUntil) : ''}` : 'No';
  const body = html`${head(`Task: ${subj(cfg, t.subject)}`, me)}${tabs('home')}
    <div class="card" data-task-detail="${t.id}">
      <p>${me.canEdit && !t.system ? html`<button class="ghost" data-edit-task>Edit</button> ${t.open ? html`<button class="m-btn" data-close-task>Close Task</button> ` : ''}` : ''}
        ${prev ? html`<a class="ghost" href="#/crm/tasks/${prev}" data-prev>&lsaquo; Previous</a>` : html`<span class="muted" data-prev-none>&lsaquo; Previous</span>`}
        ${next ? html`<a class="ghost" href="#/crm/tasks/${next}" data-next>Next &rsaquo;</a>` : html`<span class="muted" data-next-none>Next &rsaquo;</span>`} <a class="ghost" href="#/crm">Back to Home</a></p>
      <dl class="kv" data-task-fields>
        <dt>Task Owner</dt><dd data-f="owner">${t.ownerName}</dd><dt>Due Date</dt><dd data-f="dueDate">${fmtDate(t.dueDate)}${t.overdue ? html` ${pill('Overdue', 'bad')}` : ''}</dd>
        <dt>Subject</dt><dd data-f="subject">${subj(cfg, t.subject)}</dd><dt>Priority</dt><dd data-f="priority">${lbl(cfg, 'taskPriority', t.priority)}</dd><dt>Status</dt><dd data-f="status">${lbl(cfg, 'taskStatus', t.status)}${t.cancelled ? ' (cancelled)' : ''}</dd>
        <dt>Related To</dt><dd data-f="relatedTo">${t.relatedLink ? html`<a href="${t.relatedLink}">${t.relatedTo}</a>` : t.relatedTo || '—'}</dd>
        <dt>Contact Name</dt><dd data-f="contactName">${t.contactName ? html`<a href="${t.contactLink}">${t.contactName}</a>` : '—'} <span class="muted small">(${entityLabel(t.entity)})</span></dd>
        <dt>Created By</dt><dd>${t.createdByName}, ${fmtDateTime(t.createdAt)}</dd><dt>Modified By</dt><dd data-f="modifiedBy">${t.modifiedByName || t.createdByName}, ${fmtDateTime(t.modifiedAt || t.createdAt)}</dd>
        <dt>Closed Time</dt><dd data-f="closedTime">${t.closedAt ? fmtDateTime(t.closedAt) : '—'}</dd>
        <dt>Reminder</dt><dd data-f="reminder">${t.reminder ? html`${fmtWhen(t.reminderAt)}${t.reminderDue ? html` ${pill('Due', 'warn')}` : ''} <span class="muted small">(in the portal only; never emailed)</span>` : 'None'}</dd>
        <dt>Repeat</dt><dd data-f="repeat">${rep}</dd><dt>Description</dt><dd data-f="description">${t.body || '—'}</dd></dl></div>`;
  return { title: 'Task ' + t.subject, crumbs: crumbs('Home', ['#/crm', t.subject]), body, mount(root) {
    const e = $('[data-edit-task]', root); if (e) e.addEventListener('click', () => taskModal(api, { entity: t.entity, entityId: t.entityId, parentName: t.parentName, me, assignees, cfg }, t, () => refresh()));
    const c = $('[data-close-task]', root); if (c) c.addEventListener('click', guard(async () => { const r = await api.closeCrmTask(t.id); toast(r.nextTaskId ? 'Task closed; next occurrence created' : 'Task closed'); refresh(); })); } };
}

// ---------------- MEETING detail ----------------
export async function meetingPage({ api, me, assignees, params, refresh, cfg }) {
  const m = await api.getCrmMeeting(params.id);
  const body = html`${head(`Meeting: ${m.subject}`, me)}${tabs('home')}
    <div class="card" data-meeting-detail="${m.id}">
      <p>${me.canEdit ? html`<button class="ghost" data-edit-meeting>Edit</button> ${inviteBtn(me)} ` : ''}<a class="ghost" href="${m.parentLink}">Back to ${m.parentName}</a></p>
      <dl class="kv" data-meeting-fields>
        <dt>Title</dt><dd data-f="title">${m.subject}</dd><dt>Type</dt><dd data-f="type">${lbl(cfg, 'meetingType', m.meetingType) || '—'}</dd><dt>Location</dt><dd>${m.location || '—'}</dd>
        <dt>From</dt><dd data-f="from">${fmtWhen(m.startsAt)}</dd><dt>To</dt><dd data-f="to">${fmtWhen(m.endsAt)}</dd><dt>All Day</dt><dd>${m.allDay ? 'Yes' : 'No'}</dd>
        <dt>Host</dt><dd data-f="host">${m.hostName}</dd>
        <dt>Participants</dt><dd data-f="participants">${m.participants.length ? m.participants.map((p, k) => html`${k ? ', ' : ''}${p.link ? html`<a href="${p.link}">${p.name}</a>` : p.name} <span class="muted small">(${p.label})</span>`) : '—'}</dd>
        <dt>${entityLabel(m.entity)}</dt><dd><a href="${m.parentLink}">${m.parentName}</a></dd>
        <dt>Status</dt><dd>${m.open ? 'Upcoming' : 'Held'}</dd>
        <dt>Created By</dt><dd>${m.createdByName}, ${fmtDateTime(m.createdAt)}</dd><dt>Modified By</dt><dd>${m.modifiedByName || m.createdByName}, ${fmtDateTime(m.modifiedAt || m.createdAt)}</dd>
        <dt>Description</dt><dd>${m.body || '—'}</dd></dl>
      <p class="muted small">Recorded in the portal only: no invitations were sent and nothing was added to any calendar. "Send invite" shows a preview and an .ics file; sending turns on once Gmail is connected.</p></div>`;
  return { title: 'Meeting ' + m.subject, crumbs: crumbs('Home', ['#/crm', m.subject]), body, mount(root) {
    const e = $('[data-edit-meeting]', root); if (e) e.addEventListener('click', guard(() => meetingModal(api, { entity: m.entity, entityId: m.entityId, parentName: m.parentName, me, assignees, cfg }, m, () => refresh())));
    const si = $('[data-send-invite]', root); if (si) si.addEventListener('click', guard(() => invitePreview(api, m.id))); } };
}
