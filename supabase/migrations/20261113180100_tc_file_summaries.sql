-- One read for the coordinator dashboard file list. Replaces one getTcFileSummary per file.
-- Runs as the caller, so deals and tasks row security still decide what comes back.
-- No new index: EXPLAIN on TEST is a seq scan under 1 ms for the current 14 open files.
-- Rollback: supabase/rollbacks/20261113180100_tc_file_summaries.sql

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $$
begin
  if to_regclass('public.deals') is null or to_regclass('public.tasks') is null then
    raise exception 'drift: deals or tasks is missing';
  end if;
  if to_regprocedure('public.rpc_tc_file_summaries(uuid[])') is not null then
    raise exception 'drift: public.rpc_tc_file_summaries(uuid[]) already exists';
  end if;
end $$;

create function public.rpc_tc_file_summaries(p_deal_ids uuid[])
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
          when d.status = 'Closed' then 'done'
          when i < coalesce(d.stage, 0) then 'done'
          when i = coalesce(d.stage, 0) then 'current'
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
