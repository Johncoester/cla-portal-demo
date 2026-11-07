/* Supabase adapter for staff portal feedback. RPCs enforce the rules. The browser has no webhook URL or Bearer key.
 * Test simulation is refused here so a hosted session cannot pretend the assistant replied. */
import { screenshotMeta } from './staff-feedback.js?v=202611072230';

const uid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : '');
const safeName = (n) => String(n || 'screenshot').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);

export function staffFeedbackSupabase({ sb, ok, camel }) {
  const one = async (name, args) => camel(ok(await sb.rpc(name, args)));
  return {
    async listStaffFeedback() { return camel(ok(await sb.rpc('staff_feedback_list')) || []); },
    async getStaffFeedback(id) { return one('staff_feedback_get', { p_report: id }); },
    async createStaffFeedback(input = {}) {
      return one('staff_feedback_create', {
        p_title: input.title || '', p_body: input.body || '', p_include_page: !!input.includePage, p_page: input.includePage ? (input.page || '') : '',
        p_include_order: !!input.includeOrder, p_file_number: input.includeOrder ? (input.fileNumber || '') : '', p_idempotency: input.idempotencyKey,
      });
    },
    async replyStaffFeedback(id, input = {}) { return one('staff_feedback_reply', { p_report: id, p_body: input.body || '', p_idempotency: input.idempotencyKey }); },
    async setStaffFeedbackStatus(id, status) { return one('staff_feedback_set_status', { p_report: id, p_status: status }); },
    async addStaffFeedbackAttachment(id, file = {}) {
      const meta = screenshotMeta(file);
      const key = file.idempotencyKey || uid();
      const path = `reports/${id}/${key}.${meta.ext}`;
      const blob = file.blob || await (await fetch(file.dataUrl)).blob();
      const up = await sb.storage.from('staff-feedback').upload(path, blob, { contentType: meta.mime, upsert: false });
      if (up.error) throw new Error('The screenshot was not stored.');
      return one('staff_feedback_add_attachment', { p_report: id, p_message: file.messageId || null, p_name: meta.name, p_mime: meta.mime, p_size: meta.size, p_path: path, p_idempotency: key });
    },
    async openStaffFeedbackAttachment(id) {
      const meta = one('staff_feedback_attachment_for_download', { p_id: id });
      const row = await meta;
      const dl = await sb.storage.from('staff-feedback').download(row.storagePath);
      if (dl.error || !dl.data) throw new Error('The screenshot could not be opened.');
      return { id: row.id, fileName: row.fileName, mimeType: row.mimeType, blob: dl.data };
    },
    async publishStaffFeedbackDraft(id) { return one('staff_feedback_publish_draft', { p_message: id }); },
    async reviewStaffFeedbackReply(id) { return one('staff_feedback_review_reply', { p_event: id }); },
    async simulateStaffFeedback() { throw new Error('Test simulation is only available in the local demo. Nothing was sent.'); },
  };
}
