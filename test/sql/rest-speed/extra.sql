-- Extra catalog on top of the document-readable fixture and its one-pass migration.
-- Throwaway only.
alter table public.profiles add column if not exists is_demo boolean not null default false;
alter table public.profiles add column if not exists email text not null default '';
alter table public.profiles add column if not exists first_name text not null default '';
alter table public.profiles add column if not exists last_name text not null default '';
alter table public.deals add column if not exists is_demo boolean not null default false;
alter table public.contacts add column if not exists first_name text not null default '';
alter table public.contacts add column if not exists last_name text not null default '';
alter table public.contacts add column if not exists email text not null default '';

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid,
  owner_profile_id uuid,
  assigned_role text,
  title text,
  audiences text[],
  template_code text,
  template_id uuid,
  status text,
  due_date date
);
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  code text,
  version integer,
  active boolean not null default true,
  retired_at timestamptz
);
create table public.task_template_switches (
  code text primary key,
  enabled boolean not null
);
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid
);
create table public.thread_participants (
  thread_id uuid not null,
  profile_id uuid not null,
  primary key (thread_id, profile_id)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  deal_id uuid
);
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid,
  entity text,
  entity_id uuid
);

create or replace function private.is_processor() returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor'), false) or private.is_admin()
$$;
create or replace function private.is_manager() returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Preprocessor', 'Transaction Coordinator'), false) or private.is_admin()
$$;
create or replace function private.viewer_is_demo() returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select coalesce((select p.is_demo from public.profiles p where p.id = private.effective_uid() and p.status = 'active'), false)
$$;
create or replace function private.emd_receipt_title(t text) returns boolean
language sql immutable set search_path to pg_catalog, public, extensions as $$
  select coalesce(t, '') ~* 'earnest money deposit receipt'
$$;
create or replace function private.self_rep_pair(a text, b text) returns boolean
language sql immutable set search_path to pg_catalog, public, extensions as $$
  select (a = 'Client-Buyer' and b = 'Buyer Agent') or (a = 'Buyer Agent' and b = 'Client-Buyer')
      or (a = 'Client-Seller' and b = 'Listing Agent') or (a = 'Listing Agent' and b = 'Client-Seller')
