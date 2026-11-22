-- Already applied on TEST. Do not apply this file to TEST again.
-- Source: TEST history, supabase_migrations.schema_migrations, project aqcervntopidtcazcmlv.
-- Version 20261105223307, name nov5_feedback_task_admin.
-- The text below this label is the exact history statement. The label is not part of that text.
-- Filename uses TEST's own version, so it runs after 20261105223246_title_search_tracking.sql.
-- Nov 5 (John, approved): deal display name, task admin (Portal vs Title Production), audiences,
-- buyer-agent title commitment only, post-closing alert groups, entity-review attorneys by id,
-- CPL prices (blank and blocked when unresolved; never a silent zero), staff file coverage.
-- Re-runnable. No hard deletes. Existing task copies and historical CPL types stay.
-- Open tasks on a disabled or retired template keep their status. They are not cancelled.
-- Audience flags do not grant wires, payoffs, cash-to-close, HR, or accounting.

-- ---------- deal display name is the property address; file number stays its own column ----------
create or replace function public.deal_display_name(p_deal uuid) returns text
language sql stable security invoker set search_path = public as $$
  select concat_ws(', ', nullif(btrim(street), ''), nullif(concat_ws(', ', nullif(btrim(city), ''), nullif(btrim(concat_ws(' ', state, zip)), '')), ''))
  from public.deals where id = p_deal $$;
revoke all on function public.deal_display_name(uuid) from public, anon;
grant execute on function public.deal_display_name(uuid) to authenticated;
comment on function public.deal_display_name(uuid) is 'Property address only. file_number is a separate column and is not part of this name.';

-- ---------- task templates: lane, audience, soft retire ----------
alter table public.task_templates add column if not exists lane text;
alter table public.task_templates drop constraint if exists task_templates_lane_check;
alter table public.task_templates add constraint task_templates_lane_check check (lane is null or lane in ('portal', 'production'));
alter table public.task_templates add column if not exists audiences text[];
alter table public.task_templates drop constraint if exists task_templates_audiences_check;
alter table public.task_templates add constraint task_templates_audiences_check check (audiences is null or audiences <@ array['buyer','seller','listing_agent','buyer_agent','sales_team','transaction_coordinator','internal']::text[]);
alter table public.task_templates add column if not exists retired_at timestamptz;
alter table public.task_templates add column if not exists retired_by uuid references public.profiles(id);
alter table public.task_templates add column if not exists retire_reason text not null default '';
alter table public.tasks add column if not exists lane text;
alter table public.tasks add column if not exists audiences text[];
alter table public.tasks drop constraint if exists tasks_lane_check;
alter table public.tasks add constraint tasks_lane_check check (lane is null or lane in ('portal', 'production'));
alter table public.tasks drop constraint if exists tasks_audiences_check;
alter table public.tasks add constraint tasks_audiences_check check (audiences is null or audiences <@ array['buyer','seller','listing_agent','buyer_agent','sales_team','transaction_coordinator','internal']::text[]);
create index if not exists task_templates_retired_idx on public.task_templates (code) where retired_at is not null;
create index if not exists tasks_audiences_gin on public.tasks using gin (audiences);

create table if not exists public.task_template_admin_log (
  id bigserial primary key, code text not null, action text not null, detail text not null default '',
  changed_by uuid references public.profiles(id), changed_by_name text not null default '', changed_at timestamptz not null default now());
create index if not exists task_template_admin_log_at_idx on public.task_template_admin_log (changed_at desc);
alter table public.task_template_admin_log enable row level security;
alter table public.task_template_admin_log force row level security;
revoke all on public.task_template_admin_log from public, anon, authenticated;
grant select on public.task_template_admin_log to authenticated;
drop policy if exists task_admin_log_read on public.task_template_admin_log;
create policy task_admin_log_read on public.task_template_admin_log for select to authenticated using (private.is_admin());
create or replace function private.task_admin_log_guard() returns trigger language plpgsql as $$
begin if tg_op <> 'INSERT' then raise exception 'The task admin log is never changed or deleted.' using errcode = 'P0001'; end if; return new; end $$;
drop trigger if exists task_admin_log_guard on public.task_template_admin_log;
create trigger task_admin_log_guard before update or delete on public.task_template_admin_log for each row execute function private.task_admin_log_guard();

create or replace function private.template_code_retired(p_code text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_templates t where t.code = p_code and t.retired_at is not null
    and t.version = (select max(version) from public.task_templates where code = p_code)) $$;

