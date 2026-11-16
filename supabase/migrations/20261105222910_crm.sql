-- Already applied on TEST. Do not apply this file to TEST again.
-- Source: TEST history, supabase_migrations.schema_migrations, project aqcervntopidtcazcmlv.
-- Version 20261105222910, name crm.
-- The text below this label is the exact history statement. The label is not part of that text.
-- Filename 20261105222910_crm.sql sorts before 20261105222910_private_features.sql
-- and before 20261105222952_accounting_fees.sql, which is where TEST ran this version.
-- The private.features file is only the features table from this same history row.
-- =====================================================================
-- =====================================================================
-- Migration 22 (John, Nov 2): the CRM (Zoho-like, for CLA's sales team). See docs/CRM.md. Re-runnable (idempotent).
--  * FEATURE SWITCH: private.features ('crm', enabled = false by default). While it is off every CRM policy / function refuses,
--    so a live database shows no CRM data even if someone flips only the browser flag. Turn on:  update private.features set enabled = true where name = 'crm';
--  * People = the portal's own public.contacts (one person per email). New CRM columns: crm_owner_id, account_id, crm_stage,
--    last_contacted_on, tags, crm_notes, crm_lead_id, crm_archived_at. CLA staff contacts are not CRM contacts.
--  * New tables: crm_accounts (brokerages / lenders), crm_leads, crm_opportunities (pipeline), crm_activities (calls, emails = log only,
--    meetings, notes, follow-up tasks). NO deletes anywhere (no policy, no grant, and a trigger): records are archived.
--  * Access: Admin / Super admin all + edit; Processor all, READ-ONLY; Sales Person own + linked (client_sales_reps, or on an order of theirs
--    via deal_sales_people); Sales Team = the sales team's (owned by any salesperson, or unowned) + linked. TCs and outside users: none.
-- =====================================================================
create table if not exists private.features (name text primary key, enabled boolean not null default false, note text not null default '');
insert into private.features (name, enabled, note) values ('crm', false, 'Zoho-like CRM (migration 22). Off by default at go-live.') on conflict (name) do nothing;

create or replace function private.crm_on() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from private.features where name = 'crm'), false) $$;
create or replace function private.crm_user() returns boolean language sql stable security definer set search_path = public as $$
  select private.crm_on() and (private.is_admin() or coalesce(private.me_role() in ('Processor', 'Sales Person', 'Sales Team'), false)) $$;
