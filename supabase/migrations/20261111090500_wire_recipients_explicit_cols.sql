-- FF-018 follow-up. message_recipients now returns email, so `select r.*` into
-- rpc_wire_recipients (5 columns) made /rpc/wire_recipients return 400 and the Share Files
-- picker never rendered.
-- Already applied on TEST as a hotfix. This records that body. Do not apply it again from here.
-- Live private.rpc_wire_recipients prosrc md5: 33b9e6a64366ceef465e48224a438415
-- Live pg_get_functiondef md5: db3cee809e18a40f2cffbcbb850225d4
begin;
set local lock_timeout = '3s';

do $guard$
declare
  src text;
  h text;
begin
  select p.prosrc into src from pg_proc p where p.oid = 'private.rpc_wire_recipients(uuid)'::regprocedure;
  if src is null then
    raise exception 'drift: private.rpc_wire_recipients missing';
  end if;
  h := md5(src);
  if h is distinct from '33b9e6a64366ceef465e48224a438415'
     and position('select r.*' in src) = 0 then
    raise exception 'drift: private.rpc_wire_recipients is %', h;
  end if;
end
$guard$;

create or replace function private.rpc_wire_recipients(p_deal uuid)
returns table(id uuid, first_name text, last_name text, role text, side text)
language sql
stable security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
  select r.id, r.first_name, r.last_name, r.role, r.side from public.message_recipients(p_deal) r where private.person_wire_allowed(r.id, p_deal) $function$;

revoke all on function private.rpc_wire_recipients(uuid) from public, anon;
grant execute on function private.rpc_wire_recipients(uuid) to authenticated;

do $readback$
declare
  src text;
begin
  select p.prosrc into src from pg_proc p where p.oid = 'private.rpc_wire_recipients(uuid)'::regprocedure;
  if md5(src) is distinct from '33b9e6a64366ceef465e48224a438415' then
    raise exception 'readback: private.rpc_wire_recipients prosrc is %', md5(src);
  end if;
  if position('select r.*' in src) > 0 or position('r.email' in src) > 0 then
    raise exception 'readback: wire recipients must list the five columns and not email';
  end if;
end
$readback$;
commit;
