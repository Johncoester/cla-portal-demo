-- Place Order (John, Nov 6). Additive. Does not create or alter anything in schema auth.
-- 1. The Processor on an order may be an active Processor, Preprocessor, Admin or Super admin
--    in the same demo/real world as the viewer. Salespeople, clients and outside users still cannot.
-- 2. Source of business accepts who referred the file: buyer_agent, listing_agent, lender, homeowner.
--    A linked contact is stored in the existing text as "<code>:<contact uuid>" (no new column).
--    Older Lead Source values (Google Ads, and so on) still save and still read with their label.

create or replace function private.business_source_label(p_source text) returns text
language sql stable security definer set search_path = public as $$
  select case split_part(btrim(coalesce(p_source, '')), ':', 1)
    when 'buyer_agent' then 'Buyer''s agent'
    when 'listing_agent' then 'Listing agent'
    when 'lender' then 'Lender'
    when 'homeowner' then 'Homeowner'
    else private.crm_option_label('leadSource', btrim(coalesce(p_source, '')))
  end
  || case
    when split_part(btrim(coalesce(p_source, '')), ':', 1) in ('buyer_agent', 'listing_agent', 'lender')
     and split_part(btrim(coalesce(p_source, '')), ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then coalesce(' — ' || nullif((select btrim(c.first_name || ' ' || c.last_name) from public.contacts c where c.id = split_part(btrim(p_source), ':', 2)::uuid), ''), '')
    else ''
  end $$;
revoke all on function private.business_source_label(text) from public, anon, authenticated;

create or replace function private.deal_processor_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.processor_id is null and auth.uid() is not null then
    if private.me_role() = 'Processor' then new.processor_id := auth.uid();
    elsif private.is_processor() then raise exception 'Pick the Processor for this order.' using errcode = 'P0001'; end if;
  end if;
  if new.processor_id is not null and (tg_op = 'INSERT' or new.processor_id is distinct from old.processor_id)
     and not exists (select 1 from public.profiles p where p.id = new.processor_id and p.status = 'active'
       and p.role in ('Processor', 'Preprocessor', 'Admin', 'Super admin') and p.is_demo is not distinct from coalesce(new.is_demo, false)) then
    raise exception 'The Processor on an order must be an active Processor, Preprocessor, Admin or Super admin.' using errcode = 'P0001'; end if;
  return new; end $$;

create or replace function public.set_deal_source(p_deal uuid, p_source text) returns text language plpgsql security definer set search_path = public as $$
declare cur text; v text := btrim(coalesce(p_source, '')); code text; who text;
begin
  if not private.is_processor() then raise exception 'Only a Processor or Admin can do this.' using errcode = '42501'; end if;
  if not exists (select 1 from public.deals where id = p_deal) or not private.can_access_deal(p_deal) then raise exception 'Order not found.' using errcode = 'P0002'; end if;
  select source into cur from public.deal_business_sources where deal_id = p_deal;
  if v = '' then update public.deal_business_sources set source = '', set_by = auth.uid(), set_at = now() where deal_id = p_deal and source <> ''; return ''; end if;
  if v is distinct from cur then
    code := split_part(v, ':', 1); who := case when position(':' in v) > 0 then split_part(v, ':', 2) else '' end;
    if code in ('buyer_agent', 'listing_agent', 'lender', 'homeowner') then
      if code = 'homeowner' or who = '' then v := code;
      elsif who !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or not exists (select 1 from public.contacts c where c.id = who::uuid and c.is_demo = private.viewer_is_demo()) then
        raise exception 'Source of business: pick one from the list.' using errcode = '23514';
      else v := code || ':' || who; end if;
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

create or replace function public.deal_source(p_deal uuid) returns table (value text, label text) language sql stable security definer set search_path = public as $$
  select s.source, private.business_source_label(s.source) from public.deal_business_sources s
  where s.deal_id = p_deal and s.source <> '' and private.is_staffish() and private.can_access_deal(p_deal) $$;

-- CRM deal rows keep Lead Source labels and also label a referral (code or code:contact).
create or replace function private.crm_deal_row(g public.deals) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', g.id, 'name', g.file_number || ' ' || g.street, 'fileNumber', g.file_number, 'propertyAddress', g.street || ', ' || g.city || ', ' || g.state || ' ' || g.zip,
    'amount', g.purchase_price, 'loanAmount', g.loan_amount, 'stage', case g.status when 'Open' then 'Active' else g.status end, 'status', g.status,
    'closingDate', g.closing_date, 'openDate', g.open_date, 'county', coalesce(g.county, ''), 'city', g.city, 'transactionType', g.transaction_type,
    'clientName', coalesce((select string_agg(distinct btrim(c.first_name || ' ' || c.last_name), ', ') from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id and p.role in ('Client-Buyer', 'Client-Seller')), ''),
    'clientIds', coalesce((select jsonb_agg(distinct p.contact_id) from public.deal_participants p where p.deal_id = g.id and p.role in ('Client-Buyer', 'Client-Seller')), '[]'),
    'contactName', coalesce((select string_agg(distinct btrim(c.first_name || ' ' || c.last_name), ', ') from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id and p.role in ('Buyer Agent', 'Listing Agent')), ''),
    'ownerId', (select s.sales_id from public.deal_sales_people s where s.deal_id = g.id order by s.added_at, s.sales_id limit 1),
    'ownerName', coalesce((select private.crm_name(s.sales_id) from public.deal_sales_people s where s.deal_id = g.id order by s.added_at, s.sales_id limit 1), ''),
    'salesIds', coalesce((select jsonb_agg(s.sales_id order by s.added_at, s.sales_id) from public.deal_sales_people s where s.deal_id = g.id), '[]'),
    'salesReps', coalesce((select string_agg(private.crm_name(s.sales_id), ', ' order by s.added_at, s.sales_id) from public.deal_sales_people s where s.deal_id = g.id), ''),
    'source', coalesce((select b.source from public.deal_business_sources b where b.deal_id = g.id), ''),
    'sourceText', coalesce((select private.business_source_label(b.source) from public.deal_business_sources b where b.deal_id = g.id and b.source <> ''), ''),
    'createdAt', g.created_at) $$;

