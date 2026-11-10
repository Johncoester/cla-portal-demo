-- task_board's name step called deal_contacts once per deal. Each call ran
-- seven security-definer helpers, and each of those re-ran effective_uid.
-- board_owner_names does that work once for the whole id list. A staff
-- viewer skips the hide flags. my_task_list asks for names only after it
-- has kept its own rows, and it resolves deal_roles once per deal.
-- effective_uid remembers its answer for the rest of the transaction.
-- The three task restrictive policies already use one initplan when
-- 20261111160000 has been applied. If they still call the helpers bare,
-- this migration wraps those calls in (select ...).
-- Rollback: supabase/rollbacks/20261111170000_board_owner_names.sql
begin;
set local lock_timeout = '3s';

do $pre$
declare
  q text;
begin
  if to_regprocedure('private.reader_gate()') is null
     or to_regprocedure('private.reader_can_deal(uuid,uuid,text,boolean,uuid,boolean)') is null
     or to_regprocedure('private.can_access_deal(uuid)') is null
     or to_regprocedure('public.deal_contacts(uuid)') is null then
    raise exception 'drift: reader_gate or deal_contacts is missing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'effective_uid'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.prosecdef and p.provolatile = 's'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '57c143b27533e4b6cf45156c0c04e4558ae16a9533892f921cdb284dde8061fe'
  ) then
    raise exception 'drift: private.effective_uid() is not the captured helper';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'task_board'
      and pg_get_function_identity_arguments(p.oid) = 'p_file_status text'
      and not p.prosecdef and p.provolatile = 's'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '76c9c7bc2ff952cfe0a430fa4fe6ac7ef089c8501c89195d06b57d91a57d3ab0'
  ) then
    raise exception 'drift: public.task_board(text) is not the captured function';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'my_task_list'
      and pg_get_function_identity_arguments(p.oid) = 'p_file_status text'
      and not p.prosecdef and p.provolatile = 's'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '803159c40df9be6088d6c48510e75017200f67d0d6d9d5acbeaa97e6a2f507f4'
  ) then
    raise exception 'drift: public.my_task_list(text) is not the captured function';
  end if;

  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_audience_limit';
  if q = '((audiences IS NULL) OR private.is_staffish() OR private.task_outside_audience(id))' then
    null;
  elsif q like '%g.staffish%' or q like '%(select private.is_staffish())%' or q like '%(SELECT private.is_staffish())%' then
    null;
  else
    raise exception 'drift: tasks_audience_limit is %', q;
  end if;

  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_retired_kept';
  if q = '((template_code IS NULL) OR (NOT private.template_code_retired(template_code)) OR private.is_admin() OR private.is_processor() OR ((status = ANY (ARRAY[''todo''::text, ''in_progress''::text, ''blocked''::text])) AND (owner_profile_id = ( SELECT private.effective_uid() AS uid))))' then
    null;
  elsif q like '%g.is_admin%' or q like '%(select private.is_admin())%' or q like '%(SELECT private.is_admin())%' then
    null;
  else
    raise exception 'drift: tasks_retired_kept is %', q;
  end if;

  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_switch_hidden';
  if q = '((template_code IS NULL) OR private.task_enabled(template_code) OR private.is_admin())' then
    null;
  elsif q like '%g.is_admin%' or q like '%(select private.is_admin())%' or q like '%(SELECT private.is_admin())%' then
    null;
  else
    raise exception 'drift: tasks_switch_hidden is %', q;
  end if;
end
$pre$;

create or replace function private.effective_uid()
returns uuid
language plpgsql
stable
security definer
set search_path to pg_catalog, public, extensions
as $uid$
declare
  actor text;
  found uuid;
begin
  actor := coalesce(auth.uid()::text, '');
  if current_setting('cla.effective_uid_for', true) is not distinct from actor
     and current_setting('cla.effective_uid_for', true) is not null then
    return nullif(current_setting('cla.effective_uid', true), '')::uuid;
  end if;
  select coalesce(
    (select s.target_id
       from private.view_as_sessions s
       join public.profiles a on a.id = s.actor_id
      where s.actor_id = auth.uid()
        and a.role = 'Super admin' and a.is_admin and a.status = 'active'
        and s.stopped_at is null
        and s.expires_at > pg_catalog.now()),
    auth.uid())
  into found;
  perform set_config('cla.effective_uid_for', actor, true);
  perform set_config('cla.effective_uid', coalesce(found::text, ''), true);
  return found;
end
$uid$;

