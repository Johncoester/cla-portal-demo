-- Removes only the two E2E side teams and their memberships.
begin;
set local lock_timeout = '3s';
delete from public.team_members
where team_id in ('e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-0000000000b2');
delete from public.teams
where id in ('e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-0000000000b2');
commit;
