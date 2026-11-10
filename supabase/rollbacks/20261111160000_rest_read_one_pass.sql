-- Restore the helper-chain bodies and the captured policies.
begin;
set local lock_timeout = '3s';

do $pre$
begin
  if to_regprocedure('private.task_readable(uuid)') is null then
    raise exception 'drift: private.task_readable(uuid) is missing';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'thread_member'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'ba73f7e5dde123d6c3af688ca3330f795488671f366a9bfbd8112a4a068bc81e'
  ) then
    raise exception 'drift: private.thread_member(uuid) is not the one-pass body';
  end if;
end
$pre$;

alter policy tasks_select on public.tasks
using (((( SELECT ((private.me_role() IS NOT NULL) AND (private.is_admin() OR (private.me_role() = ANY (ARRAY['Processor'::text, 'Sales Team'::text, 'Transaction Coordinator'::text]))))) OR private.can_access_deal(deal_id)) AND (( SELECT private.is_staffish() AS is_staffish) OR private.task_visible(owner_profile_id, assigned_role, deal_id)) AND (NOT ((assigned_role = 'Client-Buyer'::text) AND private.emd_receipt_title(title) AND private.is_pure_buyer(deal_id)))));

alter policy demo_scope on public.tasks
using (
CASE
    WHEN (deal_id IS NULL) THEN (NOT ( SELECT private.viewer_is_demo() AS viewer_is_demo))
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = tasks.deal_id)) = ( SELECT private.viewer_is_demo() AS viewer_is_demo))
END)
with check (
CASE
    WHEN (deal_id IS NULL) THEN (NOT ( SELECT private.viewer_is_demo() AS viewer_is_demo))
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = tasks.deal_id)) = ( SELECT private.viewer_is_demo() AS viewer_is_demo))
END);

alter policy tasks_audience_limit on public.tasks
using (((audiences IS NULL) OR private.is_staffish() OR private.task_outside_audience(id)));

alter policy tasks_retired_kept on public.tasks
using (((template_code IS NULL) OR (NOT private.template_code_retired(template_code)) OR private.is_admin() OR private.is_processor() OR ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'blocked'::text])) AND (owner_profile_id = ( SELECT private.effective_uid() AS uid)))));

alter policy tasks_switch_hidden on public.tasks
using (((template_code IS NULL) OR private.task_enabled(template_code) OR private.is_admin()));

alter policy templates_select on public.task_templates
using ((private.is_admin() OR private.is_manager() OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.template_id = task_templates.id) AND private.can_access_deal(t.deal_id))))));

alter policy demo_scope on public.threads
using (
CASE
    WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo())
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = threads.deal_id)) = private.viewer_is_demo())
END)
with check (
CASE
    WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo())
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = threads.deal_id)) = private.viewer_is_demo())
END);

alter policy demo_scope on public.documents
using (
CASE
    WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo())
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = documents.deal_id)) = private.viewer_is_demo())
END)
with check (
CASE
    WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo())
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = documents.deal_id)) = private.viewer_is_demo())
END);

alter policy demo_scope on public.activity_log
using (
CASE
    WHEN (deal_id IS NULL) THEN (NOT ( SELECT g.is_demo
       FROM private.reader_gate() g(uid, role, active, is_admin, staffish, is_processor, is_demo, contact_id)))
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = activity_log.deal_id)) = ( SELECT g.is_demo
       FROM private.reader_gate() g(uid, role, active, is_admin, staffish, is_processor, is_demo, contact_id)))
END)
with check (
CASE
    WHEN (deal_id IS NULL) THEN (NOT ( SELECT g.is_demo
       FROM private.reader_gate() g(uid, role, active, is_admin, staffish, is_processor, is_demo, contact_id)))
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = activity_log.deal_id)) = ( SELECT g.is_demo
       FROM private.reader_gate() g(uid, role, active, is_admin, staffish, is_processor, is_demo, contact_id)))
END);

alter policy notifications_select on public.notifications
using ((profile_id = private.effective_uid()));

alter policy demo_scope on public.notifications
using (
CASE
    WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo())
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = notifications.deal_id)) = private.viewer_is_demo())
END)
with check (
CASE
    WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo())
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = notifications.deal_id)) = private.viewer_is_demo())
END);

create or replace function private.thread_member(t uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $fn$
  select exists (select 1 from public.threads x where x.id = t and private.can_access_deal(x.deal_id)
                 and (private.is_processor() or private.is_admin() or private.is_manager()
                      or exists (select 1 from public.thread_participants tp where tp.thread_id = t and tp.profile_id = private.effective_uid()))) $fn$;

create or replace function private.task_outside_audience(p_task uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $fn$
  select exists (select 1 from public.tasks t where t.id = p_task and t.audiences is not null and (
    ('Client-Buyer' = any (private.deal_roles(t.deal_id)) and 'buyer' = any (t.audiences) and (t.owner_profile_id = (select private.effective_uid()) or (t.owner_profile_id is null and t.assigned_role = 'Client-Buyer')) and not (t.audiences = array['internal']::text[]))
    or ('Client-Seller' = any (private.deal_roles(t.deal_id)) and 'seller' = any (t.audiences) and (t.owner_profile_id = (select private.effective_uid()) or (t.owner_profile_id is null and t.assigned_role = 'Client-Seller')) and not (t.audiences = array['internal']::text[]))
    or ('Buyer Agent' = any (private.deal_roles(t.deal_id)) and 'buyer_agent' = any (t.audiences))
    or ('Listing Agent' = any (private.deal_roles(t.deal_id)) and 'listing_agent' = any (t.audiences)))) $fn$;

create or replace function private.rpc_agent_parties()
returns table (deal_id uuid, contact_id uuid, name text, label text)
language sql stable security definer set search_path to pg_catalog, public, extensions as $fn$
  select a.deal_id, a.contact_id, trim(c.first_name || ' ' || c.last_name),
         case when a.role = 'Client-Buyer' then 'Buyer + Buyer''s Agent' else 'Seller + Listing Agent' end
  from public.deal_participants a join public.deal_participants b on b.deal_id = a.deal_id and b.contact_id = a.contact_id and private.self_rep_pair(a.role, b.role)
  join public.contacts c on c.id = a.contact_id
  where a.role in ('Client-Buyer', 'Client-Seller') and private.is_staffish() and private.can_access_deal(a.deal_id) $fn$;

alter function private.document_readable(uuid) reset jit;

drop function if exists private.task_readable(uuid);
drop function if exists private.deal_is_demo(uuid);
drop index if exists public.tasks_template_id_idx;
drop index if exists public.profiles_lower_email_idx;

do $post$
begin
  if to_regprocedure('private.task_readable(uuid)') is not null then
    raise exception 'rollback left private.task_readable(uuid)';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'thread_member'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'a8da8cea27ae8b50daa9bfe6c04dcaa44bf29f6eb6244f708367d28921d77467'
  ) then
    raise exception 'rollback did not restore private.thread_member(uuid)';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'document_readable'
      and not ('jit=off' = any (coalesce(p.proconfig, array[]::text[])))
  ) then
    raise exception 'rollback left jit off on document_readable';
  end if;
end
$post$;

commit;
