-- Already applied on TEST. Do not apply this file to TEST again.
-- Source: TEST history, supabase_migrations.schema_migrations, project aqcervntopidtcazcmlv.
-- Version 20261105223011, name crm_janine_nov3.
-- The text below this label is the exact history statement. The label is not part of that text.
-- =====================================================================
-- =====================================================================
-- Migration 37 (Janine, Nov 3; John approved): CRM feedback. FAKE DATA ONLY; nothing here emails, sends or calls anything.
--   * Relationship Status: Clients keep 'relationshipStatus'; Leads get their own list 'leadRelationshipStatus' (Janine's order).
--     A lead's older value stays (unchanged values always pass). On convert, a lead status that is not a client option becomes
--     'Converted/Current Client' on the client.
--   * Leads: Company = a lookup (crm_leads.account_id; the old typed text stays in company until a company is picked).
--   * Zillow URL is retired from the screens: its value is copied into links.zillowProfile when that is empty (once: zillow_moved).
--   * Companies: State is required; duplicates refused by a normalized name (private.crm_company_key), archived included.
--   * Tasks: REPEAT EVERY + quarterly / yearly, the day of month is kept (Jan 31 -> Apr 30 -> Jul 31; Feb 29 -> Feb 28).
--   * Meetings: crm_meeting_invites records an invite PREVIEW only (status 'preview'; nothing is sent; Gmail is not connected).
--   * Imports: crm_imports, a permanent log of CSV imports (Admin / Super admin). No deletes anywhere.
-- Re-runnable.
-- =====================================================================

-- ---------- pick lists ----------
create or replace function private.crm_list_keys() returns text[] language sql immutable as $$
  select array['relationshipStatus', 'leadRelationshipStatus', 'leadSource', 'roleInCompany', 'accountKind', 'oppStage', 'taskSubject', 'taskStatus', 'taskPriority', 'meetingType', 'callOutcome'] $$;
create or replace function private.crm_list_label(k text) returns text language sql immutable as $$
  select case k when 'relationshipStatus' then 'Relationship Status' when 'leadRelationshipStatus' then 'Relationship Status' when 'leadSource' then 'Lead Source' when 'roleInCompany' then 'Role in Company'
    when 'accountKind' then 'Company Type' when 'oppStage' then 'Pipeline Stage' when 'taskSubject' then 'Task Subject' when 'taskStatus' then 'Task Status' when 'taskPriority' then 'Task Priority'
    when 'meetingType' then 'Meeting Type' when 'callOutcome' then 'Outbound Call Outcome' else 'value' end $$;
insert into public.crm_picklist_options (list_key, value, label, position)
  select 'leadRelationshipStatus', v, v, n * 10 from unnest(array['Met With', 'Meeting Set', 'Open to Meet', 'Hot Prospect', 'Shows Interest', 'Not Interested', 'Do NOT Contact', 'Prospecting',
    'Voicemail 1', 'Voicemail 2', 'Voicemail 3', 'Voicemail 4', 'Voicemail 5', 'Need to find contact info', 'Need to verify contact info', 'No longer in real estate', 'Out of Range']) with ordinality o(v, n)
  on conflict (list_key, value) do nothing;
alter table public.crm_leads alter column status set default 'Prospecting';

-- ---------- leads: Company lookup ----------
alter table public.crm_leads add column if not exists account_id uuid references public.crm_accounts (id);
create index if not exists crm_leads_account_idx on public.crm_leads (account_id);

-- ---------- Zillow URL -> Zillow Profile (once) ----------
alter table public.contacts add column if not exists zillow_moved boolean not null default false;
alter table public.crm_leads add column if not exists zillow_moved boolean not null default false;
update public.contacts set links = coalesce(links, '{}'::jsonb) || jsonb_build_object('zillowProfile', zillow_url), zillow_moved = true
  where zillow_url <> '' and not zillow_moved and coalesce(links ->> 'zillowProfile', '') = '';
update public.crm_leads set links = coalesce(links, '{}'::jsonb) || jsonb_build_object('zillowProfile', zillow_url), zillow_moved = true
  where zillow_url <> '' and not zillow_moved and coalesce(links ->> 'zillowProfile', '') = '';

-- ---------- company key (same rules as companyKey() in public/js/data/crm.js) ----------
create or replace function private.crm_company_key(p text) returns text language plpgsql immutable as $$
declare s text := lower(coalesce(p, '')); t text;
begin
  s := translate(s, 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy');
  s := replace(s, '&', ' and ');
  s := btrim(regexp_replace(regexp_replace(s, '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'));
  s := regexp_replace(s, '(^| )l l (c|p)(?= |$)', '\1ll\2', 'g');   -- "L.L.C." = "LLC"
  s := regexp_replace(s, '^the ', '');
  s := regexp_replace(s, '( (inc|incorporated|llc|l l c|llp|ltd|limited|co|corp|corporation|company|pllc|pc|lp))+$', '');
  t := btrim(regexp_replace(regexp_replace(' ' || s || ' ', ' (inc|incorporated|llc|llp|ltd|corp|corporation|pllc)(?= )', '', 'g'), '\s+', ' ', 'g'));
  return coalesce(nullif(t, ''), s); end $$;
-- backfill: an older lead's typed company that matches exactly one active company gets linked (the text is kept)
update public.crm_leads l set account_id = (select a.id from public.crm_accounts a where a.archived_at is null and private.crm_company_key(a.name) = private.crm_company_key(l.company))
  where l.account_id is null and l.company <> ''
    and (select count(*) from public.crm_accounts a where a.archived_at is null and private.crm_company_key(a.name) = private.crm_company_key(l.company)) = 1;

-- ---------- company rules: State required, no duplicates ----------
create or replace function private.crm_account_rules() returns trigger language plpgsql security definer set search_path = public as $$
declare d public.crm_accounts;
begin
  -- State: required for every write by a signed-in user (the app, CRM functions such as convert); owner-run maintenance with no caller is exempt
  if auth.uid() is not null and (tg_op = 'INSERT' or new.state is distinct from old.state or new.name is distinct from old.name) then
    if coalesce(new.state, '') = '' then raise exception 'State is required: pick a US state (or DC).' using errcode = '23514'; end if; end if;
  if tg_op = 'INSERT' or private.crm_company_key(new.name) <> private.crm_company_key(old.name) then
    select * into d from public.crm_accounts a where a.id <> new.id and private.crm_company_key(a.name) = private.crm_company_key(new.name) order by a.archived_at nulls first limit 1;
    if d.id is not null then
      raise exception 'Already in the CRM: % (%)%. Duplicates are not allowed.', d.name, coalesce(nullif(d.state, ''), 'no state'), case when d.archived_at is not null then ' (archived: restore it instead)' else '' end
        using errcode = '23505', detail = 'crm_account:' || d.id::text; end if; end if;
  return new; end $$;
drop trigger if exists crm_accounts_janine_rules on public.crm_accounts;
create trigger crm_accounts_janine_rules before insert or update on public.crm_accounts for each row execute function private.crm_account_rules();
-- the screens' early warning (any CRM user; canOpen says whether that user may open it)
create or replace function public.crm_company_duplicate(p_name text, p_except uuid default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d public.crm_accounts;
begin perform private.crm_need();
  if private.crm_company_key(p_name) = '' then return null; end if;
  select * into d from public.crm_accounts a where (p_except is null or a.id <> p_except) and private.crm_company_key(a.name) = private.crm_company_key(p_name) order by a.archived_at nulls first limit 1;
  if d.id is null then return null; end if;
  return jsonb_build_object('id', d.id, 'name', d.name, 'state', d.state, 'archived', d.archived_at is not null, 'canOpen', private.crm_account_visible(d.id), 'link', '#/crm/accounts/' || d.id); end $$;
revoke all on function public.crm_company_duplicate(text, uuid) from public, anon;
grant execute on function public.crm_company_duplicate(text, uuid) to authenticated;

-- ---------- the record check (replaces migration 25's): Leads use their own list; lead company lookup ----------
create or replace function private.crm_settings_row() returns trigger language plpgsql security invoker set search_path = public as $$
declare o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end; l jsonb; ent text;
  direct boolean := current_user = 'authenticated';
begin
  if coalesce(current_setting('crm.spawn', true), '') = '1' then return new; end if;
  if tg_table_name = 'contacts' then
    if new.crm_lead_id is not null then l := private.crm_lead_values(new.crm_lead_id); end if;
    -- Janine, Nov 3: a lead's status that is not a client option becomes Converted/Current Client on the client
    if l is not null and new.relationship_status is not distinct from l ->> 'status' and new.relationship_status is distinct from o ->> 'relationship_status'
       and not private.crm_option_active('relationshipStatus', new.relationship_status) then new.relationship_status := 'Converted/Current Client'; end if;
    perform private.crm_list_check('roleInCompany', new.role_in_company, o ->> 'role_in_company', l ->> 'role_in_company', true);
    perform private.crm_list_check('leadSource', new.lead_source, o ->> 'lead_source', l ->> 'source', true);
    perform private.crm_list_check('relationshipStatus', new.relationship_status, o ->> 'relationship_status', l ->> 'status', true);
    ent := 'contact';
  elsif tg_table_name = 'crm_leads' then
    if coalesce(new.status, '') = '' then
      if private.crm_required('relationshipStatus') then raise exception 'Relationship Status is required.' using errcode = 'P0001'; end if;
      new.status := coalesce(case when private.crm_option_active('leadRelationshipStatus', 'Prospecting') then 'Prospecting' end, private.crm_first_option('leadRelationshipStatus')); end if;
    if tg_op = 'INSERT' and new.status = 'Prospecting' and not private.crm_option_active('leadRelationshipStatus', new.status) then new.status := private.crm_first_option('leadRelationshipStatus'); end if;   -- column default retired
    if new.account_id is distinct from (o ->> 'account_id')::uuid then
      if new.account_id is not null then
        if direct and not private.crm_account_visible(new.account_id) then raise exception 'Company not found.' using errcode = 'P0002'; end if;
        new.company := (select name from public.crm_accounts where id = new.account_id);
      elsif o is not null and o ->> 'account_id' is not null then new.company := ''; end if; end if;
    perform private.crm_list_check('roleInCompany', new.role_in_company, o ->> 'role_in_company', null, true);
    perform private.crm_list_check('leadSource', new.source, o ->> 'source', null, true);
    if not (new.converted_at is not null and new.status = 'Converted/Current Client') then
      perform private.crm_list_check('leadRelationshipStatus', new.status, o ->> 'status', null, false); end if;
    ent := 'lead';
  elsif tg_table_name = 'crm_accounts' then perform private.crm_list_check('accountKind', new.kind, o ->> 'kind', null, false); ent := 'account';
  elsif tg_table_name = 'crm_opportunities' then perform private.crm_list_check('oppStage', new.stage, o ->> 'stage', null, false); ent := 'opportunity';
  elsif tg_table_name = 'crm_activities' then
    if new.kind = 'task' then
      if tg_op = 'INSERT' and new.priority = 'High' and not private.crm_option_active('taskPriority', 'High') then new.priority := private.crm_first_option('taskPriority'); end if;
      perform private.crm_list_check('taskStatus', new.status, o ->> 'status', null, false);
      perform private.crm_list_check('taskPriority', new.priority, o ->> 'priority', null, false);
    elsif new.kind = 'meeting' then perform private.crm_list_check('meetingType', new.meeting_type, o ->> 'meeting_type', null, true); end if;
    return new;
  end if;
  new.custom := private.crm_custom_in(ent, new.custom, o -> 'custom', tg_op = 'INSERT', direct and tg_op = 'INSERT' and ent <> 'contact');
  return new; end $$;

-- ---------- convert: the new company needs a State (accountState, else the lead's state); duplicates by company key ----------
create or replace function public.crm_convert_lead(p_lead uuid, p jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.crm_leads; v_acc uuid := nullif(p->>'accountId', '')::uuid; v_name text := btrim(coalesce(p->>'newAccountName', '')); v_c uuid; v_opp uuid; v_linked boolean := false;
  v_state text;
begin perform private.crm_need(true);
  select * into l from public.crm_leads where id = p_lead;
  if l.id is null or not private.crm_owner_ok(l.owner_id) then raise exception 'Lead not found.' using errcode = 'P0002'; end if;
  if l.converted_at is not null then raise exception 'This lead was already converted.' using errcode = 'P0001'; end if;
  if l.archived_at is not null then raise exception 'Restore this lead before converting it.' using errcode = 'P0001'; end if;
  if v_acc is null and v_name = '' and not (p ? 'accountId') then v_acc := l.account_id; end if;   -- Janine, Nov 3: the lead's company lookup
  if v_acc is not null and not private.crm_account_visible(v_acc) then raise exception 'Company not found.' using errcode = 'P0002'; end if;
  if v_acc is null and v_name <> '' then
    if exists (select 1 from public.crm_accounts where private.crm_company_key(name) = private.crm_company_key(v_name)) then raise exception 'A company with this name already exists; pick it from the list.' using errcode = '23505'; end if;
    v_state := upper(coalesce(nullif(p->>'accountState', ''), l.crm_state));
    if v_state = '' or not private.us_state_ok(v_state) then raise exception 'Pick a US state (or DC) for the new company.' using errcode = '23514'; end if;
    insert into public.crm_accounts (name, kind, state, owner_id, created_by) values (v_name, coalesce(nullif(p->>'accountKind', ''), case l.contact_type when 'realtor' then 'brokerage' when 'lender' then 'lender' else 'other' end), v_state, l.owner_id, auth.uid()) returning id into v_acc;
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
      deals_closed_last_year = l.deals_closed_last_year, zillow_url = l.zillow_url, zillow_moved = l.zillow_moved, crm_street = l.crm_street, crm_city = l.crm_city, crm_state = l.crm_state, crm_zip = l.crm_zip,
      crm_county = l.crm_county, links = l.links where id = v_c;
  end if;
  if btrim(coalesce(p->>'opportunityName', '')) <> '' then
    insert into public.crm_opportunities (name, contact_id, account_id, owner_id, created_by) values (btrim(p->>'opportunityName'), v_c, coalesce(v_acc, (select account_id from public.contacts where id = v_c)), l.owner_id, auth.uid()) returning id into v_opp; end if;
  update public.crm_leads set converted_at = now(), converted_contact_id = v_c, converted_account_id = v_acc, status = 'Converted/Current Client' where id = l.id;
  insert into public.crm_activities (entity, entity_id, kind, subject, system, created_by) values ('contact', v_c, 'note', 'Converted from lead ' || btrim(l.first_name || ' ' || l.last_name), true, auth.uid());
  return jsonb_build_object('contactId', v_c, 'accountId', v_acc, 'opportunityId', v_opp, 'linkedExisting', v_linked); end $$;

-- ---------- tasks: quarterly / yearly, keeping the day of month ----------
alter table public.crm_activities add column if not exists repeat_anchor_day smallint check (repeat_anchor_day is null or repeat_anchor_day between 1 and 31);
alter table public.crm_activities drop constraint if exists crm_activities_fields_check;
alter table public.crm_activities add constraint crm_activities_fields_check check (
  (kind = 'task' or status = 'done') and char_length(status) <= 80 and char_length(priority) <= 80 and char_length(meeting_type) <= 80 and (not reminder or reminder_at is not null)
  and repeat_every in ('', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly') and (repeat_until is null or due_date is null or repeat_until >= due_date)
  and (kind = 'task' or (repeat_every = '' and not reminder))
  and char_length(location) <= 200
  and (kind <> 'meeting' or starts_at is null or (ends_at is not null and ends_at >= starts_at))
  and cardinality(participants) <= 50 and array_to_string(participants, ',') ~ '^((lead|contact|user):[0-9a-f-]{36}(,|$))*$');
-- the next due date: + N months on the anchor day, clamped to the month's last day
create or replace function private.crm_next_due(p_due date, p_every text, p_anchor int) returns date language plpgsql immutable as $$
declare m int; base date; a int := coalesce(p_anchor, extract(day from p_due)::int);
begin
  if p_every = 'daily' then return p_due + 1; elsif p_every = 'weekly' then return p_due + 7; end if;
  m := case p_every when 'monthly' then 1 when 'quarterly' then 3 when 'yearly' then 12 else null end; if m is null then return null; end if;
  base := (date_trunc('month', p_due) + make_interval(months => m))::date;
  return base + (least(a, extract(day from (base + interval '1 month' - interval '1 day'))::int) - 1); end $$;
create or replace function private.crm_task_anchor() returns trigger language plpgsql as $$
begin
  if new.kind <> 'task' or coalesce(current_setting('crm.spawn', true), '') = '1' then return new; end if;
  if new.repeat_every = '' or new.due_date is null then new.repeat_anchor_day := null;
  elsif tg_op = 'INSERT' or new.repeat_anchor_day is null or new.due_date is distinct from old.due_date or new.repeat_every is distinct from old.repeat_every then
    new.repeat_anchor_day := extract(day from new.due_date)::int; end if;
  return new; end $$;
drop trigger if exists crm_activities_anchor on public.crm_activities;
create trigger crm_activities_anchor before insert or update on public.crm_activities for each row execute function private.crm_task_anchor();
create or replace function private.crm_task_repeat() returns trigger language plpgsql security definer set search_path = public as $$
declare v_due date;
begin
  if new.kind = 'task' and new.status = 'Completed' and not new.cancelled and old.status <> 'Completed' and new.repeat_every <> '' and new.due_date is not null then
    v_due := private.crm_next_due(new.due_date, new.repeat_every, new.repeat_anchor_day);
    if v_due is not null and (new.repeat_until is null or v_due <= new.repeat_until) then
      perform set_config('crm.spawn', '1', true);
      insert into public.crm_activities (entity, entity_id, kind, subject, body, status, due_date, owner_id, priority, reminder, reminder_at, repeat_every, repeat_until, repeat_anchor_day, repeat_of, created_by)
        values (new.entity, new.entity_id, 'task', new.subject, new.body, 'Not Started', v_due, new.owner_id, new.priority, new.reminder,
          case when new.reminder then new.reminder_at + (v_due - new.due_date) * interval '1 day' end, new.repeat_every, new.repeat_until, coalesce(new.repeat_anchor_day, extract(day from new.due_date)::int), new.id, coalesce(auth.uid(), new.created_by));
      perform set_config('crm.spawn', '', true); end if; end if;
  return null; end $$;

-- ---------- meeting invite PREVIEWS (nothing is sent) ----------
create table if not exists public.crm_meeting_invites (
  id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.crm_activities (id),
  status text not null default 'preview' check (status = 'preview'),   -- 'sent' is not allowed until Gmail is connected (a later migration)
  to_emails text[] not null default '{}' check (cardinality(to_emails) <= 50),
  created_by uuid not null default auth.uid() references public.profiles (id), created_at timestamptz not null default now());
create index if not exists crm_meeting_invites_meeting_idx on public.crm_meeting_invites (meeting_id);
alter table public.crm_meeting_invites enable row level security;
create or replace function private.crm_meeting_visible(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crm_activities a where a.id = p and a.kind = 'meeting' and private.crm_entity_visible(a.entity, a.entity_id)) $$;
drop policy if exists crm_inv_select on public.crm_meeting_invites;
create policy crm_inv_select on public.crm_meeting_invites for select to authenticated using (private.crm_meeting_visible(meeting_id));
drop policy if exists crm_inv_insert on public.crm_meeting_invites;
create policy crm_inv_insert on public.crm_meeting_invites for insert to authenticated with check (private.crm_editor() and private.crm_meeting_visible(meeting_id) and status = 'preview' and created_by = auth.uid());
revoke all on public.crm_meeting_invites from anon;
grant select, insert on public.crm_meeting_invites to authenticated;   -- no update, no delete

-- ---------- CSV import log (Admin / Super admin) ----------
create table if not exists public.crm_imports (
  id uuid primary key default gen_random_uuid(), module text not null check (module in ('leads', 'contacts')), kind text not null check (kind in ('records', 'notes')),
  file_name text not null default '' check (char_length(file_name) <= 200),
  total int not null default 0 check (total between 0 and 2000), created int not null default 0 check (created >= 0), duplicates int not null default 0 check (duplicates >= 0), errors int not null default 0 check (errors >= 0),
  created_by uuid not null default auth.uid() references public.profiles (id), created_at timestamptz not null default now());
alter table public.crm_imports enable row level security;
drop policy if exists crm_imports_select on public.crm_imports;
create policy crm_imports_select on public.crm_imports for select to authenticated using (private.is_admin());
drop policy if exists crm_imports_insert on public.crm_imports;
create policy crm_imports_insert on public.crm_imports for insert to authenticated with check (private.is_admin() and created_by = auth.uid());
revoke all on public.crm_imports from anon;
grant select, insert on public.crm_imports to authenticated;   -- no update, no delete
