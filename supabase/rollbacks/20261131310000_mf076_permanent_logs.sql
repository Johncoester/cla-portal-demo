-- Undo MF-076: removes the permanent-log triggers, the message and document-view logging, and puts
-- back the wire_audit_log staff UPDATE policy and the grants as they were on TEST before
-- 20261131310000_mf076_permanent_logs.sql. Rows already logged stay (nothing is deleted).
begin;
set local lock_timeout = '3s';

drop trigger if exists zz_log_permanent on public.activity_log;
drop trigger if exists zz_log_no_truncate on public.activity_log;
drop trigger if exists zz_log_permanent on public.wire_audit_log;
drop trigger if exists zz_log_no_truncate on public.wire_audit_log;
drop function if exists private.log_rows_are_permanent();

drop trigger if exists messages_activity on public.messages;
drop function if exists private.trg_message_log();
drop function if exists public.log_document_view(uuid);
drop index if exists public.idx_activity_doc_viewed;

grant update, delete, truncate on public.activity_log to service_role;
grant update on public.wire_audit_log to authenticated;
grant update, delete, truncate on public.wire_audit_log to service_role;
drop policy if exists wire_update on public.wire_audit_log;
create policy wire_update on public.wire_audit_log for update to authenticated
  using (private.fwp_staff('wires'::text, deal_id))
  with check (private.fwp_staff('wires'::text, deal_id));

commit;

notify pgrst, 'reload schema';
