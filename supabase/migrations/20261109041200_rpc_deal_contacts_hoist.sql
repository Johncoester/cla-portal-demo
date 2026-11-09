-- Unpublished hoist candidate. Do not apply to a hosted database until reviewed.
-- One transaction, 3s lock timeout. Refuses unless the captured policy text,
-- attributes, helper source hashes, and execute privileges match live TEST.
-- F3 replaces private.rpc_deal_contacts only. Same signature, volatility,
-- security definer, search_path, owner, and execute privileges. Deal-level
-- checks (can_access_deal, deal_role, is_pure_buyer, is_pure_seller,
-- is_staffish, my_contact_id, my_side) run in one MATERIALIZED CTE so the
-- planner cannot pull them back into the per-contact row.
-- The per-row predicate is the body of participant_visible plus the existing
-- hide expression, so the returned rows stay the same.
-- deal_participants has id, deal_id, contact_id, and role in the captured catalog.
-- It has no created_at. The portal does not sort deal_contacts; it keeps the
-- returned order (added-order file titles and the contact table). The current
-- function has no ORDER BY and returns heap insertion order. That order is
-- dp.ctid, including for idx_participants_deal. uuid id is not insertion order.

begin;
set local lock_timeout = '3s';

create temp table _pol_before (
  rel text,
  polname text,
  cmd "char",
  permissive boolean,
  qual text,
  chk text,
  roles text[],
  primary key (rel, polname)
) on commit drop;

do $pre$
declare
  n int;
begin
  select count(*) into n from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'rpc_deal_contacts';
  if n is distinct from 1 then
    raise exception 'private.rpc_deal_contacts count is %, expected 1; refusing', n;
  end if;

  insert into _pol_before (rel, polname, cmd, permissive, qual, chk, roles)
  select c.relname, pol.polname, pol.polcmd, pol.polpermissive,
         pg_get_expr(pol.polqual, pol.polrelid),
         pg_get_expr(pol.polwithcheck, pol.polrelid),
         array(select r.rolname::text from pg_roles r where r.oid = any (pol.polroles) order by 1)
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public';
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'rpc_deal_contacts'
      and pg_get_function_identity_arguments(p.oid) = 'p_deal uuid'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'da2e6b5fc7c5773fc01be5d73e6ae852530ada7c06adbc89d12adf4972b9ce03'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.rpc_deal_contacts() is not the captured function; refusing';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'deal_contacts'
      and pg_get_function_identity_arguments(p.oid) = 'p_deal uuid'
      and p.provolatile = 's' and not p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '701f79de0559b176982aefe2222b100459fa840c67f65cea1518026e7cbf1ca0'
  ) then
    raise exception 'public.deal_contacts() is not the captured wrapper; refusing';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'viewer_is_demo'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'bcf68284dbb6c15c01c313fb855684b8b5e527fa5e8701afd695792703cdf16d'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.viewer_is_demo() is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'me_role'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'b729a85e770977f8421e41b62d612570dea8e71e225c915872e43e0cf017ec83'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.me_role() is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'is_admin'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '1b338b080fff82468bddd762745ac8db01afec526453569cf72b189883e595eb'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.is_admin() is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'can_access_deal'
      and pg_get_function_identity_arguments(p.oid) = 'd uuid'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '278d10598eab76147d3117cd96ad5e2df702a16bfbec86552f0495b7242633e2'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.can_access_deal(uuid) is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'effective_uid'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '57c143b27533e4b6cf45156c0c04e4558ae16a9533892f921cdb284dde8061fe'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.effective_uid() is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'is_staffish'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'aec095b39f9a94687da50704b6626b68d4bcfe13ade6d8bfe3d8e2720318848d'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.is_staffish() is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'task_visible'
      and pg_get_function_identity_arguments(p.oid) = 'owner uuid, assigned text, d uuid'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'c94003050d36b67994248bf46370a04729a3a381fc2407b3b79af0e5911f41ba'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.task_visible(uuid, text, uuid) is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'participant_visible'
      and pg_get_function_identity_arguments(p.oid) = 'd uuid, prole text'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'e9f794dbd2e70e1f05464dc9098aa040694482e0f7fe1e9e72f2e9f557b4d724'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.participant_visible(uuid, text) is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'deal_role'
      and pg_get_function_identity_arguments(p.oid) = 'd uuid'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '833750a2dd81a29d0869c890a01fefbc872d3fd01bea781480c14993471bd605'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.deal_role(uuid) is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'is_pure_buyer'
      and pg_get_function_identity_arguments(p.oid) = 'd uuid'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '0067ad15547737cb2da9be5e1ae5b07b1f88385830902b081093540ea6a17e31'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.is_pure_buyer(uuid) is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'is_pure_seller'
      and pg_get_function_identity_arguments(p.oid) = 'd uuid'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '7867b90324282002616b1de336b797c1fcefcd37256d27dd1f2d3fb6803c38c5'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.is_pure_seller(uuid) is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'my_contact_id'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '5f80fb30f907a6eacb748e5a180a829c748fa2d647426b3d38f036f55c248bba'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.my_contact_id() is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'my_side'
      and pg_get_function_identity_arguments(p.oid) = 'd uuid'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '1205c279a7046b0285e393e4b0ceea35591155f6028a9640b28e36cea30a9f0d'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.my_side(uuid) is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'side_of'
      and pg_get_function_identity_arguments(p.oid) = 'r text'
      and p.provolatile = 'i' and not p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '6196dc14c28056fa6837f34d1087ed319780aba0cf313705afb1f35e67ff5cf0'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.side_of(text) is not the captured helper; refusing';
  end if;

