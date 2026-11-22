-- Undo 20261125200000_crm_note_files.sql.
-- Drops only what that file adds: note_id, its foreign key, its path check,
-- its index, the column comment (it goes with the column), the note-file
-- trigger, private.crm_note_file_guard and its comment, and the two storage
-- policies crm_note_object_read and crm_note_object_insert.
-- If that migration created the crm bucket, and the bucket has no files, this
-- drops the bucket row too. It does not delete storage.objects rows. If the
-- bucket already existed, it is left alone. If this migration created the
-- bucket and files are still in it, this script stops and changes nothing.
-- It does not change private.crm_row_guard or any other policy.
-- Not applied by this file. The lead runs it only to undo the note-file migration.
-- Never run it on production.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $undo$
declare
  mark text := '';
  created boolean := false;
begin
  if to_regprocedure('private.crm_note_file_guard()') is not null then
    select pg_catalog.obj_description('private.crm_note_file_guard()'::regprocedure, 'pg_proc') into mark;
    created := mark = 'crm-note-file-bucket-created';
  end if;
  if created and to_regclass('storage.objects') is not null
     and exists (select 1 from storage.objects where bucket_id = 'crm') then
    raise exception 'The crm bucket this migration created still has files. Remove those note files, then run this rollback again. This rollback does not delete file bytes.';
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists crm_note_object_insert on storage.objects';
    execute 'drop policy if exists crm_note_object_read on storage.objects';
  end if;
  drop trigger if exists crm_note_file_guard on public.crm_attachments;
  drop function if exists private.crm_note_file_guard();
  drop index if exists public.crm_attachments_note_id_idx;
  alter table if exists public.crm_attachments drop constraint if exists crm_attachments_note_path;
  alter table if exists public.crm_attachments drop constraint if exists crm_attachments_note_fk;
  alter table if exists public.crm_attachments drop column if exists note_id;
  if created and to_regclass('storage.buckets') is not null then
    delete from storage.buckets where id = 'crm';
  end if;
  if to_regclass('public.crm_attachments') is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_attachments' and column_name = 'note_id'
  ) then
    raise exception 'readback: note_id is still on crm_attachments';
  end if;
  if to_regprocedure('private.crm_note_file_guard()') is not null then
    raise exception 'readback: private.crm_note_file_guard() is still installed';
  end if;
  if to_regclass('storage.objects') is not null and exists (
    select 1 from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'
      and pol.polname in ('crm_note_object_read', 'crm_note_object_insert')
  ) then
    raise exception 'readback: a crm note storage policy is still installed';
  end if;
  if created and to_regclass('storage.buckets') is not null
     and exists (select 1 from storage.buckets where id = 'crm') then
    raise exception 'readback: the crm bucket this migration created is still there';
  end if;
end
$undo$;

commit;
