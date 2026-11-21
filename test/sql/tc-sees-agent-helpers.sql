-- Copied from TEST (aqcervntopidtcazcmlv) on Nov 21 2026 with pg_get_functiondef. Read-only helpers the TC-VIS-1 functions call.

-- Used only by test/test-tc-sees-agent-file.sh on a disposable local database.

create or replace function private.linked_agent_roles(pid uuid, d uuid) returns text[] language sql stable as $f$ select '{}'::text[] $f$;

CREATE OR REPLACE FUNCTION private.effective_uid()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  actor text;
  found uuid;
begin
  actor := coalesce(auth.uid()::text, '');
  if current_setting('cla.effective_uid_for', true) is not distinct from actor
     and current_setting('cla.effective_uid_for', true) is not null then
    return nullif(current_setting('cla.effective_uid', true), '')::uuid;
  end if;
  select coalesce(
    (select s.target_id
       from private.view_as_sessions s
       join public.profiles a on a.id = s.actor_id
      where s.actor_id = auth.uid()
        and a.role = 'Super admin' and a.is_admin and a.status = 'active'
        and s.stopped_at is null
        and s.expires_at > pg_catalog.now()),
    auth.uid())
  into found;
  perform set_config('cla.effective_uid_for', actor, true);
  perform set_config('cla.effective_uid', coalesce(found::text, ''), true);
  return found;
end
$function$;

CREATE OR REPLACE FUNCTION private.me_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select role from public.profiles where id = private.effective_uid() and status = 'active' $function$;

CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((select is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false) $function$;

CREATE OR REPLACE FUNCTION private.is_processor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor'), false) or private.is_admin() $function$;

CREATE OR REPLACE FUNCTION private.is_preprocessor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(private.me_role() = 'Preprocessor', false) $function$;

CREATE OR REPLACE FUNCTION private.is_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Preprocessor', 'Transaction Coordinator'), false) or private.is_admin() $function$;

CREATE OR REPLACE FUNCTION private.is_staffish()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'), false) $function$;

CREATE OR REPLACE FUNCTION private.my_contact_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select id from public.contacts where profile_id = private.effective_uid() $function$;

CREATE OR REPLACE FUNCTION private.reader_gate()
 RETURNS TABLE(uid uuid, role text, active boolean, is_admin boolean, staffish boolean, is_processor boolean, is_demo boolean, contact_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER ROWS 1
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET jit TO 'off'
AS $function$
  select v.uid,
         case when p.status = 'active' then p.role else null end,
         coalesce(p.status = 'active' and p.role is not null, false),
         coalesce(p.status = 'active' and p.is_admin, false),
         coalesce(p.status = 'active' and (p.is_admin or p.role in (
           'Processor', 'Preprocessor', 'Sales Person', 'Sales Team',
           'Transaction Coordinator', 'Admin', 'Super admin')), false),
         coalesce(p.status = 'active' and (p.is_admin or p.role in ('Processor', 'Preprocessor')), false),
         coalesce(p.status = 'active' and p.is_demo, false),
         c.id
  from (
    select coalesce(
      (select s.target_id
         from private.view_as_sessions s
         join public.profiles a on a.id = s.actor_id
        where s.actor_id = auth.uid()
          and a.role = 'Super admin' and a.is_admin and a.status = 'active'
          and s.stopped_at is null
          and s.expires_at > pg_catalog.now()),
      auth.uid()
    ) as uid
  ) v
  left join public.profiles p on p.id = v.uid
  left join public.contacts c on c.profile_id = v.uid
$function$;

CREATE OR REPLACE FUNCTION private.side_of(r text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case r
    when 'Buyer Agent' then 'buyer'
    when 'Client-Buyer' then 'buyer'
    when 'Buyer Agent TC' then 'buyer'
    when 'Listing Agent' then 'seller'
    when 'Client-Seller' then 'seller'
    when 'Listing Agent TC' then 'seller'
  end
$function$;

CREATE OR REPLACE FUNCTION private.emd_receipt_title(t text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ select coalesce(t, '') ~* 'earnest money deposit receipt' $function$;

CREATE OR REPLACE FUNCTION private.person_name(pid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((select trim(first_name || ' ' || last_name) from public.profiles where id = pid), 'Unknown') $function$;

CREATE OR REPLACE FUNCTION private.office_today()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ select (now() at time zone 'America/New_York')::date $function$;

CREATE OR REPLACE FUNCTION private.outside_roles(pid uuid, d uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((
    select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
    from (
      select distinct p.role
      from public.deal_participants p
      join public.contacts c on c.id = p.contact_id
      where p.deal_id = d and c.profile_id = pid
        and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
      union
      select unnest(private.linked_agent_roles(pid, d))
    ) x
  ), '{}'::text[])
$function$;

CREATE OR REPLACE FUNCTION private.file_roles_of(pid uuid, d uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case
    when pr.role is null then '{}'::text[]
    when pr.role <> 'Outside user' then
      coalesce((
        select array_agg(q.r order by q.ord, array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], q.r))
        from (
          select pr.role as r, 0 as ord
          union all
          select x.role, 1
          from (
            select distinct p.role
            from public.deal_participants p
            join public.contacts c on c.id = p.contact_id
            where p.deal_id = d and c.profile_id = pid
              and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
          ) x
        ) q
      ), array[pr.role])
    else case when cardinality(private.outside_roles(pid, d)) = 0
      then array['Outside user']::text[]
      else private.outside_roles(pid, d) end
  end
  from (select (select role from public.profiles where id = pid) as role) pr
$function$;

CREATE OR REPLACE FUNCTION private.deal_roles(d uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case when private.me_role() is null then '{}'::text[] else private.file_roles_of(private.effective_uid(), d) end $function$;

CREATE OR REPLACE FUNCTION private.can_access_deal(d uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.me_role() is not null and (
    private.is_admin() or private.me_role() in ('Processor', 'Sales Team', 'Transaction Coordinator')
    or (private.me_role() = 'Preprocessor' and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid()))
    or (private.me_role() in ('Sales Person', 'Sales Team') and exists (select 1 from public.deal_sales_people s where s.deal_id = d and s.sales_id = private.effective_uid()))
    or exists (select 1 from public.deal_participants p where p.deal_id = d and p.contact_id = private.my_contact_id())
    or cardinality(private.linked_agent_roles(private.effective_uid(), d)) > 0)
$function$;

CREATE OR REPLACE FUNCTION private.reader_can_deal(p_deal uuid, p_uid uuid, p_role text, p_admin boolean, p_contact uuid, p_active boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET jit TO 'off'
AS $function$
  select coalesce(p_active, false) and (
    coalesce(p_admin, false)
    or coalesce(p_role in ('Processor', 'Sales Team', 'Transaction Coordinator'), false)
    or (p_role = 'Preprocessor' and exists (
          select 1 from public.deals x where x.id = p_deal and x.preprocessor_user_id = p_uid))
    or (p_role in ('Sales Person', 'Sales Team') and exists (
          select 1 from public.deal_sales_people s where s.deal_id = p_deal and s.sales_id = p_uid))
    or exists (
          select 1 from public.deal_participants p
          where p.deal_id = p_deal and p.contact_id = p_contact)
    or cardinality(private.linked_agent_roles(p_uid, p_deal)) > 0
  )
$function$;

CREATE OR REPLACE FUNCTION private.can_run_deal(d uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select (not private.is_preprocessor() and private.is_processor()) or (private.is_preprocessor() and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid())) $function$;

CREATE OR REPLACE FUNCTION private.form_owner_or_manager(owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select owner = private.effective_uid() or private.is_manager() or private.is_admin() $function$;
