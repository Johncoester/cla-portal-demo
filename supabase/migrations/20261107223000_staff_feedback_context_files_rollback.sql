-- Undo 20261107223000_staff_feedback_context_files.sql.
-- Does not delete storage.buckets or storage.objects. Existing evidence rows stay.
-- Narrowing the type list is skipped while a non-image row is still present.

drop function if exists public.staff_feedback_add_context_file(uuid, text, text, integer, text, uuid, integer);
drop function if exists private.staff_feedback_add_context_file(uuid, text, text, integer, text, uuid, integer);

alter table public.staff_feedback_attachments drop constraint if exists staff_feedback_attachment_duration_chk;
alter table public.staff_feedback_attachments drop constraint if exists staff_feedback_attachment_analysis_chk;
alter table public.staff_feedback_attachments drop column if exists duration_ms;
alter table public.staff_feedback_attachments drop column if exists analysis_state;

do $$
begin
  if to_regclass('public.staff_feedback_attachments') is null then return; end if;
  if exists (select 1 from public.staff_feedback_attachments where mime_type not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif') or size_bytes > 5000000) then
    return;
  end if;
  alter table public.staff_feedback_attachments drop constraint if exists staff_feedback_attachment_size_chk;
  alter table public.staff_feedback_attachments drop constraint if exists staff_feedback_attachment_mime_chk;
  alter table public.staff_feedback_attachments
    add constraint staff_feedback_attachment_size_chk check (size_bytes > 0 and size_bytes <= 5000000),
    add constraint staff_feedback_attachment_mime_chk check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif'));
end $$;
