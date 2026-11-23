-- TC-ONLY-3 (Francis Santos, answers Nov 23 2026 1:30 PM ET) for "Only communicate with TC":
--   * Fee change notices (kind agent_fee: email and portal alert) and title commitment emails (the buyer agent's commitment email,
--     the listing agent's title package) go to BOTH the agent and their linked TC. Everything else still goes to the TC only.
--   * The greeting on an email moved or copied to a TC becomes "Hello <TC first name>" (was: the same opening word, e.g. "Hi <TC>").
-- Replaces three functions from 20261129030000_tc_only_comm.sql. No table, policy or grant change; no lock-holding DDL.

create or replace function private.comm_swap_greeting(p_body text, p_old text, p_new text) returns text
language plpgsql immutable set search_path to pg_catalog as $$
declare v_old text := btrim(coalesce(p_old, '')); v_new text := btrim(coalesce(p_new, ''));
begin
  if p_body is null or v_old = '' or v_new = '' then return p_body; end if;
  return regexp_replace(p_body,
    '((?:^|>|\n)[ \t]*)(?:Hi|Hello|Dear|Hey|Good morning|Good afternoon|Good evening)[ \t]+' || regexp_replace(v_old, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '(?![[:alnum:]])',
    '\1Hello ' || replace(replace(v_new, '\', '\\'), '&', '\&'), 'i');
end $$;

create or replace function private.trg_outbox_tc_only() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare r record; first boolean := true; v public.outbox; v_orig_profile uuid := new.to_profile_id; v_orig_email text := new.to_email; v_ids uuid[]; v_first text;
  v_name text; v_side text; v_held boolean := false; v_profiles uuid[] := '{}'; v_emails text[] := '{}'; v_keep public.outbox;
  v_no_login_ok boolean; e text; rr record; v_no_login boolean := false;
  c_list text; c_out text[]; c_red text[]; c_held boolean; c_nologin boolean; c_ids uuid[]; c_name text; c_side text;
begin
  if new.deal_id is null or not exists (select 1 from public.deal_participants p where p.deal_id = new.deal_id and p.tc_only) then return new; end if;
  -- TC-ONLY-3 (Francis, Nov 23 2026): fee change and title commitment notices go to BOTH the agent and their TC.
  -- The agent's row is left as it is; each linked TC with an email gets their own copy ("Hello <TC>").
  if coalesce(new.kind, '') = 'agent_fee' or coalesce(new.title_recipient_role, '') in ('buyer_agent_commitment', 'listing_agent') then
    v_keep := new;
    for r in select * from private.resolve_recipients(new.deal_id, new.to_profile_id, new.to_email) loop
      if r.action <> 'redirect' then exit; end if;
      v_ids := r.agent_participant_ids;
      if coalesce(r.email, '') = '' or (r.profile_id is null and not (v_keep.title_package and char_length(coalesce(r.full_name, '')) > 0)) then continue; end if;
      v := v_keep; v.id := gen_random_uuid();
      v.to_profile_id := r.profile_id; v.to_email := r.email; v.to_name := coalesce(nullif(r.full_name, ''), v.to_name);
      v.cc_emails := '{}'; v.bcc_emails := '{}';
      v.body := private.comm_swap_greeting(v_keep.body, r.agent_first_name, r.first_name);
      if exists (select 1 from public.outbox o where o.deal_id = v.deal_id and lower(o.to_email) = lower(v.to_email) and o.subject = v.subject and o.created_at = now()) then continue; end if;
      insert into public.outbox select v.*;
      v_profiles := v_profiles || r.profile_id; v_emails := v_emails || v.to_email;
    end loop;
    if cardinality(v_emails) > 0 then
      insert into public.comm_redirect_log (deal_id, channel, action, source, agent_participant_ids, agent_profile_id, agent_email, to_profile_ids, to_emails, ref_id, detail, created_by)
      values (new.deal_id, 'email', 'redirected', coalesce(nullif(new.kind, ''), nullif(new.template_key, ''), nullif(new.title_recipient_role, ''), 'email'), coalesce(v_ids, '{}'), v_orig_profile, coalesce(v_orig_email, ''),
        array_remove(v_profiles, null), v_emails, new.id, left('Copy to TC (the agent gets it too): ' || coalesce(new.subject, ''), 500), private.effective_uid());
    end if;
    return new;
  end if;
  -- copies: a TC-only agent in cc / bcc is swapped for their TC, or dropped when they have none. Both are logged; a drop alerts the processor.
  foreach c_list in array array['cc', 'bcc'] loop
    c_out := '{}';
    foreach e in array case when c_list = 'cc' then coalesce(new.cc_emails, '{}') else coalesce(new.bcc_emails, '{}') end loop
      c_red := '{}'; c_held := false; c_nologin := false; c_ids := null; c_name := null; c_side := null;
      for rr in select * from private.resolve_recipients(new.deal_id, null, e) loop
        if rr.action = 'keep' then c_out := c_out || e; continue; end if;
        c_ids := rr.agent_participant_ids; c_name := rr.agent_name; c_side := rr.agent_side;
        if rr.action = 'redirect' and coalesce(rr.email, '') <> '' then c_out := c_out || rr.email; c_red := c_red || rr.email;
        elsif rr.action = 'redirect' then c_nologin := true;
        else c_held := true; end if;
      end loop;
      if cardinality(c_red) > 0 then
        insert into public.comm_redirect_log (deal_id, channel, action, source, agent_participant_ids, agent_email, to_emails, ref_id, detail, created_by)
        values (new.deal_id, 'email', 'redirected', coalesce(nullif(new.kind, ''), nullif(new.template_key, ''), 'email'), coalesce(c_ids, '{}'), lower(btrim(e)), c_red, new.id,
          left('Copy (' || c_list || '): ' || coalesce(new.subject, ''), 500), private.effective_uid());
      elsif c_held or c_nologin then
        insert into public.comm_redirect_log (deal_id, channel, action, source, agent_participant_ids, agent_email, ref_id, detail, created_by)
        values (new.deal_id, 'email', 'held', coalesce(nullif(new.kind, ''), nullif(new.template_key, ''), 'email'), coalesce(c_ids, '{}'), lower(btrim(e)), new.id,
          left('Copy (' || c_list || ') dropped: ' || coalesce(new.subject, '') || case when c_held then ' (no TC linked on that side)' else ' (the TC has no email for it)' end, 500), private.effective_uid());
        perform private.tc_only_alert(new.deal_id, private.tc_only_held_text(new.deal_id, c_name, c_side, 'an email copy (' || c_list || ')', not c_held));
      end if;
    end loop;
    if c_list = 'cc' then new.cc_emails := array(select distinct x from unnest(c_out) x); else new.bcc_emails := array(select distinct x from unnest(c_out) x); end if;
  end loop;

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

create or replace function private.trg_notifications_tc_only() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare r record; first boolean := true; v public.notifications; v_keep public.notifications; v_ids uuid[]; v_name text; v_side text; v_held boolean := false; v_to uuid[] := '{}';
  v_self boolean := false;
begin
  if new.deal_id is null or not exists (select 1 from public.deal_participants p where p.deal_id = new.deal_id and p.tc_only) then return new; end if;
  -- the same alert to the same person in this action (the TC's own copy plus the one meant for their agent): keep one
  if exists (select 1 from public.notifications n where n.profile_id = new.profile_id and n.deal_id = new.deal_id and n.kind = new.kind and n.title = new.title and n.created_at = now())
     and exists (select 1 from public.deal_participants p cross join lateral private.tc_only_targets(p.id) x
                 where p.deal_id = new.deal_id and p.tc_only and x.profile_id = new.profile_id) then
    return null; end if;
  -- TC-ONLY-3: fee change notices reach the agent AND each linked TC with a portal login
  if new.kind = 'agent_fee' then
    v_keep := new;
    for r in select * from private.resolve_recipients(new.deal_id, new.profile_id, null) loop
      if r.action <> 'redirect' then exit; end if;
      v_ids := r.agent_participant_ids;
      if r.profile_id is null or r.profile_id = private.effective_uid() then continue; end if;
      if exists (select 1 from public.notifications n where n.profile_id = r.profile_id and n.deal_id = v_keep.deal_id and n.kind = v_keep.kind and n.title = v_keep.title and n.created_at = now()) then continue; end if;
      v := v_keep; v.id := gen_random_uuid(); v.profile_id := r.profile_id;
      insert into public.notifications select v.*;
      v_to := v_to || r.profile_id;
    end loop;
    if cardinality(v_to) > 0 then
      insert into public.comm_redirect_log (deal_id, channel, action, source, agent_participant_ids, agent_profile_id, to_profile_ids, ref_id, detail, created_by)
      values (v_keep.deal_id, 'in_app', 'redirected', v_keep.kind, coalesce(v_ids, '{}'), v_keep.profile_id, v_to, v_keep.id, left('Copy to TC (the agent gets it too): ' || v_keep.title, 500), private.effective_uid());
    end if;
    return new;
  end if;
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

revoke all on function private.comm_swap_greeting(text, text, text), private.trg_outbox_tc_only(), private.trg_notifications_tc_only() from public, anon, authenticated;
