-- Removes only TEST-SEED-CRM rows loaded by 20261109_crm_test_seed.sql.
-- Project: aqcervntopidtcazcmlv (CLA Portal Live Test). Do not run on production.
-- Not a migration. Apply by hand in the TEST SQL editor after the seed.
-- One transaction. lock_timeout 3s. Idempotent: a second run deletes nothing.
-- Delete order is activities, then opportunities, then leads, then accounts.
-- private.crm_row_guard rejects every DELETE, so the deletes run under
-- session_replication_role = replica (that also skips foreign keys). Each
-- delete still names TEST-SEED-CRM, so a skipped foreign key cannot remove
-- a row that is not part of the seed. Leads also have to keep an @example.com
-- email and a 555-01 phone. Companies also have to keep a 555-01 phone.
-- Other tables are not deleted. If a non-seed row still points at a seed row,
-- this script stops and deletes nothing. Afterward, no marker rows remain and
-- the non-marker counts are unchanged.

begin;
set local lock_timeout = '3s';

do $rollback$
declare
  n int;
  blocked boolean;
  keep_leads int;
  keep_accounts int;
  keep_opps int;
  keep_activities int;
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.crm_leads') is null
     or to_regclass('public.crm_accounts') is null
     or to_regclass('public.crm_opportunities') is null
     or to_regclass('public.crm_activities') is null then
    raise exception 'refusing: CRM tables or public.profiles are missing. This is not the CLA Portal Live Test schema.';
  end if;

  if not exists (
    select 1 from public.profiles
    where id in (
      '149e612a-6e14-4ee1-9890-0f29d6f89156'::uuid,
      'd02722a1-582b-42c0-b3d1-28d25adb758d'::uuid
    )
  ) then
    raise exception 'refusing: this database does not have the CLA Portal Live Test staff profiles (project aqcervntopidtcazcmlv).';
  end if;

  if exists (
    select 1 from public.crm_activities a
    join public.crm_leads l on a.entity = 'lead' and a.entity_id::text = l.id::text
    where position('TEST-SEED-CRM' in coalesce(l.title, '') || ' ' || coalesce(l.notes, '')) > 0
      and position('TEST-SEED-CRM' in coalesce(a.subject, '') || ' ' || coalesce(a.body, '')) = 0
  ) or exists (
    select 1 from public.crm_activities a
    join public.crm_accounts c on a.entity = 'account' and a.entity_id::text = c.id::text
    where position('TEST-SEED-CRM' in coalesce(c.website, '') || ' ' || coalesce(c.notes, '')) > 0
      and position('TEST-SEED-CRM' in coalesce(a.subject, '') || ' ' || coalesce(a.body, '')) = 0
  ) or exists (
    select 1 from public.crm_activities a
    join public.crm_opportunities o on a.entity = 'opportunity' and a.entity_id::text = o.id::text
    where position('TEST-SEED-CRM' in coalesce(o.name, '') || ' ' || coalesce(o.notes, '')) > 0
      and position('TEST-SEED-CRM' in coalesce(a.subject, '') || ' ' || coalesce(a.body, '')) = 0
  ) then
    raise exception 'refusing: a non-seed activity still points at a TEST-SEED-CRM row. It was not deleted.';
  end if;

  if exists (
    select 1 from public.crm_opportunities o
    join public.crm_accounts c on c.id = o.account_id
    where position('TEST-SEED-CRM' in coalesce(c.website, '') || ' ' || coalesce(c.notes, '')) > 0
      and position('TEST-SEED-CRM' in coalesce(o.name, '') || ' ' || coalesce(o.notes, '')) = 0
  ) or exists (
    select 1 from public.crm_leads l
    join public.crm_accounts c on c.id = l.account_id
    where position('TEST-SEED-CRM' in coalesce(c.website, '') || ' ' || coalesce(c.notes, '')) > 0
      and position('TEST-SEED-CRM' in coalesce(l.title, '') || ' ' || coalesce(l.notes, '')) = 0
  ) then
    raise exception 'refusing: a non-seed lead or opportunity still points at a TEST-SEED-CRM company. It was not deleted.';
  end if;

  -- Plan the email and attachment probes only when those tables exist. A missing
  -- relation in the same statement as to_regclass is still planned and errors.
  if to_regclass('public.crm_emails') is not null then
    execute $q$
      select exists (
        select 1 from public.crm_emails e
        where (
          exists (select 1 from public.crm_leads l where e.entity = 'lead' and e.entity_id::text = l.id::text and position('TEST-SEED-CRM' in coalesce(l.title, '') || ' ' || coalesce(l.notes, '')) > 0)
          or exists (select 1 from public.crm_accounts c where e.entity = 'account' and e.entity_id::text = c.id::text and position('TEST-SEED-CRM' in coalesce(c.website, '') || ' ' || coalesce(c.notes, '')) > 0)
          or exists (select 1 from public.crm_opportunities o where e.entity = 'opportunity' and e.entity_id::text = o.id::text and position('TEST-SEED-CRM' in coalesce(o.name, '') || ' ' || coalesce(o.notes, '')) > 0)
        )
      )
    $q$ into blocked;
    if blocked then
      raise exception 'refusing: a CRM email still points at a TEST-SEED-CRM row. Emails are not deleted.';
    end if;
  end if;

  if to_regclass('public.crm_attachments') is not null then
    execute $q$
      select exists (
        select 1 from public.crm_attachments f
        where (
          exists (select 1 from public.crm_leads l where f.entity = 'lead' and f.entity_id::text = l.id::text and position('TEST-SEED-CRM' in coalesce(l.title, '') || ' ' || coalesce(l.notes, '')) > 0)
          or exists (select 1 from public.crm_accounts c where f.entity = 'account' and f.entity_id::text = c.id::text and position('TEST-SEED-CRM' in coalesce(c.website, '') || ' ' || coalesce(c.notes, '')) > 0)
          or exists (select 1 from public.crm_opportunities o where f.entity = 'opportunity' and f.entity_id::text = o.id::text and position('TEST-SEED-CRM' in coalesce(o.name, '') || ' ' || coalesce(o.notes, '')) > 0)
        )
      )
    $q$ into blocked;
    if blocked then
      raise exception 'refusing: a CRM attachment still points at a TEST-SEED-CRM row. Attachments are not deleted.';
    end if;
  end if;

  select count(*) into keep_leads from public.crm_leads where position('TEST-SEED-CRM' in coalesce(title, '') || ' ' || coalesce(notes, '')) = 0;
  select count(*) into keep_accounts from public.crm_accounts where position('TEST-SEED-CRM' in coalesce(website, '') || ' ' || coalesce(notes, '')) = 0;
  select count(*) into keep_opps from public.crm_opportunities where position('TEST-SEED-CRM' in coalesce(name, '') || ' ' || coalesce(notes, '')) = 0;
  select count(*) into keep_activities from public.crm_activities where position('TEST-SEED-CRM' in coalesce(subject, '') || ' ' || coalesce(body, '')) = 0;

  set local session_replication_role = replica;
  delete from public.crm_activities
  where position('TEST-SEED-CRM' in coalesce(subject, '') || ' ' || coalesce(body, '')) > 0;

  delete from public.crm_opportunities
  where position('TEST-SEED-CRM' in coalesce(name, '') || ' ' || coalesce(notes, '')) > 0;

  delete from public.crm_leads
  where position('TEST-SEED-CRM' in coalesce(title, '') || ' ' || coalesce(notes, '')) > 0
    and email ~ '@example\.com$'
    and phone like '%555-01%';

  delete from public.crm_accounts
  where position('TEST-SEED-CRM' in coalesce(website, '') || ' ' || coalesce(notes, '')) > 0
    and phone like '%555-01%';
  set local session_replication_role = origin;

  if (select count(*) from public.crm_leads where position('TEST-SEED-CRM' in coalesce(title, '') || ' ' || coalesce(notes, '')) = 0) <> keep_leads
     or (select count(*) from public.crm_accounts where position('TEST-SEED-CRM' in coalesce(website, '') || ' ' || coalesce(notes, '')) = 0) <> keep_accounts
     or (select count(*) from public.crm_opportunities where position('TEST-SEED-CRM' in coalesce(name, '') || ' ' || coalesce(notes, '')) = 0) <> keep_opps
     or (select count(*) from public.crm_activities where position('TEST-SEED-CRM' in coalesce(subject, '') || ' ' || coalesce(body, '')) = 0) <> keep_activities then
    raise exception 'readback: the rollback changed a row that does not carry TEST-SEED-CRM.';
  end if;

  select count(*) into n from public.crm_leads where position('TEST-SEED-CRM' in coalesce(title, '') || ' ' || coalesce(notes, '')) > 0;
  if n <> 0 then raise exception 'readback: % TEST-SEED-CRM leads remain.', n; end if;
  select count(*) into n from public.crm_accounts where position('TEST-SEED-CRM' in coalesce(website, '') || ' ' || coalesce(notes, '')) > 0;
  if n <> 0 then raise exception 'readback: % TEST-SEED-CRM companies remain.', n; end if;
  select count(*) into n from public.crm_opportunities where position('TEST-SEED-CRM' in coalesce(name, '') || ' ' || coalesce(notes, '')) > 0;
  if n <> 0 then raise exception 'readback: % TEST-SEED-CRM opportunities remain.', n; end if;
  select count(*) into n from public.crm_activities where position('TEST-SEED-CRM' in coalesce(subject, '') || ' ' || coalesce(body, '')) > 0;
  if n <> 0 then raise exception 'readback: % TEST-SEED-CRM activities remain.', n; end if;
end
$rollback$;

commit;
