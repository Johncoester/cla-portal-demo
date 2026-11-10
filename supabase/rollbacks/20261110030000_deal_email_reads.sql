-- Rollback for 20261110030000_deal_email_reads.sql.
-- Drops only the read cursor added for file Gmail. Does not touch public.deal_emails or deal_emails_staff_select.
-- Portal unread (thread_participants.last_read_at) is unchanged.

begin;
set local lock_timeout = '3s';

drop function if exists public.deal_email_unread_counts();
drop policy if exists deal_email_reads_update on public.deal_email_reads;
drop policy if exists deal_email_reads_insert on public.deal_email_reads;
drop policy if exists deal_email_reads_select on public.deal_email_reads;
drop table if exists public.deal_email_reads;

commit;
