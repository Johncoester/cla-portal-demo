-- Select-all for CRM mass update and mass email (JN-47).
-- NOT applied to hosted TEST (aqcervntopidtcazcmlv). The lead applies this file.
-- The browser sends the list filter. These functions return counts, or write, and do not
-- return full rows. EMAIL_DRAFT_BATCH (500) is the insert batch size, not a recipient cap.
-- Date bounds are computed once in America/New_York and compared to the bare column,
-- so a created/modified range can use an index. No per-row private.* call.
-- New functions only. The before-state is that they did not exist.
-- Rollback: supabase/rollbacks/20261112120000_crm_match_mass.sql

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $guard$
declare
  missing text;
  idx text;
  def text;
begin
  if to_regprocedure('auth.uid()') is null then
    raise exception 'drift: auth.uid() is missing';
  end if;
  select string_agg(need.col, ', ' order by need.col) into missing
  from unnest(array['id','first_name','last_name','email','phone','company','notes','status','source','owner_id','archived_at','converted_at','created_at','modified_at','role_in_company','crm_state','crm_county','crm_city','custom']) as need(col)
  where not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'crm_leads' and c.column_name = need.col);
  if missing is not null then raise exception 'drift: crm_leads is missing %', missing; end if;

  select string_agg(need.col, ', ' order by need.col) into missing
  from unnest(array['id','first_name','last_name','email','phone','company','crm_notes','crm_owner_id','crm_archived_at','created_at','modified_at','modified_by','profile_id','account_id','role_in_company','crm_state','crm_county','crm_city','relationship_status','lead_source','contact_type','tags','custom']) as need(col)
  where not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'contacts' and c.column_name = need.col);
  if missing is not null then raise exception 'drift: contacts is missing %', missing; end if;

  select string_agg(need.col, ', ' order by need.col) into missing
  from unnest(array['id','name','kind','notes','phone','city','owner_id','created_at','modified_at','archived_at','custom']) as need(col)
  where not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'crm_accounts' and c.column_name = need.col);
  if missing is not null then raise exception 'drift: crm_accounts is missing %', missing; end if;

  select string_agg(need.col, ', ' order by need.col) into missing
  from unnest(array['id','name','stage','notes','owner_id','contact_id','account_id','expected_close','created_at','modified_at','archived_at','custom']) as need(col)
  where not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'crm_opportunities' and c.column_name = need.col);
  if missing is not null then raise exception 'drift: crm_opportunities is missing %', missing; end if;

  select string_agg(need.col, ', ' order by need.col) into missing
  from unnest(array['id','notes','status','created_at','open_date','closing_date','file_number','street','city']) as need(col)
  where not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'deals' and c.column_name = need.col);
  if missing is not null then raise exception 'drift: deals is missing %', missing; end if;

  select string_agg(need.col, ', ' order by need.col) into missing
  from unnest(array['id','entity','entity_id','created_at']) as need(col)
  where not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'crm_activities' and c.column_name = need.col);
  if missing is not null then raise exception 'drift: crm_activities is missing %', missing; end if;

  select string_agg(need.col, ', ' order by need.col) into missing
  from unnest(array['id','entity','entity_id','from_email','to_emails','cc_emails','bcc_emails','subject','body_html','status','scheduled_at','created_by']) as need(col)
  where not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'crm_emails' and c.column_name = need.col);
  if missing is not null then raise exception 'drift: crm_emails is missing %', missing; end if;

  if not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'profiles' and c.column_name = 'email')
     or not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'profiles' and c.column_name = 'role') then
    raise exception 'drift: profiles.email or profiles.role is missing';
  end if;
  if to_regclass('public.deal_sales_people') is null or to_regclass('public.deal_participants') is null or to_regclass('public.deal_business_sources') is null then
    raise exception 'drift: deal salesperson, participant, or source table is missing';
  end if;

  foreach idx in array array[
    'crm_match_leads_created_idx','crm_match_leads_modified_idx','crm_match_contacts_created_idx','crm_match_contacts_modified_idx',
    'crm_match_accounts_created_idx','crm_match_accounts_modified_idx','crm_match_opps_created_idx','crm_match_opps_modified_idx',
    'crm_match_opps_close_idx','crm_match_deals_created_idx','crm_match_deals_open_idx','crm_match_deals_closing_idx','crm_match_activities_entity_idx'
  ]
  loop
    if to_regclass('public.' || idx) is not null then
      def := pg_get_indexdef(idx::regclass);
      if def !~ '^CREATE INDEX ' || def !~ idx then
        raise exception 'drift: % is %', idx, def;
      end if;
    end if;
  end loop;
end
$guard$;

