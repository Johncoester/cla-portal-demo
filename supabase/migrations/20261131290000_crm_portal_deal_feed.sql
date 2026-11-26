-- CRM-FEED-1 (John chat 9:09 PM Nov 25): every portal order is a CRM deal, and a Zoho deal Janine imports links to
-- the matching portal order instead of becoming a second deal. Not applied by this commit. The lead applies SQL.
--
-- What already covers the request (no change here):
--   * CRM Deals IS public.deals. public.crm_deals() reads public.deals through private.crm_deal_visible(), so a new
--     order is a CRM deal the moment it is saved. The CRM deal id is the order id.
--   * Order parties are public.contacts rows (deal_participants.contact_id). private.crm_in_pool() puts every non-staff
--     contact in the CRM, and contacts_person_dup already stops a second contact with the same email or phone.
--
-- What this adds:
--   1. public.crm_imported_deals: deals Janine imports from a Zoho export (new Deals import, admin only). A row is either
--      linked to one portal order (deal_id) or not. A linked row is not shown as its own deal; the order is the deal.
--   2. Match rule, the same in both directions:
--        (a) the file number (trim, upper case, no spaces) equals the order's file number, else
--        (b) the normalized property street + city + state equals the order's, AND the imported client is a
--            Client-Buyer / Client-Seller on the order (same contact by email, or the same normalized name).
--      Exactly one candidate links. Two or more candidates (either way round) link nothing and flag the imported
--      row(s) 'ambiguous'. A flagged row is never linked automatically later; it waits for a person to pick the order.
--      Demo and non-demo never match each other (is_demo must be equal).
--   3. Forward: AFTER INSERT on deals (file number), AFTER UPDATE OF file_number/street/city/state on deals, and
--      AFTER INSERT of a client party on deal_participants (address + client). Each trigger returns at once when no
--      imported deal is waiting, and wraps the link in its own exception block, so a CRM problem cannot stop an
--      order from being saved.
--   4. Reverse: public.crm_import_deals() matches each imported row to an existing order while it imports.
--   5. public.crm_imported_deals_list() feeds the CRM Deals list (unlinked rows, and the Zoho fields of linked ones).
--
-- Speed: every match is an index lookup. Each lookup on a partial index repeats the index predicate (for example
-- file_key <> '') so the cached plan inside plpgsql can use it. deals.file_number already has a unique index. This adds one expression
-- index on deals for the address key, and partial indexes on the new table. No per-row private.* RLS helper: the new
-- table has RLS on and no policy, and is read only through the two SECURITY DEFINER functions, which check access once.
-- No change to any existing function, policy, grant, or to deals / tasks / profiles policies.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

-- ---------- drift guards ----------
do $pre$
declare
  need text[];
  miss text;
begin
  if to_regclass('public.crm_imported_deals') is not null then raise exception 'drift: public.crm_imported_deals already exists'; end if;
  if to_regclass('public.deals_crm_addr_key_idx') is not null then raise exception 'drift: index deals_crm_addr_key_idx already exists'; end if;
  foreach miss in array array['private.crm_file_key(text)', 'private.crm_addr_key(text,text,text)', 'private.crm_name_key(text)',
      'private.crm_imported_deal_link(uuid)', 'private.trg_crm_imported_deal_on_deal()', 'private.trg_crm_imported_deal_on_party()',
      'public.crm_import_deals(boolean,text,jsonb,uuid)', 'public.crm_imported_deals_list()'] loop
    if to_regprocedure(miss) is not null then raise exception 'drift: % already exists', miss; end if;
  end loop;
  foreach miss in array array['private.crm_need(boolean)', 'private.is_admin()', 'private.viewer_is_demo()', 'private.crm_deal_scope_all()', 'private.effective_uid()'] loop
    if to_regprocedure(miss) is null then raise exception 'drift: % is missing', miss; end if;
  end loop;
  for miss in
    select t || '.' || c from (values ('deals', 'id'), ('deals', 'file_number'), ('deals', 'street'), ('deals', 'city'), ('deals', 'state'), ('deals', 'is_demo'),
      ('deal_participants', 'deal_id'), ('deal_participants', 'contact_id'), ('deal_participants', 'role'),
      ('contacts', 'id'), ('contacts', 'email'), ('contacts', 'first_name'), ('contacts', 'last_name'), ('contacts', 'is_demo'),
      ('deal_sales_people', 'deal_id'), ('deal_sales_people', 'sales_id'), ('profiles', 'id')) v(t, c)
    where not exists (select 1 from information_schema.columns i where i.table_schema = 'public' and i.table_name = v.t and i.column_name = v.c)
  loop raise exception 'drift: column public.% is missing', miss; end loop;
  if exists (select 1 from pg_trigger where not tgisinternal and tgname in ('zz_crm_imported_deal_link', 'zz_crm_imported_deal_relink', 'zz_crm_imported_deal_party')) then
    raise exception 'drift: a crm_imported_deal trigger already exists';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'deals' and indexname = 'deals_file_number_key') then
    raise exception 'drift: deals_file_number_key (unique file number index) is missing';
  end if;
