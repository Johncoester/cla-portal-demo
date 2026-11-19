-- FF-102 (John Coester via Francis Feedback, Nov 18 2026, 2:14 PM ET).
-- Admin > Offices: Admins / Super admins can tick Used for settlements.
-- Column + seed + settlement picker filters come from FF-101d
-- (20261125300000_settlement_office_flag.sql). This file only adds the Admin
-- save path and write protection. Safe after 101d: no second column add/seed.
-- NOT APPLIED by this change. Apply by hand when ready.
-- Rollback: supabase/rollbacks/20261125310000_office_used_for_settlements.sql

begin;
set local lock_timeout = '3s';

do $ff102$
begin
  if to_regclass('public.offices') is null then
    raise exception 'drift: public.offices is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'offices' and column_name = 'used_for_settlements'
  ) then
    raise exception 'drift: offices.used_for_settlements is missing (apply FF-101d 20261125300000 first)';
  end if;
end;
$ff102$;

-- Writes stay Admin / Super admin only (RPC). Direct table changes are refused for portal roles.
alter table public.offices enable row level security;

drop policy if exists offices_select on public.offices;
create policy offices_select on public.offices
  for select to authenticated
  using (true);

revoke insert, update, delete on table public.offices from public, anon, authenticated;

-- Extend save_office so Admin can set used_for_settlements. Bodies otherwise match nearest-office / FF-101d.
drop function if exists public.save_office(text, text, text, text, text, text, text, text, text, boolean, text[], double precision, double precision);
drop function if exists private.rpc_save_office(text, text, text, text, text, text, text, text, text, boolean, text[], double precision, double precision);
drop function if exists public.save_office(text, text, text, text, text, text, text, text, text, boolean, text[], double precision, double precision, boolean);
drop function if exists private.rpc_save_office(text, text, text, text, text, text, text, text, text, boolean, text[], double precision, double precision, boolean);

create function private.rpc_save_office(
  p_id text, p_name text, p_address_line1 text, p_address_line2 text, p_city text, p_state text, p_zip text,
  p_main_phone text default ''::text, p_email text default null::text, p_is_main boolean default false,
  p_counties text[] default '{}'::text[], p_latitude double precision default null, p_longitude double precision default null,
  p_used_for_settlements boolean default false
)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $fn$
declare
  oid text := nullif(btrim(coalesce(p_id, '')), '');
  st text := upper(btrim(coalesce(p_state, '')));
  want text[] := '{}';
  c text;
  hit text;
  bad text[] := '{}';
  use_set boolean := coalesce(p_used_for_settlements, false);
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can change offices.' using errcode = '42501'; end if;
  if (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and (p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180)) then
    raise exception 'Latitude must be between -90 and 90 and longitude between -180 and 180, or leave both blank.' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_main_phone, '')), '') is not null and length(regexp_replace(p_main_phone, '\D', '', 'g')) <> 10 then
    raise exception 'Main phone must be a 10-digit phone number (xxx-xxx-xxxx).' using errcode = 'P0001';
  end if;
  foreach c in array coalesce(p_counties, '{}') loop
    select county into hit from public.office_county_choices where state = st and private.norm_county(county) = private.norm_county(c);
    if hit is null then bad := bad || c; elsif not hit = any(want) then want := want || hit; end if;
  end loop;
  if array_length(bad, 1) > 0 then raise exception 'Not a county in %: %.', st, array_to_string(bad, ', ') using errcode = 'P0001'; end if;
  if oid is null then
    insert into public.offices (name, address_line1, address_line2, city, state, zip, main_phone, email, is_main_office_for_state, latitude, longitude, used_for_settlements)
      values (p_name, p_address_line1, coalesce(p_address_line2, ''), p_city, st, btrim(p_zip), coalesce(p_main_phone, ''), p_email, coalesce(p_is_main, false), p_latitude, p_longitude, use_set)
      returning id into oid;
  else
    if not exists (select 1 from public.offices where id = oid) then raise exception 'Office not found.' using errcode = 'P0001'; end if;
    update public.office_counties set removed_at = now() where office_id = oid and removed_at is null and not (state = st and county = any(want));
    update public.offices set name = p_name, address_line1 = p_address_line1, address_line2 = coalesce(p_address_line2, ''), city = p_city, state = st, zip = btrim(p_zip),
      main_phone = coalesce(p_main_phone, ''), email = p_email, is_main_office_for_state = coalesce(p_is_main, false), latitude = p_latitude, longitude = p_longitude,
      used_for_settlements = use_set, updated_at = now(), updated_by = private.effective_uid()
      where id = oid;
  end if;
  update public.office_counties set removed_at = null where office_id = oid and removed_at is not null and state = st and county = any(want);
  insert into public.office_counties (office_id, state, county)
    select oid, st, w from unnest(want) w
     where not exists (select 1 from public.office_counties x where x.office_id = oid and x.state = st and x.county = w);
  return oid;
end;
$fn$;

create function public.save_office(
  p_id text, p_name text, p_address_line1 text, p_address_line2 text, p_city text, p_state text, p_zip text,
  p_main_phone text default ''::text, p_email text default null::text, p_is_main boolean default false,
  p_counties text[] default '{}'::text[], p_latitude double precision default null, p_longitude double precision default null,
  p_used_for_settlements boolean default false
)
returns text
language plpgsql
set search_path to 'pg_catalog', 'public', 'extensions'
as $fn$
begin
  return private.rpc_save_office(p_id, p_name, p_address_line1, p_address_line2, p_city, p_state, p_zip, p_main_phone, p_email, p_is_main, p_counties, p_latitude, p_longitude, p_used_for_settlements);
end;
$fn$;

revoke all on function public.save_office(text, text, text, text, text, text, text, text, text, boolean, text[], double precision, double precision, boolean) from public;
grant execute on function public.save_office(text, text, text, text, text, text, text, text, text, boolean, text[], double precision, double precision, boolean) to authenticated, service_role;

commit;
