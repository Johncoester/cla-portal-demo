-- Francis (Nov 6): an active agent who is on a file may save a document for CLA staff only.
-- Narrowed replacement for the held 20261107024500_agent_document_insert.sql (2d8abb30...): it adds ONLY the
-- missing case (visibility 'staff'), and keeps every check the existing documents_insert policy makes
-- (effective_uid, allowed file type, not view-only, file access, folder visibility). Own-side uploads are
-- already allowed by documents_insert. No existing policy is dropped or changed. Wire instructions are refused.
begin;
set local lock_timeout = '3s';
do $$
declare n int; h text;
begin
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'documents';
  if n <> 4 then raise exception 'drift: documents has % policies, expected 4', n; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_assigned_agent_insert') then
    raise exception 'drift: documents_assigned_agent_insert already exists'; end if;
  select md5(coalesce(with_check, '')) into h from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_insert' and cmd = 'INSERT' and permissive = 'PERMISSIVE' and roles = '{authenticated}';
  if h is distinct from '37e27c9b0e4d0be52ff1f2a6153ce957' then raise exception 'drift: documents_insert check is %', h; end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'demo_scope' and permissive = 'RESTRICTIVE' and cmd = 'ALL') then
    raise exception 'drift: demo_scope restrictive policy missing'; end if;
  if (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'private'
      and p.proname in ('effective_uid', 'upload_ext_ok', 'me_role', 'is_view_only', 'can_access_deal', 'deal_roles', 'folder_visible')) <> 7 then
    raise exception 'drift: a private helper is missing'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.documents'::regclass) then raise exception 'drift: documents RLS is off'; end if;
end $$;

create policy documents_assigned_agent_insert
  on public.documents
  as permissive
  for insert
  to authenticated
  with check (
    visibility = 'staff'
    and uploaded_by = private.effective_uid()
    and private.upload_ext_ok(name)
    and not coalesce(wire_instructions, false)
    and deal_id is not null
    and private.me_role() = 'Outside user'
    and not private.is_view_only()
    and private.can_access_deal(deal_id)
    and private.deal_roles(deal_id) && array['Listing Agent', 'Buyer Agent']::text[]
    and (folder_id is null or private.folder_visible(folder_id))
  );

do $$
declare n int; c text;
begin
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'documents';
  if n <> 5 then raise exception 'readback: documents has % policies, expected 5', n; end if;
  select with_check into c from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_assigned_agent_insert' and cmd = 'INSERT' and permissive = 'PERMISSIVE' and roles = '{authenticated}' and qual is null;
  if c is null or position('''staff''' in c) = 0 or position('upload_ext_ok' in c) = 0 or position('can_access_deal' in c) = 0 or position('folder_visible' in c) = 0 or position('is_view_only' in c) = 0 then
    raise exception 'readback: unexpected check %', c; end if;
  if (select md5(coalesce(with_check, '')) from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_insert') <> '37e27c9b0e4d0be52ff1f2a6153ce957' then
    raise exception 'readback: documents_insert changed'; end if;
end $$;
commit;
