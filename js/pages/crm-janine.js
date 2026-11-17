// crm-janine.js : screens for Janine's Nov 3 CRM feedback (John approved). FAKE DATA ONLY. Nothing is emailed or sent anywhere.
//   "+" Create New menu (every CRM page), #/crm/new/<module>, CSV or Excel import (#/crm/import/<leads|contacts>[/notes], Admin / Super admin),
//   county from the ZIP on the person form, the company duplicate warning, the meeting "Send invite" PREVIEW (.ics), the task Subject type-ahead.
import { html, raw, $, $$, guard, toast, modal, closeModal, fmtDateTime, pill, toText } from '../ui.js?v=202611161500';
import { modOn } from '../data/modules.js?v=202611101015';   // module switches (combined nov3g)
import { createModules, lookupCounty, ZIP_SOURCE, parseCsv, toCsvText, PERSON_IMPORT_FIELDS, NOTE_IMPORT_FIELDS, IMPORT_MAX_ROWS, IMPORT_MAX_BYTES, IMPORT_CHUNK_ROWS, sampleCsv, INVITE_NOTE, IMPORT_DEFAULT_FIELDS, importErrorCsv, saveImportResume, loadImportResume, IMPORT_RESUME_PREFIX } from '../data/crm-janine.js?v=202611101600';
import { importFileHelpText, importFileKind, importFileRejectReason, importParsedFileError, importReadErrorMessage, importColumnGuess } from '../data/crm-import-file.js?v=202611242030';
import { fopts } from './crm-custom.js?v=202611161500';
import { importStatusChoices } from '../data/nov5-rules.js?v=202611131900';
import { crmReadOnly, companyKey } from '../data/crm.js?v=202611130900';
import { US_STATES } from '../data/constants.js?v=202611101015';

// ---------- "+" Create New (Home and every CRM page) ----------
// combined nov3g: skip modules whose Live switch is off for this user (regular users; Admins testing a beta module still get it)
const CREATE_MODULE = { call: 'calls' };
export const createNewMenu = (me) => { const list = createModules(me).filter(([k]) => !CREATE_MODULE[k] || modOn(CREATE_MODULE[k])).map(([k, l, href]) => [k, String(l).replace(' (CSV)', ' (CSV or Excel)'), href]); if (!list.length) return '';
  return html`<details class="crm-create-new" data-create-new><summary class="m-btn" data-create-new-btn title="Create New" aria-label="Create New">+ Create New</summary>
    <div class="crm-create-list" role="menu" data-create-list><div class="muted small">Create New</div>${list.map(([k, l, href]) => html`<a role="menuitem" href="${href}" data-create="${k}">${l}</a>`)}</div></details>`; };
