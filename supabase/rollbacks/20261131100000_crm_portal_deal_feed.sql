-- Rollback for 20261131100000_crm_portal_deal_feed.sql (CRM-FEED-1). Not applied by this commit.
-- Drops exactly what the migration created. Imported Zoho deal rows are dropped with their table; portal orders,
-- parties and contacts are not touched (the migration never wrote to them).
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $pre$
begin
  if to_regclass('public.crm_imported_deals') is not null
     and coalesce(obj_description('public.crm_imported_deals'::regclass, 'pg_class'), '') not like 'CRM-FEED-1 20261131100000:%' then
    raise exception 'drift: public.crm_imported_deals was not created by 20261131100000';
  end if;
end $pre$;

drop trigger if exists zz_crm_imported_deal_party on public.deal_participants;
drop trigger if exists zz_crm_imported_deal_relink on public.deals;
drop trigger if exists zz_crm_imported_deal_link on public.deals;
drop function if exists public.crm_imported_deals_list();
drop function if exists public.crm_import_deals(boolean, text, jsonb, uuid);
drop function if exists private.trg_crm_imported_deal_on_party();
drop function if exists private.trg_crm_imported_deal_on_deal();
drop function if exists private.crm_imported_deal_link(uuid);
drop index if exists public.deals_crm_addr_key_idx;
drop table if exists public.crm_imported_deals;
drop function if exists private.crm_name_key(text);
drop function if exists private.crm_addr_key(text, text, text);
drop function if exists private.crm_file_key(text);

commit;
