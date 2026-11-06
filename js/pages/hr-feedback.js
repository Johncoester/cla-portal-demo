// HR FEEDBACK (John's Nov 4 HR review). FAKE DATA ONLY; nothing is sent. The adapter enforces every rule; this file only draws.
//   #/hr/documents        HR Documents: HR managers / Super admins upload company HR documents and share them with all / departments / employees
//   profile cards         Portal time log (under Portal login), Documents (offer letter, manual, signed policy; signature status recorded by hand),
//                         "Shared with you" (company documents HR shared with this employee, on My profile)
import { html, raw, $, $$, guard, toast, fmtDate, fmtDateTime, fmtSize } from '../ui.js?v=202611060249';
import { HR_COMPANY_DOC_CATEGORIES, HR_SHARE_SCOPES, HR_EMP_DOC_TYPES, HR_SIGN_STATUSES, HR_SIGN_PROVIDERS, HR_ESIGN_NOTE, fmtDuration, fullNameOf } from '../data/hr.js?v=202611060249';
import { ALLOWED_UPLOAD_EXT } from '../data/constants.js?v=202611060249';
const opt = (list, sel) => list.map(([v, l]) => html`<option value="${v}"${String(v) === String(sel == null ? '' : sel) ? raw(' selected') : ''}>${l}</option>`);
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });
const fileOf = async (input) => { const f = input && input.files && input.files[0]; if (!f) throw new Error('Pick a file to upload.'); return { name: f.name, mimeType: f.type, size: f.size, dataUrl: await readFile(f) }; };
const accept = ALLOWED_UPLOAD_EXT.map((x) => '.' + x).join(',');
function open(file) { const a = document.createElement('a'); a.href = file.dataUrl; a.download = file.name; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 300); }
const SIGN_PILL = { draft: '', not_sent: 'warn', sent: 'warn', signed: 'ok', declined: 'bad' };

