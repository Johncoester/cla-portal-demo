-- Restore the helper-chain document_readable body. Policies are not changed.
begin;
set local lock_timeout = '3s';

do $pre$
declare
  n int;
  q text;
begin
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'documents';
  if n is distinct from 5 then
    raise exception 'drift: documents has % policies, expected 5', n;
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_select';
  if q is distinct from 'private.document_readable(id)' then
    raise exception 'drift: documents_select qual changed';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'document_readable'
      and pg_get_function_identity_arguments(p.oid) = 'doc uuid'
      and p.prosecdef
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'ba16cbd650a3322dd0f300c09d1aa8cd0e3b8b390591e3cac8f712cc2c58b7fc'
  ) then
    raise exception 'drift: private.document_readable(uuid) is not the one-pass body';
  end if;
end
$pre$;

create or replace function private.document_readable(doc uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
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

do $post$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'document_readable'
      and pg_get_function_identity_arguments(p.oid) = 'doc uuid'
      and pg_get_function_result(p.oid) = 'boolean'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '4625479cd07eeb7fe2355cbe3fe5ed502981d270d22a36df41fbd369a6ec93c3'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'rollback did not restore private.document_readable(uuid)';
  end if;
  if (select qual from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_select')
     is distinct from 'private.document_readable(id)' then
    raise exception 'rollback changed documents_select';
  end if;
end
$post$;

commit;
