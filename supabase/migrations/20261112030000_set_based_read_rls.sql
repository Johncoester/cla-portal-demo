-- tasks_select and documents_select called a security-definer helper on every
-- row. Each call re-read the viewer. This migration keeps that boolean, but
-- the viewer gate runs once per query.
-- A staff member who can open every deal gets a constant true (tasks) or a
-- folder-row check (documents). Everyone else uses one set of readable ids.
-- demo_scope compares the demo flag to one hoisted viewer bit, against one
-- set of deals, instead of calling the helpers on every row.
-- Rollback: supabase/rollbacks/20261112030000_set_based_read_rls.sql
begin;
set local lock_timeout = '3s';

do $pre$
declare
  q text;
begin
  if to_regprocedure('private.reader_gate()') is null
     or to_regprocedure('private.reader_can_deal(uuid,uuid,text,boolean,uuid,boolean)') is null
     or to_regprocedure('private.task_readable(uuid)') is null
     or to_regprocedure('private.document_readable(uuid)') is null
     or to_regprocedure('private.deal_is_demo(uuid)') is null then
    raise exception 'drift: a one-pass helper from the earlier speed migrations is missing';
  end if;

  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_select';
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from 'a43d76d8c1b36db14a0c1a4458ea116505082319d0a2f95d9933d01d9d968b22' then
    raise exception 'drift: tasks_select hash %', encode(sha256(convert_to(coalesce(q, ''), 'UTF8')), 'hex');
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_select';
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from '4a55376ea38b789bc16270e8cea94167f5260622929e56a570dd24993256078e' then
    raise exception 'drift: documents_select hash %', encode(sha256(convert_to(coalesce(q, ''), 'UTF8')), 'hex');
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'task_templates' and policyname = 'templates_select';
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from '25b82d1ae86964e1ef68253712a289931c3558779e728876ee69c0d7e6272ff3' then
    raise exception 'drift: templates_select hash %', encode(sha256(convert_to(coalesce(q, ''), 'UTF8')), 'hex');
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'documents' and policyname = 'demo_scope';
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from 'cb70d646d9f4b6ae82e05e5d7263d32eb7ca6a80f30dfc2de271864481a0356c' then
    raise exception 'drift: documents demo_scope hash %', encode(sha256(convert_to(coalesce(q, ''), 'UTF8')), 'hex');
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'demo_scope';
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from 'c965e22c726eae1f889afee723fd88289118520a1334fdb6dcea205a86b37c01' then
    raise exception 'drift: tasks demo_scope hash %', encode(sha256(convert_to(coalesce(q, ''), 'UTF8')), 'hex');
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_audience_limit';
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from '8a3a541714f753b268bb0e661e91cb7fd3d20700127c67823e292ab17310a25b' then
    raise exception 'drift: tasks_audience_limit hash %', encode(sha256(convert_to(coalesce(q, ''), 'UTF8')), 'hex');
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_retired_kept';
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from 'd98fe1e53645ac78208255161a28fc0e383a76bbc7080e7edd6632e3c465756c' then
    raise exception 'drift: tasks_retired_kept hash %', encode(sha256(convert_to(coalesce(q, ''), 'UTF8')), 'hex');
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_switch_hidden';
  if encode(sha256(convert_to(q, 'UTF8')), 'hex') is distinct from '8f4c3ef96f6864eae2d4aad3f7cb02c41335b64e8980dfdeabd6c217892524f4' then
    raise exception 'drift: tasks_switch_hidden hash %', encode(sha256(convert_to(coalesce(q, ''), 'UTF8')), 'hex');
  end if;
end
$pre$;

