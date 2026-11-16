-- Already applied on TEST. Do not apply this file to TEST again.
-- Source: TEST history, supabase_migrations.schema_migrations, project aqcervntopidtcazcmlv.
-- Version 20261105222920, name crm_zoho.
-- The text below this label is the exact history statement. The label is not part of that text.
-- =====================================================================
-- =====================================================================
-- Migration 24 (John, Nov 2): the CRM like John's Zoho. See docs/CRM.md. Re-runnable (idempotent). Builds on migration 22; old migrations untouched.
--  * Clients (= public.contacts in the CRM) and leads get Zoho's fields: Role in Company, Title, Mobile, Assistant, Asst Phone, Agent Split (%),
--    Real Estate License #, Sales Volume / Deals Closed (Last Year), Zillow URL, Street / City / State / Zip / County, Social Media Links &
--    Web Addresses (links jsonb: http / https only), Lead Source (Zoho's 17) and Relationship Status (Zoho's 6). Description = crm_notes / notes.
--    Required when a client or lead is created: Last Name, Role in Company, Relationship Status, State (and they cannot be blanked later).
--    contact_type (Realtor / Lender / Buyer-Seller) stays as it was; Role in Company is a separate field.
--  * Old values are mapped (lead source / status, CRM stage -> Relationship Status, follow-up status). crm_stage is kept, not dropped.
--  * Tasks: Zoho statuses (Not Started, Deferred, In Progress, Completed, Waiting for input), priority, reminder (portal only, never emailed),
--    repeat (daily / weekly / monthly + end date; closing makes the next one), closed time, modified by.
--  * Meetings: title, location, all day, from / to, host, type, participants (leads, clients, CLA users). NO invitations, NO calendar, NO email.
--  * crm_attachments: files on leads / clients / companies. Never updated, never deleted (no grant, and a trigger).
-- =====================================================================

-- ---------- lists ----------
create or replace function private.crm_roles() returns text[] language sql immutable as $$
  select array['Realtor', 'Real Estate Broker', 'Transaction Coordinator', 'Loan Officer', 'Mortgage Broker', 'Team Lead'] $$;
create or replace function private.crm_sources() returns text[] language sql immutable as $$
  select array['Business Group', 'Call in/Walk in', 'Direct Mail', 'Door Knocking', 'Email Campaign', 'Existing Client or Agent', 'Facebook/IG Ads', 'Facebook Group',
    'FB/IG Organic', 'Google Ads', 'Other Agent (Our Team)', 'Partnering w/ Other Agents', 'Personal Network', 'Re-assigned', 'Search Engine', 'Social Media', 'Warm Call'] $$;
create or replace function private.crm_statuses() returns text[] language sql immutable as $$
  select array['Potential/Warm', 'Prospecting', 'Not Interested', 'Unresponsive', 'Converted/Current Client', 'Churn'] $$;
create or replace function private.crm_task_statuses() returns text[] language sql immutable as $$
  select array['Not Started', 'Deferred', 'In Progress', 'Completed', 'Waiting for input'] $$;
create or replace function private.crm_priorities() returns text[] language sql immutable as $$ select array['Highest', 'High', 'Normal', 'Low', 'Lowest'] $$;
create or replace function private.crm_meeting_types() returns text[] language sql immutable as $$
  select array['Phone Meeting', 'Virtual Meeting', 'Coffee', 'Lunch Meeting', 'Office Stop By'] $$;
create or replace function private.crm_link_keys() returns text[] language sql immutable as $$
  select array['website', 'facebookProfile', 'facebookGroup', 'facebookPage', 'linkedin', 'instagram', 'zillowProfile', 'linktree', 'other1', 'other2', 'other3'] $$;
-- a web address: http(s)://host.with.dot/..., no spaces, at most 500 characters
create or replace function private.crm_url_ok(u text) returns boolean language sql immutable as $$
  select u = '' or (char_length(u) <= 500 and u ~* '^https?://[^\s/:@]+\.[^\s/:@]+(:[0-9]+)?(/\S*)?$') $$;