// The shell already knows who is signed in. This does not call crmMe.
export function mountHeaderCreate(user) {
  const slot = document.querySelector('[data-crm-create-slot]'); if (!slot || !user) return;
  const me = { canEdit: !crmReadOnly(user) && !!user, isAdmin: !!user.isAdmin, id: user.id };
  slot.innerHTML = toText(createNewMenu(me));
  wireCreateNew(slot);
}
export function wireCreateNew(root) {
  $$('[data-create-new]', root).forEach((d) => { d.addEventListener('click', (e) => { if (e.target.closest('[data-create]')) d.open = false; }); });
  document.addEventListener('click', (e) => { $$('[data-create-new][open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; }); }, { once: true });
}

// ---------- #/crm/new/<task|meeting|call>: pick the record first ----------
export async function newActivityPage({ api, me, assignees, cfg, params, go }, { tabs, head, taskModal, meetingModal, callModal }) {
  const kind = params.id; const label = { task: 'Task', meeting: 'Meeting', call: 'Call' }[kind];
  const [leads, clients, accounts] = await Promise.all([api.listCrmLeads(), api.listCrmContacts(), api.listCrmAccounts()]);
  const rows = { lead: leads.filter((l) => !l.archived && !l.converted), contact: clients.filter((c) => !c.archived), account: kind === 'call' ? [] : accounts.filter((a) => !a.archived) };
  const mods = [['contact', 'Client'], ['lead', 'Lead'], ...(kind === 'call' ? [] : [['account', 'Company']])];
  const opts = (m) => rows[m].map((r) => html`<option value="${r.id}">${r.name}</option>`);
  const body = html`${head(`Create New: ${label}`, me)}${tabs('home')}
    <div class="card" data-new-activity="${kind}"><h3>New ${label}</h3><p class="muted small">Pick who the ${label.toLowerCase()} is for, then fill in the ${label.toLowerCase()} form.</p>
      <form class="form-grid" id="na-form" novalidate><label>Related module<select name="module" data-na-module>${mods.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
        <label>Record<input type="search" placeholder="Search by name" data-na-q><select name="id" size="6" data-na-id>${opts(mods[0][0])}</select></label>
        <p class="err-text span2" data-form-err></p><div class="span2"><a class="ghost" href="#/crm">Cancel</a> <button class="m-btn" type="submit" data-na-go>Continue</button></div></form></div>`;
  return { title: 'Create ' + label, crumbs: [['CRM', '#/crm'], ['Create New: ' + label]], body, mount(root) {
    const f = $('#na-form', root); const sm = $('[data-na-module]', f); const si = $('[data-na-id]', f); const q = $('[data-na-q]', f);
    const fill = () => { si.innerHTML = toText(opts(sm.value)); q.value = ''; }; sm.addEventListener('change', fill);
    q.addEventListener('input', () => { const t = q.value.toLowerCase(); [...si.options].forEach((o) => { o.hidden = !!t && !o.textContent.toLowerCase().includes(t); }); });
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const id = si.value; if (!id) { $('[data-form-err]', f).textContent = 'Pick a record first.'; return; }
      const rec = rows[sm.value].find((r) => r.id === id); const ctx = { entity: sm.value, entityId: id, parentName: rec.name, me, assignees, cfg, rec };
      const back = () => go(`/crm/${sm.value === 'lead' ? 'leads' : sm.value === 'contact' ? 'contacts' : 'accounts'}/${id}`);
      if (kind === 'task') taskModal(api, ctx, null, back); else if (kind === 'meeting') await meetingModal(api, ctx, null, back); else await callModal(api, ctx, 'scheduled', back); })); } };
}

// ---------- county from the ZIP (person forms). Editable afterwards; a ZIP that spans counties offers a pick list (main county first). ----------
export function wireZipCounty(form) {
  const zip = $('input[name="zip"]', form); const county = $('input[name="county"]', form); if (!zip || !county) return;
  const state = $('select[name="state"]', form); let auto = ''; let pick = null;
  const note = document.createElement('span'); note.className = 'muted small zip-note'; note.dataset.zipNote = ''; county.closest('label').appendChild(note);
  const run = async () => { const z = zip.value.trim(); if (pick) { pick.remove(); pick = null; } if (!/^\d{5}(-\d{4})?$/.test(z)) { note.textContent = ''; return; }
    const list = await lookupCounty(z).catch(() => []);
    if (!list.length) { note.textContent = 'ZIP not in the county table: type the county.'; return; }
    if (!county.value.trim() || county.value === auto) { county.value = list[0].county; auto = list[0].county; county.dataset.autoFilled = '1'; }
    if (state && !state.value && [...state.options].some((o) => o.value === list[0].state)) state.value = list[0].state;
    note.textContent = list.length > 1 ? `ZIP ${z.slice(0, 5)} spans ${list.length} counties: pick one.` : `From ZIP ${z.slice(0, 5)} (you can change it).`;
    if (list.length > 1) { pick = document.createElement('select'); pick.dataset.countyPick = ''; pick.setAttribute('aria-label', 'Counties for this ZIP');
      pick.innerHTML = toText(list.map((c) => html`<option value="${c.county}" ${c.county === county.value ? raw('selected') : ''}>${c.county}, ${c.state}${c.primary ? ' (main)' : ''}</option>`));
      pick.addEventListener('change', () => { county.value = pick.value; auto = pick.value; }); note.after(pick); } };
  zip.addEventListener('input', run);
  county.addEventListener('input', () => { delete county.dataset.autoFilled; });
  county.setAttribute('title', ZIP_SOURCE);
}