-- Open tasks stay open for the owner and for staff. Other people do not see a retired template's copies. Nothing is cancelled.
drop policy if exists tasks_retired_kept on public.tasks;
create policy tasks_retired_kept on public.tasks as restrictive for select to authenticated using (
  template_code is null or not private.template_code_retired(template_code) or private.is_admin() or private.is_processor()
  or (status in ('todo', 'in_progress', 'blocked') and owner_profile_id = (select auth.uid())));

create or replace function private.task_outside_audience(p_task uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t where t.id = p_task and t.audiences is not null and (
    ('Client-Buyer' = any (private.deal_roles(t.deal_id)) and 'buyer' = any (t.audiences) and t.owner_profile_id = (select auth.uid()) and not (t.audiences = array['internal']::text[]))
    or ('Client-Seller' = any (private.deal_roles(t.deal_id)) and 'seller' = any (t.audiences) and t.owner_profile_id = (select auth.uid()) and not (t.audiences = array['internal']::text[]))
    or ('Buyer Agent' = any (private.deal_roles(t.deal_id)) and 'buyer_agent' = any (t.audiences))
    or ('Listing Agent' = any (private.deal_roles(t.deal_id)) and 'listing_agent' = any (t.audiences)))) $$;
drop policy if exists tasks_audience_limit on public.tasks;
create policy tasks_audience_limit on public.tasks as restrictive for select to authenticated using (
  audiences is null or private.is_staffish() or private.task_outside_audience(id));

create or replace view public.task_generation_holds with (security_invoker = true) as
  select t.id as task_id, t.deal_id, d.file_number, t.title, t.template_code, t.status, t.owner_profile_id, t.lane, t.audiences,
         s.enabled as switch_enabled, tp.retired_at,
         case when t.status in ('todo', 'in_progress', 'blocked') then 'kept_open' else 'history' end as handling
  from public.tasks t
  join public.deals d on d.id = t.deal_id
  left join public.task_template_switches s on s.code = t.template_code
  left join lateral (select retired_at from public.task_templates x where x.code = t.template_code order by version desc limit 1) tp on true
  where s.enabled = false or tp.retired_at is not null;
revoke all on public.task_generation_holds from public, anon;
grant select on public.task_generation_holds to authenticated;
comment on view public.task_generation_holds is 'Open tasks whose template is off or retired. Status is unchanged. handling = kept_open means do not cancel them.';

create or replace function private.trg_participant_copies() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid; n int;
begin
  select profile_id into owner from public.contacts where id = new.contact_id;
  insert into public.tasks (deal_id, title, description, assigned_role, status, due_date, created_by, kind, participant_id, owner_profile_id, template_id, template_code, template_version, lane, audiences)
  select new.deal_id, t.title, t.description, new.role, 'todo', current_date + t.due_days, auth.uid(), 'form', new.id, owner, t.id, t.code, t.version, t.lane, t.audiences
  from public.task_templates t where t.active and t.retired_at is null and new.role = any (t.roles) and private.task_enabled(t.code)
    and (t.audiences is null or (not (t.audiences = array['internal']::text[]) and (
      (new.role = 'Client-Buyer' and 'buyer' = any (t.audiences)) or (new.role = 'Client-Seller' and 'seller' = any (t.audiences))
      or (new.role = 'Buyer Agent' and 'buyer_agent' = any (t.audiences)) or (new.role = 'Listing Agent' and 'listing_agent' = any (t.audiences))
      or (new.role in ('Sales Person', 'Sales Team') and 'sales_team' = any (t.audiences))
      or (new.role = 'Transaction Coordinator' and 'transaction_coordinator' = any (t.audiences)))))
    and not exists (select 1 from public.tasks x where x.participant_id = new.id and x.template_code = t.code and x.status <> 'cancelled');
  get diagnostics n = row_count;
  if n > 0 and owner is not null then perform private.notify(array[owner], 'task', new.deal_id, n || ' new task(s) on your order', '#/deals/' || new.deal_id || '/tasks'); end if;
  return new; end $$;

