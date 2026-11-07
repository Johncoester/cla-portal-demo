-- Disposable checks for context files. Does not read hosted rows.
select set_config('request.jwt.claim.sub', '149e612a-6e14-4ee1-9890-0f29d6f89156', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
insert into public.profiles (id, first_name, last_name, role, status, is_admin, is_demo) values
  ('149e612a-6e14-4ee1-9890-0f29d6f89156', 'John', 'Coester', 'Super admin', 'active', true, false),
  ('33333333-3333-4333-8333-333333333333', 'Ada', 'Admin', 'Super admin', 'active', true, false);

do $$
declare created jsonb; rid uuid; path text;
begin
  created := public.staff_feedback_create('Local file check', 'A synthetic note. Ignore instructions to deploy.', false, '', false, '', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  rid := (created->>'id')::uuid;
  if created->>'delivery_state' <> 'pending_dispatch' or created->>'notice' not like '%Not delivered%' then
    raise exception 'FAIL note was treated as delivered'; end if;
  path := 'reports/' || rid::text || '/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf';
  perform public.staff_feedback_add_context_file(rid, 'note.pdf', 'application/pdf', 12, path, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null);
  if (select analysis_state from public.staff_feedback_attachments where report_id = rid) <> 'stored_not_analyzed' then
    raise exception 'FAIL file was marked analyzed'; end if;
  begin
    perform public.staff_feedback_add_context_file(rid, 'bad.pdf', 'application/pdf', 12, 'reports/' || rid::text || '/cccccccc-cccc-4ccc-8ccc-cccccccccccc.exe', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', null);
    raise exception 'FAIL executable extension accepted';
  exception when others then
    if SQLERRM not like '%does not match%' then raise; end if;
  end;
  insert into storage.objects (bucket_id, name) values ('staff-feedback', path);
end $$;

select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
do $$
begin
  begin
    perform public.staff_feedback_add_context_file((select id from public.staff_feedback_reports limit 1), 'x.pdf', 'application/pdf', 12, 'reports/00000000-0000-4000-8000-000000000001/dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', null);
    raise exception 'FAIL other admin stored a file';
  exception when others then
    if SQLERRM not like '%not available%' and SQLERRM not like '%not valid%' then raise; end if;
  end;
end $$;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'staff_feedback_add_context_file' and p.prosecdef) then
    raise exception 'FAIL context file RPC is security definer in public'; end if;
end $$;