// ---------------- (1) HR Documents page ----------------
export async function companyDocsPage({ api, user, refresh }, head, wireQuick) {
  const [docs, lk, emps] = await Promise.all([api.listHrCompanyDocs({ includeArchived: true }), api.listHrLookups(), api.listHrEmployees()]);
  const deps = lk.departments.filter((d) => !d.archivedAt);
  const row = (d) => html`<tr data-hr-cdoc="${d.id}" data-hr-cdoc-state="${d.archivedAt ? 'archived' : 'active'}"><td><strong>${d.title}</strong>${d.description ? html`<br><span class="muted small">${d.description}</span>` : ''}</td>
    <td>${d.categoryLabel}</td><td data-hr-cdoc-share><span class="pill hr-chip">${d.shareScope === 'all' ? 'All employees' : d.shareScope === 'departments' ? 'Department' : 'Employees'}</span> <span class="small">${d.shareScope === 'all' ? '' : d.shareLabel}</span></td>
    <td class="small">${d.fileName}<br><span class="muted">${fmtSize(d.size)}</span></td><td class="small nowrap">${fmtDate(d.createdAt)}<br><span class="muted">${d.createdByName}</span></td>
    <td class="nowrap"><button class="ghost small" data-hr-cdoc-open="${d.id}">Open</button> <button class="ghost small" data-hr-cdoc-archive="${d.id}" data-on="${d.archivedAt ? '0' : '1'}">${d.archivedAt ? 'Restore' : 'Archive'}</button></td></tr>`;
  const body = html`<section class="hr-page" data-hr-docs-page>${head(user, 'HR Documents', 'Upload company HR documents (handbook, policies) and share them with everyone, a department or specific employees. Employees see what is shared with them on their My profile. Nothing is emailed.')}
    <form class="card hr-form" data-hr-cdoc-form><h3>Upload a document</h3><div class="form-grid">
      <label>Title <span class="req">*</span><input name="title" maxlength="160" required data-hr-cdoc-title placeholder="Employee Handbook 2026"></label>
      <label>Category<select name="category" data-hr-cdoc-category>${opt(HR_COMPANY_DOC_CATEGORIES, 'policy')}</select></label>
      <label class="span2">Description<input name="description" maxlength="1000" placeholder="Optional"></label>
      <label>Share with<select name="shareScope" data-hr-cdoc-scope>${opt(HR_SHARE_SCOPES, 'all')}</select></label>
      <label>File <span class="req">*</span><input type="file" name="file" accept="${accept}" required data-hr-cdoc-file></label>
      <label class="span2" data-hr-cdoc-deps hidden>Departments<select name="departmentIds" multiple size="5" data-hr-cdoc-dep-select>${opt(deps.map((d) => [d.id, d.name]))}</select></label>
      <label class="span2" data-hr-cdoc-emps hidden>Employees<select name="employeeIds" multiple size="6" data-hr-cdoc-emp-select>${opt(emps.map((e) => [e.id, `${fullNameOf(e)} (${e.employeeCode})`]))}</select></label></div>
      <p class="muted small">Hold Ctrl / Cmd to pick more than one. Up to 25 MB. Nothing is deleted: archive a document to stop sharing it.</p>
      <p><button class="m-btn" type="submit" data-hr-cdoc-upload>Upload and share</button></p></form>
    <div class="card"><h3>Company documents</h3><table class="tbl striped" data-hr-cdoc-table><thead><tr><th>Document</th><th>Category</th><th>Shared with</th><th>File</th><th>Added</th><th></th></tr></thead>
      <tbody>${docs.length ? docs.map(row) : html`<tr><td colspan="6" class="muted">No HR documents yet.</td></tr>`}</tbody></table></div></section>`;
  return { title: 'HR Documents', crumbs: [['HR', '#/hr'], ['HR Documents']], body, mount(root) {
    wireQuick(root); const f = $('[data-hr-cdoc-form]', root); const sc = $('[data-hr-cdoc-scope]', root);
    const sync = () => { $('[data-hr-cdoc-deps]', root).hidden = sc.value !== 'departments'; $('[data-hr-cdoc-emps]', root).hidden = sc.value !== 'employees'; }; sc.addEventListener('change', sync); sync();
    const picked = (sel) => [...$(sel, root).selectedOptions].map((o) => o.value);
    f.addEventListener('submit', guard(async (ev) => { ev.preventDefault();
      await api.uploadHrCompanyDoc({ title: f.title.value, category: f.category.value, description: f.description.value, shareScope: sc.value, departmentIds: picked('[data-hr-cdoc-dep-select]'), employeeIds: picked('[data-hr-cdoc-emp-select]'), file: await fileOf($('[data-hr-cdoc-file]', root)) });
      toast('Document uploaded and shared (nothing emailed)'); refresh(); }));
    $$('[data-hr-cdoc-open]', root).forEach((b) => b.addEventListener('click', guard(async () => open(await api.getHrCompanyDocFile(b.dataset.hrCdocOpen)))));
    $$('[data-hr-cdoc-archive]', root).forEach((b) => b.addEventListener('click', guard(async () => { const on = b.dataset.on === '1'; await api.archiveHrCompanyDoc(b.dataset.hrCdocArchive, on); toast(on ? 'Document archived (kept, not deleted)' : 'Document restored'); refresh(); })));
  } };
}

