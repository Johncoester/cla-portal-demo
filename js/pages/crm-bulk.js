/* Mass actions on the current page of a CRM list. Drafts are not sent. Each row uses the existing save. */
import { html, $, $$, guard, toast, modal, closeModal } from '../ui.js?v=202611070139';
import { BULK_FIELDS, BULK_TASK_ENTITIES, planRelatedEmails, fieldPatch, ownerAllowed, runEach } from '../data/crm-bulk.js?v=202611132000';

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
  const lines = [...result.ok.map((r) => `${r.name}: saved`), ...result.failed.map((r) => `${r.name}: ${r.reason}`)];
  modal(title, html`<div data-bulk-result><p>${result.ok.length} saved, ${result.failed.length} not saved. ${extra}</p><ul>${lines.map((l) => html`<li>${l}</li>`)}</ul><p><button type="button" class="m-btn" data-close>Close</button></p></div>`);
}

export function wireBulk(root, { module, api, me, owners, getPageRows, clear, refresh }) {
  if (!me || !me.canEdit) return;
  const bar = $('[data-bulk-bar]', root); if (!bar) return;
  const paint = () => { const n = $$('[data-bulk-row]:checked', root).length; bar.hidden = n === 0; $('[data-bulk-count]', bar).textContent = `${n} selected`; };
  root.addEventListener('change', (e) => { if (e.target && e.target.matches && e.target.matches('[data-bulk-row],[data-bulk-page]')) paint(); });
  const need = () => { const rows = chosen(root, getPageRows()); if (!rows.length) throw new Error('Select at least one record on this page.'); return rows; };
  $('[data-bulk-clear]', bar).addEventListener('click', () => { clear(); paint(); });
  $('[data-bulk-email]', bar).addEventListener('click', guard(async () => { const rows = need();
    const found = [];
    for (const r of rows) {
      const list = typeof api.crmRelatedEmails === 'function' ? await api.crmRelatedEmails(module, r.id) : [];
      if (!list.length) found.push({ id: r.id, name: r.name || r.id, email: '' });
      else list.forEach((p) => found.push({ id: r.id, name: p.name || r.name, email: p.email, contactId: p.contactId || r.contactId || '' }));
    }
    const plan = planRelatedEmails(module, found);
    const m = modal('Email selected records', html`<form id="bulk-mail" class="form-grid"><p class="span2" data-bulk-privacy>Each draft goes to one address. People are not copied on each other's email. Nothing is sent.</p>
      <p class="span2">${plan.recipients.length} draft${plan.recipients.length === 1 ? '' : 's'}. ${plan.skipped.length ? plan.skipped.length + ' skipped.' : ''}</p>
      <ul class="span2">${plan.recipients.map((r) => html`<li>${r.name} &lt;${r.email}&gt;</li>`)}${plan.skipped.map((r) => html`<li class="muted">${r.name}: ${r.reason}</li>`)}</ul>
      <label class="span2">Subject<input name="subject" maxlength="250" required></label>
      <label class="span2">Message<textarea name="body" rows="5" required></textarea></label>
      <p class="err-text span2" data-form-err></p>
      <div class="span2"><button class="m-btn" type="submit" data-bulk-send-draft>Save drafts</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`);
    $('#bulk-mail', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); if (!plan.recipients.length) throw new Error('None of the selected records have an email address.');
      if (typeof api.saveCrmEmail !== 'function') throw new Error('Email drafts are not available here.');
      const subject = e.target.subject.value; const body = e.target.body.value;
      const result = await runEach(plan.recipients, (r) => api.saveCrmEmail({ entity: r.storeEntity || module, entityId: r.storeId || r.id, to: [r.email], subject, html: `<p>${body.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</p>`, mode: 'send' }));
      closeModal(); report('Email drafts', result, 'Nothing was sent.'); clear(); if (refresh) refresh(); })); }));
  const fieldBtn = $('[data-bulk-field]', bar);
  if (fieldBtn) fieldBtn.addEventListener('click', () => { const rows = need(); const fields = BULK_FIELDS[module] || [];
    const m = modal('Update a field', html`<form id="bulk-field" class="form-grid"><p class="span2">This changes ${rows.length} record${rows.length === 1 ? '' : 's'} on this page. Confirm before it saves.</p>
      <label>Field<select name="field">${fields.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
      <label>New value<input name="value" maxlength="2000" required></label>
      <p class="err-text span2" data-form-err></p>
      <div class="span2"><button class="m-btn" type="submit">Update selected</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`);
    $('#bulk-field', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const fn = api[UPDATERS[module]]; if (typeof fn !== 'function') throw new Error('This list cannot be updated in bulk.');
      const patch = fieldPatch(module, e.target.field.value, e.target.value.value);
      const result = await runEach(rows, (r) => fn.call(api, r.id, patch));
      closeModal(); report('Field update', result); clear(); if (refresh) refresh(); })); });
  const ownerBtn = $('[data-bulk-owner]', bar);
  if (ownerBtn) ownerBtn.addEventListener('click', () => { const rows = need(); const list = owners || [];
    const m = modal('Change owner', html`<form id="bulk-owner" class="form-grid"><p class="span2">Only people who can own a record are listed.</p>
      <label>Owner<select name="ownerId">${list.map((o) => html`<option value="${o.id}">${o.name}</option>`)}</select></label>
      <p class="err-text span2" data-form-err></p>
      <div class="span2"><button class="m-btn" type="submit">Change owner</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`);
    $('#bulk-owner', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const id = e.target.ownerId.value; if (!ownerAllowed(id, list)) throw new Error('Pick an owner from the list.');
      const result = module === 'deal'
        ? await runEach(rows, (r) => { if (typeof api.setDealSalesPeople !== 'function') throw new Error('Deal salespeople cannot be changed here.'); return api.setDealSalesPeople(r.id, [id]); })
        : await runEach(rows, (r) => { const fn = api[UPDATERS[module]]; if (typeof fn !== 'function') throw new Error('This list cannot be updated in bulk.'); return fn.call(api, r.id, { ownerId: id }); });
      closeModal(); report('Owner change', result); clear(); if (refresh) refresh(); })); });
  const taskBtn = $('[data-bulk-task]', bar);
  if (taskBtn) taskBtn.addEventListener('click', () => { const rows = need(); if (!TASK[module]) throw new Error('Tasks attach to a lead, client, company, or opportunity.');
    const m = modal('Create a task', html`<form id="bulk-task" class="form-grid"><p class="span2">One task on each selected record, using the same task fields as a single task.</p>
      <label class="span2">Subject<input name="subject" maxlength="200" required></label>
      <label>Due date<input name="dueDate" type="date" required></label>
      <p class="err-text span2" data-form-err></p>
      <div class="span2"><button class="m-btn" type="submit">Create tasks</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`);
    $('#bulk-task', m).addEventListener('submit', guard(async (e) => { e.preventDefault();
      const subject = e.target.subject.value; const dueDate = e.target.dueDate.value;
      const result = module === 'deal'
        ? await runEach(rows, (r) => { if (typeof api.createTask !== 'function') throw new Error('A task on a deal is a portal task, and that save is not available here.'); return api.createTask(r.id, { title: subject, dueDate, assignedRole: 'Processor', description: subject }); })
        : await runEach(rows, (r) => { if (typeof api.createCrmTask !== 'function') throw new Error('Tasks are not available here.'); return api.createCrmTask({ entity: TASK[module], entityId: r.id, subject, dueDate }); });
      closeModal(); report('Tasks', result); clear(); if (refresh) refresh(); })); });
  paint();
}
