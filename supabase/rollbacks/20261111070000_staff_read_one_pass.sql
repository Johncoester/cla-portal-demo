-- Restore the helper-chain staff reads and the captured activity policies.
-- Task policies are not touched. Rows already written are kept.
begin;
set local lock_timeout = '3s';

do $pre$
declare
  q text;
begin
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'activity_log' and policyname = 'activity_select';
  if q is null or position('private.reader_gate()' in q) = 0 then
    raise exception 'drift: activity_select is not the one-pass policy';
  end if;
  if to_regprocedure('private.reader_gate()') is null
     or to_regprocedure('private.reader_can_deal(uuid,uuid,text,boolean,uuid,boolean)') is null
     or to_regprocedure('private.deal_party_names()') is null then
    raise exception 'drift: the one-pass helpers are missing';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'deal_file_titles'
      and p.prosecdef
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'bd1393140d21f6a345163c1d2e3fc172647e55b35dd3263a9c751a5bd5b8866d'
  ) then
    raise exception 'drift: public.deal_file_titles(uuid) is not the one-pass body';
  end if;
end
$pre$;

alter policy activity_select on public.activity_log
using (((private.me_role() IS NOT NULL) AND private.is_staffish() AND (private.is_admin() OR ((((deal_id IS NULL) AND private.is_processor()) OR ((deal_id IS NOT NULL) AND private.can_access_deal(deal_id))) AND (private.is_processor() OR (entity IS NULL) OR (entity_id IS NULL) OR ((entity = 'document'::text) AND private.document_readable(entity_id)) OR ((entity = 'thread'::text) AND private.thread_member(entity_id)) OR (entity <> ALL (ARRAY['document'::text, 'thread'::text])))))));

alter policy demo_scope on public.activity_log
using (
CASE
    WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo())
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = activity_log.deal_id)) = private.viewer_is_demo())
END)
with check (
CASE
    WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo())
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = activity_log.deal_id)) = private.viewer_is_demo())
END);

create or replace function public.deal_file_titles(p_deal uuid default null)
returns table (deal_id uuid, file_title text)
language sql stable security invoker set search_path to pg_catalog, public, extensions as $fn$
  select d.id, private.file_title(d.id) from public.deals d where p_deal is null or d.id = p_deal $fn$;

create or replace function public.deal_list_extras()
returns table (deal_id uuid, party_names text[], overdue_tasks integer)
language sql stable security invoker set search_path to pg_catalog, public, extensions as $fn$
  select d.id,
         coalesce((select array_agg(distinct trim(c.first_name || ' ' || c.last_name)) from public.deal_contacts(d.id) c), '{}'),
         (select count(*)::int from public.tasks t where t.deal_id = d.id and t.status in ('todo', 'in_progress', 'blocked') and t.due_date < private.office_today())
  from public.deals d $fn$;

create or replace function private.rpc_my_file_roles_full()
returns table (deal_id uuid, role text, roles text[], label text, self_rep boolean)
language sql stable security definer set search_path to pg_catalog, public, extensions as $fn$
  select d.id, private.deal_role(d.id), private.deal_roles(d.id), private.role_text(private.deal_roles(d.id)),
         coalesce(cardinality(private.deal_roles(d.id)) = 2 and private.self_rep_pair((private.deal_roles(d.id))[1], (private.deal_roles(d.id))[2]), false)
  from public.deals d where private.can_access_deal(d.id) $fn$;

drop function if exists private.deal_party_names();
drop function if exists private.reader_can_deal(uuid, uuid, text, boolean, uuid, boolean);
drop function if exists private.reader_gate();

drop index if exists public.tasks_open_due_idx;
drop index if exists public.deal_participants_deal_role_idx;

do $post$
declare
  q text;
begin
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'activity_log' and policyname = 'activity_select';
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from 'efeb63a1fc7073af07d5169e9c566b40ed5420fd045dba321f54dd87320b46ee' then
    raise exception 'rollback did not restore activity_select (% )', encode(sha256(convert_to(q, 'UTF8')), 'hex');
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'deal_file_titles'
      and not p.prosecdef
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'af420f7927c8dcda5d4fea12bf32259ecfa9ca7b2f6cb6ad6b40e2c0c301d68d'
  ) then
    raise exception 'rollback did not restore public.deal_file_titles(uuid)';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'deal_list_extras'
      and not p.prosecdef
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '2276decea539fd72a3eede982f9d432ff7d6375ae7f4a37dae8dd65a06c4c77e'
  ) then
    raise exception 'rollback did not restore public.deal_list_extras()';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'rpc_my_file_roles_full'
      and p.prosecdef
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'efcdbe573b075ebc7c7a3b021681fb46db1726691bb0530c078a94a07a5330f1'
  ) then
    raise exception 'rollback did not restore private.rpc_my_file_roles_full()';
  end if;
  if to_regprocedure('private.reader_gate()') is not null then
    raise exception 'rollback left private.reader_gate()';
  end if;
end
$post$;

commit;
