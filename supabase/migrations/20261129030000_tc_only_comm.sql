-- TC-ONLY-1 (John Coester, call + chat Nov 22 2026, 3:12-4:09 PM ET; "Ok" at 4:09 PM): an "Only communicate with TC" box next to each
-- agent on a file. John: "any email that goes out to the realtor will automatically go to the TC that's assigned to them."
-- Spec: docs/specs/tc-only.md. Open questions went to Matt, Francis and Janine on Nov 22; the defaults below stand until they answer.
-- * deal_participants.tc_only: one box per agent row, so the buyer's agent and the listing agent are set separately.
-- * The agent's TC = the "Buyer Agent TC" / "Listing Agent TC" on that same side of the file who is linked to that agent
--   (agent_tc_links). Several linked TCs: all of them get it.
-- * One place decides who gets a message: private.resolve_recipients(deal, profile, email). Two guards call it on every insert,
--   so every existing and future workflow (Task Builder email and form requests, reminders, title commitment, agent fee notices,
--   portal invites, scheduling, closing updates, document and message alerts) follows the box without being changed one by one:
--     - public.outbox (queued emails): the row goes to the TC instead (greeting name swapped), one copy per TC.
--     - public.notifications (in-app alerts): the alert goes to the TC's portal login instead.
--   gmail-send (typed emails and "Email sellers and agents") asks public.comm_route_emails before sending.
-- * No TC on that side (or the TC has no email / login the message needs): the message is HELD. Never sent to the agent.
--   A queued email stays in the outbox with send_blocked set; an alert is dropped. The processor gets an in-app alert.
-- * Every swap and hold is written to public.comm_redirect_log (CLA staff on the file can read it).
-- * Only CLA staff on the file can tick the box (public.set_participant_tc_only), and only when a TC is linked on that side.
-- * Task Builder: the "Transaction coordinator" email choice now also reaches the agents' TCs (Buyer Agent TC / Listing Agent TC).
-- Rollback: supabase/rollbacks/20261129030000_tc_only_comm.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.agent_tc_links') is null then raise exception 'drift: agent_tc_links is missing'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deal_participants' and column_name = 'tc_only') then
    raise exception 'drift: deal_participants.tc_only already exists'; end if;
  if to_regclass('public.comm_redirect_log') is not null then raise exception 'drift: comm_redirect_log already exists'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'outbox' and column_name = 'send_blocked') then
    raise exception 'drift: outbox.send_blocked is missing'; end if;
  if to_regprocedure('private.task_flow_is_recipient(uuid, text, uuid, text)') is null
     or encode(sha256(convert_to(pg_get_functiondef('private.task_flow_is_recipient(uuid,text,uuid,text)'::regprocedure), 'UTF8')), 'hex')
        is distinct from '9118edb0a80a0789ad42d889a145c058ebb856d44b709219cff1fa33ff7aa299' then
    raise exception 'drift: private.task_flow_is_recipient is not the body this file expects'; end if;
end $$;

-- ---------- the box, one per agent row ----------
alter table public.deal_participants add column tc_only boolean not null default false;
comment on column public.deal_participants.tc_only is
  'Only communicate with TC (TC-ONLY-1): emails and alerts meant for this agent on this file go to their linked TC on the same side instead.';
create index deal_participants_tc_only_idx on public.deal_participants (deal_id) where tc_only;

-- ---------- audit ----------
create table public.comm_redirect_log (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id),
  channel text not null check (channel in ('email', 'in_app', 'gmail')),
  action text not null check (action in ('redirected', 'held')),
  source text not null default '',
  agent_participant_ids uuid[] not null default '{}',
  agent_profile_id uuid,
  agent_email text not null default '',
  to_profile_ids uuid[] not null default '{}',
  to_emails text[] not null default '{}',
  ref_id uuid,
  detail text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);
comment on table public.comm_redirect_log is 'TC-ONLY-1: every email or alert that went to a TC instead of a TC-only agent, or was held.';
create index comm_redirect_log_deal_idx on public.comm_redirect_log (deal_id, created_at desc);
alter table public.comm_redirect_log enable row level security;
create policy comm_redirect_log_select on public.comm_redirect_log for select to authenticated
  using ((select private.is_admin()) or ((select private.is_manager()) and private.can_access_deal(deal_id)));
revoke insert, update, delete, truncate on public.comm_redirect_log from anon, authenticated;

