-- Rollback for 20261125100000_crm_deal_stage_labels.sql.
-- Restores the CRM stage label that was in place before that file: Open reads as Active,
-- and Cancelled is left as Cancelled. The saved function bodies below are the definitions
-- from supabase/baseline/test_schema.sql at the time of this change.
-- Does not change public.deals.status, public.deals.stage, or any policy.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;
set local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.crm_deal_row(g deals)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select jsonb_build_object('id', g.id, 'name', btrim(g.street || ', ' || g.city || ', ' || g.state || ' ' || g.zip), 'fileNumber', g.file_number, 'propertyAddress', g.street || ', ' || g.city || ', ' || g.state || ' ' || g.zip,
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
    'createdAt', g.created_at) $function$;

CREATE OR REPLACE FUNCTION public.crm_search(p_q text, p_module text DEFAULT NULL::text, p_limit integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare q text := btrim(coalesce(p_q, '')); d text; lim int := least(greatest(coalesce(p_limit, 5), 1), 100); pat text; out jsonb := '{}';
begin
  perform private.crm_need();
  if char_length(q) < 2 then return out; end if;
  if char_length(q) > 100 then raise exception 'Search for at most 100 characters.' using errcode = '22023'; end if;
  if p_module is not null and p_module not in ('contacts', 'leads', 'accounts', 'deals', 'tasks', 'meetings', 'calls') then raise exception 'Unknown module.' using errcode = '22023'; end if;
  d := regexp_replace(q, '\D', '', 'g'); if char_length(d) < 3 or q ~ '[^0-9()+. -]' then d := null; end if;   -- a phone search: digits and phone punctuation only
  pat := '%' || replace(replace(replace(lower(q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  if p_module is null or p_module = 'contacts' then
    out := out || jsonb_build_object('contacts', coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', c.id, 'name', btrim(c.first_name || ' ' || c.last_name), 'email', c.email, 'phone', c.phone,
        'createdBy', private.crm_name(c.created_by), 'ownerName', private.crm_name(c.crm_owner_id)) x
      from public.contacts c where private.crm_contact_visible(c.id) and (lower(btrim(c.first_name || ' ' || c.last_name)) like pat or lower(c.email) like pat or (d is not null and regexp_replace(c.phone, '\D', '', 'g') like '%' || d || '%'))
      order by c.last_name, c.first_name limit lim) s), '[]')); end if;
  if p_module is null or p_module = 'leads' then
    out := out || jsonb_build_object('leads', coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', l.id, 'name', btrim(l.first_name || ' ' || l.last_name), 'email', l.email, 'phone', l.phone, 'company', l.company,
        'ownerName', private.crm_name(l.owner_id)) x
      from public.crm_leads l where (lower(btrim(l.first_name || ' ' || l.last_name)) like pat or lower(l.email) like pat or lower(l.company) like pat or (d is not null and regexp_replace(l.phone, '\D', '', 'g') like '%' || d || '%'))
      order by l.last_name, l.first_name limit lim) s), '[]')); end if;
  if p_module is null or p_module = 'accounts' then
    out := out || jsonb_build_object('accounts', coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', a.id, 'name', a.name, 'phone', a.phone, 'ownerName', private.crm_name(a.owner_id)) x
      from public.crm_accounts a where (lower(a.name) like pat or (d is not null and regexp_replace(a.phone, '\D', '', 'g') like '%' || d || '%')) order by a.name limit lim) s), '[]')); end if;
  if p_module is null or p_module = 'deals' then
    out := out || jsonb_build_object('deals', coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', g.id, 'name', g.file_number || ' ' || g.street, 'amount', coalesce(g.purchase_price, g.loan_amount),
        'stage', case g.status when 'Open' then 'Active' else g.status end, 'closingDate', g.closing_date,
        'clientName', (select string_agg(btrim(c.first_name || ' ' || c.last_name), ', ') from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id and p.role in ('Client-Buyer', 'Client-Seller'))) x
      from public.deals g where private.crm_deal_visible(g.id) and (lower(g.file_number || ' ' || g.street || ' ' || g.city) like pat
        or exists (select 1 from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id
          and (lower(btrim(c.first_name || ' ' || c.last_name)) like pat or lower(c.email) like pat or (d is not null and regexp_replace(c.phone, '\D', '', 'g') like '%' || d || '%'))))
      order by g.created_at desc limit lim) s), '[]')); end if;
  if p_module is null or p_module in ('tasks', 'meetings', 'calls') then
    out := out || coalesce((select jsonb_object_agg(m, rows) from (select m, coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', a.id, 'subject', a.subject, 'dueDate', a.due_date, 'status', a.status, 'priority', a.priority,
          'from', a.starts_at, 'to', a.ends_at, 'callType', a.call_type, 'callStart', a.call_start, 'callDuration', a.call_duration,
          'relatedTo', private.crm_related_name(a.entity, a.entity_id), 'entity', a.entity, 'entityId', a.entity_id) x
        from public.crm_activities a where a.kind = case m when 'tasks' then 'task' when 'meetings' then 'meeting' else 'call' end
          and (lower(a.subject) like pat or lower(coalesce(private.crm_related_name(a.entity, a.entity_id), '')) like pat) order by a.created_at desc limit lim) s), '[]') rows
      from unnest(array['tasks', 'meetings', 'calls']) m where p_module is null or p_module = m) z), '{}'); end if;
  return out; end $function$;