end $pre$;

-- ---------- match keys (pure, immutable) ----------
-- File number: trim, upper case, drop spaces. Portal numbers look like FL-26-97499, so this is the stored form.
create function private.crm_file_key(p text) returns text
language sql immutable parallel safe set search_path = pg_catalog as $$
  select upper(regexp_replace(coalesce(p, ''), '\s+', '', 'g')) $$;

-- Address: lower case, punctuation to spaces, collapsed spaces, common street suffixes and directions shortened.
-- ZIP is left out on purpose: Zoho exports often have no ZIP or a ZIP+4. Street + city + state, plus the client, is the match.
create function private.crm_addr_key(p_street text, p_city text, p_state text) returns text
language plpgsql immutable parallel safe set search_path = pg_catalog as $$
declare s text := lower(coalesce(p_street, '')); c text := lower(coalesce(p_city, '')); st text := upper(btrim(coalesce(p_state, '')));
begin
  s := btrim(regexp_replace(regexp_replace(s, '[.,#;:]', ' ', 'g'), '\s+', ' ', 'g'));
  if s = '' then return ''; end if;
  s := regexp_replace(s, '\mstreet\M', 'st', 'g');    s := regexp_replace(s, '\mavenue\M', 'ave', 'g');
  s := regexp_replace(s, '\mav\M', 'ave', 'g');       s := regexp_replace(s, '\mroad\M', 'rd', 'g');
  s := regexp_replace(s, '\mdrive\M', 'dr', 'g');     s := regexp_replace(s, '\mlane\M', 'ln', 'g');
  s := regexp_replace(s, '\mboulevard\M', 'blvd', 'g'); s := regexp_replace(s, '\mcourt\M', 'ct', 'g');
  s := regexp_replace(s, '\mcircle\M', 'cir', 'g');   s := regexp_replace(s, '\mplace\M', 'pl', 'g');
  s := regexp_replace(s, '\mterrace\M', 'ter', 'g');  s := regexp_replace(s, '\mparkway\M', 'pkwy', 'g');
  s := regexp_replace(s, '\mhighway\M', 'hwy', 'g');  s := regexp_replace(s, '\mnorth\M', 'n', 'g');
  s := regexp_replace(s, '\msouth\M', 's', 'g');      s := regexp_replace(s, '\meast\M', 'e', 'g');
  s := regexp_replace(s, '\mwest\M', 'w', 'g');
  c := btrim(regexp_replace(regexp_replace(c, '[.,#;:]', ' ', 'g'), '\s+', ' ', 'g'));
  return s || '|' || c || '|' || st;
end $$;

-- Person name: lower case, letters / digits / spaces only, collapsed.
create function private.crm_name_key(p text) returns text
language sql immutable parallel safe set search_path = pg_catalog as $$
  select btrim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) $$;

-- The keys are pure text functions used by an index and generated columns, so every role may run them.
revoke all on function private.crm_file_key(text) from public, anon;
revoke all on function private.crm_addr_key(text, text, text) from public, anon;
revoke all on function private.crm_name_key(text) from public, anon;
grant execute on function private.crm_file_key(text) to authenticated, service_role;
grant execute on function private.crm_addr_key(text, text, text) to authenticated, service_role;
grant execute on function private.crm_name_key(text) to authenticated, service_role;

