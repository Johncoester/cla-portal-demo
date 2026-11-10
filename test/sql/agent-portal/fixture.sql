-- Throwaway schema for agent document visibility and portal messages. Fake rows only.
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create schema if not exists private;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.profiles (
  id uuid primary key,
  role text not null,
  status text not null,
  is_admin boolean not null default false,
  is_demo boolean not null default false
);
create table public.contacts (
  id uuid primary key,
  profile_id uuid,
  first_name text not null default '',
  last_name text not null default ''
);
create table public.deals (
  id uuid primary key,
  is_demo boolean not null default false,
  processor_id uuid
);
create table public.deal_participants (
  id uuid primary key,
  deal_id uuid not null,
  contact_id uuid not null,
  role text not null
);
create table public.folders (
  id uuid primary key,
  scope text not null,
  deal_id uuid,
  name text not null,
  staff_only boolean not null default false
);
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid,
  name text not null,
  description text not null default '',
  mime_type text not null default 'application/pdf',
  size_bytes bigint not null default 0,
  storage_path text,
  visibility text not null default 'all',
  uploaded_by uuid not null,
  folder_id uuid,
  doc_type text not null default '',
  wire_instructions boolean not null default false,
  shared_with_client boolean not null default false,
  shared_with_seller boolean not null default false
);
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null,
  subject text not null,
  created_by uuid,
  staff_coordinated boolean not null default false
);
create table public.thread_participants (
  thread_id uuid not null,
  profile_id uuid not null,
  last_read_at timestamptz,
  primary key (thread_id, profile_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  author_id uuid not null,
  body text not null,
  body_html text not null default '',
  created_at timestamptz not null default now()
);
create table public.rls_results (
  phase text not null,
  name text not null,
  ok boolean not null,
  detail text not null default '',
  primary key (phase, name)
);

create or replace function private.effective_uid() returns uuid language sql stable security definer set search_path to pg_catalog, public as $$
  select auth.uid() $$;
create or replace function private.me_role() returns text language sql stable security definer set search_path to pg_catalog, public as $$
  select role from public.profiles where id = private.effective_uid() and status = 'active' $$;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select coalesce((select is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false) $$;
create or replace function private.is_staffish() returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'), false) $$;
create or replace function private.is_processor() returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor'), false) or private.is_admin() $$;
create or replace function private.is_manager() returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Transaction Coordinator'), false) or private.is_admin() $$;
create or replace function private.is_view_only() returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false) and not private.is_admin() $$;
create or replace function private.viewer_is_demo() returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select coalesce((select is_demo from public.profiles where id = private.effective_uid() and status = 'active'), false) $$;
create or replace function private.upload_ext_ok(n text) returns boolean language sql immutable as $$
  select lower(split_part(n, '.', -1)) in ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'png', 'jpg', 'jpeg', 'heic', 'heif', 'webp') and position('.' in n) > 1 $$;
create or replace function private.side_of(r text) returns text language sql immutable as $$
  select case r when 'Buyer Agent' then 'buyer' when 'Client-Buyer' then 'buyer' when 'Listing Agent' then 'seller' when 'Client-Seller' then 'seller' end $$;
create or replace function private.file_roles_of(pid uuid, d uuid) returns text[] language sql stable security definer set search_path to pg_catalog, public as $$
  select case when pr.role is null then '{}'::text[] when pr.role <> 'Outside user' then array[pr.role]
    else coalesce((select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
                   from (select distinct p.role from public.deal_participants p join public.contacts c on c.id = p.contact_id
                         where p.deal_id = d and c.profile_id = pid and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')) x),
                  array['Outside user']::text[]) end
  from (select (select role from public.profiles where id = pid) as role) pr $$;
create or replace function private.file_role_of(pid uuid, d uuid) returns text language sql stable security definer set search_path to pg_catalog, public as $$
  select case when pr.role is distinct from 'Outside user' then pr.role
    else coalesce((select p.role from public.deal_participants p join public.contacts c on c.id = p.contact_id
                   where p.deal_id = d and c.profile_id = pid and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
                   order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], p.role) limit 1), 'Outside user') end
  from (select (select role from public.profiles where id = pid) as role) pr $$;
create or replace function private.deal_role(d uuid) returns text language sql stable security definer set search_path to pg_catalog, public as $$
  select case when private.me_role() is null then null when private.me_role() <> 'Outside user' then private.me_role() else private.file_role_of(private.effective_uid(), d) end $$;
create or replace function private.deal_roles(d uuid) returns text[] language sql stable security definer set search_path to pg_catalog, public as $$
  select case when private.me_role() is null then '{}'::text[] else private.file_roles_of(private.effective_uid(), d) end $$;
