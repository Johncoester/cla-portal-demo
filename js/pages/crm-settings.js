// crm-settings.js : CRM SETTINGS page, #/crm/settings (Janine / John, Nov 2). Admin and Super admin ONLY (the tab is hidden from everyone else
// and the adapter refuses their calls). Pick lists, custom fields, built-in fields. Nothing here deletes stored data. Function first.
import { html, raw, $, $$, guard, formData, toast, modal, closeModal, pill } from '../ui.js?v=202611031525';
import { PICKLISTS, picklistDef, optionsOf, isLocked, FIELD_TYPES, fieldTypeLabel, CF_ENTITIES, SECTIONS_FOR, sectionLabel, PERSON_FIELDS, ACCOUNT_FIELDS, PROTECTED_FIELDS } from '../data/crm-config.js?v=202611031525';
import { tabs, head, sel } from './crm-kit.js?v=202611031525';

const q = () => new URLSearchParams(location.hash.split('?')[1] || '');
const url = (o) => { const n = new URLSearchParams({ ...Object.fromEntries(q()), ...o }); [...n.keys()].forEach((k) => { if (!n.get(k)) n.delete(k); }); return '#/crm/settings?' + n; };
const crumbs = [['CRM', '#/crm'], ['Settings']];

// one editable option list (a built-in pick list, or a dropdown field's own options: key 'cf:<id>')
function optionEditor(cfg, key, { title = '', note = '' } = {}) {
  const list = optionsOf(cfg, key); const use = (cfg.usage || {})[key] || {}; const active = list.filter((o) => !o.retired).length;
  return html`<div data-opt-editor="${key}">${title ? html`<h4>${title}</h4>` : ''}${note ? html`<p class="muted small">${note}</p>` : ''}
    <table class="tbl" data-opt-table="${key}"><thead><tr><th>#</th><th>Option (shown as)</th><th>Status</th><th>Records using it</th><th>Order</th><th></th></tr></thead><tbody>
    ${list.map((o, i) => html`<tr data-opt="${o.value}" class="${o.retired ? 'muted' : ''}"><td>${i + 1}</td>
      <td><form class="inline-form" data-rename="${o.value}"><input name="label" value="${o.label}" maxlength="60" aria-label="Option name"> <button class="ghost" type="submit">Rename</button></form>
        ${o.value !== o.label ? html`<span class="muted small">stored as "${o.value}"</span>` : ''}</td>
      <td data-opt-status>${o.retired ? pill('Retired') : 'Active'}${isLocked(key, o.value) ? html` <span class="muted small" title="${(picklistDef(key) || {}).why || ''}">(locked)</span>` : ''}</td>
      <td data-opt-use>${use[o.value] || 0}</td>
      <td><button class="ghost" data-move-opt="${o.value}" data-to="up" ${i === 0 ? raw('disabled') : ''} aria-label="Move up">&uarr;</button> <button class="ghost" data-move-opt="${o.value}" data-to="down" ${i === list.length - 1 ? raw('disabled') : ''} aria-label="Move down">&darr;</button></td>
      <td>${o.retired ? html`<button class="ghost" data-retire="${o.value}" data-on="0">Restore</button>`
        : isLocked(key, o.value) || active <= 1 ? html`<span class="muted small">${isLocked(key, o.value) ? 'cannot be retired' : 'last active option'}</span>` : html`<button class="ghost" data-retire="${o.value}" data-on="1">Retire</button>`}</td></tr>`)}
    </tbody></table>
    <form class="inline-form" data-add-opt="${key}"><input name="label" maxlength="60" placeholder="New option" aria-label="New option"> <button class="m-btn" type="submit">Add option</button></form>
    <p class="muted small">Retiring an option takes it off the lists for new entries; records that already use it keep it and show "(retired)". Renaming changes the name everywhere at once (records store a stable value).</p></div>`;
}
function wireOptions(root, api, refresh) {
  $$('[data-opt-editor]', root).forEach((ed) => { const key = ed.dataset.optEditor;
    $$('[data-rename]', ed).forEach((f) => f.addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.renameCrmOption(key, f.dataset.rename, formData(f).label); toast('Option renamed'); refresh(); })));
    $$('[data-retire]', ed).forEach((b) => b.addEventListener('click', guard(async () => { const on = b.dataset.on === '1';
      if (on && !confirm('Retire this option? It will no longer be offered for new entries. Records that use it keep it.')) return;
      await api.retireCrmOption(key, b.dataset.retire, on); toast(on ? 'Option retired' : 'Option restored'); refresh(); })));
    $$('[data-move-opt]', ed).forEach((b) => b.addEventListener('click', guard(async () => { await api.moveCrmOption(key, b.dataset.moveOpt, b.dataset.to); refresh(); })));
    const af = $('[data-add-opt]', ed); af.addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.addCrmOption(key, formData(af).label); toast('Option added'); refresh(); })); });
}
const fieldForm = (entity, f = null) => html`<form id="cf-form" class="form-grid" novalidate>
  <label>Label *<input name="label" maxlength="60" value="${f ? f.label : ''}"></label>
  <label>Type${f ? html` <input value="${fieldTypeLabel(f.type)}" disabled> <span class="muted small">(cannot change)</span>` : sel('type', FIELD_TYPES, 'text')}</label>
  <label>Shows in section${sel('section', SECTIONS_FOR[entity], f ? f.section : entity === 'opportunity' ? 'info' : 'additional')}</label>
  <label class="check"><input type="checkbox" name="required" value="1" ${f && f.required ? raw('checked') : ''}> Required</label>
  <label class="check"><input type="checkbox" name="showInList" value="1" ${!f || f.showInList ? raw('checked') : ''}> Show as a list column (and in the CSV export)</label>
  ${f ? '' : html`<label class="span2" data-cf-options>Dropdown options (one per line; only for Dropdown)<textarea name="options" rows="4" placeholder="Gold&#10;Silver&#10;Bronze"></textarea></label>`}
  <p class="muted small span2">Values are checked when saved: numbers, dates, emails, phone (xxx-xxx-xxxx) and http(s) web addresses only.</p>
  <p class="err-text span2" data-form-err></p>
  <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="submit">${f ? 'Save field' : 'Add field'}</button></div></form>`;

