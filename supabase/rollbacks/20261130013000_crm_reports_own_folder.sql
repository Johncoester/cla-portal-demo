-- Rollback for 20261130013000_crm_reports_own_folder.sql: reports can again be saved and
-- changed only by Admin, Sales Person and Sales Team. Reports a Processor already saved in
-- their own folder stay (nothing is deleted); they become read-only to that Processor.
begin;
set local lock_timeout = '3s';
do $$
declare ins text; me text;
begin
  select with_check into ins from pg_policies where schemaname = 'public' and tablename = 'crm_reports' and policyname = 'crm_reports_insert';
  me := case when position('effective_uid()' in coalesce(ins, '')) > 0 then 'private.effective_uid()' else 'auth.uid()' end;
  execute 'drop policy if exists crm_reports_insert on public.crm_reports';
  execute format('create policy crm_reports_insert on public.crm_reports for insert to authenticated with check (private.crm_editor() and created_by = %s)', me);
  execute 'drop policy if exists crm_reports_update on public.crm_reports';
  execute 'create policy crm_reports_update on public.crm_reports for update to authenticated using (private.crm_report_editable(id)) with check (private.crm_editor())';
end $$;
create or replace function private.crm_report_editable(p_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
  select private.crm_editor() and exists (select 1 from public.crm_reports r where r.id = p_id and (r.created_by = private.effective_uid() or r.personal_owner = private.effective_uid()
    or (private.is_admin() and r.personal_owner is null))) $function$;
commit;
