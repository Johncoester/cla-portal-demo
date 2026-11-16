-- Already applied on TEST. Do not apply this file to TEST again.
-- Source: TEST history, supabase_migrations.schema_migrations, project aqcervntopidtcazcmlv.
-- Version 20261105223145, name title_module.
-- The text below this label is the exact history statement. The label is not part of that text.
-- Filename uses TEST's own version, so it runs after 20261105223111_payoffs_hoa_ffb_gr.sql
-- and before 20261105223152_payoffs_module.sql. Nothing else uses this version.
-- =====================================================================
-- Migration 61 (John, Nov 4 2026): TITLE MODULE (order > Title, the title review). FAKE data only. Re-runnable.
--  * FEATURE SWITCH private.features 'title' (OFF by default at go-live): while off every title policy refuses.
--  * CLA STAFF ONLY: read = Processor / Transaction Coordinator / Sales Person / Sales Team / Admin / Super admin on a file they can reach;
--    write = Processor / Transaction Coordinator / Admin / Super admin. Agents and clients never read a title row (the buyer e-sign task for the
--    "Buyers Initial Commitment copy" is an ordinary task + document, made by the app with the existing patterns).
--  * EVERY FIELD IS REPORTABLE: typed columns (no JSON blobs), created_at / created_by / updated_at / updated_by on every row.
--  * NO HARD DELETES: no delete grant on any title table; rows carry deleted_at / deleted_by (soft delete).
--  * NO SSNs: there is no SSN column anywhere; the PACER table refuses SSN-shaped text in its free-text columns.
--  * The portal SENDS NOTHING: "Send Title Package" is a queued outbox row (status 'queued', sent_at null, as before) to the lender's email
--    (to_profile_id may now be null when to_email + to_name are set) with the package document attached (attachment_document_id).
-- =====================================================================
create schema if not exists private;
create table if not exists private.features (name text primary key, enabled boolean not null default false, note text not null default '');
insert into private.features (name, enabled, note) values ('title', false, 'Title review module (migration 61). Off by default at go-live.') on conflict (name) do nothing;
create or replace function private.title_on() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from private.features where name = 'title'), false) $$;
create or replace function private.title_reader(d uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.title_on() and coalesce(private.is_admin() or private.me_role() in ('Processor', 'Transaction Coordinator', 'Sales Person', 'Sales Team'), false) and private.can_access_deal(d) $$;
create or replace function private.title_editor(d uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.title_on() and coalesce(private.is_admin() or private.me_role() in ('Processor', 'Transaction Coordinator'), false) and private.can_access_deal(d) $$;
-- SSN-shaped text (123-45-6789 / 123 45 6789 / 123456789 standing alone) is refused where people type free text about a party
create or replace function private.no_ssn(t text) returns boolean language sql immutable as $$
  select t is null or t !~ '(^|[^0-9])[0-9]{3}[- ]?[0-9]{2}[- ]?[0-9]{4}([^0-9]|$)' $$;
create or replace function private.title_touch() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.created_at := coalesce(new.created_at, now()); new.created_by := coalesce(new.created_by, auth.uid()); end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; new.created_by := old.created_by; end if;
  new.updated_at := now(); new.updated_by := coalesce(auth.uid(), new.updated_by);
  if new.deleted_at is not null and new.deleted_by is null then new.deleted_by := auth.uid(); end if;
  return new;
end $$;

-- (no module_settings row: the database switch for this module is private.features 'title'; the mock's 'title' Live / Beta switch is browser-side, see docs/TITLE-MODULE-NOV4.md)

-- ---------- columns on existing tables (all typed) ----------
alter table public.deals add column if not exists title_review_status text not null default 'not_started';
alter table public.deals drop constraint if exists deals_title_review_status_check;
alter table public.deals add constraint deals_title_review_status_check check (title_review_status in ('not_started', 'in_progress', 'pending_requirements', 'clear_to_close'));
alter table public.deals add column if not exists loan_id_number text not null default '';
alter table public.deals add column if not exists loss_payee_name text not null default '';
alter table public.deals add column if not exists uses_mers boolean;
alter table public.deals add column if not exists funding_type text check (funding_type in ('net', 'gross'));
alter table public.deals add column if not exists first_payment_date date;
alter table public.deals add column if not exists interest_type text check (interest_type in ('Fixed', 'Adjustable', 'Interest Only', 'Other'));
alter table public.deals add column if not exists loan_type text not null default '';
alter table public.documents add column if not exists title_doc_kind text;
alter table public.documents drop constraint if exists documents_title_doc_kind_check;
alter table public.documents add constraint documents_title_doc_kind_check check (title_doc_kind is null or title_doc_kind in ('title_order_email', 'search_package', 'tax_cert', 'md_ack', 'eo',
  'title_commitment_request', 'pacer_receipt', 'title_commitment', 'cpl', 'prelim_cd', 'buyer_commitment_copy', 'title_package', 'prior_policy', 'vesting_deed', 'other_title'));
alter table public.documents add column if not exists title_generated boolean not null default false;
alter table public.tasks add column if not exists task_group text not null default '';
alter table public.deal_payoffs add column if not exists title_item_id uuid;
alter table public.outbox alter column to_profile_id drop not null;
alter table public.outbox add column if not exists to_name text not null default '';
alter table public.outbox add column if not exists attachment_document_id uuid references public.documents (id);
alter table public.outbox add column if not exists title_package boolean not null default false;
alter table public.outbox drop constraint if exists outbox_recipient_check;
alter table public.outbox add constraint outbox_recipient_check check (to_profile_id is not null or (title_package and char_length(to_email) > 3 and char_length(to_name) > 0));

-- ---------- typed title tables (every column reportable; soft delete only) ----------
create table if not exists public.title_reviews (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id) unique,
  reviewer_id uuid references public.profiles (id), review_date date, commitment_status text not null default 'draft' check (commitment_status in ('draft', 'final')), status_manual boolean not null default false,
  finalized_at timestamptz, finalized_by uuid references public.profiles (id), commitment_document_id uuid references public.documents (id), title_package_document_id uuid references public.documents (id), package_sent_at timestamptz, package_sent_by uuid references public.profiles (id), package_outbox_id uuid references public.outbox (id),
  property_type text check (property_type in ('Fee Simple', 'Leasehold', 'Condo', 'Co-op', 'Townhouse (fee simple)')), title_order_email_notes text not null default '',
  sdat_tax_id text not null default '', sdat_owner_name text not null default '', sdat_premises_address text not null default '', sdat_legal_short text not null default '', sdat_matches boolean,
  tax_year text not null default '', tax_base_annual numeric(12,2) check (tax_base_annual >= 0), tax_first_half_status text check (tax_first_half_status in ('paid', 'unpaid')), tax_first_half_amount numeric(12,2),
  tax_second_half_status text check (tax_second_half_status in ('paid', 'unpaid')), tax_second_half_amount numeric(12,2), tax_due_dates text not null default '', tax_delinquent_amount numeric(12,2), tax_penalty_interest numeric(12,2), tax_forward_bill_to text not null default '',
  vesting_owner_name text not null default '', contract_buyer_match boolean, contract_seller_match boolean, contract_address_match boolean, contract_legal_match boolean, contract_tax_id_match boolean,
  assoc_type text check (assoc_type in ('none', 'hoa', 'condo', 'both')), assoc_name text not null default '', assoc_fee numeric(12,2), assoc_fee_frequency text check (assoc_fee_frequency in ('Monthly', 'Quarterly', 'Semi-annual', 'Annual')),
  fee_incl_water boolean, fee_incl_sewer boolean, fee_incl_heat boolean, fee_incl_electric boolean, fee_incl_gas boolean, fee_incl_ac boolean,
  water_type text check (water_type in ('public', 'private', 'well')), sewer_type text check (sewer_type in ('public', 'private', 'septic')),
  front_foot_benefit text check (front_foot_benefit in ('yes', 'no', 'unknown')), ground_rent text check (ground_rent in ('yes', 'no', 'unknown')), transfer_tax_split text not null default '', contract_notes text not null default '',
  tr_loan_amount numeric(14,2), tr_lender_name text not null default '', tr_loan_id_number text not null default '',
  underwriter text not null default '', commitment_number text not null default '', commitment_form text check (commitment_form in ('2021 ALTA', '2016 ALTA', '2006 ALTA')), effective_date date, effective_time text not null default '',
  proposed_insured text not null default '', vesting_text text not null default '', legal_description text not null default '', being_override_on boolean not null default false, being_override_text text not null default '',
  lender_policy_type text not null default '', lender_policy_form text not null default '', lender_policy_amount numeric(14,2), lender_rate_type text not null default '', lender_rate_effective_date date, lender_proposed_insured text not null default '',
  owner_policy_type text not null default '', owner_policy_form text not null default '', owner_policy_amount numeric(14,2), owner_rate_type text not null default '', owner_rate_effective_date date, owner_proposed_insured text not null default '',
  hoa_other_contact_id uuid, created_at timestamptz not null default now(), created_by uuid references public.profiles (id), updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id), deleted_at timestamptz, deleted_by uuid references public.profiles (id),
  check (commitment_status <> 'final' or (finalized_at is not null and commitment_number <> '' and position('FOR INFORMATIONAL PURPOSES ONLY:' in legal_description) > 0)));
create index if not exists idx_title_reviews_deal on public.title_reviews (deal_id);
drop trigger if exists title_reviews_touch on public.title_reviews;
create trigger title_reviews_touch before insert or update on public.title_reviews for each row execute function private.title_touch();
alter table public.title_reviews enable row level security;
drop policy if exists title_reviews_select on public.title_reviews;
create policy title_reviews_select on public.title_reviews for select to authenticated using (private.title_reader(deal_id));
drop policy if exists title_reviews_insert on public.title_reviews;
create policy title_reviews_insert on public.title_reviews for insert to authenticated with check (private.title_editor(deal_id));
drop policy if exists title_reviews_update on public.title_reviews;
create policy title_reviews_update on public.title_reviews for update to authenticated using (private.title_editor(deal_id)) with check (private.title_editor(deal_id));
revoke all on public.title_reviews from anon, authenticated;
grant select, insert, update on public.title_reviews to authenticated;   -- no delete, for anyone
create table if not exists public.title_checklist_items (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id), step_key text not null check (step_key in ('notes_reviewed', 'docs_organized', 'md_ack', 'eo_doc', 'pacer_buyer', 'pacer_seller', 'title_order_email', 'sdat_check', 'tax_info', 'vesting_deed', 'contract_review', 'chain_of_title', 'loan_check', 'schedule_a', 'requirements', 'exceptions', 'policy_info', 'finalized', 'cpl_buyer', 'cpl_seller', 'prelim_cd', 'buyer_copy', 'title_package', 'summary_note', 'send_package', 'tasks_updated')),
  status text not null default 'open' check (status in ('open', 'done', 'na')), note text not null default '', done_at timestamptz, done_by uuid references public.profiles (id), created_at timestamptz not null default now(), created_by uuid references public.profiles (id), updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id), deleted_at timestamptz, deleted_by uuid references public.profiles (id), unique (deal_id, step_key));
