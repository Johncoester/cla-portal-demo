-- Referral source on the party row (John, Nov 7). NOT APPLIED to hosted TEST.
-- Parent applies this file with the sanctioned Supabase tool after review. Do not run it here.
-- One existing text column. No new table, no backfill, and no update of rows already stored.
-- Buyer and seller are distinct codes. homeowner stays homeowner and is not mapped to either.
-- A contact id is accepted only when that contact is already on this order in that role,
-- is in the viewer's demo world, and, if the contact has a login, that login is active.
-- Direct writes stay revoked. Signed-in callers may execute the RPC; the function body
-- still refuses anyone who is not a Processor, Preprocessor, or Admin on that order.

create or replace function private.business_source_label(p_source text) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select case split_part(btrim(coalesce(p_source, '')), ':', 1)
    when 'buyer' then 'Buyer'
    when 'seller' then 'Seller'
    when 'buyer_agent' then 'Buyer''s agent'
    when 'listing_agent' then 'Listing agent'
    when 'lender' then 'Lender'
    when 'homeowner' then 'Homeowner'
    else private.crm_option_label('leadSource', btrim(coalesce(p_source, '')))
  end
  || case
    when split_part(btrim(coalesce(p_source, '')), ':', 1) in ('buyer', 'seller', 'buyer_agent', 'listing_agent', 'lender')
     and split_part(btrim(coalesce(p_source, '')), ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then coalesce(' — ' || nullif((select btrim(c.first_name || ' ' || c.last_name) from public.contacts c where c.id = split_part(btrim(p_source), ':', 2)::uuid), ''), '')
    else ''
  end $$;
revoke all on function private.business_source_label(text) from public, anon, authenticated;

create or replace function public.set_deal_source(p_deal uuid, p_source text) returns text
language plpgsql security definer set search_path = pg_catalog, public as $$
declare cur text; v text := btrim(coalesce(p_source, '')); code text; who text; party_role text; deal_demo boolean;
begin
  -- Stays security definer, matching the hosted function. Postgres will not turn an existing
  -- security-definer function into an invoker with CREATE OR REPLACE, and dropping the RPC is a wider change.
  -- private.is_processor and private.can_access_deal do not compare deals.is_demo with the viewer.
  -- This read bypasses RLS, so the order's own flag is checked before clear, an unchanged value, a bare code, or a contact.
  if not private.is_processor() then raise exception 'Only a Processor or Admin can do this.' using errcode = '42501'; end if;
  select d.is_demo into deal_demo from public.deals d where d.id = p_deal;
  if not found
     or coalesce(deal_demo, false) is distinct from private.viewer_is_demo()
     or not private.can_access_deal(p_deal) then
    raise exception 'Order not found.' using errcode = 'P0002'; end if;
  select source into cur from public.deal_business_sources where deal_id = p_deal;
  if v = '' then update public.deal_business_sources set source = '', set_by = auth.uid(), set_at = now() where deal_id = p_deal and source <> ''; return ''; end if;
  if v is distinct from cur then
    code := split_part(v, ':', 1); who := case when position(':' in v) > 0 then split_part(v, ':', 2) else '' end;
    if code in ('buyer', 'seller', 'buyer_agent', 'listing_agent', 'lender', 'homeowner') then
      if code = 'homeowner' or who = '' then v := code;
      elsif who !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Source of business: pick one from the list.' using errcode = '23514';
      else
        party_role := case code
          when 'buyer' then 'Client-Buyer'
          when 'seller' then 'Client-Seller'
          when 'buyer_agent' then 'Buyer Agent'
          when 'listing_agent' then 'Listing Agent'
          when 'lender' then 'Lender'
          else '' end;
        if party_role = ''
           or not exists (
             select 1 from public.contacts c
             where c.id = who::uuid
               and c.is_demo is not distinct from private.viewer_is_demo()
               and (c.profile_id is null or exists (
                 select 1 from public.profiles pr
                 where pr.id = c.profile_id and pr.status = 'active' and pr.is_demo is not distinct from private.viewer_is_demo()))
               and exists (
                 select 1 from public.deal_participants p
                 where p.deal_id = p_deal and p.role = party_role and p.contact_id = c.id)) then
          raise exception 'Source of business: choose a person who is on this order in that role.' using errcode = '23514'; end if;
        v := code || ':' || who; end if;
    else
      select o.value into v from public.crm_picklist_options o where o.list_key = 'leadSource' and not o.retired and (o.value = v or lower(o.label) = lower(v)) order by (o.value = v) desc limit 1;
      if v is null then raise exception 'Source of business: pick one from the list.' using errcode = '23514'; end if;
    end if;
  end if;
  if v is distinct from cur then
    insert into public.deal_business_sources (deal_id, source, set_by) values (p_deal, v, auth.uid())
      on conflict (deal_id) do update set source = excluded.source, set_by = excluded.set_by, set_at = now();
    perform private.log_activity(p_deal, 'deal.source', 'deal', p_deal, 'Source of business set to ' || private.business_source_label(v)); end if;
  return v; end $$;
revoke all on function public.set_deal_source(uuid, text) from public, anon;
grant execute on function public.set_deal_source(uuid, text) to authenticated;

create or replace function public.crm_deal_filters() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare everyone boolean;
begin
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  everyone := private.crm_deal_scope_all();
  return jsonb_build_object('scope', case when everyone then 'all' else 'own' end, 'role', private.me_role(),
    'me', jsonb_build_object('id', auth.uid(), 'name', private.crm_name(auth.uid())),
    'owners', case when everyone then coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', btrim(p.first_name || ' ' || p.last_name), 'role', p.role) order by p.first_name, p.last_name)
      from public.profiles p where p.role in ('Sales Person', 'Sales Team') and (p.status = 'active' or exists (select 1 from public.deal_sales_people s where s.sales_id = p.id))), '[]') else '[]' end,
    'clients', case when everyone then coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', btrim(c.first_name || ' ' || c.last_name)) order by c.first_name, c.last_name)
      from public.contacts c where exists (select 1 from public.deal_participants p where p.contact_id = c.id and p.role in ('Client-Buyer', 'Client-Seller') and private.crm_deal_visible(p.deal_id))), '[]') else '[]' end,
    'sources', coalesce((select jsonb_agg(x order by x->>'position', x->>'value') from (
      select jsonb_build_object('value', v, 'label', l, 'position', p) as x from (values
        ('buyer', 'Buyer', '1'), ('seller', 'Seller', '2'), ('buyer_agent', 'Buyer''s agent', '3'), ('listing_agent', 'Listing agent', '4'), ('lender', 'Lender', '5'), ('homeowner', 'Homeowner', '6')) r(v, l, p)
      union all
      select jsonb_build_object('value', o.value, 'label', o.label || case when o.retired then ' (retired)' else '' end, 'position', (100 + o.position)::text)
      from public.crm_picklist_options o where o.list_key = 'leadSource' and (not o.retired or exists (select 1 from public.deal_business_sources b where b.source = o.value and private.crm_deal_visible(b.deal_id)))
    ) s), '[]'),
    'statuses', '["Open", "Closed", "On Hold", "Cancelled", "All"]'::jsonb);
end $$;
revoke all on function public.crm_deal_filters() from public, anon;
grant execute on function public.crm_deal_filters() to authenticated;

alter table public.deal_business_sources enable row level security;
revoke insert, update, delete on table public.deal_business_sources from public, anon, authenticated;
