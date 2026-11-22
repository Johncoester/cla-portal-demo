/* Mass actions on the current page of a CRM list. Drafts are not sent. Each row uses the existing save. */
import { html, $, $$, guard, toast, modal, closeModal } from '../ui.js?v=202611161500';
import { BULK_FIELDS, BULK_TASK_ENTITIES, fieldPatch, updateSelectedNotes, ownerAllowed, runEach } from '../data/crm-bulk.js?v=202611160300';
import { EMAIL_RECIPIENT_CAP, emailConfirm } from '../data/crm-match.js?v=202611160400';
import { splitOwnedRecords, skippedLine, CRM_LOCK_NOTE } from '../data/crm-visibility.js?v=202611247100';

const UPDATERS = { lead: 'updateCrmLead', contact: 'updateCrmContact', account: 'updateCrmAccount', opportunity: 'updateCrmOpportunity', deal: 'updateDeal' };
const TASK = { lead: 'lead', contact: 'contact', account: 'account', opportunity: 'opportunity', deal: 'deal' };

export function bulkBar(module) {
  const fields = BULK_FIELDS[module] || [];
  const task = BULK_TASK_ENTITIES.includes(module);
  return html`<div class="table-tools" data-bulk-bar hidden>
    <strong data-bulk-count>0 selected</strong>
    <button type="button" class="ghost" data-bulk-email>Email (draft only)</button>
    ${fields.length ? html`<button type="button" class="ghost" data-bulk-field>Update a field</button>` : ''}
    <button type="button" class="ghost" data-bulk-owner>${module === 'deal' ? 'Change salesperson' : 'Change owner'}</button>
    ${task ? html`<button type="button" class="ghost" data-bulk-task>Create task</button>` : ''}
    <button type="button" class="ghost" data-bulk-clear>Clear</button>
    <span class="muted small">${module === 'deal' ? 'A deal task is a portal task on that order. Notes and the salesperson are saved only when this sign-in is allowed to change the order. Email is an unsent draft to a person already on the file. Nothing is deleted.' : 'Nothing is sent and nothing is deleted. A row you cannot change is listed and the others still save.'}</span>
  </div>`;
}

function chosen(root, rows) {
  const ids = new Set([...$$('[data-bulk-row]:checked', root)].map((el) => el.value));
  return rows.filter((r) => ids.has(r.id));
}
function report(title, result, extra = '') {
  const lines = [...(result.ok || []).map((r) => `${r.name}: saved`), ...(result.failed || []).map((r) => `${r.name}: ${r.reason}`)];
  const skipped = skippedLine(result.skipped);
  modal(title, html`<div data-bulk-result><p data-bulk-counts>${(result.ok || []).length} saved, ${(result.failed || []).length} not saved. ${skipped} ${extra}</p><ul>${lines.map((l) => html`<li>${l}</li>`)}</ul><p><button type="button" class="m-btn" data-close>Close</button></p></div>`);
}
function massLine(result) {
  const updated = Number(result && result.updated) || 0;
  const failed = Number(result && result.failed) || 0;
  return `${updated} saved, ${failed} not saved. ${skippedLine(result && result.skipped)}`;
}

