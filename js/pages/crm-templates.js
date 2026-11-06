// crm-templates.js : CRM > Templates (John / Janine, Nov 3; Zoho video 6 "Creating an Email Template"). Routes:
//   #/crm/templates[?view=&q=]   list with the folder sidebar (All Templates, Favorites, Created by Me, Shared with Me, Public Templates, folders)
//   #/crm/templates/new[?module=&tab=]   choose the module, then a gallery layout (builder) or "Insert HTML / Plain text"
//   #/crm/templates/<id>         edit (written email editor or block builder); read-only for the Processor and for other people's templates
//   #/crm/signature              my email signature (${User Signature})
// Plus composeModal(): "Compose email from template" on a lead / client / company / opportunity. NOTHING IS SENT anywhere; Send Test Email is
// shown but cannot send until Gmail is connected; Stats (Opened / Bounced / Clicked) wait for Gmail too. Function first, minimal styling.
import { html, raw, $, $$, guard, toast, modal, closeModal, pill, fmtDateTime, fmtSize } from '../ui.js?v=202611062120';
import { TEMPLATE_MODULES, moduleLabel, GALLERY_TABS, GALLERY, starterBlocks, VIEW_FOLDERS, templatesInView, GMAIL_NOTE, STATS_NOTE, templateHtml, textToHtml, ATTACH_EXT, isPersonalFolder } from '../data/crm-templates.js?v=202611062120';
import { tabs, head } from './crm-kit.js?v=202611062120';
import { richEditor, wireInputPicker, insertIntoInput, openPicker, copyText, readFile } from './crm-rte.js?v=202611062120';
import { builder } from './crm-builder.js?v=202611062120';

const q = () => new URLSearchParams(location.hash.split('?')[1] || '');
const crumbs = (extra) => [['CRM', '#/crm'], ['Templates', '#/crm/templates'], ...(extra ? [[extra]] : [])];
const dash = html`<span class="muted" title="${STATS_NOTE}">&mdash;</span>`;
const LISTERS = { lead: 'listCrmLeads', contact: 'listCrmContacts', account: 'listCrmAccounts', opportunity: 'listCrmOpportunities' };
const recordsOf = async (api, module) => (await api[LISTERS[module]]()).filter((r) => !r.archived);
let PENDING = null;   // the unsaved new template (module + kind + starter) while its editor is open

