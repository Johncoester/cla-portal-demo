set check_function_bodies = off;
-- Source: TEST catalog (project aqcervntopidtcazcmlv), read on November 15, 2026.
-- Idempotent precondition for a fresh database. Not a migration and not applied to TEST.
-- It creates only objects the repo files assume and never create: roles, an auth.uid stub,
-- the base tables, and the base functions. Columns a repo file adds itself are not included.
-- Each object is created only when it is missing, so running this file on TEST changes nothing.
-- Do not run it on production.
-- =====================================================================

create schema if not exists auth;
create schema if not exists private;
create schema if not exists extensions;
create schema if not exists public;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin; end if;
end
$roles$;

do $auth$
begin
  if to_regprocedure('auth.uid()') is null then
    create function auth.uid() returns uuid language sql stable as $fn$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
  end if;
  if to_regprocedure('auth.jwt()') is null then
    create function auth.jwt() returns jsonb language sql stable as $fn$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $fn$;
  end if;
end
$auth$;

create extension if not exists pgcrypto with schema extensions;

create sequence if not exists public.hr_change_history_id_seq;
create sequence if not exists public.task_template_switch_log_id_seq;
create sequence if not exists public.underwriter_split_log_id_seq;
create sequence if not exists public.file_number_seq;

create table if not exists private.backfills (name text not null, done_at timestamp with time zone not null default now());
create table if not exists private.view_as_audit (id bigint not null, actor_id uuid not null, target_id uuid, action text not null, at timestamp with time zone not null default now());
create table if not exists private.view_as_sessions (actor_id uuid not null, target_id uuid not null, started_at timestamp with time zone not null default now(), expires_at timestamp with time zone not null, stopped_at timestamp with time zone);
create table if not exists public.access_invites (id uuid not null default gen_random_uuid(), deal_id uuid not null, first_name text not null, last_name text not null, email text not null, permission text not null, side text, invited_by uuid not null, status text not null default 'recorded'::text, created_at timestamp with time zone not null default now(), invited_as text);
create table if not exists public.accounting_contract_terms (deal_id uuid not null, posture text not null default 'estimate'::text, sale_price numeric, listing_price numeric, loan_amount numeric, loan_percent numeric, loan_rate numeric, down_payment numeric, seller_credit_percent numeric, seller_credit_amount numeric, buyer_broker_percent numeric, buyer_broker_amount numeric, listing_commission_percent numeric, listing_commission_amount numeric, warranty_cap numeric, warranty_payer text not null default ''::text, hoa_name text not null default ''::text, hoa_monthly numeric, hoa_certificate_balance numeric, hoa_certificate_as_of date, condo_name text not null default ''::text, condo_monthly numeric, condo_certificate_balance numeric, condo_certificate_as_of date, transfer_fee_each numeric, deferred_amount numeric, deferred_schedule text not null default ''::text, deferred_payee text not null default ''::text, tax_period text not null default ''::text, tax_levy numeric, tax_assessment numeric, tax_payable numeric, emd_amount numeric, emd_method text, emd_holder text not null default ''::text, emd_due_on date, emd_receipt text not null default 'unknown'::text, source_note text not null default ''::text, internal_note text not null default ''::text, field_flags jsonb not null default '{}'::jsonb, created_by uuid default auth.uid(), created_at timestamp with time zone not null default now(), updated_by uuid default auth.uid(), updated_at timestamp with time zone not null default now());
create table if not exists public.accounting_contract_terms_log (id uuid not null default gen_random_uuid(), deal_id uuid not null, action text not null, changed_by uuid, changed_at timestamp with time zone not null default now(), old_row jsonb, new_row jsonb not null, changes jsonb not null default '[]'::jsonb);
create table if not exists public.activity_log (id uuid not null default gen_random_uuid(), deal_id uuid, actor_id uuid, action text not null, entity text, entity_id uuid, detail text not null default ''::text, created_at timestamp with time zone not null default now());
create table if not exists public.agent_invites (id uuid not null default gen_random_uuid(), token_hash text, contact_id uuid, deal_id uuid, first_name text not null, last_name text not null, email text not null, status text not null default 'pending'::text, expires_at timestamp with time zone not null default (now() + '14 days'::interval), resent_count integer not null default 0, created_by uuid, created_at timestamp with time zone not null default now(), accepted_at timestamp with time zone, accepted_profile uuid, revoked_at timestamp with time zone, revoked_by uuid, invite_kind text not null default 'agent'::text, sent_at timestamp with time zone, sent_via text, sent_to text, sent_message_id text, sent_by uuid, send_count integer not null default 0, send_error text, opened_token_hash text, task_notice_at timestamp with time zone, task_notice_ids uuid[] not null default '{}'::uuid[]);
create table if not exists public.agent_private (profile_id uuid not null, birthdate date, updated_at timestamp with time zone not null default now(), updated_by uuid, birth_month smallint, birth_day smallint);
create table if not exists public.agent_profiles (profile_id uuid not null, cell_phone text not null default ''::text, office_phone text not null default ''::text, brokerage text not null default ''::text, license_number text not null default ''::text, street text not null default ''::text, city text not null default ''::text, state text not null default ''::text, zip text not null default ''::text, other_contact text not null default ''::text, photo_path text, photo_shape text not null default 'circle'::text, updated_at timestamp with time zone not null default now());
create table if not exists public.agent_task_revisions (id uuid not null default gen_random_uuid(), task_id uuid not null, n integer not null, answers jsonb not null, by_profile uuid not null, created_at timestamp with time zone not null default now());
create table if not exists public.agreement_acks (id uuid not null default gen_random_uuid(), deal_id uuid not null, agreement_code text not null, version integer not null, profile_id uuid not null, role_label text not null, acknowledged_at timestamp with time zone not null default now());
create table if not exists public.agreements (code text not null, version integer not null default 1, title text not null, body text not null);
create table if not exists public.cla_office_counties (office_id text not null, state text not null, county text not null);
create table if not exists public.cla_offices (id text not null, name text not null, address text not null default ''::text, state text not null, state_default boolean not null default false, active boolean not null default true, "position" integer not null default 0, created_at timestamp with time zone not null default now(), modified_at timestamp with time zone not null default now(), modified_by uuid);
create table if not exists public.client_sales_reps (client_id uuid not null, sales_id uuid not null, created_by uuid, created_at timestamp with time zone not null default now());
create table if not exists public.closing_location_reminders (id uuid not null default gen_random_uuid(), deal_id uuid not null, participant_id uuid not null, profile_id uuid not null, party_role text not null, reminded_on date not null default ((now() AT TIME ZONE 'America/New_York'::text))::date, notification_id uuid, outbox_id uuid, created_at timestamp with time zone not null default now(), created_by uuid);
create table if not exists public.closing_party_locations (id uuid not null default gen_random_uuid(), deal_id uuid not null, participant_id uuid not null, party_role text not null, in_state_at_closing boolean, closing_location_state character(2), closing_location_country character(2), signing_method text not null default 'undecided'::text, answered_at timestamp with time zone, answered_by uuid, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), updated_by uuid);
create table if not exists public.closing_proposals (id uuid not null default gen_random_uuid(), deal_id uuid not null, side text not null, proposed_by uuid not null, role_label text not null, proposed_at timestamp without time zone not null, location text not null, note text not null default ''::text, status text not null default 'proposed'::text, created_at timestamp with time zone not null default now(), office_id text);
create table if not exists public.contacts (id uuid not null default gen_random_uuid(), profile_id uuid, first_name text not null, last_name text not null default ''::text, email text not null default ''::text, phone text not null default ''::text, company text not null default ''::text, created_by uuid, created_at timestamp with time zone not null default now(), contact_type text, crm_owner_id uuid, account_id uuid, crm_stage text, last_contacted_on date, tags text[] not null default '{}'::text[], crm_notes text not null default ''::text, crm_lead_id uuid, crm_archived_at timestamp with time zone, role_in_company text not null default ''::text, title text not null default ''::text, mobile text not null default ''::text, assistant text not null default ''::text, asst_phone text not null default ''::text, agent_split numeric(5,2), license_no text not null default ''::text, sales_volume_last_year numeric(16,2), deals_closed_last_year integer, zillow_url text not null default ''::text, crm_street text not null default ''::text, crm_city text not null default ''::text, crm_state text not null default ''::text, crm_zip text not null default ''::text, crm_county text not null default ''::text, links jsonb not null default '{}'::jsonb, modified_by uuid, modified_at timestamp with time zone, lead_source text not null default ''::text, relationship_status text, custom jsonb not null default '{}'::jsonb, zillow_moved boolean not null default false, is_demo boolean not null default false);

create table if not exists public.crm_import_defaults (import_id uuid not null, field_key text not null, value_text text not null, owner_id uuid);
create table if not exists public.crm_list_exports (id uuid not null default gen_random_uuid(), module text not null, exported_by uuid not null, exported_at timestamp with time zone not null default now(), row_count integer not null default 0);
create table if not exists public.crm_saved_filter_values (filter_id uuid not null, field_name text not null, value_text text not null);
create table if not exists public.crm_saved_filters (id uuid not null default gen_random_uuid(), user_id uuid not null default auth.uid(), module text not null, view_id uuid, name text not null, created_at timestamp with time zone not null default now(), modified_at timestamp with time zone not null default now(), retired_at timestamp with time zone);
create table if not exists public.crm_search_columns (user_id uuid not null, module text not null, "position" integer not null, column_key text not null);
create table if not exists public.crm_view_columns (view_id uuid not null, "position" integer not null, column_key text not null);
create table if not exists public.crm_view_criteria (view_id uuid not null, "position" integer not null, field_key text not null, op text not null, value_index integer not null default 0, value_text text not null default ''::text, value2_text text not null default ''::text);
create table if not exists public.crm_view_pins (user_id uuid not null, view_id uuid not null, "position" integer not null default 0, pinned_at timestamp with time zone not null default now());
create table if not exists public.crm_view_shares (view_id uuid not null, user_id uuid not null);
create table if not exists public.crm_views (id uuid not null default gen_random_uuid(), module text not null, name text not null, owner_id uuid not null default auth.uid(), visibility text not null default 'me'::text, logic text not null default 'and'::text, sort_field text not null default 'name'::text, sort_dir text not null default 'asc'::text, created_at timestamp with time zone not null default now(), modified_at timestamp with time zone not null default now(), modified_by uuid, retired_at timestamp with time zone, retired_by uuid);
create table if not exists public.deal_business_sources (deal_id uuid not null, source text not null default ''::text, set_by uuid, set_at timestamp with time zone not null default now());
create table if not exists public.deal_disbursement_log (id bigint not null, deal_id uuid not null, field_key text not null, old_amount numeric(12,2), new_amount numeric(12,2), old_date date, new_date date, changed_by uuid, changed_at timestamp with time zone not null default now());
create table if not exists public.deal_disbursements (deal_id uuid not null, disbursement_date date, actual_revenue numeric(12,2), net_title_insurance numeric(12,2), settlement_fee numeric(12,2), net_endorsement_fee numeric(12,2), qualia_fee numeric(12,2), shipping_fee numeric(12,2), national_title_resource numeric(12,2), notary_fee numeric(12,2), searches_fee numeric(12,2), updated_by uuid, updated_at timestamp with time zone not null default now());
create table if not exists public.deal_participants (id uuid not null default gen_random_uuid(), deal_id uuid not null, contact_id uuid not null, role text not null, created_at timestamp with time zone not null default now());
create table if not exists public.deal_sales_people (deal_id uuid not null, sales_id uuid not null, added_by uuid, added_at timestamp with time zone not null default now());
create table if not exists public.deals (id uuid not null default gen_random_uuid(), file_number text not null default ('MD-26-'::text || nextval('file_number_seq'::regclass)), street text not null, city text not null, state text not null, zip text not null default ''::text, transaction_type text not null default 'Purchase'::text, stage smallint not null default 0, status text not null default 'Open'::text, open_date date not null default ((now() AT TIME ZONE 'America/New_York'::text))::date, closing_date date, purchase_price numeric(14,2), loan_amount numeric(14,2), lender_name text not null default ''::text, lender_contact text not null default ''::text, lender_email text not null default ''::text, lender_phone text not null default ''::text, notes text not null default ''::text, processor_id uuid, sales_person_id uuid, created_by uuid, created_at timestamp with time zone not null default now(), scheduled_at timestamp without time zone, scheduled_location text, scheduled_note text not null default ''::text, scheduled_by uuid, scheduled_confirmed_at timestamp with time zone, emd_amount numeric(14,2), emd_due_date date, county text not null default ''::text, primary_residence text not null default ''::text, first_time_buyer text not null default ''::text, scheduled_office_id text, scheduled_by_role text, title_review_status text not null default 'not_started'::text, loan_id_number text not null default ''::text, loss_payee_name text not null default ''::text, uses_mers boolean, funding_type text, first_payment_date date, interest_type text, loan_type text not null default ''::text, contract_date date, listing_commission_pct numeric(8,4), listing_commission_amount numeric(14,2), buyer_commission_pct numeric(8,4), buyer_commission_amount numeric(14,2), seller_concessions numeric(14,2), emd_holder text, emd_received boolean not null default false, emd_received_date date, emd_received_amount numeric(14,2), alta_received boolean not null default false, alta_received_date date, alta_document_id uuid, preprocessor_user_id uuid, is_demo boolean not null default false);
create table if not exists public.documents (id uuid not null default gen_random_uuid(), deal_id uuid, name text not null, description text not null default ''::text, mime_type text not null default 'application/octet-stream'::text, size_bytes bigint not null default 0, storage_path text, visibility text not null default 'all'::text, uploaded_by uuid not null, created_at timestamp with time zone not null default now(), folder_id uuid, doc_type text not null default ''::text, wire_instructions boolean not null default false, shared_with_client boolean not null default false, shared_with_client_by uuid, shared_with_client_at timestamp with time zone, title_doc_kind text, title_generated boolean not null default false, shared_with_seller boolean not null default false, shared_with_seller_by uuid, shared_with_seller_at timestamp with time zone, final_policy boolean not null default false, policy_side text);
create table if not exists public.email_sender_settings (sender_type text not null, email text not null, display_name text not null, updated_at timestamp with time zone, updated_by uuid);
create table if not exists public.escrow_accounts (id uuid not null default gen_random_uuid(), state text not null, account_name text not null, account_last4 text not null, active boolean not null default true, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.folders (id uuid not null default gen_random_uuid(), scope text not null, deal_id uuid, name text not null, staff_only boolean not null default false, created_by uuid, created_at timestamp with time zone not null default now());
create table if not exists public.funding_checks (id uuid not null default gen_random_uuid(), deal_id uuid not null, check_key text not null, passed boolean not null default false, note text not null default ''::text, checked_at timestamp with time zone, checked_by uuid, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.funding_disbursements (id uuid not null default gen_random_uuid(), deal_id uuid not null, kind text not null, payee text not null default ''::text, address text not null default ''::text, memo text not null default ''::text, amount numeric(14,2) not null default 0, breakdown text not null default ''::text, invoice_payee text not null default ''::text, invoice_address text not null default ''::text, invoice_verified boolean not null default false, printed boolean not null default false, fedex_tracking text not null default ''::text, method text not null default 'check'::text, status text not null default 'undisbursed'::text, voided_at timestamp with time zone, voided_by uuid, void_reason text not null default ''::text, disbursed_at timestamp with time zone, disbursed_by uuid, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.funding_funds (id uuid not null default gen_random_uuid(), deal_id uuid not null, kind text not null, status text not null default 'pending'::text, pending boolean not null default true, amount numeric(14,2), posted_on date, instrument_number text not null default ''::text, entry_type text not null default ''::text, description text not null default ''::text, to_from text not null default ''::text, credit numeric(14,2), debit numeric(14,2), balance numeric(14,2), ledger_entry_id text not null default ''::text, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.funding_records (id uuid not null default gen_random_uuid(), deal_id uuid not null, lender text not null default ''::text, funding_authorization_needed boolean, lender_closing_portal text not null default ''::text, upload_fd boolean not null default false, overages_to text not null default ''::text, send_documents_to text not null default ''::text, la_amount numeric(14,2), la_method text not null default ''::text, sa_amount numeric(14,2), sa_method text not null default ''::text, mortgage_broker_amount numeric(14,2), seller_proceeds_amount numeric(14,2), seller_proceeds_method text not null default ''::text, buyer_proceeds_amount numeric(14,2), buyer_proceeds_method text not null default ''::text, principal_reduction_advanced boolean not null default false, principal_reduction_confirmed boolean not null default false, balanced_with_lender boolean not null default false, closing_time text not null default ''::text, remarks text not null default ''::text, checks_disbursed integer not null default 0, checks_undisbursed integer not null default 0, status text not null default 'pending'::text, wire_team_notified_at timestamp with time zone, wire_team_notified_by uuid, disbursed_at timestamp with time zone, disbursed_by uuid, funding_tasks_completed_at timestamp with time zone, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.fwp_log (id uuid not null default gen_random_uuid(), deal_id uuid not null, module text not null, action text not null, detail text not null default ''::text, at timestamp with time zone not null default now(), by_id uuid, by_name text not null default ''::text);
create table if not exists public.hr_change_history (id bigint not null default nextval('hr_change_history_id_seq'::regclass), table_name text not null, row_id uuid not null, employee_id uuid, field text not null, old_value text not null default ''::text, new_value text not null default ''::text, action text not null, changed_by uuid, changed_by_name text not null default ''::text, changed_at timestamp with time zone not null default now());
create table if not exists public.hr_company_document_shares (id uuid not null default gen_random_uuid(), document_id uuid not null, department_id uuid, employee_id uuid, created_at timestamp with time zone not null default now(), created_by uuid, removed_at timestamp with time zone, removed_by uuid);
create table if not exists public.hr_company_documents (id uuid not null default gen_random_uuid(), title text not null, category text not null default 'policy'::text, description text not null default ''::text, share_scope text not null default 'all'::text, file_name text not null, mime_type text not null default ''::text, size_bytes bigint not null, storage_path text not null, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone, updated_by uuid, archived_at timestamp with time zone, archived_by uuid);
create table if not exists public.hr_departments (id uuid not null default gen_random_uuid(), name text not null, sort integer not null default 0, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone, updated_by uuid, archived_at timestamp with time zone, archived_by uuid);
create table if not exists public.hr_designations (id uuid not null default gen_random_uuid(), name text not null, sort integer not null default 0, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone, updated_by uuid, archived_at timestamp with time zone, archived_by uuid);
create table if not exists public.hr_employee_documents (id uuid not null default gen_random_uuid(), employee_id uuid not null, doc_type text not null default 'other'::text, title text not null, signature_required boolean not null default false, file_name text not null, mime_type text not null default ''::text, size_bytes bigint not null, storage_path text not null, uploaded_by_role text not null, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone, updated_by uuid, archived_at timestamp with time zone, archived_by uuid);
create table if not exists public.hr_employees (id uuid not null default gen_random_uuid(), employee_code text not null, profile_id uuid, first_name text not null, last_name text not null, email text not null, department_id uuid, designation_id uuid, job_title text not null default ''::text, reporting_to uuid, date_of_joining date, work_location text not null default ''::text, employment_type text not null default 'full_time'::text, employment_status text not null default 'active'::text, country text not null default 'US'::text, work_phone text not null default ''::text, phone text not null default ''::text, address_line1 text not null default ''::text, address_line2 text not null default ''::text, city text not null default ''::text, state_province text not null default ''::text, postal_code text not null default ''::text, address_country text not null default ''::text, emergency_name text not null default ''::text, emergency_relationship text not null default ''::text, emergency_phone text not null default ''::text, pay_type text, pay_rate numeric(12,2), pay_currency text, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone, updated_by uuid, archived_at timestamp with time zone, archived_by uuid, commissioned boolean not null default false, commission_notes text not null default ''::text);
create table if not exists public.hr_invites (id uuid not null default gen_random_uuid(), employee_id uuid not null, token_hash text, email text not null, created_at timestamp with time zone not null default now(), created_by uuid, expires_at timestamp with time zone not null default (now() + '14 days'::interval), accepted_at timestamp with time zone, accepted_profile uuid, revoked_at timestamp with time zone, revoked_by uuid, sent_at timestamp with time zone, sent_via text, sent_to text, sent_message_id text, sent_by uuid, send_count integer not null default 0, send_error text, opened_token_hash text);
create table if not exists public.hr_portal_sessions (id uuid not null default gen_random_uuid(), employee_id uuid not null, profile_id uuid not null, started_at timestamp with time zone not null default now(), last_activity_at timestamp with time zone not null default now(), ended_at timestamp with time zone, end_reason text, heartbeat_count integer not null default 1);
create table if not exists public.hr_role_assignments (id uuid not null default gen_random_uuid(), employee_id uuid not null, role text not null default 'hr_manager'::text, assigned_at timestamp with time zone not null default now(), assigned_by uuid, removed_at timestamp with time zone, removed_by uuid);
create table if not exists public.hr_signature_requests (id uuid not null default gen_random_uuid(), document_id uuid not null, employee_id uuid not null, provider text not null default 'zoho_sign'::text, status text not null default 'not_sent'::text, sent_at timestamp with time zone, signed_at timestamp with time zone, declined_at timestamp with time zone, status_note text not null default ''::text, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone, updated_by uuid, archived_at timestamp with time zone, archived_by uuid);
create table if not exists public.message_attachments (message_id uuid not null, document_id uuid not null, created_at timestamp with time zone not null default now());
create table if not exists public.messages (id uuid not null default gen_random_uuid(), thread_id uuid not null, author_id uuid not null, body text not null, created_at timestamp with time zone not null default now(), body_html text not null default ''::text);
create table if not exists public.notifications (id uuid not null default gen_random_uuid(), profile_id uuid not null, kind text not null, deal_id uuid, title text not null, link text not null default ''::text, created_at timestamp with time zone not null default now(), read_at timestamp with time zone);
create table if not exists public.office_counties (office_id text not null, state text not null, county text not null, added_at timestamp with time zone not null default now(), added_by uuid, removed_at timestamp with time zone, removed_by uuid);
create table if not exists public.office_county_choices (state text not null, county text not null);
create table if not exists public.offices (id text not null default ('off-'::text || substr(md5((gen_random_uuid())::text), 1, 10)), name text not null, address_line1 text not null, address_line2 text not null default ''::text, city text not null, state text not null, zip text not null, main_phone text not null default ''::text, email text, is_main_office_for_state boolean not null default false, active boolean not null default true, sort_order integer not null default 0, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, latitude double precision, longitude double precision, coord_source text);
create table if not exists public.outbox (id uuid not null default gen_random_uuid(), channel text not null default 'email'::text, status text not null default 'queued'::text, sent_at timestamp with time zone, to_profile_id uuid, to_email text not null, subject text not null, body text not null, task_id uuid, deal_id uuid, created_by uuid, created_at timestamp with time zone not null default now(), to_name text not null default ''::text, attachment_document_id uuid, title_package boolean not null default false, kind text not null default ''::text, cc_emails text[] not null default '{}'::text[], bcc_emails text[] not null default '{}'::text[], attachment_document_ids uuid[] not null default '{}'::uuid[], from_email text, from_name text, sender_type text not null default 'other'::text, sender_profile_id uuid, sender_fallback boolean not null default false, sender_fallback_reason text, post_closing_type text, template_key text not null default ''::text, title_recipient_role text not null default ''::text, send_blocked text not null default ''::text);
create table if not exists public.participant_entities (participant_id uuid not null, name text not null, entity_type text not null default ''::text, rep_name text not null default ''::text, rep_title text not null default ''::text, rep_phone text not null default ''::text, rep_email text not null default ''::text, set_by uuid, set_at timestamp with time zone not null default now(), removed_at timestamp with time zone);
create table if not exists public.policy_checks (id uuid not null default gen_random_uuid(), deal_id uuid not null, check_key text not null, passed boolean not null default false, note text not null default ''::text, checked_at timestamp with time zone, checked_by uuid, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.policy_endorsement_fees (id uuid not null default gen_random_uuid(), deal_id uuid not null, endorsement text not null, amount numeric(14,2) not null, collected_at_closing boolean not null default false, status text not null default 'open'::text, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.policy_escalations (id uuid not null default gen_random_uuid(), deal_id uuid not null, type text not null, description text not null, status text not null default 'open'::text, resolution_note text not null default ''::text, resolved_at timestamp with time zone, resolved_by uuid, outbox_ids uuid[] not null default '{}'::uuid[], created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.policy_exceptions (id uuid not null default gen_random_uuid(), deal_id uuid not null, policy_side text not null, exception_key text not null, text text not null, "position" integer not null default 99, included boolean not null default true, auto_added boolean not null default false, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.policy_records (id uuid not null default gen_random_uuid(), deal_id uuid not null, status text not null default 'pending'::text, balanced_funded boolean not null default false, deed boolean not null default false, dot boolean not null default false, closing_instructions boolean not null default false, notes_reviewed boolean not null default false, owner_premium numeric(14,2), lender_premium numeric(14,2), alta_owner_collected numeric(14,2), alta_lender_collected numeric(14,2), lender_title_form text not null default 'none'::text, required_endorsements text[] not null default '{}'::text[], commitment_schedule_a_notes text not null default ''::text, closing_instructions_address text not null default ''::text, closing_instruction_address_wins boolean not null default true, lender_clause text not null default ''::text, closing_instructions_verified boolean not null default false, deed_vesting text not null default ''::text, deed_vesting_matches boolean, deed_price numeric(14,2), deed_price_matches boolean, deed_estate text not null default ''::text, deed_estate_matches boolean, dot_borrower text not null default ''::text, dot_lender text not null default ''::text, dot_trustee text not null default ''::text, dot_amount numeric(14,2), dot_date date, borrower_matches boolean, lender_matches boolean, trustee_matches boolean, amount_matches boolean, riders text[] not null default '{}'::text[], riders_attached boolean, owner_policy_type text not null default ''::text, lender_policy_type text not null default ''::text, owner_signatory text not null default ''::text, lender_signatory text not null default ''::text, endorsements text[] not null default '{}'::text[], issue_owner boolean not null default true, issue_lender boolean not null default true, rates_changed boolean, last_refreshed_premium numeric(14,2), insured_vesting text not null default ''::text, insured_is_trust boolean not null default false, estate_type text not null default ''::text, effective_date date, use_recording_date boolean not null default true, include_endorsements boolean not null default true, grantor text not null default ''::text, trustee text not null default ''::text, lender text not null default ''::text, recording_date date, instrument_number text not null default ''::text, book_page text not null default ''::text, issued_at timestamp with time zone, issued_by uuid, completed_at timestamp with time zone, completed_by uuid, completed_lender boolean, completed_owner boolean, completed_type text not null default ''::text, owner_document_id uuid, lender_document_id uuid, outbox_ids uuid[] not null default '{}'::uuid[], created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.portal_feedback (id uuid not null default gen_random_uuid(), author_id uuid not null, body text not null, page text not null default ''::text, created_at timestamp with time zone not null default now());
create table if not exists public.portal_feedback_access (id uuid not null default gen_random_uuid(), actor_id uuid not null, feedback_id uuid, action text not null, at timestamp with time zone not null default now());
create table if not exists public.post_closing_scanbacks (id uuid not null default gen_random_uuid(), deal_id uuid not null, buyer_side boolean, buyer_source text, seller_side boolean, seller_source text, received_thank_you boolean, file_number_match boolean, address_match boolean, buyer_names_match boolean, seller_names_match boolean, purchase_refi text, fa_needed boolean, funding_date date, cash_deal boolean, e_signed boolean, additional_notes text not null default ''::text, signed_notarized boolean, settlement_agent_stamped boolean, fa_status text not null default 'not_started'::text, buyer_copies_sent boolean, seller_copies_sent boolean, audit_resolved boolean, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.profiles (id uuid not null, email text not null, first_name text not null, last_name text not null default ''::text, phone text not null default ''::text, role text not null, status text not null default 'active'::text, created_at timestamp with time zone not null default now(), is_admin boolean not null default false, removed_at timestamp with time zone, removed_by uuid, is_demo boolean not null default false);
create table if not exists public.recording_events (id uuid not null default gen_random_uuid(), deal_id uuid not null, action text not null, detail text not null default ''::text, created_at timestamp with time zone not null default now(), created_by uuid);
create table if not exists public.recording_instruments (id uuid not null default gen_random_uuid(), deal_id uuid not null, kind text not null, instrument_type text not null, document_id uuid, grantor text not null default ''::text, grantee text not null default ''::text, tenancy text not null default ''::text, zip text not null default ''::text, consideration numeric(14,2), lender text not null default ''::text, return_to text not null default 'CLA Post Closing Department'::text, collected_fee numeric(12,2), estimated_fee numeric(12,2), created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.recording_packages (id uuid not null default gen_random_uuid(), deal_id uuid not null, disbursement_date date, transaction_type text, processor_name text not null default ''::text, recording_method text, method_note text not null default ''::text, assigned_to text not null default ''::text, recording_instructions text not null default ''::text, package_name text not null default ''::text, payment_account text not null default ''::text, deed_document_id uuid, dot_document_id uuid, md_intake_attached boolean, md_clear_mortgage_balance boolean, md_subdivision text not null default ''::text, md_document2_grantee_trustee boolean, md_return_to_post_closing boolean, wh_ar_exemption boolean, first_time_home_buyer boolean, owner_occupancy boolean, property_tax_required boolean, county_tax_amount numeric(12,2), accounting_tax_amount numeric(12,2), collected_fees numeric(12,2), estimated_fees numeric(12,2), platform_fee_paid boolean, status text not null default 'draft'::text, sent_received text, rejection_reason text not null default ''::text, recorded_date date, release_funds_notified boolean, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.recording_review_checks (id uuid not null default gen_random_uuid(), deal_id uuid not null, check_key text not null, group_name text not null, label text not null, done boolean not null default false, note text not null default ''::text, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.scanback_documents (id uuid not null default gen_random_uuid(), deal_id uuid not null, kind text not null, document_id uuid, document_ref text not null default ''::text, present boolean not null default false, folder text not null default '500 Post Closing - Final Signed Docs / SCANBACKS'::text, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.scanback_events (id uuid not null default gen_random_uuid(), deal_id uuid not null, action text not null, detail text not null default ''::text, created_at timestamp with time zone not null default now(), created_by uuid);
create table if not exists public.settlement_responses (id uuid not null default gen_random_uuid(), settlement_id uuid not null, round integer not null, side text not null, picks integer[] not null default '{}'::integer[], note text not null default ''::text, responded_by uuid, responder_name text not null, at timestamp with time zone not null default now(), location text not null default ''::text, office_id text);
create table if not exists public.settlements (id uuid not null default gen_random_uuid(), deal_id uuid not null, status text not null default 'open'::text, round integer not null default 1, slots timestamp without time zone[] not null, location text not null default ''::text, note text not null default ''::text, buyer_token_hash bytea not null, seller_token_hash bytea not null, confirmed_slot integer, history jsonb not null default '[]'::jsonb, created_by uuid, created_at timestamp with time zone not null default now(), confirmed_at timestamp with time zone, token_expires_at timestamp with time zone not null default (now() + '14 days'::interval), office_id text);
create table if not exists public.signature_requests (id uuid not null default gen_random_uuid(), deal_id uuid not null, document_id uuid not null, provider text not null default 'demo'::text, envelope_id text not null default ''::text, message text not null default ''::text, status text not null default 'requested'::text, requested_by uuid not null, requested_at timestamp with time zone not null default now(), completed_at timestamp with time zone);
create table if not exists public.signature_signers (request_id uuid not null, profile_id uuid not null, role_label text not null, task_id uuid, status text not null default 'requested'::text, signed_at timestamp with time zone, typed_name text, certificate text);
create table if not exists public.task_template_switch_log (id bigint not null default nextval('task_template_switch_log_id_seq'::regclass), code text not null, old_enabled boolean not null, new_enabled boolean not null, changed_by uuid, changed_by_name text not null default ''::text, changed_at timestamp with time zone not null default now(), reason text not null default ''::text);
create table if not exists public.task_template_switches (code text not null, enabled boolean not null default true, updated_at timestamp with time zone, updated_by uuid, reason text not null default ''::text);
create table if not exists public.task_templates (id uuid not null default gen_random_uuid(), code text not null, version integer not null, title text not null, description text not null default ''::text, roles text[] not null, due_days integer not null default 7, fields jsonb not null default '[]'::jsonb, active boolean not null default true, published_by uuid, published_at timestamp with time zone not null default now(), agent_roles text[] not null default '{}'::text[], client_only boolean not null default false, lane text, audiences text[], retired_at timestamp with time zone, retired_by uuid, retire_reason text not null default ''::text);
create table if not exists public.tasks (id uuid not null default gen_random_uuid(), deal_id uuid not null, title text not null, description text not null default ''::text, assigned_role text not null default 'Processor'::text, status text not null default 'todo'::text, due_date date, completed_at timestamp with time zone, completed_by uuid, created_by uuid, created_at timestamp with time zone not null default now(), kind text not null default 'simple'::text, participant_id uuid, owner_profile_id uuid, template_id uuid, template_code text, template_version integer, form_data jsonb not null default '{}'::jsonb, saved_at timestamp with time zone, saved_by uuid, signature_request_id uuid, task_group text not null default ''::text, lane text, audiences text[], flow_run_id uuid);
create table if not exists public.team_members (team_id uuid not null, profile_id uuid not null, member_role text not null, added_by uuid, added_at timestamp with time zone not null default now());
create table if not exists public.teams (id uuid not null default gen_random_uuid(), name text not null, created_by uuid, created_at timestamp with time zone not null default now());
create table if not exists public.thread_participants (thread_id uuid not null, profile_id uuid not null, last_read_at timestamp with time zone);
create table if not exists public.threads (id uuid not null default gen_random_uuid(), deal_id uuid not null, subject text not null default 'New conversation'::text, created_by uuid not null, created_at timestamp with time zone not null default now(), task_id uuid, staff_coordinated boolean not null default false);
create table if not exists public.title_ctc_checks (id uuid not null default gen_random_uuid(), deal_id uuid not null, check_key text not null, status text not null default 'open'::text, note text not null default ''::text, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.title_curative_liens (id uuid not null default gen_random_uuid(), deal_id uuid not null, item_type text not null, case_number text not null default ''::text, mortgagor text not null default ''::text, beneficiary text not null default ''::text, trustee text not null default ''::text, instrument_date date, recorded_date date, entry_date date, renewal_date date, filing_date date, jurisdiction_state text not null default ''::text, amount numeric(14,2), book text not null default ''::text, page text not null default ''::text, instrument_number text not null default ''::text, status text not null default 'open'::text, verification_method text, identity_verified boolean, identity_verified_by text not null default ''::text, identity_verified_date date, document_id uuid, attorney_name text not null default ''::text, sufficient_funds_affidavit boolean, notes text not null default ''::text, requirement_item_id uuid, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.title_entity_reviews (id uuid not null default gen_random_uuid(), deal_id uuid not null, side text not null, entity_name text not null default ''::text, entity_type text not null default ''::text, articles_received boolean, operating_agreement_received boolean, resolutions_received boolean, good_standing_received boolean, good_standing_year text not null default ''::text, ein_received boolean, good_standing_verified boolean, good_standing_state_site text not null default ''::text, signer_authorized boolean, member_structure text, management_structure text not null default ''::text, required_signatures_captured boolean, critical_issue boolean not null default false, issue_notes text not null default ''::text, assigned_attorney_id uuid, attorney_approved boolean not null default false, attorney_approval_notes text not null default ''::text, folder_document_id uuid, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.title_lien_certificates (id uuid not null default gen_random_uuid(), deal_id uuid not null, received_at timestamp with time zone, review_due_at timestamp with time zone, address_match boolean, parcel_match boolean, all_amounts_paid boolean, outstanding_amount numeric(12,2), zero_violations boolean, violation_count text not null default ''::text, signed_dated boolean, outcome text not null default 'pending'::text, notes text not null default ''::text, document_id uuid, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.title_processor_notes (id uuid not null default gen_random_uuid(), deal_id uuid not null, body text not null, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);
create table if not exists public.underwriter_split_log (id bigint not null default nextval('underwriter_split_log_id_seq'::regclass), state text not null, added boolean not null default false, old_pct numeric(5,2), new_pct numeric(5,2), old_underwriter text, new_underwriter text not null, changed_by uuid, changed_by_name text not null default ''::text, changed_at timestamp with time zone not null default now());
create table if not exists public.underwriter_splits (state text not null, underwriter_pct numeric(5,2), underwriter text not null default 'Fidelity National Title'::text, updated_at timestamp with time zone, updated_by uuid, updated_by_name text not null default ''::text);
create table if not exists public.update_requests (id uuid not null default gen_random_uuid(), deal_id uuid not null, topic text not null, note text not null default ''::text, requested_by uuid not null, requested_role text not null, status text not null default 'open'::text, response text not null default ''::text, responded_by uuid, responded_at timestamp with time zone, created_at timestamp with time zone not null default now());
create table if not exists public.wire_audit_log (id uuid not null default gen_random_uuid(), deal_id uuid not null, wire_id uuid not null, amount boolean not null, account_name boolean not null, account_number boolean not null, aba boolean not null, purpose boolean not null, audited_at timestamp with time zone not null default now(), audited_by uuid, created_at timestamp with time zone not null default now(), created_by uuid);
create table if not exists public.wire_records (id uuid not null default gen_random_uuid(), deal_id uuid not null, payee_participant_id uuid, payee_name text not null default ''::text, all_sellers_signed boolean not null default false, notarized boolean not null default false, disbursement_method text not null default 'wire'::text, payee_name_matches boolean not null default false, payee_address_matches boolean not null default false, seller_contact_address text not null default ''::text, from_account_id uuid, amount numeric(14,2), recipient_name text not null default ''::text, bank_name text not null default ''::text, account_last4 text not null default ''::text, aba_last4 text not null default ''::text, beneficiary_message text not null default ''::text, status text not null default 'Drafted'::text, audit_amount boolean not null default false, audit_account_name boolean not null default false, audit_account_number boolean not null default false, audit_aba boolean not null default false, audit_purpose boolean not null default false, verified_at timestamp with time zone, verified_by uuid, posted_at timestamp with time zone, posted_by uuid, queue_status text not null default ''::text, created_at timestamp with time zone not null default now(), created_by uuid, updated_at timestamp with time zone not null default now(), updated_by uuid, deleted_at timestamp with time zone, deleted_by uuid);

alter table public.deals enable row level security;




-- Primary keys. Skipped when the table already has one, so TEST is unchanged.
do $pk0$ begin
  if to_regclass('private.backfills') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'private.backfills'::regclass and contype = 'p'
  ) then
    alter table private.backfills add primary key (name);
  end if;
end $pk0$;
do $pk2$ begin
  if to_regclass('private.view_as_audit') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'private.view_as_audit'::regclass and contype = 'p'
  ) then
    alter table private.view_as_audit add primary key (id);
  end if;
end $pk2$;
do $pk3$ begin
  if to_regclass('private.view_as_sessions') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'private.view_as_sessions'::regclass and contype = 'p'
  ) then
    alter table private.view_as_sessions add primary key (actor_id);
  end if;
end $pk3$;
do $pk4$ begin
  if to_regclass('public.access_invites') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.access_invites'::regclass and contype = 'p'
  ) then
    alter table public.access_invites add primary key (id);
  end if;
end $pk4$;
do $pk5$ begin
  if to_regclass('public.accounting_contract_terms') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.accounting_contract_terms'::regclass and contype = 'p'
  ) then
    alter table public.accounting_contract_terms add primary key (deal_id);
  end if;
end $pk5$;
do $pk6$ begin
  if to_regclass('public.accounting_contract_terms_log') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.accounting_contract_terms_log'::regclass and contype = 'p'
  ) then
    alter table public.accounting_contract_terms_log add primary key (id);
  end if;
end $pk6$;
do $pk7$ begin
  if to_regclass('public.activity_log') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.activity_log'::regclass and contype = 'p'
  ) then
    alter table public.activity_log add primary key (id);
  end if;
end $pk7$;
do $pk8$ begin
  if to_regclass('public.agent_invites') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.agent_invites'::regclass and contype = 'p'
  ) then
    alter table public.agent_invites add primary key (id);
  end if;
end $pk8$;
do $pk9$ begin
  if to_regclass('public.agent_private') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.agent_private'::regclass and contype = 'p'
  ) then
    alter table public.agent_private add primary key (profile_id);
  end if;
end $pk9$;
do $pk10$ begin
  if to_regclass('public.agent_profiles') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.agent_profiles'::regclass and contype = 'p'
  ) then
    alter table public.agent_profiles add primary key (profile_id);
  end if;
end $pk10$;
do $pk11$ begin
  if to_regclass('public.agent_task_revisions') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.agent_task_revisions'::regclass and contype = 'p'
  ) then
    alter table public.agent_task_revisions add primary key (id);
  end if;
end $pk11$;
do $pk12$ begin
  if to_regclass('public.agreement_acks') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.agreement_acks'::regclass and contype = 'p'
  ) then
    alter table public.agreement_acks add primary key (id);
  end if;
end $pk12$;
do $pk13$ begin
  if to_regclass('public.agreements') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.agreements'::regclass and contype = 'p'
  ) then
    alter table public.agreements add primary key (code);
  end if;
end $pk13$;
do $pk16$ begin
  if to_regclass('public.cla_office_counties') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.cla_office_counties'::regclass and contype = 'p'
  ) then
    alter table public.cla_office_counties add primary key (office_id, state, county);
  end if;
end $pk16$;
do $pk17$ begin
  if to_regclass('public.cla_offices') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.cla_offices'::regclass and contype = 'p'
  ) then
    alter table public.cla_offices add primary key (id);
  end if;
end $pk17$;
do $pk18$ begin
  if to_regclass('public.client_sales_reps') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.client_sales_reps'::regclass and contype = 'p'
  ) then
    alter table public.client_sales_reps add primary key (client_id, sales_id);
  end if;
end $pk18$;
do $pk19$ begin
  if to_regclass('public.closing_location_reminders') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.closing_location_reminders'::regclass and contype = 'p'
  ) then
    alter table public.closing_location_reminders add primary key (id);
  end if;
end $pk19$;
do $pk20$ begin
  if to_regclass('public.closing_party_locations') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.closing_party_locations'::regclass and contype = 'p'
  ) then
    alter table public.closing_party_locations add primary key (id);
  end if;
end $pk20$;
do $pk21$ begin
  if to_regclass('public.closing_proposals') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.closing_proposals'::regclass and contype = 'p'
  ) then
    alter table public.closing_proposals add primary key (id);
  end if;
end $pk21$;
do $pk22$ begin
  if to_regclass('public.contacts') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.contacts'::regclass and contype = 'p'
  ) then
    alter table public.contacts add primary key (id);
  end if;
end $pk22$;
do $pk26$ begin
  if to_regclass('public.crm_attachments') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_attachments') and contype = 'p'
  ) then
    alter table public.crm_attachments add primary key (id);
  end if;
end $pk26$;
do $pk27$ begin
  if to_regclass('public.crm_custom_fields') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_custom_fields') and contype = 'p'
  ) then
    alter table public.crm_custom_fields add primary key (id);
  end if;
end $pk27$;
do $pk28$ begin
  if to_regclass('public.crm_dash_components') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_dash_components') and contype = 'p'
  ) then
    alter table public.crm_dash_components add primary key (id);
  end if;
end $pk28$;
do $pk29$ begin
  if to_regclass('public.crm_dashboards') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_dashboards') and contype = 'p'
  ) then
    alter table public.crm_dashboards add primary key (id);
  end if;
end $pk29$;
do $pk30$ begin
  if to_regclass('public.crm_dup_rules') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_dup_rules') and contype = 'p'
  ) then
    alter table public.crm_dup_rules add primary key (key);
  end if;
end $pk30$;
do $pk31$ begin
  if to_regclass('public.crm_email_aliases') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_email_aliases') and contype = 'p'
  ) then
    alter table public.crm_email_aliases add primary key (id);
  end if;
end $pk31$;
do $pk32$ begin
  if to_regclass('public.crm_email_favorites') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_email_favorites') and contype = 'p'
  ) then
    alter table public.crm_email_favorites add primary key (user_id, template_id);
  end if;
end $pk32$;
do $pk33$ begin
  if to_regclass('public.crm_email_folders') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_email_folders') and contype = 'p'
  ) then
    alter table public.crm_email_folders add primary key (id);
  end if;
end $pk33$;
do $pk34$ begin
  if to_regclass('public.crm_email_template_files') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_email_template_files') and contype = 'p'
  ) then
    alter table public.crm_email_template_files add primary key (template_id, attachment_id);
  end if;
end $pk34$;
do $pk35$ begin
  if to_regclass('public.crm_email_templates') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_email_templates') and contype = 'p'
  ) then
    alter table public.crm_email_templates add primary key (id);
  end if;
end $pk35$;
do $pk36$ begin
  if to_regclass('public.crm_emails') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_emails') and contype = 'p'
  ) then
    alter table public.crm_emails add primary key (id);
  end if;
end $pk36$;
do $pk37$ begin
  if to_regclass('public.crm_field_settings') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_field_settings') and contype = 'p'
  ) then
    alter table public.crm_field_settings add primary key (scope, key);
  end if;
end $pk37$;
do $pk38$ begin
  if to_regclass('public.crm_import_defaults') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.crm_import_defaults'::regclass and contype = 'p'
  ) then
    alter table public.crm_import_defaults add primary key (import_id, field_key);
  end if;
end $pk38$;
do $pk40$ begin
  if to_regclass('public.crm_list_exports') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.crm_list_exports'::regclass and contype = 'p'
  ) then
    alter table public.crm_list_exports add primary key (id);
  end if;
end $pk40$;
do $pk41$ begin
  if to_regclass('public.crm_meeting_invites') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_meeting_invites') and contype = 'p'
  ) then
    alter table public.crm_meeting_invites add primary key (id);
  end if;
end $pk41$;
do $pk43$ begin
  if to_regclass('public.crm_picklist_options') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_picklist_options') and contype = 'p'
  ) then
    alter table public.crm_picklist_options add primary key (list_key, value);
  end if;
end $pk43$;
do $pk44$ begin
  if to_regclass('public.crm_recent_items') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_recent_items') and contype = 'p'
  ) then
    alter table public.crm_recent_items add primary key (user_id, module, record_id);
  end if;
end $pk44$;
do $pk45$ begin
  if to_regclass('public.crm_recent_searches') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_recent_searches') and contype = 'p'
  ) then
    alter table public.crm_recent_searches add primary key (user_id, q);
  end if;
end $pk45$;
do $pk46$ begin
  if to_regclass('public.crm_report_exports') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_report_exports') and contype = 'p'
  ) then
    alter table public.crm_report_exports add primary key (id);
  end if;
end $pk46$;
do $pk47$ begin
  if to_regclass('public.crm_report_folders') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_report_folders') and contype = 'p'
  ) then
    alter table public.crm_report_folders add primary key (id);
  end if;
end $pk47$;
do $pk48$ begin
  if to_regclass('public.crm_reports') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_reports') and contype = 'p'
  ) then
    alter table public.crm_reports add primary key (id);
  end if;
end $pk48$;
do $pk49$ begin
  if to_regclass('public.crm_saved_filter_values') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.crm_saved_filter_values'::regclass and contype = 'p'
  ) then
    alter table public.crm_saved_filter_values add primary key (filter_id, field_name);
  end if;
end $pk49$;
do $pk50$ begin
  if to_regclass('public.crm_saved_filters') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.crm_saved_filters'::regclass and contype = 'p'
  ) then
    alter table public.crm_saved_filters add primary key (id);
  end if;
end $pk50$;
do $pk51$ begin
  if to_regclass('public.crm_search_columns') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.crm_search_columns'::regclass and contype = 'p'
  ) then
    alter table public.crm_search_columns add primary key (user_id, module, "position");
  end if;
end $pk51$;
do $pk52$ begin
  if to_regclass('public.crm_user_signatures') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_user_signatures') and contype = 'p'
  ) then
    alter table public.crm_user_signatures add primary key (user_id);
  end if;
end $pk52$;
do $pk53$ begin
  if to_regclass('public.crm_view_columns') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.crm_view_columns'::regclass and contype = 'p'
  ) then
    alter table public.crm_view_columns add primary key (view_id, "position");
  end if;
end $pk53$;
do $pk54$ begin
  if to_regclass('public.crm_view_criteria') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.crm_view_criteria'::regclass and contype = 'p'
  ) then
    alter table public.crm_view_criteria add primary key (view_id, "position", value_index);
  end if;
end $pk54$;
do $pk55$ begin
  if to_regclass('public.crm_view_pins') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.crm_view_pins'::regclass and contype = 'p'
  ) then
    alter table public.crm_view_pins add primary key (user_id, view_id);
  end if;
end $pk55$;
do $pk56$ begin
  if to_regclass('public.crm_view_shares') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.crm_view_shares'::regclass and contype = 'p'
  ) then
    alter table public.crm_view_shares add primary key (view_id, user_id);
  end if;
end $pk56$;
do $pk57$ begin
  if to_regclass('public.crm_views') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.crm_views'::regclass and contype = 'p'
  ) then
    alter table public.crm_views add primary key (id);
  end if;
end $pk57$;
do $pk58$ begin
  if to_regclass('public.deal_business_sources') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.deal_business_sources'::regclass and contype = 'p'
  ) then
    alter table public.deal_business_sources add primary key (deal_id);
  end if;
end $pk58$;
do $pk59$ begin
  if to_regclass('public.deal_participants') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.deal_participants'::regclass and contype = 'p'
  ) then
    alter table public.deal_participants add primary key (id);
  end if;
end $pk59$;
do $pk60$ begin
  if to_regclass('public.deal_sales_people') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.deal_sales_people'::regclass and contype = 'p'
  ) then
    alter table public.deal_sales_people add primary key (deal_id, sales_id);
  end if;
end $pk60$;
do $pk61$ begin
  if to_regclass('public.deals') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.deals'::regclass and contype = 'p'
  ) then
    alter table public.deals add primary key (id);
  end if;
end $pk61$;
do $pk62$ begin
  if to_regclass('public.documents') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.documents'::regclass and contype = 'p'
  ) then
    alter table public.documents add primary key (id);
  end if;
end $pk62$;
do $pk63$ begin
  if to_regclass('public.email_sender_settings') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.email_sender_settings'::regclass and contype = 'p'
  ) then
    alter table public.email_sender_settings add primary key (sender_type);
  end if;
end $pk63$;
do $pk65$ begin
  if to_regclass('public.escrow_accounts') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.escrow_accounts'::regclass and contype = 'p'
  ) then
    alter table public.escrow_accounts add primary key (id);
  end if;
end $pk65$;
do $pk67$ begin
  if to_regclass('public.folders') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.folders'::regclass and contype = 'p'
  ) then
    alter table public.folders add primary key (id);
  end if;
end $pk67$;
do $pk68$ begin
  if to_regclass('public.hr_change_history') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.hr_change_history'::regclass and contype = 'p'
  ) then
    alter table public.hr_change_history add primary key (id);
  end if;
end $pk68$;
do $pk69$ begin
  if to_regclass('public.hr_company_document_shares') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.hr_company_document_shares'::regclass and contype = 'p'
  ) then
    alter table public.hr_company_document_shares add primary key (id);
  end if;
end $pk69$;
do $pk70$ begin
  if to_regclass('public.hr_company_documents') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.hr_company_documents'::regclass and contype = 'p'
  ) then
    alter table public.hr_company_documents add primary key (id);
  end if;
end $pk70$;
do $pk71$ begin
  if to_regclass('public.hr_departments') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.hr_departments'::regclass and contype = 'p'
  ) then
    alter table public.hr_departments add primary key (id);
  end if;
end $pk71$;
do $pk72$ begin
  if to_regclass('public.hr_designations') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.hr_designations'::regclass and contype = 'p'
  ) then
    alter table public.hr_designations add primary key (id);
  end if;
end $pk72$;
do $pk73$ begin
  if to_regclass('public.hr_employee_documents') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.hr_employee_documents'::regclass and contype = 'p'
  ) then
    alter table public.hr_employee_documents add primary key (id);
  end if;
end $pk73$;
do $pk74$ begin
  if to_regclass('public.hr_employees') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.hr_employees'::regclass and contype = 'p'
  ) then
    alter table public.hr_employees add primary key (id);
  end if;
end $pk74$;
do $pk75$ begin
  if to_regclass('public.hr_invites') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.hr_invites'::regclass and contype = 'p'
  ) then
    alter table public.hr_invites add primary key (id);
  end if;
end $pk75$;
do $pk76$ begin
  if to_regclass('public.hr_portal_sessions') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.hr_portal_sessions'::regclass and contype = 'p'
  ) then
    alter table public.hr_portal_sessions add primary key (id);
  end if;
end $pk76$;
do $pk77$ begin
  if to_regclass('public.hr_role_assignments') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.hr_role_assignments'::regclass and contype = 'p'
  ) then
    alter table public.hr_role_assignments add primary key (id);
  end if;
end $pk77$;
do $pk78$ begin
  if to_regclass('public.hr_signature_requests') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.hr_signature_requests'::regclass and contype = 'p'
  ) then
    alter table public.hr_signature_requests add primary key (id);
  end if;
end $pk78$;
do $pk79$ begin
  if to_regclass('public.message_attachments') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.message_attachments'::regclass and contype = 'p'
  ) then
    alter table public.message_attachments add primary key (message_id, document_id);
  end if;
end $pk79$;
do $pk80$ begin
  if to_regclass('public.messages') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.messages'::regclass and contype = 'p'
  ) then
    alter table public.messages add primary key (id);
  end if;
end $pk80$;
do $pk81$ begin
  if to_regclass('public.notifications') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.notifications'::regclass and contype = 'p'
  ) then
    alter table public.notifications add primary key (id);
  end if;
end $pk81$;
do $pk82$ begin
  if to_regclass('public.office_counties') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.office_counties'::regclass and contype = 'p'
  ) then
    alter table public.office_counties add primary key (office_id, state, county);
  end if;
end $pk82$;
do $pk83$ begin
  if to_regclass('public.office_county_choices') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.office_county_choices'::regclass and contype = 'p'
  ) then
    alter table public.office_county_choices add primary key (state, county);
  end if;
end $pk83$;
do $pk84$ begin
  if to_regclass('public.offices') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.offices'::regclass and contype = 'p'
  ) then
    alter table public.offices add primary key (id);
  end if;
end $pk84$;
do $pk86$ begin
  if to_regclass('public.outbox') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.outbox'::regclass and contype = 'p'
  ) then
    alter table public.outbox add primary key (id);
  end if;
end $pk86$;
do $pk87$ begin
  if to_regclass('public.participant_entities') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.participant_entities'::regclass and contype = 'p'
  ) then
    alter table public.participant_entities add primary key (participant_id);
  end if;
end $pk87$;
do $pk88$ begin
  if to_regclass('public.portal_feedback') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.portal_feedback'::regclass and contype = 'p'
  ) then
    alter table public.portal_feedback add primary key (id);
  end if;
end $pk88$;
do $pk89$ begin
  if to_regclass('public.portal_feedback_access') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.portal_feedback_access'::regclass and contype = 'p'
  ) then
    alter table public.portal_feedback_access add primary key (id);
  end if;
end $pk89$;
do $pk90$ begin
  if to_regclass('public.post_closing_scanbacks') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.post_closing_scanbacks'::regclass and contype = 'p'
  ) then
    alter table public.post_closing_scanbacks add primary key (id);
  end if;
end $pk90$;
do $pk91$ begin
  if to_regclass('public.profiles') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'p'
  ) then
    alter table public.profiles add primary key (id);
  end if;
end $pk91$;
do $pk92$ begin
  if to_regclass('public.scanback_documents') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.scanback_documents'::regclass and contype = 'p'
  ) then
    alter table public.scanback_documents add primary key (id);
  end if;
end $pk92$;
do $pk93$ begin
  if to_regclass('public.scanback_events') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.scanback_events'::regclass and contype = 'p'
  ) then
    alter table public.scanback_events add primary key (id);
  end if;
end $pk93$;
do $pk94$ begin
  if to_regclass('public.settlement_responses') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.settlement_responses'::regclass and contype = 'p'
  ) then
    alter table public.settlement_responses add primary key (id);
  end if;
end $pk94$;
do $pk95$ begin
  if to_regclass('public.settlements') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.settlements'::regclass and contype = 'p'
  ) then
    alter table public.settlements add primary key (id);
  end if;
end $pk95$;
do $pk96$ begin
  if to_regclass('public.signature_requests') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.signature_requests'::regclass and contype = 'p'
  ) then
    alter table public.signature_requests add primary key (id);
  end if;
end $pk96$;
do $pk97$ begin
  if to_regclass('public.signature_signers') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.signature_signers'::regclass and contype = 'p'
  ) then
    alter table public.signature_signers add primary key (request_id, profile_id);
  end if;
end $pk97$;
do $pk98$ begin
  if to_regclass('public.team_members') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.team_members'::regclass and contype = 'p'
  ) then
    alter table public.team_members add primary key (team_id, profile_id);
  end if;
end $pk98$;
do $pk99$ begin
  if to_regclass('public.teams') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.teams'::regclass and contype = 'p'
  ) then
    alter table public.teams add primary key (id);
  end if;
end $pk99$;
do $pk100$ begin
  if to_regclass('public.thread_participants') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.thread_participants'::regclass and contype = 'p'
  ) then
    alter table public.thread_participants add primary key (thread_id, profile_id);
  end if;
end $pk100$;
do $pk101$ begin
  if to_regclass('public.threads') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.threads'::regclass and contype = 'p'
  ) then
    alter table public.threads add primary key (id);
  end if;
end $pk101$;
do $pk102$ begin
  if to_regclass('public.update_requests') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.update_requests'::regclass and contype = 'p'
  ) then
    alter table public.update_requests add primary key (id);
  end if;
end $pk102$;

do $guard0$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='accounting_contract_terms_guard' and p.pronargs=0) then
    execute $pf0$CREATE OR REPLACE FUNCTION private.accounting_contract_terms_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
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
$function$$pf0$;
  end if;
end
$guard0$;
do $guard1$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='actor_is_super_admin' and p.pronargs=0) then
    execute $pf1$CREATE OR REPLACE FUNCTION private.actor_is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'Super admin' and p.is_admin and p.status = 'active')
$function$$pf1$;
  end if;
end
$guard1$;
do $guard2$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='agent_invites_no_delete' and p.pronargs=0) then
    execute $pf2$CREATE OR REPLACE FUNCTION private.agent_invites_no_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin raise exception 'Invites are never deleted (Revoke retires them).' using errcode = '42501'; end $function$$pf2$;
  end if;
end
$guard2$;
do $guard3$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='agent_person_ok' and p.pronargs=3) then
    execute $pf3$CREATE OR REPLACE FUNCTION private.agent_person_ok(p jsonb, need_email boolean, need_phone boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(trim(p->>'firstName'), '') <> '' and coalesce(trim(p->>'lastName'), '') <> ''
     and (case when coalesce(p->>'email', '') = '' then not need_email else (p->>'email') ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' end)
     and (case when coalesce(p->>'phone', '') = '' then not need_phone else regexp_replace(p->>'phone', '\D', '', 'g') ~ '^\d{10}$' end) $function$$pf3$;
  end if;
end
$guard3$;
do $guard4$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='agent_task_defs' and p.pronargs=0) then
    execute $pf4$CREATE OR REPLACE FUNCTION private.agent_task_defs()
 RETURNS TABLE(code text, title text, about text, due_days integer)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  values ('agent_client_contacts', 'Confirm Client Contact Information', 'Tell us which of the clients on this order you represent and confirm how to reach them (and their spouse, if married). Add anyone we are missing.', 3),
         ('agent_transaction_info', 'Confirm Your Transaction Information', 'Check the closing date and price we have, give your commission split, any fees or credits for the settlement statement, the earnest money, and the people on your team.', 3),
         ('agent_home_warranty', 'Confirm Home Warranty Information', 'Let us know whether you or someone else will be purchasing a home warranty for this property.', 5) $function$$pf4$;
  end if;
end
$guard4$;
do $guard5$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='buyer_agent_blocked' and p.pronargs=4) then
    execute $pf5$CREATE OR REPLACE FUNCTION private.buyer_agent_blocked(kind text, doc_name text, doc_type text, wire boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(wire, false)
    or coalesce(kind, '') in ('curative_lien', 'entity_document', 'prelim_cd', 'title_package', 'cpl', 'lien_certificate')
    or coalesce(doc_name, '') ~* 'payoff|cash[[:space:]-]*to[[:space:]-]*close|wire[[:space:]._-]*(instruction|info|details)'
    or coalesce(doc_type, '') ~* 'payoff|cash[[:space:]-]*to[[:space:]-]*close' $function$$pf5$;
  end if;
end
$guard5$;
do $guard6$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='check_slots' and p.pronargs=1) then
    execute $pf6$CREATE OR REPLACE FUNCTION private.check_slots(p_slots timestamp without time zone[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if p_slots is null or cardinality(p_slots) not between 1 and 5 then raise exception 'Offer between 1 and 5 closing times'; end if;
  if (select count(distinct s) from unnest(p_slots) s) <> cardinality(p_slots) or array_position(p_slots, null) is not null then raise exception 'Each closing time must be different'; end if;
end $function$$pf6$;
  end if;
end
$guard6$;
do $guard7$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='client_sales_reps_guard' and p.pronargs=0) then
    execute $pf7$CREATE OR REPLACE FUNCTION private.client_sales_reps_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare c public.profiles; s public.profiles;
begin
  select * into c from public.profiles where id = new.client_id;
  select * into s from public.profiles where id = new.sales_id;
  if c.id is null or c.role <> 'Outside user' or c.status = 'removed' then
    raise exception 'Only an outside user (a client) can be linked to salespeople.' using errcode = 'P0001'; end if;
  if s.id is null or s.role not in ('Sales Person', 'Sales Team') then
    raise exception 'Only a Sales Person or Sales Team user can be linked to a client.' using errcode = 'P0001'; end if;
  if s.status <> 'active' then raise exception 'Only an active salesperson can be linked.' using errcode = 'P0001'; end if;
  return new; end $function$$pf7$;
  end if;
end
$guard7$;
do $guard8$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='closing_place' and p.pronargs=2) then
    execute $pf8$CREATE OR REPLACE FUNCTION private.closing_place(p_location text, p_office text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((select name from public.offices where id = p_office and p_location = 'CLA Title office'), p_location) $function$$pf8$;
  end if;
end
$guard8$;
do $guard9$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='contact_type_guard' and p.pronargs=0) then
    execute $pf9$CREATE OR REPLACE FUNCTION private.contact_type_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if new.contact_type is not null and exists (select 1 from public.profiles p where p.id = new.profile_id and p.role <> 'Outside user' and p.status <> 'removed') then
    raise exception 'CLA staff have no contact type.' using errcode = 'P0001'; end if;
  return new; end $function$$pf9$;
  end if;
end
$guard9$;
do $guard10$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='cpl_prices_no_delete' and p.pronargs=0) then
    execute $pf10$CREATE OR REPLACE FUNCTION private.cpl_prices_no_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin if tg_op = 'DELETE' then raise exception 'CPL prices are retired, never deleted.' using errcode = 'P0001'; end if; return new; end $function$$pf10$;
  end if;
end
$guard10$;
do $guard11$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_alias_guard' and p.pronargs=0) then
    execute $pf11$CREATE OR REPLACE FUNCTION private.crm_alias_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'An alias is never deleted; retire it instead.' using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' and (new.user_id, new.email) is distinct from (old.user_id, old.email) then raise exception 'Add a new alias instead of changing one.' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' and (select count(*) from public.crm_email_aliases where user_id = new.user_id and retired_at is null) >= 5 then raise exception 'At most 5 aliases.' using errcode = 'P0001'; end if;
  return new; end $function$$pf11$;
  end if;
end
$guard11$;
do $guard12$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_autonumber_backfill' and p.pronargs=0) then
    execute $pf12$CREATE OR REPLACE FUNCTION private.crm_autonumber_backfill()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare tbl text := case new.entity when 'lead' then 'crm_leads' when 'contact' then 'contacts' when 'account' then 'crm_accounts' else 'crm_opportunities' end; m int; rid uuid; claims text;
begin
  if new.type <> 'autonumber' then return null; end if;
  m := coalesce((new.config ->> 'next')::int, 1); claims := current_setting('request.jwt.claims', true);
  perform set_config('crm.spawn', '1', true); perform set_config('request.jwt.claims', '', true);   -- system numbering: not a user edit (converted leads are numbered too)
  for rid in execute format('select id from public.%I where not (coalesce(custom, ''{}'') ? $1) order by created_at, id', tbl) using new.id::text loop
    execute format('update public.%I set custom = jsonb_set(coalesce(custom, ''{}''), array[$1], to_jsonb($2::text)) where id = $3', tbl) using new.id::text, coalesce(new.config ->> 'prefix', '') || m || coalesce(new.config ->> 'suffix', ''), rid;
    m := m + 1; end loop;
  perform set_config('crm.spawn', '', true); perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  update public.crm_custom_fields set config = jsonb_set(config, '{next}', to_jsonb(m)) where id = new.id;
  return null; end $function$$pf12$;
  end if;
end
$guard12$;
do $guard13$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_company_key' and p.pronargs=1) then
    execute $pf13$CREATE OR REPLACE FUNCTION private.crm_company_key(p text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare s text := lower(coalesce(p, '')); t text;
begin
  s := translate(s, 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy');
  s := replace(s, '&', ' and ');
  s := btrim(regexp_replace(regexp_replace(s, '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'));
  s := regexp_replace(s, '(^| )l l (c|p)(?= |$)', '\1ll\2', 'g');   -- "L.L.C." = "LLC"
  s := regexp_replace(s, '^the ', '');
  s := regexp_replace(s, '( (inc|incorporated|llc|l l c|llp|ltd|limited|co|corp|corporation|company|pllc|pc|lp))+$', '');
  t := btrim(regexp_replace(regexp_replace(' ' || s || ' ', ' (inc|incorporated|llc|llp|ltd|corp|corporation|pllc)(?= )', '', 'g'), '\s+', ' ', 'g'));
  return coalesce(nullif(t, ''), s); end $function$$pf13$;
  end if;
end
$guard13$;
do $guard14$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_depts_of' and p.pronargs=1) then
    execute $pf14$CREATE OR REPLACE FUNCTION private.crm_depts_of(p_role text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case when p_role in ('Sales Person', 'Sales Team') then array['sales'] when p_role in ('Processor', 'Preprocessor') then array['operations']
    when p_role in ('Admin', 'Super admin') then array['management'] else array[]::text[] end $function$$pf14$;
  end if;
end
$guard14$;
do $guard15$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_dropdown_has_options' and p.pronargs=0) then
    execute $pf15$CREATE OR REPLACE FUNCTION private.crm_dropdown_has_options()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if new.type in ('dropdown', 'multiselect', 'radio') and new.archived_at is null and not exists (select 1 from public.crm_picklist_options where list_key = 'cf:' || new.id::text and not retired) then
    raise exception 'A dropdown field needs at least one option.' using errcode = 'P0001'; end if;
  return null; end $function$$pf15$;
  end if;
end
$guard15$;
do $guard16$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_dup_key' and p.pronargs=2) then
    execute $pf16$CREATE OR REPLACE FUNCTION private.crm_dup_key(p_type text, v jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case when v is null or jsonb_typeof(v) = 'null' then null when p_type = 'phone' then nullif(regexp_replace(v #>> '{}', '\D', '', 'g'), '')
    when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric::text else nullif(lower(btrim(v #>> '{}')), '') end $function$$pf16$;
  end if;
end
$guard16$;
do $guard17$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_emails_ok' and p.pronargs=1) then
    execute $pf17$CREATE OR REPLACE FUNCTION private.crm_emails_ok(a text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select cardinality(a) <= 100 and not exists (select 1 from unnest(a) e where char_length(e) > 200 or e !~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$' or e <> lower(e)) $function$$pf17$;
  end if;
end
$guard17$;
do $guard18$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_field_section' and p.pronargs=0) then
    execute $pf18$CREATE OR REPLACE FUNCTION private.crm_field_section()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if tg_op = 'INSERT' or new.section is distinct from old.section then
    if not exists (select 1 from public.crm_layout_sections where entity = new.entity and key = new.section and not hidden) then
      raise exception 'Pick a section that exists for this record type.' using errcode = '23514'; end if; end if;
  if new.type in ('formula', 'rollup', 'autonumber') and new.unique_values then raise exception 'A calculated field cannot be unique.' using errcode = '23514'; end if;
  return new; end $function$$pf18$;
  end if;
end
$guard18$;
do $guard19$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_fields_json' and p.pronargs=0) then
    execute $pf19$CREATE OR REPLACE FUNCTION private.crm_fields_json()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'entity', f.entity, 'label', f.label, 'type', f.type, 'required', f.required, 'section', f.section, 'position', f.position,
    'showInList', f.show_in_list, 'archivedAt', f.archived_at,
    'options', case when f.type = 'dropdown' then coalesce((select jsonb_agg(jsonb_build_object('value', o.value, 'label', o.label, 'retired', o.retired) order by o.position, o.value)
      from public.crm_picklist_options o where o.list_key = 'cf:' || f.id::text), '[]'::jsonb) end) order by f.entity, f.position, f.label), '[]'::jsonb)
  from public.crm_custom_fields f $function$$pf19$;
  end if;
end
$guard19$;
do $guard20$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_first_option' and p.pronargs=1) then
    execute $pf20$CREATE OR REPLACE FUNCTION private.crm_first_option(k text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select value from public.crm_picklist_options where list_key = k and not retired order by position, value limit 1 $function$$pf20$;
  end if;
end
$guard20$;
do $guard21$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_html_safe' and p.pronargs=1) then
    execute $pf21$CREATE OR REPLACE FUNCTION private.crm_html_safe(t text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select t is null or not (t ~* '<\s*/?\s*(script|iframe|object|embed|style|svg|math|form|meta|link|base)\M' or t ~* '<[^>]*\son[a-z]+\s*=' or t ~* '(java|vb)script\s*:' or t ~* 'data:\s*text/html') $function$$pf21$;
  end if;
end
$guard21$;
do $guard22$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_in_pool' and p.pronargs=1) then
    execute $pf22$CREATE OR REPLACE FUNCTION private.crm_in_pool(p_contact uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select exists (select 1 from public.contacts c where c.id = p_contact)
    and not exists (select 1 from public.contacts c join public.profiles p on p.id = c.profile_id where c.id = p_contact and p.role <> 'Outside user' and p.status <> 'removed') $function$$pf22$;
  end if;
end
$guard22$;
do $guard23$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_lead_values' and p.pronargs=1) then
    execute $pf23$CREATE OR REPLACE FUNCTION private.crm_lead_values(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select jsonb_build_object('role_in_company', role_in_company, 'source', source, 'status', status) from public.crm_leads where id = p_id $function$$pf23$;
  end if;
end
$guard23$;
do $guard24$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_link_keys' and p.pronargs=0) then
    execute $pf24$CREATE OR REPLACE FUNCTION private.crm_link_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select array['website', 'facebookProfile', 'facebookGroup', 'facebookPage', 'linkedin', 'instagram', 'zillowProfile', 'linktree', 'other1', 'other2', 'other3'] $function$$pf24$;
  end if;
end
$guard24$;
do $guard25$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_list_keys' and p.pronargs=0) then
    execute $pf25$CREATE OR REPLACE FUNCTION private.crm_list_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select array['relationshipStatus', 'leadRelationshipStatus', 'leadSource', 'roleInCompany', 'accountKind', 'oppStage', 'taskSubject', 'taskStatus', 'taskPriority', 'meetingType', 'callOutcome'] $function$$pf25$;
  end if;
end
$guard25$;
do $guard26$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_list_label' and p.pronargs=1) then
    execute $pf26$CREATE OR REPLACE FUNCTION private.crm_list_label(k text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case k when 'relationshipStatus' then 'Relationship Status' when 'leadRelationshipStatus' then 'Relationship Status' when 'leadSource' then 'Lead Source' when 'roleInCompany' then 'Role in Company'
    when 'accountKind' then 'Company Type' when 'oppStage' then 'Pipeline Stage' when 'taskSubject' then 'Task Subject' when 'taskStatus' then 'Task Status' when 'taskPriority' then 'Task Priority'
    when 'meetingType' then 'Meeting Type' when 'callOutcome' then 'Outbound Call Outcome' else 'value' end $function$$pf26$;
  end if;
end
$guard26$;
do $guard27$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_locked_option' and p.pronargs=2) then
    execute $pf27$CREATE OR REPLACE FUNCTION private.crm_locked_option(k text, v text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select (k, v) in (('relationshipStatus', 'Converted/Current Client'), ('taskStatus', 'Not Started'), ('taskStatus', 'Completed'), ('oppStage', 'New'), ('accountKind', 'other')) $function$$pf27$;
  end if;
end
$guard27$;
do $guard28$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_log_only' and p.pronargs=0) then
    execute $pf28$CREATE OR REPLACE FUNCTION private.crm_log_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin raise exception 'The export log is never changed or deleted.' using errcode = 'P0001'; end $function$$pf28$;
  end if;
end
$guard28$;
do $guard29$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_meeting_types' and p.pronargs=0) then
    execute $pf29$CREATE OR REPLACE FUNCTION private.crm_meeting_types()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select array['Phone Meeting', 'Virtual Meeting', 'Coffee', 'Lunch Meeting', 'Office Stop By'] $function$$pf29$;
  end if;
end
$guard29$;
do $guard30$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_name' and p.pronargs=1) then
    execute $pf30$CREATE OR REPLACE FUNCTION private.crm_name(p uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select btrim(first_name || ' ' || last_name) || case when status = 'removed' then ' (removed)' else '' end from public.profiles where id = p $function$$pf30$;
  end if;
end
$guard30$;
do $guard31$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_next_due' and p.pronargs=3) then
    execute $pf31$CREATE OR REPLACE FUNCTION private.crm_next_due(p_due date, p_every text, p_anchor integer)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare m int; base date; a int := coalesce(p_anchor, extract(day from p_due)::int);
begin
  if p_every = 'daily' then return p_due + 1; elsif p_every = 'weekly' then return p_due + 7; end if;
  m := case p_every when 'monthly' then 1 when 'quarterly' then 3 when 'yearly' then 12 else null end; if m is null then return null; end if;
  base := (date_trunc('month', p_due) + make_interval(months => m))::date;
  return base + (least(a, extract(day from (base + interval '1 month' - interval '1 day'))::int) - 1); end $function$$pf31$;
  end if;
end
$guard31$;
do $guard32$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_no_delete' and p.pronargs=0) then
    execute $pf32$CREATE OR REPLACE FUNCTION private.crm_no_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin raise exception '% rows are never deleted; retire or hide them instead.', tg_table_name using errcode = 'P0001'; end $function$$pf32$;
  end if;
end
$guard32$;
do $guard33$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_option_active' and p.pronargs=2) then
    execute $pf33$CREATE OR REPLACE FUNCTION private.crm_option_active(k text, v text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select exists (select 1 from public.crm_picklist_options where list_key = k and value = v and not retired) $function$$pf33$;
  end if;
end
$guard33$;
do $guard34$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_option_label' and p.pronargs=2) then
    execute $pf34$CREATE OR REPLACE FUNCTION private.crm_option_label(k text, v text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((select label from public.crm_picklist_options where list_key = k and value = v), v) $function$$pf34$;
  end if;
end
$guard34$;
do $guard35$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_person_json' and p.pronargs=1) then
    execute $pf35$CREATE OR REPLACE FUNCTION private.crm_person_json(r jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select jsonb_build_object('roleInCompany', r->>'role_in_company', 'title', r->>'title', 'mobile', r->>'mobile', 'assistant', r->>'assistant', 'asstPhone', r->>'asst_phone',
    'agentSplit', (r->>'agent_split')::numeric, 'licenseNo', r->>'license_no', 'salesVolumeLastYear', (r->>'sales_volume_last_year')::numeric, 'dealsClosedLastYear', (r->>'deals_closed_last_year')::int,
    'zillowUrl', r->>'zillow_url', 'street', r->>'crm_street', 'city', r->>'crm_city', 'state', r->>'crm_state', 'zip', r->>'crm_zip', 'county', r->>'crm_county', 'links', r->'links') $function$$pf35$;
  end if;
end
$guard35$;
do $guard36$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_priorities' and p.pronargs=0) then
    execute $pf36$CREATE OR REPLACE FUNCTION private.crm_priorities()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ select array['Highest', 'High', 'Normal', 'Low', 'Lowest'] $function$$pf36$;
  end if;
end
$guard36$;
do $guard37$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_related_name' and p.pronargs=2) then
    execute $pf37$CREATE OR REPLACE FUNCTION private.crm_related_name(p_entity text, p_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case p_entity when 'lead' then (select btrim(first_name || ' ' || last_name) from public.crm_leads where id = p_id)
    when 'contact' then (select btrim(first_name || ' ' || last_name) from public.contacts where id = p_id)
    when 'account' then (select name from public.crm_accounts where id = p_id) when 'opportunity' then (select name from public.crm_opportunities where id = p_id) end $function$$pf37$;
  end if;
end
$guard37$;
do $guard38$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_required' and p.pronargs=1) then
    execute $pf38$CREATE OR REPLACE FUNCTION private.crm_required(k text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((select required from public.crm_field_settings where scope = 'person' and key = k), k in ('roleInCompany', 'relationshipStatus', 'state')) $function$$pf38$;
  end if;
end
$guard38$;
do $guard39$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_roles' and p.pronargs=0) then
    execute $pf39$CREATE OR REPLACE FUNCTION private.crm_roles()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select array['Realtor', 'Real Estate Broker', 'Transaction Coordinator', 'Loan Officer', 'Mortgage Broker', 'Team Lead'] $function$$pf39$;
  end if;
end
$guard39$;
do $guard40$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_sales_profile' and p.pronargs=1) then
    execute $pf40$CREATE OR REPLACE FUNCTION private.crm_sales_profile(p uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select exists (select 1 from public.profiles where id = p and role in ('Sales Person', 'Sales Team')) $function$$pf40$;
  end if;
end
$guard40$;
do $guard41$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_share_ok' and p.pronargs=1) then
    execute $pf41$CREATE OR REPLACE FUNCTION private.crm_share_ok(p jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select p is not null and jsonb_typeof(p) = 'object'
    and coalesce(jsonb_typeof(p -> 'users'), 'array') = 'array' and coalesce(jsonb_typeof(p -> 'roles'), 'array') = 'array' and coalesce(jsonb_typeof(p -> 'departments'), 'array') = 'array'
    and not exists (select 1 from jsonb_array_elements_text(coalesce(p -> 'roles', '[]')) r where r not in ('Sales Person', 'Sales Team', 'Processor', 'Admin'))
    and not exists (select 1 from jsonb_array_elements_text(coalesce(p -> 'departments', '[]')) d where d not in ('sales', 'operations', 'management'))
    and not exists (select 1 from jsonb_array_elements_text(coalesce(p -> 'users', '[]')) u where u !~ '^[0-9a-f-]{36}$') $function$$pf41$;
  end if;
end
$guard41$;
do $guard42$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_source_from_old' and p.pronargs=1) then
    execute $pf42$CREATE OR REPLACE FUNCTION private.crm_source_from_old(s text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case s when 'Referral' then 'Existing Client or Agent' when 'Website' then 'Search Engine' when 'Open house' then 'Call in/Walk in' when 'Event' then 'Business Group'
    when 'Cold call' then 'Warm Call' when 'Past client' then 'Existing Client or Agent' when 'Social media' then 'Social Media' when 'Other' then '' else coalesce(s, '') end $function$$pf42$;
  end if;
end
$guard42$;
do $guard43$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_sources' and p.pronargs=0) then
    execute $pf43$CREATE OR REPLACE FUNCTION private.crm_sources()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select array['Business Group', 'Call in/Walk in', 'Direct Mail', 'Door Knocking', 'Email Campaign', 'Existing Client or Agent', 'Facebook/IG Ads', 'Facebook Group',
    'FB/IG Organic', 'Google Ads', 'Other Agent (Our Team)', 'Partnering w/ Other Agents', 'Personal Network', 'Re-assigned', 'Search Engine', 'Social Media', 'Warm Call'] $function$$pf43$;
  end if;
end
$guard43$;
do $guard44$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_status_from_old' and p.pronargs=1) then
    execute $pf44$CREATE OR REPLACE FUNCTION private.crm_status_from_old(s text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case s when 'New' then 'Potential/Warm' when 'Contacted' then 'Prospecting' when 'Qualified' then 'Prospecting' when 'Unqualified' then 'Not Interested' else s end $function$$pf44$;
  end if;
end
$guard44$;
do $guard45$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_statuses' and p.pronargs=0) then
    execute $pf45$CREATE OR REPLACE FUNCTION private.crm_statuses()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select array['Potential/Warm', 'Prospecting', 'Not Interested', 'Unresponsive', 'Converted/Current Client', 'Churn'] $function$$pf45$;
  end if;
end
$guard45$;
do $guard46$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_task_anchor' and p.pronargs=0) then
    execute $pf46$CREATE OR REPLACE FUNCTION private.crm_task_anchor()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if new.kind <> 'task' or coalesce(current_setting('crm.spawn', true), '') = '1' then return new; end if;
  if new.repeat_every = '' or new.due_date is null then new.repeat_anchor_day := null;
  elsif tg_op = 'INSERT' or new.repeat_anchor_day is null or new.due_date is distinct from old.due_date or new.repeat_every is distinct from old.repeat_every then
    new.repeat_anchor_day := extract(day from new.due_date)::int; end if;
  return new; end $function$$pf46$;
  end if;
end
$guard46$;
do $guard47$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_task_statuses' and p.pronargs=0) then
    execute $pf47$CREATE OR REPLACE FUNCTION private.crm_task_statuses()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select array['Not Started', 'Deferred', 'In Progress', 'Completed', 'Waiting for input'] $function$$pf47$;
  end if;
end
$guard47$;
do $guard48$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_today' and p.pronargs=0) then
    execute $pf48$CREATE OR REPLACE FUNCTION private.crm_today()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ select (now() at time zone 'America/New_York')::date $function$$pf48$;
  end if;
end
$guard48$;
do $guard49$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_url_ok' and p.pronargs=1) then
    execute $pf49$CREATE OR REPLACE FUNCTION private.crm_url_ok(u text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select u = '' or (char_length(u) <= 500 and u ~* '^https?://[^\s/:@]+\.[^\s/:@]+(:[0-9]+)?(/\S*)?$') $function$$pf49$;
  end if;
end
$guard49$;
do $guard50$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_usage' and p.pronargs=3) then
    execute $pf50$CREATE OR REPLACE FUNCTION private.crm_usage(k text, p_col text, p_table text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare r jsonb;
begin execute format('select coalesce(jsonb_object_agg(v, n), %L) from (select %I v, count(*) n from public.%I where coalesce(%I, %L) <> %L group by 1) x', '{}', p_col, p_table, p_col, '', '') into r; return r; end $function$$pf50$;
  end if;
end
$guard50$;
do $guard51$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_usage_sum' and p.pronargs=2) then
    execute $pf51$CREATE OR REPLACE FUNCTION private.crm_usage_sum(a jsonb, b jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(jsonb_object_agg(k, coalesce((a->>k)::int, 0) + coalesce((b->>k)::int, 0)), '{}') from (select jsonb_object_keys(a) k union select jsonb_object_keys(b)) x $function$$pf51$;
  end if;
end
$guard51$;
do $guard52$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_view_share_ok' and p.pronargs=0) then
    execute $pf52$CREATE OR REPLACE FUNCTION private.crm_view_share_ok()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if not exists (select 1 from public.profiles p where p.id = new.user_id and p.status = 'active' and p.role in ('Super admin', 'Admin', 'Processor', 'Sales Person', 'Sales Team')) then
    raise exception 'Share with active CLA users only.' using errcode = '23514'; end if;
  return new; end $function$$pf52$;
  end if;
end
$guard52$;
do $guard53$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='deal_occ_refi' and p.pronargs=0) then
    execute $pf53$CREATE OR REPLACE FUNCTION private.deal_occ_refi()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin if new.transaction_type = 'Refinance' then new.primary_residence := ''; new.first_time_buyer := ''; end if; return new; end $function$$pf53$;
  end if;
end
$guard53$;
do $guard54$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='deal_place_order_guard' and p.pronargs=0) then
    execute $pf54$CREATE OR REPLACE FUNCTION private.deal_place_order_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if tg_op = 'INSERT' or new.open_date is distinct from old.open_date then
    if new.open_date is null then new.open_date := (now() at time zone 'America/New_York')::date; end if;
    if new.open_date > (now() at time zone 'America/New_York')::date then raise exception 'Open date cannot be in the future.' using errcode = 'P0001'; end if;
  end if;
  return new; end $function$$pf54$;
  end if;
end
$guard54$;
do $guard55$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='deal_preprocessor_guard' and p.pronargs=0) then
    execute $pf55$CREATE OR REPLACE FUNCTION private.deal_preprocessor_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if new.preprocessor_user_id is not null and not exists (select 1 from public.profiles p where p.id = new.preprocessor_user_id and p.role = 'Preprocessor' and p.status = 'active') then
    raise exception 'The Preprocessor on an order must be an active Preprocessor.' using errcode = 'P0001'; end if;
  return new; end $function$$pf55$;
  end if;
end
$guard55$;
do $guard56$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='deal_profiles' and p.pronargs=1) then
    execute $pf56$CREATE OR REPLACE FUNCTION private.deal_profiles(d uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select array(select c.profile_id from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = d and c.profile_id is not null
               union select processor_id from public.deals where id = d and processor_id is not null) $function$$pf56$;
  end if;
end
$guard56$;
do $guard57$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='demo_portal_role' and p.pronargs=1) then
    execute $pf57$CREATE OR REPLACE FUNCTION private.demo_portal_role(p_profile uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(
    (select dp.role from public.deal_participants dp
       join public.contacts c on c.id = dp.contact_id
       join public.deals d on d.id = dp.deal_id and d.is_demo
      where c.profile_id = p_profile
      order by case dp.role
        when 'Buyer Agent' then 1 when 'Listing Agent' then 2
        when 'Client-Buyer' then 3 when 'Client-Seller' then 4 else 9 end
      limit 1),
    (select role from public.profiles where id = p_profile))
$function$$pf57$;
  end if;
end
$guard57$;
do $guard58$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='doc_types' and p.pronargs=1) then
    execute $pf58$CREATE OR REPLACE FUNCTION private.doc_types(p_side text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case p_side
    when 'seller' then array['Payoff statement', 'HOA documents', 'Deed', 'Survey', 'Tax bill', 'Power of attorney', 'Death certificate / estate documents', 'Mortgage statement', 'W-9 / 1099-S information', 'Utility bills',
      'Operating agreement / amendments', 'Certificate of good standing', 'Articles of organization', 'Other']
    when 'buyer' then array['Contract / addendum', 'Photo ID', 'Lender documents', 'Homeowners insurance', 'Earnest money receipt', 'Settlement statement',
      'Operating agreement / amendments', 'Certificate of good standing', 'Articles of organization', 'Other']
    else array['Contract / addendum', 'Photo ID', 'Lender documents', 'Homeowners insurance', 'Earnest money receipt', 'Settlement statement', 'Other',
      'Payoff statement', 'HOA documents', 'Deed', 'Survey', 'Tax bill', 'Power of attorney', 'Death certificate / estate documents', 'Mortgage statement', 'W-9 / 1099-S information', 'Utility bills',
      'Operating agreement / amendments', 'Certificate of good standing', 'Articles of organization'] end $function$$pf58$;
  end if;
end
$guard58$;
do $guard59$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='documents_are_permanent' and p.pronargs=0) then
    execute $pf59$CREATE OR REPLACE FUNCTION private.documents_are_permanent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin raise exception 'Documents cannot be deleted' using errcode = 'P0001'; end $function$$pf59$;
  end if;
end
$guard59$;
do $guard60$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='documents_folder_check' and p.pronargs=0) then
    execute $pf60$CREATE OR REPLACE FUNCTION private.documents_folder_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare f public.folders;
begin
  if new.folder_id is null then return new; end if;
  select * into f from public.folders where id = new.folder_id;
  if f.scope = 'deal' and f.deal_id is distinct from new.deal_id then raise exception 'That folder is not part of this order'; end if;
  if f.scope = 'library' and new.deal_id is not null then raise exception 'Order documents cannot go into a Library folder'; end if;
  return new; end $function$$pf60$;
  end if;
end
$guard60$;
do $guard61$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='documents_immutable' and p.pronargs=0) then
    execute $pf61$CREATE OR REPLACE FUNCTION private.documents_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if new.deal_id is distinct from old.deal_id or new.name <> old.name or new.storage_path is distinct from old.storage_path or new.uploaded_by <> old.uploaded_by or new.size_bytes <> old.size_bytes then
    raise exception 'Only description, visibility and folder of a document can change'; end if;
  return new; end $function$$pf61$;
  end if;
end
$guard61$;
do $guard62$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='effective_uid' and p.pronargs=0) then
    execute $pf62$CREATE OR REPLACE FUNCTION private.effective_uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $cap$
  select coalesce(
    (select s.target_id
       from private.view_as_sessions s
       join public.profiles a on a.id = s.actor_id
      where s.actor_id = auth.uid()
        and a.role = 'Super admin' and a.is_admin and a.status = 'active'
        and s.stopped_at is null
        and s.expires_at > pg_catalog.now()),
    auth.uid())
$cap$$pf62$;
  end if;
end
$guard62$;
do $guard63$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='email_sender_no_delete' and p.pronargs=0) then
    execute $pf63$CREATE OR REPLACE FUNCTION private.email_sender_no_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin raise exception 'Email sender settings are edited, never deleted.' using errcode = 'P0001'; end $function$$pf63$;
  end if;
end
$guard63$;
do $guard64$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='emd_receipt_title' and p.pronargs=1) then
    execute $pf64$CREATE OR REPLACE FUNCTION private.emd_receipt_title(t text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ select coalesce(t, '') ~* 'earnest money deposit receipt' $function$$pf64$;
  end if;
end
$guard64$;
do $guard65$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='ensure_demo_personas' and p.pronargs=0) then
    execute $pf65$CREATE OR REPLACE FUNCTION private.ensure_demo_personas()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
insert into public.profiles (id, email, first_name, last_name, phone, role, is_admin, is_demo) values
  ('00000000-0000-4000-8d00-000000000001', 'demo.processor@example.test', 'Pat', 'Demo', '301-555-0191', 'Processor', false, true),
  ('00000000-0000-4000-8d00-000000000002', 'demo.preprocessor@example.test', 'Riley', 'Demo', '301-555-0192', 'Preprocessor', false, true),
  ('00000000-0000-4000-8d00-000000000003', 'demo.salesperson@example.test', 'Sam', 'Demo', '301-555-0193', 'Sales Person', false, true),
  ('00000000-0000-4000-8d00-000000000004', 'demo.salesteam@example.test', 'Sloan', 'Demo', '301-555-0194', 'Sales Team', false, true),
  ('00000000-0000-4000-8d00-000000000005', 'demo.tc@example.test', 'Taylor', 'Demo', '301-555-0195', 'Transaction Coordinator', false, true),
  ('00000000-0000-4000-8d00-000000000006', 'demo.buyeragent@example.test', 'Blair', 'Demo', '301-555-0196', 'Outside user', false, true),
  ('00000000-0000-4000-8d00-000000000007', 'demo.listingagent@example.test', 'Logan', 'Demo', '301-555-0197', 'Outside user', false, true),
  ('00000000-0000-4000-8d00-000000000008', 'demo.buyer@example.test', 'Casey', 'Buyer', '301-555-0198', 'Outside user', false, true),
  ('00000000-0000-4000-8d00-000000000009', 'demo.seller@example.test', 'Casey', 'Seller', '301-555-0199', 'Outside user', false, true),
  ('00000000-0000-4000-8d00-00000000000a', 'demo.employee@example.test', 'Erin', 'Demo', '301-555-0190', 'Employee', false, true)
on conflict (id) do update set is_demo = true, role = excluded.role, is_admin = false, status = 'active';

insert into public.contacts (id, profile_id, first_name, last_name, email, phone, is_demo, created_by) values
  ('00000000-0000-4000-8d00-000000000016', '00000000-0000-4000-8d00-000000000006', 'Blair', 'Demo', 'demo.buyeragent@example.test', '301-555-0196', true, '00000000-0000-4000-8d00-000000000001'),
  ('00000000-0000-4000-8d00-000000000017', '00000000-0000-4000-8d00-000000000007', 'Logan', 'Demo', 'demo.listingagent@example.test', '301-555-0197', true, '00000000-0000-4000-8d00-000000000001'),
  ('00000000-0000-4000-8d00-000000000018', '00000000-0000-4000-8d00-000000000008', 'Casey', 'Buyer', 'demo.buyer@example.test', '301-555-0198', true, '00000000-0000-4000-8d00-000000000001'),
  ('00000000-0000-4000-8d00-000000000019', '00000000-0000-4000-8d00-000000000009', 'Casey', 'Seller', 'demo.seller@example.test', '301-555-0199', true, '00000000-0000-4000-8d00-000000000001')
on conflict (id) do update set is_demo = true, profile_id = excluded.profile_id;

insert into public.deals (id, file_number, street, city, state, zip, stage, status, closing_date, purchase_price, processor_id, preprocessor_user_id, sales_person_id, created_by, is_demo)
values ('00000000-0000-4000-8d00-0000000000d1', 'DEMO-100', '100 Demo Lane', 'Rockville', 'MD', '20850', 1, 'Open', current_date + 21, 450000,
  '00000000-0000-4000-8d00-000000000001', '00000000-0000-4000-8d00-000000000002', '00000000-0000-4000-8d00-000000000003', '00000000-0000-4000-8d00-000000000001', true)
on conflict (id) do update set is_demo = true, preprocessor_user_id = excluded.preprocessor_user_id;

insert into public.deal_participants (id, deal_id, contact_id, role) values
  ('00000000-0000-4000-8d00-000000000026', '00000000-0000-4000-8d00-0000000000d1', '00000000-0000-4000-8d00-000000000016', 'Buyer Agent'),
  ('00000000-0000-4000-8d00-000000000027', '00000000-0000-4000-8d00-0000000000d1', '00000000-0000-4000-8d00-000000000017', 'Listing Agent'),
  ('00000000-0000-4000-8d00-000000000028', '00000000-0000-4000-8d00-0000000000d1', '00000000-0000-4000-8d00-000000000018', 'Client-Buyer'),
  ('00000000-0000-4000-8d00-000000000029', '00000000-0000-4000-8d00-0000000000d1', '00000000-0000-4000-8d00-000000000019', 'Client-Seller')
on conflict (id) do nothing;

insert into public.deal_sales_people (deal_id, sales_id, added_by) values
  ('00000000-0000-4000-8d00-0000000000d1', '00000000-0000-4000-8d00-000000000003', '00000000-0000-4000-8d00-000000000001'),
  ('00000000-0000-4000-8d00-0000000000d1', '00000000-0000-4000-8d00-000000000004', '00000000-0000-4000-8d00-000000000001')
on conflict (deal_id, sales_id) do nothing;

insert into public.teams (id, name, created_by) values
  ('00000000-0000-4000-8d00-0000000000a1', 'Demo team', '00000000-0000-4000-8d00-000000000001')
on conflict (id) do nothing;
insert into public.team_members (team_id, profile_id, member_role, added_by) values
  ('00000000-0000-4000-8d00-0000000000a1', '00000000-0000-4000-8d00-000000000005', 'coordinator', '00000000-0000-4000-8d00-000000000001'),
  ('00000000-0000-4000-8d00-0000000000a1', '00000000-0000-4000-8d00-000000000006', 'agent', '00000000-0000-4000-8d00-000000000001'),
  ('00000000-0000-4000-8d00-0000000000a1', '00000000-0000-4000-8d00-000000000007', 'agent', '00000000-0000-4000-8d00-000000000001')
on conflict (team_id, profile_id) do nothing;

insert into public.documents (id, deal_id, name, description, visibility, uploaded_by)
values ('00000000-0000-4000-8d00-0000000000e1', '00000000-0000-4000-8d00-0000000000d1', 'Demo commitment.pdf', 'Fake demo file only.', 'all', '00000000-0000-4000-8d00-000000000001')
on conflict (id) do nothing;
end $function$$pf65$;
  end if;
end
$guard65$;
do $guard66$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='entity_attorney_authorized' and p.pronargs=1) then
    execute $pf66$CREATE OR REPLACE FUNCTION private.entity_attorney_authorized(p_profile uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select exists (select 1 from public.entity_review_attorneys a join public.profiles p on p.id = a.profile_id
    where a.profile_id = p_profile and a.active and a.retired_at is null and p.status = 'active' and a.assignment_role in ('attorney', 'backup')) $function$$pf66$;
  end if;
end
$guard66$;
do $guard67$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='entity_doc_list' and p.pronargs=0) then
    execute $pf67$CREATE OR REPLACE FUNCTION private.entity_doc_list()
 RETURNS TABLE(key text, label text, optional boolean, pos integer)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  values ('entity_doc_operating', 'Operating Agreement', false, 1), ('entity_doc_amendments', 'Amendments to the Operating Agreement (if any)', true, 2),
         ('entity_doc_good_standing', 'Certificate of Good Standing', false, 3), ('entity_doc_articles', 'Articles of Organization', false, 4) $function$$pf67$;
  end if;
end
$guard67$;
do $guard68$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='entity_prefill' and p.pronargs=1) then
    execute $pf68$CREATE OR REPLACE FUNCTION private.entity_prefill(e participant_entities)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  update public.tasks t set form_data = jsonb_strip_nulls(jsonb_build_object('is_entity', true, 'entity_name', e.name,
      'entity_type', nullif(e.entity_type, ''), 'entity_rep_name', nullif(e.rep_name, ''), 'entity_rep_title', nullif(e.rep_title, ''),
      'entity_rep_phone', nullif(e.rep_phone, ''), 'entity_rep_email', nullif(e.rep_email, '')))
    from public.task_templates tp
    where t.participant_id = e.participant_id and tp.id = t.template_id and tp.fields @> '[{"k":"is_entity"}]' and t.kind = 'form' and t.status = 'todo'
      and t.saved_at is null and t.saved_by is null and t.form_data = '{}'::jsonb $function$$pf68$;
  end if;
end
$guard68$;
do $guard69$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='expire_demo_view' and p.pronargs=1) then
    execute $pf69$CREATE OR REPLACE FUNCTION private.expire_demo_view(p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare tid uuid;
begin
  select s.target_id into tid from private.view_as_sessions s
    where s.actor_id = p_actor and s.stopped_at is null and s.expires_at <= pg_catalog.now();
  if tid is null then return; end if;
  update private.view_as_sessions set stopped_at = pg_catalog.now() where actor_id = p_actor and stopped_at is null;
  insert into private.view_as_audit (actor_id, target_id, action) values (p_actor, tid, 'timeout');
end $function$$pf69$;
  end if;
end
$guard69$;
do $guard70$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='fields_for_role' and p.pronargs=2) then
    execute $pf70$CREATE OR REPLACE FUNCTION private.fields_for_role(p_fields jsonb, p_role text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(jsonb_agg(f order by n), '[]'::jsonb) from jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) with ordinality as x(f, n)
  where not (f ? 'roles') or (f->'roles') ? p_role $function$$pf70$;
  end if;
end
$guard70$;
do $guard71$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='file_role_of' and p.pronargs=2) then
    execute $pf71$CREATE OR REPLACE FUNCTION private.file_role_of(pid uuid, d uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case when pr.role is distinct from 'Outside user' then pr.role
    else coalesce((select p.role from public.deal_participants p join public.contacts c on c.id = p.contact_id
                   where p.deal_id = d and c.profile_id = pid and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
                   order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], p.role) limit 1), 'Outside user') end
  from (select (select role from public.profiles where id = pid) as role) pr $function$$pf71$;
  end if;
end
$guard71$;
do $guard72$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='fmt_phone' and p.pronargs=1) then
    execute $pf72$CREATE OR REPLACE FUNCTION private.fmt_phone(v text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare d text := regexp_replace(coalesce(v, ''), '\D', '', 'g');
begin
  if btrim(coalesce(v, '')) = '' then return ''; end if;
  if length(d) = 11 and left(d, 1) = '1' then d := substr(d, 2); end if;
  if length(d) <> 10 then return null; end if;   -- not a phone number
  return substr(d, 1, 3) || '-' || substr(d, 4, 3) || '-' || substr(d, 7, 4); end $function$$pf72$;
  end if;
end
$guard72$;
do $guard73$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='fwp_no_delete' and p.pronargs=0) then
    execute $pf73$CREATE OR REPLACE FUNCTION private.fwp_no_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$begin raise exception 'Workflow records are never hard deleted.' using errcode='42501';end $function$$pf73$;
  end if;
end
$guard73$;
do $guard74$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='hr_assignment_guard' and p.pronargs=0) then
    execute $pf74$CREATE OR REPLACE FUNCTION private.hr_assignment_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if new.id <> old.id or new.employee_id <> old.employee_id or new.role <> old.role or new.assigned_at <> old.assigned_at or new.assigned_by is distinct from old.assigned_by
    or (old.removed_at is not null) then raise exception 'An HR manager assignment is never rewritten; remove it and assign again.' using errcode = '42501'; end if;
  return new; end $function$$pf74$;
  end if;
end
$guard74$;
do $guard75$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='hr_check_keys' and p.pronargs=2) then
    execute $pf75$CREATE OR REPLACE FUNCTION private.hr_check_keys(p jsonb, self_only boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare k text; allowed text[] := array['phone', 'addressLine1', 'addressLine2', 'city', 'stateProvince', 'postalCode', 'addressCountry', 'emergencyName', 'emergencyRelationship', 'emergencyPhone'];
begin
  if not self_only then allowed := allowed || array['employeeCode', 'firstName', 'lastName', 'email', 'departmentId', 'designationId', 'jobTitle', 'reportingToId', 'dateOfJoining', 'workLocation',
    'employmentType', 'employmentStatus', 'country', 'workPhone', 'payType', 'payRate', 'payCurrency', 'commissioned', 'commissionNotes']; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Nothing to save.' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p) loop
    if k ~* '(ssn|social.?security|passport|tax.?id|tin$|sss|philhealth|pag.?ibig|umid|government|national.?id|driver)' then raise exception 'Government ID numbers (SSN and the like) are never stored in HR.' using errcode = '22023'; end if;
    if not (k = any (allowed)) then raise exception 'Unknown or not allowed field: %', k using errcode = '22023'; end if;
  end loop;
end $function$$pf75$;
  end if;
end
$guard75$;
do $guard76$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='hr_history_frozen' and p.pronargs=0) then
    execute $pf76$CREATE OR REPLACE FUNCTION private.hr_history_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin raise exception 'The HR change history is never changed or deleted.' using errcode = '42501'; end $function$$pf76$;
  end if;
end
$guard76$;
do $guard77$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='hr_no_delete' and p.pronargs=0) then
    execute $pf77$CREATE OR REPLACE FUNCTION private.hr_no_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin raise exception 'HR records are never deleted. Archive instead.' using errcode = '42501'; end $function$$pf77$;
  end if;
end
$guard77$;
do $guard78$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='hr_self_columns' and p.pronargs=0) then
    execute $pf78$CREATE OR REPLACE FUNCTION private.hr_self_columns()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select array['phone', 'address_line1', 'address_line2', 'city', 'state_province', 'postal_code', 'address_country', 'emergency_name', 'emergency_relationship', 'emergency_phone'] $function$$pf78$;
  end if;
end
$guard78$;
do $guard79$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='hr_show' and p.pronargs=2) then
    execute $pf79$CREATE OR REPLACE FUNCTION private.hr_show(k text, v text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(case when v is null then ''
    when k = 'department_id' then (select name from public.hr_departments where id = v::uuid)
    when k = 'designation_id' then (select name from public.hr_designations where id = v::uuid)
    when k = 'reporting_to' then (select btrim(first_name || ' ' || last_name) from public.hr_employees where id = v::uuid)
    when k = 'profile_id' then (select btrim(first_name || ' ' || last_name) || ' (' || email || ')' from public.profiles where id = v::uuid)
    else v end, v, '') $function$$pf79$;
  end if;
end
$guard79$;
do $guard80$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='hr_txt' and p.pronargs=3) then
    execute $pf80$CREATE OR REPLACE FUNCTION private.hr_txt(p jsonb, k text, cur text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case when p ? k then btrim(coalesce(p ->> k, '')) else cur end $function$$pf80$;
  end if;
end
$guard80$;
do $guard81$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_viewing_as' and p.pronargs=0) then
    execute $pf81$CREATE OR REPLACE FUNCTION private.is_viewing_as()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select exists (
    select 1 from private.view_as_sessions s
    where s.actor_id = auth.uid() and s.stopped_at is null and s.expires_at > pg_catalog.now())
$function$$pf81$;
  end if;
end
$guard81$;
do $guard82$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='masked_keys' and p.pronargs=1) then
    execute $pf82$CREATE OR REPLACE FUNCTION private.masked_keys(p_template uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(array_agg(f->>'k'), '{}') from public.task_templates t, jsonb_array_elements(t.fields) f where t.id = p_template and coalesce((f->>'mask')::boolean, false) $function$$pf82$;
  end if;
end
$guard82$;
do $guard83$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='message_html_safe' and p.pronargs=1) then
    execute $pf83$CREATE OR REPLACE FUNCTION private.message_html_safe(h text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select h = '' or (h !~* '<\s*/?\s*(script|style|iframe|object|embed|svg|img|form|input|span|font|table)\b' and h !~* '\son[a-z]+\s*=' and h !~* 'javascript:' and h !~* 'style\s*=') $function$$pf83$;
  end if;
end
$guard83$;
do $guard84$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='month_day_ok' and p.pronargs=2) then
    execute $pf84$CREATE OR REPLACE FUNCTION private.month_day_ok(m integer, d integer)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((m is null and d is null) or (m between 1 and 12 and d >= 1 and d <= extract(day from (make_date(2000, m, 1) + interval '1 month - 1 day'))::int), false) $function$$pf84$;
  end if;
end
$guard84$;
do $guard85$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='new_token' and p.pronargs=0) then
    execute $pf85$CREATE OR REPLACE FUNCTION private.new_token()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') $function$$pf85$;
  end if;
end
$guard85$;
do $guard86$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='no_ssn' and p.pronargs=1) then
    execute $pf86$CREATE OR REPLACE FUNCTION private.no_ssn(t text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select t is null or t !~ '(^|[^0-9])[0-9]{3}[- ]?[0-9]{2}[- ]?[0-9]{4}([^0-9]|$)' $function$$pf86$;
  end if;
end
$guard86$;
do $guard87$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='norm_county' and p.pronargs=1) then
    execute $pf87$CREATE OR REPLACE FUNCTION private.norm_county(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select btrim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[''’.]', '', 'g'), '\s+county$', ''), '[^a-z0-9]+', ' ', 'g')) $function$$pf87$;
  end if;
end
$guard87$;
do $guard88$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='nov5_no_delete' and p.pronargs=0) then
    execute $pf88$CREATE OR REPLACE FUNCTION private.nov5_no_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin raise exception 'This row is retired, never deleted.' using errcode = 'P0001'; end $function$$pf88$;
  end if;
end
$guard88$;
do $guard89$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='office_address' and p.pronargs=1) then
    execute $pf89$CREATE OR REPLACE FUNCTION private.office_address(o offices)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select concat_ws(', ', nullif(o.address_line1, ''), nullif(o.address_line2, ''), nullif(o.city, ''), btrim(o.state || ' ' || o.zip)) $function$$pf89$;
  end if;
end
$guard89$;
do $guard90$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='office_today' and p.pronargs=0) then
    execute $pf90$CREATE OR REPLACE FUNCTION private.office_today()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ select (now() at time zone 'America/New_York')::date $function$$pf90$;
  end if;
end
$guard90$;
do $guard91$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='order_phase' and p.pronargs=2) then
    execute $pf91$CREATE OR REPLACE FUNCTION private.order_phase(p_stage integer, p_status text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case when p_status = 'Closed' then 3 when p_stage >= 9 then 3 when p_stage >= 7 then 2 when p_stage >= 3 then 1 else 0 end $function$$pf91$;
  end if;
end
$guard91$;
do $guard92$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='outbox_sender' and p.pronargs=0) then
    execute $pf92$CREATE OR REPLACE FUNCTION private.outbox_sender()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare s public.email_sender_settings; p public.profiles;
begin
  if new.sender_type = 'processor' then
    select pr.* into p from public.deals d join public.profiles pr on pr.id = d.processor_id where d.id = new.deal_id and pr.email is not null;
    if found then new.from_email := p.email; new.from_name := trim(p.first_name || ' ' || p.last_name); new.sender_profile_id := p.id;
    else select * into s from public.email_sender_settings where sender_type = 'portal';
      new.sender_type := 'portal'; new.from_email := s.email; new.from_name := s.display_name; new.sender_fallback := true; new.sender_fallback_reason := 'No processor is assigned to this file.'; end if;
  elsif new.sender_type in ('hr', 'portal') then select * into s from public.email_sender_settings where sender_type = new.sender_type;
    new.from_email := s.email; new.from_name := s.display_name;
  end if;
  return new;
end $function$$pf92$;
  end if;
end
$guard92$;
do $guard93$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='participant_role_lock' and p.pronargs=0) then
    execute $pf93$CREATE OR REPLACE FUNCTION private.participant_role_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin perform pg_advisory_xact_lock(hashtext(new.deal_id::text || new.contact_id::text)); return new; end $function$$pf93$;
  end if;
end
$guard93$;
do $guard94$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='person_name' and p.pronargs=1) then
    execute $pf94$CREATE OR REPLACE FUNCTION private.person_name(pid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((select trim(first_name || ' ' || last_name) from public.profiles where id = pid), 'Unknown') $function$$pf94$;
  end if;
end
$guard94$;
do $guard95$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='portal_feedback_freeze' and p.pronargs=0) then
    execute $pf95$CREATE OR REPLACE FUNCTION private.portal_feedback_freeze()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin raise exception 'Feedback is kept. It is not edited or deleted.' using errcode = '42501'; end $function$$pf95$;
  end if;
end
$guard95$;
do $guard96$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='profile_sales_links_guard' and p.pronargs=0) then
    execute $pf96$CREATE OR REPLACE FUNCTION private.profile_sales_links_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if new.status = 'removed' then
    if old.status <> 'removed' then delete from public.client_sales_reps where client_id = new.id or sales_id = new.id; end if;
    return new; end if;
  if new.role <> old.role then
    if new.role <> 'Outside user' and exists (select 1 from public.client_sales_reps where client_id = new.id) then
      raise exception 'This client is linked to salespeople. Remove those links before changing the account type.' using errcode = 'P0001'; end if;
    if new.role not in ('Sales Person', 'Sales Team') and exists (select 1 from public.client_sales_reps where sales_id = new.id) then
      raise exception 'This salesperson is linked to clients. Remove those links before changing the role.' using errcode = 'P0001'; end if;
  end if;
  return new; end $function$$pf96$;
  end if;
end
$guard96$;
do $guard97$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='profile_staff_clears_contact_type' and p.pronargs=0) then
    execute $pf97$CREATE OR REPLACE FUNCTION private.profile_staff_clears_contact_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if new.role <> 'Outside user' and new.role is distinct from old.role then update public.contacts set contact_type = null where profile_id = new.id and contact_type is not null; end if;
  return new; end $function$$pf97$;
  end if;
end
$guard97$;
do $guard98$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='refi_blocked_role' and p.pronargs=1) then
    execute $pf98$CREATE OR REPLACE FUNCTION private.refi_blocked_role(r text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select r in ('Client-Seller', 'Buyer Agent', 'Listing Agent', 'Transaction Coordinator') $function$$pf98$;
  end if;
end
$guard98$;
do $guard99$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='reharden_api_surface' and p.pronargs=0) then
    execute $pf99$CREATE OR REPLACE FUNCTION private.reharden_api_surface()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $functionx$
declare r record; def text; args text; ret text; vol text; body text; callargs text; i int;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Rehardening is operator-only.' using errcode = '42501'; end if;
  revoke create on schema public from public, anon, authenticated;
  -- Anon needs to resolve the private token bodies called by the public invoker wrappers.
  -- Usage is not execute. Execute for anon is granted only on those four bodies below.
  grant usage on schema private to anon;
  for r in
    select p.oid, p.proname, p.proargnames, p.proargmodes, p.prosecdef, p.provolatile, p.proisstrict, p.proretset,
           pg_catalog.pg_get_function_identity_arguments(p.oid) as ident,
           pg_catalog.pg_get_function_arguments(p.oid) as args,
           pg_catalog.pg_get_function_result(p.oid) as result
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
      and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    def := pg_catalog.pg_get_functiondef(r.oid);
    def := pg_catalog.regexp_replace(def, 'FUNCTION public\.', 'FUNCTION private.rpc_');
    if def ~* 'search_path' then
      def := pg_catalog.regexp_replace(def, 'SET search_path TO [^\n]+', 'SET search_path TO pg_catalog, public, extensions', 'g');
    else
      def := pg_catalog.regexp_replace(def, 'AS \$function\$', E'SET search_path TO pg_catalog, public, extensions\nAS $function$');
    end if;
    execute def;
    callargs := '';
    if r.proargnames is not null then
      for i in 1..pg_catalog.array_length(r.proargnames, 1) loop
        if r.proargnames[i] is not null and (r.proargmodes is null or r.proargmodes[i] in ('i', 'b', 'v')) then
          callargs := callargs || case when callargs = '' then '' else ', ' end || pg_catalog.quote_ident(r.proargnames[i]);
        end if;
      end loop;
    end if;
    vol := case r.provolatile when 'i' then 'IMMUTABLE' when 's' then 'STABLE' else 'VOLATILE' end;
    if r.result = 'void' then
      body := format('BEGIN PERFORM private.rpc_%s(%s); END;', r.proname, callargs);
    elsif r.proretset then
      body := format('BEGIN RETURN QUERY SELECT * FROM private.rpc_%s(%s); END;', r.proname, callargs);
    else
      body := format('BEGIN RETURN private.rpc_%s(%s); END;', r.proname, callargs);
    end if;
    execute format(
      'CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s %s SECURITY INVOKER SET search_path = pg_catalog AS $rpcwrap$ %s $rpcwrap$',
      r.proname, r.args, r.result, vol, case when r.proisstrict then 'STRICT' else '' end, body);
  end loop;

  -- Reset execution grants. No GRANT ALL. Bootstrap stays operator-only.
  for r in
    select p.oid::pg_catalog.regprocedure as sig, n.nspname, p.proname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f'
      and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    if r.nspname = 'private' and r.proname = 'bootstrap_first_admin' then
      execute format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    elsif r.proname in ('scheduling_get', 'scheduling_respond', 'agent_invite_lookup', 'hr_invite_lookup')
          or r.proname in ('rpc_scheduling_get', 'rpc_scheduling_respond', 'rpc_agent_invite_lookup', 'rpc_hr_invite_lookup') then
      execute format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', r.sig);
    else
      execute format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    end if;
  end loop;
end $functionx$$pf99$;
  end if;
end
$guard99$;
do $guard100$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='resolve_cpl_price' and p.pronargs=2) then
    execute $pf100$CREATE OR REPLACE FUNCTION private.resolve_cpl_price(p_state text, p_underwriter text)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select amount from public.cpl_prices where retired_at is null and state = upper(btrim(coalesce(p_state, ''))) and lower(underwriter) = lower(btrim(coalesce(p_underwriter, ''))) and amount is not null and amount > 0 limit 1 $function$$pf100$;
  end if;
end
$guard100$;
do $guard101$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='role_text' and p.pronargs=1) then
    execute $pf101$CREATE OR REPLACE FUNCTION private.role_text(roles text[])
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case when roles @> array['Client-Buyer', 'Buyer Agent'] then 'Buyer + Buyer''s Agent'
              when roles @> array['Client-Seller', 'Listing Agent'] then 'Seller + Listing Agent'
              else coalesce(roles[1], 'Outside user') end $function$$pf101$;
  end if;
end
$guard101$;
do $guard102$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='routing_ok' and p.pronargs=1) then
    execute $pf102$CREATE OR REPLACE FUNCTION private.routing_ok(v text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare d int[];
begin
  if coalesce(v, '') !~ '^\d{9}$' then return false; end if;
  d := array(select substr(v, i, 1)::int from generate_series(1, 9) i);
  return (3 * (d[1] + d[4] + d[7]) + 7 * (d[2] + d[5] + d[8]) + (d[3] + d[6] + d[9])) % 10 = 0; end $function$$pf102$;
  end if;
end
$guard102$;
do $guard103$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='self_rep_pair' and p.pronargs=2) then
    execute $pf103$CREATE OR REPLACE FUNCTION private.self_rep_pair(a text, b text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select (a = 'Client-Buyer' and b = 'Buyer Agent') or (a = 'Buyer Agent' and b = 'Client-Buyer')
      or (a = 'Client-Seller' and b = 'Listing Agent') or (a = 'Listing Agent' and b = 'Client-Seller') $function$$pf103$;
  end if;
end
$guard103$;
do $guard104$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='settlement_by_token' and p.pronargs=3) then
    execute $pf104$CREATE OR REPLACE FUNCTION private.settlement_by_token(p_token text, OUT s settlements, OUT side text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare h bytea := sha256(convert_to(coalesce(p_token, ''), 'UTF8'));
begin
  side := null;
  if p_token is null or char_length(p_token) < 20 then return; end if;
  select * into s from public.settlements x where x.buyer_token_hash = h;
  if found then
    if s.token_expires_at <= pg_catalog.now() then s := null; return; end if;
    side := 'buyer'; return;
  end if;
  select * into s from public.settlements x where x.seller_token_hash = h;
  if found then
    if s.token_expires_at <= pg_catalog.now() then s := null; return; end if;
    side := 'seller';
  end if;
end $function$$pf104$;
  end if;
end
$guard104$;
do $guard105$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='side_of' and p.pronargs=1) then
    execute $pf105$CREATE OR REPLACE FUNCTION private.side_of(r text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $cap$
  select case r when 'Buyer Agent' then 'buyer' when 'Client-Buyer' then 'buyer' when 'Listing Agent' then 'seller' when 'Client-Seller' then 'seller' end $cap$$pf105$;
  end if;
end
$guard105$;
do $guard106$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='task_admin_log_guard' and p.pronargs=0) then
    execute $pf106$CREATE OR REPLACE FUNCTION private.task_admin_log_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin if tg_op <> 'INSERT' then raise exception 'The task admin log is never changed or deleted.' using errcode = 'P0001'; end if; return new; end $function$$pf106$;
  end if;
end
$guard106$;
do $guard107$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='task_enabled' and p.pronargs=1) then
    execute $pf107$CREATE OR REPLACE FUNCTION private.task_enabled(p_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((select enabled from public.task_template_switches where code = p_code), true) $function$$pf107$;
  end if;
end
$guard107$;
do $guard108$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='task_switch_guard' and p.pronargs=0) then
    execute $pf108$CREATE OR REPLACE FUNCTION private.task_switch_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'Task switches are never deleted. Turn the task off instead.' using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' and new.code <> old.code then raise exception 'A task code never changes.' using errcode = 'P0001'; end if;
  return new;
end $function$$pf108$;
  end if;
end
$guard108$;
do $guard109$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='task_switch_log_only' and p.pronargs=0) then
    execute $pf109$CREATE OR REPLACE FUNCTION private.task_switch_log_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin raise exception 'The task switch change log is never changed or deleted.' using errcode = 'P0001'; end $function$$pf109$;
  end if;
end
$guard109$;
do $guard110$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='team_member_check' and p.pronargs=0) then
    execute $pf110$CREATE OR REPLACE FUNCTION private.team_member_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare p public.profiles;
begin
  select * into p from public.profiles where id = new.profile_id;
  if p.status <> 'active' then raise exception 'Only active users can join a team.'; end if;
  if new.member_role = 'coordinator' and p.role <> 'Transaction Coordinator' then raise exception 'Only a transaction coordinator can be a team coordinator.'; end if;
  if new.member_role = 'agent' and p.role <> 'Outside user' then raise exception 'Only outside users (agents) can be team agents.'; end if;
  return new; end $function$$pf110$;
  end if;
end
$guard110$;
do $guard111$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='template_code_retired' and p.pronargs=1) then
    execute $pf111$CREATE OR REPLACE FUNCTION private.template_code_retired(p_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select exists (select 1 from public.task_templates t where t.code = p_code and t.retired_at is not null
    and t.version = (select max(version) from public.task_templates where code = p_code)) $function$$pf111$;
  end if;
end
$guard111$;
do $guard112$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='template_locked' and p.pronargs=2) then
    execute $pf112$CREATE OR REPLACE FUNCTION private.template_locked(p_client_only boolean, p_fields jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(p_client_only, false) or exists (select 1 from jsonb_array_elements(coalesce(p_fields, '[]')) f
    where f->>'type' = 'doc' or ((f->>'k') || ' ' || (f->>'label')) ~* '(ssn|social.?security|bank|wire|routing|account|signature|identity|passport|license)') $function$$pf112$;
  end if;
end
$guard112$;
do $guard113$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='title_curative_expired' and p.pronargs=6) then
    execute $pf113$CREATE OR REPLACE FUNCTION private.title_curative_expired(p_type text, p_state text, p_entry date, p_renewal date, p_filing date, p_on date DEFAULT CURRENT_DATE)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
 select case when p_type='court_judgment' and upper(p_state) in('MD','DC','VA') and coalesce(p_renewal,p_entry) is not null then p_on >= coalesce(p_renewal,p_entry)+make_interval(years=>case upper(p_state) when 'VA' then 20 else 12 end)
 when p_type='mechanics_lien' and upper(p_state)='FL' and p_filing is not null then p_on>=p_filing+interval '1 year' else false end $function$$pf113$;
  end if;
end
$guard113$;
do $guard114$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='touch_settlement_token_expiry' and p.pronargs=0) then
    execute $pf114$CREATE OR REPLACE FUNCTION private.touch_settlement_token_expiry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if tg_op = 'INSERT'
     or new.buyer_token_hash is distinct from old.buyer_token_hash
     or new.seller_token_hash is distinct from old.seller_token_hash then
    new.token_expires_at := pg_catalog.now() + interval '14 days';
  end if;
  return new;
end $function$$pf114$;
  end if;
end
$guard114$;
do $guard115$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='trg_lender_email' and p.pronargs=0) then
    execute $pf115$CREATE OR REPLACE FUNCTION private.trg_lender_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin new.lender_email := lower(btrim(coalesce(new.lender_email, '')));
  if new.lender_email <> '' and new.lender_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Lender email is not valid.' using errcode = '23514'; end if;
  return new; end $function$$pf115$;
  end if;
end
$guard115$;
do $guard116$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='trg_participant_unlink' and p.pronargs=0) then
    execute $pf116$CREATE OR REPLACE FUNCTION private.trg_participant_unlink()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin update public.tasks set status = 'cancelled' where participant_id = old.id and status in ('todo', 'in_progress', 'blocked'); return old; end $function$$pf116$;
  end if;
end
$guard116$;
do $guard117$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='trg_sig_wire' and p.pronargs=0) then
    execute $pf117$CREATE OR REPLACE FUNCTION private.trg_sig_wire()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if exists (select 1 from public.documents where id = new.document_id and wire_instructions) then
    raise exception 'Wire instructions are not sent for e-signature. Share them with the buyer alone.' using errcode = 'P0001'; end if;
  return new; end $function$$pf117$;
  end if;
end
$guard117$;
do $guard118$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='trg_sign_task' and p.pronargs=0) then
    execute $pf118$CREATE OR REPLACE FUNCTION private.trg_sign_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if new.kind = 'sign' and new.status = 'done' and old.status <> 'done' and coalesce(current_setting('cla.sign_rpc', true), '') <> 'on' then
    raise exception 'A signature task is completed by the signer signing it.' using errcode = '42501'; end if;
  return new; end $function$$pf118$;
  end if;
end
$guard118$;
do $guard119$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='upload_ext_ok' and p.pronargs=1) then
    execute $pf119$CREATE OR REPLACE FUNCTION private.upload_ext_ok(n text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select lower(split_part(n, '.', -1)) in ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'png', 'jpg', 'jpeg', 'heic', 'heif', 'webp') and position('.' in n) > 1 $function$$pf119$;
  end if;
end
$guard119$;
do $guard120$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='us_state_ok' and p.pronargs=1) then
    execute $pf120$CREATE OR REPLACE FUNCTION private.us_state_ok(s text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select s = any (array['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT',
                        'NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']) $function$$pf120$;
  end if;
end
$guard120$;
do $guard121$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='uw_guard' and p.pronargs=0) then
    execute $pf121$CREATE OR REPLACE FUNCTION private.uw_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'Underwriter splits are never deleted. Leave the %% blank (not set) instead.' using errcode = 'P0001'; end if;
  if new.state <> old.state then raise exception 'A state code never changes.' using errcode = 'P0001'; end if; return new;
end $function$$pf121$;
  end if;
end
$guard121$;
do $guard122$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='uw_log_only' and p.pronargs=0) then
    execute $pf122$CREATE OR REPLACE FUNCTION private.uw_log_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin raise exception 'The underwriter split log is never changed or deleted.' using errcode = 'P0001'; end $function$$pf122$;
  end if;
end
$guard122$;
do $guard123$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='wire_name' and p.pronargs=1) then
    execute $pf123$CREATE OR REPLACE FUNCTION private.wire_name(n text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(n, '') ~* '\ywir(e|ing)[[:space:]_.-]*(transfer[[:space:]_.-]*)?(instruction|info(rmation)?\y|details\y)' $function$$pf123$;
  end if;
end
$guard123$;
do $guard124$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='wire_text' and p.pronargs=1) then
    execute $pf124$CREATE OR REPLACE FUNCTION private.wire_text(t text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(t, '') ~* '\ywir(e|ed|ing)\y' and (coalesce(t, '') ~* '\y(routing|aba)\y' or coalesce(t, '') ~* '\yaccount[[:space:]]*(no\.?|number|num|#)'
    or coalesce(t, '') ~ '(^|[^0-9])[0-9]{9}([^0-9]|$)') $function$$pf124$;
  end if;
end
$guard124$;
do $guard125$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='accept_agent_invite' and p.pronargs=2) then
    execute $pf125$CREATE OR REPLACE FUNCTION public.accept_agent_invite(p_token text, p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_accept_agent_invite(p_token, p); END; $function$$pf125$;
  end if;
end
$guard125$;
do $guard126$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='acknowledge_agreement' and p.pronargs=2) then
    execute $pf126$CREATE OR REPLACE FUNCTION public.acknowledge_agreement(p_deal uuid, p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_acknowledge_agreement(p_deal, p_code); END; $function$$pf126$;
  end if;
end
$guard126$;
do $guard127$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='add_deal_sales_person' and p.pronargs=2) then
    execute $pf127$CREATE OR REPLACE FUNCTION public.add_deal_sales_person(p_deal uuid, p_sales uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN PERFORM private.rpc_add_deal_sales_person(p_deal, p_sales); END; $function$$pf127$;
  end if;
end
$guard127$;
do $guard128$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_delete_user' and p.pronargs=1) then
    execute $pf128$CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN PERFORM private.rpc_admin_delete_user(p_user); END; $function$$pf128$;
  end if;
end
$guard128$;
do $guard129$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_link_sales_rep' and p.pronargs=2) then
    execute $pf129$CREATE OR REPLACE FUNCTION public.admin_link_sales_rep(p_client uuid, p_sales uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN PERFORM private.rpc_admin_link_sales_rep(p_client, p_sales); END; $function$$pf129$;
  end if;
end
$guard129$;
do $guard130$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_set_sales_reps' and p.pronargs=2) then
    execute $pf130$CREATE OR REPLACE FUNCTION public.admin_set_sales_reps(p_client uuid, p_sales uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_admin_set_sales_reps(p_client, p_sales); END; $function$$pf130$;
  end if;
end
$guard130$;
do $guard131$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_unlink_sales_rep' and p.pronargs=2) then
    execute $pf131$CREATE OR REPLACE FUNCTION public.admin_unlink_sales_rep(p_client uuid, p_sales uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN PERFORM private.rpc_admin_unlink_sales_rep(p_client, p_sales); END; $function$$pf131$;
  end if;
end
$guard131$;
do $guard132$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='agent_invite_lookup' and p.pronargs=1) then
    execute $pf132$CREATE OR REPLACE FUNCTION public.agent_invite_lookup(p_token text)
 RETURNS TABLE(status text, first_name text, last_name text, email text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_agent_invite_lookup(p_token); END; $function$$pf132$;
  end if;
end
$guard132$;
do $guard133$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='agent_invite_status' and p.pronargs=1) then
    execute $pf133$CREATE OR REPLACE FUNCTION public.agent_invite_status(i agent_invites)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case when i.status = 'pending' and i.expires_at < now() then 'expired' else i.status end $function$$pf133$;
  end if;
end
$guard133$;
do $guard134$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='agent_sales_rep_contacts' and p.pronargs=1) then
    execute $pf134$CREATE OR REPLACE FUNCTION public.agent_sales_rep_contacts(p_deal uuid)
 RETURNS TABLE(sales_id uuid, name text, work_phone text, work_email text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_agent_sales_rep_contacts(p_deal); END; $function$$pf134$;
  end if;
end
$guard134$;
do $guard135$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='agreement_status' and p.pronargs=1) then
    execute $pf135$CREATE OR REPLACE FUNCTION public.agreement_status(p_deal uuid)
 RETURNS TABLE(profile_id uuid, name text, agreement_code text, acknowledged_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_agreement_status(p_deal); END; $function$$pf135$;
  end if;
end
$guard135$;
do $guard136$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='answer_closing_location' and p.pronargs=4) then
    execute $pf136$CREATE OR REPLACE FUNCTION public.answer_closing_location(p_participant uuid, p_in_state boolean, p_state text DEFAULT NULL::text, p_country text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare rid uuid;
begin
  update public.closing_party_locations set in_state_at_closing = p_in_state, closing_location_state = case when p_in_state then null else p_state end,
    closing_location_country = case when p_in_state then null else p_country end where participant_id = p_participant returning id into rid;
  if rid is null then
    insert into public.closing_party_locations (participant_id, in_state_at_closing, closing_location_state, closing_location_country)
      values (p_participant, p_in_state, case when p_in_state then null else p_state end, case when p_in_state then null else p_country end);
    select id into rid from public.closing_party_locations where participant_id = p_participant; end if;
  return rid; end $function$$pf136$;
  end if;
end
$guard136$;
do $guard137$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='approve_entity_review' and p.pronargs=2) then
    execute $pf137$CREATE OR REPLACE FUNCTION public.approve_entity_review(p_id uuid, p_note text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_approve_entity_review(p_id, p_note); END; $function$$pf137$;
  end if;
end
$guard137$;
do $guard138$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cancel_signature_request' and p.pronargs=1) then
    execute $pf138$CREATE OR REPLACE FUNCTION public.cancel_signature_request(p_request uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN PERFORM private.rpc_cancel_signature_request(p_request); END; $function$$pf138$;
  end if;
end
$guard138$;
do $guard139$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='closing_location_prompt' and p.pronargs=1) then
    execute $pf139$CREATE OR REPLACE FUNCTION public.closing_location_prompt(p_deal uuid)
 RETURNS TABLE(participant_id uuid, party_role text, property_state text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_closing_location_prompt(p_deal); END; $function$$pf139$;
  end if;
end
$guard139$;
do $guard140$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='closing_locations' and p.pronargs=1) then
    execute $pf140$CREATE OR REPLACE FUNCTION public.closing_locations(p_deal uuid)
 RETURNS TABLE(participant_id uuid, party_role text, name text, property_state text, in_state_at_closing boolean, closing_location_state text, closing_location_country text, signing_method text, answered_at timestamp with time zone, updated_at timestamp with time zone, mine boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_closing_locations(p_deal); END; $function$$pf140$;
  end if;
end
$guard140$;
do $guard141$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='closing_office_choices' and p.pronargs=1) then
    execute $pf141$CREATE OR REPLACE FUNCTION public.closing_office_choices(p_deal uuid)
 RETURNS TABLE(id text, name text, address text, state text, is_main_office_for_state boolean, sort_order integer, active boolean, pickable boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_closing_office_choices(p_deal); END; $function$$pf141$;
  end if;
end
$guard141$;
do $guard142$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='confirm_settlement' and p.pronargs=2) then
    execute $pf142$CREATE OR REPLACE FUNCTION public.confirm_settlement(p_settlement uuid, p_slot integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN PERFORM private.rpc_confirm_settlement(p_settlement, p_slot); END; $function$$pf142$;
  end if;
end
$guard142$;
do $guard143$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='contact_directory' and p.pronargs=1) then
    execute $pf143$CREATE OR REPLACE FUNCTION public.contact_directory(p_search text DEFAULT ''::text)
 RETURNS TABLE(id uuid, profile_id uuid, first_name text, last_name text, company text, email text, phone text, contact_hidden boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_contact_directory(p_search); END; $function$$pf143$;
  end if;
end
$guard143$;
do $guard144$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='contact_types' and p.pronargs=1) then
    execute $pf144$CREATE OR REPLACE FUNCTION public.contact_types(p_ids uuid[])
 RETURNS TABLE(contact_id uuid, contact_type text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_contact_types(p_ids); END; $function$$pf144$;
  end if;
end
$guard144$;
do $guard145$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_agent_invite' and p.pronargs=5) then
    execute $pf145$CREATE OR REPLACE FUNCTION public.create_agent_invite(p_contact uuid, p_first text, p_last text, p_email text, p_deal uuid DEFAULT NULL::uuid)
 RETURNS TABLE(invite_id uuid, token text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_create_agent_invite(p_contact, p_first, p_last, p_email, p_deal); END; $function$$pf145$;
  end if;
end
$guard145$;
do $guard146$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_all_parties_thread' and p.pronargs=3) then
    execute $pf146$CREATE OR REPLACE FUNCTION public.create_all_parties_thread(p_deal uuid, p_subject text, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_create_all_parties_thread(p_deal, p_subject, p_body); END; $function$$pf146$;
  end if;
end
$guard146$;
do $guard147$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_account_detail' and p.pronargs=1) then
    execute $pf147$CREATE OR REPLACE FUNCTION public.crm_account_detail(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_account_detail(p_id); END; $function$$pf147$;
  end if;
end
$guard147$;
do $guard148$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_account_list' and p.pronargs=0) then
    execute $pf148$CREATE OR REPLACE FUNCTION public.crm_account_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_account_list(); END; $function$$pf148$;
  end if;
end
$guard148$;
do $guard149$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_archive' and p.pronargs=3) then
    execute $pf149$CREATE OR REPLACE FUNCTION public.crm_archive(p_entity text, p_id uuid, p_archived boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_archive(p_entity, p_id, p_archived); END; $function$$pf149$;
  end if;
end
$guard149$;
do $guard150$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_assignees' and p.pronargs=0) then
    execute $pf150$CREATE OR REPLACE FUNCTION public.crm_assignees()
 RETURNS TABLE(id uuid, name text, role text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_crm_assignees(); END; $function$$pf150$;
  end if;
end
$guard150$;
do $guard151$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_close_task' and p.pronargs=1) then
    execute $pf151$CREATE OR REPLACE FUNCTION public.crm_close_task(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_close_task(p_id); END; $function$$pf151$;
  end if;
end
$guard151$;
do $guard152$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_company_duplicate' and p.pronargs=2) then
    execute $pf152$CREATE OR REPLACE FUNCTION public.crm_company_duplicate(p_name text, p_except uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_company_duplicate(p_name, p_except); END; $function$$pf152$;
  end if;
end
$guard152$;
do $guard153$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_complete_call' and p.pronargs=3) then
    execute $pf153$CREATE OR REPLACE FUNCTION public.crm_complete_call(p_id uuid, p_seconds integer, p_description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare n int;
begin
  if coalesce(p_seconds, 0) <= 0 then raise exception 'Call duration cannot be zero' using errcode = '23514'; end if;
  update public.crm_activities set call_status = 'Completed', call_duration_sec = p_seconds, body = coalesce(nullif(btrim(p_description), ''), body)
    where id = p_id and kind = 'call' and call_status = 'Scheduled';
  get diagnostics n = row_count; if n = 0 then raise exception 'Call not found, or already completed.' using errcode = 'P0002'; end if;
  return p_id; end $function$$pf153$;
  end if;
end
$guard153$;
do $guard154$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_contact_detail' and p.pronargs=1) then
    execute $pf154$CREATE OR REPLACE FUNCTION public.crm_contact_detail(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_contact_detail(p_id); END; $function$$pf154$;
  end if;
end
$guard154$;
do $guard155$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_contact_list' and p.pronargs=0) then
    execute $pf155$CREATE OR REPLACE FUNCTION public.crm_contact_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_contact_list(); END; $function$$pf155$;
  end if;
end
$guard155$;
do $guard156$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_convert_lead' and p.pronargs=2) then
    execute $pf156$CREATE OR REPLACE FUNCTION public.crm_convert_lead(p_lead uuid, p jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_convert_lead(p_lead, p); END; $function$$pf156$;
  end if;
end
$guard156$;
do $guard157$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_create_contact' and p.pronargs=1) then
    execute $pf157$CREATE OR REPLACE FUNCTION public.crm_create_contact(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_create_contact(p); END; $function$$pf157$;
  end if;
end
$guard157$;
do $guard158$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_create_field' and p.pronargs=1) then
    execute $pf158$CREATE OR REPLACE FUNCTION public.crm_create_field(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_create_field(p); END; $function$$pf158$;
  end if;
end
$guard158$;
do $guard159$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_follow_ups' and p.pronargs=3) then
    execute $pf159$CREATE OR REPLACE FUNCTION public.crm_follow_ups(p_owner uuid DEFAULT NULL::uuid, p_status text DEFAULT 'open'::text, p_all boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_follow_ups(p_owner, p_status, p_all); END; $function$$pf159$;
  end if;
end
$guard159$;
do $guard160$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_invited_meetings' and p.pronargs=2) then
    execute $pf160$CREATE OR REPLACE FUNCTION public.crm_invited_meetings(p_entity text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_invited_meetings(p_entity, p_id); END; $function$$pf160$;
  end if;
end
$guard160$;
do $guard161$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_list_export' and p.pronargs=2) then
    execute $pf161$CREATE OR REPLACE FUNCTION public.crm_list_export(p_module text, p_rows integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_list_export(p_module, p_rows); END; $function$$pf161$;
  end if;
end
$guard161$;
do $guard162$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_owners' and p.pronargs=0) then
    execute $pf162$CREATE OR REPLACE FUNCTION public.crm_owners()
 RETURNS TABLE(id uuid, name text, role text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_crm_owners(); END; $function$$pf162$;
  end if;
end
$guard162$;
do $guard163$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_report' and p.pronargs=2) then
    execute $pf163$CREATE OR REPLACE FUNCTION public.crm_report(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_report(p_from, p_to); END; $function$$pf163$;
  end if;
end
$guard163$;
do $guard164$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_report_export' and p.pronargs=2) then
    execute $pf164$CREATE OR REPLACE FUNCTION public.crm_report_export(p_report uuid, p_rows integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_report_export(p_report, p_rows); END; $function$$pf164$;
  end if;
end
$guard164$;
do $guard165$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_report_touch' and p.pronargs=1) then
    execute $pf165$CREATE OR REPLACE FUNCTION public.crm_report_touch(p_report uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN PERFORM private.rpc_crm_report_touch(p_report); END; $function$$pf165$;
  end if;
end
$guard165$;
do $guard166$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_settings' and p.pronargs=0) then
    execute $pf166$CREATE OR REPLACE FUNCTION public.crm_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_crm_settings(); END; $function$$pf166$;
  end if;
end
$guard166$;
do $guard167$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='deal_display_name' and p.pronargs=1) then
    execute $pf167$CREATE OR REPLACE FUNCTION public.deal_display_name(p_deal uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select concat_ws(', ', nullif(btrim(street), ''), nullif(concat_ws(', ', nullif(btrim(city), ''), nullif(btrim(concat_ws(' ', state, zip)), '')), ''))
  from public.deals where id = p_deal $function$$pf167$;
  end if;
end
$guard167$;
do $guard168$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='deal_entities' and p.pronargs=1) then
    execute $pf168$CREATE OR REPLACE FUNCTION public.deal_entities(p_deal uuid)
 RETURNS TABLE(participant_id uuid, name text, entity_type text, rep_name text, rep_title text, rep_phone text, rep_email text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_deal_entities(p_deal); END; $function$$pf168$;
  end if;
end
$guard168$;
do $guard169$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='deal_sales_list' and p.pronargs=1) then
    execute $pf169$CREATE OR REPLACE FUNCTION public.deal_sales_list(p_deal uuid DEFAULT NULL::uuid)
 RETURNS TABLE(deal_id uuid, sales_id uuid, name text, role text, added_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_deal_sales_list(p_deal); END; $function$$pf169$;
  end if;
end
$guard169$;
do $guard170$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='digest' and p.pronargs=2) then
    execute $pf170$CREATE OR REPLACE FUNCTION public.digest(data bytea, type text)
 RETURNS bytea
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'extensions'
AS $function$
  select extensions.digest(data, type)
$function$$pf170$;
  end if;
end
$guard170$;
do $guard171$
begin
  if to_regprocedure('public.digest(text, text)') is null then
    execute $pf171$CREATE OR REPLACE FUNCTION public.digest(data text, type text)
 RETURNS bytea
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'extensions'
AS $function$
  select extensions.digest(data, type)
$function$$pf171$;
  end if;
end
$guard171$;
do $guard172$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='entity_doc_requests' and p.pronargs=1) then
    execute $pf172$CREATE OR REPLACE FUNCTION public.entity_doc_requests(p_deal uuid)
 RETURNS TABLE(task_id uuid, task_title text, task_status text, owner_id uuid, owner_name text, role text, entity_name text, entity_type text, entity_state text, signer_name text, signer_title text, documents jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_entity_doc_requests(p_deal); END; $function$$pf172$;
  end if;
end
$guard172$;
do $guard173$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_agent_task' and p.pronargs=1) then
    execute $pf173$CREATE OR REPLACE FUNCTION public.get_agent_task(p_task uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_get_agent_task(p_task); END; $function$$pf173$;
  end if;
end
$guard173$;
do $guard174$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_add_company_document' and p.pronargs=10) then
    execute $pf174$CREATE OR REPLACE FUNCTION public.hr_add_company_document(p_title text, p_category text, p_description text, p_share_scope text, p_department_ids uuid[], p_employee_ids uuid[], p_file_name text, p_mime_type text, p_size_bytes bigint, p_storage_path text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_hr_add_company_document(p_title, p_category, p_description, p_share_scope, p_department_ids, p_employee_ids, p_file_name, p_mime_type, p_size_bytes, p_storage_path); END; $function$$pf174$;
  end if;
end
$guard174$;
do $guard175$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_add_employee_document' and p.pronargs=8) then
    execute $pf175$CREATE OR REPLACE FUNCTION public.hr_add_employee_document(p_employee uuid, p_doc_type text, p_title text, p_signature_required boolean, p_file_name text, p_mime_type text, p_size_bytes bigint, p_storage_path text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_hr_add_employee_document(p_employee, p_doc_type, p_title, p_signature_required, p_file_name, p_mime_type, p_size_bytes, p_storage_path); END; $function$$pf175$;
  end if;
end
$guard175$;
do $guard176$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_archive_company_document' and p.pronargs=2) then
    execute $pf176$CREATE OR REPLACE FUNCTION public.hr_archive_company_document(p_id uuid, p_archived boolean DEFAULT true)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_hr_archive_company_document(p_id, p_archived); END; $function$$pf176$;
  end if;
end
$guard176$;
do $guard177$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_archive_employee' and p.pronargs=2) then
    execute $pf177$CREATE OR REPLACE FUNCTION public.hr_archive_employee(p_id uuid, p_archived boolean DEFAULT true)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_hr_archive_employee(p_id, p_archived); END; $function$$pf177$;
  end if;
end
$guard177$;
do $guard178$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_archive_employee_document' and p.pronargs=2) then
    execute $pf178$CREATE OR REPLACE FUNCTION public.hr_archive_employee_document(p_document uuid, p_archived boolean DEFAULT true)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_hr_archive_employee_document(p_document, p_archived); END; $function$$pf178$;
  end if;
end
$guard178$;
do $guard179$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_create_employee' and p.pronargs=1) then
    execute $pf179$CREATE OR REPLACE FUNCTION public.hr_create_employee(p jsonb)
 RETURNS TABLE(employee_id uuid, token text, expires_at timestamp with time zone, linked_login boolean)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_hr_create_employee(p); END; $function$$pf179$;
  end if;
end
$guard179$;
do $guard180$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_create_invite' and p.pronargs=1) then
    execute $pf180$CREATE OR REPLACE FUNCTION public.hr_create_invite(p_employee uuid)
 RETURNS TABLE(token text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_hr_create_invite(p_employee); END; $function$$pf180$;
  end if;
end
$guard180$;
do $guard181$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_my_reports' and p.pronargs=0) then
    execute $pf181$CREATE OR REPLACE FUNCTION public.hr_my_reports()
 RETURNS TABLE(id uuid, employee_code text, first_name text, last_name text, email text, department text, designation text, job_title text, date_of_joining date, work_location text, employment_type text, employment_status text, country text, work_phone text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_hr_my_reports(); END; $function$$pf181$;
  end if;
end
$guard181$;
do $guard182$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_record_signature_status' and p.pronargs=4) then
    execute $pf182$CREATE OR REPLACE FUNCTION public.hr_record_signature_status(p_request uuid, p_status text, p_provider text DEFAULT NULL::text, p_note text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_hr_record_signature_status(p_request, p_status, p_provider, p_note); END; $function$$pf182$;
  end if;
end
$guard182$;
do $guard183$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_session_end' and p.pronargs=1) then
    execute $pf183$CREATE OR REPLACE FUNCTION public.hr_session_end(p_reason text DEFAULT 'logout'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_hr_session_end(p_reason); END; $function$$pf183$;
  end if;
end
$guard183$;
do $guard184$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_session_heartbeat' and p.pronargs=0) then
    execute $pf184$CREATE OR REPLACE FUNCTION public.hr_session_heartbeat()
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_hr_session_heartbeat(); END; $function$$pf184$;
  end if;
end
$guard184$;
do $guard185$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_set_manager' and p.pronargs=2) then
    execute $pf185$CREATE OR REPLACE FUNCTION public.hr_set_manager(p_employee uuid, p_on boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_hr_set_manager(p_employee, p_on); END; $function$$pf185$;
  end if;
end
$guard185$;
do $guard186$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_set_signature_required' and p.pronargs=2) then
    execute $pf186$CREATE OR REPLACE FUNCTION public.hr_set_signature_required(p_document uuid, p_required boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_hr_set_signature_required(p_document, p_required); END; $function$$pf186$;
  end if;
end
$guard186$;
do $guard187$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hr_update_employee' and p.pronargs=2) then
    execute $pf187$CREATE OR REPLACE FUNCTION public.hr_update_employee(p_id uuid, p jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_hr_update_employee(p_id, p); END; $function$$pf187$;
  end if;
end
$guard187$;
do $guard188$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='issue_cpl_guarded' and p.pronargs=5) then
    execute $pf188$CREATE OR REPLACE FUNCTION public.issue_cpl_guarded(p_deal uuid, p_party text, p_clause text, p_for text, p_legacy_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_issue_cpl_guarded(p_deal, p_party, p_clause, p_for, p_legacy_type); END; $function$$pf188$;
  end if;
end
$guard188$;
do $guard189$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_file_coverage' and p.pronargs=1) then
    execute $pf189$CREATE OR REPLACE FUNCTION public.list_file_coverage(p_deal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_list_file_coverage(p_deal); END; $function$$pf189$;
  end if;
end
$guard189$;
do $guard190$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_task_admin' and p.pronargs=0) then
    execute $pf190$CREATE OR REPLACE FUNCTION public.list_task_admin()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_list_task_admin(); END; $function$$pf190$;
  end if;
end
$guard190$;
do $guard191$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='message_about_task' and p.pronargs=2) then
    execute $pf191$CREATE OR REPLACE FUNCTION public.message_about_task(p_task uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_message_about_task(p_task, p_body); END; $function$$pf191$;
  end if;
end
$guard191$;
do $guard192$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='my_file_roles' and p.pronargs=0) then
    execute $pf192$CREATE OR REPLACE FUNCTION public.my_file_roles()
 RETURNS TABLE(deal_id uuid, role text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_my_file_roles(); END; $function$$pf192$;
  end if;
end
$guard192$;
do $guard193$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='my_notifications' and p.pronargs=1) then
    execute $pf193$CREATE OR REPLACE FUNCTION public.my_notifications(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, profile_id uuid, kind text, deal_id uuid, title text, link text, created_at timestamp with time zone, read_at timestamp with time zone, file_number text, address text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_my_notifications(p_limit); END; $function$$pf193$;
  end if;
end
$guard193$;
do $guard194$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='my_order_activity' and p.pronargs=1) then
    execute $pf194$CREATE OR REPLACE FUNCTION public.my_order_activity(p_deal uuid)
 RETURNS TABLE(created_at timestamp with time zone, action text, detail text, actor text, mine boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_my_order_activity(p_deal); END; $function$$pf194$;
  end if;
end
$guard194$;
do $guard195$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='my_profile' and p.pronargs=0) then
    execute $pf195$CREATE OR REPLACE FUNCTION public.my_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_my_profile(); END; $function$$pf195$;
  end if;
end
$guard195$;
do $guard196$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='order_progress' and p.pronargs=1) then
    execute $pf196$CREATE OR REPLACE FUNCTION public.order_progress(p_deal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_order_progress(p_deal); END; $function$$pf196$;
  end if;
end
$guard196$;
do $guard197$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='policy_title_data' and p.pronargs=1) then
    execute $pf197$CREATE OR REPLACE FUNCTION public.policy_title_data(p_deal uuid)
 RETURNS TABLE(underwriter text, commitment_number text, commitment_status text, effective_date date, owner_policy_type text, lender_policy_type text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_policy_title_data(p_deal); END; $function$$pf197$;
  end if;
end
$guard197$;
do $guard198$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='propose_closing' and p.pronargs=5) then
    execute $pf198$CREATE OR REPLACE FUNCTION public.propose_closing(p_deal uuid, p_at timestamp without time zone, p_location text, p_note text DEFAULT ''::text, p_office text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_propose_closing(p_deal, p_at, p_location, p_note, p_office); END; $function$$pf198$;
  end if;
end
$guard198$;
do $guard199$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='publish_template_version' and p.pronargs=4) then
    execute $pf199$CREATE OR REPLACE FUNCTION public.publish_template_version(p_code text, p_title text, p_description text DEFAULT NULL::text, p_due_days integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_publish_template_version(p_code, p_title, p_description, p_due_days); END; $function$$pf199$;
  end if;
end
$guard199$;
do $guard200$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='queue_buyer_agent_commitment' and p.pronargs=1) then
    execute $pf200$CREATE OR REPLACE FUNCTION public.queue_buyer_agent_commitment(p_deal uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_queue_buyer_agent_commitment(p_deal); END; $function$$pf200$;
  end if;
end
$guard200$;
do $guard201$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='queue_overdue_reminders' and p.pronargs=0) then
    execute $pf201$CREATE OR REPLACE FUNCTION public.queue_overdue_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_queue_overdue_reminders(); END; $function$$pf201$;
  end if;
end
$guard201$;
do $guard202$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='queue_portal_invite' and p.pronargs=2) then
    execute $pf202$CREATE OR REPLACE FUNCTION public.queue_portal_invite(p_deal uuid, p_profile uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_queue_portal_invite(p_deal, p_profile); END; $function$$pf202$;
  end if;
end
$guard202$;
do $guard203$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='queue_postclosing_alert' and p.pronargs=2) then
    execute $pf203$CREATE OR REPLACE FUNCTION public.queue_postclosing_alert(p_deal uuid, p_title text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_queue_postclosing_alert(p_deal, p_title); END; $function$$pf203$;
  end if;
end
$guard203$;
do $guard204$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='queue_task_reminder' and p.pronargs=1) then
    execute $pf204$CREATE OR REPLACE FUNCTION public.queue_task_reminder(p_task uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_queue_task_reminder(p_task); END; $function$$pf204$;
  end if;
end
$guard204$;
do $guard205$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='queue_title_package' and p.pronargs=2) then
    execute $pf205$CREATE OR REPLACE FUNCTION public.queue_title_package(p_deal uuid, p_package_document uuid)
 RETURNS outbox
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_queue_title_package(p_deal, p_package_document); END; $function$$pf205$;
  end if;
end
$guard205$;
do $guard206$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='remind_closing_locations' and p.pronargs=1) then
    execute $pf206$CREATE OR REPLACE FUNCTION public.remind_closing_locations(p_deal uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_remind_closing_locations(p_deal); END; $function$$pf206$;
  end if;
end
$guard206$;
do $guard207$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='remove_deal_sales_person' and p.pronargs=2) then
    execute $pf207$CREATE OR REPLACE FUNCTION public.remove_deal_sales_person(p_deal uuid, p_sales uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN PERFORM private.rpc_remove_deal_sales_person(p_deal, p_sales); END; $function$$pf207$;
  end if;
end
$guard207$;
do $guard208$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='reopen_settlement' and p.pronargs=3) then
    execute $pf208$CREATE OR REPLACE FUNCTION public.reopen_settlement(p_settlement uuid, p_slots timestamp without time zone[] DEFAULT NULL::timestamp without time zone[], p_note text DEFAULT NULL::text)
 RETURNS TABLE(buyer_token text, seller_token text)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_reopen_settlement(p_settlement, p_slots, p_note); END; $function$$pf208$;
  end if;
end
$guard208$;
do $guard209$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='reorder_offices' and p.pronargs=1) then
    execute $pf209$CREATE OR REPLACE FUNCTION public.reorder_offices(p_ids text[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN PERFORM private.rpc_reorder_offices(p_ids); END; $function$$pf209$;
  end if;
end
$guard209$;
do $guard210$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='request_signature' and p.pronargs=3) then
    execute $pf210$CREATE OR REPLACE FUNCTION public.request_signature(p_doc uuid, p_signers uuid[], p_message text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_request_signature(p_doc, p_signers, p_message); END; $function$$pf210$;
  end if;
end
$guard210$;
do $guard211$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='resend_agent_invite' and p.pronargs=1) then
    execute $pf211$CREATE OR REPLACE FUNCTION public.resend_agent_invite(p_invite uuid)
 RETURNS TABLE(token text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_resend_agent_invite(p_invite); END; $function$$pf211$;
  end if;
end
$guard211$;
do $guard212$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='respond_update_request' and p.pronargs=2) then
    execute $pf212$CREATE OR REPLACE FUNCTION public.respond_update_request(p_id uuid, p_response text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN PERFORM private.rpc_respond_update_request(p_id, p_response); END; $function$$pf212$;
  end if;
end
$guard212$;
do $guard213$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='retire_task_template' and p.pronargs=2) then
    execute $pf213$CREATE OR REPLACE FUNCTION public.retire_task_template(p_code text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_retire_task_template(p_code, p_reason); END; $function$$pf213$;
  end if;
end
$guard213$;
do $guard214$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='revoke_agent_invite' and p.pronargs=1) then
    execute $pf214$CREATE OR REPLACE FUNCTION public.revoke_agent_invite(p_invite uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_revoke_agent_invite(p_invite); END; $function$$pf214$;
  end if;
end
$guard214$;
do $guard215$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_alert_group_member' and p.pronargs=6) then
    execute $pf215$CREATE OR REPLACE FUNCTION public.save_alert_group_member(p_group text, p_id text, p_name text, p_role text, p_profile uuid, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_save_alert_group_member(p_group, p_id, p_name, p_role, p_profile, p_email); END; $function$$pf215$;
  end if;
end
$guard215$;
do $guard216$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_cpl_price' and p.pronargs=3) then
    execute $pf216$CREATE OR REPLACE FUNCTION public.save_cpl_price(p_state text, p_underwriter text, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_save_cpl_price(p_state, p_underwriter, p_amount); END; $function$$pf216$;
  end if;
end
$guard216$;
do $guard217$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_entity_attorney' and p.pronargs=5) then
    execute $pf217$CREATE OR REPLACE FUNCTION public.save_entity_attorney(p_id text, p_name text, p_role text, p_profile uuid, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_save_entity_attorney(p_id, p_name, p_role, p_profile, p_active); END; $function$$pf217$;
  end if;
end
$guard217$;
do $guard218$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_agent_birthdate' and p.pronargs=2) then
    execute $pf218$CREATE OR REPLACE FUNCTION public.set_agent_birthdate(p_profile uuid, p_birthdate date)
 RETURNS date
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_set_agent_birthdate(p_profile, p_birthdate); END; $function$$pf218$;
  end if;
end
$guard218$;
do $guard219$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_deal_sales_people' and p.pronargs=2) then
    execute $pf219$CREATE OR REPLACE FUNCTION public.set_deal_sales_people(p_deal uuid, p_sales uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_set_deal_sales_people(p_deal, p_sales); END; $function$$pf219$;
  end if;
end
$guard219$;
do $guard220$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_email_sender' and p.pronargs=3) then
    execute $pf220$CREATE OR REPLACE FUNCTION public.set_email_sender(p_type text, p_email text, p_display text)
 RETURNS email_sender_settings
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_set_email_sender(p_type, p_email, p_display); END; $function$$pf220$;
  end if;
end
$guard220$;
do $guard221$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_office_active' and p.pronargs=2) then
    execute $pf221$CREATE OR REPLACE FUNCTION public.set_office_active(p_id text, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN PERFORM private.rpc_set_office_active(p_id, p_active); END; $function$$pf221$;
  end if;
end
$guard221$;
do $guard222$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_participant_entity' and p.pronargs=2) then
    execute $pf222$CREATE OR REPLACE FUNCTION public.set_participant_entity(p_participant uuid, p_entity jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_set_participant_entity(p_participant, p_entity); END; $function$$pf222$;
  end if;
end
$guard222$;
do $guard223$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_task_status' and p.pronargs=2) then
    execute $pf223$CREATE OR REPLACE FUNCTION public.set_task_status(p_task uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN PERFORM private.rpc_set_task_status(p_task, p_status); END; $function$$pf223$;
  end if;
end
$guard223$;
do $guard224$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_task_template_enabled' and p.pronargs=3) then
    execute $pf224$CREATE OR REPLACE FUNCTION public.set_task_template_enabled(p_code text, p_enabled boolean, p_reason text DEFAULT NULL::text)
 RETURNS task_template_switches
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_set_task_template_enabled(p_code, p_enabled, p_reason); END; $function$$pf224$;
  end if;
end
$guard224$;
do $guard225$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_underwriter_split' and p.pronargs=3) then
    execute $pf225$CREATE OR REPLACE FUNCTION public.set_underwriter_split(p_state text, p_pct numeric, p_underwriter text DEFAULT NULL::text)
 RETURNS underwriter_splits
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_set_underwriter_split(p_state, p_pct, p_underwriter); END; $function$$pf225$;
  end if;
end
$guard225$;
do $guard226$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='share_access' and p.pronargs=5) then
    execute $pf226$CREATE OR REPLACE FUNCTION public.share_access(p_deal uuid, p_first text, p_last text, p_email text, p_permission text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_share_access(p_deal, p_first, p_last, p_email, p_permission); END; $function$$pf226$;
  end if;
end
$guard226$;
do $guard227$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='share_document_with_client' and p.pronargs=2) then
    execute $pf227$CREATE OR REPLACE FUNCTION public.share_document_with_client(p_doc uuid, p_share boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_share_document_with_client(p_doc, p_share); END; $function$$pf227$;
  end if;
end
$guard227$;
do $guard228$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='share_document_with_seller' and p.pronargs=2) then
    execute $pf228$CREATE OR REPLACE FUNCTION public.share_document_with_seller(p_doc uuid, p_share boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_share_document_with_seller(p_doc, p_share); END; $function$$pf228$;
  end if;
end
$guard228$;
do $guard229$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sign_document' and p.pronargs=3) then
    execute $pf229$CREATE OR REPLACE FUNCTION public.sign_document(p_request uuid, p_typed_name text, p_adopt boolean)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_sign_document(p_request, p_typed_name, p_adopt); END; $function$$pf229$;
  end if;
end
$guard229$;
do $guard230$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='source_of_business_options' and p.pronargs=0) then
    execute $pf230$CREATE OR REPLACE FUNCTION public.source_of_business_options()
 RETURNS TABLE(value text, label text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN QUERY SELECT * FROM private.rpc_source_of_business_options(); END; $function$$pf230$;
  end if;
end
$guard230$;
do $guard231$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='submit_agent_task' and p.pronargs=2) then
    execute $pf231$CREATE OR REPLACE FUNCTION public.submit_agent_task(p_task uuid, p_answers jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_submit_agent_task(p_task, p_answers); END; $function$$pf231$;
  end if;
end
$guard231$;
do $guard232$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='transition_recording' and p.pronargs=3) then
    execute $pf232$CREATE OR REPLACE FUNCTION public.transition_recording(p_deal uuid, p_action text, p_reason text DEFAULT ''::text)
 RETURNS recording_packages
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_transition_recording(p_deal, p_action, p_reason); END; $function$$pf232$;
  end if;
end
$guard232$;
do $guard233$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_my_agent_profile' and p.pronargs=1) then
    execute $pf233$CREATE OR REPLACE FUNCTION public.update_my_agent_profile(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN PERFORM private.rpc_update_my_agent_profile(p); END; $function$$pf233$;
  end if;
end
$guard233$;
do $guard234$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_tc_client_contact' and p.pronargs=6) then
    execute $pf234$CREATE OR REPLACE FUNCTION public.update_tc_client_contact(p_deal uuid, p_participant uuid, p_first text, p_last text, p_email text, p_phone text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_update_tc_client_contact(p_deal, p_participant, p_first, p_last, p_email, p_phone); END; $function$$pf234$;
  end if;
end
$guard234$;
do $guard235$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_tc_contract' and p.pronargs=13) then
    execute $pf235$CREATE OR REPLACE FUNCTION public.update_tc_contract(p_deal uuid, p_purchase_price numeric DEFAULT NULL::numeric, p_contract_date date DEFAULT NULL::date, p_listing_commission_pct numeric DEFAULT NULL::numeric, p_listing_commission_amount numeric DEFAULT NULL::numeric, p_buyer_commission_pct numeric DEFAULT NULL::numeric, p_buyer_commission_amount numeric DEFAULT NULL::numeric, p_seller_concessions numeric DEFAULT NULL::numeric, p_emd_amount numeric DEFAULT NULL::numeric, p_emd_holder text DEFAULT NULL::text, p_closing_date date DEFAULT NULL::date, p_clear_contract_date boolean DEFAULT false, p_clear_closing_date boolean DEFAULT false)
 RETURNS deals
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_update_tc_contract(p_deal, p_purchase_price, p_contract_date, p_listing_commission_pct, p_listing_commission_amount, p_buyer_commission_pct, p_buyer_commission_amount, p_seller_concessions, p_emd_amount, p_emd_holder, p_closing_date, p_clear_contract_date, p_clear_closing_date); END; $function$$pf235$;
  end if;
end
$guard235$;
do $guard236$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_tc_emd_alta' and p.pronargs=7) then
    execute $pf236$CREATE OR REPLACE FUNCTION public.update_tc_emd_alta(p_deal uuid, p_emd_received boolean DEFAULT NULL::boolean, p_emd_received_date date DEFAULT NULL::date, p_emd_received_amount numeric DEFAULT NULL::numeric, p_alta_received boolean DEFAULT NULL::boolean, p_alta_received_date date DEFAULT NULL::date, p_alta_document_id uuid DEFAULT NULL::uuid)
 RETURNS deals
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_update_tc_emd_alta(p_deal, p_emd_received, p_emd_received_date, p_emd_received_amount, p_alta_received, p_alta_received_date, p_alta_document_id); END; $function$$pf236$;
  end if;
end
$guard236$;
do $guard237$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='wire_instructions' and p.pronargs=1) then
    execute $pf237$CREATE OR REPLACE FUNCTION public.wire_instructions(p_deal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ BEGIN RETURN private.rpc_wire_instructions(p_deal); END; $function$$pf237$;
  end if;
end
$guard237$;
do $guard238$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='agent_validate' and p.pronargs=2) then
    execute $pf238$CREATE OR REPLACE FUNCTION private.agent_validate(p_code text, a jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare c jsonb; begin
  if p_code = 'agent_client_contacts' then
    for c in select * from jsonb_array_elements(coalesce(a->'clients', '[]')) loop
      if coalesce(c->>'represent', '') not in ('Yes', 'No') then raise exception 'Do you represent each client? Choose Yes or No.' using errcode = 'P0001'; end if;
      if c->>'represent' = 'Yes' then
        if not private.agent_person_ok(c, true, true) then raise exception 'Client first name, last name, email and 10-digit phone are required.' using errcode = 'P0001'; end if;
        if coalesce(c->>'maritalStatus', '') not in ('Single', 'Married', 'Divorced', 'Widowed') then raise exception 'Choose a marital status.' using errcode = 'P0001'; end if;
        if c->>'maritalStatus' = 'Married' and not private.agent_person_ok(coalesce(c->'spouse', '{}'), false, false) then raise exception 'Spouse first and last name are required.' using errcode = 'P0001'; end if;
      end if; end loop;
    for c in select * from jsonb_array_elements(coalesce(a->'added', '[]')) loop
      if not private.agent_person_ok(c, true, false) then raise exception 'An added client needs a first name, last name and email.' using errcode = 'P0001'; end if; end loop;
  elsif p_code = 'agent_transaction_info' then
    if coalesce(a->>'closingDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Estimated closing date is required.' using errcode = 'P0001'; end if;
    perform (a->>'closingDate')::date;
    if coalesce(a->>'purchasePrice', '') !~ '^\d+(\.\d+)?$' then raise exception 'Purchase price is required.' using errcode = 'P0001'; end if;
    if coalesce(a->>'emdAmount', '') !~ '^\d+(\.\d+)?$' then raise exception 'Earnest deposit amount is required (0 if none).' using errcode = 'P0001'; end if;
    if coalesce(a->>'holdingEmd', '') not in ('Yes', 'No') then raise exception 'Are you holding earnest money given to you by the buyer?' using errcode = 'P0001'; end if;
    if jsonb_array_length(coalesce(a->'commissions', '[]')) = 0 then raise exception 'Add your commission (percent or amount).' using errcode = 'P0001'; end if;
    for c in select * from jsonb_array_elements(coalesce(a->'fees', '[]')) loop
      if coalesce(trim(c->>'name'), '') = '' or coalesce(c->>'type', '') not in ('Fee', 'Credit') or coalesce(c->>'paidBy', '') not in ('Buyer', 'Seller') or coalesce(c->>'amount', '') !~ '^\d+(\.\d+)?$' then
        raise exception 'Each fee or credit needs a name, Fee / Credit, an amount and who pays it.' using errcode = 'P0001'; end if; end loop;
    for c in select * from jsonb_array_elements(coalesce(a->'team', '[]')) loop
      if not private.agent_person_ok(c, true, false) then raise exception 'Each team member needs a first name, last name and email.' using errcode = 'P0001'; end if; end loop;
  elsif p_code = 'agent_home_warranty' then
    if coalesce(a->>'willPurchase', '') not in ('Yes', 'No') then raise exception 'Will you or someone else be purchasing a home warranty? Choose Yes or No.' using errcode = 'P0001'; end if;
    if a->>'willPurchase' = 'Yes' and coalesce(a->>'purchaser', '') not in ('Me', 'Someone else') then raise exception 'Who is purchasing it?' using errcode = 'P0001'; end if;
  else raise exception 'Unknown agent task' using errcode = 'P0001'; end if;
end $function$$pf238$;
  end if;
end
$guard238$;
do $guard239$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_custom_unique' and p.pronargs=0) then
    execute $pf239$CREATE OR REPLACE FUNCTION private.crm_custom_unique()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare f public.crm_custom_fields; ent text := case tg_table_name when 'crm_leads' then 'lead' when 'contacts' then 'contact' when 'crm_accounts' then 'account' else 'opportunity' end; hit uuid; key text;
begin
  for f in select * from public.crm_custom_fields cf where cf.entity = ent and cf.archived_at is null and cf.unique_values loop
    key := private.crm_dup_key(f.type, new.custom -> f.id::text); if key is null then continue; end if;
    if tg_op = 'UPDATE' and private.crm_dup_key(f.type, old.custom -> f.id::text) is not distinct from key then continue; end if;
    execute format('select id from public.%I where id <> $1 and private.crm_dup_key($2, custom -> $3) = $4 limit 1', tg_table_name) into hit using new.id, f.type, f.id::text, key;
    if hit is not null then raise exception '% "%" is already used on another record. Duplicates are not allowed.', f.label, new.custom ->> f.id::text using errcode = '23505'; end if;
  end loop;
  return new; end $function$$pf239$;
  end if;
end
$guard239$;
do $guard240$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_unique_on' and p.pronargs=0) then
    execute $pf240$CREATE OR REPLACE FUNCTION private.crm_unique_on()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare tbl text := case new.entity when 'lead' then 'crm_leads' when 'contact' then 'contacts' when 'account' then 'crm_accounts' else 'crm_opportunities' end; dup boolean;
begin
  if new.unique_values and (tg_op = 'INSERT' or not old.unique_values) then
    execute format('select exists (select 1 from public.%I where private.crm_dup_key($1, custom -> $2) is not null group by private.crm_dup_key($1, custom -> $2) having count(*) > 1)', tbl) into dup using new.type, new.id::text;
    if dup then raise exception 'Two records already hold the same "%"; fix them before turning on Do not allow duplicate values.', new.label using errcode = '23505'; end if; end if;
  return new; end $function$$pf240$;
  end if;
end
$guard240$;
do $guard241$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_person_field_keys' and p.pronargs=0) then
    execute $pf241$CREATE OR REPLACE FUNCTION private.crm_person_field_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select array['roleInCompany', 'relationshipStatus', 'state', 'title', 'mobile', 'assistant', 'asstPhone', 'leadSource', 'agentSplit', 'licenseNo', 'salesVolumeLastYear',
    'dealsClosedLastYear', 'zillowUrl', 'contactType', 'tags', 'street', 'city', 'zip', 'county', 'description']
    || (select array_agg('links.' || k) from unnest(private.crm_link_keys()) k) $function$$pf241$;
  end if;
end
$guard241$;
do $guard242$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_carry_custom' and p.pronargs=0) then
    execute $pf242$CREATE OR REPLACE FUNCTION private.crm_carry_custom()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare lf record; t record; v jsonb; c jsonb; lab text; ov text;
begin
  if new.converted_contact_id is null or old.converted_contact_id is not null then return null; end if;
  select custom into c from public.contacts where id = new.converted_contact_id; c := coalesce(c, '{}');
  for lf in select * from public.crm_custom_fields where entity = 'lead' and archived_at is null loop
    v := new.custom -> lf.id::text; if v is null then continue; end if;
    select * into t from public.crm_custom_fields where entity = 'contact' and archived_at is null and lower(label) = lower(lf.label) and type = lf.type;
    if t.id is null or c ? t.id::text then continue; end if;
    if lf.type = 'dropdown' then lab := private.crm_option_label('cf:' || lf.id::text, v #>> '{}');
      select value into ov from public.crm_picklist_options where list_key = 'cf:' || t.id::text and lower(label) = lower(lab) and not retired;
      if ov is null then continue; end if; v := to_jsonb(ov); end if;
    c := c || jsonb_build_object(t.id::text, v); end loop;
  update public.contacts set custom = c where id = new.converted_contact_id and custom is distinct from c;
  return null; end $function$$pf242$;
  end if;
end
$guard242$;
do $guard243$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_list_check' and p.pronargs=6) then
    execute $pf243$CREATE OR REPLACE FUNCTION private.crm_list_check(k text, v text, p_old text, p_carried text, p_blank_ok boolean, p_label text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare lab text := coalesce(p_label, private.crm_list_label(k));
begin
  if v is null or v = '' then if p_blank_ok then return; end if; raise exception 'Pick a % from the list.', lab using errcode = '23514'; end if;
  if v is not distinct from p_old or v is not distinct from p_carried or private.crm_option_active(k, v) then return; end if;
  if exists (select 1 from public.crm_picklist_options where list_key = k and value = v) then
    raise exception '"%" is retired; pick another %.', private.crm_option_label(k, v), lab using errcode = '23514'; end if;
  raise exception 'Pick a % from the list.', lab using errcode = '23514'; end $function$$pf243$;
  end if;
end
$guard243$;
do $guard244$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_links_in' and p.pronargs=1) then
    execute $pf244$CREATE OR REPLACE FUNCTION private.crm_links_in(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare r jsonb := '{}'; k text; v text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return '{}'; end if;
  for k, v in select key, btrim(value #>> '{}') from jsonb_each(p) loop
    if v = '' then continue; end if;
    if v !~* '^[a-z][a-z0-9+.-]*:' then v := 'https://' || regexp_replace(v, '^/+', ''); end if;
    if not (k = any (private.crm_link_keys())) then raise exception 'Unknown link "%".', k using errcode = 'P0001'; end if;
    if not private.crm_url_ok(v) then raise exception 'Links must be http:// or https:// web addresses.' using errcode = 'P0001'; end if;
    r := r || jsonb_build_object(k, v); end loop;
  return r; end $function$$pf244$;
  end if;
end
$guard244$;
do $guard245$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_links_ok' and p.pronargs=1) then
    execute $pf245$CREATE OR REPLACE FUNCTION private.crm_links_ok(l jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select jsonb_typeof(l) = 'object' and not exists (select 1 from jsonb_each(l) e where not (e.key = any (private.crm_link_keys())) or jsonb_typeof(e.value) <> 'string' or not private.crm_url_ok(e.value #>> '{}')) $function$$pf245$;
  end if;
end
$guard245$;
do $guard246$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_url_in' and p.pronargs=1) then
    execute $pf246$CREATE OR REPLACE FUNCTION private.crm_url_in(v text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin v := btrim(coalesce(v, '')); if v = '' then return ''; end if;
  if v !~* '^[a-z][a-z0-9+.-]*:' then v := 'https://' || regexp_replace(v, '^/+', ''); end if;
  if not private.crm_url_ok(v) then raise exception 'Links must be http:// or https:// web addresses.' using errcode = 'P0001'; end if; return v; end $function$$pf246$;
  end if;
end
$guard246$;
do $guard247$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='list_demo_personas' and p.pronargs=0) then
    execute $pf247$CREATE OR REPLACE FUNCTION private.list_demo_personas()
 RETURNS TABLE(id uuid, first_name text, last_name text, role text, portal_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if not private.actor_is_super_admin() then
    raise exception 'Only an active Super admin can list demo users.' using errcode = '42501'; end if;
  return query
    select p.id, p.first_name, p.last_name, p.role, private.demo_portal_role(p.id)
    from public.profiles p
    where p.is_demo and p.status = 'active' and p.role not in ('Admin', 'Super admin') and not p.is_admin
    order by p.first_name, p.last_name;
end $function$$pf247$;
  end if;
end
$guard247$;
do $guard248$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_account_rules' and p.pronargs=0) then
    execute $pf248$CREATE OR REPLACE FUNCTION private.crm_account_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare d public.crm_accounts;
begin
  -- State: required for every write by a signed-in user (the app, CRM functions such as convert); owner-run maintenance with no caller is exempt
  if private.effective_uid() is not null and (tg_op = 'INSERT' or new.state is distinct from old.state or new.name is distinct from old.name) then
    if coalesce(new.state, '') = '' then raise exception 'State is required: pick a US state (or DC).' using errcode = '23514'; end if; end if;
  if tg_op = 'INSERT' or private.crm_company_key(new.name) <> private.crm_company_key(old.name) then
    select * into d from public.crm_accounts a where a.id <> new.id and private.crm_company_key(a.name) = private.crm_company_key(new.name) order by a.archived_at nulls first limit 1;
    if d.id is not null then
      raise exception 'Already in the CRM: % (%)%. Duplicates are not allowed.', d.name, coalesce(nullif(d.state, ''), 'no state'), case when d.archived_at is not null then ' (archived: restore it instead)' else '' end
        using errcode = '23505', detail = 'crm_account:' || d.id::text; end if; end if;
  return new; end $function$$pf248$;
  end if;
end
$guard248$;
do $guard249$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_email_guard' and p.pronargs=0) then
    execute $pf249$CREATE OR REPLACE FUNCTION private.crm_email_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'Email templates, folders, files and signatures are never deleted (retire or detach instead).' using errcode = 'P0001'; end if;
  if tg_table_name = 'crm_email_folders' then
    new.name := btrim(new.name); new.modified_by := coalesce(private.effective_uid(), new.modified_by); new.modified_at := now();
    if tg_op = 'INSERT' then new.created_by := coalesce(private.effective_uid(), new.created_by); new.created_at := now(); end if;
  elsif tg_table_name = 'crm_email_templates' then
    new.name := btrim(new.name); new.subject := btrim(new.subject); new.modified_by := coalesce(private.effective_uid(), new.modified_by); new.modified_at := now();
    if tg_op = 'INSERT' then new.created_by := coalesce(private.effective_uid(), new.created_by); new.created_at := now(); new.retired_at := null; new.retired_by := null;
    else
      if new.module is distinct from old.module then raise exception 'A template stays tied to its module; use Save As to make one for another module.' using errcode = 'P0001'; end if;
      if new.kind is distinct from old.kind then raise exception 'A written template cannot turn into a builder one (or back); use Save As.' using errcode = 'P0001'; end if;
      if (new.created_by, new.created_at) is distinct from (old.created_by, old.created_at) then raise exception 'Who made a template never changes.' using errcode = 'P0001'; end if;
      if new.retired_at is not null and old.retired_at is null then new.retired_by := coalesce(private.effective_uid(), new.retired_by); elsif new.retired_at is null then new.retired_by := null; end if;
    end if;
    if private.effective_uid() is not null and new.personal_owner is not null and new.personal_owner <> private.effective_uid() and (tg_op = 'INSERT' or new.personal_owner is distinct from old.personal_owner) then
      raise exception 'You can only save into shared folders or your own folder.' using errcode = '42501'; end if;
  elsif tg_table_name = 'crm_email_template_files' then
    if tg_op = 'INSERT' then
      if not exists (select 1 from public.crm_attachments a where a.id = new.attachment_id and a.entity = 'template' and a.entity_id = new.template_id) then
        raise exception 'That file was not uploaded to this template.' using errcode = 'P0001'; end if;
      new.attached_by := coalesce(private.effective_uid(), new.attached_by); new.attached_at := now(); new.detached_at := null; new.detached_by := null;
    else
      if (new.template_id, new.attachment_id) is distinct from (old.template_id, old.attachment_id) then raise exception 'A file link cannot move.' using errcode = 'P0001'; end if;
      new.detached_by := case when new.detached_at is null then null else coalesce(private.effective_uid(), new.detached_by) end;
    end if;
  else
    new.modified_at := now();
  end if;
  return new; end $function$$pf249$;
  end if;
end
$guard249$;
do $guard250$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_report_guard' and p.pronargs=0) then
    execute $pf250$CREATE OR REPLACE FUNCTION private.crm_report_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if tg_op = 'DELETE' then raise exception '% rows are never deleted; retire them instead.', tg_table_name using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' and coalesce(current_setting('crm.spawn', true), '') = '1' then return new; end if;   -- crm_report_touch: Last Accessed Date only
  new.modified_by := coalesce(private.effective_uid(), new.modified_by); new.modified_at := now();
  if tg_table_name = 'crm_report_folders' then
    new.name := btrim(new.name); if tg_op = 'INSERT' then new.created_by := coalesce(private.effective_uid(), new.created_by); end if; return new; end if;
  if tg_op = 'INSERT' then new.created_by := coalesce(private.effective_uid(), new.created_by); new.created_at := now(); new.retired_at := null;
    if private.effective_uid() is not null and new.personal_owner is not null and new.personal_owner <> private.effective_uid() then raise exception 'Save into your own folder or a shared one.' using errcode = '42501'; end if;
  else
    if new.created_by is distinct from old.created_by then raise exception 'A report''s creator never changes; clone it instead.' using errcode = 'P0001'; end if;
    if new.module is distinct from old.module then raise exception 'A report''s primary module never changes; create a new report instead.' using errcode = 'P0001'; end if;
    if private.effective_uid() is not null and new.personal_owner is not null and new.personal_owner is distinct from old.personal_owner and new.personal_owner <> private.effective_uid() then
      raise exception 'Save into your own folder or a shared one.' using errcode = '42501'; end if;
    if new.retired_at is not null and old.retired_at is null then new.retired_by := private.effective_uid(); end if;
  end if;
  return new; end $function$$pf250$;
  end if;
end
$guard250$;
do $guard251$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_section_guard' and p.pronargs=0) then
    execute $pf251$CREATE OR REPLACE FUNCTION private.crm_section_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'Sections are never deleted; hide an added section instead.' using errcode = 'P0001'; end if;
  new.label := btrim(new.label); new.modified_by := coalesce(private.effective_uid(), new.modified_by); new.modified_at := now();
  if tg_op = 'INSERT' then
    if private.effective_uid() is not null then new.builtin := false; end if;
    if (select count(*) from public.crm_layout_sections where entity = new.entity) >= 30 then raise exception 'At most 30 sections.' using errcode = 'P0001'; end if;
    if new.position = 0 then new.position := coalesce((select max(position) from public.crm_layout_sections where entity = new.entity), 0) + 1; end if;
  else
    if (new.entity, new.key, new.builtin) is distinct from (old.entity, old.key, old.builtin) then raise exception 'A section''s key never changes.' using errcode = 'P0001'; end if;
    if new.hidden and new.builtin then raise exception 'Built-in sections cannot be hidden.' using errcode = '23514'; end if;
    if new.hidden and not old.hidden and exists (select 1 from public.crm_custom_fields where entity = new.entity and section = new.key and archived_at is null) then
      raise exception 'Move the fields out of "%" before hiding it.', old.label using errcode = 'P0001'; end if;
  end if;
  return new; end $function$$pf251$;
  end if;
end
$guard251$;
do $guard252$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_settings_guard' and p.pronargs=0) then
    execute $pf252$CREATE OR REPLACE FUNCTION private.crm_settings_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_field uuid;
begin
  if tg_op = 'DELETE' then raise exception 'CRM settings are never deleted; retire the option or delete (hide) the field instead.' using errcode = 'P0001'; end if;
  if tg_table_name = 'crm_picklist_options' then
    new.label := btrim(new.label); new.modified_by := coalesce(private.effective_uid(), new.modified_by); new.modified_at := now();
    if tg_op = 'INSERT' then
      if new.list_key like 'cf:%' then v_field := substr(new.list_key, 4)::uuid;
        if not exists (select 1 from public.crm_custom_fields where id = v_field and type in ('dropdown', 'multiselect', 'radio')) then raise exception 'That dropdown field does not exist.' using errcode = 'P0002'; end if; end if;
      if (select count(*) from public.crm_picklist_options where list_key = new.list_key) >= 100 then raise exception 'A list can have at most 100 options.' using errcode = 'P0001'; end if;
      if new.position = 0 then new.position := coalesce((select max(position) from public.crm_picklist_options where list_key = new.list_key), 0) + 10; end if;
    else
      if (new.list_key, new.value) is distinct from (old.list_key, old.value) then raise exception 'An option''s stored value never changes; rename its label instead.' using errcode = 'P0001'; end if;
      if new.retired and not old.retired then
        if private.crm_locked_option(new.list_key, new.value) then raise exception '"%" cannot be retired: the CRM depends on it.', old.label using errcode = 'P0001'; end if;
        if not exists (select 1 from public.crm_picklist_options where list_key = new.list_key and value <> new.value and not retired) then
          raise exception 'Each list keeps at least one active option.' using errcode = 'P0001'; end if; end if;
    end if;
  elsif tg_table_name = 'crm_custom_fields' then
    new.label := btrim(new.label); new.modified_by := coalesce(private.effective_uid(), new.modified_by); new.modified_at := now();
    if tg_op = 'INSERT' then new.created_by := coalesce(private.effective_uid(), new.created_by); new.created_at := now();
      if (select count(*) from public.crm_custom_fields where entity = new.entity) >= 50 then raise exception 'At most 50 custom fields per record type.' using errcode = 'P0001'; end if;
      if new.position = 0 then new.position := coalesce((select max(position) from public.crm_custom_fields where entity = new.entity), 0) + 10; end if;
    elsif (new.entity, new.type) is distinct from (old.entity, old.type) then raise exception 'A field''s record type and field type never change (stored values depend on them); add a new field instead.' using errcode = 'P0001'; end if;
  else
    new.modified_by := coalesce(private.effective_uid(), new.modified_by); new.modified_at := now();
  end if;
  return new; end $function$$pf252$;
  end if;
end
$guard252$;
do $guard253$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_task_repeat' and p.pronargs=0) then
    execute $pf253$CREATE OR REPLACE FUNCTION private.crm_task_repeat()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_due date;
begin
  if new.kind = 'task' and new.status = 'Completed' and not new.cancelled and old.status <> 'Completed' and new.repeat_every <> '' and new.due_date is not null then
    v_due := private.crm_next_due(new.due_date, new.repeat_every, new.repeat_anchor_day);
    if v_due is not null and (new.repeat_until is null or v_due <= new.repeat_until) then
      perform set_config('crm.spawn', '1', true);
      insert into public.crm_activities (entity, entity_id, kind, subject, body, status, due_date, owner_id, priority, reminder, reminder_at, repeat_every, repeat_until, repeat_anchor_day, repeat_of, created_by)
        values (new.entity, new.entity_id, 'task', new.subject, new.body, 'Not Started', v_due, new.owner_id, new.priority, new.reminder,
          case when new.reminder then new.reminder_at + (v_due - new.due_date) * interval '1 day' end, new.repeat_every, new.repeat_until, coalesce(new.repeat_anchor_day, extract(day from new.due_date)::int), new.id, coalesce(private.effective_uid(), new.created_by));
      perform set_config('crm.spawn', '', true); end if; end if;
  return null; end $function$$pf253$;
  end if;
end
$guard253$;
do $guard254$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='deal_disbursement_audit' and p.pronargs=0) then
    execute $pf254$CREATE OR REPLACE FUNCTION private.deal_disbursement_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare f text; o numeric; n numeric;
begin
  if tg_op = 'DELETE' then raise exception 'Disbursement Details are never deleted; clear a field instead.' using errcode = 'P0001'; end if;
  new.updated_by := coalesce(private.effective_uid(), new.updated_by); new.updated_at := now();
  if (tg_op = 'INSERT' and new.disbursement_date is not null) or (tg_op = 'UPDATE' and new.disbursement_date is distinct from old.disbursement_date) then
    insert into public.deal_disbursement_log (deal_id, field_key, old_date, new_date, changed_by) values (new.deal_id, 'disbursement_date', case when tg_op = 'UPDATE' then old.disbursement_date end, new.disbursement_date, new.updated_by); end if;
  foreach f in array array['actual_revenue', 'net_title_insurance', 'settlement_fee', 'net_endorsement_fee', 'qualia_fee', 'shipping_fee', 'national_title_resource', 'notary_fee', 'searches_fee'] loop
    execute format('select ($1).%I, ($2).%I', f, f) into n, o using new, (case when tg_op = 'UPDATE' then old else null::public.deal_disbursements end);
    if n is distinct from o then insert into public.deal_disbursement_log (deal_id, field_key, old_amount, new_amount, changed_by) values (new.deal_id, f, o, n, new.updated_by); end if;
  end loop;
  return new; end $function$$pf254$;
  end if;
end
$guard254$;
do $guard255$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='deal_legacy_sales' and p.pronargs=0) then
    execute $pf255$CREATE OR REPLACE FUNCTION private.deal_legacy_sales()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if new.sales_person_id is not null then
    insert into public.deal_sales_people (deal_id, sales_id, added_by) values (new.id, new.sales_person_id, coalesce(private.effective_uid(), new.created_by)) on conflict do nothing;
    update public.deals set sales_person_id = null where id = new.id;
  end if; return null; end $function$$pf255$;
  end if;
end
$guard255$;
do $guard256$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='funding_guard' and p.pronargs=0) then
    execute $pf256$CREATE OR REPLACE FUNCTION private.funding_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
 if tg_op='DELETE' then raise exception 'Funding rows are soft-deleted only.' using errcode='42501'; end if;
 if tg_op='INSERT' then new.created_by:=coalesce(private.effective_uid(),new.created_by); end if;
 if tg_op='UPDATE' and new.deal_id<>old.deal_id then raise exception 'Funding records cannot move orders.' using errcode='P0001'; end if;
 new.updated_at:=now();new.updated_by:=private.effective_uid();if new.deleted_at is not null then new.deleted_by:=coalesce(new.deleted_by,private.effective_uid());end if;
 if tg_table_name='funding_records' then
  if new.status='disbursed' and (tg_op='INSERT' or old.status is distinct from 'disbursed') then
   if not new.balanced_with_lender or new.wire_team_notified_at is null then raise exception 'Balanced/confirmed with lender and wire-team notification are required before disbursement.' using errcode='23514';end if;
   if exists(select 1 from public.funding_funds f where f.deal_id=new.deal_id and f.deleted_at is null and (f.status<>'received' or f.pending))
     or (select count(*) from public.funding_funds f where f.deal_id=new.deal_id and f.deleted_at is null)<3 then raise exception 'EMD, buyer and lender funds must be received and processed.' using errcode='23514';end if;
   if (select count(*) from public.funding_checks c where c.deal_id=new.deal_id and c.deleted_at is null and c.passed is true)<5 then raise exception 'All five document and ALTA checks must pass.' using errcode='23514';end if;
   if exists(select 1 from public.funding_disbursements d where d.deal_id=new.deal_id and d.deleted_at is null and d.status<>'void' and (not d.invoice_verified or not d.printed or d.invoice_payee<>d.payee or d.invoice_address<>d.address or (d.method in ('check','overnight') and d.fedex_tracking=''))) then raise exception 'Checks must match invoices, be printed and have FedEx tracking.' using errcode='23514';end if;
  end if;
 end if;
 return new;
end $function$$pf256$;
  end if;
end
$guard256$;
do $guard257$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='hr_doc_hist' and p.pronargs=7) then
    execute $pf257$CREATE OR REPLACE FUNCTION private.hr_doc_hist(p_table text, p_row uuid, p_emp uuid, p_field text, p_old text, p_new text, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare nm text; begin
  select btrim(first_name || ' ' || last_name) into nm from public.profiles where id = private.effective_uid();
  insert into public.hr_change_history (table_name, row_id, employee_id, field, old_value, new_value, action, changed_by, changed_by_name)
    values (p_table, p_row, p_emp, p_field, coalesce(p_old, ''), coalesce(p_new, ''), p_action, private.effective_uid(), coalesce(nm, ''));
end $function$$pf257$;
  end if;
end
$guard257$;
do $guard258$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='hr_my_employee' and p.pronargs=0) then
    execute $pf258$CREATE OR REPLACE FUNCTION private.hr_my_employee()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select e.id from public.hr_employees e join public.profiles p on p.id = e.profile_id
  where e.profile_id = private.effective_uid() and e.archived_at is null and p.status = 'active' and p.role <> 'Outside user' $function$$pf258$;
  end if;
end
$guard258$;
do $guard259$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_admin' and p.pronargs=0) then
    execute $pf259$CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $cap$
  select coalesce((select is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false) $cap$$pf259$;
  end if;
end
$guard259$;
do $guard260$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_super_admin' and p.pronargs=0) then
    execute $pf260$CREATE OR REPLACE FUNCTION private.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((select role = 'Super admin' and is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false) $function$$pf260$;
  end if;
end
$guard260$;
do $guard261$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='log_activity' and p.pronargs=5) then
    execute $pf261$CREATE OR REPLACE FUNCTION private.log_activity(p_deal uuid, p_action text, p_entity text, p_id uuid, p_detail text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  insert into public.activity_log (deal_id, actor_id, action, entity, entity_id, detail) values (p_deal, private.effective_uid(), p_action, p_entity, p_id, left(p_detail, 300)) $function$$pf261$;
  end if;
end
$guard261$;
do $guard262$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='me_role' and p.pronargs=0) then
    execute $pf262$CREATE OR REPLACE FUNCTION private.me_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $cap$
  select role from public.profiles where id = private.effective_uid() and status = 'active' $cap$$pf262$;
  end if;
end
$guard262$;
do $guard263$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='my_contact_id' and p.pronargs=0) then
    execute $pf263$CREATE OR REPLACE FUNCTION private.my_contact_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $cap$
  select id from public.contacts where profile_id = private.effective_uid() $cap$$pf263$;
  end if;
end
$guard263$;
do $guard264$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='my_team_agents' and p.pronargs=0) then
    execute $pf264$CREATE OR REPLACE FUNCTION private.my_team_agents()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select a.profile_id from public.team_members c join public.team_members a on a.team_id = c.team_id and a.member_role = 'agent'
  join public.profiles p on p.id = a.profile_id and p.status = 'active'
  where c.profile_id = private.effective_uid() and c.member_role = 'coordinator' $function$$pf264$;
  end if;
end
$guard264$;
do $guard265$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='my_team_ids' and p.pronargs=0) then
    execute $pf265$CREATE OR REPLACE FUNCTION private.my_team_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select team_id from public.team_members where profile_id = private.effective_uid() $function$$pf265$;
  end if;
end
$guard265$;
do $guard266$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='notify' and p.pronargs=5) then
    execute $pf266$CREATE OR REPLACE FUNCTION private.notify(p_ids uuid[], p_kind text, p_deal uuid, p_title text, p_link text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  insert into public.notifications (profile_id, kind, deal_id, title, link)
  select distinct x, p_kind, p_deal, left(p_title, 200), coalesce(p_link, '') from unnest(p_ids) x join public.profiles p on p.id = x and p.status = 'active'
  where x is distinct from private.effective_uid() $function$$pf266$;
  end if;
end
$guard266$;
do $guard267$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='owns_participant' and p.pronargs=1) then
    execute $pf267$CREATE OR REPLACE FUNCTION private.owns_participant(p uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select exists (select 1 from public.deal_participants dp join public.contacts c on c.id = dp.contact_id
    join public.profiles pr on pr.id = c.profile_id and pr.status = 'active' where dp.id = p and c.profile_id = private.effective_uid()) $function$$pf267$;
  end if;
end
$guard267$;
do $guard268$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='policy_guard' and p.pronargs=0) then
    execute $pf268$CREATE OR REPLACE FUNCTION private.policy_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$begin
 if tg_op='DELETE' then raise exception 'Final Policy rows are soft-deleted only.' using errcode='42501';end if;
 if tg_op='UPDATE' and new.deal_id<>old.deal_id then raise exception 'Policy cannot move orders.' using errcode='P0001';end if;
 if tg_table_name='policy_records' then
 if new.status in ('issued','completed') then
  if not(new.balanced_funded and new.deed and new.dot and new.closing_instructions and new.notes_reviewed and new.deed_vesting_matches and new.deed_price_matches and new.deed_estate_matches and new.borrower_matches and new.lender_matches and new.trustee_matches and new.amount_matches and new.riders_attached and coalesce(new.rates_changed,false)=false) then raise exception 'All policy pre-checks, deed, DOT and unchanged rates are required.' using errcode='23514';end if;
  if new.owner_premium is distinct from new.alta_owner_collected or new.lender_premium is distinct from new.alta_lender_collected then raise exception 'Policy premiums must exactly match combined ALTA collected.' using errcode='23514';end if;
  if exists(select 1 from public.policy_escalations e where e.deal_id=new.deal_id and e.status='open' and e.deleted_at is null) then raise exception 'Open policy escalations block issuance.' using errcode='23514';end if;
  if (new.issue_owner and new.owner_signatory='') or (new.issue_lender and new.lender_signatory='') then raise exception 'Policy signatories required.' using errcode='23514';end if;
 end if;
 if new.status='completed' then
  if new.issued_at is null then raise exception 'Issue before completing.' using errcode='23514';end if;
  if (select count(*) from public.policy_checks c where c.deal_id=new.deal_id and c.deleted_at is null and c.passed)<9 then raise exception 'All nine signature/Schedule A checks required.' using errcode='23514';end if;
  if (new.issue_owner and new.owner_document_id is null) or (new.issue_lender and new.lender_document_id is null) then raise exception 'Both final policies must be filed in 700 Recorded Documents and Policies.' using errcode='23514';end if;
 end if;
 end if;
 new.updated_at:=now();new.updated_by:=private.effective_uid();if tg_op='INSERT' then new.created_by:=coalesce(private.effective_uid(),new.created_by);end if;if new.deleted_at is not null then new.deleted_by:=coalesce(new.deleted_by,private.effective_uid());end if;return new;end $function$$pf268$;
  end if;
end
$guard268$;
do $guard269$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='post_closing_touch' and p.pronargs=0) then
    execute $pf269$CREATE OR REPLACE FUNCTION private.post_closing_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ begin
 if tg_op='INSERT' then new.created_at:=coalesce(new.created_at,now()); new.created_by:=coalesce(new.created_by,private.effective_uid()); end if;
 if tg_op='UPDATE' then new.created_at:=old.created_at; new.created_by:=old.created_by; end if; new.updated_at:=now(); new.updated_by:=coalesce(private.effective_uid(),new.updated_by); return new; end $function$$pf269$;
  end if;
end
$guard269$;
do $guard270$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='remind_closing_locations' and p.pronargs=1) then
    execute $pf270$CREATE OR REPLACE FUNCTION private.remind_closing_locations(p_deal uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare r record; nid uuid; oid uuid; n int := 0; today date := (now() at time zone 'America/New_York')::date; t text;
begin
  for r in select d.id deal_id, d.street, d.state, dp.id participant_id, dp.role, pr.id profile_id, pr.email
      from public.deals d join public.deal_participants dp on dp.deal_id = d.id and dp.role in ('Client-Buyer', 'Client-Seller')
      join public.contacts c on c.id = dp.contact_id join public.profiles pr on pr.id = c.profile_id and pr.status = 'active'
      left join public.closing_party_locations l on l.participant_id = dp.id
      where (p_deal is null or d.id = p_deal) and d.status = 'Open' and d.scheduled_at is null and l.in_state_at_closing is null
        and not exists (select 1 from public.closing_location_reminders x where x.participant_id = dp.id and x.profile_id = pr.id and x.reminded_on = today) loop
    t := 'Please tell us where you will be at closing for ' || r.street;
    insert into public.notifications (profile_id, kind, deal_id, title, link) values (r.profile_id, 'closing_location', r.deal_id, left(t, 200), '#/deals/' || r.deal_id || '/closing') returning id into nid;
    insert into public.outbox (to_profile_id, to_email, subject, body, deal_id, created_by) values (r.profile_id, r.email, t,
      'Will you be in ' || r.state || ' at the time of closing? If you will be in another state or outside the US, CLA Title will arrange a remote (RON), embassy or out-of-state signing.', r.deal_id, private.effective_uid()) returning id into oid;
    insert into public.closing_location_reminders (deal_id, participant_id, profile_id, party_role, reminded_on, notification_id, outbox_id, created_by)
      values (r.deal_id, r.participant_id, r.profile_id, r.role, today, nid, oid, private.effective_uid());
    n := n + 1; end loop;
  return n; end $function$$pf270$;
  end if;
end
$guard270$;
do $guard271$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='title_touch' and p.pronargs=0) then
    execute $pf271$CREATE OR REPLACE FUNCTION private.title_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if tg_op = 'INSERT' then new.created_at := coalesce(new.created_at, now()); new.created_by := coalesce(new.created_by, private.effective_uid()); end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; new.created_by := old.created_by; end if;
  new.updated_at := now(); new.updated_by := coalesce(private.effective_uid(), new.updated_by);
  if new.deleted_at is not null and new.deleted_by is null then new.deleted_by := private.effective_uid(); end if;
  return new;
end $function$$pf271$;
  end if;
end
$guard271$;
do $guard272$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='trg_doc_share_guard' and p.pronargs=0) then
    execute $pf272$CREATE OR REPLACE FUNCTION private.trg_doc_share_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if tg_op = 'INSERT' then
    if private.effective_uid() is not null and (new.shared_with_client or new.shared_with_client_by is not null or new.shared_with_client_at is not null) then
      new.shared_with_client := false; new.shared_with_client_by := null; new.shared_with_client_at := null; end if;
    if private.effective_uid() is not null and (new.shared_with_seller or new.shared_with_seller_by is not null or new.shared_with_seller_at is not null) then
      new.shared_with_seller := false; new.shared_with_seller_by := null; new.shared_with_seller_at := null; end if;
    return new; end if;
  if ((new.shared_with_client, new.shared_with_client_by, new.shared_with_client_at) is distinct from (old.shared_with_client, old.shared_with_client_by, old.shared_with_client_at)
      or (new.shared_with_seller, new.shared_with_seller_by, new.shared_with_seller_at) is distinct from (old.shared_with_seller, old.shared_with_seller_by, old.shared_with_seller_at))
     and private.effective_uid() is not null and coalesce(current_setting('cla.doc_share', true), '') <> 'on' then
    raise exception 'Use Share with buyer / Share with seller (CLA Title staff) to change this.' using errcode = '42501'; end if;
  return new; end $function$$pf272$;
  end if;
end
$guard272$;
do $guard273$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='viewer_is_demo' and p.pronargs=0) then
    execute $pf273$CREATE OR REPLACE FUNCTION private.viewer_is_demo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $cap$
  select coalesce((select p.is_demo from public.profiles p where p.id = private.effective_uid() and p.status = 'active'), false)
$cap$$pf273$;
  end if;
end
$guard273$;
do $guard274$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='wire_guard' and p.pronargs=0) then
    execute $pf274$CREATE OR REPLACE FUNCTION private.wire_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ declare st text;begin
 if tg_op='DELETE' then raise exception 'Wire rows are never deleted.' using errcode='42501';end if;
 if tg_op='UPDATE' and new.deal_id<>old.deal_id then raise exception 'Wire cannot move orders.' using errcode='P0001';end if;
 if new.from_account_id is not null then select state into st from public.escrow_accounts where id=new.from_account_id;if st is null or st<>(select state from public.deals where id=new.deal_id) then raise exception 'Escrow account must match the file state.' using errcode='23514';end if;end if;
 if tg_table_name='wire_records' and new.status='Verified' and not(new.all_sellers_signed and new.notarized and new.payee_name_matches and new.payee_address_matches and new.audit_amount and new.audit_account_name and new.audit_account_number and new.audit_aba and new.audit_purpose and new.disbursement_method='wire' and new.amount>0 and new.account_last4~'^[0-9]{4}$' and new.aba_last4~'^[0-9]{4}$' and new.beneficiary_message<>'') then raise exception 'Signatures, notary, payee/address and full post-draft audit are required.' using errcode='23514';end if;
 if tg_table_name='wire_records' and new.posted_at is not null and (new.status<>'Verified' or new.verified_at is null or new.queue_status<>'Done') then raise exception 'Verify before posting; queue must be Done.' using errcode='23514';end if;
 new.updated_at:=now();new.updated_by:=private.effective_uid();if tg_op='INSERT' then new.created_by:=coalesce(private.effective_uid(),new.created_by);end if;return new;end $function$$pf274$;
  end if;
end
$guard274$;
do $guard275$
begin
  -- crm_activities is created by 20261105222910_crm.sql, which runs after this file.
  -- The return type cannot be named until that table exists.
  if to_regclass('public.crm_activities') is not null
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_call_reminders' and p.pronargs=0) then
    execute $pf275$CREATE OR REPLACE FUNCTION public.crm_call_reminders()
 RETURNS SETOF crm_activities
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select * from public.crm_activities where kind = 'call' and call_status = 'Scheduled' and owner_id = private.effective_uid() and call_reminder_at <= now() order by call_reminder_at $function$$pf275$;
  end if;
end
$guard275$;
do $guard276$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='demo_view_status_for' and p.pronargs=1) then
    execute $pf276$CREATE OR REPLACE FUNCTION private.demo_view_status_for(p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare s private.view_as_sessions; t public.profiles;
begin
  perform private.expire_demo_view(p_actor);
  select * into s from private.view_as_sessions v
    where v.actor_id = p_actor and v.stopped_at is null and v.expires_at > pg_catalog.now();
  if s.actor_id is null then
    return jsonb_build_object('active', false, 'actor_id', p_actor);
  end if;
  select * into t from public.profiles where id = s.target_id;
  return jsonb_build_object(
    'active', true,
    'actor_id', p_actor,
    'target_id', s.target_id,
    'target_name', btrim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')),
    'role', t.role,
    'portal_role', private.demo_portal_role(s.target_id),
    'expires_at', s.expires_at);
end $function$$pf276$;
  end if;
end
$guard276$;
do $guard277$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='phone_or_raise' and p.pronargs=2) then
    execute $pf277$CREATE OR REPLACE FUNCTION private.phone_or_raise(v text, label text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare r text := private.fmt_phone(v);
begin if r is null then raise exception '% must be a 10-digit phone number (xxx-xxx-xxxx).', label using errcode = 'P0001'; end if; return r; end $function$$pf277$;
  end if;
end
$guard277$;
do $guard278$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='hr_audit' and p.pronargs=0) then
    execute $pf278$CREATE OR REPLACE FUNCTION private.hr_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare n jsonb := to_jsonb(new); o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end; k text; act text;
  who uuid := coalesce(private.effective_uid(), (n ->> 'updated_by')::uuid, (n ->> 'assigned_by')::uuid, (n ->> 'created_by')::uuid); nm text; emp uuid;
  skip text[] := array['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'archived_by', 'token_hash'];
begin
  select btrim(first_name || ' ' || last_name) into nm from public.profiles where id = who;
  emp := case when tg_table_name = 'hr_employees' then new.id when tg_table_name in ('hr_role_assignments', 'hr_invites') then (n ->> 'employee_id')::uuid end;
  if tg_table_name = 'hr_role_assignments' then
    if tg_op = 'INSERT' then insert into public.hr_change_history (table_name, row_id, employee_id, field, old_value, new_value, action, changed_by, changed_by_name)
      values (tg_table_name, new.id, emp, 'hr_manager', 'No', 'Yes', 'assign', who, coalesce(nm, ''));
    elsif (o ->> 'removed_at') is null and (n ->> 'removed_at') is not null then insert into public.hr_change_history (table_name, row_id, employee_id, field, old_value, new_value, action, changed_by, changed_by_name)
      values (tg_table_name, new.id, emp, 'hr_manager', 'Yes', 'No', 'remove', who, coalesce(nm, '')); end if;
    return null; end if;
  if tg_table_name = 'hr_invites' then
    act := case when tg_op = 'INSERT' then 'invite' when (o ->> 'accepted_at') is null and (n ->> 'accepted_at') is not null then 'invite_accepted'
      when (o ->> 'revoked_at') is null and (n ->> 'revoked_at') is not null then 'invite_revoked' end;
    if act is not null then insert into public.hr_change_history (table_name, row_id, employee_id, field, old_value, new_value, action, changed_by, changed_by_name)
      values (tg_table_name, new.id, emp, 'invite', '', case act when 'invite' then 'Invite link created (expires ' || to_char(new.expires_at, 'YYYY-MM-DD') || ', nothing sent)'
        when 'invite_accepted' then 'Login set up' else 'Invite link revoked' end, act, coalesce(private.effective_uid(), who), coalesce(nm, '')); end if;
    return null; end if;
  act := case when tg_op = 'INSERT' then 'create' when (o ->> 'archived_at') is null and (n ->> 'archived_at') is not null then 'archive'
    when (o ->> 'archived_at') is not null and (n ->> 'archived_at') is null then 'restore' else 'update' end;
  for k in select key from jsonb_object_keys(n) key where not (key = any (skip)) order by key loop
    if tg_op = 'INSERT' and coalesce(n ->> k, '') = '' then continue; end if;
    if tg_op = 'UPDATE' and (o -> k) is not distinct from (n -> k) then continue; end if;
    insert into public.hr_change_history (table_name, row_id, employee_id, field, old_value, new_value, action, changed_by, changed_by_name)
      values (tg_table_name, new.id, emp, k, case when tg_op = 'UPDATE' then private.hr_show(k, o ->> k) else '' end, private.hr_show(k, n ->> k),
        case when k = 'archived_at' then act when act in ('archive', 'restore') then 'update' else act end, who, coalesce(nm, ''));
  end loop;
  return null;
end $function$$pf278$;
  end if;
end
$guard278$;
do $guard279$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='view_as_readonly' and p.pronargs=0) then
    execute $pf279$CREATE OR REPLACE FUNCTION private.view_as_readonly()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if private.is_viewing_as() then
    raise exception 'View as is read-only. Go back to your account to make changes.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $function$$pf279$;
  end if;
end
$guard279$;
do $guard280$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='agent_profile_write' and p.pronargs=2) then
    execute $pf280$CREATE OR REPLACE FUNCTION private.agent_profile_write(pid uuid, p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare cell text := coalesce(p ->> 'cellPhone', ''); off text := coalesce(p ->> 'officePhone', ''); bm int := nullif(p ->> 'birthMonth', '')::int; bd int := nullif(p ->> 'birthDay', '')::int;
begin
  if p ? 'cellPhone' and length(regexp_replace(cell, '\D', '', 'g')) <> 10 then raise exception 'Cell phone must be a 10-digit phone number.' using errcode = '22023'; end if;
  if off <> '' and length(regexp_replace(off, '\D', '', 'g')) <> 10 then raise exception 'Office phone must be a 10-digit phone number.' using errcode = '22023'; end if;
  if (p ? 'birthMonth' or p ? 'birthDay') and not private.month_day_ok(bm, bd) then raise exception 'Date of birth must be a real month and day.' using errcode = '22023'; end if;
  insert into public.agent_profiles (profile_id) values (pid) on conflict (profile_id) do nothing;
  update public.agent_profiles set cell_phone = case when p ? 'cellPhone' then cell else cell_phone end, office_phone = case when p ? 'officePhone' then off else office_phone end,
    brokerage = coalesce(p ->> 'brokerage', brokerage), license_number = coalesce(p ->> 'licenseNumber', license_number), street = coalesce(p ->> 'street', street), city = coalesce(p ->> 'city', city),
    state = upper(coalesce(p ->> 'state', state)), zip = coalesce(p ->> 'zip', zip), other_contact = coalesce(p ->> 'otherContact', other_contact),
    photo_path = case when p ? 'photoPath' then nullif(p ->> 'photoPath', '') else photo_path end, photo_shape = coalesce(p ->> 'photoShape', photo_shape), updated_at = now() where profile_id = pid;
  if p ? 'birthMonth' or p ? 'birthDay' then insert into public.agent_private (profile_id, birth_month, birth_day, updated_by) values (pid, bm, bd, pid)
    on conflict (profile_id) do update set birth_month = excluded.birth_month, birth_day = excluded.birth_day, updated_at = now(), updated_by = excluded.updated_by; end if;
end $function$$pf280$;
  end if;
end
$guard280$;
do $guard281$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='nearest_cla_office' and p.pronargs=2) then
    execute $pf281$CREATE OR REPLACE FUNCTION private.nearest_cla_office(p_state text, p_county text)
 RETURNS TABLE(office_id text, reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  (select o.id, 'county'::text from public.office_counties c join public.offices o on o.id = c.office_id and o.active
     where c.removed_at is null and c.state = upper(btrim(coalesce(p_state, ''))) and private.norm_county(c.county) = private.norm_county(p_county) and private.norm_county(p_county) <> '' order by o.sort_order limit 1)
  union all
  (select o.id, 'state' from public.offices o where o.active and o.state = upper(btrim(coalesce(p_state, ''))) order by o.is_main_office_for_state desc, o.sort_order limit 1)
  union all (select null::text, 'none')
  limit 1 $function$$pf281$;
  end if;
end
$guard281$;
do $guard282$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='office_before' and p.pronargs=0) then
    execute $pf282$CREATE OR REPLACE FUNCTION private.office_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare clash text;
begin
  new.name := btrim(new.name); new.address_line1 := btrim(new.address_line1); new.address_line2 := btrim(coalesce(new.address_line2, '')); new.city := btrim(new.city);
  new.main_phone := private.fmt_phone(new.main_phone); new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.updated_at := now(); new.updated_by := coalesce(private.effective_uid(), new.updated_by);
  if tg_op = 'INSERT' then new.created_at := now(); new.created_by := coalesce(private.effective_uid(), new.created_by);
    if new.sort_order = 0 then new.sort_order := coalesce((select max(sort_order) from public.offices), 0) + 1; end if;
  else
    if new.id <> old.id then raise exception 'An office id cannot change.' using errcode = 'P0001'; end if;
    if new.state <> old.state and exists (select 1 from public.office_counties where office_id = new.id and removed_at is null and state <> new.state) then
      raise exception 'Take this office''s counties off before moving it to another state.' using errcode = 'P0001'; end if;
    if new.active and not old.active then   -- reactivating: its counties must still be free, and a state keeps one main office
      select string_agg(c.county || ' (' || c.state || ') is already served by ' || o.name, '; ') into clash from public.office_counties c
        join public.office_counties c2 on c2.state = c.state and private.norm_county(c2.county) = private.norm_county(c.county) and c2.office_id <> c.office_id and c2.removed_at is null
        join public.offices o on o.id = c2.office_id and o.active where c.office_id = new.id and c.removed_at is null;
      if clash is not null then raise exception '%. Take it off that office first.', clash using errcode = '23505'; end if;
      if new.is_main_office_for_state and exists (select 1 from public.offices where id <> new.id and state = new.state and active and is_main_office_for_state) then new.is_main_office_for_state := false; end if;
    end if;
  end if;
  -- one main office per state: making this one main moves the flag
  if new.is_main_office_for_state and new.active then
    update public.offices set is_main_office_for_state = false where id <> new.id and state = new.state and active and is_main_office_for_state; end if;
  return new; end $function$$pf282$;
  end if;
end
$guard282$;
do $guard283$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='office_county_before' and p.pronargs=0) then
    execute $pf283$CREATE OR REPLACE FUNCTION private.office_county_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare o public.offices; by_ text;
begin
  select * into o from public.offices where id = new.office_id;
  if tg_op = 'INSERT' then new.added_at := now(); new.added_by := coalesce(private.effective_uid(), new.added_by); end if;
  if tg_op = 'UPDATE' then
    if new.office_id <> old.office_id or new.state <> old.state or new.county <> old.county then raise exception 'Add the county again instead of renaming it.' using errcode = 'P0001'; end if;
    if new.removed_at is not null and old.removed_at is null then new.removed_by := coalesce(private.effective_uid(), new.removed_by); end if;
    if new.removed_at is null and old.removed_at is not null then new.removed_by := null; new.added_at := now(); new.added_by := coalesce(private.effective_uid(), new.added_by); end if;
  end if;
  if new.removed_at is null then
    if new.state <> o.state then raise exception 'An office serves counties in its own state only.' using errcode = 'P0001'; end if;
    if o.active then select x.name into by_ from public.office_counties c join public.offices x on x.id = c.office_id and x.active
        where c.office_id <> new.office_id and c.state = new.state and private.norm_county(c.county) = private.norm_county(new.county) and c.removed_at is null limit 1;
      if by_ is not null then raise exception '% (%) is already served by %. Take it off that office first.', new.county, new.state, by_ using errcode = '23505'; end if; end if;
  end if;
  return new; end $function$$pf283$;
  end if;
end
$guard283$;
do $guard284$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_touch_contact' and p.pronargs=0) then
    execute $pf284$CREATE OR REPLACE FUNCTION private.crm_touch_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if new.entity = 'contact' and new.kind in ('call', 'email', 'meeting') and new.occurred_on <= private.office_today() and not (new.kind = 'call' and new.call_status = 'Scheduled') then
    update public.contacts set last_contacted_on = new.occurred_on where id = new.entity_id and (last_contacted_on is null or last_contacted_on < new.occurred_on); end if;
  return null; end $function$$pf284$;
  end if;
end
$guard284$;
do $guard285$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='deal_refi_guard' and p.pronargs=0) then
    execute $pf285$CREATE OR REPLACE FUNCTION private.deal_refi_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare chg boolean := tg_op = 'INSERT' or new.transaction_type is distinct from old.transaction_type;
begin
  if new.transaction_type = 'Refinance' then
    if new.purchase_price is not null and (chg or new.purchase_price is distinct from old.purchase_price) then
      raise exception 'A refinance has no purchase price. Leave it empty.' using errcode = '23514'; end if;
    if new.emd_amount is not null and (chg or new.emd_amount is distinct from old.emd_amount) then
      raise exception 'A refinance has no EMD amount. Leave it empty.' using errcode = '23514'; end if;
    if new.emd_due_date is not null and (chg or new.emd_due_date is distinct from old.emd_due_date) then
      raise exception 'A refinance has no EMD due date. Leave it empty.' using errcode = '23514'; end if;
    if tg_op = 'UPDATE' and chg and exists (select 1 from public.deal_participants p where p.deal_id = new.id and private.refi_blocked_role(p.role)) then
      raise exception 'This order still has a seller, realtor or transaction coordinator; remove them before making it a refinance.' using errcode = '23514'; end if;
  end if;
  return new; end $function$$pf285$;
  end if;
end
$guard285$;
do $guard286$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='participant_refi_guard' and p.pronargs=0) then
    execute $pf286$CREATE OR REPLACE FUNCTION private.participant_refi_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if private.refi_blocked_role(new.role) and exists (select 1 from public.deals d where d.id = new.deal_id and d.transaction_type = 'Refinance')
     and (tg_op = 'INSERT' or new.role is distinct from old.role or new.deal_id is distinct from old.deal_id) then
    raise exception 'A refinance has no sellers, realtors or transaction coordinator. Its people are the borrower(s), salespeople, the Processor and the Lender.' using errcode = '23514'; end if;
  return new; end $function$$pf286$;
  end if;
end
$guard286$;
do $guard287$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='make_agent_tasks' and p.pronargs=1) then
    execute $pf287$CREATE OR REPLACE FUNCTION private.make_agent_tasks(p_part uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare p public.deal_participants; owner uuid; n int;
begin
  select * into p from public.deal_participants where id = p_part;
  if not found or p.role not in ('Buyer Agent', 'Listing Agent') then return 0; end if;
  if not exists (select 1 from public.deals where id = p.deal_id and status = 'Open') then return 0; end if;
  select profile_id into owner from public.contacts where id = p.contact_id; if owner is null then return 0; end if;
  insert into public.tasks (deal_id, title, description, assigned_role, status, due_date, created_by, kind, participant_id, owner_profile_id, template_code, template_version)
  select p.deal_id, a.title, a.about, p.role, 'todo', current_date + a.due_days, private.effective_uid(), 'agent', p.id, owner, a.code, 1 from private.agent_task_defs() a
  where private.task_enabled(a.code) and not exists (select 1 from public.tasks x where x.participant_id = p.id and x.template_code = a.code and x.status <> 'cancelled');
  get diagnostics n = row_count; return n; end $function$$pf287$;
  end if;
end
$guard287$;
do $guard288$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='template_guard' and p.pronargs=0) then
    execute $pf288$CREATE OR REPLACE FUNCTION private.template_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if cardinality(new.agent_roles) > 0 and private.template_locked(new.client_only, new.fields) then
    raise exception 'This is a personal item (ID, identity, signatures, banking or SSN). Only the client can complete it.' using errcode = 'P0001'; end if;
  if cardinality(new.agent_roles) > 0 and not (new.roles && array['Client-Buyer', 'Client-Seller']::text[]) then
    raise exception 'Only client tasks can be completed by an agent.' using errcode = 'P0001'; end if;
  return new; end $function$$pf288$;
  end if;
end
$guard288$;
do $guard289$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_demo_personas' and p.pronargs=0) then
    execute $pf289$CREATE OR REPLACE FUNCTION public.list_demo_personas()
 RETURNS TABLE(id uuid, first_name text, last_name text, role text, portal_role text)
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ select * from private.list_demo_personas() $function$$pf289$;
  end if;
end
$guard289$;
do $guard290$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='list_portal_feedback' and p.pronargs=1) then
    execute $pf290$CREATE OR REPLACE FUNCTION private.list_portal_feedback(p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_admin boolean := private.is_admin();
begin
  if p_actor is null or p_actor is distinct from private.effective_uid() then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.status = 'active') then
    raise exception 'Sign in with a provisioned account first.' using errcode = '42501'; end if;
  insert into public.portal_feedback_access (actor_id, action) values (p_actor, 'list');
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', f.id, 'body', f.body, 'page', f.page, 'createdAt', f.created_at, 'authorId', f.author_id,
      'authorName', pg_catalog.btrim(p.first_name || ' ' || p.last_name)) order by f.created_at desc)
    from public.portal_feedback f join public.profiles p on p.id = f.author_id
    where v_admin or f.author_id = p_actor), '[]'::jsonb);
end $function$$pf290$;
  end if;
end
$guard290$;
do $guard291$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='profile_insert_staff_admin' and p.pronargs=0) then
    execute $pf291$CREATE OR REPLACE FUNCTION private.profile_insert_staff_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if pg_catalog.current_setting('cla.bootstrap_admin', true) = 'on' and private.effective_uid() is null then return new; end if;
  if private.effective_uid() is not null and new.role <> 'Outside user' and not private.is_admin() then
    raise exception 'Only an Admin can create a CLA staff login.' using errcode = 'P0001'; end if;
  return new;
end $function$$pf291$;
  end if;
end
$guard291$;
do $guard292$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='sync_auth_user' and p.pronargs=0) then
    execute $pf292$CREATE OR REPLACE FUNCTION private.sync_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare r text := coalesce(new.raw_app_meta_data->>'portal_role', ''::text);
  fn text := coalesce(nullif(pg_catalog.btrim(new.raw_app_meta_data->>'first_name'), ''::text), 'New'::text);
  ln text := coalesce(pg_catalog.btrim(new.raw_app_meta_data->>'last_name'), ''::text);
  em text := pg_catalog.lower(pg_catalog.btrim(coalesce(new.email, ''::text)));
begin
  if r = '' or em = '' or r = 'Super admin' or r = 'Admin' then return new; end if;
  if r not in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Outside user', 'Employee') then
    return new; end if;
  if exists (select 1 from public.profiles p where p.id = new.id) then return new; end if;
  if auth.uid() is not null and not private.is_admin() then return new; end if;
  insert into public.profiles (id, email, first_name, last_name, role, status)
  values (new.id, em, pg_catalog.left(fn, 80), pg_catalog.left(ln, 80), r, 'active');
  if r = 'Outside user' and not exists (select 1 from public.contacts c where c.profile_id = new.id) then
    insert into public.contacts (profile_id, first_name, last_name, email, created_by)
    values (new.id, pg_catalog.left(fn, 80), pg_catalog.left(ln, 80), em, new.id);
  end if;
  return new;
end $function$$pf292$;
  end if;
end
$guard292$;
do $guard293$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='hr_is_super' and p.pronargs=0) then
    execute $pf293$CREATE OR REPLACE FUNCTION private.hr_is_super()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(private.is_super_admin(), false) $function$$pf293$;
  end if;
end
$guard293$;
do $guard294$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='profile_guard' and p.pronargs=0) then
    execute $pf294$CREATE OR REPLACE FUNCTION private.profile_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if new.id <> old.id or new.email <> old.email then raise exception 'id and email are changed by the auth provider only'; end if;
  if old.status = 'removed' and private.effective_uid() is not null then raise exception 'This user was removed'; end if;
  if new.role in ('Admin', 'Super admin') and new.role = old.role and old.is_admin and not new.is_admin and new.status <> 'removed' then
    raise exception 'An %-role user keeps Admin access; change the role first', new.role; end if;
  if new.role in ('Admin', 'Super admin') and new.status <> 'removed' then new.is_admin := true;
  elsif old.role in ('Admin', 'Super admin') and new.role not in ('Admin', 'Super admin') and new.is_admin = old.is_admin then new.is_admin := false; end if;
  if private.effective_uid() is not null and (new.role <> old.role or new.status <> old.status or new.is_admin <> old.is_admin) then
    if not private.is_admin() then raise exception 'Only an Admin can change role, status or Admin access'; end if;
    if new.role = 'Super admin' and old.role <> 'Super admin' and not private.is_super_admin() then
      raise exception 'Only a Super admin can grant the Super admin role.'; end if;
    if old.role = 'Super admin' and not private.is_super_admin() then
      raise exception 'Only a Super admin can change, suspend or delete a Super admin.'; end if;
    if new.id = private.effective_uid() and (new.status <> old.status or new.is_admin <> old.is_admin) then raise exception 'You cannot change your own status or Admin access'; end if;
    if new.status = 'removed' and coalesce(current_setting('cla.removing_user', true), ''::text) <> 'on' then raise exception 'Use admin_delete_user to delete a user'; end if;
  end if;
  if old.is_admin and old.status = 'active' and not (new.is_admin and new.status = 'active')
     and not exists (select 1 from public.profiles p where p.is_admin and p.status = 'active' and p.id <> old.id) then
    raise exception 'There must always be at least one Admin'; end if;
  if old.role = 'Super admin' and old.status = 'active' and not (new.role = 'Super admin' and new.status = 'active')
     and not exists (select 1 from public.profiles p where p.role = 'Super admin' and p.is_admin and p.status = 'active' and p.id <> old.id) then
    raise exception 'There must always be at least one Super admin'; end if;
  return new;
end $function$$pf294$;
  end if;
end
$guard294$;
do $guard295$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='profile_insert_admin' and p.pronargs=0) then
    execute $pf295$CREATE OR REPLACE FUNCTION private.profile_insert_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  -- The bootstrap flag is honored only when no user JWT is present (operator or service_role).
  -- An authenticated session cannot set the flag and insert its own Super admin.
  if pg_catalog.current_setting('cla.bootstrap_admin', true) = 'on' and private.effective_uid() is null then
    if new.role <> 'Super admin' then raise exception 'Bootstrap can only create the first Super admin.' using errcode = '42501'; end if;
    if exists (select 1 from public.profiles where role = 'Super admin' and status <> 'removed') then
      raise exception 'A Super admin already exists.' using errcode = '42501'; end if;
    new.is_admin := true;
    return new;
  end if;
  if new.role = 'Super admin' and private.effective_uid() is not null and not private.is_super_admin() then
    raise exception 'Only a Super admin can grant the Super admin role.' using errcode = 'P0001'; end if;
  if new.role in ('Admin', 'Super admin') then new.is_admin := true; end if;
  return new;
end $function$$pf295$;
  end if;
end
$guard295$;
do $guard296$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='bootstrap_first_admin' and p.pronargs=1) then
    execute $pf296$CREATE OR REPLACE FUNCTION private.bootstrap_first_admin(p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare em text; fn text; ln text;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Bootstrap is operator-only.' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(8742100197);
  if p_user is null then raise exception 'Pass the auth.users id to bootstrap. No owner is assumed.' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles p where p.role = 'Super admin' and p.status <> 'removed') then
    raise exception 'A Super admin already exists. Bootstrap is closed.' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'That user already has a profile.' using errcode = '42501'; end if;
  select pg_catalog.lower(pg_catalog.btrim(coalesce(u.email, ''::text))),
         coalesce(nullif(pg_catalog.btrim(u.raw_app_meta_data->>'first_name'), ''::text), 'Administrator'::text),
         coalesce(pg_catalog.btrim(u.raw_app_meta_data->>'last_name'), ''::text)
    into em, fn, ln from auth.users u where u.id = p_user;
  if em is null or em = '' then raise exception 'That auth user does not exist or has no email. Create the user in the dashboard first. No email is sent.' using errcode = '22023'; end if;
  perform pg_catalog.set_config('cla.bootstrap_admin', 'on', true);
  insert into public.profiles (id, email, first_name, last_name, phone, role, status, is_admin)
  values (p_user, em, pg_catalog.left(fn, 80), pg_catalog.left(ln, 80), '', 'Super admin', 'active', true);
  perform pg_catalog.set_config('cla.bootstrap_admin', 'off', true);
  perform private.log_activity(null, 'auth.bootstrap_admin', 'user', p_user, 'Operator bootstrap of the first Super admin. No email was sent.');
  return p_user;
end $function$$pf296$;
  end if;
end
$guard296$;
do $guard297$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='provision_portal_user' and p.pronargs=5) then
    execute $pf297$CREATE OR REPLACE FUNCTION private.provision_portal_user(p_actor uuid, p_user uuid, p_role text, p_first text, p_last text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare em text; fn text := pg_catalog.left(pg_catalog.btrim(coalesce(p_first, ''::text)), 80); ln text := pg_catalog.left(pg_catalog.btrim(coalesce(p_last, ''::text)), 80);
begin
  if p_actor is null or p_actor is distinct from private.effective_uid() then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not private.is_admin() then raise exception 'Only an Admin can provision a login.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.status = 'active') then
    raise exception 'Sign in with a provisioned account first.' using errcode = '42501'; end if;
  if p_user is null then raise exception 'A user id is required.' using errcode = '22023'; end if;
  if p_role = 'Super admin' and not private.is_super_admin() then raise exception 'Only a Super admin can grant the Super admin role.' using errcode = '42501'; end if;
  if p_role not in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin', 'Outside user', 'Employee') then
    raise exception 'That role is not a login role. Buyer, seller and agent access is the Outside user login plus a role on a file.' using errcode = '22023'; end if;
  if fn = '' then raise exception 'A first name is required.' using errcode = '22023'; end if;
  select pg_catalog.lower(pg_catalog.btrim(coalesce(u.email, ''::text))) into em from auth.users u where u.id = p_user;
  if em is null or em = '' then raise exception 'Create the auth user in the Supabase dashboard first. This function does not create logins and does not send email.' using errcode = '22023'; end if;
  perform pg_catalog.set_config('cla.provisioning', 'on', true);
  if exists (select 1 from public.profiles p where p.id = p_user) then
    update public.profiles set role = p_role, first_name = fn, last_name = ln, email = em, status = 'active' where id = p_user;
  else
    insert into public.profiles (id, email, first_name, last_name, phone, role, status) values (p_user, em, fn, ln, '', p_role, 'active');
  end if;
  if p_role = 'Outside user' and not exists (select 1 from public.contacts c where c.profile_id = p_user) then
    insert into public.contacts (profile_id, first_name, last_name, email, created_by) values (p_user, fn, ln, em, p_actor);
  end if;
  perform pg_catalog.set_config('cla.provisioning', 'off', true);
  perform private.log_activity(null, 'auth.provisioned', 'user', p_user, 'Provisioned ' || p_role || '. No email was sent.');
  return p_user;
end $function$$pf297$;
  end if;
end
$guard297$;
do $guard298$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='submit_portal_feedback' and p.pronargs=3) then
    execute $pf298$CREATE OR REPLACE FUNCTION private.submit_portal_feedback(p_actor uuid, p_body text, p_page text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_body text := pg_catalog.btrim(coalesce(p_body, ''::text)); v_page text := pg_catalog.left(pg_catalog.btrim(coalesce(p_page, ''::text)), 200); v_id uuid;
begin
  if p_actor is null or p_actor is distinct from private.effective_uid() then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.status = 'active') then
    raise exception 'Sign in with a provisioned account first.' using errcode = '42501'; end if;
  if pg_catalog.char_length(v_body) < 3 or pg_catalog.char_length(v_body) > 4000 then raise exception 'Feedback must be 3 to 4000 characters.' using errcode = '22023'; end if;
  insert into public.portal_feedback (author_id, body, page) values (p_actor, v_body, v_page) returning portal_feedback.id into v_id;
  insert into public.portal_feedback_access (actor_id, feedback_id, action) values (p_actor, v_id, 'submit');
  perform private.log_activity(null, 'feedback.submitted', 'portal_feedback', v_id, 'Portal feedback saved. Nothing was emailed.');
  return v_id;
end $function$$pf298$;
  end if;
end
$guard298$;
do $guard299$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='trg_deal' and p.pronargs=0) then
    execute $pf299$CREATE OR REPLACE FUNCTION private.trg_deal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.id, 'deal.created', 'deal', new.id, 'Order ' || new.file_number || ' opened');
    insert into public.tasks (deal_id, title, assigned_role, created_by) values (new.id, 'Collect executed contract', 'Processor', new.created_by);
    insert into public.folders (scope, deal_id, name, created_by)
      select 'deal', new.id, n, new.created_by from unnest(array['Contract & addenda', 'IDs & personal', 'Lender & payoff', 'HOA', 'Closing']) n;
  else
    if new.stage <> old.stage then perform private.log_activity(new.id, 'stage.changed', 'deal', new.id, 'Stage set to ' || new.stage); end if;
    if new.status <> old.status then perform private.log_activity(new.id, 'status.changed', 'deal', new.id, 'Status set to ' || new.status); end if;
    if new.closing_date is distinct from old.closing_date then perform private.log_activity(new.id, 'closing.date', 'deal', new.id, 'Closing date set to ' || coalesce(new.closing_date::text, 'none')); end if;
  end if; return new; end $function$$pf299$;
  end if;
end
$guard299$;
do $guard300$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='trg_team_member' and p.pronargs=0) then
    execute $pf300$CREATE OR REPLACE FUNCTION private.trg_team_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if tg_op = 'INSERT' then perform private.log_activity(null, 'team.member_added', 'team', new.team_id, (select first_name || ' ' || last_name from public.profiles where id = new.profile_id) || ' added as ' || new.member_role); return new;
  else perform private.log_activity(null, 'team.member_removed', 'team', old.team_id, (select first_name || ' ' || last_name from public.profiles where id = old.profile_id) || ' removed from team'); return old; end if; end $function$$pf300$;
  end if;
end
$guard300$;
do $guard301$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='can_invite_agents' and p.pronargs=0) then
    execute $pf301$CREATE OR REPLACE FUNCTION private.can_invite_agents()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(private.is_admin() or private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Admin', 'Super admin'), false) $function$$pf301$;
  end if;
end
$guard301$;
do $guard302$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='can_manage_closing_locations' and p.pronargs=0) then
    execute $pf302$CREATE OR REPLACE FUNCTION private.can_manage_closing_locations()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Transaction Coordinator'), false) or private.is_admin() $function$$pf302$;
  end if;
end
$guard302$;
do $guard303$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_assignee_check' and p.pronargs=4) then
    execute $pf303$CREATE OR REPLACE FUNCTION private.crm_assignee_check(p_new uuid, p_old uuid, p_insert boolean, p_label text DEFAULT 'task owner'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if p_insert and p_new is null then p_new := private.effective_uid(); end if;
  if p_new is null then raise exception 'Pick a %.', p_label using errcode = 'P0001'; end if;
  if p_new is distinct from p_old and coalesce(current_setting('crm.spawn', true), '') <> '1' then
    if not exists (select 1 from public.profiles where id = p_new and status = 'active' and role in ('Sales Person', 'Sales Team', 'Admin', 'Super admin')) then
      raise exception 'The % must be an active Sales Person, Sales Team or Admin user.', p_label using errcode = 'P0001'; end if;
    if private.effective_uid() is not null and p_new <> private.effective_uid() and not private.is_admin() and coalesce(private.me_role() = 'Sales Person', false) then
      raise exception 'A Sales Person can only pick themselves as the %.', p_label using errcode = 'P0001'; end if; end if;
  return p_new; end $function$$pf303$;
  end if;
end
$guard303$;
do $guard304$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_custom_in' and p.pronargs=5) then
    execute $pf304$CREATE OR REPLACE FUNCTION private.crm_custom_in(p_entity text, p_new jsonb, p_old jsonb, p_insert boolean, p_require boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare r jsonb; k text; v jsonb; s text; n numeric; f public.crm_custom_fields; o jsonb := coalesce(p_old, '{}'); x text; arr jsonb; part text; m int; ok boolean;
  editor boolean := private.is_admin() or private.effective_uid() is null;
begin
  if p_new is null then p_new := '{}'; end if;
  if jsonb_typeof(p_new) <> 'object' then raise exception 'Custom values must be a JSON object.' using errcode = '23514'; end if;
  r := case when p_insert then p_new else o || p_new end;
  for k in select jsonb_object_keys(r) loop
    f := null; select * into f from public.crm_custom_fields cf where cf.id::text = k and cf.entity = p_entity;
    if f.id is null then raise exception 'Unknown custom field.' using errcode = '23514'; end if;
    v := r -> k;
    if f.archived_at is not null then
      if v is distinct from o -> k then raise exception 'The field "%" was deleted; restore it to change its value.', f.label using errcode = 'P0001'; end if; continue; end if;
    if f.type in ('formula', 'rollup') then r := r - k; continue; end if;   -- calculated by the app when shown; never stored
    if f.type = 'autonumber' then if p_insert then r := r - k; else r := jsonb_set(r, array[k], coalesce(o -> k, 'null')); if o -> k is null then r := r - k; end if; end if; continue; end if;
    if v is not distinct from o -> k then continue; end if;   -- unchanged (e.g. a retired option)
    -- video 8 Set Permission: a role without Edit cannot change the value (Admin / Super admin always can)
    if not editor and f.perm_edit is not null and not (private.me_role() = any (f.perm_edit)) then
      raise exception 'You cannot change "%".', f.label using errcode = '42501'; end if;
    if jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0) then r := r - k; continue; end if;
    if f.type = 'multiselect' then
      if jsonb_typeof(v) <> 'array' then raise exception '% takes a list of options.', f.label using errcode = '23514'; end if;
      arr := '[]';
      for x in select distinct btrim(e) from jsonb_array_elements_text(v) e where btrim(e) <> '' loop
        perform private.crm_list_check('cf:' || f.id::text, x, case when coalesce(o -> k, '[]') ? x then x end, null, false, f.label); arr := arr || to_jsonb(x); end loop;
      r := jsonb_set(r, array[k], arr); continue; end if;
    if f.type = 'address' then
      if jsonb_typeof(v) <> 'object' then raise exception '% takes street, city, state, zip code and country.', f.label using errcode = '23514'; end if;
      arr := '{}';
      for part in select jsonb_object_keys(v) loop
        if part not in ('street', 'city', 'state', 'zip', 'country') then raise exception '% has an unknown part.', f.label using errcode = '23514'; end if;
        x := btrim(v ->> part); if char_length(x) > 120 or x ~ '[[:cntrl:]]' then raise exception '% (%) can be at most 120 characters.', f.label, part using errcode = '23514'; end if;
        if part = 'zip' and x <> '' and x !~ '^[A-Za-z0-9 -]{3,10}$' then raise exception '% (Zip Code) is not valid.', f.label using errcode = '23514'; end if;
        if x <> '' then arr := arr || jsonb_build_object(part, x); end if; end loop;
      if arr = '{}' then r := r - k; else r := jsonb_set(r, array[k], arr); end if; continue; end if;
    if f.type in ('file', 'image') then
      if jsonb_typeof(v) <> 'array' then raise exception '% takes uploaded files.', f.label using errcode = '23514'; end if;
      if exists (select 1 from jsonb_array_elements_text(v) e where e !~ '^[0-9a-f-]{36}$' or not exists (select 1 from public.crm_attachments a where a.id = e::uuid and a.entity = p_entity)) then
        raise exception '% must point at files uploaded to this record.', f.label using errcode = '23514'; end if;
      if f.type = 'image' and exists (select 1 from jsonb_array_elements_text(v) e join public.crm_attachments a on a.id = e::uuid where lower(substring(a.name from '\.([^.]+)$')) not in ('png', 'jpg', 'jpeg', 'gif', 'webp')) then
        raise exception '% takes an image (png, jpg, jpeg, gif, webp).', f.label using errcode = '23514'; end if;
      continue; end if;
    if jsonb_typeof(v) not in ('string', 'number', 'boolean') then raise exception '% has an invalid value.', f.label using errcode = '23514'; end if;
    s := btrim(v #>> '{}');
    if f.max_chars is not null and char_length(s) > f.max_chars then raise exception '% can be at most % characters.', f.label, f.max_chars using errcode = '23514'; end if;
    case f.type
      when 'text' then if char_length(s) > 255 then raise exception '% can be at most 255 characters.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s));
      when 'textarea' then if char_length(s) > 4000 then raise exception '% can be at most 4000 characters.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s));
      when 'number', 'currency', 'percent', 'decimal' then
        s := regexp_replace(s, case when f.type in ('number', 'decimal') then ',' else '[$,%\s]' end, '', 'g');
        if s !~ '^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' then raise exception '% must be a number.', f.label using errcode = '23514'; end if;
        n := s::numeric; if abs(n) > 1e13 then raise exception '% is too large.', f.label using errcode = '23514'; end if;
        if f.type = 'decimal' then n := round(n, coalesce((f.config ->> 'decimals')::int, 2)); elsif f.type <> 'number' then n := round(n, 2); end if; r := jsonb_set(r, array[k], to_jsonb(n));
      when 'longint' then s := replace(s, ',', '');
        if s !~ '^-?[0-9]{1,16}$' or abs(s::numeric) > 9007199254740991 then raise exception '% must be a whole number.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s::bigint));
      when 'date' then
        begin if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char(to_date(s, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> s then s := 'bad'; end if;
        exception when others then s := 'bad'; end;
        if s = 'bad' then raise exception '% must be a real date (YYYY-MM-DD).', f.label using errcode = '23514'; end if;
        r := jsonb_set(r, array[k], to_jsonb(s));
      when 'datetime' then
        ok := s ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}';
        if ok then begin s := substr(s, 1, 10) || 'T' || substr(s, 12, 5); ok := to_char(to_timestamp(s, 'YYYY-MM-DD"T"HH24:MI'), 'YYYY-MM-DD"T"HH24:MI') = s; exception when others then ok := false; end; end if;
        if not ok then raise exception '% must be a real date and time.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s));
      when 'checkbox' then r := jsonb_set(r, array[k], to_jsonb(lower(s) in ('true', '1', 'on', 'yes')));
      when 'dropdown', 'radio' then
        perform private.crm_list_check('cf:' || f.id::text, s, o ->> k, null, false, f.label); r := jsonb_set(r, array[k], to_jsonb(s));
      when 'email' then s := lower(s);
        if char_length(s) > 200 or s !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception '% is not a valid email address.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s));
      when 'phone' then s := regexp_replace(s, '\D', '', 'g');
        if char_length(s) <> 10 then raise exception '% must be a 10-digit phone number (xxx-xxx-xxxx).', f.label using errcode = '23514'; end if;
        r := jsonb_set(r, array[k], to_jsonb(substr(s, 1, 3) || '-' || substr(s, 4, 3) || '-' || substr(s, 7)));
      when 'url' then r := jsonb_set(r, array[k], to_jsonb(private.crm_url_in(s)));
      when 'user' then
        if s !~ '^[0-9a-f-]{36}$' or not exists (select 1 from public.profiles p where p.id = s::uuid and p.status = 'active' and p.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Admin', 'Super admin')) then
          raise exception 'Pick a CLA user for %.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s));
      when 'lookup' then
        ok := s ~ '^[0-9a-f-]{36}$';
        if ok then ok := case f.config ->> 'target' when 'contacts' then private.crm_in_pool(s::uuid) when 'leads' then exists (select 1 from public.crm_leads where id = s::uuid)
          when 'accounts' then exists (select 1 from public.crm_accounts where id = s::uuid) when 'opportunities' then exists (select 1 from public.crm_opportunities where id = s::uuid)
          when 'deals' then exists (select 1 from public.deals where id = s::uuid) else false end; end if;
        if not ok then raise exception 'Pick a record from %.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s));
      else raise exception '% has an invalid value.', f.label using errcode = '23514';
    end case;
  end loop;
  -- auto numbers: assigned on a new record, never typed
  if p_insert then
    for f in select * from public.crm_custom_fields cf where cf.entity = p_entity and cf.archived_at is null and cf.type = 'autonumber' order by cf.position for update loop
      m := coalesce((f.config ->> 'next')::int, 1);
      r := jsonb_set(r, array[f.id::text], to_jsonb(coalesce(f.config ->> 'prefix', '') || m || coalesce(f.config ->> 'suffix', '')));
      update public.crm_custom_fields set config = jsonb_set(config, '{next}', to_jsonb(m + 1)) where id = f.id; end loop; end if;
  -- required: on a new record (direct writes and the create functions), and a value once set cannot be blanked
  for f in select * from public.crm_custom_fields cf where cf.entity = p_entity and cf.archived_at is null and cf.required loop
    if not (r ? f.id::text) and (p_require or (not p_insert and o ? f.id::text)) then raise exception '% is required.', f.label using errcode = 'P0001'; end if;
  end loop;
  return r; end $function$$pf304$;
  end if;
end
$guard304$;
do $guard305$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_linked' and p.pronargs=1) then
    execute $pf305$CREATE OR REPLACE FUNCTION private.crm_linked(p_contact uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false) and (
    exists (select 1 from public.contacts c join public.client_sales_reps l on l.client_id = c.profile_id where c.id = p_contact and l.sales_id = private.effective_uid())
    or exists (select 1 from public.deal_participants dp join public.deal_sales_people s on s.deal_id = dp.deal_id where dp.contact_id = p_contact and s.sales_id = private.effective_uid())) $function$$pf305$;
  end if;
end
$guard305$;
do $guard306$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_owner_check' and p.pronargs=3) then
    execute $pf306$CREATE OR REPLACE FUNCTION private.crm_owner_check(p_new uuid, p_old uuid, p_insert boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  -- a salesperson's new records are theirs when no owner is given
  if p_insert and p_new is null and private.effective_uid() is not null and not private.is_admin() and coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false) then p_new := private.effective_uid(); end if;
  if p_new is not null and p_new is distinct from p_old and not exists (select 1 from public.profiles where id = p_new and status = 'active' and role in ('Sales Person', 'Sales Team')) then
    raise exception 'The owner must be an active Sales Person or Sales Team user.' using errcode = 'P0001'; end if;
  if private.effective_uid() is not null and p_new is distinct from p_old and p_new is distinct from private.effective_uid() and not private.is_admin() and coalesce(private.me_role() = 'Sales Person', false) then
    raise exception 'A Sales Person can only assign records to themselves.' using errcode = 'P0001'; end if;
  return p_new; end $function$$pf306$;
  end if;
end
$guard306$;
do $guard307$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_role_key' and p.pronargs=0) then
    execute $pf307$CREATE OR REPLACE FUNCTION private.crm_role_key()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select case when private.is_admin() then 'Admin' else coalesce(private.me_role(), '') end $function$$pf307$;
  end if;
end
$guard307$;
do $guard308$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='deal_role' and p.pronargs=1) then
    execute $pf308$CREATE OR REPLACE FUNCTION private.deal_role(d uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $cap$
  select case when private.me_role() is null then null when private.me_role() <> 'Outside user' then private.me_role() else private.file_role_of(private.effective_uid(), d) end $cap$$pf308$;
  end if;
end
$guard308$;
do $guard309$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_client' and p.pronargs=0) then
    execute $pf309$CREATE OR REPLACE FUNCTION private.is_client()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(private.me_role() in ('Client-Buyer','Client-Seller'), false) $function$$pf309$;
  end if;
end
$guard309$;
do $guard310$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_manager' and p.pronargs=0) then
    execute $pf310$CREATE OR REPLACE FUNCTION private.is_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Preprocessor', 'Transaction Coordinator'), false) or private.is_admin() $function$$pf310$;
  end if;
end
$guard310$;
do $guard311$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_outside' and p.pronargs=0) then
    execute $pf311$CREATE OR REPLACE FUNCTION private.is_outside()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(private.me_role() = 'Outside user', false) $function$$pf311$;
  end if;
end
$guard311$;
do $guard312$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_preprocessor' and p.pronargs=0) then
    execute $pf312$CREATE OR REPLACE FUNCTION private.is_preprocessor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(private.me_role() = 'Preprocessor', false) $function$$pf312$;
  end if;
end
$guard312$;
do $guard313$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_processor' and p.pronargs=0) then
    execute $pf313$CREATE OR REPLACE FUNCTION private.is_processor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor'), false) or private.is_admin() $function$$pf313$;
  end if;
end
$guard313$;
do $guard314$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_staffish' and p.pronargs=0) then
    execute $pf314$CREATE OR REPLACE FUNCTION private.is_staffish()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $cap$
  select private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'), false) $cap$$pf314$;
  end if;
end
$guard314$;
do $guard315$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_view_only' and p.pronargs=0) then
    execute $pf315$CREATE OR REPLACE FUNCTION private.is_view_only()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false) and not private.is_admin() $function$$pf315$;
  end if;
end
$guard315$;
do $guard316$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='uw_reader' and p.pronargs=0) then
    execute $pf316$CREATE OR REPLACE FUNCTION private.uw_reader()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(private.is_admin() or private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team'), false) $function$$pf316$;
  end if;
end
$guard316$;
do $guard317$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='can_access_deal' and p.pronargs=1) then
    execute $pf317$CREATE OR REPLACE FUNCTION private.can_access_deal(d uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $cap$
  select private.me_role() is not null and (
    private.is_admin() or private.me_role() in ('Processor', 'Sales Team')
    or (private.me_role() = 'Preprocessor' and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid()))
    or (private.me_role() = 'Transaction Coordinator' and exists (
          select 1 from public.deal_participants p join public.contacts c on c.id = p.contact_id
          where p.deal_id = d and p.role in ('Buyer Agent', 'Listing Agent') and c.profile_id in (select private.my_team_agents())))
    or (private.me_role() <> 'Transaction Coordinator' and (
          (private.me_role() in ('Sales Person', 'Sales Team') and exists (select 1 from public.deal_sales_people s where s.deal_id = d and s.sales_id = private.effective_uid()))
          or exists (select 1 from public.deal_participants p where p.deal_id = d and p.contact_id = private.my_contact_id())))) $cap$$pf317$;
  end if;
end
$guard317$;
do $guard318$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='notify_sides' and p.pronargs=2) then
    execute $pf318$CREATE OR REPLACE FUNCTION private.notify_sides(d uuid, msg text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.notify(array(select c.profile_id from public.deal_participants p join public.contacts c on c.id = p.contact_id
    where p.deal_id = d and private.side_of(p.role) is not null and c.profile_id is not null), 'closing', d, msg, '#/deals/' || d || '/closing') $function$$pf318$;
  end if;
end
$guard318$;
do $guard319$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='trg_message' and p.pronargs=0) then
    execute $pf319$CREATE OR REPLACE FUNCTION private.trg_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare d uuid; s text;
begin
  select deal_id, subject into d, s from public.threads where id = new.thread_id;
  perform private.notify(array(select profile_id from public.thread_participants where thread_id = new.thread_id), 'message', d, 'New message: ' || s, '#/deals/' || d || '/messages/' || new.thread_id);
  return new; end $function$$pf319$;
  end if;
end
$guard319$;
do $guard320$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='closing_location_remind_trg' and p.pronargs=0) then
    execute $pf320$CREATE OR REPLACE FUNCTION private.closing_location_remind_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin perform private.remind_closing_locations(new.deal_id); return new; end $function$$pf320$;
  end if;
end
$guard320$;
do $guard321$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='start_demo_view' and p.pronargs=1) then
    execute $pf321$CREATE OR REPLACE FUNCTION private.start_demo_view(p_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare actor uuid := auth.uid();
begin
  -- Role comes from profiles, which only the server writes. raw_user_meta_data is ignored.
  if not private.actor_is_super_admin() then
    raise exception 'Only an active Super admin can open Demo mode.' using errcode = '42501'; end if;
  if p_target is null or p_target = actor or not exists (
      select 1 from public.profiles p
      where p.id = p_target and p.is_demo and p.status = 'active'
        and p.role not in ('Admin', 'Super admin') and not p.is_admin) then
    raise exception 'Demo mode can only view a seeded demo user who is not an administrator.' using errcode = '42501'; end if;
  perform private.expire_demo_view(actor);
  insert into private.view_as_sessions (actor_id, target_id, started_at, expires_at, stopped_at)
  values (actor, p_target, pg_catalog.now(), pg_catalog.now() + interval '30 minutes', null)
  on conflict (actor_id) do update
    set target_id = excluded.target_id, started_at = excluded.started_at, expires_at = excluded.expires_at, stopped_at = null;
  insert into private.view_as_audit (actor_id, target_id, action) values (actor, p_target, 'start');
  return private.demo_view_status_for(actor);
end $function$$pf321$;
  end if;
end
$guard321$;
do $guard322$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='stop_demo_view' and p.pronargs=0) then
    execute $pf322$CREATE OR REPLACE FUNCTION private.stop_demo_view()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare actor uuid := auth.uid(); tid uuid;
begin
  if not private.actor_is_super_admin() then
    raise exception 'Only an active Super admin can leave Demo mode.' using errcode = '42501'; end if;
  perform private.expire_demo_view(actor);
  select target_id into tid from private.view_as_sessions
    where actor_id = actor and stopped_at is null and expires_at > pg_catalog.now();
  if tid is not null then
    update private.view_as_sessions set stopped_at = pg_catalog.now() where actor_id = actor and stopped_at is null;
    insert into private.view_as_audit (actor_id, target_id, action) values (actor, tid, 'stop');
  end if;
  return private.demo_view_status_for(actor);
end $function$$pf322$;
  end if;
end
$guard322$;
do $guard323$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='demo_view_status' and p.pronargs=0) then
    execute $pf323$CREATE OR REPLACE FUNCTION public.demo_view_status()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ select private.demo_view_status_for(auth.uid()) $function$$pf323$;
  end if;
end
$guard323$;
do $guard324$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='trg_lender_phone' and p.pronargs=0) then
    execute $pf324$CREATE OR REPLACE FUNCTION private.trg_lender_phone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin new.lender_phone := private.phone_or_raise(new.lender_phone, 'Lender phone'); return new; end $function$$pf324$;
  end if;
end
$guard324$;
do $guard325$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='trg_participant_entity' and p.pronargs=0) then
    execute $pf325$CREATE OR REPLACE FUNCTION private.trg_participant_entity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare r text;
begin
  select role into r from public.deal_participants where id = new.participant_id;
  if r is null or r not in ('Client-Buyer', 'Client-Seller') then raise exception 'Only a buyer or a seller can be an entity.' using errcode = '23514'; end if;
  new.name := btrim(new.name); new.rep_name := btrim(new.rep_name); new.rep_title := btrim(new.rep_title); new.rep_email := lower(btrim(new.rep_email));
  new.rep_phone := private.phone_or_raise(new.rep_phone, 'Entity Representative''s phone');
  return new; end $function$$pf325$;
  end if;
end
$guard325$;
do $guard326$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='trg_phone' and p.pronargs=0) then
    execute $pf326$CREATE OR REPLACE FUNCTION private.trg_phone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin new.phone := private.phone_or_raise(new.phone, 'Phone'); return new; end $function$$pf326$;
  end if;
end
$guard326$;
do $guard327$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='closing_office_for' and p.pronargs=3) then
    execute $pf327$CREATE OR REPLACE FUNCTION private.closing_office_for(p_deal uuid, p_location text, p_office text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare s text; c text; r text; o public.offices;
begin
  if p_location is distinct from 'CLA Title office' then
    if nullif(btrim(coalesce(p_office, '')), '') is not null then raise exception 'Only a CLA Title office closing names an office.' using errcode = 'P0001'; end if;
    return null; end if;
  if nullif(btrim(coalesce(p_office, '')), '') is not null then
    select * into o from public.offices where id = p_office;
    if not found then raise exception 'Pick one of the CLA Title offices.' using errcode = 'P0001'; end if;
    if not o.active then raise exception '% is retired: pick another office.', o.name using errcode = 'P0001'; end if;
    return p_office; end if;
  select d.state, d.county into s, c from public.deals d where d.id = p_deal;
  select n.office_id into r from private.nearest_cla_office(s, c) n; return r;
end $function$$pf327$;
  end if;
end
$guard327$;
do $guard328$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='trg_agent_tasks' and p.pronargs=0) then
    execute $pf328$CREATE OR REPLACE FUNCTION private.trg_agent_tasks()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin perform private.make_agent_tasks(new.id); return new; end $function$$pf328$;
  end if;
end
$guard328$;
do $guard329$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_portal_feedback' and p.pronargs=0) then
    execute $pf329$CREATE OR REPLACE FUNCTION public.list_portal_feedback()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.list_portal_feedback(private.effective_uid());
$function$$pf329$;
  end if;
end
$guard329$;
do $guard330$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='lock_function_search_paths' and p.pronargs=0) then
    execute $pf330$CREATE OR REPLACE FUNCTION private.lock_function_search_paths()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare r record;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Search-path lockdown is operator-only.' using errcode = '42501'; end if;
  revoke create on schema public from public, anon, authenticated;
  revoke create on schema extensions from public, anon, authenticated;
  grant usage on schema extensions to anon, authenticated, service_role;
  for r in
    select p.oid::pg_catalog.regprocedure as sig
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f'
      and not (n.nspname = 'public' and p.proname = 'digest')
      and not exists (select 1 from pg_catalog.pg_depend d where d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = pg_catalog, public, extensions', r.sig);
  end loop;
  execute 'alter function public.digest(text, text) set search_path = pg_catalog, extensions';
  execute 'alter function public.digest(bytea, text) set search_path = pg_catalog, extensions';
  -- Operator and trigger helpers are not API. Older files grant execute on every private function.
  execute 'revoke all on function private.bootstrap_first_admin(uuid) from public, anon, authenticated';
  execute 'grant execute on function private.bootstrap_first_admin(uuid) to service_role';
  execute 'revoke all on function private.lock_function_search_paths() from public, anon, authenticated';
  execute 'grant execute on function private.lock_function_search_paths() to service_role';
  execute 'revoke all on function private.reharden_api_surface() from public, anon, authenticated';
  execute 'grant execute on function private.reharden_api_surface() to service_role';
  execute 'revoke all on function private.sync_auth_user() from public, anon, authenticated';
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant usage on schema private to supabase_auth_admin';
    execute 'grant execute on function private.sync_auth_user() to supabase_auth_admin';
  end if;
end $function$$pf330$;
  end if;
end
$guard330$;
do $guard331$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='provision_portal_user' and p.pronargs=4) then
    execute $pf331$CREATE OR REPLACE FUNCTION public.provision_portal_user(p_user uuid, p_role text, p_first text, p_last text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.provision_portal_user(private.effective_uid(), p_user, p_role, p_first, p_last);
$function$$pf331$;
  end if;
end
$guard331$;
do $guard332$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='submit_portal_feedback' and p.pronargs=2) then
    execute $pf332$CREATE OR REPLACE FUNCTION public.submit_portal_feedback(p_body text, p_page text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.submit_portal_feedback(private.effective_uid(), p_body, p_page);
$function$$pf332$;
  end if;
end
$guard332$;
do $guard333$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='closing_location_before' and p.pronargs=0) then
    execute $pf333$CREATE OR REPLACE FUNCTION private.closing_location_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare dp public.deal_participants; prop text;
begin
  select * into dp from public.deal_participants where id = new.participant_id;
  if not found or dp.role not in ('Client-Buyer', 'Client-Seller') then raise exception 'Only a buyer or seller on the order answers this.' using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' and (new.participant_id <> old.participant_id or new.deal_id <> old.deal_id) then raise exception 'The party cannot change.' using errcode = 'P0001'; end if;
  new.deal_id := dp.deal_id; new.party_role := dp.role;
  new.closing_location_state := upper(nullif(btrim(coalesce(new.closing_location_state, '')), ''));
  new.closing_location_country := upper(nullif(btrim(coalesce(new.closing_location_country, '')), ''));
  select state into prop from public.deals where id = dp.deal_id;
  if new.in_state_at_closing = false and new.closing_location_state = prop then
    raise exception '% is the property''s state: answer Yes instead.', prop using errcode = 'P0001'; end if;
  if (tg_op = 'INSERT' and new.signing_method <> 'undecided') or (tg_op = 'UPDATE' and new.signing_method <> old.signing_method) then
    if not private.can_manage_closing_locations() and private.effective_uid() is not null then raise exception 'Only CLA Title sets the signing method.' using errcode = '42501'; end if; end if;
  if tg_op = 'INSERT' then new.created_at := now();
    if new.in_state_at_closing is not null then new.answered_at := now(); new.answered_by := private.effective_uid(); else new.answered_at := null; new.answered_by := null; end if;
  elsif (new.in_state_at_closing, new.closing_location_state, new.closing_location_country) is distinct from (old.in_state_at_closing, old.closing_location_state, old.closing_location_country) then
    new.answered_at := now(); new.answered_by := private.effective_uid();
  else new.answered_at := old.answered_at; new.answered_by := old.answered_by; end if;
  new.updated_at := now(); new.updated_by := coalesce(private.effective_uid(), new.updated_by);
  return new; end $function$$pf333$;
  end if;
end
$guard333$;
do $guard334$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_signing_method' and p.pronargs=2) then
    execute $pf334$CREATE OR REPLACE FUNCTION public.set_signing_method(p_participant uuid, p_method text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if not private.can_manage_closing_locations() then raise exception 'Only CLA Title sets the signing method.' using errcode = '42501'; end if;
  update public.closing_party_locations set signing_method = p_method where participant_id = p_participant;
  if not found then insert into public.closing_party_locations (participant_id, signing_method) values (p_participant, p_method); end if;
end $function$$pf334$;
  end if;
end
$guard334$;
do $guard335$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_shared_with_me' and p.pronargs=1) then
    execute $pf335$CREATE OR REPLACE FUNCTION private.crm_shared_with_me(p jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(p -> 'users', '[]') ? private.effective_uid()::text or coalesce(p -> 'roles', '[]') ? private.crm_role_key()
    or exists (select 1 from jsonb_array_elements_text(coalesce(p -> 'departments', '[]')) d where d = any (private.crm_depts_of(private.me_role()))) $function$$pf335$;
  end if;
end
$guard335$;
do $guard336$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='agent_can_fill' and p.pronargs=1) then
    execute $pf336$CREATE OR REPLACE FUNCTION private.agent_can_fill(p_task uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce((
    select private.deal_role(t.deal_id) in ('Buyer Agent', 'Listing Agent') and t.kind = 'form' and t.status <> 'cancelled' and t.owner_profile_id is not null
      and t.assigned_role in ('Client-Buyer', 'Client-Seller') and private.side_of(t.assigned_role) = private.side_of(private.deal_role(t.deal_id))
      and private.deal_role(t.deal_id) = any (tp.agent_roles) and not private.template_locked(tp.client_only, tp.fields)
      and exists (select 1 from public.deal_participants p where p.deal_id = t.deal_id and p.contact_id = private.my_contact_id() and p.role = private.deal_role(t.deal_id))
    from public.tasks t join public.task_templates tp on tp.id = t.template_id where t.id = p_task), false) $function$$pf336$;
  end if;
end
$guard336$;
do $guard337$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='agent_answers_visible' and p.pronargs=1) then
    execute $pf337$CREATE OR REPLACE FUNCTION private.agent_answers_visible(t tasks)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select t.owner_profile_id = private.effective_uid() or private.is_manager() or private.is_admin() $function$$pf337$;
  end if;
end
$guard337$;
do $guard338$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='form_owner_or_manager' and p.pronargs=1) then
    execute $pf338$CREATE OR REPLACE FUNCTION private.form_owner_or_manager(owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select owner = private.effective_uid() or private.is_manager() or private.is_admin() $function$$pf338$;
  end if;
end
$guard338$;
do $guard339$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='can_run_deal' and p.pronargs=1) then
    execute $pf339$CREATE OR REPLACE FUNCTION private.can_run_deal(d uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select (not private.is_preprocessor() and private.is_processor()) or (private.is_preprocessor() and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid())) $function$$pf339$;
  end if;
end
$guard339$;
do $guard340$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='trg_task_masked' and p.pronargs=0) then
    execute $pf340$CREATE OR REPLACE FUNCTION private.trg_task_masked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if private.effective_uid() is not null and new.form_data is distinct from old.form_data and cardinality(private.masked_keys(new.template_id)) > 0
     and not (new.owner_profile_id = private.effective_uid() or private.is_processor()) then
    raise exception 'Only the client and the processor can change bank details.' using errcode = '42501'; end if;
  return new; end $function$$pf340$;
  end if;
end
$guard340$;
do $guard341$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='doc_visible' and p.pronargs=3) then
    execute $pf341$CREATE OR REPLACE FUNCTION private.doc_visible(visibility text, uploader uuid, d uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select uploader = private.effective_uid() or private.is_staffish()
         or visibility = 'all' or (visibility in ('buyer', 'seller') and visibility = private.side_of(private.deal_role(d))) $function$$pf341$;
  end if;
end
$guard341$;
do $guard342$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='doc_visible' and p.pronargs=2) then
    execute $pf342$CREATE OR REPLACE FUNCTION private.doc_visible(visibility text, uploader uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select uploader = private.effective_uid() or private.is_staffish() or visibility = 'all' $function$$pf342$;
  end if;
end
$guard342$;
do $guard343$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='trg_doc_wire' and p.pronargs=0) then
    execute $pf343$CREATE OR REPLACE FUNCTION private.trg_doc_wire()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if tg_op = 'UPDATE' and new.wire_instructions is distinct from old.wire_instructions and private.effective_uid() is not null and not private.is_staffish() then
    raise exception 'Only CLA Title staff can mark wire instructions.' using errcode = '42501'; end if;
  if tg_op = 'INSERT' and new.wire_instructions and private.effective_uid() is not null and not private.is_staffish() then new.wire_instructions := false; end if;
  if private.wire_name(new.name) then new.wire_instructions := true; end if;   -- a file named wire instructions stays buyer-only
  return new; end $function$$pf343$;
  end if;
end
$guard343$;
do $guard344$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='visibility_allowed' and p.pronargs=2) then
    execute $pf344$CREATE OR REPLACE FUNCTION private.visibility_allowed(d uuid, vis text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select vis in ('all', 'buyer', 'seller', 'staff') and (
    private.is_staffish()
    or (vis = 'all' and private.deal_role(d) not in ('Client-Buyer', 'Client-Seller'))
    or (vis in ('buyer', 'seller') and vis = private.side_of(private.deal_role(d)))) $function$$pf344$;
  end if;
end
$guard344$;
do $guard345$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_orders' and p.pronargs=1) then
    execute $pf345$CREATE OR REPLACE FUNCTION private.crm_orders(p_contacts uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(jsonb_agg(o order by o->>'openDate' desc), '[]'::jsonb) from (
    select jsonb_build_object('dealId', d.id, 'fileNumber', d.file_number, 'address', d.street || ', ' || d.city || ', ' || d.state || ' ' || d.zip, 'openDate', d.open_date,
      'closingDate', d.closing_date, 'status', d.status, 'purchasePrice', d.purchase_price, 'canOpen', private.can_access_deal(d.id),
      'roles', (select jsonb_agg(distinct dp.role) from public.deal_participants dp where dp.deal_id = d.id and dp.contact_id = any (p_contacts)),
      'people', (select jsonb_agg(distinct btrim(c.first_name || ' ' || c.last_name) || ': ' || dp.role) from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = d.id and dp.contact_id = any (p_contacts))) o
    from public.deals d where exists (select 1 from public.deal_participants dp where dp.deal_id = d.id and dp.contact_id = any (p_contacts))) x $function$$pf345$;
  end if;
end
$guard345$;
do $guard346$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='folder_visible' and p.pronargs=1) then
    execute $pf346$CREATE OR REPLACE FUNCTION private.folder_visible(f uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select f is null or exists (select 1 from public.folders x where x.id = f and (not x.staff_only or private.is_staffish())
                              and (x.scope = 'library' or private.can_access_deal(x.deal_id))) $function$$pf346$;
  end if;
end
$guard346$;
do $guard347$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='start_demo_view' and p.pronargs=1) then
    execute $pf347$CREATE OR REPLACE FUNCTION public.start_demo_view(p_target uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ select private.start_demo_view(p_target) $function$$pf347$;
  end if;
end
$guard347$;
do $guard348$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='stop_demo_view' and p.pronargs=0) then
    execute $pf348$CREATE OR REPLACE FUNCTION public.stop_demo_view()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$ select private.stop_demo_view() $function$$pf348$;
  end if;
end
$guard348$;

do $hr$
begin
  if to_regprocedure('private.hr_open()') is null then
    create function private.hr_open() returns boolean language sql stable security definer
    set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
      select coalesce((select live from public.module_settings where module = 'hr'), false) $fn$;
  end if;
  if to_regprocedure('private.hr_my_employee()') is null then
    create function private.hr_my_employee() returns uuid language sql stable security definer
    set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
      select e.id from public.hr_employees e join public.profiles p on p.id = e.profile_id
      where e.profile_id = private.effective_uid() and e.archived_at is null and p.status = 'active' and p.role <> 'Outside user' $fn$;
  end if;
  if to_regprocedure('private.hr_is_manager()') is null then
    create function private.hr_is_manager() returns boolean language sql stable security definer
    set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
      select coalesce(private.hr_open() and exists (select 1 from public.hr_role_assignments a where a.employee_id = private.hr_my_employee() and a.role = 'hr_manager' and a.removed_at is null), false) $fn$;
  end if;
end
$hr$;

-- The November 9 deals policy file expects these four policies and this helper already present.
-- Created only when missing, so TEST's later policies are left as they are.
do $deals_pol$
begin
  if to_regprocedure('private.viewer_is_demo()') is null then
    create function private.viewer_is_demo() returns boolean language sql stable security definer
    set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
      select coalesce((select p.is_demo from public.profiles p where p.id = private.effective_uid() and p.status = 'active'), false) $fn$;
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.deals'::regclass and polname = 'deals_select') then
    execute 'create policy deals_select on public.deals for select to authenticated using (private.can_access_deal(id))';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.deals'::regclass and polname = 'demo_scope') then
    execute 'create policy demo_scope on public.deals as restrictive for all to authenticated using (is_demo = private.viewer_is_demo()) with check (is_demo = private.viewer_is_demo())';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.deals'::regclass and polname = 'deals_insert') then
    execute 'create policy deals_insert on public.deals for insert to authenticated with check (true)';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.deals'::regclass and polname = 'deals_update') then
    execute 'create policy deals_update on public.deals for update to authenticated using (true) with check (true)';
  end if;
end
$deals_pol$;

-- The November 9 files refuse these helpers unless signed-in users can run them and everyone else cannot.
revoke all on function private.viewer_is_demo() from public, anon;
grant execute on function private.viewer_is_demo() to authenticated;
revoke all on function private.me_role() from public, anon;
grant execute on function private.me_role() to authenticated;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;
revoke all on function private.can_access_deal(uuid) from public, anon;
grant execute on function private.can_access_deal(uuid) to authenticated;
revoke all on function private.effective_uid() from public;
grant execute on function private.effective_uid() to anon, authenticated;

-- The November 9 tasks file expects eight policies and these helpers already present.
do $tasks_pre$
begin
  if to_regprocedure('private.file_roles_of(uuid, uuid)') is null then
    create function private.file_roles_of(pid uuid, d uuid) returns text[]
    language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
      select case when pr.role is null then '{}'::text[] when pr.role <> 'Outside user' then array[pr.role]
        else coalesce((select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
                       from (select distinct p.role from public.deal_participants p join public.contacts c on c.id = p.contact_id
                             where p.deal_id = d and c.profile_id = pid and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')) x), array['Outside user']) end
      from (select (select role from public.profiles where id = pid) as role) pr
    $fn$;
  end if;
  if to_regprocedure('private.deal_roles(uuid)') is null then
    create function private.deal_roles(d uuid) returns text[]
    language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
      select case when private.me_role() is null then '{}'::text[] else private.file_roles_of(private.effective_uid(), d) end
    $fn$;
  end if;
  if to_regprocedure('private.person_side(uuid, uuid)') is null then
    create function private.person_side(pid uuid, d uuid) returns text
    language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
      select case when (select role from public.profiles where id = pid) is distinct from 'Outside user' then 'staff'
        else (select case when count(distinct s) = 1 then max(s) end from (select private.side_of(r) s from unnest(private.file_roles_of(pid, d)) r) x where s is not null) end
    $fn$;
  end if;
  if to_regprocedure('private.person_pure_buyer(uuid, uuid)') is null then
    create function private.person_pure_buyer(pid uuid, d uuid) returns boolean
    language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
      select pid is not null and d is not null and coalesce(private.person_side(pid, d) <> 'staff', false)
         and 'Client-Buyer' = any (private.file_roles_of(pid, d)) and not (private.file_roles_of(pid, d) && array['Buyer Agent', 'Listing Agent'])
    $fn$;
  end if;
  if to_regprocedure('private.is_pure_buyer(uuid)') is null then
    create function private.is_pure_buyer(d uuid) returns boolean
    language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
  select private.effective_uid() is not null and not private.is_staffish() and private.person_pure_buyer(private.effective_uid(), d) $fn$;
  end if;
  if to_regprocedure('private.task_visible(uuid, text, uuid)') is null then
    create function private.task_visible(owner uuid, assigned text, d uuid) returns boolean
    language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
  select private.is_staffish() or owner = private.effective_uid()
      or (owner is null and assigned = any (private.deal_roles(d)))
      or (private.deal_role(d) in ('Buyer Agent', 'Listing Agent') and private.side_of(assigned) = private.side_of(private.deal_role(d))) $fn$;
  end if;
  revoke all on function private.is_staffish() from public, anon;
  grant execute on function private.is_staffish() to authenticated;
  revoke all on function private.task_visible(uuid, text, uuid) from public, anon;
  grant execute on function private.task_visible(uuid, text, uuid) to authenticated;

  if not exists (select 1 from pg_policy where polrelid = 'public.tasks'::regclass and polname = 'tasks_select') then
    execute $p$create policy tasks_select on public.tasks for select to authenticated using (private.can_access_deal(deal_id) and private.task_visible(owner_profile_id, assigned_role, deal_id) and not (assigned_role = 'Client-Buyer' and private.emd_receipt_title(title) and private.is_pure_buyer(deal_id)))$p$;
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.tasks'::regclass and polname = 'demo_scope') then
    execute $p$create policy demo_scope on public.tasks as restrictive for all to authenticated using (case when deal_id is null then not private.viewer_is_demo() else (select d.is_demo from deals d where d.id = tasks.deal_id) = private.viewer_is_demo() end) with check (case when deal_id is null then not private.viewer_is_demo() else (select d.is_demo from deals d where d.id = tasks.deal_id) = private.viewer_is_demo() end)$p$;
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.tasks'::regclass and polname = 'tasks_insert') then
    execute 'create policy tasks_insert on public.tasks for insert to authenticated with check (true)';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.tasks'::regclass and polname = 'tasks_update') then
    execute 'create policy tasks_update on public.tasks for update to authenticated using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.tasks'::regclass and polname = 'tasks_audience_limit') then
    execute 'create policy tasks_audience_limit on public.tasks as restrictive for select to authenticated using (true)';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.tasks'::regclass and polname = 'tasks_retired_kept') then
    execute 'create policy tasks_retired_kept on public.tasks as restrictive for select to authenticated using (true)';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.tasks'::regclass and polname = 'tasks_switch_hidden') then
    execute 'create policy tasks_switch_hidden on public.tasks as restrictive for select to authenticated using (true)';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.tasks'::regclass and polname = 'tasks_switch_hidden_upd') then
    execute 'create policy tasks_switch_hidden_upd on public.tasks as restrictive for update to authenticated using (true) with check (true)';
  end if;
end
$tasks_pre$;

-- Captured preimage for the deal-contacts hoist. Created only when missing.
do $contacts_pre$
begin
  if to_regprocedure('private.person_pure_seller(uuid, uuid)') is null then
    create function private.person_pure_seller(pid uuid, d uuid) returns boolean
    language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
  select pid is not null and d is not null and coalesce(private.person_side(pid, d) <> 'staff', false)
     and 'Client-Seller' = any (private.file_roles_of(pid, d)) and not ('Client-Buyer' = any (private.file_roles_of(pid, d)))
     and not (private.file_roles_of(pid, d) && array['Buyer Agent', 'Listing Agent'])
$fn$;
  end if;
  if to_regprocedure('private.is_pure_seller(uuid)') is null then
    execute $c1$CREATE OR REPLACE FUNCTION private.is_pure_seller(d uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $inner$
  select private.effective_uid() is not null and not private.is_staffish() and private.person_pure_seller(private.effective_uid(), d) $inner$$c1$;
  end if;
  if to_regprocedure('private.my_side(uuid)') is null then
    execute $c2$CREATE OR REPLACE FUNCTION private.my_side(d uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $inner$
  select case when private.is_staffish() then 'staff' else private.person_side(private.effective_uid(), d) end $inner$$c2$;
  end if;
  if to_regprocedure('private.participant_visible(uuid, text)') is null then
    execute $c3$CREATE OR REPLACE FUNCTION private.participant_visible(d uuid, prole text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $inner$
  select private.can_access_deal(d) and not (private.deal_role(d) in ('Client-Buyer', 'Client-Seller') and prole like 'Client-%' and prole <> private.deal_role(d))
     and not (prole = 'Listing Agent' and private.is_pure_buyer(d))
     and not (prole = 'Buyer Agent' and private.is_pure_seller(d)) $inner$$c3$;
  end if;
  if to_regprocedure('private.rpc_deal_contacts(uuid)') is null then
    execute $c4$CREATE OR REPLACE FUNCTION private.rpc_deal_contacts(p_deal uuid)
 RETURNS TABLE(participant_id uuid, deal_id uuid, contact_id uuid, role text, profile_id uuid, first_name text, last_name text, company text, email text, phone text, contact_hidden boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $inner$
  select dp.id, dp.deal_id, c.id, dp.role, c.profile_id, c.first_name, c.last_name, c.company,
    case when h then '' else c.email end, case when h then '' else c.phone end, h
  from public.deal_participants dp join public.contacts c on c.id = dp.contact_id
  cross join lateral (select not (private.is_staffish() or c.id = private.my_contact_id() or private.side_of(dp.role) is null or private.side_of(dp.role) = private.my_side(p_deal)) h) z
  where dp.deal_id = p_deal and private.participant_visible(p_deal, dp.role) $inner$$c4$;
  end if;
  if to_regprocedure('public.deal_contacts(uuid)') is null then
    execute $c5$CREATE OR REPLACE FUNCTION public.deal_contacts(p_deal uuid)
 RETURNS TABLE(participant_id uuid, deal_id uuid, contact_id uuid, role text, profile_id uuid, first_name text, last_name text, company text, email text, phone text, contact_hidden boolean)
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $inner$ BEGIN RETURN QUERY SELECT * FROM private.rpc_deal_contacts(p_deal); END; $inner$$c5$;
  end if;
  revoke all on function private.rpc_deal_contacts(uuid) from public, anon;
  grant execute on function private.rpc_deal_contacts(uuid) to authenticated;
  revoke all on function private.participant_visible(uuid, text) from public, anon;
  grant execute on function private.participant_visible(uuid, text) to authenticated;
  revoke all on function private.my_side(uuid) from public, anon;
  grant execute on function private.my_side(uuid) to authenticated;
  revoke all on function private.is_pure_seller(uuid) from public, anon;
  grant execute on function private.is_pure_seller(uuid) to authenticated;
  revoke all on function private.side_of(text) from public, anon;
  grant execute on function private.side_of(text) to authenticated;
  revoke all on function private.deal_role(uuid) from public, anon;
  grant execute on function private.deal_role(uuid) to authenticated;
  revoke all on function private.is_pure_buyer(uuid) from public, anon;
  grant execute on function private.is_pure_buyer(uuid) to authenticated;
  revoke all on function private.my_contact_id() from public, anon;
  grant execute on function private.my_contact_id() to authenticated;
end
$contacts_pre$;

-- Documents policies as they stood before the agent-insert migration. Created only when missing.
alter table public.documents enable row level security;
do $docs_pre$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='documents_insert') then
    create policy documents_insert on public.documents for insert to authenticated with check (
      (uploaded_by = private.effective_uid()) AND private.upload_ext_ok(name) AND (((deal_id IS NOT NULL) AND private.can_access_deal(deal_id) AND (NOT private.is_view_only()) AND private.visibility_allowed(deal_id, visibility) AND ((folder_id IS NULL) OR private.folder_visible(folder_id))) OR ((deal_id IS NULL) AND (private.is_processor() OR private.is_admin()) AND (visibility = 'all'::text)))
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='documents_select') then
    if to_regprocedure('private.viewer_holds_buyer_agent(uuid)') is null then
      create function private.viewer_holds_buyer_agent(d uuid) returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
        select d is not null and 'Buyer Agent' = any (private.deal_roles(d)) and not private.is_staffish() $fn$;
    end if;
    if to_regprocedure('private.viewer_is_buyer_agent(uuid)') is null then
      create function private.viewer_is_buyer_agent(d uuid) returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
        select private.viewer_holds_buyer_agent(d) and not ('Client-Buyer' = any (private.deal_roles(d))) $fn$;
    end if;
    if to_regprocedure('private.wire_allowed(uuid)') is null then
      create function private.wire_allowed(d uuid) returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
        select private.is_staffish() or (d is not null and private.effective_uid() is not null and 'Client-Buyer' = any (private.deal_roles(d))) $fn$;
    end if;
    if to_regprocedure('private.buyer_doc_ok(uuid, uuid)') is null then
      create function private.buyer_doc_ok(pid uuid, doc uuid) returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
        select exists (select 1 from public.documents d where d.id = doc and (
          d.uploaded_by = pid or private.person_side(d.uploaded_by, d.deal_id) = 'staff'
          or exists (select 1 from public.signature_requests r join public.signature_signers s on s.request_id = r.id where r.document_id = d.id and s.profile_id = pid))) $fn$;
    end if;
    if to_regprocedure('private.seller_doc_ok(uuid, uuid)') is null then
      create function private.seller_doc_ok(pid uuid, doc uuid) returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
        select exists (select 1 from public.documents d where d.id = doc and (
          d.uploaded_by = pid or coalesce(private.person_side(d.uploaded_by, d.deal_id), '') in ('staff', 'seller')
          or exists (select 1 from public.signature_requests r join public.signature_signers s on s.request_id = r.id where r.document_id = d.id and s.profile_id = pid))) $fn$;
    end if;
    if to_regprocedure('private.document_readable(uuid)') is null then
create or replace function private.document_readable(doc uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $old$
  select exists (select 1 from public.documents d where d.id = doc and private.me_role() is not null
    and (d.deal_id is null or private.can_access_deal(d.deal_id)) and private.folder_visible(d.folder_id)
    and (not d.wire_instructions or d.uploaded_by = (select private.effective_uid()) or private.wire_allowed(d.deal_id))
    and not (private.viewer_is_buyer_agent(d.deal_id) and private.buyer_agent_blocked(d.title_doc_kind, d.name, d.doc_type, d.wire_instructions))
    and case when d.deal_id is not null and d.uploaded_by is distinct from (select private.effective_uid()) and private.is_pure_buyer(d.deal_id) then
           (d.shared_with_client and d.visibility <> 'staff')
           or (private.buyer_doc_ok((select private.effective_uid()), d.id) and private.doc_visible(d.visibility, d.uploaded_by, d.deal_id))
         when d.deal_id is not null and d.uploaded_by is distinct from (select private.effective_uid()) and private.is_pure_seller(d.deal_id) then
           (d.shared_with_seller and d.visibility <> 'staff')
           or (private.seller_doc_ok((select private.effective_uid()), d.id) and private.doc_visible(d.visibility, d.uploaded_by, d.deal_id))
         else private.doc_visible(d.visibility, d.uploaded_by, d.deal_id)
           or (d.title_doc_kind = 'title_commitment' and private.viewer_holds_buyer_agent(d.deal_id) and not private.buyer_agent_blocked(d.title_doc_kind, d.name, d.doc_type, d.wire_instructions))
         end) $old$;
      revoke all on function private.document_readable(uuid) from public, anon;
      grant execute on function private.document_readable(uuid) to authenticated;
    end if;
    create policy documents_select on public.documents for select to authenticated using (private.document_readable(id));

  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='documents_update') then
    create policy documents_update on public.documents for update to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='demo_scope') then
    create policy demo_scope on public.documents as restrictive for all to authenticated using (
      case when deal_id is null then not private.viewer_is_demo()
      else (select d.is_demo from public.deals d where d.id = documents.deal_id) = private.viewer_is_demo() end
    ) with check (
      case when deal_id is null then not private.viewer_is_demo()
      else (select d.is_demo from public.deals d where d.id = documents.deal_id) = private.viewer_is_demo() end
    );
  end if;
end
$docs_pre$;

-- profiles role list as TEST has it, and the HR accept function before the portal-role migration. Created only when missing.
do $hr_role$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_check') then
    alter table public.profiles add constraint profiles_role_check check (role = any (array['Processor','Preprocessor','Sales Person','Sales Team','Transaction Coordinator','Admin','Super admin','Outside user','Employee']));
  end if;
  if to_regprocedure('private.rpc_hr_accept_invite(text)') is null then
    create function private.rpc_hr_accept_invite(p_token text) returns uuid
    language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare v public.hr_invites; e public.hr_employees; me uuid := private.effective_uid(); pr public.profiles;
begin
  if me is null then raise exception 'Create your sign-in first.' using errcode = '42501'; end if;
  select * into v from public.hr_invites where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if found then select * into e from public.hr_employees where id = v.employee_id for update; end if;
  if v.id is null or v.accepted_at is not null or v.revoked_at is not null or v.expires_at < now() or e.archived_at is not null then
    raise exception 'This invite link is not valid or has expired. Ask HR for a new one.' using errcode = 'P0001'; end if;
  if e.profile_id is not null then raise exception 'This employee already has a portal login.' using errcode = 'P0001'; end if;
  select * into pr from public.profiles where id = me;
  if found then
    if pr.role = 'Outside user' or pr.status <> 'active' then raise exception 'This sign-in belongs to an agent or client login. Ask HR to use your work email.' using errcode = 'P0001'; end if;
    if lower(pr.email) <> lower(e.email) then raise exception 'This sign-in has a different email than the invite.' using errcode = 'P0001'; end if;
    if exists (select 1 from public.hr_employees z where z.profile_id = me) then raise exception 'This login is already linked to an employee.' using errcode = 'P0001'; end if;
  else
    if exists (select 1 from public.profiles where lower(email) = lower(e.email)) then raise exception 'Someone with that email already has a portal login.' using errcode = 'P0001'; end if;
    insert into public.profiles (id, email, first_name, last_name, phone, role) values (me, e.email, e.first_name, e.last_name,
      case when e.country = 'US' and length(regexp_replace(e.phone, '\D', '', 'g')) = 10 then private.fmt_phone(e.phone) else '' end, 'Employee');   -- profiles.phone is US-only
  end if;
  update public.hr_invites set accepted_at = now(), accepted_profile = me, token_hash = null where id = v.id;
  update public.hr_employees set profile_id = me where id = e.id;   -- the guard lets the new login link ONLY itself, after the invite above
  return e.id;
end $function$;
  end if;
end
$hr_role$;

-- CRM attachment policies as they stood before the email-policy fix. Created only when missing.
do $crm_att$
begin
  if to_regprocedure('private.crm_on()') is null then
    create function private.crm_on() returns boolean language sql stable security definer
      set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select coalesce((select enabled from private.features where name = 'crm'), false) $function$;
  end if;
  if to_regprocedure('private.crm_user()') is null then
    create function private.crm_user() returns boolean language sql stable security definer
      set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select private.crm_on() and (private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team'), false)) $function$;
  end if;
  if to_regprocedure('private.crm_editor()') is null then
    create function private.crm_editor() returns boolean language sql stable security definer
      set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false)) $function$;
  end if;
  if to_regprocedure('private.crm_email_record_visible(text, uuid)') is null then
    -- Argument names match TEST history 20261105222939 so that file can replace this stand-in.
    create function private.crm_email_record_visible(p_entity text, p_id uuid) returns boolean language sql stable security definer
      set search_path to 'pg_catalog', 'public', 'extensions' as $fn$ select false $fn$;
  end if;
  if to_regprocedure('private.crm_entity_visible(text, uuid)') is null then
    -- Argument names match TEST history 20261105222910 so that file can replace this stand-in.
    create function private.crm_entity_visible(p_entity text, p_id uuid) returns boolean language sql stable security definer
      set search_path to 'pg_catalog', 'public', 'extensions' as $fn$ select false $fn$;
  end if;
  if to_regprocedure('private.crm_template_visible(uuid)') is null then
    -- Argument name matches TEST history 20261105222930 so that file can replace this stand-in.
    create function private.crm_template_visible(p_id uuid) returns boolean language sql stable security definer
      set search_path to 'pg_catalog', 'public', 'extensions' as $fn$ select false $fn$;
  end if;
  if to_regprocedure('private.crm_template_editable(uuid)') is null then
    -- Argument name matches TEST history 20261105222930 so that file can replace this stand-in.
    create function private.crm_template_editable(p_id uuid) returns boolean language sql stable security definer
      set search_path to 'pg_catalog', 'public', 'extensions' as $fn$ select false $fn$;
  end if;
  if to_regclass('public.crm_attachments') is not null then
  alter table public.crm_attachments enable row level security;
  if not exists (select 1 from pg_policy where polrelid = to_regclass('public.crm_attachments') and polname = 'crm_att_select_email') then
    create policy crm_att_select_email on public.crm_attachments for select to authenticated using (
      (entity = 'email'::text) AND (EXISTS ( SELECT 1
         FROM crm_emails e
        WHERE ((e.id = e.entity_id) AND private.crm_email_record_visible(e.entity, e.entity_id))))
    );
  end if;
  if not exists (select 1 from pg_policy where polrelid = to_regclass('public.crm_attachments') and polname = 'crm_att_insert_email') then
    create policy crm_att_insert_email on public.crm_attachments for insert to authenticated with check (
      (entity = 'email'::text) AND private.crm_editor() AND (EXISTS ( SELECT 1
         FROM crm_emails e
        WHERE ((e.id = e.entity_id) AND (e.created_by = private.effective_uid()))))
    );
  end if;
  if not exists (select 1 from pg_policy where polrelid = to_regclass('public.crm_attachments') and polname = 'crm_att_select') then
    create policy crm_att_select on public.crm_attachments for select to authenticated using (private.crm_entity_visible(entity, entity_id));
  end if;
  if not exists (select 1 from pg_policy where polrelid = to_regclass('public.crm_attachments') and polname = 'crm_att_insert') then
    create policy crm_att_insert on public.crm_attachments for insert to authenticated with check (private.crm_editor() AND private.crm_entity_visible(entity, entity_id));
  end if;
  if not exists (select 1 from pg_policy where polrelid = to_regclass('public.crm_attachments') and polname = 'crm_att_select_tpl') then
    create policy crm_att_select_tpl on public.crm_attachments for select to authenticated using ((entity = 'template'::text) AND private.crm_template_visible(entity_id));
  end if;
  if not exists (select 1 from pg_policy where polrelid = to_regclass('public.crm_attachments') and polname = 'crm_att_insert_tpl') then
    create policy crm_att_insert_tpl on public.crm_attachments for insert to authenticated with check ((entity = 'template'::text) AND private.crm_template_editable(entity_id));
  end if;
  end if;
end
$crm_att$;

-- Supabase Vault, which the Gmail files assume and never install. Created only when missing.
create schema if not exists vault;
do $vault_pre$
begin
  if to_regclass('vault.secrets') is null then
    create table vault.secrets (
      id uuid primary key default gen_random_uuid(),
      name text,
      description text not null default '',
      secret text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    create view vault.decrypted_secrets as
      select id, name, description, secret as decrypted_secret, created_at, updated_at from vault.secrets;
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'vault' and p.proname = 'create_secret') then
    create function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid
    language plpgsql set search_path to pg_catalog, vault as $fn$
    declare i uuid;
    begin
      insert into vault.secrets (name, description, secret)
      values (new_name, coalesce(new_description, ''), coalesce(new_secret, ''))
      returning id into i;
      return i;
    end $fn$;
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'vault' and p.proname = 'update_secret') then
    create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null) returns void
    language plpgsql set search_path to pg_catalog, vault as $fn$
    begin
      update vault.secrets
         set secret = coalesce(new_secret, secret),
             name = coalesce(new_name, name),
             description = coalesce(new_description, description),
             updated_at = pg_catalog.now()
       where id = secret_id;
    end $fn$;
  end if;
  if not exists (select 1 from pg_extension where extname = 'supabase_vault') then
    insert into pg_extension (oid, extname, extowner, extnamespace, extrelocatable, extversion)
    values (
      999900,
      'supabase_vault',
      (select oid from pg_roles where rolname = current_user),
      (select oid from pg_namespace where nspname = 'vault'),
      false,
      '0.2.8'
    );
  end if;
end
$vault_pre$;

-- CRM helpers as they stood on Nov 9, before role access. Created only when missing.
do $crm_nov9$
begin
  if to_regprocedure('private.crm_all()') is null then
CREATE OR REPLACE FUNCTION private.crm_all()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor'), false)) $function$;
  end if;
  if to_regprocedure('private.crm_read_all()') is null then
CREATE OR REPLACE FUNCTION private.crm_read_all()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor'), false)) $function$;
  end if;
  if to_regprocedure('private.crm_deal_scope_all()') is null then
CREATE OR REPLACE FUNCTION private.crm_deal_scope_all()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Sales Team'), false)) $function$;
  end if;
  if to_regprocedure('private.crm_need(boolean)') is null then
CREATE OR REPLACE FUNCTION private.crm_need(p_edit boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if not private.crm_on() then raise exception 'The CRM is turned off on this portal.' using errcode = '42501'; end if;
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  if p_edit and not private.crm_editor() then raise exception 'The Processor has read-only access to the CRM.' using errcode = '42501'; end if;
end $function$;
  end if;
  if to_regprocedure('private.rpc_crm_deal_filters()') is null then
CREATE OR REPLACE FUNCTION private.rpc_crm_deal_filters()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare everyone boolean;
begin
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  everyone := private.crm_deal_scope_all();
  return jsonb_build_object('scope', case when everyone then 'all' else 'own' end, 'role', private.me_role(),
    'me', jsonb_build_object('id', private.effective_uid(), 'name', private.crm_name(private.effective_uid())),
    'owners', case when everyone then coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', btrim(p.first_name || ' ' || p.last_name), 'role', p.role) order by p.first_name, p.last_name)
      from public.profiles p where p.role in ('Sales Person', 'Sales Team') and (p.status = 'active' or exists (select 1 from public.deal_sales_people s where s.sales_id = p.id))), '[]') else '[]' end,
    'clients', case when everyone then coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', btrim(c.first_name || ' ' || c.last_name)) order by c.first_name, c.last_name)
      from public.contacts c where exists (select 1 from public.deal_participants p where p.contact_id = c.id and p.role in ('Client-Buyer', 'Client-Seller') and private.crm_deal_visible(p.deal_id))), '[]') else '[]' end,
    'sources', coalesce((select jsonb_agg(jsonb_build_object('value', o.value, 'label', o.label || case when o.retired then ' (retired)' else '' end) order by o.position, o.value)
      from public.crm_picklist_options o where o.list_key = 'leadSource' and (not o.retired or exists (select 1 from public.deal_business_sources b where b.source = o.value and private.crm_deal_visible(b.deal_id)))), '[]'),
    'statuses', '["Open", "Closed", "On Hold", "Cancelled", "All"]'::jsonb);
end $function$;
  end if;
  if to_regprocedure('private.rpc_crm_deals(text, text, uuid, text)') is null then
CREATE OR REPLACE FUNCTION private.rpc_crm_deals(p_status text DEFAULT NULL::text, p_owner text DEFAULT NULL::text, p_client uuid DEFAULT NULL::uuid, p_source text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare st text := nullif(btrim(coalesce(p_status, '')), ''); ow text := nullif(btrim(coalesce(p_owner, '')), ''); src text := nullif(btrim(coalesce(p_source, '')), '');
begin
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  if st is not null and st <> 'All' and st not in ('Open', 'Closed', 'On Hold', 'Cancelled') then raise exception 'Unknown status.' using errcode = '22023'; end if;
  if ow is not null and ow <> 'none' and ow !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Unknown deal owner.' using errcode = '22023'; end if;
  if ow is not null and not private.crm_deal_scope_all() and ow <> private.effective_uid()::text then raise exception 'A Sales Person sees only their own deals.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(private.crm_deal_row(g) order by g.closing_date desc nulls last, g.file_number) from public.deals g
    where private.crm_deal_visible(g.id)
      and (st is null or st = 'All' or g.status = st)
      and (ow is null or (ow = 'none' and not exists (select 1 from public.deal_sales_people s where s.deal_id = g.id))
           or exists (select 1 from public.deal_sales_people s where s.deal_id = g.id and s.sales_id::text = ow))
      and (p_client is null or exists (select 1 from public.deal_participants p where p.deal_id = g.id and p.contact_id = p_client and p.role in ('Client-Buyer', 'Client-Seller')))
      and (src is null or (src = 'none' and coalesce((select b.source from public.deal_business_sources b where b.deal_id = g.id), '') = '')
           or exists (select 1 from public.deal_business_sources b where b.deal_id = g.id and b.source = src))), '[]');
end $function$;
  end if;
  if to_regprocedure('private.rpc_crm_list_export(text, integer)') is null then
CREATE OR REPLACE FUNCTION private.rpc_crm_list_export(p_module text, p_rows integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v uuid;
begin
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can download CSV files from the CRM lists.' using errcode = '42501'; end if;
  if p_module not in ('contacts', 'leads', 'accounts') then raise exception 'CSV downloads are for the Clients, Leads and Companies lists.' using errcode = '22023'; end if;
  insert into public.crm_list_exports (module, exported_by, row_count) values (p_module, private.effective_uid(), greatest(coalesce(p_rows, 0), 0)) returning id into v;
  return v; end $function$;
  end if;
end
$crm_nov9$;

-- task_templates read policy as it stood before assignees could see field definitions. Created only when missing.
do $tpl_pre$
begin
  if to_regclass('public.task_templates') is not null
     and not exists (select 1 from pg_policy where polrelid = 'public.task_templates'::regclass and polname = 'templates_select') then
    create policy templates_select on public.task_templates for select to authenticated using (
      private.is_admin() or private.is_manager()
    );
  end if;
end
$tpl_pre$;

-- Listed document types, as they stood before free-text labels. Added only when missing.
do $doctype_pre$
begin
  if to_regclass('public.documents') is not null
     and not exists (select 1 from pg_constraint where conname = 'documents_doc_type_check') then
    alter table public.documents add constraint documents_doc_type_check
      check (doc_type = '' or doc_type = any (private.doc_types('staff')));
  end if;
  if to_regclass('public.documents') is not null then
    alter table public.documents enable row level security;
  end if;
end
$doctype_pre$;

-- CRM duplicate check as it stood before the indexed rewrite. Created only when missing.
do $dup_pre$
begin
  if to_regprocedure('private.crm_person_dup()') is null then
create or replace function private.crm_person_dup()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare j jsonb := to_jsonb(new); em text := lower(btrim(coalesce(new.email, ''))); ph text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'); hit record;
  my_lead uuid := case when tg_table_name = 'crm_leads' then new.id end; my_contact uuid := case when tg_table_name = 'contacts' then new.id end;
  from_lead uuid := case when tg_table_name = 'contacts' then (j ->> 'crm_lead_id')::uuid end;
begin
  if tg_table_name = 'contacts' then
    if coalesce(current_setting('crm.person_write', true), '') <> '1' then return new; end if;   -- only the CRM's client functions are checked (portal order parties are not CRM writes)
    if j ->> 'profile_id' is not null and exists (select 1 from public.profiles p where p.id = (j ->> 'profile_id')::uuid and p.role <> 'Outside user') then return new; end if;   -- CLA staff are not CRM people
  elsif j ->> 'converted_at' is not null or j ->> 'archived_at' is not null then return new; end if;
  if tg_op = 'UPDATE' then
    if lower(btrim(coalesce(old.email, ''))) = em then em := ''; end if;
    if regexp_replace(coalesce(old.phone, ''), '\D', '', 'g') = ph then ph := ''; end if; end if;
  if char_length(ph) < 7 or not coalesce((select enabled from public.crm_dup_rules where key = 'phone'), true) then ph := ''; end if;
  if em = '' and ph = '' then return new; end if;
  select 'Lead' as kind, l.first_name, l.last_name, l.owner_id as owner, (em <> '' and lower(l.email) = em) as by_email into hit from public.crm_leads l
    where l.id is distinct from my_lead and l.id is distinct from from_lead and l.converted_at is null and l.archived_at is null
      and ((em <> '' and lower(l.email) = em) or (ph <> '' and regexp_replace(l.phone, '\D', '', 'g') = ph)) limit 1;
  if hit.kind is null then
    select 'Client' as kind, c.first_name, c.last_name, c.crm_owner_id as owner, (em <> '' and lower(c.email) = em) as by_email into hit from public.contacts c
      where c.id is distinct from my_contact and c.crm_archived_at is null and private.crm_in_pool(c.id)
        and ((em <> '' and lower(c.email) = em) or (ph <> '' and regexp_replace(c.phone, '\D', '', 'g') = ph))
        and not (tg_table_name = 'crm_leads' and tg_op = 'UPDATE' and c.crm_lead_id = new.id) limit 1; end if;
  if hit.kind is not null then
    raise exception 'This % is already used by % % (owner %). Duplicates are not allowed.', case when hit.by_email then 'email' else 'phone number' end,
      hit.kind, btrim(hit.first_name || ' ' || hit.last_name), coalesce(private.crm_name(hit.owner), 'none') using errcode = '23505'; end if;
  return new; end $function$;
    revoke all on function private.crm_person_dup() from public, anon;
    grant execute on function private.crm_person_dup() to authenticated;
  end if;
  if to_regclass('public.crm_leads') is not null and not exists (
       select 1 from pg_trigger where tgname = 'crm_leads_person_dup' and tgrelid = to_regclass('public.crm_leads')) then
    create trigger crm_leads_person_dup before insert or update of email, phone on public.crm_leads
      for each row execute function private.crm_person_dup();
  end if;
  if to_regclass('public.contacts') is not null and not exists (
       select 1 from pg_trigger where tgname = 'contacts_person_dup' and tgrelid = 'public.contacts'::regclass) then
    create trigger contacts_person_dup before insert or update of email, phone on public.contacts
      for each row execute function private.crm_person_dup();
  end if;
end
$dup_pre$;
create unique index if not exists contacts_email_uq on public.contacts (lower(email))
  where email <> '';

-- Message policies as they stood before the everyone-on-the-file document insert. Created only when missing.
do $msg_pre$
begin
  if to_regprocedure('private.message_readable(uuid)') is null then
    create function private.message_readable(id uuid) returns boolean language sql stable security definer
      set search_path to 'pg_catalog', 'public', 'extensions' as $fn$ select false $fn$;
  end if;
  if to_regprocedure('private.thread_member(uuid)') is null then
    create function private.thread_member(t uuid) returns boolean language sql stable security definer
      set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
  select exists (select 1 from public.threads x where x.id = t and private.can_access_deal(x.deal_id)
                 and (private.is_processor() or private.is_admin() or private.is_manager()
                      or exists (select 1 from public.thread_participants tp where tp.thread_id = t and tp.profile_id = private.effective_uid()))) $fn$;
  end if;
  if to_regprocedure('private.thread_postable(uuid)') is null then
    create function private.thread_postable(id uuid) returns boolean language sql stable security definer
      set search_path to 'pg_catalog', 'public', 'extensions' as $fn$ select false $fn$;
  end if;
  if to_regclass('public.messages') is not null
     and not exists (select 1 from pg_policy where polrelid = 'public.messages'::regclass and polname = 'messages_select') then
    create policy messages_select on public.messages for select to authenticated using (private.message_readable(id));
  end if;
  if to_regclass('public.messages') is not null
     and not exists (select 1 from pg_policy where polrelid = 'public.messages'::regclass and polname = 'messages_insert') then
    create policy messages_insert on public.messages for insert to authenticated with check (
      author_id = private.effective_uid() and not private.is_view_only()
      and exists (select 1 from public.thread_participants tp where tp.thread_id = messages.thread_id and tp.profile_id = private.effective_uid())
      and private.thread_member(thread_id) and private.thread_postable(thread_id)
    );
  end if;
end
$msg_pre$;

-- Contact type list and row security the lender-file migration expects. Added only when missing.
do $ctype_pre$
begin
  if to_regclass('public.contacts') is not null
     and not exists (select 1 from pg_constraint where conname = 'contacts_contact_type_check') then
    alter table public.contacts add constraint contacts_contact_type_check
      check (contact_type is null or contact_type in ('realtor', 'lender', 'buyer_seller'));
  end if;
  if to_regclass('public.contacts') is not null then
    alter table public.contacts enable row level security;
  end if;
end
$ctype_pre$;

-- Staff table grants the lender-file migration expects to already cover new columns.
grant select, insert, update on public.deals, public.contacts to authenticated;

-- County-based closing default and scheduling read, from the nearest-office rollback. Created only when missing.
do $settle_pre$
begin
  if to_regprocedure('private.rpc_closing_office_default(uuid)') is null then
create or replace function private.rpc_closing_office_default(p_deal uuid)
returns table(office_id text, reason text, office_name text, office_address text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare s text; c text;
begin
  if not private.can_access_deal(p_deal) then raise exception 'Order not found' using errcode = '42501'; end if;
  select d.state, d.county into s, c from public.deals d where d.id = p_deal;
  return query select n.office_id, n.reason, o.name, private.office_address(o) from private.nearest_cla_office(s, c) n left join public.offices o on o.id = n.office_id;
end $function$;
  end if;
  if to_regprocedure('private.rpc_scheduling_get(text)') is null then
create or replace function private.rpc_scheduling_get(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare r record; file_number text; resp public.settlement_responses;
begin
  select * into r from private.settlement_by_token(p_token);
  if r.side is null then raise exception 'This scheduling link is not valid. Ask your title processor for a new one.'; end if;
  select d.file_number into file_number from public.deals d where d.id = (r.s).deal_id;
  select * into resp from public.settlement_responses where settlement_id = (r.s).id and round = (r.s).round and side = r.side;
  return jsonb_build_object('side', r.side, 'fileNumber', file_number, 'status', (r.s).status, 'round', (r.s).round,
    'slots', to_jsonb((r.s).slots), 'location', (r.s).location, 'note', (r.s).note, 'confirmedSlot', (r.s).confirmed_slot,
    'response', case when resp.id is null then null else jsonb_build_object('picks', resp.picks, 'note', resp.note, 'name', resp.responder_name, 'at', resp.at) end);
end $function$;
  end if;
end
$settle_pre$;

-- crm_imports primary key the hosted-import file expects. Added only when missing.
do $crmimp_pk$
begin
  if to_regclass('public.crm_imports') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.crm_imports') and contype = 'p'
  ) then
    alter table public.crm_imports add primary key (id);
  end if;
end
$crmimp_pk$;

-- Name labels the message-recipient file calls. Created only when missing.
do $label_pre$
begin
  if to_regprocedure('private.person_label(uuid)') is null then
    create function private.person_label(pid uuid) returns text language sql stable
      set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
      select coalesce((select trim(first_name || ' ' || last_name) || ' (' || role || ')' from public.profiles where id = pid), 'Unknown')
    $fn$;
  end if;
  if to_regprocedure('private.person_label(uuid, uuid, text)') is null then
    create function private.person_label(pid uuid, d uuid, cap text) returns text language sql stable security definer
      set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
      with r as (select private.file_roles_of(pid, d) rs), a as (select case when cap is not null and cap = any (rs) then cap else rs[1] end as cap, rs from r)
      select coalesce((select trim(p.first_name || ' ' || p.last_name) || ' (' ||
          case when cardinality(a.rs) > 1 then 'as ' || a.cap || '; also ' || array_to_string(array_remove(a.rs, a.cap), ', ') || ' on this file' else coalesce(a.cap, 'unknown role') end || ')'
        from public.profiles p, a where p.id = pid), 'Unknown')
    $fn$;
  end if;
  if to_regprocedure('private.person_label(uuid, uuid)') is null then
    create function private.person_label(pid uuid, d uuid) returns text language sql stable
      set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
      select private.person_label(pid, d, null)
    $fn$;
  end if;
end
$label_pre$;

-- Who may be messaged. Created only when missing.
do $canmsg_pre$
begin
  if to_regprocedure('private.can_message(uuid, uuid)') is null then
    create function private.can_message(pid uuid, d uuid) returns boolean language sql stable security definer
      set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
      select private.is_staffish() or private.person_side(pid, d) = 'staff' or (private.my_side(d) in ('buyer', 'seller') and private.person_side(pid, d) = private.my_side(d))
    $fn$;
  end if;
end
$canmsg_pre$;

-- Coordinator list before the TC contact backfill. Created only when missing.
do $tc_choices_pre$
begin
  if to_regprocedure('private.rpc_coordinator_choices()') is null then
    create or replace function private.rpc_coordinator_choices()
    returns table(profile_id uuid, contact_id uuid, first_name text, last_name text, email text, phone text, company text)
    language plpgsql stable security definer set search_path = pg_catalog, public, extensions as $$
begin
  if not private.is_processor() then raise exception 'Only a Processor or Admin can do this.' using errcode = 'P0001'; end if;
  return query select p.id, c.id, p.first_name, p.last_name, p.email, p.phone, c.company from public.profiles p join public.contacts c on c.profile_id = p.id
    where p.role = 'Transaction Coordinator' and p.status = 'active' order by p.first_name, p.last_name; end $$;
  end if;
end
$tc_choices_pre$;

-- The role-seed file looks up these logins and refuses to create them. Added only when missing.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);
insert into auth.users (email)
select v.email
from (values
  ('clatestportal+e2e-super-admin@gmail.com'),
  ('clatestportal+e2e-processor@gmail.com'),
  ('clatestportal+e2e-sales-person@gmail.com'),
  ('clatestportal+e2e-sales-team@gmail.com'),
  ('clatestportal+e2e-coordinator@gmail.com'),
  ('clatestportal+e2e-buyer-agent@gmail.com'),
  ('clatestportal+e2e-listing-agent@gmail.com'),
  ('clatestportal+e2e-buyer@gmail.com'),
  ('clatestportal+e2e-seller@gmail.com')
) as v(email)
where not exists (select 1 from auth.users u where lower(u.email) = lower(v.email));

-- Task copy trigger and template save captured before due anchors. Created only when missing.
do $due_pre$
begin
  if to_regprocedure('private.rpc_upsert_task_template(text, text, text, text[], integer, text, text[], boolean)') is null then
create or replace function private.rpc_upsert_task_template(p_code text, p_title text, p_description text, p_roles text[], p_due_days integer, p_lane text, p_audiences text[], p_client_only boolean default false)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare cur public.task_templates; ver int; aud text[]; lane text := p_lane; who text;
begin
  if (select private.effective_uid()) is null or not private.is_admin() then raise exception 'Only an Admin can manage task templates.' using errcode = '42501'; end if;
  if p_code !~ '^[a-z_]{2,40}$' then raise exception 'Task code must be 2 to 40 lowercase letters or underscores.' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_title, ''))) < 2 then raise exception 'A task needs a title.' using errcode = '22023'; end if;
  if lane not in ('portal', 'production') then raise exception 'Classify the task as Title Portal or Title Production.' using errcode = '22023'; end if;
  aud := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_audiences, '{}')) x);
  if exists (select 1 from unnest(aud) a where a not in ('buyer','seller','listing_agent','buyer_agent','sales_team','transaction_coordinator','internal')) then raise exception 'Unknown task audience.' using errcode = '22023'; end if;
  if lane = 'production' and cardinality(aud) = 0 then aud := array['internal']; end if;
  if cardinality(aud) = 0 then raise exception 'Pick who this task is for, or Internal only.' using errcode = '22023'; end if;
  if p_due_days is null or p_due_days < 1 or p_due_days > 90 then raise exception 'Due days must be from 1 to 90.' using errcode = '22023'; end if;
  select * into cur from public.task_templates where code = p_code order by version desc limit 1;
  ver := coalesce(cur.version, 0) + 1;
  update public.task_templates set active = false where code = p_code;
  insert into public.task_templates (code, version, title, description, roles, due_days, fields, active, published_by, lane, audiences, client_only)
  values (p_code, ver, btrim(p_title), coalesce(p_description, ''), coalesce(p_roles, '{}'), p_due_days, coalesce(cur.fields, '[]'::jsonb), true, private.effective_uid(), lane, aud, coalesce(p_client_only, false));
  insert into public.task_template_switches (code) values (p_code) on conflict (code) do nothing;
  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into who from public.profiles where id = private.effective_uid();
  insert into public.task_template_admin_log (code, action, detail, changed_by, changed_by_name) values (p_code, 'saved', lane || ' ' || array_to_string(aud, ','), private.effective_uid(), coalesce(who, ''));
  return jsonb_build_object('code', p_code, 'version', ver, 'lane', lane, 'audiences', aud, 'title', btrim(p_title));
end $function$;
  end if;
  if to_regprocedure('private.trg_participant_copies()') is null then
create or replace function private.trg_participant_copies() returns trigger
language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare owner uuid; n int;
begin
  select profile_id into owner from public.contacts where id = new.contact_id;
  insert into public.tasks (deal_id, title, description, assigned_role, status, due_date, created_by, kind, participant_id, owner_profile_id, template_id, template_code, template_version, lane, audiences)
  select new.deal_id, t.title, t.description, new.role, 'todo', current_date + t.due_days, private.effective_uid(), 'form', new.id, owner, t.id, t.code, t.version, t.lane, t.audiences
  from public.task_templates t where t.active and t.retired_at is null and new.role = any (t.roles) and private.task_enabled(t.code)
    and (t.audiences is null or (not (t.audiences = array['internal']::text[]) and (
      (new.role = 'Client-Buyer' and 'buyer' = any (t.audiences)) or (new.role = 'Client-Seller' and 'seller' = any (t.audiences))
      or (new.role = 'Buyer Agent' and 'buyer_agent' = any (t.audiences)) or (new.role = 'Listing Agent' and 'listing_agent' = any (t.audiences))
      or (new.role in ('Sales Person', 'Sales Team') and 'sales_team' = any (t.audiences))
      or (new.role = 'Transaction Coordinator' and 'transaction_coordinator' = any (t.audiences)))))
    and not exists (select 1 from public.tasks x where x.participant_id = new.id and x.template_code = t.code and x.status <> 'cancelled');
  get diagnostics n = row_count;
  if n > 0 and owner is not null then perform private.notify(array[owner], 'task', new.deal_id, n || ' new task(s) on your order', '#/deals/' || new.deal_id || '/tasks'); end if;
  return new; end $function$;
  end if;
end
$due_pre$;

-- Task template due-day rule and the copy trigger, as they stood before anchors. Added only when missing.
do $duedays_pre$
begin
  if to_regclass('public.task_templates') is not null
     and not exists (select 1 from pg_constraint where conname = 'task_templates_due_days_check') then
    alter table public.task_templates add constraint task_templates_due_days_check
      check (due_days >= 1 and due_days <= 90);
  end if;
  if to_regclass('public.deal_participants') is not null
     and not exists (select 1 from pg_trigger where tgname = 'participants_copies' and not tgisinternal) then
    create trigger participants_copies after insert on public.deal_participants
      for each row execute function private.trg_participant_copies();
  end if;
end
$duedays_pre$;

-- Insert-only rights on tasks, and the audience check before clients could read it. Added only when missing.
grant insert on public.tasks to authenticated;
do $aud_pre$
begin
  if to_regprocedure('private.task_outside_audience(uuid)') is null then
    create function private.task_outside_audience(p_task uuid) returns boolean
    language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select exists (select 1 from public.tasks t where t.id = p_task and t.audiences is not null and (
    ('Client-Buyer' = any (private.deal_roles(t.deal_id)) and 'buyer' = any (t.audiences) and t.owner_profile_id = (select private.effective_uid()) and not (t.audiences = array['internal']::text[]))
    or ('Client-Seller' = any (private.deal_roles(t.deal_id)) and 'seller' = any (t.audiences) and t.owner_profile_id = (select private.effective_uid()) and not (t.audiences = array['internal']::text[]))
    or ('Buyer Agent' = any (private.deal_roles(t.deal_id)) and 'buyer_agent' = any (t.audiences))
    or ('Listing Agent' = any (private.deal_roles(t.deal_id)) and 'listing_agent' = any (t.audiences)))) $function$;
  end if;
end
$aud_pre$;

-- Staff-read helpers and activity policies as they stood before the one-pass rewrite. Created only when missing.
do $staffread_pre$
begin
  if to_regprocedure('private.file_title(uuid)') is null then
    create function private.file_title(p_deal uuid) returns text language sql stable security definer
      set search_path to 'pg_catalog', 'public', 'extensions' as $fn$ select ''::text $fn$;
  end if;
  if to_regprocedure('public.deal_file_titles(uuid)') is null then
    create function public.deal_file_titles(p_deal uuid default null)
    returns table (deal_id uuid, file_title text)
    language sql stable set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
  select d.id, private.file_title(d.id) from public.deals d where p_deal is null or d.id = p_deal $fn$;
    revoke all on function public.deal_file_titles(uuid) from public, anon;
    grant execute on function public.deal_file_titles(uuid) to authenticated;
  end if;
  if to_regprocedure('public.deal_list_extras()') is null then
    create function public.deal_list_extras()
    returns table (deal_id uuid, party_names text[], overdue_tasks integer)
    language sql stable set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
  select d.id,
         coalesce((select array_agg(distinct trim(c.first_name || ' ' || c.last_name)) from public.deal_contacts(d.id) c), '{}'),
         (select count(*)::int from public.tasks t where t.deal_id = d.id and t.status in ('todo', 'in_progress', 'blocked') and t.due_date < private.office_today())
  from public.deals d $fn$;
    revoke all on function public.deal_list_extras() from public, anon;
    grant execute on function public.deal_list_extras() to authenticated;
  end if;
  if to_regprocedure('private.rpc_my_file_roles_full()') is null then
    create function private.rpc_my_file_roles_full()
    returns table (deal_id uuid, role text, roles text[], label text, self_rep boolean)
    language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
  select d.id, private.deal_role(d.id), private.deal_roles(d.id), private.role_text(private.deal_roles(d.id)),
         coalesce(cardinality(private.deal_roles(d.id)) = 2 and private.self_rep_pair((private.deal_roles(d.id))[1], (private.deal_roles(d.id))[2]), false)
  from public.deals d where private.can_access_deal(d.id) $fn$;
    revoke all on function private.rpc_my_file_roles_full() from public, anon;
    grant execute on function private.rpc_my_file_roles_full() to authenticated;
  end if;
  if to_regprocedure('public.my_file_roles_full()') is null then
    create function public.my_file_roles_full()
    returns table (deal_id uuid, role text, roles text[], label text, self_rep boolean)
    language plpgsql stable set search_path to 'pg_catalog', 'public', 'extensions' as $fn$ BEGIN RETURN QUERY SELECT * FROM private.rpc_my_file_roles_full(); END; $fn$;
    revoke all on function public.my_file_roles_full() from public, anon;
    grant execute on function public.my_file_roles_full() to authenticated;
  end if;
  if to_regclass('public.activity_log') is not null
     and not exists (select 1 from pg_policy where polrelid = 'public.activity_log'::regclass and polname = 'activity_select') then
    execute $pol$create policy activity_select on public.activity_log for select to authenticated using (((private.me_role() IS NOT NULL) AND private.is_staffish() AND (private.is_admin() OR ((((deal_id IS NULL) AND private.is_processor()) OR ((deal_id IS NOT NULL) AND private.can_access_deal(deal_id))) AND (private.is_processor() OR (entity IS NULL) OR (entity_id IS NULL) OR ((entity = 'document'::text) AND private.document_readable(entity_id)) OR ((entity = 'thread'::text) AND private.thread_member(entity_id)) OR (entity <> ALL (ARRAY['document'::text, 'thread'::text])))))))$pol$;
  end if;
  if to_regclass('public.activity_log') is not null
     and not exists (select 1 from pg_policy where polrelid = 'public.activity_log'::regclass and polname = 'demo_scope') then
    execute $pol$create policy demo_scope on public.activity_log as restrictive for all to authenticated using (
CASE
    WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo())
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = activity_log.deal_id)) = private.viewer_is_demo())
END) with check (
CASE
    WHEN (deal_id IS NULL) THEN (NOT private.viewer_is_demo())
    ELSE (( SELECT d.is_demo
       FROM deals d
      WHERE (d.id = activity_log.deal_id)) = private.viewer_is_demo())
END)$pol$;
  end if;
end
$staffread_pre$;

-- Task guard and invite lookups captured before the sign-in change. Created only when missing.
do $invite_pre$
begin
  if to_regprocedure('private.task_guard()') is null then
create or replace function private.task_guard()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $fn$
declare tp public.task_templates;
begin
  if new.participant_id is distinct from old.participant_id and new.participant_id is not null then raise exception 'A participant task stays with that participant'; end if;
  if old.owner_profile_id is not null and new.assigned_role <> old.assigned_role then raise exception 'A participant task stays with that participant'; end if;
  if new.kind = 'form' and new.status = 'done' and old.status <> 'done' and coalesce(current_setting('cla.form_rpc', true), '') <> 'on' then
    select * into tp from public.task_templates where id = new.template_id;
    begin perform private.validate_form(private.fields_for_role(tp.fields, new.assigned_role), new.form_data, true, new.deal_id);
    exception when others then raise exception 'The form is not complete yet: %', sqlerrm; end;
    new.completed_at := now(); new.completed_by := private.effective_uid();
  end if;
  return new; end $fn$;
  end if;
  if to_regprocedure('private.rpc_save_task_form(uuid, jsonb, boolean)') is null then
create or replace function private.rpc_save_task_form(p_task uuid, p_data jsonb, p_complete boolean default false)
returns text
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $fn$
declare t public.tasks; tp public.task_templates; clean jsonb; for_client boolean; prev uuid; note text := ''; self_rep boolean;
begin
  select * into t from public.tasks where id = p_task;
  if not found or not private.can_access_deal(t.deal_id) or not private.task_visible(t.owner_profile_id, t.assigned_role, t.deal_id) then raise exception 'Task not found'; end if;
  for_client := t.owner_profile_id is distinct from private.effective_uid() and private.agent_can_fill(p_task);
  if t.kind <> 'form' or t.status = 'cancelled' or not (t.owner_profile_id = private.effective_uid() or private.is_manager() or for_client) then raise exception 'You cannot fill in this task.'; end if;
  select * into tp from public.task_templates where id = t.template_id;
  clean := private.validate_form(private.fields_for_role(tp.fields, t.assigned_role), coalesce(p_data, '{}'), p_complete, t.deal_id);
  prev := coalesce(t.saved_by, t.completed_by);
  self_rep := cardinality(private.deal_roles(t.deal_id)) > 1;
  if for_client then note := ' by ' || private.person_label(private.effective_uid(), t.deal_id) || ' on behalf of ' || private.person_name(t.owner_profile_id);
  elsif t.owner_profile_id = private.effective_uid() and prev is not null and prev <> private.effective_uid() and private.file_role_of(prev, t.deal_id) in ('Buyer Agent', 'Listing Agent') then
    note := ' by ' || case when self_rep then private.person_label(private.effective_uid(), t.deal_id, t.assigned_role) else private.person_name(private.effective_uid()) end
         || ' (changed answers entered by ' || private.person_label(prev, t.deal_id) || ')';
  elsif t.owner_profile_id is not null and t.owner_profile_id <> private.effective_uid() then note := ' by ' || private.person_label(private.effective_uid(), t.deal_id);
  elsif self_rep then note := ' by ' || private.person_label(private.effective_uid(), t.deal_id, case when t.owner_profile_id = private.effective_uid() then t.assigned_role end); end if;
  perform set_config('cla.form_rpc', 'on', true);
  update public.tasks set form_data = clean, saved_at = now(), saved_by = private.effective_uid(),
    status = case when p_complete then 'done' when t.status = 'blocked' then 'blocked' else 'in_progress' end,
    completed_at = case when p_complete then now() end, completed_by = case when p_complete then private.effective_uid() end where id = p_task;
  perform set_config('cla.form_rpc', 'off', true);
  perform private.log_activity(t.deal_id, case when p_complete then 'task.completed' else 'task.saved' end, 'task', t.id,
    t.title || case when p_complete then ': completed' else ': progress saved' end || note);
  if p_complete then perform private.notify(array[(select processor_id from public.deals where id = t.deal_id)], 'task', t.deal_id, 'Completed: ' || t.title, '#/deals/' || t.deal_id || '/tasks/' || t.id); end if;
  if for_client then perform private.notify(array[t.owner_profile_id], 'task', t.deal_id,
    private.person_name(private.effective_uid()) || case when p_complete then ' completed ' else ' started ' end || t.title || ' for you - please check the answers', '#/deals/' || t.deal_id || '/tasks/' || t.id); end if;
  return case when p_complete then 'done' else 'in_progress' end; end $fn$;
  end if;
  if to_regprocedure('private.rpc_portal_invite_lookup(text)') is null then
create or replace function private.rpc_portal_invite_lookup(p_token text)
returns table(status text, first_name text, last_name text, email text, expires_at timestamptz, invite_kind text)
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $fn$
  select coalesce((select public.agent_invite_status(i) from public.agent_invites i where i.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')), 'invalid'),
    i.first_name, i.last_name, i.email, i.expires_at, i.invite_kind
  from (select 1) one left join public.agent_invites i on i.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and public.agent_invite_status(i) = 'pending' $fn$;
  end if;
  if to_regprocedure('private.rpc_hr_invite_lookup(text)') is null then
create or replace function private.rpc_hr_invite_lookup(p_token text)
returns table(status text, first_name text, last_name text, email text, expires_at timestamptz)
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $fn$
  select case when v.id is null or e.archived_at is not null then 'invalid' when v.accepted_at is not null then 'accepted' when v.revoked_at is not null then 'revoked'
      when v.expires_at < now() then 'expired' else 'pending' end,
    case when v.expires_at >= now() then e.first_name end, case when v.expires_at >= now() then e.last_name end, case when v.expires_at >= now() then v.email end, v.expires_at
  from (select 1) one left join public.hr_invites v on v.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') left join public.hr_employees e on e.id = v.employee_id $fn$;
  end if;
end
$invite_pre$;

-- Wire-list helper and the old select-star wrapper. Created only when missing.
do $wire_pre$
begin
  if to_regprocedure('private.person_wire_allowed(uuid, uuid)') is null then
    create function private.person_wire_allowed(pid uuid, d uuid) returns boolean
    language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select exists (select 1 from public.profiles p where p.id = pid and p.status = 'active'
    and (p.role <> 'Outside user' or (d is not null and 'Client-Buyer' = any (private.file_roles_of(pid, d))))) $function$;
  end if;
  if to_regprocedure('private.rpc_wire_recipients(uuid)') is null then
    create function private.rpc_wire_recipients(p_deal uuid)
    returns table(id uuid, first_name text, last_name text, role text, side text)
    language plpgsql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
begin
  return query select r.* from public.message_recipients(p_deal) r where private.person_wire_allowed(r.id, p_deal);
end $function$;
  end if;
end
$wire_pre$;

-- Thread policies the rest-read file expects to already name thread_member. Created only when missing.
do $threadpol_pre$
begin
  if to_regclass('public.threads') is not null
     and not exists (select 1 from pg_policy where polrelid = 'public.threads'::regclass and polname = 'threads_select') then
    create policy threads_select on public.threads for select to authenticated using (private.thread_member(id));
  end if;
  if to_regclass('public.threads') is not null
     and not exists (select 1 from pg_policy where polrelid = 'public.threads'::regclass and polname = 'demo_scope') then
    create policy demo_scope on public.threads as restrictive for all to authenticated using (
      case when deal_id is null then not private.viewer_is_demo()
      else (select d.is_demo from public.deals d where d.id = threads.deal_id) = private.viewer_is_demo() end
    ) with check (
      case when deal_id is null then not private.viewer_is_demo()
      else (select d.is_demo from public.deals d where d.id = threads.deal_id) = private.viewer_is_demo() end
    );
  end if;
  if to_regclass('public.thread_participants') is not null
     and not exists (select 1 from pg_policy where polrelid = 'public.thread_participants'::regclass and polname = 'tp_select') then
    create policy tp_select on public.thread_participants for select to authenticated using (private.thread_member(thread_id));
  end if;
end
$threadpol_pre$;

-- Agent party list the rest-read file checks. Created only when missing.
do $parties_pre$
begin
  if to_regprocedure('private.rpc_agent_parties()') is null then
    create function private.rpc_agent_parties()
    returns table (deal_id uuid, contact_id uuid, name text, label text)
    language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$
  select a.deal_id, a.contact_id, trim(c.first_name || ' ' || c.last_name),
         case when a.role = 'Client-Buyer' then 'Buyer + Buyer''s Agent' else 'Seller + Listing Agent' end
  from public.deal_participants a join public.deal_participants b on b.deal_id = a.deal_id and b.contact_id = a.contact_id and private.self_rep_pair(a.role, b.role)
  join public.contacts c on c.id = a.contact_id
  where a.role in ('Client-Buyer', 'Client-Seller') and private.is_staffish() and private.can_access_deal(a.deal_id) $fn$;
  end if;
  if to_regprocedure('public.agent_parties()') is null then
    create function public.agent_parties()
    returns table (deal_id uuid, contact_id uuid, name text, label text)
    language plpgsql stable set search_path to 'pg_catalog', 'public', 'extensions' as $fn$ BEGIN RETURN QUERY SELECT * FROM private.rpc_agent_parties(); END; $fn$;
  end if;
end
$parties_pre$;

-- Notification read policy the rest-read file checks. Created only when missing.
do $note_pre$
begin
  if to_regclass('public.notifications') is not null
     and not exists (select 1 from pg_policy where polrelid = 'public.notifications'::regclass and polname = 'notifications_select') then
    create policy notifications_select on public.notifications for select to authenticated using ((profile_id = private.effective_uid()));
  end if;
  if to_regclass('public.notifications') is not null
     and not exists (select 1 from pg_policy where polrelid = 'public.notifications'::regclass and polname = 'demo_scope') then
    create policy demo_scope on public.notifications as restrictive for all to authenticated using (
      case when deal_id is null then not private.viewer_is_demo()
      else (select d.is_demo from public.deals d where d.id = notifications.deal_id) = private.viewer_is_demo() end
    ) with check (
      case when deal_id is null then not private.viewer_is_demo()
      else (select d.is_demo from public.deals d where d.id = notifications.deal_id) = private.viewer_is_demo() end
    );
  end if;
end
$note_pre$;

-- Task board and my task list captured before owner names. Created only when missing.
do $board_pre$
begin
  if to_regprocedure('public.task_board(text)') is null then
create or replace function public.task_board(p_file_status text default 'All')
returns table (
  id uuid, deal_id uuid, title text, description text, assigned_role text, status text, due_date date,
  completed_at timestamptz, completed_by uuid, kind text, participant_id uuid, owner_profile_id uuid,
  template_code text, template_version integer, created_at timestamptz,
  file_number text, street text, city text, state text, zip text, closing_date date, deal_status text,
  owner_name text, overdue boolean
)
language sql stable security invoker set search_path to pg_catalog, public, extensions as $board$
      -- task_board_one_contact_scan
      with board as (
        select t.id, t.deal_id, t.title, t.description, t.assigned_role, t.status, t.due_date, t.completed_at, t.completed_by,
               t.kind, t.participant_id, t.owner_profile_id, t.template_code, t.template_version, t.created_at,
               d.file_number, d.street, d.city, d.state, d.zip, d.closing_date, d.status as deal_status
        from public.tasks t
        join public.deals d on d.id = t.deal_id
        where coalesce(p_file_status, 'All') = 'All' or d.status = p_file_status
      ),
      names as (
        select picked.deal_id, picked.participant_id, picked.owner_name
        from (
          select files.deal_id, c.participant_id, trim(c.first_name || ' ' || c.last_name) as owner_name,
                 row_number() over (partition by files.deal_id, c.participant_id order by c.participant_id) as n
          from (select distinct board.deal_id from board) files
          cross join lateral public.deal_contacts(files.deal_id) c
          where c.participant_id is not null
        ) picked
        where picked.n = 1
      )
      select board.id, board.deal_id, board.title, board.description, board.assigned_role, board.status, board.due_date,
             board.completed_at, board.completed_by, board.kind, board.participant_id, board.owner_profile_id,
             board.template_code, board.template_version, board.created_at,
             board.file_number, board.street, board.city, board.state, board.zip, board.closing_date, board.deal_status,
             names.owner_name,
             (board.status in ('todo', 'in_progress', 'blocked') and board.due_date is not null and board.due_date < private.office_today())
      from board
      left join names on names.deal_id = board.deal_id and names.participant_id = board.participant_id
      order by board.file_number, board.due_date nulls last, board.title
$board$;
    revoke all on function public.task_board(text) from public, anon;
    grant execute on function public.task_board(text) to authenticated;
  end if;
  if to_regprocedure('public.my_task_list(text)') is null then
create or replace function public.my_task_list(p_file_status text default 'Open')
returns table (
  id uuid, deal_id uuid, title text, description text, assigned_role text, status text, due_date date,
  completed_at timestamptz, completed_by uuid, kind text, participant_id uuid, owner_profile_id uuid,
  template_code text, template_version integer, created_at timestamptz,
  file_number text, street text, city text, state text, zip text, closing_date date, deal_status text,
  owner_name text, overdue boolean, my_roles text[]
)
language sql stable security invoker set search_path to pg_catalog, public, extensions as $mine$
  select b.*, case when private.is_staffish() then array[private.me_role()] else private.deal_roles(b.deal_id) end
  from public.task_board(coalesce(p_file_status, 'Open')) b
  where b.owner_profile_id = private.effective_uid()
     or (b.participant_id is null and (b.assigned_role = any (private.deal_roles(b.deal_id)) or (private.is_staffish() and b.assigned_role = private.me_role())))
  order by b.due_date nulls last, b.file_number, b.title $mine$;
    revoke all on function public.my_task_list(text) from public, anon;
    grant execute on function public.my_task_list(text) to authenticated;
  end if;
end
$board_pre$;

-- Post-closing, funding, and title editors the outbox file expects. Created only when missing.
do $editors_pre$
begin
  if to_regprocedure('private.post_closing_editor(uuid, text)') is null then
    create function private.post_closing_editor(d uuid, child text default 'post-closing') returns boolean
    language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$ select false $fn$;
  end if;
  if to_regprocedure('private.fwp_staff(text, uuid)') is null then
    create function private.fwp_staff(p_module text, p_deal uuid) returns boolean
    language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$ select false $fn$;
  end if;
  if to_regprocedure('private.title_editor(uuid)') is null then
    create function private.title_editor(d uuid) returns boolean
    language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $fn$ select false $fn$;
  end if;
end
$editors_pre$;

-- The buyer personal-info file expects the active version 4 template. Inserted only when that code is absent.
-- Personal information version 4, copied from TEST. Later files publish versions
-- 5 through 8 from this row. Inserted only when that code is absent.
insert into public.task_templates (code, version, title, description, roles, due_days, fields, active, agent_roles, client_only)
select 'personal_info', 4, 'Personal information',
  'Contact details and closing preferences, power of attorney, and whether you are buying or selling as an entity (LLC, corporation, partnership or trust) and who represents it.',
  array['Client-Buyer','Client-Seller']::text[], 7,
  '[{"k":"full_name","req":true,"type":"text","label":"Full legal name"},{"k":"email","req":true,"type":"email","label":"Email"},{"k":"cell_phone","req":true,"type":"phone","label":"Cell phone"},{"k":"current_address","req":true,"type":"text","label":"Current address"},{"k":"marital_status","req":true,"opts":["Single","Married","Divorced","Widowed"],"type":"select","label":"Marital status"},{"k":"attending_closing","req":true,"opts":["Yes","No"],"type":"select","label":"Will you attend the closing?"},{"k":"settlement_type","req":true,"opts":["In person","Online"],"type":"select","label":"In-person or online settlement?","roles":["Client-Seller"]},{"k":"power_of_attorney","req":false,"opts":["Yes","No"],"type":"select","label":"Will you use a power of attorney?"},{"k":"poa_agent_name","req":true,"type":"text","when":["power_of_attorney","Yes"],"label":"Who is your Agent? (the person who will sign for you under the power of attorney)"},{"k":"poa_agent_relationship","req":true,"type":"text","when":["power_of_attorney","Yes"],"label":"Relationship to you"},{"k":"poa_agent_phone","req":true,"type":"phone","when":["power_of_attorney","Yes"],"label":"Agent''s phone"},{"k":"poa_agent_email","req":false,"type":"email","when":["power_of_attorney","Yes"],"label":"Agent''s email"},{"k":"poa_reason","req":true,"type":"textarea","when":["power_of_attorney","Yes"],"label":"Why is a power of attorney needed?"},{"k":"is_entity","req":false,"plus":true,"type":"checkbox","label":"Add entity (I am buying / selling as an LLC, corporation, partnership or trust)"},{"k":"entity_name","req":true,"type":"text","when":["is_entity",true],"label":"Entity name (exactly as registered)"},{"k":"entity_type","req":true,"opts":["LLC","Corporation","Partnership","Trust","Other"],"type":"select","when":["is_entity",true],"label":"Entity type"},{"k":"entity_state","req":true,"type":"state","when":["is_entity",true],"label":"State where the entity was formed"},{"k":"entity_signer_name","req":true,"type":"text","when":["is_entity",true],"label":"Authorized signer (full name)"},{"k":"entity_signer_title","req":true,"type":"text","when":["is_entity",true],"label":"Signer''s title (e.g. Managing Member, President, Trustee)"},{"k":"entity_rep_name","req":false,"type":"text","when":["is_entity",true],"label":"Entity Representative (full name; leave blank if it is the authorized signer)"},{"k":"entity_rep_title","req":false,"type":"text","when":["is_entity",true],"label":"Representative''s title or role"},{"k":"entity_rep_phone","req":false,"type":"phone","when":["is_entity",true],"label":"Representative''s phone"},{"k":"entity_rep_email","req":false,"type":"email","when":["is_entity",true],"label":"Representative''s email"},{"k":"entity_docs_note","req":false,"text":"Please attach the Operating Agreement and any amendments, a Certificate of Good Standing, and the Articles of Organization. If you do not have one yet, save your progress and add it later, or upload it on the Documents tab.","type":"info","when":["is_entity",true],"label":"Entity documents we need"},{"k":"entity_doc_operating","req":false,"type":"doc","when":["is_entity",true],"label":"Operating Agreement","docType":"Operating agreement / amendments"},{"k":"entity_doc_amendments","req":false,"type":"doc","when":["is_entity",true],"label":"Amendments to the Operating Agreement (if any)","docType":"Operating agreement / amendments"},{"k":"entity_doc_good_standing","req":false,"type":"doc","when":["is_entity",true],"label":"Certificate of Good Standing","docType":"Certificate of good standing"},{"k":"entity_doc_articles","req":false,"type":"doc","when":["is_entity",true],"label":"Articles of Organization","docType":"Articles of organization"},{"k":"notes","req":false,"type":"textarea","label":"Anything else we should know?"}]'::jsonb, true, '{}'::text[], true
where not exists (select 1 from public.task_templates where code = 'personal_info');

-- Seller proceeds version 1, copied from TEST. The proceeds file expects this
-- active row and does not create it. Inserted only when that code is absent.
-- due_anchor is added later and defaults to opened, which is what TEST has.
insert into public.task_templates (code, version, title, description, roles, due_days, fields, active, agent_roles, client_only)
select 'seller_proceeds', 1, 'How you want your proceeds',
  'How you want to receive the money from your sale. Bank details are seen only by you and the CLA processor (others see the last 4 digits).',
  array['Client-Seller']::text[], 10,
  '[{"k":"method","req":true,"opts":["Wire transfer","Check sent by FedEx","Check at settlement"],"type":"select","label":"How do you want to receive your proceeds?"},{"k":"bank_name","req":true,"type":"text","when":["method","Wire transfer"],"label":"Bank name"},{"k":"routing","req":true,"type":"routing","when":["method","Wire transfer"],"label":"Routing number (9 digits)"},{"k":"account","req":true,"mask":true,"type":"account","when":["method","Wire transfer"],"label":"Account number"},{"k":"account_name","req":true,"type":"text","when":["method","Wire transfer"],"label":"Name on the account"},{"k":"mail_street","req":true,"type":"text","when":["method","Check sent by FedEx"],"label":"Mail the check to: street address"},{"k":"mail_unit","req":false,"type":"text","when":["method","Check sent by FedEx"],"label":"Apt / unit"},{"k":"mail_city","req":true,"type":"text","when":["method","Check sent by FedEx"],"label":"City"},{"k":"mail_state","req":true,"type":"state","when":["method","Check sent by FedEx"],"label":"State"},{"k":"mail_zip","req":true,"type":"zip","when":["method","Check sent by FedEx"],"label":"ZIP"},{"k":"settlement_conditions","req":false,"text":"PLACEHOLDER - CLA Title to supply the real conditions before go-live. Example only: the check is made out to the seller(s) on title, is handed over only after the buyer''s funds are confirmed, and you must show photo ID to receive it.","type":"info","when":["method","Check at settlement"],"label":"Conditions for a check at settlement"},{"k":"settlement_ack","req":true,"type":"checkbox","when":["method","Check at settlement"],"label":"I understand the conditions for receiving a check at settlement"},{"k":"notes","req":false,"type":"textarea","label":"Anything else we should know?"}]'::jsonb,
  true, '{}'::text[], true
where not exists (select 1 from public.task_templates where code = 'seller_proceeds');

-- Commission information version 1, copied from TEST. The agent-fees file
-- expects this task and publishes the next version. Inserted only when absent.
insert into public.task_templates (code, version, title, description, roles, due_days, fields, active, agent_roles, client_only)
select 'commissions', 1, 'Commission information',
  'Confirm your commission for the settlement statement.',
  array['Buyer Agent','Listing Agent']::text[], 10,
  '[{"k":"brokerage","req":true,"type":"text","label":"Brokerage"},{"k":"license_id","req":true,"type":"text","label":"License ID"},{"k":"commission_amount","req":true,"type":"money","label":"Commission ($)"},{"k":"paid_by","req":true,"opts":["Seller","Buyer","Split"],"type":"select","label":"Paid by"},{"k":"notes","req":false,"type":"textarea","label":"Notes"}]'::jsonb, true, '{}'::text[], false
where not exists (select 1 from public.task_templates where code = 'commissions');
insert into public.task_templates (code, version, title, roles, fields, active)
select v.code, 1, v.title, array['Client-Buyer','Client-Seller']::text[], v.fields::jsonb, true
from (values
  ('id_upload', 'Upload identification', '[{"k":"id_document","label":"Identification","type":"doc"}]'),
  ('hoa_info', 'Confirm HOA Information', '[]'),
  ('mortgage_info', 'Outstanding Mortgage Information', '[]')
) as v(code, title, fields)
where not exists (select 1 from public.task_templates t where t.code = v.code);

-- Tasks primary key later files reference. Added only when missing.
do $tasks_pk$
begin
  if to_regclass('public.tasks') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.tasks'::regclass and contype = 'p'
  ) then
    alter table public.tasks add primary key (id);
  end if;
end
$tasks_pk$;

-- Company visibility and the Clients card, copied from TEST. The repo never
-- creates these. crm_contact_json and rpc_crm_update_contact are the Nov 10
-- definitions the contact-times file checks (the rollback file), not today's
-- bodies, which that file has already replaced on TEST. Each is created only
-- when missing, so this does not change TEST.
do $crm_contact_times_pre$
begin
  if to_regprocedure('private.crm_owner_ok(uuid)') is null then
CREATE OR REPLACE FUNCTION private.crm_owner_ok(p_owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and (private.crm_all() or p_owner = private.effective_uid()
    or (coalesce(private.me_role() = 'Sales Team', false) and (p_owner is null or private.crm_sales_profile(p_owner)))) $function$;
  end if;
  if to_regprocedure('private.crm_contact_visible(uuid)') is null then
CREATE OR REPLACE FUNCTION private.crm_contact_visible(p_contact uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and private.crm_in_pool(p_contact)
    and (private.crm_owner_ok((select crm_owner_id from public.contacts where id = p_contact)) or private.crm_linked(p_contact)) $function$;
  end if;
  if to_regprocedure('private.crm_account_visible(uuid)') is null then
CREATE OR REPLACE FUNCTION private.crm_account_visible(p_account uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and exists (select 1 from public.crm_accounts a where a.id = p_account)
    and (private.crm_owner_ok((select owner_id from public.crm_accounts where id = p_account))
      or exists (select 1 from public.contacts c where c.account_id = p_account and private.crm_contact_visible(c.id))) $function$;
  end if;
  if to_regprocedure('private.crm_contact_json(uuid)') is null then
CREATE OR REPLACE FUNCTION private.crm_contact_json(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select jsonb_build_object('id', c.id, 'name', btrim(c.first_name || ' ' || c.last_name), 'firstName', c.first_name, 'lastName', c.last_name, 'email', c.email, 'phone', c.phone, 'company', c.company,
    'contactType', c.contact_type, 'hasLogin', c.profile_id is not null, 'ownerId', c.crm_owner_id, 'ownerName', coalesce(private.crm_name(c.crm_owner_id), ''),
    'accountId', c.account_id, 'accountName', coalesce((select name from public.crm_accounts where id = c.account_id), ''), 'stage', c.crm_stage, 'lastContactedOn', c.last_contacted_on,
    'companyName', coalesce((select name from public.crm_accounts where id = c.account_id), c.company),
    'tags', to_jsonb(c.tags), 'notes', c.crm_notes, 'description', c.crm_notes, 'archived', c.crm_archived_at is not null, 'fromLeadId', c.crm_lead_id, 'linked', private.crm_linked(c.id), 'canEdit', private.crm_editor(),
    'leadSource', c.lead_source, 'relationshipStatus', coalesce(c.relationship_status, ''), 'custom', c.custom,
    'salesReps', coalesce((select jsonb_agg(jsonb_build_object('id', l.sales_id, 'name', private.crm_name(l.sales_id))) from public.client_sales_reps l where l.client_id = c.profile_id), '[]'::jsonb),
    'orders', (select count(distinct dp.deal_id) from public.deal_participants dp where dp.contact_id = c.id),
    'volume', coalesce((select sum(d.purchase_price) from public.deals d where d.status <> 'Cancelled' and exists (select 1 from public.deal_participants dp where dp.deal_id = d.id and dp.contact_id = c.id)), 0))
    || private.crm_person_json(to_jsonb(c))
  from public.contacts c where c.id = p_id $function$;
  end if;
  if to_regprocedure('private.rpc_crm_update_contact(uuid, jsonb)') is null then
CREATE OR REPLACE FUNCTION private.rpc_crm_update_contact(p_id uuid, p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_acc uuid;
begin perform set_config('crm.person_write', '1', true); perform private.crm_need(true);
  if not private.crm_contact_visible(p_id) then raise exception 'Client not found.' using errcode = 'P0002'; end if;
  if p ? 'accountId' then v_acc := nullif(p->>'accountId', '')::uuid; if v_acc is not null and not private.crm_account_visible(v_acc) then raise exception 'Company not found.' using errcode = 'P0002'; end if; end if;
  if p ? 'roleInCompany' and coalesce(p->>'roleInCompany', '') = '' and private.crm_required('roleInCompany') then raise exception 'Role in Company is required.' using errcode = 'P0001'; end if;
  if p ? 'relationshipStatus' and coalesce(p->>'relationshipStatus', '') = '' and private.crm_required('relationshipStatus') then raise exception 'Relationship Status is required.' using errcode = 'P0001'; end if;
  if p ? 'state' and coalesce(p->>'state', '') = '' and private.crm_required('state') then raise exception 'State is required.' using errcode = 'P0001'; end if;
  if p ? 'custom' and jsonb_typeof(p->'custom') <> 'object' then raise exception 'Custom values must be a JSON object.' using errcode = '23514'; end if;
  update public.contacts set
    crm_owner_id = case when p ? 'ownerId' then nullif(p->>'ownerId', '')::uuid else crm_owner_id end,
    account_id = case when p ? 'accountId' then v_acc else account_id end,
    crm_stage = case when p ? 'stage' then nullif(p->>'stage', '') else crm_stage end,
    last_contacted_on = case when p ? 'lastContactedOn' then nullif(p->>'lastContactedOn', '')::date else last_contacted_on end,
    tags = case when p ? 'tags' then coalesce((select array_agg(distinct lower(btrim(t))) from jsonb_array_elements_text(p->'tags') t where btrim(t) <> ''), '{}') else tags end,
    crm_notes = case when p ? 'description' then coalesce(p->>'description', '') when p ? 'notes' then coalesce(p->>'notes', '') else crm_notes end,
    contact_type = case when p ? 'contactType' then nullif(p->>'contactType', '') else contact_type end,
    company = case when p ? 'company' then coalesce(p->>'company', '') else company end,
    role_in_company = case when p ? 'roleInCompany' then coalesce(p->>'roleInCompany', '') else role_in_company end,
    title = case when p ? 'title' then btrim(coalesce(p->>'title', '')) else title end,
    mobile = case when p ? 'mobile' then btrim(coalesce(p->>'mobile', '')) else mobile end,
    assistant = case when p ? 'assistant' then btrim(coalesce(p->>'assistant', '')) else assistant end,
    asst_phone = case when p ? 'asstPhone' then btrim(coalesce(p->>'asstPhone', '')) else asst_phone end,
    agent_split = case when p ? 'agentSplit' then nullif(btrim(coalesce(p->>'agentSplit', '')), '')::numeric else agent_split end,
    license_no = case when p ? 'licenseNo' then btrim(coalesce(p->>'licenseNo', '')) else license_no end,
    sales_volume_last_year = case when p ? 'salesVolumeLastYear' then nullif(regexp_replace(coalesce(p->>'salesVolumeLastYear', ''), '[$,\s]', '', 'g'), '')::numeric else sales_volume_last_year end,
    deals_closed_last_year = case when p ? 'dealsClosedLastYear' then nullif(btrim(coalesce(p->>'dealsClosedLastYear', '')), '')::int else deals_closed_last_year end,
    zillow_url = case when p ? 'zillowUrl' then private.crm_url_in(p->>'zillowUrl') else zillow_url end,
    crm_street = case when p ? 'street' then btrim(coalesce(p->>'street', '')) else crm_street end,
    crm_city = case when p ? 'city' then btrim(coalesce(p->>'city', '')) else crm_city end,
    crm_state = case when p ? 'state' then upper(btrim(coalesce(p->>'state', ''))) else crm_state end,
    crm_zip = case when p ? 'zip' then btrim(coalesce(p->>'zip', '')) else crm_zip end,
    crm_county = case when p ? 'county' then btrim(coalesce(p->>'county', '')) else crm_county end,
    links = case when p ? 'links' then private.crm_links_in(p->'links') else links end,
    lead_source = case when p ? 'leadSource' then coalesce(p->>'leadSource', '') else lead_source end,
    relationship_status = case when p ? 'relationshipStatus' then p->>'relationshipStatus' else relationship_status end,
    custom = case when p ? 'custom' then custom || (p->'custom') else custom end
  where id = p_id; end $function$;
  end if;
end
$crm_contact_times_pre$;

-- Outstanding Mortgage file checks this earlier validate_form text (md5
-- 8cb72a12781bf731c24fe65a77ec392e). That text is the rollback body. TEST today
-- already has the later body, so this is created only when the function is missing.
do $validate_form_pre$
begin
  if to_regprocedure('private.validate_form(jsonb,jsonb,boolean,uuid)') is null then
create or replace function private.validate_form(p_fields jsonb, p_data jsonb, p_complete boolean, p_deal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare f jsonb; k text; typ text; v text; clean jsonb := '{}'; errs text[] := '{}'; active boolean;
begin
  for f in select * from jsonb_array_elements(p_fields) loop
    k := f->>'k'; typ := f->>'type';
    if typ = 'checkbox' then if coalesce(p_data->>k, '') in ('true', 'on') then clean := clean || jsonb_build_object(k, true); end if; continue; end if;
    if typ = 'info' then continue; end if;   -- text shown on the form, never an answer
    v := trim(coalesce(p_data->>k, ''));
    if v = '' then continue; end if;
    v := left(v, case when typ = 'textarea' then 2000 else 300 end);
    if typ = 'phone' and private.fmt_phone(v) is not null then v := private.fmt_phone(v); end if;
    if typ = 'state' then v := upper(v); end if;
    if typ in ('routing', 'account') then v := regexp_replace(v, '[\s-]', '', 'g'); end if;
    clean := clean || jsonb_build_object(k, v);
  end loop;
  for f in select * from jsonb_array_elements(p_fields) loop
    k := f->>'k'; typ := f->>'type';
    active := not (k <> 'none' and clean ? 'none') and (f->'when' is null or coalesce(clean->>(f->'when'->>0) = f->'when'->>1, false));
    if typ = 'info' then continue; end if;
    if typ = 'checkbox' then
      if not active then clean := clean - k;
      elsif p_complete and coalesce((f->>'req')::boolean, false) and not (clean ? k) then errs := errs || ('Please tick: ' || (f->>'label') || '.'); end if;
      continue; end if;
    if not active then clean := clean - k; continue; end if;
    v := clean->>k;
    if v is null then if p_complete and coalesce((f->>'req')::boolean, false) then errs := errs || ((f->>'label') || ' is required.'); end if; continue; end if;
    if typ = 'select' and not (f->'opts' ? v) then errs := errs || ((f->>'label') || ': pick one of the options.');
    elsif typ = 'email' and v !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then errs := errs || ((f->>'label') || ' must be a valid email.');
    elsif typ = 'phone' and v !~ '^\d{3}-\d{3}-\d{4}$' then errs := errs || ((f->>'label') || ' must be a 10-digit phone number (xxx-xxx-xxxx).');
    elsif typ = 'date' and v !~ '^\d{4}-\d{2}-\d{2}$' then errs := errs || ((f->>'label') || ' must be a date.');
    elsif typ = 'money' and replace(replace(v, '$', ''), ',', '') !~ '^\d+(\.\d+)?$' then errs := errs || ((f->>'label') || ' must be a positive amount.');
    elsif typ = 'digits4' and v !~ '^\d{4}$' then errs := errs || ((f->>'label') || ' must be exactly 4 digits.');
    elsif typ = 'routing' and not private.routing_ok(v) then errs := errs || ((f->>'label') || ' must be a valid 9-digit routing number.');
    elsif typ = 'account' and v !~ '^\d{4,17}$' then errs := errs || ((f->>'label') || ' must be 4 to 17 digits.');
    elsif typ = 'state' and v !~ '^[A-Z]{2}$' then errs := errs || ((f->>'label') || ' must be a 2-letter code (e.g. MD).');
    elsif typ = 'zip' and v !~ '^\d{5}(-\d{4})?$' then errs := errs || ((f->>'label') || ' must be a 5-digit ZIP.');
    elsif typ = 'doc' and (v !~ '^[0-9a-f-]{36}$' or not exists (select 1 from public.documents d where d.id = v::uuid and d.deal_id = p_deal)) then errs := errs || ((f->>'label') || ': upload the file again.');
    end if;
  end loop;
  if cardinality(errs) > 0 then raise exception '%', array_to_string(errs, ' ') using errcode = 'P0001'; end if;
  return clean; end $function$;
  end if;
end
$validate_form_pre$;
