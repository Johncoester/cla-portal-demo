-- Staff-only queued outbox rows for post-closing, e-recording, funding, wires, policy, and title.
-- The browser cannot insert public.outbox (no insert policy). This queues a row and never marks it sent.
-- Rollback: supabase/rollbacks/20261111190000_staff_outbox_queue.sql

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $$
begin
  if to_regclass('public.outbox') is null then
    raise exception 'drift: public.outbox is missing';
  end if;
  if to_regprocedure('private.post_closing_editor(uuid,text)') is null then
    raise exception 'drift: private.post_closing_editor(uuid,text) is missing';
  end if;
  if to_regprocedure('private.fwp_staff(text,uuid)') is null then
    raise exception 'drift: private.fwp_staff(text,uuid) is missing';
  end if;
  if to_regprocedure('private.title_editor(uuid)') is null then
    raise exception 'drift: private.title_editor(uuid) is missing';
  end if;
  if to_regprocedure('private.is_staffish()') is null then
    raise exception 'drift: private.is_staffish() is missing';
  end if;
  if to_regprocedure('private.effective_uid()') is null then
    raise exception 'drift: private.effective_uid() is missing';
  end if;
  if to_regprocedure('public.queue_staff_outbox(uuid,text,text,text,text,uuid,text,text)') is not null then
    raise exception 'drift: public.queue_staff_outbox already exists';
  end if;
end $$;

create function private.rpc_queue_staff_outbox(
  p_deal uuid,
  p_module text,
  p_type text,
  p_email text,
  p_name text,
  p_profile uuid,
  p_subject text,
  p_body text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  allowed boolean := false;
  new_id uuid;
  mail text := left(btrim(coalesce(p_email, '')), 200);
  subject text := left(btrim(coalesce(p_subject, '')), 500);
  body text := left(btrim(coalesce(p_body, '')), 4000);
begin
  if not coalesce(private.is_staffish(), false) then
    raise exception 'Post-closing and e-recording are for CLA staff only.' using errcode = '42501';
  end if;
  if p_module = 'post-closing' then
    allowed := private.post_closing_editor(p_deal, 'post-closing');
  elsif p_module = 'e-recording' then
    allowed := private.post_closing_editor(p_deal, 'e-recording');
  elsif p_module in ('funding', 'wires', 'policy') then
    allowed := private.fwp_staff(p_module, p_deal);
  elsif p_module = 'title' then
    allowed := private.title_editor(p_deal);
  end if;
  if not coalesce(allowed, false) then
    raise exception 'Post-closing and e-recording are for CLA staff only.' using errcode = '42501';
  end if;
  if mail !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'Queue needs an email address. Nothing was sent.' using errcode = '23514';
  end if;
  if subject = '' or body = '' then
    raise exception 'Queue needs a subject and a body. Nothing was sent.' using errcode = '23514';
  end if;
  if subject ~ '[0-9]{9,}' or body ~ '[0-9]{9,}' then
    raise exception 'Full account or routing numbers are not queued.' using errcode = '23514';
  end if;
  insert into public.outbox (
    channel, status, sent_at, to_profile_id, to_email, to_name, subject, body, deal_id, created_by,
    kind, post_closing_type, title_package
  ) values (
    'email', 'queued', null, p_profile, mail, left(btrim(coalesce(p_name, '')), 200), subject,
    body || E'\n\nTEST PORTAL: queued only; never sent.',
    p_deal, private.effective_uid(), left(coalesce(p_module, ''), 40), left(coalesce(p_type, ''), 80), false
  )
  returning id into new_id;
  return new_id;
end $$;

revoke all on function private.rpc_queue_staff_outbox(uuid, text, text, text, text, uuid, text, text) from public, anon, authenticated;

create function public.queue_staff_outbox(
  p_deal uuid,
  p_module text,
  p_type text,
  p_email text,
  p_name text,
  p_profile uuid,
  p_subject text,
  p_body text
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  return private.rpc_queue_staff_outbox(p_deal, p_module, p_type, p_email, p_name, p_profile, p_subject, p_body);
end $$;

revoke all on function public.queue_staff_outbox(uuid, text, text, text, text, uuid, text, text) from public, anon;
grant execute on function public.queue_staff_outbox(uuid, text, text, text, text, uuid, text, text) to authenticated;

commit;
