-- E2E-ORDER-1 (row 329). Place Order on TEST after FF-088 (PR 301, 4700428e).
-- The Nov 16 file let Buyer Agent TC and Listing Agent TC past the staff check, and
-- it did not add them to deal_participants_role_check. TEST created the order, then
-- refused the coordinator, and Place Order stayed on Review.
-- A fresh database has no role check yet. TEST has the old list. Both end on the
-- same list: every role already allowed, plus the two agent coordinators.
-- Not applied by this commit. Rollback: supabase/rollbacks/20261124170000_agent_tc_role_check.sql
begin;
set local lock_timeout = '3s';

do $chk$
declare
  def text;
  found text[];
  allowed text[] := array[
    'Abstractor', 'Buyer Agent', 'Buyer Agent TC', 'Client-Buyer', 'Client-Seller', 'HOA',
    'Lender', 'Listing Agent', 'Listing Agent TC', 'Other', 'Preprocessor', 'Processor',
    'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Underwriter'
  ];
  already text[] := array[
    'Abstractor', 'Buyer Agent', 'Client-Buyer', 'Client-Seller', 'HOA', 'Lender',
    'Listing Agent', 'Other', 'Preprocessor', 'Processor', 'Sales Person', 'Sales Team',
    'Transaction Coordinator', 'Underwriter'
  ];
  extra text;
begin
  if to_regclass('public.deal_participants') is null then
    raise exception 'drift: deal_participants is missing';
  end if;
  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = 'public.deal_participants'::regclass
     and c.conname = 'deal_participants_role_check';
  if def is not null then
    select coalesce(array_agg(hit[1] order by hit[1]), '{}') into found
      from regexp_matches(def, $$'([^']+)'$$, 'g') as hits(hit);
    select u.role into extra from unnest(found) as u(role) where not (u.role = any (allowed)) limit 1;
    if extra is not null then
      raise exception 'drift: deal_participants_role_check allows % and this file does not', extra;
    end if;
    if found @> allowed then
      raise exception 'drift: deal_participants_role_check already allows the agent coordinators';
    end if;
    if not (found @> already) then
      raise exception 'drift: deal_participants_role_check is missing a role this file still allows';
    end if;
    alter table public.deal_participants drop constraint deal_participants_role_check;
  end if;
  alter table public.deal_participants add constraint deal_participants_role_check
    check (role in (
      'Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator',
      'Buyer Agent', 'Listing Agent', 'Buyer Agent TC', 'Listing Agent TC',
      'Client-Buyer', 'Client-Seller', 'Lender', 'HOA', 'Other', 'Abstractor', 'Underwriter'
    ));
  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = 'public.deal_participants'::regclass
     and c.conname = 'deal_participants_role_check';
  select coalesce(array_agg(hit[1] order by hit[1]), '{}') into found
    from regexp_matches(def, $$'([^']+)'$$, 'g') as hits(hit);
  if not (found @> allowed) or exists (select 1 from unnest(found) as u(role) where not (u.role = any (allowed))) then
    raise exception 'self-check: the people-role list is not the agent coordinator list';
  end if;
end $chk$;

commit;

notify pgrst, 'reload schema';
