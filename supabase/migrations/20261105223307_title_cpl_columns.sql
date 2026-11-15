-- Already applied on TEST. Do not apply this file to TEST again.
-- Source: TEST history version 20261105223307, name nov5_feedback_task_admin, project aqcervntopidtcazcmlv.
-- These are the title_cpls column lines from that history row, copied verbatim.
-- The rest of that history row is not in this file. It replaces task and document
-- functions the repo already has. This is not the whole statement.
alter table public.title_cpls add column if not exists status text not null default 'issued';
alter table public.title_cpls drop constraint if exists title_cpls_status_check;
alter table public.title_cpls add constraint title_cpls_status_check check (status in ('issued', 'blocked'));
alter table public.title_cpls add column if not exists escalated boolean not null default false;
alter table public.title_cpls add column if not exists price_id uuid;