create or replace function private.crm_editor() returns boolean language sql stable security definer set search_path = public as $$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false)) $$;
create or replace function private.crm_all() returns boolean language sql stable security definer set search_path = public as $$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() = 'Processor', false)) $$;
create or replace function private.crm_sales_profile(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p and role in ('Sales Person', 'Sales Team')) $$;
create or replace function private.crm_owner_ok(p_owner uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.crm_user() and (private.crm_all() or p_owner = auth.uid()
    or (coalesce(private.me_role() = 'Sales Team', false) and (p_owner is null or private.crm_sales_profile(p_owner)))) $$;

-- ---------- accounts ----------
create table if not exists public.crm_accounts (
  id uuid primary key default gen_random_uuid(), name text not null check (char_length(btrim(name)) between 1 and 160),
  kind text not null default 'other' check (kind in ('brokerage', 'lender', 'other')),
  phone text not null default '', website text not null default '', city text not null default '', state text not null default '' check (state = '' or private.us_state_ok(state)),
  owner_id uuid references public.profiles (id), notes text not null default '', archived_at timestamptz,
  created_by uuid references public.profiles (id), created_at timestamptz not null default now());
create unique index if not exists crm_accounts_name_uq on public.crm_accounts (lower(btrim(name))) where archived_at is null;

-- ---------- CRM fields on the portal's contacts ----------
alter table public.contacts add column if not exists crm_owner_id uuid references public.profiles (id);
alter table public.contacts add column if not exists account_id uuid references public.crm_accounts (id);
alter table public.contacts add column if not exists crm_stage text;
alter table public.contacts add column if not exists last_contacted_on date;
alter table public.contacts add column if not exists tags text[] not null default '{}';
alter table public.contacts add column if not exists crm_notes text not null default '';
alter table public.contacts add column if not exists crm_lead_id uuid;
alter table public.contacts add column if not exists crm_archived_at timestamptz;
alter table public.contacts drop constraint if exists contacts_crm_stage_check;
alter table public.contacts add constraint contacts_crm_stage_check check (crm_stage is null or crm_stage in ('prospect', 'active_partner', 'inactive'));
alter table public.contacts drop constraint if exists contacts_tags_check;
alter table public.contacts add constraint contacts_tags_check check (cardinality(tags) <= 10);
create index if not exists contacts_crm_owner_idx on public.contacts (crm_owner_id);
create index if not exists contacts_account_idx on public.contacts (account_id);

-- ---------- leads ----------
create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(), first_name text not null check (char_length(btrim(first_name)) between 1 and 80), last_name text not null default '',
  company text not null default '', email text not null default '' check (email = '' or email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'), phone text not null default '',
  contact_type text check (contact_type is null or contact_type in ('realtor', 'lender', 'buyer_seller')),
  source text not null default 'Other' check (source in ('Referral', 'Website', 'Open house', 'Event', 'Cold call', 'Past client', 'Social media', 'Other')),
  status text not null default 'New' check (status in ('New', 'Contacted', 'Qualified', 'Unqualified')),
  owner_id uuid references public.profiles (id), notes text not null default '',
  converted_at timestamptz, converted_contact_id uuid references public.contacts (id), converted_account_id uuid references public.crm_accounts (id), archived_at timestamptz,
  created_by uuid references public.profiles (id), created_at timestamptz not null default now());
create unique index if not exists crm_leads_open_email_uq on public.crm_leads (lower(email)) where email <> '' and converted_at is null and archived_at is null;
create index if not exists crm_leads_owner_idx on public.crm_leads (owner_id);

-- ---------- pipeline ----------
create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(), name text not null check (char_length(btrim(name)) between 1 and 160),
  stage text not null default 'New' check (stage in ('New', 'Meeting set', 'Proposal', 'Won', 'Lost')),
  contact_id uuid references public.contacts (id), account_id uuid references public.crm_accounts (id), owner_id uuid references public.profiles (id),
  est_volume numeric(14,2) check (est_volume is null or est_volume >= 0), expected_close date, notes text not null default '', archived_at timestamptz,
  created_by uuid references public.profiles (id), created_at timestamptz not null default now(),
  constraint crm_opportunities_link check (contact_id is not null or account_id is not null));

-- ---------- activities + follow-ups ----------
create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('lead', 'contact', 'account', 'opportunity')), entity_id uuid not null,
  kind text not null check (kind in ('call', 'email', 'meeting', 'note', 'task')),
  subject text not null check (char_length(btrim(subject)) between 1 and 200), body text not null default '',
  status text not null default 'done' check (status in ('open', 'done', 'cancelled')), due_date date, occurred_on date,
  owner_id uuid references public.profiles (id), system boolean not null default false,
  created_by uuid references public.profiles (id), created_at timestamptz not null default now(), done_at timestamptz,
  constraint crm_activities_task check (kind <> 'task' or (due_date is not null and owner_id is not null)),
  constraint crm_activities_status check (kind = 'task' or status = 'done'));
create index if not exists crm_activities_entity_idx on public.crm_activities (entity, entity_id);
create index if not exists crm_activities_owner_idx on public.crm_activities (owner_id, status);

-- ---------- visibility ----------
create or replace function private.crm_in_pool(p_contact uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.contacts c where c.id = p_contact)
    and not exists (select 1 from public.contacts c join public.profiles p on p.id = c.profile_id where c.id = p_contact and p.role <> 'Outside user' and p.status <> 'removed') $$;
create or replace function private.crm_linked(p_contact uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false) and (
    exists (select 1 from public.contacts c join public.client_sales_reps l on l.client_id = c.profile_id where c.id = p_contact and l.sales_id = auth.uid())
    or exists (select 1 from public.deal_participants dp join public.deal_sales_people s on s.deal_id = dp.deal_id where dp.contact_id = p_contact and s.sales_id = auth.uid())) $$;