create or replace function public.crm_date_bounds(p_spec jsonb, p_now timestamptz default now())
returns table(mode text, lo timestamptz, hi timestamptz, lo_date date, hi_date date)
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  d0 date;
  d1 date;
begin
  mode := 'none'; lo := null; hi := null; lo_date := null; hi_date := null;
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then
    return next; return;
  end if;
  if coalesce(p_spec->>'op', '') = 'empty' then mode := 'empty'; return next; return; end if;
  if coalesce(p_spec->>'op', '') = 'not_empty' then mode := 'present'; return next; return; end if;
  if coalesce(p_spec->>'op', '') = 'not_between' then mode := 'outside';
  else mode := 'range';
  end if;
  begin
    d0 := nullif(p_spec->>'from', '')::date;
    d1 := nullif(p_spec->>'to', '')::date;
  exception when others then
    raise exception 'Enter a real date.' using errcode = '22023';
  end;
  if d0 is null and d1 is null and coalesce(p_spec->>'op', '') = '' then
    mode := 'none'; return next; return;
  end if;
  if coalesce(p_spec->>'op', '') in ('not_between', 'between') and (d0 is null or d1 is null) then
    raise exception 'Enter both dates.' using errcode = '22023';
  end if;
  if d0 is not null and d1 is not null and d1 < d0 then
    declare
      swap date;
    begin
      swap := d0; d0 := d1; d1 := swap;
    end;
  end if;
  if d0 is not null then
    lo := d0::timestamp at time zone 'America/New_York';
    lo_date := d0;
  end if;
  if d1 is not null then
    hi := (d1 + 1)::timestamp at time zone 'America/New_York';
    hi_date := d1 + 1;
  end if;
  return next;
end
$$;

revoke all on function public.crm_date_bounds(jsonb, timestamptz) from public, anon;
grant execute on function public.crm_date_bounds(jsonb, timestamptz) to authenticated;

