-- Already applied on TEST. Do not apply this file to TEST again.
-- Source: TEST history, supabase_migrations.schema_migrations, project aqcervntopidtcazcmlv.
-- Version 20261105222949, name crm_calls.
-- The text below this label is the exact history statement. The label is not part of that text.
-- Filename 20261105222949_crm_calls.sql sorts after 20261105222939_crm_nov3b.sql
-- and before 20261105222952_accounting_fees.sql, which is where TEST ran this version.
-- =====================================================================
-- =====================================================================
-- Migration 33 (Janine / John, Nov 3): Zoho CRM video 11 "Adding a Call" + John's rule that CRM list CSV downloads are Admin / Super admin only.
-- (Migration 32 belongs to feature/refi-deal-filters.) Re-runnable. FAKE DATA ONLY in every environment this has been run in.
--  * crm_activities (kind 'call'): call_mode scheduled | logged, call_status Scheduled | Completed, call_duration_sec (seconds), from / to number,
--    Related To (company / opportunity / deal), call reminder (5 / 10 / 15 / 30 / 60 / 120 minutes before; RECORDED ONLY, nothing is ever sent),
--    Outcome Of Outgoing Call (pick list 'callOutcome', admin-editable in CRM Settings), reason not interested, call notes, voice recording
--    (a link or a file name; no storage bucket is used), completed_at.
--  * Calls logged with the Nov 3 (b) form (call_duration in whole minutes) become logged, Completed calls; their minutes are kept and copied to
--    call_duration_sec = minutes x 60. Nothing is removed.
--  * A scheduled call may start in the future; a logged one may not, and needs a duration above zero. Completing needs a duration above zero
--    ("Call duration cannot be zero"); a completed call never goes back to Scheduled.
--  * Access is unchanged: the call is on its Call To lead / client (crm_entity_visible); Related To must be a record (or order) the caller can see;
--    the Call Owner follows the task-owner rule (a Sales Person picks only themselves).
--  * crm_list_exports + crm_list_export(): the Clients / Leads / Companies CSV is built by the app; the function refuses anyone but an Admin or
--    Super admin and logs the download (like crm_report_export in migration 30).
-- =====================================================================

-- ---------- columns ----------
alter table public.crm_activities add column if not exists call_mode text;
alter table public.crm_activities add column if not exists call_status text;
alter table public.crm_activities add column if not exists call_duration_sec integer;
alter table public.crm_activities add column if not exists from_number text not null default '';
alter table public.crm_activities add column if not exists to_number text not null default '';
alter table public.crm_activities add column if not exists related_entity text;
alter table public.crm_activities add column if not exists related_id uuid;
alter table public.crm_activities add column if not exists call_reminder integer;
alter table public.crm_activities add column if not exists call_reminder_at timestamptz;
alter table public.crm_activities add column if not exists call_outcome text not null default '';
alter table public.crm_activities add column if not exists reason_not_interested text not null default '';
alter table public.crm_activities add column if not exists call_notes text not null default '';
alter table public.crm_activities add column if not exists voice_recording_url text;
alter table public.crm_activities add column if not exists voice_recording_name text;
alter table public.crm_activities add column if not exists completed_at timestamptz;

-- ---------- carry the Nov 3 (b) calls forward (minutes kept, seconds added) ----------
alter table public.crm_activities disable trigger user;   -- data mapping only (no new rows, no access change)
update public.crm_activities set call_mode = coalesce(call_mode, 'logged'), call_status = coalesce(call_status, 'Completed'),
  call_duration_sec = coalesce(call_duration_sec, call_duration * 60), completed_at = coalesce(completed_at, done_at, created_at)
  where kind = 'call' and (call_mode is null or call_status is null or (call_duration_sec is null and call_duration is not null));
alter table public.crm_activities enable trigger user;

alter table public.crm_activities drop constraint if exists crm_activities_call_v11;
alter table public.crm_activities add constraint crm_activities_call_v11 check (
  (kind = 'call' or (call_mode is null and call_status is null and call_duration_sec is null and related_entity is null and related_id is null and call_reminder is null
     and call_reminder_at is null and from_number = '' and to_number = '' and call_outcome = '' and reason_not_interested = '' and call_notes = ''
     and voice_recording_url is null and voice_recording_name is null and completed_at is null))
  and (call_mode is null or call_mode in ('scheduled', 'logged')) and (call_status is null or call_status in ('Scheduled', 'Completed'))
  and (call_mode is distinct from 'logged' or call_status = 'Completed')
  and (call_duration_sec is null or call_duration_sec between 0 and 86400)
  and ((related_entity is null) = (related_id is null)) and (related_entity is null or related_entity in ('account', 'opportunity', 'deal'))
  and (call_reminder is null or call_reminder in (5, 10, 15, 30, 60, 120))
  and char_length(from_number) <= 40 and char_length(to_number) <= 40 and char_length(call_outcome) <= 80 and char_length(reason_not_interested) <= 200 and char_length(call_notes) <= 4000
  and (voice_recording_url is null or voice_recording_url ~* '^https?://[^[:space:]]+$') and char_length(coalesce(voice_recording_url, '')) <= 500 and char_length(coalesce(voice_recording_name, '')) <= 200);
