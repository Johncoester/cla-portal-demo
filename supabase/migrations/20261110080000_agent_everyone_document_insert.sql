-- An assigned agent may file a document for CLA staff, for their own side, or for everyone on the file.
-- documents_insert is not changed. Buyers, sellers, and staff keep that policy. Message policies are not changed.
-- A buyer-agent file with visibility all is still read through document_readable: the seller client does not see it
-- unless CLA staff share it with the seller. Wire instructions stay refused on this policy.
begin;
set local lock_timeout = '3s';
do $$
declare n int; h text;
begin
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'documents';
  if n <> 5 then raise exception 'drift: documents has % policies, expected 5', n; end if;
  select md5(coalesce(with_check, '')) into h from pg_policies
    where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_assigned_agent_insert'
      and cmd = 'INSERT' and permissive = 'PERMISSIVE' and roles = '{authenticated}' and qual is null;
  if h is distinct from '13f793479ce28f0a4d6db4cb30ca7a00' then raise exception 'drift: documents_assigned_agent_insert check is %', h; end if;
  select md5(coalesce(with_check, '')) into h from pg_policies
    where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_insert'
      and cmd = 'INSERT' and permissive = 'PERMISSIVE' and roles = '{authenticated}';
  if h is distinct from '37e27c9b0e4d0be52ff1f2a6153ce957' then raise exception 'drift: documents_insert check is %', h; end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'demo_scope' and permissive = 'RESTRICTIVE' and cmd = 'ALL') then
    raise exception 'drift: demo_scope restrictive policy missing'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'messages') <> 2 then raise exception 'drift: messages policies changed'; end if;
  if (select md5(coalesce(with_check, '')) from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_insert') is distinct from 'a7af3ba7d19e600ca5a793556bddf334' then
    raise exception 'drift: messages_insert changed'; end if;
  if (select md5(coalesce(qual, '')) from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_select') is distinct from '99a3ced0c675d4358809fe926bff6cce' then
    raise exception 'drift: messages_select changed'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.documents'::regclass) then raise exception 'drift: documents RLS is off'; end if;
end $$;

drop policy documents_assigned_agent_insert on public.documents;

create policy documents_assigned_agent_insert
  on public.documents
  as permissive
  for insert
  to authenticated
  with check (
    (
      visibility = 'staff'
      or visibility = 'all'
      or (visibility = 'buyer' and 'Buyer Agent' = any (private.deal_roles(deal_id)))
      or (visibility = 'seller' and 'Listing Agent' = any (private.deal_roles(deal_id)))
    )
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
  select with_check into c from pg_policies
    where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_assigned_agent_insert'
      and cmd = 'INSERT' and permissive = 'PERMISSIVE' and roles = '{authenticated}' and qual is null;
  if c is null
     or position('''all''' in c) = 0
     or position('''staff''' in c) = 0
     or position('Buyer Agent' in c) = 0
     or position('Listing Agent' in c) = 0
     or position('upload_ext_ok' in c) = 0
     or position('wire_instructions' in c) = 0
     or position('can_access_deal' in c) = 0
     or position('is_view_only' in c) = 0
     or position('folder_visible' in c) = 0
     or position('Outside user' in c) = 0 then
    raise exception 'readback: unexpected check %', c; end if;
  if (select md5(coalesce(with_check, '')) from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_insert') is distinct from '37e27c9b0e4d0be52ff1f2a6153ce957' then
    raise exception 'readback: documents_insert changed'; end if;
  if (select md5(coalesce(with_check, '')) from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_insert') is distinct from 'a7af3ba7d19e600ca5a793556bddf334' then
    raise exception 'readback: messages_insert changed'; end if;
end $$;
commit;