create or replace function private.board_owner_names(p_deals uuid[])
returns table (deal_id uuid, participant_id uuid, owner_name text)
language plpgsql
stable
security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $names$
begin
  if (select private.is_staffish()) then
    return query
    with g as materialized (
      select * from private.reader_gate()
    ),
    ids as (
      select distinct u.id
      from unnest(coalesce(p_deals, '{}'::uuid[])) u(id)
      where u.id is not null
    )
    select dp.deal_id, dp.id, trim(c.first_name || ' ' || c.last_name)
    from ids
    cross join g
    join public.deal_participants dp on dp.deal_id = ids.id
    join public.contacts c on c.id = dp.contact_id
    where dp.id is not null
      and private.reader_can_deal(ids.id, g.uid, g.role, g.is_admin, g.contact_id, g.active);
    return;
  end if;

  return query
  with ids as (
    select distinct u.id
    from unnest(coalesce(p_deals, '{}'::uuid[])) u(id)
    where u.id is not null
  ),
  flags as (
    select i.id as deal_id,
           private.can_access_deal(i.id) as can_access,
           private.deal_role(i.id) as deal_role,
           private.is_pure_buyer(i.id) as pure_buyer,
           private.is_pure_seller(i.id) as pure_seller
    from ids i
  )
  select dp.deal_id, dp.id, trim(c.first_name || ' ' || c.last_name)
  from flags f
  join public.deal_participants dp on dp.deal_id = f.deal_id
  join public.contacts c on c.id = dp.contact_id
  where f.can_access
    and dp.id is not null
    and not (f.deal_role in ('Client-Buyer', 'Client-Seller') and dp.role like 'Client-%' and dp.role <> f.deal_role)
    and not (dp.role = 'Listing Agent' and f.pure_buyer)
    and not (dp.role = 'Buyer Agent' and f.pure_seller);
end
$names$;

revoke all on function private.board_owner_names(uuid[]) from public;
grant execute on function private.board_owner_names(uuid[]) to authenticated;

create or replace function public.task_board(p_file_status text default 'All')
returns table (
  id uuid, deal_id uuid, title text, description text, assigned_role text, status text, due_date date,
  completed_at timestamptz, completed_by uuid, kind text, participant_id uuid, owner_profile_id uuid,
  template_code text, template_version integer, created_at timestamptz,
  file_number text, street text, city text, state text, zip text, closing_date date, deal_status text,
  owner_name text, overdue boolean
)
language sql
stable
security invoker
set search_path to pg_catalog, public, extensions
as $board$
  with board as (
    select t.id, t.deal_id, t.title, t.description, t.assigned_role, t.status, t.due_date, t.completed_at, t.completed_by,
           t.kind, t.participant_id, t.owner_profile_id, t.template_code, t.template_version, t.created_at,
           d.file_number, d.street, d.city, d.state, d.zip, d.closing_date, d.status as deal_status
    from public.tasks t
    join public.deals d on d.id = t.deal_id
    where coalesce(p_file_status, 'All') = 'All' or d.status = p_file_status
  ),
  names as (
    select n.deal_id, n.participant_id, n.owner_name
    from private.board_owner_names((
      select coalesce(array_agg(distinct b.deal_id), '{}'::uuid[]) from board b
    )) n
  )
  select board.id, board.deal_id, board.title, board.description, board.assigned_role, board.status, board.due_date,
         board.completed_at, board.completed_by, board.kind, board.participant_id, board.owner_profile_id,
         board.template_code, board.template_version, board.created_at,
         board.file_number, board.street, board.city, board.state, board.zip, board.closing_date, board.deal_status,
         names.owner_name,
         (board.status in ('todo', 'in_progress', 'blocked') and board.due_date is not null and board.due_date < private.office_today())
  from board
  left join names on names.deal_id = board.deal_id and names.participant_id = board.participant_id
  order by board.file_number, board.due_date nulls last, board.title
$board$;

