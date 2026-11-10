-- Restore the per-row deal_contacts owner lookup in task_board and drop private.task_owner_name.
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $pre$
begin
  if to_regprocedure('public.task_board(text)') is null
     or (select md5(prosrc) from pg_proc where oid = to_regprocedure('public.task_board(text)')) is distinct from '08f1cc69e9b108c75d76377fc07707d4' then
    raise exception 'drift: public.task_board(text) is not the one-lookup body';
  end if;
  if to_regprocedure('private.task_owner_name(uuid,uuid)') is null
     or (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.task_owner_name(uuid,uuid)')) is distinct from '4694752e1c6ca5ccf90da996dbce85ed' then
    raise exception 'drift: private.task_owner_name(uuid,uuid) changed or missing';
  end if;
end
$pre$;

create or replace function public.task_board(p_file_status text DEFAULT 'All'::text)
returns TABLE(id uuid, deal_id uuid, title text, description text, assigned_role text, status text, due_date date, completed_at timestamp with time zone, completed_by uuid, kind text, participant_id uuid, owner_profile_id uuid, template_code text, template_version integer, created_at timestamp with time zone, file_number text, street text, city text, state text, zip text, closing_date date, deal_status text, owner_name text, overdue boolean)
language sql stable security invoker
set search_path = pg_catalog, public, extensions
as $fnbody$
  select t.id, t.deal_id, t.title, t.description, t.assigned_role, t.status, t.due_date, t.completed_at, t.completed_by,
         t.kind, t.participant_id, t.owner_profile_id, t.template_code, t.template_version, t.created_at,
         d.file_number, d.street, d.city, d.state, d.zip, d.closing_date, d.status,
         (select trim(c.first_name || ' ' || c.last_name) from public.deal_contacts(t.deal_id) c where c.participant_id = t.participant_id limit 1),
         (t.status in ('todo', 'in_progress', 'blocked') and t.due_date is not null and t.due_date < private.office_today())
  from public.tasks t join public.deals d on d.id = t.deal_id
  where coalesce(p_file_status, 'All') = 'All' or d.status = p_file_status
  order by d.file_number, t.due_date nulls last, t.title $fnbody$;

drop function private.task_owner_name(uuid, uuid);

commit;
