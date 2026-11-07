/* supabase-nov5.js : browser adapter for the Nov 5 RPCs plus the document/message reads that were still stubs.
 * RLS and the security-definer RPCs decide access. This file does not embed a project URL or a key.
 * File bytes go to the private deal-documents bucket (migration 3). A missing bucket surfaces as an error; nothing is invented. */
import { ordinaryCoverageDoc } from './nov5-rules.js?v=202611070139';
import { uploadBytes } from './upload-bytes.js?v=202611070139';

export const SAVED_UNCONFIRMED = 'This file was saved but the list could not be refreshed. It is already stored, so sending it again will not add a second copy.';

/* One id for one chosen file. A later submit of that same file reuses it. A different file gets a new id. */
export function sameUploadId(slot, file) {
  const mark = [file && file.name, file && file.size, file && file.lastModified].join('\0');
  if (!slot.id || slot.mark !== mark) {
    slot.mark = mark;
    slot.id = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : '';
  }
  return slot.id;
}

function alreadyKept(error) {
  if (!error) return false;
  const code = String(error.code || error.statusCode || error.status || '');
  const msg = String(error.message || '');
  return code === '23505' || code === '409' || /already exists|duplicate key/i.test(msg);
}

/* Columns written by the hosted insert. folder_id is not one of them. */
export function documentInsertRow({ dealId, file, userId, id }) {
  const name = String(file.name || 'upload').replace(/[\\/]/g, '_').slice(0, 200);
  return {
    id,
    deal_id: dealId,
    name,
    description: file.description || '',
    mime_type: file.mimeType || 'application/octet-stream',
    size_bytes: file.size || 0,
    storage_path: `${dealId}/${id}/${name}`,
    visibility: file.visibility || 'all',
    uploaded_by: userId,
    doc_type: file.docType || '',
    wire_instructions: file.wireInstructions === true,
  };
}

export function nov5Supabase({ sb, ok, camel, me }) {
  const uid = async () => (await sb.auth.getUser()).data.user;
  return {
    async listTaskAdmin() { return camel(ok(await sb.rpc('list_task_admin'))); },
    async saveTaskTemplate(input) { return camel(ok(await sb.rpc('upsert_task_template', { p_code: input.code, p_title: input.title, p_description: input.description || '', p_roles: input.roles || [], p_due_days: input.dueDays || 7, p_lane: input.lane, p_audiences: input.audiences || [], p_client_only: !!input.clientOnly }))); },
    async retireTaskTemplate(code, reason) { return camel(ok(await sb.rpc('retire_task_template', { p_code: code, p_reason: reason }))); },
    async listAlertGroups() { return camel(ok(await sb.from('alert_groups').select('*, members:alert_group_members(*)'))); },
    async saveAlertGroupMember(groupId, input) { return camel(ok(await sb.rpc('save_alert_group_member', { p_group: groupId, p_id: input.id || null, p_name: input.displayName, p_role: input.assignmentRole || 'postcloser', p_profile: input.profileId || null, p_email: input.email || '' }))); },
    async listEntityAttorneys() { return camel(ok(await sb.from('entity_review_attorneys').select('*'))); },
    async saveEntityAttorney(input) { return camel(ok(await sb.rpc('save_entity_attorney', { p_id: input.id || null, p_name: input.displayName, p_role: input.assignmentRole || 'attorney', p_profile: input.profileId || null, p_active: input.active !== false }))); },
    async listCplPrices() { return camel(ok(await sb.from('cpl_prices').select('*'))); },
    async saveCplPrice(input) { return camel(ok(await sb.rpc('save_cpl_price', { p_state: input.state, p_underwriter: input.underwriter, p_amount: input.amount }))); },
    async listFileCoverage(dealKey) {
      const row = camel(ok(await sb.rpc('list_file_coverage', { p_deal: dealKey })));
      if (row && Array.isArray(row.documents)) row.documents = row.documents.filter((d) => ordinaryCoverageDoc(d));
      return row;
    },
    async listThreads(dealId) {
      const threads = camel(ok(await sb.from('threads').select('*').eq('deal_id', dealId).order('created_at')));
      const ids = threads.map((t) => t.id);
      const messages = ids.length ? camel(ok(await sb.from('messages').select('*').in('thread_id', ids).order('created_at'))) : [];
      return threads.map((t) => ({ ...t, messages: messages.filter((m) => m.threadId === t.id) }));
    },
    async getThread(id) {
      const t = camel(ok(await sb.from('threads').select('*').eq('id', id).single()));
      t.messages = camel(ok(await sb.from('messages').select('*').eq('thread_id', id).order('created_at')));
      return t;
    },
    async markThreadRead(id) {
      const user = await uid(); if (!user) throw new Error('Please sign in.');
      ok(await sb.from('thread_participants').update({ last_read_at: new Date().toISOString() }).eq('thread_id', id).eq('profile_id', user.id));
    },
    async addDocument(dealId, file) {
      const user = await uid(); if (!user) throw new Error('Please sign in.');
      const id = file.id || ((globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : null);
      if (!id) throw new Error('This browser cannot mint a document id.');
      const row = documentInsertRow({ dealId, file, userId: user.id, id });
      const body = await uploadBytes(file);
      const bucket = sb.storage.from('deal-documents');
      const up = await bucket.upload(row.storage_path, body, { contentType: file.mimeType || 'application/octet-stream', upsert: false });
      if (up.error && !alreadyKept(up.error)) throw new Error(up.error.message || 'The document bucket refused the upload.');
      const ins = await sb.from('documents').insert(row);
      if (ins.error && !alreadyKept(ins.error)) throw new Error(ins.error.message);
      const read = await sb.from('documents').select('*').eq('id', row.id).single();
      if (read.error) { const err = new Error(SAVED_UNCONFIRMED); err.savedId = row.id; throw err; }
      return camel(ok({ data: read.data, error: null }));
    },
    async getDocumentContent(id) {
      const doc = camel(ok(await sb.from('documents').select('id, name, storage_path, mime_type').eq('id', id).single()));
      if (!doc.storagePath) throw new Error('This document has no stored file.');
      const dl = await sb.storage.from('deal-documents').download(doc.storagePath);
      if (dl.error) throw new Error(dl.error.message || 'Could not read the stored file.');
      return { name: doc.name, mimeType: doc.mimeType, blob: dl.data };
    },
    async sessionUser() { return me(); },
  };
}
