-- Re-runnable matrix. psql -v phase=before -v agent_all=allowed -f checks.sql
reset role;
delete from public.documents where name like 'probe-%' or name = 'shared-everyone.pdf';
delete from public.messages where body <> 'The commission form is ready.';
insert into public.documents (deal_id, name, visibility, uploaded_by)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'shared-everyone.pdf', 'all', '55555555-5555-5555-5555-555555555555');

create or replace function public.rls_try(p_phase text, p_name text, p_sql text, p_expect text) returns void
language plpgsql security invoker set search_path to pg_catalog, public as $$
declare msg text := 'allowed'; pass boolean;
begin
  begin
    execute p_sql;
  exception when others then
    msg := sqlerrm;
  end;
  pass := case
    when p_expect = 'allowed' then msg = 'allowed'
    when p_expect = 'denied' then position('row-level security' in msg) > 0
    else msg = p_expect
  end;
  insert into public.rls_results (phase, name, ok, detail) values (p_phase, p_name, pass, left(msg, 400))
  on conflict (phase, name) do update set ok = excluded.ok, detail = excluded.detail;
end $$;

create or replace function public.rls_count(p_phase text, p_name text, p_filter text, p_expect int) returns void
language plpgsql security invoker set search_path to pg_catalog, public as $$
declare n int;
begin
  execute 'select count(*) from public.documents where name = $1' into n using p_filter;
  insert into public.rls_results (phase, name, ok, detail) values (p_phase, p_name, n = p_expect, n::text)
  on conflict (phase, name) do update set ok = excluded.ok, detail = excluded.detail;
end $$;

create or replace function public.rls_msgs(p_phase text, p_name text, p_expect int) returns void
language plpgsql security invoker set search_path to pg_catalog, public as $$
declare n int;
begin
  select count(*) into n from public.messages where thread_id = 'd1111111-1111-1111-1111-111111111111';
  insert into public.rls_results (phase, name, ok, detail) values (p_phase, p_name, case when p_expect = 0 then n = 0 else n >= 1 end, n::text)
  on conflict (phase, name) do update set ok = excluded.ok, detail = excluded.detail;
end $$;

