-- FF-024 through FF-029. Side signing and a typed closing address live on the deal row the page already loads.
-- The message picker is one set-based read: file contacts with an email or a portal login, and no processor who has no email.
-- Not applied by this commit.
begin;
set local lock_timeout = '3s';

alter table public.deals add column if not exists buyer_sign_status text not null default 'pending';
alter table public.deals add column if not exists seller_sign_status text not null default 'pending';
alter table public.deals add column if not exists buyer_signed_on date;
alter table public.deals add column if not exists seller_signed_on date;
alter table public.deals add column if not exists buyer_place_kind text not null default '';
alter table public.deals add column if not exists seller_place_kind text not null default '';
alter table public.deals add column if not exists buyer_office_id text;
alter table public.deals add column if not exists seller_office_id text;
alter table public.deals add column if not exists buyer_signing_date date;
alter table public.deals add column if not exists seller_signing_date date;
alter table public.deals add column if not exists buyer_signing_time text not null default '';
alter table public.deals add column if not exists seller_signing_time text not null default '';
alter table public.deals add column if not exists buyer_manual_street text not null default '';
alter table public.deals add column if not exists buyer_manual_city text not null default '';
alter table public.deals add column if not exists buyer_manual_state text not null default '';
alter table public.deals add column if not exists buyer_manual_zip text not null default '';
alter table public.deals add column if not exists seller_manual_street text not null default '';
alter table public.deals add column if not exists seller_manual_city text not null default '';
alter table public.deals add column if not exists seller_manual_state text not null default '';
alter table public.deals add column if not exists seller_manual_zip text not null default '';
alter table public.deals add column if not exists closing_manual_street text not null default '';
alter table public.deals add column if not exists closing_manual_city text not null default '';
alter table public.deals add column if not exists closing_manual_state text not null default '';
alter table public.deals add column if not exists closing_manual_zip text not null default '';
alter table public.deals add column if not exists lender_history jsonb not null default '[]'::jsonb;

alter table public.deals drop constraint if exists deals_buyer_sign_status;
alter table public.deals add constraint deals_buyer_sign_status check (buyer_sign_status in ('pending', 'signed'));
alter table public.deals drop constraint if exists deals_seller_sign_status;
alter table public.deals add constraint deals_seller_sign_status check (seller_sign_status in ('pending', 'signed'));

-- The viewer's staff flag is computed once (private.is_staffish is the staff-role helper).
-- Staff get every file contact that has an email, plus the portal profiles they get today.
-- A buyer, seller or agent stays on today's portal profiles: participant visibility and the
-- message rule are applied as one set, so an email-only lender or attorney never appears.
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
      or l.profile_role is distinct from 'Outside user'
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

-- Live confirm_closing rejects anything but the three places. A typed street is its own place,
-- and the existing six-argument call still works. The street itself is stored on the deal row.
create or replace function private.rpc_confirm_closing(p_deal uuid, p_at timestamp without time zone default null, p_location text default null, p_note text default '', p_proposal uuid default null, p_office text default null)
returns void
language plpgsql security definer
set search_path to pg_catalog, public, extensions
as $function$
declare p public.closing_proposals; at_ timestamp := p_at; loc text := p_location; off text; agent text; by_role text;
begin
  if not private.can_access_deal(p_deal) then raise exception 'Order not found' using errcode = '42501'; end if;
  if not private.is_manager() then
    select r into agent from unnest(private.file_roles_of(private.effective_uid(), p_deal)) r where r in ('Buyer Agent', 'Listing Agent') order by r limit 1;
    if agent is null then raise exception 'Only the processor, coordinator or an agent on the file can schedule the closing.' using errcode = '42501'; end if; end if;
  by_role := coalesce(agent, case when private.me_role() in ('Processor', 'Preprocessor', 'Transaction Coordinator', 'Admin', 'Super admin') then private.me_role() when private.is_admin() then 'Admin' end);
  if p_proposal is not null then select * into p from public.closing_proposals where id = p_proposal and deal_id = p_deal
      and (agent is null or side = case agent when 'Buyer Agent' then 'buyer' else 'seller' end);
    if not found then raise exception 'Proposal not found.' using errcode = 'P0001'; end if; at_ := coalesce(at_, p.proposed_at); loc := coalesce(loc, p.location); end if;
  if at_ is null or at_ < (now() at time zone 'America/New_York') then raise exception 'The closing must be in the future.' using errcode = 'P0001'; end if;
  if loc is null or loc not in ('CLA Title office', 'Mobile notary', 'Remote (online)', 'Typed address') then raise exception 'Pick where to sign.' using errcode = 'P0001'; end if;
  off := case when p_location is null and p_office is null and p_proposal is not null and p.office_id is not null then private.closing_office_for(p_deal, loc, p.office_id) else private.closing_office_for(p_deal, loc, p_office) end;
  if p_proposal is not null then update public.closing_proposals set status = 'confirmed' where id = p_proposal; end if;
  update public.deals set scheduled_at = at_, scheduled_location = loc, scheduled_office_id = off, scheduled_note = left(coalesce(p_note, ''), 500), scheduled_by = private.effective_uid(), scheduled_by_role = by_role,
    scheduled_confirmed_at = now(), closing_date = at_::date where id = p_deal;
  perform private.log_activity(p_deal, 'closing.confirmed', 'deal', p_deal, 'Closing scheduled for ' || at_ || ' - ' || private.closing_place(loc, off) || coalesce(' (by the ' || agent || ')', ''));
  perform private.notify(array(select c.profile_id from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = p_deal and c.profile_id is not null),
    'settlement', p_deal, 'Closing scheduled: ' || at_ || ' - ' || private.closing_place(loc, off), '#/deals/' || p_deal || '/closing');
end
$function$;

do $readback$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'buyer_sign_status') then
    raise exception 'readback: buyer signing status is missing';
  end if;
  if position('is_staffish()' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_message_recipients(uuid)'::regprocedure)) = 0 then
    raise exception 'readback: the picker does not read the staff flag once';
  end if;
  if position('can_message' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_message_recipients(uuid)'::regprocedure)) > 0
     or position('participant_visible' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_message_recipients(uuid)'::regprocedure)) > 0 then
    raise exception 'readback: the picker still calls a per-person visibility helper';
  end if;
  if position('Typed address' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_confirm_closing(uuid,timestamp without time zone,text,text,uuid,text)'::regprocedure)) = 0 then
    raise exception 'readback: a typed address is still rejected';
  end if;
end
$readback$;
commit;
