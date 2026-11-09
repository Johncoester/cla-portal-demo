-- John / Francis (Nov 9, option B): a Transaction Coordinator sees ALL non-demo files, exactly like a Processor (files, tasks, documents,
-- threads and everything else that derives from private.can_access_deal). Demo scope is unchanged (demo_scope policies still apply).
-- Each file also gets an informational TC assignment, deals.tc_user_id (workflow only, NOT access control):
--   * auto-assigned when the file is opened by a TC (the creator), or, while still blank, when a participant is added:
--       1) a TC added on the file (Contacts tab), else 2) the team coordinator of the Buyer Agent, else 3) of the Listing Agent
--       (team_members coordinator -> agent, the same link behind private.my_team_agents()); ties -> earliest participant, then earliest team link.
--   * staff who can edit order details (the same people who set the Processor) set / change / clear it at any time.
--   * every change is logged as 'deal.tc' and the newly assigned TC gets ONE in-app notification (no email, no SMS).
-- Speed: no new per-row helper calls in any policy. deals_select / tasks_select only gain 'Transaction Coordinator' inside their existing
-- one-time (initplan) role check; can_access_deal loses the per-file team-agent scan.
-- Rollback: supabase/rollbacks/20261109190000_tc_assignment_visibility.sql
begin;
set local lock_timeout = '3s';
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'tc_user_id') then
    raise exception 'drift: deals.tc_user_id already exists'; end if;
  if to_regprocedure('private.deal_tc_guard()') is not null or to_regprocedure('private.trg_deal_tc()') is not null
     or to_regprocedure('private.tc_candidate(uuid)') is not null or to_regprocedure('private.trg_participant_tc_assign()') is not null then
    raise exception 'drift: a TC assignment function already exists'; end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.can_access_deal(uuid)')) is distinct from 'ffdd9206deae6033a59982ed51406975' then
    raise exception 'drift: private.can_access_deal changed or missing'; end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.log_activity(uuid,text,text,uuid,text)')) is distinct from '122ffb0ad2fe7a16ca00bc9d4716b0e8' then
    raise exception 'drift: private.log_activity changed or missing'; end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.notify(uuid[],text,uuid,text,text)')) is distinct from '3b83dd0a781cd01afea62c29ea975457' then
    raise exception 'drift: private.notify changed or missing'; end if;
  if (select md5(qual) from pg_policies where schemaname = 'public' and tablename = 'deals' and policyname = 'deals_select') is distinct from '74ec784926d946ef17a6f4672df675cc' then
    raise exception 'drift: deals_select changed or missing'; end if;
  if (select md5(qual) from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_select') is distinct from 'c6c5bdb249a910184cf27743797241ca' then
    raise exception 'drift: tasks_select changed or missing'; end if;
end $$;

-- 1. the assignment column
alter table public.deals add column tc_user_id uuid references public.profiles(id) on delete set null;
create index deals_tc_user_id_idx on public.deals (tc_user_id) where tc_user_id is not null;

-- 2. who may be the TC on a file (active TC account, same demo scope) + "a TC who opens a file is its TC"
create function private.deal_tc_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
begin
  if tg_op = 'INSERT' and new.tc_user_id is null and new.created_by is not null and exists (
       select 1 from public.profiles p where p.id = new.created_by and p.role = 'Transaction Coordinator' and p.status = 'active'
         and p.is_demo is not distinct from coalesce(new.is_demo, false)) then
    new.tc_user_id := new.created_by;
  end if;
  if new.tc_user_id is null then return new; end if;
  if tg_op = 'INSERT' or new.tc_user_id is distinct from old.tc_user_id then
    if not exists (select 1 from public.profiles p where p.id = new.tc_user_id and p.status = 'active' and p.role = 'Transaction Coordinator'
         and p.is_demo is not distinct from coalesce(new.is_demo, false)) then
      raise exception 'The Transaction Coordinator on an order must be an active Transaction Coordinator.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.deal_tc_guard() from public, anon, authenticated;
create trigger deals_tc_guard before insert or update of tc_user_id on public.deals
  for each row execute function private.deal_tc_guard();

-- 3. activity + notification on every change (same shape as deals_processor_activity)
create function private.trg_deal_tc() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare v_name text;
begin
  if new.tc_user_id is not distinct from old.tc_user_id then return new; end if;
  if new.tc_user_id is null then
    perform private.log_activity(new.id, 'deal.tc', 'deal', new.id, 'Transaction Coordinator unassigned');
    return new;
  end if;
  select coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), nullif(p.email, ''), 'a user')
    into v_name from public.profiles p where p.id = new.tc_user_id;
  perform private.log_activity(new.id, 'deal.tc', 'deal', new.id, 'Transaction Coordinator set to ' || coalesce(v_name, 'a user'));
  if coalesce(current_setting('cla.tc_backfill', true), '') <> 'on' then
    perform private.notify(array[new.tc_user_id], 'tc', new.id,
      'You are now the Transaction Coordinator on ' || coalesce(nullif(new.file_number, ''), 'an order'), '#/deals/' || new.id::text);
  end if;
  return new;
