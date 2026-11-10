-- Rest reads that stayed slow after the one-pass file helpers.
-- task_templates select hashed a scan of every task, and each task re-ran
-- can_access_deal, task_visible, and the task demo lookup.
-- threads and thread_participants called thread_member, which called
-- can_access_deal plus three role helpers per row.
-- agent_parties called is_staffish and can_access_deal per self-rep row.
-- notifications compared profile_id to effective_uid() on every row.
-- documents select plans private.document_readable per row, and its demo
-- policy re-reads the deal under deals RLS (can_access_deal) per row.
-- activity_log does the same deals lookup per row. Both already proved the
-- viewer can see the row, so the flag can be read in one indexed lookup.
-- The document_readable body is unchanged. JIT on that body is turned off.
-- deal_cla_staff's email match is only used by message recipients, not by
-- these list policies. The lower(email) index keeps that match off a scan.
-- Task policy text is replaced by task_readable. The boolean is the same.
-- Rollback: supabase/rollbacks/20261111160000_rest_read_one_pass.sql
begin;
set local lock_timeout = '3s';

do $pre$
declare
  q text;
begin
  if to_regprocedure('private.reader_gate()') is null
     or to_regprocedure('private.reader_can_deal(uuid,uuid,text,boolean,uuid,boolean)') is null
     or to_regprocedure('private.document_readable(uuid)') is null
     or to_regprocedure('private.side_of(text)') is null
     or to_regprocedure('private.emd_receipt_title(text)') is null then
    raise exception 'drift: reader_gate, reader_can_deal, or document_readable is missing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'thread_member'
      and pg_get_function_identity_arguments(p.oid) = 't uuid'
      and p.prosecdef and p.provolatile = 's'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'a8da8cea27ae8b50daa9bfe6c04dcaa44bf29f6eb6244f708367d28921d77467'
  ) then
    raise exception 'drift: private.thread_member(uuid) is not the captured helper';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'rpc_agent_parties'
      and p.prosecdef
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '9411de256e3bc3b9ecdc35642c5b0406ad9a65dd938d6dd464922b15d85b129f'
  ) then
    raise exception 'drift: private.rpc_agent_parties() is not the captured helper';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'agent_parties'
      and not p.prosecdef
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '7be447e5f705b0f43193a12cb8f5f39989e35ca849b2cb3bf720cc55d8552203'
  ) then
    raise exception 'drift: public.agent_parties() is not the captured wrapper';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'task_outside_audience'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'b6bd93810743927fe633c5c084494bb3b1c3872a97a2b65d3cab709d5942a8c1'
  ) then
    raise exception 'drift: private.task_outside_audience(uuid) is not the captured helper';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'document_readable'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'ba16cbd650a3322dd0f300c09d1aa8cd0e3b8b390591e3cac8f712cc2c58b7fc'
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
  ) then
    raise exception 'drift: private.document_readable(uuid) is not the one-pass body';
  end if;

  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_select';
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from '7ea6d30b2ddcb2002f957c7d3a3c43d03739db8701b83b3fe3ab401ea8091263' then
    raise exception 'drift: tasks_select is not the captured policy';
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'task_templates' and policyname = 'templates_select';
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from '116357dac02c259b734e54371c8f9fc94f889aee631df5ac22c1798122c4f50d' then
    raise exception 'drift: templates_select is not the captured policy';
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_select';
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from 'fd5792e2a7b95e714246f4d595ff849fbab115ee71817bf8f0124a003aab1f02' then
    raise exception 'drift: notifications_select is not the captured policy';
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'threads' and policyname = 'threads_select';
  if q is distinct from 'private.thread_member(id)' then
    raise exception 'drift: threads_select is not private.thread_member(id)';
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'thread_participants' and policyname = 'tp_select';
  if q is distinct from 'private.thread_member(thread_id)' then
    raise exception 'drift: tp_select is not private.thread_member(thread_id)';
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'documents' and policyname = 'demo_scope';
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from '7885fcfbfbca1abe3892cc8e35b7edca4cee51566957f514f77084dfa4bc64b6' then
    raise exception 'drift: documents demo_scope hash %', encode(sha256(convert_to(coalesce(q, ''), 'UTF8')), 'hex');
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'activity_log' and policyname = 'demo_scope';
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from 'bdc443a3b47f0326ec5dfb465db42f2433e61a16f0a00956f7c22d33f5b11cac' then
    raise exception 'drift: activity_log demo_scope hash %', encode(sha256(convert_to(coalesce(q, ''), 'UTF8')), 'hex');
  end if;
