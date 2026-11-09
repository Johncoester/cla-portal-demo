-- Rollback for 20261109233000_portal_invite_clients.sql. NOT APPLIED.
-- 1) Re-run the previous private.invite_service_accept (supabase/migrations/20261109170000_hr_invite_portal_role.sql) to drop the client branch.
-- 2) Then:
drop function if exists public.create_portal_invite(uuid, uuid, text);
drop function if exists private.rpc_create_portal_invite(uuid, uuid, text);
drop function if exists public.portal_invite_lookup(text);
drop function if exists private.rpc_portal_invite_lookup(text);
-- Client invites already created stay as rows; revoke pending ones before dropping the column:
update public.agent_invites set status = 'revoked', revoked_at = now(), token_hash = null where invite_kind = 'client' and status = 'pending';
alter table public.agent_invites drop constraint if exists agent_invites_invite_kind_check;
alter table public.agent_invites drop column if exists invite_kind;