end $$;
revoke all on function private.trg_deal_tc() from public, anon, authenticated;
create trigger deals_tc_activity after update of tc_user_id on public.deals
  for each row when (old.tc_user_id is distinct from new.tc_user_id)
  execute function private.trg_deal_tc();

-- 4. the auto rule (one file at a time; never used in a policy)
create function private.tc_candidate(d uuid) returns uuid
language sql stable security definer set search_path = pg_catalog, public, extensions as $$
  select cand from (
    select c.profile_id as cand, 1 as pri, p.created_at, p.id::text as pid, null::timestamptz as linked_at
      from public.deal_participants p join public.contacts c on c.id = p.contact_id
     where p.deal_id = d and p.role = 'Transaction Coordinator' and c.profile_id is not null
    union all
    select co.profile_id, case p.role when 'Buyer Agent' then 2 else 3 end, p.created_at, p.id::text, co.added_at
      from public.deal_participants p join public.contacts c on c.id = p.contact_id
      join public.team_members ag on ag.profile_id = c.profile_id and ag.member_role = 'agent'
      join public.team_members co on co.team_id = ag.team_id and co.member_role = 'coordinator'
     where p.deal_id = d and p.role in ('Buyer Agent', 'Listing Agent')
  ) x
  join public.profiles tp on tp.id = x.cand and tp.role = 'Transaction Coordinator' and tp.status = 'active'
  join public.deals dd on dd.id = d and tp.is_demo is not distinct from coalesce(dd.is_demo, false)
  order by x.pri, x.created_at, x.pid, x.linked_at nulls first, x.cand
  limit 1 $$;
revoke all on function private.tc_candidate(uuid) from public, anon, authenticated;

create function private.trg_participant_tc_assign() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare v uuid;
begin
  if not exists (select 1 from public.deals x where x.id = new.deal_id and x.tc_user_id is null) then return new; end if;
  v := private.tc_candidate(new.deal_id);
  if v is null then return new; end if;
  begin
    update public.deals set tc_user_id = v where id = new.deal_id and tc_user_id is null;
  exception when raise_exception then
    -- an unrelated order guard refused the update: adding the person must still succeed; the TC stays blank for staff to set
    null;
  end;
  return new;
end $$;
revoke all on function private.trg_participant_tc_assign() from public, anon, authenticated;
create trigger participants_tc_assign after insert on public.deal_participants
  for each row when (new.role in ('Buyer Agent', 'Listing Agent', 'Transaction Coordinator'))
  execute function private.trg_participant_tc_assign();

-- 5. visibility: Transaction Coordinator = Processor (all files in the viewer's demo scope); every other role's branch is unchanged
create or replace function private.can_access_deal(d uuid) returns boolean
language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select private.me_role() is not null and (
    private.is_admin() or private.me_role() in ('Processor', 'Sales Team', 'Transaction Coordinator')
    or (private.me_role() = 'Preprocessor' and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid()))
    or (private.me_role() in ('Sales Person', 'Sales Team') and exists (select 1 from public.deal_sales_people s where s.deal_id = d and s.sales_id = private.effective_uid()))
    or exists (select 1 from public.deal_participants p where p.deal_id = d and p.contact_id = private.my_contact_id())) $function$;

alter policy deals_select on public.deals using (
  (( select ((private.me_role() is not null) and (private.is_admin() or (private.me_role() = any (array['Processor'::text, 'Sales Team'::text, 'Transaction Coordinator'::text]))))) or private.can_access_deal(id)));
alter policy tasks_select on public.tasks using (
  ((( select ((private.me_role() is not null) and (private.is_admin() or (private.me_role() = any (array['Processor'::text, 'Sales Team'::text, 'Transaction Coordinator'::text]))))) or private.can_access_deal(deal_id))
   and (( select private.is_staffish() as is_staffish) or private.task_visible(owner_profile_id, assigned_role, deal_id))
   and (not ((assigned_role = 'Client-Buyer'::text) and private.emd_receipt_title(title) and private.is_pure_buyer(deal_id)))));

-- 6. backfill existing files with the same auto rule (activity logged; no notifications for the backfill)
set local cla.tc_backfill = 'on';
update public.deals d set tc_user_id = private.tc_candidate(d.id) where d.tc_user_id is null and private.tc_candidate(d.id) is not null;

commit;
