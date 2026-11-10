-- Model documents_insert denying everyone for anyone who is not CLA staff.
-- Own side stays allowed. This is the reported agent gap.
create or replace function private.visibility_allowed(d uuid, vis text) returns boolean
language sql stable security definer set search_path to pg_catalog, public as $$
  select vis in ('all', 'buyer', 'seller', 'staff') and (
    private.is_staffish()
    or (vis in ('buyer', 'seller') and vis = private.side_of(private.deal_role(d)))) $$;
