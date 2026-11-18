-- TC-4 (John Coester, live call Nov 18 2026, 11:27 AM ET, confirmed 11:35 AM, clarified 11:37 AM).
-- Tracker row 368.
-- A transaction coordinator is an outside assistant who works for one or more real estate agents.
-- contacts.contact_type and crm_leads.contact_type may be agent_tc, as well as realtor, lender,
-- buyer_seller, or blank. agent_tc is not the CLA Title staff role.
-- Existing rows are not changed. This file does not update any contact or lead.
-- Not applied by this commit. Rollback: supabase/rollbacks/20261125230000_tc_contact_type.sql
begin;
set local lock_timeout = '3s';

do $tc_type$
declare
  def text;
  lead_name text;
  lead_def text;
  n int;
  unexpected int;
begin
  if to_regclass('public.contacts') is null then
    raise exception 'drift: contacts is missing';
  end if;
  if to_regclass('public.crm_leads') is null then
    raise exception 'drift: crm_leads is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contacts' and column_name = 'contact_type' and data_type = 'text'
  ) then
    raise exception 'drift: contacts.contact_type is missing or not text';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_leads' and column_name = 'contact_type' and data_type = 'text'
  ) then
    raise exception 'drift: crm_leads.contact_type is missing or not text';
  end if;

  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = 'public.contacts'::regclass
     and c.conname = 'contacts_contact_type_check';
  if def is null then
    raise exception 'drift: contacts_contact_type_check is missing';
  end if;
  if position('agent_tc' in def) > 0 then
    raise exception 'drift: contacts_contact_type_check already allows a transaction coordinator';
  end if;
  if position('realtor' in def) = 0 or position('lender' in def) = 0 or position('buyer_seller' in def) = 0 then
    raise exception 'drift: contacts_contact_type_check is not the realtor, lender, buyer/seller list';
  end if;

  select count(*) into n
    from pg_constraint c
   where c.conrelid = 'public.crm_leads'::regclass
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%contact_type%';
  if n <> 1 then
    raise exception 'drift: crm_leads contact type check count is %', n;
  end if;
  select c.conname, pg_get_constraintdef(c.oid) into lead_name, lead_def
    from pg_constraint c
   where c.conrelid = 'public.crm_leads'::regclass
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%contact_type%';
  if position('agent_tc' in lead_def) > 0 then
    raise exception 'drift: crm_leads contact type check already allows a transaction coordinator';
  end if;
  if position('realtor' in lead_def) = 0 or position('lender' in lead_def) = 0 or position('buyer_seller' in lead_def) = 0 then
    raise exception 'drift: crm_leads contact type check is not the realtor, lender, buyer/seller list';
  end if;

  select count(*) into unexpected from public.contacts
   where contact_type is not null and contact_type not in ('realtor', 'lender', 'buyer_seller');
  if unexpected <> 0 then
    raise exception 'drift: % contacts use a contact type this file does not know', unexpected;
  end if;
  select count(*) into unexpected from public.crm_leads
   where contact_type is not null and contact_type not in ('realtor', 'lender', 'buyer_seller');
  if unexpected <> 0 then
    raise exception 'drift: % leads use a contact type this file does not know', unexpected;
  end if;

  alter table public.contacts drop constraint contacts_contact_type_check;
  alter table public.contacts add constraint contacts_contact_type_check
    check (contact_type is null or contact_type in ('realtor', 'lender', 'buyer_seller', 'agent_tc'));
  execute format('alter table public.crm_leads drop constraint %I', lead_name);
  alter table public.crm_leads add constraint crm_leads_contact_type_check
    check (contact_type is null or contact_type in ('realtor', 'lender', 'buyer_seller', 'agent_tc'));

  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = 'public.contacts'::regclass
     and c.conname = 'contacts_contact_type_check';
  if def is null
     or position('agent_tc' in def) = 0
     or position('realtor' in def) = 0
     or position('lender' in def) = 0
     or position('buyer_seller' in def) = 0 then
    raise exception 'readback: contacts contact type list is not realtor, lender, buyer/seller, and transaction coordinator';
  end if;
  select pg_get_constraintdef(c.oid) into lead_def
    from pg_constraint c
   where c.conrelid = 'public.crm_leads'::regclass
     and c.conname = 'crm_leads_contact_type_check';
  if lead_def is null
     or position('agent_tc' in lead_def) = 0
     or position('realtor' in lead_def) = 0
     or position('lender' in lead_def) = 0
     or position('buyer_seller' in lead_def) = 0 then
    raise exception 'readback: leads contact type list is not realtor, lender, buyer/seller, and transaction coordinator';
  end if;
  -- No backfill. A transaction coordinator row can only exist after this file, and this file inserts none.
  if (select count(*) from public.contacts where contact_type = 'agent_tc') <> 0
     or (select count(*) from public.crm_leads where contact_type = 'agent_tc') <> 0 then
    raise exception 'readback: a transaction coordinator was written, and this file does not change existing rows';
  end if;
end
$tc_type$;

notify pgrst, 'reload schema';
commit;
