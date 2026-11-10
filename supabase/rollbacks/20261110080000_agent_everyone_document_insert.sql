-- Restore the staff-only assigned-agent insert. documents_insert and message policies stay as they are.
begin;
set local lock_timeout = '3s';
do $$
declare c text;
begin
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'documents') <> 5 then raise exception 'drift: expected 5 documents policies'; end if;
  select with_check into c from pg_policies
    where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_assigned_agent_insert' and cmd = 'INSERT';
  if c is null or position('''all''' in c) = 0 or position('Buyer Agent' in c) = 0 or position('Listing Agent' in c) = 0 then
    raise exception 'drift: agent insert policy is not the everyone/own-side policy'; end if;
  if (select md5(coalesce(with_check, '')) from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_insert') is distinct from '37e27c9b0e4d0be52ff1f2a6153ce957' then
    raise exception 'drift: documents_insert changed'; end if;
  if (select md5(coalesce(with_check, '')) from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_insert') is distinct from 'a7af3ba7d19e600ca5a793556bddf334' then
    raise exception 'drift: messages_insert changed'; end if;
end $$;

drop policy documents_assigned_agent_insert on public.documents;

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
declare h text;
begin
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'documents') <> 5 then raise exception 'readback: expected 5 documents policies'; end if;
  select md5(coalesce(with_check, '')) into h from pg_policies
    where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_assigned_agent_insert' and cmd = 'INSERT';
  if h is distinct from '13f793479ce28f0a4d6db4cb30ca7a00' then raise exception 'readback: staff-only policy hash is %', h; end if;
  if position('''all''' in (select with_check from pg_policies where policyname = 'documents_assigned_agent_insert')) > 0 then
    raise exception 'readback: everyone visibility is still on the agent policy'; end if;
  if (select md5(coalesce(with_check, '')) from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_insert') is distinct from '37e27c9b0e4d0be52ff1f2a6153ce957' then
    raise exception 'readback: documents_insert changed'; end if;
end $$;
commit;
