-- FF-015 / FF-016 / FF-017 (Nov 9). Client-Buyer and Client-Seller on CLA Portal Live Test.
-- Not applied by this commit.
--
-- FF-015: the task list prints tasks.template_version. The detail page loads task_templates
-- separately, so an empty select shows "template n/a" and no fields. templates_select already
-- allows a viewer who can_access_deal a task that uses the template (PR #100). This adds
-- get_task_template, a security-definer read of those field definitions for a task the caller
-- can already open, used when that select comes back empty.
--
-- FF-016: the buyer form's only choice is labeled Share with CLA Title and was submitted as
-- visibility 'staff'. visibility_allowed refuses 'staff' for a client, so the insert fails
-- row security. A buyer or seller upload is stored as their own side ('buyer' or 'seller'):
-- CLA staff and their own agent can see it, the other side cannot. Agent 'staff' uploads are
-- not rewritten (documents_insert and documents_assigned_agent_insert are untouched).
--
-- FF-017: message_recipients listed the client's own agent and deals.processor_id only.
-- Share Files also offers the preprocessor, transaction coordinator, salespeople, and, when
-- no processor is assigned, the active processors in the same live/demo world. The other side
-- is not added. create_thread accepts the same people.
--
-- Rollback: supabase/rollbacks/20261110101500_client_task_docs_share.sql
begin;
set local lock_timeout = '3s';

do $guard$
begin
  if to_regprocedure('private.rpc_message_recipients(uuid)') is not null
     and (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.rpc_message_recipients(uuid)'))
         is distinct from 'a3a064f1b89958df87237c77ab7e2897' then
    raise exception 'drift: private.rpc_message_recipients changed or missing';
  end if;
  if to_regprocedure('private.rpc_create_thread(uuid,text,uuid[],text)') is not null
     and (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.rpc_create_thread(uuid,text,uuid[],text)'))
         is distinct from 'cb12eb623f848eebd272ef91bb7622df' then
    raise exception 'drift: private.rpc_create_thread changed or missing';
  end if;
  if to_regprocedure('private.visibility_allowed(uuid,text)') is not null
     and (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.visibility_allowed(uuid,text)'))
         is distinct from '4d4f1b4c4c00f5511f7d76b80188f690' then
    raise exception 'drift: private.visibility_allowed changed';
  end if;
  if to_regclass('public.documents') is not null
     and (select md5(coalesce(with_check, '')) from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_insert')
         is distinct from '37e27c9b0e4d0be52ff1f2a6153ce957' then
    raise exception 'drift: documents_insert changed';
  end if;
  if to_regclass('public.task_templates') is not null and not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'task_templates' and policyname = 'templates_select' and qual ilike '%can_access_deal%'
  ) then
    raise exception 'drift: templates_select lost the can_access_deal branch';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'zzz_client_share_visibility' and not tgisinternal) then
    raise exception 'drift: client share trigger already installed';
  end if;
end
$guard$;

create or replace function private.deal_cla_staff(d uuid) returns setof uuid
language sql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select x.pid from (
    select processor_id as pid from public.deals where id = d
    union select preprocessor_user_id from public.deals where id = d
    union select tc_user_id from public.deals where id = d
    union select sales_person_id from public.deals where id = d
    union select s.sales_id from public.deal_sales_people s where s.deal_id = d
    union select c.profile_id
      from public.deal_participants dp
      join public.contacts c on c.id = dp.contact_id
      where dp.deal_id = d
        and dp.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator')
    union
    select p.id
      from public.profiles p
      where p.status = 'active' and p.role = 'Processor'
        and p.is_demo is not distinct from (select z.is_demo from public.deals z where z.id = d)
        and not exists (select 1 from public.deals z where z.id = d and z.processor_id is not null)
  ) x
  where x.pid is not null
$function$;
revoke all on function private.deal_cla_staff(uuid) from public, anon, authenticated;

create or replace function private.rpc_message_recipients(p_deal uuid)
returns table(id uuid, first_name text, last_name text, role text, side text)
language sql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select distinct p.id, p.first_name, p.last_name, private.person_label(p.id, p_deal), private.person_side(p.id, p_deal)
  from public.profiles p where private.can_access_deal(p_deal) and p.status = 'active' and p.id <> private.effective_uid()
    and (p.id in (select c.profile_id from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = p_deal and private.participant_visible(p_deal, dp.role))
         or p.id in (select private.deal_cla_staff(p_deal)))
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
            or pid in (select private.deal_cla_staff(p_deal))) then continue; end if;
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

create or replace function private.rpc_task_template(p_task uuid) returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare t public.tasks; tpl public.task_templates;
begin
  select * into t from public.tasks where id = p_task;
  if not found then return null; end if;
  if not (
    ((private.me_role() is not null and (private.is_admin() or private.me_role() in ('Processor', 'Sales Team', 'Transaction Coordinator')))
      or private.can_access_deal(t.deal_id))
    and coalesce(private.is_staffish() or private.task_visible(t.owner_profile_id, t.assigned_role, t.deal_id), false)
    and not (t.assigned_role = 'Client-Buyer' and private.emd_receipt_title(t.title) and private.is_pure_buyer(t.deal_id))
  ) then return null; end if;
  if t.template_id is null then return null; end if;
  select * into tpl from public.task_templates where id = t.template_id;
  if not found then return null; end if;
  return jsonb_build_object('id', tpl.id, 'code', tpl.code, 'version', tpl.version, 'title', tpl.title, 'fields', coalesce(tpl.fields, '[]'::jsonb));
end
$function$;
revoke all on function private.rpc_task_template(uuid) from public, anon, authenticated;

create or replace function public.get_task_template(p_task uuid) returns jsonb
language sql stable security invoker
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select private.rpc_task_template(p_task)
$function$;
revoke all on function public.get_task_template(uuid) from public, anon;
grant execute on function private.rpc_task_template(uuid) to authenticated;
grant execute on function public.get_task_template(uuid) to authenticated;

create or replace function private.trg_client_share_visibility() returns trigger
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare role text; side text;
begin
  role := private.deal_role(new.deal_id);
  if role in ('Client-Buyer', 'Client-Seller') and new.visibility = 'staff' then
    side := private.side_of(role);
    if side in ('buyer', 'seller') then new.visibility := side; end if;
  end if;
  return new;
end
$function$;
revoke all on function private.trg_client_share_visibility() from public, anon, authenticated;

create trigger zzz_client_share_visibility
  before insert or update of visibility on public.documents
  for each row execute function private.trg_client_share_visibility();

do $readback$
begin
  if (select position('deal_cla_staff' in prosrc) from pg_proc where oid = to_regprocedure('private.rpc_message_recipients(uuid)')) = 0 then
    raise exception 'readback: message recipients did not gain CLA staff';
  end if;
  if (select position('deal_cla_staff' in prosrc) from pg_proc where oid = to_regprocedure('private.rpc_create_thread(uuid,text,uuid[],text)')) = 0 then
    raise exception 'readback: create_thread did not accept CLA staff';
  end if;
  if (select md5(coalesce(with_check, '')) from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_insert')
       is distinct from '37e27c9b0e4d0be52ff1f2a6153ce957' then
    raise exception 'readback: documents_insert changed';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'zzz_client_share_visibility' and not tgisinternal) then
    raise exception 'readback: client share trigger missing';
  end if;
  if to_regprocedure('public.get_task_template(uuid)') is null then
    raise exception 'readback: get_task_template missing';
  end if;
end
$readback$;
commit;
