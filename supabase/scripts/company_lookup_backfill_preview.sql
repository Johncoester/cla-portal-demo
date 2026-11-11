-- FF-030 / JN-42 company backfill PREVIEW. Read only. Writes nothing.
-- Do not run this on hosted TEST (aqcervntopidtcazcmlv) or on any shared database.
-- It only prints counts. There is no INSERT, UPDATE, DELETE, or DDL.
-- The transaction is READ ONLY, so a write inside it fails.
--
-- contacts_with_company_text
--   contacts whose company text is not blank.
-- distinct_keys
--   distinct private.crm_company_key values of that text. A key that normalizes
--   to empty is counted in blank_keys and is not a distinct key.
-- step_a_would_link
--   contacts with a non-empty key, account_id still null, whose key equals
--   exactly one active crm_accounts row (archived_at is null). That is what a
--   later Step A would link.
-- ambiguous_matches
--   contacts whose key matches more than one active account.
-- unmatched_keys
--   distinct keys that match no active account. That is what a later Step B
--   would create.
-- unmatched_keys_empty_state
--   unmatched keys for which every contact with that key has a blank crm_state.
--   Step B cannot invent crm_accounts.state (the column is not null) from those keys.

begin read only;
set local search_path = pg_catalog, public;

do $preview$
declare
  contacts_with_company_text bigint;
  blank_keys bigint;
  distinct_keys bigint;
  step_a_would_link bigint;
  contacts_one_active bigint;
  ambiguous_matches bigint;
  ambiguous_keys bigint;
  unmatched_keys bigint;
  unmatched_keys_empty_state bigint;
begin
  if to_regprocedure('private.crm_company_key(text)') is null then
    raise exception 'preview: private.crm_company_key(text) is missing';
  end if;

  select count(*) into contacts_with_company_text
  from public.contacts c
  where btrim(coalesce(c.company, '')) <> '';

  select count(*) into blank_keys
  from public.contacts c
  where btrim(coalesce(c.company, '')) <> ''
    and private.crm_company_key(c.company) = '';

  with keyed as (
    select c.id,
           c.account_id,
           private.crm_company_key(c.company) as key,
           btrim(coalesce(c.crm_state, '')) as state
    from public.contacts c
    where btrim(coalesce(c.company, '')) <> ''
      and private.crm_company_key(c.company) <> ''
  ),
  active as (
    select private.crm_company_key(a.name) as key, count(*)::bigint as n
    from public.crm_accounts a
    where a.archived_at is null
    group by 1
  ),
  joined as (
    select k.id, k.account_id, k.key, k.state, coalesce(active.n, 0) as active_n
    from keyed k
    left join active on active.key = k.key
  ),
  by_key as (
    select j.key,
           max(j.active_n) as active_n,
           bool_and(j.state = '') as empty_state
    from joined j
    group by j.key
  )
  select
    (select count(*) from joined j where j.account_id is null and j.active_n = 1),
    (select count(*) from joined j where j.active_n = 1),
    (select count(*) from joined j where j.active_n > 1),
    (select count(*) from by_key b where b.active_n > 1),
    (select count(*) from by_key b where b.active_n = 0),
    (select count(*) from by_key b where b.active_n = 0 and b.empty_state),
    (select count(*) from by_key)
  into step_a_would_link, contacts_one_active, ambiguous_matches, ambiguous_keys,
       unmatched_keys, unmatched_keys_empty_state, distinct_keys;

  raise notice 'contacts_with_company_text=%', contacts_with_company_text;
  raise notice 'blank_keys=%', blank_keys;
  raise notice 'distinct_keys=%', distinct_keys;
  raise notice 'step_a_would_link=%', step_a_would_link;
  raise notice 'contacts_one_active_account=%', contacts_one_active;
  raise notice 'ambiguous_matches=%', ambiguous_matches;
  raise notice 'ambiguous_keys=%', ambiguous_keys;
  raise notice 'unmatched_keys=%', unmatched_keys;
  raise notice 'unmatched_keys_empty_state=%', unmatched_keys_empty_state;
end
$preview$;

commit;
