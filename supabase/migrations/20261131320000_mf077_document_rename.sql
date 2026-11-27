-- MF-077 (Matt, confirmed Nov 27 2026, Gmail 1a21df0b0dc7c8f3): any CLA staff member
-- who can open the file, including Sales Person and Sales Team, can rename a document.
-- The shown name (documents.name) changes; the stored file (storage_path) does not.
-- ID files are not locked. A rename that adds or removes "wire" from the name is allowed
-- after a warning in the app; the wire flag follows the name (private.trg_doc_wire).
-- Each rename is logged as document.renamed (old and new name, who, when), like MF-076.
--
-- Guard: private.documents_immutable() previously blocked any name change. It now allows
-- a name change only when the caller is CLA staff (private.is_staffish) who can open the
-- file (private.can_access_deal), is not in View as, and the document is on a file and in
-- demo scope. deal_id, storage_path, uploaded_by and size_bytes still cannot change.
--
-- RLS: this file does not change documents_update or any column UPDATE grant.
-- On TEST, signed-in users have column UPDATE only on description, doc_type, folder_id,
-- visibility and wire_instructions. A direct UPDATE of name is refused by privilege.
-- The only rename path is public.rename_document (SECURITY DEFINER). The trigger is the
-- backstop for other definer paths. This is a guard change and needs CRM Bot rule 27 review.
--
-- Also: trg_doc_wire unmarks wire_instructions when a rename removes a wire name.
-- An AFTER UPDATE OF name trigger writes document.renamed through private.log_activity.
-- public.rename_document(uuid, text) is the app path (SECURITY DEFINER, same checks).
-- Rollback: supabase/rollbacks/20261131320000_mf077_document_rename.sql
begin;
set local lock_timeout = '3s';

create or replace function private.documents_immutable()
returns trigger
language plpgsql
set search_path to pg_catalog, public, extensions
as $fn$
begin
  if new.deal_id is distinct from old.deal_id
     or new.storage_path is distinct from old.storage_path
     or new.uploaded_by is distinct from old.uploaded_by
     or new.size_bytes is distinct from old.size_bytes then
    raise exception 'The stored file cannot be changed. You can rename what people see, or change the description, visibility or folder.'
      using errcode = '42501';
  end if;
  if new.name is distinct from old.name then
    if private.effective_uid() is null then
      raise exception 'Please sign in.' using errcode = '28000';
    end if;
    if private.is_viewing_as() then
      raise exception 'View as is read-only. Switch back to your own login to rename a document.' using errcode = '42501';
    end if;
    if new.deal_id is null
       or not private.is_staffish()
       or not private.can_access_deal(new.deal_id)
       or not exists (
         select 1
           from public.documents z
          where z.id = new.id
            and z.deal_id in (select private.demo_visible_deal_ids())
       ) then
      raise exception 'Only CLA Title staff who can open this file can rename a document.'
        using errcode = '42501';
    end if;
    if new.name ~ '[[:cntrl:]]' then
      raise exception 'Document names cannot include control characters.' using errcode = '22023';
    end if;
    if char_length(new.name) > 200 then
      raise exception 'That name is too long. Use 200 characters or fewer.' using errcode = '22023';
    end if;
    if not private.upload_ext_ok(new.name) then
      raise exception 'Use one of the allowed file types (pdf, doc, docx, xls, xlsx, csv, txt, png, jpg, jpeg, heic, heif, webp), or keep the current file extension.'
        using errcode = '22023';
    end if;
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
  if tg_op = 'UPDATE' and new.wire_instructions is distinct from old.wire_instructions
     and private.effective_uid() is not null and not private.is_staffish() then
    raise exception 'Only CLA Title staff can mark wire instructions.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.wire_instructions and private.effective_uid() is not null
     and not private.is_staffish() then
    new.wire_instructions := false;
  end if;
  -- A file named as wire instructions stays marked. A rename that drops "wire" from the name unmarks it.
  if private.wire_name(new.name) then
    new.wire_instructions := true;
  elsif tg_op = 'UPDATE' and private.wire_name(old.name) and not private.wire_name(new.name) then
    new.wire_instructions := false;
  end if;
  return new;
end
$fn$;

create or replace function private.trg_document_renamed()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $fn$
declare
  detail text;
begin
  if new.name is not distinct from old.name then
    return new;
  end if;
  if private.is_viewing_as() then
    return new;
  end if;
  detail := 'Renamed "' || coalesce(old.name, '') || '" to "' || coalesce(new.name, '') || '"';
  if private.wire_name(new.name) and not private.wire_name(old.name) then
    detail := detail || '; wire instructions mark added';
  elsif private.wire_name(old.name) and not private.wire_name(new.name) then
    detail := detail || '; wire instructions mark removed';
  end if;
  if private.buyer_agent_blocked(old.title_doc_kind, old.name, old.doc_type, old.wire_instructions)
     and not private.buyer_agent_blocked(new.title_doc_kind, new.name, new.doc_type, new.wire_instructions) then
    detail := detail || '; buyer-agent block lifted';
  end if;
  perform private.log_activity(
    new.deal_id,
    'document.renamed',
    'document',
    new.id,
    detail
  );
  return new;
