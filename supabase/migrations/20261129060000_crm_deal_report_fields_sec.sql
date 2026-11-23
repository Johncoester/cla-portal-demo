-- RPT-1-SEC (John, Nov 23 2026): close the demo/real-file hole in the Deals report fields.
-- RPT-1's public.crm_deal_report_fields() (20261129010000, applied on TEST as v20261122184434)
-- is SECURITY DEFINER, so it skips deals and contacts RLS. private.crm_deal_visible() does not
-- separate demo accounts from real files. A demo Processor can read buyer and seller names and
-- agent and source phones and emails on real files. The CRM Bot's rule 27 review of PR 419
-- found the same pattern there and flagged this live hole on main.
--
-- This redefines the function as SECURITY INVOKER so RLS (including the demo_scope policies)
-- applies, keeps the staff check and the file-visibility rule, and filters
-- is_demo = viewer_is_demo() in a helper that works out the caller's scope once.
-- private.business_source_label() is not called: it is DEFINER, not granted to authenticated,
-- and it reads contacts while skipping RLS. The label is built from already-visible source
-- and contact rows, plus private.crm_option_label (already granted to authenticated).
--
-- Apply on TEST once after this pull request merges. Do not apply the rollback on TEST.
-- Rollback: supabase/rollbacks/20261129060000_crm_deal_report_fields_sec.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regprocedure('private.crm_deal_visible(uuid)') is null
     or to_regprocedure('private.crm_user()') is null
     or to_regprocedure('private.crm_name(uuid)') is null
     or to_regprocedure('private.viewer_is_demo()') is null
     or to_regprocedure('private.crm_deal_scope_all()') is null
     or to_regprocedure('private.can_access_deal(uuid)') is null
     or to_regprocedure('private.me_role()') is null
     or to_regprocedure('private.effective_uid()') is null then
    raise exception 'drift: the CRM deal helpers are missing';
  end if;
  if to_regclass('public.deals') is null or to_regprocedure('public.crm_deal_report_fields()') is null then
    raise exception 'drift: public.deals or public.crm_deal_report_fields() is missing (RPT-1 must be applied first)';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'is_demo'
  ) then
    raise exception 'drift: public.deals.is_demo is missing';
  end if;
end $$;

create function private.crm_visible_deal_ids()
returns setof uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  -- Caller's flags once; demo/real files separated here so a later DEFINER caller cannot skip it.
  with who as (
    select
      private.crm_user() as crm_user,
      private.crm_deal_scope_all() as scope_all,
      private.me_role() as role,
      private.effective_uid() as uid,
      private.viewer_is_demo() as is_demo
  )
  select d.id
  from public.deals d
  cross join who w
  where w.crm_user
    and d.is_demo = w.is_demo
    and private.can_access_deal(d.id)
    and (w.scope_all or (coalesce(w.role = 'Sales Person', false)
      and exists (select 1 from public.deal_sales_people s where s.deal_id = d.id and s.sales_id = w.uid)))
$$;

revoke all on function private.crm_visible_deal_ids() from public, anon;
grant execute on function private.crm_visible_deal_ids() to authenticated;

drop function public.crm_deal_report_fields();

create function public.crm_deal_report_fields()
returns jsonb
language plpgsql
stable
security invoker
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
      'sourceOfBusiness', coalesce(src.label_base, '') || case
        when split_part(btrim(coalesce(src.source, '')), ':', 1) in ('buyer', 'seller', 'buyer_agent', 'listing_agent', 'lender')
             and nullif(sc.name, '') is not null then ' — ' || sc.name
        else ''
      end,
      'sourceContactName', coalesce(sc.name, ''), 'sourceCompany', coalesce(sc.company, ''), 'sourcePhone', coalesce(sc.phone, ''), 'sourceEmail', coalesce(sc.email, '')))
    from public.deals g
    join private.crm_visible_deal_ids() v(id) on v.id = g.id
    left join lateral (select string_agg(btrim(c.first_name || ' ' || c.last_name), ', ' order by p.created_at, p.id) as names
      from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id and p.role = 'Client-Buyer') b on true
    left join lateral (select string_agg(btrim(c.first_name || ' ' || c.last_name), ', ' order by p.created_at, p.id) as names
      from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id and p.role = 'Client-Seller') s on true
    left join lateral (select btrim(c.first_name || ' ' || c.last_name) as name, coalesce(c.company, '') as company, coalesce(nullif(btrim(c.mobile), ''), c.phone, '') as phone, coalesce(c.email, '') as email
      from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id and p.role = 'Buyer Agent' order by p.created_at, p.id limit 1) ba on true
    left join lateral (select btrim(c.first_name || ' ' || c.last_name) as name, coalesce(c.company, '') as company, coalesce(nullif(btrim(c.mobile), ''), c.phone, '') as phone, coalesce(c.email, '') as email
      from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id and p.role = 'Listing Agent' order by p.created_at, p.id limit 1) la on true
    left join lateral (
      select x.source,
        case split_part(btrim(x.source), ':', 1)
          when 'buyer' then 'Buyer'
          when 'seller' then 'Seller'
          when 'buyer_agent' then 'Buyer''s agent'
          when 'listing_agent' then 'Listing agent'
          when 'lender' then 'Lender'
          when 'homeowner' then 'Homeowner'
          else private.crm_option_label('leadSource', btrim(x.source))
        end as label_base
      from public.deal_business_sources x where x.deal_id = g.id and x.source <> '' limit 1) src on true
    left join lateral (select btrim(c.first_name || ' ' || c.last_name) as name, coalesce(c.company, '') as company, coalesce(nullif(btrim(c.mobile), ''), c.phone, '') as phone, coalesce(c.email, '') as email
      from public.contacts c
      -- CASE, not AND: Postgres may evaluate both sides of an AND, and a source with no contact id ('google', 'lender') is not a uuid
      where c.id = case when split_part(src.source, ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(src.source, ':', 2)::uuid end) sc on true)
    , '[]'::jsonb);
end $$;

revoke all on function public.crm_deal_report_fields() from public, anon;
grant execute on function public.crm_deal_report_fields() to authenticated;

do $readback$
declare src text;
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'crm_deal_report_fields' and p.prosecdef) then
    raise exception 'readback: crm_deal_report_fields is still SECURITY DEFINER';
  end if;
  select pg_get_functiondef('public.crm_deal_report_fields()'::regprocedure) into src;
  if position('private.crm_user()' in src) = 0 or position('private.crm_visible_deal_ids()' in src) = 0 then
    raise exception 'readback: the staff-only check or the visible-files helper is missing';
  end if;
  if position('private.business_source_label(' in src) > 0 then
    raise exception 'readback: the function still calls business_source_label (DEFINER, skips contact RLS)';
  end if;
  if has_function_privilege('anon', 'public.crm_deal_report_fields()', 'execute') then
    raise exception 'readback: anon can call crm_deal_report_fields';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'private' and p.proname = 'crm_visible_deal_ids' and p.prosecdef) then
    raise exception 'readback: crm_visible_deal_ids is missing or not SECURITY DEFINER';
  end if;
  select pg_get_functiondef('private.crm_visible_deal_ids()'::regprocedure) into src;
  if position('viewer_is_demo()' in src) = 0 or position('d.is_demo = w.is_demo' in src) = 0 then
    raise exception 'readback: crm_visible_deal_ids does not separate demo accounts from real files';
  end if;
  if has_function_privilege('anon', 'private.crm_visible_deal_ids()', 'execute') then
    raise exception 'readback: anon can call crm_visible_deal_ids';
  end if;
end
$readback$;
commit;
