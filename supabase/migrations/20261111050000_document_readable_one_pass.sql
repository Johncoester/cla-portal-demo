-- documents list was canceling at the authenticated statement_timeout (8s).
-- PostgREST GET /documents?deal_id=eq.<id> returned SQLSTATE 57014.
-- The error context was inside private.document_readable, in the nested
-- SQL helpers (effective_uid during startup, me_role, deal_role, doc_visible,
-- file_roles_of, is_pure_seller), not in a missing column or a 42P17 recursion.
-- One security-definer statement reads the viewer once and applies the same
-- boolean the helper chain applied per row. The select policy text is unchanged.
-- Inner reads stay security definer so they do not re-enter documents_select.
--
-- Rollback: supabase/rollbacks/20261111050000_document_readable_one_pass.sql
begin;
set local lock_timeout = '3s';

do $pre$
declare
  n int;
  q text;
  v_cmd text;
  v_perm text;
  v_roles text[];
begin
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'documents';
  if n is distinct from 5 then
    raise exception 'drift: documents has % policies, expected 5', n;
  end if;

  select qual, cmd, permissive, roles
    into q, v_cmd, v_perm, v_roles
  from pg_policies
  where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_select';
  if q is distinct from 'private.document_readable(id)'
     or v_cmd is distinct from 'SELECT'
     or v_perm is distinct from 'PERMISSIVE'
     or v_roles is distinct from '{authenticated}' then
    raise exception 'drift: documents_select is not the captured policy';
  end if;

  if to_regprocedure('auth.uid()') is null then
    raise exception 'drift: auth.uid() is missing';
  end if;
  if to_regprocedure('private.buyer_agent_blocked(text,text,text,boolean)') is null then
    raise exception 'drift: private.buyer_agent_blocked(text,text,text,boolean) is missing';
  end if;
  if to_regclass('public.documents') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.contacts') is null
     or to_regclass('public.deal_participants') is null
     or to_regclass('public.deals') is null
     or to_regclass('public.deal_sales_people') is null
     or to_regclass('public.folders') is null
     or to_regclass('public.signature_requests') is null
     or to_regclass('public.signature_signers') is null
     or to_regclass('private.view_as_sessions') is null then
    raise exception 'drift: a table document_readable reads is missing';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'document_readable'
      and pg_get_function_identity_arguments(p.oid) = 'doc uuid'
      and pg_get_function_result(p.oid) = 'boolean'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = '4625479cd07eeb7fe2355cbe3fe5ed502981d270d22a36df41fbd369a6ec93c3'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'drift: private.document_readable(uuid) is not the captured helper';
  end if;
end
$pre$;

create temp table _doc_pol on commit drop as
select policyname, cmd, permissive, roles::text[] as roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'documents';