export function wireBulk(root, { module, api, me, owners, getPageRows, getMatch, clear, refresh }) {
  if (!me) return;
  if (module === 'deal' && !me.canEdit) return;
  const bar = $('[data-bulk-bar]', root); if (!bar) return;
  const scope = () => (getMatch ? getMatch() : { all: false, count: 0, filter: {} });
  const paint = () => {
    const match = scope(); const n = match.all ? match.count : $$('[data-bulk-row]:checked', root).length;
    bar.hidden = n === 0; $('[data-bulk-count]', bar).textContent = match.all ? `${n} matching records selected` : `${n} selected`;
  };
  root.addEventListener('change', (e) => { if (e.target && e.target.matches && e.target.matches('[data-bulk-row],[data-bulk-page]')) paint(); });
  const keepOwned = (rows) => {
    if (module === 'deal') return { rows, skipped: 0 };
    const split = splitOwnedRecords(rows, me);
    return { rows: split.owned, skipped: split.skippedCount };
  };
  const need = () => { const rows = chosen(root, getPageRows()); if (!rows.length) throw new Error('Select at least one record on this page.'); return rows; };
  const pageOnly = () => { if (scope().all) throw new Error('Select all matching applies to Update a field and Email. Clear it to change the owner or create a task for this page.'); return need(); };
  $('[data-bulk-clear]', bar).addEventListener('click', () => { clear(); paint(); });
  const exact = async (action) => {
    const match = scope();
    if (match.all && typeof api.crmMatchPlan === 'function') return api.crmMatchPlan({ module, filter: match.filter, action });
    return { count: match.count, records: match.count, recipients: match.count, skipped: 0 };
  };
  const openEmail = async ({ ids, filter }) => {
    if (typeof api.crmMassEmail !== 'function') throw new Error('Email drafts are not available here.');
    const counted = await api.crmMassEmail({ module, filter: filter || {}, ids, dryRun: true });
    const n = Number(counted && (counted.recipients != null ? counted.recipients : counted.count)) || 0;
    const cap = Number(counted && counted.cap) || EMAIL_RECIPIENT_CAP;
    const confirm = emailConfirm({ recipients: n, cap });
    const m = modal(ids ? 'Email selected records' : 'Email matching records', html`<form id="bulk-mail" class="form-grid"><p class="span2" data-bulk-privacy>Each draft goes to one address. People are not copied on each other's email. Nothing is sent. The addresses stay on the server.</p>
      <p class="span2" data-email-confirm>${confirm.text}</p>
      ${confirm.ok ? html`<label class="span2">Subject<input name="subject" maxlength="250" required></label>
        <label class="span2">Message<textarea name="body" rows="5" required></textarea></label>
        <p class="err-text span2" data-form-err></p>
        <div class="span2"><button class="m-btn" type="submit" data-bulk-send-draft>Save drafts</button> <button class="ghost" type="button" data-close>Cancel</button></div>` : html`<div class="span2"><button class="ghost" type="button" data-close>Close</button></div>`}
    </form>`);
    if (!confirm.ok) return;
    $('#bulk-mail', m).addEventListener('submit', guard(async (e) => { e.preventDefault();
      const body = e.target.body.value;
      const result = await api.crmMassEmail({ module, filter: filter || {}, ids, subject: e.target.subject.value, html: `<p>${body.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</p>` });
      closeModal(); modal('Email drafts', html`<div data-bulk-result><p data-bulk-counts>${result.drafted || result.count || 0} drafts saved. Nothing was sent. ${skippedLine(result.skipped)}</p><p><button type="button" class="m-btn" data-close>Close</button></p></div>`);
      clear(); if (refresh) refresh(); }));
  };
  $('[data-bulk-email]', bar).addEventListener('click', guard(async () => {
    if (scope().all) { await openEmail({ filter: scope().filter }); return; }
    const kept = keepOwned(need());
    if (!kept.rows.length) throw new Error(CRM_LOCK_NOTE);
    const resultIds = kept.rows.map((r) => r.id);
    await openEmail({ ids: resultIds });
    if (kept.skipped) toast(skippedLine(kept.skipped));
  }));
  const fieldBtn = $('[data-bulk-field]', bar);
  if (fieldBtn) fieldBtn.addEventListener('click', guard(async () => {
    if (scope().all) {
      const plan = await exact('update'); const fields = BULK_FIELDS[module] || [];
      const m = modal('Update a field', html`<form id="bulk-field" class="form-grid"><p class="span2" data-match-exact>This changes ${plan.count} matching record${plan.count === 1 ? '' : 's'}. Confirm before it saves. ${module === 'deal' ? '' : 'Records you do not own are skipped.'}</p>
        <label>Field<select name="field">${fields.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
        <label>New value<input name="value" maxlength="2000" required></label>
        <p class="span2 muted" data-notes-append>Notes are appended. The notes already on each record stay, then a line with today's date and your name, then this text.</p>
        <p class="err-text span2" data-form-err></p>
        <div class="span2"><button class="m-btn" type="submit">Update matching records</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`);
      const fieldSel = $('#bulk-field [name=field]', m);
      const notesHint = $('[data-notes-append]', m);
      const showNotes = () => { if (notesHint) notesHint.hidden = fieldSel.value !== 'notes'; };
      fieldSel.addEventListener('change', showNotes); showNotes();
      $('#bulk-field', m).addEventListener('submit', guard(async (e) => { e.preventDefault();
        if (typeof api.crmMassUpdate !== 'function') throw new Error('This list cannot be updated in bulk.');
        fieldPatch(module, e.target.field.value, e.target.value.value);
        const result = await api.crmMassUpdate({ module, filter: scope().filter, field: e.target.field.value, value: e.target.value.value });
        closeModal(); modal('Field update', html`<div data-bulk-result><p data-bulk-counts>${massLine(result)}</p><p><button type="button" class="m-btn" data-close>Close</button></p></div>`);
        clear(); if (refresh) refresh(); }));
      return;
    }
    const rows = need(); const fields = BULK_FIELDS[module] || [];
    const m = modal('Update a field', html`<form id="bulk-field" class="form-grid"><p class="span2">This changes ${rows.length} record${rows.length === 1 ? '' : 's'} on this page. Confirm before it saves.</p>
      <label>Field<select name="field">${fields.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
      <label>New value<input name="value" maxlength="2000" required></label>
      <p class="span2 muted" data-notes-append>Notes are appended. The notes already on each record stay, then a line with today's date and your name, then this text.</p>
      <p class="err-text span2" data-form-err></p>
      <div class="span2"><button class="m-btn" type="submit">Update selected</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`);
    const fieldSel = $('#bulk-field [name=field]', m);
    const notesHint = $('[data-notes-append]', m);
    const showNotes = () => { if (notesHint) notesHint.hidden = fieldSel.value !== 'notes'; };
    fieldSel.addEventListener('change', showNotes); showNotes();
    $('#bulk-field', m).addEventListener('submit', guard(async (e) => { e.preventDefault();
      const field = e.target.field.value; const value = e.target.value.value;
      const kept = keepOwned(rows);
      if (!kept.rows.length) { closeModal(); modal('Field update', html`<div data-bulk-result><p data-bulk-counts>${massLine({ updated: 0, failed: 0, skipped: kept.skipped })}</p><p><button type="button" class="m-btn" data-close>Close</button></p></div>`); return; }
      if (field === 'notes') {
        const result = await updateSelectedNotes(api, { module, rows: kept.rows, value });
        closeModal(); modal('Field update', html`<div data-bulk-result><p data-bulk-counts>${massLine({ ...result, skipped: (Number(result.skipped) || 0) + kept.skipped })}</p><p><button type="button" class="m-btn" data-close>Close</button></p></div>`);
        clear(); if (refresh) refresh();
        return;
      }
      const fn = api[UPDATERS[module]]; if (typeof fn !== 'function') throw new Error('This list cannot be updated in bulk.');
      const result = await runEach(kept.rows, (r) => fn.call(api, r.id, fieldPatch(module, field, value)));
      closeModal(); report('Field update', { ...result, skipped: kept.skipped }); clear(); if (refresh) refresh(); })); }));
  const ownerBtn = $('[data-bulk-owner]', bar);
  if (ownerBtn) ownerBtn.addEventListener('click', () => { const rows = pageOnly(); const list = owners || [];
    const m = modal('Change owner', html`<form id="bulk-owner" class="form-grid"><p class="span2">Only people who can own a record are listed.</p>
      <label>Owner<select name="ownerId">${list.map((o) => html`<option value="${o.id}">${o.name}</option>`)}</select></label>
      <p class="err-text span2" data-form-err></p>
      <div class="span2"><button class="m-btn" type="submit">Change owner</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`);
    $('#bulk-owner', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const id = e.target.ownerId.value; if (!ownerAllowed(id, list)) throw new Error('Pick an owner from the list.');
      const kept = keepOwned(rows);
      if (!kept.rows.length) { closeModal(); report('Owner change', { ok: [], failed: [], skipped: kept.skipped }); return; }
      const result = module === 'deal'
        ? await runEach(kept.rows, (r) => { if (typeof api.setDealSalesPeople !== 'function') throw new Error('Deal salespeople cannot be changed here.'); return api.setDealSalesPeople(r.id, [id]); })
        : await runEach(kept.rows, (r) => { const fn = api[UPDATERS[module]]; if (typeof fn !== 'function') throw new Error('This list cannot be updated in bulk.'); return fn.call(api, r.id, { ownerId: id }); });
      closeModal(); report('Owner change', { ...result, skipped: kept.skipped }); clear(); if (refresh) refresh(); })); });
  const taskBtn = $('[data-bulk-task]', bar);
  if (taskBtn) taskBtn.addEventListener('click', () => { const rows = pageOnly(); if (!TASK[module]) throw new Error('Tasks attach to a lead, client, company, or opportunity.');
    const m = modal('Create a task', html`<form id="bulk-task" class="form-grid"><p class="span2">One task on each selected record, using the same task fields as a single task.</p>
      <label class="span2">Subject<input name="subject" maxlength="200" required></label>
      <label>Due date<input name="dueDate" type="date" required></label>
      <p class="err-text span2" data-form-err></p>
      <div class="span2"><button class="m-btn" type="submit">Create tasks</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`);
    $('#bulk-task', m).addEventListener('submit', guard(async (e) => { e.preventDefault();
      const subject = e.target.subject.value; const dueDate = e.target.dueDate.value;
      const kept = keepOwned(rows);
      if (!kept.rows.length) { closeModal(); report('Tasks', { ok: [], failed: [], skipped: kept.skipped }); return; }
      const result = module === 'deal'
        ? await runEach(kept.rows, (r) => { if (typeof api.createTask !== 'function') throw new Error('A task on a deal is a portal task, and that save is not available here.'); return api.createTask(r.id, { title: subject, dueDate, assignedRole: 'Processor', description: subject }); })
        : await runEach(kept.rows, (r) => { if (typeof api.createCrmTask !== 'function') throw new Error('Tasks are not available here.'); return api.createCrmTask({ entity: TASK[module], entityId: r.id, subject, dueDate }); });
      closeModal(); report('Tasks', { ...result, skipped: kept.skipped }); clear(); if (refresh) refresh(); })); });
  paint();
}
