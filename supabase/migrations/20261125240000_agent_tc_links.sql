-- TC-2 (tracker row 366). John Coester, Nov 18 2026, 11:27 AM, confirmed 11:35 AM.
-- A transaction coordinator is an outside assistant linked to one or more real estate agents.
-- The same coordinator can be linked to several agents. This is not the CLA Title staff role.
-- Who can see a link follows who can see the agent's contact. Who can change it: a processor
-- or admin, or the agent on their own contact.
-- Not applied by this commit. Rollback: supabase/rollbacks/20261125240000_agent_tc_links.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.contacts') is null then
    raise exception 'drift: contacts is missing';
  end if;
  if to_regclass('public.agent_tc_links') is not null then
    raise exception 'drift: agent_tc_links already exists';
  end if;
  if to_regprocedure('private.contact_visible(uuid)') is null then
    raise exception 'drift: contact_visible is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.contacts'::regclass) then
    raise exception 'drift: contacts RLS is off';
  end if;
end $$;

create table public.agent_tc_links (
  id uuid primary key default gen_random_uuid(),
  agent_contact_id uuid not null references public.contacts (id),
  tc_contact_id uuid not null references public.contacts (id),
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint agent_tc_links_distinct check (agent_contact_id <> tc_contact_id),
  constraint agent_tc_links_pair unique (agent_contact_id, tc_contact_id)
);

comment on table public.agent_tc_links is
  'Outside transaction coordinators linked to a real estate agent. One coordinator can be linked to many agents.';

create index agent_tc_links_tc_idx on public.agent_tc_links (tc_contact_id);

alter table public.agent_tc_links enable row level security;

-- See a link when you can see the agent's contact. Same rule as opening that contact.
create policy agent_tc_links_select on public.agent_tc_links
  for select to authenticated
  using (private.contact_visible(agent_contact_id));

-- Change a link when you can see the agent and you are a processor/admin, or you are that agent.
create policy agent_tc_links_insert on public.agent_tc_links
  for insert to authenticated
  with check (
    private.contact_visible(agent_contact_id)
    and (
      private.is_processor()
      or private.is_admin()
      or agent_contact_id = private.my_contact_id()
    )
  );

create policy agent_tc_links_delete on public.agent_tc_links
  for delete to authenticated
  using (
    private.contact_visible(agent_contact_id)
    and (
      private.is_processor()
      or private.is_admin()
      or agent_contact_id = private.my_contact_id()
    )
  );

revoke all on public.agent_tc_links from public, anon;
grant select, insert, delete on public.agent_tc_links to authenticated;