// ---------------- list ----------------
async function listPage({ api, me, go, refresh }) {
  const p = q(); const view = p.get('view') || 'all'; const showRetired = p.get('retired') === '1';
  const [rows, fo] = await Promise.all([api.listCrmEmailTemplates(), api.listCrmEmailFolders()]);
  const viewName = (VIEW_FOLDERS.find(([k]) => k === view) || [])[1] || (fo.folders.find((f) => f.id === view) || {}).name || 'All Templates';
  const url = (o) => { const n = new URLSearchParams({ view, ...(showRetired ? { retired: '1' } : {}), ...o }); [...n.keys()].forEach((k) => { if (!n.get(k)) n.delete(k); }); return '#/crm/templates?' + n; };
  const side = html`<nav class="tpl-side" data-tpl-side>
    <ul>${VIEW_FOLDERS.map(([k, l]) => html`<li><a class="${view === k ? 'active-link' : ''}" href="${url({ view: k })}" data-view="${k}">${l}</a></li>`)}</ul>
    <h4>Folders ${fo.canCreate ? html`<button type="button" class="ghost small" data-new-folder title="Admins and Super admins create folders">+ New Folder</button>` : ''}</h4>
    <ul data-folder-list>${fo.folders.map((f) => html`<li data-folder="${f.id}"><a class="${view === f.id ? 'active-link' : ''}" href="${url({ view: f.id })}">${f.name}</a> <span class="muted small">(${f.count})${f.kind === 'personal' ? ' · only you' : ''}</span>
      ${fo.canCreate && f.kind === 'shared' ? html` <button type="button" class="ghost small" data-rename-folder="${f.id}" data-name="${f.name}" aria-label="Rename folder">Rename</button>` : ''}</li>`)}</ul>
    <p class="muted small">${fo.canCreate ? 'Shared folders are seen by everyone with the CRM; your own folder only by you.' : 'Only Admins and Super admins create folders. Your own folder is seen only by you.'}</p>
    <p><a href="#/crm/signature" data-my-signature>My email signature</a></p></nav>`;
  const body = html`${head('CRM: Email Templates', me, me.canEdit ? html`<a class="m-btn right" href="#/crm/templates/new" data-new-template>+ New Template</a>` : '')}${tabs('templates')}
    <p class="muted small">Templates are tied to one module (a Leads template is only offered on leads). Nothing is sent from the CRM: ${GMAIL_NOTE}</p>
    <div class="tpl-layout">${side}<div class="tpl-main">
      <div class="filter-bar"><label>Search<input type="search" data-tpl-search placeholder="Name, subject, folder, person" value="${p.get('q') || ''}"></label>
        <label>Module<select data-tpl-module><option value="">All modules</option>${TEMPLATE_MODULES.map(([c, l]) => html`<option value="${c}">${l}</option>`)}</select></label>
        <label class="check"><input type="checkbox" data-tpl-retired ${showRetired ? raw('checked') : ''}> Show retired templates</label></div>
      <h3 data-view-name>${viewName}${showRetired ? ' (retired)' : ''}</h3>
      <table class="tbl" data-tpl-table><thead><tr><th aria-label="Favorite"></th><th>Template Name</th><th>Module</th><th>Subject</th><th>Folder</th><th>Status</th><th>Created By</th><th>Modified By</th><th>Modified Time</th>
        <th title="${STATS_NOTE}">Opened</th><th title="${STATS_NOTE}">Bounced</th><th title="${STATS_NOTE}">Clicked</th><th></th></tr></thead><tbody></tbody></table>
      <p class="muted small" data-stats-note>Stats: &mdash; (${STATS_NOTE}).</p></div></div>`;
  return { title: 'CRM Templates', crumbs: crumbs(), body, mount(root) {
    const tb = $('[data-tpl-table] tbody', root); const s = $('[data-tpl-search]', root); const mod = $('[data-tpl-module]', root);
    const draw = () => { const list = templatesInView(rows, view, me.id, { q: s.value, retired: showRetired, module: mod.value });
      tb.innerHTML = String(list.length ? html`${list.map((t) => html`<tr data-tpl-row="${t.id}">
        <td><button type="button" class="star ${t.favorite ? 'on' : ''}" data-fav="${t.id}" data-on="${t.favorite ? '0' : '1'}" aria-label="${t.favorite ? 'Remove from favorites' : 'Add to favorites'}" title="Favorite">${raw(t.favorite ? '&#9733;' : '&#9734;')}</button></td>
        <td><a href="#/crm/templates/${t.id}" data-open-tpl="${t.id}">${t.name}</a> ${t.attachments.length ? html`<span class="muted small" title="Attachments">&#128206;${t.attachments.length}</span>` : ''}</td>
        <td>${t.moduleLabel}</td><td>${t.subject}</td><td>${t.folderName}</td><td data-status>${t.retired ? pill('Retired') : t.status === 'draft' ? pill('Draft') : 'Active'}</td>
        <td>${t.createdByName}</td><td>${t.modifiedByName}</td><td>${fmtDateTime(t.modifiedAt)}</td><td>${dash}</td><td>${dash}</td><td>${dash}</td>
        <td>${t.canEdit ? html`<button type="button" class="ghost" data-retire-tpl="${t.id}" data-on="${t.retired ? '0' : '1'}">${t.retired ? 'Restore' : 'Retire'}</button>` : ''}</td></tr>`)}`
        : html`<tr><td colspan="13" class="muted">No templates here.</td></tr>`);
      $$('[data-fav]', tb).forEach((b) => b.addEventListener('click', guard(async () => { await api.setCrmTemplateFavorite(b.dataset.fav, b.dataset.on === '1'); const r = rows.find((z) => z.id === b.dataset.fav); r.favorite = b.dataset.on === '1'; draw(); })));
      $$('[data-retire-tpl]', tb).forEach((b) => b.addEventListener('click', guard(async () => { const on = b.dataset.on === '1';
        if (on && !confirm('Retire this template? It is hidden from the lists and from Compose, never deleted; you can restore it.')) return;
        await api.retireCrmEmailTemplate(b.dataset.retireTpl, on); toast(on ? 'Template retired' : 'Template restored'); refresh(); }))); };
    s.addEventListener('input', draw); mod.addEventListener('change', draw); draw();
    $('[data-tpl-retired]', root).addEventListener('change', (e) => go('/crm/templates?' + url({ retired: e.target.checked ? '1' : '' }).split('?')[1]));
    const nf = $('[data-new-folder]', root); if (nf) nf.addEventListener('click', () => folderDialog(api, null, () => refresh()));
    $$('[data-rename-folder]', root).forEach((b) => b.addEventListener('click', () => folderDialog(api, { id: b.dataset.renameFolder, name: b.dataset.name }, () => refresh())));
  } };
}
function folderDialog(api, f, done) {
  const m = modal(f ? 'Rename folder' : 'New Folder', html`<form id="folder-form" class="form-grid" novalidate><label class="span2">Folder name<input name="name" maxlength="60" value="${f ? f.name : ''}" data-folder-name></label>
    <p class="err-text span2" data-form-err></p><div class="span2"><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="submit">${f ? 'Rename' : 'Create folder'}</button></div></form>`);
  $('#folder-form', m).addEventListener('submit', async (e) => { e.preventDefault(); try { const r = f ? await api.renameCrmEmailFolder(f.id, e.target.name.value) : await api.createCrmEmailFolder(e.target.name.value); closeModal(); toast(f ? 'Folder renamed' : 'Folder created'); done(r); }
    catch (err) { $('[data-form-err]', m).textContent = err.message; } });
}

