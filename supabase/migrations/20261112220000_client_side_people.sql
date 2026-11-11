-- FF-018. A buyer or seller can message the processors assigned on the file,
-- their own side's agent, and that side's transaction coordinator. Staff and
-- agents keep the wider list. One set-based read. Not applied by this commit.
--
-- Ask for an update: a buyer or seller whose file role is Client-Buyer or
-- Client-Seller is that side even when person_side comes back empty.
begin;
set local lock_timeout = '3s';

create or replace function private.rpc_message_recipients(p_deal uuid)
returns table(id uuid, first_name text, last_name text, email text, role text, side text)
language sql stable security definer
set search_path to pg_catalog, public, extensions
as $function$
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
          or l.profile_role = 'Transaction Coordinator'
          or 'Transaction Coordinator' = any (l.roles)
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
    where v.staff and v.ok and c.profile_id is null and btrim(coalesce(c.email, '')) <> ''
      and c.id is distinct from v.uid
    order by c.id, dp.role
  )
  select * from portal
  union all
  select * from mailed
$function$;



create or replace function private.rpc_request_update(p_deal uuid, p_topic text, p_note text default ''::text)
returns uuid
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $function$
declare rid uuid; side text;
begin
  if not private.can_access_deal(p_deal) then raise exception 'Order not found' using errcode = 'P0001'; end if;
  if private.is_staffish() then raise exception 'Request Update is for the agents and clients on the order.' using errcode = 'P0001'; end if;
  side := coalesce(private.person_side(private.effective_uid(), p_deal), private.side_of(private.deal_role(p_deal)));
  if side not in ('buyer', 'seller') then raise exception 'You are not a buyer or seller party on this order.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.update_requests where deal_id = p_deal and requested_by = private.effective_uid() and topic = p_topic and status = 'open') then
    raise exception 'You already asked for this update; CLA Title will answer it soon.' using errcode = 'P0001'; end if;
  insert into public.update_requests (deal_id, topic, note, requested_by, requested_role) values (p_deal, p_topic, left(coalesce(trim(p_note), ''), 1000), private.effective_uid(), private.deal_role(p_deal)) returning id into rid;
  perform private.log_activity(p_deal, 'update.requested', 'update_request', rid, 'Requested an update: ' || p_topic);
  perform private.notify(array[(select processor_id from public.deals where id = p_deal)], 'update_request', p_deal, private.person_name(private.effective_uid()) || ' requested an update: ' || p_topic, '#/deals/' || p_deal);
  return rid; end $function$;

do $readback$
begin
  if position('Buyer Agent' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_message_recipients(uuid)'::regprocedure)) = 0
     or position('Listing Agent' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_message_recipients(uuid)'::regprocedure)) = 0
     or position('Transaction Coordinator' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_message_recipients(uuid)'::regprocedure)) = 0 then
    raise exception 'readback: a buyer or seller cannot see their agent and coordinator';
  end if;
  if position('l.profile_role = ''Processor''' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_message_recipients(uuid)'::regprocedure)) = 0 then
    raise exception 'readback: assigned processors were dropped';
  end if;
  if position('side_of(private.deal_role' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_request_update(uuid,text,text)'::regprocedure)) = 0 then
    raise exception 'readback: ask for an update still ignores the file role';
  end if;
end
$readback$;
commit;
