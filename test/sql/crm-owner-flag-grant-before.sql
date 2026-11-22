-- Before the grant: the column exists and the guard exists, and authenticated
-- still cannot update can_own_crm. A normal column on the same row can be saved.
-- Fake ids only. Not applied to TEST or production.
\set ON_ERROR_STOP on

do $chk$
begin
  if has_column_privilege('authenticated', 'public.profiles', 'can_own_crm', 'UPDATE') then
    raise exception 'FAIL the tick column is already updatable';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'profiles_can_own_crm_guard' and tgrelid = 'public.profiles'::regclass and not tgisinternal
  ) then
    raise exception 'FAIL the guard trigger is missing before the grant';
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
  update public.profiles set first_name = 'Ned' where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  get diagnostics n = row_count;
  execute 'reset role';
  if n <> 1 then
    raise exception 'FAIL a Processor could not save their own name through profiles_update_self (% rows)', n;
  end if;
end
$chk$;

do $chk$
begin
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
  execute 'set role authenticated';
  begin
    update public.profiles set can_own_crm = true where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'FAIL a Super admin updated the tick before the grant';
  exception
    when insufficient_privilege then
      if position('Only an Admin or Super admin' in sqlerrm) > 0 or position('permission denied' in sqlerrm) = 0 then
        raise exception 'FAIL super admin was not stopped by the missing column grant: %', sqlerrm;
      end if;
  end;
  execute 'reset role';
end
$chk$;