create index if not exists idx_title_checklist_items_deal on public.title_checklist_items (deal_id);
drop trigger if exists title_checklist_items_touch on public.title_checklist_items;
create trigger title_checklist_items_touch before insert or update on public.title_checklist_items for each row execute function private.title_touch();
alter table public.title_checklist_items enable row level security;
drop policy if exists title_checklist_items_select on public.title_checklist_items;
create policy title_checklist_items_select on public.title_checklist_items for select to authenticated using (private.title_reader(deal_id));
drop policy if exists title_checklist_items_insert on public.title_checklist_items;
create policy title_checklist_items_insert on public.title_checklist_items for insert to authenticated with check (private.title_editor(deal_id));
drop policy if exists title_checklist_items_update on public.title_checklist_items;
create policy title_checklist_items_update on public.title_checklist_items for update to authenticated using (private.title_editor(deal_id)) with check (private.title_editor(deal_id));
revoke all on public.title_checklist_items from anon, authenticated;
grant select, insert, update on public.title_checklist_items to authenticated;   -- no delete, for anyone
create table if not exists public.title_pacer_searches (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id), participant_id uuid references public.deal_participants (id),
  party_name text not null check (char_length(party_name) between 1 and 120 and private.no_ssn(party_name)), party_role text not null check (party_role in ('buyer', 'seller')),
  search_type text not null check (search_type in ('ssn', 'party_name')), exact_match boolean, result text not null check (result in ('no_results', 'results_found')),
  notes text not null default '' check (private.no_ssn(notes) and char_length(notes) <= 1000), document_id uuid references public.documents (id), searched_at timestamptz not null default now(), searched_by uuid references public.profiles (id), created_at timestamptz not null default now(), created_by uuid references public.profiles (id), updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id), deleted_at timestamptz, deleted_by uuid references public.profiles (id),
  check (result = 'no_results' or notes <> ''));
