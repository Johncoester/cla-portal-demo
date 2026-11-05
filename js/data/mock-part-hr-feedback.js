/* mock adapter: HR FEEDBACK (John's Nov 4 HR review). FAKE DATA ONLY; nothing is sent. Mirrored by migration 59 (SQL + RLS). Storage stays v29:
 * ensureHrFeedback adds the new collections / fields to any stored copy (idempotent, nothing existing removed).
 *   d.hrEmployees[*].commissioned (boolean) / commissionNotes (text)         (HR only, like pay)
 *   d.hrCompanyDocs        [{id, title, category, description, shareScope: all|departments|employees, fileName, mimeType, size, hasFile, createdAt, createdBy, updatedAt, updatedBy, archivedAt, archivedBy}]
 *   d.hrCompanyDocShares   [{id, documentId, departmentId|null, employeeId|null, createdAt, createdBy, removedAt, removedBy}]
 *   d.hrEmployeeDocs       [{id, employeeId, docType, title, signatureRequired, fileName, mimeType, size, hasFile, uploadedByRole: hr|employee, createdAt, createdBy, updatedAt, updatedBy, archivedAt, archivedBy}]
 *   d.hrSignatureRequests  [{id, documentId, employeeId, provider: zoho_sign|other, status: draft|not_sent|sent|signed|declined, sentAt, signedAt, declinedAt, statusNote, createdAt, createdBy, updatedAt, updatedBy, archivedAt, archivedBy}]
 *   d.hrPortalSessions     [{id, employeeId, profileId, startedAt, lastActivityAt, endedAt, endReason: logout|idle|closed|null, heartbeatCount}]
 * No e-sign provider is connected: signature status is recorded by hand. Nothing is ever deleted (archive instead). */
import { MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT } from './constants.js?v=202611052321';
import { HR_COMPANY_DOC_CATEGORIES, HR_SHARE_SCOPES, HR_EMP_DOC_TYPES, HR_SIGN_STATUSES, HR_SIGN_PROVIDERS, HR_IDLE_MS, sessionSeconds, sessionTotals, fullNameOf, labelOf } from './hr.js?v=202611052321';
const SEED_AT = '2026-11-04T14:00:00Z';
const ago = (iso, min) => new Date(Date.parse(iso) - min * 60000).toISOString();

