-- Removes the E2E buyer-side team and its memberships. The listing side stays without a coordinator.
begin;
set local lock_timeout = '3s';
delete from public.team_members
where team_id = 'e2e00000-0000-4000-8000-0000000000b1';
delete from public.teams
where id = 'e2e00000-0000-4000-8000-0000000000b1';
commit;
