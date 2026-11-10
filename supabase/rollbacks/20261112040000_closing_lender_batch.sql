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
  if loc is null or loc not in ('CLA Title office', 'Mobile notary', 'Remote (online)') then raise exception 'Pick where to sign.' using errcode = 'P0001'; end if;
  off := case when p_location is null and p_office is null and p_proposal is not null and p.office_id is not null then private.closing_office_for(p_deal, loc, p.office_id) else private.closing_office_for(p_deal, loc, p_office) end;
  if p_proposal is not null then update public.closing_proposals set status = 'confirmed' where id = p_proposal; end if;
  update public.deals set scheduled_at = at_, scheduled_location = loc, scheduled_office_id = off, scheduled_note = left(coalesce(p_note, ''), 500), scheduled_by = private.effective_uid(), scheduled_by_role = by_role,
    scheduled_confirmed_at = now(), closing_date = at_::date where id = p_deal;
  perform private.log_activity(p_deal, 'closing.confirmed', 'deal', p_deal, 'Closing scheduled for ' || at_ || ' - ' || private.closing_place(loc, off) || coalesce(' (by the ' || agent || ')', ''));
  perform private.notify(array(select c.profile_id from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = p_deal and c.profile_id is not null),
    'settlement', p_deal, 'Closing scheduled: ' || at_ || ' - ' || private.closing_place(loc, off), '#/deals/' || p_deal || '/closing');
end
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
