// crm-janine.js : screens for Janine's Nov 3 CRM feedback (John approved). FAKE DATA ONLY. Nothing is emailed or sent anywhere.
//   "+" Create New menu (every CRM page), #/crm/new/<module>, CSV import (#/crm/import/<leads|contacts>[/notes], Admin / Super admin),
//   county from the ZIP on the person form, the company duplicate warning, the meeting "Send invite" PREVIEW (.ics), the task Subject type-ahead.
import { html, raw, $, $$, guard, toast, modal, closeModal, fmtDateTime, pill, toText } from '../ui.js?v=202611041802';
import { modOn } from '../data/modules.js?v=202611041802';   // module switches (combined nov3g)
import { createModules, lookupCounty, ZIP_SOURCE, parseCsv, guessMapping, PERSON_IMPORT_FIELDS, NOTE_IMPORT_FIELDS, IMPORT_MAX_ROWS, IMPORT_MAX_BYTES, sampleCsv, INVITE_NOTE } from '../data/crm-janine.js?v=202611041802';

// ---------- "+" Create New (Home and every CRM page) ----------
// combined nov3g: skip modules whose Live switch is off for this user (regular users; Admins testing a beta module still get it)
const CREATE_MODULE = { call: 'calls' };
export const createNewMenu = (me) => { const list = createModules(me).filter(([k]) => !CREATE_MODULE[k] || modOn(CREATE_MODULE[k])); if (!list.length) return '';
  return html`<details class="crm-create-new" data-create-new><summary class="m-btn" data-create-new-btn title="Create New" aria-label="Create New">+</summary>
    <div class="crm-create-list" role="menu" data-create-list><div class="muted small">Create New</div>${list.map(([k, l, href]) => html`<a role="menuitem" href="${href}" data-create="${k}">${l}</a>`)}</div></details>`; };
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

