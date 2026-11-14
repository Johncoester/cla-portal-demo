-- Rollback for 20261119130000_invite_after_email_change.sql. NOT APPLIED.
-- Drops the email-change invite functions. Pending invites already created stay as rows;
-- revoke any unneeded ones before applying this rollback.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

drop function if exists public.invite_after_email_change(uuid, uuid);
drop function if exists private.rpc_invite_after_email_change(uuid, uuid);

do $readback$
begin
  if to_regprocedure('public.invite_after_email_change(uuid,uuid)') is not null
     or to_regprocedure('private.rpc_invite_after_email_change(uuid,uuid)') is not null then
    raise exception 'rollback check: invite_after_email_change still present'; end if;
end
$readback$;

commit;