// ---------------- new: module, then gallery ----------------
async function newPage({ api, me, go }) {
  if (!me.canEdit) throw new Error('The Processor has read-only access to the CRM (templates can be viewed and used, not created).');
  const p = q(); const module = TEMPLATE_MODULES.some(([c]) => c === p.get('module')) ? p.get('module') : ''; const tab = GALLERY_TABS.some(([k]) => k === p.get('tab')) ? p.get('tab') : 'basic';
  const step1 = html`<div class="card" data-step="module"><h3>1. Choose the module</h3><p class="muted small">A template works only in its module (e.g. a Clients template is offered on clients, not on leads).</p>
    <form class="inline-form" data-module-form><select name="module" data-pick-module>${TEMPLATE_MODULES.map(([c, l]) => html`<option value="${c}" ${c === (module || 'contact') ? raw('selected') : ''}>${l}</option>`)}</select> <button class="m-btn" type="submit" data-module-next>Next</button></form></div>`;
  const list = GALLERY[tab];
  const step2 = module ? html`<div class="card" data-step="gallery"><h3>2. Pick a template for ${moduleLabel(module)}</h3>
    <p class="muted small">Two kinds (Janine): a <strong>written email</strong> (Insert HTML / Plain text) or a <strong>graphic email</strong> for a formal message or an email blast (drag-and-drop builder).</p>
    <ul class="nav-tabs" data-gallery-tabs>${GALLERY_TABS.map(([k, l]) => html`<li><a class="${k === tab ? 'active' : ''}" href="#/crm/templates/new?module=${module}&tab=${k}" data-gallery-tab="${k}">${l}</a></li>`)}</ul>
    <div class="card-grid" data-gallery>${list.length ? list.map((g) => html`<div class="card" data-layout="${g.key}"><h4>${g.name}</h4><p class="muted small">${g.blocks.length ? `${g.blocks.length} blocks` : 'Start from an empty email'}</p>
      <button type="button" class="m-btn" data-use-layout="${g.key}">Use this layout</button></div>`) : html`<p class="muted" data-coming-soon>Coming soon: ${(GALLERY_TABS.find(([k]) => k === tab) || [])[1]} layouts are not available yet.</p>`}</div>
    <p>Or <a href="#" data-start-plain>Insert HTML / Plain text</a> (a regular written email).</p></div>` : '';
  const body = html`${head('CRM: New Email Template', me)}${tabs('templates')}${step1}${step2}<p><a class="ghost" href="#/crm/templates">Cancel</a></p>`;
  return { title: 'New Template', crumbs: crumbs('New Template'), body, mount(root) {
    $('[data-module-form]', root).addEventListener('submit', (e) => { e.preventDefault(); go(`/crm/templates/new?module=${e.target.module.value}&tab=basic`); });
    $$('[data-use-layout]', root).forEach((b) => b.addEventListener('click', () => { PENDING = { module, kind: 'builder', blocks: starterBlocks(b.dataset.useLayout, module), layout: b.dataset.useLayout }; go('/crm/templates/draft'); }));
    const pl = $('[data-start-plain]', root); if (pl) pl.addEventListener('click', (e) => { e.preventDefault(); PENDING = { module, kind: 'html', body: '' }; go('/crm/templates/draft'); });
  } };
}

