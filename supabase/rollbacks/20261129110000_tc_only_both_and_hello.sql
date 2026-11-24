-- Rollback for 20261129110000_tc_only_both_and_hello.sql (TC-ONLY-3): puts back the three TC-ONLY-1 bodies from
-- 20261129030000_tc_only_comm.sql, byte for byte (fee change / title commitment notices go to the TC only again; greeting keeps
-- its opening word). Stops unless the three functions are exactly the TC-ONLY-3 bodies. No table, policy or grant change.
begin;
set local lock_timeout = '3s';

do $$
declare want jsonb := '{"comm_swap_greeting": "b122f14fc13a27836d6d509a8608c2f2", "trg_outbox_tc_only": "0065f664b234fe54090f1f2d9d907aca", "trg_notifications_tc_only": "f002636532231c79b21c2f87affbc506"}';
  k text; h text;
begin
  for k in select jsonb_object_keys(want) loop
    select md5(p.prosrc) into h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = k;
    if h is null then raise exception 'drift: private.% is missing', k; end if;
    if h <> want ->> k then raise exception 'drift: private.% is not the TC-ONLY-3 body (md5 %, want %)', k, h, want ->> k; end if;
  end loop;
end $$;

create or replace function private.comm_swap_greeting(p_body text, p_old text, p_new text) returns text
language plpgsql immutable set search_path to pg_catalog as $$
declare v_old text := btrim(coalesce(p_old, '')); v_new text := btrim(coalesce(p_new, ''));
begin
  if p_body is null or v_old = '' or v_new = '' or v_old = v_new then return p_body; end if;
  return regexp_replace(p_body,
    '((?:^|>|\n)[ \t]*(?:Hi|Hello|Dear|Hey|Good morning|Good afternoon|Good evening)[ \t]+)' || regexp_replace(v_old, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '(?![[:alnum:]])',
    '\1' || replace(replace(v_new, '\', '\\'), '&', '\&'), 'i');
end $$;

create or replace function private.trg_outbox_tc_only() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare r record; first boolean := true; v public.outbox; v_orig_profile uuid := new.to_profile_id; v_orig_email text := new.to_email; v_ids uuid[]; v_first text;
  v_name text; v_side text; v_held boolean := false; v_profiles uuid[] := '{}'; v_emails text[] := '{}'; v_keep public.outbox;
  v_no_login_ok boolean; e text; rr record; v_no_login boolean := false;
  c_list text; c_out text[]; c_red text[]; c_held boolean; c_nologin boolean; c_ids uuid[]; c_name text; c_side text;
begin
  if new.deal_id is null or not exists (select 1 from public.deal_participants p where p.deal_id = new.deal_id and p.tc_only) then return new; end if;
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

-- read back: the live TC-ONLY-1 fingerprints, security mode, search_path, no EXECUTE for app roles
do $$
declare want jsonb := '{"comm_swap_greeting": "949663ed564e0c7a9393f99804d1f5f6", "trg_outbox_tc_only": "b1b29c42220e8366d2c74f4f58bdcc86", "trg_notifications_tc_only": "fb9b5207b967b61f798f22bda47cb351"}';
  r record; n int := 0;
begin
  for r in select p.proname, p.prosecdef, array_to_string(p.proconfig, ',') as cfg, md5(p.prosrc) as h,
                  has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE') as app_x
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and p.proname in ('comm_swap_greeting', 'trg_outbox_tc_only', 'trg_notifications_tc_only') loop
    n := n + 1;
    if r.h <> want ->> r.proname then raise exception 'readback: % md5 % (want %)', r.proname, r.h, want ->> r.proname; end if;
    if r.prosecdef <> (r.proname <> 'comm_swap_greeting') then raise exception 'readback: % security mode', r.proname; end if;
    if r.cfg <> (case when r.proname = 'comm_swap_greeting' then 'search_path=pg_catalog' else 'search_path=pg_catalog, public, extensions' end) then raise exception 'readback: % search_path %', r.proname, r.cfg; end if;
    if r.app_x then raise exception 'readback: % is executable by anon/authenticated', r.proname; end if;
  end loop;
  if n <> 3 then raise exception 'readback: expected 3 functions, found %', n; end if;
end $$;

commit;
