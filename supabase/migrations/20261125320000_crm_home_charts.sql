-- CRM Feedback 31 item 1 (Janine, confirmed Nov 18 2026).
-- Charts a person puts on their own CRM Home.
-- Not applied by this commit. The lead applies it on TEST.
-- Never run it on production (bxixxgcqxmtzkrolywas).
--
-- How to apply: in the TEST SQL editor, run this whole file once.
-- How to undo: run supabase/rollbacks/20261125320000_crm_home_charts.sql
--
-- Each row is one chart on one person's Home. It stores the dashboard chart
-- id, a name used only on Home (blank means "use the chart's own name"), and
-- the order on Home. Rename and remove change this row only. The dashboard
-- chart is not changed. Removing a row only takes the chart off Home.
--
-- No new private helper. Each policy compares user_id to (select auth.uid())
-- and nothing else. Policies on deals, tasks, and profiles are not changed.
-- That is checked at the start and again at the end.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

create temporary table crm_home_charts_before (
  kind text primary key,
  mark text not null
) on commit drop;

do $before$
declare
  rel text;
  n int;
  def text;
begin
  if to_regclass('public.crm_dash_components') is null then
    raise exception 'drift: public.crm_dash_components is missing';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'drift: auth.users is missing';
  end if;
  if to_regclass('public.crm_home_charts') is not null then
    raise exception 'drift: public.crm_home_charts already exists';
  end if;
  foreach rel in array array['deals', 'tasks', 'profiles'] loop
    select count(*) into n
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = rel;
    insert into crm_home_charts_before (kind, mark) values ('n:' || rel, n::text);
    select coalesce(md5(string_agg(
      pol.polname || ':' || coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ':' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''),
      '|' order by pol.polname)), 'none')
      into def
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = rel;
    insert into crm_home_charts_before (kind, mark) values ('pol:' || rel, def);
  end loop;
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private';
  insert into crm_home_charts_before (kind, mark) values ('private-n', n::text);
end
$before$;

create table public.crm_home_charts (
  user_id uuid not null default auth.uid(),
  component_id uuid not null,
  title text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint crm_home_charts_pkey primary key (user_id, component_id),
  constraint crm_home_charts_user_fk foreign key (user_id) references auth.users (id) on delete cascade,
  constraint crm_home_charts_component_fk foreign key (component_id) references public.crm_dash_components (id) on delete cascade,
  constraint crm_home_charts_title_ok check (char_length(title) <= 100),
  constraint crm_home_charts_position_ok check (position >= 0 and position < 500)
);

comment on table public.crm_home_charts is
  'Charts a person added to CRM Home. The title and order are only for Home. Removing a row does not change the dashboard chart.';

alter table public.crm_home_charts enable row level security;

revoke all on table public.crm_home_charts from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_home_charts to authenticated;

create policy crm_home_charts_select on public.crm_home_charts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy crm_home_charts_insert on public.crm_home_charts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy crm_home_charts_update on public.crm_home_charts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy crm_home_charts_delete on public.crm_home_charts
  for delete to authenticated
  using (user_id = (select auth.uid()));

do $after$
declare
  rel text;
  n int;
  was text;
  def text;
  pol text;
begin
  if to_regclass('public.crm_home_charts') is null then
    raise exception 'readback: public.crm_home_charts is missing';
  end if;
  foreach rel in array array['user_id', 'component_id', 'title', 'position', 'created_at'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'crm_home_charts' and column_name = rel
    ) then
      raise exception 'readback: public.crm_home_charts.% is missing', rel;
    end if;
  end loop;
  foreach pol in array array['crm_home_charts_select', 'crm_home_charts_insert', 'crm_home_charts_update', 'crm_home_charts_delete'] loop
    select coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ':' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
      into def
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = 'crm_home_charts' and p.polname = pol;
    if def is null then
      raise exception 'readback: policy % is missing', pol;
    end if;
    if def not like '%(select auth.uid())%' then
      raise exception 'readback: policy % does not use (select auth.uid())', pol;
    end if;
    if def like '%private.%' then
      raise exception 'readback: policy % calls a private helper', pol;
    end if;
  end loop;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname like 'crm_home_chart%'
  ) then
    raise exception 'readback: a private home-chart helper was created';
  end if;
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private';
  select mark into was from crm_home_charts_before where kind = 'private-n';
  if n::text is distinct from was then
    raise exception 'readback: private helpers changed (% to %)', was, n;
  end if;
  foreach rel in array array['deals', 'tasks', 'profiles'] loop
    select count(*) into n
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = rel;
    select mark into was from crm_home_charts_before where kind = 'n:' || rel;
    if n::text is distinct from was then
      raise exception 'readback: policy count on % changed (% to %)', rel, was, n;
    end if;
    select coalesce(md5(string_agg(
      pol.polname || ':' || coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ':' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''),
      '|' order by pol.polname)), 'none')
      into def
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = rel;
    select mark into was from crm_home_charts_before where kind = 'pol:' || rel;
    if def is distinct from was then
      raise exception 'readback: policies on % changed', rel;
    end if;
  end loop;
end
$after$;

commit;