// ---------------- dialogs shared by the editors ----------------
// Select Folder (every Save / Save As). Admins may make a new folder right here.
async function selectFolder(api, { title = 'Select Folder', current = '', name = null } = {}) {
  const fo = await api.listCrmEmailFolders();
  return new Promise((resolve) => {
    const m = modal(title, html`<form id="sf-form" class="form-grid" novalidate>${name != null ? html`<label class="span2">Template Name<input name="name" maxlength="120" value="${name}" data-saveas-name></label>` : ''}
      <label class="span2">Folder<select name="folderId" data-folder-select>${fo.folders.map((f) => html`<option value="${f.id}" ${f.id === (current || fo.folders[fo.folders.length - 1].id) ? raw('selected') : ''}>${f.name}${f.kind === 'personal' ? ' (only you)' : ''}</option>`)}</select></label>
      ${fo.canCreate ? html`<label class="span2">Or a new folder (Admin)<input name="newFolder" maxlength="60" placeholder="New folder name" data-sf-new></label>` : html`<p class="muted small span2">Only Admins and Super admins create folders.</p>`}
      <p class="err-text span2" data-form-err></p><div class="span2"><button class="ghost" type="button" data-sf-cancel>Cancel</button> <button class="m-btn" type="submit" data-sf-ok>Save</button></div></form>`);
    $('[data-sf-cancel]', m).addEventListener('click', () => { closeModal(); resolve(null); });
    $('#sf-form', m).addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target; let folderId = f.folderId.value;
      try { if (f.newFolder && f.newFolder.value.trim()) folderId = (await api.createCrmEmailFolder(f.newFolder.value)).id; } catch (err) { $('[data-form-err]', m).textContent = err.message; return; }
      closeModal(); resolve({ folderId, name: f.name ? f.name.value : undefined }); });
  });
}
export function testEmailDialog(me) {
  modal('Send Test Email', html`<form id="test-form" class="form-grid" onsubmit="return false"><label class="span2">Email Address(es)<input name="to" value="${me.email || ''}" data-test-to placeholder="you@example.test, other@example.test"></label>
    <p class="muted span2" data-gmail-note>${GMAIL_NOTE} Nothing is sent from this test portal.</p>
    <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="button" disabled title="${GMAIL_NOTE}" data-test-send>Send</button></div></form>`);
}
// Preview: merged against a chosen fake record of the template's module, Desktop / Mobile widths. `load(recordId)` -> api.previewCrmEmail(...)
export async function previewModal(api, me, module, load) {
  const recs = await recordsOf(api, module);
  const m = modal('Preview', html`<div data-preview>
    <div class="filter-bar"><label>Merge with (${moduleLabel(module)})<select data-preview-record><option value="">(no record: fields blank)</option>${recs.map((r, i) => html`<option value="${r.id}" ${i === 0 ? raw('selected') : ''}>${r.name}</option>`)}</select></label>
      <span><button type="button" class="ghost on" data-device="desktop">Desktop</button> <button type="button" class="ghost" data-device="mobile">Mobile</button></span>
      <button type="button" class="ghost" data-preview-test title="${GMAIL_NOTE}">Send a Test Email</button></div>
    <p><strong>Subject:</strong> <span data-preview-subject></span></p><p class="err-text" data-preview-unknown></p>
    <div class="tpl-frame-wrap"><iframe sandbox="" title="Email preview" data-preview-frame class="tpl-frame" style="width: 100%"></iframe></div>
    <p data-preview-atts class="small"></p><p class="muted small">${GMAIL_NOTE} Preview only; nothing is sent.</p></div>`, { wide: true });
  const frame = $('[data-preview-frame]', m); const sel = $('[data-preview-record]', m);
  const draw = guard(async () => { const r = await load(sel.value); $('[data-preview-subject]', m).textContent = r.subject; frame.srcdoc = `<!doctype html><meta charset="utf-8"><body style="margin:0">${r.html}</body>`;
    $('[data-preview-unknown]', m).textContent = r.unknown.length ? `Not a ${moduleLabel(module)} field (left blank): ${r.unknown.join(', ')}` : '';
    $('[data-preview-atts]', m).textContent = r.attachments.length ? 'Attachments: ' + r.attachments.map((a) => a.name).join(', ') : ''; });
  sel.addEventListener('change', draw);
  $$('[data-device]', m).forEach((b) => b.addEventListener('click', () => { $$('[data-device]', m).forEach((z) => z.classList.toggle('on', z === b)); frame.style.width = b.dataset.device === 'mobile' ? '375px' : '100%'; frame.dataset.width = b.dataset.device; }));
  $('[data-preview-test]', m).addEventListener('click', () => testEmailDialog(me));
  await draw(); return m;
}

