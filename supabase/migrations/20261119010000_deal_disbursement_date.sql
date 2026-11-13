-- FF-071 #23 (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis confirm-back Nov 12 6:14 PM ET) and FF-052 / MF-050:
-- the file's disbursement date. The portal works out the date (purchase = closing date; refinance with rescission = 4th business day
-- after closing) and shows it on File Overview. This column holds only the date the processor sets by hand; blank means automatic.
-- Same row security and update rights as the other date columns on deals (closing_date, emd_due_date). No policy changes.
begin;
set local lock_timeout = '3s';
alter table public.deals add column if not exists disbursement_date date;
comment on column public.deals.disbursement_date is 'Processor-set disbursement date (FF-071 #23 / FF-052). Null = the portal computes it from the closing date and transaction type.';
do $check$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'disbursement_date' and data_type = 'date') then
    raise exception 'readback: deals.disbursement_date is missing';
  end if;
end
$check$;
commit;