create or replace function public.upsert_task_template(p_code text, p_title text, p_description text, p_roles text[], p_due_days int, p_lane text, p_audiences text[], p_client_only boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cur public.task_templates; ver int; aud text[]; lane text := p_lane; who text;
begin
  if (select auth.uid()) is null or not private.is_admin() then raise exception 'Only an Admin can manage task templates.' using errcode = '42501'; end if;
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
  values (p_code, ver, btrim(p_title), coalesce(p_description, ''), coalesce(p_roles, '{}'), p_due_days, coalesce(cur.fields, '[]'::jsonb), true, auth.uid(), lane, aud, coalesce(p_client_only, false));
  insert into public.task_template_switches (code) values (p_code) on conflict (code) do nothing;
  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into who from public.profiles where id = auth.uid();
  insert into public.task_template_admin_log (code, action, detail, changed_by, changed_by_name) values (p_code, 'saved', lane || ' ' || array_to_string(aud, ','), auth.uid(), coalesce(who, ''));
  return jsonb_build_object('code', p_code, 'version', ver, 'lane', lane, 'audiences', aud, 'title', btrim(p_title));
end $$;
revoke all on function public.upsert_task_template(text, text, text, text[], int, text, text[], boolean) from public, anon;
grant execute on function public.upsert_task_template(text, text, text, text[], int, text, text[], boolean) to authenticated;

create or replace function public.retire_task_template(p_code text, p_reason text) returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; why text := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g')); who text;
begin
  if (select auth.uid()) is null or not private.is_admin() then raise exception 'Only an Admin can retire a task template.' using errcode = '42501'; end if;
  if length(why) < 3 then raise exception 'Say why this task is being retired (3 to 500 characters).' using errcode = '22023'; end if;
  update public.task_templates set retired_at = now(), retired_by = auth.uid(), retire_reason = why where code = p_code;
  if not found then raise exception 'Template not found.' using errcode = '22023'; end if;
  select count(*) into n from public.tasks where template_code = p_code and status in ('todo', 'in_progress', 'blocked');
  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into who from public.profiles where id = auth.uid();
  insert into public.task_template_admin_log (code, action, detail, changed_by, changed_by_name) values (p_code, 'retired', why || ' open kept ' || n, auth.uid(), coalesce(who, ''));
  return jsonb_build_object('code', p_code, 'retired', true, 'openKept', n, 'handling', 'kept_open');
end $$;
revoke all on function public.retire_task_template(text, text) from public, anon;
grant execute on function public.retire_task_template(text, text) to authenticated;

create or replace function public.list_task_admin() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null or not private.is_admin() then raise exception 'Only an Admin can view task admin.' using errcode = '42501'; end if;
  return jsonb_build_object('handling', 'Disabled or retired templates stop future copies. Open tasks already on a file keep their status and are not cancelled.',
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'version', t.version, 'title', t.title, 'lane', t.lane, 'audiences', t.audiences, 'roles', t.roles, 'retired', t.retired_at is not null, 'active', t.active) order by t.title)
      from public.task_templates t where t.version = (select max(version) from public.task_templates x where x.code = t.code)), '[]'::jsonb));
end $$;
revoke all on function public.list_task_admin() from public, anon;
grant execute on function public.list_task_admin() to authenticated;

-- ---------- buyer agent: title commitment only ----------
create or replace function private.viewer_holds_buyer_agent(d uuid) returns boolean language sql stable security definer set search_path = public as $$
  select d is not null and 'Buyer Agent' = any (private.deal_roles(d)) and not private.is_staffish() $$;
