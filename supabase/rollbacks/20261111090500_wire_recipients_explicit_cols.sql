-- Restores the wire list from before the explicit columns. `select r.*` reads every
-- column of message_recipients. That matched when message_recipients had five columns.
-- After email was added, this statement is the one that returned 400.
begin;
set local lock_timeout = '3s';

create or replace function private.rpc_wire_recipients(p_deal uuid)
returns table(id uuid, first_name text, last_name text, role text, side text)
language sql
stable security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
  select r.* from public.message_recipients(p_deal) r where private.person_wire_allowed(r.id, p_deal) $function$;

revoke all on function private.rpc_wire_recipients(uuid) from public, anon;
grant execute on function private.rpc_wire_recipients(uuid) to authenticated;

do $readback$
declare
  src text;
begin
  select p.prosrc into src from pg_proc p where p.oid = 'private.rpc_wire_recipients(uuid)'::regprocedure;
  if md5(src) is distinct from '9f3eb89dab4d21a12c5a6683f12d447d' then
    raise exception 'rollback check: private.rpc_wire_recipients is %', md5(src);
  end if;
  if position('select r.*' in src) = 0 then
    raise exception 'rollback check: select r.* was not restored';
  end if;
end
$readback$;
commit;
