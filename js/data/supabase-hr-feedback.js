/* [SUPABASE] HR FEEDBACK (John's Nov 4 HR review; migration 59). Same names / shapes as mock-part-hr-feedback.js. NOT run against a hosted project
 * (best effort; the mock adapter is the tested one, migration 59 has its own DB test 128). Files go to the private 'hr-documents' bucket.
 * Nothing is ever sent: no e-sign provider is connected, signature status is recorded by hand. */
import { HR_COMPANY_DOC_CATEGORIES, HR_EMP_DOC_TYPES, HR_SIGN_STATUSES, HR_SIGN_PROVIDERS, sessionTotals, labelOf } from './hr.js?v=202611060013';
const uid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const safeName = (n) => String(n || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);
const dataUrlBlob = async (u) => (await fetch(u)).blob();
export function hrFeedbackSupabase({ sb, ok }) {
  const put = async (path, file) => { ok(await sb.storage.from('hr-documents').upload(path, await dataUrlBlob(file.dataUrl), { contentType: file.mimeType || 'application/octet-stream', upsert: false })); return path; };
  const get = async (path, name, mimeType) => { const { data, error } = await sb.storage.from('hr-documents').createSignedUrl(path, 120); if (error) throw new Error(error.message); return { name, mimeType, dataUrl: data.signedUrl }; };
  const cdoc = (r) => ({ id: r.id, title: r.title, category: r.category, categoryLabel: labelOf(HR_COMPANY_DOC_CATEGORIES, r.category), description: r.description, shareScope: r.share_scope, shareLabel: r.share_scope === 'all' ? 'All employees' : '',
    fileName: r.file_name, mimeType: r.mime_type, size: Number(r.size_bytes), storagePath: r.storage_path, createdAt: r.created_at, createdByName: '', archivedAt: r.archived_at });
  const edoc = (r, sigs) => { const g = sigs.find((z) => z.document_id === r.id && !z.archived_at);
    return { id: r.id, employeeId: r.employee_id, docType: r.doc_type, docTypeLabel: labelOf(HR_EMP_DOC_TYPES, r.doc_type), title: r.title, signatureRequired: r.signature_required, fileName: r.file_name, mimeType: r.mime_type, size: Number(r.size_bytes),
      storagePath: r.storage_path, uploadedByRole: r.uploaded_by_role, createdAt: r.created_at, createdByName: '', archivedAt: r.archived_at,
      signature: g ? { id: g.id, provider: g.provider, providerLabel: labelOf(HR_SIGN_PROVIDERS, g.provider), status: g.status, statusLabel: labelOf(HR_SIGN_STATUSES, g.status), sentAt: g.sent_at, signedAt: g.signed_at, declinedAt: g.declined_at } : null }; };
  return {
    async listHrCompanyDocs({ includeArchived = false } = {}) { let q = sb.from('hr_company_documents').select('*').order('created_at', { ascending: false }); if (!includeArchived) q = q.is('archived_at', null); return (ok(await q) || []).map(cdoc); },
    async listHrDocsSharedWith() { return (ok(await sb.from('hr_company_documents').select('*').is('archived_at', null).order('created_at', { ascending: false })) || []).map(cdoc); },   // RLS returns only what is shared with the caller
    async uploadHrCompanyDoc(f = {}) { const path = await put(`company/${uid()}/${safeName(f.file && f.file.name)}`, f.file);
      const id = ok(await sb.rpc('hr_add_company_document', { p_title: f.title, p_category: f.category, p_description: f.description || '', p_share_scope: f.shareScope || 'all', p_department_ids: f.departmentIds || [], p_employee_ids: f.employeeIds || [],
        p_file_name: f.file.name, p_mime_type: f.file.mimeType || '', p_size_bytes: f.file.size, p_storage_path: path })); return { id }; },
    async archiveHrCompanyDoc(id, archived = true) { return { id, archivedAt: ok(await sb.rpc('hr_archive_company_document', { p_id: id, p_archived: archived })) }; },
    async getHrCompanyDocFile(id) { const r = ok(await sb.from('hr_company_documents').select('*').eq('id', id).maybeSingle()); if (!r) throw new Error('This document is not shared with you.'); return get(r.storage_path, r.file_name, r.mime_type); },
    async listHrEmployeeDocs(employeeId, { includeArchived = false } = {}) { let q = sb.from('hr_employee_documents').select('*').eq('employee_id', employeeId).order('created_at', { ascending: false }); if (!includeArchived) q = q.is('archived_at', null);
      const rows = ok(await q) || []; const sigs = rows.length ? (ok(await sb.from('hr_signature_requests').select('*').in('document_id', rows.map((r) => r.id))) || []) : []; return rows.map((r) => edoc(r, sigs)); },
    async uploadHrEmployeeDoc(employeeId, f = {}) { const path = await put(`employee/${employeeId}/${uid()}/${safeName(f.file && f.file.name)}`, f.file);
      return { id: ok(await sb.rpc('hr_add_employee_document', { p_employee: employeeId, p_doc_type: f.docType || 'other', p_title: f.title || f.file.name, p_signature_required: !!f.signatureRequired, p_file_name: f.file.name, p_mime_type: f.file.mimeType || '', p_size_bytes: f.file.size, p_storage_path: path })) }; },
    async setHrDocSignatureRequired(docId, required) { return { id: docId, signatureRequired: ok(await sb.rpc('hr_set_signature_required', { p_document: docId, p_required: !!required })) }; },
    async recordHrSignatureStatus(requestId, { status, provider, note } = {}) { return { id: requestId, status: ok(await sb.rpc('hr_record_signature_status', { p_request: requestId, p_status: status, p_provider: provider || null, p_note: note || '' })), sent: false }; },
    async archiveHrEmployeeDoc(docId, archived = true) { return { id: docId, archivedAt: ok(await sb.rpc('hr_archive_employee_document', { p_document: docId, p_archived: archived })) }; },
    async getHrEmployeeDocFile(docId) { const r = ok(await sb.from('hr_employee_documents').select('*').eq('id', docId).maybeSingle()); if (!r) throw new Error('Document not found.'); return get(r.storage_path, r.file_name, r.mime_type); },
    async hrSessionHeartbeat() { const id = ok(await sb.rpc('hr_session_heartbeat')); return id ? { sessionId: id } : null; },
    async hrSessionEnd(reason = 'logout') { return ok(await sb.rpc('hr_session_end', { p_reason: reason })); },
    async listHrPortalTime(employeeId, { limit = 50 } = {}) { const rows = (ok(await sb.from('hr_portal_session_durations').select('*').eq('employee_id', employeeId).order('started_at', { ascending: false })) || [])
        .map((r) => ({ id: r.id, employeeId: r.employee_id, startedAt: r.started_at, lastActivityAt: r.last_activity_at, endedAt: r.ended_at, endReason: r.end_reason, active: !r.ended_at, durationSeconds: Number(r.duration_seconds) }));
      return { sessions: rows.slice(0, limit), totals: sessionTotals(rows), count: rows.length }; },
  };
}

