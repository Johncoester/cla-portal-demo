-- Throwaway catalog for task_board / my_task_list. Loaded on the document fixture.
alter table public.profiles add column if not exists is_demo boolean not null default false;
alter table public.contacts add column if not exists first_name text not null default '';
alter table public.contacts add column if not exists last_name text not null default '';
alter table public.contacts add column if not exists company text not null default '';
alter table public.contacts add column if not exists email text not null default '';
alter table public.contacts add column if not exists phone text not null default '';
alter table public.deals add column if not exists file_number text;
alter table public.deals add column if not exists street text not null default '';
alter table public.deals add column if not exists city text not null default '';
alter table public.deals add column if not exists state text not null default '';
alter table public.deals add column if not exists zip text not null default '';
alter table public.deals add column if not exists closing_date date;
alter table public.deals add column if not exists status text;
update public.deals set status = 'Open' where status is null;
update public.deals set file_number = 'A' where id = 'a0e00000-0000-4000-8000-00000000000a';
update public.deals set file_number = 'B' where id = 'a0e00000-0000-4000-8000-00000000000b';

update public.contacts set first_name = 'Ann', last_name = 'Agent' where id = 'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.contacts set first_name = 'Lee', last_name = 'Listing' where id = 'cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
update public.contacts set first_name = 'Pat', last_name = 'Buyer' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
update public.contacts set first_name = 'Sam', last_name = 'Seller' where id = 'cddddddd-dddd-4ddd-8ddd-dddddddddddd';
update public.contacts set first_name = 'Eve', last_name = 'Both' where id = 'ceeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

create or replace function private.office_today() returns date
language sql stable set search_path to pg_catalog, public, extensions as $$
  select (now() at time zone 'America/New_York')::date
$$;
create or replace function private.is_processor() returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor'), false) or private.is_admin()
$$;

create table if not exists public.task_template_switches (code text primary key, enabled boolean not null);
create table if not exists public.task_templates (
  code text, version integer, retired_at timestamptz
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid,
  owner_profile_id uuid,
  assigned_role text,
  title text,
  description text,
  audiences text[],
  template_code text,
  template_version integer,
  status text,
  due_date date,
  completed_at timestamptz,
  completed_by uuid,
  kind text,
  participant_id uuid,
  created_at timestamptz not null default now()
);

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
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select exists (select 1 from public.tasks t where t.id = p_task and t.audiences is not null and (
    ('Client-Buyer' = any (private.deal_roles(t.deal_id)) and 'buyer' = any (t.audiences) and (t.owner_profile_id = private.effective_uid() or (t.owner_profile_id is null and t.assigned_role = 'Client-Buyer')) and not (t.audiences = array['internal']::text[]))
    or ('Client-Seller' = any (private.deal_roles(t.deal_id)) and 'seller' = any (t.audiences) and (t.owner_profile_id = private.effective_uid() or (t.owner_profile_id is null and t.assigned_role = 'Client-Seller')) and not (t.audiences = array['internal']::text[]))
    or ('Buyer Agent' = any (private.deal_roles(t.deal_id)) and 'buyer_agent' = any (t.audiences))
    or ('Listing Agent' = any (private.deal_roles(t.deal_id)) and 'listing_agent' = any (t.audiences))))
$$;

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

create or replace function private.my_side(d uuid) returns text
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select case when private.is_staffish() then 'staff' else private.person_side(private.effective_uid(), d) end
$$;

