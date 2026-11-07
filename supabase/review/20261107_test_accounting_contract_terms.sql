-- TEST contract figures (estimates). One row per order.
-- Not a fee ledger, not a receipt, not a payoff, and not a Closing Disclosure.
-- Does not enable private.features, and does not write deals, accounting_fees, or payoffs.
-- Apply on the TEST project only, before 20261107_enable_test_accounting_flag.sql.
-- Parent applies this. Do not run it from the app.

do $$ begin
  if to_regclass('public.accounting_contract_terms') is not null then
    raise exception 'public.accounting_contract_terms already exists. Apply the rollback first if this is a retry.';
  end if;
end $$;

create table public.accounting_contract_terms (
  deal_id uuid primary key references public.deals (id),
  posture text not null default 'estimate',
  sale_price numeric,
  listing_price numeric,
  loan_amount numeric,
  loan_percent numeric,
  loan_rate numeric,
  down_payment numeric,
  seller_credit_percent numeric,
  seller_credit_amount numeric,
  buyer_broker_percent numeric,
  buyer_broker_amount numeric,
  listing_commission_percent numeric,
  listing_commission_amount numeric,
  warranty_cap numeric,
  warranty_payer text not null default '',
  hoa_name text not null default '',
  hoa_monthly numeric,
  hoa_certificate_balance numeric,
  hoa_certificate_as_of date,
  condo_name text not null default '',
  condo_monthly numeric,
  condo_certificate_balance numeric,
  condo_certificate_as_of date,
  transfer_fee_each numeric,
  deferred_amount numeric,
  deferred_schedule text not null default '',
  deferred_payee text not null default '',
  tax_period text not null default '',
  tax_levy numeric,
  tax_assessment numeric,
  tax_payable numeric,
  emd_amount numeric,
  emd_method text,
  emd_holder text not null default '',
  emd_due_on date,
  emd_receipt text not null default 'unknown',
  source_note text not null default '',
  internal_note text not null default '',
  field_flags jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint accounting_contract_terms_posture_chk check (posture = 'estimate'),
  constraint accounting_contract_terms_emd_method_chk check (emd_method is null or emd_method in ('check', 'wire', 'other')),
  constraint accounting_contract_terms_emd_receipt_chk check (emd_receipt in ('unknown', 'promised', 'pending', 'unverified')),
  constraint accounting_contract_terms_money_chk check (
    (sale_price is null or (sale_price >= 0 and sale_price <= 100000000 and scale(sale_price) <= 2))
    and (listing_price is null or (listing_price >= 0 and listing_price <= 100000000 and scale(listing_price) <= 2))
    and (loan_amount is null or (loan_amount >= 0 and loan_amount <= 100000000 and scale(loan_amount) <= 2))
    and (down_payment is null or (down_payment >= 0 and down_payment <= 100000000 and scale(down_payment) <= 2))
    and (seller_credit_amount is null or (seller_credit_amount >= 0 and seller_credit_amount <= 100000000 and scale(seller_credit_amount) <= 2))
    and (buyer_broker_amount is null or (buyer_broker_amount >= 0 and buyer_broker_amount <= 100000000 and scale(buyer_broker_amount) <= 2))
    and (listing_commission_amount is null or (listing_commission_amount >= 0 and listing_commission_amount <= 100000000 and scale(listing_commission_amount) <= 2))
    and (warranty_cap is null or (warranty_cap >= 0 and warranty_cap <= 100000000 and scale(warranty_cap) <= 2))
    and (hoa_monthly is null or (hoa_monthly >= 0 and hoa_monthly <= 100000000 and scale(hoa_monthly) <= 2))
    and (hoa_certificate_balance is null or (hoa_certificate_balance >= 0 and hoa_certificate_balance <= 100000000 and scale(hoa_certificate_balance) <= 2))
    and (condo_monthly is null or (condo_monthly >= 0 and condo_monthly <= 100000000 and scale(condo_monthly) <= 2))
    and (condo_certificate_balance is null or (condo_certificate_balance >= 0 and condo_certificate_balance <= 100000000 and scale(condo_certificate_balance) <= 2))
    and (transfer_fee_each is null or (transfer_fee_each >= 0 and transfer_fee_each <= 100000000 and scale(transfer_fee_each) <= 2))
    and (deferred_amount is null or (deferred_amount >= 0 and deferred_amount <= 100000000 and scale(deferred_amount) <= 2))
    and (tax_levy is null or (tax_levy >= 0 and tax_levy <= 100000000 and scale(tax_levy) <= 2))
    and (tax_assessment is null or (tax_assessment >= 0 and tax_assessment <= 100000000 and scale(tax_assessment) <= 2))
    and (tax_payable is null or (tax_payable >= 0 and tax_payable <= 100000000 and scale(tax_payable) <= 2))
    and (emd_amount is null or (emd_amount >= 0 and emd_amount <= 100000000 and scale(emd_amount) <= 2))
  ),
  constraint accounting_contract_terms_percent_chk check (
    (loan_percent is null or (loan_percent >= 0 and loan_percent <= 100 and scale(loan_percent) <= 4))
    and (seller_credit_percent is null or (seller_credit_percent >= 0 and seller_credit_percent <= 100 and scale(seller_credit_percent) <= 4))
    and (buyer_broker_percent is null or (buyer_broker_percent >= 0 and buyer_broker_percent <= 100 and scale(buyer_broker_percent) <= 4))
    and (listing_commission_percent is null or (listing_commission_percent >= 0 and listing_commission_percent <= 100 and scale(listing_commission_percent) <= 4))
    and (loan_rate is null or (loan_rate >= 0 and loan_rate <= 100 and scale(loan_rate) <= 5))
  ),
  constraint accounting_contract_terms_text_chk check (
    char_length(warranty_payer) <= 120 and char_length(hoa_name) <= 200 and char_length(condo_name) <= 200
    and char_length(deferred_schedule) <= 200 and char_length(deferred_payee) <= 200 and char_length(tax_period) <= 80
    and char_length(emd_holder) <= 200 and char_length(source_note) <= 2000 and char_length(internal_note) <= 2000
  )
);