create index if not exists crm_activities_related_idx on public.crm_activities (related_entity, related_id) where kind = 'call';
create index if not exists crm_activities_call_reminder_idx on public.crm_activities (owner_id, call_reminder_at) where kind = 'call' and call_status = 'Scheduled';

-- ---------- Outbound Call Outcome: a CRM Settings pick list ----------
create or replace function private.crm_list_keys() returns text[] language sql immutable as $$
  select array['relationshipStatus', 'leadSource', 'roleInCompany', 'accountKind', 'oppStage', 'taskSubject', 'taskStatus', 'taskPriority', 'meetingType', 'callOutcome'] $$;
create or replace function private.crm_list_label(k text) returns text language sql immutable as $$
  select case k when 'relationshipStatus' then 'Relationship Status' when 'leadSource' then 'Lead Source' when 'roleInCompany' then 'Role in Company' when 'accountKind' then 'Company Type'
    when 'oppStage' then 'Pipeline Stage' when 'taskSubject' then 'Task Subject' when 'taskStatus' then 'Task Status' when 'taskPriority' then 'Task Priority' when 'meetingType' then 'Meeting Type'
    when 'callOutcome' then 'Outbound Call Outcome' else 'value' end $$;
insert into public.crm_picklist_options (list_key, value, label, position)
  select 'callOutcome', v, v, n from (values ('Hot Lead', 10), ('Shows Interest', 20), ('Not Interested', 30), ('Do Not Contact', 40)) o(v, n)
  on conflict (list_key, value) do nothing;

-- ---------- call rules (fires before crm_activities_guard: alphabetical order) ----------
create or replace function private.crm_call_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare v_new boolean := tg_op = 'INSERT';
begin
  if new.kind <> 'call' then return new; end if;
  -- older callers (the Nov 3 b quick log) send no call_mode: a log of a call that happened
  if new.call_mode is null then new.call_mode := 'logged'; end if;
  if new.call_status is null then new.call_status := case when new.call_mode = 'scheduled' then 'Scheduled' else 'Completed' end; end if;
  if new.call_duration_sec is null and new.call_duration is not null then new.call_duration_sec := new.call_duration * 60; end if;
  if new.call_type = 'Missed' and (v_new or new.call_type is distinct from old.call_type) and new.call_mode = 'scheduled' then
    raise exception 'Pick a call type (Outbound or Inbound).' using errcode = '23514'; end if;
  if not v_new then
    if (new.call_mode, new.entity, new.entity_id) is distinct from (old.call_mode, old.entity, old.entity_id) then raise exception 'A call cannot change its kind or its Call To record.' using errcode = 'P0001'; end if;
    if old.call_status = 'Completed' and new.call_status = 'Scheduled' then raise exception 'This call is already completed.' using errcode = 'P0001'; end if;
  end if;
  if new.call_mode = 'scheduled' then
    if v_new then
      if new.entity not in ('lead', 'contact') then raise exception 'Call To must be a client or a lead.' using errcode = '23514'; end if;
      if new.call_status <> 'Scheduled' then raise exception 'A scheduled call starts as Scheduled.' using errcode = '23514'; end if;
      if new.call_type is null then new.call_type := 'Outbound'; end if;
      if new.call_start is null then raise exception 'Call Start Time is required.' using errcode = '23514'; end if;
      new.occurred_on := least(coalesce(new.occurred_on, private.office_today()), private.office_today());
    end if;
    if new.call_status = 'Completed' and (v_new or old.call_status = 'Scheduled') then   -- Mark as Completed -> Complete
      if coalesce(new.call_duration_sec, 0) <= 0 then raise exception 'Call duration cannot be zero' using errcode = '23514'; end if;
      new.completed_at := now(); new.done_at := now(); new.occurred_on := least(coalesce(new.call_start::date, private.office_today()), private.office_today()); end if;
  else
    -- a logged call: never in the future (5 minutes clock slack); a NEW-style log (it carries seconds) needs a duration above zero
    if new.call_start is not null and (v_new or new.call_start is distinct from old.call_start) and new.call_start > now() + interval '5 minutes' then
      raise exception 'Call Start Time cannot be in the future.' using errcode = '23514'; end if;
    if v_new and new.call_duration_sec is not null and new.call_duration is null and new.call_duration_sec <= 0 then
      raise exception 'Please provide a valid call start time and duration.' using errcode = '23514'; end if;
    if new.call_start is not null and v_new then new.occurred_on := least(new.call_start::date, private.office_today()); end if;
    new.call_reminder := null; new.call_reminder_at := null;
    if v_new then new.completed_at := coalesce(new.completed_at, now()); end if;
  end if;
  if new.call_duration_sec is not null then new.call_duration := least(1440, ceil(new.call_duration_sec / 60.0)::int); end if;
  new.call_reminder_at := case when new.call_reminder is not null and new.call_start is not null and new.call_status = 'Scheduled' then new.call_start - make_interval(mins => new.call_reminder) end;
  -- Call Owner: the task-owner rule (active Sales Person / Sales Team / Admin; a Sales Person only themselves)
  if auth.uid() is not null and (v_new or new.owner_id is distinct from old.owner_id) then
    new.owner_id := private.crm_assignee_check(new.owner_id, case when v_new then null else old.owner_id end, v_new, 'call owner'); end if;
  -- Related To: a record (or order) the caller may see
  if new.related_id is not null and auth.uid() is not null and (v_new or (new.related_entity, new.related_id) is distinct from (old.related_entity, old.related_id)) then
    if not (case when new.related_entity = 'deal' then private.can_access_deal(new.related_id) else private.crm_entity_visible(new.related_entity, new.related_id) end) then
      raise exception 'Related To record not found.' using errcode = 'P0002'; end if; end if;
  -- Outbound Call Outcome: from the pick list (blank = -None-); inbound calls keep no outcome
  if coalesce(new.call_type, '') <> 'Outbound' then new.call_outcome := ''; new.reason_not_interested := ''; new.call_notes := ''; end if;
  perform private.crm_list_check('callOutcome', new.call_outcome, case when v_new then null else old.call_outcome end, null, true);
  return new; end $$;
