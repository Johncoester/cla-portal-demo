-- Throwaway catalog for document_readable. No hosted database.
create schema if not exists auth;
create schema if not exists private;
create schema if not exists extensions;

create role authenticated nologin;
create role anon nologin;
grant authenticated to postgres;

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
  is_admin boolean not null default false
);
create table public.contacts (
  id uuid primary key,
  profile_id uuid unique
);
create table public.deals (
  id uuid primary key,
  preprocessor_user_id uuid
);
create table public.deal_sales_people (
  deal_id uuid,
  sales_id uuid,
  primary key (deal_id, sales_id)
);
create table public.deal_participants (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid,
  contact_id uuid,
  role text
);
create table public.folders (
  id uuid primary key,
  scope text,
  deal_id uuid,
  staff_only boolean not null default false
);
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid,
  name text not null,
  doc_type text not null default '',
  visibility text not null,
  uploaded_by uuid not null,
  wire_instructions boolean not null default false,
  shared_with_client boolean not null default false,
  shared_with_seller boolean not null default false,
  title_doc_kind text,
  folder_id uuid
);
create table public.signature_requests (
  id uuid primary key,
  document_id uuid
);
create table public.signature_signers (
  request_id uuid,
  profile_id uuid
);
create table private.view_as_sessions (
  actor_id uuid not null,
  target_id uuid not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  stopped_at timestamptz
);

create index idx_docs_deal on public.documents (deal_id);
create index idx_participants_deal on public.deal_participants (deal_id);
create index idx_participants_contact on public.deal_participants (contact_id);

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
create or replace function private.my_contact_id() returns uuid
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select id from public.contacts where profile_id = private.effective_uid()
$$;
create or replace function private.can_access_deal(d uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select private.me_role() is not null and (
    private.is_admin() or private.me_role() in ('Processor', 'Sales Team', 'Transaction Coordinator')
    or (private.me_role() = 'Preprocessor' and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid()))
    or (private.me_role() in ('Sales Person', 'Sales Team') and exists (select 1 from public.deal_sales_people s where s.deal_id = d and s.sales_id = private.effective_uid()))
    or exists (select 1 from public.deal_participants p where p.deal_id = d and p.contact_id = private.my_contact_id()))