create table public.accounting_contract_terms_log (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null,
  action text not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb not null,
  changes jsonb not null default '[]'::jsonb,
  constraint accounting_contract_terms_log_action_chk check (action in ('added', 'edited'))
);
create index accounting_contract_terms_log_deal_idx on public.accounting_contract_terms_log (deal_id, changed_at desc);

create or replace function private.accounting_contract_terms_guard()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public
as $function$
declare
  flag_key text;
  flag_val jsonb;
  basis text;
  allowed text[];
  old_j jsonb;
  new_j jsonb;
  ch jsonb := '[]'::jsonb;
begin
  if new.posture is distinct from 'estimate' then
    raise exception 'Contract figures stay an estimate.' using errcode = 'P0001';
  end if;
  if new.field_flags is null or jsonb_typeof(new.field_flags) <> 'object' then
    raise exception 'Contract figure markers must be an object.' using errcode = 'P0001';
  end if;
  for flag_key, flag_val in select key, value from jsonb_each(new.field_flags) loop
    if flag_key not in (
      'salePrice','listingPrice','loanAmount','loanRate','downPayment','sellerCreditAmount','buyerBrokerAmount',
      'listingCommissionAmount','warrantyCap','hoaMonthly','hoaCertificateBalance','condoMonthly','condoCertificateBalance',
      'transferFeeEach','deferredAmount','taxLevy','taxAssessment','taxPayable','emdAmount'
    ) then
      raise exception 'Unknown contract figure marker.' using errcode = 'P0001';
    end if;
    if jsonb_typeof(flag_val) <> 'object' then
      raise exception 'A contract figure marker is incomplete.' using errcode = 'P0001';
    end if;
    if (select count(*) from jsonb_object_keys(flag_val) k where k not in ('basis', 'provisional', 'source')) > 0 then
      raise exception 'A contract figure marker has an unknown part.' using errcode = 'P0001';
    end if;
    if coalesce(flag_val->>'provisional', 'true') is distinct from 'true' then
      raise exception 'Contract figures stay provisional.' using errcode = 'P0001';
    end if;
    basis := flag_val->>'basis';
    allowed := case
      when flag_key = 'loanRate' then array['quoted','locked']
      when flag_key in ('hoaCertificateBalance','condoCertificateBalance','taxLevy','taxAssessment') then array['historical','explicit']
      when flag_key = 'hoaMonthly' or flag_key = 'condoMonthly' or flag_key = 'transferFeeEach' then array['explicit','historical']
      when flag_key = 'taxPayable' then array['explicit']
      else array['explicit','derived','calculated']
    end;
    if basis is null or not (basis = any (allowed)) then
      raise exception 'Contract figure marker is not an allowed kind.' using errcode = 'P0001';
    end if;
    if coalesce(char_length(flag_val->>'source'), 0) > 500 then
      raise exception 'Contract figure source is too long.' using errcode = 'P0001';
    end if;
    if (case flag_key
      when 'salePrice' then new.sale_price is null
      when 'listingPrice' then new.listing_price is null
      when 'loanAmount' then new.loan_amount is null
      when 'loanRate' then new.loan_rate is null
      when 'downPayment' then new.down_payment is null
      when 'sellerCreditAmount' then new.seller_credit_amount is null
      when 'buyerBrokerAmount' then new.buyer_broker_amount is null
      when 'listingCommissionAmount' then new.listing_commission_amount is null
      when 'warrantyCap' then new.warranty_cap is null
      when 'hoaMonthly' then new.hoa_monthly is null
      when 'hoaCertificateBalance' then new.hoa_certificate_balance is null
      when 'condoMonthly' then new.condo_monthly is null
      when 'condoCertificateBalance' then new.condo_certificate_balance is null
      when 'transferFeeEach' then new.transfer_fee_each is null
      when 'deferredAmount' then new.deferred_amount is null
      when 'taxLevy' then new.tax_levy is null
      when 'taxAssessment' then new.tax_assessment is null
      when 'taxPayable' then new.tax_payable is null
      when 'emdAmount' then new.emd_amount is null
      else true
    end) then
      raise exception 'A contract figure marker needs a figure. Blank is unknown, not zero.' using errcode = 'P0001';
    end if;
  end loop;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.deal_id := old.deal_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  old_j := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_j := to_jsonb(new);
  select coalesce(jsonb_agg(jsonb_build_object('field', e.key, 'old', old_j->e.key, 'new', e.value)), '[]'::jsonb)
    into ch
  from jsonb_each(new_j) e
  where e.key not in ('created_at', 'updated_at', 'created_by', 'updated_by')
    and (old_j is null or (old_j->e.key) is distinct from e.value);
  insert into public.accounting_contract_terms_log (deal_id, action, changed_by, old_row, new_row, changes)
  values (new.deal_id, case when tg_op = 'INSERT' then 'added' else 'edited' end, auth.uid(), old_j, new_j, ch);
  return new;