create index if not exists idx_title_pacer_searches_deal on public.title_pacer_searches (deal_id);
drop trigger if exists title_pacer_searches_touch on public.title_pacer_searches;
create trigger title_pacer_searches_touch before insert or update on public.title_pacer_searches for each row execute function private.title_touch();
alter table public.title_pacer_searches enable row level security;
drop policy if exists title_pacer_searches_select on public.title_pacer_searches;
create policy title_pacer_searches_select on public.title_pacer_searches for select to authenticated using (private.title_reader(deal_id));
drop policy if exists title_pacer_searches_insert on public.title_pacer_searches;
create policy title_pacer_searches_insert on public.title_pacer_searches for insert to authenticated with check (private.title_editor(deal_id));
drop policy if exists title_pacer_searches_update on public.title_pacer_searches;
create policy title_pacer_searches_update on public.title_pacer_searches for update to authenticated using (private.title_editor(deal_id)) with check (private.title_editor(deal_id));
revoke all on public.title_pacer_searches from anon, authenticated;
grant select, insert, update on public.title_pacer_searches to authenticated;   -- no delete, for anyone
create table if not exists public.title_discrepancies (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id), discrepancy_type text not null check (discrepancy_type in ('owner_seller_mismatch', 'buyer_name_mismatch', 'seller_name_mismatch', 'address_mismatch', 'legal_description_mismatch', 'tax_id_mismatch', 'loan_mismatch', 'cpl_lender_mismatch', 'chain_gap', 'other')),
  description text not null check (char_length(description) between 1 and 500), status text not null default 'open' check (status in ('open', 'resolved')), resolved_at timestamptz, resolved_by uuid references public.profiles (id), resolution_note text not null default '', created_at timestamptz not null default now(), created_by uuid references public.profiles (id), updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id), deleted_at timestamptz, deleted_by uuid references public.profiles (id));
