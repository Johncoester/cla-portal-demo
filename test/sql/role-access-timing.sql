-- the same three reads, 10 times each, per phase (ms per call). Processor: crm_leads (per-row crm_owner_ok -> crm_all); Sales Person: crm_deals('All')
-- (per-row crm_deal_visible -> crm_deal_scope_all); Transaction Coordinator: accounting_fees (per-row acct_reader). Admin: crm_leads (short-circuit).
create table if not exists public.ra_time (phase text, what text, ms numeric);
grant insert on public.ra_time to authenticated;
create or replace function public.ra_clock(what text, q text, n int) returns numeric language plpgsql as $$
declare t0 timestamptz; i int; v text; begin execute q into v; t0 := clock_timestamp(); for i in 1..n loop execute q into v; end loop;
  return round(extract(epoch from clock_timestamp() - t0) * 1000 / n, 3); end $$;
grant execute on function public.ra_clock(text, text, int) to authenticated;
select public.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
insert into public.ra_time values (:'phase', 'processor leads', public.ra_clock('l', 'select count(*)::text from public.crm_leads', 10)); reset role;
select public.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
insert into public.ra_time values (:'phase', 'sales person crm_deals', public.ra_clock('d', $q$select jsonb_array_length(public.crm_deals('All', null, null, null))::text$q$, 10)); reset role;
select public.as_user('00000000-0000-0000-0000-000000000007'); set role authenticated;
insert into public.ra_time values (:'phase', 'tc accounting_fees', public.ra_clock('f', 'select count(*)::text from public.accounting_fees', 10)); reset role;
select public.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
insert into public.ra_time values (:'phase', 'admin leads', public.ra_clock('a', 'select count(*)::text from public.crm_leads', 10)); reset role;
