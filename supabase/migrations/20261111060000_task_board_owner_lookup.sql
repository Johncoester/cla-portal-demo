-- task_board read each task's owner name by calling public.deal_contacts(t.deal_id) once per task row,
-- even for tasks with no participant. Each call builds that file's whole contact list and runs the
-- visibility helpers for every contact, so the board slowed as tasks grew (186 -> 251 tasks on TEST, Nov 10).
-- Now one indexed lookup per task that has a participant, with the same visibility rule
-- (private.participant_visible, as in private.rpc_deal_contacts). Same rows, same columns, same names.
-- task_grid calls task_board, so it gets the same change. my_task_list is not changed here.
-- Captured on TEST (sanitized catalog handoff, Nov 9): public.task_board(text) md5 a21d3d37bed7cacf08a5ef62ad1a72d1.
-- Not applied on TEST by this commit.
-- Rollback: supabase/rollbacks/20261111060000_task_board_owner_lookup.sql
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $guard$
begin
  if to_regprocedure('public.task_board(text)') is null
     or (select md5(prosrc) from pg_proc where oid = to_regprocedure('public.task_board(text)')) is distinct from 'a21d3d37bed7cacf08a5ef62ad1a72d1' then
    raise exception 'drift: public.task_board(text) is not the captured body';
  end if;
  if to_regprocedure('private.task_owner_name(uuid,uuid)') is not null then
    raise exception 'drift: private.task_owner_name already exists';
  end if;
  if to_regprocedure('private.participant_visible(uuid,text)') is null then
    raise exception 'drift: private.participant_visible(uuid,text) is missing';
  end if;
end
$guard$;

create function private.task_owner_name(p_participant uuid, p_deal uuid)
returns text
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select trim(c.first_name || ' ' || c.last_name)
  from public.deal_participants dp join public.contacts c on c.id = dp.contact_id
  where dp.id = p_participant and dp.deal_id = p_deal and private.participant_visible(p_deal, dp.role)
  limit 1 $fnbody$;

revoke all on function private.task_owner_name(uuid, uuid) from public, anon;
grant execute on function private.task_owner_name(uuid, uuid) to authenticated;

create or replace function public.task_board(p_file_status text DEFAULT 'All'::text)
returns TABLE(id uuid, deal_id uuid, title text, description text, assigned_role text, status text, due_date date, completed_at timestamp with time zone, completed_by uuid, kind text, participant_id uuid, owner_profile_id uuid, template_code text, template_version integer, created_at timestamp with time zone, file_number text, street text, city text, state text, zip text, closing_date date, deal_status text, owner_name text, overdue boolean)
language sql stable security invoker
set search_path = pg_catalog, public, extensions
as $fnbody$
  select t.id, t.deal_id, t.title, t.description, t.assigned_role, t.status, t.due_date, t.completed_at, t.completed_by,
         t.kind, t.participant_id, t.owner_profile_id, t.template_code, t.template_version, t.created_at,
         d.file_number, d.street, d.city, d.state, d.zip, d.closing_date, d.status,
         case when t.participant_id is not null then private.task_owner_name(t.participant_id, t.deal_id) end,
         (t.status in ('todo', 'in_progress', 'blocked') and t.due_date is not null and t.due_date < private.office_today())
  from public.tasks t join public.deals d on d.id = t.deal_id
  where coalesce(p_file_status, 'All') = 'All' or d.status = p_file_status
  order by d.file_number, t.due_date nulls last, t.title $fnbody$;

commit;