create index if not exists idx_title_discrepancies_deal on public.title_discrepancies (deal_id);
drop trigger if exists title_discrepancies_touch on public.title_discrepancies;
create trigger title_discrepancies_touch before insert or update on public.title_discrepancies for each row execute function private.title_touch();
alter table public.title_discrepancies enable row level security;
drop policy if exists title_discrepancies_select on public.title_discrepancies;
create policy title_discrepancies_select on public.title_discrepancies for select to authenticated using (private.title_reader(deal_id));
drop policy if exists title_discrepancies_insert on public.title_discrepancies;
create policy title_discrepancies_insert on public.title_discrepancies for insert to authenticated with check (private.title_editor(deal_id));
drop policy if exists title_discrepancies_update on public.title_discrepancies;
create policy title_discrepancies_update on public.title_discrepancies for update to authenticated using (private.title_editor(deal_id)) with check (private.title_editor(deal_id));
revoke all on public.title_discrepancies from anon, authenticated;
grant select, insert, update on public.title_discrepancies to authenticated;   -- no delete, for anyone
create table if not exists public.title_chain_entries (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id), position int not null check (position > 0), instrument_type text not null check (instrument_type in ('Deed', 'Quitclaim Deed', 'Confirmatory Deed', 'Deed of Trust', 'Other')),
  document_name text not null default '', grantor text not null default '', grantee text not null default '', document_date date, recorded_date date, book text not null default '', page text not null default '',
  instrument_number text not null default '', cert_of_title_number text not null default '', document_number text not null default '', pertains_to_property boolean not null default true,
  generated_text text not null default '', override_on boolean not null default false, override_text text not null default '', created_at timestamptz not null default now(), created_by uuid references public.profiles (id), updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id), deleted_at timestamptz, deleted_by uuid references public.profiles (id));