// ---------- company duplicate warning (Company form). The adapter refuses the save anyway; this shows the existing record early. ----------
export function wireCompanyDup(form, api, exceptId = null) {
  const name = $('input[name="name"]', form); const box = $('[data-dup-warn]', form); if (!name || !box) return; let t = null;
  const check = async () => { const d = await api.findCrmCompanyDuplicate({ name: name.value, exceptId }).catch(() => null);
    box.innerHTML = d ? toText(dupHtml(d)) : ''; };
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

// ---------- IMPORT (Admin / Super admin): upload -> map columns -> preview (errors, duplicates) -> import -> summary ----------
export async function importPage({ api, me, params }, { tabs, head }) {
  const module = params.id === 'contacts' ? 'contacts' : 'leads'; const kind = params.sub === 'notes' ? 'notes' : 'records';
  const M = module === 'leads' ? 'Leads' : 'Clients'; const what = kind === 'notes' ? `Notes (on ${M})` : M;
  if (!me.isAdmin) return { title: 'Import', crumbs: [['CRM', '#/crm'], ['Import']], body: html`${head('Import ' + what, me)}${tabs(module)}<p class="err-text" data-import-denied>Only an Admin or Super admin can import.</p>` };
  const fields = kind === 'notes' ? NOTE_IMPORT_FIELDS : PERSON_IMPORT_FIELDS; const hist = await api.listCrmImports();
  const tmplName = kind === 'notes' ? `sample-${module}-notes.csv` : `sample-${module}.csv`;
  const body = html`${head('Import ' + what, me)}${tabs(module)}
    <div class="card" data-import="${module}:${kind}"><h3>1. Upload a CSV</h3>
      <p class="muted small">${kind === 'notes' ? `Each note is linked to an existing ${M === 'Leads' ? 'lead' : 'client'} by email, else by first + last name (one match only).` : `Each row becomes a ${M === 'Leads' ? 'lead' : 'client'}, checked like the Create form: Last Name, Role in Company, Relationship Status and State are required; one email / phone across Leads and Clients. A blank County is filled from the ZIP.`}
        Up to ${IMPORT_MAX_ROWS} rows (${IMPORT_MAX_BYTES / 1e6} MB). Nothing is emailed.</p>
      <p><button class="ghost" type="button" data-sample-csv="${tmplName}">Download sample template (fake data)</button>
        <a class="ghost" href="#/crm/import/${module}${kind === 'notes' ? '' : '/notes'}" data-import-other>${kind === 'notes' ? `Import ${M} instead` : 'Import Notes instead'}</a> <a class="ghost" href="#/crm/${module}">Back to ${M}</a></p>
      <input type="file" accept=".csv,text/csv" data-import-file> <span class="muted small" data-import-fname></span></div>
    <div class="card" data-import-map hidden><h3>2. Map the columns</h3><table class="tbl"><thead><tr><th>Column in the file</th><th>First value</th><th>Field in the CRM</th></tr></thead><tbody data-map-rows></tbody></table>
      <p><button class="m-btn" type="button" data-import-preview>Preview</button></p><p class="err-text" data-import-err></p></div>
    <div class="card" data-import-prev hidden><h3>3. Preview <span class="muted small">(nothing saved yet)</span></h3><p data-prev-counts></p><div class="table-wrap"><table class="tbl" data-prev-table></table></div>
      <p><button class="m-btn" type="button" data-import-run>Import the valid rows</button> <span class="muted small">Rows with an error or a duplicate are skipped.</span></p></div>
    <div class="card" data-import-summary hidden><h3>4. Summary</h3><div data-summary-body></div></div>
    <div class="card"><h3>Earlier imports</h3>${hist.length ? html`<table class="tbl" data-import-history><thead><tr><th>When</th><th>By</th><th>Into</th><th>File</th><th>Created</th><th>Duplicates</th><th>Errors</th></tr></thead><tbody>
      ${hist.map((h) => html`<tr><td>${fmtDateTime(h.at)}</td><td>${h.byName}</td><td>${h.kind === 'notes' ? 'Notes on ' : ''}${h.module === 'leads' ? 'Leads' : 'Clients'}</td><td>${h.fileName || '—'}</td><td>${h.created}</td><td>${h.duplicates}</td><td>${h.errors}</td></tr>`)}</tbody></table>` : html`<p class="muted">No imports yet.</p>`}
      <p class="muted small">Import logs are kept permanently.</p></div>`;
  return { title: 'Import ' + what, crumbs: [['CRM', '#/crm'], [M, '#/crm/' + module], ['Import']], body, mount(root) {
    let text = ''; let fileName = ''; let header = [];
    $('[data-sample-csv]', root).addEventListener('click', () => { downloadFile(tmplName, sampleCsv(kind === 'notes' ? 'notes' : module), 'text/csv;charset=utf-8'); toast('Sample template downloaded'); });
    const mapping = () => $$('[data-map]', root).map((s) => s.value);
    $('[data-import-file]', root).addEventListener('change', guard(async (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > IMPORT_MAX_BYTES) throw new Error('The file is too large.');
      text = await f.text(); fileName = f.name; $('[data-import-fname]', root).textContent = f.name; const rows = parseCsv(text); if (rows.length < 2) throw new Error('The file needs a header row and at least one row of data.');
      header = rows[0]; const guess = guessMapping(header, fields);
      $('[data-map-rows]', root).innerHTML = toText(header.map((h, i) => html`<tr><td>${h}</td><td class="muted small">${(rows[1] || [])[i] || ''}</td><td><select data-map="${i}" aria-label="Field for ${h}"><option value="">(skip this column)</option>${fields.map(([k, l]) => html`<option value="${k}" ${guess[i] === k ? raw('selected') : ''}>${l}</option>`)}</select></td></tr>`));
      $('[data-import-map]', root).hidden = false; $('[data-import-prev]', root).hidden = true; $('[data-import-summary]', root).hidden = true; }));
    const table = (r) => { const cols = fields.filter(([k]) => r.mapping.includes(k));
      return html`<thead><tr><th>Line</th><th>Result</th>${cols.map(([, l]) => html`<th>${l}</th>`)}</tr></thead><tbody>${r.rows.map((x) => html`<tr data-prev-row="${x.line}" data-status="${x.status}" class="${x.status === 'ok' ? '' : 'bad-row'}"><td>${x.line}</td>
        <td>${x.status === 'ok' ? html`${pill(r.committed ? 'Created' : 'OK', 'ok')}${x.link && r.committed ? html` <a href="${x.link}">${x.name}</a>` : ''}${(x.notes || []).length ? html`<br><span class="muted small">${x.notes.join('; ')}</span>` : ''}` : html`${pill(x.status === 'duplicate' ? 'Duplicate' : 'Error', x.status === 'duplicate' ? 'warn' : 'bad')} <span class="small">${x.message}</span>`}</td>
        ${cols.map(([k]) => html`<td>${(x.values || {})[k] || ''}</td>`)}</tr>`)}</tbody>`; };
    const counts = (c, done) => `${c.total} row(s): ${c.ok} ${done ? 'created' : 'ready'}, ${c.duplicates} duplicate(s), ${c.errors} error(s).`;
    $('[data-import-preview]', root).addEventListener('click', guard(async () => { const er = $('[data-import-err]', root); er.textContent = '';
      try { const r = await api.previewCrmImport({ module, kind, csv: text, mapping: mapping(), fileName });
        $('[data-prev-counts]', root).textContent = counts(r.counts, false); $('[data-prev-table]', root).innerHTML = toText(table(r)); $('[data-import-prev]', root).hidden = false; $('[data-import-run]', root).disabled = !r.counts.ok;
      } catch (e) { er.textContent = e.message; throw e; } }));
    $('[data-import-run]', root).addEventListener('click', guard(async () => {
      const r = await api.runCrmImport({ module, kind, csv: text, mapping: mapping(), fileName });
      $('[data-summary-body]', root).innerHTML = toText(html`<p data-summary-counts><strong>${counts(r.counts, true)}</strong></p><table class="tbl" data-summary-table>${table(r)}</table>
        <p><a class="m-btn" href="#/crm/${module}">Open ${M}</a></p>`);
      $('[data-import-summary]', root).hidden = false; $('[data-import-prev]', root).hidden = true; toast(`Imported ${r.counts.ok} row(s)`); }));
  } };
}
export { closeModal };
