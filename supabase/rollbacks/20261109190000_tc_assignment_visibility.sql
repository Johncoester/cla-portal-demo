-- Rollback for 20261109190000_tc_assignment_visibility.sql: restores the exact previous can_access_deal, deals_select and tasks_select
-- (TC = team-agent files only), removes the TC assignment triggers / functions and drops deals.tc_user_id (assignments are lost;
-- the 'deal.tc' activity rows and 'tc' notifications already written are kept as history).
begin;
set local lock_timeout = '3s';
create or replace function private.can_access_deal(d uuid) returns boolean
language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select private.me_role() is not null and (
    private.is_admin() or private.me_role() in ('Processor', 'Sales Team')
    or (private.me_role() = 'Preprocessor' and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid()))
    or (private.me_role() = 'Transaction Coordinator' and exists (
          select 1 from public.deal_participants p join public.contacts c on c.id = p.contact_id
          where p.deal_id = d and p.role in ('Buyer Agent', 'Listing Agent') and c.profile_id in (select private.my_team_agents())))
    or (private.me_role() <> 'Transaction Coordinator' and (
          (private.me_role() in ('Sales Person', 'Sales Team') and exists (select 1 from public.deal_sales_people s where s.deal_id = d and s.sales_id = private.effective_uid()))
          or exists (select 1 from public.deal_participants p where p.deal_id = d and p.contact_id = private.my_contact_id())))) $function$;
alter policy deals_select on public.deals using (
  (( select ((private.me_role() is not null) and (private.is_admin() or (private.me_role() = any (array['Processor'::text, 'Sales Team'::text]))))) or private.can_access_deal(id)));
alter policy tasks_select on public.tasks using (
  ((( select ((private.me_role() is not null) and (private.is_admin() or (private.me_role() = any (array['Processor'::text, 'Sales Team'::text]))))) or private.can_access_deal(deal_id))
   and (( select private.is_staffish() as is_staffish) or private.task_visible(owner_profile_id, assigned_role, deal_id))
   and (not ((assigned_role = 'Client-Buyer'::text) and private.emd_receipt_title(title) and private.is_pure_buyer(deal_id)))));
drop trigger if exists participants_tc_assign on public.deal_participants;
drop trigger if exists deals_tc_activity on public.deals;
drop trigger if exists deals_tc_guard on public.deals;
drop function if exists private.trg_participant_tc_assign();
drop function if exists private.tc_candidate(uuid);
drop function if exists private.trg_deal_tc();
drop function if exists private.deal_tc_guard();
drop index if exists public.deals_tc_user_id_idx;
alter table public.deals drop column if exists tc_user_id;
commit;
