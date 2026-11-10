-- Staff list reads were spending their time in per-row helper chains.
-- On TEST this morning, activity_log by deal averaged 666ms (a processor read of
-- 158 rows was 615ms while the pool was quiet). Each row called me_role,
-- is_staffish, is_admin, is_processor, can_access_deal, and viewer_is_demo,
-- and a document row could also call document_readable.
-- deal_file_titles and my_file_roles_full did the same walk once per deal.
-- deal_list_extras called deal_contacts once per deal and then counted tasks
-- under the task policies. The task policies themselves are not changed here:
-- client task visibility is a separate change. The overdue count still reads
-- public.tasks as the caller, so those policies stay the source of truth.
-- One security-definer read of the caller replaces the repeated profile lookups.
-- Rollback: supabase/rollbacks/20261111070000_staff_read_one_pass.sql
begin;
set local lock_timeout = '3s';

do $pre$
declare
  n int;
  q text;
  w text;
begin
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'activity_log';
  if n is distinct from 2 then
    raise exception 'drift: activity_log has % policies, expected 2', n;
  end if;

  select qual, with_check into q, w
  from pg_policies
  where schemaname = 'public' and tablename = 'activity_log' and policyname = 'activity_select';
  if q is null
     or encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from 'efeb63a1fc7073af07d5169e9c566b40ed5420fd045dba321f54dd87320b46ee'
     or w is not null then
    raise exception 'drift: activity_select is not the captured policy';
  end if;

  select qual, with_check into q, w
  from pg_policies
  where schemaname = 'public' and tablename = 'activity_log' and policyname = 'demo_scope';
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from 'bf39e3cc9c3c1e8c2d67a28d364d7fd28ed7234cbd566cd886e1766855ff4a7b'
     or encode(sha256(convert_to(w, 'UTF8')), 'hex') is distinct from 'bf39e3cc9c3c1e8c2d67a28d364d7fd28ed7234cbd566cd886e1766855ff4a7b' then
    raise exception 'drift: activity_log.demo_scope is not the captured policy';
  end if;

  if to_regprocedure('auth.uid()') is null
     or to_regprocedure('private.office_today()') is null
     or to_regprocedure('private.document_readable(uuid)') is null
     or to_regprocedure('private.thread_member(uuid)') is null
     or to_regclass('public.activity_log') is null
     or to_regclass('public.deals') is null
     or to_regclass('public.tasks') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.contacts') is null
     or to_regclass('public.deal_participants') is null
     or to_regclass('public.deal_sales_people') is null
     or to_regclass('private.view_as_sessions') is null then
    raise exception 'drift: a table or helper these reads use is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks'
      and column_name in ('deal_id', 'status', 'due_date')
    having count(*) = 3
  ) then
    raise exception 'drift: tasks is missing deal_id, status, or due_date';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deal_participants' and column_name = 'role'
  ) then
    raise exception 'drift: deal_participants.role is missing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'deal_file_titles'
      and pg_get_function_identity_arguments(p.oid) = 'p_deal uuid'
      and pg_get_function_result(p.oid) = 'TABLE(deal_id uuid, file_title text)'
      and p.provolatile = 's' and not p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and pg_get_expr(p.proargdefaults, 0) = 'NULL::uuid'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'af420f7927c8dcda5d4fea12bf32259ecfa9ca7b2f6cb6ad6b40e2c0c301d68d'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'drift: public.deal_file_titles(uuid) is not the captured helper';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'deal_list_extras'
      and pg_get_function_identity_arguments(p.oid) = ''
      and pg_get_function_result(p.oid) = 'TABLE(deal_id uuid, party_names text[], overdue_tasks integer)'
      and p.provolatile = 's' and not p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '2276decea539fd72a3eede982f9d432ff7d6375ae7f4a37dae8dd65a06c4c77e'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'drift: public.deal_list_extras() is not the captured helper';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'rpc_my_file_roles_full'
      and pg_get_function_identity_arguments(p.oid) = ''
      and pg_get_function_result(p.oid) = 'TABLE(deal_id uuid, role text, roles text[], label text, self_rep boolean)'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'efcdbe573b075ebc7c7a3b021681fb46db1726691bb0530c078a94a07a5330f1'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'drift: private.rpc_my_file_roles_full() is not the captured helper';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'my_file_roles_full'
      and pg_get_function_identity_arguments(p.oid) = ''
      and not p.prosecdef
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '8fdfc76a02f8dd31cceab98281cda43070284530a3efeaa50c191cc24f49209f'
  ) then
    raise exception 'drift: public.my_file_roles_full() is not the captured wrapper';
  end if;
