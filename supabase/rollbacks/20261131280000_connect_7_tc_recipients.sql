-- Undo CONNECT-7: restore private.can_message, private.rpc_create_thread, and
-- private.rpc_message_recipients to the TEST bodies from before
-- 20261131280000_connect_7_tc_recipients.sql. private.side_of and private.person_side
-- were not changed by the fixed migration and are not touched here.
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION private.can_message(pid uuid, d uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.is_staffish() or private.person_side(pid, d) = 'staff' or (private.my_side(d) in ('buyer', 'seller') and private.person_side(pid, d) = private.my_side(d)) $function$;

CREATE OR REPLACE FUNCTION private.rpc_create_thread(p_deal uuid, p_subject text, p_participants uuid[], p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare tid uuid; pid uuid; members uuid[];
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
    if not private.can_message(pid, p_deal) then
      raise exception 'You can message CLA Title staff and people on your own side of this order only' using errcode = '42501'; end if;
    members := array_append(members, pid);
  end loop;
  if coalesce(array_length(members, 1), 0) < 2 then raise exception 'Pick at least one recipient on this order'; end if;
  if not private.one_side(members, p_deal) then
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
           private.can_access_deal(p_deal) as ok,
           coalesce(private.is_staffish(), false) as staff,
           private.me_role() as me_role
  ),
  viewer_roles as (
    select case
      when g.me_role is null then '{}'::text[]
      when g.me_role <> 'Outside user' then array[g.me_role]
      else coalesce((
        select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
        from (
          select distinct dp.role
          from public.deal_participants dp
          join public.contacts c on c.id = dp.contact_id
          where dp.deal_id = p_deal and c.profile_id = g.uid
            and dp.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
        ) x
      ), array['Outside user'])
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
            select case r
              when 'Buyer Agent' then 'buyer' when 'Client-Buyer' then 'buyer'
              when 'Listing Agent' then 'seller' when 'Client-Seller' then 'seller'
            end as s
            from unnest(vr.roles) r
          ) q
          where s is not null
        )
      end as my_side,
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
        else coalesce((
          select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
          from (
            select distinct dp.role
            from public.deal_participants dp
            join public.contacts c on c.id = dp.contact_id
            where dp.deal_id = p_deal and c.profile_id = t.id
              and dp.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
          ) x
        ), array['Outside user'])
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
            select case r
              when 'Buyer Agent' then 'buyer' when 'Client-Buyer' then 'buyer'
              when 'Listing Agent' then 'seller' when 'Client-Seller' then 'seller'
            end as s
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
            v.my_side in ('buyer', 'seller')
            and (
              select case when count(distinct s) = 1 then max(s) end
              from (
                select case r
                  when 'Buyer Agent' then 'buyer' when 'Client-Buyer' then 'buyer'
                  when 'Listing Agent' then 'seller' when 'Client-Seller' then 'seller'
                end as s
                from unnest(l.roles) r
              ) q where s is not null
            ) = v.my_side
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

select private.lock_function_search_paths();

commit;

notify pgrst, 'reload schema';
