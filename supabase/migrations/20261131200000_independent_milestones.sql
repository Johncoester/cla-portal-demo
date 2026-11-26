-- MF-068 (Matt Landsberg, Portal Feedback Nov 25 2026): Order Status milestones can be
-- completed independently. deals.milestones_done is the stored set; deals.stage stays as
-- the highest completed index (or 0 if none) so existing readers keep working.
-- Rollback: supabase/rollbacks/20261131200000_independent_milestones.sql

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $$
begin
  if to_regclass('public.deals') is null then
    raise exception 'drift: public.deals is missing';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'milestones_done'
  ) then
    raise exception 'drift: public.deals.milestones_done already exists';
  end if;
end $$;

alter table public.deals
  add column milestones_done jsonb not null default '[false,false,false,false,false,false,false,false,false,false]'::jsonb;

-- Existing files: mark 0..current complete so already-advanced files do not look empty.
update public.deals d
set milestones_done = (
  select jsonb_agg(i <= least(greatest(coalesce(d.stage, 0), 0), 9) ) order by i)
  from generate_series(0, 9) as i
);

do $$
declare
  n int;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'milestones_done'
  ) then
    raise exception 'readback: milestones_done was not added';
  end if;
  select count(*) into n from public.deals
    where jsonb_typeof(milestones_done) is distinct from 'array'
       or jsonb_array_length(milestones_done) is distinct from 10;
  if n <> 0 then
    raise exception 'readback: % file(s) do not have a 10-step milestone list', n;
  end if;
end $$;

-- TC dashboard file list: each step is done only when that step is in the stored set.
-- The previous body marked every earlier step done from deals.stage, and marked all
-- ten done when the file was Closed. Grants stay the same (authenticated execute).
create or replace function public.rpc_tc_file_summaries(p_deal_ids uuid[])
returns table (deal_id uuid, milestones jsonb, emd_alta jsonb, outstanding integer, tasks jsonb)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select d.id,
    (
      select jsonb_agg(jsonb_build_object(
        'index', i,
        'name', (array['Opened','EMD Receipt','Buyer Info Received','Schedule Closing','Wire/Cash to Close Awareness','Processing','Buyer Final Doc Review','Closing Date','Funding auth','Disbursed Funds'])[i + 1],
        'state', case
          when coalesce((d.milestones_done ->> i)::boolean, false) then 'done'
          else 'upcoming' end,
        'date', case
          when i = 0 then d.open_date
          when i = 3 then d.closing_date
          when i = 9 and d.status = 'Closed' then d.closing_date
          else null end
      ) order by i)
      from generate_series(0, 9) as i
    ),
    jsonb_build_object(
      'received', coalesce(d.emd_received, false),
      'receivedDate', d.emd_received_date,
      'receivedAmount', coalesce(d.emd_received_amount, d.emd_amount),
      'holder', coalesce(d.emd_holder, ''),
      'altaReceived', coalesce(d.alta_received, false),
      'altaReceivedDate', d.alta_received_date,
      'altaDocumentId', d.alta_document_id
    ),
    (
      select count(*)::integer from public.tasks t
      where t.deal_id = d.id and t.status in ('todo', 'in_progress', 'blocked')
    ),
    (
      select coalesce(jsonb_agg(to_jsonb(s) order by s."dueDate"), '[]'::jsonb)
      from (
        select t.id, t.title, t.status, t.due_date as "dueDate", t.kind, t.assigned_role as "assignedRole"
        from public.tasks t
        where t.deal_id = d.id and t.status in ('todo', 'in_progress', 'blocked')
        order by t.due_date nulls last, t.title
        limit 12
      ) s
    )
  from public.deals d
  where p_deal_ids is not null and d.id = any (p_deal_ids);
$$;

revoke all on function public.rpc_tc_file_summaries(uuid[]) from public, anon;
grant execute on function public.rpc_tc_file_summaries(uuid[]) to authenticated;

commit;
