-- Rollback of 20261125300000_settlement_office_flag.sql (FF-101d).
-- Drops used_for_settlements and restores picker functions to active-only.
-- Does not delete Towson / Rockville / Bethesda office rows.
-- Refuses if the column is already gone.

begin;
set local lock_timeout = '5s';

do $ff101d_back$
begin
  if to_regclass('public.offices') is null then
    raise exception 'rollback check: public.offices is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'offices' and column_name = 'used_for_settlements'
  ) then
    raise exception 'rollback check: offices.used_for_settlements is already gone';
  end if;
end;
$ff101d_back$;

-- Restore closest_office to active-only (same shape as 20261110083000).
create or replace function private.closest_office(p_state text, p_zip text, p_lat double precision, p_lng double precision)
returns table(office_id text, reason text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $fn$
declare
  plat double precision := p_lat;
  plng double precision := p_lng;
  oid text;
  why text;
begin
  if to_regclass('public.zip_centroids') is null then
    plat := null; plng := null;
  elsif plat is null or plng is null or plat < -90 or plat > 90 or plng < -180 or plng > 180 then
    plat := null; plng := null;
    select c.latitude, c.longitude into plat, plng
      from public.zip_centroids c where c.zip = left(btrim(coalesce(p_zip, '')), 5);
  end if;
  if plat is not null and plng is not null and to_regprocedure('private.haversine_miles(double precision,double precision,double precision,double precision)') is not null then
    select o.id into oid
      from public.offices o
      left join public.zip_centroids c on c.zip = left(btrim(o.zip), 5)
     where o.active
       and coalesce(o.latitude, c.latitude) is not null
       and coalesce(o.longitude, c.longitude) is not null
     order by private.haversine_miles(plat, plng, coalesce(o.latitude, c.latitude), coalesce(o.longitude, c.longitude)),
              o.sort_order, o.name
     limit 1;
    if oid is not null then why := 'distance'; end if;
  end if;
  if oid is null then
    select o.id into oid
      from public.offices o
     where o.active and o.state = upper(btrim(coalesce(p_state, '')))
     order by o.is_main_office_for_state desc, o.sort_order, o.name
     limit 1;
    if oid is not null then why := 'state'; end if;
  end if;
  if oid is null then
    select o.id into oid
      from public.offices o
     where o.active and o.is_main_office_for_state
     order by o.sort_order, o.name
     limit 1;
    if oid is null then
      select o.id into oid from public.offices o where o.active order by o.sort_order, o.name limit 1;
    end if;
    if oid is not null then why := 'main'; end if;
  end if;
  if oid is null then
    return query select null::text, 'none'::text;
    return;
  end if;
  return query select oid, why;
end;
$fn$;

-- Restore choices: pickable = active (baseline shape).
create or replace function private.rpc_closing_office_choices(p_deal uuid)
returns table(id text, name text, address text, state text, is_main_office_for_state boolean, sort_order integer, active boolean, pickable boolean)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $fn$
#variable_conflict use_column
begin
  if not private.can_access_deal(p_deal) then raise exception 'Order not found' using errcode = '42501'; end if;
  return query select o.id, o.name, private.office_address(o), o.state, o.is_main_office_for_state, o.sort_order, o.active, o.active
    from public.offices o
   where o.active or o.id in (
     select d.scheduled_office_id from public.deals d where d.id = p_deal
     union
     select cp.office_id from public.closing_proposals cp where cp.deal_id = p_deal
   )
   order by o.active desc, o.sort_order, o.name;
end;
$fn$;

-- Undo surgical used_for_settlements patches on other RPCs.
do $ff101d_unpatch$
declare
  def text;
begin
  if to_regprocedure('private.rpc_create_settlement_request(uuid,timestamp without time zone[],text,text,text)') is not null then
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'rpc_create_settlement_request'
       and pg_get_function_identity_arguments(p.oid) = 'uuid, timestamp without time zone[], text, text, text';
    if def is not null and position('o.id = off and o.active and o.used_for_settlements' in def) > 0 then
      def := replace(def,
        'o.id = off and o.active and o.used_for_settlements',
        'o.id = off and o.active');
      def := replace(def,
        'Pick an active CLA Title office used for settlements.',
        'Pick an active CLA Title office.');
      execute def;
    end if;
  end if;

  if to_regprocedure('private.rpc_scheduling_respond(text,integer[],text,text,text,text)') is not null then
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'rpc_scheduling_respond'
       and pg_get_function_identity_arguments(p.oid) = 'text, integer[], text, text, text, text';
    if def is not null and position('o.id = off and o.active and o.used_for_settlements' in def) > 0 then
      def := replace(def,
        'o.id = off and o.active and o.used_for_settlements',
        'o.id = off and o.active');
      execute def;
    end if;
  end if;

  if to_regprocedure('private.rpc_scheduling_get(text)') is not null then
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'rpc_scheduling_get'
       and pg_get_function_identity_arguments(p.oid) = 'text';
    if def is not null and position('from public.offices o where o.active and o.used_for_settlements' in def) > 0 then
      def := replace(def,
        'from public.offices o where o.active and o.used_for_settlements',
        'from public.offices o where o.active');
      execute def;
    end if;
  end if;

  if to_regprocedure('public.get_party_schedule(text)') is not null then
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_party_schedule'
       and pg_get_function_identity_arguments(p.oid) = 'text';
    if def is not null and position('from public.offices o where o.active and o.used_for_settlements' in def) > 0 then
      def := replace(def,
        'from public.offices o where o.active and o.used_for_settlements',
        'from public.offices o where o.active');
      execute def;
    end if;
  end if;

  if to_regprocedure('private.save_side_schedule(uuid,jsonb,text)') is not null then
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'save_side_schedule'
       and pg_get_function_identity_arguments(p.oid) = 'uuid, jsonb, text';
    if def is not null and position('where id = $1 and active and used_for_settlements' in def) > 0 then
      def := replace(def,
        'where id = $1 and active and used_for_settlements',
        'where id = $1 and active');
      def := replace(def,
        'Choose a CLA office used for settlements.',
        'Choose an active CLA office.');
      execute def;
    end if;
  end if;
end;
$ff101d_unpatch$;

alter table public.offices drop column used_for_settlements;

commit;