create or replace function public.crm_match_ids(p_module text, p_filter jsonb)
returns setof uuid
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  m text := case lower(btrim(coalesce(p_module, '')))
    when 'leads' then 'lead' when 'contacts' then 'contact' when 'clients' then 'contact'
    when 'accounts' then 'account' when 'companies' then 'account'
    when 'opportunities' then 'opportunity' when 'deals' then 'deal' else lower(btrim(coalesce(p_module, ''))) end;
  f jsonb := coalesce(p_filter, '{}'::jsonb);
  words text[];
  c_mode text; c_lo timestamptz; c_hi timestamptz; c_lo_d date; c_hi_d date;
  m_mode text; m_lo timestamptz; m_hi timestamptz; m_lo_d date; m_hi_d date;
  a_mode text; a_lo timestamptz; a_hi timestamptz; a_lo_d date; a_hi_d date;
  o_mode text; o_lo timestamptz; o_hi timestamptz; o_lo_d date; o_hi_d date;
  k_mode text; k_lo timestamptz; k_hi timestamptz; k_lo_d date; k_hi_d date;
  x_mode text; x_lo timestamptz; x_hi timestamptz; x_lo_d date; x_hi_d date;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if m not in ('lead', 'contact', 'account', 'opportunity', 'deal') then
    raise exception 'Unknown list.' using errcode = '22023';
  end if;
  words := regexp_split_to_array(lower(btrim(coalesce(f->>'q', ''))), '\s+');
  select b.mode, b.lo, b.hi, b.lo_date, b.hi_date into c_mode, c_lo, c_hi, c_lo_d, c_hi_d from public.crm_date_bounds(coalesce((select s from jsonb_array_elements(coalesce(f->'dates', '[]'::jsonb)) s where s->>'field' = 'createdAt' limit 1), '{}'::jsonb)) b;
  select b.mode, b.lo, b.hi, b.lo_date, b.hi_date into m_mode, m_lo, m_hi, m_lo_d, m_hi_d from public.crm_date_bounds(coalesce((select s from jsonb_array_elements(coalesce(f->'dates', '[]'::jsonb)) s where s->>'field' = 'modifiedAt' limit 1), '{}'::jsonb)) b;
  select b.mode, b.lo, b.hi, b.lo_date, b.hi_date into a_mode, a_lo, a_hi, a_lo_d, a_hi_d from public.crm_date_bounds(coalesce((select s from jsonb_array_elements(coalesce(f->'dates', '[]'::jsonb)) s where s->>'field' = 'lastActivityAt' limit 1), '{}'::jsonb)) b;
  select b.mode, b.lo, b.hi, b.lo_date, b.hi_date into o_mode, o_lo, o_hi, o_lo_d, o_hi_d from public.crm_date_bounds(coalesce((select s from jsonb_array_elements(coalesce(f->'dates', '[]'::jsonb)) s where s->>'field' = 'openDate' limit 1), '{}'::jsonb)) b;
  select b.mode, b.lo, b.hi, b.lo_date, b.hi_date into k_mode, k_lo, k_hi, k_lo_d, k_hi_d from public.crm_date_bounds(coalesce((select s from jsonb_array_elements(coalesce(f->'dates', '[]'::jsonb)) s where s->>'field' = 'closingDate' limit 1), '{}'::jsonb)) b;
  select b.mode, b.lo, b.hi, b.lo_date, b.hi_date into x_mode, x_lo, x_hi, x_lo_d, x_hi_d from public.crm_date_bounds(coalesce((select s from jsonb_array_elements(coalesce(f->'dates', '[]'::jsonb)) s where s->>'field' = 'expectedClose' limit 1), '{}'::jsonb)) b;

  if m = 'lead' then
    return query select l.id from public.crm_leads l
    where (coalesce(f->>'archived', '') = 'all' or (coalesce(f->>'archived', '') = 'only' and l.archived_at is not null) or (coalesce(f->>'archived', '') = '' and l.archived_at is null))
      and (coalesce(f->>'converted', '') = 'all' or (coalesce(f->>'converted', '') = 'only' and l.converted_at is not null) or (coalesce(f->>'converted', '') = '' and l.converted_at is null))
      and (nullif(f->>'ownerId', '') is null or (f->>'ownerId' = 'none' and l.owner_id is null) or l.owner_id::text = f->>'ownerId')
      and (nullif(f->>'relationshipStatus', '') is null or l.status = f->>'relationshipStatus')
      and (nullif(f->>'leadSource', '') is null or l.source = f->>'leadSource')
      and (nullif(f->>'roleInCompany', '') is null or l.role_in_company = f->>'roleInCompany')
      and (nullif(f->>'state', '') is null or l.crm_state = f->>'state')
      and (nullif(f->>'county', '') is null or (f->>'county' = 'none' and btrim(coalesce(l.crm_county, '')) = '') or lower(l.crm_county) = lower(f->>'county'))
      and (f->'custom' is null or f->'custom' = '{}'::jsonb or l.custom @> (f->'custom'))
      and (btrim(coalesce(f->>'q', '')) = '' or lower(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '') || ' ' || coalesce(l.email, '') || ' ' || coalesce(l.company, '') || ' ' || coalesce(l.phone, '') || ' ' || coalesce(l.notes, '') || ' ' || coalesce(l.crm_county, '') || ' ' || coalesce(l.crm_city, '')) like all (array(select '%' || w || '%' from unnest(words) w where w <> '')))
      and (c_mode = 'none' or (c_mode = 'empty' and l.created_at is null) or (c_mode = 'present' and l.created_at is not null) or (c_mode = 'outside' and l.created_at is not null and ((c_lo is not null and l.created_at < c_lo) or (c_hi is not null and l.created_at >= c_hi))) or (c_mode = 'range' and (c_lo is null or l.created_at >= c_lo) and (c_hi is null or l.created_at < c_hi)))
      and (m_mode = 'none' or (m_mode = 'empty' and l.modified_at is null) or (m_mode = 'present' and l.modified_at is not null) or (m_mode = 'outside' and l.modified_at is not null and ((m_lo is not null and l.modified_at < m_lo) or (m_hi is not null and l.modified_at >= m_hi))) or (m_mode = 'range' and (m_lo is null or l.modified_at >= m_lo) and (m_hi is null or l.modified_at < m_hi)))
      and (a_mode = 'none' or (a_mode = 'empty' and not exists (select 1 from public.crm_activities act where act.entity = 'lead' and act.entity_id = l.id))
        or (a_mode = 'present' and exists (select 1 from public.crm_activities act where act.entity = 'lead' and act.entity_id = l.id))
        or (a_mode in ('range', 'outside') and exists (select 1 from (select max(act.created_at) as last_at from public.crm_activities act where act.entity = 'lead' and act.entity_id = l.id) z
          where z.last_at is not null and ((a_mode = 'range' and (a_lo is null or z.last_at >= a_lo) and (a_hi is null or z.last_at < a_hi)) or (a_mode = 'outside' and ((a_lo is not null and z.last_at < a_lo) or (a_hi is not null and z.last_at >= a_hi)))))));
  elsif m = 'contact' then
    return query select c.id from public.contacts c
    where not exists (select 1 from public.profiles p where p.id = c.profile_id and p.status is distinct from 'removed' and p.role is distinct from 'Outside user')
      and (coalesce(f->>'archived', '') = 'all' or (coalesce(f->>'archived', '') = 'only' and c.crm_archived_at is not null) or (coalesce(f->>'archived', '') = '' and c.crm_archived_at is null))
      and (nullif(f->>'ownerId', '') is null or (f->>'ownerId' = 'none' and c.crm_owner_id is null) or c.crm_owner_id::text = f->>'ownerId')
      and (nullif(f->>'relationshipStatus', '') is null or c.relationship_status = f->>'relationshipStatus')
      and (nullif(f->>'leadSource', '') is null or c.lead_source = f->>'leadSource')
      and (nullif(f->>'roleInCompany', '') is null or c.role_in_company = f->>'roleInCompany')
      and (nullif(f->>'state', '') is null or c.crm_state = f->>'state')
      and (nullif(f->>'contactType', '') is null or c.contact_type = f->>'contactType')
      and (nullif(f->>'county', '') is null or (f->>'county' = 'none' and btrim(coalesce(c.crm_county, '')) = '') or lower(c.crm_county) = lower(f->>'county'))
      and (nullif(f->>'tag', '') is null or lower(f->>'tag') = any (c.tags))
      and (f->'custom' is null or f->'custom' = '{}'::jsonb or c.custom @> (f->'custom'))
      and (btrim(coalesce(f->>'q', '')) = '' or lower(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '') || ' ' || coalesce(c.email, '') || ' ' || coalesce(c.company, '') || ' ' || coalesce(c.phone, '') || ' ' || coalesce(c.crm_notes, '') || ' ' || coalesce(c.crm_county, '') || ' ' || coalesce(c.crm_city, '')) like all (array(select '%' || w || '%' from unnest(words) w where w <> '')))
      and (c_mode = 'none' or (c_mode = 'empty' and c.created_at is null) or (c_mode = 'present' and c.created_at is not null) or (c_mode = 'outside' and c.created_at is not null and ((c_lo is not null and c.created_at < c_lo) or (c_hi is not null and c.created_at >= c_hi))) or (c_mode = 'range' and (c_lo is null or c.created_at >= c_lo) and (c_hi is null or c.created_at < c_hi)))
      and (m_mode = 'none' or (m_mode = 'empty' and c.modified_at is null) or (m_mode = 'present' and c.modified_at is not null) or (m_mode = 'outside' and c.modified_at is not null and ((m_lo is not null and c.modified_at < m_lo) or (m_hi is not null and c.modified_at >= m_hi))) or (m_mode = 'range' and (m_lo is null or c.modified_at >= m_lo) and (m_hi is null or c.modified_at < m_hi)))
      and (a_mode = 'none' or (a_mode = 'empty' and not exists (select 1 from public.crm_activities act where act.entity = 'contact' and act.entity_id = c.id))
        or (a_mode = 'present' and exists (select 1 from public.crm_activities act where act.entity = 'contact' and act.entity_id = c.id))
        or (a_mode in ('range', 'outside') and exists (select 1 from (select max(act.created_at) as last_at from public.crm_activities act where act.entity = 'contact' and act.entity_id = c.id) z
          where z.last_at is not null and ((a_mode = 'range' and (a_lo is null or z.last_at >= a_lo) and (a_hi is null or z.last_at < a_hi)) or (a_mode = 'outside' and ((a_lo is not null and z.last_at < a_lo) or (a_hi is not null and z.last_at >= a_hi)))))));
  elsif m = 'account' then
    return query select a.id from public.crm_accounts a
    where (coalesce(f->>'archived', '') = 'all' or (coalesce(f->>'archived', '') = 'only' and a.archived_at is not null) or (coalesce(f->>'archived', '') = '' and a.archived_at is null))
      and (nullif(f->>'ownerId', '') is null or (f->>'ownerId' = 'none' and a.owner_id is null) or a.owner_id::text = f->>'ownerId')
      and (nullif(f->>'kind', '') is null or a.kind = f->>'kind')
      and (f->'custom' is null or f->'custom' = '{}'::jsonb or a.custom @> (f->'custom'))
      and (btrim(coalesce(f->>'q', '')) = '' or lower(coalesce(a.name, '') || ' ' || coalesce(a.city, '') || ' ' || coalesce(a.notes, '') || ' ' || coalesce(a.phone, '')) like all (array(select '%' || w || '%' from unnest(words) w where w <> '')))
      and (c_mode = 'none' or (c_mode = 'empty' and a.created_at is null) or (c_mode = 'present' and a.created_at is not null) or (c_mode = 'outside' and a.created_at is not null and ((c_lo is not null and a.created_at < c_lo) or (c_hi is not null and a.created_at >= c_hi))) or (c_mode = 'range' and (c_lo is null or a.created_at >= c_lo) and (c_hi is null or a.created_at < c_hi)))
      and (m_mode = 'none' or (m_mode = 'empty' and a.modified_at is null) or (m_mode = 'present' and a.modified_at is not null) or (m_mode = 'outside' and a.modified_at is not null and ((m_lo is not null and a.modified_at < m_lo) or (m_hi is not null and a.modified_at >= m_hi))) or (m_mode = 'range' and (m_lo is null or a.modified_at >= m_lo) and (m_hi is null or a.modified_at < m_hi)))
      and (a_mode = 'none' or (a_mode = 'empty' and not exists (select 1 from public.crm_activities act where act.entity = 'account' and act.entity_id = a.id))
        or (a_mode = 'present' and exists (select 1 from public.crm_activities act where act.entity = 'account' and act.entity_id = a.id))
        or (a_mode in ('range', 'outside') and exists (select 1 from (select max(act.created_at) as last_at from public.crm_activities act where act.entity = 'account' and act.entity_id = a.id) z
          where z.last_at is not null and ((a_mode = 'range' and (a_lo is null or z.last_at >= a_lo) and (a_hi is null or z.last_at < a_hi)) or (a_mode = 'outside' and ((a_lo is not null and z.last_at < a_lo) or (a_hi is not null and z.last_at >= a_hi)))))));
  elsif m = 'opportunity' then
    return query select o.id from public.crm_opportunities o
    where (coalesce(f->>'archived', '') = 'all' or (coalesce(f->>'archived', '') = 'only' and o.archived_at is not null) or (coalesce(f->>'archived', '') = '' and o.archived_at is null))
      and (nullif(f->>'ownerId', '') is null or (f->>'ownerId' = 'none' and o.owner_id is null) or o.owner_id::text = f->>'ownerId')
      and (nullif(f->>'stage', '') is null or o.stage = f->>'stage')
      and (f->'custom' is null or f->'custom' = '{}'::jsonb or o.custom @> (f->'custom'))
      and (btrim(coalesce(f->>'q', '')) = '' or lower(coalesce(o.name, '') || ' ' || coalesce(o.notes, '')) like all (array(select '%' || w || '%' from unnest(words) w where w <> '')))
      and (c_mode = 'none' or (c_mode = 'empty' and o.created_at is null) or (c_mode = 'present' and o.created_at is not null) or (c_mode = 'outside' and o.created_at is not null and ((c_lo is not null and o.created_at < c_lo) or (c_hi is not null and o.created_at >= c_hi))) or (c_mode = 'range' and (c_lo is null or o.created_at >= c_lo) and (c_hi is null or o.created_at < c_hi)))
      and (m_mode = 'none' or (m_mode = 'empty' and o.modified_at is null) or (m_mode = 'present' and o.modified_at is not null) or (m_mode = 'outside' and o.modified_at is not null and ((m_lo is not null and o.modified_at < m_lo) or (m_hi is not null and o.modified_at >= m_hi))) or (m_mode = 'range' and (m_lo is null or o.modified_at >= m_lo) and (m_hi is null or o.modified_at < m_hi)))
      and (x_mode = 'none' or (x_mode = 'empty' and o.expected_close is null) or (x_mode = 'present' and o.expected_close is not null) or (x_mode = 'outside' and o.expected_close is not null and ((x_lo_d is not null and o.expected_close < x_lo_d) or (x_hi_d is not null and o.expected_close >= x_hi_d))) or (x_mode = 'range' and (x_lo_d is null or o.expected_close >= x_lo_d) and (x_hi_d is null or o.expected_close < x_hi_d)));
  else
    return query select g.id from public.deals g
    where (nullif(f->>'status', '') is null or f->>'status' = 'All' or g.status = f->>'status')
      and (nullif(f->>'ownerId', '') is null or (f->>'ownerId' = 'none' and not exists (select 1 from public.deal_sales_people s where s.deal_id = g.id)) or exists (select 1 from public.deal_sales_people s where s.deal_id = g.id and s.sales_id::text = f->>'ownerId'))
      and (nullif(f->>'clientId', '') is null or exists (select 1 from public.deal_participants p where p.deal_id = g.id and p.contact_id::text = f->>'clientId' and p.role in ('Client-Buyer', 'Client-Seller')))
      and (nullif(f->>'source', '') is null or (f->>'source' = 'none' and not exists (select 1 from public.deal_business_sources b where b.deal_id = g.id and coalesce(b.source, '') <> '')) or exists (select 1 from public.deal_business_sources b where b.deal_id = g.id and (b.source = f->>'source' or split_part(b.source, ':', 1) = f->>'source')))
      and (btrim(coalesce(f->>'q', '')) = '' or lower(coalesce(g.file_number, '') || ' ' || coalesce(g.street, '') || ' ' || coalesce(g.city, '') || ' ' || coalesce(g.notes, '')) like all (array(select '%' || w || '%' from unnest(words) w where w <> '')))
      and (c_mode = 'none' or (c_mode = 'range' and (c_lo is null or g.created_at >= c_lo) and (c_hi is null or g.created_at < c_hi)) or (c_mode = 'empty' and g.created_at is null) or (c_mode = 'present' and g.created_at is not null) or (c_mode = 'outside' and g.created_at is not null and ((c_lo is not null and g.created_at < c_lo) or (c_hi is not null and g.created_at >= c_hi))))
      and (o_mode = 'none' or (o_mode = 'empty' and g.open_date is null) or (o_mode = 'present' and g.open_date is not null) or (o_mode = 'outside' and g.open_date is not null and ((o_lo_d is not null and g.open_date < o_lo_d) or (o_hi_d is not null and g.open_date >= o_hi_d))) or (o_mode = 'range' and (o_lo_d is null or g.open_date >= o_lo_d) and (o_hi_d is null or g.open_date < o_hi_d)))
      and (k_mode = 'none' or (k_mode = 'empty' and g.closing_date is null) or (k_mode = 'present' and g.closing_date is not null) or (k_mode = 'outside' and g.closing_date is not null and ((k_lo_d is not null and g.closing_date < k_lo_d) or (k_hi_d is not null and g.closing_date >= k_hi_d))) or (k_mode = 'range' and (k_lo_d is null or g.closing_date >= k_lo_d) and (k_hi_d is null or g.closing_date < k_hi_d)))
      and (a_mode = 'none' or (a_mode = 'empty' and not exists (select 1 from public.crm_activities act where act.entity = 'deal' and act.entity_id = g.id))
        or (a_mode = 'present' and exists (select 1 from public.crm_activities act where act.entity = 'deal' and act.entity_id = g.id))
        or (a_mode in ('range', 'outside') and exists (select 1 from (select max(act.created_at) as last_at from public.crm_activities act where act.entity = 'deal' and act.entity_id = g.id) z
          where z.last_at is not null and ((a_mode = 'range' and (a_lo is null or z.last_at >= a_lo) and (a_hi is null or z.last_at < a_hi)) or (a_mode = 'outside' and ((a_lo is not null and z.last_at < a_lo) or (a_hi is not null and z.last_at >= a_hi)))))));
  end if;
