-- Unpublished hoist candidate. Do not apply to a hosted database until reviewed.
-- One transaction, 3s lock timeout. Refuses unless the captured policy text,
-- attributes, helper source hashes, and execute privileges match live TEST.
-- F2 tasks only. Both viewer_is_demo calls in tasks demo_scope (and the same
-- two calls in WITH CHECK) become one-shot scalar subqueries. tasks_select ORs
-- the same can_access_deal first branch used on deals, and ORs (select
-- private.is_staffish()) before task_visible. The 3-argument task_visible body
-- is exactly is_staffish() or <the rest>, and is_staffish() is a non-null boolean,
-- so that OR does not change which rows pass.

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
  from pg_policy pol join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'tasks';
  if n is distinct from 8 then
    raise exception 'public.tasks policy count is %, expected 8; refusing', n;
  end if;

  insert into _pol_before (rel, polname, cmd, permissive, qual, chk, roles)
  select c.relname, pol.polname, pol.polcmd, pol.polpermissive,
         pg_get_expr(pol.polqual, pol.polrelid),
         pg_get_expr(pol.polwithcheck, pol.polrelid),
         array(select r.rolname::text from pg_roles r where r.oid = any (pol.polroles) order by 1)
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'tasks';

  select b.qual, b.cmd, b.permissive, b.chk, b.roles into q, cmd, perm, chk, roles
  from _pol_before b where b.polname = 'tasks_select';
  if q is distinct from $q$(private.can_access_deal(deal_id) AND private.task_visible(owner_profile_id, assigned_role, deal_id) AND (NOT ((assigned_role = 'Client-Buyer'::text) AND private.emd_receipt_title(title) AND private.is_pure_buyer(deal_id))))$q$
     or cmd is distinct from 'r' or perm is distinct from true or chk is not null
     or roles is distinct from array['authenticated'] then
    raise exception 'tasks_select is not the captured preimage; refusing';
  end if;
  select b.qual, b.chk, b.cmd, b.permissive, b.roles into q, chk, cmd, perm, roles
  from _pol_before b where b.polname = 'demo_scope';
  if q is distinct from $q$
CASE
    WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo())
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = tasks.deal_id)) = private.viewer_is_demo())
END$q$
     or chk is distinct from $q$
CASE
    WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo())
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = tasks.deal_id)) = private.viewer_is_demo())
END$q$
     or cmd is distinct from '*' or perm is distinct from false
     or roles is distinct from array['authenticated'] then
    raise exception 'tasks demo_scope is not the captured preimage; refusing';
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

end
$pre$;

alter policy demo_scope on public.tasks
  using (case when (deal_id is null) then (not (select private.viewer_is_demo())) else ((select d.is_demo from deals d where (d.id = tasks.deal_id)) = (select private.viewer_is_demo())) end)
  with check (case when (deal_id is null) then (not (select private.viewer_is_demo())) else ((select d.is_demo from deals d where (d.id = tasks.deal_id)) = (select private.viewer_is_demo())) end);

alter policy tasks_select on public.tasks
  using ((
    ((select private.me_role() is not null and (private.is_admin() or private.me_role() in ('Processor', 'Sales Team'))) or private.can_access_deal(deal_id))
    and ((select private.is_staffish()) or private.task_visible(owner_profile_id, assigned_role, deal_id))
    and (not ((assigned_role = 'Client-Buyer'::text) and private.emd_receipt_title(title) and private.is_pure_buyer(deal_id)))
  ));

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
  from pg_policy pol join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'tasks';
  if n is distinct from 8 then
    raise exception 'public.tasks policy count changed to %; refusing to commit', n;
  end if;
  select pg_get_expr(pol.polqual, pol.polrelid), pol.polcmd, pol.polpermissive,
         pg_get_expr(pol.polwithcheck, pol.polrelid),
         array(select r.rolname::text from pg_roles r where r.oid = any (pol.polroles) order by 1)
    into q, cmd, perm, chk, roles
  from pg_policy pol join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'tasks' and pol.polname = 'tasks_select';
  if q is distinct from $q$((( SELECT ((private.me_role() IS NOT NULL) AND (private.is_admin() OR (private.me_role() = ANY (ARRAY['Processor'::text, 'Sales Team'::text]))))) OR private.can_access_deal(deal_id)) AND (( SELECT private.is_staffish() AS is_staffish) OR private.task_visible(owner_profile_id, assigned_role, deal_id)) AND (NOT ((assigned_role = 'Client-Buyer'::text) AND private.emd_receipt_title(title) AND private.is_pure_buyer(deal_id))))$q$
     or cmd is distinct from 'r' or perm is distinct from true or chk is not null
     or roles is distinct from array['authenticated'] then
    raise exception 'tasks_select did not deparse to the hoisted qual; refusing to commit';
  end if;
  select pg_get_expr(pol.polqual, pol.polrelid), pg_get_expr(pol.polwithcheck, pol.polrelid),
         pol.polcmd, pol.polpermissive,
         array(select r.rolname::text from pg_roles r where r.oid = any (pol.polroles) order by 1)
    into q, chk, cmd, perm, roles
  from pg_policy pol join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'tasks' and pol.polname = 'demo_scope';
  if q is distinct from $q$
CASE
    WHEN (deal_id IS NULL) THEN (NOT ( SELECT private.viewer_is_demo() AS viewer_is_demo))
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = tasks.deal_id)) = ( SELECT private.viewer_is_demo() AS viewer_is_demo))
END$q$
     or chk is distinct from $q$
CASE
    WHEN (deal_id IS NULL) THEN (NOT ( SELECT private.viewer_is_demo() AS viewer_is_demo))
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = tasks.deal_id)) = ( SELECT private.viewer_is_demo() AS viewer_is_demo))
END$q$
     or cmd is distinct from '*' or perm is distinct from false
     or roles is distinct from array['authenticated'] then
    raise exception 'tasks demo_scope did not deparse to the hoisted qual; refusing to commit';
  end if;

  if exists (
    select 1
    from _pol_before b
    join pg_class c on c.relname = b.rel
    join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
    join pg_policy pol on pol.polrelid = c.oid and pol.polname = b.polname
    where b.polname not in ('tasks_select', 'demo_scope')
      and (b.cmd is distinct from pol.polcmd
        or b.permissive is distinct from pol.polpermissive
        or b.qual is distinct from pg_get_expr(pol.polqual, pol.polrelid)
        or b.chk is distinct from pg_get_expr(pol.polwithcheck, pol.polrelid)
        or b.roles is distinct from array(select r.rolname::text from pg_roles r where r.oid = any (pol.polroles) order by 1))
  ) then
    raise exception 'a tasks policy outside the hoist changed; refusing to commit';
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

end
$post$;

commit;
