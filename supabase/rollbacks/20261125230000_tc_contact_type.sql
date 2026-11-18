-- Puts the contact type list back to realtor, lender, and buyer/seller.
-- Refuses while any contact or lead is already a transaction coordinator, so those rows are not rewritten.
begin;
set local lock_timeout = '3s';

do $tc_type_back$
declare
  def text;
  n int;
begin
  if to_regclass('public.contacts') is null or to_regclass('public.crm_leads') is null then
    raise exception 'rollback check: contacts or crm_leads is missing';
  end if;
  select count(*) into n from public.contacts where contact_type = 'agent_tc';
  if n <> 0 then
    raise exception 'A contact is already a transaction coordinator, so this cannot be undone yet. Change that contact type first.';
  end if;
  select count(*) into n from public.crm_leads where contact_type = 'agent_tc';
  if n <> 0 then
    raise exception 'A lead is already a transaction coordinator, so this cannot be undone yet. Change that contact type first.';
  end if;

  alter table public.contacts drop constraint if exists contacts_contact_type_check;
  alter table public.contacts add constraint contacts_contact_type_check
    check (contact_type is null or contact_type in ('realtor', 'lender', 'buyer_seller'));
  alter table public.crm_leads drop constraint if exists crm_leads_contact_type_check;
  alter table public.crm_leads add constraint crm_leads_contact_type_check
    check (contact_type is null or contact_type in ('realtor', 'lender', 'buyer_seller'));

  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = 'public.contacts'::regclass and c.conname = 'contacts_contact_type_check';
  if def is null or position('agent_tc' in def) > 0 or position('buyer_seller' in def) = 0 then
    raise exception 'rollback check: contacts contact type list was not put back';
  end if;
  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = 'public.crm_leads'::regclass and c.conname = 'crm_leads_contact_type_check';
  if def is null or position('agent_tc' in def) > 0 or position('buyer_seller' in def) = 0 then
    raise exception 'rollback check: leads contact type list was not put back';
  end if;
end
$tc_type_back$;

notify pgrst, 'reload schema';
commit;