create or replace function public.my_task_list(p_file_status text default 'Open')
returns table (
  id uuid, deal_id uuid, title text, description text, assigned_role text, status text, due_date date,
  completed_at timestamptz, completed_by uuid, kind text, participant_id uuid, owner_profile_id uuid,
  template_code text, template_version integer, created_at timestamptz,
  file_number text, street text, city text, state text, zip text, closing_date date, deal_status text,
  owner_name text, overdue boolean, my_roles text[]
)
language sql
stable
security invoker
set search_path to pg_catalog, public, extensions
as $mine$
  with me as materialized (
    select (select private.effective_uid()) as uid,
           (select private.is_staffish()) as staffish,
           (select private.me_role()) as role
  ),
  board as (
    select t.id, t.deal_id, t.title, t.description, t.assigned_role, t.status, t.due_date, t.completed_at, t.completed_by,
           t.kind, t.participant_id, t.owner_profile_id, t.template_code, t.template_version, t.created_at,
           d.file_number, d.street, d.city, d.state, d.zip, d.closing_date, d.status as deal_status
    from public.tasks t
    join public.deals d on d.id = t.deal_id
    cross join me
    where (coalesce(p_file_status, 'Open') = 'All' or d.status = p_file_status)
      and (t.owner_profile_id = me.uid or t.participant_id is null)
  ),
  roles as (
    select i.deal_id,
           case when me.staffish then array[me.role] else private.deal_roles(i.deal_id) end as my_roles
    from (select distinct b.deal_id from board b) i
    cross join me
  ),
  kept as (
    select b.*, r.my_roles
    from board b
    join roles r on r.deal_id = b.deal_id
    cross join me
    where b.owner_profile_id = me.uid
       or (b.participant_id is null and (b.assigned_role = any (r.my_roles) or (me.staffish and b.assigned_role = me.role)))
  ),
  names as (
    select n.deal_id, n.participant_id, n.owner_name
    from private.board_owner_names((
      select coalesce(array_agg(distinct k.deal_id), '{}'::uuid[])
      from kept k
      where k.participant_id is not null
    )) n
  )
  select k.id, k.deal_id, k.title, k.description, k.assigned_role, k.status, k.due_date,
         k.completed_at, k.completed_by, k.kind, k.participant_id, k.owner_profile_id,
         k.template_code, k.template_version, k.created_at,
         k.file_number, k.street, k.city, k.state, k.zip, k.closing_date, k.deal_status,
         names.owner_name,
         (k.status in ('todo', 'in_progress', 'blocked') and k.due_date is not null and k.due_date < private.office_today()),
         k.my_roles
  from kept k
  left join names on names.deal_id = k.deal_id and names.participant_id = k.participant_id
  order by k.due_date nulls last, k.file_number, k.title
$mine$;

do $pol$
declare
  q text;
begin
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_audience_limit';
  if q = '((audiences IS NULL) OR private.is_staffish() OR private.task_outside_audience(id))' then
    alter policy tasks_audience_limit on public.tasks
    using ((audiences is null) or (select private.is_staffish()) or private.task_outside_audience(id));
  end if;

  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_retired_kept';
  if q = '((template_code IS NULL) OR (NOT private.template_code_retired(template_code)) OR private.is_admin() OR private.is_processor() OR ((status = ANY (ARRAY[''todo''::text, ''in_progress''::text, ''blocked''::text])) AND (owner_profile_id = ( SELECT private.effective_uid() AS uid))))' then
    alter policy tasks_retired_kept on public.tasks
    using (
      (template_code is null)
      or (not private.template_code_retired(template_code))
      or (select private.is_admin())
      or (select private.is_processor())
      or (
        status = any (array['todo', 'in_progress', 'blocked'])
        and owner_profile_id = (select private.effective_uid())
      )
    );
  end if;

  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_switch_hidden';
  if q = '((template_code IS NULL) OR private.task_enabled(template_code) OR private.is_admin())' then
    alter policy tasks_switch_hidden on public.tasks
    using ((template_code is null) or private.task_enabled(template_code) or (select private.is_admin()));
  end if;
end
$pol$;

do $post$
declare
  q text;
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'board_owner_names'
      and p.prosecdef and ('jit=off' = any (p.proconfig))
  ) then
    raise exception 'board_owner_names did not land';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'task_board'
      and position('board_owner_names' in p.prosrc) > 0
      and position('deal_contacts' in p.prosrc) = 0
  ) then
    raise exception 'task_board still calls deal_contacts';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'my_task_list'
      and position('board_owner_names' in p.prosrc) > 0
      and position('task_board(' in p.prosrc) = 0
  ) then
    raise exception 'my_task_list still reads the whole board before filtering';
  end if;
  if position('cla.effective_uid_for' in (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'effective_uid')) = 0 then
    raise exception 'effective_uid is not cached for the transaction';
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_audience_limit';
  if q ~* 'private\.is_staffish\(\)' and q !~* 'select[[:space:]]+private\.is_staffish\(\)' and q not like '%g.staffish%' then
    raise exception 'tasks_audience_limit still calls is_staffish() per row (%)', q;
  end if;
end
$post$;

commit;
