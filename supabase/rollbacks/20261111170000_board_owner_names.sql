-- Restore the per-deal contact lookup, the uncached effective_uid, and the
-- bare helper calls in the three task policies when this migration wrapped them.
begin;
set local lock_timeout = '3s';

do $pre$
begin
  if to_regprocedure('private.board_owner_names(uuid[])') is null then
    raise exception 'drift: private.board_owner_names(uuid[]) is missing';
  end if;
  if position('cla.effective_uid_for' in (
    select p.prosrc from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'effective_uid'
  )) = 0 then
    raise exception 'drift: private.effective_uid() is not the cached body';
  end if;
end
$pre$;

create or replace function private.effective_uid() returns uuid
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select coalesce(
    (select s.target_id
       from private.view_as_sessions s
       join public.profiles a on a.id = s.actor_id
      where s.actor_id = auth.uid()
        and a.role = 'Super admin' and a.is_admin and a.status = 'active'
        and s.stopped_at is null
        and s.expires_at > pg_catalog.now()),
    auth.uid())
$$;

create or replace function public.task_board(p_file_status text default 'All')
returns table (
  id uuid, deal_id uuid, title text, description text, assigned_role text, status text, due_date date,
  completed_at timestamptz, completed_by uuid, kind text, participant_id uuid, owner_profile_id uuid,
  template_code text, template_version integer, created_at timestamptz,
  file_number text, street text, city text, state text, zip text, closing_date date, deal_status text,
  owner_name text, overdue boolean
)
language sql stable security invoker set search_path to pg_catalog, public, extensions as $board$
      -- task_board_one_contact_scan
      with board as (
        select t.id, t.deal_id, t.title, t.description, t.assigned_role, t.status, t.due_date, t.completed_at, t.completed_by,
               t.kind, t.participant_id, t.owner_profile_id, t.template_code, t.template_version, t.created_at,
               d.file_number, d.street, d.city, d.state, d.zip, d.closing_date, d.status as deal_status
        from public.tasks t
        join public.deals d on d.id = t.deal_id
        where coalesce(p_file_status, 'All') = 'All' or d.status = p_file_status
      ),
      names as (
        select picked.deal_id, picked.participant_id, picked.owner_name
        from (
          select files.deal_id, c.participant_id, trim(c.first_name || ' ' || c.last_name) as owner_name,
                 row_number() over (partition by files.deal_id, c.participant_id order by c.participant_id) as n
          from (select distinct board.deal_id from board) files
          cross join lateral public.deal_contacts(files.deal_id) c
          where c.participant_id is not null
        ) picked
        where picked.n = 1
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
language sql stable security invoker set search_path to pg_catalog, public, extensions as $mine$
  select b.*, case when private.is_staffish() then array[private.me_role()] else private.deal_roles(b.deal_id) end
  from public.task_board(coalesce(p_file_status, 'Open')) b
  where b.owner_profile_id = private.effective_uid()
     or (b.participant_id is null and (b.assigned_role = any (private.deal_roles(b.deal_id)) or (private.is_staffish() and b.assigned_role = private.me_role())))
  order by b.due_date nulls last, b.file_number, b.title $mine$;

do $pol$
declare
  q text;
begin
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_audience_limit';
  if q ~* 'select[[:space:]]+private\.is_staffish\(' and q not like '%g.staffish%' then
    alter policy tasks_audience_limit on public.tasks
    using (((audiences IS NULL) OR private.is_staffish() OR private.task_outside_audience(id)));
  end if;

  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_retired_kept';
  if q ~* 'select[[:space:]]+private\.is_admin\(' and q not like '%g.is_admin%' then
    alter policy tasks_retired_kept on public.tasks
    using (((template_code IS NULL) OR (NOT private.template_code_retired(template_code)) OR private.is_admin() OR private.is_processor() OR ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'blocked'::text])) AND (owner_profile_id = ( SELECT private.effective_uid() AS uid)))));
  end if;

  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_switch_hidden';
  if q ~* 'select[[:space:]]+private\.is_admin\(' and q not like '%g.is_admin%' then
    alter policy tasks_switch_hidden on public.tasks
    using (((template_code IS NULL) OR private.task_enabled(template_code) OR private.is_admin()));
  end if;
end
$pol$;

drop function if exists private.board_owner_names(uuid[]);

do $post$
begin
  if to_regprocedure('private.board_owner_names(uuid[])') is not null then
    raise exception 'rollback left private.board_owner_names(uuid[])';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'effective_uid'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '57c143b27533e4b6cf45156c0c04e4558ae16a9533892f921cdb284dde8061fe'
  ) then
    raise exception 'rollback did not restore private.effective_uid()';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'task_board'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '76c9c7bc2ff952cfe0a430fa4fe6ac7ef089c8501c89195d06b57d91a57d3ab0'
  ) then
    raise exception 'rollback did not restore public.task_board(text) %',
      (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'task_board');
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'my_task_list'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '803159c40df9be6088d6c48510e75017200f67d0d6d9d5acbeaa97e6a2f507f4'
  ) then
    raise exception 'rollback did not restore public.my_task_list(text) %',
      (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'my_task_list');
  end if;
end
$post$;

commit;
