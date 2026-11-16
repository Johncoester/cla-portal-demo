-- CRM-OWNER-1 checks on a scratch database. Fake ids only.
\set ON_ERROR_STOP on

insert into public.profiles (id, email, first_name, last_name, role, is_admin) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ada.admin@example.test', 'Ada', 'Admin', 'Super admin', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'pat.processor@example.test', 'Pat', 'Processor', 'Processor', true),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'sam.sales@example.test', 'Sam', 'Sales', 'Sales Person', false),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'bianca.agent@example.test', 'Bianca', 'Agent', 'Outside user', false);

do $chk$
begin
  if exists (select 1 from public.profiles where can_own_crm) then
    raise exception 'FAIL default is not off for every new user';
  end if;
end
$chk$;

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
do $chk$
begin
  update public.profiles set can_own_crm = true where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  raise exception 'FAIL a Processor with Admin access changed the tick';
exception
  when insufficient_privilege then
    if position('Only an Admin or Super admin' in sqlerrm) = 0 then
      raise exception 'FAIL processor message was %', sqlerrm;
    end if;
end
$chk$;

select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', false);
do $chk$
begin
  update public.profiles set can_own_crm = true where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  raise exception 'FAIL a salesperson changed their own tick';
exception
  when insufficient_privilege then
    null;
end
$chk$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
update public.profiles set can_own_crm = true where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
update public.profiles set can_own_crm = true where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

do $chk$
declare
  n int;
  detail text;
  actor uuid;
  who uuid;
  at timestamptz;
begin
  if (select can_own_crm from public.profiles where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') then
    raise exception 'FAIL the refused salesperson tick was saved';
  end if;
  select count(*) into n from public.activity_log where action = 'user.crm_owner' and entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  if n <> 1 then raise exception 'FAIL expected one log row for Pat, got %', n; end if;
  select a.actor_id, a.entity_id, a.detail, a.created_at into actor, who, detail, at
  from public.activity_log a
  where a.action = 'user.crm_owner' and a.entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  if actor <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' or who <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' then
    raise exception 'FAIL log who/which user is wrong';
  end if;
  if detail !~ 'from no to yes' or at is null then
    raise exception 'FAIL log old/new/when is wrong: %', detail;
  end if;
  if (select count(*) from private.rpc_crm_owners()) <> 2 then
    raise exception 'FAIL picker should be the two ticked users';
  end if;
  if exists (select 1 from private.rpc_crm_owners() where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
     or not exists (select 1 from private.rpc_crm_owners() where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' and role = 'Outside user') then
    raise exception 'FAIL picker is still filtered by role';
  end if;
  if private.crm_owner_check('cccccccc-cccc-4ccc-8ccc-cccccccccccc', null, true) is not null then
    raise exception 'FAIL an unticked user was accepted as a new owner';
  end if;
exception
  when sqlstate 'P0001' then
    if position('can own CRM records' in sqlerrm) = 0 then
      raise exception 'FAIL owner check message was %', sqlerrm;
    end if;
end
$chk$;

do $chk$
declare kept uuid;
begin
  if private.crm_owner_check('dddddddd-dddd-4ddd-8ddd-dddddddddddd', null, true) is distinct from 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' then
    raise exception 'FAIL a ticked outside user was refused';
  end if;
  kept := private.crm_owner_check('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', false);
  if kept is distinct from 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' then
    raise exception 'FAIL keeping the current unticked owner was refused';
  end if;
end
$chk$;

update public.profiles set can_own_crm = false where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

do $chk$
declare detail text;
begin
  select a.detail into detail from public.activity_log a
  where a.action = 'user.crm_owner' and a.entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  order by a.created_at desc limit 1;
  if detail !~ 'from yes to no' then raise exception 'FAIL off change was not logged: %', detail; end if;
  if exists (select 1 from private.rpc_crm_owners() where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then
    raise exception 'FAIL Pat is still in the picker';
  end if;
end
$chk$;