end
$function$;

revoke all on function private.accounting_contract_terms_guard() from public, anon, authenticated;
grant execute on function private.accounting_contract_terms_guard() to authenticated;

create trigger accounting_contract_terms_guard
before insert or update on public.accounting_contract_terms
for each row execute function private.accounting_contract_terms_guard();

alter table public.accounting_contract_terms enable row level security;
alter table public.accounting_contract_terms_log enable row level security;

revoke all on table public.accounting_contract_terms from public, anon, authenticated;
revoke all on table public.accounting_contract_terms_log from public, anon, authenticated;
grant select, insert, update on table public.accounting_contract_terms to authenticated;
grant select on table public.accounting_contract_terms_log to authenticated;

create policy accounting_contract_terms_read on public.accounting_contract_terms
for select to authenticated
using ((select private.acct_reader(deal_id)));

create policy accounting_contract_terms_add on public.accounting_contract_terms
for insert to authenticated
with check ((select private.acct_editor(deal_id)));

create policy accounting_contract_terms_edit on public.accounting_contract_terms
for update to authenticated
using ((select private.acct_editor(deal_id)))
with check ((select private.acct_editor(deal_id)));

create policy accounting_contract_terms_demo on public.accounting_contract_terms
as restrictive for all to authenticated
using (
  case when deal_id is null then not private.viewer_is_demo()
  else ((select d.is_demo from public.deals d where d.id = accounting_contract_terms.deal_id) = private.viewer_is_demo())
  end
)
with check (
  case when deal_id is null then not private.viewer_is_demo()
  else ((select d.is_demo from public.deals d where d.id = accounting_contract_terms.deal_id) = private.viewer_is_demo())
  end
);

create policy accounting_contract_terms_log_read on public.accounting_contract_terms_log
for select to authenticated
using ((select private.acct_reader(deal_id)));

create policy accounting_contract_terms_log_demo on public.accounting_contract_terms_log
as restrictive for all to authenticated
using (
  case when deal_id is null then not private.viewer_is_demo()
  else ((select d.is_demo from public.deals d where d.id = accounting_contract_terms_log.deal_id) = private.viewer_is_demo())
  end
)
with check (
  case when deal_id is null then not private.viewer_is_demo()
  else ((select d.is_demo from public.deals d where d.id = accounting_contract_terms_log.deal_id) = private.viewer_is_demo())
  end
);

comment on table public.accounting_contract_terms is
  'TEST contract figures for one order. Estimates only (posture estimate). Not a ledger, receipt, payoff, or Closing Disclosure. Blank amounts are null, not zero.';