create or replace function private.viewer_is_buyer_agent(d uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.viewer_holds_buyer_agent(d) and not ('Client-Buyer' = any (private.deal_roles(d))) $$;
create or replace function private.buyer_agent_blocked(kind text, doc_name text, doc_type text, wire boolean) returns boolean language sql immutable as $$
  select coalesce(wire, false)
    or coalesce(kind, '') in ('curative_lien', 'entity_document', 'prelim_cd', 'title_package', 'cpl', 'lien_certificate')
    or coalesce(doc_name, '') ~* 'payoff|cash[[:space:]-]*to[[:space:]-]*close|wire[[:space:]._-]*(instruction|info|details)'
    or coalesce(doc_type, '') ~* 'payoff|cash[[:space:]-]*to[[:space:]-]*close' $$;
create or replace function private.document_readable(doc uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.documents d where d.id = doc and private.me_role() is not null
    and (d.deal_id is null or private.can_access_deal(d.deal_id)) and private.folder_visible(d.folder_id)
    and (not d.wire_instructions or d.uploaded_by = (select auth.uid()) or private.wire_allowed(d.deal_id))
    and not (private.viewer_is_buyer_agent(d.deal_id) and private.buyer_agent_blocked(d.title_doc_kind, d.name, d.doc_type, d.wire_instructions))
    and case when d.deal_id is not null and d.uploaded_by is distinct from (select auth.uid()) and private.is_pure_buyer(d.deal_id) then
           (d.shared_with_client and d.visibility <> 'staff')
           or (private.buyer_doc_ok((select auth.uid()), d.id) and private.doc_visible(d.visibility, d.uploaded_by, d.deal_id))
         when d.deal_id is not null and d.uploaded_by is distinct from (select auth.uid()) and private.is_pure_seller(d.deal_id) then
           (d.shared_with_seller and d.visibility <> 'staff')
           or (private.seller_doc_ok((select auth.uid()), d.id) and private.doc_visible(d.visibility, d.uploaded_by, d.deal_id))
         else private.doc_visible(d.visibility, d.uploaded_by, d.deal_id)
           or (d.title_doc_kind = 'title_commitment' and private.viewer_holds_buyer_agent(d.deal_id) and not private.buyer_agent_blocked(d.title_doc_kind, d.name, d.doc_type, d.wire_instructions))
         end) $$;

alter table public.outbox drop constraint if exists outbox_title_recipient_role_check;
alter table public.outbox add constraint outbox_title_recipient_role_check check (title_recipient_role in ('', 'lender', 'buyer', 'listing_agent', 'buyer_agent_commitment'));
alter table public.outbox drop constraint if exists outbox_buyer_agent_commitment_only;
alter table public.outbox add constraint outbox_buyer_agent_commitment_only check (title_recipient_role <> 'buyer_agent_commitment' or coalesce(title_package, false) = false);
alter table public.outbox alter column to_profile_id drop not null;
alter table public.outbox add column if not exists send_blocked text not null default '';

create or replace function public.queue_buyer_agent_commitment(p_deal uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare doc uuid; agent uuid; email text; name text; ob uuid; fn text;
begin
  if not private.title_editor(p_deal) then raise exception 'not allowed' using errcode = '42501'; end if;
  select id into doc from public.documents where deal_id = p_deal and title_doc_kind = 'title_commitment' order by created_at desc limit 1;
  if doc is null then raise exception 'The buyer agent receives the title commitment only. Finalize the commitment first.' using errcode = '22023'; end if;
  select c.profile_id, c.email, btrim(c.first_name || ' ' || c.last_name) into agent, email, name
    from public.deal_participants p join public.contacts c on c.id = p.contact_id
    where p.deal_id = p_deal and p.role = 'Buyer Agent' and c.profile_id is not null limit 1;
  if agent is null then raise exception 'No buyer agent on this order.' using errcode = '22023'; end if;
  select file_number into fn from public.deals where id = p_deal;
  insert into public.outbox (to_profile_id, to_email, subject, body, deal_id, created_by, attachment_document_ids, title_package, title_recipient_role, template_key, send_blocked)
  values (agent, coalesce(email, ''), 'Title commitment - ' || coalesce(fn, ''), 'Title commitment only. Payoffs, wires, cash-to-close, curative and entity material are not attached. Queued only.', p_deal, auth.uid(), array[doc], false, 'buyer_agent_commitment', 'TITLE - Commitment only', '')
  returning id into ob;
  return ob; end $$;
revoke all on function public.queue_buyer_agent_commitment(uuid) from public, anon;
grant execute on function public.queue_buyer_agent_commitment(uuid) to authenticated;

-- ---------- CPL prices: unresolved stays null and blocked; zero is refused ----------
do $$ declare r record; begin
  for r in select conname from pg_constraint where conrelid = 'public.title_cpls'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%cpl_type%' loop
    execute format('alter table public.title_cpls drop constraint %I', r.conname); end loop;
  for r in select conname from pg_constraint where conrelid = 'public.title_cpls'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%cost%' loop
    execute format('alter table public.title_cpls drop constraint %I', r.conname); end loop;
end $$;
alter table public.title_cpls alter column cpl_type drop not null;
alter table public.title_cpls alter column cost drop not null;
alter table public.title_cpls alter column issued_at drop not null;
alter table public.title_cpls add constraint title_cpls_cpl_type_check check (cpl_type is null or cpl_type = '' or cpl_type in ('Standard', 'Standard - Buyer/Borrower', 'Standard - Seller', 'Lender Only'));
alter table public.title_cpls add constraint title_cpls_cost_check check (cost is null or cost > 0);
alter table public.title_cpls add column if not exists status text not null default 'issued';
alter table public.title_cpls drop constraint if exists title_cpls_status_check;
alter table public.title_cpls add constraint title_cpls_status_check check (status in ('issued', 'blocked'));
alter table public.title_cpls add column if not exists escalated boolean not null default false;
alter table public.title_cpls add column if not exists price_id uuid;

create table if not exists public.cpl_prices (
  id uuid primary key default gen_random_uuid(), state text not null, underwriter text not null, amount numeric(10,2),
  retired_at timestamptz, updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id),
  check (amount is null or amount > 0));
create unique index if not exists cpl_prices_live_idx on public.cpl_prices (state, lower(underwriter)) where retired_at is null;
alter table public.cpl_prices enable row level security;
alter table public.cpl_prices force row level security;
revoke all on public.cpl_prices from public, anon, authenticated;
grant select on public.cpl_prices to authenticated;
drop policy if exists cpl_prices_read on public.cpl_prices;
create policy cpl_prices_read on public.cpl_prices for select to authenticated using (private.is_admin() or private.is_manager());
create or replace function private.cpl_prices_no_delete() returns trigger language plpgsql as $$
begin if tg_op = 'DELETE' then raise exception 'CPL prices are retired, never deleted.' using errcode = 'P0001'; end if; return new; end $$;
drop trigger if exists cpl_prices_no_delete on public.cpl_prices;
create trigger cpl_prices_no_delete before delete on public.cpl_prices for each row execute function private.cpl_prices_no_delete();

create or replace function private.resolve_cpl_price(p_state text, p_underwriter text) returns numeric language sql stable security definer set search_path = public as $$
  select amount from public.cpl_prices where retired_at is null and state = upper(btrim(coalesce(p_state, ''))) and lower(underwriter) = lower(btrim(coalesce(p_underwriter, ''))) and amount is not null and amount > 0 limit 1 $$;

create or replace function public.save_cpl_price(p_state text, p_underwriter text, p_amount numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare st text := upper(btrim(coalesce(p_state, ''))); uw text := btrim(coalesce(p_underwriter, ''));
begin
  if (select auth.uid()) is null or not private.is_admin() then raise exception 'Only an Admin can set CPL prices.' using errcode = '42501'; end if;
  if st !~ '^[A-Z]{2}$' or length(uw) < 2 then raise exception 'A CPL price needs a state and an underwriter.' using errcode = '22023'; end if;
  if p_amount is not null and p_amount <= 0 then raise exception 'A CPL price must be greater than zero, or blank when it is not configured. Zero is not a price.' using errcode = '22023'; end if;
  update public.cpl_prices set retired_at = now(), updated_by = auth.uid() where retired_at is null and state = st and lower(underwriter) = lower(uw);
  if p_amount is null then return jsonb_build_object('state', st, 'underwriter', uw, 'amount', null, 'unresolved', true); end if;
  insert into public.cpl_prices (state, underwriter, amount, updated_by) values (st, uw, p_amount, auth.uid());
  return jsonb_build_object('state', st, 'underwriter', uw, 'amount', p_amount, 'unresolved', false);
end $$;
revoke all on function public.save_cpl_price(text, text, numeric) from public, anon;
grant execute on function public.save_cpl_price(text, text, numeric) to authenticated;

create or replace function public.issue_cpl_guarded(p_deal uuid, p_party text, p_clause text, p_for text, p_legacy_type text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_deal public.deals; v_uw text; v_price numeric; v_num text; v_legacy text; v_id uuid;
begin
  if not private.title_editor(p_deal) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_deal from public.deals where id = p_deal;
  select r.underwriter into v_uw from public.title_reviews r where r.deal_id = p_deal and r.deleted_at is null order by r.created_at desc limit 1;
  v_price := private.resolve_cpl_price(v_deal.state, v_uw);
  v_legacy := case when p_legacy_type in ('Standard', 'Standard - Buyer/Borrower', 'Standard - Seller', 'Lender Only') then p_legacy_type else '' end;
  v_num := 'CPL-FAKE-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  if v_price is null then
    insert into public.title_cpls (deal_id, cpl_number, protected_party, lender_name_at_issue, lender_match, cpl_type, lender_clause, cost, cpl_for, status, escalated, issued_at, issued_by)
    values (p_deal, v_num, coalesce(nullif(btrim(p_party), ''), v_deal.lender_name, 'Protected party'), coalesce(v_deal.lender_name, ''), true, nullif(v_legacy, ''), coalesce(p_clause, 'ISAOA/ATIMA'), null, case when p_for = 'seller' then 'seller' else 'buyer' end, 'blocked', true, null, null)
    returning id into v_id;
    insert into public.notifications (profile_id, kind, deal_id, title, link)
    select v_deal.processor_id, 'cpl-price', p_deal, 'CPL price needed: ' || v_deal.file_number, '#/deals/' || p_deal || '/title?v=cpl'
    where v_deal.processor_id is not null;
    insert into public.outbox (to_profile_id, to_email, subject, body, deal_id, created_by, send_blocked)
    values (v_deal.processor_id, '', 'CPL price unresolved - ' || v_deal.file_number, 'No CPL price is configured. Cost left blank. Nothing invented and nothing stored as zero.', p_deal, auth.uid(), 'No CPL price is configured.');
    return jsonb_build_object('id', v_id, 'issued', false, 'blocked', true, 'escalated', true, 'cost', null, 'cplType', nullif(v_legacy, ''), 'cplNumber', v_num);
  end if;
  insert into public.title_cpls (deal_id, cpl_number, protected_party, lender_name_at_issue, lender_match, cpl_type, lender_clause, cost, cpl_for, status, escalated)
  values (p_deal, v_num, coalesce(nullif(btrim(p_party), ''), v_deal.lender_name, 'Protected party'), coalesce(v_deal.lender_name, ''), true, nullif(v_legacy, ''), coalesce(p_clause, 'ISAOA/ATIMA'), v_price, case when p_for = 'seller' then 'seller' else 'buyer' end, 'issued', false)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'issued', true, 'blocked', false, 'cost', v_price, 'cplType', nullif(v_legacy, ''), 'cplNumber', v_num);
end $$;
revoke all on function public.issue_cpl_guarded(uuid, text, text, text, text) from public, anon;
grant execute on function public.issue_cpl_guarded(uuid, text, text, text, text) to authenticated;

-- ---------- alert groups and entity attorneys (fake demo names, no guessed emails) ----------
create table if not exists public.alert_groups (
  id text primary key, label text not null, purpose text not null check (purpose in ('postclosing', 'disbursement')),
  active boolean not null default true, retired_at timestamptz, updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id));
create table if not exists public.alert_group_members (
  id text primary key, group_id text not null references public.alert_groups(id), profile_id uuid references public.profiles(id),
  display_name text not null, assignment_role text not null check (assignment_role in ('postcloser', 'disbursement', 'processor', 'assigned')),
  email text not null default '', active boolean not null default true, retired_at timestamptz);
create index if not exists alert_group_members_group_idx on public.alert_group_members (group_id);
create index if not exists alert_group_members_profile_idx on public.alert_group_members (profile_id) where profile_id is not null;
insert into public.alert_groups (id, label, purpose) values
  ('in-office-postclosers', 'In-office postclosers', 'postclosing'),
  ('in-office-disbursement', 'In-office disbursement', 'disbursement')
on conflict (id) do nothing;
insert into public.alert_group_members (id, group_id, display_name, assignment_role, email) values
  ('demo-melissa-g', 'in-office-postclosers', 'Melissa G', 'postcloser', ''),
  ('demo-aliyah', 'in-office-postclosers', 'Aliyah', 'postcloser', ''),
  ('demo-marina', 'in-office-disbursement', 'Marina', 'disbursement', '')
on conflict (id) do nothing;
alter table public.alert_groups enable row level security;
alter table public.alert_groups force row level security;
alter table public.alert_group_members enable row level security;
alter table public.alert_group_members force row level security;
revoke all on public.alert_groups, public.alert_group_members from public, anon, authenticated;
grant select on public.alert_groups, public.alert_group_members to authenticated;
drop policy if exists alert_groups_read on public.alert_groups;
create policy alert_groups_read on public.alert_groups for select to authenticated using (private.is_admin() or private.is_manager());
drop policy if exists alert_members_read on public.alert_group_members;
create policy alert_members_read on public.alert_group_members for select to authenticated using (private.is_admin() or private.is_manager());
create or replace function private.nov5_no_delete() returns trigger language plpgsql as $$
begin raise exception 'This row is retired, never deleted.' using errcode = 'P0001'; end $$;
drop trigger if exists alert_groups_no_delete on public.alert_groups;
create trigger alert_groups_no_delete before delete on public.alert_groups for each row execute function private.nov5_no_delete();
drop trigger if exists alert_members_no_delete on public.alert_group_members;
create trigger alert_members_no_delete before delete on public.alert_group_members for each row execute function private.nov5_no_delete();

create or replace function public.save_alert_group_member(p_group text, p_id text, p_name text, p_role text, p_profile uuid, p_email text) returns jsonb language plpgsql security definer set search_path = public as $$
declare mid text := coalesce(nullif(btrim(p_id), ''), 'agm-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)); em text := btrim(coalesce(p_email, ''));
begin
  if (select auth.uid()) is null or not private.is_admin() then raise exception 'Only an Admin can edit alert groups.' using errcode = '42501'; end if;
  if not exists (select 1 from public.alert_groups where id = p_group and retired_at is null) then raise exception 'Alert group not found.' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'A person needs a display name.' using errcode = '22023'; end if;
  if em <> '' and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Leave email blank until a real address is provided.' using errcode = '22023'; end if;
  if p_profile is not null and not exists (select 1 from public.profiles where id = p_profile and status = 'active' and role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin')) then
    raise exception 'Link an active CLA staff profile id, or leave it blank.' using errcode = '22023'; end if;
  insert into public.alert_group_members (id, group_id, display_name, assignment_role, profile_id, email) values (mid, p_group, btrim(p_name), coalesce(nullif(p_role, ''), 'postcloser'), p_profile, em)
  on conflict (id) do update set display_name = excluded.display_name, assignment_role = excluded.assignment_role, profile_id = excluded.profile_id, email = excluded.email, retired_at = null, active = true;
  return jsonb_build_object('id', mid, 'email', em, 'profileId', p_profile);
end $$;
revoke all on function public.save_alert_group_member(text, text, text, text, uuid, text) from public, anon;
grant execute on function public.save_alert_group_member(text, text, text, text, uuid, text) to authenticated;

create or replace function public.queue_postclosing_alert(p_deal uuid, p_title text) returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; proc uuid; em text;
begin
  if not private.is_staffish() or not private.can_access_deal(p_deal) then raise exception 'not allowed' using errcode = '42501'; end if;
  select processor_id into proc from public.deals where id = p_deal;
  if proc is not null then
    insert into public.notifications (profile_id, kind, deal_id, title, link) values (proc, 'post-closing-alert', p_deal, left(coalesce(p_title, 'Post-closing alert'), 200), '#/deals/' || p_deal || '/accounting?v=postclosing');
    n := n + 1; end if;
  for r in select s.sales_id as pid from public.deal_sales_people s where s.deal_id = p_deal loop
    insert into public.notifications (profile_id, kind, deal_id, title, link) values (r.pid, 'post-closing-alert', p_deal, left(coalesce(p_title, 'Post-closing alert'), 200), '#/deals/' || p_deal || '/accounting?v=postclosing');
    n := n + 1; end loop;
  for r in select m.profile_id, m.display_name, m.email, m.assignment_role, m.id from public.alert_group_members m join public.alert_groups g on g.id = m.group_id
    where g.active and g.retired_at is null and m.active and m.retired_at is null loop
    if r.profile_id is not null then
      insert into public.notifications (profile_id, kind, deal_id, title, link) values (r.profile_id, 'post-closing-alert', p_deal, left(coalesce(p_title, 'Post-closing alert'), 200), '#/deals/' || p_deal || '/accounting?v=postclosing');
      n := n + 1; end if;
    em := btrim(coalesce(r.email, ''));
    insert into public.outbox (to_profile_id, to_email, subject, body, deal_id, created_by, send_blocked)
    values (coalesce(r.profile_id, proc), case when em = '' then '' else em end, left(coalesce(p_title, 'Post-closing alert'), 200), 'Queued only. Never sent.', p_deal, auth.uid(), case when em = '' then 'No email is configured for this person.' else '' end);
  end loop;
  return n; end $$;
revoke all on function public.queue_postclosing_alert(uuid, text) from public, anon;
grant execute on function public.queue_postclosing_alert(uuid, text) to authenticated;

create table if not exists public.entity_review_attorneys (
  id text primary key, profile_id uuid references public.profiles(id), display_name text not null,
  assignment_role text not null check (assignment_role in ('attorney', 'backup')), active boolean not null default true, retired_at timestamptz);
create index if not exists entity_review_attorneys_profile_idx on public.entity_review_attorneys (profile_id) where profile_id is not null;
insert into public.entity_review_attorneys (id, display_name, assignment_role) values
  ('demo-joel', 'Joel', 'attorney'), ('demo-caroline', 'Caroline', 'attorney'), ('demo-victoria', 'Victoria', 'attorney'),
  ('demo-eve', 'Eve', 'attorney'), ('demo-christian', 'Christian', 'backup')
on conflict (id) do nothing;
alter table public.entity_review_attorneys enable row level security;
alter table public.entity_review_attorneys force row level security;
revoke all on public.entity_review_attorneys from public, anon, authenticated;
grant select on public.entity_review_attorneys to authenticated;
drop policy if exists entity_attorneys_read on public.entity_review_attorneys;
create policy entity_attorneys_read on public.entity_review_attorneys for select to authenticated using (private.is_admin() or private.is_manager());
drop trigger if exists entity_attorneys_no_delete on public.entity_review_attorneys;
create trigger entity_attorneys_no_delete before delete on public.entity_review_attorneys for each row execute function private.nov5_no_delete();

create or replace function private.entity_attorney_authorized(p_profile uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.entity_review_attorneys a join public.profiles p on p.id = a.profile_id
    where a.profile_id = p_profile and a.active and a.retired_at is null and p.status = 'active' and a.assignment_role in ('attorney', 'backup')) $$;
create or replace function public.save_entity_attorney(p_id text, p_name text, p_role text, p_profile uuid, p_active boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare mid text := coalesce(nullif(btrim(p_id), ''), 'atty-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
begin
  if (select auth.uid()) is null or not private.is_admin() then raise exception 'Only an Admin can edit entity-review attorneys.' using errcode = '42501'; end if;
  if p_role not in ('attorney', 'backup') then raise exception 'Role must be attorney or backup.' using errcode = '22023'; end if;
  if p_profile is not null and not exists (select 1 from public.profiles where id = p_profile and status = 'active') then raise exception 'Profile id not found.' using errcode = '22023'; end if;
  insert into public.entity_review_attorneys (id, display_name, assignment_role, profile_id, active) values (mid, btrim(p_name), p_role, p_profile, coalesce(p_active, true))
  on conflict (id) do update set display_name = excluded.display_name, assignment_role = excluded.assignment_role, profile_id = excluded.profile_id, active = excluded.active, retired_at = null;
  return jsonb_build_object('id', mid, 'profileId', p_profile, 'assignmentRole', p_role, 'authorized', private.entity_attorney_authorized(p_profile));
end $$;
revoke all on function public.save_entity_attorney(text, text, text, uuid, boolean) from public, anon;
grant execute on function public.save_entity_attorney(text, text, text, uuid, boolean) to authenticated;

create or replace function public.approve_entity_review(p_id uuid, p_note text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not private.entity_attorney_authorized((select auth.uid())) then raise exception 'Only a configured entity-review attorney can approve this. Authorization is the profile id, not a name.' using errcode = '42501'; end if;
  if not private.no_ssn(p_note) then raise exception 'Do not store an SSN.' using errcode = '22023'; end if;
  update public.title_entity_reviews set attorney_approved = true, attorney_approval_notes = left(coalesce(p_note, ''), 1000), updated_at = now(), updated_by = auth.uid()
  where id = p_id and deleted_at is null;
  if not found then raise exception 'Entity review not found.' using errcode = '22023'; end if;
  return true; end $$;
revoke all on function public.approve_entity_review(uuid, text) from public, anon;
grant execute on function public.approve_entity_review(uuid, text) to authenticated;

-- ---------- file coverage: ordinary conversations and documents, audited, not HR or financial ----------
create table if not exists public.file_coverage_log (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals(id), actor_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('coverage', 'conversation', 'document', 'sent_received')), at timestamptz not null default now());
create index if not exists file_coverage_log_deal_idx on public.file_coverage_log (deal_id, at desc);
create index if not exists file_coverage_log_actor_idx on public.file_coverage_log (actor_id, at desc);
alter table public.file_coverage_log enable row level security;
alter table public.file_coverage_log force row level security;
revoke all on public.file_coverage_log from public, anon, authenticated;
grant select on public.file_coverage_log to authenticated;
drop policy if exists file_coverage_log_read on public.file_coverage_log;
create policy file_coverage_log_read on public.file_coverage_log for select to authenticated using (actor_id = (select auth.uid()) or private.is_admin());
drop trigger if exists file_coverage_log_no_delete on public.file_coverage_log;
create trigger file_coverage_log_no_delete before delete or update on public.file_coverage_log for each row execute function private.nov5_no_delete();

create or replace function public.list_file_coverage(p_deal uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.deals;
begin
  if (select auth.uid()) is null or not private.is_staffish() or private.me_role() = 'Employee' then raise exception 'File coverage is for CLA staff.' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal; if not found then raise exception 'Order not found.' using errcode = '22023'; end if;
  insert into public.file_coverage_log (deal_id, actor_id, kind) values (p_deal, auth.uid(), 'coverage');
  return jsonb_build_object(
    'note', 'Coverage is ordinary file conversations and sent, received and file documents. It does not open HR or financial modules.',
    'displayName', public.deal_display_name(p_deal), 'fileNumber', d.file_number, 'dealId', d.id, 'financialIncluded', false, 'hrIncluded', false, 'audited', true,
    'threads', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'subject', t.subject)) from public.threads t where t.deal_id = p_deal), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', doc.id, 'name', doc.name, 'titleDocKind', doc.title_doc_kind)) from public.documents doc
      where doc.deal_id = p_deal and not private.buyer_agent_blocked(doc.title_doc_kind, doc.name, doc.doc_type, doc.wire_instructions)), '[]'::jsonb),
    'sentReceived', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'subject', o.subject, 'toEmail', o.to_email, 'status', o.status)) from public.outbox o where o.deal_id = p_deal and o.subject !~* 'wire|payoff|cash[[:space:]-]*to[[:space:]-]*close' and o.body !~* 'wire instruction|payoff|cash[[:space:]-]*to[[:space:]-]*close'), '[]'::jsonb));
end $$;
revoke all on function public.list_file_coverage(uuid) from public, anon;
grant execute on function public.list_file_coverage(uuid) to authenticated;
