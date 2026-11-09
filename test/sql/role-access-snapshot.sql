-- One snapshot of what every fake person can do in the CRM / Accounting surfaces this migration touches. :phase = before | after | rolled
-- Run as postgres; each person's row is computed as `authenticated` with their auth.uid().
create table if not exists public.ra_snap (phase text, uid uuid, data jsonb);
grant insert, select on public.ra_snap to authenticated;
create or replace function public.ra_try(q text) returns text language plpgsql as $$
declare v text; begin execute q into v; return coalesce(v, 'null'); exception when others then return 'ERR:' || sqlerrm; end $$;
create or replace function public.ra_behavior() returns jsonb language sql as $$
  select jsonb_build_object(
    'crm_user', ra_try('select private.crm_user()::text'),
    'crm_need', ra_try('select private.crm_need()::text'),
    'crm_need_edit', ra_try('select private.crm_need(true)::text'),
    'crm_all', ra_try('select private.crm_all()::text'), 'crm_read_all', ra_try('select private.crm_read_all()::text'),
    'crm_editor', ra_try('select private.crm_editor()::text'), 'scope_all', ra_try('select private.crm_deal_scope_all()::text'),
    'deals', ra_try($q$select jsonb_array_length(public.crm_deals('All', null, null, null))::text$q$),
    'rpc_deals', ra_try($q$select jsonb_array_length(private.rpc_crm_deals('All', null, null, null))::text$q$),
    'filters', ra_try($q$select (public.crm_deal_filters() ->> 'scope')$q$), 'rpc_filters', ra_try($q$select (private.rpc_crm_deal_filters() ->> 'scope')$q$),
    'leads', ra_try('select count(*)::text from public.crm_leads'),
    'picklist', ra_try('select count(*)::text from public.crm_picklist_options'),
    'source_options', ra_try('select count(*)::text from public.source_of_business_options()'),
    'sig_read', ra_try('select count(*)::text from public.crm_user_signatures'),
    'acct_reader', ra_try($q$select private.acct_reader('10000000-0000-0000-0000-000000000001')::text$q$),
    'acct_editor', ra_try($q$select private.acct_editor('10000000-0000-0000-0000-000000000001')::text$q$),
    'fees', ra_try('select count(*)::text from public.accounting_fees')) $$;
grant execute on function public.ra_try(text), public.ra_behavior() to authenticated;
select format($f$select public.as_user(%L); set role authenticated; insert into public.ra_snap select %L, auth.uid(), public.ra_behavior(); reset role;$f$, id, :'phase') from public.profiles order by id \gexec