$$;
create or replace function private.task_visible(owner uuid, assigned text, d uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select private.is_staffish() or owner = private.effective_uid()
      or (owner is null and assigned = any (private.deal_roles(d)))
      or (private.deal_role(d) in ('Buyer Agent', 'Listing Agent') and private.side_of(assigned) = private.side_of(private.deal_role(d)))
$$;
create or replace function private.task_enabled(p_code text) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select coalesce((select enabled from public.task_template_switches where code = p_code), true)
$$;
create or replace function private.template_code_retired(p_code text) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select exists (select 1 from public.task_templates t where t.code = p_code and t.retired_at is not null
    and t.version = (select max(version) from public.task_templates where code = p_code))
$$;
create or replace function private.task_outside_audience(p_task uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $fn$
  select exists (select 1 from public.tasks t where t.id = p_task and t.audiences is not null and (
    ('Client-Buyer' = any (private.deal_roles(t.deal_id)) and 'buyer' = any (t.audiences) and (t.owner_profile_id = (select private.effective_uid()) or (t.owner_profile_id is null and t.assigned_role = 'Client-Buyer')) and not (t.audiences = array['internal']::text[]))
    or ('Client-Seller' = any (private.deal_roles(t.deal_id)) and 'seller' = any (t.audiences) and (t.owner_profile_id = (select private.effective_uid()) or (t.owner_profile_id is null and t.assigned_role = 'Client-Seller')) and not (t.audiences = array['internal']::text[]))
    or ('Buyer Agent' = any (private.deal_roles(t.deal_id)) and 'buyer_agent' = any (t.audiences))
    or ('Listing Agent' = any (private.deal_roles(t.deal_id)) and 'listing_agent' = any (t.audiences)))) $fn$;

create or replace function private.thread_member(t uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $fn$
  select exists (select 1 from public.threads x where x.id = t and private.can_access_deal(x.deal_id)
                 and (private.is_processor() or private.is_admin() or private.is_manager()
                      or exists (select 1 from public.thread_participants tp where tp.thread_id = t and tp.profile_id = private.effective_uid()))) $fn$;

create or replace function private.rpc_agent_parties()
returns table (deal_id uuid, contact_id uuid, name text, label text)
language sql stable security definer set search_path to pg_catalog, public, extensions as $fn$
  select a.deal_id, a.contact_id, trim(c.first_name || ' ' || c.last_name),
         case when a.role = 'Client-Buyer' then 'Buyer + Buyer''s Agent' else 'Seller + Listing Agent' end
  from public.deal_participants a join public.deal_participants b on b.deal_id = a.deal_id and b.contact_id = a.contact_id and private.self_rep_pair(a.role, b.role)
  join public.contacts c on c.id = a.contact_id
  where a.role in ('Client-Buyer', 'Client-Seller') and private.is_staffish() and private.can_access_deal(a.deal_id) $fn$;

create or replace function public.agent_parties()
returns table (deal_id uuid, contact_id uuid, name text, label text)
language plpgsql stable security invoker set search_path to pg_catalog, public, extensions as $fn$ BEGIN RETURN QUERY SELECT * FROM private.rpc_agent_parties(); END; $fn$;

create or replace function private.reader_gate()
returns table (uid uuid, role text, active boolean, is_admin boolean, staffish boolean, is_processor boolean, is_demo boolean, contact_id uuid)
language sql stable security definer rows 1
set search_path to pg_catalog, public, extensions
set jit = off
as $gate$
  select v.uid,
         case when p.status = 'active' then p.role else null end,
         coalesce(p.status = 'active' and p.role is not null, false),
         coalesce(p.status = 'active' and p.is_admin, false),
         coalesce(p.status = 'active' and (p.is_admin or p.role in (
           'Processor', 'Preprocessor', 'Sales Person', 'Sales Team',
           'Transaction Coordinator', 'Admin', 'Super admin')), false),
         coalesce(p.status = 'active' and (p.is_admin or p.role in ('Processor', 'Preprocessor')), false),
         coalesce(p.status = 'active' and p.is_demo, false),
         c.id
  from (
    select coalesce(
      (select s.target_id
         from private.view_as_sessions s
         join public.profiles a on a.id = s.actor_id
        where s.actor_id = auth.uid()
          and a.role = 'Super admin' and a.is_admin and a.status = 'active'
          and s.stopped_at is null
          and s.expires_at > pg_catalog.now()),
      auth.uid()
    ) as uid
  ) v
  left join public.profiles p on p.id = v.uid
  left join public.contacts c on c.profile_id = v.uid
$gate$;

create or replace function private.reader_can_deal(p_deal uuid, p_uid uuid, p_role text, p_admin boolean, p_contact uuid, p_active boolean)
returns boolean
language sql stable security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $can$
  select coalesce(p_active, false) and (
    coalesce(p_admin, false)
    or coalesce(p_role in ('Processor', 'Sales Team', 'Transaction Coordinator'), false)
    or (p_role = 'Preprocessor' and exists (
          select 1 from public.deals x where x.id = p_deal and x.preprocessor_user_id = p_uid))
    or (p_role in ('Sales Person', 'Sales Team') and exists (
          select 1 from public.deal_sales_people s where s.deal_id = p_deal and s.sales_id = p_uid))
    or exists (
          select 1 from public.deal_participants p
          where p.deal_id = p_deal and p.contact_id = p_contact)
  )
$can$;

revoke all on function public.agent_parties() from public;
revoke all on function private.rpc_agent_parties() from public;
revoke all on function private.thread_member(uuid) from public;
revoke all on function private.task_outside_audience(uuid) from public;
revoke all on function private.reader_gate() from public;
revoke all on function private.reader_can_deal(uuid, uuid, text, boolean, uuid, boolean) from public;
grant execute on function public.agent_parties() to authenticated;
grant execute on function private.rpc_agent_parties() to authenticated;
grant execute on function private.thread_member(uuid) to authenticated;
grant execute on function private.task_outside_audience(uuid) to authenticated;
grant execute on function private.task_visible(uuid, text, uuid) to authenticated;
grant execute on function private.task_enabled(text) to authenticated;
grant execute on function private.template_code_retired(text) to authenticated;
grant execute on function private.is_processor() to authenticated;
grant execute on function private.is_manager() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_staffish() to authenticated;
grant execute on function private.viewer_is_demo() to authenticated;
grant execute on function private.emd_receipt_title(text) to authenticated;
grant execute on function private.is_pure_buyer(uuid) to authenticated;
grant execute on function private.can_access_deal(uuid) to authenticated;
grant execute on function private.effective_uid() to authenticated;
grant execute on function private.me_role() to authenticated;
grant execute on function private.reader_gate() to authenticated;
grant execute on function private.reader_can_deal(uuid, uuid, text, boolean, uuid, boolean) to authenticated;

grant select on public.tasks, public.task_templates, public.task_template_switches, public.threads, public.thread_participants, public.notifications, public.activity_log to authenticated;
grant select on public.deals, public.profiles, public.contacts, public.deal_participants, public.deal_sales_people to authenticated;
-- The task and thread demo policies read deals as the invoker. The document
-- fixture locks deals with no select policy, which made that lookup return
-- null and hid every row. A visible deal is what TEST does for a viewer who
-- already passed can_access_deal.
create policy fixture_deals_read on public.deals for select to authenticated using (private.can_access_deal(id));

alter table public.tasks enable row level security;
alter table public.task_templates enable row level security;
alter table public.threads enable row level security;
alter table public.thread_participants enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_log enable row level security;

drop policy demo_scope on public.documents;
create policy demo_scope on public.documents as restrictive for all to authenticated
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

create policy activity_select on public.activity_log for select to authenticated
using ((( SELECT (g.active AND g.staffish)
   FROM private.reader_gate() g(uid, role, active, is_admin, staffish, is_processor, is_demo, contact_id)) AND (( SELECT g.is_admin
   FROM private.reader_gate() g(uid, role, active, is_admin, staffish, is_processor, is_demo, contact_id)) OR ((((deal_id IS NULL) AND ( SELECT g.is_processor
   FROM private.reader_gate() g(uid, role, active, is_admin, staffish, is_processor, is_demo, contact_id))) OR ((deal_id IS NOT NULL) AND private.reader_can_deal(deal_id, ( SELECT g.uid
   FROM private.reader_gate() g(uid, role, active, is_admin, staffish, is_processor, is_demo, contact_id)), ( SELECT g.role
   FROM private.reader_gate() g(uid, role, active, is_admin, staffish, is_processor, is_demo, contact_id)), ( SELECT g.is_admin
   FROM private.reader_gate() g(uid, role, active, is_admin, staffish, is_processor, is_demo, contact_id)), ( SELECT g.contact_id
   FROM private.reader_gate() g(uid, role, active, is_admin, staffish, is_processor, is_demo, contact_id)), ( SELECT g.active
   FROM private.reader_gate() g(uid, role, active, is_admin, staffish, is_processor, is_demo, contact_id))))) AND (( SELECT g.is_processor
   FROM private.reader_gate() g(uid, role, active, is_admin, staffish, is_processor, is_demo, contact_id)) OR (entity IS NULL) OR (entity_id IS NULL) OR ((entity = 'document'::text) AND private.document_readable(entity_id)) OR ((entity = 'thread'::text) AND private.thread_member(entity_id)) OR (entity <> ALL (ARRAY['document'::text, 'thread'::text])))))));
create policy demo_scope on public.activity_log as restrictive for all to authenticated
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

create policy tasks_select on public.tasks for select to authenticated
using (((( SELECT ((private.me_role() IS NOT NULL) AND (private.is_admin() OR (private.me_role() = ANY (ARRAY['Processor'::text, 'Sales Team'::text, 'Transaction Coordinator'::text]))))) OR private.can_access_deal(deal_id)) AND (( SELECT private.is_staffish() AS is_staffish) OR private.task_visible(owner_profile_id, assigned_role, deal_id)) AND (NOT ((assigned_role = 'Client-Buyer'::text) AND private.emd_receipt_title(title) AND private.is_pure_buyer(deal_id)))));
create policy demo_scope on public.tasks as restrictive for all to authenticated
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
create policy tasks_audience_limit on public.tasks as restrictive for select to authenticated
using ((audiences IS NULL) OR private.is_staffish() OR private.task_outside_audience(id));
create policy tasks_retired_kept on public.tasks as restrictive for select to authenticated
using ((template_code IS NULL) OR (NOT private.template_code_retired(template_code)) OR private.is_admin() OR private.is_processor() OR ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'blocked'::text])) AND (owner_profile_id = ( SELECT private.effective_uid() AS uid))));
create policy tasks_switch_hidden on public.tasks as restrictive for select to authenticated
using ((template_code IS NULL) OR private.task_enabled(template_code) OR private.is_admin());

