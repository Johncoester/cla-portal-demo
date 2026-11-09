-- After the rollback: tables and new functions gone, every touched function body is the Nov 9 TEST body (md5).
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c is not true then raise exception 'FAIL: %', msg; end if; end $$;
select pg_temp.ok(to_regclass('public.role_module_access') is null and to_regclass('public.role_module_access_log') is null, 'tables dropped');
select pg_temp.ok(to_regprocedure('private.role_can(text)') is null and to_regprocedure('private.crm_module_user()') is null and to_regprocedure('public.set_role_access(text,text,boolean)') is null and to_regprocedure('private.rpc_set_role_access(text,text,boolean)') is null, 'functions dropped');
select pg_temp.ok(md5(prosrc) = h, 'md5 ' || k) from (values
  ('private.crm_need(boolean)', 'ab3fa9bbcf8ce29cefd733083b3a04eb'), ('private.rpc_crm_deal_filters()', '140b376d7bbbdb223764090645bc8e53'),
  ('private.rpc_crm_deals(text,text,uuid,text)', '557eddad55a634d0d2f1d61c817f2337'), ('private.rpc_crm_list_export(text,integer)', '2d60b9008eedf826c82e7271b7c5ca44'),
  ('public.crm_deal_filters()', 'ddc6f858448455510e2ab0906719cce7'), ('public.crm_deals(text,text,uuid,text)', '4914d497c21f30d8a65eced8b9034d7a'),
  ('private.crm_all()', '5062c4326d61ec3539df8e580f1c35b4'), ('private.crm_read_all()', '5062c4326d61ec3539df8e580f1c35b4'), ('private.crm_editor()', '19d3508b097d1d1a600d41522bb6960c'),
  ('private.crm_deal_scope_all()', 'b58c738cd4ab6c030bcfef6927bd4300'), ('private.acct_reader(uuid)', '5f5ed67de41251c5576147908b07abff'), ('private.acct_editor(uuid)', 'd7af7375e60e791c1a200e4d07c7ca47')) v(k, h)
  join pg_proc p on p.oid = k::regprocedure;
-- (the checks saved one fake Processor signature, so only that count differs)
select pg_temp.ok(not exists (select 1 from public.ra_snap b join public.ra_snap r on r.uid = b.uid and r.phase = 'rolled' where b.phase = 'before' and (r.data - 'sig_read') is distinct from (b.data - 'sig_read')), 'after rollback every person is back to before');
select pg_temp.ok((select count(*) from public.ra_snap r join public.profiles p on p.id = r.uid where r.phase = 'rolled' and r.data ->> 'sig_read' = '1' and p.role = 'Processor') = 1, 'the Processor signature saved while CRM was off is still readable after rollback');
