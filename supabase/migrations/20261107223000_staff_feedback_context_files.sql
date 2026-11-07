-- Wider evidence files for portal feedback. Not applied by this commit.
-- Does not call private.lock_function_search_paths(). Does not delete storage objects.
-- A stored file is not an analyzed file. analysis_state cannot say otherwise.

alter table public.staff_feedback_attachments
  add column if not exists duration_ms integer,
  add column if not exists analysis_state text not null default 'stored_not_analyzed';

alter table public.staff_feedback_attachments drop constraint if exists staff_feedback_attachment_size_chk;
alter table public.staff_feedback_attachments drop constraint if exists staff_feedback_attachment_mime_chk;
alter table public.staff_feedback_attachments drop constraint if exists staff_feedback_attachment_analysis_chk;
alter table public.staff_feedback_attachments drop constraint if exists staff_feedback_attachment_duration_chk;

alter table public.staff_feedback_attachments
  add constraint staff_feedback_attachment_size_chk check (size_bytes > 0 and size_bytes <= 25000000),
  add constraint staff_feedback_attachment_mime_chk check (mime_type in (
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'video/mp4', 'video/webm')),
  add constraint staff_feedback_attachment_analysis_chk check (analysis_state = 'stored_not_analyzed'),
  add constraint staff_feedback_attachment_duration_chk check (
    (mime_type in ('audio/mpeg', 'audio/mp4', 'audio/wav') and duration_ms between 1 and 180000)
    or (mime_type in ('video/mp4', 'video/webm') and duration_ms between 1 and 120000)
    or (mime_type not in ('audio/mpeg', 'audio/mp4', 'audio/wav', 'video/mp4', 'video/webm') and duration_ms is null));

create or replace function private.staff_feedback_add_context_file(p_report uuid, p_name text, p_mime text, p_size integer, p_path text, p_idempotency uuid, p_duration integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare who jsonb; n int; ext text;
begin
  who := private.staff_feedback_require(false);
  if p_idempotency is null or not private.staff_feedback_visible(p_report) then raise exception 'Report not found.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.staff_feedback_attachments a where a.report_id = p_report and a.idempotency_key = p_idempotency) then return private.staff_feedback_payload(p_report); end if;
  select count(*) into n from public.staff_feedback_attachments where report_id = p_report;
  if n >= 6 then raise exception 'Six files is the limit on one report.' using errcode = 'P0001'; end if;
  ext := lower(regexp_replace(coalesce(p_path, ''), '^.*\.', ''));
  if p_path like '%..%' or split_part(p_path, '/', 2)::uuid is distinct from p_report then raise exception 'The file path is not valid.' using errcode = 'P0001'; end if;
  if ext not in ('png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf', 'docx', 'txt', 'mp3', 'm4a', 'wav', 'mp4', 'webm') then
    raise exception 'The file type does not match its extension.' using errcode = 'P0001'; end if;
  if (ext = 'png' and p_mime <> 'image/png') or (ext in ('jpg', 'jpeg') and p_mime <> 'image/jpeg') or (ext = 'webp' and p_mime <> 'image/webp')
    or (ext = 'gif' and p_mime <> 'image/gif') or (ext = 'pdf' and p_mime <> 'application/pdf')
    or (ext = 'docx' and p_mime <> 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    or (ext = 'txt' and p_mime <> 'text/plain') or (ext = 'mp3' and p_mime <> 'audio/mpeg')
    or (ext = 'm4a' and p_mime <> 'audio/mp4') or (ext = 'wav' and p_mime <> 'audio/wav')
    or (ext = 'mp4' and p_mime <> 'video/mp4') or (ext = 'webm' and p_mime <> 'video/webm') then
    raise exception 'The file type does not match its extension.' using errcode = 'P0001'; end if;
  if p_size is null or p_size <= 0 or p_size > 25000000 then raise exception 'That file is empty or larger than the limit for its type.' using errcode = 'P0001'; end if;
  insert into public.staff_feedback_attachments (report_id, idempotency_key, file_name, mime_type, size_bytes, storage_path, created_by, duration_ms, analysis_state)
    values (p_report, p_idempotency, left(regexp_replace(coalesce(p_name, 'evidence'), '[^A-Za-z0-9._-]+', '_', 'g'), 120), p_mime, p_size, p_path, (who->>'id')::uuid, p_duration, 'stored_not_analyzed');
  update public.staff_feedback_reports set updated_at = now() where id = p_report;
  return private.staff_feedback_payload(p_report);
end $$;

create or replace function public.staff_feedback_add_context_file(p_report uuid, p_name text, p_mime text, p_size integer, p_path text, p_idempotency uuid, p_duration integer) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.staff_feedback_add_context_file(p_report, p_name, p_mime, p_size, p_path, p_idempotency, p_duration) $$;

revoke all on function private.staff_feedback_add_context_file(uuid, text, text, integer, text, uuid, integer) from public, anon;
revoke all on function public.staff_feedback_add_context_file(uuid, text, text, integer, text, uuid, integer) from public, anon;
grant execute on function private.staff_feedback_add_context_file(uuid, text, text, integer, text, uuid, integer) to authenticated;
grant execute on function public.staff_feedback_add_context_file(uuid, text, text, integer, text, uuid, integer) to authenticated;

grant usage on schema private to authenticated, service_role;
