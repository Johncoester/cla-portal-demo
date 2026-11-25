-- JC-AGENT-EDIT-1 (John Coester, Nov 25 2026, 1:57 PM ET chat, "yes" to build): an Admin or Super admin can edit a real
-- estate agent's profile: first and last name, brokerage, cell phone, office phone, and the profile picture (upload,
-- replace or remove). Until now only the agent could, through public.update_my_agent_profile.
--
--  1. private.admin_agent_target(uuid): the person is an active outside login (role 'Outside user') in the same demo
--     scope as the viewer, and is a real estate agent: they have an agent profile, their contact is a realtor, or they
--     are a Buyer Agent or Listing Agent on a file.
--  2. public.admin_get_agent_profile(uuid) / public.admin_update_agent_profile(uuid, jsonb): SECURITY DEFINER through
--     private.rpc_*, the same pattern as update_my_agent_profile. Both refuse unless private.is_admin() (the same check
--     as User List: role Admin or Super admin, or the Admin flag). Only these keys are written: firstName, lastName,
--     cellPhone, officePhone, brokerage, photoShape, photoPath. Email, license, address, birthday and role are never
--     changed here. photoPath must be '' (remove) or '<agent id>/avatar.jpg', the agent's own picture file.
--     The write goes through private.agent_profile_write, the helper the agent's own save uses (same phone checks).
--  3. Storage: two new policies on storage.objects let an Admin upload or replace <agent id>/avatar.jpg in the private
--     'agent-photos' bucket for an agent (private.admin_agent_target). The bucket keeps its own limits (400 KB;
--     jpeg, png, webp, gif). Reading pictures is unchanged (agent_photos_read already lets staff see them).
-- No existing function, policy or grant is changed. View as stays read-only (the aaa_view_as_readonly triggers).
-- Rollback: supabase/rollbacks/20261131060000_admin_edit_agent_profile.sql
begin;
set local lock_timeout = '3s';

