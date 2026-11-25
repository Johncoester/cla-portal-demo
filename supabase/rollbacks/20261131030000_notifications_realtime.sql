-- Undo FF-115: remove public.notifications from the supabase_realtime publication
-- and restore the default (primary key) replica identity. Does not drop the table
-- or change RLS.
begin;
set local lock_timeout = '3s';

do $pub$
begin
  if to_regclass('public.notifications') is null then
    return;
  end if;
  if exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'notifications'
  ) then
    alter publication supabase_realtime drop table public.notifications;
  end if;
end $pub$;

do $ident$
begin
  if to_regclass('public.notifications') is not null then
    alter table public.notifications replica identity default;
  end if;
end $ident$;

commit;
