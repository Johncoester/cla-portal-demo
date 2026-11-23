-- FF-109 (Francis Santos, confirmed Nov 23 2026, 5:21 PM ET, Gmail 1a20a7ff3dfc931d).
-- Order Contacts can assign a Licensed Settlement Agent on a file (CLA Team). The people-role
-- list from 20261124170000_agent_tc_role_check.sql did not include that role, so TEST would
-- refuse the insert. This file only adds Licensed Settlement Agent to deal_participants_role_check.
-- No deals column, no RLS, GRANT, or function change.
-- Not applied by this commit. Rollback: supabase/rollbacks/20261130240000_ff109_licensed_settlement_agent.sql
begin;
set local lock_timeout = '3s';

do $chk$
declare
  def text;
  found text[];
  allowed text[] := array[
    'Abstractor', 'Buyer Agent', 'Buyer Agent TC', 'Client-Buyer', 'Client-Seller', 'HOA',
    'Lender', 'Licensed Settlement Agent', 'Listing Agent', 'Listing Agent TC', 'Other',
    'Preprocessor', 'Processor', 'Sales Person', 'Sales Team', 'Transaction Coordinator',
    'Underwriter'
  ];
  already text[] := array[
    'Abstractor', 'Buyer Agent', 'Buyer Agent TC', 'Client-Buyer', 'Client-Seller', 'HOA',
    'Lender', 'Listing Agent', 'Listing Agent TC', 'Other', 'Preprocessor', 'Processor',
    'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Underwriter'
  ];
  extra text;
  has_new boolean := false;
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
    has_new := found @> allowed;
    if has_new then
      -- already applied; leave the constraint alone
      null;
    else
      if not (found @> already) then
        raise exception 'drift: deal_participants_role_check is missing a role this file still allows';
      end if;
      alter table public.deal_participants drop constraint deal_participants_role_check;
    end if;
  end if;
  if def is null or not has_new then
    alter table public.deal_participants add constraint deal_participants_role_check
      check (role in (
        'Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator',
        'Licensed Settlement Agent',
        'Buyer Agent', 'Listing Agent', 'Buyer Agent TC', 'Listing Agent TC',
        'Client-Buyer', 'Client-Seller', 'Lender', 'HOA', 'Other', 'Abstractor', 'Underwriter'
      ));
  end if;
  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = 'public.deal_participants'::regclass
     and c.conname = 'deal_participants_role_check';
  select coalesce(array_agg(hit[1] order by hit[1]), '{}') into found
    from regexp_matches(def, $$'([^']+)'$$, 'g') as hits(hit);
  if not (found @> allowed) or exists (select 1 from unnest(found) as u(role) where not (u.role = any (allowed))) then
    raise exception 'self-check: the people-role list is not the Licensed Settlement Agent list';
  end if;
end $chk$;

commit;

notify pgrst, 'reload schema';
