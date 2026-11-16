-- Already applied on TEST. Do not apply this file to TEST again.
-- Source: TEST history, supabase_migrations.schema_migrations, project aqcervntopidtcazcmlv.
-- Version 20261105223246, name title_search_tracking.
-- The text below this label is the exact history statement. The label is not part of that text.
-- 90 Nov5: Title search tracking; EMD gate enforced by application/RPC, typed queues.
alter table public.title_reviews add column if not exists tr_vesting_text text not null default '';
alter table public.title_reviews add column if not exists tr_legal_description text not null default '';
alter table public.title_reviews add column if not exists vesting_contract_match boolean;
alter table public.title_reviews add column if not exists legal_contract_match boolean;
alter table public.title_reviews add column if not exists vesting_lender_match boolean;
alter table public.title_reviews add column if not exists legal_lender_match boolean;
alter table public.title_reviews add column if not exists title_notes text not null default '' check (private.no_ssn(title_notes));
alter table public.title_reviews add column if not exists curative_pending text not null default '' check (private.no_ssn(curative_pending));
create table if not exists public.title_search_tracking (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null unique references public.deals(id), ordered_date date, due_date date, received_date date,
 abstractor text not null default '', assigned_typist_id uuid references public.profiles(id), notes text not null default '' check(private.no_ssn(notes)),
 created_at timestamptz not null default now(),created_by uuid references public.profiles(id),updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id),deleted_at timestamptz,deleted_by uuid references public.profiles(id));
drop trigger if exists title_search_tracking_touch on public.title_search_tracking;
create trigger title_search_tracking_touch before insert or update on public.title_search_tracking for each row execute function private.title_touch();
alter table public.title_search_tracking enable row level security;
drop policy if exists title_search_tracking_select on public.title_search_tracking; create policy title_search_tracking_select on public.title_search_tracking for select to authenticated using(private.title_reader(deal_id));
drop policy if exists title_search_tracking_insert on public.title_search_tracking; create policy title_search_tracking_insert on public.title_search_tracking for insert to authenticated with check(private.title_editor(deal_id));
drop policy if exists title_search_tracking_update on public.title_search_tracking; create policy title_search_tracking_update on public.title_search_tracking for update to authenticated using(private.title_editor(deal_id)) with check(private.title_editor(deal_id));
revoke all on public.title_search_tracking from anon,authenticated; grant select,insert,update on public.title_search_tracking to authenticated;
