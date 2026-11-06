// crm-settings.js : CRM SETTINGS page, #/crm/settings (Janine / John, Nov 2). Admin and Super admin ONLY (the tab is hidden from everyone else
// and the adapter refuses their calls). Pick lists, custom fields, built-in fields. Nothing here deletes stored data. Function first.
import { html, raw, $, $$, guard, formData, toast, modal, closeModal, pill } from '../ui.js?v=202611060220';
import { PICKLISTS, picklistDef, optionsOf, isLocked, FIELD_TYPES, fieldTypeLabel, CF_ENTITIES, SECTIONS_FOR, sectionLabel, PERSON_FIELDS, ACCOUNT_FIELDS, PROTECTED_FIELDS } from '../data/crm-config.js?v=202611060220';
import { tabs, head, sel } from './crm-kit.js?v=202611060220';
import { OPTION_TYPES, CHAR_TYPES, UNIQUE_TYPES, ENCRYPT_TYPES, LOOKUP_TARGETS, ROLLUP_RELATED, ROLLUP_FNS, PERM_ROLES, COMPUTED_TYPES, sectionsOf, DEFAULT_TYPES } from '../data/crm-fields.js?v=202611060220';

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
// add / edit a field (Zoho video 8: the 24 field types and their properties). Type-specific rows show only for their types.
const shows = (types) => raw(`data-for-types="${types.join(' ')}"`);
const fieldForm = (entity, f = null, cfg = null) => { const c = (f && f.config) || {}; const yes = (b) => (b ? raw('checked') : '');
  const secs = sectionsOf(cfg, entity).filter((z) => !z.hidden || (f && f.section === z.key)).map((z) => [z.key, z.label]);
  return html`<form id="cf-form" class="form-grid" novalidate>
  <label>Field Label *<input name="label" maxlength="60" value="${f ? f.label : ''}"></label>
  <label>Type${f ? html` <input value="${fieldTypeLabel(f.type)}" disabled data-cf-type-fixed="${f.type}"> <span class="muted small">(cannot change)</span>` : sel('type', FIELD_TYPES, 'text')}</label>
  <label>Shows in section${sel('section', secs, f ? f.section : entity === 'opportunity' ? 'info' : 'additional')}</label>
  <label class="check"><input type="checkbox" name="required" value="1" ${yes(f && f.required)} ${shows(FIELD_TYPES.map(([t]) => t).filter((t) => t !== 'checkbox' && !COMPUTED_TYPES.includes(t)))}> Mandatory (required)</label>
  <label class="check"><input type="checkbox" name="showInList" value="1" ${yes(!f || f.showInList)}> Show as a list column (and in the CSV export)</label>
  <label class="span2">Tooltip (help text, up to 255 characters)<input name="tooltip" maxlength="255" value="${f ? f.tooltip || '' : ''}"></label>
  <label class="check"><input type="checkbox" name="showTooltip" value="1" ${yes(f && f.showTooltip)}> Show the tooltip as text next to the field (otherwise on hover)</label>
  <label ${shows(Object.keys(CHAR_TYPES))}>Number of characters allowed<input name="maxChars" inputmode="numeric" value="${f && f.maxChars != null ? f.maxChars : ''}" placeholder="default"></label>
  <label class="check" ${shows(UNIQUE_TYPES)}><input type="checkbox" name="unique" value="1" ${yes(f && f.unique)}> Do not allow duplicate values</label>
  <label class="span2" ${shows(DEFAULT_TYPES)} data-cf-default>Default value (pre-fills new records; for a pick list or radio type the option name; for a checkbox type yes)<input name="defaultValue" maxlength="255" value="${f && f.defaultValue != null ? (f.defaultValue === true ? 'yes' : f.defaultValue) : ''}"></label>
  <label class="check" ${shows(ENCRYPT_TYPES)}><input type="checkbox" name="encrypted" value="1" ${yes(f && f.encrypted)}> Encrypt field (shown masked; see docs)</label>
  ${f ? '' : html`<label class="span2" data-cf-options ${shows(OPTION_TYPES)}>Options (one per line)<textarea name="options" rows="4" placeholder="Gold&#10;Silver&#10;Bronze"></textarea></label>`}
  <label ${shows(['lookup'])}>Lookup module${f ? html` <input value="${(LOOKUP_TARGETS.find(([k]) => k === c.target) || [0, c.target])[1]}" disabled>` : sel('config.target', LOOKUP_TARGETS, 'contacts')}</label>
  <label ${shows(['decimal'])}>Decimal places<input name="config.decimals" inputmode="numeric" value="${c.decimals ?? 2}"></label>
  <label ${shows(['autonumber'])}>Prefix<input name="config.prefix" maxlength="20" value="${c.prefix || ''}"></label>
  <label ${shows(['autonumber'])}>Suffix<input name="config.suffix" maxlength="20" value="${c.suffix || ''}"></label>
  ${f ? '' : html`<label ${shows(['autonumber'])}>Starting number<input name="config.start" inputmode="numeric" value="1"></label>`}
  <label class="span2" ${shows(['formula'])}>Formula (numbers, + - * / ( ) and \${Field Label})<input name="config.expression" maxlength="500" value="${c.expression || ''}" placeholder="\${Sales Volume (Last Year)} * 0.01"></label>
  <label ${shows(['formula'])}>Formula return type${sel('config.returnType', [['number', 'Number'], ['currency', 'Currency'], ['percent', 'Percent']], c.returnType || 'number')}</label>
  <label ${shows(['rollup'])}>Related module${f ? html` <input value="${c.related || ''}" disabled>` : sel('config.related', (ROLLUP_RELATED[entity] || []).map((r) => [r, r]), (ROLLUP_RELATED[entity] || [])[0])}</label>
  <label ${shows(['rollup'])}>Summary${sel('config.fn', ROLLUP_FNS, c.fn || 'count')}</label>
  <label ${shows(['rollup'])}>Field to summarize (not for Count; e.g. amount)<input name="config.field" maxlength="80" value="${c.field || ''}"></label>
  <p class="muted small span2">Values are checked when saved. Formula and rollup fields are calculated (basic: numbers only). Auto numbers are assigned on save. File and image fields are uploaded on the record page.</p>
  <p class="err-text span2" data-form-err></p>
  <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="submit">${f ? 'Save field' : 'Add field'}</button></div></form>`; };
