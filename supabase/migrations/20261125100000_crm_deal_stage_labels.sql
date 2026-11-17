-- Feedback 30 item 3 (Janine, confirmed). CRM deal Stage labels.
-- NOT applied to hosted TEST. The portal lead applies this. Do not apply it to production.
-- CRM Stage is a label computed from public.deals.status. It is not public.deals.stage
-- (the numeric order step) and it is not a stored word of its own.
-- This file does not update public.deals, does not change its default, and does not
-- change any policy on deals, tasks, or profiles. No new per-row helper.
-- Open still stays Open on the order. The CRM reads it as Opened. Active, the old CRM
-- word for an open order, is read as Opened. Cancelled on the order is read as Canceled.
-- Saved CRM filters that still say Active or Cancelled for a deal Stage are rewritten
-- to Opened and Canceled. Other modules are left alone.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;
set local check_function_bodies = off;

do $mig$
declare
  old_expr text := $e$case g.status when 'Open' then 'Active' else g.status end$e$;
  new_expr text := $e$case g.status when 'Open' then 'Opened' when 'Active' then 'Opened' when 'Cancelled' then 'Canceled' else g.status end$e$;
  sigs text[] := array['private.crm_deal_row(public.deals)', 'public.crm_search(text,text,integer)'];
  sig text;
  def text;
begin
  foreach sig in array sigs loop
    if to_regprocedure(sig) is null then
      raise exception 'drift: % is missing', sig;
    end if;
    def := pg_get_functiondef(sig::regprocedure);
    if position(new_expr in def) > 0 then
      continue;
    end if;
    if position(old_expr in def) = 0 then
      raise exception 'drift: % does not contain the Active deal stage label', sig;
    end if;
    execute replace(def, old_expr, new_expr);
  end loop;
end
$mig$;

do $words$
begin
  if to_regclass('public.crm_dash_components') is not null then
    update public.crm_dash_components c
    set criteria = (
      select coalesce(jsonb_agg(
        case
          when e.value->>'field' = 'stage' and e.value->>'value' = 'Active' then jsonb_set(e.value, '{value}', '"Opened"')
          when e.value->>'field' = 'stage' and e.value->>'value' = 'Cancelled' then jsonb_set(e.value, '{value}', '"Canceled"')
          else e.value
        end
        order by e.ord
      ), '[]'::jsonb)
      from jsonb_array_elements(c.criteria) with ordinality as e(value, ord)
    )
    where c.module = 'deals'
      and exists (
        select 1 from jsonb_array_elements(c.criteria) x
        where x->>'field' = 'stage' and x->>'value' in ('Active', 'Cancelled')
      );
  end if;
  if to_regclass('public.crm_reports') is not null then
    update public.crm_reports r
    set filters = (
      select coalesce(jsonb_agg(
        case
          when e.value->>'field' = 'stage' and e.value->>'value' = 'Active' then jsonb_set(e.value, '{value}', '"Opened"')
          when e.value->>'field' = 'stage' and e.value->>'value' = 'Cancelled' then jsonb_set(e.value, '{value}', '"Canceled"')
          else e.value
        end
        order by e.ord
      ), '[]'::jsonb)
      from jsonb_array_elements(r.filters) with ordinality as e(value, ord)
    )
    where r.module = 'deals'
      and exists (
        select 1 from jsonb_array_elements(r.filters) x
        where x->>'field' = 'stage' and x->>'value' in ('Active', 'Cancelled')
      );
  end if;
  if to_regclass('public.crm_view_criteria') is not null and to_regclass('public.crm_views') is not null then
    update public.crm_view_criteria k
    set value_text = case k.value_text when 'Active' then 'Opened' when 'Cancelled' then 'Canceled' else k.value_text end,
        value2_text = case k.value2_text when 'Active' then 'Opened' when 'Cancelled' then 'Canceled' else k.value2_text end
    from public.crm_views v
    where k.view_id = v.id and v.module = 'deals' and k.field_key = 'stage'
      and (k.value_text in ('Active', 'Cancelled') or k.value2_text in ('Active', 'Cancelled'));
  end if;
  if to_regclass('public.crm_saved_filter_values') is not null and to_regclass('public.crm_saved_filters') is not null then
    update public.crm_saved_filter_values x
    set value_text = case x.value_text when 'Active' then 'Opened' when 'Cancelled' then 'Canceled' else x.value_text end
    from public.crm_saved_filters f
    where x.filter_id = f.id and f.module = 'deals' and x.field_name = 'stage'
      and x.value_text in ('Active', 'Cancelled');
  end if;
end
$words$;

do $check$
declare sig text; def text;
begin
  foreach sig in array array['private.crm_deal_row(public.deals)', 'public.crm_search(text,text,integer)'] loop
    def := pg_get_functiondef(sig::regprocedure);
    if position($e$then 'Opened'$e$ in def) = 0 or position($e$then 'Active'$e$ in def) > 0 then
      raise exception 'readback: % stage label was not updated', sig;
    end if;
    if position('update public.deals' in lower(def)) > 0 then
      raise exception 'readback: % must not update deals', sig;
    end if;
  end loop;
end
$check$;

commit;
