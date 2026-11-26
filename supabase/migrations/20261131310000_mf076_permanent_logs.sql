-- MF-076 (Matt, confirmed Nov 26 2026, Gmail 1a217f4600469b95): every action by every party is logged,
-- including messages sent and documents viewed, and nobody can edit or delete entries in the activity
-- log or the wire log. Answer B: "for now, no one can modify logs", so there is no admin exception.
--
-- 1. public.activity_log and public.wire_audit_log: BEFORE UPDATE OR DELETE (row) and BEFORE TRUNCATE
--    (statement) triggers that always raise, for every role (authenticated, service_role, postgres).
--    UPDATE / DELETE / TRUNCATE are also revoked from anon, authenticated and service_role.
-- 2. wire_audit_log: the staff UPDATE policy wire_update is dropped. The app only ever inserts into
--    wire_audit_log (js/data/supabase-wires.js, the post-draft audit); no function, edge function, cron
--    job or script updates or deletes it, and no foreign key cascades into either log.
-- 3. Message sends: AFTER INSERT trigger on public.messages writes 'message.posted' (entity 'thread'),
--    the same action the demo adapter already logs. The message body is not copied into the log.
-- 4. Document views: public.log_document_view(uuid), SECURITY DEFINER, writes 'document.viewed'
--    (entity 'document') when the caller can read the document (private.document_readable). The app
--    calls it every time a document is opened or downloaded (getDocumentContent). The same person
--    opening the same document again within 60 seconds is not logged twice (volume).
-- Reads: no RLS change. activity_select already shows a 'document' row only when
-- document_readable(entity_id) and a 'thread' row only when thread_member(entity_id), for staff, and
-- rpc_my_order_activity already hides 'document.viewed' from parties. So parties only see what they
-- already could.
-- Limits (database, not app): the table owner or a superuser can still drop or disable a trigger,
-- or set session_replication_role = replica, which skips triggers. That needs owner access in the
-- Supabase dashboard; no portal login or API key can do it.
-- Rollback: supabase/rollbacks/20261131310000_mf076_permanent_logs.sql
begin;
set local lock_timeout = '3s';

create or replace function private.log_rows_are_permanent()
returns trigger
language plpgsql
set search_path to pg_catalog, public, extensions
as $fn$
begin
  raise exception 'Log entries are permanent: % on % is not allowed (MF-076).', tg_op, tg_table_name
    using errcode = '42501';
end
$fn$;

drop trigger if exists zz_log_permanent on public.activity_log;
create trigger zz_log_permanent before update or delete on public.activity_log
  for each row execute function private.log_rows_are_permanent();
drop trigger if exists zz_log_no_truncate on public.activity_log;
create trigger zz_log_no_truncate before truncate on public.activity_log
  for each statement execute function private.log_rows_are_permanent();

drop trigger if exists zz_log_permanent on public.wire_audit_log;
create trigger zz_log_permanent before update or delete on public.wire_audit_log
  for each row execute function private.log_rows_are_permanent();
drop trigger if exists zz_log_no_truncate on public.wire_audit_log;
create trigger zz_log_no_truncate before truncate on public.wire_audit_log
  for each statement execute function private.log_rows_are_permanent();

drop policy if exists wire_update on public.wire_audit_log;
revoke update, delete, truncate on public.activity_log from anon, authenticated, service_role;
revoke update, delete, truncate on public.wire_audit_log from anon, authenticated, service_role;

-- 3. message sends
create or replace function private.trg_message_log()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $fn$
declare d uuid; s text;
begin
  select t.deal_id, t.subject into d, s from public.threads t where t.id = new.thread_id;
  insert into public.activity_log (deal_id, actor_id, action, entity, entity_id, detail)
  values (d, coalesce(new.author_id, private.effective_uid()), 'message.posted', 'thread', new.thread_id,
          left('Message in: ' || coalesce(s, '(no subject)'), 300));
  return new;
end
$fn$;
revoke all on function private.trg_message_log() from public, anon, authenticated;

drop trigger if exists messages_activity on public.messages;
create trigger messages_activity after insert on public.messages
  for each row execute function private.trg_message_log();

-- 4. document views
create index if not exists idx_activity_doc_viewed
  on public.activity_log (entity_id, actor_id, created_at desc)
  where action = 'document.viewed';

create or replace function public.log_document_view(p_document uuid)
returns void
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $fn$
declare me uuid := private.effective_uid(); doc record;
begin
  if me is null then raise exception 'Please sign in.' using errcode = '28000'; end if;
  if not coalesce(private.document_readable(p_document), false) then
    raise exception 'Document not found.' using errcode = 'P0002';
  end if;
  -- View as is read-only (activity_log has a view-as guard); the open itself is still allowed.
  if private.is_viewing_as() then return; end if;
  select x.id, x.deal_id, x.name into doc from public.documents x where x.id = p_document;
  if exists (select 1 from public.activity_log a
              where a.action = 'document.viewed' and a.entity_id = p_document and a.actor_id = me
                and a.created_at > pg_catalog.now() - interval '60 seconds') then
    return;
  end if;
  insert into public.activity_log (deal_id, actor_id, action, entity, entity_id, detail)
  values (doc.deal_id, me, 'document.viewed', 'document', doc.id, left('Opened ' || coalesce(doc.name, 'a document'), 300));
end
$fn$;
revoke all on function public.log_document_view(uuid) from public, anon;
grant execute on function public.log_document_view(uuid) to authenticated;

-- self-checks
do $chk$
declare t text;
begin
  foreach t in array array['activity_log', 'wire_audit_log'] loop
    if (select count(*) from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
         where c.relnamespace = 'public'::regnamespace and c.relname = t and not tg.tgisinternal
           and tg.tgenabled = 'O' and tg.tgname in ('zz_log_permanent', 'zz_log_no_truncate')) <> 2 then
      raise exception 'self-check: % is missing an enabled permanent-log trigger', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'UPDATE') or has_table_privilege('authenticated', 'public.' || t, 'DELETE')
       or has_table_privilege('service_role', 'public.' || t, 'UPDATE') or has_table_privilege('service_role', 'public.' || t, 'DELETE')
       or has_table_privilege('service_role', 'public.' || t, 'TRUNCATE') then
      raise exception 'self-check: a client role can still change %', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd in ('UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE') then
      raise exception 'self-check: % still has a permissive update/delete policy', t;
    end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.log_document_view(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.log_document_view(uuid)', 'EXECUTE') then
    raise exception 'self-check: log_document_view must be for signed-in users only';
  end if;
end
$chk$;

select private.lock_function_search_paths();

commit;

notify pgrst, 'reload schema';
