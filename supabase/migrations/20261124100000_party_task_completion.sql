-- MF-057 (Matt Landsberg, confirmed Nov 16 2026, 10:45 AM ET). Portal Feedback Nov 16, FF-086 item 2.
-- Buyer and seller tasks are one copy per person. When two or more people on that side
-- each have a copy, the dashboard file count keeps every copy open until each person
-- has finished. A finished copy is not overdue. One person on the side is unchanged.
-- The same rule is in js/data/party-task-completion.js so the Task Grid can use it.
-- This file is not applied to TEST by the pull request.
-- Rollback: supabase/rollbacks/20261124100000_party_task_completion.sql
begin;
set local lock_timeout = '3s';

create or replace function public.dashboard_file_task_counts(p_deal_ids uuid[])
returns table (deal_id uuid, open_tasks integer, overdue_tasks integer)
language sql
stable
security invoker
set search_path to pg_catalog, public, extensions
set jit = off
as $counts$
  with scoped as (
    select t.id, t.deal_id, t.status, t.due_date, t.assigned_role, t.template_code, t.title,
           t.participant_id, t.owner_profile_id
    from public.tasks t
    where p_deal_ids is not null
      and t.deal_id = any (p_deal_ids[1:100])
      and t.status <> 'cancelled'
  ),
  party as (
    select s.id, s.deal_id, s.status, s.due_date,
           case
             when s.assigned_role in ('Client-Buyer', 'Client-Seller') then
               s.deal_id::text || '|' || s.assigned_role || '|' ||
               case
                 when nullif(btrim(coalesce(s.template_code, '')), '') is not null then 'tpl:' || btrim(s.template_code)
                 else 'task:' || lower(btrim(coalesce(s.title, '')))
               end
           end as party_key,
           coalesce(s.participant_id, s.owner_profile_id) as person_id
    from scoped s
  ),
  person_done as (
    select p.party_key, p.person_id, bool_and(p.status = 'done') as finished
    from party p
    where p.party_key is not null
      and p.person_id is not null
    group by p.party_key, p.person_id
  ),
  side as (
    select person_done.party_key,
           count(*)::int as people,
           count(*) filter (where person_done.finished)::int as people_done
    from person_done
    group by person_done.party_key
  )
  select d.id,
         count(t.id) filter (
           where t.status in ('todo', 'in_progress', 'blocked')
              or (
                t.status = 'done'
                and t.person_id is not null
                and side.people >= 2
                and side.people_done < side.people
              )
         )::int as open_tasks,
         count(t.id) filter (
           where t.status in ('todo', 'in_progress', 'blocked')
             and t.due_date is not null
             and t.due_date < private.office_today()
         )::int as overdue_tasks
  from public.deals d
  left join party t on t.deal_id = d.id
  left join side on side.party_key = t.party_key
  where p_deal_ids is not null
    and d.id = any (p_deal_ids[1:100])
  group by d.id
$counts$;

comment on function public.dashboard_file_task_counts(uuid[]) is
  'MF-057: per-file open and overdue counts. A buyer or seller task with two or more people stays open until each of them has finished. One person is unchanged. Invoker: row security still applies.';

revoke all on function public.dashboard_file_task_counts(uuid[]) from public;
revoke all on function public.dashboard_file_task_counts(uuid[]) from anon;
grant execute on function public.dashboard_file_task_counts(uuid[]) to authenticated;

do $chk$
begin
  if position('Client-Buyer' in (
    select p.prosrc from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'dashboard_file_task_counts'
  )) = 0 then
    raise exception 'party task completion did not land on dashboard_file_task_counts';
  end if;
end
$chk$;

commit;