create or replace function private.can_access_deal(d uuid) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select private.me_role() is not null and (
    private.is_admin() or private.me_role() in ('Processor', 'Sales Team', 'Transaction Coordinator')
    or exists (select 1 from public.deal_participants p join public.contacts c on c.id = p.contact_id
               where p.deal_id = d and c.profile_id = private.effective_uid())) $$;
create or replace function private.folder_visible(f uuid) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select f is null or exists (select 1 from public.folders x where x.id = f and (not x.staff_only or private.is_staffish()) and (x.scope = 'library' or private.can_access_deal(x.deal_id))) $$;
create or replace function private.visibility_allowed(d uuid, vis text) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select vis in ('all', 'buyer', 'seller', 'staff') and (
    private.is_staffish()
    or (vis = 'all' and private.deal_role(d) not in ('Client-Buyer', 'Client-Seller'))
    or (vis in ('buyer', 'seller') and vis = private.side_of(private.deal_role(d)))) $$;
create or replace function private.is_pure_buyer(d uuid) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select private.effective_uid() is not null and not private.is_staffish()
     and 'Client-Buyer' = any (private.deal_roles(d))
     and not (private.deal_roles(d) && array['Buyer Agent', 'Listing Agent']::text[]) $$;
create or replace function private.is_pure_seller(d uuid) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select private.effective_uid() is not null and not private.is_staffish()
     and 'Client-Seller' = any (private.deal_roles(d))
     and not (private.deal_roles(d) && array['Buyer Agent', 'Listing Agent']::text[]) $$;
create or replace function private.person_side(pid uuid, d uuid) returns text language sql stable security definer set search_path to pg_catalog, public as $$
  select case when (select role from public.profiles where id = pid) is distinct from 'Outside user' then 'staff'
    else (select case when count(distinct s) = 1 then max(s) end from (select private.side_of(r) s from unnest(private.file_roles_of(pid, d)) r) x where s is not null) end $$;
create or replace function private.my_side(d uuid) returns text language sql stable security definer set search_path to pg_catalog, public as $$
  select case when private.is_staffish() then 'staff' else private.person_side(private.effective_uid(), d) end $$;
create or replace function private.can_message(pid uuid, d uuid) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select private.is_staffish() or private.person_side(pid, d) = 'staff' or (private.my_side(d) in ('buyer', 'seller') and private.person_side(pid, d) = private.my_side(d)) $$;
create or replace function private.document_readable(doc uuid) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select exists (
    select 1 from public.documents d
    where d.id = doc and private.me_role() is not null and (d.deal_id is null or private.can_access_deal(d.deal_id))
      and case
        when d.uploaded_by = private.effective_uid() or private.is_staffish() then true
        when private.is_pure_buyer(d.deal_id) then d.shared_with_client and d.visibility <> 'staff'
        when private.is_pure_seller(d.deal_id) then d.shared_with_seller and d.visibility <> 'staff'
        else d.visibility = 'all' or (d.visibility in ('buyer', 'seller') and d.visibility = private.side_of(private.deal_role(d.deal_id)))
      end) $$;
create or replace function private.thread_member(t uuid) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select exists (select 1 from public.threads x where x.id = t and private.can_access_deal(x.deal_id)
                 and (private.is_processor() or private.is_admin() or private.is_manager()
                      or exists (select 1 from public.thread_participants tp where tp.thread_id = t and tp.profile_id = private.effective_uid()))) $$;
create or replace function private.thread_postable(t uuid) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select private.is_staffish()
      or exists (select 1 from public.threads x where x.id = t and x.staff_coordinated
                 and exists (select 1 from public.thread_participants tp where tp.thread_id = t and tp.profile_id = private.effective_uid()))
      or not exists (select 1 from public.thread_participants tp join public.threads x on x.id = tp.thread_id
                     where tp.thread_id = t and tp.profile_id <> private.effective_uid() and not private.can_message(tp.profile_id, x.deal_id)) $$;
create or replace function private.message_readable(m uuid) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select exists (
    select 1 from public.messages msg join public.threads th on th.id = msg.thread_id
    where msg.id = m and private.thread_member(th.id)
      and (not th.staff_coordinated or private.is_staffish() or msg.author_id = private.effective_uid()
           or private.person_side(msg.author_id, th.deal_id) = 'staff'
           or private.person_side(msg.author_id, th.deal_id) is not distinct from private.my_side(th.deal_id))) $$;

alter table public.deals enable row level security;
create policy deals_select on public.deals for select to authenticated using (private.can_access_deal(id));
alter table public.documents enable row level security;
alter table public.messages enable row level security;
alter table public.threads enable row level security;
alter table public.thread_participants enable row level security;

