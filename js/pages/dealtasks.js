// Tasks tab. Intake forms are per-participant copies of a versioned template (open them to fill in). Simple tasks are ticked.
// Processor + transaction coordinator manage tasks and queue reminders (outbox only, never sent). Tasks are cancelled, never deleted.
// Matt, Nov 9: processors get a denser list (more rows on screen), one Expand all that opens every buyer and seller intake
// section for editing on this page, and a green / navy / red cue for done / open / overdue. Buyer, seller and agent lists stay the same shape.
import { html, raw, $, $$, guard, formData, modal, closeModal, options, fmtDate, pill, toast, toText } from '../ui.js?v=202611161500';
import { runsOrders, DEAL_ROLES as ROLES, isProcessor, localDate, isRefi } from '../data/constants.js?v=202611101015';
import { boxTasks, boxOfRole, tasksForViewer } from '../data/task-board.js?v=202611140100';
import { isPortalTask, taskLaneOf } from '../data/nov5-rules.js?v=202611131900';
import { taskOpenHref } from '../data/task-actions.js?v=202611141400';
import { ssnStaff } from '../data/buyer-ssn.js?v=202611120200';

export const CLS = { todo: 'info', in_progress: 'info', done: 'ok', blocked: 'warn', cancelled: '' };
export const LABEL = { todo: 'to do', in_progress: 'started', done: 'done', blocked: 'blocked', cancelled: 'cancelled' };

let intakeDeal = '';
const intakeOpen = new Set();

