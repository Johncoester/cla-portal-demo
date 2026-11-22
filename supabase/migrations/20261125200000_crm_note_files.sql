-- CRM Feedback 27 item 2 (Janine, confirmed Nov 16 2026).
-- A file on a note. Not applied by this commit. The lead applies it on TEST.
-- Never run it on production (bxixxgcqxmtzkrolywas).
--
-- How to apply: in the TEST SQL editor, run this whole file once.
-- How to undo: run supabase/rollbacks/20261125200000_crm_note_files.sql
--
-- The file stays on that note. It is not a row in the record's Attachments
-- list. The same public.crm_attachments table is used. note_id empty means a
-- record attachment (unchanged). note_id set means the file belongs to that
-- note, and storage_path starts with notes/.
--
-- Before this change, public.crm_attachments has no note_id column. This file
-- relies on these columns and does not rewrite them:
--   id uuid, entity text, entity_id uuid, name text, mime_type text,
--   size bigint, storage_path text, uploaded_by uuid, created_at timestamptz
-- The six policies on crm_attachments (crm_att_select, crm_att_insert,
-- crm_att_select_email, crm_att_insert_email, crm_att_select_tpl,
-- crm_att_insert_tpl) are not altered. private.crm_row_guard is not replaced.
-- No new per-row private helper. No change to a policy on deals, tasks, or
-- profiles. Those facts are checked at the start and again at the end.
--
-- Bytes go to the private bucket named crm, under notes/<entity>/<record>/<note>/<file>/<name>.
-- That is the bucket the CRM attachment code already expects. Record
-- attachments are not uploaded by this file. If the storage tables are not
-- installed, the column is still added and the bucket step is skipped.
--
-- Who can open the file is the same as who can read that note. The storage
-- policies look up public.crm_activities by its primary key (the note id in
-- the path). That lookup runs as the caller, so the note's own row security
-- applies. They do not call a per-row private helper. (select private.crm_editor())
-- and (select private.is_admin()) run once per statement. Insert also requires
-- edit rights: the caller is a CRM editor, and they wrote the note or they are
-- an admin, and the note was not written by the CRM.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

create temporary table crm_note_file_before (
  kind text primary key,
  mark text not null
) on commit drop;

do $before$
declare
  col text;
  need text[] := array['id', 'entity', 'entity_id', 'name', 'mime_type', 'size', 'storage_path', 'uploaded_by', 'created_at'];
  rel text;
  n int;
  def text;
begin
  if to_regclass('public.crm_attachments') is null then
    raise exception 'drift: public.crm_attachments is missing';
  end if;
  if to_regclass('public.crm_activities') is null then
    raise exception 'drift: public.crm_activities is missing';
  end if;
  if to_regprocedure('private.crm_row_guard()') is null then
    raise exception 'drift: private.crm_row_guard() is missing';
  end if;
  if to_regprocedure('private.crm_editor()') is null then
    raise exception 'drift: private.crm_editor() is missing';
  end if;
  if to_regprocedure('private.is_admin()') is null then
    raise exception 'drift: private.is_admin() is missing';
  end if;
  foreach col in array need loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'crm_attachments' and column_name = col
    ) then
      raise exception 'drift: public.crm_attachments.% is missing', col;
    end if;
  end loop;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_attachments' and column_name = 'note_id'
  ) then
    raise exception 'drift: public.crm_attachments.note_id already exists';
  end if;
  if exists (select 1 from public.crm_attachments where storage_path like 'notes/%') then
    raise exception 'drift: a crm attachment already uses a notes/ path';
  end if;
  select md5(pg_get_functiondef('private.crm_row_guard()'::regprocedure)) into def;
  insert into crm_note_file_before (kind, mark) values ('guard', def);
  foreach rel in array array['deals', 'tasks', 'profiles', 'crm_attachments'] loop
    select count(*) into n
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = rel;
    insert into crm_note_file_before (kind, mark) values ('pol:' || rel, n::text);
  end loop;
end
$before$;

alter table public.crm_attachments
  add column note_id uuid;

alter table public.crm_attachments
  add constraint crm_attachments_note_fk
  foreign key (note_id) references public.crm_activities (id);

alter table public.crm_attachments
  add constraint crm_attachments_note_path check (
    (note_id is null and storage_path not like 'notes/%')
    or (note_id is not null and storage_path like 'notes/%')
  );

comment on column public.crm_attachments.note_id is
  'When set, this file belongs to that note only. It is not part of the record Attachments list. Empty means a record attachment.';

create index crm_attachments_note_id_idx
  on public.crm_attachments (note_id)
  where note_id is not null;