drop trigger if exists crm_activities_call_guard on public.crm_activities;
create trigger crm_activities_call_guard before insert or update on public.crm_activities for each row execute function private.crm_call_guard();

-- "last contacted": a scheduled call does not count until it is completed
create or replace function private.crm_touch_contact() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.entity = 'contact' and new.kind in ('call', 'email', 'meeting') and new.occurred_on <= private.office_today() and not (new.kind = 'call' and new.call_status = 'Scheduled') then
    update public.contacts set last_contacted_on = new.occurred_on where id = new.entity_id and (last_contacted_on is null or last_contacted_on < new.occurred_on); end if;
  return null; end $$;
drop trigger if exists crm_activities_touch_done on public.crm_activities;
create trigger crm_activities_touch_done after update of call_status on public.crm_activities for each row when (new.kind = 'call' and old.call_status = 'Scheduled' and new.call_status = 'Completed')
  execute function private.crm_touch_contact();

-- ---------- Complete a call (Zoho "Mark as Completed") ----------
create or replace function public.crm_complete_call(p_id uuid, p_seconds integer, p_description text default null) returns uuid language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if coalesce(p_seconds, 0) <= 0 then raise exception 'Call duration cannot be zero' using errcode = '23514'; end if;
  update public.crm_activities set call_status = 'Completed', call_duration_sec = p_seconds, body = coalesce(nullif(btrim(p_description), ''), body)
    where id = p_id and kind = 'call' and call_status = 'Scheduled';
  get diagnostics n = row_count; if n = 0 then raise exception 'Call not found, or already completed.' using errcode = 'P0002'; end if;
  return p_id; end $$;
revoke all on function public.crm_complete_call(uuid, integer, text) from public, anon;
grant execute on function public.crm_complete_call(uuid, integer, text) to authenticated;

-- my call reminders that are due (shown in the portal; nothing is ever sent)
create or replace function public.crm_call_reminders() returns setof public.crm_activities language sql stable security invoker set search_path = public as $$
  select * from public.crm_activities where kind = 'call' and call_status = 'Scheduled' and owner_id = auth.uid() and call_reminder_at <= now() order by call_reminder_at $$;
revoke all on function public.crm_call_reminders() from public, anon;
grant execute on function public.crm_call_reminders() to authenticated;

-- ---------- CSV downloads of the Clients / Leads / Companies lists: Admin / Super admin only, logged ----------
create table if not exists public.crm_list_exports (
  id uuid primary key default gen_random_uuid(), module text not null check (module in ('contacts', 'leads', 'accounts')),
  exported_by uuid not null references public.profiles (id), exported_at timestamptz not null default now(), row_count integer not null default 0 check (row_count >= 0));
drop trigger if exists crm_list_exports_no_change on public.crm_list_exports;
create trigger crm_list_exports_no_change before update or delete on public.crm_list_exports for each row execute function private.crm_log_only();
alter table public.crm_list_exports enable row level security;
revoke all on public.crm_list_exports from public, anon, authenticated;
grant select on public.crm_list_exports to authenticated;
drop policy if exists crm_list_exports_read on public.crm_list_exports;
create policy crm_list_exports_read on public.crm_list_exports for select to authenticated using (private.crm_on() and private.is_admin());
create or replace function public.crm_list_export(p_module text, p_rows integer default 0) returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can download CSV files from the CRM lists.' using errcode = '42501'; end if;
  if p_module not in ('contacts', 'leads', 'accounts') then raise exception 'CSV downloads are for the Clients, Leads and Companies lists.' using errcode = '22023'; end if;
  insert into public.crm_list_exports (module, exported_by, row_count) values (p_module, auth.uid(), greatest(coalesce(p_rows, 0), 0)) returning id into v;
  return v; end $$;
revoke all on function public.crm_list_export(text, integer) from public, anon;
grant execute on function public.crm_list_export(text, integer) to authenticated;
