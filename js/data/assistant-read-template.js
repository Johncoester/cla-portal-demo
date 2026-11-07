/* Query shape for this bot's existing database connector. Not executed here.
 * The connector used by this bot is postgres with auth.uid() null. It is not John or Matt.
 * Run this only if that connector is already allowed to SELECT these tables. If it is denied, stop.
 * Do not set role, copy a user token, or use the service role key from this bot.
 * Attachment rows are metadata. They are not the file bytes and they are not analyzed. */
export const FEEDBACK_READ_SQL = `
select e.id as event_id, e.feedback_id, e.conversation_id, e.event_name, e.delivery_state as event_state,
       r.reporter_id, r.title, r.body, r.status, r.delivery_state, r.is_demo, r.page_path, r.order_file_number,
       p.status as reporter_status, p.is_demo as reporter_demo,
       m.id as message_id, m.body as message_body, m.author_kind, m.visibility
  from public.staff_feedback_outbox e
  join public.staff_feedback_reports r on r.id = e.feedback_id and r.conversation_id = e.conversation_id
  join public.profiles p on p.id = r.reporter_id
  left join public.staff_feedback_messages m on m.report_id = r.id and m.visibility = 'published'
 where e.id = $1
   and e.feedback_id = $2
   and e.conversation_id = $3
   and e.event_name = 'cla.feedback.created'
   and r.reporter_id in ('149e612a-6e14-4ee1-9890-0f29d6f89156'::uuid, 'd02722a1-582b-42c0-b3d1-28d25adb758d'::uuid)
   and r.is_demo = false
   and p.status = 'active'
   and p.is_demo = false
`.trim();

export const ATTACHMENT_META_SQL = `
select id, file_name, mime_type, size_bytes, storage_path
  from public.staff_feedback_attachments
 where report_id = $1
`.trim();