create or replace function private.crm_contact_visible(p_contact uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.crm_user() and private.crm_in_pool(p_contact)
    and (private.crm_owner_ok((select crm_owner_id from public.contacts where id = p_contact)) or private.crm_linked(p_contact)) $$;
create or replace function private.crm_account_visible(p_account uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.crm_user() and exists (select 1 from public.crm_accounts a where a.id = p_account)
    and (private.crm_owner_ok((select owner_id from public.crm_accounts where id = p_account))
      or exists (select 1 from public.contacts c where c.account_id = p_account and private.crm_contact_visible(c.id))) $$;
create or replace function private.crm_opp_visible(p_opp uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.crm_user() and exists (select 1 from public.crm_opportunities o where o.id = p_opp and (private.crm_owner_ok(o.owner_id)
    or (o.contact_id is not null and private.crm_contact_visible(o.contact_id)) or (o.account_id is not null and private.crm_account_visible(o.account_id)))) $$;
create or replace function private.crm_entity_visible(p_entity text, p_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select case p_entity when 'lead' then private.crm_owner_ok((select owner_id from public.crm_leads where id = p_id)) and exists (select 1 from public.crm_leads where id = p_id)
    when 'contact' then private.crm_contact_visible(p_id) when 'account' then private.crm_account_visible(p_id) when 'opportunity' then private.crm_opp_visible(p_id) else false end $$;

-- ---------- owner rules (all CRM tables + contacts): an owner is an active Sales Person / Sales Team login; a Sales Person assigns to themselves only ----------
drop function if exists private.crm_owner_check(uuid, uuid);
create or replace function private.crm_owner_check(p_new uuid, p_old uuid, p_insert boolean) returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  -- a salesperson's new records are theirs when no owner is given
  if p_insert and p_new is null and auth.uid() is not null and not private.is_admin() and coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false) then p_new := auth.uid(); end if;
  if p_new is not null and p_new is distinct from p_old and not exists (select 1 from public.profiles where id = p_new and status = 'active' and role in ('Sales Person', 'Sales Team')) then
    raise exception 'The owner must be an active Sales Person or Sales Team user.' using errcode = 'P0001'; end if;
  if auth.uid() is not null and p_new is distinct from p_old and p_new is distinct from auth.uid() and not private.is_admin() and coalesce(private.me_role() = 'Sales Person', false) then
    raise exception 'A Sales Person can only assign records to themselves.' using errcode = 'P0001'; end if;
  return p_new; end $$;
create or replace function private.crm_row_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'CRM records are never deleted; archive them instead.' using errcode = 'P0001'; end if;
  if auth.uid() is not null and not private.crm_editor() then raise exception 'You cannot change CRM records.' using errcode = '42501'; end if;
  if tg_table_name = 'crm_activities' then
    if tg_op = 'UPDATE' then
      if old.system then raise exception 'This entry was written by the CRM and cannot be changed.' using errcode = 'P0001'; end if;
      if (new.entity, new.entity_id, new.kind) is distinct from (old.entity, old.entity_id, old.kind) then raise exception 'An activity cannot move to another record.' using errcode = 'P0001'; end if; end if;
    if new.kind = 'task' then new.owner_id := private.crm_owner_check(new.owner_id, case when tg_op = 'UPDATE' then old.owner_id end, tg_op = 'INSERT');
      new.done_at := case when new.status = 'done' then coalesce(new.done_at, now()) else null end;
    else new.owner_id := coalesce(new.owner_id, auth.uid()); new.occurred_on := coalesce(new.occurred_on, private.office_today());
      if new.occurred_on > private.office_today() then raise exception 'The date cannot be in the future.' using errcode = 'P0001'; end if; end if;
    if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
    return new; end if;
  new.owner_id := private.crm_owner_check(new.owner_id, case when tg_op = 'UPDATE' then old.owner_id end, tg_op = 'INSERT');
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
  if tg_table_name = 'crm_leads' then   -- (nested: plpgsql does not short-circuit field lookups on other tables' rows)
    if new.email <> '' and (tg_op = 'INSERT' or lower(new.email) <> lower(old.email)) and exists (select 1 from public.contacts c where lower(c.email) = lower(new.email)) then
      raise exception 'This person is already a contact (one person per email).' using errcode = '23505'; end if;
    if tg_op = 'UPDATE' then if old.converted_at is not null and auth.uid() is not null and new.archived_at is not distinct from old.archived_at then
      raise exception 'This lead was converted; edit the contact instead.' using errcode = 'P0001'; end if; end if;
  end if;
  return new; end $$;
do $t$ declare t text; begin foreach t in array array['crm_accounts', 'crm_leads', 'crm_opportunities', 'crm_activities'] loop
  execute format('drop trigger if exists %I on public.%I', t || '_guard', t);
  execute format('create trigger %I before insert or update or delete on public.%I for each row execute function private.crm_row_guard()', t || '_guard', t);
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from public, anon, authenticated', t);
  execute format('grant select, insert, update on public.%I to authenticated', t);   -- never delete
end loop; end $t$;
-- CRM columns on contacts: only CRM editors change them (the Processor's normal contact edits leave them alone); a staff contact has none
create or replace function private.contacts_crm_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.crm_owner_id, new.account_id, new.crm_stage, new.last_contacted_on, new.tags, new.crm_notes, new.crm_lead_id, new.crm_archived_at)
     is distinct from (old.crm_owner_id, old.account_id, old.crm_stage, old.last_contacted_on, old.tags, old.crm_notes, old.crm_lead_id, old.crm_archived_at) then
    if auth.uid() is not null and not private.crm_editor() then raise exception 'You cannot change CRM details.' using errcode = '42501'; end if;
    if new.crm_owner_id is distinct from old.crm_owner_id then new.crm_owner_id := private.crm_owner_check(new.crm_owner_id, old.crm_owner_id, false); end if;
    if new.last_contacted_on > private.office_today() then raise exception 'Last contacted cannot be in the future.' using errcode = 'P0001'; end if;
  end if;
  return new; end $$;
drop trigger if exists contacts_crm_guard on public.contacts;
create trigger contacts_crm_guard before update on public.contacts for each row execute function private.contacts_crm_guard();

-- ---------- RLS ----------
drop policy if exists crm_accounts_select on public.crm_accounts;
create policy crm_accounts_select on public.crm_accounts for select to authenticated using (private.crm_account_visible(id));
drop policy if exists crm_accounts_insert on public.crm_accounts;
create policy crm_accounts_insert on public.crm_accounts for insert to authenticated with check (private.crm_editor() and private.crm_owner_ok(owner_id));   -- checked after the guard trigger fills a default owner
drop policy if exists crm_accounts_update on public.crm_accounts;
create policy crm_accounts_update on public.crm_accounts for update to authenticated using (private.crm_editor() and private.crm_account_visible(id)) with check (private.crm_editor());
drop policy if exists crm_leads_select on public.crm_leads;
create policy crm_leads_select on public.crm_leads for select to authenticated using (private.crm_owner_ok(owner_id));
drop policy if exists crm_leads_insert on public.crm_leads;
create policy crm_leads_insert on public.crm_leads for insert to authenticated with check (private.crm_editor() and private.crm_owner_ok(owner_id));
drop policy if exists crm_leads_update on public.crm_leads;
create policy crm_leads_update on public.crm_leads for update to authenticated using (private.crm_editor() and private.crm_owner_ok(owner_id)) with check (private.crm_editor() and private.crm_owner_ok(owner_id));
drop policy if exists crm_opps_select on public.crm_opportunities;
create policy crm_opps_select on public.crm_opportunities for select to authenticated using (private.crm_opp_visible(id));
drop policy if exists crm_opps_insert on public.crm_opportunities;
create policy crm_opps_insert on public.crm_opportunities for insert to authenticated with check (private.crm_editor() and (private.crm_owner_ok(owner_id)
  or (contact_id is not null and private.crm_contact_visible(contact_id)) or (account_id is not null and private.crm_account_visible(account_id))));
drop policy if exists crm_opps_update on public.crm_opportunities;
create policy crm_opps_update on public.crm_opportunities for update to authenticated using (private.crm_editor() and private.crm_opp_visible(id)) with check (private.crm_editor());
drop policy if exists crm_acts_select on public.crm_activities;
create policy crm_acts_select on public.crm_activities for select to authenticated using (private.crm_entity_visible(entity, entity_id));
drop policy if exists crm_acts_insert on public.crm_activities;
create policy crm_acts_insert on public.crm_activities for insert to authenticated with check (private.crm_editor() and not system and private.crm_entity_visible(entity, entity_id));
drop policy if exists crm_acts_update on public.crm_activities;
create policy crm_acts_update on public.crm_activities for update to authenticated using (private.crm_editor() and private.crm_entity_visible(entity, entity_id)) with check (private.crm_editor());

-- ---------- functions the screens call (all refuse when the CRM is off or the caller is not CRM staff) ----------
create or replace function private.crm_need(p_edit boolean default false) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not private.crm_on() then raise exception 'The CRM is turned off on this portal.' using errcode = '42501'; end if;
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  if p_edit and not private.crm_editor() then raise exception 'The Processor has read-only access to the CRM.' using errcode = '42501'; end if;
end $$;
create or replace function private.crm_name(p uuid) returns text language sql stable security definer set search_path = public as $$
  select btrim(first_name || ' ' || last_name) || case when status = 'removed' then ' (removed)' else '' end from public.profiles where id = p $$;
create or replace function private.crm_today() returns date language sql stable as $$ select (now() at time zone 'America/New_York')::date $$;
-- orders (deals) the given people are on, with each person's role(s); volume / totals are summed by the screen. can_open = caller may open the file.
create or replace function private.crm_orders(p_contacts uuid[]) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(o order by o->>'openDate' desc), '[]'::jsonb) from (
    select jsonb_build_object('dealId', d.id, 'fileNumber', d.file_number, 'address', d.street || ', ' || d.city || ', ' || d.state || ' ' || d.zip, 'openDate', d.open_date,
      'closingDate', d.closing_date, 'status', d.status, 'purchasePrice', d.purchase_price, 'canOpen', private.can_access_deal(d.id),
      'roles', (select jsonb_agg(distinct dp.role) from public.deal_participants dp where dp.deal_id = d.id and dp.contact_id = any (p_contacts)),
      'people', (select jsonb_agg(distinct btrim(c.first_name || ' ' || c.last_name) || ': ' || dp.role) from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = d.id and dp.contact_id = any (p_contacts))) o
    from public.deals d where exists (select 1 from public.deal_participants dp where dp.deal_id = d.id and dp.contact_id = any (p_contacts))) x $$;
create or replace function private.crm_contact_json(p_id uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'name', btrim(c.first_name || ' ' || c.last_name), 'firstName', c.first_name, 'lastName', c.last_name, 'email', c.email, 'phone', c.phone, 'company', c.company,
    'contactType', c.contact_type, 'hasLogin', c.profile_id is not null, 'ownerId', c.crm_owner_id, 'ownerName', coalesce(private.crm_name(c.crm_owner_id), ''),
    'accountId', c.account_id, 'accountName', coalesce((select name from public.crm_accounts where id = c.account_id), ''), 'stage', c.crm_stage, 'lastContactedOn', c.last_contacted_on,
    'tags', to_jsonb(c.tags), 'notes', c.crm_notes, 'archived', c.crm_archived_at is not null, 'fromLeadId', c.crm_lead_id, 'linked', private.crm_linked(c.id), 'canEdit', private.crm_editor(),
    'salesReps', coalesce((select jsonb_agg(jsonb_build_object('id', l.sales_id, 'name', private.crm_name(l.sales_id))) from public.client_sales_reps l where l.client_id = c.profile_id), '[]'::jsonb),
    'orders', (select count(distinct dp.deal_id) from public.deal_participants dp where dp.contact_id = c.id),
    'volume', coalesce((select sum(d.purchase_price) from public.deals d where d.status <> 'Cancelled' and exists (select 1 from public.deal_participants dp where dp.deal_id = d.id and dp.contact_id = c.id)), 0))
  from public.contacts c where c.id = p_id $$;

create or replace function public.crm_owners() returns table (id uuid, name text, role text) language plpgsql stable security definer set search_path = public as $$
begin perform private.crm_need(); return query select p.id, btrim(p.first_name || ' ' || p.last_name), p.role from public.profiles p where p.status = 'active' and p.role in ('Sales Person', 'Sales Team') order by 2; end $$;
create or replace function public.crm_contact_list() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin perform private.crm_need();
  return coalesce((select jsonb_agg(private.crm_contact_json(c.id)) from public.contacts c where private.crm_contact_visible(c.id)), '[]'::jsonb); end $$;
create or replace function public.crm_contact_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin perform private.crm_need();
  if not private.crm_contact_visible(p_id) then raise exception 'Contact not found.' using errcode = 'P0002'; end if;
  return private.crm_contact_json(p_id) || jsonb_build_object('orders', private.crm_orders(array[p_id])); end $$;
create or replace function public.crm_account_list() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin perform private.crm_need();
  return coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('ownerName', coalesce(private.crm_name(a.owner_id), ''), 'archived', a.archived_at is not null, 'canEdit', private.crm_editor(),
      'contacts', (select count(*) from public.contacts c where c.account_id = a.id and private.crm_contact_visible(c.id)),
      'orders', (select count(distinct dp.deal_id) from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where c.account_id = a.id and private.crm_in_pool(c.id)),
      'volume', coalesce((select sum(d.purchase_price) from public.deals d where d.status <> 'Cancelled' and exists (select 1 from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = d.id and c.account_id = a.id and private.crm_in_pool(c.id))), 0)))
    from public.crm_accounts a where private.crm_account_visible(a.id)), '[]'::jsonb); end $$;