create index if not exists idx_title_chain_entries_deal on public.title_chain_entries (deal_id);
drop trigger if exists title_chain_entries_touch on public.title_chain_entries;
create trigger title_chain_entries_touch before insert or update on public.title_chain_entries for each row execute function private.title_touch();
alter table public.title_chain_entries enable row level security;
drop policy if exists title_chain_entries_select on public.title_chain_entries;
create policy title_chain_entries_select on public.title_chain_entries for select to authenticated using (private.title_reader(deal_id));
drop policy if exists title_chain_entries_insert on public.title_chain_entries;
create policy title_chain_entries_insert on public.title_chain_entries for insert to authenticated with check (private.title_editor(deal_id));
drop policy if exists title_chain_entries_update on public.title_chain_entries;
create policy title_chain_entries_update on public.title_chain_entries for update to authenticated using (private.title_editor(deal_id)) with check (private.title_editor(deal_id));
revoke all on public.title_chain_entries from anon, authenticated;
grant select, insert, update on public.title_chain_entries to authenticated;   -- no delete, for anyone
create table if not exists public.title_items (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id), kind text not null check (kind in ('requirement', 'exception')), parent_id uuid references public.title_items (id), position int not null check (position > 0),
  template_key text not null default '', body_text text not null default '', generated_text text not null default '', override_on boolean not null default false, override_text text not null default '',
  status text not null default 'open' check (status in ('open', 'satisfied', 'waived')), payoff_id uuid,
  dot_lender text, dot_trustee text, dot_grantor text, dot_date date, dot_recorded_date date, dot_amount numeric(14,2) check (dot_amount >= 0), dot_book text, dot_page text, dot_instrument_number text, dot_hyperlink text, dot_needs_payoff boolean, tax_id_number text, tax_year text, tax_base_annual numeric(12,2), tax_first_half_status text check (tax_first_half_status in ('paid', 'unpaid')), tax_first_half_amount numeric(12,2), tax_second_half_status text check (tax_second_half_status in ('paid', 'unpaid')), tax_second_half_amount numeric(12,2), tax_due_dates text, tax_penalty_interest numeric(12,2), tax_due_date date, tax_delinquent_amount numeric(12,2), tax_forward_bill_to text, deed_grantor text, deed_grantee text, new_dot_grantor text, new_dot_lender text, new_dot_trustee text, new_dot_amount numeric(14,2), created_at timestamptz not null default now(), created_by uuid references public.profiles (id), updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id), deleted_at timestamptz, deleted_by uuid references public.profiles (id), check (template_key <> '' or body_text <> ''));