end
$pre$;

create temp table _task_pol on commit drop as
select policyname, cmd, permissive, roles::text as roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'tasks';

create or replace function private.reader_gate()
returns table (
  uid uuid,
  role text,
  active boolean,
  is_admin boolean,
  staffish boolean,
  is_processor boolean,
  is_demo boolean,
  contact_id uuid
)
language sql
stable
security definer
rows 1
set search_path to pg_catalog, public, extensions
set jit = off
as $gate$
  select v.uid,
         case when p.status = 'active' then p.role else null end,
         coalesce(p.status = 'active' and p.role is not null, false),
         coalesce(p.status = 'active' and p.is_admin, false),
         coalesce(p.status = 'active' and (p.is_admin or p.role in (
           'Processor', 'Preprocessor', 'Sales Person', 'Sales Team',
           'Transaction Coordinator', 'Admin', 'Super admin')), false),
         coalesce(p.status = 'active' and (p.is_admin or p.role in ('Processor', 'Preprocessor')), false),
         coalesce(p.status = 'active' and p.is_demo, false),
         c.id
  from (
    select coalesce(
      (select s.target_id
         from private.view_as_sessions s
         join public.profiles a on a.id = s.actor_id
        where s.actor_id = auth.uid()
          and a.role = 'Super admin' and a.is_admin and a.status = 'active'
          and s.stopped_at is null
          and s.expires_at > pg_catalog.now()),
      auth.uid()
    ) as uid
  ) v
  left join public.profiles p on p.id = v.uid
  left join public.contacts c on c.profile_id = v.uid
$gate$;

create or replace function private.reader_can_deal(
  p_deal uuid,
  p_uid uuid,
  p_role text,
  p_admin boolean,
  p_contact uuid,
  p_active boolean
) returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $can$
  select coalesce(p_active, false) and (
    coalesce(p_admin, false)
    or coalesce(p_role in ('Processor', 'Sales Team', 'Transaction Coordinator'), false)
    or (p_role = 'Preprocessor' and exists (
          select 1 from public.deals x where x.id = p_deal and x.preprocessor_user_id = p_uid))
    or (p_role in ('Sales Person', 'Sales Team') and exists (
          select 1 from public.deal_sales_people s where s.deal_id = p_deal and s.sales_id = p_uid))
    or exists (
          select 1 from public.deal_participants p
          where p.deal_id = p_deal and p.contact_id = p_contact)
  )
$can$;

revoke all on function private.reader_gate() from public;
revoke all on function private.reader_can_deal(uuid, uuid, text, boolean, uuid, boolean) from public;
grant execute on function private.reader_gate() to authenticated;
grant execute on function private.reader_can_deal(uuid, uuid, text, boolean, uuid, boolean) to authenticated;

alter policy activity_select on public.activity_log
using (
  (select g.active and g.staffish from private.reader_gate() g)
  and (
    (select g.is_admin from private.reader_gate() g)
    or (
      (
        (deal_id is null and (select g.is_processor from private.reader_gate() g))
        or (
          deal_id is not null
          and private.reader_can_deal(
            deal_id,
            (select g.uid from private.reader_gate() g),
            (select g.role from private.reader_gate() g),
            (select g.is_admin from private.reader_gate() g),
            (select g.contact_id from private.reader_gate() g),
            (select g.active from private.reader_gate() g)
          )
        )
      )
      and (
        (select g.is_processor from private.reader_gate() g)
        or entity is null
        or entity_id is null
        or (entity = 'document' and private.document_readable(entity_id))
        or (entity = 'thread' and private.thread_member(entity_id))
        or (entity <> all (array['document'::text, 'thread'::text]))
      )
    )
  )
);

