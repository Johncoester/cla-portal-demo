-- Rollback of 20261110083000_closing_nearest_office.sql.
-- Restores the county-based closing-office default and the settlement functions from before that migration,
-- then drops the ZIP-center table and the latitude / longitude / per-side location columns.
-- NOT APPLIED by the change that added it.
begin;
set local lock_timeout = '3s';

drop function if exists public.create_settlement_request(uuid, timestamp without time zone[], text, text, text);
drop function if exists private.rpc_create_settlement_request(uuid, timestamp without time zone[], text, text, text);
drop function if exists public.scheduling_respond(text, integer[], text, text, text, text);
drop function if exists private.rpc_scheduling_respond(text, integer[], text, text, text, text);
drop function if exists public.save_office(text, text, text, text, text, text, text, text, text, boolean, text[], double precision, double precision);
drop function if exists private.rpc_save_office(text, text, text, text, text, text, text, text, text, boolean, text[], double precision, double precision);

create or replace function private.rpc_closing_office_default(p_deal uuid)
returns table(office_id text, reason text, office_name text, office_address text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare s text; c text;
begin
  if not private.can_access_deal(p_deal) then raise exception 'Order not found' using errcode = '42501'; end if;
  select d.state, d.county into s, c from public.deals d where d.id = p_deal;
  return query select n.office_id, n.reason, o.name, private.office_address(o) from private.nearest_cla_office(s, c) n left join public.offices o on o.id = n.office_id;
end $function$;

create or replace function private.rpc_scheduling_get(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare r record; file_number text; resp public.settlement_responses;
begin
  select * into r from private.settlement_by_token(p_token);
  if r.side is null then raise exception 'This scheduling link is not valid. Ask your title processor for a new one.'; end if;
  select d.file_number into file_number from public.deals d where d.id = (r.s).deal_id;
  select * into resp from public.settlement_responses where settlement_id = (r.s).id and round = (r.s).round and side = r.side;
  return jsonb_build_object('side', r.side, 'fileNumber', file_number, 'status', (r.s).status, 'round', (r.s).round,
    'slots', to_jsonb((r.s).slots), 'location', (r.s).location, 'note', (r.s).note, 'confirmedSlot', (r.s).confirmed_slot,
    'response', case when resp.id is null then null else jsonb_build_object('picks', resp.picks, 'note', resp.note, 'name', resp.responder_name, 'at', resp.at) end);
end $function$;

create function private.rpc_scheduling_respond(p_token text, p_picks integer[], p_name text, p_note text default ''::text)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare r record; pk int;
begin
  select * into r from private.settlement_by_token(p_token);
  if r.side is null then raise exception 'This scheduling link is not valid. Ask your title processor for a new one.'; end if;
  if (r.s).status <> 'open' then raise exception 'The closing time is already confirmed.'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Enter your name.'; end if;
  if coalesce(cardinality(p_picks), 0) = 0 then raise exception 'Pick at least one time that works.'; end if;
  foreach pk in array p_picks loop if pk is null or pk < 1 or pk > cardinality((r.s).slots) then raise exception 'Pick from the offered times.'; end if; end loop;
  insert into public.settlement_responses (settlement_id, round, side, picks, note, responded_by, responder_name)
    values ((r.s).id, (r.s).round, r.side, (select array_agg(distinct x order by x) from unnest(p_picks) x), left(coalesce(p_note, ''), 1000), private.effective_uid(), left(trim(p_name), 120))
    on conflict (settlement_id, round, side) do update set picks = excluded.picks, note = excluded.note, responded_by = excluded.responded_by, responder_name = excluded.responder_name, at = now();
  perform private.log_activity((r.s).deal_id, 'closing.response', 'settlement', (r.s).id, initcap(r.side) || ' side picked ' || cardinality(p_picks) || ' time(s)');
  perform private.notify(array[(select processor_id from public.deals where id = (r.s).deal_id)], 'closing', (r.s).deal_id, initcap(r.side) || ' side answered the closing request', '#/deals/' || (r.s).deal_id || '/closing');
end $function$;

create function public.scheduling_respond(p_token text, p_picks integer[], p_name text, p_note text default ''::text)
returns void
language plpgsql
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
begin
  perform private.rpc_scheduling_respond(p_token, p_picks, p_name, p_note);
end $function$;

revoke all on function public.scheduling_respond(text, integer[], text, text) from public;
grant execute on function public.scheduling_respond(text, integer[], text, text) to anon, authenticated, service_role;

create function private.rpc_create_settlement_request(p_deal uuid, p_slots timestamp without time zone[], p_location text default ''::text, p_note text default ''::text)
returns table(settlement_id uuid, buyer_token text, seller_token text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare bt text := private.new_token(); st text := private.new_token(); sid uuid;
begin
  if not (private.is_processor() or private.is_admin()) or not private.can_access_deal(p_deal) then raise exception 'Only the Processor can request a closing time'; end if;
  perform private.check_slots(p_slots);
  if exists (select 1 from public.settlements where deal_id = p_deal and status = 'open') then raise exception 'This order already has an open closing request'; end if;
  insert into public.settlements (deal_id, slots, location, note, buyer_token_hash, seller_token_hash, created_by)
    values (p_deal, p_slots, left(coalesce(p_location, ''), 200), left(coalesce(p_note, ''), 1000), sha256(convert_to(bt, 'UTF8')), sha256(convert_to(st, 'UTF8')), private.effective_uid()) returning id into sid;
  perform private.log_activity(p_deal, 'closing.requested', 'settlement', sid, 'Closing times offered (' || cardinality(p_slots) || ')');
  perform private.notify_sides(p_deal, 'Pick your closing time');
  return query select sid, bt, st;
end $function$;

create function public.create_settlement_request(p_deal uuid, p_slots timestamp without time zone[], p_location text default ''::text, p_note text default ''::text)
returns table(settlement_id uuid, buyer_token text, seller_token text)
language plpgsql
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
begin
  return query select * from private.rpc_create_settlement_request(p_deal, p_slots, p_location, p_note);
end $function$;

revoke all on function public.create_settlement_request(uuid, timestamp without time zone[], text, text) from public;
grant execute on function public.create_settlement_request(uuid, timestamp without time zone[], text, text) to authenticated, service_role;

create function private.rpc_save_office(p_id text, p_name text, p_address_line1 text, p_address_line2 text, p_city text, p_state text, p_zip text, p_main_phone text default ''::text, p_email text default null::text, p_is_main boolean default false, p_counties text[] default '{}'::text[])
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare oid text := nullif(btrim(coalesce(p_id, '')), ''); st text := upper(btrim(coalesce(p_state, ''))); want text[] := '{}'; c text; hit text; bad text[] := '{}';
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can change offices.' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_main_phone, '')), '') is not null and length(regexp_replace(p_main_phone, '\\D', '', 'g')) <> 10 then
    raise exception 'Main phone must be a 10-digit phone number (xxx-xxx-xxxx).' using errcode = 'P0001'; end if;
  foreach c in array coalesce(p_counties, '{}') loop
    select county into hit from public.office_county_choices where state = st and private.norm_county(county) = private.norm_county(c);
    if hit is null then bad := bad || c; elsif not hit = any(want) then want := want || hit; end if;
  end loop;
  if array_length(bad, 1) > 0 then raise exception 'Not a county in %: %.', st, array_to_string(bad, ', ') using errcode = 'P0001'; end if;
  if oid is null then
    insert into public.offices (name, address_line1, address_line2, city, state, zip, main_phone, email, is_main_office_for_state)
      values (p_name, p_address_line1, coalesce(p_address_line2, ''), p_city, st, btrim(p_zip), coalesce(p_main_phone, ''), p_email, coalesce(p_is_main, false)) returning id into oid;
  else
    if not exists (select 1 from public.offices where id = oid) then raise exception 'Office not found.' using errcode = 'P0001'; end if;
    update public.office_counties set removed_at = now() where office_id = oid and removed_at is null and not (state = st and county = any(want));
    update public.offices set name = p_name, address_line1 = p_address_line1, address_line2 = coalesce(p_address_line2, ''), city = p_city, state = st, zip = btrim(p_zip),
      main_phone = coalesce(p_main_phone, ''), email = p_email, is_main_office_for_state = coalesce(p_is_main, false) where id = oid;
  end if;
  update public.office_counties set removed_at = null where office_id = oid and removed_at is not null and state = st and county = any(want);
  insert into public.office_counties (office_id, state, county) select oid, st, w from unnest(want) w
    where not exists (select 1 from public.office_counties x where x.office_id = oid and x.state = st and x.county = w);
  return oid;
end $function$;

create function public.save_office(p_id text, p_name text, p_address_line1 text, p_address_line2 text, p_city text, p_state text, p_zip text, p_main_phone text default ''::text, p_email text default null::text, p_is_main boolean default false, p_counties text[] default '{}'::text[])
returns text
language plpgsql
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
begin
  return private.rpc_save_office(p_id, p_name, p_address_line1, p_address_line2, p_city, p_state, p_zip, p_main_phone, p_email, p_is_main, p_counties);
end $function$;

revoke all on function public.save_office(text, text, text, text, text, text, text, text, text, boolean, text[]) from public;
grant execute on function public.save_office(text, text, text, text, text, text, text, text, text, boolean, text[]) to authenticated, service_role;

drop function if exists private.closest_office(text, text, double precision, double precision);
drop function if exists private.haversine_miles(double precision, double precision, double precision, double precision);

alter table public.settlements drop constraint if exists settlements_office_id_fkey;
alter table public.settlement_responses drop constraint if exists settlement_responses_office_id_fkey;
alter table public.settlements drop column if exists office_id;
alter table public.settlement_responses drop column if exists office_id;
alter table public.settlement_responses drop column if exists location;
alter table public.offices drop constraint if exists offices_lat_lng_pair;
alter table public.offices drop column if exists latitude;
alter table public.offices drop column if exists longitude;
alter table public.deals drop constraint if exists deals_lat_lng_pair;
alter table public.deals drop column if exists latitude;
alter table public.deals drop column if exists longitude;
drop table if exists public.zip_centroids;

commit;
