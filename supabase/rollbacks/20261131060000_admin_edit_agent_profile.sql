-- Undo JC-AGENT-EDIT-1: Admins can no longer edit an agent's profile or upload an agent's picture.
-- Removes only what 20261131060000_admin_edit_agent_profile.sql added. Saved profile values and pictures stay.
-- The agent's own edit (update_my_agent_profile) and the existing agent_photos_* policies are not touched.
begin;
set local lock_timeout = '3s';
do $pol$
begin
  if to_regclass('storage.objects') is null then return; end if;
  drop policy if exists agent_photos_admin_update on storage.objects;
  drop policy if exists agent_photos_admin_insert on storage.objects;
end $pol$;
drop function if exists public.admin_update_agent_profile(uuid, jsonb);
drop function if exists public.admin_get_agent_profile(uuid);
drop function if exists private.rpc_admin_update_agent_profile(uuid, jsonb);
drop function if exists private.rpc_admin_get_agent_profile(uuid);
drop function if exists private.admin_agent_photo_ok(text);
drop function if exists private.admin_agent_target(uuid);
commit;