create or replace function private.crm_links_ok(l jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(l) = 'object' and not exists (select 1 from jsonb_each(l) e where not (e.key = any (private.crm_link_keys())) or jsonb_typeof(e.value) <> 'string' or not private.crm_url_ok(e.value #>> '{}')) $$;
-- old -> Zoho maps (same as crm.js SOURCE_FROM_OLD / STATUS_FROM_OLD / STAGE_TO_STATUS)
create or replace function private.crm_source_from_old(s text) returns text language sql immutable as $$
  select case s when 'Referral' then 'Existing Client or Agent' when 'Website' then 'Search Engine' when 'Open house' then 'Call in/Walk in' when 'Event' then 'Business Group'
    when 'Cold call' then 'Warm Call' when 'Past client' then 'Existing Client or Agent' when 'Social media' then 'Social Media' when 'Other' then '' else coalesce(s, '') end $$;
create or replace function private.crm_status_from_old(s text) returns text language sql immutable as $$
  select case s when 'New' then 'Potential/Warm' when 'Contacted' then 'Prospecting' when 'Qualified' then 'Prospecting' when 'Unqualified' then 'Not Interested' else s end $$;

-- ---------- person fields on contacts (clients) and leads ----------
do $p$ declare t text; begin foreach t in array array['contacts', 'crm_leads'] loop
  execute format('alter table public.%I add column if not exists role_in_company text not null default %L', t, '');
  execute format('alter table public.%I add column if not exists title text not null default %L', t, '');
  execute format('alter table public.%I add column if not exists mobile text not null default %L', t, '');
  execute format('alter table public.%I add column if not exists assistant text not null default %L', t, '');
  execute format('alter table public.%I add column if not exists asst_phone text not null default %L', t, '');
  execute format('alter table public.%I add column if not exists agent_split numeric(5,2)', t);
  execute format('alter table public.%I add column if not exists license_no text not null default %L', t, '');
  execute format('alter table public.%I add column if not exists sales_volume_last_year numeric(16,2)', t);
  execute format('alter table public.%I add column if not exists deals_closed_last_year integer', t);
  execute format('alter table public.%I add column if not exists zillow_url text not null default %L', t, '');
  execute format('alter table public.%I add column if not exists crm_street text not null default %L', t, '');
  execute format('alter table public.%I add column if not exists crm_city text not null default %L', t, '');
  execute format('alter table public.%I add column if not exists crm_state text not null default %L', t, '');
  execute format('alter table public.%I add column if not exists crm_zip text not null default %L', t, '');
  execute format('alter table public.%I add column if not exists crm_county text not null default %L', t, '');
  execute format('alter table public.%I add column if not exists links jsonb not null default %L', t, '{}');
  execute format('alter table public.%I add column if not exists modified_by uuid references public.profiles (id)', t);
  execute format('alter table public.%I add column if not exists modified_at timestamptz', t);
  execute format('alter table public.%I drop constraint if exists %I', t, t || '_zoho_check');
  -- migration 25 (CRM Settings) replaces the pick-list part of this check with a trigger; once it exists, never re-add it here
  if to_regclass('public.crm_picklist_options') is null then
  execute format($c$alter table public.%I add constraint %I check (
      (role_in_company = '' or role_in_company = any (private.crm_roles()))
      and char_length(title) <= 100 and char_length(mobile) <= 40 and char_length(assistant) <= 100 and char_length(asst_phone) <= 40 and char_length(license_no) <= 60
      and (agent_split is null or agent_split between 0 and 100) and (sales_volume_last_year is null or sales_volume_last_year >= 0)
      and (deals_closed_last_year is null or deals_closed_last_year between 0 and 100000)
      and private.crm_url_ok(zillow_url) and private.crm_links_ok(links)
      and char_length(crm_street) <= 200 and char_length(crm_city) <= 80 and (crm_state = '' or private.us_state_ok(crm_state))
      and crm_zip ~ '^([0-9]{5}(-[0-9]{4})?)?$' and char_length(crm_county) <= 60)$c$, t, t || '_zoho_check');
  end if;
end loop; end $p$;
create index if not exists contacts_crm_county_idx on public.contacts (lower(crm_county)) where crm_county <> '';

-- contacts: Lead Source + Relationship Status (null = not a CRM client yet)
alter table public.contacts add column if not exists lead_source text not null default '';
alter table public.contacts add column if not exists relationship_status text;
alter table public.contacts drop constraint if exists contacts_zoho_lists_check;
do $z$ begin if to_regclass('public.crm_picklist_options') is null then   -- (migration 25 replaces this with a trigger)
alter table public.contacts add constraint contacts_zoho_lists_check check ((lead_source = '' or lead_source = any (private.crm_sources()))
  and (relationship_status is null or relationship_status = any (private.crm_statuses())));
end if; end $z$;
-- backfill (only rows that are CRM clients: they have a CRM stage); never overwrites a value already set
update public.contacts set relationship_status = case crm_stage when 'prospect' then 'Prospecting' when 'active_partner' then 'Converted/Current Client' when 'inactive' then 'Churn' end
  where relationship_status is null and crm_stage is not null;
update public.contacts set role_in_company = case contact_type when 'realtor' then 'Realtor' when 'lender' then 'Loan Officer' else '' end
  where role_in_company = '' and crm_stage is not null and contact_type in ('realtor', 'lender');

-- leads: source = Lead Source (Zoho list, optional), status = Relationship Status (Zoho list); first name optional (Zoho), last name required on new leads
alter table public.crm_leads drop constraint if exists crm_leads_first_name_check;
alter table public.crm_leads drop constraint if exists crm_leads_source_check;
alter table public.crm_leads drop constraint if exists crm_leads_status_check;
alter table public.crm_leads alter column source set default '';
alter table public.crm_leads alter column status set default 'Potential/Warm';
alter table public.crm_leads alter column first_name set default '';
alter table public.crm_leads disable trigger crm_leads_guard;   -- data mapping only (converted leads are otherwise locked)
update public.crm_leads set source = private.crm_source_from_old(source) where not (source = '' or source = any (private.crm_sources()));
update public.crm_leads set status = case when converted_at is not null then 'Converted/Current Client' else private.crm_status_from_old(status) end
  where not (status = any (private.crm_statuses())) or (converted_at is not null and status <> 'Converted/Current Client');
alter table public.crm_leads enable trigger crm_leads_guard;
alter table public.crm_leads add constraint crm_leads_first_name_check check (char_length(first_name) <= 80 and char_length(last_name) <= 80);
do $z$ begin if to_regclass('public.crm_picklist_options') is null then   -- (migration 25 replaces these with a trigger)
alter table public.crm_leads add constraint crm_leads_source_check check (source = '' or source = any (private.crm_sources()));
alter table public.crm_leads add constraint crm_leads_status_check check (status = any (private.crm_statuses()));
end if; end $z$;
create index if not exists crm_leads_county_idx on public.crm_leads (lower(crm_county)) where crm_county <> '';

-- modified by / at on companies and opportunities too (the guard stamps every CRM row it changes)
alter table public.crm_accounts add column if not exists modified_by uuid references public.profiles (id);
alter table public.crm_accounts add column if not exists modified_at timestamptz;
alter table public.crm_opportunities add column if not exists modified_by uuid references public.profiles (id);
alter table public.crm_opportunities add column if not exists modified_at timestamptz;

-- ---------- tasks + meetings on crm_activities ----------
alter table public.crm_activities add column if not exists priority text not null default 'High';
alter table public.crm_activities add column if not exists reminder boolean not null default false;
alter table public.crm_activities add column if not exists reminder_at timestamp;          -- office-local date + time; shown in the portal only
alter table public.crm_activities add column if not exists repeat_every text not null default '';
alter table public.crm_activities add column if not exists repeat_until date;
alter table public.crm_activities add column if not exists repeat_of uuid references public.crm_activities (id);
alter table public.crm_activities add column if not exists closed_at timestamptz;
alter table public.crm_activities add column if not exists cancelled boolean not null default false;
alter table public.crm_activities add column if not exists modified_by uuid references public.profiles (id);
alter table public.crm_activities add column if not exists modified_at timestamptz;
alter table public.crm_activities add column if not exists all_day boolean not null default false;
alter table public.crm_activities add column if not exists starts_at timestamp;            -- meetings: office-local
alter table public.crm_activities add column if not exists ends_at timestamp;
alter table public.crm_activities add column if not exists location text not null default '';
alter table public.crm_activities add column if not exists meeting_type text not null default '';
alter table public.crm_activities add column if not exists host_id uuid references public.profiles (id);
alter table public.crm_activities add column if not exists participants text[] not null default '{}';
alter table public.crm_activities drop constraint if exists crm_activities_status_check;   -- migration 22's open / done / cancelled
alter table public.crm_activities drop constraint if exists crm_activities_status;
alter table public.crm_activities drop constraint if exists crm_activities_zoho_check;
alter table public.crm_activities disable trigger crm_activities_guard;   -- data mapping only (CRM-written rows are otherwise locked)
update public.crm_activities set cancelled = (status = 'cancelled'), closed_at = coalesce(closed_at, done_at, case when status <> 'open' then created_at end),
  status = case status when 'open' then 'Not Started' else 'Completed' end where kind = 'task' and status in ('open', 'done', 'cancelled');
update public.crm_activities set all_day = true, starts_at = coalesce(starts_at, occurred_on::timestamp), ends_at = coalesce(ends_at, occurred_on::timestamp), host_id = coalesce(host_id, owner_id)
  where kind = 'meeting' and starts_at is null and occurred_on is not null;
alter table public.crm_activities enable trigger crm_activities_guard;
do $z$ begin if to_regclass('public.crm_picklist_options') is null then   -- (migration 25 replaces this with crm_activities_fields_check + a trigger)
alter table public.crm_activities add constraint crm_activities_zoho_check check (
  (case when kind = 'task' then status = any (private.crm_task_statuses()) else status = 'done' end)
  and priority = any (private.crm_priorities()) and (not reminder or reminder_at is not null)
  and repeat_every in ('', 'daily', 'weekly', 'monthly') and (repeat_until is null or due_date is null or repeat_until >= due_date)
  and (kind = 'task' or (repeat_every = '' and not reminder))
  and (meeting_type = '' or meeting_type = any (private.crm_meeting_types())) and char_length(location) <= 200
  and (kind <> 'meeting' or starts_at is null or (ends_at is not null and ends_at >= starts_at))
  and cardinality(participants) <= 50 and array_to_string(participants, ',') ~ '^((lead|contact|user):[0-9a-f-]{36}(,|$))*$');
end if; end $z$;
create index if not exists crm_activities_starts_idx on public.crm_activities (starts_at) where kind = 'meeting';
create index if not exists crm_activities_participants_idx on public.crm_activities using gin (participants);

-- ---------- attachments (never deleted) ----------
create table if not exists public.crm_attachments (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('lead', 'contact', 'account')), entity_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 200 and name !~ '[\\/]'),
  mime_type text not null default 'application/octet-stream', size bigint not null default 0 check (size between 0 and 25000000),
  storage_path text not null default '', uploaded_by uuid references public.profiles (id), created_at timestamptz not null default now(),
  constraint crm_attachments_ext check (lower(substring(name from '\.([^.]+)$')) in ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'png', 'jpg', 'jpeg', 'heic', 'heif', 'webp')));