create policy templates_select on public.task_templates for select to authenticated
using ((private.is_admin() OR private.is_manager() OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.template_id = task_templates.id) AND private.can_access_deal(t.deal_id))))));

create policy threads_select on public.threads for select to authenticated
using (private.thread_member(id));
create policy demo_scope on public.threads as restrictive for all to authenticated
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
create policy tp_select on public.thread_participants for select to authenticated
using (private.thread_member(thread_id));

create policy notifications_select on public.notifications for select to authenticated
using ((profile_id = private.effective_uid()));
create policy demo_scope on public.notifications as restrictive for all to authenticated
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

update public.contacts set first_name = 'Pat', last_name = 'Client' where first_name = '';

insert into public.task_template_switches (code, enabled) values ('off', false), ('on', true);
insert into public.task_templates (id, code, version, active, retired_at)
select format('71000000-0000-4000-8000-%s', lpad(to_hex(i), 12, '0'))::uuid,
       case when i = 2 then 'retired' when i = 3 then 'off' else 'live' || i end,
       1, true,
       case when i = 2 then now() else null end
from generate_series(1, 12) i;

insert into public.tasks (deal_id, owner_profile_id, assigned_role, title, audiences, template_code, template_id, status, due_date)
select 'a0e00000-0000-4000-8000-00000000000a',
       case when i % 7 = 0 then 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid else null end,
       case when i % 5 = 0 then 'Client-Buyer' when i % 5 = 1 then 'Buyer Agent' else 'Processor' end,
       case when i % 11 = 0 then 'Earnest money deposit receipt' else 'Task ' || i end,
       case when i % 9 = 0 then array['internal'] when i % 9 = 1 then array['buyer'] else null end,
       case when i % 8 = 0 then 'off' when i % 8 = 1 then 'retired' else null end,
       format('71000000-0000-4000-8000-%s', lpad(to_hex(1 + (i % 12)), 12, '0'))::uuid,
       case when i % 6 = 0 then 'done' else 'todo' end,
       current_date - 1