-- ---------- imported deals ----------
create table public.crm_imported_deals (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null,
  line integer not null default 0 check (line >= 0),
  zoho_id text not null default '' check (char_length(zoho_id) <= 60),
  name text not null default '' check (char_length(name) <= 200),
  file_number text not null default '' check (char_length(file_number) <= 40),
  street text not null default '' check (char_length(street) <= 200),
  city text not null default '' check (char_length(city) <= 80),
  state text not null default '' check (state = '' or state ~ '^[A-Z]{2}$'),
  zip text not null default '' check (char_length(zip) <= 10),
  client_name text not null default '' check (char_length(client_name) <= 160),
  client_email text not null default '' check (char_length(client_email) <= 200),
  client_contact_id uuid references public.contacts (id) on delete set null,
  amount numeric check (amount is null or amount >= 0),
  stage text not null default '' check (char_length(stage) <= 60),
  closing_date date,
  owner_name text not null default '' check (char_length(owner_name) <= 120),
  is_demo boolean not null default false,
  deal_id uuid references public.deals (id) on delete set null,
  match_status text not null default 'unmatched' check (match_status in ('linked', 'unmatched', 'ambiguous')),
  match_note text not null default '' check (char_length(match_note) <= 300),
  linked_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  file_key text generated always as (private.crm_file_key(file_number)) stored,
  addr_key text generated always as (private.crm_addr_key(street, city, state)) stored,
  client_key text generated always as (private.crm_name_key(client_name)) stored);
-- No check tying match_status to deal_id: deleting an order sets deal_id to null and must not be blocked. The list treats a
-- row with no deal_id as unlinked whatever its status says.
comment on table public.crm_imported_deals is 'CRM-FEED-1 20261131290000: deals imported from Zoho. A linked row (deal_id) is shown as the portal order.';

create unique index crm_imported_deals_deal_uq on public.crm_imported_deals (deal_id) where deal_id is not null;
create index crm_imported_deals_file_open_idx on public.crm_imported_deals (file_key) where deal_id is null and file_key <> '';
create index crm_imported_deals_addr_open_idx on public.crm_imported_deals (addr_key) where deal_id is null and addr_key <> '';
create index crm_imported_deals_file_idx on public.crm_imported_deals (file_key, is_demo) where file_key <> '';
create index crm_imported_deals_zoho_idx on public.crm_imported_deals (zoho_id, is_demo) where zoho_id <> '';
create index crm_imported_deals_addr_idx on public.crm_imported_deals (addr_key, client_key, is_demo) where addr_key <> '';
create index crm_imported_deals_client_idx on public.crm_imported_deals (client_contact_id) where client_contact_id is not null;
create index crm_imported_deals_open_idx on public.crm_imported_deals (created_at) where deal_id is null;

alter table public.crm_imported_deals enable row level security;
revoke all on public.crm_imported_deals from public, anon, authenticated;

-- Address lookups on orders (the reverse match). Same expression as the generated addr_key.
create index deals_crm_addr_key_idx on public.deals (private.crm_addr_key(street, city, state));

