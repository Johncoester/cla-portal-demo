-- Exact function bodies from the sanitized catalog handoff.
-- Nine helpers omitted result_type and language. The body is a SQL select, so this file uses language sql and the expression type (boolean, text, or uuid).

create or replace function private.office_today()
returns date
language sql stable security invoker
set search_path = pg_catalog, public, extensions
as $fnbody$ select (now() at time zone 'America/New_York')::date $fnbody$;

create or replace function private.side_of(r text)
returns text
language sql immutable security invoker
set search_path = pg_catalog, public, extensions
as $fnbody$
  select case r when 'Buyer Agent' then 'buyer' when 'Client-Buyer' then 'buyer' when 'Listing Agent' then 'seller' when 'Client-Seller' then 'seller' end $fnbody$;

create or replace function auth.jwt()
returns jsonb
language sql stable security invoker
as $fnbody$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$fnbody$;

create or replace function auth.role()
returns text
language sql stable security invoker
as $fnbody$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$fnbody$;

create or replace function auth.uid()
returns uuid
language sql stable security invoker
as $fnbody$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$fnbody$;

create or replace function private.emd_receipt_title(t text)
returns boolean
language sql immutable security invoker
set search_path = pg_catalog, public, extensions
as $fnbody$ select coalesce(t, '') ~* 'earnest money deposit receipt' $fnbody$;

create or replace function private.task_enabled(p_code text)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select coalesce((select enabled from public.task_template_switches where code = p_code), true) $fnbody$;

create or replace function private.template_code_retired(p_code text)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select exists (select 1 from public.task_templates t where t.code = p_code and t.retired_at is not null
    and t.version = (select max(version) from public.task_templates where code = p_code)) $fnbody$;

create or replace function private.file_role_of(pid uuid, d uuid)
returns text
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select case when pr.role is distinct from 'Outside user' then pr.role
    else coalesce((select p.role from public.deal_participants p join public.contacts c on c.id = p.contact_id
                   where p.deal_id = d and c.profile_id = pid and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
                   order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], p.role) limit 1), 'Outside user') end
  from (select (select role from public.profiles where id = pid) as role) pr $fnbody$;