// ---------------- (3) portal time log (inside the Portal login card) ----------------
export function portalTimeCard(t) {
  const reason = (s) => (s.active ? html`<span class="pill ok" data-hr-session-active>Active now</span>` : s.endReason === 'idle' ? 'Idle 15 min' : s.endReason === 'logout' ? 'Logged out' : s.endReason === 'closed' ? 'Tab closed' : '');
  return html`<div class="hr-timelog" data-hr-timelog><h4>Portal time log</h4>
    <div class="hr-time-totals"><span class="hr-time-tot" data-hr-time-total="today"><strong>${fmtDuration(t.totals.today)}</strong><span class="muted small">Today</span></span>
      <span class="hr-time-tot" data-hr-time-total="week"><strong>${fmtDuration(t.totals.week)}</strong><span class="muted small">This week</span></span>
      <span class="hr-time-tot" data-hr-time-total="days30"><strong>${fmtDuration(t.totals.days30)}</strong><span class="muted small">Last 30 days (${t.totals.sessions30} sessions)</span></span></div>
    ${t.sessions.length ? html`<table class="tbl hr-time-tbl" data-hr-time-table><thead><tr><th>Login</th><th>Last activity</th><th>Logout / ended</th><th>Duration</th></tr></thead><tbody>
      ${t.sessions.slice(0, 15).map((s) => html`<tr data-hr-session="${s.id}"><td class="small nowrap">${fmtDateTime(s.startedAt)}</td><td class="small nowrap">${fmtDateTime(s.lastActivityAt)}</td>
        <td class="small nowrap">${s.active ? '' : fmtDateTime(s.endedAt)} ${reason(s)}</td><td class="nowrap">${fmtDuration(s.durationSeconds)}</td></tr>`)}</tbody></table>`
      : html`<p class="muted small" data-hr-time-empty>No portal sessions recorded yet.</p>`}
    <p class="muted small">Recorded while the portal tab is open and visible (a heartbeat every minute); 15 minutes with no activity ends the session.</p></div>`;
}

// ---------------- (1) documents HR shared with this employee (My profile) ----------------
export function sharedDocsCard(docs, mine) {
  return html`<div class="card hr-sec" data-hr-section="shared-docs"><h3>${mine ? 'HR documents shared with you' : 'HR documents shared with this employee'}</h3>
    <ul class="hr-doc-list">${docs.map((d) => html`<li data-hr-shared-doc="${d.id}"><strong>${d.title}</strong> <span class="pill">${d.categoryLabel}</span> <span class="muted small">${fmtDate(d.createdAt)}</span> <button class="ghost small" data-hr-shared-open="${d.id}">Open</button></li>`)}</ul></div>`;
}
export function wireSharedDocs(root, api) { $$('[data-hr-shared-open]', root).forEach((b) => b.addEventListener('click', guard(async () => open(await api.getHrCompanyDocFile(b.dataset.hrSharedOpen))))); }

