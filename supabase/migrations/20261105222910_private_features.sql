-- Source: TEST schema_migrations (project aqcervntopidtcazcmlv).
-- Version 20261105222910, name crm. This file is only the private.features table from that migration.
-- Exported November 15, 2026 (America/New_York).
-- =====================================================================
-- Migration 22 created this table, then the rest of that migration builds the CRM. The CRM is not copied here.
-- TEST has no row security, no extra grants, and no trigger on private.features. The owner is postgres.
-- The private schema already exists on TEST, so the schema line is a no-op there.
-- The crm row is inserted only when missing, so a flag that is already on stays on.
-- The feature-flag function private.crm_on() is not created here. Accounting creates its own check
-- (private.acct_on) in the next file. On TEST, crm_on() now uses a newer search path than migration 22,
-- and replacing it would change TEST.
-- =====================================================================
create schema if not exists private;

create table if not exists private.features (
  name text primary key,
  enabled boolean not null default false,
  note text not null default ''
);

insert into private.features (name, enabled, note)
values ('crm', false, 'Zoho-like CRM (migration 22). Off by default at go-live.')
on conflict (name) do nothing;
