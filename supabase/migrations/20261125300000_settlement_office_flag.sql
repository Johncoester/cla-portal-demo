-- FF-101d (Francis Santos, Portal review Nov 18 2026 11 AM; John confirmed Nov 18 2:13 PM ET).
-- Settlement location pickers offer only offices with used_for_settlements = true.
-- Starts with Towson, Rockville and Bethesda (CLA offices; Rockville is the main office).
-- Notes said "Talson" / "Rockwell" meaning Towson / Rockville.
-- Do not delete office rows. Retired offices (active = false) still never appear.
-- An office already on a pending proposal or scheduled closing still shows for that file.
-- FF-102 (separate PR, migration 20261125310000) builds the Admin UI on this column.
-- NOT APPLIED by this change. Apply by hand on TEST when ready.
-- Rollback: supabase/rollbacks/20261125300000_settlement_office_flag.sql

begin;
set local lock_timeout = '5s';

do $ff101d$
declare
  n int;
begin
  if to_regclass('public.offices') is null then
    raise exception 'drift: public.offices is missing';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'offices' and column_name = 'used_for_settlements'
  ) then
    raise exception 'drift: offices.used_for_settlements already exists';
  end if;

  alter table public.offices
    add column used_for_settlements boolean not null default false;

  -- Ensure the three CLA settlement offices exist (clatitle.com/locations; same as 20261110083000).
  insert into public.offices (
    id, name, address_line1, address_line2, city, state, zip, main_phone, email,
    is_main_office_for_state, active, sort_order, latitude, longitude, coord_source,
    used_for_settlements, created_at, updated_at
  ) values
    ('off-rockville', 'Rockville', '9210 Corporate Blvd', '#150', 'Rockville', 'MD', '20850',
     '888-924-9008', null, true, true, 1, 39.107612, -77.189877, 'address', true, now(), now()),
    ('off-bethesda', 'Bethesda', '7201 Wisconsin Avenue', '', 'Bethesda', 'MD', '20814',
     '', null, false, true, 3, 38.981338, -77.092659, 'address', true, now(), now()),
    ('off-towson', 'Towson', '200 Towsontown Blvd W', 'Ste 413', 'Towson', 'MD', '21204',
     '', null, false, true, 8, 39.396086, -76.618924, 'address', true, now(), now())
  on conflict (id) do update set
    used_for_settlements = true,
    active = true,
    updated_at = now();

  -- Also match by name when a site already has these offices under other ids.
  update public.offices
     set used_for_settlements = true, active = true, updated_at = now()
   where lower(btrim(name)) in ('towson', 'rockville', 'bethesda');

  update public.offices
     set used_for_settlements = false, updated_at = now()
   where lower(btrim(name)) not in ('towson', 'rockville', 'bethesda')
     and used_for_settlements is distinct from false;

  select count(*) into n from public.offices
   where used_for_settlements and active
     and lower(btrim(name)) in ('towson', 'rockville', 'bethesda');
  if n < 3 then
    raise exception 'drift: expected three active settlement offices (Towson, Rockville, Bethesda), found %', n;
  end if;
end;
$ff101d$;

-- Closest office for settlement defaults: only among active offices used for settlements.
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
    -- nearest-office migration not applied yet; fall through to state / main among settlement offices
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
     where o.active and o.used_for_settlements
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
     where o.active and o.used_for_settlements and o.state = upper(btrim(coalesce(p_state, '')))
     order by o.is_main_office_for_state desc, o.sort_order, o.name
     limit 1;
    if oid is not null then why := 'state'; end if;
  end if;
  if oid is null then
    select o.id into oid
      from public.offices o
     where o.active and o.used_for_settlements and o.is_main_office_for_state
     order by o.sort_order, o.name
     limit 1;
    if oid is null then
      select o.id into oid from public.offices o
       where o.active and o.used_for_settlements
       order by o.sort_order, o.name limit 1;
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

-- Picker list: pickable = active and used_for_settlements. Keep a non-settlement office already on the file for display.
create or replace function private.rpc_closing_office_choices(p_deal uuid)
returns table(id text, name text, address text, state text, is_main_office_for_state boolean, sort_order integer, active boolean, pickable boolean)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $fn$
#variable_conflict use_column
declare
  keep text[] := array[]::text[];
  x text;