create or replace function public.crm_deals(p_status text default null, p_owner text default null, p_client uuid default null, p_source text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare st text := nullif(btrim(coalesce(p_status, '')), ''); ow text := nullif(btrim(coalesce(p_owner, '')), ''); src text := nullif(btrim(coalesce(p_source, '')), '');
begin
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  if st is not null and st <> 'All' and st not in ('Open', 'Closed', 'On Hold', 'Cancelled') then raise exception 'Unknown status.' using errcode = '22023'; end if;
  if ow is not null and ow <> 'none' and ow !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Unknown deal owner.' using errcode = '22023'; end if;
  if ow is not null and not private.crm_deal_scope_all() and ow <> auth.uid()::text then raise exception 'A Sales Person sees only their own deals.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(private.crm_deal_row(g) order by g.closing_date desc nulls last, g.file_number) from public.deals g
    where private.crm_deal_visible(g.id)
      and (st is null or st = 'All' or g.status = st)
      and (ow is null or (ow = 'none' and not exists (select 1 from public.deal_sales_people s where s.deal_id = g.id))
           or exists (select 1 from public.deal_sales_people s where s.deal_id = g.id and s.sales_id::text = ow))
      and (p_client is null or exists (select 1 from public.deal_participants p where p.deal_id = g.id and p.contact_id = p_client and p.role in ('Client-Buyer', 'Client-Seller')))
      and (src is null or (src = 'none' and coalesce((select b.source from public.deal_business_sources b where b.deal_id = g.id), '') = '')
           or exists (select 1 from public.deal_business_sources b where b.deal_id = g.id and (b.source = src or split_part(b.source, ':', 1) = src)))), '[]');
end $$;

create or replace function public.crm_deal_filters() returns jsonb language plpgsql stable security definer set search_path = public as $$
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
        ('buyer_agent', 'Buyer''s agent', '1'), ('listing_agent', 'Listing agent', '2'), ('lender', 'Lender', '3'), ('homeowner', 'Homeowner', '4')) r(v, l, p)
      union all
      select jsonb_build_object('value', o.value, 'label', o.label || case when o.retired then ' (retired)' else '' end, 'position', (100 + o.position)::text)
      from public.crm_picklist_options o where o.list_key = 'leadSource' and (not o.retired or exists (select 1 from public.deal_business_sources b where b.source = o.value and private.crm_deal_visible(b.deal_id)))
    ) s), '[]'),
    'statuses', '["Open", "Closed", "On Hold", "Cancelled", "All"]'::jsonb);
end $$;

select private.lock_function_search_paths();