export async function render(ctx) {
  const { api, user, deal, refresh } = ctx;
  if (intakeDeal !== deal.id) { intakeDeal = deal.id; intakeOpen.clear(); }
  // Matt, Nov 3 (b): "Intake by person" = every buyer / seller / agent with all their intake sections and answers on one page (dealintake.js)
  if (new URLSearchParams(location.hash.split('?')[1] || '').get('view') === 'people') return (await import('./dealintake.js?v=202611161500')).render(ctx);
  const { isPureClient, isPureSeller, agreementTasks, tasksWithLenderOnFile } = await import('./client-overview.js?v=202611161500');
  const allTasks = tasksWithLenderOnFile(await api.listTasks(deal.id), deal);
  const taskQuery = new URLSearchParams(location.hash.split('?')[1] || '');
  const mineOnly = taskQuery.get('mine') === '1';
  const focusSection = taskQuery.get('section') || '';
  // BUYER (Nov 4 call): the agreements are to-dos that open the agreement (no Agreements tab for the buyer); the buyer never gets a Listing Agent box (listing agent never shown)
  // SELLER MIRROR (Nov 4): the pure seller gets the same To-do list (agreements as to-dos) and never a Buyer's Agent box (the buyer's agent is never shown to the seller)
  const pure = user.accountRole && isPureClient(user); const hideBox = pure ? (isPureSeller(user) ? 'buyer-agent' : 'listing-agent') : null;
  // CLIENT TASK PRIVACY (Matt, Nov 5, live40): a buyer / seller only ever sees tasks assigned to them (the adapter already filters; this is the UI guard),
  // only their own side's box, and "You're all caught up" once nothing is left. Never the other parties' boxes or tasks.
  const manage = runsOrders(user) || user.role === 'Transaction Coordinator';
  const dense = manage && !pure;
  const productionView = !pure && new URLSearchParams(location.hash.split('?')[1] || '').get('lane') === 'production';
  const laneTasks = pure ? allTasks : allTasks.filter((t) => (productionView ? taskLaneOf(t) === 'production' : isPortalTask(t)));
  const tasks = pure ? laneTasks.filter((t) => t.mine) : laneTasks; const ownBox = pure ? (isPureSeller(user) ? 'seller' : 'buyer') : null;
  const today = localDate(); const refi = isRefi(deal);
  const open = (t) => ['todo', 'in_progress', 'blocked'].includes(t.status);
  const toneOf = (t) => t.status === 'done' ? 'is-done' : t.status === 'cancelled' ? 'is-cancelled' : open(t) && t.dueDate && t.dueDate < today ? 'is-overdue' : 'is-open';
  const intakeSide = (t) => { const s = boxOfRole(t.assignedRole); return t.kind === 'form' && (s === 'buyer' || s === 'seller') ? s : ''; };
  const answerList = (t) => { if (dense || !manage || t.status !== 'done' || !t.formData) return ''; const rows = Object.entries(t.formData).filter(([, v]) => v != null && v !== '' && v !== false);
    return rows.length ? html`<dl class="task-answers" data-task-answers="${t.id}">${rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>` : ''; };
  let agreements = null; let agreementsFailed = false;
  if (pure) { try { agreements = await api.listAgreements(deal.id); } catch (e) { agreementsFailed = true; } }
  const agTodo = pure && !agreementsFailed ? agreementTasks(deal, agreements) : [];
  const agreementNote = agreementsFailed ? html`<p class="notice warn" data-agreements-state="error">Agreements could not be loaded. Nothing was marked as acknowledged.</p>`
    : !agreements || !(agreements.agreements || []).length ? html`<p class="muted" data-agreements-state="empty">No agreements are on this file yet.</p>`
    : agTodo.length ? html`<table class="tbl striped" data-agreement-todos><tbody>${agTodo.map((a) => html`<tr data-co-agreement="${a.agreement}"><td><strong><a href="${a.href}">${a.title}</a></strong><br><span class="muted small">Opens the agreement to read and acknowledge</span></td><td class="nowrap"><a class="ghost" href="${a.href}">Open</a></td></tr>`)}</tbody></table>`
    : html`<p class="muted" data-agreements-state="done">All agreements acknowledged.</p>`;
  const kindBit = (t, inline) => t.kind === 'form' ? (inline ? html`<span class="muted small">Form v${t.templateVersion}</span>` : html`<br><span class="muted small">Form &middot; template v${t.templateVersion}</span>`)
    : t.kind === 'sign' ? (inline ? html`<span class="muted small">Signature</span>` : html`<br><span class="muted small">Signature (demo e-sign)</span>`)
    : t.kind === 'agent' ? (inline ? html`<span class="muted small">Agent task</span>` : html`<br><span class="muted small">Agent task</span>`) : '';
  const actions = (t) => html`${t.kind === 'agent' && taskOpenHref(t) ? html`<a class="ghost" href="${taskOpenHref(t)}" data-agent-task="${t.id}">${t.status === 'done' ? 'View Submission' : t.mine ? 'Start' : 'View'}</a>` : ''}${t.kind === 'sign' && taskOpenHref(t) ? html`<a class="ghost" href="${taskOpenHref(t)}">${t.mine && open(t) ? 'Sign' : 'View'}</a>` : ''}${t.kind === 'form' && t.canFill ? html`<a class="ghost" href="${taskOpenHref(t)}">${t.status === 'done' ? 'View' : t.mine ? 'Fill in' : t.forClient ? 'Fill in for client' : 'Open'}</a>` : ''}
        ${manage ? html`<button class="ghost" data-edit="${t.id}">Edit</button>` : ''}${manage && open(t) ? html` <button class="ghost" data-remind="${t.id}" title="Queues an email in the outbox. Nothing is sent from this build.">Remind</button>` : ''}`;
  const row = (t) => html`<tr class="${toneOf(t)}" data-task-row="${t.id}" data-task-tone="${toneOf(t)}" data-mine="${t.mine ? '1' : '0'}">
      <td class="center">${t.canTick ? html`<input type="checkbox" data-tick="${t.id}" ${t.status === 'done' ? html`checked` : ''} aria-label="Done">` : ''}</td>
      <td><div class="task-line"><strong>${taskOpenHref(t) ? html`<a href="${taskOpenHref(t)}">${t.title}</a>` : t.title}</strong>${t.notYours ? html` <span class="muted small" data-not-yours>Not yours to open</span>` : ''}${t.taskGroup ? html` <span class="pill" data-task-group>${t.taskGroup}</span>` : ''}${dense ? html` ${kindBit(t, true)}` : ''}</div>${t.description ? (dense ? html`<div class="task-desc muted">${t.description}</div>` : html`<br><span class="muted">${t.description}</span>`) : ''}${t.switchedOff ? html` <span class="pill warn" data-switched-off title="Switched off on Task Templates > Task switches: kept, hidden from everyone except Admin / Super admin">Switched off (admins only)</span>` : ''}${dense ? '' : kindBit(t, false)}${answerList(t)}${dense && intakeSide(t) ? html`<div class="intake-slot" data-intake-slot="${t.id}" hidden></div>` : ''}</td>
      <td>${t.ownerName || t.assignedRole}${t.ownerName ? html`<br><span class="muted small">${t.assignedRole}</span>` : ''}${t.mine ? html` ${pill(user.selfRep ? `you, as ${t.assignedRole}` : 'you', 'info')}` : ''}</td>
      <td class="task-due ${open(t) && t.dueDate && t.dueDate < today ? 'bad-text' : ''}">${fmtDate(t.dueDate)}</td><td>${pill(LABEL[t.status], CLS[t.status])}${t.completedByLabel ? html`<br><span class="muted small done-by">${t.completedByLabel}</span>` : ''}</td>
      <td class="nowrap">${actions(t)}</td></tr>`;
  const mineFirst = [...tasks].sort((a, b) => ((b.mine || b.forClient) && open(b)) - ((a.mine || a.forClient) && open(a)));
  const shown = mineOnly ? tasksForViewer(user, mineFirst) : mineFirst;
  const groups = boxTasks(shown).filter((g) => (pure ? g.key === ownBox : g.key !== hideBox) && (!mineOnly || g.tasks.length));
  const intakeOf = (side) => tasks.filter((t) => intakeSide(t) && (!side || intakeSide(t) === side));
  const hasIntake = intakeOf('').length > 0;
  const sideExpand = (g) => dense && (g.key === 'buyer' || g.key === 'seller') && g.tasks.some((t) => intakeSide(t)) ? html`<p class="side-expand"><button type="button" class="ghost small" data-expand-side="${g.key}">Expand all</button></p>` : '';
  const body = html`<div class="file-tasks${dense ? ' file-tasks-dense' : ''}" data-file-tasks="${mineOnly ? 'mine' : dense ? 'dense' : 'roles'}">${pure ? html`<div class="box-title"><h2><span class="h-ico"></span>Agreements to acknowledge</h2></div>${agreementNote}` : ''}<div class="box-title"><h2><span class="h-ico"></span>${mineOnly ? 'My Tasks' : pure ? 'To-do list' : 'All Tasks'}</h2>${manage && !mineOnly ? html`<button class="m-btn right" id="addtask">+ Add task</button>` : ''}</div>
    ${!pure && tasks.some((t) => t.participantId) ? html`<p data-view-switch><strong>${productionView ? 'Title Production' : 'Task list'}</strong> &middot; <a href="#/deals/${deal.id}/tasks?view=people" data-intake-by-person>Intake by person</a> <span class="muted small">(each buyer, seller and agent with all their intake answers on one page)</span>${allTasks.some((t) => taskLaneOf(t) === 'production') ? html` &middot; <a href="#/deals/${deal.id}/tasks${productionView ? '' : '?lane=production'}" data-production-tasks>${productionView ? 'Portal tasks' : 'Title Production'}</a>` : ''}</p>` : ''}
    ${dense && hasIntake ? html`<p class="task-expand-bar" data-expand-bar><button type="button" class="m-btn" data-expand-all="1" aria-expanded="false" title="Open every buyer and seller intake section on this page and edit the answers">Expand all</button> <button type="button" class="ghost" data-expand-all="0">Collapse all</button> <span class="muted small">Buyer and seller intake, editable here.</span></p>` : ''}
    ${pure && !tasks.some(open) && !agTodo.length ? html`<div class="notice info" data-all-caught-up>You’re all caught up. There is nothing for you to do on this order right now; we will let you know when there is.</div>` : ''}
    ${tasks.length ? html`${pure ? '' : html`<p class="muted small" data-side-total>${tasks.length} task(s) on this file, grouped by side (from each task's assigned role).</p>`}${groups.map((g) => html`<details class="side-box side-${g.key}" data-sidebox="${g.key}" data-count="${g.tasks.length}" ${dense && !g.tasks.length ? '' : raw('open')}>
      <summary><span class="side-tag">${g.key === 'buyer' && refi ? 'Borrower tasks' : g.label}</span> <span class="side-count">(${g.tasks.length})</span></summary>
      ${sideExpand(g)}
      ${g.tasks.length ? html`<div class="side-scroll"><table class="tbl striped"><thead><tr><th></th><th>Task</th><th>Assigned to</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${g.tasks.map(row)}</tbody></table></div>` : html`<p class="muted small" data-side-empty>None on this side.</p>`}</details>`)}` : pure ? '' : html`<p class="muted" data-tasks-empty>No tasks have been created on this file yet.</p>`}
    <p class="muted small">Tasks are never deleted; use Edit &rarr; Cancelled to retire one. Reminders are queued in the outbox only and never sent from this build.</p></div>`;
  const AUDS = [['buyer', 'Buyer'], ['seller', 'Seller'], ['listing_agent', 'Listing agent'], ['buyer_agent', 'Buyer agent'], ['sales_team', 'Sales team'], ['transaction_coordinator', 'Transaction coordinator'], ['internal', 'Internal only']];
  return { title: 'Tasks', crumbs: [['All Tasks']], body, mount(root) {
    $$('[data-tick]', root).forEach((c) => c.addEventListener('change', guard(async () => { try { await api.updateTask(c.dataset.tick, { status: c.checked ? 'done' : 'todo' }); } finally { refresh(); } })));
    $$('[data-remind]', root).forEach((b) => b.addEventListener('click', guard(async () => { const r = await api.sendTaskReminder(b.dataset.remind); toast(r.queued ? 'Reminder queued in the outbox (not sent)' : 'Already queued today'); })));
    const ab = $('#addtask', root); if (ab) ab.addEventListener('click', () => form(null));
    $$('[data-edit]', root).forEach((b) => b.addEventListener('click', () => form(tasks.find((t) => t.id === b.dataset.edit))));
    const slotOf = (id) => $(`[data-intake-slot="${(globalThis.CSS && CSS.escape ? CSS.escape(String(id)) : String(id).replace(/(["\\])/g, '\\$1'))}"]`, root);
    const showIntake = async (ids) => {
      if (!ids.length) return;
      const { intakeFormHtml, mountIntakeForm } = await import('./dealtaskform.js?v=202611161500');
      const { loadSpouseRows, applySpouse } = await import('./spouse.js?v=202611161500');
      const wantsSpouse = ids.some((id) => { const t = tasks.find((z) => z.id === id); return t && t.templateCode === 'personal_info' && (t.assignedRole === 'Client-Buyer' || t.assignedRole === 'Client-Seller'); });
      const spouseRows = wantsSpouse ? await loadSpouseRows(api, deal.id) : [];
      await Promise.all(ids.map(async (id) => {
        const slot = slotOf(id); if (!slot) return;
        const box = slot.closest('details'); if (box) box.open = true;
        if (slot.dataset.loaded === '1') { slot.hidden = false; intakeOpen.add(id); return; }
        if (slot.dataset.loading === '1') return;
        slot.dataset.loading = '1'; slot.hidden = false;
        slot.innerHTML = '<p class="muted small" data-intake-loading>Loading intake…</p>';
        try {
          const full = await api.getTask(id);
          if (full.templateCode === 'personal_info' && (full.assignedRole === 'Client-Buyer' || full.assignedRole === 'Client-Seller') && !full.formHidden && api.readBuyerSsn) {
            try { full.ssnShown = await api.readBuyerSsn(id) || ''; } catch (e) { full.ssnShown = ''; }
            full.ssnStaff = ssnStaff(user);
            full.dealId = deal.id;
            applySpouse(full, spouseRows, user);
          }
          if (!slot.isConnected) return;
          slot.innerHTML = toText(html`<div class="intake-edit" data-intake-panel="${id}"><p class="intake-edit-note muted small">Edit <strong>${full.title}</strong>${full.ownerName ? html` for ${full.ownerName}` : ''}</p>${intakeFormHtml(full, { state: deal.state })}</div>`);
          mountIntakeForm(slot, { api, t: full, afterSave(mode) { toast(mode === 'complete' ? 'Task complete. Thank you!' : 'Progress saved'); refresh(); } });
          slot.dataset.loading = ''; slot.dataset.loaded = '1'; intakeOpen.add(id);
        } catch (err) {
          if (!slot.isConnected) return;
          slot.dataset.loading = ''; intakeOpen.delete(id);
          slot.innerHTML = toText(html`<p class="notice warn" data-intake-error>This intake section could not be opened. Nothing was saved.</p>`);
          toast(err.message || 'Could not open this intake section.', 'err');
        }
      }));
      const allBtn = $('[data-expand-all="1"]', root); if (allBtn && intakeOf('').every((t) => intakeOpen.has(t.id))) allBtn.setAttribute('aria-expanded', 'true');
    };
    const hideIntake = (ids) => { ids.forEach((id) => { const slot = slotOf(id); if (slot) slot.hidden = true; intakeOpen.delete(id); }); const allBtn = $('[data-expand-all="1"]', root); if (allBtn) allBtn.setAttribute('aria-expanded', 'false'); };
    $$('[data-expand-all]', root).forEach((b) => b.addEventListener('click', guard(() => { const ids = intakeOf('').map((t) => t.id); return b.dataset.expandAll === '1' ? showIntake(ids) : hideIntake(ids); })));
    $$('[data-expand-side]', root).forEach((b) => b.addEventListener('click', guard(() => showIntake(intakeOf(b.dataset.expandSide).map((t) => t.id)))));
    if (intakeOpen.size) guard(() => showIntake([...intakeOpen]))();
    if (focusSection && !mineOnly) {
      const mineRow = root.querySelector('[data-task-row][data-mine="1"]');
      const box = focusSection === 'other' ? (mineRow && mineRow.closest('[data-sidebox]')) : root.querySelector(`[data-sidebox="${focusSection}"]`);
      const target = focusSection === 'other' ? (mineRow || box) : box;
      if (box) { box.open = true; box.setAttribute('data-focused-section', focusSection); }
      const focusEl = focusSection === 'other' ? target : (box && box.querySelector('summary'));
      if (focusEl) { focusEl.setAttribute('tabindex', '-1'); try { focusEl.focus({ preventScroll: true }); } catch (e) { try { focusEl.focus(); } catch (err) { /* ignore */ } } }
      if (target && target.scrollIntoView) { try { target.scrollIntoView({ block: 'start' }); } catch (e) { /* the test DOM has no layout */ } }
    }
  } };

  function form(t) {
    const picked = new Set(t && t.audiences ? t.audiences : []);
    const m = modal(t ? 'Edit task' : 'Add task', html`<form id="tf" class="form-grid"><label class="span2">Title *<input name="title" required maxlength="200" value="${t ? t.title : ''}"></label>
      <label class="span2">Details<textarea name="description" rows="2" maxlength="1000">${t ? t.description : ''}</textarea></label>
      ${t && t.participantId ? html`<p class="span2 muted">Assigned to ${t.ownerName} (${t.assignedRole}). Template v${t.templateVersion}.</p>` : html`<label>Assigned to<select name="assignedRole">${options(ROLES, t ? t.assignedRole : 'Processor')}</select></label>`}
      <label>Due date<input type="date" name="dueDate" value="${t && t.dueDate ? t.dueDate : ''}"></label>
      ${t ? html`<label>Status<select name="status">${options(['todo', 'in_progress', 'done', 'blocked', 'cancelled'], t.status, (s) => LABEL[s])}</select></label>` : ''}
      <fieldset class="span2" data-one-off-audience><legend>Who may see it</legend>${AUDS.map(([v, l]) => html`<label class="chk"><input type="checkbox" name="audiences" value="${v}" ${picked.has(v) ? 'checked' : ''}> ${l}</label>`)}</fieldset>
      <p class="span2 muted small">Leave this blank to follow the assigned role. A buyer audience is not shown to the seller, and a seller audience is not shown to the buyer.</p>
      <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    $('#tf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target);
      const audiences = $$('input[name=audiences]:checked', m).map((el) => el.value);
      if (t) await api.updateTask(t.id, { ...f, audiences }); else await api.createTask(deal.id, { ...f, audiences }); closeModal(); toast('Task saved'); refresh(); }));
  }
}