-- ---------- link one order (forward) ----------
-- Returns 'already', 'linked:file', 'linked:address', 'ambiguous:file', 'ambiguous:address' or 'none'.
create function private.crm_imported_deal_link(p_deal uuid) returns text
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  d record; v_ids uuid[]; v_fk text; v_ak text; v_how text;
begin
  select g.id, g.file_number, g.street, g.city, g.state, g.is_demo into d from public.deals g where g.id = p_deal;
  if not found then return 'none'; end if;
  if exists (select 1 from public.crm_imported_deals z where z.deal_id = p_deal) then return 'already'; end if;
  v_fk := private.crm_file_key(d.file_number);
  -- (a) file number
  if v_fk <> '' then
    select array_agg(s.id) into v_ids from (select z.id from public.crm_imported_deals z
      where z.deal_id is null and z.file_key <> '' and z.match_status <> 'ambiguous' and z.file_key = v_fk and z.is_demo = d.is_demo limit 2) s;
    if cardinality(v_ids) = 1 then v_how := 'file';
    elsif cardinality(v_ids) > 1 then
      update public.crm_imported_deals z set match_status = 'ambiguous', match_note = left('More than one imported deal has file number ' || d.file_number || '. Nothing was linked.', 300)
        where z.deal_id is null and z.file_key <> '' and z.file_key = v_fk and z.is_demo = d.is_demo;
      return 'ambiguous:file';
    end if;
  end if;
  -- (b) property address + client (only rows whose own file number is blank or belongs to no other order)
  if v_how is null then
    v_ak := private.crm_addr_key(d.street, d.city, d.state);
    if v_ak = '' then return 'none'; end if;
    select array_agg(s.id) into v_ids from (select z.id from public.crm_imported_deals z
      where z.deal_id is null and z.addr_key <> '' and z.match_status <> 'ambiguous' and z.addr_key = v_ak and z.is_demo = d.is_demo
        and (z.file_key = '' or not exists (select 1 from public.deals o where o.file_number = z.file_key and o.id <> p_deal))
        and exists (select 1 from public.deal_participants p join public.contacts c on c.id = p.contact_id
          where p.deal_id = p_deal and p.role in ('Client-Buyer', 'Client-Seller')
            and (c.id = z.client_contact_id or (z.client_key <> '' and private.crm_name_key(c.first_name || ' ' || c.last_name) = z.client_key)))
      limit 2) s;
    if cardinality(v_ids) = 1 then
      v_how := 'address';
      -- The one imported row must not also fit another order (same address and client): then it is ambiguous too.
      if exists (select 1 from public.crm_imported_deals z join public.deals o
            on private.crm_addr_key(o.street, o.city, o.state) = z.addr_key and o.is_demo = z.is_demo and o.id <> p_deal
          where z.id = v_ids[1]
            and exists (select 1 from public.deal_participants p join public.contacts c on c.id = p.contact_id
              where p.deal_id = o.id and p.role in ('Client-Buyer', 'Client-Seller')
                and (c.id = z.client_contact_id or (z.client_key <> '' and private.crm_name_key(c.first_name || ' ' || c.last_name) = z.client_key)))) then
        update public.crm_imported_deals z set match_status = 'ambiguous', match_note = left('More than one portal order has the address and client of this imported deal (one is ' || d.file_number || '). Nothing was linked.', 300)
          where z.id = v_ids[1];
        return 'ambiguous:address';
      end if;
    elsif cardinality(v_ids) > 1 then
      update public.crm_imported_deals z set match_status = 'ambiguous', match_note = left('More than one imported deal matches the address and client of order ' || d.file_number || '. Nothing was linked.', 300)
        where z.id in (select z2.id from public.crm_imported_deals z2 where z2.deal_id is null and z2.addr_key <> '' and z2.addr_key = v_ak and z2.is_demo = d.is_demo
          and exists (select 1 from public.deal_participants p join public.contacts c on c.id = p.contact_id
            where p.deal_id = p_deal and p.role in ('Client-Buyer', 'Client-Seller')
              and (c.id = z2.client_contact_id or (z2.client_key <> '' and private.crm_name_key(c.first_name || ' ' || c.last_name) = z2.client_key))));
      return 'ambiguous:address';
    else return 'none';
    end if;
  end if;
  update public.crm_imported_deals z set deal_id = p_deal, match_status = 'linked', linked_at = now(),
    match_note = case v_how when 'file' then 'Linked to order ' || d.file_number || ' by file number.' else 'Linked to order ' || d.file_number || ' by property address and client.' end
    where z.id = v_ids[1] and z.deal_id is null;
  return 'linked:' || v_how;
end $$;
revoke all on function private.crm_imported_deal_link(uuid) from public, anon, authenticated;