$$;
create or replace function private.folder_visible(f uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select f is null or exists (select 1 from public.folders x where x.id = f and (not x.staff_only or private.is_staffish())
                              and (x.scope = 'library' or private.can_access_deal(x.deal_id)))
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
create or replace function private.deal_roles(d uuid) returns text[]
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select case when private.me_role() is null then '{}'::text[] else private.file_roles_of(private.effective_uid(), d) end
$$;
create or replace function private.deal_role(d uuid) returns text
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select case when private.me_role() is null then null when private.me_role() <> 'Outside user' then private.me_role() else private.file_role_of(private.effective_uid(), d) end
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
create or replace function private.viewer_holds_buyer_agent(d uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select d is not null and 'Buyer Agent' = any (private.deal_roles(d)) and not private.is_staffish()
$$;
create or replace function private.viewer_is_buyer_agent(d uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select private.viewer_holds_buyer_agent(d) and not ('Client-Buyer' = any (private.deal_roles(d)))
$$;
create or replace function private.wire_allowed(d uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select private.is_staffish() or (d is not null and private.effective_uid() is not null and 'Client-Buyer' = any (private.deal_roles(d)))
$$;
create or replace function private.doc_visible(visibility text, uploader uuid, d uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select uploader = private.effective_uid() or private.is_staffish()
         or visibility = 'all' or (visibility in ('buyer', 'seller') and visibility = private.side_of(private.deal_role(d)))
$$;
create or replace function private.buyer_agent_blocked(kind text, doc_name text, doc_type text, wire boolean) returns boolean
language sql immutable set search_path to pg_catalog, public, extensions as $$
  select coalesce(wire, false)
    or coalesce(kind, '') in ('curative_lien', 'entity_document', 'prelim_cd', 'title_package', 'cpl', 'lien_certificate')
    or coalesce(doc_name, '') ~* 'payoff|cash[[:space:]-]*to[[:space:]-]*close|wire[[:space:]._-]*(instruction|info|details)'
    or coalesce(doc_type, '') ~* 'payoff|cash[[:space:]-]*to[[:space:]-]*close'
$$;
create or replace function private.buyer_doc_ok(pid uuid, doc uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select exists (select 1 from public.documents d where d.id = doc and (
    d.uploaded_by = pid or private.person_side(d.uploaded_by, d.deal_id) = 'staff'
    or exists (select 1 from public.signature_requests r join public.signature_signers s on s.request_id = r.id where r.document_id = d.id and s.profile_id = pid)))
$$;
create or replace function private.seller_doc_ok(pid uuid, doc uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select exists (select 1 from public.documents d where d.id = doc and (
    d.uploaded_by = pid or coalesce(private.person_side(d.uploaded_by, d.deal_id), '') in ('staff', 'seller')
    or exists (select 1 from public.signature_requests r join public.signature_signers s on s.request_id = r.id where r.document_id = d.id and s.profile_id = pid)))
$$;

create or replace function private.document_readable(doc uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions
as $old$
  select exists (select 1 from public.documents d where d.id = doc and private.me_role() is not null
    and (d.deal_id is null or private.can_access_deal(d.deal_id)) and private.folder_visible(d.folder_id)
    and (not d.wire_instructions or d.uploaded_by = (select private.effective_uid()) or private.wire_allowed(d.deal_id))
    and not (private.viewer_is_buyer_agent(d.deal_id) and private.buyer_agent_blocked(d.title_doc_kind, d.name, d.doc_type, d.wire_instructions))
    and case when d.deal_id is not null and d.uploaded_by is distinct from (select private.effective_uid()) and private.is_pure_buyer(d.deal_id) then
           (d.shared_with_client and d.visibility <> 'staff')
           or (private.buyer_doc_ok((select private.effective_uid()), d.id) and private.doc_visible(d.visibility, d.uploaded_by, d.deal_id))
         when d.deal_id is not null and d.uploaded_by is distinct from (select private.effective_uid()) and private.is_pure_seller(d.deal_id) then
           (d.shared_with_seller and d.visibility <> 'staff')
           or (private.seller_doc_ok((select private.effective_uid()), d.id) and private.doc_visible(d.visibility, d.uploaded_by, d.deal_id))
         else private.doc_visible(d.visibility, d.uploaded_by, d.deal_id)
           or (d.title_doc_kind = 'title_commitment' and private.viewer_holds_buyer_agent(d.deal_id) and not private.buyer_agent_blocked(d.title_doc_kind, d.name, d.doc_type, d.wire_instructions))
         end) $old$;

create or replace function private.document_readable_old(doc uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions
as $old$
  select exists (select 1 from public.documents d where d.id = doc and private.me_role() is not null
    and (d.deal_id is null or private.can_access_deal(d.deal_id)) and private.folder_visible(d.folder_id)
    and (not d.wire_instructions or d.uploaded_by = (select private.effective_uid()) or private.wire_allowed(d.deal_id))
    and not (private.viewer_is_buyer_agent(d.deal_id) and private.buyer_agent_blocked(d.title_doc_kind, d.name, d.doc_type, d.wire_instructions))
    and case when d.deal_id is not null and d.uploaded_by is distinct from (select private.effective_uid()) and private.is_pure_buyer(d.deal_id) then
           (d.shared_with_client and d.visibility <> 'staff')
           or (private.buyer_doc_ok((select private.effective_uid()), d.id) and private.doc_visible(d.visibility, d.uploaded_by, d.deal_id))
         when d.deal_id is not null and d.uploaded_by is distinct from (select private.effective_uid()) and private.is_pure_seller(d.deal_id) then
           (d.shared_with_seller and d.visibility <> 'staff')
           or (private.seller_doc_ok((select private.effective_uid()), d.id) and private.doc_visible(d.visibility, d.uploaded_by, d.deal_id))
         else private.doc_visible(d.visibility, d.uploaded_by, d.deal_id)
           or (d.title_doc_kind = 'title_commitment' and private.viewer_holds_buyer_agent(d.deal_id) and not private.buyer_agent_blocked(d.title_doc_kind, d.name, d.doc_type, d.wire_instructions))
         end) $old$;

revoke all on function private.document_readable(uuid) from public;
revoke all on function private.document_readable_old(uuid) from public;
grant execute on function private.document_readable(uuid) to authenticated;
grant execute on function private.document_readable_old(uuid) to authenticated;

alter table public.documents enable row level security;
alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.deal_participants enable row level security;
alter table public.deals enable row level security;
alter table public.deal_sales_people enable row level security;
alter table public.folders enable row level security;
alter table public.signature_requests enable row level security;
alter table public.signature_signers enable row level security;
alter table private.view_as_sessions enable row level security;

create policy documents_select on public.documents for select to authenticated using (private.document_readable(id));
create policy documents_insert on public.documents for insert to authenticated with check (false);
create policy documents_update on public.documents for update to authenticated using (private.document_readable(id));
create policy documents_assigned_agent_insert on public.documents for insert to authenticated with check (false);
create policy demo_scope on public.documents as restrictive for all to authenticated using (true) with check (true);

grant usage on schema public, private to authenticated;
grant select on public.documents to authenticated;

insert into public.profiles (id, role, status, is_admin) values
  ('11111111-1111-4111-8111-111111111111', 'Processor', 'active', false),
  ('22222222-2222-4222-8222-222222222222', 'Transaction Coordinator', 'active', false),
  ('33333333-3333-4333-8333-333333333333', 'Sales Person', 'active', false),
  ('34343434-3434-4434-8434-343434343434', 'Sales Person', 'active', false),
  ('35353535-3535-4353-8353-353535353535', 'Sales Team', 'active', false),
  ('44444444-4444-4444-8444-444444444444', 'Preprocessor', 'active', false),
  ('45454545-4545-4454-8454-454545454545', 'Preprocessor', 'active', false),
  ('55555555-5555-4555-8555-555555555555', 'Admin', 'active', true),
  ('88888888-8888-4888-8888-888888888888', 'Super admin', 'active', true),
  ('86868686-8686-4868-8868-868686868686', 'Super admin', 'active', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Outside user', 'active', false),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Outside user', 'active', false),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Outside user', 'active', false),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Outside user', 'active', false),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Outside user', 'active', false),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'Outside user', 'active', false),
  ('12121212-1212-4212-8212-121212121212', 'Outside user', 'active', false),
  ('99999999-9999-4999-8999-999999999999', 'Processor', 'disabled', false);

insert into public.contacts (id, profile_id) values
  ('c1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'),
  ('caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  ('cddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  ('ceeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  ('cfffffff-ffff-4fff-8fff-ffffffffffff', 'ffffffff-ffff-4fff-8fff-ffffffffffff');

insert into public.deals (id, preprocessor_user_id) values
  ('a0e00000-0000-4000-8000-00000000000a', '44444444-4444-4444-8444-444444444444'),
  ('a0e00000-0000-4000-8000-00000000000b', null);

insert into public.deal_sales_people (deal_id, sales_id) values
  ('a0e00000-0000-4000-8000-00000000000a', '33333333-3333-4333-8333-333333333333');

insert into public.deal_participants (deal_id, contact_id, role) values
  ('a0e00000-0000-4000-8000-00000000000a', 'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Buyer Agent'),
  ('a0e00000-0000-4000-8000-00000000000a', 'cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Listing Agent'),
  ('a0e00000-0000-4000-8000-00000000000a', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Client-Buyer'),
  ('a0e00000-0000-4000-8000-00000000000a', 'cddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Client-Seller'),
  ('a0e00000-0000-4000-8000-00000000000a', 'ceeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Buyer Agent'),
  ('a0e00000-0000-4000-8000-00000000000a', 'ceeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Client-Buyer'),
  ('a0e00000-0000-4000-8000-00000000000b', 'cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Listing Agent');

insert into public.folders (id, scope, deal_id, staff_only) values
  ('f0000000-0000-4000-8000-000000000001', 'deal', 'a0e00000-0000-4000-8000-00000000000a', false),
  ('f0000000-0000-4000-8000-000000000002', 'deal', 'a0e00000-0000-4000-8000-00000000000a', true),
  ('f0000000-0000-4000-8000-000000000003', 'library', null, false),
  ('f0000000-0000-4000-8000-000000000004', 'library', null, true),
  ('f0000000-0000-4000-8000-000000000005', 'deal', 'a0e00000-0000-4000-8000-00000000000b', false);

insert into public.documents (deal_id, name, doc_type, visibility, uploaded_by, wire_instructions, shared_with_client, shared_with_seller, title_doc_kind, folder_id)
select 'a0e00000-0000-4000-8000-00000000000a', v.name, v.doc_type, v.visibility, v.uploaded_by, v.wire, v.shared_client, v.shared_seller, v.kind, null
from (
  select * from (values
    ('11111111-1111-4111-8111-111111111111'::uuid),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid),
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid),
    ('abababab-abab-4aba-8aba-abababababab'::uuid)
  ) u(uploaded_by)
  cross join (values ('all'), ('buyer'), ('seller'), ('staff')) vis(visibility)
  cross join (values (false), (true)) w(wire)
  cross join (values (false), (true)) sc(shared_client)
  cross join (values (false), (true)) ss(shared_seller)
  cross join (values
    (null::text, 'contract.pdf', ''),
    ('title_commitment', 'commitment.pdf', ''),
    ('cpl', 'cpl.pdf', ''),
    (null::text, 'Payoff Statement.pdf', 'Payoff'),
    (null::text, 'wire instructions.pdf', '')
  ) k(kind, name, doc_type)
) v;

insert into public.documents (deal_id, name, visibility, uploaded_by, folder_id) values
  ('a0e00000-0000-4000-8000-00000000000a', 'in-folder.pdf', 'all', '11111111-1111-4111-8111-111111111111', 'f0000000-0000-4000-8000-000000000001'),
  ('a0e00000-0000-4000-8000-00000000000a', 'staff-folder.pdf', 'all', '11111111-1111-4111-8111-111111111111', 'f0000000-0000-4000-8000-000000000002'),
  ('a0e00000-0000-4000-8000-00000000000a', 'other-deal-folder.pdf', 'buyer', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'f0000000-0000-4000-8000-000000000005'),
  ('a0e00000-0000-4000-8000-00000000000a', 'missing-folder.pdf', 'all', '11111111-1111-4111-8111-111111111111', 'f0000000-0000-4000-8000-000000000099'),
  (null, 'library.pdf', 'all', '11111111-1111-4111-8111-111111111111', null),
  (null, 'library-folder.pdf', 'staff', '11111111-1111-4111-8111-111111111111', 'f0000000-0000-4000-8000-000000000003'),
  (null, 'library-staff-folder.pdf', 'all', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'f0000000-0000-4000-8000-000000000004'),
  ('a0e00000-0000-4000-8000-00000000000b', 'deal-b-all.pdf', 'all', '11111111-1111-4111-8111-111111111111', null),
  ('a0e00000-0000-4000-8000-00000000000b', 'deal-b-buyer.pdf', 'buyer', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null),
  ('a0e00000-0000-4000-8000-00000000000b', 'deal-b-staff.pdf', 'staff', '11111111-1111-4111-8111-111111111111', null);

insert into public.signature_requests (id, document_id)
select '51000000-0000-4000-8000-000000000001', d.id
from public.documents d
where d.deal_id = 'a0e00000-0000-4000-8000-00000000000a'
  and d.uploaded_by = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and d.visibility = 'buyer'
  and d.shared_with_client = false
  and d.shared_with_seller = false
  and d.wire_instructions = false
  and d.title_doc_kind is null
  and d.name = 'contract.pdf'
  and d.folder_id is null
limit 1;
insert into public.signature_signers (request_id, profile_id) values
  ('51000000-0000-4000-8000-000000000001', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');

insert into private.view_as_sessions (actor_id, target_id, expires_at, stopped_at) values
  ('88888888-8888-4888-8888-888888888888', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() + interval '1 day', null),
  ('86868686-8686-4868-8868-868686868686', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', now() - interval '1 day', null),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() + interval '1 day', null);

create table public.viewer_case (id uuid primary key, label text);
insert into public.viewer_case (id, label) values
  ('11111111-1111-4111-8111-111111111111', 'processor'),
  ('22222222-2222-4222-8222-222222222222', 'tc'),
  ('33333333-3333-4333-8333-333333333333', 'sales on file'),
  ('34343434-3434-4434-8434-343434343434', 'sales off file'),
  ('35353535-3535-4353-8353-353535353535', 'sales team'),
  ('44444444-4444-4444-8444-444444444444', 'preprocessor on file'),
  ('45454545-4545-4454-8454-454545454545', 'preprocessor off file'),
  ('55555555-5555-4555-8555-555555555555', 'admin'),
  ('88888888-8888-4888-8888-888888888888', 'view as buyer agent'),
  ('86868686-8686-4868-8868-868686868686', 'expired view as'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'buyer agent'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'listing agent'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'pure buyer'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'pure seller'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'buyer agent and client'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'stranger'),
  ('12121212-1212-4212-8212-121212121212', 'no contact'),
  ('99999999-9999-4999-8999-999999999999', 'inactive'),
  ('77777777-7777-4777-8777-777777777777', 'no profile');
