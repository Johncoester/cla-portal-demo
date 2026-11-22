-- Row security for the tax rate sheet. Runs after the migration, on the disposable database only.
insert into public.profiles (id, email, first_name, last_name, role, status, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'processor@example.test', 'Pat', 'Processor', 'Processor', 'active', false),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@example.test', 'Ada', 'Admin', 'Admin', 'active', true),
  ('00000000-0000-0000-0000-0000000000a3', 'super@example.test', 'Sam', 'Super', 'Super admin', 'active', true),
  ('00000000-0000-0000-0000-0000000000a4', 'buyer@example.test', 'Bea', 'Buyer', 'Client-Buyer', 'active', false);

grant select, insert, update, delete on public.tax_jurisdictions, public.tax_rate_lines, public.tax_exemptions, public.tax_questions, public.tax_allocations to authenticated;

-- A processor can read the seeded Baltimore City rate and cannot change it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;
do $p$
declare n int; r numeric;
begin
  select count(*) into n from public.tax_jurisdictions;
  if n < 4 then raise exception 'FAIL processor could not read jurisdictions (%)', n; end if;
  select l.rate into r from public.tax_rate_lines l
    join public.tax_jurisdictions j on j.id = l.jurisdiction_id
   where j.state = 'MD' and j.county = 'Baltimore City' and l.name = 'County transfer tax' and l.bracket_from = 0;
  if r is distinct from 1.5 then raise exception 'FAIL Baltimore City transfer rate %', r; end if;
  update public.tax_rate_lines set rate = 9 where name = 'County transfer tax';
  select l.rate into r from public.tax_rate_lines l
    join public.tax_jurisdictions j on j.id = l.jurisdiction_id
   where j.state = 'MD' and j.county = 'Baltimore City' and l.name = 'County transfer tax' and l.bracket_from = 0;
  if r is distinct from 1.5 then raise exception 'FAIL processor changed a rate to %', r; end if;
  begin
    insert into public.tax_jurisdictions (state, county, city, name) values ('WY', '', '', 'Wyoming');
    raise exception 'FAIL processor added a place';
  exception when insufficient_privilege then null;
  end;
end $p$;
reset role;

-- An admin can clear a rate (Rate Not Set) and a super admin can change the locked split.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
set role authenticated;
do $a$
declare vid uuid;
begin
  select l.id into vid from public.tax_rate_lines l
    join public.tax_jurisdictions j on j.id = l.jurisdiction_id
   where j.county = 'Calvert' and l.name = 'County recordation tax' and l.transaction = 'purchase' limit 1;
  if vid is null then raise exception 'FAIL Calvert recordation row missing'; end if;
  update public.tax_rate_lines set rate = null where id = vid;
  if (select rate from public.tax_rate_lines where id = vid) is not null then raise exception 'FAIL admin could not clear the rate'; end if;
end $a$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', false);
set role authenticated;
do $s$
declare locked boolean;
begin
  update public.tax_allocations a set law_mandated = false
    from public.tax_jurisdictions j
   where j.id = a.jurisdiction_id and j.state = 'MD' and j.county = '' and a.tax_name = 'State transfer tax' and a.when_key = 'first_time_buyer';
  select a.law_mandated into locked from public.tax_allocations a
    join public.tax_jurisdictions j on j.id = a.jurisdiction_id
   where j.state = 'MD' and j.county = '' and a.tax_name = 'State transfer tax' and a.when_key = 'first_time_buyer';
  if locked is distinct from false then raise exception 'FAIL super admin could not change the locked split'; end if;
  update public.tax_allocations a set law_mandated = true
    from public.tax_jurisdictions j
   where j.id = a.jurisdiction_id and j.state = 'MD' and j.county = '' and a.tax_name = 'State transfer tax' and a.when_key = 'first_time_buyer';
end $s$;
reset role;

-- A buyer sees nothing.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false);
set role authenticated;
do $b$
declare n int;
begin
  select count(*) into n from public.tax_jurisdictions;
  if n <> 0 then raise exception 'FAIL a buyer read % rate-sheet rows', n; end if;
  begin
    insert into public.tax_jurisdictions (state, county, city, name) values ('WY', '', '', 'Wyoming');
    raise exception 'FAIL a buyer added a place';
  exception when insufficient_privilege then null;
  end;
end $b$;
reset role;
