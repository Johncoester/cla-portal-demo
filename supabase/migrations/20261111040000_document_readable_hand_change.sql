-- Hand change on TEST between Nov 5 and Nov 11. Already on TEST. Do not apply this file to TEST again.
-- Not in TEST's migration history. Kept so a fresh database reaches the document read check.
-- private.document_readable body copied exactly from supabase/rollbacks/20261111050000_document_readable_one_pass.sql.
-- The body differs from the Nov 5 statement only where that statement calls auth.uid(). This copy calls private.effective_uid().
-- The create line also sets search_path to pg_catalog, public, extensions. The Nov 5 statement sets search_path to public.
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

revoke all on function private.document_readable(uuid) from public, anon;
grant execute on function private.document_readable(uuid) to authenticated;