end
$pre$;

create or replace function private.rpc_deal_contacts(p_deal uuid)
returns table(participant_id uuid, deal_id uuid, contact_id uuid, role text, profile_id uuid, first_name text, last_name text, company text, email text, phone text, contact_hidden boolean)
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  with deal as materialized (
    select private.can_access_deal(p_deal) as can_access,
           private.deal_role(p_deal) as deal_role,
           private.is_pure_buyer(p_deal) as pure_buyer,
           private.is_pure_seller(p_deal) as pure_seller,
           private.is_staffish() as staffish,
           private.my_contact_id() as my_contact,
           private.my_side(p_deal) as my_side
  )
  select dp.id, dp.deal_id, c.id, dp.role, c.profile_id, c.first_name, c.last_name, c.company,
    case when h then '' else c.email end, case when h then '' else c.phone end, h
  from deal
  join public.deal_participants dp on dp.deal_id = p_deal
  join public.contacts c on c.id = dp.contact_id
  cross join lateral (
    select not (
      deal.staffish
      or c.id = deal.my_contact
      or private.side_of(dp.role) is null
      or private.side_of(dp.role) = deal.my_side
    ) as h
  ) z
  where deal.can_access
    and not (deal.deal_role in ('Client-Buyer', 'Client-Seller') and dp.role like 'Client-%' and dp.role <> deal.deal_role)
    and not (dp.role = 'Listing Agent' and deal.pure_buyer)
    and not (dp.role = 'Buyer Agent' and deal.pure_seller)
  order by dp.ctid
$fnbody$;

do $post$
declare
  n int;