create index if not exists crm_attachments_entity_idx on public.crm_attachments (entity, entity_id);

-- ---------- assignees (task owner / meeting host): an active Sales Person, Sales Team, Admin or Super admin; a Sales Person picks only themselves ----------
create or replace function private.crm_assignee_check(p_new uuid, p_old uuid, p_insert boolean, p_label text default 'task owner') returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if p_insert and p_new is null then p_new := auth.uid(); end if;
  if p_new is null then raise exception 'Pick a %.', p_label using errcode = 'P0001'; end if;
  if p_new is distinct from p_old and coalesce(current_setting('crm.spawn', true), '') <> '1' then
    if not exists (select 1 from public.profiles where id = p_new and status = 'active' and role in ('Sales Person', 'Sales Team', 'Admin', 'Super admin')) then
      raise exception 'The % must be an active Sales Person, Sales Team or Admin user.', p_label using errcode = 'P0001'; end if;
    if auth.uid() is not null and p_new <> auth.uid() and not private.is_admin() and coalesce(private.me_role() = 'Sales Person', false) then
      raise exception 'A Sales Person can only pick themselves as the %.', p_label using errcode = 'P0001'; end if; end if;
  return p_new; end $$;

-- ---------- guard (replaces migration 22's; same trigger names) ----------
create or replace function private.crm_row_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare p text; v_type text; v_id uuid;
begin
  if tg_op = 'DELETE' then raise exception 'CRM records are never deleted; archive them instead.' using errcode = 'P0001'; end if;
  if auth.uid() is not null and not private.crm_editor() then raise exception 'You cannot change CRM records.' using errcode = '42501'; end if;
  if tg_table_name = 'crm_attachments' then
    if tg_op = 'UPDATE' then raise exception 'Attachments are kept as uploaded; they cannot be changed or deleted.' using errcode = 'P0001'; end if;
    new.uploaded_by := coalesce(auth.uid(), new.uploaded_by); new.created_at := now(); return new; end if;
  if tg_table_name = 'crm_activities' then
    if tg_op = 'UPDATE' then
      if old.system then raise exception 'This entry was written by the CRM and cannot be changed.' using errcode = 'P0001'; end if;
      if (new.entity, new.entity_id, new.kind) is distinct from (old.entity, old.entity_id, old.kind) then raise exception 'An activity cannot move to another record.' using errcode = 'P0001'; end if;
      new.modified_by := coalesce(auth.uid(), new.modified_by); new.modified_at := now(); end if;
    if tg_op = 'INSERT' then new.modified_by := coalesce(auth.uid(), new.created_by); new.modified_at := now(); end if;
    if new.kind = 'task' then
      -- older callers: open / done / cancelled
      if new.status = 'open' or (tg_op = 'INSERT' and new.status = 'done') then new.status := 'Not Started';
      elsif new.status = 'done' then new.status := 'Completed'; new.cancelled := false;
      elsif new.status = 'cancelled' then new.status := 'Completed'; new.cancelled := true; end if;
      if new.status <> 'Completed' then new.cancelled := false; end if;
      new.owner_id := private.crm_assignee_check(new.owner_id, case when tg_op = 'UPDATE' then old.owner_id end, tg_op = 'INSERT');
      new.closed_at := case when new.status = 'Completed' then coalesce(case when tg_op = 'UPDATE' and old.status = 'Completed' then old.closed_at end, now()) end;
      new.done_at := new.closed_at;
      if not new.reminder then new.reminder_at := null; end if;
      if new.repeat_every = '' then new.repeat_until := null; end if;
    elsif new.kind = 'meeting' and (tg_op = 'INSERT' or (new.starts_at, new.ends_at, new.meeting_type, new.host_id, new.participants, new.all_day) is distinct from (old.starts_at, old.ends_at, old.meeting_type, old.host_id, old.participants, old.all_day)) then
      if new.starts_at is null then raise exception 'From is required.' using errcode = 'P0001'; end if;
      if new.all_day then new.starts_at := date_trunc('day', new.starts_at); new.ends_at := date_trunc('day', coalesce(new.ends_at, new.starts_at)); end if;
      if new.ends_at is null then raise exception 'To is required.' using errcode = 'P0001'; end if;
      if new.ends_at < new.starts_at then raise exception '"To" must be after "From".' using errcode = 'P0001'; end if;
      if new.meeting_type = '' then raise exception 'Type is required.' using errcode = 'P0001'; end if;
      new.host_id := private.crm_assignee_check(new.host_id, case when tg_op = 'UPDATE' then old.host_id end, tg_op = 'INSERT', 'host');
      new.owner_id := new.host_id; new.occurred_on := new.starts_at::date; new.status := 'done';
      select coalesce(array_agg(distinct x), '{}') into new.participants from unnest(new.participants) x;
      foreach p in array new.participants loop
        if p !~ '^(lead|contact|user):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Participants can be leads, clients or CLA users.' using errcode = '23514'; end if;
        v_type := split_part(p, ':', 1); v_id := split_part(p, ':', 2)::uuid;
        if v_type = 'user' then
          if not exists (select 1 from public.profiles where id = v_id and status = 'active' and role <> 'Outside user') then raise exception 'Participants can be leads, clients or CLA users.' using errcode = 'P0001'; end if;
        elsif auth.uid() is not null and not private.crm_entity_visible(v_type, v_id) then raise exception 'Participant not found.' using errcode = 'P0002'; end if;
      end loop;
    elsif new.kind <> 'meeting' then
      new.owner_id := coalesce(new.owner_id, auth.uid()); new.occurred_on := coalesce(new.occurred_on, private.office_today());
      if new.occurred_on > private.office_today() then raise exception 'The date cannot be in the future.' using errcode = 'P0001'; end if; end if;
    if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
    return new; end if;
  new.owner_id := private.crm_owner_check(new.owner_id, case when tg_op = 'UPDATE' then old.owner_id end, tg_op = 'INSERT');
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); else new.modified_by := coalesce(auth.uid(), new.modified_by); new.modified_at := now(); end if;
  if tg_table_name = 'crm_leads' then   -- (nested: plpgsql does not short-circuit field lookups on other tables' rows)
    if new.email <> '' and (tg_op = 'INSERT' or lower(new.email) <> lower(old.email)) and exists (select 1 from public.contacts c where lower(c.email) = lower(new.email)) then
      raise exception 'This person is already a client (one person per email).' using errcode = '23505'; end if;
    if tg_op = 'UPDATE' then if old.converted_at is not null and auth.uid() is not null and new.archived_at is not distinct from old.archived_at then
      raise exception 'This lead was converted; edit the client instead.' using errcode = 'P0001'; end if; end if;
    -- Zoho's required fields: on every new lead, and they cannot be blanked later
    if tg_op = 'INSERT' or new.last_name <> old.last_name then if btrim(new.last_name) = '' then raise exception 'Last Name is required.' using errcode = 'P0001'; end if; end if;
    if tg_op = 'INSERT' or new.role_in_company <> old.role_in_company then if new.role_in_company = '' then raise exception 'Role in Company is required.' using errcode = 'P0001'; end if; end if;
    if tg_op = 'INSERT' or new.crm_state <> old.crm_state then if new.crm_state = '' then raise exception 'State is required.' using errcode = 'P0001'; end if; end if;
    if tg_op = 'INSERT' then if new.status = 'Converted/Current Client' and new.converted_at is null then raise exception 'A new lead cannot start as Converted/Current Client.' using errcode = 'P0001'; end if; end if;
  end if;
  return new; end $$;
do $t$ declare t text; begin foreach t in array array['crm_accounts', 'crm_leads', 'crm_opportunities', 'crm_activities', 'crm_attachments'] loop
  execute format('drop trigger if exists %I on public.%I', t || '_guard', t);
  execute format('create trigger %I before insert or update or delete on public.%I for each row execute function private.crm_row_guard()', t || '_guard', t);
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from public, anon, authenticated', t);
  execute format('grant select, insert%s on public.%I to authenticated', case when t = 'crm_attachments' then '' else ', update' end, t);   -- never delete; attachments never change
end loop; end $t$;
drop policy if exists crm_att_select on public.crm_attachments;
create policy crm_att_select on public.crm_attachments for select to authenticated using (private.crm_entity_visible(entity, entity_id));
drop policy if exists crm_att_insert on public.crm_attachments;
create policy crm_att_insert on public.crm_attachments for insert to authenticated with check (private.crm_editor() and private.crm_entity_visible(entity, entity_id));

-- repeating task: closing it (-> Completed) creates the next occurrence (until the end date)
create or replace function private.crm_task_repeat() returns trigger language plpgsql security definer set search_path = public as $$
declare v_due date;
begin
  if new.kind = 'task' and new.status = 'Completed' and not new.cancelled and old.status <> 'Completed' and new.repeat_every <> '' and new.due_date is not null then
    v_due := (new.due_date + case new.repeat_every when 'daily' then interval '1 day' when 'weekly' then interval '7 days' else interval '1 month' end)::date;
    if new.repeat_until is null or v_due <= new.repeat_until then
      perform set_config('crm.spawn', '1', true);
      insert into public.crm_activities (entity, entity_id, kind, subject, body, status, due_date, owner_id, priority, reminder, reminder_at, repeat_every, repeat_until, repeat_of, created_by)
        values (new.entity, new.entity_id, 'task', new.subject, new.body, 'Not Started', v_due, new.owner_id, new.priority, new.reminder,
          case when new.reminder then new.reminder_at + (v_due - new.due_date) * interval '1 day' end, new.repeat_every, new.repeat_until, new.id, coalesce(auth.uid(), new.created_by));
      perform set_config('crm.spawn', '', true); end if; end if;
  return null; end $$;
drop trigger if exists crm_activities_repeat on public.crm_activities;
create trigger crm_activities_repeat after update on public.crm_activities for each row execute function private.crm_task_repeat();

-- a logged call / email, or a meeting that has started, moves a client's "last contacted" forward (never into the future)
create or replace function private.crm_touch_contact() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.entity = 'contact' and new.kind in ('call', 'email', 'meeting') and new.occurred_on <= private.office_today() then
    update public.contacts set last_contacted_on = new.occurred_on where id = new.entity_id and (last_contacted_on is null or last_contacted_on < new.occurred_on); end if;
  return null; end $$;

-- CRM columns on contacts: only CRM editors change them
create or replace function private.contacts_crm_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.crm_owner_id, new.account_id, new.crm_stage, new.last_contacted_on, new.tags, new.crm_notes, new.crm_lead_id, new.crm_archived_at, new.role_in_company, new.title, new.mobile, new.assistant,
      new.asst_phone, new.agent_split, new.license_no, new.sales_volume_last_year, new.deals_closed_last_year, new.zillow_url, new.crm_street, new.crm_city, new.crm_state, new.crm_zip, new.crm_county,
      new.links, new.lead_source, new.relationship_status)
     is distinct from (old.crm_owner_id, old.account_id, old.crm_stage, old.last_contacted_on, old.tags, old.crm_notes, old.crm_lead_id, old.crm_archived_at, old.role_in_company, old.title, old.mobile, old.assistant,
      old.asst_phone, old.agent_split, old.license_no, old.sales_volume_last_year, old.deals_closed_last_year, old.zillow_url, old.crm_street, old.crm_city, old.crm_state, old.crm_zip, old.crm_county,
      old.links, old.lead_source, old.relationship_status) then
    if auth.uid() is not null and not private.crm_editor() then raise exception 'You cannot change CRM details.' using errcode = '42501'; end if;
    if new.crm_owner_id is distinct from old.crm_owner_id then new.crm_owner_id := private.crm_owner_check(new.crm_owner_id, old.crm_owner_id, false); end if;
    if new.last_contacted_on > private.office_today() then raise exception 'Last contacted cannot be in the future.' using errcode = 'P0001'; end if;
    if auth.uid() is not null and old.relationship_status is not null then   -- a CRM client keeps Zoho's required fields
      if new.relationship_status is null then raise exception 'Relationship Status is required.' using errcode = 'P0001'; end if;
      if new.role_in_company = '' and old.role_in_company <> '' then raise exception 'Role in Company is required.' using errcode = 'P0001'; end if;
      if new.crm_state = '' and old.crm_state <> '' then raise exception 'State is required.' using errcode = 'P0001'; end if; end if;
  end if;
  return new; end $$;

