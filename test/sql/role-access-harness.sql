-- Disposable local Postgres only (PG17): the minimum of the TEST schema the role access migration touches.
-- Every function below is the exact body read from TEST (aqcervntopidtcazcmlv) on Nov 9 2026 with pg_get_functiondef; tables are trimmed
-- to the columns these functions read. No TEST data, no keys. Not a hosted migration.
set check_function_bodies = off;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema if not exists auth; create schema if not exists extensions; create schema if not exists private;
grant usage on schema public, private, auth to authenticated, anon;
create extension if not exists pgcrypto with schema extensions;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.profiles (id uuid primary key, email text not null unique, first_name text default '', last_name text default '', phone text default '',
  role text not null check (role in ('Processor','Preprocessor','Sales Person','Sales Team','Transaction Coordinator','Admin','Super admin','Outside user','Employee')),
  status text not null default 'active', created_at timestamptz default now(), is_admin boolean not null default false, removed_at timestamptz, removed_by uuid, is_demo boolean not null default false);
create table private.features (name text primary key, enabled boolean not null default false, note text not null default '');
insert into private.features values ('crm', true, ''), ('accounting', true, '');
create table private.view_as_sessions (actor_id uuid not null, target_id uuid not null, started_at timestamptz not null default now(), expires_at timestamptz not null, stopped_at timestamptz);
create table public.deals (id uuid primary key default gen_random_uuid(), file_number text not null default '', closing_date date, status text not null default 'Open');
create table public.deal_sales_people (deal_id uuid not null, sales_id uuid not null, added_by uuid, added_at timestamptz not null default now(), primary key (deal_id, sales_id));
create table public.contacts (id uuid primary key default gen_random_uuid(), first_name text default '', last_name text default '');
create table public.deal_participants (deal_id uuid, contact_id uuid, role text);
create table public.deal_business_sources (deal_id uuid primary key, source text);
create table public.crm_list_exports (id uuid primary key default gen_random_uuid(), module text, exported_by uuid, row_count int);
create table public.crm_picklist_options (list_key text not null, value text not null, label text not null, position integer not null default 0, retired boolean not null default false, modified_by uuid, modified_at timestamptz not null default now(), primary key (list_key, value));
create table public.crm_user_signatures (user_id uuid primary key, html text not null default '', modified_at timestamptz not null default now());
create table public.crm_leads (id uuid primary key default gen_random_uuid(), first_name text not null default '', last_name text not null default '', owner_id uuid, created_at timestamptz not null default now());
create table public.accounting_fees (id uuid primary key default gen_random_uuid(), deal_id uuid not null, description text not null default 'x', amount numeric not null default 1);
-- stand-ins for helpers this migration does not touch
create or replace function private.can_access_deal(d uuid) returns boolean language sql stable as $$ select true $$;
create or replace function private.crm_name(p uuid) returns text language sql stable as $$ select coalesce((select btrim(first_name || ' ' || last_name) from public.profiles where id = p), '') $$;
create or replace function private.crm_deal_row(g public.deals) returns jsonb language sql stable as $$ select jsonb_build_object('id', g.id, 'fileNumber', g.file_number) $$;
CREATE OR REPLACE FUNCTION private.acct_editor(d uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.acct_on() and coalesce(private.is_admin() or private.me_role() in ('Processor', 'Preprocessor'), false) and private.can_access_deal(d) $function$;
CREATE OR REPLACE FUNCTION private.acct_on()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((select enabled from private.features where name = 'accounting'), false) $function$;
CREATE OR REPLACE FUNCTION private.acct_reader(d uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.acct_on() and coalesce(private.is_admin() or private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator'), false) and private.can_access_deal(d) $function$;
CREATE OR REPLACE FUNCTION private.crm_all()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor'), false)) $function$;
CREATE OR REPLACE FUNCTION private.crm_deal_scope_all()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Sales Team'), false)) $function$;
CREATE OR REPLACE FUNCTION private.crm_need(p_edit boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if not private.crm_on() then raise exception 'The CRM is turned off on this portal.' using errcode = '42501'; end if;
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  if p_edit and not private.crm_editor() then raise exception 'The Processor has read-only access to the CRM.' using errcode = '42501'; end if;
end $function$;
CREATE OR REPLACE FUNCTION private.crm_on()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((select enabled from private.features where name = 'crm'), false) $function$;
CREATE OR REPLACE FUNCTION private.crm_read_all()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor'), false)) $function$;
CREATE OR REPLACE FUNCTION private.crm_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_on() and (private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team'), false)) $function$;
CREATE OR REPLACE FUNCTION private.effective_uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(
    (select s.target_id
       from private.view_as_sessions s
       join public.profiles a on a.id = s.actor_id
      where s.actor_id = auth.uid()
        and a.role = 'Super admin' and a.is_admin and a.status = 'active'
        and s.stopped_at is null
        and s.expires_at > pg_catalog.now()),
    auth.uid())
$function$;
CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((select is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false) $function$;
CREATE OR REPLACE FUNCTION private.is_staffish()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'), false) $function$;
CREATE OR REPLACE FUNCTION private.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((select role = 'Super admin' and is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false) $function$;
CREATE OR REPLACE FUNCTION private.me_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select role from public.profiles where id = private.effective_uid() and status = 'active' $function$;
CREATE OR REPLACE FUNCTION private.rpc_crm_deal_filters()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare everyone boolean;
begin
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  everyone := private.crm_deal_scope_all();
  return jsonb_build_object('scope', case when everyone then 'all' else 'own' end, 'role', private.me_role(),
    'me', jsonb_build_object('id', private.effective_uid(), 'name', private.crm_name(private.effective_uid())),
    'owners', case when everyone then coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', btrim(p.first_name || ' ' || p.last_name), 'role', p.role) order by p.first_name, p.last_name)
      from public.profiles p where p.role in ('Sales Person', 'Sales Team') and (p.status = 'active' or exists (select 1 from public.deal_sales_people s where s.sales_id = p.id))), '[]') else '[]' end,
    'clients', case when everyone then coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', btrim(c.first_name || ' ' || c.last_name)) order by c.first_name, c.last_name)
      from public.contacts c where exists (select 1 from public.deal_participants p where p.contact_id = c.id and p.role in ('Client-Buyer', 'Client-Seller') and private.crm_deal_visible(p.deal_id))), '[]') else '[]' end,
    'sources', coalesce((select jsonb_agg(jsonb_build_object('value', o.value, 'label', o.label || case when o.retired then ' (retired)' else '' end) order by o.position, o.value)
      from public.crm_picklist_options o where o.list_key = 'leadSource' and (not o.retired or exists (select 1 from public.deal_business_sources b where b.source = o.value and private.crm_deal_visible(b.deal_id)))), '[]'),
    'statuses', '["Open", "Closed", "On Hold", "Cancelled", "All"]'::jsonb);
end $function$;
CREATE OR REPLACE FUNCTION private.rpc_crm_deals(p_status text DEFAULT NULL::text, p_owner text DEFAULT NULL::text, p_client uuid DEFAULT NULL::uuid, p_source text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare st text := nullif(btrim(coalesce(p_status, '')), ''); ow text := nullif(btrim(coalesce(p_owner, '')), ''); src text := nullif(btrim(coalesce(p_source, '')), '');
begin
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  if st is not null and st <> 'All' and st not in ('Open', 'Closed', 'On Hold', 'Cancelled') then raise exception 'Unknown status.' using errcode = '22023'; end if;
  if ow is not null and ow <> 'none' and ow !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Unknown deal owner.' using errcode = '22023'; end if;
  if ow is not null and not private.crm_deal_scope_all() and ow <> private.effective_uid()::text then raise exception 'A Sales Person sees only their own deals.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(private.crm_deal_row(g) order by g.closing_date desc nulls last, g.file_number) from public.deals g
    where private.crm_deal_visible(g.id)
      and (st is null or st = 'All' or g.status = st)
      and (ow is null or (ow = 'none' and not exists (select 1 from public.deal_sales_people s where s.deal_id = g.id))
           or exists (select 1 from public.deal_sales_people s where s.deal_id = g.id and s.sales_id::text = ow))
      and (p_client is null or exists (select 1 from public.deal_participants p where p.deal_id = g.id and p.contact_id = p_client and p.role in ('Client-Buyer', 'Client-Seller')))
      and (src is null or (src = 'none' and coalesce((select b.source from public.deal_business_sources b where b.deal_id = g.id), '') = '')
           or exists (select 1 from public.deal_business_sources b where b.deal_id = g.id and b.source = src))), '[]');
end $function$;
CREATE OR REPLACE FUNCTION private.rpc_crm_list_export(p_module text, p_rows integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v uuid;
begin
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can download CSV files from the CRM lists.' using errcode = '42501'; end if;
  if p_module not in ('contacts', 'leads', 'accounts') then raise exception 'CSV downloads are for the Clients, Leads and Companies lists.' using errcode = '22023'; end if;
  insert into public.crm_list_exports (module, exported_by, row_count) values (p_module, private.effective_uid(), greatest(coalesce(p_rows, 0), 0)) returning id into v;
  return v; end $function$;
CREATE OR REPLACE FUNCTION public.crm_deal_filters()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare everyone boolean;
begin
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  everyone := private.crm_deal_scope_all();
  return jsonb_build_object('scope', case when everyone then 'all' else 'own' end, 'role', private.me_role(),
    'me', jsonb_build_object('id', auth.uid(), 'name', private.crm_name(auth.uid())),
    'owners', case when everyone then coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', btrim(p.first_name || ' ' || p.last_name), 'role', p.role) order by p.first_name, p.last_name)
      from public.profiles p where p.role in ('Sales Person', 'Sales Team') and (p.status = 'active' or exists (select 1 from public.deal_sales_people s where s.sales_id = p.id))), '[]') else '[]' end,
    'clients', case when everyone then coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', btrim(c.first_name || ' ' || c.last_name)) order by c.first_name, c.last_name)
      from public.contacts c where exists (select 1 from public.deal_participants p where p.contact_id = c.id and p.role in ('Client-Buyer', 'Client-Seller') and private.crm_deal_visible(p.deal_id))), '[]') else '[]' end,
    'sources', coalesce((select jsonb_agg(x order by x->>'position', x->>'value') from (
      select jsonb_build_object('value', v, 'label', l, 'position', p) as x from (values
        ('buyer', 'Buyer', '1'), ('seller', 'Seller', '2'), ('buyer_agent', 'Buyer''s agent', '3'), ('listing_agent', 'Listing agent', '4'), ('lender', 'Lender', '5'), ('homeowner', 'Homeowner', '6')) r(v, l, p)
      union all
      select jsonb_build_object('value', o.value, 'label', o.label || case when o.retired then ' (retired)' else '' end, 'position', (100 + o.position)::text)
      from public.crm_picklist_options o where o.list_key = 'leadSource' and (not o.retired or exists (select 1 from public.deal_business_sources b where b.source = o.value and private.crm_deal_visible(b.deal_id)))
    ) s), '[]'),
    'statuses', '["Open", "Closed", "On Hold", "Cancelled", "All"]'::jsonb);
