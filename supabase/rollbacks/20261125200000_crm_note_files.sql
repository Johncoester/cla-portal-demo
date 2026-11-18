-- Undo 20261125200000_crm_note_files.sql.
-- Puts public.crm_attachments back to having no note_id column, which is the
-- before-definition this migration changed. Drops the note-file check, the
-- note index, the note-file trigger, and private.crm_note_file_guard.
-- Drops the two storage policies crm_note_object_read and crm_note_object_insert.
-- Does not drop the crm bucket and does not delete storage.objects rows.
-- Does not change private.crm_row_guard or any policy on crm_attachments,
-- deals, tasks, or profiles.
-- Not applied by this file. The lead runs it only to undo the note-file migration.
-- Never run it on production.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $storage$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists crm_note_object_insert on storage.objects';
    execute 'drop policy if exists crm_note_object_read on storage.objects';
  end if;
end
$storage$;

drop trigger if exists crm_note_file_guard on public.crm_attachments;
drop function if exists private.crm_note_file_guard();

drop index if exists public.crm_attachments_note_id_idx;

alter table if exists public.crm_attachments drop constraint if exists crm_attachments_note_path;
alter table if exists public.crm_attachments drop constraint if exists crm_attachments_note_fk;
alter table if exists public.crm_attachments drop column if exists note_id;

do $after$
begin
  if to_regclass('public.crm_attachments') is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_attachments' and column_name = 'note_id'
  ) then
    raise exception 'readback: note_id is still on crm_attachments';
  end if;
  if to_regprocedure('private.crm_note_file_guard()') is not null then
    raise exception 'readback: private.crm_note_file_guard() is still installed';
  end if;
end
$after$;

commit;
