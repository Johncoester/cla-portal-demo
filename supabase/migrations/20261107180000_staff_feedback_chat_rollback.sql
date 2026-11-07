-- Rollback for 20261107180000_staff_feedback_chat.sql.
-- TEST project aqcervntopidtcazcmlv only. Does not drop profiles, deals, auth, or other private helpers.
-- Run this only to undo that migration. It does not delete storage bytes that were already uploaded;
-- it removes the bucket row and the policies so the portal can no longer read them.

do $storage$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists staff_feedback_object_insert on storage.objects';
    execute 'drop policy if exists staff_feedback_object_read on storage.objects';
  end if;
  if to_regclass('storage.buckets') is not null then
    delete from storage.buckets where id = 'staff-feedback';
  end if;
end $storage$;

drop policy if exists staff_feedback_reports_select on public.staff_feedback_reports;
drop policy if exists staff_feedback_messages_select on public.staff_feedback_messages;
drop policy if exists staff_feedback_attachments_select on public.staff_feedback_attachments;
drop policy if exists staff_feedback_outbox_select on public.staff_feedback_outbox;

drop function if exists public.staff_feedback_bot_draft_reply(uuid, text);
drop function if exists public.staff_feedback_bot_ack(uuid);
drop function if exists public.staff_feedback_mark_run_accepted(uuid, integer);
drop function if exists public.staff_feedback_bot_get(uuid);
drop function if exists public.staff_feedback_review_reply(uuid);
drop function if exists public.staff_feedback_publish_draft(uuid);
drop function if exists public.staff_feedback_attachment_for_download(uuid);
drop function if exists public.staff_feedback_add_attachment(uuid, uuid, text, text, integer, text, uuid);
drop function if exists public.staff_feedback_get(uuid);
drop function if exists public.staff_feedback_list();
drop function if exists public.staff_feedback_set_status(uuid, text);
drop function if exists public.staff_feedback_reply(uuid, text, uuid);
drop function if exists public.staff_feedback_create(text, text, boolean, text, boolean, text, uuid);

drop function if exists private.staff_feedback_can_read_object(text);
drop function if exists private.staff_feedback_can_upload_object(text);
drop function if exists private.staff_feedback_bot_only();
drop function if exists private.staff_feedback_payload(uuid);
drop function if exists private.staff_feedback_visible(uuid);
drop function if exists private.staff_feedback_clean(text, int, text);
drop function if exists private.staff_feedback_require(boolean);
drop function if exists private.staff_feedback_notice(text, text);

drop table if exists public.staff_feedback_outbox;
drop table if exists public.staff_feedback_attachments;
drop table if exists public.staff_feedback_messages;
drop table if exists public.staff_feedback_reports;