export function ensureHrFeedback(d) {
  if (!Array.isArray(d.hrEmployees)) return d;
  for (const e of d.hrEmployees) { if (typeof e.commissioned !== 'boolean') e.commissioned = false; if (typeof e.commissionNotes !== 'string') e.commissionNotes = ''; }
  // (6) seed consistency: a seeded employee with a blank job title gets the designation name (Paula Processor = Processing Manager)
  if (!d.hrFeedbackRepaired) { d.hrFeedbackRepaired = true;
  for (const e of d.hrEmployees) if (/^hre-\d\d$/.test(e.id) && !String(e.jobTitle || '').trim()) { const g = (d.hrDesignations || []).find((z) => z.id === e.designationId); if (g) e.jobTitle = g.name; } }
  if (!Array.isArray(d.hrCompanyDocs)) {
    const sam = d.hrEmployees.find((e) => e.id === 'hre-03'); if (sam && !sam.commissioned && !sam.commissionNotes) { sam.commissioned = true; sam.commissionNotes = 'FAKE: 10% of title premium on files he brings in, paid monthly.'; }
    const by = { createdAt: SEED_AT, createdBy: 'u-hr1', updatedAt: null, updatedBy: null, archivedAt: null, archivedBy: null };
    d.hrCompanyDocs = [
      { id: 'hcd-1', title: 'Employee Handbook 2026 (FAKE)', category: 'handbook', description: 'Demo handbook for every employee.', shareScope: 'all', fileName: 'employee-handbook-2026.txt', mimeType: 'text/plain', size: 64, hasFile: false, dataUrl: 'data:text/plain;base64,' + b64('FAKE Employee Handbook 2026. Demo text only.'), ...by },
      { id: 'hcd-2', title: 'Processing desk procedures (FAKE)', category: 'policy', description: 'Processing department only.', shareScope: 'departments', fileName: 'processing-procedures.txt', mimeType: 'text/plain', size: 48, hasFile: false, dataUrl: 'data:text/plain;base64,' + b64('FAKE processing procedures. Demo text only.'), ...by }];
    d.hrCompanyDocShares = [{ id: 'hcs-1', documentId: 'hcd-2', departmentId: 'hrd-proc', employeeId: null, createdAt: SEED_AT, createdBy: 'u-hr1', removedAt: null, removedBy: null }];
  }
  if (!Array.isArray(d.hrCompanyDocShares)) d.hrCompanyDocShares = [];
  if (!Array.isArray(d.hrEmployeeDocs)) {
    d.hrEmployeeDocs = [{ id: 'hed-1', employeeId: 'hre-02', docType: 'offer_letter', title: 'Offer letter (FAKE)', signatureRequired: true, fileName: 'paula-offer-letter.txt', mimeType: 'text/plain', size: 40, hasFile: false,
      dataUrl: 'data:text/plain;base64,' + b64('FAKE offer letter. Demo text only.'), uploadedByRole: 'hr', createdAt: SEED_AT, createdBy: 'u-hr1', updatedAt: null, updatedBy: null, archivedAt: null, archivedBy: null }];
    d.hrSignatureRequests = [{ id: 'hsr-1', documentId: 'hed-1', employeeId: 'hre-02', provider: 'zoho_sign', status: 'not_sent', sentAt: null, signedAt: null, declinedAt: null, statusNote: '', createdAt: SEED_AT, createdBy: 'u-hr1', updatedAt: null, updatedBy: null, archivedAt: null, archivedBy: null }];
  }
  if (!Array.isArray(d.hrSignatureRequests)) d.hrSignatureRequests = [];
  if (!Array.isArray(d.hrPortalSessions)) {
    // fake history for Paula so the time log is not empty on a fresh demo
    const S = (id, start, minutes, reason) => ({ id, employeeId: 'hre-02', profileId: 'u-proc', startedAt: start, lastActivityAt: new Date(Date.parse(start) + minutes * 60000).toISOString(), endedAt: new Date(Date.parse(start) + minutes * 60000).toISOString(), endReason: reason, heartbeatCount: minutes });
    d.hrPortalSessions = [S('hps-1', '2026-11-03T13:02:00Z', 248, 'logout'), S('hps-2', '2026-11-03T18:30:00Z', 95, 'idle'), S('hps-3', '2026-11-02T13:10:00Z', 312, 'logout'), S('hps-4', '2026-10-28T14:00:00Z', 180, 'logout')];
  }
  return d;
}
function b64(t) { return typeof btoa === 'function' ? btoa(t) : Buffer.from(t).toString('base64'); }

