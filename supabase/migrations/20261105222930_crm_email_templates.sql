-- Already applied on TEST. Do not apply this file to TEST again.
-- Source: TEST history, supabase_migrations.schema_migrations, project aqcervntopidtcazcmlv.
-- Version 20261105222930, name crm_email_templates.
-- The text below this label is the exact history statement. The label is not part of that text.
-- =====================================================================
-- =====================================================================
-- Migration 27 (John / Janine, Nov 3): CRM EMAIL TEMPLATES (Zoho video 6). See docs/CRM.md "Email templates". Re-runnable (idempotent). Builds on 22 / 24 / 25.
--  * crm_email_folders: shared folders. Only Admin / Super admin (private.is_admin) create and rename them; everyone with CRM access sees them.
--    Each user's PERSONAL folder is not a row: a template with personal_owner = that user (only they see it).
--  * crm_email_templates: name, module (lead / contact / account / opportunity; fixed after creation), subject, kind (html = written email,
--    builder = graphic email blocks), body / blocks, page_bg, status (active / draft), retired_at (retire = hidden; undo by clearing it).
--    Created by Admin / Sales Person / Sales Team (private.crm_editor); changed by its creator or an Admin. The Processor only reads.
--    Never deleted (no grant + trigger). A last-line check refuses script / event-handler / javascript: HTML (the screens sanitize first).
--  * crm_email_template_files: template attachments = crm_attachments rows with entity 'template' (PDF / PNG / JPG). Detach = detached_at;
--    files are never deleted.
--  * crm_email_favorites (per user, on / off), crm_user_signatures (each user's own ${User Signature}; only they read or write it).
--  * NOTHING HERE SENDS EMAIL. There is no outbox row, no send function and no tracking table: that waits for the Gmail connection.
-- =====================================================================

create or replace function private.crm_html_safe(t text) returns boolean language sql immutable as $$
  select t is null or not (t ~* '<\s*/?\s*(script|iframe|object|embed|style|svg|math|form|meta|link|base)\M' or t ~* '<[^>]*\son[a-z]+\s*=' or t ~* '(java|vb)script\s*:' or t ~* 'data:\s*text/html') $$;

create table if not exists public.crm_email_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60 and name !~ '[[:cntrl:]]' and name = btrim(name)),
  position integer not null default 0,
  created_by uuid references public.profiles (id), created_at timestamptz not null default now(),
  modified_by uuid references public.profiles (id), modified_at timestamptz not null default now());
create unique index if not exists crm_email_folders_name_idx on public.crm_email_folders (lower(name));

create table if not exists public.crm_email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120 and name !~ '[[:cntrl:]]'),
  module text not null check (module in ('lead', 'contact', 'account', 'opportunity')),
  folder_id uuid references public.crm_email_folders (id), personal_owner uuid references public.profiles (id),
  subject text not null check (char_length(btrim(subject)) between 1 and 250 and subject !~ '[[:cntrl:]]'),
  kind text not null default 'html' check (kind in ('html', 'builder')),
  body text not null default '' check (char_length(body) <= 600000),
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array' and jsonb_array_length(blocks) <= 60 and char_length(blocks::text) <= 600000),
  page_bg text not null default '' check (page_bg ~ '^[#a-zA-Z0-9(),. %]{0,40}$'),
  status text not null default 'active' check (status in ('active', 'draft')),
  retired_at timestamptz, retired_by uuid references public.profiles (id), copied_from uuid,
  created_by uuid references public.profiles (id), created_at timestamptz not null default now(),
  modified_by uuid references public.profiles (id), modified_at timestamptz not null default now(),
  constraint crm_email_templates_folder check ((folder_id is null) <> (personal_owner is null)));
alter table public.crm_email_templates drop constraint if exists crm_email_templates_safe;
alter table public.crm_email_templates add constraint crm_email_templates_safe check (private.crm_html_safe(body) and private.crm_html_safe(blocks::text));
create index if not exists crm_email_templates_module_idx on public.crm_email_templates (module) where retired_at is null;