-- Buyer Agent
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
set role authenticated;
select public.rls_try(:'phase', 'buyer agent everyone', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-ba-all.pdf', 'all', '55555555-5555-5555-5555-555555555555')$$, :'agent_all');
select public.rls_try(:'phase', 'buyer agent own side', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-ba-buyer.pdf', 'buyer', '55555555-5555-5555-5555-555555555555')$$, 'allowed');
select public.rls_try(:'phase', 'buyer agent staff', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-ba-staff.pdf', 'staff', '55555555-5555-5555-5555-555555555555')$$, 'allowed');
select public.rls_try(:'phase', 'buyer agent other side', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-ba-seller.pdf', 'seller', '55555555-5555-5555-5555-555555555555')$$, 'new row violates row-level security policy for table "documents"');
select public.rls_try(:'phase', 'buyer agent other file', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'probe-ba-other.pdf', 'all', '55555555-5555-5555-5555-555555555555')$$, 'new row violates row-level security policy for table "documents"');
select public.rls_try(:'phase', 'buyer agent bad type', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-ba.exe', 'all', '55555555-5555-5555-5555-555555555555')$$, 'new row violates row-level security policy for table "documents"');
select public.rls_try(:'phase', 'buyer agent wire staff', $$insert into public.documents (deal_id, name, visibility, uploaded_by, wire_instructions) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-ba-wire.pdf', 'staff', '55555555-5555-5555-5555-555555555555', true)$$, 'new row violates row-level security policy for table "documents"');
select public.rls_try(:'phase', 'buyer agent staff folder', $$insert into public.documents (deal_id, name, visibility, uploaded_by, folder_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-ba-folder.pdf', 'all', '55555555-5555-5555-5555-555555555555', 'f0000000-0000-0000-0000-000000000002')$$, 'new row violates row-level security policy for table "documents"');
select public.rls_count(:'phase', 'buyer agent sees own everyone file', 'shared-everyone.pdf', 1);
select public.rls_msgs(:'phase', 'buyer agent reads portal message', 1);
select public.rls_try(:'phase', 'buyer agent sends portal message', $$insert into public.messages (thread_id, author_id, body) values ('d1111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 'Reply from the buyer agent.')$$, 'allowed');
reset role;

-- Listing Agent
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
set role authenticated;
select public.rls_try(:'phase', 'listing agent everyone', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-la-all.pdf', 'all', '44444444-4444-4444-4444-444444444444')$$, :'agent_all');
select public.rls_try(:'phase', 'listing agent own side', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-la-seller.pdf', 'seller', '44444444-4444-4444-4444-444444444444')$$, 'allowed');
select public.rls_try(:'phase', 'listing agent staff', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-la-staff.pdf', 'staff', '44444444-4444-4444-4444-444444444444')$$, 'allowed');
select public.rls_try(:'phase', 'listing agent other side', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-la-buyer.pdf', 'buyer', '44444444-4444-4444-4444-444444444444')$$, 'new row violates row-level security policy for table "documents"');
select public.rls_count(:'phase', 'listing agent sees everyone file', 'shared-everyone.pdf', 1);
select public.rls_msgs(:'phase', 'listing agent cannot read buyer message', 0);
select public.rls_try(:'phase', 'listing agent cannot send on buyer thread', $$insert into public.messages (thread_id, author_id, body) values ('d1111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'I should not be here.')$$, 'new row violates row-level security policy for table "messages"');
reset role;

-- Client-Buyer
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
set role authenticated;
select public.rls_try(:'phase', 'client buyer own side', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-cb-buyer.pdf', 'buyer', '33333333-3333-3333-3333-333333333333')$$, 'allowed');
select public.rls_try(:'phase', 'client buyer everyone', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-cb-all.pdf', 'all', '33333333-3333-3333-3333-333333333333')$$, 'new row violates row-level security policy for table "documents"');
select public.rls_try(:'phase', 'client buyer staff', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-cb-staff.pdf', 'staff', '33333333-3333-3333-3333-333333333333')$$, 'new row violates row-level security policy for table "documents"');
select public.rls_count(:'phase', 'client buyer does not see agent everyone file', 'shared-everyone.pdf', 0);
select public.rls_msgs(:'phase', 'client buyer reads portal message', 1);
select public.rls_try(:'phase', 'client buyer sends portal message', $$insert into public.messages (thread_id, author_id, body) values ('d1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Reply from the buyer.')$$, 'allowed');
reset role;

-- Client-Seller
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
set role authenticated;
select public.rls_try(:'phase', 'client seller own side', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-cs-seller.pdf', 'seller', '66666666-6666-6666-6666-666666666666')$$, 'allowed');
select public.rls_try(:'phase', 'client seller everyone', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-cs-all.pdf', 'all', '66666666-6666-6666-6666-666666666666')$$, 'new row violates row-level security policy for table "documents"');
select public.rls_try(:'phase', 'client seller staff', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-cs-staff.pdf', 'staff', '66666666-6666-6666-6666-666666666666')$$, 'new row violates row-level security policy for table "documents"');
select public.rls_count(:'phase', 'client seller does not see agent everyone file', 'shared-everyone.pdf', 0);
select public.rls_msgs(:'phase', 'client seller cannot read buyer message', 0);
reset role;

-- Transaction Coordinator and Processor (staff)
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', false);
set role authenticated;
select public.rls_try(:'phase', 'tc everyone', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-tc-all.pdf', 'all', '77777777-7777-7777-7777-777777777777')$$, 'allowed');
select public.rls_try(:'phase', 'tc staff', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-tc-staff.pdf', 'staff', '77777777-7777-7777-7777-777777777777')$$, 'allowed');
select public.rls_try(:'phase', 'tc buyer side', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-tc-buyer.pdf', 'buyer', '77777777-7777-7777-7777-777777777777')$$, 'allowed');
select public.rls_count(:'phase', 'tc sees agent everyone file', 'shared-everyone.pdf', 1);
select public.rls_msgs(:'phase', 'tc reads portal message', 1);
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
set role authenticated;
select public.rls_try(:'phase', 'processor everyone', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-pr-all.pdf', 'all', '11111111-1111-1111-1111-111111111111')$$, 'allowed');
select public.rls_count(:'phase', 'processor sees agent everyone file', 'shared-everyone.pdf', 1);
select public.rls_msgs(:'phase', 'processor reads portal message', 1);
reset role;

select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false);
set role authenticated;
select public.rls_try(:'phase', 'disabled agent everyone', $$insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'probe-off.pdf', 'all', '99999999-9999-9999-9999-999999999999')$$, 'new row violates row-level security policy for table "documents"');
reset role;