create or replace function private.rpc_deal_contacts(p_deal uuid)
returns table (participant_id uuid, deal_id uuid, contact_id uuid, role text, profile_id uuid, first_name text, last_name text, company text, email text, phone text, contact_hidden boolean)
language sql stable security definer set search_path to pg_catalog, public, extensions as $fn$
  with deal as materialized (
    select private.can_access_deal(p_deal) as can_access,
           private.deal_role(p_deal) as deal_role,
           private.is_pure_buyer(p_deal) as pure_buyer,
           private.is_pure_seller(p_deal) as pure_seller,
           private.is_staffish() as staffish,
           private.my_contact_id() as my_contact,
           private.my_side(p_deal) as my_side
  )
  select dp.id, dp.deal_id, c.id, dp.role, c.profile_id, c.first_name, c.last_name, c.company,
    case when h then '' else c.email end, case when h then '' else c.phone end, h
  from deal
  join public.deal_participants dp on dp.deal_id = p_deal
  join public.contacts c on c.id = dp.contact_id
  cross join lateral (
    select not (
      deal.staffish
      or c.id = deal.my_contact
      or private.side_of(dp.role) is null
      or private.side_of(dp.role) = deal.my_side
    ) as h
  ) z
  where deal.can_access
    and not (deal.deal_role in ('Client-Buyer', 'Client-Seller') and dp.role like 'Client-%' and dp.role <> deal.deal_role)
    and not (dp.role = 'Listing Agent' and deal.pure_buyer)
    and not (dp.role = 'Buyer Agent' and deal.pure_seller)
  order by dp.ctid
$fn$;

create or replace function public.deal_contacts(p_deal uuid)
returns table (participant_id uuid, deal_id uuid, contact_id uuid, role text, profile_id uuid, first_name text, last_name text, company text, email text, phone text, contact_hidden boolean)
language plpgsql stable security invoker set search_path to pg_catalog, public, extensions as $fn$
begin
  return query select * from private.rpc_deal_contacts(p_deal);
end
$fn$;

create or replace function public.task_board(p_file_status text default 'All')
returns table (
  id uuid, deal_id uuid, title text, description text, assigned_role text, status text, due_date date,
  completed_at timestamptz, completed_by uuid, kind text, participant_id uuid, owner_profile_id uuid,
  template_code text, template_version integer, created_at timestamptz,
  file_number text, street text, city text, state text, zip text, closing_date date, deal_status text,
  owner_name text, overdue boolean
)
language sql stable security invoker set search_path to pg_catalog, public, extensions as $board$
      -- task_board_one_contact_scan
      with board as (
        select t.id, t.deal_id, t.title, t.description, t.assigned_role, t.status, t.due_date, t.completed_at, t.completed_by,
               t.kind, t.participant_id, t.owner_profile_id, t.template_code, t.template_version, t.created_at,
               d.file_number, d.street, d.city, d.state, d.zip, d.closing_date, d.status as deal_status
        from public.tasks t
        join public.deals d on d.id = t.deal_id
        where coalesce(p_file_status, 'All') = 'All' or d.status = p_file_status
      ),
      names as (
        select picked.deal_id, picked.participant_id, picked.owner_name
        from (
          select files.deal_id, c.participant_id, trim(c.first_name || ' ' || c.last_name) as owner_name,
                 row_number() over (partition by files.deal_id, c.participant_id order by c.participant_id) as n
          from (select distinct board.deal_id from board) files
          cross join lateral public.deal_contacts(files.deal_id) c
          where c.participant_id is not null
        ) picked
        where picked.n = 1
      )
      select board.id, board.deal_id, board.title, board.description, board.assigned_role, board.status, board.due_date,
             board.completed_at, board.completed_by, board.kind, board.participant_id, board.owner_profile_id,
             board.template_code, board.template_version, board.created_at,
             board.file_number, board.street, board.city, board.state, board.zip, board.closing_date, board.deal_status,
             names.owner_name,
             (board.status in ('todo', 'in_progress', 'blocked') and board.due_date is not null and board.due_date < private.office_today())
      from board
      left join names on names.deal_id = board.deal_id and names.participant_id = board.participant_id
      order by board.file_number, board.due_date nulls last, board.title
$board$;

