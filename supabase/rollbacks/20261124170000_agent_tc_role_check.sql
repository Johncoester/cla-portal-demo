-- Undo E2E-ORDER-1. Puts back the people-role list from before the agent coordinators.
-- Refuses while a file still has one of those coordinators, so the old list can be saved.
begin;
set local lock_timeout = '3s';

do $chk$
declare
  def text;
  found text[];
  previous text[] := array[
    'Abstractor', 'Buyer Agent', 'Client-Buyer', 'Client-Seller', 'HOA', 'Lender',
    'Listing Agent', 'Other', 'Preprocessor', 'Processor', 'Sales Person', 'Sales Team',
    'Transaction Coordinator', 'Underwriter'
  ];
begin
  if to_regclass('public.deal_participants') is null then
    raise exception 'drift: deal_participants is missing';
  end if;
  if exists (
    select 1 from public.deal_participants
     where role in ('Buyer Agent TC', 'Listing Agent TC')
  ) then
    raise exception 'A file still has a buyer''s or listing transaction coordinator. Remove those people from the files before undoing this change.';
  end if;
  alter table public.deal_participants drop constraint if exists deal_participants_role_check;
  alter table public.deal_participants add constraint deal_participants_role_check
    check (role in (
      'Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator',
      'Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller',
      'Lender', 'HOA', 'Other', 'Abstractor', 'Underwriter'
    ));
  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = 'public.deal_participants'::regclass
     and c.conname = 'deal_participants_role_check';
  select coalesce(array_agg(hit[1] order by hit[1]), '{}') into found
    from regexp_matches(def, $$'([^']+)'$$, 'g') as hits(hit);
  if found @> array['Buyer Agent TC', 'Listing Agent TC'] or not (found @> previous) then
    raise exception 'self-check: the people-role list still has an agent coordinator, or dropped an older role';
  end if;
end $chk$;

commit;

notify pgrst, 'reload schema';