-- ---------- forward triggers: never block or slow an order ----------
create function private.trg_crm_imported_deal_on_deal() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  -- Fast exit: nothing imported is waiting (one partial-index probe).
  if not exists (select 1 from public.crm_imported_deals z where z.deal_id is null) then return null; end if;
  begin
    perform private.crm_imported_deal_link(new.id);
  exception when others then
    raise warning 'CRM imported-deal link skipped for order %: %', new.id, sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.trg_crm_imported_deal_on_deal() from public, anon, authenticated;

create function private.trg_crm_imported_deal_on_party() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not exists (select 1 from public.crm_imported_deals z where z.deal_id is null) then return null; end if;
  begin
    perform private.crm_imported_deal_link(new.deal_id);
  exception when others then
    raise warning 'CRM imported-deal link skipped for order %: %', new.deal_id, sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.trg_crm_imported_deal_on_party() from public, anon, authenticated;

create trigger zz_crm_imported_deal_link after insert on public.deals
  for each row execute function private.trg_crm_imported_deal_on_deal();
create trigger zz_crm_imported_deal_relink after update of file_number, street, city, state on public.deals
  for each row when (old.file_number is distinct from new.file_number or old.street is distinct from new.street
                     or old.city is distinct from new.city or old.state is distinct from new.state)
  execute function private.trg_crm_imported_deal_on_deal();
create trigger zz_crm_imported_deal_party after insert on public.deal_participants
  for each row when (new.role in ('Client-Buyer', 'Client-Seller'))
  execute function private.trg_crm_imported_deal_on_party();

