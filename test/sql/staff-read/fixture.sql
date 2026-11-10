-- Throwaway catalog for the staff read one-pass. No hosted database.
create schema if not exists auth;
create schema if not exists private;
create schema if not exists extensions;

create role authenticated nologin;
create role anon nologin;
grant authenticated to postgres;
grant usage on schema private to authenticated;

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create table public.profiles (
  id uuid primary key,
  role text,
  status text,
  is_admin boolean not null default false,
  is_demo boolean not null default false
);
create table public.contacts (
  id uuid primary key,
  profile_id uuid unique,
  first_name text not null default '',
  last_name text not null default '',
  company text not null default '',
  email text not null default '',
  phone text not null default ''
);
create table public.deals (
  id uuid primary key,
  is_demo boolean not null default false,
  preprocessor_user_id uuid
);
create table public.deal_sales_people (
  deal_id uuid not null,
  sales_id uuid not null,
  primary key (deal_id, sales_id)
);
create table public.deal_participants (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null,
  contact_id uuid not null,
  role text not null,
  created_at timestamptz not null default now()
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid,
  owner_profile_id uuid,
  assigned_role text,
  title text,
  audiences text[],
  template_code text,
  status text,
  due_date date
);
create table public.task_template_switches (
  code text primary key,
  enabled boolean not null
);
create table public.task_templates (
  code text not null,
  version integer not null,
  retired_at timestamptz,
  primary key (code, version)
);
create table public.documents (
  id uuid primary key,
  name text not null
);
create table public.threads (
  id uuid primary key,
  deal_id uuid
);
create table public.thread_participants (
  thread_id uuid,
  profile_id uuid
);
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid,
  actor_id uuid,
  action text not null default 'note.added',
  entity text,
  entity_id uuid,
  detail text,
  created_at timestamptz not null default now()
);
create table private.view_as_sessions (
  actor_id uuid not null,
  target_id uuid not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  stopped_at timestamptz
);
create table public.viewer_case (
  id uuid primary key,
  label text not null
);

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
create or replace function private.me_role() returns text
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select role from public.profiles where id = private.effective_uid() and status = 'active'
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select coalesce((select is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false)
$$;
create or replace function private.is_staffish() returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'), false)
$$;
create or replace function private.is_processor() returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor'), false) or private.is_admin()
$$;
create or replace function private.viewer_is_demo() returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select coalesce((select p.is_demo from public.profiles p where p.id = private.effective_uid() and p.status = 'active'), false)
$$;
create or replace function private.my_contact_id() returns uuid
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select id from public.contacts where profile_id = private.effective_uid()
$$;
create or replace function private.office_today() returns date
language sql stable set search_path to pg_catalog, public, extensions as $$
  select (now() at time zone 'America/New_York')::date
$$;
create or replace function private.can_access_deal(d uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select private.me_role() is not null and (
    private.is_admin() or private.me_role() in ('Processor', 'Sales Team', 'Transaction Coordinator')
    or (private.me_role() = 'Preprocessor' and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid()))
    or (private.me_role() in ('Sales Person', 'Sales Team') and exists (select 1 from public.deal_sales_people s where s.deal_id = d and s.sales_id = private.effective_uid()))
    or exists (select 1 from public.deal_participants p where p.deal_id = d and p.contact_id = private.my_contact_id()))
$$;
create or replace function private.file_roles_of(pid uuid, d uuid) returns text[]
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select case when pr.role is null then '{}'::text[] when pr.role <> 'Outside user' then array[pr.role]
    else coalesce((select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
                   from (select distinct p.role from public.deal_participants p join public.contacts c on c.id = p.contact_id
                         where p.deal_id = d and c.profile_id = pid and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')) x), array['Outside user']) end
  from (select (select role from public.profiles where id = pid) as role) pr
$$;
create or replace function private.file_role_of(pid uuid, d uuid) returns text
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select case when pr.role is distinct from 'Outside user' then pr.role
    else coalesce((select p.role from public.deal_participants p join public.contacts c on c.id = p.contact_id
                   where p.deal_id = d and c.profile_id = pid and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
                   order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], p.role) limit 1), 'Outside user') end
  from (select (select role from public.profiles where id = pid) as role) pr
$$;
create or replace function private.deal_role(d uuid) returns text
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select case when private.me_role() is null then null when private.me_role() <> 'Outside user' then private.me_role() else private.file_role_of(private.effective_uid(), d) end
$$;
create or replace function private.deal_roles(d uuid) returns text[]
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select case when private.me_role() is null then '{}'::text[] else private.file_roles_of(private.effective_uid(), d) end
$$;
create or replace function private.role_text(roles text[]) returns text
language sql immutable set search_path to pg_catalog, public, extensions as $$
  select case when roles @> array['Client-Buyer', 'Buyer Agent'] then 'Buyer + Buyer''s Agent'
              when roles @> array['Client-Seller', 'Listing Agent'] then 'Seller + Listing Agent'
              else coalesce(roles[1], 'Outside user') end
$$;
create or replace function private.self_rep_pair(a text, b text) returns boolean
language sql immutable set search_path to pg_catalog, public, extensions as $$
  select (a = 'Client-Buyer' and b = 'Buyer Agent') or (a = 'Buyer Agent' and b = 'Client-Buyer')
      or (a = 'Client-Seller' and b = 'Listing Agent') or (a = 'Listing Agent' and b = 'Client-Seller')
$$;
create or replace function private.side_of(r text) returns text
language sql immutable set search_path to pg_catalog, public, extensions as $$
  select case r when 'Buyer Agent' then 'buyer' when 'Client-Buyer' then 'buyer' when 'Listing Agent' then 'seller' when 'Client-Seller' then 'seller' end
$$;
create or replace function private.person_side(pid uuid, d uuid) returns text
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select case when (select role from public.profiles where id = pid) is distinct from 'Outside user' then 'staff'
    else (select case when count(distinct s) = 1 then max(s) end from (select private.side_of(r) s from unnest(private.file_roles_of(pid, d)) r) x where s is not null) end
$$;
create or replace function private.my_side(d uuid) returns text
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select case when private.is_staffish() then 'staff' else private.person_side(private.effective_uid(), d) end
$$;
create or replace function private.person_pure_buyer(pid uuid, d uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select pid is not null and d is not null and coalesce(private.person_side(pid, d) <> 'staff', false)
     and 'Client-Buyer' = any (private.file_roles_of(pid, d)) and not (private.file_roles_of(pid, d) && array['Buyer Agent', 'Listing Agent'])
$$;
create or replace function private.person_pure_seller(pid uuid, d uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select pid is not null and d is not null and coalesce(private.person_side(pid, d) <> 'staff', false)
     and 'Client-Seller' = any (private.file_roles_of(pid, d)) and not ('Client-Buyer' = any (private.file_roles_of(pid, d)))
     and not (private.file_roles_of(pid, d) && array['Buyer Agent', 'Listing Agent'])
$$;
create or replace function private.is_pure_buyer(d uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select private.effective_uid() is not null and not private.is_staffish() and private.person_pure_buyer(private.effective_uid(), d)
$$;
create or replace function private.is_pure_seller(d uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select private.effective_uid() is not null and not private.is_staffish() and private.person_pure_seller(private.effective_uid(), d)
$$;
create or replace function private.emd_receipt_title(t text) returns boolean
language sql immutable set search_path to pg_catalog, public, extensions as $$
  select coalesce(t, '') ~* 'earnest money deposit receipt'
$$;
create or replace function private.task_visible(owner uuid, assigned text, d uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select private.is_staffish() or owner = private.effective_uid()
      or (owner is null and assigned = any (private.deal_roles(d)))
      or (private.deal_role(d) in ('Buyer Agent', 'Listing Agent') and private.side_of(assigned) = private.side_of(private.deal_role(d)))
$$;
create or replace function private.task_enabled(p_code text) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select coalesce((select enabled from public.task_template_switches where code = p_code), true)
$$;
create or replace function private.template_code_retired(p_code text) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select exists (select 1 from public.task_templates t where t.code = p_code and t.retired_at is not null
    and t.version = (select max(version) from public.task_templates where code = p_code))
$$;
create or replace function private.task_outside_audience(p_task uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select exists (select 1 from public.tasks t where t.id = p_task and t.audiences is not null and (
    ('Client-Buyer' = any (private.deal_roles(t.deal_id)) and 'buyer' = any (t.audiences) and (t.owner_profile_id = (select private.effective_uid()) or (t.owner_profile_id is null and t.assigned_role = 'Client-Buyer')) and not (t.audiences = array['internal']::text[]))
    or ('Client-Seller' = any (private.deal_roles(t.deal_id)) and 'seller' = any (t.audiences) and (t.owner_profile_id = (select private.effective_uid()) or (t.owner_profile_id is null and t.assigned_role = 'Client-Seller')) and not (t.audiences = array['internal']::text[]))
    or ('Buyer Agent' = any (private.deal_roles(t.deal_id)) and 'buyer_agent' = any (t.audiences))
    or ('Listing Agent' = any (private.deal_roles(t.deal_id)) and 'listing_agent' = any (t.audiences))))
$$;
create or replace function private.document_readable(doc uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select coalesce((select d.name is distinct from 'hidden' from public.documents d where d.id = doc), false)
$$;
create or replace function private.thread_member(t uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select exists (select 1 from public.thread_participants tp where tp.thread_id = t and tp.profile_id = private.effective_uid())
$$;

create or replace function private.rpc_deal_contacts(p_deal uuid)
returns table (participant_id uuid, deal_id uuid, contact_id uuid, role text, profile_id uuid, first_name text, last_name text, company text, email text, phone text, contact_hidden boolean)
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  with deal as materialized (
    select private.can_access_deal(p_deal) as can_access,
           private.deal_role(p_deal) as deal_role,
           private.is_pure_buyer(p_deal) as pure_buyer,
           private.is_pure_seller(p_deal) as pure_seller,
           private.is_staffish() as staffish,
           private.my_contact_id() as my_contact,
           private.my_side(p_deal) as my_side
  )
  select dp.id, dp.deal_id, c.id, dp.role, c.profile_id, c.first_name, c.last_name, c.company,
    case when h then '' else c.email end, case when h then '' else c.phone end, h
  from deal
  join public.deal_participants dp on dp.deal_id = p_deal
  join public.contacts c on c.id = dp.contact_id
  cross join lateral (
    select not (
      deal.staffish
      or c.id = deal.my_contact
      or private.side_of(dp.role) is null
      or private.side_of(dp.role) = deal.my_side
    ) as h
  ) z
  where deal.can_access
    and not (deal.deal_role in ('Client-Buyer', 'Client-Seller') and dp.role like 'Client-%' and dp.role <> deal.deal_role)
    and not (dp.role = 'Listing Agent' and deal.pure_buyer)
    and not (dp.role = 'Buyer Agent' and deal.pure_seller)
  order by dp.ctid
$$;
create or replace function public.deal_contacts(p_deal uuid)
returns table (participant_id uuid, deal_id uuid, contact_id uuid, role text, profile_id uuid, first_name text, last_name text, company text, email text, phone text, contact_hidden boolean)
language plpgsql stable security invoker set search_path to pg_catalog, public, extensions as $$
begin
  return query select * from private.rpc_deal_contacts(p_deal);
end
$$;
create or replace function private.file_title(p_deal uuid) returns text
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  with c as (select dc.role, coalesce(nullif(trim(dc.last_name), ''), trim(dc.first_name)) n, dp.created_at, dp.id
             from public.deal_contacts(p_deal) dc join public.deal_participants dp on dp.id = dc.participant_id
             where dc.role in ('Client-Buyer', 'Client-Seller')),
       g as (select role, n, min(created_at) m, min(id::text) i from c where coalesce(n, '') <> '' group by role, n)
  select concat_ws(' / ', (select string_agg(n, ' & ' order by m, i) from g where role = 'Client-Buyer'),
                          (select string_agg(n, ' & ' order by m, i) from g where role = 'Client-Seller'))
$$;

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

create or replace function public.my_file_roles_full()
returns table (deal_id uuid, role text, roles text[], label text, self_rep boolean)
language plpgsql stable security invoker set search_path to pg_catalog, public, extensions as $fn$ BEGIN RETURN QUERY SELECT * FROM private.rpc_my_file_roles_full(); END; $fn$;

revoke all on function public.deal_file_titles(uuid) from public;
revoke all on function public.deal_list_extras() from public;
revoke all on function public.my_file_roles_full() from public;
revoke all on function private.rpc_my_file_roles_full() from public;
grant execute on function public.deal_file_titles(uuid) to authenticated;
grant execute on function public.deal_list_extras() to authenticated;
grant execute on function public.my_file_roles_full() to authenticated;
grant execute on function private.rpc_my_file_roles_full() to authenticated;
grant execute on function public.deal_contacts(uuid) to authenticated;
grant execute on function private.file_title(uuid) to authenticated;
grant execute on function private.rpc_deal_contacts(uuid) to authenticated;
grant execute on function private.office_today() to authenticated;
grant execute on function private.can_access_deal(uuid) to authenticated;
grant execute on function private.document_readable(uuid) to authenticated;
grant execute on function private.thread_member(uuid) to authenticated;
grant execute on function private.me_role() to authenticated;
grant execute on function private.is_staffish() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_processor() to authenticated;
grant execute on function private.viewer_is_demo() to authenticated;
grant execute on function private.task_visible(uuid, text, uuid) to authenticated;
grant execute on function private.task_enabled(text) to authenticated;
grant execute on function private.template_code_retired(text) to authenticated;
grant execute on function private.task_outside_audience(uuid) to authenticated;
grant execute on function private.emd_receipt_title(text) to authenticated;
grant execute on function private.is_pure_buyer(uuid) to authenticated;
grant execute on function private.effective_uid() to authenticated;

grant select on public.profiles, public.contacts, public.deals, public.deal_sales_people, public.deal_participants,
  public.tasks, public.task_template_switches, public.task_templates, public.documents, public.threads,
  public.thread_participants, public.activity_log to authenticated;

alter table public.deals enable row level security;
alter table public.tasks enable row level security;
alter table public.activity_log enable row level security;

create policy deals_select on public.deals for select to authenticated
using ((select ((private.me_role() is not null) and (private.is_admin() or (private.me_role() = any (array['Processor'::text, 'Sales Team'::text, 'Transaction Coordinator'::text]))))) or private.can_access_deal(id));
create policy demo_scope on public.deals as restrictive for all to authenticated
using (is_demo = (select private.viewer_is_demo()))
with check (is_demo = (select private.viewer_is_demo()));

create policy tasks_select on public.tasks for select to authenticated
using (((select ((private.me_role() is not null) and (private.is_admin() or (private.me_role() = any (array['Processor'::text, 'Sales Team'::text, 'Transaction Coordinator'::text]))))) or private.can_access_deal(deal_id)) and ((select private.is_staffish()) or private.task_visible(owner_profile_id, assigned_role, deal_id)) and (not ((assigned_role = 'Client-Buyer'::text) and private.emd_receipt_title(title) and private.is_pure_buyer(deal_id))));
create policy demo_scope on public.tasks as restrictive for all to authenticated
using (case when deal_id is null then not (select private.viewer_is_demo()) else ((select d.is_demo from public.deals d where d.id = tasks.deal_id) = (select private.viewer_is_demo())) end)
with check (case when deal_id is null then not (select private.viewer_is_demo()) else ((select d.is_demo from public.deals d where d.id = tasks.deal_id) = (select private.viewer_is_demo())) end);
create policy tasks_audience_limit on public.tasks as restrictive for select to authenticated
using ((audiences is null) or private.is_staffish() or private.task_outside_audience(id));
create policy tasks_retired_kept on public.tasks as restrictive for select to authenticated
using ((template_code is null) or (not private.template_code_retired(template_code)) or private.is_admin() or private.is_processor() or ((status = any (array['todo'::text, 'in_progress'::text, 'blocked'::text])) and (owner_profile_id = (select private.effective_uid()))));
create policy tasks_switch_hidden on public.tasks as restrictive for select to authenticated
using ((template_code is null) or private.task_enabled(template_code) or private.is_admin());

create policy activity_select on public.activity_log for select to authenticated
using (((private.me_role() IS NOT NULL) AND private.is_staffish() AND (private.is_admin() OR ((((deal_id IS NULL) AND private.is_processor()) OR ((deal_id IS NOT NULL) AND private.can_access_deal(deal_id))) AND (private.is_processor() OR (entity IS NULL) OR (entity_id IS NULL) OR ((entity = 'document'::text) AND private.document_readable(entity_id)) OR ((entity = 'thread'::text) AND private.thread_member(entity_id)) OR (entity <> ALL (ARRAY['document'::text, 'thread'::text])))))));
create policy demo_scope on public.activity_log as restrictive for all to authenticated
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

-- People. super_view looks through an open view-as session. super_open has only a stopped one.
insert into public.profiles (id, role, status, is_admin, is_demo) values
  ('11111111-1111-4111-8111-111111111111', 'Processor', 'active', false, false),
  ('11111111-1111-4111-8111-111111111112', 'Processor', 'active', false, true),
  ('22222222-2222-4222-8222-222222222222', 'Preprocessor', 'active', false, false),
  ('33333333-3333-4333-8333-333333333333', 'Sales Person', 'active', false, false),
  ('44444444-4444-4444-8444-444444444444', 'Sales Team', 'active', false, false),
  ('55555555-5555-4555-8555-555555555555', 'Transaction Coordinator', 'active', false, false),
  ('66666666-6666-4666-8666-666666666661', 'Super admin', 'active', true, false),
  ('66666666-6666-4666-8666-666666666662', 'Super admin', 'active', true, false),
  ('77777777-7777-4777-8777-777777777777', 'Admin', 'active', true, false),
  ('88888888-8888-4888-8888-888888888888', 'Employee', 'active', false, false),
  ('99999999-9999-4999-8999-999999999999', 'Processor', 'disabled', false, false),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Outside user', 'active', false, false),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Outside user', 'active', false, false),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Outside user', 'active', false, false),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'Outside user', 'active', false, false),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'Outside user', 'active', false, false),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', 'Outside user', 'active', false, false);

insert into public.viewer_case (id, label) values
  ('11111111-1111-4111-8111-111111111111', 'processor'),
  ('11111111-1111-4111-8111-111111111112', 'demo-processor'),
  ('22222222-2222-4222-8222-222222222222', 'preprocessor'),
  ('33333333-3333-4333-8333-333333333333', 'sales-person'),
  ('44444444-4444-4444-8444-444444444444', 'sales-team'),
  ('55555555-5555-4555-8555-555555555555', 'coordinator'),
  ('66666666-6666-4666-8666-666666666661', 'super-open'),
  ('66666666-6666-4666-8666-666666666662', 'super-view-as-buyer'),
  ('77777777-7777-4777-8777-777777777777', 'admin'),
  ('88888888-8888-4888-8888-888888888888', 'employee'),
  ('99999999-9999-4999-8999-999999999999', 'inactive'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'buyer-agent'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'listing-agent'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'pure-buyer'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'pure-seller'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'self-rep'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', 'outside-none'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'no-profile');

insert into public.contacts (id, profile_id, first_name, last_name) values
  ('c1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Bianca', 'Buyer-Agent'),
  ('c2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Larry', 'Listing-Agent'),
  ('c3333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Ben', 'Buyer'),
  ('c4444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'Cora', 'Seller'),
  ('c5555555-5555-4555-8555-555555555555', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'Sam', 'Selfrep');

insert into private.view_as_sessions (actor_id, target_id, expires_at, stopped_at) values
  ('66666666-6666-4666-8666-666666666661', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', now() + interval '1 day', now()),
  ('66666666-6666-4666-8666-666666666662', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', now() + interval '1 day', null);

insert into public.task_template_switches (code, enabled) values ('off', false), ('on', true);
insert into public.task_templates (code, version, retired_at) values
  ('retired', 1, now()),
  ('live', 1, null);

insert into public.documents (id, name) values
  ('d0c00000-0000-4000-8000-000000000001', 'visible'),
  ('d0c00000-0000-4000-8000-000000000002', 'hidden');
insert into public.threads (id, deal_id) values
  ('e1111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001'),
  ('e2222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-000000000001');
insert into public.thread_participants (thread_id, profile_id) values
  ('e1111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333');

insert into public.deals (id, is_demo, preprocessor_user_id)
select format('00000000-0000-4000-8000-%s', lpad(to_hex(i), 12, '0'))::uuid,
       i > 8,
       case when i in (2, 5) then '22222222-2222-4222-8222-222222222222'::uuid else null end
from generate_series(1, 16) i;

insert into public.deal_sales_people (deal_id, sales_id)
select format('00000000-0000-4000-8000-%s', lpad(to_hex(i), 12, '0'))::uuid,
       '33333333-3333-4333-8333-333333333333'
from generate_series(1, 16) i
where i in (1, 4);

-- A generic buyer and seller on every file, plus the named parties on the first files.
insert into public.contacts (id, first_name, last_name)
select format('b0000000-0000-4000-8000-%s', lpad(to_hex(i), 12, '0'))::uuid,
       case when i % 5 = 0 then '' else 'Buyer' || i end,
       case when i % 5 = 0 then '' else 'House' || i end
from generate_series(1, 16) i;
insert into public.contacts (id, first_name, last_name)
select format('50000000-0000-4000-8000-%s', lpad(to_hex(i), 12, '0'))::uuid,
       'Seller' || i, 'Lane' || i
from generate_series(1, 16) i;

insert into public.deal_participants (deal_id, contact_id, role, created_at)
select format('00000000-0000-4000-8000-%s', lpad(to_hex(i), 12, '0'))::uuid,
       format('b0000000-0000-4000-8000-%s', lpad(to_hex(i), 12, '0'))::uuid,
       'Client-Buyer', now() - (i || ' minutes')::interval
from generate_series(1, 16) i;
insert into public.deal_participants (deal_id, contact_id, role, created_at)
select format('00000000-0000-4000-8000-%s', lpad(to_hex(i), 12, '0'))::uuid,
       format('50000000-0000-4000-8000-%s', lpad(to_hex(i), 12, '0'))::uuid,
       'Client-Seller', now() - (i || ' minutes')::interval + interval '1 second'
from generate_series(1, 16) i;

insert into public.deal_participants (deal_id, contact_id, role, created_at) values
  ('00000000-0000-4000-8000-000000000001', 'c3333333-3333-4333-8333-333333333333', 'Client-Buyer', now() - interval '2 hours'),
  ('00000000-0000-4000-8000-000000000001', 'c4444444-4444-4444-8444-444444444444', 'Client-Seller', now() - interval '90 minutes'),
  ('00000000-0000-4000-8000-000000000001', 'c1111111-1111-4111-8111-111111111111', 'Buyer Agent', now() - interval '80 minutes'),
  ('00000000-0000-4000-8000-000000000001', 'c2222222-2222-4222-8222-222222222222', 'Listing Agent', now() - interval '70 minutes'),
  ('00000000-0000-4000-8000-000000000002', 'c1111111-1111-4111-8111-111111111111', 'Buyer Agent', now() - interval '50 minutes'),
  ('00000000-0000-4000-8000-000000000003', 'c5555555-5555-4555-8555-555555555555', 'Buyer Agent', now() - interval '40 minutes'),
  ('00000000-0000-4000-8000-000000000003', 'c5555555-5555-4555-8555-555555555555', 'Client-Buyer', now() - interval '39 minutes');

insert into public.tasks (deal_id, owner_profile_id, assigned_role, title, audiences, template_code, status, due_date)
select d.id, null, 'Processor', 'Open overdue', null, null, 'todo', private.office_today() - 3
from public.deals d;
insert into public.tasks (deal_id, assigned_role, title, status, due_date)
select d.id, 'Processor', 'Future', 'todo', private.office_today() + 10 from public.deals d;
insert into public.tasks (deal_id, assigned_role, title, status, due_date)
select d.id, 'Processor', 'Done past', 'done', private.office_today() - 3 from public.deals d;
insert into public.tasks (deal_id, assigned_role, title, template_code, status, due_date)
select d.id, 'Processor', 'Switched off', 'off', 'todo', private.office_today() - 2 from public.deals d;
insert into public.tasks (deal_id, assigned_role, title, template_code, status, due_date)
select d.id, 'Processor', 'Retired open', 'retired', 'todo', private.office_today() - 2 from public.deals d;
insert into public.tasks (deal_id, assigned_role, title, status, due_date)
select d.id, 'Client-Buyer', 'Earnest money deposit receipt', 'todo', private.office_today() - 1 from public.deals d;
insert into public.tasks (deal_id, assigned_role, title, audiences, status, due_date)
select d.id, 'Client-Buyer', 'Internal only', array['internal'], 'todo', private.office_today() - 1 from public.deals d;
insert into public.tasks (deal_id, owner_profile_id, assigned_role, title, audiences, status, due_date)
select '00000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Client-Buyer', 'Buyer audience', array['buyer'], 'todo', private.office_today() - 1;

insert into public.activity_log (deal_id, entity, entity_id, action, detail)
select d.id, kind.entity, kind.entity_id, 'note.added', kind.entity
from public.deals d
cross join (values
  ('deal'::text, null::uuid),
  ('document', 'd0c00000-0000-4000-8000-000000000001'::uuid),
  ('document', 'd0c00000-0000-4000-8000-000000000002'::uuid),
  ('thread', 'e1111111-1111-4111-8111-111111111111'::uuid),
  ('thread', 'e2222222-2222-4222-8222-222222222222'::uuid),
  ('task', null::uuid),
  (null::text, null::uuid)
) as kind(entity, entity_id);
insert into public.activity_log (deal_id, entity, entity_id, action, detail)
select null, 'user', null, 'user.added', 'portal ' || i
from generate_series(1, 6) i;
insert into public.activity_log (deal_id, entity, entity_id, action, detail)
select '00000000-0000-4000-8000-000000000001', 'document', 'd0c00000-0000-4000-8000-000000000001', 'doc.added', 'bulk ' || i
from generate_series(1, 240) i;