create or replace function public.crm_account_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin perform private.crm_need();
  if not private.crm_account_visible(p_id) then raise exception 'Account not found.' using errcode = 'P0002'; end if;
  return jsonb_build_object('contactList', coalesce((select jsonb_agg(private.crm_contact_json(c.id)) from public.contacts c where c.account_id = p_id and private.crm_contact_visible(c.id)), '[]'::jsonb),
    'orders', private.crm_orders(coalesce((select array_agg(c.id) from public.contacts c where c.account_id = p_id and private.crm_in_pool(c.id)), '{}'))); end $$;

create or replace function public.crm_create_contact(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_email text := lower(btrim(coalesce(p->>'email', ''))); v_acc uuid := nullif(p->>'accountId', '')::uuid;
begin perform private.crm_need(true);
  if v_email <> '' and exists (select 1 from public.contacts where lower(email) = v_email) then raise exception 'A contact with this email already exists (one person per email).' using errcode = '23505'; end if;
  if v_email <> '' and exists (select 1 from public.profiles where lower(email) = v_email and status <> 'removed') then raise exception 'A user with this email already exists.' using errcode = '23505'; end if;
  if v_acc is not null and not private.crm_account_visible(v_acc) then raise exception 'Account not found.' using errcode = 'P0002'; end if;
  insert into public.contacts (id, first_name, last_name, email, phone, company, contact_type, created_by, crm_stage, tags, crm_notes, account_id)
    values (v_id, btrim(coalesce(p->>'firstName', '')), btrim(coalesce(p->>'lastName', '')), v_email, coalesce(p->>'phone', ''),
      coalesce(nullif(btrim(coalesce(p->>'company', '')), ''), (select name from public.crm_accounts where id = v_acc), ''), nullif(p->>'contactType', ''), auth.uid(),
      coalesce(nullif(p->>'stage', ''), 'prospect'), coalesce((select array_agg(distinct lower(btrim(t))) from jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb)) t where btrim(t) <> ''), '{}'), coalesce(p->>'notes', ''), v_acc);
  -- owner goes through the guard trigger (defaults to a salesperson themselves)
  update public.contacts set crm_owner_id = private.crm_owner_check(nullif(p->>'ownerId', '')::uuid, null, true) where id = v_id;
  return v_id; end $$;