end $function$;
CREATE OR REPLACE FUNCTION public.crm_deals(p_status text DEFAULT NULL::text, p_owner text DEFAULT NULL::text, p_client uuid DEFAULT NULL::uuid, p_source text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare st text := nullif(btrim(coalesce(p_status, '')), ''); ow text := nullif(btrim(coalesce(p_owner, '')), ''); src text := nullif(btrim(coalesce(p_source, '')), '');
begin
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  if st is not null and st <> 'All' and st not in ('Open', 'Closed', 'On Hold', 'Cancelled') then raise exception 'Unknown status.' using errcode = '22023'; end if;
  if ow is not null and ow <> 'none' and ow !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Unknown deal owner.' using errcode = '22023'; end if;
  if ow is not null and not private.crm_deal_scope_all() and ow <> auth.uid()::text then raise exception 'A Sales Person sees only their own deals.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(private.crm_deal_row(g) order by g.closing_date desc nulls last, g.file_number) from public.deals g
    where private.crm_deal_visible(g.id)
      and (st is null or st = 'All' or g.status = st)
      and (ow is null or (ow = 'none' and not exists (select 1 from public.deal_sales_people s where s.deal_id = g.id))
           or exists (select 1 from public.deal_sales_people s where s.deal_id = g.id and s.sales_id::text = ow))
      and (p_client is null or exists (select 1 from public.deal_participants p where p.deal_id = g.id and p.contact_id = p_client and p.role in ('Client-Buyer', 'Client-Seller')))
      and (src is null or (src = 'none' and coalesce((select b.source from public.deal_business_sources b where b.deal_id = g.id), '') = '')
           or exists (select 1 from public.deal_business_sources b where b.deal_id = g.id and (b.source = src or split_part(b.source, ':', 1) = src)))), '[]');
