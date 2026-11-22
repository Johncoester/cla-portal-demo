-- After the grant. Fake ids only. Not applied to TEST or production.
-- A Super admin and a plain Admin can flip the tick, as the signed-in role.
-- A Processor who is not an admin, updating their own row through profiles_update_self,
-- gets the guard's "Only an Admin or Super admin" error. The admin change is logged.
\set ON_ERROR_STOP on

do $chk$
begin
  if not has_column_privilege('authenticated', 'public.profiles', 'can_own_crm', 'UPDATE') then
    raise exception 'FAIL authenticated still cannot update can_own_crm';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'profiles_can_own_crm_guard' and tgrelid = 'public.profiles'::regclass and not tgisinternal
  ) then
    raise exception 'FAIL the guard trigger is missing after the grant';
  end if;
end
$chk$;

do $chk$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', false);
  execute 'set role authenticated';
  if current_user <> 'authenticated' then
    raise exception 'FAIL did not switch to authenticated';
  end if;
  begin
    update public.profiles set can_own_crm = true where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    raise exception 'FAIL a Processor changed their own tick';
  exception
    when insufficient_privilege then
      if position('Only an Admin or Super admin' in sqlerrm) = 0 then
        raise exception 'FAIL processor message was %', sqlerrm;
      end if;
  end;
  execute 'reset role';
  if (select can_own_crm from public.profiles where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') then
    raise exception 'FAIL the refused tick was saved';
  end if;
  select count(*) into n from public.activity_log
  where action = 'user.crm_owner' and entity_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  if n <> 0 then
    raise exception 'FAIL a refused tick was logged';
  end if;
end
$chk$;

do $chk$
declare
  n int;
  actor uuid;
  detail text;
  at timestamptz;
begin
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
  execute 'set role authenticated';
  update public.profiles set can_own_crm = true where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  get diagnostics n = row_count;
  execute 'reset role';
  if n <> 1 then
    raise exception 'FAIL a Super admin update changed % rows', n;
  end if;
  if not (select can_own_crm from public.profiles where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') then
    raise exception 'FAIL the Super admin tick did not stay on';
  end if;
  select a.actor_id, a.detail, a.created_at into actor, detail, at
  from public.activity_log a
  where a.action = 'user.crm_owner' and a.entity_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  order by a.created_at desc limit 1;
  if actor is distinct from 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then
    raise exception 'FAIL the log does not name the Super admin';
  end if;
  if detail !~ 'from no to yes' or at is null then
    raise exception 'FAIL the log does not record the old and new tick: %', detail;
  end if;
end
$chk$;

do $chk$
declare
  n int;
  actor uuid;
  detail text;
begin
  perform set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', false);
  execute 'set role authenticated';
  update public.profiles set can_own_crm = true where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  get diagnostics n = row_count;
  execute 'reset role';
  if n <> 1 or not (select can_own_crm from public.profiles where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') then
    raise exception 'FAIL a plain Admin could not turn the tick on';
  end if;
  select a.actor_id, a.detail into actor, detail
  from public.activity_log a
  where a.action = 'user.crm_owner' and a.entity_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  order by a.created_at desc limit 1;
  if actor is distinct from 'ffffffff-ffff-4fff-8fff-ffffffffffff' or detail !~ 'from no to yes' then
    raise exception 'FAIL the Admin change was not logged: %', detail;
  end if;
end
$chk$;
