-- Rollback for 20261112080000_company_lookup.sql.
-- Drops the lookup, the find-or-create function, the rename trigger, and the prefix index.
-- Does not change crm_accounts rows, contacts.company, or any policy.
-- Not applied to hosted TEST (aqcervntopidtcazcmlv).

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $pre$
begin
  if to_regclass('public.crm_accounts_company_key_active_idx') is null then
    raise exception 'rollback: crm_accounts_company_key_active_idx is missing';
  end if;
  if to_regprocedure('public.company_lookup(text, integer)') is null
     or to_regprocedure('public.company_find_or_create(text, text, text)') is null
     or to_regprocedure('public.crm_account_name_sync()') is null then
    raise exception 'rollback: a company lookup function is missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'crm_accounts_name_sync' and tgrelid = 'public.crm_accounts'::regclass and not tgisinternal
  ) then
    raise exception 'rollback: trigger crm_accounts_name_sync is missing';
  end if;
end
$pre$;

drop trigger crm_accounts_name_sync on public.crm_accounts;
drop function public.crm_account_name_sync();
drop function public.company_find_or_create(text, text, text);
drop function public.company_lookup(text, integer);
drop index public.crm_accounts_company_key_active_idx;

do $post$
begin
  if to_regclass('public.crm_accounts_company_key_active_idx') is not null
     or to_regprocedure('public.company_lookup(text, integer)') is not null
     or to_regprocedure('public.company_find_or_create(text, text, text)') is not null
     or to_regprocedure('public.crm_account_name_sync()') is not null
     or exists (
       select 1 from pg_trigger
       where tgname = 'crm_accounts_name_sync' and tgrelid = 'public.crm_accounts'::regclass and not tgisinternal
     ) then
    raise exception 'rollback: a company lookup object is still present';
  end if;
end
$post$;

commit;
