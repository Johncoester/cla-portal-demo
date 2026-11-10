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

-- One function call for the whole picker. It does not call a security-definer helper once per contact.
create or replace function private.rpc_message_recipients(p_deal uuid)
returns table(id uuid, first_name text, last_name text, email text, role text, side text)
language sql stable security definer
set search_path to pg_catalog, public, extensions
as $function$
  with viewer_roles as (
    select coalesce(array_agg(distinct dp.role), '{}'::text[]) as roles
    from public.deal_participants dp
    join public.contacts c on c.id = dp.contact_id
    where dp.deal_id = p_deal and c.profile_id = private.effective_uid()
  ),
  viewer_sides as (
    select case
      when cardinality(roles) = 0 then null::text[]
      else array_remove(array[
        case when roles && array['Client-Buyer', 'Buyer Agent']::text[] then 'buyer' end,
        case when roles && array['Client-Seller', 'Listing Agent']::text[] then 'seller' end
      ], null)
    end as sides
    from viewer_roles
  ),
  people as (
    select coalesce(c.profile_id, c.id) as id,
      coalesce(pr.first_name, c.first_name, '') as first_name,
      coalesce(pr.last_name, c.last_name, '') as last_name,
      coalesce(nullif(btrim(pr.email), ''), nullif(btrim(c.email), ''), '') as email,
      dp.role,
      case dp.role
        when 'Client-Buyer' then 'buyer' when 'Buyer Agent' then 'buyer'
        when 'Client-Seller' then 'seller' when 'Listing Agent' then 'seller'
        else null end as side
    from public.deal_participants dp
    join public.contacts c on c.id = dp.contact_id
    left join public.profiles pr on pr.id = c.profile_id and pr.status = 'active'
    where dp.deal_id = p_deal
    union
    select p.id, p.first_name, p.last_name, coalesce(p.email, ''), x.role, null
    from public.deals d
    join lateral (values (d.processor_id, 'Processor'), (d.preprocessor_user_id, 'Preprocessor'), (d.tc_user_id, 'Transaction Coordinator')) as x(pid, role) on true
    join public.profiles p on p.id = x.pid and p.status = 'active'
    where d.id = p_deal
  )
  select distinct on (people.id) people.id, people.first_name, people.last_name, people.email, people.role, people.side
  from people
  cross join viewer_sides
  where private.can_access_deal(p_deal)
    and people.id is not null
    and people.id is distinct from private.effective_uid()
    and btrim(people.email) <> ''
    and (viewer_sides.sides is null or people.side is null or people.side = any (viewer_sides.sides))
  order by people.id, people.role
$function$;

do $readback$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'buyer_sign_status') then
    raise exception 'readback: buyer signing status is missing';
  end if;
  if position('btrim(people.email)' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_message_recipients(uuid)'::regprocedure)) = 0 then
    raise exception 'readback: a blank email can still be offered';
  end if;
  if position('can_message' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_message_recipients(uuid)'::regprocedure)) > 0 then
    raise exception 'readback: the picker still calls can_message per person';
  end if;
end
$readback$;
commit;