create or replace function private.document_readable(doc uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $fn$
  with viewer as materialized (
    select coalesce(
      (select s.target_id
         from private.view_as_sessions s
         join public.profiles a on a.id = s.actor_id
        where s.actor_id = auth.uid()
          and a.role = 'Super admin' and a.is_admin and a.status = 'active'
          and s.stopped_at is null
          and s.expires_at > pg_catalog.now()),
      auth.uid()
    ) as uid
  ),
  me as materialized (
    select v.uid,
           (select p.role from public.profiles p where p.id = v.uid and p.status = 'active') as active_role,
           (select p.role from public.profiles p where p.id = v.uid) as raw_role,
           coalesce((select p.is_admin from public.profiles p where p.id = v.uid and p.status = 'active'), false) as is_admin,
           (select c.id from public.contacts c where c.profile_id = v.uid) as contact_id
    from viewer v
  ),
  gate as materialized (
    select m.*,
           (m.active_role is not null) as active,
           (m.is_admin or coalesce(m.active_role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'), false)) as staffish
    from me m
  ),
  one as (
    select d.*
    from public.documents d
    where d.id = doc
  ),
  role_row as (
    select z.roles,
           z.one_role,
           case
             when g.raw_role is distinct from 'Outside user' then 'staff'
             else (
               select case when count(distinct s) = 1 then max(s) end
               from (
                 select case r
                          when 'Buyer Agent' then 'buyer'
                          when 'Client-Buyer' then 'buyer'
                          when 'Listing Agent' then 'seller'
                          when 'Client-Seller' then 'seller'
                        end as s
                 from unnest(z.roles) r
               ) q
               where s is not null
             )
           end as viewer_side
    from gate g
    cross join one o
    cross join lateral (
      select
        case
          when g.active_role is null then '{}'::text[]
          when g.raw_role is null then '{}'::text[]
          when g.raw_role <> 'Outside user' then array[g.raw_role]::text[]
          else coalesce((
            select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
            from (
              select distinct p.role
              from public.deal_participants p
              join public.contacts c on c.id = p.contact_id
              where p.deal_id = o.deal_id
                and c.profile_id = g.uid
                and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
            ) x
          ), array['Outside user']::text[])
        end as roles,
        case
          when g.active_role is null then null::text
          when g.active_role <> 'Outside user' then g.active_role
          else coalesce((
            select p.role
            from public.deal_participants p
            join public.contacts c on c.id = p.contact_id
            where p.deal_id = o.deal_id
              and c.profile_id = g.uid
              and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
            order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], p.role)
            limit 1
          ), 'Outside user')
        end as one_role
    ) z
  )
  select exists (
    select 1
    from one o
    cross join gate g
    cross join role_row r
    left join public.folders f on f.id = o.folder_id
    left join lateral (
      select case
               when pr.role is distinct from 'Outside user' then 'staff'
               else (
                 select case when count(distinct s) = 1 then max(s) end
                 from (
                   select case ur
                            when 'Buyer Agent' then 'buyer'
                            when 'Client-Buyer' then 'buyer'
                            when 'Listing Agent' then 'seller'
                            when 'Client-Seller' then 'seller'
                          end as s
                   from unnest(
                     case
                       when pr.role is null then '{}'::text[]
                       when pr.role <> 'Outside user' then array[pr.role]::text[]
                       else coalesce((
                         select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
                         from (
                           select distinct p.role
                           from public.deal_participants p
                           join public.contacts c on c.id = p.contact_id
                           where p.deal_id = o.deal_id
                             and c.profile_id = o.uploaded_by
                             and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
                         ) x
                       ), array['Outside user']::text[])
                     end
                   ) ur
                 ) q
                 where s is not null
               )
             end as side
      from (select (select role from public.profiles where id = o.uploaded_by) as role) pr
    ) up on true
    where g.active
      and (
        o.deal_id is null
        or (
          g.is_admin
          or coalesce(g.active_role in ('Processor', 'Sales Team', 'Transaction Coordinator'), false)
          or (g.active_role = 'Preprocessor' and exists (
                select 1 from public.deals x where x.id = o.deal_id and x.preprocessor_user_id = g.uid))
          or (g.active_role in ('Sales Person', 'Sales Team') and exists (
                select 1 from public.deal_sales_people s where s.deal_id = o.deal_id and s.sales_id = g.uid))
          or exists (
                select 1 from public.deal_participants p
                where p.deal_id = o.deal_id and p.contact_id = g.contact_id)
        )
      )
      and (
        o.folder_id is null
        or (
          f.id is not null
          and (not f.staff_only or g.staffish)
          and (
            f.scope = 'library'
            or g.is_admin
            or coalesce(g.active_role in ('Processor', 'Sales Team', 'Transaction Coordinator'), false)
            or (g.active_role = 'Preprocessor' and exists (
                  select 1 from public.deals x where x.id = f.deal_id and x.preprocessor_user_id = g.uid))
            or (g.active_role in ('Sales Person', 'Sales Team') and exists (
                  select 1 from public.deal_sales_people s where s.deal_id = f.deal_id and s.sales_id = g.uid))
            or exists (
                  select 1 from public.deal_participants p
                  where p.deal_id = f.deal_id and p.contact_id = g.contact_id)
          )
        )
      )
      and (
        not o.wire_instructions
        or o.uploaded_by = g.uid
        or g.staffish
        or (o.deal_id is not null and g.uid is not null and 'Client-Buyer' = any (r.roles))
      )
      and not (
        o.deal_id is not null
        and 'Buyer Agent' = any (r.roles)
        and not ('Client-Buyer' = any (r.roles))
        and not g.staffish
        and private.buyer_agent_blocked(o.title_doc_kind, o.name, o.doc_type, o.wire_instructions)
      )
      and case
        when o.deal_id is not null
         and o.uploaded_by is distinct from g.uid
         and g.uid is not null
         and not g.staffish
         and coalesce(r.viewer_side <> 'staff', false)
         and 'Client-Buyer' = any (r.roles)
         and not (r.roles && array['Buyer Agent', 'Listing Agent']::text[])
        then (o.shared_with_client and o.visibility <> 'staff')
          or (
            (
              o.uploaded_by = g.uid
              or up.side = 'staff'
              or exists (
                select 1
                from public.signature_requests req
                join public.signature_signers sig on sig.request_id = req.id
                where req.document_id = o.id and sig.profile_id = g.uid
              )
            )
            and (
              o.uploaded_by = g.uid
              or g.staffish
              or o.visibility = 'all'
              or (o.visibility in ('buyer', 'seller') and o.visibility = case r.one_role
                    when 'Buyer Agent' then 'buyer'
                    when 'Client-Buyer' then 'buyer'
                    when 'Listing Agent' then 'seller'
                    when 'Client-Seller' then 'seller'
                  end)
            )
          )
        when o.deal_id is not null
         and o.uploaded_by is distinct from g.uid
         and g.uid is not null
         and not g.staffish
         and coalesce(r.viewer_side <> 'staff', false)
         and 'Client-Seller' = any (r.roles)
         and not ('Client-Buyer' = any (r.roles))
         and not (r.roles && array['Buyer Agent', 'Listing Agent']::text[])
        then (o.shared_with_seller and o.visibility <> 'staff')
          or (
            (
              o.uploaded_by = g.uid
              or coalesce(up.side, '') in ('staff', 'seller')
              or exists (
                select 1
                from public.signature_requests req
                join public.signature_signers sig on sig.request_id = req.id
                where req.document_id = o.id and sig.profile_id = g.uid
              )
            )
            and (
              o.uploaded_by = g.uid
              or g.staffish
              or o.visibility = 'all'
              or (o.visibility in ('buyer', 'seller') and o.visibility = case r.one_role
                    when 'Buyer Agent' then 'buyer'
                    when 'Client-Buyer' then 'buyer'
                    when 'Listing Agent' then 'seller'
                    when 'Client-Seller' then 'seller'
                  end)
            )
          )
        else (
          o.uploaded_by = g.uid
          or g.staffish
          or o.visibility = 'all'
          or (o.visibility in ('buyer', 'seller') and o.visibility = case r.one_role
                when 'Buyer Agent' then 'buyer'
                when 'Client-Buyer' then 'buyer'
                when 'Listing Agent' then 'seller'
                when 'Client-Seller' then 'seller'
              end)
        )
        or (
          o.title_doc_kind = 'title_commitment'
          and o.deal_id is not null
          and 'Buyer Agent' = any (r.roles)
          and not g.staffish
          and not private.buyer_agent_blocked(o.title_doc_kind, o.name, o.doc_type, o.wire_instructions)
        )
      end
  )
$fn$;

do $post$
declare
  n int;
  q text;
begin
  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'documents';
  if n is distinct from 5 then
    raise exception 'drift: documents policy count changed to %', n;
  end if;
  select qual into q
  from pg_policies
  where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_select';
  if q is distinct from 'private.document_readable(id)' then
    raise exception 'drift: documents_select qual changed';
  end if;
  if (select count(*) from _doc_pol) is distinct from 5
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'documents')
        is distinct from (select count(*) from _doc_pol) then
    raise exception 'drift: documents policy set changed size';
  end if;
  if exists (
    select 1
    from _doc_pol b
    join pg_policies p
      on p.schemaname = 'public' and p.tablename = 'documents' and p.policyname = b.policyname
    where b.cmd is distinct from p.cmd
       or b.permissive is distinct from p.permissive
       or b.roles is distinct from p.roles::text[]
       or b.qual is distinct from p.qual
       or b.with_check is distinct from p.with_check
  ) then
    raise exception 'drift: a documents policy changed';
  end if;
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'document_readable'
      and pg_get_function_identity_arguments(p.oid) = 'doc uuid'
      and pg_get_function_result(p.oid) = 'boolean'
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
      and pg_get_userbyid(p.proowner) = 'postgres'
      and encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = 'ba16cbd650a3322dd0f300c09d1aa8cd0e3b8b390591e3cac8f712cc2c58b7fc'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'private.document_readable(uuid) did not land as the one-pass body';
  end if;
end
$post$;

commit;
