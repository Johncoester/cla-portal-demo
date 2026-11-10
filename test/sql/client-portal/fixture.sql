-- Throwaway schema for the client buyer/seller JWT test. Not applied to the hosted project.
create schema if not exists private;
create role anon nologin;
create role authenticated nologin;
grant usage on schema public, private to authenticated;

create table public.profiles (
  id uuid primary key,
  first_name text,
  last_name text,
  role text,
  status text,
  is_demo boolean not null default false
);
create table public.contacts (
  id uuid primary key,
  profile_id uuid
);
create table public.deals (
  id uuid primary key,
  is_demo boolean not null default false,
  processor_id uuid,
  preprocessor_user_id uuid,
  tc_user_id uuid,
  sales_person_id uuid
);
create table public.deal_participants (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid,
  contact_id uuid,
  role text
);
create table public.deal_sales_people (
  deal_id uuid,
  sales_id uuid
);
create table public.task_templates (
  id uuid primary key,
  code text,
  version int,
  title text,
  fields jsonb
);
create table public.tasks (
  id uuid primary key,
  deal_id uuid,
  owner_profile_id uuid,
  assigned_role text,
  title text,
  template_id uuid,
  kind text
);
create table public.folders (
  id uuid primary key,
  deal_id uuid,
  scope text,
  staff_only boolean not null default false
);
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid,
  name text not null,
  visibility text not null,
  uploaded_by uuid not null,
  folder_id uuid,
  doc_type text not null default '',
  wire_instructions boolean not null default false
);
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid,
  subject text,
  created_by uuid
);
create table public.thread_participants (
  thread_id uuid,
  profile_id uuid,
  last_read_at timestamptz
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid,
  author_id uuid,
  body text
);

create function private.effective_uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function private.me_role() returns text language sql stable as $$
  select role from public.profiles where id = private.effective_uid() and status = 'active' $$;
create function private.is_admin() returns boolean language sql stable as $$
  select coalesce(private.me_role() in ('Admin', 'Super admin'), false) $$;
create function private.is_staffish() returns boolean language sql stable as $$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'), false) $$;
create function private.is_processor() returns boolean language sql stable as $$
  select coalesce(private.me_role() = 'Processor', false) $$;
create function private.is_view_only() returns boolean language sql stable as $$
  select false $$;
create function private.viewer_is_demo() returns boolean language sql stable as $$
  select coalesce((select is_demo from public.profiles where id = private.effective_uid()), false) $$;
create function private.side_of(r text) returns text language sql stable as $$
  select case r when 'Buyer Agent' then 'buyer' when 'Client-Buyer' then 'buyer' when 'Listing Agent' then 'seller' when 'Client-Seller' then 'seller' end $$;
create function private.deal_role(d uuid) returns text language sql stable as $$
  select case when private.me_role() is null then null when private.me_role() <> 'Outside user' then private.me_role()
    else (select p.role from public.deal_participants p join public.contacts c on c.id = p.contact_id
          where p.deal_id = d and c.profile_id = private.effective_uid()
            and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
          order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], p.role) limit 1) end $$;
create function private.deal_roles(d uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(p.role), '{}') from public.deal_participants p join public.contacts c on c.id = p.contact_id
  where p.deal_id = d and c.profile_id = private.effective_uid() $$;
create function private.my_side(d uuid) returns text language sql stable as $$
  select private.side_of(private.deal_role(d)) $$;
create function private.can_access_deal(d uuid) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select private.me_role() is not null and (
    private.is_admin() or private.me_role() in ('Processor', 'Sales Team', 'Transaction Coordinator')
    or exists (select 1 from public.deal_participants p join public.contacts c on c.id = p.contact_id
               where p.deal_id = d and c.profile_id = private.effective_uid())) $$;
create function private.person_side(pid uuid, d uuid) returns text language sql stable security definer set search_path to pg_catalog, public as $$
  select case when (select role from public.profiles where id = pid) is distinct from 'Outside user' then 'staff'
    else (select case when count(distinct s) = 1 then max(s) end from (
      select private.side_of(p.role) s from public.deal_participants p join public.contacts c on c.id = p.contact_id
      where p.deal_id = d and c.profile_id = pid) x where s is not null) end $$;
create function private.can_message(pid uuid, d uuid) returns boolean language sql stable as $$
  select private.is_staffish() or private.person_side(pid, d) = 'staff'
    or (private.my_side(d) in ('buyer', 'seller') and private.person_side(pid, d) = private.my_side(d)) $$;
create function private.participant_visible(d uuid, prole text) returns boolean language sql stable as $$
  select private.can_access_deal(d)
    and not (private.deal_role(d) in ('Client-Buyer', 'Client-Seller') and prole like 'Client-%' and prole <> private.deal_role(d))
    and not (prole = 'Listing Agent' and private.deal_role(d) = 'Client-Buyer')
    and not (prole = 'Buyer Agent' and private.deal_role(d) = 'Client-Seller') $$;
create function private.person_label(pid uuid, d uuid) returns text language sql stable as $$
  select trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) || ' (' || coalesce(private.deal_role(d), role, 'unknown role') || ')'
  from public.profiles where id = pid $$;
create function private.one_side(members uuid[], d uuid) returns boolean language sql stable as $$
  select (select count(distinct s) from unnest(members) m(id), lateral (select private.person_side(m.id, d) s) z where z.s in ('buyer', 'seller')) <= 1 $$;
create function private.task_visible(owner uuid, assigned text, d uuid) returns boolean language sql stable as $$
  select private.is_staffish() or owner = private.effective_uid()
    or (owner is null and assigned = any (private.deal_roles(d))) $$;