end
$$;

create or replace function public.crm_match_plan(p_module text, p_filter jsonb, p_action text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  m text := case lower(btrim(coalesce(p_module, '')))
    when 'leads' then 'lead' when 'contacts' then 'contact' when 'clients' then 'contact'
    when 'accounts' then 'account' when 'companies' then 'account'
    when 'opportunities' then 'opportunity' when 'deals' then 'deal' else lower(btrim(coalesce(p_module, ''))) end;
  action text := lower(btrim(coalesce(p_action, 'update')));
  n int;
  recipients int;
  skipped int;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if action not in ('update', 'email') then raise exception 'Unknown action.' using errcode = '22023'; end if;
  select count(*) into n from public.crm_match_ids(m, p_filter);
  if action = 'update' then
    return jsonb_build_object('count', n, 'records', n, 'recipients', n, 'skipped', 0);
  end if;
  if m = 'lead' then
    select count(*) filter (where email <> ''), count(*) filter (where email = '') into recipients, skipped from (
      select distinct lower(btrim(l.email)) as email from public.crm_leads l where l.id in (select public.crm_match_ids(m, p_filter))
    ) s;
  elsif m = 'contact' then
    select count(*) filter (where email <> ''), count(*) filter (where email = '') into recipients, skipped from (
      select distinct lower(btrim(c.email)) as email from public.contacts c where c.id in (select public.crm_match_ids(m, p_filter))
    ) s;
  elsif m = 'account' then
    select count(distinct email) filter (where email <> ''), n - count(distinct account_id) filter (where email <> '') into recipients, skipped from (
      select a.id as account_id, lower(btrim(c.email)) as email
      from public.crm_accounts a
      left join public.contacts c on c.account_id = a.id and btrim(coalesce(c.email, '')) <> ''
      where a.id in (select public.crm_match_ids(m, p_filter))
    ) s;
  elsif m = 'opportunity' then
    select count(*) filter (where email <> ''), count(*) filter (where email = '') into recipients, skipped from (
      select distinct lower(btrim(coalesce(c.email, ''))) as email
      from public.crm_opportunities o
      left join public.contacts c on c.id = o.contact_id
      where o.id in (select public.crm_match_ids(m, p_filter))
    ) s;
  else
    select count(*) filter (where email <> ''), count(*) filter (where email = '') into recipients, skipped from (
      select distinct lower(btrim(coalesce(c.email, ''))) as email
      from public.deals g
      left join public.deal_participants p on p.deal_id = g.id
      left join public.contacts c on c.id = p.contact_id and btrim(coalesce(c.email, '')) <> ''
      where g.id in (select public.crm_match_ids(m, p_filter))
    ) s;
  end if;
  return jsonb_build_object('count', coalesce(recipients, 0), 'records', n, 'recipients', coalesce(recipients, 0), 'skipped', coalesce(skipped, n));
end
$$;

create or replace function public.crm_mass_update(p_module text, p_filter jsonb, p_field text, p_value text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  m text := case lower(btrim(coalesce(p_module, '')))
    when 'leads' then 'lead' when 'contacts' then 'contact' when 'clients' then 'contact'
    when 'accounts' then 'account' when 'companies' then 'account'
    when 'opportunities' then 'opportunity' when 'deals' then 'deal' else lower(btrim(coalesce(p_module, ''))) end;
  field text := btrim(coalesce(p_field, ''));
  val text := btrim(coalesce(p_value, ''));
  n int;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Processor', 'Preprocessor')) then
    raise exception 'The Processor has read-only access to the CRM.' using errcode = '42501';
  end if;
  if val = '' then raise exception 'Enter the new value.' using errcode = '22023'; end if;
  if m = 'lead' and field not in ('notes', 'relationshipStatus', 'leadSource') then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'contact' and field <> 'notes' then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'account' and field not in ('notes', 'kind') then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'opportunity' and field not in ('notes', 'stage') then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'deal' and field <> 'notes' then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'lead' and field = 'notes' then update public.crm_leads set notes = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'lead' and field = 'relationshipStatus' then update public.crm_leads set status = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'lead' and field = 'leadSource' then update public.crm_leads set source = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'contact' then update public.contacts set crm_notes = val, modified_at = now(), modified_by = auth.uid() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'account' and field = 'notes' then update public.crm_accounts set notes = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'account' and field = 'kind' then update public.crm_accounts set kind = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'opportunity' and field = 'notes' then update public.crm_opportunities set notes = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'opportunity' and field = 'stage' then update public.crm_opportunities set stage = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'deal' then update public.deals set notes = val where id in (select public.crm_match_ids(m, p_filter));
  else raise exception 'Unknown list.' using errcode = '22023';
  end if;
  get diagnostics n = row_count;
  return jsonb_build_object('count', n, 'updated', n, 'failed', 0);
end
$$;

create or replace function public.crm_mass_email(p_module text, p_filter jsonb, p_subject text, p_html text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  -- EMAIL_DRAFT_BATCH: drafts inserted per statement. Not a cap on the send.
  batch_size constant int := 500;
  m text := case lower(btrim(coalesce(p_module, '')))
    when 'leads' then 'lead' when 'contacts' then 'contact' when 'clients' then 'contact'
    when 'accounts' then 'account' when 'companies' then 'account'
    when 'opportunities' then 'opportunity' when 'deals' then 'deal' else lower(btrim(coalesce(p_module, ''))) end;
  subject text := left(regexp_replace(btrim(coalesce(p_subject, '')), '[\r\n]+', ' ', 'g'), 250);
  body text := left(coalesce(p_html, ''), 200000);
  sender text;
  wrote int := 0;
  n int;
  off int := 0;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Processor', 'Preprocessor')) then
    raise exception 'The Processor has read-only access to the CRM.' using errcode = '42501';
  end if;
  if subject = '' then raise exception 'Subject is required.' using errcode = '22023'; end if;
  select lower(btrim(coalesce(p.email, ''))) into sender from public.profiles p where p.id = auth.uid();
  create temp table if not exists crm_mass_recip (
    n int generated always as identity,
    entity text not null,
    entity_id uuid not null,
    email text not null
  ) on commit drop;
  truncate crm_mass_recip restart identity;
  if m = 'lead' then
    insert into crm_mass_recip (entity, entity_id, email)
    select 'lead', l.id, lower(btrim(l.email)) from public.crm_leads l
    where l.id in (select public.crm_match_ids(m, p_filter)) and btrim(coalesce(l.email, '')) <> '' and position('@' in l.email) > 0;
  elsif m = 'contact' then
    insert into crm_mass_recip (entity, entity_id, email)
    select 'contact', c.id, lower(btrim(c.email)) from public.contacts c
    where c.id in (select public.crm_match_ids(m, p_filter)) and btrim(coalesce(c.email, '')) <> '' and position('@' in c.email) > 0;
  elsif m = 'account' then
    insert into crm_mass_recip (entity, entity_id, email)
    select 'account', a.id, lower(btrim(c.email)) from public.crm_accounts a
    join public.contacts c on c.account_id = a.id
    where a.id in (select public.crm_match_ids(m, p_filter)) and btrim(coalesce(c.email, '')) <> '' and position('@' in c.email) > 0;
  elsif m = 'opportunity' then
    insert into crm_mass_recip (entity, entity_id, email)
    select 'contact', c.id, lower(btrim(c.email)) from public.crm_opportunities o
    join public.contacts c on c.id = o.contact_id
    where o.id in (select public.crm_match_ids(m, p_filter)) and btrim(coalesce(c.email, '')) <> '' and position('@' in c.email) > 0;
  elsif m = 'deal' then
    insert into crm_mass_recip (entity, entity_id, email)
    select 'deal', g.id, lower(btrim(c.email)) from public.deals g
    join public.deal_participants p on p.deal_id = g.id
    join public.contacts c on c.id = p.contact_id
    where g.id in (select public.crm_match_ids(m, p_filter)) and btrim(coalesce(c.email, '')) <> '' and position('@' in c.email) > 0;
  else raise exception 'Unknown list.' using errcode = '22023';
  end if;
  delete from crm_mass_recip r using crm_mass_recip e where r.email = e.email and r.n > e.n;
  loop
    insert into public.crm_emails (entity, entity_id, from_email, to_emails, cc_emails, bcc_emails, subject, body_html, status, scheduled_at, created_by)
    select r.entity, r.entity_id, coalesce(sender, ''), array[r.email], '{}', '{}', subject, body, 'drafted', null, auth.uid()
    from crm_mass_recip r where r.n > off and r.n <= off + batch_size;
    get diagnostics n = row_count;
    exit when n = 0;
    wrote := wrote + n;
    off := off + batch_size;
  end loop;
  return jsonb_build_object('count', wrote, 'drafted', wrote, 'skipped', 0);
end
$$;

revoke all on function public.crm_match_ids(text, jsonb) from public, anon;
revoke all on function public.crm_match_plan(text, jsonb, text) from public, anon;
revoke all on function public.crm_mass_update(text, jsonb, text, text) from public, anon;
revoke all on function public.crm_mass_email(text, jsonb, text, text) from public, anon;
grant execute on function public.crm_match_ids(text, jsonb) to authenticated;
grant execute on function public.crm_match_plan(text, jsonb, text) to authenticated;
grant execute on function public.crm_mass_update(text, jsonb, text, text) to authenticated;
grant execute on function public.crm_mass_email(text, jsonb, text, text) to authenticated;

create index if not exists crm_match_leads_created_idx on public.crm_leads (created_at);
create index if not exists crm_match_leads_modified_idx on public.crm_leads (modified_at);
create index if not exists crm_match_contacts_created_idx on public.contacts (created_at);
create index if not exists crm_match_contacts_modified_idx on public.contacts (modified_at);
create index if not exists crm_match_accounts_created_idx on public.crm_accounts (created_at);
create index if not exists crm_match_accounts_modified_idx on public.crm_accounts (modified_at);
create index if not exists crm_match_opps_created_idx on public.crm_opportunities (created_at);
create index if not exists crm_match_opps_modified_idx on public.crm_opportunities (modified_at);
create index if not exists crm_match_opps_close_idx on public.crm_opportunities (expected_close);
create index if not exists crm_match_deals_created_idx on public.deals (created_at);
create index if not exists crm_match_deals_open_idx on public.deals (open_date);
create index if not exists crm_match_deals_closing_idx on public.deals (closing_date);
create index if not exists crm_match_activities_entity_idx on public.crm_activities (entity, entity_id, created_at);

do $readback$
begin
  if position('private.' in pg_get_functiondef('public.crm_match_ids(text, jsonb)'::regprocedure)) > 0
     or position('private.' in pg_get_functiondef('public.crm_mass_update(text, jsonb, text, text)'::regprocedure)) > 0
     or position('private.' in pg_get_functiondef('public.crm_mass_email(text, jsonb, text, text)'::regprocedure)) > 0 then
    raise exception 'readback: a match function calls private';
  end if;
  if position('at time zone ''America/New_York''' in pg_get_functiondef('public.crm_date_bounds(jsonb, timestamptz)'::regprocedure)) = 0 then
    raise exception 'readback: date bounds are not computed in America/New_York';
  end if;
  if position('batch_size constant int := 500' in pg_get_functiondef('public.crm_mass_email(text, jsonb, text, text)'::regprocedure)) = 0 then
    raise exception 'readback: email batch size is not 500';
  end if;
end
$readback$;

commit;