create index if not exists idx_title_items_deal on public.title_items (deal_id);
drop trigger if exists title_items_touch on public.title_items;
create trigger title_items_touch before insert or update on public.title_items for each row execute function private.title_touch();
alter table public.title_items enable row level security;
drop policy if exists title_items_select on public.title_items;
create policy title_items_select on public.title_items for select to authenticated using (private.title_reader(deal_id));
drop policy if exists title_items_insert on public.title_items;
create policy title_items_insert on public.title_items for insert to authenticated with check (private.title_editor(deal_id));
drop policy if exists title_items_update on public.title_items;
create policy title_items_update on public.title_items for update to authenticated using (private.title_editor(deal_id)) with check (private.title_editor(deal_id));
revoke all on public.title_items from anon, authenticated;
grant select, insert, update on public.title_items to authenticated;   -- no delete, for anyone
create table if not exists public.title_cpls (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id), cpl_number text not null unique, protected_party text not null, lender_name_at_issue text not null default '', lender_match boolean not null,
  cpl_type text not null check (cpl_type in ('Standard', 'Standard - Buyer/Borrower', 'Standard - Seller', 'Lender Only')), lender_clause text not null, cost numeric(10,2) not null check (cost >= 0),
  cpl_for text not null check (cpl_for in ('buyer', 'seller')), issued_at timestamptz not null default now(), issued_by uuid references public.profiles (id), document_id uuid references public.documents (id), created_at timestamptz not null default now(), created_by uuid references public.profiles (id), updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id), deleted_at timestamptz, deleted_by uuid references public.profiles (id));
create index if not exists idx_title_cpls_deal on public.title_cpls (deal_id);
drop trigger if exists title_cpls_touch on public.title_cpls;
create trigger title_cpls_touch before insert or update on public.title_cpls for each row execute function private.title_touch();
alter table public.title_cpls enable row level security;
drop policy if exists title_cpls_select on public.title_cpls;
create policy title_cpls_select on public.title_cpls for select to authenticated using (private.title_reader(deal_id));
drop policy if exists title_cpls_insert on public.title_cpls;
create policy title_cpls_insert on public.title_cpls for insert to authenticated with check (private.title_editor(deal_id));
drop policy if exists title_cpls_update on public.title_cpls;
create policy title_cpls_update on public.title_cpls for update to authenticated using (private.title_editor(deal_id)) with check (private.title_editor(deal_id));
revoke all on public.title_cpls from anon, authenticated;
grant select, insert, update on public.title_cpls to authenticated;   -- no delete, for anyone
create table if not exists public.title_package_components (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id), package_document_id uuid not null references public.documents (id), package_kind text not null check (package_kind in ('title_package', 'buyer_commitment_copy')),
  component_kind text not null, component_document_id uuid references public.documents (id), position int not null, missing boolean not null default false, created_at timestamptz not null default now(), created_by uuid references public.profiles (id), updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id), deleted_at timestamptz, deleted_by uuid references public.profiles (id), check (missing = (component_document_id is null)));
create index if not exists idx_title_package_components_deal on public.title_package_components (deal_id);
drop trigger if exists title_package_components_touch on public.title_package_components;
create trigger title_package_components_touch before insert or update on public.title_package_components for each row execute function private.title_touch();
alter table public.title_package_components enable row level security;
drop policy if exists title_package_components_select on public.title_package_components;
create policy title_package_components_select on public.title_package_components for select to authenticated using (private.title_reader(deal_id));
drop policy if exists title_package_components_insert on public.title_package_components;
create policy title_package_components_insert on public.title_package_components for insert to authenticated with check (private.title_editor(deal_id));
drop policy if exists title_package_components_update on public.title_package_components;
create policy title_package_components_update on public.title_package_components for update to authenticated using (private.title_editor(deal_id)) with check (private.title_editor(deal_id));
revoke all on public.title_package_components from anon, authenticated;
grant select, insert, update on public.title_package_components to authenticated;   -- no delete, for anyone
create table if not exists public.title_signature_requests (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id), document_id uuid not null references public.documents (id), signer_participant_id uuid references public.deal_participants (id), signer_name text not null,
  status text not null default 'requested' check (status in ('requested', 'signed', 'cancelled')), requested_at timestamptz not null default now(), requested_by uuid references public.profiles (id), signed_at timestamptz,
  signature_page int, signature_x numeric(6,2), signature_y numeric(6,2), task_id uuid references public.tasks (id), created_at timestamptz not null default now(), created_by uuid references public.profiles (id), updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id), deleted_at timestamptz, deleted_by uuid references public.profiles (id));