end
$fn$;
revoke all on function private.trg_document_renamed() from public, anon, authenticated;

drop trigger if exists documents_renamed_log on public.documents;
create trigger documents_renamed_log
  after update of name on public.documents
  for each row
  when (new.name is distinct from old.name)
  execute function private.trg_document_renamed();

create or replace function public.rename_document(p_document uuid, p_name text)
returns void
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $fn$
declare
  me uuid := private.effective_uid();
  n text := btrim(coalesce(p_name, ''));
  doc record;
begin
  if me is null then
    raise exception 'Please sign in.' using errcode = '28000';
  end if;
  if n = '' then
    raise exception 'Enter a document name.' using errcode = '22023';
  end if;
  if n ~ '[[:cntrl:]]' then
    raise exception 'Document names cannot include control characters.' using errcode = '22023';
  end if;
  if char_length(n) > 200 then
    raise exception 'That name is too long. Use 200 characters or fewer.' using errcode = '22023';
  end if;
  if private.is_viewing_as() then
    raise exception 'View as is read-only. Switch back to your own login to rename a document.' using errcode = '42501';
  end if;
  select z.id, z.deal_id, z.name into doc from public.documents z where z.id = p_document;
  -- Missing and not allowed use the same wording so a caller cannot probe whether an id exists.
  if not found
     or doc.deal_id is null
     or not private.is_staffish()
     or not private.can_access_deal(doc.deal_id)
     or doc.deal_id not in (select private.demo_visible_deal_ids()) then
    raise exception 'Document not found.' using errcode = 'P0002';
  end if;
  -- Keep the current extension when the new name has none and that extension is allowed.
  if not private.upload_ext_ok(n) and position('.' in n) = 0 and private.upload_ext_ok(doc.name) then
    n := n || substring(doc.name from '\.[^.]+$');
  end if;
  if not private.upload_ext_ok(n) then
    raise exception 'Use one of the allowed file types (pdf, doc, docx, xls, xlsx, csv, txt, png, jpg, jpeg, heic, heif, webp), or keep the current file extension.'
      using errcode = '22023';
  end if;
  if char_length(n) > 200 then
    raise exception 'That name is too long. Use 200 characters or fewer.' using errcode = '22023';
  end if;
  if doc.name is not distinct from n then
    return;
  end if;
  update public.documents set name = n where id = p_document;
end
$fn$;
revoke all on function public.rename_document(uuid, text) from public, anon;
grant execute on function public.rename_document(uuid, text) to authenticated;

do $chk$
declare
  def text;
begin
  def := pg_get_functiondef('private.documents_immutable()'::regprocedure);
  if def ~ 'new\.name <> old\.name' and def !~ 'is_staffish' then
    raise exception 'self-check: documents_immutable still blocks every name change';
  end if;
  if def !~ 'storage_path' or def !~ 'is_staffish' or def !~ 'can_access_deal' then
    raise exception 'self-check: documents_immutable must still protect the stored file and limit rename to staff with file access';
  end if;
  def := pg_get_functiondef('private.trg_doc_wire()'::regprocedure);
  if def !~ 'not private.wire_name\(new.name\)' then
    raise exception 'self-check: trg_doc_wire must unmark when a rename removes a wire name';
  end if;
  if not exists (
    select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
     where c.relnamespace = 'public'::regnamespace and c.relname = 'documents'
       and not t.tgisinternal and t.tgenabled = 'O' and t.tgname = 'documents_renamed_log'
  ) then
    raise exception 'self-check: documents_renamed_log trigger is missing or disabled';
  end if;
  if not has_function_privilege('authenticated', 'public.rename_document(uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.rename_document(uuid, text)', 'EXECUTE') then
    raise exception 'self-check: rename_document must be for signed-in users only';
  end if;
  def := pg_get_functiondef('public.rename_document(uuid, text)'::regprocedure);
  if position('left(btrim' in def) > 0 or position('upload_ext_ok' in def) = 0
     or position('[:cntrl:]' in def) = 0 or position('char_length(n) > 200' in def) = 0 then
    raise exception 'self-check: rename_document must reject long names, control characters, and disallowed extensions';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_update'
  ) then
    raise exception 'self-check: documents_update policy is missing';
  end if;
end
$chk$;

select private.lock_function_search_paths();

commit;

notify pgrst, 'reload schema';
