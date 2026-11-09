-- Unpublished hoist candidate. Do not apply to a hosted database until reviewed.
-- One transaction, 3s lock timeout. Refuses unless the captured policy text,
-- attributes, helper source hashes, and execute privileges match live TEST.
-- F1 deals only. demo_scope reads viewer_is_demo once. deals_select ORs the
-- exact first branch of private.can_access_deal(d) before the per-row call:
--   me_role() is not null and (is_admin() or me_role() in ('Processor', 'Sales Team'))
-- That branch does not look at the deal. It is never null, and when it is true
-- can_access_deal returns true for every deal id. FIRST OR can_access_deal(id)
-- is therefore the same boolean as can_access_deal(id).

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
  q text;
  cmd "char";
  perm boolean;
  chk text;
  roles text[];
begin
  select count(*) into n
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'deals';
  if n is distinct from 4 then
    raise exception 'public.deals policy count is %, expected 4; refusing', n;
  end if;

  insert into _pol_before (rel, polname, cmd, permissive, qual, chk, roles)
  select c.relname, pol.polname, pol.polcmd, pol.polpermissive,
         pg_get_expr(pol.polqual, pol.polrelid),
         pg_get_expr(pol.polwithcheck, pol.polrelid),
         array(select r.rolname::text from pg_roles r where r.oid = any (pol.polroles) order by 1)
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'deals';

  select b.qual, b.cmd, b.permissive, b.chk, b.roles into q, cmd, perm, chk, roles
  from _pol_before b where b.polname = 'deals_select';
  if q is distinct from $q$private.can_access_deal(id)$q$
     or cmd is distinct from 'r' or perm is distinct from true or chk is not null
     or roles is distinct from array['authenticated'] then
    raise exception 'deals_select is not the captured preimage; refusing';
  end if;
  select b.qual, b.cmd, b.permissive, b.chk, b.roles into q, cmd, perm, chk, roles
  from _pol_before b where b.polname = 'demo_scope';
  if q is distinct from $q$(is_demo = private.viewer_is_demo())$q$
     or chk is distinct from $q$(is_demo = private.viewer_is_demo())$q$
     or cmd is distinct from '*' or perm is distinct from false
     or roles is distinct from array['authenticated'] then
    raise exception 'deals demo_scope is not the captured preimage; refusing';
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

end
$pre$;

alter policy demo_scope on public.deals
  using ((is_demo = (select private.viewer_is_demo())))
  with check ((is_demo = (select private.viewer_is_demo())));

alter policy deals_select on public.deals
  using (((select private.me_role() is not null and (private.is_admin() or private.me_role() in ('Processor', 'Sales Team'))) or private.can_access_deal(id)));

do $post$
declare
  n int;
  q text;
  cmd "char";
  perm boolean;
  chk text;
  roles text[];
begin
  select count(*) into n
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'deals';
  if n is distinct from 4 then
    raise exception 'public.deals policy count changed to %; refusing to commit', n;
  end if;
  select pg_get_expr(pol.polqual, pol.polrelid), pol.polcmd, pol.polpermissive,
         pg_get_expr(pol.polwithcheck, pol.polrelid),
         array(select r.rolname::text from pg_roles r where r.oid = any (pol.polroles) order by 1)
    into q, cmd, perm, chk, roles
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'deals' and pol.polname = 'deals_select';
  if q is distinct from $q$(( SELECT ((private.me_role() IS NOT NULL) AND (private.is_admin() OR (private.me_role() = ANY (ARRAY['Processor'::text, 'Sales Team'::text]))))) OR private.can_access_deal(id))$q$
     or cmd is distinct from 'r' or perm is distinct from true or chk is not null
     or roles is distinct from array['authenticated'] then
    raise exception 'deals_select did not deparse to the hoisted qual; refusing to commit';
  end if;
  select pg_get_expr(pol.polqual, pol.polrelid), pg_get_expr(pol.polwithcheck, pol.polrelid),
         pol.polcmd, pol.polpermissive,
         array(select r.rolname::text from pg_roles r where r.oid = any (pol.polroles) order by 1)
    into q, chk, cmd, perm, roles
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'deals' and pol.polname = 'demo_scope';
  if q is distinct from $q$(is_demo = ( SELECT private.viewer_is_demo() AS viewer_is_demo))$q$
     or chk is distinct from $q$(is_demo = ( SELECT private.viewer_is_demo() AS viewer_is_demo))$q$
     or cmd is distinct from '*' or perm is distinct from false
     or roles is distinct from array['authenticated'] then
    raise exception 'deals demo_scope did not deparse to the hoisted qual; refusing to commit';
  end if;

  if exists (
    select 1
    from _pol_before b
    join pg_class c on c.relname = b.rel
    join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
    join pg_policy pol on pol.polrelid = c.oid and pol.polname = b.polname
    where b.polname not in ('deals_select', 'demo_scope')
      and (b.cmd is distinct from pol.polcmd
        or b.permissive is distinct from pol.polpermissive
        or b.qual is distinct from pg_get_expr(pol.polqual, pol.polrelid)
        or b.chk is distinct from pg_get_expr(pol.polwithcheck, pol.polrelid)
        or b.roles is distinct from array(select r.rolname::text from pg_roles r where r.oid = any (pol.polroles) order by 1))
  ) then
    raise exception 'a deals policy outside the hoist changed; refusing to commit';
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

end
$post$;

commit;