alter policy demo_scope on public.activity_log
using (
  case
    when deal_id is null then not (select g.is_demo from private.reader_gate() g)
    else (select d.is_demo from public.deals d where d.id = activity_log.deal_id)
         = (select g.is_demo from private.reader_gate() g)
  end
)
with check (
  case
    when deal_id is null then not (select g.is_demo from private.reader_gate() g)
    else (select d.is_demo from public.deals d where d.id = activity_log.deal_id)
         = (select g.is_demo from private.reader_gate() g)
  end
);

create or replace function private.deal_party_names()
returns table (deal_id uuid, party_names text[])
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $names$
  with g as materialized (
    select * from private.reader_gate()
  ),
  visible as (
    select d.id
    from public.deals d
    cross join g
    where d.is_demo = g.is_demo
      and private.reader_can_deal(d.id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
  ),
  roles as (
    select v.id as deal_id,
      case
        when g.role is null then '{}'::text[]
        when g.role <> 'Outside user' then array[g.role]::text[]
        else coalesce((
          select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
          from (
            select distinct p.role
            from public.deal_participants p
            join public.contacts c on c.id = p.contact_id
            where p.deal_id = v.id
              and c.profile_id = g.uid
              and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
          ) x
        ), array['Outside user']::text[])
      end as roles
    from visible v
    cross join g
  ),
  shaped as (
    select r.deal_id,
      r.roles,
      case
        when g.role is null then null::text
        when g.role <> 'Outside user' then g.role
        else coalesce(r.roles[1], 'Outside user')
      end as deal_role,
      case
        when g.role is distinct from 'Outside user' then 'staff'
        else (
          select case when count(distinct s) = 1 then max(s) end
          from (
            select case ur
              when 'Buyer Agent' then 'buyer'
              when 'Client-Buyer' then 'buyer'
              when 'Listing Agent' then 'seller'
              when 'Client-Seller' then 'seller'
            end as s
            from unnest(r.roles) ur
          ) q
          where s is not null
        )
      end as side
    from roles r
    cross join g
  ),
  flags as (
    select s.deal_id, s.deal_role,
      (g.uid is not null and not g.staffish and coalesce(s.side <> 'staff', false)
        and 'Client-Buyer' = any (s.roles)
        and not (s.roles && array['Buyer Agent', 'Listing Agent']::text[])) as pure_buyer,
      (g.uid is not null and not g.staffish and coalesce(s.side <> 'staff', false)
        and 'Client-Seller' = any (s.roles)
        and not ('Client-Buyer' = any (s.roles))
        and not (s.roles && array['Buyer Agent', 'Listing Agent']::text[])) as pure_seller
    from shaped s
    cross join g
  )
  select f.deal_id,
         coalesce(array_agg(distinct trim(c.first_name || ' ' || c.last_name)), '{}'::text[])
  from flags f
  join public.deal_participants dp on dp.deal_id = f.deal_id
  join public.contacts c on c.id = dp.contact_id
  where not (
      f.deal_role in ('Client-Buyer', 'Client-Seller')
      and dp.role like 'Client-%'
      and dp.role <> f.deal_role
    )
    and not (dp.role = 'Listing Agent' and f.pure_buyer)
    and not (dp.role = 'Buyer Agent' and f.pure_seller)
  group by f.deal_id
$names$;

revoke all on function private.deal_party_names() from public;
grant execute on function private.deal_party_names() to authenticated;

create or replace function public.deal_list_extras()
returns table (deal_id uuid, party_names text[], overdue_tasks integer)
language sql
stable
security invoker
set search_path to pg_catalog, public, extensions
set jit = off
as $extras$
  select d.id,
         coalesce(n.party_names, '{}'::text[]),
         coalesce(o.overdue_tasks, 0)
  from public.deals d
  left join private.deal_party_names() n on n.deal_id = d.id
  left join (
    select t.deal_id, count(*)::int as overdue_tasks
    from public.tasks t
    where t.status in ('todo', 'in_progress', 'blocked')
      and t.due_date < private.office_today()
    group by t.deal_id
  ) o on o.deal_id = d.id
$extras$;

create or replace function public.deal_file_titles(p_deal uuid default null)
returns table (deal_id uuid, file_title text)
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $titles$
  with g as materialized (
    select * from private.reader_gate()
  ),
  visible as (
    select d.id
    from public.deals d
    cross join g
    where (p_deal is null or d.id = p_deal)
      and d.is_demo = g.is_demo
      and private.reader_can_deal(d.id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
  ),
  file_role as (
    select v.id as deal_id,
      case
        when g.role is distinct from 'Outside user' then g.role
        else coalesce((
          select p.role
          from public.deal_participants p
          join public.contacts c on c.id = p.contact_id
          where p.deal_id = v.id
            and c.profile_id = g.uid
            and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
          order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], p.role)
          limit 1
        ), 'Outside user')
      end as deal_role
    from visible v
    cross join g
  ),
  people as (
    select fr.deal_id,
           dp.role,
           coalesce(nullif(trim(c.last_name), ''), trim(c.first_name)) as n,
           dp.created_at,
           dp.id
    from file_role fr
    join public.deal_participants dp on dp.deal_id = fr.deal_id
    join public.contacts c on c.id = dp.contact_id
    where dp.role in ('Client-Buyer', 'Client-Seller')
      and not (
        fr.deal_role in ('Client-Buyer', 'Client-Seller')
        and dp.role like 'Client-%'
        and dp.role <> fr.deal_role
      )
  ),
  grouped as (
    select deal_id, role, n, min(created_at) as m, min(id::text) as i
    from people
    where coalesce(n, '') <> ''
    group by deal_id, role, n
  )
  select v.id,
         concat_ws(' / ',
           (select string_agg(gr.n, ' & ' order by gr.m, gr.i) from grouped gr where gr.deal_id = v.id and gr.role = 'Client-Buyer'),
           (select string_agg(gr.n, ' & ' order by gr.m, gr.i) from grouped gr where gr.deal_id = v.id and gr.role = 'Client-Seller'))
  from visible v
