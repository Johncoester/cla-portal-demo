-- RPT-1 (John, Nov 22 2026): file columns for the CRM report builder's Deals report.
-- John's daily pre-closing report needs the processor, the source of business with a
-- phone and email, and each agent with a phone and email. The Deals report had none
-- of them. This adds ONE new read-only function. It does not change crm_deals,
-- crm_deal_row or any table, so the Deals list and every saved report keep working
-- whether or not this file is applied.
--
-- Who sees what: the same rule as the Deals list. A row is returned only when
-- private.crm_deal_visible(deal) is true for the signed-in person (a Sales Person:
-- their own deals; roles with "All deals": every deal). Buyers, sellers and agents
-- cannot call it (private.crm_user()).
--
-- Phone: the contact's mobile when there is one, else the phone.
-- Source contact: only when the source of business names a contact
-- (buyer:<id>, seller:<id>, buyer_agent:<id>, listing_agent:<id>, lender:<id>).
--
-- Not applied by this commit. Apply on TEST after the pull request merges.
-- Rollback: supabase/rollbacks/20261129010000_crm_deal_report_fields.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regprocedure('private.crm_deal_visible(uuid)') is null or to_regprocedure('private.crm_user()') is null or to_regprocedure('private.crm_name(uuid)') is null then
    raise exception 'drift: the CRM deal helpers are missing';
  end if;
  if to_regprocedure('public.crm_deal_report_fields()') is not null then
    raise exception 'drift: public.crm_deal_report_fields() already exists';
  end if;
end $$;

create function public.crm_deal_report_fields()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'state', coalesce(g.state, ''), 'zip', coalesce(g.zip, ''), 'lenderName', coalesce(g.lender_name, ''), 'contractDate', g.contract_date, 'stageNo', g.stage,
      'processorName', coalesce(private.crm_name(g.processor_id), ''), 'preprocessorName', coalesce(private.crm_name(g.preprocessor_user_id), ''),
      'tcName', coalesce(private.crm_name(g.tc_user_id), ''), 'closerName', coalesce(g.closer_name, ''),
      'buyerNames', coalesce(b.names, ''), 'sellerNames', coalesce(s.names, ''),
      'buyerAgentName', coalesce(ba.name, ''), 'buyerAgentCompany', coalesce(ba.company, ''), 'buyerAgentPhone', coalesce(ba.phone, ''), 'buyerAgentEmail', coalesce(ba.email, ''),
      'listingAgentName', coalesce(la.name, ''), 'listingAgentCompany', coalesce(la.company, ''), 'listingAgentPhone', coalesce(la.phone, ''), 'listingAgentEmail', coalesce(la.email, ''),
      'sourceOfBusiness', coalesce(src.label, ''), 'sourceContactName', coalesce(sc.name, ''), 'sourceCompany', coalesce(sc.company, ''), 'sourcePhone', coalesce(sc.phone, ''), 'sourceEmail', coalesce(sc.email, '')))
    from public.deals g
    left join lateral (select string_agg(btrim(c.first_name || ' ' || c.last_name), ', ' order by p.created_at, p.id) as names
      from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id and p.role = 'Client-Buyer') b on true
    left join lateral (select string_agg(btrim(c.first_name || ' ' || c.last_name), ', ' order by p.created_at, p.id) as names
      from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id and p.role = 'Client-Seller') s on true
    left join lateral (select btrim(c.first_name || ' ' || c.last_name) as name, coalesce(c.company, '') as company, coalesce(nullif(btrim(c.mobile), ''), c.phone, '') as phone, coalesce(c.email, '') as email
      from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id and p.role = 'Buyer Agent' order by p.created_at, p.id limit 1) ba on true
    left join lateral (select btrim(c.first_name || ' ' || c.last_name) as name, coalesce(c.company, '') as company, coalesce(nullif(btrim(c.mobile), ''), c.phone, '') as phone, coalesce(c.email, '') as email
      from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id and p.role = 'Listing Agent' order by p.created_at, p.id limit 1) la on true
    left join lateral (select x.source, private.business_source_label(x.source) as label from public.deal_business_sources x where x.deal_id = g.id and x.source <> '' limit 1) src on true
    left join lateral (select btrim(c.first_name || ' ' || c.last_name) as name, coalesce(c.company, '') as company, coalesce(nullif(btrim(c.mobile), ''), c.phone, '') as phone, coalesce(c.email, '') as email
      from public.contacts c
      -- CASE, not AND: Postgres may evaluate both sides of an AND, and a source with no contact id ('google', 'lender') is not a uuid
      where c.id = case when split_part(src.source, ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(src.source, ':', 2)::uuid end) sc on true
    where private.crm_deal_visible(g.id)), '[]'::jsonb);
end $$;

revoke all on function public.crm_deal_report_fields() from public, anon;
grant execute on function public.crm_deal_report_fields() to authenticated;

do $readback$
declare src text;
begin
  select pg_get_functiondef('public.crm_deal_report_fields()'::regprocedure) into src;
  if position('private.crm_user()' in src) = 0 or position('private.crm_deal_visible(g.id)' in src) = 0 then
    raise exception 'readback: the staff-only check or the deal visibility rule is missing';
  end if;
  if has_function_privilege('anon', 'public.crm_deal_report_fields()', 'execute') then
    raise exception 'readback: anon can call crm_deal_report_fields';
  end if;
end
$readback$;
commit;