create or replace function public.crm_update_contact(p_id uuid, p jsonb) returns void language plpgsql security definer set search_path = public as $$
declare v_acc uuid;
begin perform private.crm_need(true);
  if not private.crm_contact_visible(p_id) then raise exception 'Contact not found.' using errcode = 'P0002'; end if;
  if p ? 'accountId' then v_acc := nullif(p->>'accountId', '')::uuid; if v_acc is not null and not private.crm_account_visible(v_acc) then raise exception 'Account not found.' using errcode = 'P0002'; end if; end if;
  update public.contacts set
    crm_owner_id = case when p ? 'ownerId' then nullif(p->>'ownerId', '')::uuid else crm_owner_id end,
    account_id = case when p ? 'accountId' then v_acc else account_id end,
    crm_stage = case when p ? 'stage' then nullif(p->>'stage', '') else crm_stage end,
    last_contacted_on = case when p ? 'lastContactedOn' then nullif(p->>'lastContactedOn', '')::date else last_contacted_on end,
    tags = case when p ? 'tags' then coalesce((select array_agg(distinct lower(btrim(t))) from jsonb_array_elements_text(p->'tags') t where btrim(t) <> ''), '{}') else tags end,
    crm_notes = case when p ? 'notes' then coalesce(p->>'notes', '') else crm_notes end,
    contact_type = case when p ? 'contactType' then nullif(p->>'contactType', '') else contact_type end,
    company = case when p ? 'company' then coalesce(p->>'company', '') else company end
  where id = p_id; end $$;
