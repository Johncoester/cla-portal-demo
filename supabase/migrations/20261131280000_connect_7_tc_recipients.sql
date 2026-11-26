-- CONNECT-7 (John Coester, Nov 25 2026, Connect Live Test Checklist row 4.3;
-- Francis Santos: as the buyer's agent TC, Start conversation only offered Sales Person and Processor).
-- An agent transaction coordinator can add the parties on their side of the order to a conversation:
-- buyer-side TC → buyer, buyer agent, buyer's lender; seller-side TC → seller, listing agent.
-- Root cause: private.rpc_message_recipients (SECURITY DEFINER) did not use private.outside_roles
-- or private.linked_agent_roles, so a Buyer Agent TC / Listing Agent TC had no side and only saw CLA staff.
-- The Start conversation UI lists every row the function returns; it does not filter them out.
-- Lender is buyer-side only inside this recipients list. private.side_of and private.person_side
-- are unchanged, so a lender does not gain buyer-side read, contact, or notification rights.
-- A buyer-side viewer may add a Lender through a narrow private.can_message / rpc_create_thread
-- exception (conversation membership only). private.can_message stays null-tolerant so
-- private.thread_postable is unchanged: a sideless member of an existing thread can still
-- reply. rpc_create_thread refuses when can_message is not true (null or false).
-- Demo staff cannot list parties on a real file (deals.is_demo vs private.viewer_is_demo()).
-- Who may call the function, grants, table RLS, and the staff / pure-client branches are otherwise unchanged.
-- Rollback: supabase/rollbacks/20261131280000_connect_7_tc_recipients.sql
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION private.can_message(pid uuid, d uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  -- Null-tolerant on purpose: private.thread_postable uses `not can_message(member)`, and
  -- NULL must not block a sideless member (lender, etc.) from replying in an existing thread.
  -- rpc_create_thread uses `is not true` so a sideless viewer still cannot start a new one.
  select private.is_staffish()
    or private.person_side(pid, d) = 'staff'
    or (private.my_side(d) in ('buyer', 'seller') and private.person_side(pid, d) = private.my_side(d))
    -- CONNECT-7: a buyer-side viewer may add a Lender on this file. Staff already pass is_staffish().
    -- This does not give the lender a side; private.person_side / my_side stay unchanged.
    or (
      private.my_side(d) = 'buyer'
      and exists (
        select 1
        from public.deal_participants dp
        join public.contacts c on c.id = dp.contact_id
        where dp.deal_id = d and c.profile_id = pid and dp.role = 'Lender'
      )
    )
$function$;

CREATE OR REPLACE FUNCTION private.rpc_create_thread(p_deal uuid, p_subject text, p_participants uuid[], p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare tid uuid; pid uuid; members uuid[]; ok_sides boolean;
begin
  if not private.can_access_deal(p_deal) or private.is_view_only() then raise exception 'Not allowed'; end if;
  if coalesce(array_length(p_participants, 1), 0) = 0 then raise exception 'Pick at least one recipient on this order'; end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Write a message first'; end if;
  members := array[private.effective_uid()];
  foreach pid in array p_participants loop
    if pid = private.effective_uid() then continue; end if;
    -- only people who are on this deal (or its processor)
    if not (exists (select 1 from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = p_deal and c.profile_id = pid)
            or pid in (select private.deal_cla_staff(p_deal))) then continue; end if;
    if private.can_message(pid, p_deal) is not true then
      raise exception 'You can message CLA Title staff and people on your own side of this order only' using errcode = '42501'; end if;
    members := array_append(members, pid);
  end loop;
  if coalesce(array_length(members, 1), 0) < 2 then raise exception 'Pick at least one recipient on this order'; end if;
  -- CONNECT-7: a Lender on this file counts as buyer for conversation membership only when the
  -- viewer is staff or already buyer-side. The lender themselves keep person_side null, so they
  -- cannot start or join a buyer-side thread. private.one_side and private.person_side stay unchanged.
  select case when bool_or(s is null) then count(*) <= 1 else count(distinct s) <= 1 end
    into ok_sides
    from (
      select case
        when (private.is_staffish() or private.my_side(p_deal) = 'buyer')
         and exists (
          select 1 from public.deal_participants dp
          join public.contacts c on c.id = dp.contact_id
          where dp.deal_id = p_deal and c.profile_id = p and dp.role = 'Lender'
        ) then 'buyer'
        else private.person_side(p, p_deal)
      end as s
      from unnest(members) p
    ) x
    where s is distinct from 'staff';
  if not coalesce(ok_sides, true) then
    raise exception 'A conversation can include CLA Title staff and ONE side of the order, not both' using errcode = '42501'; end if;
  insert into public.threads (deal_id, subject, created_by) values (p_deal, left(coalesce(nullif(trim(p_subject), ''), 'New conversation'), 150), private.effective_uid()) returning id into tid;
  insert into public.thread_participants (thread_id, profile_id, last_read_at) select tid, m, case when m = private.effective_uid() then now() end from (select distinct unnest(members) m) z;
  insert into public.messages (thread_id, author_id, body) values (tid, private.effective_uid(), left(trim(p_body), 4000));
  return tid; end $function$;

CREATE OR REPLACE FUNCTION private.rpc_message_recipients(p_deal uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, email text, role text, side text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  with gate as (
    select private.effective_uid() as uid,
           private.can_access_deal(p_deal)
             and exists (
               select 1 from public.deals z
               where z.id = p_deal
                 and z.is_demo is not distinct from private.viewer_is_demo()
             ) as ok,
           coalesce(private.is_staffish(), false) as staff,
           private.me_role() as me_role
  ),
  viewer_roles as (
    select case
      when g.me_role is null then '{}'::text[]
      when g.me_role <> 'Outside user' then array[g.me_role]
      else coalesce(nullif((
        select array_agg(x.role order by array_position(
          array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller', 'Buyer Agent TC', 'Listing Agent TC'],
          x.role))
        from (
          select unnest(private.outside_roles(g.uid, p_deal)) as role
          union
          select dp.role
          from public.deal_participants dp
          join public.contacts c on c.id = dp.contact_id
          where dp.deal_id = p_deal and c.profile_id = g.uid
            and dp.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller', 'Buyer Agent TC', 'Listing Agent TC')
        ) x
      ), '{}'::text[]), array['Outside user'])
    end as roles
    from gate g
  ),
  viewer as (
    select g.uid, g.ok, g.staff, g.me_role,
      case
        when g.me_role is null then null
        when g.me_role <> 'Outside user' then g.me_role
        else coalesce(vr.roles[1], 'Outside user')
      end as deal_role,
      case
        when g.staff then 'staff'
        else (
          select case when count(distinct s) = 1 then max(s) end
          from (
            select private.side_of(r) as s
            from unnest(vr.roles) r
          ) q
          where s is not null
        )
      end as my_side,
      case
        when g.staff then array['staff']::text[]
        else coalesce((
          select array_agg(distinct private.side_of(r))
          from unnest(vr.roles) r
          where private.side_of(r) is not null
        ), '{}'::text[])
      end as my_sides,
      (g.uid is not null and not g.staff
        and 'Client-Buyer' = any (vr.roles)
        and not (vr.roles && array['Buyer Agent', 'Listing Agent']::text[])) as pure_buyer,
      (g.uid is not null and not g.staff
        and 'Client-Seller' = any (vr.roles)
        and not ('Client-Buyer' = any (vr.roles))
        and not (vr.roles && array['Buyer Agent', 'Listing Agent']::text[])) as pure_seller
    from gate g
    cross join viewer_roles vr
  ),
  cla as (
    select x.pid as id from (
      select processor_id as pid from public.deals where id = p_deal
      union select preprocessor_user_id from public.deals where id = p_deal
      union select tc_user_id from public.deals where id = p_deal
      union select sales_person_id from public.deals where id = p_deal
      union select s.sales_id from public.deal_sales_people s where s.deal_id = p_deal
      union select c.profile_id
        from public.deal_participants dp
        join public.contacts c on c.id = dp.contact_id
        where dp.deal_id = p_deal
          and dp.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator')
      union
      select p.id
        from public.deal_participants dp
        join public.contacts c on c.id = dp.contact_id
        join public.profiles p on lower(p.email) = lower(btrim(c.email))
        where dp.deal_id = p_deal and c.profile_id is null and btrim(coalesce(c.email, '')) <> ''
          and dp.role in ('Processor', 'Preprocessor') and p.status = 'active'
          and p.role in ('Processor', 'Preprocessor')
          and p.is_demo is not distinct from (select z.is_demo from public.deals z where z.id = p_deal)
    ) x where x.pid is not null
  ),
  targets as (
    select p.id, p.first_name, p.last_name, coalesce(p.email, '') as email, p.role as profile_role
    from public.profiles p
    cross join viewer v
    where v.ok and p.status = 'active' and p.id is distinct from v.uid
      and (
        p.id in (
          select c.profile_id
          from public.deal_participants dp
          join public.contacts c on c.id = dp.contact_id
          where dp.deal_id = p_deal and c.profile_id is not null
            and not (v.deal_role in ('Client-Buyer', 'Client-Seller') and dp.role like 'Client-%' and dp.role <> v.deal_role)
            and not (dp.role = 'Listing Agent' and v.pure_buyer)
            and not (dp.role = 'Buyer Agent' and v.pure_seller)
        )
        or p.id in (select id from cla)
      )
  ),
  labeled as (
    select t.id, t.first_name, t.last_name, t.email, t.profile_role,
      case
        when t.profile_role is null then '{}'::text[]
        when t.profile_role <> 'Outside user' then array[t.profile_role]
        else coalesce(nullif((
          select array_agg(x.role order by array_position(
            array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller', 'Buyer Agent TC', 'Listing Agent TC', 'Lender'],
            x.role))
          from (
            select unnest(private.outside_roles(t.id, p_deal)) as role
            union
            select dp.role
            from public.deal_participants dp
            join public.contacts c on c.id = dp.contact_id
            where dp.deal_id = p_deal and c.profile_id = t.id
              and dp.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller', 'Buyer Agent TC', 'Listing Agent TC', 'Lender')
          ) x
        ), '{}'::text[]), array['Outside user'])
      end as roles
    from targets t
  ),
  portal as (
    select l.id, l.first_name, l.last_name, l.email,
      trim(l.first_name || ' ' || l.last_name) || ' (' ||
        case
          when cardinality(l.roles) > 1 then 'as ' || l.roles[1] || '; also ' || array_to_string(array_remove(l.roles, l.roles[1]), ', ') || ' on this file'
          else coalesce(l.roles[1], 'unknown role')
        end || ')' as role,
      case
        when l.profile_role is distinct from 'Outside user' then 'staff'
        else (
          select case when count(distinct s) = 1 then max(s) end
          from (
            select coalesce(private.side_of(r), case when r = 'Lender' then 'buyer' end) as s
            from unnest(l.roles) r
          ) q where s is not null
        )
      end as side
    from labeled l
    cross join viewer v
    where v.staff
      or (
        (v.pure_buyer or v.pure_seller)
        and btrim(coalesce(l.email, '')) <> ''
        and (
          (
            l.profile_role = 'Processor'
            and l.id in (
              select d.processor_id from public.deals d where d.id = p_deal and d.processor_id is not null
              union
              select c.profile_id
                from public.deal_participants dp
                join public.contacts c on c.id = dp.contact_id
                where dp.deal_id = p_deal and dp.role = 'Processor' and c.profile_id is not null
              union
              select pr.id
                from public.deal_participants dp
                join public.contacts c on c.id = dp.contact_id
                join public.profiles pr on lower(pr.email) = lower(btrim(c.email))
                where dp.deal_id = p_deal
                  and dp.role = 'Processor'
                  and c.profile_id is null
                  and btrim(coalesce(c.email, '')) <> ''
                  and pr.status = 'active'
                  and pr.role = 'Processor'
                  and pr.is_demo is not distinct from (select z.is_demo from public.deals z where z.id = p_deal)
            )
          )
          or (v.pure_buyer and 'Buyer Agent' = any (l.roles))
          or (v.pure_seller and 'Listing Agent' = any (l.roles))
          or (
            l.profile_role = 'Transaction Coordinator'
            and exists (
              select 1
              from public.team_members co
              join public.team_members ag on ag.team_id = co.team_id and ag.member_role = 'agent'
              join public.deal_participants dp on dp.deal_id = p_deal
              join public.contacts c on c.id = dp.contact_id and c.profile_id = ag.profile_id
              where co.profile_id = l.id
                and co.member_role = 'coordinator'
                and dp.role = case when v.pure_buyer then 'Buyer Agent' else 'Listing Agent' end
            )
          )
        )
      )
      or (
        not v.staff
        and not coalesce(v.pure_buyer, false)
        and not coalesce(v.pure_seller, false)
        and (
          l.profile_role is distinct from 'Outside user'
          or (
            cardinality(v.my_sides) > 0
            and v.my_sides <> array['staff']::text[]
            and (
              select case when count(distinct s) = 1 then max(s) end
              from (
                select coalesce(private.side_of(r), case when r = 'Lender' then 'buyer' end) as s
                from unnest(l.roles) r
              ) q where s is not null
            ) = any (v.my_sides)
          )
        )
      )
  ),
  mailed as (
    select distinct on (c.id) c.id, coalesce(c.first_name, ''), coalesce(c.last_name, ''), btrim(c.email), dp.role,
      case dp.role
        when 'Client-Buyer' then 'buyer' when 'Buyer Agent' then 'buyer'
        when 'Client-Seller' then 'seller' when 'Listing Agent' then 'seller'
        else null
      end
    from public.deal_participants dp
    join public.contacts c on c.id = dp.contact_id
    cross join viewer v
    where v.staff and v.ok and dp.deal_id = p_deal   -- FF-072 #24 / FF-054(b): only this file's parties (it listed every file's)
      and c.profile_id is null and btrim(coalesce(c.email, '')) <> ''
      and c.id is distinct from v.uid
    order by c.id, dp.role
  )
  select * from portal
  union all
  select * from mailed
$function$;

do $chk$
declare def text; ps text;
begin
  if private.side_of('Lender') is not null
     or private.side_of('Buyer Agent TC') is distinct from 'buyer'
     or private.side_of('Listing Agent TC') is distinct from 'seller' then
    raise exception 'self-check: side_of must keep agent-coordinator sides and must not treat Lender as a side';
  end if;
  ps := pg_get_functiondef('private.person_side(uuid,uuid)'::regprocedure);
  if position('Lender' in ps) > 0 then
    raise exception 'self-check: person_side must not mention Lender';
  end if;
  def := pg_get_functiondef('private.rpc_message_recipients(uuid)'::regprocedure);
  if position('private.outside_roles' in def) = 0
     or position('my_sides' in def) = 0
     or position('Buyer Agent TC' in def) = 0
     or position('viewer_is_demo' in def) = 0
     or position($needle$when r = 'Lender' then 'buyer'$needle$ in def) = 0 then
    raise exception 'self-check: rpc_message_recipients must use outside_roles, my_sides, demo scope, and a local Lender mapping';
  end if;
  if position('dp.deal_id = p_deal   -- FF-072 #24' in def) = 0 then
    raise exception 'self-check: the this-file-only mailed filter must stay';
  end if;
  if position('v.pure_buyer' in def) = 0 or position('l.profile_role = ''Processor''' in def) = 0 then
    raise exception 'self-check: the pure-client processor / same-side-agent rules must stay';
  end if;
  if (select prosecdef from pg_proc p where p.oid = 'private.rpc_message_recipients(uuid)'::regprocedure) is not true
     or (select prosecdef from pg_proc p where p.oid = 'private.can_message(uuid,uuid)'::regprocedure) is not true
     or (select prosecdef from pg_proc p where p.oid = 'private.rpc_create_thread(uuid,text,uuid[],text)'::regprocedure) is not true then
    raise exception 'self-check: recipients, can_message, and create_thread stay SECURITY DEFINER';
  end if;
  if position('dp.role = ''Lender''' in pg_get_functiondef('private.can_message(uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'self-check: can_message must allow a buyer-side viewer to add a Lender without giving the lender a side';
  end if;
  if position('coalesce(' in pg_get_functiondef('private.can_message(uuid,uuid)'::regprocedure)) > 0 then
    raise exception 'self-check: can_message must stay null-tolerant so thread_postable is unchanged for sideless members';
  end if;
  if position('is not true' in pg_get_functiondef('private.rpc_create_thread(uuid,text,uuid[],text)'::regprocedure)) = 0 then
    raise exception 'self-check: rpc_create_thread must refuse when can_message is not true (null or false)';
  end if;
end
$chk$;

select private.lock_function_search_paths();

commit;

notify pgrst, 'reload schema';
