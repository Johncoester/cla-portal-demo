-- documents/folders and their helpers, copied from TEST (read-only capture Nov 9). Fake rows only.
create table public.folders (id uuid primary key default gen_random_uuid(), scope text not null, deal_id uuid, name text not null, staff_only boolean not null default false, created_by uuid, created_at timestamptz not null default now());
create table public.documents (id uuid primary key default gen_random_uuid(), deal_id uuid, name text not null, description text not null default '', mime_type text not null default 'application/octet-stream', size_bytes bigint not null default 0, storage_path text, visibility text not null default 'all', uploaded_by uuid not null, created_at timestamptz not null default now(), folder_id uuid, doc_type text not null default '', wire_instructions boolean not null default false);
create or replace function private.is_view_only() returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $f$
  select coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false) and not private.is_admin() $f$;
create or replace function private.upload_ext_ok(n text) returns boolean language sql immutable set search_path to 'pg_catalog', 'public', 'extensions' as $f$
  select lower(split_part(n, '.', -1)) in ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'png', 'jpg', 'jpeg', 'heic', 'heif', 'webp') and position('.' in n) > 1 $f$;
create or replace function private.folder_visible(f uuid) returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $f$
  select f is null or exists (select 1 from public.folders x where x.id = f and (not x.staff_only or private.is_staffish()) and (x.scope = 'library' or private.can_access_deal(x.deal_id))) $f$;
create or replace function private.visibility_allowed(d uuid, vis text) returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $f$
  select vis in ('all', 'buyer', 'seller', 'staff') and (
    private.is_staffish()
    or (vis = 'all' and private.deal_role(d) not in ('Client-Buyer', 'Client-Seller'))
    or (vis in ('buyer', 'seller') and vis = private.side_of(private.deal_role(d)))) $f$;
alter table public.documents enable row level security;
alter table public.documents force row level security;
create policy demo_scope on public.documents as restrictive for all to authenticated using (
CASE
    WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo())
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = documents.deal_id)) = private.viewer_is_demo())
END) with check (
CASE
    WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo())
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = documents.deal_id)) = private.viewer_is_demo())
END);
create policy documents_insert on public.documents for insert to authenticated with check (((uploaded_by = private.effective_uid()) AND private.upload_ext_ok(name) AND (((deal_id IS NOT NULL) AND private.can_access_deal(deal_id) AND (NOT private.is_view_only()) AND private.visibility_allowed(deal_id, visibility) AND ((folder_id IS NULL) OR private.folder_visible(folder_id))) OR ((deal_id IS NULL) AND (private.is_processor() OR private.is_admin()) AND (visibility = 'all'::text)))));
create policy documents_select on public.documents for select to authenticated using (true);
create policy documents_update on public.documents for update to authenticated using (false);
grant select, insert on public.documents to authenticated;
grant select on public.folders to authenticated;
-- extra fake personas: a listing agent (Outside user) on d1, an outside agent with no file, a seller client, a demo agent on d2
insert into public.profiles (id, role, status, is_admin, is_demo, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'Outside user', 'active', false, false, 'list@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'Outside user', 'active', false, false, 'nofile@example.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'Outside user', 'active', false, false, 'seller@example.test'),
  ('00000000-0000-0000-0000-0000000000f4', 'Outside user', 'active', false, true, 'demoagent@example.test'),
  ('00000000-0000-0000-0000-0000000000f5', 'Outside user', 'disabled', false, false, 'gone@example.test'),
  ('00000000-0000-0000-0000-0000000000f6', 'Outside user', 'active', false, false, 'buyagent@example.test');
update public.contacts set profile_id = '00000000-0000-0000-0000-0000000000f1' where id = '00000000-0000-0000-0000-0000000000c7';
update public.contacts set profile_id = '00000000-0000-0000-0000-0000000000f3' where id = '00000000-0000-0000-0000-0000000000c8';
insert into public.contacts (id, profile_id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-0000000000cf', '00000000-0000-0000-0000-0000000000f2', 'No', 'File', 'nf@example.test'),
  ('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000f4', 'Demo', 'Agent', 'da@example.test'),
  ('00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-0000000000f5', 'Gone', 'Agent', 'ga@example.test'),
  ('00000000-0000-0000-0000-0000000000db', '00000000-0000-0000-0000-0000000000f6', 'Buy', 'Agent', 'ba@example.test');
insert into public.deal_participants (id, deal_id, contact_id, role) values
  ('00000000-0000-0000-0000-0000000000dc', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d9', 'Listing Agent'),
  ('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000da', 'Listing Agent'),
  ('00000000-0000-0000-0000-0000000000de', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000db', 'Buyer Agent');
insert into public.folders (id, scope, deal_id, name, staff_only) values
  ('00000000-0000-0000-0000-00000000f001', 'deal', '00000000-0000-0000-0000-0000000000d1', 'Open folder', false),
  ('00000000-0000-0000-0000-00000000f002', 'deal', '00000000-0000-0000-0000-0000000000d1', 'Staff folder', true);
