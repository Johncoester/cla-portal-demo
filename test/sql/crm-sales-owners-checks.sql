-- F35 row 415 checks. Fake ids only. Not applied to TEST or production.
\set ON_ERROR_STOP on

insert into public.profiles (id, email, first_name, last_name, role, is_admin, status, can_own_crm) values
  ('11111111-1111-4111-8111-111111111111', 'john.owner@example.test', 'John', 'Owner', 'Super admin', true, 'active', true),
  ('22222222-2222-4222-8222-222222222222', 'sam.sales@example.test', 'Sam', 'Sales', 'Sales Person', false, 'active', false),
  ('33333333-3333-4333-8333-333333333333', 'idle.sales@example.test', 'Idle', 'Sales', 'Sales Person', false, 'disabled', false),
  ('44444444-4444-4444-8444-444444444444', 'tina.team@example.test', 'Tina', 'Team', 'Sales Team', false, 'active', false),
  ('55555555-5555-4555-8555-555555555555', 'pat.proc@example.test', 'Pat', 'Proc', 'Processor', false, 'active', false);

do $chk$
declare
  n int;
begin
  select count(*) into n from private.rpc_crm_owners();
  if n <> 2 then
    raise exception 'FAIL owner list should be the ticked admin and the active salesperson, got %', n;
  end if;
  if not exists (select 1 from private.rpc_crm_owners() where id = '22222222-2222-4222-8222-222222222222' and role = 'Sales Person')
     or not exists (select 1 from private.rpc_crm_owners() where id = '11111111-1111-4111-8111-111111111111' and role = 'Super admin') then
    raise exception 'FAIL the active salesperson or the ticked admin is missing';
  end if;
  if exists (select 1 from private.rpc_crm_owners() where id in (
       '33333333-3333-4333-8333-333333333333',
       '44444444-4444-4444-8444-444444444444',
       '55555555-5555-4555-8555-555555555555')) then
    raise exception 'FAIL an inactive salesperson, Sales Team, or unticked processor is in the list';
  end if;
  if to_regprocedure('public.crm_owners()') is not null then
    if (select count(*) from public.crm_owners()) <> 2 then
      raise exception 'FAIL public.crm_owners does not match the shared list';
    end if;
  end if;
  if to_regprocedure('public.crm_deal_filters()') is not null then
    if (select count(*) from public.profiles p
        where p.status = 'active' and (p.can_own_crm or p.role = 'Sales Person')
          and not exists (
            select 1 from jsonb_array_elements_text((public.crm_deal_filters()->'owners')) x
            where x = p.id::text)) <> 0 then
      raise exception 'FAIL the deal owner list is missing someone the owner list includes';
    end if;
  end if;
end
$chk$;

do $chk$
begin
  if private.crm_owner_check('22222222-2222-4222-8222-222222222222', null, true)
     is distinct from '22222222-2222-4222-8222-222222222222' then
    raise exception 'FAIL an active salesperson was refused as a new owner';
  end if;
  if private.crm_owner_check('11111111-1111-4111-8111-111111111111', null, false)
     is distinct from '11111111-1111-4111-8111-111111111111' then
    raise exception 'FAIL a ticked admin was refused as an owner';
  end if;
  if private.crm_owner_check('33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', false)
     is distinct from '33333333-3333-4333-8333-333333333333' then
    raise exception 'FAIL keeping the current inactive owner was refused';
  end if;
end
$chk$;

do $chk$
begin
  perform private.crm_owner_check('33333333-3333-4333-8333-333333333333', null, true);
  raise exception 'FAIL an inactive salesperson was accepted as a new owner';
exception
  when sqlstate 'P0001' then
    if position('can own CRM records' in sqlerrm) = 0 then
      raise exception 'FAIL inactive owner message was %', sqlerrm;
    end if;
end
$chk$;

do $chk$
begin
  perform private.crm_owner_check('44444444-4444-4444-8444-444444444444', null, true);
  raise exception 'FAIL an unticked Sales Team user was accepted';
exception
  when sqlstate 'P0001' then
    if position('can own CRM records' in sqlerrm) = 0 then
      raise exception 'FAIL sales team message was %', sqlerrm;
    end if;
end
$chk$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $chk$
declare
  kept uuid;
begin
  kept := private.crm_owner_check(null, null, true);
  if kept is distinct from '22222222-2222-4222-8222-222222222222' then
    raise exception 'FAIL a new record did not default to the active salesperson';
  end if;
  perform private.crm_owner_check('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', false);
  raise exception 'FAIL a salesperson assigned a record to someone else';
exception
  when sqlstate 'P0001' then
    if position('only assign records to themselves' in sqlerrm) = 0 then
      raise exception 'FAIL assign-to-self message was %', sqlerrm;
    end if;
end
$chk$;