-- ---------- JSON + functions the screens call ----------
create or replace function private.crm_person_json(r jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('roleInCompany', r->>'role_in_company', 'title', r->>'title', 'mobile', r->>'mobile', 'assistant', r->>'assistant', 'asstPhone', r->>'asst_phone',
    'agentSplit', (r->>'agent_split')::numeric, 'licenseNo', r->>'license_no', 'salesVolumeLastYear', (r->>'sales_volume_last_year')::numeric, 'dealsClosedLastYear', (r->>'deals_closed_last_year')::int,
    'zillowUrl', r->>'zillow_url', 'street', r->>'crm_street', 'city', r->>'crm_city', 'state', r->>'crm_state', 'zip', r->>'crm_zip', 'county', r->>'crm_county', 'links', r->'links') $$;
create or replace function private.crm_contact_json(p_id uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'name', btrim(c.first_name || ' ' || c.last_name), 'firstName', c.first_name, 'lastName', c.last_name, 'email', c.email, 'phone', c.phone, 'company', c.company,
    'contactType', c.contact_type, 'hasLogin', c.profile_id is not null, 'ownerId', c.crm_owner_id, 'ownerName', coalesce(private.crm_name(c.crm_owner_id), ''),
    'accountId', c.account_id, 'accountName', coalesce((select name from public.crm_accounts where id = c.account_id), ''), 'stage', c.crm_stage, 'lastContactedOn', c.last_contacted_on,
    'companyName', coalesce((select name from public.crm_accounts where id = c.account_id), c.company),
    'tags', to_jsonb(c.tags), 'notes', c.crm_notes, 'description', c.crm_notes, 'archived', c.crm_archived_at is not null, 'fromLeadId', c.crm_lead_id, 'linked', private.crm_linked(c.id), 'canEdit', private.crm_editor(),
    'leadSource', c.lead_source, 'relationshipStatus', coalesce(c.relationship_status, ''),
    'salesReps', coalesce((select jsonb_agg(jsonb_build_object('id', l.sales_id, 'name', private.crm_name(l.sales_id))) from public.client_sales_reps l where l.client_id = c.profile_id), '[]'::jsonb),
    'orders', (select count(distinct dp.deal_id) from public.deal_participants dp where dp.contact_id = c.id),
    'volume', coalesce((select sum(d.purchase_price) from public.deals d where d.status <> 'Cancelled' and exists (select 1 from public.deal_participants dp where dp.deal_id = d.id and dp.contact_id = c.id)), 0))
    || private.crm_person_json(to_jsonb(c))
  from public.contacts c where c.id = p_id $$;
create or replace function public.crm_contact_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin perform private.crm_need();
  if not private.crm_contact_visible(p_id) then raise exception 'Client not found.' using errcode = 'P0002'; end if;
  return private.crm_contact_json(p_id) || jsonb_build_object('orders', private.crm_orders(array[p_id])); end $$;
create or replace function public.crm_account_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin perform private.crm_need();
  if not private.crm_account_visible(p_id) then raise exception 'Company not found.' using errcode = 'P0002'; end if;
  return jsonb_build_object('contactList', coalesce((select jsonb_agg(private.crm_contact_json(c.id)) from public.contacts c where c.account_id = p_id and private.crm_contact_visible(c.id)), '[]'::jsonb),
    'orders', private.crm_orders(coalesce((select array_agg(c.id) from public.contacts c where c.account_id = p_id and private.crm_in_pool(c.id)), '{}'))); end $$;

-- links from the screen: {"website": "...", ...}; blank values dropped; a value without a scheme gets https:// (as crm.js cleanUrl)
create or replace function private.crm_links_in(p jsonb) returns jsonb language plpgsql immutable as $$
declare r jsonb := '{}'; k text; v text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return '{}'; end if;
  for k, v in select key, btrim(value #>> '{}') from jsonb_each(p) loop
    if v = '' then continue; end if;
    if v !~* '^[a-z][a-z0-9+.-]*:' then v := 'https://' || regexp_replace(v, '^/+', ''); end if;
    if not (k = any (private.crm_link_keys())) then raise exception 'Unknown link "%".', k using errcode = 'P0001'; end if;
    if not private.crm_url_ok(v) then raise exception 'Links must be http:// or https:// web addresses.' using errcode = 'P0001'; end if;
    r := r || jsonb_build_object(k, v); end loop;
  return r; end $$;
create or replace function private.crm_url_in(v text) returns text language plpgsql immutable as $$
begin v := btrim(coalesce(v, '')); if v = '' then return ''; end if;
  if v !~* '^[a-z][a-z0-9+.-]*:' then v := 'https://' || regexp_replace(v, '^/+', ''); end if;
  if not private.crm_url_ok(v) then raise exception 'Links must be http:// or https:// web addresses.' using errcode = 'P0001'; end if; return v; end $$;

create or replace function public.crm_create_contact(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_email text := lower(btrim(coalesce(p->>'email', ''))); v_acc uuid := nullif(p->>'accountId', '')::uuid;
begin perform private.crm_need(true);
  if btrim(coalesce(p->>'lastName', '')) = '' then raise exception 'Last Name is required.' using errcode = 'P0001'; end if;
  if coalesce(p->>'roleInCompany', '') = '' then raise exception 'Role in Company is required.' using errcode = 'P0001'; end if;
  if coalesce(p->>'relationshipStatus', '') = '' then raise exception 'Relationship Status is required.' using errcode = 'P0001'; end if;
  if coalesce(p->>'state', '') = '' then raise exception 'State is required.' using errcode = 'P0001'; end if;
  if v_email <> '' and exists (select 1 from public.contacts where lower(email) = v_email) then raise exception 'A client with this email already exists (one person per email).' using errcode = '23505'; end if;
  if v_email <> '' and exists (select 1 from public.profiles where lower(email) = v_email and status <> 'removed') then raise exception 'A user with this email already exists.' using errcode = '23505'; end if;
  if v_acc is not null and not private.crm_account_visible(v_acc) then raise exception 'Company not found.' using errcode = 'P0002'; end if;
  insert into public.contacts (id, first_name, last_name, email, phone, company, contact_type, created_by, crm_stage, tags, crm_notes, account_id)
    values (v_id, btrim(coalesce(p->>'firstName', '')), btrim(coalesce(p->>'lastName', '')), v_email, coalesce(p->>'phone', ''),
      coalesce(nullif(btrim(coalesce(p->>'company', '')), ''), (select name from public.crm_accounts where id = v_acc), ''), nullif(p->>'contactType', ''), auth.uid(),
      coalesce(nullif(p->>'stage', ''), 'prospect'), coalesce((select array_agg(distinct lower(btrim(t))) from jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb)) t where btrim(t) <> ''), '{}'),
      coalesce(p->>'description', p->>'notes', ''), v_acc);
  update public.contacts set crm_owner_id = private.crm_owner_check(nullif(p->>'ownerId', '')::uuid, null, true) where id = v_id;
  perform public.crm_update_contact(v_id, p - 'ownerId' - 'accountId' - 'tags' - 'stage' - 'company' - 'contactType' - 'notes' - 'description');
  return v_id; end $$;
create or replace function public.crm_update_contact(p_id uuid, p jsonb) returns void language plpgsql security definer set search_path = public as $$
declare v_acc uuid;
begin perform private.crm_need(true);
  if not private.crm_contact_visible(p_id) then raise exception 'Client not found.' using errcode = 'P0002'; end if;
  if p ? 'accountId' then v_acc := nullif(p->>'accountId', '')::uuid; if v_acc is not null and not private.crm_account_visible(v_acc) then raise exception 'Company not found.' using errcode = 'P0002'; end if; end if;
  if p ? 'roleInCompany' and coalesce(p->>'roleInCompany', '') = '' then raise exception 'Role in Company is required.' using errcode = 'P0001'; end if;
  if p ? 'relationshipStatus' and coalesce(p->>'relationshipStatus', '') = '' then raise exception 'Relationship Status is required.' using errcode = 'P0001'; end if;
  if p ? 'state' and coalesce(p->>'state', '') = '' then raise exception 'State is required.' using errcode = 'P0001'; end if;
  update public.contacts set
    crm_owner_id = case when p ? 'ownerId' then nullif(p->>'ownerId', '')::uuid else crm_owner_id end,
    account_id = case when p ? 'accountId' then v_acc else account_id end,
    crm_stage = case when p ? 'stage' then nullif(p->>'stage', '') else crm_stage end,
    last_contacted_on = case when p ? 'lastContactedOn' then nullif(p->>'lastContactedOn', '')::date else last_contacted_on end,
    tags = case when p ? 'tags' then coalesce((select array_agg(distinct lower(btrim(t))) from jsonb_array_elements_text(p->'tags') t where btrim(t) <> ''), '{}') else tags end,
    crm_notes = case when p ? 'description' then coalesce(p->>'description', '') when p ? 'notes' then coalesce(p->>'notes', '') else crm_notes end,
    contact_type = case when p ? 'contactType' then nullif(p->>'contactType', '') else contact_type end,
    company = case when p ? 'company' then coalesce(p->>'company', '') else company end,
    role_in_company = case when p ? 'roleInCompany' then p->>'roleInCompany' else role_in_company end,
    title = case when p ? 'title' then btrim(coalesce(p->>'title', '')) else title end,
    mobile = case when p ? 'mobile' then btrim(coalesce(p->>'mobile', '')) else mobile end,
    assistant = case when p ? 'assistant' then btrim(coalesce(p->>'assistant', '')) else assistant end,
    asst_phone = case when p ? 'asstPhone' then btrim(coalesce(p->>'asstPhone', '')) else asst_phone end,
    agent_split = case when p ? 'agentSplit' then nullif(btrim(coalesce(p->>'agentSplit', '')), '')::numeric else agent_split end,
    license_no = case when p ? 'licenseNo' then btrim(coalesce(p->>'licenseNo', '')) else license_no end,
    sales_volume_last_year = case when p ? 'salesVolumeLastYear' then nullif(regexp_replace(coalesce(p->>'salesVolumeLastYear', ''), '[$,\s]', '', 'g'), '')::numeric else sales_volume_last_year end,
    deals_closed_last_year = case when p ? 'dealsClosedLastYear' then nullif(btrim(coalesce(p->>'dealsClosedLastYear', '')), '')::int else deals_closed_last_year end,
    zillow_url = case when p ? 'zillowUrl' then private.crm_url_in(p->>'zillowUrl') else zillow_url end,
    crm_street = case when p ? 'street' then btrim(coalesce(p->>'street', '')) else crm_street end,
    crm_city = case when p ? 'city' then btrim(coalesce(p->>'city', '')) else crm_city end,
    crm_state = case when p ? 'state' then upper(btrim(coalesce(p->>'state', ''))) else crm_state end,
    crm_zip = case when p ? 'zip' then btrim(coalesce(p->>'zip', '')) else crm_zip end,
    crm_county = case when p ? 'county' then btrim(coalesce(p->>'county', '')) else crm_county end,
    links = case when p ? 'links' then private.crm_links_in(p->'links') else links end,
    lead_source = case when p ? 'leadSource' then coalesce(p->>'leadSource', '') else lead_source end,
    relationship_status = case when p ? 'relationshipStatus' then p->>'relationshipStatus' else relationship_status end
  where id = p_id; end $$;

-- Lead -> Client (+ Company). The client keeps the lead's Relationship Status and Zoho fields; the lead becomes Converted/Current Client.
create or replace function public.crm_convert_lead(p_lead uuid, p jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.crm_leads; v_acc uuid := nullif(p->>'accountId', '')::uuid; v_name text := btrim(coalesce(p->>'newAccountName', '')); v_c uuid; v_opp uuid; v_linked boolean := false;
begin perform private.crm_need(true);
  select * into l from public.crm_leads where id = p_lead;
  if l.id is null or not private.crm_owner_ok(l.owner_id) then raise exception 'Lead not found.' using errcode = 'P0002'; end if;
  if l.converted_at is not null then raise exception 'This lead was already converted.' using errcode = 'P0001'; end if;
  if l.archived_at is not null then raise exception 'Restore this lead before converting it.' using errcode = 'P0001'; end if;
  if v_acc is not null and not private.crm_account_visible(v_acc) then raise exception 'Company not found.' using errcode = 'P0002'; end if;
  if v_acc is null and v_name <> '' then
    if exists (select 1 from public.crm_accounts where lower(btrim(name)) = lower(v_name) and archived_at is null) then raise exception 'A company with this name already exists; pick it from the list.' using errcode = '23505'; end if;
    insert into public.crm_accounts (name, kind, owner_id, created_by) values (v_name, coalesce(nullif(p->>'accountKind', ''), case l.contact_type when 'realtor' then 'brokerage' when 'lender' then 'lender' else 'other' end), l.owner_id, auth.uid()) returning id into v_acc;
  end if;
  select id into v_c from public.contacts where l.email <> '' and lower(email) = lower(l.email);
  if v_c is not null then
    if not coalesce((p->>'linkExisting')::boolean, false) then raise exception 'A client with this email already exists. Choose "Link to the existing client" (one person per email).' using errcode = '23505'; end if;
    if not private.crm_in_pool(v_c) then raise exception 'That email belongs to a CLA staff login; it cannot be a CRM client.' using errcode = 'P0001'; end if;
    update public.contacts set contact_type = coalesce(contact_type, l.contact_type), crm_owner_id = coalesce(crm_owner_id, l.owner_id), crm_stage = coalesce(crm_stage, 'prospect'),
      account_id = coalesce(account_id, v_acc), crm_lead_id = coalesce(crm_lead_id, l.id), relationship_status = coalesce(relationship_status, l.status),
      role_in_company = case when role_in_company = '' then l.role_in_company else role_in_company end, crm_state = case when crm_state = '' then l.crm_state else crm_state end,
      crm_county = case when crm_county = '' then l.crm_county else crm_county end, lead_source = case when lead_source = '' then l.source else lead_source end where id = v_c;
    v_linked := true;
  else
    if l.email <> '' and exists (select 1 from public.profiles where lower(email) = lower(l.email) and status <> 'removed') then raise exception 'A user with this email already exists.' using errcode = '23505'; end if;
    insert into public.contacts (first_name, last_name, email, phone, company, contact_type, created_by, account_id, crm_stage, crm_notes, crm_lead_id)
      values (l.first_name, l.last_name, lower(l.email), l.phone, coalesce((select name from public.crm_accounts where id = v_acc), l.company), l.contact_type, auth.uid(), v_acc, 'prospect', l.notes, l.id) returning id into v_c;
    update public.contacts set crm_owner_id = l.owner_id, relationship_status = l.status, lead_source = l.source, role_in_company = l.role_in_company, title = l.title, mobile = l.mobile,
      assistant = l.assistant, asst_phone = l.asst_phone, agent_split = l.agent_split, license_no = l.license_no, sales_volume_last_year = l.sales_volume_last_year,
      deals_closed_last_year = l.deals_closed_last_year, zillow_url = l.zillow_url, crm_street = l.crm_street, crm_city = l.crm_city, crm_state = l.crm_state, crm_zip = l.crm_zip,
      crm_county = l.crm_county, links = l.links where id = v_c;
  end if;
  if btrim(coalesce(p->>'opportunityName', '')) <> '' then
    insert into public.crm_opportunities (name, contact_id, account_id, owner_id, created_by) values (btrim(p->>'opportunityName'), v_c, coalesce(v_acc, (select account_id from public.contacts where id = v_c)), l.owner_id, auth.uid()) returning id into v_opp; end if;
  update public.crm_leads set converted_at = now(), converted_contact_id = v_c, converted_account_id = v_acc, status = 'Converted/Current Client' where id = l.id;
  -- the lead's activities and files show on the client page too (the screens read both records); nothing is moved or copied
  insert into public.crm_activities (entity, entity_id, kind, subject, system, created_by) values ('contact', v_c, 'note', 'Converted from lead ' || btrim(l.first_name || ' ' || l.last_name), true, auth.uid());
  return jsonb_build_object('contactId', v_c, 'accountId', v_acc, 'opportunityId', v_opp, 'linkedExisting', v_linked); end $$;

-- older "My follow-ups" (same signature as migration 22): p_status 'open' = not Completed, 'done' = Completed, 'cancelled', 'all'
create or replace function public.crm_follow_ups(p_owner uuid default null, p_status text default 'open', p_all boolean default false) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin perform private.crm_need();
  return coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('ownerName', coalesce(private.crm_name(a.owner_id), ''), 'open', a.status <> 'Completed', 'overdue', a.status <> 'Completed' and a.due_date < private.crm_today(),
      'reminderDue', a.status <> 'Completed' and a.reminder and a.reminder_at <= (now() at time zone 'America/New_York'),
      'parentName', case a.entity when 'lead' then (select btrim(first_name || ' ' || last_name) from public.crm_leads where id = a.entity_id) when 'contact' then (select btrim(first_name || ' ' || last_name) from public.contacts where id = a.entity_id)
        when 'account' then (select name from public.crm_accounts where id = a.entity_id) else (select name from public.crm_opportunities where id = a.entity_id) end)
    order by (a.status <> 'Completed' and a.due_date < private.crm_today()) desc, a.due_date)
    from public.crm_activities a where a.kind = 'task'
      and (p_status = 'all' or (p_status = 'open' and a.status <> 'Completed') or (p_status = 'done' and a.status = 'Completed' and not a.cancelled) or (p_status = 'cancelled' and a.cancelled))
      and (p_all or a.owner_id = coalesce(p_owner, auth.uid())) and private.crm_entity_visible(a.entity, a.entity_id)), '[]'::jsonb); end $$;
