-- Undo MF-077: name changes are blocked again, wire unmark-on-rename is removed,
-- and the rename RPC and activity trigger are dropped. Existing document.renamed
-- log rows stay (nothing is deleted). The documents_update policy is not changed.
begin;
set local lock_timeout = '3s';

drop trigger if exists documents_renamed_log on public.documents;
drop function if exists public.rename_document(uuid, text);
drop function if exists private.trg_document_renamed();

create or replace function private.documents_immutable()
returns trigger
language plpgsql
set search_path to pg_catalog, public, extensions
as $fn$
begin
  if new.deal_id is distinct from old.deal_id or new.name <> old.name or new.storage_path is distinct from old.storage_path or new.uploaded_by <> old.uploaded_by or new.size_bytes <> old.size_bytes then
    raise exception 'Only description, visibility and folder of a document can change';
  end if;
  return new;
end
$fn$;

create or replace function private.trg_doc_wire()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $fn$
begin
  if tg_op = 'UPDATE' and new.wire_instructions is distinct from old.wire_instructions and private.effective_uid() is not null and not private.is_staffish() then
    raise exception 'Only CLA Title staff can mark wire instructions.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.wire_instructions and private.effective_uid() is not null and not private.is_staffish() then
    new.wire_instructions := false;
  end if;
  if private.wire_name(new.name) then
    new.wire_instructions := true;
  end if;
  return new;
end
$fn$;

select private.lock_function_search_paths();

commit;

notify pgrst, 'reload schema';