export async function settingsPage({ api, me, cfg, refresh }) {
  if (!me.canConfigure) throw new Error('Only an Admin or Super admin can change the CRM settings.');
  const p = q(); const listKey = PICKLISTS.some((l) => l.key === p.get('list')) ? p.get('list') : PICKLISTS[0].key;
  const entity = CF_ENTITIES.some(([c]) => c === p.get('entity')) ? p.get('entity') : 'contact'; const scope = p.get('scope') === 'account' ? 'account' : 'person';
  const def = picklistDef(listKey);
  const fields = (cfg.customFields || []).filter((f) => f.entity === entity).sort((a, b) => a.position - b.position);
  const live = fields.filter((f) => !f.archivedAt); const gone = fields.filter((f) => f.archivedAt);
  const bdefs = scope === 'account' ? ACCOUNT_FIELDS : PERSON_FIELDS; const bset = (cfg.fields || {})[scope] || {};
  const body = html`${head('CRM: Settings', me)}${tabs('settings')}
    <p class="muted">Admins and Super admins only. Everyone with the CRM uses these lists and fields; nothing here deletes data that is already stored.
      ${cfg.modifiedAt ? html`Last changed by ${cfg.modifiedByName || 'an Admin'}.` : ''}</p>
    <div class="card" data-settings-templates><h3>Email templates</h3><p>Templates, folders (Admins and Super admins create and rename them) and signatures:
      <a href="#/crm/templates" data-settings-templates-link>CRM &gt; Templates</a> · <a href="#/crm/signature">My email signature</a>. Nothing is sent until Gmail is connected.</p></div>
    <div class="card" data-settings-picklists><h3>Pick lists</h3>
      <div class="filter-bar">${PICKLISTS.map((l) => html`<a class="${l.key === listKey ? 'active-link' : ''}" href="${url({ list: l.key })}" data-pick-list="${l.key}">${l.label}</a> `)}</div>
      ${optionEditor(cfg, listKey, { title: def.label, note: `Used on: ${def.where}.${def.locked ? ` Locked options can be renamed and moved but not retired (${def.why}).` : ''}` })}</div>
    <div class="card" data-settings-fields><h3>Custom fields</h3>
      <div class="filter-bar">${CF_ENTITIES.map(([c, l]) => html`<a class="${c === entity ? 'active-link' : ''}" href="${url({ entity: c })}" data-cf-entity="${c}">${l}</a> `)}
        <button class="m-btn right" data-new-field>+ Add field to ${CF_ENTITIES.find(([c]) => c === entity)[1]}</button></div>
      <table class="tbl" data-cf-table><thead><tr><th>Label</th><th>Type</th><th>Required</th><th>Section</th><th>List column</th><th>Records with a value</th><th>Order</th><th></th></tr></thead><tbody>
      ${live.length ? live.map((f, i) => html`<tr data-cf-row="${f.id}"><td>${f.label}</td><td>${fieldTypeLabel(f.type)}</td><td>${f.required ? 'Yes' : 'No'}</td><td>${sectionLabel(entity, f.section)}</td><td>${f.showInList ? 'Yes' : 'No'}</td><td>${f.storedValues || 0}</td>
        <td><button class="ghost" data-move-field="${f.id}" data-to="up" ${i === 0 ? raw('disabled') : ''} aria-label="Move up">&uarr;</button> <button class="ghost" data-move-field="${f.id}" data-to="down" ${i === live.length - 1 ? raw('disabled') : ''} aria-label="Move down">&darr;</button></td>
        <td><button class="ghost" data-edit-field="${f.id}">Edit</button> <button class="ghost" data-archive-field="${f.id}" data-on="1">Delete</button></td></tr>`) : html`<tr><td colspan="8" class="muted">No custom fields yet.</td></tr>`}</tbody></table>
      <h4>Deleted fields (${gone.length})</h4>
      <p class="muted small">A deleted field is hidden from forms, record pages, lists and exports. Its stored values are kept and come back when the field is restored.</p>
      ${gone.length ? html`<table class="tbl" data-cf-deleted><thead><tr><th>Label</th><th>Type</th><th>Records with a value (kept)</th><th></th></tr></thead><tbody>${gone.map((f) => html`<tr data-cf-gone="${f.id}"><td>${f.label}</td><td>${fieldTypeLabel(f.type)}</td><td>${f.storedValues || 0}</td>
        <td><button class="ghost" data-archive-field="${f.id}" data-on="0">Restore</button></td></tr>`)}</tbody></table>` : html`<p class="muted">None.</p>`}</div>
    <div class="card" data-settings-builtin><h3>Built-in fields</h3>
      <div class="filter-bar"><a class="${scope === 'person' ? 'active-link' : ''}" href="${url({ scope: 'person' })}" data-scope="person">Leads and Clients</a> <a class="${scope === 'account' ? 'active-link' : ''}" href="${url({ scope: 'account' })}" data-scope="account">Companies</a></div>
      <p class="muted small">Hidden fields leave the forms, record pages and lists; values already stored are kept and show again when the field is un-hidden.
        Always shown (the CRM depends on them): ${PROTECTED_FIELDS[scope].join(', ')}. Last Name is always required.</p>
      <table class="tbl" data-builtin-table><thead><tr><th>Field</th><th>Required</th><th>Hidden</th></tr></thead><tbody>
      ${bdefs.map(([k, l, o]) => { const st = bset[k] || {}; return html`<tr data-builtin="${k}"><td>${l}</td>
        <td>${o && o.requirable ? html`<label class="check"><input type="checkbox" data-req="${k}" ${st.required ? raw('checked') : ''}> required</label>` : html`<span class="muted small">optional</span>`}</td>
        <td><label class="check"><input type="checkbox" data-hide="${k}" ${st.hidden ? raw('checked') : ''} ${st.required ? raw('disabled title="Un-require it first"') : ''}> hidden</label></td></tr>`; })}</tbody></table></div>`;
  return { title: 'CRM Settings', crumbs, body, mount(root) {
    wireOptions(root, api, refresh);
    $('[data-new-field]', root).addEventListener('click', () => { const m = modal(`Add a field to ${CF_ENTITIES.find(([c]) => c === entity)[1]}`, fieldForm(entity), { wide: true }); const f = $('#cf-form', m);
      f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const v = formData(f); $('[data-form-err]', f).textContent = '';
        try { await api.createCrmField({ ...v, entity, required: !!v.required, showInList: !!v.showInList, options: String(v.options || '').split(/\r?\n/) }); } catch (err) { $('[data-form-err]', f).textContent = err.message; throw err; }
        closeModal(); toast('Field added'); refresh(); })); });
    $$('[data-edit-field]', root).forEach((b) => b.addEventListener('click', () => { const fd = fields.find((z) => z.id === b.dataset.editField);
      const m = modal(`Edit field: ${fd.label}`, html`${fieldForm(entity, fd)}${fd.type === 'dropdown' ? html`<hr>${optionEditor(cfg, 'cf:' + fd.id, { title: 'Dropdown options' })}` : ''}`, { wide: true }); const f = $('#cf-form', m);
      f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const v = formData(f); $('[data-form-err]', f).textContent = '';
        try { await api.updateCrmField(fd.id, { label: v.label, section: v.section, required: !!v.required, showInList: !!v.showInList }); } catch (err) { $('[data-form-err]', f).textContent = err.message; throw err; }
        closeModal(); toast('Field saved'); refresh(); }));
      wireOptions(m, api, () => { closeModal(); refresh(); }); }));
    $$('[data-archive-field]', root).forEach((b) => b.addEventListener('click', guard(async () => { const on = b.dataset.on === '1';
      if (on && !confirm('Delete this field? It is hidden everywhere in the CRM, but every value already stored is kept and comes back if you restore it.')) return;
      await api.archiveCrmField(b.dataset.archiveField, on); toast(on ? 'Field deleted (values kept)' : 'Field restored'); refresh(); })));
    $$('[data-move-field]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.moveCrmField(b.dataset.moveField, b.dataset.to); refresh(); })));
    $$('[data-req]', root).forEach((c) => c.addEventListener('change', guard(async () => { try { await api.setCrmBuiltinField(scope, c.dataset.req, { required: c.checked }); } finally { refresh(); } toast('Saved'); })));
    $$('[data-hide]', root).forEach((c) => c.addEventListener('change', guard(async () => { try { await api.setCrmBuiltinField(scope, c.dataset.hide, { hidden: c.checked }); } finally { refresh(); } toast(c.checked ? 'Field hidden (values kept)' : 'Field shown'); })));
  } };
}
