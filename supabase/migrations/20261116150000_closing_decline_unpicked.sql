-- FF-063 (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis Feedback ticket):
-- after the processor confirmed or rescheduled the closing, the other proposed times stayed under "Proposed closing times".
-- 1. closing_proposals.status may now be 'declined'.
-- 2. private.rpc_confirm_closing declines every other proposal on the file (still proposed, or an earlier confirmed one) when a time is confirmed.
--    Everything else in the function is unchanged (same body as 20261112040000_closing_lender_batch.sql plus one update).
-- 3. One-time tidy-up: on files whose closing is already confirmed, proposals made before that confirmation that are not the confirmed
--    time are declined (for example the 3 PM and 6 PM Dec 31 times on VA-26-97304). Proposals made after it stay proposed.
begin;
set local lock_timeout = '3s';

do $drift$
begin
  if md5((select p.prosrc from pg_proc p where p.oid = 'private.rpc_confirm_closing(uuid,timestamp without time zone,text,text,uuid,text)'::regprocedure)) <> '96380222d6f681fdcdfcb46bfcca0bb5' then
    raise exception 'drift: private.rpc_confirm_closing is not the 20261112040000 version';
  end if;
end
$drift$;

alter table public.closing_proposals drop constraint if exists closing_proposals_status_check;
alter table public.closing_proposals add constraint closing_proposals_status_check check (status = any (array['proposed'::text, 'confirmed'::text, 'declined'::text]));

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
  -- FF-063 (Janine, Nov 12): every other proposal on this file (still proposed, or an earlier confirmed one) is declined, so only the picked time stays.
  update public.closing_proposals set status = 'declined' where deal_id = p_deal and status in ('proposed', 'confirmed') and (p_proposal is null or id <> p_proposal);
  update public.deals set scheduled_at = at_, scheduled_location = loc, scheduled_office_id = off, scheduled_note = left(coalesce(p_note, ''), 500), scheduled_by = private.effective_uid(), scheduled_by_role = by_role,
    scheduled_confirmed_at = now(), closing_date = at_::date where id = p_deal;
  perform private.log_activity(p_deal, 'closing.confirmed', 'deal', p_deal, 'Closing scheduled for ' || at_ || ' - ' || private.closing_place(loc, off) || coalesce(' (by the ' || agent || ')', ''));
  perform private.notify(array(select c.profile_id from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = p_deal and c.profile_id is not null),
    'settlement', p_deal, 'Closing scheduled: ' || at_ || ' - ' || private.closing_place(loc, off), '#/deals/' || p_deal || '/closing');
end
$function$;

update public.closing_proposals cp set status = 'declined'
from public.deals d
where d.id = cp.deal_id
  and d.scheduled_confirmed_at is not null
  and cp.status in ('proposed', 'confirmed')
  and cp.created_at < d.scheduled_confirmed_at
  and not (cp.status = 'confirmed' and cp.proposed_at = d.scheduled_at);

do $readback$
begin
  if position('''declined''' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_confirm_closing(uuid,timestamp without time zone,text,text,uuid,text)'::regprocedure)) = 0 then
    raise exception 'readback: confirm_closing does not decline the other proposals';
  end if;
  if position('Typed address' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_confirm_closing(uuid,timestamp without time zone,text,text,uuid,text)'::regprocedure)) = 0 then
    raise exception 'readback: a typed address is rejected again';
  end if;
end
$readback$;
commit;
