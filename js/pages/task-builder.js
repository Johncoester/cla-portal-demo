/* Admin > Task Builder, TB-1 (John, Nov 13 2026; spec docs/specs/task-builder.md). Its own admin menu item, Admin / Super admin only.
 * Lists the flows (name, what starts it, On / Off), adds and edits them, and keeps a history. Flows do not run on files yet (TB-2). */
import { html, raw, $, $$, guard, toast, fmtDateTime, pill, modal, closeModal, formData } from '../ui.js?v=202611161500';
import { TRIGGERS, triggerNeedsDays, triggerOf, canManageTaskBuilder, cleanFlow, FLOWS_NOT_RUNNING, DAYS_MIN, DAYS_MAX, NAME_MAX, DESC_MAX } from '../data/task-builder.js?v=202611201000';

export async function render(ctx) {
  const { api, user, refresh } = ctx;
  if (!canManageTaskBuilder(user) || !api.listTaskFlows) throw new Error('That page does not exist.');
  const { flows, log } = await api.listTaskFlows();
  const row = (f) => html`<tr data-tb-row="${f.id}" data-tb-active="${f.active ? 'yes' : 'no'}">
    <td><strong data-tb-name>${f.name}</strong>${f.description ? html`<br><span class="muted small">${f.description}</span>` : ''}</td>
    <td data-tb-trigger>${f.triggerText}</td>
    <td>${f.active ? pill('On', 'ok') : pill('Off', '')}</td>
    <td class="small muted">${fmtDateTime(f.updatedAt || f.createdAt)}${f.updatedByName ? html`<br>${f.updatedByName}` : ''}</td>
    <td class="nowrap">
      <button type="button" class="m-btn small" data-tb-edit="${f.id}">Edit</button>
      ${f.active
        ? html`<button type="button" class="ghost small" data-tb-off="${f.id}">Turn off</button>`
        : html`<button type="button" class="ghost small" data-tb-on="${f.id}">Turn on</button>`}
    </td></tr>`;
  const body = html`<section class="task-builder-page" data-task-builder>
    <div class="page-head"><div><p class="eyebrow">Admin</p><h2 class="page-title">Task Builder</h2>
      <p class="muted">Build automated workflows for title files. Each flow starts when something happens on a file (for example, the order is opened, or the EMD hasn't come in after 2 days).
      Admin / Super admin only.</p></div>
      <button type="button" class="m-btn" data-tb-new>+ New flow</button></div>
    <div class="notice info" data-tb-not-running><strong>Not running yet.</strong> ${FLOWS_NOT_RUNNING}</div>
    <div class="card"><h3>Flows <span class="muted small">(${flows.length})</span></h3>
      ${flows.length ? html`<table class="tbl" data-tb-table><thead><tr><th>Flow</th><th>What starts it</th><th>Status</th><th>Last changed</th><th></th></tr></thead><tbody>${flows.map(row)}</tbody></table>`
        : html`<p class="muted" data-tb-empty>No flows yet. Click <strong>+ New flow</strong> to add the first one.</p>`}</div>
    <div class="card" data-tb-history><h3>History</h3><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>
      ${log.length ? log.slice(0, 20).map((l) => html`<tr data-tb-log><td class="small">${fmtDateTime(l.at)}</td><td>${l.byName || ''}</td><td><strong>${l.flowName}</strong> ${l.action}${l.detail ? html`<br><span class="muted small">${l.detail}</span>` : ''}</td></tr>`)
        : html`<tr><td colspan="3" class="muted">No changes yet.</td></tr>`}</tbody></table></div>
  </section>`;
  return { title: 'Task Builder', crumbs: [['Task Builder']], body, mount(root) {
    const byId = new Map(flows.map((f) => [f.id, f]));
    $('[data-tb-new]', root).addEventListener('click', () => formModal(null));
    $$('[data-tb-edit]', root).forEach((b) => b.addEventListener('click', () => formModal(byId.get(b.dataset.tbEdit))));
    $$('[data-tb-on]', root).forEach((b) => b.addEventListener('click', guard(async () => {
      await api.setTaskFlowActive(b.dataset.tbOn, true); toast('Turned on. It will start running on files once actions are added (next step).'); refresh();
    })));
    $$('[data-tb-off]', root).forEach((b) => b.addEventListener('click', guard(async () => {
      if (!confirm('Turn this flow off? It stays on the list and can be turned back on.')) return;
      await api.setTaskFlowActive(b.dataset.tbOff, false); toast('Turned off.'); refresh();
    })));

    function formModal(f) {
      const creating = !f;
      const m = modal(creating ? 'New flow' : `Edit: ${f.name}`, html`<form id="tbf" class="form-grid" data-tb-form novalidate>
        <label class="span2">Name *<input name="name" maxlength="${NAME_MAX}" required value="${f ? f.name : ''}" placeholder="EMD reminder" data-tb-name-input></label>
        <label class="span2">What starts it *<select name="trigger" required data-tb-trigger-input>
          <option value="">Choose…</option>
          ${TRIGGERS.map((t) => html`<option value="${t.code}" ${f && f.trigger === t.code ? raw('selected') : ''}>${t.label}</option>`)}</select></label>
        <label class="span2" data-tb-days hidden>Days *<span class="muted small" data-tb-days-hint></span>
          <input name="triggerDays" type="number" min="${DAYS_MIN}" max="${DAYS_MAX}" step="1" inputmode="numeric" value="${f && f.triggerDays != null ? f.triggerDays : ''}" data-tb-days-input></label>
        <label class="span2">Description <span class="muted small">(optional)</span><textarea name="description" rows="3" maxlength="${DESC_MAX}" data-tb-desc-input placeholder="What this flow is for">${f ? f.description || '' : ''}</textarea></label>
        ${creating ? html`<p class="span2 muted small">New flows start Off. Conditions and actions are added in the next step.</p>` : ''}
        <p class="span2 err-text" data-tb-err hidden></p>
        <div class="span2"><button class="m-btn" type="submit" data-tb-save>${creating ? 'Create flow' : 'Save changes'}</button>
          <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
      const sel = $('[data-tb-trigger-input]', m); const days = $('[data-tb-days]', m);
      const showDays = () => { const t = triggerOf(sel.value); days.hidden = !triggerNeedsDays(sel.value); $('[data-tb-days-hint]', m).textContent = t && t.days ? ` (${t.days}, ${DAYS_MIN} to ${DAYS_MAX})` : ''; };
      sel.addEventListener('change', showDays); showDays();
      $('#tbf', m).addEventListener('submit', async (e) => {
        e.preventDefault(); const err = $('[data-tb-err]', m); const btn = $('[data-tb-save]', m);
        err.hidden = true; btn.disabled = true;
        try {
          const input = cleanFlow(formData(e.target));   // checked here first, so a mistake never leaves the window
          if (creating) await api.createTaskFlow(input); else await api.updateTaskFlow(f.id, input);
          closeModal(); toast(creating ? 'Flow created. It is Off.' : 'Flow saved.'); refresh();
        } catch (ex) { err.hidden = false; err.textContent = ex.message || 'Could not save the flow. Try again.'; btn.disabled = false; }
      });
    }
  } };
}