create index if not exists idx_title_signature_requests_deal on public.title_signature_requests (deal_id);
drop trigger if exists title_signature_requests_touch on public.title_signature_requests;
create trigger title_signature_requests_touch before insert or update on public.title_signature_requests for each row execute function private.title_touch();
alter table public.title_signature_requests enable row level security;
drop policy if exists title_signature_requests_select on public.title_signature_requests;
create policy title_signature_requests_select on public.title_signature_requests for select to authenticated using (private.title_reader(deal_id));
drop policy if exists title_signature_requests_insert on public.title_signature_requests;
create policy title_signature_requests_insert on public.title_signature_requests for insert to authenticated with check (private.title_editor(deal_id));
drop policy if exists title_signature_requests_update on public.title_signature_requests;
create policy title_signature_requests_update on public.title_signature_requests for update to authenticated using (private.title_editor(deal_id)) with check (private.title_editor(deal_id));
revoke all on public.title_signature_requests from anon, authenticated;
grant select, insert, update on public.title_signature_requests to authenticated;   -- no delete, for anyone
create table if not exists public.title_summary_notes (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id), reviewer_first_name text not null default '', note_date date not null, seller_quoted_deed_prep text not null default '', buyer_receiving_cpl text not null default '', property_type text not null default '', marital_status text not null default '', total_dots text not null default '', payoff1 text not null default '', payoff2 text not null default '', payoff3 text not null default '', judgments_liens text not null default '', hoa_condo text not null default '', ground_rent text not null default '', taxes text not null default '', water_sewer_account text not null default '', tax_sale text not null default '', open_permits text not null default '', survey_request text not null default '', search_buyer text not null default '', search_seller text not null default '', title_to_issue text not null default '', lien_cert text not null default '', prior_title_policy text not null default '', cpl_buyer text not null default '', cpl_seller text not null default '', water_sewer_exceptions text not null default '', note_body text not null default '', order_note_id uuid, created_at timestamptz not null default now(), created_by uuid references public.profiles (id), updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id), deleted_at timestamptz, deleted_by uuid references public.profiles (id));
create index if not exists idx_title_summary_notes_deal on public.title_summary_notes (deal_id);
drop trigger if exists title_summary_notes_touch on public.title_summary_notes;
create trigger title_summary_notes_touch before insert or update on public.title_summary_notes for each row execute function private.title_touch();
alter table public.title_summary_notes enable row level security;
drop policy if exists title_summary_notes_select on public.title_summary_notes;
create policy title_summary_notes_select on public.title_summary_notes for select to authenticated using (private.title_reader(deal_id));
drop policy if exists title_summary_notes_insert on public.title_summary_notes;
create policy title_summary_notes_insert on public.title_summary_notes for insert to authenticated with check (private.title_editor(deal_id));
drop policy if exists title_summary_notes_update on public.title_summary_notes;
create policy title_summary_notes_update on public.title_summary_notes for update to authenticated using (private.title_editor(deal_id)) with check (private.title_editor(deal_id));
revoke all on public.title_summary_notes from anon, authenticated;
grant select, insert, update on public.title_summary_notes to authenticated;   -- no delete, for anyone
create table if not exists public.title_curative_items (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id), summary_id uuid not null references public.title_summary_notes (id), position int not null, text text not null check (char_length(text) between 1 and 300), created_at timestamptz not null default now(), created_by uuid references public.profiles (id), updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id), deleted_at timestamptz, deleted_by uuid references public.profiles (id));
create index if not exists idx_title_curative_items_deal on public.title_curative_items (deal_id);
drop trigger if exists title_curative_items_touch on public.title_curative_items;
create trigger title_curative_items_touch before insert or update on public.title_curative_items for each row execute function private.title_touch();
alter table public.title_curative_items enable row level security;
drop policy if exists title_curative_items_select on public.title_curative_items;
create policy title_curative_items_select on public.title_curative_items for select to authenticated using (private.title_reader(deal_id));
drop policy if exists title_curative_items_insert on public.title_curative_items;
create policy title_curative_items_insert on public.title_curative_items for insert to authenticated with check (private.title_editor(deal_id));
drop policy if exists title_curative_items_update on public.title_curative_items;
create policy title_curative_items_update on public.title_curative_items for update to authenticated using (private.title_editor(deal_id)) with check (private.title_editor(deal_id));
revoke all on public.title_curative_items from anon, authenticated;
grant select, insert, update on public.title_curative_items to authenticated;   -- no delete, for anyone
create table if not exists public.order_notes (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id), category text not null check (category in ('GENERAL', 'TITLE', 'PAYOFF', 'CLOSING', 'LENDER', 'HOA', 'OTHER')), body text not null check (char_length(body) between 1 and 4000 and body !~ '[0-9]{3}-[0-9]{2}-[0-9]{4}'),
  issue_resolved boolean not null default false, resolved_at timestamptz, resolved_by uuid references public.profiles (id), title_summary_id uuid references public.title_summary_notes (id), created_at timestamptz not null default now(), created_by uuid references public.profiles (id), updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id), deleted_at timestamptz, deleted_by uuid references public.profiles (id));
