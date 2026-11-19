-- Rollback for 20261125260000_ff101c_agent_fees_tasks_location.sql: restore the "file overview" wording.
begin;

create or replace function private.commission_task_guard() returns trigger
language plpgsql set search_path to pg_catalog, public as $$
begin
  if new.template_code = 'commissions'
     and nullif(btrim(coalesce(new.form_data ->> 'commission_amount', '')), '') is not null
     and (tg_op = 'INSERT' or (new.form_data ->> 'commission_amount') is distinct from (old.form_data ->> 'commission_amount')) then
    raise exception 'Commissions are now kept in the Agent fees box on the file overview. Reload the page and enter it there. Nothing was saved.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function private.deal_old_commission_guard() returns trigger
language plpgsql set search_path to pg_catalog, public as $$
begin
  if new.listing_commission_pct is not null or new.listing_commission_amount is not null
     or new.buyer_commission_pct is not null or new.buyer_commission_amount is not null
     or jsonb_strip_nulls(coalesce(new.financial, '{}'::jsonb)) ?| private.old_commission_keys() then
    raise exception 'Commissions are now kept in the Agent fees box on the file overview. Reload the page and enter them there. Nothing was saved.'
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
               to_jsonb('Your commission, admin fee and any other fees are entered in the Agent fees box on the file overview. That is the one place CLA Title keeps them, so they match Accounting, the Closing Disclosure and the ALTA statement.'::text)
             )
             else elem
           end
         )
         from jsonb_array_elements(fields) elem
       ),
       description = 'Confirm your brokerage and license. Your commission and fees are entered in the Agent fees box on the file overview.'
 where code = 'commissions' and active;

commit;