-- Close Task: Completed now; a repeating task gets its next occurrence (trigger). Returns the new task's id, if any.
create or replace function public.crm_close_task(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.crm_activities; v_next uuid;
begin perform private.crm_need(true);
  select * into a from public.crm_activities where id = p_id and kind = 'task';
  if a.id is null or not private.crm_entity_visible(a.entity, a.entity_id) then raise exception 'Task not found.' using errcode = 'P0002'; end if;
  if a.status = 'Completed' then raise exception 'This task is already closed.' using errcode = 'P0001'; end if;
  update public.crm_activities set status = 'Completed' where id = p_id;
  select id into v_next from public.crm_activities where repeat_of = p_id order by created_at desc limit 1;
  return jsonb_build_object('id', p_id, 'nextTaskId', v_next); end $$;
-- task owners / meeting hosts the caller may pick
create or replace function public.crm_assignees() returns table (id uuid, name text, role text) language plpgsql stable security definer set search_path = public as $$
begin perform private.crm_need();
  return query select p.id, btrim(p.first_name || ' ' || p.last_name), p.role from public.profiles p where p.status = 'active' and p.role in ('Sales Person', 'Sales Team', 'Admin', 'Super admin')
    and (private.is_admin() or coalesce(private.me_role() <> 'Sales Person', true) or p.id = auth.uid()) order by 2; end $$;
-- meetings a lead / client is a participant in (only meetings on records the caller can see)
create or replace function public.crm_invited_meetings(p_entity text, p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin perform private.crm_need();
  if not private.crm_entity_visible(p_entity, p_id) then raise exception 'Record not found.' using errcode = 'P0002'; end if;
  return coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('hostName', coalesce(private.crm_name(a.host_id), '')) order by a.starts_at)
    from public.crm_activities a where a.kind = 'meeting' and (p_entity || ':' || p_id::text) = any (a.participants) and private.crm_entity_visible(a.entity, a.entity_id)), '[]'::jsonb); end $$;

