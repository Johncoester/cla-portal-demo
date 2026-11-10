-- Columns and the pre-1700 task_board body so 20261111170000 can land on the fixture.
alter table public.tasks add column if not exists description text;
alter table public.tasks add column if not exists completed_at timestamptz;
alter table public.tasks add column if not exists completed_by uuid;
alter table public.tasks add column if not exists kind text;
alter table public.tasks add column if not exists participant_id uuid;
alter table public.tasks add column if not exists template_version integer;
alter table public.tasks add column if not exists created_at timestamptz default now();
alter table public.deals add column if not exists file_number text;
alter table public.deals add column if not exists street text default '';
alter table public.deals add column if not exists city text default '';
alter table public.deals add column if not exists state text default '';
alter table public.deals add column if not exists zip text default '';
alter table public.deals add column if not exists closing_date date;
alter table public.deals add column if not exists status text;
update public.deals set status = coalesce(status, 'Open'), file_number = coalesce(file_number, 'F');

create or replace function private.office_today() returns date
language sql stable set search_path to pg_catalog, public, extensions as $$
  select (now() at time zone 'America/New_York')::date
$$;

create or replace function public.deal_contacts(p_deal uuid)
returns table (participant_id uuid, first_name text, last_name text)
language sql stable security invoker set search_path to pg_catalog, public, extensions as $$
  select null::uuid, null::text, null::text where false
$$;

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

create or replace function public.task_grid(p_file_status text default 'Open')
returns table (
  id uuid, deal_id uuid, title text, description text, assigned_role text, status text, due_date date,
  completed_at timestamptz, completed_by uuid, kind text, participant_id uuid, owner_profile_id uuid,
  template_code text, template_version integer, created_at timestamptz,
  file_number text, street text, city text, state text, zip text, closing_date date, deal_status text,
  owner_name text, overdue boolean
)
language plpgsql stable security invoker set search_path to pg_catalog, public, extensions as $$
begin
  if not (private.is_processor() or private.is_admin()) then
    raise exception 'Only a Processor or Admin can open the task grid.' using errcode = 'P0001';
  end if;
  return query select * from public.task_board(coalesce(p_file_status, 'Open'));
end
$$;

grant select on public.folders, public.signature_requests, public.signature_signers to authenticated;
grant execute on function private.office_today() to authenticated;
grant execute on function public.deal_contacts(uuid) to authenticated;
grant execute on function public.task_board(text) to authenticated;
grant execute on function public.my_task_list(text) to authenticated;
grant execute on function public.task_grid(text) to authenticated;