-- template files ride in crm_attachments (entity 'template'), so the existing file rules apply (never updated, never deleted)
alter table public.crm_attachments drop constraint if exists crm_attachments_entity_check;
alter table public.crm_attachments add constraint crm_attachments_entity_check check (entity in ('lead', 'contact', 'account', 'template'));
alter table public.crm_attachments drop constraint if exists crm_attachments_template_ext;
alter table public.crm_attachments add constraint crm_attachments_template_ext check (entity <> 'template' or lower(substring(name from '\.([^.]+)$')) in ('pdf', 'png', 'jpg', 'jpeg'));

create table if not exists public.crm_email_template_files (
  template_id uuid not null references public.crm_email_templates (id), attachment_id uuid not null references public.crm_attachments (id),
  attached_by uuid references public.profiles (id), attached_at timestamptz not null default now(),
  detached_at timestamptz, detached_by uuid references public.profiles (id),
  primary key (template_id, attachment_id));
create table if not exists public.crm_email_favorites (
  user_id uuid not null references public.profiles (id), template_id uuid not null references public.crm_email_templates (id), "on" boolean not null default true,
  modified_at timestamptz not null default now(), primary key (user_id, template_id));
create table if not exists public.crm_user_signatures (
  user_id uuid primary key references public.profiles (id), html text not null default '' check (char_length(html) <= 20000 and private.crm_html_safe(html)),
  modified_at timestamptz not null default now());

-- ---------- helpers ----------
create or replace function private.crm_template_visible(p_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.crm_user() and exists (select 1 from public.crm_email_templates t where t.id = p_id and (t.personal_owner is null or t.personal_owner = auth.uid())) $$;
create or replace function private.crm_template_editable(p_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.crm_editor() and exists (select 1 from public.crm_email_templates t where t.id = p_id and (t.personal_owner is null or t.personal_owner = auth.uid())
    and (t.created_by = auth.uid() or private.is_admin())) $$;

-- ---------- guard (no deletes; stamps; module / kind fixed; personal folder = yourself only; file links match their template) ----------
create or replace function private.crm_email_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Email templates, folders, files and signatures are never deleted (retire or detach instead).' using errcode = 'P0001'; end if;
  if tg_table_name = 'crm_email_folders' then
    new.name := btrim(new.name); new.modified_by := coalesce(auth.uid(), new.modified_by); new.modified_at := now();
    if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); new.created_at := now(); end if;
  elsif tg_table_name = 'crm_email_templates' then
    new.name := btrim(new.name); new.subject := btrim(new.subject); new.modified_by := coalesce(auth.uid(), new.modified_by); new.modified_at := now();
    if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); new.created_at := now(); new.retired_at := null; new.retired_by := null;
    else
      if new.module is distinct from old.module then raise exception 'A template stays tied to its module; use Save As to make one for another module.' using errcode = 'P0001'; end if;
      if new.kind is distinct from old.kind then raise exception 'A written template cannot turn into a builder one (or back); use Save As.' using errcode = 'P0001'; end if;
      if (new.created_by, new.created_at) is distinct from (old.created_by, old.created_at) then raise exception 'Who made a template never changes.' using errcode = 'P0001'; end if;
      if new.retired_at is not null and old.retired_at is null then new.retired_by := coalesce(auth.uid(), new.retired_by); elsif new.retired_at is null then new.retired_by := null; end if;
    end if;
    if auth.uid() is not null and new.personal_owner is not null and new.personal_owner <> auth.uid() and (tg_op = 'INSERT' or new.personal_owner is distinct from old.personal_owner) then
      raise exception 'You can only save into shared folders or your own folder.' using errcode = '42501'; end if;
  elsif tg_table_name = 'crm_email_template_files' then
    if tg_op = 'INSERT' then
      if not exists (select 1 from public.crm_attachments a where a.id = new.attachment_id and a.entity = 'template' and a.entity_id = new.template_id) then
        raise exception 'That file was not uploaded to this template.' using errcode = 'P0001'; end if;
      new.attached_by := coalesce(auth.uid(), new.attached_by); new.attached_at := now(); new.detached_at := null; new.detached_by := null;
    else
      if (new.template_id, new.attachment_id) is distinct from (old.template_id, old.attachment_id) then raise exception 'A file link cannot move.' using errcode = 'P0001'; end if;
      new.detached_by := case when new.detached_at is null then null else coalesce(auth.uid(), new.detached_by) end;
    end if;
  else
    new.modified_at := now();
  end if;
  return new; end $$;
