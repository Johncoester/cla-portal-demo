-- Rollback of 20261109140000_agent_document_staff_insert.sql: removes only that one insert policy.
begin;
set local lock_timeout = '3s';
do $$
begin
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'documents') <> 5 then raise exception 'drift: expected 5 documents policies'; end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_assigned_agent_insert') then raise exception 'drift: policy not present'; end if;
end $$;
drop policy documents_assigned_agent_insert on public.documents;
do $$
begin
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'documents') <> 4 then raise exception 'readback: expected 4 documents policies'; end if;
  if (select md5(coalesce(with_check, '')) from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_insert') <> '37e27c9b0e4d0be52ff1f2a6153ce957' then raise exception 'readback: documents_insert changed'; end if;
end $$;
commit;
