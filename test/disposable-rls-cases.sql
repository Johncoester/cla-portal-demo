-- Authenticated sessions. A wrong count or an unexpected insert fails this file.
create table if not exists public.rls_results (name text primary key, ok boolean not null, detail text default '');
grant select, insert, update on public.rls_results to authenticated;

insert into public.documents (deal_id, name, visibility, uploaded_by, wire_instructions)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'wire-buyer.pdf', 'buyer', '11111111-1111-1111-1111-111111111111', true);

create or replace function public.rls_try(p_name text, p_sql text, p_expect text) returns void
language plpgsql as $$
declare msg text := '';
begin
  begin
    execute p_sql;
    msg := 'allowed';
  exception when others then
    msg := sqlerrm;
  end;
  insert into public.rls_results (name, ok, detail)
  values (p_name, msg = p_expect, msg)
  on conflict (name) do update set ok = excluded.ok, detail = excluded.detail;
end $$;

create or replace function public.rls_count(p_name text, p_name_filter text, p_expect int) returns void
language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from public.documents where name = $1' into n using p_name_filter;
  insert into public.rls_results (name, ok, detail)
  values (p_name, n = p_expect, n::text)
  on conflict (name) do update set ok = excluded.ok, detail = excluded.detail;
end $$;

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
set role authenticated;
select public.rls_try('listing staff insert', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'staff.pdf', 'staff', '44444444-4444-4444-4444-444444444444')$$, 'allowed');
select public.rls_try('listing own side insert', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'seller.pdf', 'seller', '44444444-4444-4444-4444-444444444444')$$, 'allowed');
select public.rls_try('listing other side insert', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'buyer.pdf', 'buyer', '44444444-4444-4444-4444-444444444444')$$, 'new row violates row-level security policy for table "documents"');
select public.rls_try('listing wire insert', $$insert into public.documents (deal_id, name, visibility, uploaded_by, wire_instructions) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'wire.pdf', 'staff', '44444444-4444-4444-4444-444444444444', true)$$, 'new row violates row-level security policy for table "documents"');
select public.rls_try('listing spoof uploader', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'spoof.pdf', 'staff', '11111111-1111-1111-1111-111111111111')$$, 'new row violates row-level security policy for table "documents"');
select public.rls_count('listing reads own staff file', 'staff.pdf', 1);
select public.rls_count('listing does not read wire file', 'wire-buyer.pdf', 0);

reset role;
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
set role authenticated;
select public.rls_try('buyer agent cross file', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'cross.pdf', 'buyer', '55555555-5555-5555-5555-555555555555')$$, 'new row violates row-level security policy for table "documents"');
select public.rls_try('buyer agent own side', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'buyer-ok.pdf', 'buyer', '55555555-5555-5555-5555-555555555555')$$, 'allowed');
select public.rls_count('buyer agent does not read seller file', 'seller.pdf', 0);
select public.rls_count('buyer agent does not read staff file', 'staff.pdf', 0);

reset role;
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
set role authenticated;
select public.rls_count('seller reads own side', 'seller.pdf', 1);
select public.rls_count('seller does not read staff file', 'staff.pdf', 0);
select public.rls_try('seller cannot insert staff file', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'seller-staff.pdf', 'staff', '66666666-6666-6666-6666-666666666666')$$, 'new row violates row-level security policy for table "documents"');

reset role;
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', false);
set role authenticated;
select public.rls_try('disabled agent insert', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'disabled.pdf', 'staff', '77777777-7777-7777-7777-777777777777')$$, 'new row violates row-level security policy for table "documents"');
select public.rls_count('disabled agent reads nothing', 'seller.pdf', 0);

reset role;
select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', false);
set role authenticated;
select public.rls_try('demo agent on real file', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'demo-real.pdf', 'staff', '88888888-8888-8888-8888-888888888888')$$, 'new row violates row-level security policy for table "documents"');
select public.rls_try('demo agent on demo file', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'demo.pdf', 'staff', '88888888-8888-8888-8888-888888888888')$$, 'allowed');

reset role;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
set role authenticated;
select public.rls_try('sales view-only insert', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'sales.pdf', 'staff', '22222222-2222-2222-2222-222222222222')$$, 'new row violates row-level security policy for table "documents"');
select public.rls_count('sales still reads staff file', 'staff.pdf', 1);

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
set role authenticated;
select public.rls_count('processor reads staff file', 'staff.pdf', 1);
select public.rls_count('processor reads seller file', 'seller.pdf', 1);
select public.rls_count('processor reads wire file', 'wire-buyer.pdf', 1);