-- ---------- import (reverse match) ----------
-- Admin / Super admin only (checked once). At most 500 rows a call. p_commit = false is a preview: nothing is saved.
-- Row keys: zohoId, name, fileNumber, street, city, state, zip, clientName, clientEmail, amount, stage, closingDate, ownerName.
-- A row already imported (same Zoho id, else same file number, else same address + client) is a duplicate and is skipped,
-- so running the same file twice adds nothing.
create function public.crm_import_deals(p_commit boolean, p_file_name text, p_rows jsonb, p_import uuid default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare
  v_uid uuid := auth.uid(); v_demo boolean; v_import uuid := coalesce(p_import, gen_random_uuid());
  r jsonb; n integer; v_out jsonb := '[]'::jsonb; v_seen text[] := '{}';
  v_zoho text; v_name text; v_file text; v_fk text; v_street text; v_city text; v_state text; v_zip text; v_cname text; v_cemail text; v_ck text; v_ak text;
  v_amount numeric; v_stage text; v_close date; v_owner text; v_client uuid; v_raw text;
  v_ids uuid[]; v_deal uuid; v_status text; v_note text; v_how text;
  c_created integer := 0; c_linked integer := 0; c_amb integer := 0; c_dup integer := 0; c_err integer := 0;
begin
  perform private.crm_need(true);
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can import.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Rows must be a list.' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'At most 500 rows at a time.' using errcode = '22023'; end if;
  v_demo := private.viewer_is_demo();
  for r, n in select e, o::integer from jsonb_array_elements(p_rows) with ordinality x(e, o) loop
    v_deal := null; v_client := null; v_how := null; v_note := ''; v_status := 'ok';
    begin
      if jsonb_typeof(r) is distinct from 'object' then raise exception 'This row is not a record.' using errcode = '22023'; end if;
      v_zoho := left(btrim(coalesce(r->>'zohoId', '')), 60);
      v_file := left(btrim(coalesce(r->>'fileNumber', '')), 40); v_fk := private.crm_file_key(v_file);
      v_street := left(btrim(coalesce(r->>'street', '')), 200); v_city := left(btrim(coalesce(r->>'city', '')), 80);
      v_state := upper(btrim(coalesce(r->>'state', ''))); v_zip := left(btrim(coalesce(r->>'zip', '')), 10);
      v_cname := left(btrim(coalesce(r->>'clientName', '')), 160); v_cemail := lower(left(btrim(coalesce(r->>'clientEmail', '')), 200));
      v_stage := left(btrim(coalesce(r->>'stage', '')), 60); v_owner := left(btrim(coalesce(r->>'ownerName', '')), 120);
      v_name := left(coalesce(nullif(btrim(coalesce(r->>'name', '')), ''), nullif(concat_ws(', ', nullif(v_street, ''), nullif(v_city, '')), ''), v_file), 200);
      if v_state <> '' and v_state !~ '^[A-Z]{2}$' then raise exception 'State must be two letters (for example FL).' using errcode = '22023'; end if;
      if v_fk = '' and v_street = '' then raise exception 'Give the file number or the property street.' using errcode = '22023'; end if;
      v_raw := regexp_replace(coalesce(r->>'amount', ''), '[$,\s]', '', 'g');
      if v_raw = '' then v_amount := null; elsif v_raw ~ '^\d+(\.\d+)?$' then v_amount := v_raw::numeric; else raise exception 'Amount is not a number.' using errcode = '22023'; end if;
      v_raw := btrim(coalesce(r->>'closingDate', ''));
      if v_raw = '' then v_close := null;
      elsif v_raw ~ '^\d{4}-\d{2}-\d{2}$' then v_close := v_raw::date;
      elsif v_raw ~ '^\d{1,2}/\d{1,2}/\d{4}$' then v_close := to_date(v_raw, 'MM/DD/YYYY');
      else raise exception 'Closing date must be YYYY-MM-DD or MM/DD/YYYY.' using errcode = '22023'; end if;
      v_ak := private.crm_addr_key(v_street, v_city, v_state); v_ck := private.crm_name_key(v_cname);
      -- duplicate: already imported, or earlier in this same file
      if (v_zoho <> '' and (('z:' || v_zoho) = any (v_seen) or exists (select 1 from public.crm_imported_deals z where z.zoho_id <> '' and z.zoho_id = v_zoho and z.is_demo = v_demo)))
         or (v_fk <> '' and (('f:' || v_fk) = any (v_seen) or exists (select 1 from public.crm_imported_deals z where z.file_key <> '' and z.file_key = v_fk and z.is_demo = v_demo)))
         or (v_fk = '' and v_ak <> '' and (('a:' || v_ak || '/' || v_ck) = any (v_seen)
             or exists (select 1 from public.crm_imported_deals z where z.addr_key <> '' and z.addr_key = v_ak and z.client_key = v_ck and z.file_key = '' and z.is_demo = v_demo))) then
        v_status := 'duplicate'; v_note := 'Already imported. Skipped.';
      end if;
      if v_status = 'ok' then
        v_seen := v_seen || array['z:' || v_zoho, 'f:' || v_fk, 'a:' || v_ak || '/' || v_ck];
        if v_cemail <> '' then select c.id into v_client from public.contacts c where lower(c.email) = v_cemail and c.is_demo = v_demo limit 1; end if;
        -- (a) file number: unique index on deals.file_number
        if v_fk <> '' then
          select g.id into v_deal from public.deals g where g.file_number = v_fk and g.is_demo = v_demo;
          if v_deal is not null then v_how := 'file'; end if;
        end if;
        -- (b) address + client, only when the row has no file number or its file number is on no order
        if v_deal is null and v_ak <> '' then
          select array_agg(s.id) into v_ids from (select g.id from public.deals g
            where private.crm_addr_key(g.street, g.city, g.state) = v_ak and g.is_demo = v_demo
              and exists (select 1 from public.deal_participants p join public.contacts c on c.id = p.contact_id
                where p.deal_id = g.id and p.role in ('Client-Buyer', 'Client-Seller')
                  and ((v_client is not null and c.id = v_client) or (v_ck <> '' and private.crm_name_key(c.first_name || ' ' || c.last_name) = v_ck)))
            limit 2) s;
          if cardinality(v_ids) = 1 then v_deal := v_ids[1]; v_how := 'address';
          elsif cardinality(v_ids) > 1 then v_how := 'ambiguous'; v_note := 'More than one portal order has this address and client. Imported without a link; pick the order by hand.';
          end if;
        end if;
        if v_deal is not null and exists (select 1 from public.crm_imported_deals z where z.deal_id = v_deal) then
          v_deal := null; v_how := 'ambiguous'; v_note := 'The matching portal order is already linked to another imported deal. Imported without a link.';
        end if;
        if v_deal is not null then
          v_note := case v_how when 'file' then 'Linked to the portal order by file number.' else 'Linked to the portal order by property address and client.' end;
        elsif v_how is null then v_note := 'No portal order matches. Shown as its own CRM deal.';
        end if;
        if p_commit then
          insert into public.crm_imported_deals (import_id, line, zoho_id, name, file_number, street, city, state, zip, client_name, client_email, client_contact_id,
              amount, stage, closing_date, owner_name, is_demo, deal_id, match_status, match_note, linked_at, created_by)
            values (v_import, n, v_zoho, v_name, v_file, v_street, v_city, v_state, v_zip, v_cname, v_cemail, v_client,
              v_amount, v_stage, v_close, v_owner, v_demo, v_deal,
              case when v_deal is not null then 'linked' when v_how = 'ambiguous' then 'ambiguous' else 'unmatched' end, left(v_note, 300),
              case when v_deal is not null then now() end, v_uid);
        end if;
      end if;
    exception when unique_violation then
      v_status := 'error'; v_note := 'The matching portal order was linked by someone else at the same moment. Run the file again.';
    when others then
      if sqlstate in ('22023', '22007', '22008', '23514', '22001') then v_status := 'error'; v_note := sqlerrm; else raise; end if;
    end;
    if v_status = 'duplicate' then c_dup := c_dup + 1;
    elsif v_status = 'error' then c_err := c_err + 1;
    else
      c_created := c_created + 1;
      if v_deal is not null then c_linked := c_linked + 1; elsif v_how = 'ambiguous' then c_amb := c_amb + 1; end if;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('line', n, 'status', v_status, 'name', coalesce(v_name, ''), 'message', v_note,
      'match', case when v_status <> 'ok' then '' when v_deal is not null then 'linked' when v_how = 'ambiguous' then 'ambiguous' else 'unmatched' end,
      'how', coalesce(case when v_deal is not null then v_how end, ''), 'dealId', v_deal,
      'fileNumber', coalesce((select g.file_number from public.deals g where g.id = v_deal), '')));
  end loop;
  return jsonb_build_object('importId', v_import, 'committed', coalesce(p_commit, false), 'rows', v_out,
    'counts', jsonb_build_object('total', jsonb_array_length(p_rows), 'created', c_created, 'linked', c_linked, 'ambiguous', c_amb, 'duplicates', c_dup, 'errors', c_err));