create function private.emd_receipt_title(t text) returns boolean language sql stable as $$ select false $$;
create function private.is_pure_buyer(d uuid) returns boolean language sql stable as $$
  select private.deal_role(d) = 'Client-Buyer' $$;
create function private.upload_ext_ok(n text) returns boolean language sql stable as $$
  select lower(split_part(n, '.', -1)) = 'pdf' $$;
create function private.folder_visible(f uuid) returns boolean language sql stable as $$
  select f is null or exists (select 1 from public.folders x where x.id = f and (not x.staff_only or private.is_staffish())) $$;
create function private.visibility_allowed(d uuid, vis text) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select vis in ('all', 'buyer', 'seller', 'staff') and (
    private.is_staffish()
    or (vis = 'all' and private.deal_role(d) not in ('Client-Buyer', 'Client-Seller'))
    or (vis in ('buyer', 'seller') and vis = private.side_of(private.deal_role(d)))) $$;

alter table public.tasks enable row level security;
alter table public.task_templates enable row level security;
alter table public.documents enable row level security;
create policy tasks_select on public.tasks for select to authenticated using (
  private.can_access_deal(deal_id) and private.task_visible(owner_profile_id, assigned_role, deal_id));
create policy templates_select on public.task_templates for select to authenticated using (
  private.is_admin() or exists (
    select 1 from public.tasks t where t.template_id = task_templates.id and private.can_access_deal(t.deal_id)));
create policy documents_insert on public.documents for insert to authenticated with check (
  (uploaded_by = private.effective_uid()) and private.upload_ext_ok(name) and (
    (deal_id is not null and private.can_access_deal(deal_id) and not private.is_view_only()
      and private.visibility_allowed(deal_id, visibility) and (folder_id is null or private.folder_visible(folder_id)))
    or (deal_id is null and (private.is_processor() or private.is_admin()) and visibility = 'all')));
create policy documents_assigned_agent_insert on public.documents for insert to authenticated with check (
  visibility = 'staff' and uploaded_by = private.effective_uid() and private.upload_ext_ok(name)
  and not coalesce(wire_instructions, false) and deal_id is not null and private.me_role() = 'Outside user'
  and not private.is_view_only() and private.can_access_deal(deal_id)
  and private.deal_roles(deal_id) && array['Listing Agent', 'Buyer Agent']::text[]
  and (folder_id is null or private.folder_visible(folder_id)));
create policy documents_select on public.documents for select to authenticated using (uploaded_by = private.effective_uid() or private.is_staffish());
create policy demo_scope on public.documents as restrictive for all to authenticated using (
  case when deal_id is null then not private.viewer_is_demo()
    else (select d.is_demo from public.deals d where d.id = documents.deal_id) = private.viewer_is_demo() end)
  with check (
  case when deal_id is null then not private.viewer_is_demo()
    else (select d.is_demo from public.deals d where d.id = documents.deal_id) = private.viewer_is_demo() end);

grant select, insert on all tables in schema public to authenticated;
grant execute on all functions in schema private to authenticated;

insert into public.profiles (id, first_name, last_name, role, status, is_demo) values
  ('11111111-1111-4111-8111-111111111111', 'Kay', 'Buyer', 'Outside user', 'active', false),
  ('22222222-2222-4222-8222-222222222222', 'Sam', 'Seller', 'Outside user', 'active', false),
  ('33333333-3333-4333-8333-333333333333', 'Bea', 'Agent', 'Outside user', 'active', false),
  ('44444444-4444-4444-8444-444444444444', 'Lee', 'Listing', 'Outside user', 'active', false),
  ('55555555-5555-4555-8555-555555555555', 'Pat', 'Proc', 'Processor', 'active', false),
  ('66666666-6666-4666-8666-666666666666', 'Tay', 'Coord', 'Transaction Coordinator', 'active', false),
  ('77777777-7777-4777-8777-777777777777', 'Una', 'Open', 'Processor', 'active', false),
  ('88888888-8888-4888-8888-888888888888', 'Dee', 'Demo', 'Processor', 'active', true),
  ('99999999-9999-4999-8999-999999999999', 'Casey', 'DemoBuyer', 'Outside user', 'active', true);
insert into public.contacts (id, profile_id) values
  ('11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222201', '22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333301', '33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444401', '44444444-4444-4444-8444-444444444444'),
  ('99999999-9999-4999-8999-999999999901', '99999999-9999-4999-8999-999999999999');
insert into public.deals (id, is_demo, processor_id, preprocessor_user_id, tc_user_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', false, null, null, '66666666-6666-4666-8666-666666666666'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', false, '55555555-5555-4555-8555-555555555555', null, '66666666-6666-4666-8666-666666666666'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', true, null, null, null);
insert into public.deal_participants (deal_id, contact_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111101', 'Client-Buyer'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-222222222201', 'Client-Seller'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '33333333-3333-4333-8333-333333333301', 'Buyer Agent'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '44444444-4444-4444-8444-444444444401', 'Listing Agent'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-1111-4111-8111-111111111101', 'Client-Buyer'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '33333333-3333-4333-8333-333333333301', 'Buyer Agent'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '99999999-9999-4999-8999-999999999901', 'Client-Buyer');
insert into public.task_templates (id, code, version, title, fields) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'id_upload', 1, 'Upload photo ID', '[{"k":"id_document","type":"doc","label":"ID document"}]');
insert into public.tasks (id, deal_id, owner_profile_id, assigned_role, title, template_id, kind) values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, 'Client-Buyer', 'Upload photo ID', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'form'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, 'Client-Seller', 'Upload photo ID', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'form');
insert into public.folders (id, deal_id, scope, staff_only) values
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'deal', false);