create or replace function private.reader_deal_ids()
returns setof uuid
language sql
stable
security definer
rows 30
set search_path to pg_catalog, public, extensions
set jit = off
as $deals$
  select d.id
  from private.reader_gate() g
  join public.deals d
    on private.reader_can_deal(d.id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
$deals$;

create or replace function private.demo_visible_deal_ids()
returns setof uuid
language sql
stable
security definer
rows 30
set search_path to pg_catalog, public, extensions
set jit = off
as $demo$
  select d.id
  from private.reader_gate() g
  join public.deals d on d.is_demo = g.is_demo
$demo$;

create or replace function private.outside_readable_task_ids()
returns setof uuid
language sql
stable
security definer
rows 200
set search_path to pg_catalog, public, extensions
set jit = off
as $tasks$
  with g as materialized (
    select * from private.reader_gate()
  ),
  role_src as (
    select p.deal_id, p.role
    from public.deal_participants p
    join public.contacts c on c.id = p.contact_id
    cross join g
    where g.role = 'Outside user'
      and c.profile_id = g.uid
      and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
  ),
  per_deal as (
    select d.deal_id,
      coalesce((
        select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
        from (select distinct s.role from role_src s where s.deal_id = d.deal_id) x
      ), array['Outside user']::text[]) as roles,
      coalesce((
        select s.role
        from role_src s
        where s.deal_id = d.deal_id
        order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], s.role)
        limit 1
      ), 'Outside user') as one_role
    from (select distinct deal_id from role_src) d
  )
  select t.id
  from public.tasks t
  cross join g
  left join per_deal r on r.deal_id = t.deal_id
  where (
      (g.active and (g.is_admin or coalesce(g.role in ('Processor', 'Sales Team', 'Transaction Coordinator'), false)))
      or private.reader_can_deal(t.deal_id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
    )
    and (
      g.staffish
      or t.owner_profile_id = g.uid
      or (
        t.owner_profile_id is null
        and t.assigned_role = any (
          case
            when g.role is null then '{}'::text[]
            when g.role <> 'Outside user' then array[g.role]::text[]
            else coalesce(r.roles, array['Outside user']::text[])
          end
        )
      )
      or (
        (case
           when g.role is null then null::text
           when g.role <> 'Outside user' then g.role
           else coalesce(r.one_role, 'Outside user')
         end) in ('Buyer Agent', 'Listing Agent')
        and private.side_of(t.assigned_role) = private.side_of(
          case
            when g.role is null then null::text
            when g.role <> 'Outside user' then g.role
            else coalesce(r.one_role, 'Outside user')
          end
        )
      )
    )
    and not (
      t.assigned_role = 'Client-Buyer'
      and private.emd_receipt_title(t.title)
      and g.uid is not null
      and not g.staffish
      and coalesce(
        (case
           when g.role is distinct from 'Outside user' then 'staff'
           else (
             select case when count(distinct s) = 1 then max(s) end
             from (
               select private.side_of(rr) as s
               from unnest(coalesce(r.roles, array['Outside user']::text[])) rr
             ) q
             where s is not null
           )
         end) <> 'staff',
        false
      )
      and 'Client-Buyer' = any (coalesce(r.roles, array['Outside user']::text[]))
      and not (coalesce(r.roles, array['Outside user']::text[]) && array['Buyer Agent', 'Listing Agent']::text[])
    )
$tasks$;

revoke all on function private.reader_deal_ids() from public;
revoke all on function private.demo_visible_deal_ids() from public;
revoke all on function private.outside_readable_task_ids() from public;
grant execute on function private.reader_deal_ids() to authenticated;
grant execute on function private.demo_visible_deal_ids() to authenticated;
grant execute on function private.outside_readable_task_ids() to authenticated;

alter policy tasks_select on public.tasks
using (
  case
    when (select g.active and (g.is_admin or coalesce(g.role in ('Processor', 'Sales Team', 'Transaction Coordinator'), false))
            from private.reader_gate() g)
    then true
    when (select g.staffish from private.reader_gate() g)
    then deal_id in (select private.reader_deal_ids())
    else id in (select private.outside_readable_task_ids())
  end
);

alter policy tasks_audience_limit on public.tasks
using (
  case
    when audiences is null then true
    when (select g.staffish from private.reader_gate() g) then true
    else private.task_outside_audience(id)
  end
);

alter policy tasks_retired_kept on public.tasks
using (
  case
    when template_code is null then true
    when (select g.is_admin or g.is_processor from private.reader_gate() g) then true
    when not private.template_code_retired(template_code) then true
    else status = any (array['todo', 'in_progress', 'blocked'])
     and owner_profile_id = (select g.uid from private.reader_gate() g)
  end
);

alter policy tasks_switch_hidden on public.tasks
using (
  case
    when template_code is null then true
    when (select g.is_admin from private.reader_gate() g) then true
    else private.task_enabled(template_code)
  end
);

alter policy demo_scope on public.tasks
using (
  case
    when deal_id is null then not (select g.is_demo from private.reader_gate() g)
    else deal_id in (select private.demo_visible_deal_ids())
  end
)
with check (
  case
    when deal_id is null then not (select g.is_demo from private.reader_gate() g)
    else deal_id in (select private.demo_visible_deal_ids())
  end
);

alter policy templates_select on public.task_templates
using (
  case
    when (select g.is_admin or coalesce(g.role in ('Processor', 'Preprocessor', 'Transaction Coordinator'), false)
            from private.reader_gate() g)
    then true
    else id in (select t.template_id from public.tasks t where t.template_id is not null)
  end
);

create or replace function private.readable_document_ids()
returns setof uuid
language sql
stable
security definer
rows 300
set search_path to pg_catalog, public, extensions
set jit = off
as $docs$

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
  ),
  role_row as (
    select o.id as doc_id, z.roles,
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
  select o.id
    from one o
    cross join gate g
    join role_row r on r.doc_id = o.id
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
  
$docs$;

revoke all on function private.readable_document_ids() from public;
grant execute on function private.readable_document_ids() to authenticated;

alter policy documents_select on public.documents
using (id in (select private.readable_document_ids()));

alter policy demo_scope on public.documents
using (
  case
    when deal_id is null then not (select private.viewer_is_demo())
    else deal_id in (select private.demo_visible_deal_ids())
  end
)
with check (
  case
    when deal_id is null then not (select private.viewer_is_demo())
    else deal_id in (select private.demo_visible_deal_ids())
  end
);

do $post$
declare
  q text;
begin
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_select';
  if q not like '%reader_gate%' or q like '%task_readable%' then
    raise exception 'tasks_select did not become a once-per-query gate (%)', q;
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_select';
  if q not like '%readable_document_ids%' then
    raise exception 'documents_select did not become one set (%)', q;
  end if;
  select qual into q from pg_policies
  where schemaname = 'public' and tablename = 'documents' and policyname = 'demo_scope';
  if q not like '%demo_visible_deal_ids%' then
    raise exception 'documents demo_scope still calls the helper per row (%)', q;
  end if;
  if to_regprocedure('private.readable_document_ids()') is null then
    raise exception 'readable_document_ids is missing';
  end if;
  if to_regprocedure('private.reader_deal_ids()') is null
     or to_regprocedure('private.outside_readable_task_ids()') is null then
    raise exception 'a set helper is missing';
  end if;
end
$post$;

commit;