// ---------------- (4) employee Documents card ----------------
export function employeeDocsCard(e, docs, hr) {
  const sig = (d) => { if (!d.signatureRequired || !d.signature) return html`<span class="muted small">No signature needed</span>`; const g = d.signature;
    return html`<span class="pill ${SIGN_PILL[g.status] || ''}" data-hr-sign-status="${g.status}">${g.statusLabel}</span> <span class="muted small">${g.providerLabel}${g.sentAt ? html` &middot; sent ${fmtDate(g.sentAt)}` : ''}${g.signedAt ? html` &middot; signed ${fmtDate(g.signedAt)}` : ''}</span>
      ${hr && !d.archivedAt ? html`<span class="hr-sign-edit" data-hr-sign-edit="${g.id}"><select data-hr-sign-select aria-label="Signature status">${opt(HR_SIGN_STATUSES, g.status)}</select><select data-hr-sign-provider aria-label="Provider">${opt(HR_SIGN_PROVIDERS, g.provider)}</select><button class="ghost small" type="button" data-hr-sign-save="${g.id}">Record status</button></span>` : ''}`; };
  const row = (d) => html`<tr data-hr-edoc="${d.id}" data-hr-edoc-state="${d.archivedAt ? 'archived' : 'active'}"><td><strong>${d.title}</strong><br><span class="muted small">${d.fileName} &middot; ${fmtSize(d.size)}</span></td><td>${d.docTypeLabel}</td>
    <td class="small">${fmtDate(d.createdAt)}<br><span class="muted">${d.createdByName} (${d.uploadedByRole === 'hr' ? 'HR' : 'employee'})</span></td>
    <td>${hr && !d.archivedAt ? html`<label class="check small"><input type="checkbox" data-hr-sign-req="${d.id}"${d.signatureRequired ? raw(' checked') : ''}> Signature required</label><br>` : d.signatureRequired ? html`<span class="small">Signature required</span><br>` : ''}${sig(d)}</td>
    <td class="nowrap"><button class="ghost small" type="button" data-hr-edoc-open="${d.id}">Open</button>${d.archivedAt ? (hr ? html` <span class="pill">Archived</span> <button class="ghost small" type="button" data-hr-edoc-archive="${d.id}" data-on="0">Restore</button>` : '') : html` <button class="ghost small" type="button" data-hr-edoc-archive="${d.id}" data-on="1">Archive</button>`}</td></tr>`;
  return html`<div class="card hr-sec" data-hr-section="documents"><div class="hr-sec-head"><h3>Documents</h3></div>
    <p class="notice small" data-hr-esign-note>${HR_ESIGN_NOTE}</p>
    <table class="tbl hr-edoc-tbl" data-hr-edoc-table><thead><tr><th>Document</th><th>Type</th><th>Added</th><th>Signature</th><th></th></tr></thead>
      <tbody>${docs.length ? docs.map(row) : html`<tr><td colspan="5" class="muted">No documents yet.</td></tr>`}</tbody></table>
    ${e.archivedAt ? '' : html`<form class="hr-edoc-form" data-hr-edoc-form><div class="form-grid">
      <label>Document type<select name="docType" data-hr-edoc-type>${opt(HR_EMP_DOC_TYPES, 'other')}</select></label>
      <label>Title<input name="title" maxlength="160" placeholder="e.g. Signed handbook acknowledgement" data-hr-edoc-title></label>
      <label>File <span class="req">*</span><input type="file" name="file" accept="${accept}" required data-hr-edoc-file></label>
      ${hr ? html`<label class="check"><input type="checkbox" name="signatureRequired" data-hr-edoc-sign> Signature required</label>` : ''}</div>
      <p><button class="m-btn" type="submit" data-hr-edoc-upload>Upload document</button></p></form>`}</div>`;
}
export function wireEmployeeDocs(root, { api, refresh, employee, hr }) {
  const f = $('[data-hr-edoc-form]', root);
  if (f) f.addEventListener('submit', guard(async (ev) => { ev.preventDefault(); ev.stopPropagation();
    await api.uploadHrEmployeeDoc(employee.id, { docType: $('[data-hr-edoc-type]', f).value, title: $('[data-hr-edoc-title]', f).value, signatureRequired: hr ? $('[data-hr-edoc-sign]', f).checked : false, file: await fileOf($('[data-hr-edoc-file]', f)) });
    toast('Document uploaded'); refresh(); }));
  $$('[data-hr-edoc-open]', root).forEach((b) => b.addEventListener('click', guard(async () => open(await api.getHrEmployeeDocFile(b.dataset.hrEdocOpen)))));
  $$('[data-hr-edoc-archive]', root).forEach((b) => b.addEventListener('click', guard(async () => { const on = b.dataset.on === '1'; if (on && !confirm('Archive this document? It is kept, not deleted.')) return;
    await api.archiveHrEmployeeDoc(b.dataset.hrEdocArchive, on); toast(on ? 'Document archived (kept, not deleted)' : 'Document restored'); refresh(); })));
  $$('[data-hr-sign-req]', root).forEach((c) => c.addEventListener('change', guard(async () => { await api.setHrDocSignatureRequired(c.dataset.hrSignReq, c.checked); toast(c.checked ? 'Marked Signature required (nothing sent)' : 'Signature no longer required'); refresh(); })));
  $$('[data-hr-sign-save]', root).forEach((b) => b.addEventListener('click', guard(async () => { const w = b.closest('[data-hr-sign-edit]');
    await api.recordHrSignatureStatus(b.dataset.hrSignSave, { status: $('[data-hr-sign-select]', w).value, provider: $('[data-hr-sign-provider]', w).value }); toast('Signature status recorded (nothing sent)'); refresh(); })));
}