create or replace function private.agent_tc_can_edit(p_agent uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $$
  select private.contact_visible(p_agent)
    and (
      private.is_processor()
      or private.is_admin()
      or p_agent = private.my_contact_id()
    )
$$;

create or replace function private.agent_tc_is_agent(p_agent uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $$
  select exists (
    select 1 from public.contacts c
    where c.id = p_agent
      and (
        c.contact_type = 'realtor'
        or exists (
          select 1 from public.deal_participants p
          where p.contact_id = c.id and p.role in ('Buyer Agent', 'Listing Agent')
        )
      )
  )
$$;

create or replace function private.rpc_agent_tcs(p_agent uuid)
returns table (contact_id uuid, first_name text, last_name text, email text, phone text, company text, profile_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to pg_catalog, public, extensions
as $$
begin
  if private.effective_uid() is null then
    raise exception 'Please sign in.' using errcode = '42501';
  end if;
  if not private.agent_tc_is_agent(p_agent) or not private.contact_visible(p_agent) then
    raise exception 'That person was not found. Pick someone from the list, or enter their name.' using errcode = 'P0002';
  end if;
  return query
  select c.id, c.first_name, c.last_name, c.email, c.phone, c.company, c.profile_id, l.created_at
  from public.agent_tc_links l
  join public.contacts c on c.id = l.tc_contact_id
  where l.agent_contact_id = p_agent
  order by c.first_name, c.last_name, c.id;
end $$;

create or replace function private.rpc_link_agent_tc(
  p_agent uuid,
  p_tc uuid,
  p_first text,
  p_last text,
  p_email text,
  p_phone text,
  p_company text
) returns uuid
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $$
declare
  agent public.contacts;
  tc uuid := p_tc;
  em text := lower(btrim(coalesce(p_email, '')));
  ph text;
  fn text := btrim(coalesce(p_first, ''));
  ln text := btrim(coalesce(p_last, ''));
  co text := btrim(coalesce(p_company, ''));
  login text;
begin
  if private.effective_uid() is null then
    raise exception 'Please sign in.' using errcode = '42501';
  end if;
  select * into agent from public.contacts where id = p_agent;
  if agent.id is null or not private.contact_visible(p_agent) then
    raise exception 'That person was not found. Pick someone from the list, or enter their name.' using errcode = 'P0002';
  end if;
  if not private.agent_tc_is_agent(p_agent) then
    raise exception 'Transaction coordinators are linked to a real estate agent. This contact is not an agent.' using errcode = 'P0001';
  end if;
  if not private.agent_tc_can_edit(p_agent) then
    raise exception 'You cannot change transaction coordinators for this agent. A processor can, and the agent can change their own.' using errcode = '42501';
  end if;
  if tc is not null then
    if not exists (select 1 from public.contacts c where c.id = tc) or not private.contact_visible(tc) then
      raise exception 'That person was not found. Pick someone from the list, or enter their name.' using errcode = 'P0002';
    end if;
  else
    if fn = '' and co = '' then
      raise exception 'Enter the coordinator''s name, or pick someone from the list.' using errcode = 'P0001';
    end if;
    if em <> '' and em !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'Enter a valid email for this coordinator.' using errcode = 'P0001';
    end if;
    ph := private.fmt_phone(p_phone);
    if btrim(coalesce(p_phone, '')) <> '' and ph is null then
      raise exception 'Phone must be a 10-digit phone number (xxx-xxx-xxxx).' using errcode = 'P0001';
    end if;
    if em <> '' and (
      exists (select 1 from public.contacts c where lower(c.email) = em)
      or exists (select 1 from public.profiles p where lower(p.email) = em and p.status <> 'removed')
    ) then
      raise exception 'Someone with that email is already a contact. Pick them from the list instead of typing a new person.' using errcode = 'P0001';
    end if;
    insert into public.contacts (first_name, last_name, email, phone, company, contact_type, created_by, is_demo)
    values (left(fn, 80), left(ln, 80), em, coalesce(ph, ''), left(co, 120), null, private.effective_uid(), coalesce(agent.is_demo, false))
    returning id into tc;
  end if;
  if tc = p_agent then
    raise exception 'This agent cannot be their own transaction coordinator.' using errcode = 'P0001';
  end if;
  select p.role into login
  from public.contacts c
  join public.profiles p on p.id = c.profile_id
  where c.id = tc and p.status <> 'removed';
  if login is not null and login <> 'Outside user' then
    raise exception 'A transaction coordinator is an outside assistant, not a CLA Title staff login. Pick the assistant, or enter their name.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.agent_tc_links l where l.agent_contact_id = p_agent and l.tc_contact_id = tc) then
    raise exception '% is already a transaction coordinator for this agent.',
      coalesce(nullif(btrim((select btrim(first_name || ' ' || last_name) from public.contacts where id = tc)), ''), 'This person')
      using errcode = 'P0001';
  end if;
  insert into public.agent_tc_links (agent_contact_id, tc_contact_id, created_by)
  values (p_agent, tc, private.effective_uid());
  return tc;
end $$;

create or replace function private.rpc_unlink_agent_tc(p_agent uuid, p_tc uuid)
returns void
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $$
declare n int;
begin
  if private.effective_uid() is null then
    raise exception 'Please sign in.' using errcode = '42501';
  end if;
  if not private.agent_tc_can_edit(p_agent) then
    raise exception 'You cannot change transaction coordinators for this agent. A processor can, and the agent can change their own.' using errcode = '42501';
  end if;
  delete from public.agent_tc_links
  where agent_contact_id = p_agent and tc_contact_id = p_tc;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'That transaction coordinator is not linked to this agent.' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.agent_tcs(p_agent uuid)
returns table (contact_id uuid, first_name text, last_name text, email text, phone text, company text, profile_id uuid, created_at timestamptz)
language sql
security definer
set search_path to pg_catalog, public, extensions
as $$
  select * from private.rpc_agent_tcs(p_agent)
$$;

create or replace function public.link_agent_tc(p_agent uuid, p_tc uuid, p_first text, p_last text, p_email text, p_phone text, p_company text)
returns uuid
language sql
security definer
set search_path to pg_catalog, public, extensions
as $$
  select private.rpc_link_agent_tc(p_agent, p_tc, p_first, p_last, p_email, p_phone, p_company)
$$;

create or replace function public.unlink_agent_tc(p_agent uuid, p_tc uuid)
returns void
language sql
security definer
set search_path to pg_catalog, public, extensions
as $$
  select private.rpc_unlink_agent_tc(p_agent, p_tc)
$$;

revoke all on function private.agent_tc_can_edit(uuid) from public, anon, authenticated;
revoke all on function private.agent_tc_is_agent(uuid) from public, anon, authenticated;
revoke all on function private.rpc_agent_tcs(uuid) from public, anon, authenticated;
revoke all on function private.rpc_link_agent_tc(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function private.rpc_unlink_agent_tc(uuid, uuid) from public, anon, authenticated;
revoke all on function public.agent_tcs(uuid) from public, anon;
revoke all on function public.link_agent_tc(uuid, uuid, text, text, text, text, text) from public, anon;
revoke all on function public.unlink_agent_tc(uuid, uuid) from public, anon;
grant execute on function public.agent_tcs(uuid) to authenticated;
grant execute on function public.link_agent_tc(uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.unlink_agent_tc(uuid, uuid) to authenticated;

do $$
declare n int;
begin
  if to_regclass('public.agent_tc_links') is null then
    raise exception 'readback: agent_tc_links is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.agent_tc_links'::regclass) then
    raise exception 'readback: agent_tc_links RLS is off';
  end if;
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'agent_tc_links'
    and policyname in ('agent_tc_links_select', 'agent_tc_links_insert', 'agent_tc_links_delete');
  if n <> 3 then
    raise exception 'readback: expected 3 policies on agent_tc_links, found %', n;
  end if;
  if position('contact_visible' in coalesce((select qual from pg_policies where schemaname = 'public' and tablename = 'agent_tc_links' and policyname = 'agent_tc_links_select'), '')) = 0 then
    raise exception 'readback: select policy does not use contact_visible';
  end if;
  if position('is_processor' in coalesce((select with_check from pg_policies where schemaname = 'public' and tablename = 'agent_tc_links' and policyname = 'agent_tc_links_insert'), '')) = 0
     or position('my_contact_id' in coalesce((select with_check from pg_policies where schemaname = 'public' and tablename = 'agent_tc_links' and policyname = 'agent_tc_links_insert'), '')) = 0 then
    raise exception 'readback: insert policy does not match contact editors';
  end if;
  if to_regprocedure('public.link_agent_tc(uuid, uuid, text, text, text, text, text)') is null
     or to_regprocedure('public.unlink_agent_tc(uuid, uuid)') is null
     or to_regprocedure('public.agent_tcs(uuid)') is null then
    raise exception 'readback: a coordinator link function is missing';
  end if;
  if not has_table_privilege('authenticated', 'public.agent_tc_links', 'select') then
    raise exception 'readback: authenticated cannot read agent_tc_links';
  end if;
end $$;

select private.lock_function_search_paths();

commit;

notify pgrst, 'reload schema';