create or replace function public.crm_archive(p_entity text, p_id uuid, p_archived boolean default true) returns boolean language plpgsql security definer set search_path = public as $$
declare v timestamptz := case when p_archived then now() end;
begin perform private.crm_need(true);
  if not private.crm_entity_visible(p_entity, p_id) then raise exception 'Record not found.' using errcode = 'P0002'; end if;
  if p_entity = 'contact' then update public.contacts set crm_archived_at = case when p_archived then coalesce(crm_archived_at, v) end where id = p_id;
  elsif p_entity = 'lead' then update public.crm_leads set archived_at = case when p_archived then coalesce(archived_at, v) end where id = p_id;
  elsif p_entity = 'account' then update public.crm_accounts set archived_at = case when p_archived then coalesce(archived_at, v) end where id = p_id;
  else update public.crm_opportunities set archived_at = case when p_archived then coalesce(archived_at, v) end where id = p_id; end if;
  insert into public.crm_activities (entity, entity_id, kind, subject, system, created_by) values (p_entity, p_id, 'note', case when p_archived then 'Archived' else 'Restored from archive' end, true, auth.uid());
  return p_archived; end $$;

-- Lead -> Contact (+ Account). One person per email: an existing contact with the email needs p.linkExisting = true.
create or replace function public.crm_convert_lead(p_lead uuid, p jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.crm_leads; v_acc uuid := nullif(p->>'accountId', '')::uuid; v_name text := btrim(coalesce(p->>'newAccountName', '')); v_c uuid; v_opp uuid; v_linked boolean := false;
begin perform private.crm_need(true);
  select * into l from public.crm_leads where id = p_lead;
  if l.id is null or not private.crm_owner_ok(l.owner_id) then raise exception 'Lead not found.' using errcode = 'P0002'; end if;
  if l.converted_at is not null then raise exception 'This lead was already converted.' using errcode = 'P0001'; end if;
  if l.archived_at is not null then raise exception 'Restore this lead before converting it.' using errcode = 'P0001'; end if;
  if v_acc is not null and not private.crm_account_visible(v_acc) then raise exception 'Account not found.' using errcode = 'P0002'; end if;
  if v_acc is null and v_name <> '' then
    if exists (select 1 from public.crm_accounts where lower(btrim(name)) = lower(v_name) and archived_at is null) then raise exception 'An account with this name already exists; pick it from the list.' using errcode = '23505'; end if;
    insert into public.crm_accounts (name, kind, owner_id, created_by) values (v_name, coalesce(nullif(p->>'accountKind', ''), case l.contact_type when 'realtor' then 'brokerage' when 'lender' then 'lender' else 'other' end), l.owner_id, auth.uid()) returning id into v_acc;
  end if;
  select id into v_c from public.contacts where l.email <> '' and lower(email) = lower(l.email);
  if v_c is not null then
    if not coalesce((p->>'linkExisting')::boolean, false) then raise exception 'A contact with this email already exists. Choose "Link to the existing contact" (one person per email).' using errcode = '23505'; end if;
    if not private.crm_in_pool(v_c) then raise exception 'That email belongs to a CLA staff login; it cannot be a CRM contact.' using errcode = 'P0001'; end if;
    update public.contacts set contact_type = coalesce(contact_type, l.contact_type), crm_owner_id = coalesce(crm_owner_id, l.owner_id), crm_stage = coalesce(crm_stage, 'prospect'),
      account_id = coalesce(account_id, v_acc), crm_lead_id = coalesce(crm_lead_id, l.id) where id = v_c;
    v_linked := true;
  else
    if l.email <> '' and exists (select 1 from public.profiles where lower(email) = lower(l.email) and status <> 'removed') then raise exception 'A user with this email already exists.' using errcode = '23505'; end if;
    insert into public.contacts (first_name, last_name, email, phone, company, contact_type, created_by, account_id, crm_stage, crm_notes, crm_lead_id)
      values (l.first_name, l.last_name, lower(l.email), l.phone, coalesce((select name from public.crm_accounts where id = v_acc), l.company), l.contact_type, auth.uid(), v_acc, 'prospect', l.notes, l.id) returning id into v_c;
    update public.contacts set crm_owner_id = l.owner_id where id = v_c;
  end if;
  if btrim(coalesce(p->>'opportunityName', '')) <> '' then
    insert into public.crm_opportunities (name, contact_id, account_id, owner_id, created_by) values (btrim(p->>'opportunityName'), v_c, coalesce(v_acc, (select account_id from public.contacts where id = v_c)), l.owner_id, auth.uid()) returning id into v_opp; end if;
  update public.crm_leads set converted_at = now(), converted_contact_id = v_c, converted_account_id = v_acc, status = 'Qualified' where id = l.id;
  insert into public.crm_activities (entity, entity_id, kind, subject, system, created_by) values ('contact', v_c, 'note', 'Converted from lead ' || btrim(l.first_name || ' ' || l.last_name), true, auth.uid());
  return jsonb_build_object('contactId', v_c, 'accountId', v_acc, 'opportunityId', v_opp, 'linkedExisting', v_linked); end $$;

-- My follow-ups: open (or done / cancelled / all) tasks of one owner (null = me; 'all' = pass p_all) that the caller can see, overdue first
create or replace function public.crm_follow_ups(p_owner uuid default null, p_status text default 'open', p_all boolean default false) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin perform private.crm_need();
  return coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('ownerName', coalesce(private.crm_name(a.owner_id), ''), 'overdue', a.status = 'open' and a.due_date < private.crm_today(),
      'parentName', case a.entity when 'lead' then (select btrim(first_name || ' ' || last_name) from public.crm_leads where id = a.entity_id) when 'contact' then (select btrim(first_name || ' ' || last_name) from public.contacts where id = a.entity_id)
        when 'account' then (select name from public.crm_accounts where id = a.entity_id) else (select name from public.crm_opportunities where id = a.entity_id) end)
    order by (a.status = 'open' and a.due_date < private.crm_today()) desc, a.due_date)
    from public.crm_activities a where a.kind = 'task' and (p_status = 'all' or a.status = p_status) and (p_all or a.owner_id = coalesce(p_owner, auth.uid())) and private.crm_entity_visible(a.entity, a.entity_id)), '[]'::jsonb); end $$;