-- Integrity only. Who may insert is still the existing crm_attachments policy.
-- This does not call a private helper.
create or replace function private.crm_note_file_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  note_entity text;
  note_record uuid;
  note_author uuid;
  note_system boolean;
  admin_ok boolean;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Attachments are kept as uploaded; they cannot be changed or deleted.'
      using errcode = 'P0001';
  end if;
  if new.note_id is null then
    if new.storage_path like 'notes/%' then
      raise exception 'A record attachment cannot use a note file path.'
        using errcode = '23514';
    end if;
    return new;
  end if;
  if new.entity not in ('lead', 'contact', 'account') then
    raise exception 'A file on a note belongs to a lead, client, or company.'
      using errcode = 'P0001';
  end if;
  select n.entity, n.entity_id, n.created_by, n.system
    into note_entity, note_record, note_author, note_system
  from public.crm_activities n
  where n.id = new.note_id and n.kind = 'note';
  if note_entity is null or note_entity is distinct from new.entity or note_record is distinct from new.entity_id then
    raise exception 'That file has to be attached to a note on this record.'
      using errcode = 'P0001';
  end if;
  if coalesce(note_system, false) then
    raise exception 'This note was added by the CRM and cannot be changed.'
      using errcode = 'P0001';
  end if;
  if auth.uid() is not null and auth.uid() is distinct from note_author then
    select coalesce(p.is_admin, false) and p.status = 'active' and p.role in ('Admin', 'Super admin')
      into admin_ok
    from public.profiles p
    where p.id = auth.uid();
    if not coalesce(admin_ok, false) then
      raise exception 'Only the person who wrote this note, or an admin, can attach a file to it.'
        using errcode = '42501';
    end if;
  end if;
  if new.storage_path !~ ('^notes/' || new.entity || '/' || new.entity_id::text || '/' || new.note_id::text || '/' || new.id::text || '/[^/]+$') then
    raise exception 'That file was not stored with the note.'
      using errcode = '23514';
  end if;
  return new;
end
$fn$;

revoke all on function private.crm_note_file_guard() from public, anon, authenticated;

drop trigger if exists crm_note_file_guard on public.crm_attachments;
create trigger crm_note_file_guard
  before insert on public.crm_attachments
  for each row execute function private.crm_note_file_guard();

comment on function private.crm_note_file_guard() is 'crm-note-file-bucket-existed';

-- Read: the note id in the path is public.crm_activities.id (the primary key).
-- The lookup runs as the caller, so that table's own row security decides
-- whether this person can read the note. A cast runs only inside CASE, so a
-- path that is not a note id does not abort the whole read.
-- Insert: the same primary-key lookup, plus edit rights. (select private.crm_editor())
-- and (select private.is_admin()) are each one check for the statement.
do $storage$
declare
  bucket_created boolean := false;
  note_ok text := $n$
    n.id = (
      select parsed.note_id from (
        select case
          when split_part(storage.objects.name, '/', 4) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(storage.objects.name, '/', 4)::uuid
        end as note_id
      ) parsed
      where parsed.note_id is not null
    )
    and n.kind = 'note'
    and n.entity = split_part(storage.objects.name, '/', 2)
    and n.entity_id is not distinct from (
      select parsed.record_id from (
        select case
          when split_part(storage.objects.name, '/', 3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(storage.objects.name, '/', 3)::uuid
        end as record_id
      ) parsed
    )$n$;
  read_using text;
  insert_check text;
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    return;
  end if;
  if exists (
    select 1 from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'
      and pol.polname in ('crm_note_object_read', 'crm_note_object_insert')
  ) then
    raise exception 'drift: a crm note storage policy already exists';
  end if;
  if exists (select 1 from storage.buckets where id = 'crm' and public) then
    raise exception 'drift: storage bucket crm is public';
  end if;
  if not exists (select 1 from storage.buckets where id = 'crm') then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit'
    ) then
      insert into storage.buckets (id, name, public, file_size_limit)
      values ('crm', 'crm', false, 25000000);
    else
      insert into storage.buckets (id, name, public) values ('crm', 'crm', false);
    end if;
    bucket_created := true;
  end if;
  read_using := format($pol$
    bucket_id = 'crm'
    and split_part(storage.objects.name, '/', 1) = 'notes'
    and exists (
      select 1 from public.crm_activities n
      where %s
    )$pol$, note_ok);
  insert_check := format($pol$
    bucket_id = 'crm'
    and (select private.crm_editor())
    and split_part(storage.objects.name, '/', 1) = 'notes'
    and exists (
      select 1 from public.crm_activities n
      where %s
        and not n.system
        and (n.created_by = (select auth.uid()) or (select private.is_admin()))
    )$pol$, note_ok);
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'storage' and p.proname = 'allow_any_operation'
  ) then
    read_using := read_using || $x$
    and storage.allow_any_operation(array['object.get_authenticated', 'object.get_authenticated_info'])$x$;
  end if;
  execute 'create policy crm_note_object_read on storage.objects for select to authenticated using (' || read_using || ')';
  execute 'create policy crm_note_object_insert on storage.objects for insert to authenticated with check (' || insert_check || ')';
  if bucket_created then
    comment on function private.crm_note_file_guard() is 'crm-note-file-bucket-created';
  end if;
end
$storage$;

do $after$
declare
  rel text;
  n int;
  was text;
  def text;
  typ text;
begin
  select data_type into typ from information_schema.columns
  where table_schema = 'public' and table_name = 'crm_attachments' and column_name = 'note_id';
  if typ is distinct from 'uuid' then
    raise exception 'readback: note_id is %', typ;
  end if;
  if to_regprocedure('private.crm_note_file_guard()') is null then
    raise exception 'readback: private.crm_note_file_guard() is missing';
  end if;
  select md5(pg_get_functiondef('private.crm_row_guard()'::regprocedure)) into def;
  select mark into was from crm_note_file_before where kind = 'guard';
  if def is distinct from was then
    raise exception 'readback: private.crm_row_guard changed';
  end if;
  foreach rel in array array['deals', 'tasks', 'profiles', 'crm_attachments'] loop
    select count(*) into n
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = rel;
    select mark into was from crm_note_file_before where kind = 'pol:' || rel;
    if n::text is distinct from was then
      raise exception 'readback: policies on % changed (% to %)', rel, was, n;
    end if;
  end loop;
end
$after$;

commit;