-- ---------- who stands in for one agent row ----------
create or replace function private.tc_only_targets(p_participant uuid)
returns table (contact_id uuid, profile_id uuid, email text, first_name text, full_name text)
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select distinct on (tc.id) tc.id,
         pr.id,
         lower(btrim(coalesce(nullif(btrim(tc.email), ''), pr.email, ''))),
         btrim(coalesce(tc.first_name, '')),
         btrim(coalesce(tc.first_name, '') || ' ' || coalesce(tc.last_name, ''))
  from public.deal_participants a
  join public.deal_participants t on t.deal_id = a.deal_id and t.role = case a.role when 'Listing Agent' then 'Listing Agent TC' else 'Buyer Agent TC' end
  join public.agent_tc_links l on l.agent_contact_id = a.contact_id and l.tc_contact_id = t.contact_id
  join public.contacts tc on tc.id = t.contact_id
  left join public.profiles pr on pr.id = tc.profile_id and pr.status = 'active'
  where a.id = p_participant and a.role in ('Buyer Agent', 'Listing Agent')
  order by tc.id $$;

-- ---------- the one recipient check ----------
-- 'keep': not a TC-only agent on this file (one row, as given). 'redirect': one row per TC. 'held': TC-only with no TC (one row).
create or replace function private.resolve_recipients(p_deal uuid, p_profile uuid, p_email text)
returns table (action text, profile_id uuid, email text, first_name text, full_name text, agent_participant_ids uuid[], agent_first_name text, agent_name text, agent_side text)
language plpgsql stable security definer set search_path to pg_catalog, public, extensions as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_ids uuid[]; v_first text; v_name text; v_side text; n int := 0; t record;
begin
  if p_deal is not null and (p_profile is not null or v_email <> '') then
    select array_agg(a.id order by a.id), min(btrim(coalesce(c.first_name, ''))), min(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))),
           string_agg(distinct case a.role when 'Listing Agent' then 'listing agent' else 'buyer''s agent' end, ' and ')
      into v_ids, v_first, v_name, v_side
    from public.deal_participants a join public.contacts c on c.id = a.contact_id
    where a.deal_id = p_deal and a.tc_only and a.role in ('Buyer Agent', 'Listing Agent')
      and ((p_profile is not null and c.profile_id = p_profile)
        or (v_email <> '' and (lower(btrim(c.email)) = v_email
          or exists (select 1 from public.profiles pr where pr.id = c.profile_id and lower(btrim(coalesce(pr.email, ''))) = v_email))));
  end if;
  if v_ids is null then
    return query select 'keep'::text, p_profile, nullif(v_email, ''), null::text, null::text, '{}'::uuid[], null::text, null::text, null::text;
    return;
  end if;
  for t in select distinct on (x.contact_id) x.* from unnest(v_ids) i cross join lateral private.tc_only_targets(i) x
      where not (p_profile is not null and x.profile_id is not null and x.profile_id = p_profile) order by x.contact_id loop
    n := n + 1;
    return query select 'redirect'::text, t.profile_id, nullif(t.email, ''), t.first_name, t.full_name, v_ids, v_first, v_name, v_side;
  end loop;
  if n = 0 then
    return query select 'held'::text, null::uuid, null::text, null::text, null::text, v_ids, v_first, v_name, v_side;
  end if;
end $$;

