-- A buyer or seller insert of visibility staff or all is rewritten to that person's side
-- before the row check. Same rule the staff rewrite already used. No new policy and no
-- per-row helper inside RLS. Not applied by this commit.
begin;
set local lock_timeout = '3s';

create or replace function private.trg_client_share_visibility() returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $function$
declare role text; side text;
begin
  role := private.deal_role(new.deal_id);
  if role in ('Client-Buyer', 'Client-Seller') and new.visibility in ('staff', 'all') then
    side := private.side_of(role);
    if side in ('buyer', 'seller') then new.visibility := side; end if;
  end if;
  return new;
end
$function$;

revoke all on function private.trg_client_share_visibility() from public, anon, authenticated;

do $readback$
declare src text;
begin
  select p.prosrc into src from pg_proc p where p.oid = 'private.trg_client_share_visibility()'::regprocedure;
  if position('staff' in src) = 0 or position('all' in src) = 0 then
    raise exception 'readback: a client insert of staff or all is not rewritten';
  end if;
  if position('per-row' in src) > 0 then
    raise exception 'readback: the rewrite walks one row inside the policy';
  end if;
end
$readback$;
commit;
