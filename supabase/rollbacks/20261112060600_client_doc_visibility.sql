-- Restores the rewrite that only changed visibility staff.
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
  if role in ('Client-Buyer', 'Client-Seller') and new.visibility = 'staff' then
    side := private.side_of(role);
    if side in ('buyer', 'seller') then new.visibility := side; end if;
  end if;
  return new;
end
$function$;

revoke all on function private.trg_client_share_visibility() from public, anon, authenticated;
commit;