create policy demo_scope on public.documents as restrictive for all to authenticated using (
  case when deal_id is null then not private.viewer_is_demo()
  else (select d.is_demo from public.deals d where d.id = documents.deal_id) = private.viewer_is_demo() end
) with check (
  case when deal_id is null then not private.viewer_is_demo()
  else (select d.is_demo from public.deals d where d.id = documents.deal_id) = private.viewer_is_demo() end
);
create policy documents_insert on public.documents for insert to authenticated with check (
  uploaded_by = private.effective_uid() and private.upload_ext_ok(name) and (
    (deal_id is not null and private.can_access_deal(deal_id) and not private.is_view_only() and private.visibility_allowed(deal_id, visibility) and (folder_id is null or private.folder_visible(folder_id)))
    or (deal_id is null and (private.is_processor() or private.is_admin()) and visibility = 'all')));
create policy documents_select on public.documents for select to authenticated using (private.document_readable(id));
create policy documents_update on public.documents for update to authenticated using (false);

create policy documents_assigned_agent_insert on public.documents as permissive for insert to authenticated with check (
  visibility = 'staff'
  and uploaded_by = private.effective_uid()
  and private.upload_ext_ok(name)
  and not coalesce(wire_instructions, false)
  and deal_id is not null
  and private.me_role() = 'Outside user'
  and not private.is_view_only()
  and private.can_access_deal(deal_id)
  and private.deal_roles(deal_id) && array['Listing Agent', 'Buyer Agent']::text[]
  and (folder_id is null or private.folder_visible(folder_id)));

create policy threads_select on public.threads for select to authenticated using (private.thread_member(id));
create policy tp_select on public.thread_participants for select to authenticated using (private.thread_member(thread_id));
create policy messages_select on public.messages for select to authenticated using (private.message_readable(id));
create policy messages_insert on public.messages for insert to authenticated with check (
  author_id = private.effective_uid() and not private.is_view_only()
  and exists (select 1 from public.thread_participants tp where tp.thread_id = messages.thread_id and tp.profile_id = private.effective_uid())
  and private.thread_member(thread_id) and private.thread_postable(thread_id));

grant usage on schema public, private, auth to authenticated;
grant select, insert on public.documents, public.messages, public.threads, public.thread_participants, public.deals to authenticated;
grant select, insert, update on public.rls_results to authenticated;
grant execute on all functions in schema private to authenticated;
grant execute on function auth.uid() to authenticated;

insert into public.profiles (id, role, status, is_admin, is_demo) values
  ('11111111-1111-1111-1111-111111111111', 'Processor', 'active', false, false),
  ('77777777-7777-7777-7777-777777777777', 'Transaction Coordinator', 'active', false, false),
  ('55555555-5555-5555-5555-555555555555', 'Outside user', 'active', false, false),
  ('44444444-4444-4444-4444-444444444444', 'Outside user', 'active', false, false),
  ('33333333-3333-3333-3333-333333333333', 'Outside user', 'active', false, false),
  ('66666666-6666-6666-6666-666666666666', 'Outside user', 'active', false, false),
  ('99999999-9999-9999-9999-999999999999', 'Outside user', 'disabled', false, false);
insert into public.contacts (id, profile_id, first_name, last_name) values
  ('c5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 'Bea', 'Agent'),
  ('c4444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'Lee', 'Agent'),
  ('c3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'Bo', 'Buyer'),
  ('c6666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666', 'Sam', 'Seller'),
  ('c9999999-9999-9999-9999-999999999999', '99999999-9999-9999-9999-999999999999', 'Gone', 'Agent');
insert into public.deals (id, is_demo, processor_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', false, '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', false, '11111111-1111-1111-1111-111111111111');
insert into public.deal_participants (id, deal_id, contact_id, role) values
  ('d5555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'c5555555-5555-5555-5555-555555555555', 'Buyer Agent'),
  ('d4444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'c4444444-4444-4444-4444-444444444444', 'Listing Agent'),
  ('d3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'c3333333-3333-3333-3333-333333333333', 'Client-Buyer'),
  ('d6666666-6666-6666-6666-666666666666', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'c6666666-6666-6666-6666-666666666666', 'Client-Seller');
insert into public.folders (id, scope, deal_id, name, staff_only) values
  ('f0000000-0000-0000-0000-000000000002', 'deal', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Staff folder', true);

insert into public.threads (id, deal_id, subject, created_by) values
  ('d1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Buyer side', '55555555-5555-5555-5555-555555555555');
insert into public.thread_participants (thread_id, profile_id) values
  ('d1111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555'),
  ('d1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'),
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
insert into public.messages (thread_id, author_id, body) values
  ('d1111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 'The commission form is ready.');