end $$;
revoke all on function public.crm_import_deals(boolean, text, jsonb, uuid) from public, anon;
grant execute on function public.crm_import_deals(boolean, text, jsonb, uuid) to authenticated;

-- ---------- list for CRM Deals ----------
-- Scope checked once: every-deal roles see all imported rows of their demo scope; a Sales Person sees only rows linked to
-- an order they are a salesperson on (an unlinked Zoho row has no portal owner).
create function public.crm_imported_deals_list() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public, extensions as $$
declare v_all boolean; v_demo boolean; v_me uuid;
begin
  perform private.crm_need();
  v_all := private.crm_deal_scope_all(); v_demo := private.viewer_is_demo(); v_me := private.effective_uid();
  return coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'dealId', z.deal_id, 'zohoId', z.zoho_id, 'name', z.name, 'fileNumber', z.file_number,
      'propertyAddress', concat_ws(', ', nullif(z.street, ''), nullif(z.city, ''), nullif(btrim(z.state || ' ' || z.zip), '')),
      'street', z.street, 'city', z.city, 'state', z.state, 'zip', z.zip, 'clientName', z.client_name, 'amount', z.amount, 'stage', z.stage,
      'closingDate', z.closing_date, 'ownerName', z.owner_name, 'matchStatus', z.match_status, 'matchNote', z.match_note, 'createdAt', z.created_at)
      order by z.created_at, z.line)
    from public.crm_imported_deals z
    where z.is_demo = v_demo
      and (v_all or (z.deal_id is not null and exists (select 1 from public.deal_sales_people s where s.deal_id = z.deal_id and s.sales_id = v_me)))), '[]'::jsonb);
end $$;
revoke all on function public.crm_imported_deals_list() from public, anon;
grant execute on function public.crm_imported_deals_list() to authenticated;

commit;
