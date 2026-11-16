-- Hand change on TEST between Nov 5 and Nov 11. Already on TEST. Do not apply this file to TEST again.
-- Not in TEST's migration history. Kept so a fresh database reaches the November 11 check.
-- private.trg_participant_copies body copied exactly from supabase/rollbacks/20261111030000_task_due_anchors.sql.
-- The body differs from the Nov 5 statement only in created_by: private.effective_uid() instead of auth.uid().
-- The create line also sets search_path to pg_catalog, public, extensions. The Nov 5 statement sets search_path to public. That is outside the body, so it does not change the checksum.
create or replace function private.trg_participant_copies() returns trigger
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare owner uuid; n int;
begin
  select profile_id into owner from public.contacts where id = new.contact_id;
  insert into public.tasks (deal_id, title, description, assigned_role, status, due_date, created_by, kind, participant_id, owner_profile_id, template_id, template_code, template_version, lane, audiences)
  select new.deal_id, t.title, t.description, new.role, 'todo', current_date + t.due_days, private.effective_uid(), 'form', new.id, owner, t.id, t.code, t.version, t.lane, t.audiences
  from public.task_templates t where t.active and t.retired_at is null and new.role = any (t.roles) and private.task_enabled(t.code)
    and (t.audiences is null or (not (t.audiences = array['internal']::text[]) and (
      (new.role = 'Client-Buyer' and 'buyer' = any (t.audiences)) or (new.role = 'Client-Seller' and 'seller' = any (t.audiences))
      or (new.role = 'Buyer Agent' and 'buyer_agent' = any (t.audiences)) or (new.role = 'Listing Agent' and 'listing_agent' = any (t.audiences))
      or (new.role in ('Sales Person', 'Sales Team') and 'sales_team' = any (t.audiences))
      or (new.role = 'Transaction Coordinator' and 'transaction_coordinator' = any (t.audiences)))))
    and not exists (select 1 from public.tasks x where x.participant_id = new.id and x.template_code = t.code and x.status <> 'cancelled');
  get diagnostics n = row_count;
  if n > 0 and owner is not null then perform private.notify(array[owner], 'task', new.deal_id, n || ' new task(s) on your order', '#/deals/' || new.deal_id || '/tasks'); end if;
  return new; end $function$;
