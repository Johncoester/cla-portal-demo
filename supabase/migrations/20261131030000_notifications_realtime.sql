-- FF-115 (Francis Santos, confirmed Nov 24 2026 6:18 PM ET, answer "Both";
-- source: Gemini notes of the Nov 23 2:35 PM ET meeting, Gmail 1a20abbd6b7e823a;
-- confirm-back 1a20af12dc3a104a).
-- Processors currently have to refresh the page to see a new notification.
-- This file adds public.notifications to the supabase_realtime publication so the
-- signed-in person's bell badge and notifications list can update on their own.
-- Row Level Security is unchanged: notifications_select still limits each person to
-- their own rows, so Realtime cannot show someone else's notifications.
-- REPLICA IDENTITY FULL includes profile_id on UPDATE/DELETE payloads so the
-- client can filter by this person.
-- Not applied by this commit. Rollback: supabase/rollbacks/20261131030000_notifications_realtime.sql
begin;
set local lock_timeout = '3s';

do $chk$
begin
  if to_regclass('public.notifications') is null then
    raise exception 'drift: public.notifications is missing';
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'drift: supabase_realtime publication is missing';
  end if;
end $chk$;

do $pub$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $pub$;

alter table public.notifications replica identity full;

commit;

notify pgrst, 'reload schema';