-- "Hi Pat," -> "Hi Sam," (first greeting only; plain text or HTML)
create or replace function private.comm_swap_greeting(p_body text, p_old text, p_new text) returns text
language plpgsql immutable set search_path to pg_catalog as $$
declare v_old text := btrim(coalesce(p_old, '')); v_new text := btrim(coalesce(p_new, ''));
begin
  if p_body is null or v_old = '' or v_new = '' or v_old = v_new then return p_body; end if;
  return regexp_replace(p_body,
    '((?:^|>|\n)[ \t]*(?:Hi|Hello|Dear|Hey|Good morning|Good afternoon|Good evening)[ \t]+)' || regexp_replace(v_old, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '(?![[:alnum:]])',
    '\1' || replace(replace(v_new, '\', '\\'), '&', '\&'), 'i');
end $$;

-- in-app alert to the file's processor when something was held
create or replace function private.tc_only_alert(p_deal uuid, p_text text) returns void
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
begin
  insert into public.notifications (profile_id, kind, deal_id, title, link)
  select d.processor_id, 'tc_only_held', d.id, left(p_text, 200), '#/deals/' || d.id || '/contacts'
  from public.deals d join public.profiles p on p.id = d.processor_id and p.status = 'active' where d.id = p_deal
    -- one alert per hold reason per hour is enough
    and not exists (select 1 from public.notifications n where n.profile_id = d.processor_id and n.deal_id = d.id and n.kind = 'tc_only_held'
      and n.title = left(p_text, 200) and n.created_at > now() - interval '1 hour');
end $$;

create or replace function private.tc_only_held_text(p_deal uuid, p_name text, p_side text, p_what text, p_no_login boolean default false) returns text
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select 'Held on ' || coalesce((select nullif(file_number, '') from public.deals where id = p_deal), 'a file') || ': ' || p_what || ' for '
    || coalesce(nullif(p_name, ''), 'an agent') || ' (' || coalesce(p_side, 'agent') || ', Only communicate with TC). '
    || case when p_no_login then 'Their TC has no portal login or email for it yet, so nothing went to the agent. Invite the TC to the portal or untick the box on Contacts.'
            else 'No TC is linked on that side, so nothing went to the agent. Add their TC on Contacts.' end $$;

-- ---------- guard 1: queued emails ----------
create or replace function private.trg_outbox_tc_only() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare r record; first boolean := true; v public.outbox; v_orig_profile uuid := new.to_profile_id; v_orig_email text := new.to_email; v_ids uuid[]; v_first text;
  v_name text; v_side text; v_held boolean := false; v_profiles uuid[] := '{}'; v_emails text[] := '{}'; v_keep public.outbox;
  v_no_login_ok boolean; v_cc text[]; v_bcc text[]; e text; rr record; v_no_login boolean := false;
begin
  if new.deal_id is null or not exists (select 1 from public.deal_participants p where p.deal_id = new.deal_id and p.tc_only) then return new; end if;
  -- copies: a TC-only agent in cc / bcc is swapped for their TC, or dropped when they have none
  v_cc := '{}'; foreach e in array coalesce(new.cc_emails, '{}') loop
    for rr in select * from private.resolve_recipients(new.deal_id, null, e) loop
      if rr.action = 'keep' then v_cc := v_cc || e; elsif rr.action = 'redirect' and rr.email is not null then v_cc := v_cc || rr.email; end if; end loop; end loop;
  v_bcc := '{}'; foreach e in array coalesce(new.bcc_emails, '{}') loop
    for rr in select * from private.resolve_recipients(new.deal_id, null, e) loop
      if rr.action = 'keep' then v_bcc := v_bcc || e; elsif rr.action = 'redirect' and rr.email is not null then v_bcc := v_bcc || rr.email; end if; end loop; end loop;
  new.cc_emails := array(select distinct x from unnest(v_cc) x); new.bcc_emails := array(select distinct x from unnest(v_bcc) x);

  -- a row with no portal login is allowed only for these kinds (outbox_recipient_check)
  v_no_login_ok := new.title_package or new.post_closing_type is not null or new.kind in ('scheduling', 'task_flow_email');
  v_keep := new;
  for r in select * from private.resolve_recipients(new.deal_id, new.to_profile_id, new.to_email) loop
    v_ids := r.agent_participant_ids; v_first := r.agent_first_name; v_name := r.agent_name; v_side := r.agent_side;
    if r.action = 'keep' then return new; end if;
    if r.action = 'held' then v_held := true; exit; end if;
    if r.email is null or (r.profile_id is null and not (v_no_login_ok and char_length(coalesce(r.full_name, '')) > 0)) then continue; end if;
    v := v_keep;
    v.to_profile_id := r.profile_id; v.to_email := r.email; v.to_name := coalesce(nullif(r.full_name, ''), v.to_name);
    v.body := private.comm_swap_greeting(v_keep.body, r.agent_first_name, r.first_name);
    -- the same email already queued to this TC (in this action, or today for the same task): do not send it twice
    if exists (select 1 from public.outbox o where o.deal_id = v.deal_id and lower(o.to_email) = lower(v.to_email) and o.subject = v.subject
        and (o.created_at = now() and o.body = v.body or (v.task_id is not null and o.task_id = v.task_id and o.created_at::date = current_date))) then continue; end if;
    v_profiles := v_profiles || r.profile_id; v_emails := v_emails || v.to_email;
    if first then new := v; first := false;
    else v.id := gen_random_uuid(); insert into public.outbox select v.*; end if;
  end loop;
  if not v_held and first and cardinality(v_emails) = 0 then
    -- every TC was skipped: no email / no login, or they already have this email
    if exists (select 1 from unnest(v_ids) i cross join lateral private.tc_only_targets(i) x
        where x.email <> '' and exists (select 1 from public.outbox o where o.deal_id = v_keep.deal_id and lower(o.to_email) = x.email and o.subject = v_keep.subject
          and (o.created_at = now() or (v_keep.task_id is not null and o.task_id = v_keep.task_id and o.created_at::date = current_date)))) then
      return null; end if;
    v_held := true; v_no_login := true;
  end if;
  if v_held then
    new := v_keep;
    new.send_blocked := left(private.tc_only_held_text(new.deal_id, v_name, v_side, 'an email', v_no_login), 500);
    insert into public.comm_redirect_log (deal_id, channel, action, source, agent_participant_ids, agent_profile_id, agent_email, ref_id, detail, created_by)
    values (new.deal_id, 'email', 'held', coalesce(nullif(new.kind, ''), nullif(new.template_key, ''), 'email'), coalesce(v_ids, '{}'), v_orig_profile, coalesce(v_orig_email, ''),
      new.id, left('Held: ' || coalesce(new.subject, '') || case when v_no_login then ' (the TC has no portal login or email for it)' else ' (no TC linked on that side)' end, 500), private.effective_uid());
    perform private.tc_only_alert(new.deal_id, private.tc_only_held_text(new.deal_id, v_name, v_side, 'an email', v_no_login));
    return new;
  end if;
  insert into public.comm_redirect_log (deal_id, channel, action, source, agent_participant_ids, agent_profile_id, agent_email, to_profile_ids, to_emails, ref_id, detail, created_by)
  values (new.deal_id, 'email', 'redirected', coalesce(nullif(new.kind, ''), nullif(new.template_key, ''), 'email'), coalesce(v_ids, '{}'), v_orig_profile, coalesce(v_orig_email, ''),
    array_remove(v_profiles, null), v_emails, new.id, left(coalesce(new.subject, ''), 500), private.effective_uid());
  return new;
end $$;

-- ---------- guard 2: in-app alerts ----------
create or replace function private.trg_notifications_tc_only() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare r record; first boolean := true; v public.notifications; v_keep public.notifications; v_ids uuid[]; v_name text; v_side text; v_held boolean := false; v_to uuid[] := '{}';
  v_self boolean := false;
begin
  if new.deal_id is null or not exists (select 1 from public.deal_participants p where p.deal_id = new.deal_id and p.tc_only) then return new; end if;
  -- the same alert to the same person in this action (the TC's own copy plus the one meant for their agent): keep one
  if exists (select 1 from public.notifications n where n.profile_id = new.profile_id and n.deal_id = new.deal_id and n.kind = new.kind and n.title = new.title and n.created_at = now()) then
    return null; end if;
  v_keep := new;
  for r in select * from private.resolve_recipients(new.deal_id, new.profile_id, null) loop
    v_ids := r.agent_participant_ids; v_name := r.agent_name; v_side := r.agent_side;
    if r.action = 'keep' then return new; end if;
    if r.action = 'held' then v_held := true; exit; end if;
    if r.profile_id is null then continue; end if;
    if r.profile_id = private.effective_uid() then v_self := true; continue; end if;   -- the TC did it themselves: no alert to them
    v_to := v_to || r.profile_id;
    if exists (select 1 from public.notifications n where n.profile_id = r.profile_id and n.deal_id = v_keep.deal_id and n.kind = v_keep.kind and n.title = v_keep.title and n.created_at = now()) then
      continue; end if;
    v := v_keep; v.profile_id := r.profile_id;
    if first then new := v; first := false; else v.id := gen_random_uuid(); insert into public.notifications select v.*; end if;
  end loop;
  if not v_held and cardinality(v_to) = 0 and v_self then return null; end if;
  if not v_held and cardinality(v_to) = 0 then v_held := true; end if;
  if v_held then
    insert into public.comm_redirect_log (deal_id, channel, action, source, agent_participant_ids, agent_profile_id, ref_id, detail, created_by)
    values (v_keep.deal_id, 'in_app', 'held', v_keep.kind, coalesce(v_ids, '{}'), v_keep.profile_id, v_keep.id, left('Held: ' || v_keep.title, 500), private.effective_uid());
    if v_keep.kind <> 'tc_only_held' then perform private.tc_only_alert(v_keep.deal_id, private.tc_only_held_text(v_keep.deal_id, v_name, v_side, 'a portal alert')); end if;
    return null;
  end if;
  insert into public.comm_redirect_log (deal_id, channel, action, source, agent_participant_ids, agent_profile_id, to_profile_ids, ref_id, detail, created_by)
  values (v_keep.deal_id, 'in_app', 'redirected', v_keep.kind, coalesce(v_ids, '{}'), v_keep.profile_id, v_to, v_keep.id, left(v_keep.title, 500), private.effective_uid());
  if first then return null; end if;   -- every TC already had this alert
  return new;
end $$;

create trigger outbox_tc_only before insert on public.outbox for each row execute function private.trg_outbox_tc_only();
create trigger notifications_tc_only before insert on public.notifications for each row execute function private.trg_notifications_tc_only();

-- ---------- gmail-send asks this before every send (as the signed-in staff member) ----------
-- Returns the final To / Cc / Bcc, what was swapped, and what has to be held (the send is then refused).
create or replace function public.comm_route_emails(p_deal uuid, p_to text[], p_cc text[], p_bcc text[], p_log boolean default false) returns jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare k int; e text; r record; v_out jsonb := jsonb_build_object('to', '[]'::jsonb, 'cc', '[]'::jsonb, 'bcc', '[]'::jsonb);
  v_seen text[] := '{}'; v_red jsonb := '[]'::jsonb; v_held jsonb := '[]'::jsonb; v_list text; v_src text[]; v_tos text[]; v_names text[]; v_tf text; v_af text; v_an text; v_side text; v_ids uuid[]; got boolean;
begin
  if p_deal is null or not (private.is_staffish() and private.can_access_deal(p_deal)) then
    raise exception 'You cannot email from this file.' using errcode = '42501'; end if;
  for k in 1..3 loop
    v_list := (array['to', 'cc', 'bcc'])[k];
    v_src := case k when 1 then coalesce(p_to, '{}') when 2 then coalesce(p_cc, '{}') else coalesce(p_bcc, '{}') end;
    foreach e in array v_src loop
      e := lower(btrim(e)); if e = '' then continue; end if;
      v_tos := '{}'; v_names := '{}'; v_tf := null; got := false;
      for r in select * from private.resolve_recipients(p_deal, null, e) loop
        v_af := r.agent_first_name; v_an := r.agent_name; v_side := r.agent_side; v_ids := r.agent_participant_ids;
        if r.action = 'keep' then
          if not (e = any (v_seen)) then v_out := jsonb_set(v_out, array[v_list], (v_out -> v_list) || to_jsonb(e)); v_seen := v_seen || e; end if;
          got := true;
        elsif r.action = 'redirect' and r.email is not null then
          v_tos := v_tos || r.email; v_names := v_names || coalesce(nullif(r.full_name, ''), r.email); v_tf := coalesce(v_tf, r.first_name);
          if not (r.email = any (v_seen)) then v_out := jsonb_set(v_out, array[v_list], (v_out -> v_list) || to_jsonb(r.email)); v_seen := v_seen || r.email; end if;
        end if;
      end loop;
      if got then continue; end if;
      if cardinality(v_tos) > 0 then
        v_red := v_red || jsonb_build_object('from', e, 'fromName', v_an, 'fromFirstName', v_af, 'side', v_side, 'list', v_list, 'to', to_jsonb(v_tos), 'toNames', to_jsonb(v_names), 'toFirstName', v_tf);
        if p_log then insert into public.comm_redirect_log (deal_id, channel, action, source, agent_participant_ids, agent_email, to_emails, detail, created_by)
          values (p_deal, 'gmail', 'redirected', 'gmail-send', coalesce(v_ids, '{}'), e, v_tos, 'Typed email swapped to the TC', private.effective_uid()); end if;
      else
        v_held := v_held || jsonb_build_object('email', e, 'name', v_an, 'side', v_side);
        if p_log then insert into public.comm_redirect_log (deal_id, channel, action, source, agent_participant_ids, agent_email, detail, created_by)
          values (p_deal, 'gmail', 'held', 'gmail-send', coalesce(v_ids, '{}'), e, 'Typed email refused: TC only and no TC with an email on that side', private.effective_uid()); end if;
      end if;
    end loop;
  end loop;
  return v_out || jsonb_build_object('redirected', v_red, 'held', v_held);
end $$;

-- ---------- tick / untick (CLA staff on the file) ----------
create or replace function public.set_participant_tc_only(p_participant uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare a public.deal_participants; v_name text; v_side text; v_tcs text[];
begin
  select * into a from public.deal_participants where id = p_participant;
  if not found or a.role not in ('Buyer Agent', 'Listing Agent') then
    raise exception 'Pick the buyer''s agent or listing agent on this file.' using errcode = 'P0001'; end if;
  if not (private.is_manager() and private.can_access_deal(a.deal_id)) then
    raise exception 'Only CLA staff on this file can change who gets the agent''s emails.' using errcode = '42501'; end if;
  v_side := case a.role when 'Listing Agent' then 'listing' else 'buyer' end;
  select array_agg(coalesce(nullif(full_name, ''), email) order by full_name) into v_tcs from private.tc_only_targets(a.id);
  if coalesce(p_on, false) and v_tcs is null then
    raise exception 'This agent has no TC on the % side of this file. Add their transaction coordinator on Contacts first, then tick Only communicate with TC.', v_side using errcode = 'P0001'; end if;
  update public.deal_participants set tc_only = coalesce(p_on, false) where id = a.id;
  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_name from public.contacts where id = a.contact_id;
  perform private.log_activity(a.deal_id, 'participant.tc_only', 'deal', a.deal_id,
    case when coalesce(p_on, false) then coalesce(nullif(v_name, ''), 'The agent') || ' (' || v_side || ' side): Only communicate with TC is on. Emails and alerts go to ' || array_to_string(v_tcs, ', ') || '.'
         else coalesce(nullif(v_name, ''), 'The agent') || ' (' || v_side || ' side): Only communicate with TC is off. The agent gets emails again.' end);
  return jsonb_build_object('participantId', a.id, 'tcOnly', coalesce(p_on, false), 'tcs', to_jsonb(coalesce(v_tcs, '{}'::text[])));
end $$;

-- ---------- what Contacts shows next to each agent (CLA staff on the file) ----------
create or replace function public.tc_only_status(p_deal uuid)
returns table (participant_id uuid, role text, tc_only boolean, tcs jsonb)
language plpgsql stable security definer set search_path to pg_catalog, public, extensions as $$
begin
  if not (private.is_manager() and private.can_access_deal(p_deal)) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query select a.id, a.role, a.tc_only,
    coalesce((select jsonb_agg(jsonb_build_object('name', x.full_name, 'email', x.email, 'hasLogin', x.profile_id is not null) order by x.full_name) from private.tc_only_targets(a.id) x), '[]'::jsonb)
  from public.deal_participants a where a.deal_id = p_deal and a.role in ('Buyer Agent', 'Listing Agent') order by a.role, a.created_at;
end $$;

-- ---------- Task Builder: "Transaction coordinator" also reaches the agents' TCs ----------
create or replace function private.task_flow_is_recipient(p_deal uuid, p_role text, p_contact uuid, p_send_to text) returns boolean
language plpgsql stable security definer set search_path to pg_catalog, public, extensions as $$
declare v_src text; v_code text; v_who text;
begin
  if p_send_to = 'Transaction Coordinator' then return p_role in ('Transaction Coordinator', 'Buyer Agent TC', 'Listing Agent TC'); end if;
  if p_send_to is distinct from 'non_referring_agents' then return p_role = p_send_to; end if;
  if p_role not in ('Buyer Agent', 'Listing Agent') then return false; end if;
  select btrim(coalesce(source, '')) into v_src from public.deal_business_sources where deal_id = p_deal;
  v_code := split_part(coalesce(v_src, ''), ':', 1);
  v_who := case when position(':' in coalesce(v_src, '')) > 0 then split_part(v_src, ':', 2) else '' end;
  if v_code not in ('buyer_agent', 'listing_agent') then return true; end if;
  if v_who <> '' then return coalesce(p_contact::text, '') <> v_who; end if;
  return p_role <> case v_code when 'buyer_agent' then 'Buyer Agent' else 'Listing Agent' end;
end $$;

revoke all on function private.tc_only_targets(uuid), private.resolve_recipients(uuid, uuid, text), private.comm_swap_greeting(text, text, text),
  private.tc_only_alert(uuid, text), private.tc_only_held_text(uuid, text, text, text, boolean), private.trg_outbox_tc_only(), private.trg_notifications_tc_only(),
  private.task_flow_is_recipient(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.comm_route_emails(uuid, text[], text[], text[], boolean), public.set_participant_tc_only(uuid, boolean), public.tc_only_status(uuid) from public, anon;
grant execute on function public.comm_route_emails(uuid, text[], text[], text[], boolean), public.set_participant_tc_only(uuid, boolean), public.tc_only_status(uuid) to authenticated;

commit;
