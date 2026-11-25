-- JC-AGENT-EDIT-1 test helpers: the TEST bodies (supabase/baseline/test_schema.sql, checked against TEST aqcervntopidtcazcmlv on Nov 25 2026) of the
-- functions the agent's own save uses. Loaded only into a disposable local Postgres by test/test-jc-agent-edit-1-sql.sh.
CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((select is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false) $function$;

CREATE OR REPLACE FUNCTION private.fmt_phone(v text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare d text := regexp_replace(coalesce(v, ''), '\D', '', 'g');
begin
  if btrim(coalesce(v, '')) = '' then return ''; end if;
  if length(d) = 11 and left(d, 1) = '1' then d := substr(d, 2); end if;
  if length(d) <> 10 then return null; end if;   -- not a phone number
  return substr(d, 1, 3) || '-' || substr(d, 4, 3) || '-' || substr(d, 7, 4); end $function$;

CREATE OR REPLACE FUNCTION private.month_day_ok(m integer, d integer)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((m is null and d is null) or (m between 1 and 12 and d >= 1 and d <= extract(day from (make_date(2000, m, 1) + interval '1 month - 1 day'))::int), false) $function$;

CREATE OR REPLACE FUNCTION private.agent_profile_write(pid uuid, p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare cell text := coalesce(p ->> 'cellPhone', ''); off text := coalesce(p ->> 'officePhone', ''); bm int := nullif(p ->> 'birthMonth', '')::int; bd int := nullif(p ->> 'birthDay', '')::int;
begin
  if p ? 'cellPhone' and length(regexp_replace(cell, '\D', '', 'g')) <> 10 then raise exception 'Cell phone must be a 10-digit phone number.' using errcode = '22023'; end if;
  if off <> '' and length(regexp_replace(off, '\D', '', 'g')) <> 10 then raise exception 'Office phone must be a 10-digit phone number.' using errcode = '22023'; end if;
  if (p ? 'birthMonth' or p ? 'birthDay') and not private.month_day_ok(bm, bd) then raise exception 'Date of birth must be a real month and day.' using errcode = '22023'; end if;
  insert into public.agent_profiles (profile_id) values (pid) on conflict (profile_id) do nothing;
  update public.agent_profiles set cell_phone = case when p ? 'cellPhone' then cell else cell_phone end, office_phone = case when p ? 'officePhone' then off else office_phone end,
    brokerage = coalesce(p ->> 'brokerage', brokerage), license_number = coalesce(p ->> 'licenseNumber', license_number), street = coalesce(p ->> 'street', street), city = coalesce(p ->> 'city', city),
    state = upper(coalesce(p ->> 'state', state)), zip = coalesce(p ->> 'zip', zip), other_contact = coalesce(p ->> 'otherContact', other_contact),
    photo_path = case when p ? 'photoPath' then nullif(p ->> 'photoPath', '') else photo_path end, photo_shape = coalesce(p ->> 'photoShape', photo_shape), updated_at = now() where profile_id = pid;
  if p ? 'birthMonth' or p ? 'birthDay' then insert into public.agent_private (profile_id, birth_month, birth_day, updated_by) values (pid, bm, bd, pid)
    on conflict (profile_id) do update set birth_month = excluded.birth_month, birth_day = excluded.birth_day, updated_at = now(), updated_by = excluded.updated_by; end if;
end $function$;

CREATE OR REPLACE FUNCTION private.rpc_update_my_agent_profile(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if private.effective_uid() is null or not exists (select 1 from public.profiles where id = private.effective_uid() and role = 'Outside user' and status = 'active') then raise exception 'Only agents have an agent profile.' using errcode = '42501'; end if;
  if p ? 'cellPhone' and coalesce(p ->> 'cellPhone', '') = '' then raise exception 'Cell phone is required.' using errcode = '22023'; end if;
  if (p ? 'firstName' and btrim(p ->> 'firstName') = '') or (p ? 'lastName' and btrim(p ->> 'lastName') = '') then raise exception 'First and last name are required.' using errcode = '22023'; end if;
  perform private.agent_profile_write(private.effective_uid(), p);
  update public.profiles set first_name = coalesce(nullif(btrim(p ->> 'firstName'), ''), first_name), last_name = coalesce(nullif(btrim(p ->> 'lastName'), ''), last_name),
    phone = case when p ? 'cellPhone' then private.fmt_phone(p ->> 'cellPhone') else phone end where id = private.effective_uid();
end $function$;

CREATE OR REPLACE FUNCTION public.update_my_agent_profile(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN PERFORM private.rpc_update_my_agent_profile(p); END; $function$;