create index if not exists idx_order_notes_deal on public.order_notes (deal_id);
drop trigger if exists order_notes_touch on public.order_notes;
create trigger order_notes_touch before insert or update on public.order_notes for each row execute function private.title_touch();
alter table public.order_notes enable row level security;
drop policy if exists order_notes_select on public.order_notes;
create policy order_notes_select on public.order_notes for select to authenticated using (private.is_staffish() and private.can_access_deal(deal_id));
drop policy if exists order_notes_insert on public.order_notes;
create policy order_notes_insert on public.order_notes for insert to authenticated with check ((private.is_admin() or coalesce(private.me_role() in ('Processor', 'Transaction Coordinator'), false)) and private.can_access_deal(deal_id));
drop policy if exists order_notes_update on public.order_notes;
create policy order_notes_update on public.order_notes for update to authenticated using ((private.is_admin() or coalesce(private.me_role() in ('Processor', 'Transaction Coordinator'), false)) and private.can_access_deal(deal_id)) with check ((private.is_admin() or coalesce(private.me_role() in ('Processor', 'Transaction Coordinator'), false)) and private.can_access_deal(deal_id));
revoke all on public.order_notes from anon, authenticated;
grant select, insert, update on public.order_notes to authenticated;   -- no delete, for anyone

-- ---------- the outbox row for "Send Title Package": staff editors queue it (still status 'queued', sent_at null) ----------
create or replace function public.queue_title_package(p_deal uuid, p_package_document uuid) returns public.outbox language plpgsql security definer set search_path = public as $$
declare d public.deals; r public.outbox;
begin
  if not private.title_editor(p_deal) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal;
  if coalesce(d.lender_email, '') = '' then raise exception 'The order has no lender email.' using errcode = '22023'; end if;
  if not exists (select 1 from public.documents where id = p_package_document and deal_id = p_deal and title_doc_kind = 'title_package') then raise exception 'Build the Title Package first.' using errcode = '22023'; end if;
  insert into public.outbox (channel, status, to_profile_id, to_name, to_email, subject, body, deal_id, created_by, attachment_document_id, title_package)
    values ('email', 'queued', null, coalesce(nullif(d.lender_contact, ''), nullif(d.lender_name, ''), 'Lender'), d.lender_email, 'Title Package - ' || d.file_number,
      'Attached is the Title Package (CPL, Title Commitment, Tax Certificate, E&O, Prelim CD). TEST portal: queued only, never sent.', p_deal, auth.uid(), p_package_document, true) returning * into r;
  update public.title_reviews set package_sent_at = now(), package_sent_by = auth.uid(), package_outbox_id = r.id where deal_id = p_deal;
  return r;
end $$;
revoke all on function public.queue_title_package(uuid, uuid) from public, anon;
grant execute on function public.queue_title_package(uuid, uuid) to authenticated;