export function hrFeedbackPart(x, h) {
  const { save, fail, now, clone, nameOf } = x; const { db, gate, needHr, empById, empOfProfile, hist } = h;
  const nextId = (p) => { const d = db(); d.seq += 1; return `${p}-${d.seq}`; };
  const isAdmin = (role) => role === 'super' || role === 'hr_manager';
  const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const pick = (list, v, label, dflt) => { const c = s(v, 30) || dflt; if (!list.some(([k]) => k === c)) fail(`${label} is not one of the choices.`); return c; };
  function cleanFile(f) {
    if (!f || !f.name || !f.dataUrl) fail('Pick a file to upload.');
    const ext = String(f.name).split('.').pop().toLowerCase(); if (!ALLOWED_UPLOAD_EXT.includes(ext)) fail(`That file type is not allowed. Allowed: ${ALLOWED_UPLOAD_EXT.join(', ')}.`);
    if (!(Number(f.size) >= 0) || Number(f.size) > MAX_UPLOAD_BYTES) fail('Files can be up to 25 MB.');
    if (!/^data:/.test(String(f.dataUrl))) fail('That file could not be read.');
    return { fileName: s(f.name, 200), mimeType: s(f.mimeType || f.type, 120), size: Number(f.size) || 0, dataUrl: String(f.dataUrl), hasFile: false };
  }
  const docHist = (u, table, rowId, empId, field, oldV, newV, action) => hist(u, table, rowId, empId, field, oldV, newV, action);

  // ---------------- (1) HR Documents (company-wide) ----------------
  const sharesOf = (docId) => db().hrCompanyDocShares.filter((z) => z.documentId === docId && !z.removedAt);
  function companyView(doc) { const d = db(); const sh = sharesOf(doc.id); const { dataUrl, ...rest } = doc;
    return { ...clone(rest), categoryLabel: labelOf(HR_COMPANY_DOC_CATEGORIES, doc.category), shareLabel: doc.shareScope === 'all' ? 'All employees'
      : doc.shareScope === 'departments' ? sh.map((z) => (d.hrDepartments.find((q) => q.id === z.departmentId) || {}).name).filter(Boolean).join(', ')
      : sh.map((z) => fullNameOf(empById(z.employeeId))).filter(Boolean).join(', '),
      departmentIds: sh.filter((z) => z.departmentId).map((z) => z.departmentId), employeeIds: sh.filter((z) => z.employeeId).map((z) => z.employeeId), createdByName: nameOf(doc.createdBy) }; }
  const sharedWith = (doc, e) => !doc.archivedAt && !!e && (doc.shareScope === 'all' || sharesOf(doc.id).some((z) => (z.departmentId && z.departmentId === e.departmentId) || (z.employeeId && z.employeeId === e.id)));
  function setShares(u, doc, scope, departmentIds, employeeIds) { const d = db();
    const want = scope === 'departments' ? [...new Set(departmentIds || [])].map((id) => ['departmentId', id]) : scope === 'employees' ? [...new Set(employeeIds || [])].map((id) => ['employeeId', id]) : [];
    if (scope === 'departments') { if (!want.length) fail('Pick at least one department.'); want.forEach(([, id]) => { if (!d.hrDepartments.some((z) => z.id === id && !z.archivedAt)) fail('Pick active departments.'); }); }
    if (scope === 'employees') { if (!want.length) fail('Pick at least one employee.'); want.forEach(([, id]) => { const e = empById(id); if (!e || e.archivedAt) fail('Pick active employees.'); }); }
    for (const z of sharesOf(doc.id)) if (!want.some(([k, id]) => z[k] === id)) { z.removedAt = now(); z.removedBy = u.id; }
    for (const [k, id] of want) if (!sharesOf(doc.id).some((z) => z[k] === id)) d.hrCompanyDocShares.push({ id: nextId('hcs'), documentId: doc.id, departmentId: k === 'departmentId' ? id : null, employeeId: k === 'employeeId' ? id : null, createdAt: now(), createdBy: u.id, removedAt: null, removedBy: null });
    doc.shareScope = scope;
  }
  async function content(rec) { const c = await x.fileContent(rec); if (!c) fail('The file content is not in this browser (demo storage).'); return { name: rec.fileName, mimeType: rec.mimeType, dataUrl: c }; }

  // ---------------- (4) employee documents + signature requests ----------------
  const sigOf = (docId) => db().hrSignatureRequests.find((z) => z.documentId === docId && !z.archivedAt) || null;
  const empDocView = (doc, admin) => { const { dataUrl, ...rest } = doc; const sg = sigOf(doc.id);
    return { ...clone(rest), docTypeLabel: labelOf(HR_EMP_DOC_TYPES, doc.docType), createdByName: nameOf(doc.createdBy),
      signature: sg ? { ...clone(sg), statusLabel: labelOf(HR_SIGN_STATUSES, sg.status), providerLabel: labelOf(HR_SIGN_PROVIDERS, sg.provider) } : null, canManage: admin }; };
  function empDocAccess(employeeId) { const { u, role } = gate(); const e = empById(employeeId) || fail('Employee not found.'); const admin = isAdmin(role); const mine = e.profileId === u.id && !e.archivedAt;
    if (!admin && !mine) fail('You can only see documents on your own profile.'); return { u, role, e, admin, mine }; }

  // ---------------- (3) portal time log ----------------
  const openSession = (pid) => db().hrPortalSessions.find((z) => z.profileId === pid && !z.endedAt);
  function canSeeTime(u, role, e) { if (isAdmin(role)) return true; const me = empOfProfile(u.id); return !!me && !e.archivedAt && (e.id === me.id || e.reportingToId === me.id); }   // John, Nov 4: the employee sees their own (read only)

  return {
    // ---- HR Documents page ----
    async listHrCompanyDocs({ includeArchived = false } = {}) { const { u, role } = gate(); const d = db();
      if (isAdmin(role)) return d.hrCompanyDocs.filter((z) => includeArchived || !z.archivedAt).map(companyView).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const e = empOfProfile(u.id); return d.hrCompanyDocs.filter((z) => sharedWith(z, e)).map(companyView).map(({ departmentIds, employeeIds, ...r }) => r); },
    // employees: the documents shared with them (My profile). HR can pass an employee id to preview what that person sees.
    async listHrDocsSharedWith(employeeId = null) { const { u, role } = gate(); const e = employeeId ? empById(employeeId) : empOfProfile(u.id);
      if (!e) return []; if (!isAdmin(role) && e.profileId !== u.id) fail('You can only see documents shared with you.');
      return db().hrCompanyDocs.filter((z) => sharedWith(z, e)).map(companyView).map(({ departmentIds, employeeIds, ...r }) => r); },
    async uploadHrCompanyDoc(f = {}) { const { u } = needHr(); const d = db();
      const title = s(f.title, 160) || fail('Title is required.'); const category = pick(HR_COMPANY_DOC_CATEGORIES, f.category, 'Category', 'policy'); const scope = pick(HR_SHARE_SCOPES, f.shareScope, 'Share with', 'all');
      const file = cleanFile(f.file);
      const doc = { id: nextId('hcd'), title, category, description: s(f.description, 1000), shareScope: 'all', ...file, createdAt: now(), createdBy: u.id, updatedAt: null, updatedBy: null, archivedAt: null, archivedBy: null };
      setShares(u, doc, scope, f.departmentIds, f.employeeIds); await x.keepFile(doc); d.hrCompanyDocs.push(doc);
      docHist(u, 'hr_company_documents', doc.id, null, 'document', null, `${title} (shared with ${companyView(doc).shareLabel})`, 'upload'); save(); return companyView(doc); },
    async updateHrCompanyDocSharing(id, f = {}) { const { u } = needHr(); const doc = db().hrCompanyDocs.find((z) => z.id === id) || fail('Document not found.'); if (doc.archivedAt) fail('Restore the document first.');
      const before = companyView(doc).shareLabel; setShares(u, doc, pick(HR_SHARE_SCOPES, f.shareScope, 'Share with', 'all'), f.departmentIds, f.employeeIds); doc.updatedAt = now(); doc.updatedBy = u.id;
      docHist(u, 'hr_company_documents', doc.id, null, 'sharing', before, companyView(doc).shareLabel, 'share'); save(); return companyView(doc); },
    async archiveHrCompanyDoc(id, archived = true) { const { u } = needHr(); const doc = db().hrCompanyDocs.find((z) => z.id === id) || fail('Document not found.');
      if (!!doc.archivedAt === !!archived) return companyView(doc); const old = doc.archivedAt; doc.archivedAt = archived ? now() : null; doc.archivedBy = archived ? u.id : null; doc.updatedAt = now(); doc.updatedBy = u.id;
      docHist(u, 'hr_company_documents', doc.id, null, 'archivedAt', old, doc.archivedAt, archived ? 'archive' : 'restore'); save(); return companyView(doc); },
    async getHrCompanyDocFile(id) { const { u, role } = gate(); const doc = db().hrCompanyDocs.find((z) => z.id === id) || fail('Document not found.');
      if (!isAdmin(role) && !sharedWith(doc, empOfProfile(u.id))) fail('This document is not shared with you.'); return content(doc); },

    // ---- employee profile: Documents card ----
    async listHrEmployeeDocs(employeeId, { includeArchived = false } = {}) { const { admin } = empDocAccess(employeeId);
      return db().hrEmployeeDocs.filter((z) => z.employeeId === employeeId && ((admin && includeArchived) || !z.archivedAt)).map((z) => empDocView(z, admin)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); },
    async uploadHrEmployeeDoc(employeeId, f = {}) { const { u, e, admin } = empDocAccess(employeeId); if (e.archivedAt) fail('Restore the employee first.');
      const sig = f.signatureRequired === true || f.signatureRequired === 'true' || f.signatureRequired === 'on';
      if (sig && !admin) fail('Only HR can mark a document Signature required.');
      const docType = pick(HR_EMP_DOC_TYPES, f.docType, 'Document type', 'other'); const file = cleanFile(f.file); const title = s(f.title, 160) || file.fileName;
      const doc = { id: nextId('hed'), employeeId, docType, title, signatureRequired: sig, ...file, uploadedByRole: admin ? 'hr' : 'employee', createdAt: now(), createdBy: u.id, updatedAt: null, updatedBy: null, archivedAt: null, archivedBy: null };
      await x.keepFile(doc); db().hrEmployeeDocs.push(doc);
      if (sig) db().hrSignatureRequests.push({ id: nextId('hsr'), documentId: doc.id, employeeId, provider: 'zoho_sign', status: 'not_sent', sentAt: null, signedAt: null, declinedAt: null, statusNote: '', createdAt: now(), createdBy: u.id, updatedAt: null, updatedBy: null, archivedAt: null, archivedBy: null });
      docHist(u, 'hr_employee_documents', doc.id, employeeId, 'document', null, `${title} (${labelOf(HR_EMP_DOC_TYPES, docType)})`, 'upload'); save(); return empDocView(doc, admin); },
    async setHrDocSignatureRequired(docId, required) { const { u } = needHr(); const doc = db().hrEmployeeDocs.find((z) => z.id === docId) || fail('Document not found.'); if (doc.archivedAt) fail('Document not found.');
      required = !!required; if (doc.signatureRequired === required) return empDocView(doc, true);
      doc.signatureRequired = required; doc.updatedAt = now(); doc.updatedBy = u.id;
      if (required) db().hrSignatureRequests.push({ id: nextId('hsr'), documentId: doc.id, employeeId: doc.employeeId, provider: 'zoho_sign', status: 'not_sent', sentAt: null, signedAt: null, declinedAt: null, statusNote: '', createdAt: now(), createdBy: u.id, updatedAt: null, updatedBy: null, archivedAt: null, archivedBy: null });
      else { const sg = sigOf(doc.id); if (sg) { sg.archivedAt = now(); sg.archivedBy = u.id; sg.updatedAt = now(); sg.updatedBy = u.id; } }
      docHist(u, 'hr_employee_documents', doc.id, doc.employeeId, 'signatureRequired', required ? 'No' : 'Yes', required ? 'Yes' : 'No', 'signature'); save(); return empDocView(doc, true); },
    // record the signature status by hand (no provider is connected; NOTHING is sent)
    async recordHrSignatureStatus(requestId, { status, provider, note } = {}) { const { u } = needHr(); const sg = db().hrSignatureRequests.find((z) => z.id === requestId && !z.archivedAt) || fail('Signature request not found.');
      const st = pick(HR_SIGN_STATUSES, status, 'Status', sg.status); const pv = provider ? pick(HR_SIGN_PROVIDERS, provider, 'Provider', sg.provider) : sg.provider; const old = sg.status;
      sg.status = st; sg.provider = pv; sg.statusNote = s(note, 500);
      sg.sentAt = ['sent', 'signed', 'declined'].includes(st) ? (sg.sentAt || now()) : null; sg.signedAt = st === 'signed' ? (sg.signedAt || now()) : null; sg.declinedAt = st === 'declined' ? (sg.declinedAt || now()) : null;
      sg.updatedAt = now(); sg.updatedBy = u.id; if (old !== st) docHist(u, 'hr_signature_requests', sg.id, sg.employeeId, 'signatureStatus', labelOf(HR_SIGN_STATUSES, old), labelOf(HR_SIGN_STATUSES, st), 'signature');
      save(); return { ...clone(sg), statusLabel: labelOf(HR_SIGN_STATUSES, st), sent: false }; },
    async archiveHrEmployeeDoc(docId, archived = true) { const { u, role } = gate(); const doc = db().hrEmployeeDocs.find((z) => z.id === docId) || fail('Document not found.');
      const e = empById(doc.employeeId); const admin = isAdmin(role); const ownUpload = e && e.profileId === u.id && doc.createdBy === u.id && archived;
      if (!admin && !ownUpload) fail('Only HR (or you, for your own uploads) can archive a document.');
      if (!!doc.archivedAt === !!archived) return empDocView(doc, admin); const old = doc.archivedAt; doc.archivedAt = archived ? now() : null; doc.archivedBy = archived ? u.id : null; doc.updatedAt = now(); doc.updatedBy = u.id;
      docHist(u, 'hr_employee_documents', doc.id, doc.employeeId, 'archivedAt', old, doc.archivedAt, archived ? 'archive' : 'restore'); save(); return empDocView(doc, admin); },
    async getHrEmployeeDocFile(docId) { const doc = db().hrEmployeeDocs.find((z) => z.id === docId) || fail('Document not found.'); const { admin } = empDocAccess(doc.employeeId);
      if (doc.archivedAt && !admin) fail('Document not found.'); return content(doc); },

    // ---- (3) portal time log: heartbeat from the app every 60 s while the tab is visible; 15 min idle ends the session ----
    // Records only for a signed-in person linked to an active HR employee record (works whether or not the HR module is Live; reads are gated).
    async hrSessionHeartbeat() { const u = x.me(); if (!u) return null; const e = empOfProfile(u.id); if (!e) return null; const d = db(); const t = now();
      let cur = openSession(u.id);
      if (cur && Date.parse(t) - Date.parse(cur.lastActivityAt) > HR_IDLE_MS) { cur.endedAt = cur.lastActivityAt; cur.endReason = 'idle'; cur = null; }
      if (cur) { cur.lastActivityAt = t; cur.heartbeatCount = (cur.heartbeatCount || 0) + 1; }
      else { cur = { id: nextId('hps'), employeeId: e.id, profileId: u.id, startedAt: t, lastActivityAt: t, endedAt: null, endReason: null, heartbeatCount: 1 }; d.hrPortalSessions.push(cur); }
      save(); return { sessionId: cur.id, startedAt: cur.startedAt }; },
    async hrSessionEnd(reason = 'logout') { const u = x.me(); if (!u) return null; const cur = openSession(u.id); if (!cur) return null; const t = now();
      if (Date.parse(t) - Date.parse(cur.lastActivityAt) > HR_IDLE_MS) { cur.endedAt = cur.lastActivityAt; cur.endReason = 'idle'; }
      else { cur.lastActivityAt = t; cur.endedAt = t; cur.endReason = ['logout', 'idle', 'closed'].includes(reason) ? reason : 'logout'; }
      save(); return cur.id; },
    async listHrPortalTime(employeeId, { limit = 50 } = {}) { const { u, role } = gate(); const e = empById(employeeId) || fail('Employee not found.');
      if (!canSeeTime(u, role, e)) fail('Only HR managers, Super admins, the reporting manager and the employee can see this portal time log.');
      const t = now(); const rows = db().hrPortalSessions.filter((z) => z.employeeId === employeeId).map((z) => {
        const stale = !z.endedAt && Date.parse(t) - Date.parse(z.lastActivityAt) > HR_IDLE_MS;   // shown as ended by idle (stored the next heartbeat)
        const r = { ...clone(z), endedAt: stale ? z.lastActivityAt : z.endedAt, endReason: stale ? 'idle' : z.endReason, active: !z.endedAt && !stale }; return { ...r, durationSeconds: sessionSeconds(r) }; })
        .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
      return { sessions: rows.slice(0, limit), totals: sessionTotals(rows, t), count: rows.length }; },
  };
}