// the type-specific rows follow the Type select
function wireFieldForm(form, type0) {
  const sync = () => { const t = type0 || ($('[name=type]', form) || {}).value; $$('[data-for-types]', form).forEach((el) => { const on = el.dataset.forTypes.split(' ').includes(t); (el.closest('label') || el).hidden = !on; if (!on && el.matches('input[type=checkbox]')) el.checked = false; }); };
  const ts = $('[name=type]', form); if (ts) ts.addEventListener('change', sync); sync();
}
// form values -> API input (config.* nested)
const fieldInput = (v) => { const out = { config: {} }; Object.entries(v).forEach(([k, x]) => { if (k.startsWith('config.')) out.config[k.slice(7)] = x; else out[k] = x; });
  ['required', 'showInList', 'showTooltip', 'unique', 'encrypted'].forEach((k) => { out[k] = !!v[k]; }); if (!Object.keys(out.config).length) delete out.config; return out; };
const permText = (f) => (!f.perms ? 'Everyone' : `View: ${f.perms.view.join(', ') || 'Admins only'}; Edit: ${f.perms.edit.join(', ') || 'Admins only'}`);

export async function settingsPage({ api, me, cfg, refresh }) {
  if (!me.canConfigure) throw new Error('Only an Admin or Super admin can change the CRM settings.');
  const p = q(); const listKey = PICKLISTS.some((l) => l.key === p.get('list')) ? p.get('list') : PICKLISTS[0].key;
  const entity = CF_ENTITIES.some(([c]) => c === p.get('entity')) ? p.get('entity') : 'contact'; const scope = p.get('scope') === 'account' ? 'account' : 'person';
  const def = picklistDef(listKey);
  const fields = (cfg.customFields || []).filter((f) => f.entity === entity).sort((a, b) => a.position - b.position);
  const live = fields.filter((f) => !f.archivedAt); const gone = fields.filter((f) => f.archivedAt); const sections = sectionsOf(cfg, entity);
  const bdefs = scope === 'account' ? ACCOUNT_FIELDS : PERSON_FIELDS; const bset = (cfg.fields || {})[scope] || {};
  const body = html`${head('CRM: Settings', me)}${tabs('settings')}
    <p class="muted">Admins and Super admins only. Everyone with the CRM uses these lists and fields; nothing here deletes data that is already stored.
      ${cfg.modifiedAt ? html`Last changed by ${cfg.modifiedByName || 'an Admin'}.` : ''}</p>
    <div class="card" data-settings-templates><h3>Email templates</h3><p>Templates, folders (Admins and Super admins create and rename them) and signatures:
      <a href="#/crm/templates" data-settings-templates-link>CRM &gt; Templates</a> · <a href="#/crm/signature">My email signature</a>. Nothing is sent until Gmail is connected.</p></div>
    <div class="card" data-settings-picklists><h3>Pick lists</h3>
      <div class="filter-bar">${PICKLISTS.map((l) => html`<a class="${l.key === listKey ? 'active-link' : ''}" href="${url({ list: l.key })}" data-pick-list="${l.key}">${l.label}</a> `)}</div>
      ${optionEditor(cfg, listKey, { title: def.label, note: `Used on: ${def.where}.${def.locked ? ` Locked options can be renamed and moved but not retired (${def.why}).` : ''}` })}</div>
    <div class="card" data-settings-fields><h3>Modules and Fields</h3>
      <div class="filter-bar">${CF_ENTITIES.map(([c, l]) => html`<a class="${c === entity ? 'active-link' : ''}" href="${url({ entity: c })}" data-cf-entity="${c}">${l}</a> `)}
        <button class="m-btn right" data-new-field>+ Add field to ${CF_ENTITIES.find(([c]) => c === entity)[1]}</button></div>
      <p class="muted small" data-protected-lookups>Always present (cannot be removed): ${((cfg.protectedLookups || {})[entity] || []).join(', ') || 'none'}.</p>
      <table class="tbl" data-cf-table><thead><tr><th>Label</th><th>Type</th><th>Required</th><th>Section</th><th>List column</th><th>Properties</th><th>Permission</th><th>Records with a value</th><th>Order</th><th></th></tr></thead><tbody>
      ${live.length ? live.map((f, i) => html`<tr data-cf-row="${f.id}"><td>${f.label}${f.tooltip ? html` <span class="muted small" title="${f.tooltip}">&#9432;</span>` : ''}</td><td>${fieldTypeLabel(f.type)}</td><td data-cf-required>${f.required ? 'Yes' : 'No'}</td><td>${sectionLabel(entity, f.section, cfg)}</td><td>${f.showInList ? 'Yes' : 'No'}</td>
        <td class="small">${[f.unique ? 'No duplicates' : '', f.encrypted ? 'Encrypted' : '', f.maxChars ? `Max ${f.maxChars} chars` : '', f.defaultValue != null ? `Default: ${f.defaultValue === true ? 'checked' : f.defaultValue}` : '', f.type === 'formula' ? (f.config || {}).expression : '', f.type === 'lookup' ? `→ ${(f.config || {}).target}` : ''].filter(Boolean).join(' · ')}</td>
        <td class="small" data-cf-perm>${permText(f)}</td><td>${f.storedValues || 0}</td>
        <td><button class="ghost" data-move-field="${f.id}" data-to="up" ${i === 0 ? raw('disabled') : ''} aria-label="Move up">&uarr;</button> <button class="ghost" data-move-field="${f.id}" data-to="down" ${i === live.length - 1 ? raw('disabled') : ''} aria-label="Move down">&darr;</button></td>
        <td><button class="ghost" data-edit-field="${f.id}">Edit</button> <button class="ghost" data-perm-field="${f.id}">Set Permission</button>
          ${f.type === 'checkbox' || COMPUTED_TYPES.includes(f.type) ? '' : html`<button class="ghost" data-mark-required="${f.id}" data-on="${f.required ? '0' : '1'}">${f.required ? 'Mark as optional' : 'Mark as required'}</button>`}
          <button class="ghost" data-archive-field="${f.id}" data-on="1">Delete</button></td></tr>`) : html`<tr><td colspan="10" class="muted">No custom fields yet.</td></tr>`}</tbody></table>
      <h4>Deleted fields (${gone.length})</h4>
      <p class="muted small">A deleted field is hidden from forms, record pages, lists and exports. Its stored values are kept and come back when the field is restored.</p>
      ${gone.length ? html`<table class="tbl" data-cf-deleted><thead><tr><th>Label</th><th>Type</th><th>Records with a value (kept)</th><th></th></tr></thead><tbody>${gone.map((f) => html`<tr data-cf-gone="${f.id}"><td>${f.label}</td><td>${fieldTypeLabel(f.type)}</td><td>${f.storedValues || 0}</td>
        <td><button class="ghost" data-archive-field="${f.id}" data-on="0">Restore</button></td></tr>`)}</tbody></table>` : html`<p class="muted">None.</p>`}</div>
    <div class="card" data-layout-editor><h3>Layout: sections for ${CF_ENTITIES.find(([c]) => c === entity)[1]}</h3>
      <p class="muted small">Sections group fields on the record page and the form. Built-in sections can be renamed and moved; added sections can also be hidden (never deleted; their fields stay).</p>
      <table class="tbl" data-sections-table><thead><tr><th>Section</th><th>Kind</th><th>Shown</th><th>Order</th><th></th></tr></thead><tbody>
      ${sections.map((z, i) => html`<tr data-section-row="${z.key}"><td><form class="inline-form" data-rename-section="${z.key}"><input name="label" value="${z.label}" maxlength="60" aria-label="Section name"> <button class="ghost" type="submit">Rename</button></form></td>
        <td>${z.builtin ? 'Built-in' : 'Added'}</td><td>${z.hidden ? pill('Hidden') : 'Yes'}</td>
        <td><button class="ghost" data-move-section="${z.key}" data-to="up" ${i === 0 ? raw('disabled') : ''} aria-label="Move up">&uarr;</button> <button class="ghost" data-move-section="${z.key}" data-to="down" ${i === sections.length - 1 ? raw('disabled') : ''} aria-label="Move down">&darr;</button></td>
        <td>${z.builtin ? '' : html`<button class="ghost" data-hide-section="${z.key}" data-on="${z.hidden ? '0' : '1'}">${z.hidden ? 'Show' : 'Hide'}</button>`}</td></tr>`)}</tbody></table>
      <form class="inline-form" data-add-section><input name="label" maxlength="60" placeholder="New section name" aria-label="New section"> <button class="m-btn" type="submit">+ Add section</button></form></div>
    <div class="card" data-dup-rules><h3>Duplicate check: Clients and Leads</h3>
      <p>Email: <strong>always blocked</strong> across Clients and Leads (the warning names the existing record and its owner).</p>
      <label class="check"><input type="checkbox" data-dup-phone ${(cfg.dupRules || {}).phone ? raw('checked') : ''}> Also block a duplicate phone number (digits compared)</label></div>
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
    $('[data-new-field]', root).addEventListener('click', () => { const m = modal(`Add a field to ${CF_ENTITIES.find(([c]) => c === entity)[1]}`, fieldForm(entity, null, cfg), { wide: true }); const f = $('#cf-form', m); wireFieldForm(f);
      f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const v = formData(f); $('[data-form-err]', f).textContent = '';
        try { await api.createCrmField({ ...fieldInput(v), entity, options: String(v.options || '').split(/\r?\n/) }); } catch (err) { $('[data-form-err]', f).textContent = err.message; throw err; }
        closeModal(); toast('Field added'); refresh(); })); });
    $$('[data-edit-field]', root).forEach((b) => b.addEventListener('click', () => { const fd = fields.find((z) => z.id === b.dataset.editField);
      const m = modal(`Edit field: ${fd.label}`, html`${fieldForm(entity, fd, cfg)}${OPTION_TYPES.includes(fd.type) ? html`<hr>${optionEditor(cfg, 'cf:' + fd.id, { title: 'Options' })}` : ''}`, { wide: true }); const f = $('#cf-form', m); wireFieldForm(f, fd.type);
      f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const v = formData(f); $('[data-form-err]', f).textContent = ''; const inp = fieldInput(v); if (COMPUTED_TYPES.includes(fd.type) || fd.type === 'checkbox') delete inp.required;
        try { await api.updateCrmField(fd.id, inp); } catch (err) { $('[data-form-err]', f).textContent = err.message; throw err; }
        closeModal(); toast('Field saved'); refresh(); }));
      wireOptions(m, api, () => { closeModal(); refresh(); }); }));
    $$('[data-archive-field]', root).forEach((b) => b.addEventListener('click', guard(async () => { const on = b.dataset.on === '1';
      if (on && !confirm('Delete this field? It is hidden everywhere in the CRM, but every value already stored is kept and comes back if you restore it.')) return;
      await api.archiveCrmField(b.dataset.archiveField, on); toast(on ? 'Field deleted (values kept)' : 'Field restored'); refresh(); })));
    // Set Permission (per role: view / edit; Admin and Super admin always both)
    $$('[data-perm-field]', root).forEach((b) => b.addEventListener('click', () => { const fd = fields.find((z) => z.id === b.dataset.permField); const p = fd.perms;
      const m = modal(`Set Permission: ${fd.label}`, html`<form id="perm-form"><table class="tbl"><thead><tr><th>Role</th><th>Read and write</th><th>Read only</th><th>Don't show</th></tr></thead><tbody>
        <tr><td>Super admin, Admin</td><td>Always</td><td></td><td></td></tr>
        ${PERM_ROLES.map((r) => { const cur = !p ? 'rw' : p.edit.includes(r) ? 'rw' : p.view.includes(r) ? 'ro' : 'none'; return html`<tr data-perm-role="${r}"><td>${r}</td>${['rw', 'ro', 'none'].map((k) => html`<td><input type="radio" name="${r}" value="${k}" ${cur === k ? raw('checked') : ''} aria-label="${r} ${k}"></td>`)}</tr>`; })}
        </tbody></table><p class="muted small">Sales Processor is read-only in parts of the CRM whatever is set here. Transaction Coordinators have no CRM.</p>
        <p class="err-text" data-form-err></p><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="submit">Save permission</button></form>`);
      $('#perm-form', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const v = formData(e.target); const view = []; const edit = [];
        PERM_ROLES.forEach((r) => { if (v[r] === 'rw') { view.push(r); edit.push(r); } else if (v[r] === 'ro') view.push(r); });
        await api.setCrmFieldPermission(fd.id, view.length === PERM_ROLES.length && edit.length === PERM_ROLES.length ? null : { view, edit }); closeModal(); toast('Permission saved'); refresh(); })); }));
    $$('[data-mark-required]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.updateCrmField(b.dataset.markRequired, { required: b.dataset.on === '1' }); toast(b.dataset.on === '1' ? 'Marked as required' : 'Marked as optional'); refresh(); })));
    // layout sections
    $$('[data-rename-section]', root).forEach((fm) => fm.addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.updateCrmSection(entity, fm.dataset.renameSection, { label: formData(fm).label }); toast('Section renamed'); refresh(); })));
    $$('[data-move-section]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.updateCrmSection(entity, b.dataset.moveSection, { move: b.dataset.to }); refresh(); })));
    $$('[data-hide-section]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.updateCrmSection(entity, b.dataset.hideSection, { hidden: b.dataset.on === '1' }); toast(b.dataset.on === '1' ? 'Section hidden (fields kept)' : 'Section shown'); refresh(); })));
    const as = $('[data-add-section]', root); as.addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.addCrmSection(entity, formData(as).label); toast('Section added'); refresh(); }));
    const dp = $('[data-dup-phone]', root); dp.addEventListener('change', guard(async () => { try { await api.setCrmDupRule('phone', dp.checked); toast('Saved'); } finally { refresh(); } }));
    $$('[data-move-field]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.moveCrmField(b.dataset.moveField, b.dataset.to); refresh(); })));
    $$('[data-req]', root).forEach((c) => c.addEventListener('change', guard(async () => { try { await api.setCrmBuiltinField(scope, c.dataset.req, { required: c.checked }); } finally { refresh(); } toast('Saved'); })));
    $$('[data-hide]', root).forEach((c) => c.addEventListener('change', guard(async () => { try { await api.setCrmBuiltinField(scope, c.dataset.hide, { hidden: c.checked }); } finally { refresh(); } toast(c.checked ? 'Field hidden (values kept)' : 'Field shown'); })));
  } };
}