create or replace function private.file_roles_of(pid uuid, d uuid)
returns text[]
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select case when pr.role is null then '{}'::text[] when pr.role <> 'Outside user' then array[pr.role]
    else coalesce((select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
                   from (select distinct p.role from public.deal_participants p join public.contacts c on c.id = p.contact_id
                         where p.deal_id = d and c.profile_id = pid and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')) x), array['Outside user']) end
  from (select (select role from public.profiles where id = pid) as role) pr $fnbody$;

create or replace function private.effective_uid()
returns uuid
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select coalesce(
    (select s.target_id
       from private.view_as_sessions s
       join public.profiles a on a.id = s.actor_id
      where s.actor_id = auth.uid()
        and a.role = 'Super admin' and a.is_admin and a.status = 'active'
        and s.stopped_at is null
        and s.expires_at > pg_catalog.now()),
    auth.uid())
$fnbody$;

create or replace function private.person_side(pid uuid, d uuid)
returns text
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select case when (select role from public.profiles where id = pid) is distinct from 'Outside user' then 'staff'
    else (select case when count(distinct s) = 1 then max(s) end from (select private.side_of(r) s from unnest(private.file_roles_of(pid, d)) r) x where s is not null) end $fnbody$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select coalesce((select is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false) $fnbody$;

create or replace function private.me_role()
returns text
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select role from public.profiles where id = private.effective_uid() and status = 'active' $fnbody$;

create or replace function private.my_contact_id()
returns uuid
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select id from public.contacts where profile_id = private.effective_uid() $fnbody$;

create or replace function private.viewer_is_demo()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select coalesce((select p.is_demo from public.profiles p where p.id = private.effective_uid() and p.status = 'active'), false)
$fnbody$;

create or replace function private.my_team_agents()
returns SETOF uuid
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select a.profile_id from public.team_members c join public.team_members a on a.team_id = c.team_id and a.member_role = 'agent'
  join public.profiles p on p.id = a.profile_id and p.status = 'active'
  where c.profile_id = private.effective_uid() and c.member_role = 'coordinator' $fnbody$;

create or replace function private.person_pure_buyer(pid uuid, d uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select pid is not null and d is not null and coalesce(private.person_side(pid, d) <> 'staff', false)
     and 'Client-Buyer' = any (private.file_roles_of(pid, d)) and not (private.file_roles_of(pid, d) && array['Buyer Agent', 'Listing Agent']) $fnbody$;

create or replace function private.person_pure_seller(pid uuid, d uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select pid is not null and d is not null and coalesce(private.person_side(pid, d) <> 'staff', false)
     and 'Client-Seller' = any (private.file_roles_of(pid, d)) and not ('Client-Buyer' = any (private.file_roles_of(pid, d)))
     and not (private.file_roles_of(pid, d) && array['Buyer Agent', 'Listing Agent']) $fnbody$;

create or replace function private.is_processor()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor'), false) or private.is_admin() $fnbody$;

create or replace function private.is_staffish()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'), false) $fnbody$;

create or replace function private.can_access_deal(d uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select private.me_role() is not null and (
    private.is_admin() or private.me_role() in ('Processor', 'Sales Team')
    or (private.me_role() = 'Preprocessor' and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid()))
    or (private.me_role() = 'Transaction Coordinator' and exists (
          select 1 from public.deal_participants p join public.contacts c on c.id = p.contact_id
          where p.deal_id = d and p.role in ('Buyer Agent', 'Listing Agent') and c.profile_id in (select private.my_team_agents())))
    or (private.me_role() <> 'Transaction Coordinator' and (
          (private.me_role() in ('Sales Person', 'Sales Team') and exists (select 1 from public.deal_sales_people s where s.deal_id = d and s.sales_id = private.effective_uid()))
          or exists (select 1 from public.deal_participants p where p.deal_id = d and p.contact_id = private.my_contact_id())))) $fnbody$;

create or replace function private.deal_role(d uuid)
returns text
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select case when private.me_role() is null then null when private.me_role() <> 'Outside user' then private.me_role() else private.file_role_of(private.effective_uid(), d) end $fnbody$;

create or replace function private.is_manager()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Preprocessor', 'Transaction Coordinator'), false) or private.is_admin() $fnbody$;

create or replace function private.is_preprocessor()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select coalesce(private.me_role() = 'Preprocessor', false) $fnbody$;

create or replace function private.deal_roles(d uuid)
returns text[]
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select case when private.me_role() is null then '{}'::text[] else private.file_roles_of(private.effective_uid(), d) end $fnbody$;

create or replace function private.my_side(d uuid)
returns text
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select case when private.is_staffish() then 'staff' else private.person_side(private.effective_uid(), d) end $fnbody$;

create or replace function private.can_run_deal(d uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select (not private.is_preprocessor() and private.is_processor()) or (private.is_preprocessor() and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid())) $fnbody$;

create or replace function private.is_pure_buyer(d uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select private.effective_uid() is not null and not private.is_staffish() and private.person_pure_buyer(private.effective_uid(), d) $fnbody$;

create or replace function private.is_pure_seller(d uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select private.effective_uid() is not null and not private.is_staffish() and private.person_pure_seller(private.effective_uid(), d) $fnbody$;

create or replace function private.task_outside_audience(p_task uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select exists (select 1 from public.tasks t where t.id = p_task and t.audiences is not null and (
    ('Client-Buyer' = any (private.deal_roles(t.deal_id)) and 'buyer' = any (t.audiences) and t.owner_profile_id = (select private.effective_uid()) and not (t.audiences = array['internal']::text[]))
    or ('Client-Seller' = any (private.deal_roles(t.deal_id)) and 'seller' = any (t.audiences) and t.owner_profile_id = (select private.effective_uid()) and not (t.audiences = array['internal']::text[]))
    or ('Buyer Agent' = any (private.deal_roles(t.deal_id)) and 'buyer_agent' = any (t.audiences))
    or ('Listing Agent' = any (private.deal_roles(t.deal_id)) and 'listing_agent' = any (t.audiences)))) $fnbody$;

create or replace function private.task_visible(owner uuid, assigned text)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select private.is_staffish() or owner = private.effective_uid() $fnbody$;

create or replace function private.task_visible(owner uuid, assigned text, d uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select private.is_staffish() or owner = private.effective_uid()
      or (owner is null and assigned = any (private.deal_roles(d)))
      or (private.deal_role(d) in ('Buyer Agent', 'Listing Agent') and private.side_of(assigned) = private.side_of(private.deal_role(d))) $fnbody$;

create or replace function private.participant_visible(d uuid, prole text)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select private.can_access_deal(d) and not (private.deal_role(d) in ('Client-Buyer', 'Client-Seller') and prole like 'Client-%' and prole <> private.deal_role(d))
     and not (prole = 'Listing Agent' and private.is_pure_buyer(d))
     and not (prole = 'Buyer Agent' and private.is_pure_seller(d)) $fnbody$;

create or replace function private.rpc_deal_contacts(p_deal uuid)
returns TABLE(participant_id uuid, deal_id uuid, contact_id uuid, role text, profile_id uuid, first_name text, last_name text, company text, email text, phone text, contact_hidden boolean)
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select dp.id, dp.deal_id, c.id, dp.role, c.profile_id, c.first_name, c.last_name, c.company,
    case when h then '' else c.email end, case when h then '' else c.phone end, h
  from public.deal_participants dp join public.contacts c on c.id = dp.contact_id
  cross join lateral (select not (private.is_staffish() or c.id = private.my_contact_id() or private.side_of(dp.role) is null or private.side_of(dp.role) = private.my_side(p_deal)) h) z
  where dp.deal_id = p_deal and private.participant_visible(p_deal, dp.role) $fnbody$;

create or replace function private.contact_visible(c uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select private.is_processor() or private.is_admin() or c = private.my_contact_id()
      or exists (select 1 from public.deal_participants p where p.contact_id = c and private.participant_visible(p.deal_id, p.role)
                 and (private.is_staffish() or private.side_of(p.role) is null or private.side_of(p.role) = private.my_side(p.deal_id))) $fnbody$;

create or replace function private.shares_deal_with(pid uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select pid = private.effective_uid() or private.is_processor() or private.is_admin()
    or exists (select 1 from public.team_members a join public.team_members b on a.team_id = b.team_id where a.profile_id = private.effective_uid() and b.profile_id = pid)
    or exists (select 1 from public.contacts c join public.deal_participants p on p.contact_id = c.id where c.profile_id = pid and private.participant_visible(p.deal_id, p.role)
               and (private.is_staffish() or private.side_of(p.role) is null or private.side_of(p.role) = private.my_side(p.deal_id))) $fnbody$;

create or replace function public.deal_contacts(p_deal uuid)
returns TABLE(participant_id uuid, deal_id uuid, contact_id uuid, role text, profile_id uuid, first_name text, last_name text, company text, email text, phone text, contact_hidden boolean)
language plpgsql stable security invoker
set search_path = pg_catalog, public, extensions
as $fnbody$ BEGIN RETURN QUERY SELECT * FROM private.rpc_deal_contacts(p_deal); END; $fnbody$;

create or replace function public.task_board(p_file_status text DEFAULT 'All'::text)
returns TABLE(id uuid, deal_id uuid, title text, description text, assigned_role text, status text, due_date date, completed_at timestamp with time zone, completed_by uuid, kind text, participant_id uuid, owner_profile_id uuid, template_code text, template_version integer, created_at timestamp with time zone, file_number text, street text, city text, state text, zip text, closing_date date, deal_status text, owner_name text, overdue boolean)
language sql stable security invoker
set search_path = pg_catalog, public, extensions
as $fnbody$
  select t.id, t.deal_id, t.title, t.description, t.assigned_role, t.status, t.due_date, t.completed_at, t.completed_by,
         t.kind, t.participant_id, t.owner_profile_id, t.template_code, t.template_version, t.created_at,
         d.file_number, d.street, d.city, d.state, d.zip, d.closing_date, d.status,
         (select trim(c.first_name || ' ' || c.last_name) from public.deal_contacts(t.deal_id) c where c.participant_id = t.participant_id limit 1),
         (t.status in ('todo', 'in_progress', 'blocked') and t.due_date is not null and t.due_date < private.office_today())
  from public.tasks t join public.deals d on d.id = t.deal_id
  where coalesce(p_file_status, 'All') = 'All' or d.status = p_file_status
  order by d.file_number, t.due_date nulls last, t.title $fnbody$;

create or replace function public.task_grid(p_file_status text DEFAULT 'Open'::text)
returns TABLE(id uuid, deal_id uuid, title text, description text, assigned_role text, status text, due_date date, completed_at timestamp with time zone, completed_by uuid, kind text, participant_id uuid, owner_profile_id uuid, template_code text, template_version integer, created_at timestamp with time zone, file_number text, street text, city text, state text, zip text, closing_date date, deal_status text, owner_name text, overdue boolean)
language plpgsql stable security invoker
set search_path = pg_catalog, public, extensions
as $fnbody$
begin
  if not (private.is_processor() or private.is_admin()) then raise exception 'Only a Processor or Admin can open the task grid.' using errcode = 'P0001'; end if;
  return query select * from public.task_board(coalesce(p_file_status, 'Open'));
end $fnbody$;
