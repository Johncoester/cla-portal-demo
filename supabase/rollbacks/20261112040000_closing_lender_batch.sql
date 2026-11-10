-- Removes the closing-side columns and restores the previous message picker.
begin;
set local lock_timeout = '3s';

create or replace function private.rpc_message_recipients(p_deal uuid)
returns table(id uuid, first_name text, last_name text, email text, role text, side text)
language sql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select distinct p.id, p.first_name, p.last_name, p.email, private.person_label(p.id, p_deal), private.person_side(p.id, p_deal)
  from public.profiles p where private.can_access_deal(p_deal) and p.status = 'active' and p.id <> private.effective_uid()
    and (p.id in (select c.profile_id from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = p_deal and private.participant_visible(p_deal, dp.role))
         or p.id in (select private.deal_cla_staff(p_deal)))
    and private.can_message(p.id, p_deal)
$function$;

alter table public.deals drop constraint if exists deals_buyer_sign_status;
alter table public.deals drop constraint if exists deals_seller_sign_status;
alter table public.deals drop column if exists buyer_sign_status;
alter table public.deals drop column if exists seller_sign_status;
alter table public.deals drop column if exists buyer_signed_on;
alter table public.deals drop column if exists seller_signed_on;
alter table public.deals drop column if exists buyer_place_kind;
alter table public.deals drop column if exists seller_place_kind;
alter table public.deals drop column if exists buyer_office_id;
alter table public.deals drop column if exists seller_office_id;
alter table public.deals drop column if exists buyer_signing_date;
alter table public.deals drop column if exists seller_signing_date;
alter table public.deals drop column if exists buyer_signing_time;
alter table public.deals drop column if exists seller_signing_time;
alter table public.deals drop column if exists buyer_manual_street;
alter table public.deals drop column if exists buyer_manual_city;
alter table public.deals drop column if exists buyer_manual_state;
alter table public.deals drop column if exists buyer_manual_zip;
alter table public.deals drop column if exists seller_manual_street;
alter table public.deals drop column if exists seller_manual_city;
alter table public.deals drop column if exists seller_manual_state;
alter table public.deals drop column if exists seller_manual_zip;
alter table public.deals drop column if exists closing_manual_street;
alter table public.deals drop column if exists closing_manual_city;
alter table public.deals drop column if exists closing_manual_state;
alter table public.deals drop column if exists closing_manual_zip;
alter table public.deals drop column if exists lender_history;
commit;
