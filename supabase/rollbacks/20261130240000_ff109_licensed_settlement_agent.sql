-- Undo FF-109: remove Licensed Settlement Agent from deal_participants_role_check.
-- Refuses if any file still has that role, so a rollback does not leave orphaned rows
-- that the restored list would reject.
begin;
set local lock_timeout = '3s';

do $chk$
declare
  def text;
  found text[];
  restored text[] := array[
    'Abstractor', 'Buyer Agent', 'Buyer Agent TC', 'Client-Buyer', 'Client-Seller', 'HOA',
    'Lender', 'Listing Agent', 'Listing Agent TC', 'Other', 'Preprocessor', 'Processor',
    'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Underwriter'
  ];
  leftover int;
begin
  if to_regclass('public.deal_participants') is null then
    raise exception 'drift: deal_participants is missing';
  end if;
  execute 'select count(*) from public.deal_participants where role = $1'
    into leftover
    using 'Licensed Settlement Agent';
  if leftover > 0 then
    raise exception 'rollback refused: % file(s) still have a Licensed Settlement Agent', leftover;
  end if;
  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = 'public.deal_participants'::regclass
     and c.conname = 'deal_participants_role_check';
  if def is not null then
    select coalesce(array_agg(hit[1] order by hit[1]), '{}') into found
      from regexp_matches(def, $$'([^']+)'$$, 'g') as hits(hit);
    if found @> restored and not ('Licensed Settlement Agent' = any (found)) then
      null; -- already rolled back
    elsif not ('Licensed Settlement Agent' = any (found)) then
      raise exception 'drift: deal_participants_role_check does not include Licensed Settlement Agent';
    else
      alter table public.deal_participants drop constraint deal_participants_role_check;
      alter table public.deal_participants add constraint deal_participants_role_check
        check (role in (
          'Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator',
          'Buyer Agent', 'Listing Agent', 'Buyer Agent TC', 'Listing Agent TC',
          'Client-Buyer', 'Client-Seller', 'Lender', 'HOA', 'Other', 'Abstractor', 'Underwriter'
        ));
    end if;
  else
    alter table public.deal_participants add constraint deal_participants_role_check
      check (role in (
        'Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator',
        'Buyer Agent', 'Listing Agent', 'Buyer Agent TC', 'Listing Agent TC',
        'Client-Buyer', 'Client-Seller', 'Lender', 'HOA', 'Other', 'Abstractor', 'Underwriter'
      ));
  end if;
end $chk$;

commit;

notify pgrst, 'reload schema';