begin
  select count(*) into n from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'rpc_deal_contacts';
  if n is distinct from 1 then
    raise exception 'private.rpc_deal_contacts count changed to %; refusing to commit', n;
  end if;
  if (select count(*) from _pol_before) is distinct from (
    select count(*) from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
  ) then
    raise exception 'public policy count changed; refusing to commit';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'rpc_deal_contacts'
      and pg_get_function_identity_arguments(p.oid) = 'p_deal uuid'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '6692e77223a73204e69eaa960bc651386a705bcf923ae3d1f12b438758428d58'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.rpc_deal_contacts() did not land as the hoisted body; refusing to commit';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'deal_contacts'
      and pg_get_function_identity_arguments(p.oid) = 'p_deal uuid'
      and p.provolatile = 's' and not p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '701f79de0559b176982aefe2222b100459fa840c67f65cea1518026e7cbf1ca0'
  ) then
    raise exception 'public.deal_contacts() changed; refusing to commit';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'viewer_is_demo'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'bcf68284dbb6c15c01c313fb855684b8b5e527fa5e8701afd695792703cdf16d'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.viewer_is_demo() is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'me_role'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'b729a85e770977f8421e41b62d612570dea8e71e225c915872e43e0cf017ec83'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.me_role() is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'is_admin'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '1b338b080fff82468bddd762745ac8db01afec526453569cf72b189883e595eb'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.is_admin() is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'can_access_deal'
      and pg_get_function_identity_arguments(p.oid) = 'd uuid'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '278d10598eab76147d3117cd96ad5e2df702a16bfbec86552f0495b7242633e2'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.can_access_deal(uuid) is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'effective_uid'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '57c143b27533e4b6cf45156c0c04e4558ae16a9533892f921cdb284dde8061fe'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.effective_uid() is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'is_staffish'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'aec095b39f9a94687da50704b6626b68d4bcfe13ade6d8bfe3d8e2720318848d'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.is_staffish() is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'task_visible'
      and pg_get_function_identity_arguments(p.oid) = 'owner uuid, assigned text, d uuid'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'c94003050d36b67994248bf46370a04729a3a381fc2407b3b79af0e5911f41ba'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.task_visible(uuid, text, uuid) is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'participant_visible'
      and pg_get_function_identity_arguments(p.oid) = 'd uuid, prole text'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'e9f794dbd2e70e1f05464dc9098aa040694482e0f7fe1e9e72f2e9f557b4d724'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.participant_visible(uuid, text) is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'deal_role'
      and pg_get_function_identity_arguments(p.oid) = 'd uuid'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '833750a2dd81a29d0869c890a01fefbc872d3fd01bea781480c14993471bd605'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.deal_role(uuid) is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'is_pure_buyer'
      and pg_get_function_identity_arguments(p.oid) = 'd uuid'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '0067ad15547737cb2da9be5e1ae5b07b1f88385830902b081093540ea6a17e31'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.is_pure_buyer(uuid) is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'is_pure_seller'
      and pg_get_function_identity_arguments(p.oid) = 'd uuid'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '7867b90324282002616b1de336b797c1fcefcd37256d27dd1f2d3fb6803c38c5'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.is_pure_seller(uuid) is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'my_contact_id'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '5f80fb30f907a6eacb748e5a180a829c748fa2d647426b3d38f036f55c248bba'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.my_contact_id() is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'my_side'
      and pg_get_function_identity_arguments(p.oid) = 'd uuid'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '1205c279a7046b0285e393e4b0ceea35591155f6028a9640b28e36cea30a9f0d'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.my_side(uuid) is not the captured helper; refusing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'side_of'
      and pg_get_function_identity_arguments(p.oid) = 'r text'
      and p.provolatile = 'i' and not p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '6196dc14c28056fa6837f34d1087ed319780aba0cf313705afb1f35e67ff5cf0'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.side_of(text) is not the captured helper; refusing';
  end if;

  if exists (
    select 1
    from _pol_before b
    join pg_class c on c.relname = b.rel
    join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
    join pg_policy pol on pol.polrelid = c.oid and pol.polname = b.polname
    where (b.cmd is distinct from pol.polcmd
        or b.permissive is distinct from pol.polpermissive
        or b.qual is distinct from pg_get_expr(pol.polqual, pol.polrelid)
        or b.chk is distinct from pg_get_expr(pol.polwithcheck, pol.polrelid)
        or b.roles is distinct from array(select r.rolname::text from pg_roles r where r.oid = any (pol.polroles) order by 1))
  ) then
    raise exception 'a policy changed during the function replace; refusing to commit';
  end if;

end
$post$;

commit;
