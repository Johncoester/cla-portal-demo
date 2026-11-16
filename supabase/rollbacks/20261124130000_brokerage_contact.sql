-- Rollback FF-090. Drops the brokerage contact columns. The company name stays.
begin;
set local lock_timeout = '3s';
do $$
begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'deals'
      and column_name in ('mortgage_broker_contact', 'mortgage_broker_phone', 'mortgage_broker_email', 'mortgage_broker_address')) <> 4 then
    raise exception 'drift: brokerage contact columns are not all present'; end if;
end $$;

alter table public.deals
  drop column mortgage_broker_contact,
  drop column mortgage_broker_phone,
  drop column mortgage_broker_email,
  drop column mortgage_broker_address;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals'
      and column_name in ('mortgage_broker_contact', 'mortgage_broker_phone', 'mortgage_broker_email', 'mortgage_broker_address')) then
    raise exception 'readback: a brokerage contact column is still present'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'mortgage_broker_name') then
    raise exception 'readback: deals.mortgage_broker_name was dropped'; end if;
end $$;
commit;