$titles$;

create or replace function private.rpc_my_file_roles_full()
returns table (deal_id uuid, role text, roles text[], label text, self_rep boolean)
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $roles$
  with g as materialized (
    select * from private.reader_gate()
  ),
  visible as (
    select d.id
    from public.deals d
    cross join g
    where private.reader_can_deal(d.id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
  ),
  roles as (
    select v.id as deal_id,
      case
        when g.role is null then '{}'::text[]
        when g.role <> 'Outside user' then array[g.role]::text[]
        else coalesce((
          select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
          from (
            select distinct p.role
            from public.deal_participants p
            join public.contacts c on c.id = p.contact_id
            where p.deal_id = v.id
              and c.profile_id = g.uid
              and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
          ) x
        ), array['Outside user']::text[])
      end as roles
    from visible v
    cross join g
  )
  select r.deal_id,
         case
           when g.role is null then null::text
           when g.role <> 'Outside user' then g.role
           else coalesce(r.roles[1], 'Outside user')
         end,
         case when g.role is null then '{}'::text[] else r.roles end,
         case
           when r.roles @> array['Client-Buyer', 'Buyer Agent']::text[] then 'Buyer + Buyer''s Agent'
           when r.roles @> array['Client-Seller', 'Listing Agent']::text[] then 'Seller + Listing Agent'
           else coalesce(r.roles[1], 'Outside user')
         end,
         coalesce(cardinality(r.roles) = 2 and (
           (r.roles[1] = 'Client-Buyer' and r.roles[2] = 'Buyer Agent')
           or (r.roles[1] = 'Buyer Agent' and r.roles[2] = 'Client-Buyer')
           or (r.roles[1] = 'Client-Seller' and r.roles[2] = 'Listing Agent')
           or (r.roles[1] = 'Listing Agent' and r.roles[2] = 'Client-Seller')
         ), false)
  from roles r
  cross join g
  where g.active
$roles$;

create index tasks_open_due_idx
  on public.tasks (deal_id, due_date)
  where status in ('todo', 'in_progress', 'blocked');

create index deal_participants_deal_role_idx
  on public.deal_participants (deal_id, role);

do $post$
declare
  n int;
  q text;
begin
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'activity_log';
  if n is distinct from 2 then
    raise exception 'drift: activity_log policy count changed to %', n;
  end if;

  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'activity_log' and policyname = 'activity_select';
  if q is null or position('private.reader_gate()' in q) = 0 or position('private.me_role()' in q) > 0 then
    raise exception 'drift: activity_select did not land on reader_gate';
  end if;
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from '6c1322518d3c2f594a88ab0c278afba1eab89869ef437e89e9d83156d9fe9d5d' then
    raise exception 'drift: activity_select qual hash is %', encode(sha256(convert_to(q, 'UTF8')), 'hex');
  end if;

  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'activity_log' and policyname = 'demo_scope';
  if q is null or position('private.reader_gate()' in q) = 0 or position('private.viewer_is_demo()' in q) > 0 then
    raise exception 'drift: activity demo_scope did not land on reader_gate';
  end if;
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from 'bdc443a3b47f0326ec5dfb465db42f2433e61a16f0a00956f7c22d33f5b11cac' then
    raise exception 'drift: activity demo_scope qual hash is %', encode(sha256(convert_to(q, 'UTF8')), 'hex');
  end if;

  if exists (
    select 1
    from _task_pol b
    full join (
      select policyname, cmd, permissive, roles::text as roles, qual, with_check
      from pg_policies
      where schemaname = 'public' and tablename = 'tasks'
    ) p using (policyname)
    where b.policyname is null or p.policyname is null
       or b.cmd is distinct from p.cmd
       or b.permissive is distinct from p.permissive
       or b.roles is distinct from p.roles
       or b.qual is distinct from p.qual
       or b.with_check is distinct from p.with_check
  ) then
    raise exception 'drift: a tasks policy changed';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'my_file_roles_full'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '8fdfc76a02f8dd31cceab98281cda43070284530a3efeaa50c191cc24f49209f'
  ) then
    raise exception 'drift: my_file_roles_full wrapper changed';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'reader_gate'
      and p.prosecdef and p.provolatile = 's'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '30ac3fe1f6a075e069c71fe9357d0e91a796a3b7587da27eb07d60cda385d716'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.reader_gate() did not land (%)',
      (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'reader_gate');
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'reader_can_deal'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'c8148d2959937fb7c7f2fcdb4872f5ad4017af3bd38c7b8222084ec029564745'
  ) then
    raise exception 'private.reader_can_deal hash %',
      (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'reader_can_deal');
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'deal_party_names'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '5573a34400355960cdab99e233283f3efb596c868ef53309a9fdea796f2a2c20'
  ) then
    raise exception 'private.deal_party_names hash %',
      (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'deal_party_names');
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'deal_list_extras'
      and not p.prosecdef
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'dcf915bf6bf47e69517549d544cf9d0369a0e04cc84939701ec540b91e2f0605'
  ) then
    raise exception 'public.deal_list_extras hash %',
      (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'deal_list_extras');
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'deal_file_titles'
      and p.prosecdef
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'bd1393140d21f6a345163c1d2e3fc172647e55b35dd3263a9c751a5bd5b8866d'
  ) then
    raise exception 'public.deal_file_titles hash %',
      (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'deal_file_titles');
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'rpc_my_file_roles_full'
      and p.prosecdef
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '7872f74a11f320e9539cbaa197c558ca52167d0325d757a3d6489bcc0f78e294'
  ) then
    raise exception 'private.rpc_my_file_roles_full hash %',
      (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'rpc_my_file_roles_full');
  end if;

  if to_regclass('public.tasks_open_due_idx') is null
     or to_regclass('public.deal_participants_deal_role_idx') is null then
    raise exception 'drift: a supporting index is missing';
  end if;
end
$post$;

commit;
