-- Rollback for 20261110101500_client_task_docs_share.sql. Not applied.
-- Restores message recipients and create_thread to the pre-change bodies and drops the client share trigger.
begin;
set local lock_timeout = '3s';
do $guard$
begin
  if not exists (select 1 from pg_trigger where tgname = 'zzz_client_share_visibility' and not tgisinternal) then
    raise exception 'drift: client share trigger is not installed';
  end if;
  if (select position('deal_cla_staff' in prosrc) from pg_proc where oid = to_regprocedure('private.rpc_message_recipients(uuid)')) = 0 then
    raise exception 'drift: message recipients is not the client-share version';
  end if;
  if (select position('deal_cla_staff' in prosrc) from pg_proc where oid = to_regprocedure('private.rpc_create_thread(uuid,text,uuid[],text)')) = 0 then
    raise exception 'drift: create_thread is not the client-share version';
  end if;
end
$guard$;

drop trigger zzz_client_share_visibility on public.documents;
drop function private.trg_client_share_visibility();

create or replace function private.rpc_message_recipients(p_deal uuid)
returns table(id uuid, first_name text, last_name text, role text, side text)
language sql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select distinct p.id, p.first_name, p.last_name, private.person_label(p.id, p_deal), private.person_side(p.id, p_deal)
  from public.profiles p where private.can_access_deal(p_deal) and p.status = 'active' and p.id <> private.effective_uid()
    and (p.id in (select c.profile_id from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = p_deal and private.participant_visible(p_deal, dp.role))
         or p.id = (select processor_id from public.deals where id = p_deal))
    and private.can_message(p.id, p_deal) $function$;

create or replace function private.rpc_create_thread(p_deal uuid, p_subject text, p_participants uuid[], p_body text)
returns uuid
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare tid uuid; pid uuid; members uuid[];
begin
  if not private.can_access_deal(p_deal) or private.is_view_only() then raise exception 'Not allowed'; end if;
  if coalesce(array_length(p_participants, 1), 0) = 0 then raise exception 'Pick at least one recipient on this order'; end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Write a message first'; end if;
  members := array[private.effective_uid()];
  foreach pid in array p_participants loop
    if pid = private.effective_uid() then continue; end if;
    -- only people who are on this deal (or its processor)
    if not (exists (select 1 from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = p_deal and c.profile_id = pid)
            or exists (select 1 from public.deals d where d.id = p_deal and d.processor_id = pid)) then continue; end if;
    if not private.can_message(pid, p_deal) then
      raise exception 'You can message CLA Title staff and people on your own side of this order only' using errcode = '42501'; end if;
    members := array_append(members, pid);
  end loop;
  if coalesce(array_length(members, 1), 0) < 2 then raise exception 'Pick at least one recipient on this order'; end if;
  if not private.one_side(members, p_deal) then
    raise exception 'A conversation can include CLA Title staff and ONE side of the order, not both' using errcode = '42501'; end if;
  insert into public.threads (deal_id, subject, created_by) values (p_deal, left(coalesce(nullif(trim(p_subject), ''), 'New conversation'), 150), private.effective_uid()) returning id into tid;
  insert into public.thread_participants (thread_id, profile_id, last_read_at) select tid, m, case when m = private.effective_uid() then now() end from (select distinct unnest(members) m) z;
  insert into public.messages (thread_id, author_id, body) values (tid, private.effective_uid(), left(trim(p_body), 4000));
  return tid; end $function$;

drop function if exists public.get_task_template(uuid);
drop function if exists private.rpc_task_template(uuid);
drop function if exists private.deal_cla_staff(uuid);

do $readback$
begin
  if exists (select 1 from pg_trigger where tgname = 'zzz_client_share_visibility' and not tgisinternal) then
    raise exception 'readback: client share trigger still installed';
  end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.rpc_message_recipients(uuid)'))
       is distinct from 'a3a064f1b89958df87237c77ab7e2897' then
    raise exception 'readback: message recipients did not restore';
  end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.rpc_create_thread(uuid,text,uuid[],text)'))
       is distinct from 'cb12eb623f848eebd272ef91bb7622df' then
    raise exception 'readback: create_thread did not restore';
  end if;
  if to_regprocedure('public.get_task_template(uuid)') is not null or to_regprocedure('private.deal_cla_staff(uuid)') is not null then
    raise exception 'readback: client helpers still installed';
  end if;
end
$readback$;
commit;