// ---------- company duplicate warning (Company form). company_lookup is the shared list. The save still refuses a duplicate. ----------
// Exact normalized key only. Prefix hits that are a different company are not a duplicate. Archived rows are not in company_lookup.
export function companyDuplicateFromLookup(rows, name, exceptId = null) {
  const key = companyKey(name);
  if (!key) return null;
  const hit = (rows || []).find((r) => r && r.id !== exceptId && companyKey(r.name) === key);
  if (!hit) return null;
  return { id: hit.id, name: hit.name, state: hit.state || '', archived: false, canOpen: true, link: `#/crm/accounts/${hit.id}` };
}
export function wireCompanyDup(form, api, exceptId = null) {
  const name = $('input[name="name"]', form); const box = $('[data-dup-warn]', form); if (!name || !box) return; let t = null;
  const check = async () => {
    const rows = await api.lookupCompanies(name.value, 25).catch(() => []);
    const d = companyDuplicateFromLookup(rows, name.value, exceptId);
    box.innerHTML = d ? toText(dupHtml(d)) : '';
  };
  name.addEventListener('input', () => { clearTimeout(t); t = setTimeout(check, 200); });
}
export const dupHtml = (d) => html`<span class="dup-warn" data-dup="${d.id}">Already in the CRM: ${d.canOpen ? html`<a href="${d.link}" data-dup-link target="_self">${d.name}</a>` : html`<strong>${d.name}</strong>`}${d.state ? ` (${d.state})` : ''}${d.archived ? ' (archived: restore it instead)' : ''}. Duplicates are not allowed.</span>`;

// ---------- Task Subject: a plain single-line text field with a type-ahead of the configured suggestions ----------
export function wireSubjectTypeahead(form, choices) {
  const inp = $('input[name="subject"]', form); if (!inp) return; const box = document.createElement('ul'); box.className = 'typeahead'; box.dataset.subjectSuggest = ''; box.hidden = true; inp.after(box);
  let idx = -1; const show = () => { const q = inp.value.trim().toLowerCase(); const list = choices.filter((c) => !q || (c.toLowerCase().includes(q) && c.toLowerCase() !== q)).slice(0, 8);
    box.innerHTML = toText(list.map((c, i) => html`<li role="option" data-suggest="${c}" class="${i === idx ? 'on' : ''}">${c}</li>`)); box.hidden = !list.length || document.activeElement !== inp; };
  inp.addEventListener('input', () => { idx = -1; show(); }); inp.addEventListener('focus', show); inp.addEventListener('click', show); inp.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
  inp.addEventListener('keydown', (e) => { const items = $$('[data-suggest]', box); if (box.hidden || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; show(); }
    else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); inp.value = items[idx].dataset.suggest; box.hidden = true; } else if (e.key === 'Escape') box.hidden = true; });
  box.addEventListener('mousedown', (e) => { const li = e.target.closest('[data-suggest]'); if (li) { e.preventDefault(); inp.value = li.dataset.suggest; box.hidden = true; } });
}

// ---------- MEETING "Send invite": a PREVIEW + .ics download. NOTHING IS SENT. ----------
export const inviteBtn = (me) => (me.canEdit ? html`<button class="m-btn" type="button" data-send-invite>Send invite</button>` : '');
const downloadFile = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
export async function invitePreview(api, meetingId, done) {
  const p = await api.previewCrmMeetingInvite(meetingId);
  const m = modal('Send invite (preview)', html`<div data-invite-preview="${p.id}">
    <p class="notice" data-invite-note><strong>${p.note}</strong></p>
    <dl class="kv"><dt>From</dt><dd data-inv-from>${p.organizer.name}${p.organizer.email ? ` <${p.organizer.email}>` : ''}</dd>
      <dt>To</dt><dd data-inv-to>${p.to.length ? p.to.map((t, i) => html`${i ? ', ' : ''}${t.name} &lt;${t.email}&gt; <span class="muted small">(${t.type})</span>`) : html`<span class="muted">No participant with an email yet.</span>`}</dd>
      ${p.noEmail.length ? html`<dt>No email</dt><dd data-inv-noemail>${p.noEmail.map((t) => t.name).join(', ')} <span class="muted small">(would not get the invite)</span></dd>` : ''}
      <dt>Subject</dt><dd data-inv-subject>${p.subject}</dd></dl>
    <pre class="invite-body" data-inv-body>${p.body}</pre>
    <p><button class="m-btn" type="button" data-ics-download>Download .ics</button> <button class="ghost" type="button" disabled data-inv-send title="${INVITE_NOTE}">Send (turns on once Gmail is connected)</button> <button class="ghost" type="button" data-close>Close</button></p>
    <p class="muted small">Previews made for this meeting: ${p.previews}. Each one is recorded; none was sent.</p></div>`, { wide: true });
  $('[data-ics-download]', m).addEventListener('click', () => { downloadFile(p.icsName, p.ics, 'text/calendar;charset=utf-8'); toast('.ics downloaded (nothing was sent)'); });
  if (done) done(p); return p;
}