do $t$ declare t text; begin foreach t in array array['crm_email_folders', 'crm_email_templates', 'crm_email_template_files', 'crm_email_favorites', 'crm_user_signatures'] loop
  execute format('drop trigger if exists %I on public.%I', t || '_guard', t);
  execute format('create trigger %I before insert or update or delete on public.%I for each row execute function private.crm_email_guard()', t || '_guard', t);
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from public, anon, authenticated', t);
  execute format('grant select, insert, update on public.%I to authenticated', t);   -- never delete
  execute format('drop policy if exists %I on public.%I', t || '_read', t); execute format('drop policy if exists %I on public.%I', t || '_insert', t); execute format('drop policy if exists %I on public.%I', t || '_update', t);
end loop; end $t$;
-- folders: everyone with the CRM reads; Admin / Super admin write
create policy crm_email_folders_read on public.crm_email_folders for select to authenticated using (private.crm_user());
create policy crm_email_folders_insert on public.crm_email_folders for insert to authenticated with check (private.crm_on() and private.is_admin());
create policy crm_email_folders_update on public.crm_email_folders for update to authenticated using (private.crm_on() and private.is_admin()) with check (private.crm_on() and private.is_admin());
-- templates: shared ones for every CRM user, personal ones for their owner; editors create; the creator or an Admin changes
create policy crm_email_templates_read on public.crm_email_templates for select to authenticated using (private.crm_user() and (personal_owner is null or personal_owner = auth.uid()));
create policy crm_email_templates_insert on public.crm_email_templates for insert to authenticated with check (private.crm_editor() and (personal_owner is null or personal_owner = auth.uid()));
create policy crm_email_templates_update on public.crm_email_templates for update to authenticated
  using (private.crm_editor() and (personal_owner is null or personal_owner = auth.uid()) and (created_by = auth.uid() or private.is_admin()))
  with check (private.crm_editor() and (personal_owner is null or personal_owner = auth.uid()));
-- template files
create policy crm_email_template_files_read on public.crm_email_template_files for select to authenticated using (private.crm_template_visible(template_id));
create policy crm_email_template_files_insert on public.crm_email_template_files for insert to authenticated with check (private.crm_template_editable(template_id));
create policy crm_email_template_files_update on public.crm_email_template_files for update to authenticated using (private.crm_template_editable(template_id)) with check (private.crm_template_editable(template_id));
drop policy if exists crm_att_select_tpl on public.crm_attachments;
create policy crm_att_select_tpl on public.crm_attachments for select to authenticated using (entity = 'template' and private.crm_template_visible(entity_id));
drop policy if exists crm_att_insert_tpl on public.crm_attachments;
create policy crm_att_insert_tpl on public.crm_attachments for insert to authenticated with check (entity = 'template' and private.crm_template_editable(entity_id));
-- favorites + signatures: your own only
create policy crm_email_favorites_read on public.crm_email_favorites for select to authenticated using (private.crm_user() and user_id = auth.uid());
create policy crm_email_favorites_insert on public.crm_email_favorites for insert to authenticated with check (private.crm_user() and user_id = auth.uid() and private.crm_template_visible(template_id));
create policy crm_email_favorites_update on public.crm_email_favorites for update to authenticated using (private.crm_user() and user_id = auth.uid()) with check (private.crm_user() and user_id = auth.uid());
create policy crm_user_signatures_read on public.crm_user_signatures for select to authenticated using (private.crm_user() and user_id = auth.uid());
create policy crm_user_signatures_insert on public.crm_user_signatures for insert to authenticated with check (private.crm_user() and user_id = auth.uid());
create policy crm_user_signatures_update on public.crm_user_signatures for update to authenticated using (private.crm_user() and user_id = auth.uid()) with check (private.crm_user() and user_id = auth.uid());

-- the four shared folders from Janine's video (folder names only; no templates or people data are seeded here)
insert into public.crm_email_folders (name, position) values ('Events / Training', 1), ('John', 2), ('Monthly Campaigns', 3), ('Recruiter', 4) on conflict do nothing;
