-- Rollback for 20261110001000_invite_auto_email.sql. NOT APPLIED. Redeploy the previous gmail-send first (or leave it: without these functions
-- an invite send just fails and the page shows the copy link).
drop function if exists public.invite_svc_mark_sent(text, text, uuid, text, text, text);
drop function if exists public.invite_send_info(text, text);
alter table public.agent_invites drop column if exists sent_at, drop column if exists sent_via, drop column if exists sent_to, drop column if exists sent_message_id,
  drop column if exists sent_by, drop column if exists send_count, drop column if exists send_error;
alter table public.hr_invites drop column if exists sent_at, drop column if exists sent_via, drop column if exists sent_to, drop column if exists sent_message_id,
  drop column if exists sent_by, drop column if exists send_count, drop column if exists send_error;