-- REPORTS: orders the caller can see in the portal, by order open date; leads by created date. Volume = purchase price of orders not cancelled.
create or replace function public.crm_report(p_from date default null, p_to date default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin perform private.crm_need();
  if p_from is not null and p_to is not null and p_from > p_to then raise exception '"From" must be on or before "To".' using errcode = 'P0001'; end if;
  with d as (select * from public.deals where private.can_access_deal(id) and (p_from is null or open_date >= p_from) and (p_to is null or open_date <= p_to)),
  g as (  -- one row per (group, key, deal)
    select distinct 'realtor' grp, c.id::text k, btrim(c.first_name || ' ' || c.last_name) nm, coalesce((select name from public.crm_accounts where id = c.account_id), c.company) co, d.id deal_id, d.status, d.purchase_price
      from d join public.deal_participants dp on dp.deal_id = d.id and dp.role in ('Buyer Agent', 'Listing Agent') join public.contacts c on c.id = dp.contact_id
    union select distinct 'brokerage', coalesce('acc:' || c.account_id::text, case when c.company <> '' then 'co:' || lower(c.company) else 'none' end), coalesce((select name from public.crm_accounts where id = c.account_id), nullif(c.company, ''), '(no brokerage)'), null, d.id, d.status, d.purchase_price
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
    'leadsBySource', coalesce((select jsonb_agg(jsonb_build_object('name', source, 'leads', n, 'converted', cv) order by n desc, source) from (select source, count(*) n, count(*) filter (where converted_at is not null) cv from l group by source) s), '[]'),
    'leadsByStatus', coalesce((select jsonb_agg(jsonb_build_object('name', status, 'leads', n, 'converted', cv) order by array_position(array['New', 'Contacted', 'Qualified', 'Unqualified'], status)) from (select status, count(*) n, count(*) filter (where converted_at is not null) cv from l group by status) s), '[]'),
    'leadCount', (select count(*) from l)) into r;
  return r; end $$;

do $g$ declare f text; begin foreach f in array array['crm_owners()', 'crm_contact_list()', 'crm_contact_detail(uuid)', 'crm_account_list()', 'crm_account_detail(uuid)', 'crm_create_contact(jsonb)',
    'crm_update_contact(uuid, jsonb)', 'crm_archive(text, uuid, boolean)', 'crm_convert_lead(uuid, jsonb)', 'crm_follow_ups(uuid, text, boolean)', 'crm_report(date, date)'] loop
  execute 'revoke all on function public.' || f || ' from public, anon'; execute 'grant execute on function public.' || f || ' to authenticated'; end loop; end $g$;

-- a logged call / email / meeting on a contact moves its "last contacted" date forward
create or replace function private.crm_touch_contact() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.entity = 'contact' and new.kind in ('call', 'email', 'meeting') then
    update public.contacts set last_contacted_on = new.occurred_on where id = new.entity_id and (last_contacted_on is null or last_contacted_on < new.occurred_on); end if;
  return null; end $$;
drop trigger if exists crm_activities_touch on public.crm_activities;
create trigger crm_activities_touch after insert on public.crm_activities for each row execute function private.crm_touch_contact();