end
$pre$;

create temp table _kept_pol on commit drop as
select tablename, policyname, cmd, permissive, roles::text as roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('tasks', 'threads', 'notifications', 'task_templates', 'documents', 'activity_log')
  and policyname not in (
    'tasks_select', 'demo_scope', 'tasks_audience_limit', 'tasks_retired_kept', 'tasks_switch_hidden',
    'templates_select', 'notifications_select'
  );

create or replace function private.deal_is_demo(p_deal uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $demo$
  select d.is_demo from public.deals d where d.id = p_deal
$demo$;

revoke all on function private.deal_is_demo(uuid) from public;
grant execute on function private.deal_is_demo(uuid) to authenticated;

create or replace function private.task_readable(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $task$
  with g as materialized (
    select * from private.reader_gate()
  ),
  one as (
    select t.* from public.tasks t where t.id = p_task
  ),
  calc as (
    select t.owner_profile_id, t.assigned_role, t.title, t.deal_id,
      case
        when g.role is null then '{}'::text[]
        when g.role <> 'Outside user' then array[g.role]::text[]
        else coalesce((
          select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
          from (
            select distinct p.role
            from public.deal_participants p
            join public.contacts c on c.id = p.contact_id
            where p.deal_id = t.deal_id
              and c.profile_id = g.uid
              and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
          ) x
        ), array['Outside user']::text[])
      end as roles,
      case
        when g.role is null then null::text
        when g.role <> 'Outside user' then g.role
        else coalesce((
          select p.role
          from public.deal_participants p
          join public.contacts c on c.id = p.contact_id
          where p.deal_id = t.deal_id
            and c.profile_id = g.uid
            and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
          order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], p.role)
          limit 1
        ), 'Outside user')
      end as one_role,
      case
        when g.role is distinct from 'Outside user' then 'staff'
        else (
          select case when count(distinct s) = 1 then max(s) end
          from (
            select private.side_of(r) as s
            from unnest(
              case
                when g.role is null then '{}'::text[]
                else coalesce((
                  select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
                  from (
                    select distinct p.role
                    from public.deal_participants p
                    join public.contacts c on c.id = p.contact_id
                    where p.deal_id = t.deal_id
                      and c.profile_id = g.uid
                      and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
                  ) x
                ), array['Outside user']::text[])
              end
            ) r
          ) q
          where s is not null
        )
      end as side
    from one t
    cross join g
  )
  select exists (
    select 1
    from calc t
    cross join g
    where (
        (g.active and (g.is_admin or coalesce(g.role in ('Processor', 'Sales Team', 'Transaction Coordinator'), false)))
        or private.reader_can_deal(t.deal_id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
      )
      and (
        g.staffish
        or t.owner_profile_id = g.uid
        or (t.owner_profile_id is null and t.assigned_role = any (t.roles))
        or (
          t.one_role in ('Buyer Agent', 'Listing Agent')
          and private.side_of(t.assigned_role) = private.side_of(t.one_role)
        )
      )
      and not (
        t.assigned_role = 'Client-Buyer'
        and private.emd_receipt_title(t.title)
        and g.uid is not null
        and not g.staffish
        and coalesce(t.side <> 'staff', false)
        and 'Client-Buyer' = any (t.roles)
        and not (t.roles && array['Buyer Agent', 'Listing Agent']::text[])
      )
  )
$task$;

revoke all on function private.task_readable(uuid) from public;
grant execute on function private.task_readable(uuid) to authenticated;

create or replace function private.task_outside_audience(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $aud$
  with g as materialized (
    select * from private.reader_gate()
  ),
  one as (
    select t.* from public.tasks t where t.id = p_task
  ),
  roles as (
    select case
      when g.role is null then '{}'::text[]
      when g.role <> 'Outside user' then array[g.role]::text[]
      else coalesce((
        select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
        from (
          select distinct p.role
          from public.deal_participants p
          join public.contacts c on c.id = p.contact_id
          where p.deal_id = t.deal_id
            and c.profile_id = g.uid
            and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
        ) x
      ), array['Outside user']::text[])
    end as roles
    from one t
    cross join g
  )
  select exists (
    select 1
    from one t
    cross join g
    cross join roles r
    where t.audiences is not null
      and (
        ('Client-Buyer' = any (r.roles) and 'buyer' = any (t.audiences)
          and (t.owner_profile_id = g.uid or (t.owner_profile_id is null and t.assigned_role = 'Client-Buyer'))
          and not (t.audiences = array['internal']::text[]))
        or ('Client-Seller' = any (r.roles) and 'seller' = any (t.audiences)
          and (t.owner_profile_id = g.uid or (t.owner_profile_id is null and t.assigned_role = 'Client-Seller'))
          and not (t.audiences = array['internal']::text[]))
        or ('Buyer Agent' = any (r.roles) and 'buyer_agent' = any (t.audiences))
        or ('Listing Agent' = any (r.roles) and 'listing_agent' = any (t.audiences))
      )
  )
$aud$;

create or replace function private.thread_member(t uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $thread$
  select exists (
    select 1
    from private.reader_gate() g
    join public.threads x on x.id = t
    where private.reader_can_deal(x.deal_id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
      and (
        g.is_processor
        or coalesce(g.role = 'Transaction Coordinator', false)
        or exists (
          select 1 from public.thread_participants tp
          where tp.thread_id = t and tp.profile_id = g.uid
        )
      )
  )
$thread$;

create or replace function private.rpc_agent_parties()
returns table (deal_id uuid, contact_id uuid, name text, label text)
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $party$
  with g as materialized (
    select * from private.reader_gate()
  )
  select a.deal_id,
         a.contact_id,
         trim(c.first_name || ' ' || c.last_name),
         case when a.role = 'Client-Buyer' then 'Buyer + Buyer''s Agent' else 'Seller + Listing Agent' end
  from g
  join public.deal_participants a on g.staffish
  join public.deal_participants b
    on b.deal_id = a.deal_id
   and b.contact_id = a.contact_id
   and private.self_rep_pair(a.role, b.role)
  join public.contacts c on c.id = a.contact_id
  where a.role in ('Client-Buyer', 'Client-Seller')
    and private.reader_can_deal(a.deal_id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
$party$;

alter function private.document_readable(uuid) set jit = off;

alter policy tasks_select on public.tasks
using (private.task_readable(id));

alter policy demo_scope on public.tasks
using (
  case
    when deal_id is null then not (select g.is_demo from private.reader_gate() g)
    else private.deal_is_demo(deal_id) = (select g.is_demo from private.reader_gate() g)
  end
)
with check (
  case
    when deal_id is null then not (select g.is_demo from private.reader_gate() g)
    else private.deal_is_demo(deal_id) = (select g.is_demo from private.reader_gate() g)
  end
);

alter policy tasks_audience_limit on public.tasks
using (
  audiences is null
  or (select g.staffish from private.reader_gate() g)
  or private.task_outside_audience(id)
);

alter policy tasks_retired_kept on public.tasks
using (
  template_code is null
  or (select g.is_admin or g.is_processor from private.reader_gate() g)
  or not private.template_code_retired(template_code)
  or (
    status = any (array['todo', 'in_progress', 'blocked'])
    and owner_profile_id = (select g.uid from private.reader_gate() g)
  )
);

alter policy tasks_switch_hidden on public.tasks
using (
  template_code is null
  or (select g.is_admin from private.reader_gate() g)
  or private.task_enabled(template_code)
);

alter policy templates_select on public.task_templates
using (
  (select g.is_admin or coalesce(g.role in ('Processor', 'Preprocessor', 'Transaction Coordinator'), false)
     from private.reader_gate() g)
  or id in (
    select t.template_id
    from public.tasks t
    where t.template_id is not null
      and private.task_readable(t.id)
  )
);

alter policy demo_scope on public.threads
using (
  case
    when deal_id is null then not (select g.is_demo from private.reader_gate() g)
    else private.deal_is_demo(deal_id) = (select g.is_demo from private.reader_gate() g)
  end
)
with check (
  case
    when deal_id is null then not (select g.is_demo from private.reader_gate() g)
    else private.deal_is_demo(deal_id) = (select g.is_demo from private.reader_gate() g)
  end
);

alter policy notifications_select on public.notifications
using (profile_id = (select g.uid from private.reader_gate() g));

alter policy demo_scope on public.documents
using (
  case
    when deal_id is null then not private.viewer_is_demo()
    else private.deal_is_demo(deal_id) = private.viewer_is_demo()
  end
)
with check (
  case
    when deal_id is null then not private.viewer_is_demo()
    else private.deal_is_demo(deal_id) = private.viewer_is_demo()
  end
);

alter policy demo_scope on public.activity_log
using (
  case
    when deal_id is null then not (select g.is_demo from private.reader_gate() g)
    else private.deal_is_demo(deal_id) = (select g.is_demo from private.reader_gate() g)
  end
)
with check (
  case
    when deal_id is null then not (select g.is_demo from private.reader_gate() g)
    else private.deal_is_demo(deal_id) = (select g.is_demo from private.reader_gate() g)
  end
);

alter policy demo_scope on public.notifications
using (
  case
    when deal_id is null then not (select g.is_demo from private.reader_gate() g)
    else (select d.is_demo from public.deals d where d.id = notifications.deal_id)
         = (select g.is_demo from private.reader_gate() g)
  end
)
with check (
  case
    when deal_id is null then not (select g.is_demo from private.reader_gate() g)
    else (select d.is_demo from public.deals d where d.id = notifications.deal_id)
         = (select g.is_demo from private.reader_gate() g)
  end
);

create index tasks_template_id_idx on public.tasks (template_id) where template_id is not null;
create index profiles_lower_email_idx on public.profiles (lower(email));

do $post$
declare
  q text;
begin
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_select';
  if q is distinct from 'private.task_readable(id)' then
    raise exception 'tasks_select did not land (%)', q;
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'thread_member'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'ba73f7e5dde123d6c3af688ca3330f795488671f366a9bfbd8112a4a068bc81e'
  ) then
    raise exception 'thread_member hash %',
      (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'thread_member' and pg_get_function_identity_arguments(p.oid) = 't uuid');
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'task_readable'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '9180cb5b66c2395787276f2e613c5838a31f2dd5086d66e50c57d1bfeecfdec7'
  ) then
    raise exception 'task_readable hash %',
      (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'task_readable');
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'rpc_agent_parties'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '11c24feec85d2e5f05cde98dd64a7b7d8677e2fb71938268fac9a043ed14b3a0'
  ) then
    raise exception 'rpc_agent_parties hash %',
      (select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'rpc_agent_parties');
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'document_readable'
      and not ('jit=off' = any (p.proconfig))
  ) then
    raise exception 'document_readable jit was not turned off';
  end if;
  if to_regclass('public.tasks_template_id_idx') is null
     or to_regclass('public.profiles_lower_email_idx') is null then
    raise exception 'a supporting index is missing';
  end if;
  if exists (
    select 1
    from _kept_pol b
    join pg_policies p
      on p.schemaname = 'public' and p.tablename = b.tablename and p.policyname = b.policyname
    where b.qual is distinct from p.qual
       or b.with_check is distinct from p.with_check
  ) then
    raise exception 'a policy outside this change was rewritten';
  end if;
end
$post$;

commit;