do $words$
begin
  if to_regclass('public.crm_dash_components') is not null then
    update public.crm_dash_components c
    set criteria = (
      select coalesce(jsonb_agg(
        case
          when e.value->>'field' = 'stage' and e.value->>'value' = 'Opened' then jsonb_set(e.value, '{value}', '"Active"')
          when e.value->>'field' = 'stage' and e.value->>'value' = 'Canceled' then jsonb_set(e.value, '{value}', '"Cancelled"')
          else e.value
        end
        order by e.ord
      ), '[]'::jsonb)
      from jsonb_array_elements(c.criteria) with ordinality as e(value, ord)
    )
    where c.module = 'deals'
      and exists (
        select 1 from jsonb_array_elements(c.criteria) x
        where x->>'field' = 'stage' and x->>'value' in ('Opened', 'Canceled')
      );
  end if;
  if to_regclass('public.crm_reports') is not null then
    update public.crm_reports r
    set filters = (
      select coalesce(jsonb_agg(
        case
          when e.value->>'field' = 'stage' and e.value->>'value' = 'Opened' then jsonb_set(e.value, '{value}', '"Active"')
          when e.value->>'field' = 'stage' and e.value->>'value' = 'Canceled' then jsonb_set(e.value, '{value}', '"Cancelled"')
          else e.value
        end
        order by e.ord
      ), '[]'::jsonb)
      from jsonb_array_elements(r.filters) with ordinality as e(value, ord)
    )
    where r.module = 'deals'
      and exists (
        select 1 from jsonb_array_elements(r.filters) x
        where x->>'field' = 'stage' and x->>'value' in ('Opened', 'Canceled')
      );
  end if;
  if to_regclass('public.crm_view_criteria') is not null and to_regclass('public.crm_views') is not null then
    update public.crm_view_criteria k
    set value_text = case k.value_text when 'Opened' then 'Active' when 'Canceled' then 'Cancelled' else k.value_text end,
        value2_text = case k.value2_text when 'Opened' then 'Active' when 'Canceled' then 'Cancelled' else k.value2_text end
    from public.crm_views v
    where k.view_id = v.id and v.module = 'deals' and k.field_key = 'stage'
      and (k.value_text in ('Opened', 'Canceled') or k.value2_text in ('Opened', 'Canceled'));
  end if;
  if to_regclass('public.crm_saved_filter_values') is not null and to_regclass('public.crm_saved_filters') is not null then
    update public.crm_saved_filter_values x
    set value_text = case x.value_text when 'Opened' then 'Active' when 'Canceled' then 'Cancelled' else x.value_text end
    from public.crm_saved_filters f
    where x.filter_id = f.id and f.module = 'deals' and x.field_name = 'stage'
      and x.value_text in ('Opened', 'Canceled');
  end if;
end
$words$;

do $check$
declare def text;
begin
  def := pg_get_functiondef('private.crm_deal_row(public.deals)'::regprocedure);
  if position($e$then 'Active'$e$ in def) = 0 or position($e$then 'Opened'$e$ in def) > 0 then
    raise exception 'readback: crm_deal_row was not restored';
  end if;
  def := pg_get_functiondef('public.crm_search(text,text,integer)'::regprocedure);
  if position($e$then 'Active'$e$ in def) = 0 or position($e$then 'Opened'$e$ in def) > 0 then
    raise exception 'readback: crm_search was not restored';
  end if;
end
$check$;

commit;