create or replace function public.my_task_list(p_file_status text default 'Open')
returns table (
  id uuid, deal_id uuid, title text, description text, assigned_role text, status text, due_date date,
  completed_at timestamptz, completed_by uuid, kind text, participant_id uuid, owner_profile_id uuid,
  template_code text, template_version integer, created_at timestamptz,
  file_number text, street text, city text, state text, zip text, closing_date date, deal_status text,
  owner_name text, overdue boolean, my_roles text[]
)
language sql stable security invoker set search_path to pg_catalog, public, extensions as $mine$
  select b.*, case when private.is_staffish() then array[private.me_role()] else private.deal_roles(b.deal_id) end
  from public.task_board(coalesce(p_file_status, 'Open')) b
  where b.owner_profile_id = private.effective_uid()
     or (b.participant_id is null and (b.assigned_role = any (private.deal_roles(b.deal_id)) or (private.is_staffish() and b.assigned_role = private.me_role())))
  order by b.due_date nulls last, b.file_number, b.title $mine$;

grant execute on function private.office_today() to authenticated;
grant execute on function private.is_processor() to authenticated;
grant execute on function private.task_enabled(text) to authenticated;
grant execute on function private.template_code_retired(text) to authenticated;
grant execute on function private.task_outside_audience(uuid) to authenticated;
grant execute on function private.reader_gate() to authenticated;
grant execute on function private.reader_can_deal(uuid, uuid, text, boolean, uuid, boolean) to authenticated;
grant execute on function private.rpc_deal_contacts(uuid) to authenticated;
grant execute on function public.deal_contacts(uuid) to authenticated;
grant execute on function public.task_board(text) to authenticated;
grant execute on function public.my_task_list(text) to authenticated;
grant select on public.tasks, public.task_templates, public.task_template_switches, public.deals, public.contacts, public.deal_participants, public.deal_sales_people to authenticated;

alter table public.tasks enable row level security;
create policy tasks_select on public.tasks for select to authenticated
using (private.can_access_deal(deal_id));
create policy tasks_audience_limit on public.tasks as restrictive for select to authenticated
using (((audiences IS NULL) OR private.is_staffish() OR private.task_outside_audience(id)));
create policy tasks_retired_kept on public.tasks as restrictive for select to authenticated
using (((template_code IS NULL) OR (NOT private.template_code_retired(template_code)) OR private.is_admin() OR private.is_processor() OR ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'blocked'::text])) AND (owner_profile_id = ( SELECT private.effective_uid() AS uid)))));
create policy tasks_switch_hidden on public.tasks as restrictive for select to authenticated
using (((template_code IS NULL) OR private.task_enabled(template_code) OR private.is_admin()));
create policy fixture_deals_read on public.deals for select to authenticated
using (private.can_access_deal(id));

insert into public.deals (id, file_number, status, street, city, state, zip)
select format('b0e00000-0000-4000-8000-%s', lpad(to_hex(i), 12, '0'))::uuid,
       'F' || i, 'Open', '1 Main', 'City', 'MD', '21201'
from generate_series(1, 24) i;

insert into public.deal_participants (deal_id, contact_id, role)
select d.id, c.contact_id, c.role
from public.deals d
cross join (values
  ('caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'Buyer Agent'),
  ('cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, 'Listing Agent'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid, 'Client-Buyer'),
  ('cddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid, 'Client-Seller')
) as c(contact_id, role)
where d.file_number like 'F%';

insert into public.tasks (deal_id, owner_profile_id, assigned_role, title, status, due_date, participant_id, audiences)
select d.id,
       case when i % 3 = 0 then '11111111-1111-4111-8111-111111111111'::uuid
            when i % 3 = 1 then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
            else null end,
       case when i % 2 = 0 then 'Buyer Agent' else 'Processor' end,
       'Task ' || i,
       'todo',
       current_date - 1,
       case when i % 4 = 0 then (
         select p.id from public.deal_participants p
         where p.deal_id = d.id and p.role = 'Buyer Agent' limit 1
       ) when i % 4 = 1 then (
         select p.id from public.deal_participants p
         where p.deal_id = d.id and p.role = 'Listing Agent' limit 1
       ) else null end,
       case when i = 1 then array['buyer'] else null end
from public.deals d
cross join generate_series(1, 8) i
where d.status = 'Open';