from generate_series(1, 80) i;

insert into public.threads (id, deal_id)
select format('72000000-0000-4000-8000-%s', lpad(to_hex(i), 12, '0'))::uuid,
       'a0e00000-0000-4000-8000-00000000000a'
from generate_series(1, 30) i;
insert into public.thread_participants (thread_id, profile_id)
select format('72000000-0000-4000-8000-%s', lpad(to_hex(i), 12, '0'))::uuid,
       '33333333-3333-4333-8333-333333333333'
from generate_series(1, 30) i
where i % 2 = 0;

insert into public.notifications (profile_id, deal_id)
select '11111111-1111-4111-8111-111111111111',
       case when i % 4 = 0 then null else 'a0e00000-0000-4000-8000-00000000000a'::uuid end
from generate_series(1, 40) i;
insert into public.notifications (profile_id, deal_id)
select 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'a0e00000-0000-4000-8000-00000000000a'
from generate_series(1, 10) i;

insert into public.deals (id, is_demo) values ('a0e00000-0000-4000-8000-00000000000c', true);
insert into public.profiles (id, role, status, is_admin, is_demo) values
  ('13131313-1313-4131-8131-131313131313', 'Processor', 'active', false, true);
insert into public.viewer_case (id, label) values
  ('13131313-1313-4131-8131-131313131313', 'demo processor');
insert into public.tasks (deal_id, assigned_role, title, status) values
  ('a0e00000-0000-4000-8000-00000000000c', 'Processor', 'Demo only', 'todo');
insert into public.threads (id, deal_id) values
  ('72000000-0000-4000-8000-0000000000ff', 'a0e00000-0000-4000-8000-00000000000c');

insert into public.documents (deal_id, name, visibility, uploaded_by) values
  ('a0e00000-0000-4000-8000-00000000000c', 'demo-only.pdf', 'all', '13131313-1313-4131-8131-131313131313');

insert into public.activity_log (deal_id, entity, entity_id)
select d.deal_id, 'document', d.id
from public.documents d
where d.deal_id = 'a0e00000-0000-4000-8000-00000000000a'
order by d.id
limit 40;
insert into public.activity_log (deal_id, entity, entity_id)
select t.deal_id, 'thread', t.id
from public.threads t
where t.deal_id = 'a0e00000-0000-4000-8000-00000000000a'
order by t.id
limit 15;
insert into public.activity_log (deal_id, entity, entity_id) values
  ('a0e00000-0000-4000-8000-00000000000c', 'task', null),
  (null, null, null);
