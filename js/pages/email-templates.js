/* Admin > Email Templates (John, Nov 9): Admins build shared file-email templates.
 * Processors and other staff SELECT them on a file's Email tab (they do not author). Not CRM templates. */
import { html, raw, $, $$, guard, toast, fmtDateTime, pill, modal, closeModal, formData } from '../ui.js?v=202611070139';
import { editorHtml, mountEditor } from './compose.js?v=202611101015';
import {
  FILE_TEMPLATE_FIELDS, DEFAULT_RECIPIENT_ROLES, ATTACH_DOC_MATCH_OPTIONS,
  canManageFileTemplates, cleanTemplateInput,
} from '../data/file-email-templates.js?v=202611101015';

export async function render(ctx) {
  const { api, user, refresh } = ctx;
  if (!canManageFileTemplates(user) || !api.listFileEmailTemplates) throw new Error('That page does not exist.');
  const list = (await api.listFileEmailTemplates({ includeInactive: true }).catch(() => [])).filter((t) => t.scope === 'shared');
  const row = (t) => html`<tr data-et-row="${t.id}" data-et-active="${t.active ? 'yes' : 'no'}">
    <td><strong data-et-name>${t.name}</strong>${t.category ? html`<br><span class="muted small">${t.category}</span>` : ''}</td>
    <td class="small">${t.subject || html`<span class="muted">(no subject)</span>`}
      ${(t.attachDocTypes || []).length ? html`<br><span class="muted small">Attach: ${(t.attachDocTypes || []).join(', ')}</span>` : ''}
      ${(t.defaultRecipientRoles || []).length ? html`<br><span class="muted small">To: ${(t.defaultRecipientRoles || []).join(', ')}</span>` : ''}</td>
    <td>${t.active ? pill('Active', 'ok') : pill('Inactive', 'warn')}</td>
    <td class="small muted">${fmtDateTime(t.updatedAt || t.createdAt)}</td>
    <td class="nowrap">
      <button type="button" class="m-btn small" data-et-edit="${t.id}">Edit</button>
      <button type="button" class="ghost small" data-et-dup="${t.id}">Duplicate</button>
      ${t.active
        ? html`<button type="button" class="ghost small" data-et-off="${t.id}">Deactivate</button>`
        : html`<button type="button" class="ghost small" data-et-on="${t.id}">Reactivate</button>`}
    </td></tr>`;
  const body = html`<section class="email-templates-page" data-email-templates-page>
    <div class="page-head"><div><p class="eyebrow">Admin</p><h2 class="page-title">Email Templates</h2>
      <p class="muted">Build shared emails for a file's Email tab. Staff pick one with <strong>Use template</strong> when composing; they can still edit before sending.
      Use fields like <code>{{recipient_first_name}}</code>, <code>{{buyer_first_name}}</code>, <code>{{file_number}}</code>. Optionally auto-attach documents by type (e.g. Contract) and suggest recipients by role.
      Separate from CRM Email Templates. Admin / Super admin only.</p></div>
      <button type="button" class="m-btn" data-et-new>+ New template</button></div>
    <div class="card"><h3>Shared templates <span class="muted small">(${list.length})</span></h3>
      ${list.length ? html`<table class="tbl" data-et-table><thead><tr><th>Name</th><th>Subject / options</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>${list.map(row)}</tbody></table>`
        : html`<p class="muted" data-et-empty>No templates yet. Create one for staff to use on a file.</p>`}</div>
    <div class="card"><h3>Available fields</h3>
      <p class="small">${FILE_TEMPLATE_FIELDS.map(([k, label]) => html`<code title="${label}">{{${k}}}</code> `)}</p></div>
  </section>`;
  return { title: 'Email Templates', crumbs: [['Email Templates']], body, mount(root) {
    const byId = new Map(list.map((t) => [t.id, t]));
    $('[data-et-new]', root).addEventListener('click', () => formModal(null));
    $$('[data-et-edit]', root).forEach((b) => b.addEventListener('click', () => formModal(byId.get(b.dataset.etEdit))));
    $$('[data-et-dup]', root).forEach((b) => b.addEventListener('click', guard(async () => {
      const t = byId.get(b.dataset.etDup); const name = prompt('Name for the copy', `Copy of ${t.name}`); if (name == null) return;
      const src = await api.getFileEmailTemplate(t.id);
      await api.createFileEmailTemplate({
        name, subject: src.subject, bodyHtml: src.bodyHtml || src.body_html, category: src.category,
        active: true, attachDocTypes: src.attachDocTypes || [], defaultRecipientRoles: src.defaultRecipientRoles || [],
      });
      toast('Duplicated'); refresh();
    })));
    $$('[data-et-off]', root).forEach((b) => b.addEventListener('click', guard(async () => {
      if (!confirm('Deactivate this template? Staff will no longer see it under Use template.')) return;
      await api.setFileEmailTemplateActive(b.dataset.etOff, false); toast('Deactivated'); refresh();
    })));
    $$('[data-et-on]', root).forEach((b) => b.addEventListener('click', guard(async () => {
      await api.setFileEmailTemplateActive(b.dataset.etOn, true); toast('Reactivated'); refresh();
    })));

    function formModal(t) {
      const creating = !t;
      const attach = new Set(t ? (t.attachDocTypes || t.attach_doc_types || []) : []);
      const roles = new Set(t ? (t.defaultRecipientRoles || t.default_recipient_roles || []) : []);
      const m = modal(creating ? 'New email template' : `Edit: ${t.name}`, html`<form id="etf" class="form-grid" data-et-form novalidate>
        <label class="span2">Name *<input name="name" maxlength="120" required value="${t ? t.name : ''}"></label>
        <label class="span2">Category <span class="muted small">(optional)</span><input name="category" maxlength="60" value="${t ? (t.category || '') : ''}"></label>
        <label class="span2">Subject<input name="subject" maxlength="250" value="${t ? (t.subject || '') : ''}" data-et-subject></label>
        <div class="span2 small" data-et-fields>Insert field:
          ${FILE_TEMPLATE_FIELDS.map(([k, label]) => html`<button type="button" class="ghost small" data-et-insert="{{${k}}}" title="${label}">{{${k}}}</button> `)}
        </div>
        <div class="span2" data-et-editor>${editorHtml('et-rte')}</div>
        <fieldset class="span2" data-et-attach><legend class="small">Auto-attach documents matching</legend>
          <p class="muted small">When staff pick this template, matching documents on the file are checked for them (they can uncheck). Match is by document type, file name, or folder.</p>
          ${ATTACH_DOC_MATCH_OPTIONS.map((k) => html`<label class="small"><input type="checkbox" value="${k}" data-et-attach-key ${attach.has(k) ? raw('checked') : ''}> ${k}</label><br>`)}
          <label class="small">Other match text <input name="attachExtra" maxlength="60" placeholder="e.g. Commitment" value=""></label>
        </fieldset>
        <fieldset class="span2" data-et-roles><legend class="small">Suggest recipients (To) by role</legend>
          <p class="muted small">Optional. Fills To from people on the file with these roles; staff can change it.</p>
          ${DEFAULT_RECIPIENT_ROLES.map(([k, label]) => html`<label class="small"><input type="checkbox" value="${k}" data-et-role ${roles.has(k) ? raw('checked') : ''}> ${label}</label> `)}
        </fieldset>
        <label class="span2"><input type="checkbox" name="active" ${!t || t.active ? raw('checked') : ''}> Active (show under Use template on a file)</label>
        <p class="span2 err-text" data-et-err hidden></p>
        <div class="span2"><button class="m-btn" type="submit">${creating ? 'Create template' : 'Save changes'}</button>
          <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
      const ed = mountEditor($('[data-et-editor]', m));
      ed.box.innerHTML = (t && (t.bodyHtml || t.body_html)) || '<p><br></p>';
      let insertTarget = 'body';
      $('[data-et-subject]', m).addEventListener('focus', () => { insertTarget = 'subject'; });
      ed.box.addEventListener('focus', () => { insertTarget = 'body'; });
      $$('[data-et-insert]', m).forEach((b) => b.addEventListener('click', () => {
        const tok = b.dataset.etInsert;
        if (insertTarget === 'subject') {
          const inp = $('[data-et-subject]', m); const start = inp.selectionStart || inp.value.length;
          inp.value = inp.value.slice(0, start) + tok + inp.value.slice(inp.selectionEnd || start); inp.focus();
        } else { ed.box.focus(); document.execCommand('insertText', false, tok); }
      }));
      $('#etf', m).addEventListener('submit', guard(async (e) => {
        e.preventDefault(); const f = formData(e.target); const err = $('[data-et-err]', m);
        try {
          const attachDocTypes = $$('[data-et-attach-key]', m).filter((c) => c.checked).map((c) => c.value);
          const extra = String(f.attachExtra || '').trim(); if (extra) attachDocTypes.push(extra);
          const defaultRecipientRoles = $$('[data-et-role]', m).filter((c) => c.checked).map((c) => c.value);
          const input = cleanTemplateInput({ name: f.name, subject: f.subject, bodyHtml: ed.html, category: f.category, active: !!f.active, attachDocTypes, defaultRecipientRoles });
          if (creating) await api.createFileEmailTemplate(input); else await api.updateFileEmailTemplate(t.id, input);
          closeModal(); toast(creating ? 'Template created' : 'Template saved'); refresh();
        } catch (ex) { err.hidden = false; err.textContent = ex.message; }
      }));
    }
  } };
}
