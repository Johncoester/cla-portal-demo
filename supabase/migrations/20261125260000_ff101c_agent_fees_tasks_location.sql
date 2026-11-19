-- FF-101c (Francis Nov 18 11 AM notes, confirmed by John Nov 18 2:13 PM ET).
-- Agent fees moved off File Overview onto the buyer/listing agent task sections on Tasks.
-- Update the plain refusal messages and the Commission information note so they name Tasks.
-- TEST only. Fake data only. Does not change commission fields (FF-101b is separate).

begin;

create or replace function private.commission_task_guard() returns trigger
language plpgsql set search_path to pg_catalog, public as $$
begin
  if new.template_code = 'commissions'
     and nullif(btrim(coalesce(new.form_data ->> 'commission_amount', '')), '') is not null
     and (tg_op = 'INSERT' or (new.form_data ->> 'commission_amount') is distinct from (old.form_data ->> 'commission_amount')) then
    raise exception 'Commissions are now kept in the Agent fees box under the agent task sections on Tasks. Reload the page and enter it there. Nothing was saved.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Same wording as js/data/earnest-commission.js OLD_COMMISSION_REFUSED (one place for commissions).
create or replace function private.deal_old_commission_guard() returns trigger
language plpgsql set search_path to pg_catalog, public as $$
begin
  if new.listing_commission_pct is not null or new.listing_commission_amount is not null
     or new.buyer_commission_pct is not null or new.buyer_commission_amount is not null
     or jsonb_strip_nulls(coalesce(new.financial, '{}'::jsonb)) ?| private.old_commission_keys() then
    raise exception 'Commissions are now kept in the Agent fees box under the agent task sections on Tasks. Reload the page and enter them there. Nothing was saved.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

update public.task_templates
   set fields = (
         select jsonb_agg(
           case
             when elem ->> 'k' = 'agent_fees_note' then jsonb_set(
               elem, '{text}',
               to_jsonb('Your commission, admin fee and any other fees are entered in the Agent fees box under your agent task section on Tasks. That is the one place CLA Title keeps them, so they match Accounting, the Closing Disclosure and the ALTA statement.'::text)
             )
             else elem
           end
         )
         from jsonb_array_elements(fields) elem
       ),
       description = 'Confirm your brokerage and license. Your commission and fees are entered in the Agent fees box under your agent task section on Tasks.'
 where code = 'commissions' and active;

do $readback$
declare
  note text;
  msg text;
begin
  select x ->> 'text' into note
    from public.task_templates t, jsonb_array_elements(t.fields) x
   where t.code = 'commissions' and t.active and x ->> 'k' = 'agent_fees_note';
  if note is null or position('agent task section on Tasks' in note) = 0 then
    raise exception 'readback: commissions note still names File Overview';
  end if;
  select pg_get_functiondef('private.commission_task_guard()'::regprocedure) into msg;
  if position('agent task sections on Tasks' in msg) = 0 then
    raise exception 'readback: commission_task_guard still names File Overview';
  end if;
  select pg_get_functiondef('private.deal_old_commission_guard()'::regprocedure) into msg;
  if position('agent task sections on Tasks' in msg) = 0 then
    raise exception 'readback: deal_old_commission_guard still names File Overview';
  end if;
end
$readback$;

commit;