create or replace function private.admin_agent_target(p_profile uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
  select p_profile is not null and exists (
    select 1 from public.profiles pr
     where pr.id = p_profile and pr.role = 'Outside user' and pr.status = 'active'
       and pr.is_demo is not distinct from private.viewer_is_demo()
       and (exists (select 1 from public.agent_profiles a where a.profile_id = pr.id)
         or exists (select 1 from public.contacts c where c.profile_id = pr.id and c.contact_type = 'realtor')
         or exists (select 1 from public.deal_participants dp join public.contacts c on c.id = dp.contact_id
                     where c.profile_id = pr.id and dp.role in ('Buyer Agent', 'Listing Agent')))) $function$;

-- the storage object name an Admin may write for an agent: exactly '<agent id>/avatar.jpg'
create or replace function private.admin_agent_photo_ok(p_name text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare folder text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if not private.is_admin() then return false; end if;
  if folder !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false; end if;
  if p_name <> folder || '/avatar.jpg' then return false; end if;
  return private.admin_agent_target(folder::uuid);
end $function$;

create or replace function private.rpc_admin_get_agent_profile(p_profile uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare r jsonb;
begin
  if private.effective_uid() is null or not private.is_admin() then raise exception 'Only an Admin or Super admin can edit an agent profile.' using errcode = '42501'; end if;
  if not private.admin_agent_target(p_profile) then raise exception 'Agent not found. Only a real estate agent with an active portal login has an agent profile.' using errcode = 'P0001'; end if;
  select jsonb_build_object('profile_id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name, 'email', pr.email,
           'cell_phone', coalesce(nullif(a.cell_phone, ''), pr.phone, ''), 'office_phone', coalesce(a.office_phone, ''),
           'brokerage', coalesce(nullif(a.brokerage, ''), c.company, ''), 'photo_path', a.photo_path, 'photo_shape', coalesce(a.photo_shape, 'circle'),
           'has_agent_profile', a.profile_id is not null)
    into r
    from public.profiles pr
    left join public.agent_profiles a on a.profile_id = pr.id
    left join lateral (select x.company from public.contacts x where x.profile_id = pr.id order by x.created_at nulls last, x.id limit 1) c on true
   where pr.id = p_profile;
  return r;
end $function$;

create or replace function private.rpc_admin_update_agent_profile(p_profile uuid, p jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare q jsonb;
begin
  if private.effective_uid() is null or not private.is_admin() then raise exception 'Only an Admin or Super admin can edit an agent profile.' using errcode = '42501'; end if;
  if not private.admin_agent_target(p_profile) then raise exception 'Agent not found. Only a real estate agent with an active portal login has an agent profile.' using errcode = 'P0001'; end if;
  if p is not null and jsonb_typeof(p) <> 'object' then raise exception 'Nothing to save.' using errcode = '22023'; end if;
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into q
    from jsonb_each(coalesce(p, '{}'::jsonb)) e
   where e.key in ('firstName', 'lastName', 'cellPhone', 'officePhone', 'brokerage', 'photoShape', 'photoPath');
  if q ? 'cellPhone' and coalesce(q ->> 'cellPhone', '') = '' then raise exception 'Cell phone is required.' using errcode = '22023'; end if;
  if (q ? 'firstName' and btrim(coalesce(q ->> 'firstName', '')) = '') or (q ? 'lastName' and btrim(coalesce(q ->> 'lastName', '')) = '') then raise exception 'First and last name are required.' using errcode = '22023'; end if;
  if (q ? 'firstName' and length(btrim(q ->> 'firstName')) > 80) or (q ? 'lastName' and length(btrim(q ->> 'lastName')) > 80) then raise exception 'First and last name can be up to 80 letters.' using errcode = '22023'; end if;
  if q ? 'brokerage' and length(coalesce(q ->> 'brokerage', '')) > 120 then raise exception 'Brokerage name can be up to 120 letters.' using errcode = '22023'; end if;
  if q ? 'photoShape' and coalesce(q ->> 'photoShape', '') not in ('circle', 'square') then raise exception 'Picture shape must be circle or square.' using errcode = '22023'; end if;
  if q ? 'photoPath' and coalesce(q ->> 'photoPath', '') not in ('', p_profile::text || '/avatar.jpg') then raise exception 'The picture must be uploaded for this agent.' using errcode = '22023'; end if;
  perform private.agent_profile_write(p_profile, q);
  update public.profiles set first_name = coalesce(nullif(btrim(q ->> 'firstName'), ''), first_name), last_name = coalesce(nullif(btrim(q ->> 'lastName'), ''), last_name),
    phone = case when q ? 'cellPhone' then private.fmt_phone(q ->> 'cellPhone') else phone end where id = p_profile;
end $function$;

create or replace function public.admin_get_agent_profile(p_profile uuid)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog', 'public', 'extensions'
as $function$ BEGIN RETURN private.rpc_admin_get_agent_profile(p_profile); END; $function$;

create or replace function public.admin_update_agent_profile(p_profile uuid, p jsonb)
 returns void
 language plpgsql
 set search_path to 'pg_catalog', 'public', 'extensions'
as $function$ BEGIN PERFORM private.rpc_admin_update_agent_profile(p_profile, p); END; $function$;

revoke all on function private.admin_agent_target(uuid) from public, anon;
revoke all on function private.admin_agent_photo_ok(text) from public, anon;
revoke all on function private.rpc_admin_get_agent_profile(uuid) from public, anon;
revoke all on function private.rpc_admin_update_agent_profile(uuid, jsonb) from public, anon;
revoke all on function public.admin_get_agent_profile(uuid) from public, anon;
revoke all on function public.admin_update_agent_profile(uuid, jsonb) from public, anon;
grant execute on function private.admin_agent_target(uuid) to authenticated;
grant execute on function private.admin_agent_photo_ok(text) to authenticated;
grant execute on function private.rpc_admin_get_agent_profile(uuid) to authenticated;
grant execute on function private.rpc_admin_update_agent_profile(uuid, jsonb) to authenticated;
grant execute on function public.admin_get_agent_profile(uuid) to authenticated;
grant execute on function public.admin_update_agent_profile(uuid, jsonb) to authenticated;

-- Supabase always has storage.objects. A scratch database without the storage schema (test-migrations-apply-clean) skips this part.
do $pol$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage.objects is not here: agent picture policies skipped';
    return;
  end if;
  drop policy if exists agent_photos_admin_insert on storage.objects;
  create policy agent_photos_admin_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'agent-photos' and private.admin_agent_photo_ok(name));
  drop policy if exists agent_photos_admin_update on storage.objects;
  create policy agent_photos_admin_update on storage.objects for update to authenticated
    using (bucket_id = 'agent-photos' and private.admin_agent_photo_ok(name))
    with check (bucket_id = 'agent-photos' and private.admin_agent_photo_ok(name));
end $pol$;

commit;