// ---------------- editor (written email or builder) ----------------
async function editorPage({ api, me, params, go, refresh }) {
  const isNew = params.id === 'draft';
  if (isNew && !PENDING) { go('/crm/templates/new'); return { title: 'New Template', crumbs: crumbs(), body: html`<p>Starting over...</p>` }; }
  if (isNew && !me.canEdit) throw new Error('The Processor has read-only access to the CRM.');
  const t = isNew ? { id: '', name: '', subject: '', status: 'active', folderId: '', attachments: [], detachedAttachments: [], canEdit: true, body: '', blocks: [], pageBg: '', ...PENDING } : await api.getCrmEmailTemplate(params.id);
  const ro = !t.canEdit; const fields = await api.crmMergeFields(t.module); const getFields = () => fields;
  const pending = [];   // files picked before the first save (uploaded right after it)
  let dirty = false; const mark = () => { dirty = true; const s = document.querySelector('[data-dirty]'); if (s) s.textContent = 'Unsaved changes'; };
  const ed = t.kind === 'html' ? richEditor('tpl', t.body, { fields: getFields, pageBg: t.pageBg }) : builder(t, { fields: getFields, onChange: mark, readOnly: ro });
  const btns = ro ? html`<button type="button" class="ghost" data-preview-btn>Preview</button> ${me.canEdit ? html`<button type="button" class="ghost" data-save-as>Save As</button> ` : ''}<a class="ghost" href="#/crm/templates" data-close-editor>Close</a>`
    : html`${t.kind === 'html' ? html`<button type="button" class="m-btn" data-save>Save Now</button>` : html`<button type="button" class="m-btn" data-save>Save</button>`}
      <button type="button" class="ghost" data-save-draft>Save as Draft</button>${t.id ? html` <button type="button" class="ghost" data-save-as>Save As</button>` : ''}
      <button type="button" class="ghost" data-preview-btn>Preview</button> <button type="button" class="ghost" data-attach-btn title="Attachments">&#128206; Attachments</button>
      <button type="button" class="ghost" data-test-btn title="${GMAIL_NOTE}">Send Test Email</button> <button type="button" class="ghost" data-close-editor>Close</button>`;
  const atts = (list) => html`${list.length ? html`<ul data-att-list>${list.map((a) => html`<li data-tpl-att="${a.id}"><a href="#" data-open-file="${a.id}">${a.name}</a> <span class="muted small">${fmtSize(a.size)}</span>
      ${ro ? '' : html` <button type="button" class="ghost small" data-detach="${a.id}">Detach</button>`}</li>`)}</ul>` : html`<p class="muted small" data-no-atts>No attachments.</p>`}
    ${t.detachedAttachments && t.detachedAttachments.length && !ro ? html`<p class="small">Detached (kept, never deleted): ${t.detachedAttachments.map((a) => html`${a.name} <button type="button" class="ghost small" data-reattach="${a.id}">Re-attach</button> `)}</p>` : ''}`;
  const body = html`${head(`CRM: ${isNew ? 'New' : ro ? 'View' : 'Edit'} Email Template`, me)}${tabs('templates')}
    <div class="card" data-tpl-editor="${t.kind}"><div class="tpl-head-btns">${btns} <span class="muted small" data-dirty></span></div>
      ${ro ? html`<p class="muted" data-tpl-readonly>${me.canEdit ? 'Only the person who made this template (or an Admin) can change it. Save As makes your own copy.' : 'Read-only: the Processor can view and use templates but not create or change them.'}</p>` : ''}
      <div class="form-grid" data-tpl-fields>
        <label>Template Name *<input name="name" maxlength="120" value="${t.name}" data-tpl-name ${ro ? raw('disabled') : ''}></label>
        <label>Module<input value="${moduleLabel(t.module)}" disabled data-tpl-module-shown> <span class="muted small">(fixed: a template works in one module)</span></label>
        <label class="span2">Subject * <span class="muted small">(type # for a merge field)</span><span class="inline-form"><input name="subject" maxlength="250" value="${t.subject}" data-tpl-subject style="flex: 1" ${ro ? raw('disabled') : ''}>
          ${ro ? '' : html`<button type="button" class="ghost" data-subject-field># Insert field</button>`}</span></label>
        ${t.id ? html`<p class="muted small span2">Folder: <strong data-tpl-folder>${t.folderName}</strong> · ${t.status === 'draft' ? pill('Draft') : 'Active'}${t.retired ? html` ${pill('Retired')}` : ''} · created by ${t.createdByName}, modified by ${t.modifiedByName} ${fmtDateTime(t.modifiedAt)}</p>` : ''}
      </div>
      ${t.kind === 'html' ? (ro ? html`<div class="tpl-ro-body" data-ro-body><iframe sandbox="" title="Template" class="tpl-frame" style="width: 100%" data-ro-frame></iframe></div>` : ed.body) : ed.body}
      <div data-tpl-atts><h4>&#128206; Attachments (PDF, PNG, JPG)</h4><div data-att-box>${atts(t.attachments || [])}</div>
        ${ro ? '' : html`<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" data-att-input hidden>`}
        <p class="muted small">Files are kept permanently. Detaching only takes a file off this template.</p></div></div>`;
  return { title: (t.name || 'New') + ' template', crumbs: crumbs(t.name || 'New Template'), body, mount(root) {
    const ctl = t.kind === 'html' && !ro ? ed.mount(root) : t.kind === 'builder' ? ed.mount(root) : null;
    if (t.kind === 'html' && ro) $('[data-ro-frame]', root).srcdoc = `<!doctype html><meta charset="utf-8"><body style="margin:0">${templateHtml(t)}</body>`;
    if (t.kind === 'html' && ctl) ctl.el.addEventListener('input', mark);
    const subj = $('[data-tpl-subject]', root); const name = $('[data-tpl-name]', root);
    [subj, name].forEach((i) => i.addEventListener('input', mark));
    if (!ro) { wireInputPicker(subj, getFields); $('[data-subject-field]', root).addEventListener('click', (e) => openPicker(fields, e.target.getBoundingClientRect(), (tk) => { insertIntoInput(subj, tk); mark(); })); }
    const draft = () => ({ module: t.module, kind: t.kind, name: name.value, subject: subj.value, body: t.kind === 'html' ? (ctl ? ctl.getHtml() : t.body) : '', blocks: t.kind === 'builder' ? (ctl ? ctl.getBlocks() : t.blocks) : [], pageBg: ctl ? ctl.getPageBg() : t.pageBg });
    const save = (status) => guard(async () => { const v = draft(); if (!v.name.trim()) throw new Error('Template Name is required.'); if (!v.subject.trim()) throw new Error('Subject is required.');
      const where = await selectFolder(api, { current: t.folderId }); if (!where) return;
      let r; if (t.id) r = await api.updateCrmEmailTemplate(t.id, { ...v, status, folderId: where.folderId, module: undefined });
      else { r = await api.createCrmEmailTemplate({ ...v, status, folderId: where.folderId }); for (const f of pending) await api.addCrmTemplateAttachment(r.id, f); PENDING = null; }
      dirty = false; toast(status === 'draft' ? 'Saved as draft' : 'Template saved'); if (t.id) refresh(); else go('/crm/templates/' + r.id); });
    const sv = $('[data-save]', root); if (sv) sv.addEventListener('click', save('active'));
    const sd = $('[data-save-draft]', root); if (sd) sd.addEventListener('click', save('draft'));
    const sa = $('[data-save-as]', root); if (sa) sa.addEventListener('click', guard(async () => { const where = await selectFolder(api, { title: 'Save As', current: t.personal && !t.canEdit ? '' : t.folderId, name: `Copy of ${t.name}`.slice(0, 120) }); if (!where) return;
      if (!ro && dirty) await api.updateCrmEmailTemplate(t.id, { ...draft(), module: undefined });
      const r = await api.duplicateCrmEmailTemplate(t.id, { name: where.name, folderId: where.folderId }); toast('Saved as a new template'); go('/crm/templates/' + r.id); }));
    $('[data-preview-btn]', root).addEventListener('click', guard(() => previewModal(api, me, t.module, (rid) => (ro || (!dirty && t.id) ? api.previewCrmEmail({ templateId: t.id, recordId: rid }) : api.previewCrmEmail({ draft: draft(), recordId: rid })))));
    const tb = $('[data-test-btn]', root); if (tb) tb.addEventListener('click', () => testEmailDialog(me));
    const cl = $('[data-close-editor]', root); if (cl && cl.tagName === 'BUTTON') cl.addEventListener('click', () => { if (dirty && !confirm('Close without saving? Your changes will be lost.')) return; PENDING = null; go('/crm/templates'); });
    // attachments
    const inp = $('[data-att-input]', root); const ab = $('[data-attach-btn]', root);
    if (ab) ab.addEventListener('click', () => inp.click());
    if (inp) inp.addEventListener('change', guard(async () => { const f = inp.files[0]; inp.value = ''; if (!f) return; const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!ATTACH_EXT.includes(ext)) throw new Error('Template attachments can be PDF, PNG or JPG files.');
      const file = { name: f.name, mimeType: f.type, size: f.size, dataUrl: await readFile(f) };
      if (!t.id) { pending.push(file); $('[data-att-box]', root).innerHTML = String(atts(pending.map((p, i) => ({ id: 'pending-' + i, name: p.name + ' (attached when you save)', size: p.size })))); mark(); return; }
      await api.addCrmTemplateAttachment(t.id, file); toast('File attached'); refresh(); }));
    $$('[data-detach]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!t.id) return; await api.detachCrmTemplateAttachment(t.id, b.dataset.detach, true); toast('File detached (kept)'); refresh(); })));
    $$('[data-reattach]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.detachCrmTemplateAttachment(t.id, b.dataset.reattach, false); toast('File re-attached'); refresh(); })));
    $$('[data-open-file]', root).forEach((a) => a.addEventListener('click', guard(async (e) => { e.preventDefault(); if (!t.id) return; const c = await api.getCrmAttachmentContent(a.dataset.openFile);
      const l = document.createElement('a'); l.href = c.dataUrl; l.download = c.name; document.body.appendChild(l); l.click(); l.remove(); })));
  } };
}

// ---------------- signature ----------------
async function signaturePage({ api, me, refresh }) {
  const s = await api.getCrmSignature(); const ed = richEditor('sig', s.html, { mini: true }); const es = await api.getCrmEmailSettings();
  const body = html`${head('CRM: My Email Signature', { ...me, canEdit: true })}${tabs('templates')}
    <div class="card" data-signature><p class="muted small">Used wherever a template has <code>\${User Signature}</code>. Each person edits their own (the Processor too). ${s.modifiedAt ? `Last saved ${fmtDateTime(s.modifiedAt)}.` : 'Not set yet.'}</p>
      ${ed.body}<p><button class="m-btn" type="button" data-save-signature>Save signature</button> <a class="ghost" href="#/crm/templates">Back to templates</a></p></div>
    <div class="card" data-email-aliases><h3>From addresses (Send Email)</h3><p class="muted small">Your login email (${es.primary || 'none'}) is always offered. Add up to 5 aliases, one per line. A removed alias is retired, not deleted. ${es.sendNote}</p>
      <textarea rows="3" data-aliases style="width:100%">${es.aliases.join('\n')}</textarea><p><button class="ghost" type="button" data-save-aliases>Save aliases</button></p></div>`;
  return { title: 'My signature', crumbs: [['CRM', '#/crm'], ['Templates', '#/crm/templates'], ['My signature']], body, mount(root) {
    const ctl = ed.mount(root); $('[data-save-signature]', root).addEventListener('click', guard(async () => { await api.saveCrmSignature(ctl.getHtml()); toast('Signature saved'); refresh(); }));
    $('[data-save-aliases]', root).addEventListener('click', guard(async () => { await api.saveCrmEmailAliases($('[data-aliases]', root).value.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)); toast('Aliases saved'); refresh(); })); } };
}

// ---------------- compose from a record ----------------
// entity: 'lead' | 'contact' | 'account' | 'opportunity'. A read-only merged email with Copy buttons. Optional: log "Email drafted (not sent)".
export async function composeModal(api, me, entity, recordId, done = () => {}) {
  const list = await api.listCrmTemplatesFor(entity);
  const groups = [...new Set(list.map((t) => t.folderName))];
  const m = modal('Compose email from template', html`<div data-compose>
    ${list.length ? html`<label>Template (${moduleLabel(entity)})<select data-compose-template>${groups.map((g) => html`<optgroup label="${g}">${list.filter((t) => t.folderName === g).map((t) => html`<option value="${t.id}">${t.name}</option>`)}</optgroup>`)}</select></label>
      <div data-compose-out hidden>
        <p><strong>To:</strong> <span data-compose-to></span> <button type="button" class="ghost small" data-copy="to">Copy</button></p>
        <p><strong>Subject:</strong> <span data-compose-subject></span> <button type="button" class="ghost small" data-copy="subject">Copy</button></p>
        <p class="err-text" data-compose-unknown></p>
        <iframe sandbox="" title="Email" class="tpl-frame" style="width: 100%" data-compose-frame></iframe>
        <p><button type="button" class="ghost" data-copy="text">Copy body (text)</button> <button type="button" class="ghost" data-copy="html">Copy body (HTML)</button>
          ${me.canEdit ? html` <button type="button" class="ghost" data-log-draft>Log on the record as "Email drafted (not sent)"</button>` : ''}</p>
        <p class="small" data-compose-atts></p></div>`
      : html`<p class="muted" data-compose-none>No active ${moduleLabel(entity)} templates yet. Templates are tied to their module; make one under CRM &gt; Templates.</p>`}
    <p class="muted small">Nothing is sent from the CRM. Copy the email into your own mail program. ${GMAIL_NOTE}</p></div>`, { wide: true });
  if (!list.length) return m;
  const sel = $('[data-compose-template]', m); let cur = null;
  const draw = guard(async () => { cur = await api.composeCrmEmail(sel.value, entity, recordId); $('[data-compose-out]', m).hidden = false;
    $('[data-compose-to]', m).textContent = cur.to || '(no email on the record)'; $('[data-compose-subject]', m).textContent = cur.subject;
    $('[data-compose-frame]', m).srcdoc = `<!doctype html><meta charset="utf-8"><body style="margin:0">${cur.html}</body>`;
    $('[data-compose-unknown]', m).textContent = cur.unknown.length ? `Left blank (not a ${moduleLabel(entity)} field): ${cur.unknown.join(', ')}` : '';
    const at = $('[data-compose-atts]', m); at.innerHTML = cur.attachments.length ? String(html`Attachments (download and attach them yourself): ${cur.attachments.map((a) => html`<a href="#" data-compose-file="${a.id}">${a.name}</a> `)}`) : '';
    $$('[data-compose-file]', at).forEach((a) => a.addEventListener('click', guard(async (e) => { e.preventDefault(); const c = await api.getCrmAttachmentContent(a.dataset.composeFile);
      const l = document.createElement('a'); l.href = c.dataUrl; l.download = c.name; document.body.appendChild(l); l.click(); l.remove(); }))); });
  sel.addEventListener('change', draw); await draw();
  $$('[data-copy]', m).forEach((b) => b.addEventListener('click', guard(async () => { if (!cur) return; const k = b.dataset.copy; const v = k === 'to' ? cur.to : k === 'subject' ? cur.subject : k === 'text' ? cur.text : cur.html;
    await copyText(v); toast('Copied'); b.dataset.copied = '1'; })));
  const lg = $('[data-log-draft]', m); if (lg) lg.addEventListener('click', guard(async () => { await api.logCrmEmailDraft(sel.value, entity, recordId); toast('Logged: Email drafted (not sent)'); closeModal(); done(); }));
  return m;
}
export const composeBtn = (entity, id) => html`<button type="button" class="ghost" data-compose-btn="${entity}:${id}">Compose email from template</button>`;
export function wireCompose(root, api, me, refresh) {
  $$('[data-compose-btn]', root).forEach((b) => b.addEventListener('click', guard(async () => { const [e, id] = b.dataset.composeBtn.split(':'); await composeModal(api, me, e, id, refresh); })));
}

export async function templatesPage(c) {
  const id = c.params.id;
  if (!id) return listPage(c);
  if (id === 'new') return newPage(c);
  return editorPage(c);
}
export { signaturePage, isPersonalFolder, textToHtml };