end $function$;
CREATE OR REPLACE FUNCTION public.crm_list_export(p_module text, p_rows integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_list_export(p_module, p_rows); END; $function$;
CREATE OR REPLACE FUNCTION private.crm_editor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false)) $function$;
CREATE OR REPLACE FUNCTION private.crm_deal_visible(d uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and private.can_access_deal(d) and (private.crm_deal_scope_all()
    or (coalesce(private.me_role() = 'Sales Person', false) and exists (select 1 from public.deal_sales_people s where s.deal_id = d and s.sales_id = private.effective_uid()))) $function$;
CREATE OR REPLACE FUNCTION private.rpc_source_of_business_options()
 RETURNS TABLE(value text, label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select o.value, o.label from public.crm_picklist_options o where o.list_key = 'leadSource' and not o.retired and private.is_processor() order by o.position, o.value $function$;
CREATE OR REPLACE FUNCTION private.is_processor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor'), false) or private.is_admin() $function$;
CREATE OR REPLACE FUNCTION private.crm_sales_profile(p uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select exists (select 1 from public.profiles where id = p and role in ('Sales Person', 'Sales Team')) $function$;
CREATE OR REPLACE FUNCTION public.source_of_business_options()
 RETURNS TABLE(value text, label text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_source_of_business_options(); END; $function$;
CREATE OR REPLACE FUNCTION private.crm_owner_ok(p_owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and (private.crm_all() or p_owner = private.effective_uid()
    or (coalesce(private.me_role() = 'Sales Team', false) and (p_owner is null or private.crm_sales_profile(p_owner)))) $function$;
-- the real RLS on the shared CRM tables (TEST, Nov 9)
alter table public.crm_picklist_options enable row level security;
create policy crm_picklist_options_read on public.crm_picklist_options for select using (private.crm_user());
create policy crm_picklist_options_insert on public.crm_picklist_options for insert with check (private.crm_on() and private.is_admin());
alter table public.crm_user_signatures enable row level security;
create policy crm_user_signatures_read on public.crm_user_signatures for select using (private.crm_user() and user_id = private.effective_uid());
create policy crm_user_signatures_insert on public.crm_user_signatures for insert with check (private.crm_user() and user_id = private.effective_uid());
create policy crm_user_signatures_update on public.crm_user_signatures for update using (private.crm_user() and user_id = private.effective_uid()) with check (private.crm_user() and user_id = private.effective_uid());
alter table public.crm_leads enable row level security;
create policy crm_leads_select on public.crm_leads for select using (private.crm_owner_ok(owner_id));
alter table public.accounting_fees enable row level security;
create policy accounting_fees_read on public.accounting_fees for select using (private.acct_reader(deal_id));
grant select, insert, update on public.crm_picklist_options, public.crm_user_signatures, public.crm_leads, public.accounting_fees, public.deals, public.profiles to authenticated;
grant execute on all functions in schema private to authenticated;
grant execute on all functions in schema public to authenticated;
-- fake people (all made up)
insert into public.profiles (id, email, first_name, last_name, role, is_admin) values
  ('00000000-0000-0000-0000-000000000001', 'super@example.test', 'Sue', 'Super', 'Super admin', true),
  ('00000000-0000-0000-0000-000000000002', 'admin@example.test', 'Ada', 'Admin', 'Admin', true),
  ('00000000-0000-0000-0000-000000000003', 'proc@example.test', 'Pat', 'Processor', 'Processor', false),
  ('00000000-0000-0000-0000-000000000004', 'pre@example.test', 'Pre', 'Processor', 'Preprocessor', false),
  ('00000000-0000-0000-0000-000000000005', 'sp@example.test', 'Sam', 'Sales', 'Sales Person', false),
  ('00000000-0000-0000-0000-000000000006', 'st@example.test', 'Tess', 'Team', 'Sales Team', false),
  ('00000000-0000-0000-0000-000000000007', 'tc@example.test', 'Tia', 'Coord', 'Transaction Coordinator', false),
  ('00000000-0000-0000-0000-000000000008', 'emp@example.test', 'Eli', 'Employee', 'Employee', false),
  ('00000000-0000-0000-0000-000000000009', 'agent@example.test', 'Al', 'Agent', 'Outside user', false);
insert into public.crm_picklist_options (list_key, value, label, position) values ('leadSource', 'warm', 'Warm Call', 1), ('leadSource', 'ads', 'Google Ads', 2);
insert into public.deals (id, file_number) select ('10000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'MD-26-' || (90000 + g) from generate_series(1, 400) g;
insert into public.deal_sales_people (deal_id, sales_id) select id, '00000000-0000-0000-0000-000000000005' from public.deals where file_number <= 'MD-26-90010';
insert into public.crm_leads (first_name, owner_id) select 'Lead' || g, case when g % 2 = 0 then '00000000-0000-0000-0000-000000000005'::uuid end from generate_series(1, 2000) g;
insert into public.accounting_fees (deal_id) select id from public.deals, generate_series(1, 10);
-- a person for this transaction (SET LOCAL ROLE authenticated after this)
create or replace function public.as_user(p uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', p::text, false) $$;