// A preview row has no saved record, so it must not link to #/crm/.../<uuid>.
export function importRowHref(row, committed) {
  if (!committed || !row || row.status !== 'ok' || !row.link) return '';
  return String(row.link);
}

// ---------- IMPORT (Admin / Super admin): upload -> map columns -> preview (errors, duplicates) -> import -> summary ----------
// Janine, Nov 4: default values for fields the file does not have (or leaves blank). A value in the file always wins.
function defaultsCard(module, owners, cfg) {
  const opts = (src) => (src === 'user' ? owners.map((o) => [o.id, o.name]) : src === 'state' ? US_STATES.map((s) => [s, s]) : src === 'status' ? importStatusChoices(cfg, module) : fopts(cfg, src));
  const leadNote = module === 'leads' ? ' Role in Company, Relationship Status, and State are required on every lead. Set a default here to fill every blank row, or put the value in the file.' : '';
  return html`<fieldset data-import-defaults><legend>Default values <span class="muted small">(a value in the file wins.${leadNote})</span></legend>
    <div class="filter-bar">${IMPORT_DEFAULT_FIELDS.map(([k, l, src]) => html`<label>${l}<select data-import-default="${k}" aria-label="Default ${l}"><option value="">(no default)</option>${opts(src).map(([v, t]) => html`<option value="${v}">${t}</option>`)}</select></label>`)}</div></fieldset>`;
}
export async function importPage({ api, me, params, owners = [], cfg = {} }, { tabs, head }) {
  const module = params.id === 'contacts' ? 'contacts' : 'leads'; const kind = params.sub === 'notes' ? 'notes' : 'records';
  const M = module === 'leads' ? 'Leads' : 'Clients'; const what = kind === 'notes' ? `Notes (on ${M})` : M;
  if (!me.isAdmin) return { title: 'Import', crumbs: [['CRM', '#/crm'], ['Import']], body: html`${head('Import ' + what, me)}${tabs(module)}<p class="err-text" data-import-denied>Only an Admin or Super admin can import.</p>` };
  const testBanner = api.mode === 'supabase' && me.isAdmin
    ? html`<p class="notice" data-import-test-banner>TEST portal: fake data only, do not import real client contacts</p>`
    : '';
  const fields = kind === 'notes' ? NOTE_IMPORT_FIELDS : PERSON_IMPORT_FIELDS; const hist = await api.listCrmImports();
  const tmplName = kind === 'notes' ? `sample-${module}-notes.csv` : `sample-${module}.csv`;
  const body = html`${head('Import ' + what, me)}${tabs(module)}
    ${testBanner}
    <div class="card" data-import="${module}:${kind}"><h3>1. Upload a CSV or Excel file</h3>
      <p class="muted small">Upload a CSV or Excel file. ${kind === 'notes' ? `Each note is linked to an existing ${M === 'Leads' ? 'lead' : 'client'} by email, else by first + last name (one match only).` : `Each row becomes a ${M === 'Leads' ? 'lead' : 'client'}, checked like the Create form: Last Name, Role in Company, Relationship Status and State are required; one email / phone across Leads and Clients. A blank County is filled from the ZIP.`}
        Up to ${IMPORT_MAX_ROWS} rows, ${IMPORT_CHUNK_ROWS} at a time (${IMPORT_MAX_BYTES / 1e6} MB). Nothing is emailed.
        <span data-import-retired-note>Retired relationship statuses are not in the default list. A row that names a retired status is marked invalid in the preview and is not imported. Records that already have one are left as they are.</span></p>
      <p><button class="ghost" type="button" data-sample-csv="${tmplName}">Download sample template (fake data)</button>
        <a class="ghost" href="#/crm/import/${module}${kind === 'notes' ? '' : '/notes'}" data-import-other>${kind === 'notes' ? `Import ${M} instead` : 'Import Notes instead'}</a> <a class="ghost" href="#/crm/${module}">Back to ${M}</a></p>
      <p class="muted small" id="import-file-help" data-import-file-help>${importFileHelpText()}</p>
      <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-import-file aria-describedby="import-file-help import-file-err"> <span class="muted small" data-import-fname></span>
      <p class="err-text" id="import-file-err" data-import-file-err role="alert" hidden></p>
      <p class="notice" data-import-sheet hidden></p></div>
    <div class="card" data-import-map hidden><h3>2. Map the columns</h3><table class="tbl"><thead><tr><th>Column in the file</th><th>First value</th><th>Field in the CRM</th></tr></thead><tbody data-map-rows></tbody></table>
      ${kind === 'records' ? defaultsCard(module, owners, cfg) : ''}
      <p><button class="m-btn" type="button" data-import-preview>Preview</button> <button class="m-btn" type="button" data-import-resume hidden>Resume import</button></p>
      <div data-import-progress hidden>
        <p class="notice" data-import-stay>Don't close this tab. This import is still running.</p>
        <progress data-import-bar value="0" max="1"></progress>
        <p class="muted small" data-import-progress-text></p>
      </div>
      <p class="err-text" data-import-err></p></div>
    <div class="card" data-import-prev hidden><h3>3. Preview <span class="muted small">(nothing saved yet)</span></h3><p data-prev-counts></p><div class="table-wrap"><table class="tbl" data-prev-table></table></div>
      <p><button class="m-btn" type="button" data-import-run>Import the valid rows</button> <button class="ghost" type="button" data-import-errors="preview" hidden>Download error CSV</button> <span class="muted small">Rows with an error or a duplicate are skipped.</span></p></div>
    <div class="card" data-import-summary hidden><h3>4. Summary</h3><div data-summary-body></div></div>
    <div class="card"><h3>Earlier imports</h3>${hist.length ? html`<table class="tbl" data-import-history><thead><tr><th>When</th><th>By</th><th>Into</th><th>File</th><th>Created</th><th>Duplicates</th><th>Errors</th><th>Default values</th><th>Rows</th></tr></thead><tbody>
      ${hist.map((h) => html`<tr data-import-hist="${h.id}"><td>${fmtDateTime(h.at)}</td><td>${h.byName}</td><td>${h.kind === 'notes' ? 'Notes on ' : ''}${h.module === 'leads' ? 'Leads' : 'Clients'}</td><td>${h.fileName || '—'}</td><td>${h.created}</td><td>${h.duplicates}</td><td>${h.errors}</td>
        <td data-hist-defaults>${(h.defaults || []).length ? h.defaults.map((z) => `${(IMPORT_DEFAULT_FIELDS.find(([k]) => k === z.field) || [, z.field])[1]}: ${z.text || z.value}`).join('; ') : html`<span class="muted">—</span>`}</td>
        <td>${h.rowCount ? html`<button type="button" class="linkish" data-hist-rows="${h.id}">View ${h.rowCount} row(s)</button>` : html`<span class="muted">—</span>`}</td></tr>`)}</tbody></table>` : html`<p class="muted">No imports yet.</p>`}
      <p class="muted small">Import logs are kept permanently.</p></div>`;
  return { title: 'Import ' + what, crumbs: [['CRM', '#/crm'], [M, '#/crm/' + module], ['Import']], body, mount(root) {
    let text = ''; let fileName = ''; let header = [];
    $('[data-sample-csv]', root).addEventListener('click', () => { downloadFile(tmplName, sampleCsv(kind === 'notes' ? 'notes' : module), 'text/csv;charset=utf-8'); toast('Sample template downloaded'); });
    const mapping = () => $$('[data-map]', root).map((s) => s.value);
    const defaults = () => Object.fromEntries($$('[data-import-default]', root).map((s) => [s.dataset.importDefault, s.value]).filter(([, v]) => v));
    $$('[data-hist-rows]', root).forEach((b) => b.addEventListener('click', guard(async () => { const rows = await api.listCrmImportRows(b.dataset.histRows);
      modal('Import rows', html`<table class="tbl" data-import-rows><thead><tr><th>Line</th><th>Result</th><th>Record</th><th>Message</th></tr></thead><tbody>${rows.map((z) => html`<tr data-import-row-status="${z.status}"><td>${z.line}</td><td>${pill(z.status === 'ok' ? 'Created' : z.status === 'duplicate' ? 'Duplicate' : 'Error', z.status === 'ok' ? 'ok' : z.status === 'duplicate' ? 'warn' : 'bad')}</td>
        <td>${z.recordId ? html`<a href="#/crm/${module}/${z.recordId}">${z.recordName || z.recordId}</a>` : ''}</td><td class="small">${z.message}</td></tr>`)}</tbody></table>`, { wide: true }); })));
    const sheetNote = (msg) => { const el = $('[data-import-sheet]', root); if (!el) return; el.hidden = !msg; el.textContent = msg || ''; };
    const showFileErr = (msg) => {
      const el = $('[data-import-file-err]', root);
      const input = $('[data-import-file]', root);
      if (el) { el.textContent = msg || ''; el.hidden = !msg; }
      if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    };
    const resetPicker = (input) => { try { input.value = ''; } catch (err) { /* the same file can be chosen again after a reset */ } };
    // A bad file is explained on this card and left here until another file is chosen. It is not a toast, and it does not replace a file already accepted.
    $('[data-import-file]', root).addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      showFileErr('');
      const early = importFileRejectReason(f);
      if (early) { showFileErr(early); resetPicker(e.target); return; }
      try {
        let rows; let nextText; let notice = '';
        if (importFileKind(f) === 'excel') { const { rowsFromExcel } = await import('../data/crm-excel.js?v=202611221700'); const parsed = await rowsFromExcel(await f.arrayBuffer()); rows = parsed.rows; nextText = toCsvText(rows); notice = parsed.notice || ''; }
        else { nextText = await f.text(); rows = parseCsv(nextText); }
        const problem = importParsedFileError(rows, kind, module, f);
        if (problem) { showFileErr(problem); resetPicker(e.target); return; }
        showFileErr('');
        text = nextText; fileName = f.name; $('[data-import-fname]', root).textContent = f.name; sheetNote(notice);
        header = rows[0]; const guess = importColumnGuess(header, fields, kind);
        $('[data-map-rows]', root).innerHTML = toText(header.map((h, i) => html`<tr><td>${h}</td><td class="muted small">${(rows[1] || [])[i] || ''}</td><td><select data-map="${i}" aria-label="Field for ${h}"><option value="">(skip this column)</option>${fields.map(([k, l]) => html`<option value="${k}" ${guess[i] === k ? raw('selected') : ''}>${l}</option>`)}</select></td></tr>`));
        $('[data-import-map]', root).hidden = false; $('[data-import-prev]', root).hidden = true; $('[data-import-summary]', root).hidden = true;
      } catch (err) { showFileErr(importReadErrorMessage(err)); resetPicker(e.target); }
    });
    const table = (r) => { const cols = fields.filter(([k]) => r.mapping.includes(k));
      return html`<thead><tr><th>Line</th><th>Result</th>${cols.map(([, l]) => html`<th>${l}</th>`)}</tr></thead><tbody>${r.rows.map((x) => html`<tr data-prev-row="${x.line}" data-status="${x.status}" class="${x.status === 'ok' ? '' : 'bad-row'}"><td>${x.line}</td>
        <td>${x.status === 'ok' ? html`${pill(r.committed ? 'Created' : 'OK', 'ok')}${importRowHref(x, r.committed) ? html` <a href="${importRowHref(x, r.committed)}">${x.name}</a>` : ''}${(x.notes || []).length ? html`<br><span class="muted small">${x.notes.join('; ')}</span>` : ''}` : html`${pill(x.status === 'duplicate' ? 'Duplicate' : 'Error', x.status === 'duplicate' ? 'warn' : 'bad')} <span class="small">${x.message}</span>`}</td>
        ${cols.map(([k]) => html`<td>${(x.values || {})[k] || ''}</td>`)}</tr>`)}</tbody>`; };
    const counts = (c, done) => `${c.total} row(s): ${c.ok} ${done ? 'created' : 'ready'}, ${c.duplicates} duplicate(s), ${c.errors} error(s).`;
    let importing = false;
    let resumeState = null;
    let lastResult = null;
    const showProgress = (p) => {
      const el = $('[data-import-progress]', root); if (!el) return; el.hidden = false;
      const bar = $('[data-import-bar]', root); const total = p.total || 1; const done = p.done || 0;
      if (bar) { bar.max = total; bar.value = done; }
      const textEl = $('[data-import-progress-text]', root);
      if (textEl) textEl.textContent = `${done} / ${total} rows. Chunk ${p.chunk} of ${p.chunks}.`;
    };
    window.addEventListener('beforeunload', (e) => { if (!importing) return; e.preventDefault(); e.returnValue = ''; });
    const showErrors = (which, r) => { const btn = $(`[data-import-errors="${which}"]`, root); if (!btn) return; btn.hidden = !(r && r.counts && r.counts.errors); };
    const paintSummary = (r) => {
      lastResult = r;
      $('[data-summary-body]', root).innerHTML = toText(html`<p data-summary-counts><strong>${counts(r.counts, true)}</strong></p><table class="tbl" data-summary-table>${table(r)}</table>
        <p><button class="ghost" type="button" data-import-errors="summary" ${r.counts.errors ? '' : 'hidden'}>Download error CSV</button> <a class="m-btn" href="#/crm/${module}">Open ${M}</a></p>`);
      const btn = $('[data-import-errors="summary"]', root);
      if (btn) btn.addEventListener('click', () => { downloadFile(`import-errors-${fileName || 'rows'}.csv`, r.errorCsv || importErrorCsv(r.rows, r.fields), 'text/csv;charset=utf-8'); });
    };
    const rememberStop = (e) => {
      if (!e.partial || !e.partial.importId) return;
      resumeState = {
        importId: e.partial.importId, module, kind, fileName, csv: text, mapping: mapping(), defaults: defaults(),
        startChunk: e.partial.startChunk, message: e.message, rowsSaved: e.partial.rowsSaved,
      };
      try { saveImportResume(sessionStorage, resumeState); } catch (err) { /* the in-memory resume still works */ }
      const btn = $('[data-import-resume]', root); if (btn) btn.hidden = false;
      $('[data-summary-body]', root).innerHTML = toText(html`<p class="err-text" data-import-partial>${e.message}</p><p><button class="m-btn" type="button" data-import-resume-again>Resume import</button></p>`);
      $('[data-import-summary]', root).hidden = false;
      const again = $('[data-import-resume-again]', root); if (again) again.addEventListener('click', () => { const b = $('[data-import-resume]', root); if (b) b.click(); });
    };
    try {
      const active = sessionStorage.getItem(IMPORT_RESUME_PREFIX + 'active');
      const stored = active && loadImportResume(sessionStorage, active);
      if (stored && stored.module === module && stored.kind === kind && stored.importId) {
        resumeState = stored; text = stored.csv || text; fileName = stored.fileName || fileName;
        const btn = $('[data-import-resume]', root); if (btn) btn.hidden = false;
        if (stored.message) $('[data-import-err]', root).textContent = stored.message;
      }
    } catch (e) { /* private mode has no resume */ }
    $('[data-import-errors="preview"]', root).addEventListener('click', () => { if (!lastResult) return; downloadFile(`import-errors-${fileName || 'preview'}.csv`, lastResult.errorCsv || importErrorCsv(lastResult.rows, lastResult.fields), 'text/csv;charset=utf-8'); });
    $('[data-import-preview]', root).addEventListener('click', guard(async () => { const er = $('[data-import-err]', root); er.textContent = '';
      importing = true;
      try { const r = await api.previewCrmImport({ module, kind, csv: text, mapping: mapping(), fileName, defaults: defaults(), onProgress: showProgress });
        lastResult = r;
        $('[data-prev-counts]', root).textContent = counts(r.counts, false); $('[data-prev-table]', root).innerHTML = toText(table(r)); $('[data-import-prev]', root).hidden = false; $('[data-import-run]', root).disabled = !r.counts.ok;
        showErrors('preview', r);
      } catch (e) { er.textContent = e.message; throw e; } finally { importing = false; } }));
    const runSaved = async (state) => {
      importing = true;
      try {
        const r = await api.runCrmImport({
          module: state.module || module, kind: state.kind || kind, csv: state.csv || text, mapping: state.mapping || mapping(),
          fileName: state.fileName || fileName, defaults: state.defaults || defaults(), importId: state.importId || null,
          startChunk: state.startChunk || 1, onProgress: showProgress,
        });
        paintSummary(r);
        $('[data-import-summary]', root).hidden = false; $('[data-import-prev]', root).hidden = true;
        const btn = $('[data-import-resume]', root); if (btn) btn.hidden = true; resumeState = null;
        toast(`Imported ${r.counts.ok} row(s)`);
      } catch (e) {
        rememberStop(e);
        throw e;
      } finally { importing = false; }
    };
    $('[data-import-run]', root).addEventListener('click', guard(async () => { await runSaved({ module, kind, csv: text, mapping: mapping(), fileName, defaults: defaults() }); }));
    $('[data-import-resume]', root).addEventListener('click', guard(async () => { if (!resumeState) return; await runSaved(resumeState); }));
  } };
}
export { closeModal };