-- REPORTS: as migration 22, with Zoho lead sources ('(none)' for blank) and Relationship Status order
create or replace function public.crm_report(p_from date default null, p_to date default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin perform private.crm_need();
  if p_from is not null and p_to is not null and p_from > p_to then raise exception '"From" must be on or before "To".' using errcode = 'P0001'; end if;
  with d as (select * from public.deals where private.can_access_deal(id) and (p_from is null or open_date >= p_from) and (p_to is null or open_date <= p_to)),
  g as (
    select distinct 'realtor' grp, c.id::text k, btrim(c.first_name || ' ' || c.last_name) nm, coalesce((select name from public.crm_accounts where id = c.account_id), c.company) co, d.id deal_id, d.status, d.purchase_price
      from d join public.deal_participants dp on dp.deal_id = d.id and dp.role in ('Buyer Agent', 'Listing Agent') join public.contacts c on c.id = dp.contact_id
    union select distinct 'brokerage', coalesce('acc:' || c.account_id::text, case when c.company <> '' then 'co:' || lower(c.company) else 'none' end), coalesce((select name from public.crm_accounts where id = c.account_id), nullif(c.company, ''), '(no company)'), null, d.id, d.status, d.purchase_price
      from d join public.deal_participants dp on dp.deal_id = d.id and dp.role in ('Buyer Agent', 'Listing Agent') join public.contacts c on c.id = dp.contact_id
    union select distinct 'lender', c.id::text, btrim(c.first_name || ' ' || c.last_name), coalesce((select name from public.crm_accounts where id = c.account_id), c.company), d.id, d.status, d.purchase_price
      from d join public.deal_participants dp on dp.deal_id = d.id and dp.role = 'Lender' join public.contacts c on c.id = dp.contact_id
    union select distinct 'lender', 'name:' || lower(d.lender_name), coalesce(nullif(d.lender_contact, ''), d.lender_name), d.lender_name, d.id, d.status, d.purchase_price
      from d where d.lender_name <> '' and not exists (select 1 from public.deal_participants dp where dp.deal_id = d.id and dp.role = 'Lender')
    union select distinct 'sales', s.sales_id::text, private.crm_name(s.sales_id), null, d.id, d.status, d.purchase_price from d join public.deal_sales_people s on s.deal_id = d.id),
  t as (select grp, k, min(nm) nm, min(co) co, count(*) orders, count(*) filter (where status not in ('Closed', 'Cancelled')) open, count(*) filter (where status = 'Closed') closed,
      count(*) filter (where status = 'Cancelled') cancelled, coalesce(sum(purchase_price) filter (where status <> 'Cancelled'), 0) volume from g group by grp, k),
  l as (select * from public.crm_leads where private.crm_owner_ok(owner_id) and archived_at is null and (p_from is null or (created_at at time zone 'America/New_York')::date >= p_from) and (p_to is null or (created_at at time zone 'America/New_York')::date <= p_to))
  select jsonb_build_object('from', p_from, 'to', p_to,
    'totals', (select jsonb_build_object('orders', count(*), 'open', count(*) filter (where status not in ('Closed', 'Cancelled')), 'closed', count(*) filter (where status = 'Closed'), 'cancelled', count(*) filter (where status = 'Cancelled'), 'volume', coalesce(sum(purchase_price) filter (where status <> 'Cancelled'), 0)) from d),
    'byRealtor', coalesce((select jsonb_agg(jsonb_build_object('key', k, 'name', nm, 'company', coalesce(co, ''), 'orders', orders, 'open', open, 'closed', closed, 'cancelled', cancelled, 'volume', volume) order by orders desc, volume desc, nm) from t where grp = 'realtor'), '[]'),
    'byLender', coalesce((select jsonb_agg(jsonb_build_object('key', k, 'name', nm, 'company', coalesce(co, ''), 'orders', orders, 'open', open, 'closed', closed, 'cancelled', cancelled, 'volume', volume) order by orders desc, volume desc, nm) from t where grp = 'lender'), '[]'),
    'byBrokerage', coalesce((select jsonb_agg(jsonb_build_object('key', k, 'name', nm, 'orders', orders, 'open', open, 'closed', closed, 'cancelled', cancelled, 'volume', volume) order by orders desc, volume desc, nm) from t where grp = 'brokerage'), '[]'),
    'bySalesperson', coalesce((select jsonb_agg(jsonb_build_object('key', k, 'name', nm, 'orders', orders, 'open', open, 'closed', closed, 'cancelled', cancelled, 'volume', volume) order by orders desc, volume desc, nm) from t where grp = 'sales'), '[]'),
    'leadsBySource', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(nullif(source, ''), '(none)'), 'leads', n, 'converted', cv) order by n desc, source) from (select source, count(*) n, count(*) filter (where converted_at is not null) cv from l group by source) s), '[]'),
    'leadsByStatus', coalesce((select jsonb_agg(jsonb_build_object('name', status, 'leads', n, 'converted', cv) order by array_position(private.crm_statuses(), status)) from (select status, count(*) n, count(*) filter (where converted_at is not null) cv from l group by status) s), '[]'),
    'leadCount', (select count(*) from l)) into r;
  return r; end $$;

do $g$ declare f text; begin foreach f in array array['crm_contact_detail(uuid)', 'crm_account_detail(uuid)', 'crm_create_contact(jsonb)', 'crm_update_contact(uuid, jsonb)', 'crm_convert_lead(uuid, jsonb)',
    'crm_follow_ups(uuid, text, boolean)', 'crm_report(date, date)', 'crm_close_task(uuid)', 'crm_assignees()', 'crm_invited_meetings(text, uuid)'] loop
  execute 'revoke all on function public.' || f || ' from public, anon'; execute 'grant execute on function public.' || f || ' to authenticated'; end loop; end $g$;