begin
  if not private.can_access_deal(p_deal) then raise exception 'Order not found' using errcode = '42501'; end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'scheduled_office_id') then
    execute 'select scheduled_office_id from public.deals where id = $1' into x using p_deal;
    if x is not null and btrim(x) <> '' then keep := array_append(keep, x); end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'sched_buyer_office_id') then
    execute 'select nullif(btrim(sched_buyer_office_id), '''') from public.deals where id = $1' into x using p_deal;
    if x is not null then keep := array_append(keep, x); end if;
    execute 'select nullif(btrim(sched_seller_office_id), '''') from public.deals where id = $1' into x using p_deal;
    if x is not null then keep := array_append(keep, x); end if;
  end if;
  if to_regclass('public.closing_proposals') is not null then
    for x in select cp.office_id from public.closing_proposals cp where cp.deal_id = p_deal and cp.office_id is not null loop
      keep := array_append(keep, x);
    end loop;
  end if;
  if to_regclass('public.settlements') is not null then
    for x in select s.office_id from public.settlements s where s.deal_id = p_deal and s.office_id is not null loop
      keep := array_append(keep, x);
    end loop;
  end if;

  return query
    select o.id, o.name, private.office_address(o), o.state, o.is_main_office_for_state, o.sort_order, o.active,
           (o.active and o.used_for_settlements) as pickable
      from public.offices o
     where (o.active and o.used_for_settlements)
        or o.id = any (keep)
     order by (o.active and o.used_for_settlements) desc, o.sort_order, o.name;
end;
$fn$;

-- New CLA-office picks must be used for settlements (create / respond / schedule save).
-- Only the office existence checks change; bodies match the prior migrations.

do $ff101d_checks$
declare
  def text;
begin
  -- create settlement request: require used_for_settlements on the office check
  if to_regprocedure('private.rpc_create_settlement_request(uuid,timestamp without time zone[],text,text,text)') is not null then
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'rpc_create_settlement_request'
       and pg_get_function_identity_arguments(p.oid) = 'uuid, timestamp without time zone[], text, text, text';
    if def is not null and position('used_for_settlements' in def) = 0
       and position('o.id = off and o.active' in def) > 0 then
      def := replace(def,
        'o.id = off and o.active',
        'o.id = off and o.active and o.used_for_settlements');
      def := replace(def,
        'Pick an active CLA Title office.',
        'Pick an active CLA Title office used for settlements.');
      execute def;
    end if;
  end if;

  -- scheduling respond: same office check
  if to_regprocedure('private.rpc_scheduling_respond(text,integer[],text,text,text,text)') is not null then
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'rpc_scheduling_respond'
       and pg_get_function_identity_arguments(p.oid) = 'text, integer[], text, text, text, text';
    if def is not null and position('used_for_settlements' in def) = 0
       and position('o.id = off and o.active' in def) > 0 then
      def := replace(def,
        'o.id = off and o.active',
        'o.id = off and o.active and o.used_for_settlements');
      execute def;
    end if;
  end if;

  -- scheduling get link: list only settlement offices
  if to_regprocedure('private.rpc_scheduling_get(text)') is not null then
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'rpc_scheduling_get'
       and pg_get_function_identity_arguments(p.oid) = 'text';
    if def is not null and position('used_for_settlements' in def) = 0
       and position('from public.offices o where o.active' in def) > 0 then
      def := replace(def,
        'from public.offices o where o.active',
        'from public.offices o where o.active and o.used_for_settlements');
      execute def;
    end if;
  end if;

  -- party schedule link list
  if to_regprocedure('public.get_party_schedule(text)') is not null then
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_party_schedule'
       and pg_get_function_identity_arguments(p.oid) = 'text';
    if def is not null and position('used_for_settlements' in def) = 0
       and position('from public.offices o where o.active' in def) > 0 then
      def := replace(def,
        'from public.offices o where o.active',
        'from public.offices o where o.active and o.used_for_settlements');
      execute def;
    end if;
  end if;

  -- save side schedule: office must be used for settlements
  if to_regprocedure('private.save_side_schedule(uuid,jsonb,text)') is not null then
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'save_side_schedule'
       and pg_get_function_identity_arguments(p.oid) = 'uuid, jsonb, text';
    if def is not null and position('used_for_settlements' in def) = 0
       and position('where id = $1 and active' in def) > 0 then
      def := replace(def,
        'where id = $1 and active',
        'where id = $1 and active and used_for_settlements');
      def := replace(def,
        'Choose an active CLA office.',
        'Choose a CLA office used for settlements.');
      execute def;
    end if;
  end if;
end;
$ff101d_checks$;

commit;
