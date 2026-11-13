-- FF-055 (row 186) / MF-048 (row 179). Francis, Nov 11 (confirmed 2:39 PM ET): as Processor 1, Share Files to the Buyer Agent always
-- failed with "Pick at least one recipient on this order". John, Nov 13 (by voice): when the person has no portal login yet, the portal
-- invites them and holds the files and the message until they sign in.
--
-- Why it failed: for CLA staff, private.rpc_message_recipients also lists file contacts who have an email and no portal login, by their
-- CONTACT id. private.rpc_create_thread only accepts PROFILE ids, skips anything else, and then finds nobody left to send to.
--
-- What this adds (nothing existing is replaced, so there is no drift check):
--   1. public.thread_invitees: one row per conversation and file contact who is still waiting for a portal login. No direct access.
--   2. create_thread_invited(deal, subject, contact, body): CLA staff start a conversation with one such contact. The sender is the only
--      participant for now; the contact is held in thread_invitees. It refuses, in plain words, anyone who cannot be invited.
--   3. A trigger on public.contacts: when a contact gets its portal login (accept-invite sets contacts.profile_id), every conversation
--      held for that contact gains them as a participant, as long as they are still on that file. The held rows are then removed.
--   4. thread_invitees_list(threads): names of the people a conversation is still waiting for, for people who are in that conversation.
-- The invite itself is the existing create_portal_invite + gmail-send path (the same one File Contacts > Invite to portal uses).
-- Not applied by this commit.
begin;
set local lock_timeout = '3s';

create table if not exists public.thread_invitees (
  thread_id uuid not null references public.threads (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  added_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (thread_id, contact_id)
);
create index if not exists thread_invitees_contact_idx on public.thread_invitees (contact_id);
alter table public.thread_invitees enable row level security;
revoke all on public.thread_invitees from public, anon, authenticated;

create or replace function private.rpc_create_thread_invited(p_deal uuid, p_subject text, p_contact uuid, p_body text)
returns uuid
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare tid uuid; c public.contacts; r text; e text; who text; me uuid := private.effective_uid();
begin
  if me is null or p_deal is null or not private.can_access_deal(p_deal) or private.is_view_only() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if not private.can_invite_agents() then
    raise exception 'Only CLA staff who can invite people to the portal can share with someone who has no portal login yet.' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Write a message first' using errcode = 'P0001'; end if;
  select * into c from public.contacts x where x.id = p_contact;
  if not found then raise exception 'That person is not on this order.' using errcode = 'P0001'; end if;
  who := nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '');
  if not exists (select 1 from public.deal_participants dp where dp.deal_id = p_deal and dp.contact_id = p_contact) then
    raise exception 'That person is not on this order.' using errcode = 'P0001'; end if;
  select dp.role into r from public.deal_participants dp where dp.deal_id = p_deal and dp.contact_id = p_contact
    and dp.role in ('Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent')
    order by case when dp.role in ('Buyer Agent', 'Listing Agent') then 0 else 1 end limit 1;
  if r is null then
    raise exception '% has no portal login, and only a buyer, seller, buyer agent or listing agent on this file can be invited to the portal.', coalesce(who, 'That person') using errcode = 'P0001'; end if;
  if c.profile_id is not null and exists (select 1 from public.profiles p where p.id = c.profile_id and p.status = 'active') then
    raise exception '% now has a portal login. Close this window, open Share Files again and pick them.', coalesce(who, 'That person') using errcode = 'P0001'; end if;
  if btrim(coalesce(c.first_name, '')) = '' or btrim(coalesce(c.last_name, '')) = '' then
    raise exception 'Add a first and last name to this contact (File Contacts > Edit) before sharing with them.' using errcode = '22023'; end if;
  e := lower(btrim(coalesce(c.email, '')));
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Add a valid email for % (File Contacts > Edit) before sharing with them.', who using errcode = '22023'; end if;
  if exists (select 1 from public.profiles p where lower(p.email) = e and p.status = 'active') then
    raise exception 'Someone with the email % already has a portal login, but this contact is not linked to it. Ask an admin to link the contact, then share again.', e using errcode = 'P0001'; end if;

  insert into public.threads (deal_id, subject, created_by)
    values (p_deal, left(coalesce(nullif(trim(p_subject), ''), 'New conversation'), 150), me) returning id into tid;
  insert into public.thread_participants (thread_id, profile_id, last_read_at) values (tid, me, now());
  insert into public.thread_invitees (thread_id, contact_id, added_by) values (tid, p_contact, me);
  insert into public.messages (thread_id, author_id, body) values (tid, me, left(trim(p_body), 4000));
  perform private.log_activity(p_deal, 'message.thread_invited', 'thread', tid, 'Shared with ' || who || ' (' || r || '), who has no portal login yet. It is held until they sign in.');
  return tid;
end $function$;

create or replace function public.create_thread_invited(p_deal uuid, p_subject text, p_contact uuid, p_body text)
returns uuid
language plpgsql set search_path to 'pg_catalog', 'public', 'extensions' as $function$
begin return private.rpc_create_thread_invited(p_deal, p_subject, p_contact, p_body); end; $function$;

-- When a contact gets its portal login, the conversations held for it open up to that login.
create or replace function private.trg_release_thread_invitees() returns trigger
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
begin
  if new.profile_id is null then return new; end if;
  -- Setting up a portal login must never fail because of a held conversation. If this step fails, the rows stay held and a warning is logged.
  begin
    insert into public.thread_participants (thread_id, profile_id)
      select ti.thread_id, new.profile_id
      from public.thread_invitees ti
      join public.threads th on th.id = ti.thread_id
      where ti.contact_id = new.id
        -- still on that file (someone taken off the file before signing in gets nothing)
        and exists (select 1 from public.deal_participants dp where dp.deal_id = th.deal_id and dp.contact_id = new.id)
        and not exists (select 1 from public.thread_participants tp where tp.thread_id = ti.thread_id and tp.profile_id = new.profile_id);
    delete from public.thread_invitees ti where ti.contact_id = new.id;
  exception when others then
    raise warning 'held conversations were not opened for contact %: %', new.id, sqlerrm;
  end;
  return new;
end $function$;

drop trigger if exists zz_release_thread_invitees on public.contacts;
create trigger zz_release_thread_invitees
  after update of profile_id on public.contacts
  for each row when (new.profile_id is not null and old.profile_id is distinct from new.profile_id)
  execute function private.trg_release_thread_invitees();

-- Who a conversation is still waiting for. Only for people who are in that conversation.
create or replace function public.thread_invitees_list(p_threads uuid[])
returns table (thread_id uuid, contact_id uuid, display_name text, role text)
language sql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select ti.thread_id, ti.contact_id,
         nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
         (select dp.role from public.deal_participants dp where dp.deal_id = th.deal_id and dp.contact_id = ti.contact_id
            order by case when dp.role in ('Buyer Agent', 'Listing Agent') then 0 else 1 end, dp.role limit 1)
  from public.thread_invitees ti
  join public.threads th on th.id = ti.thread_id
  join public.contacts c on c.id = ti.contact_id
  where p_threads is not null and ti.thread_id = any (p_threads[1:200])
    and ti.thread_id in (select tp.thread_id from public.thread_participants tp
                         where tp.profile_id = (select private.effective_uid()) and tp.thread_id = any (p_threads[1:200]))
$function$;

revoke all on function private.rpc_create_thread_invited(uuid, text, uuid, text) from public, anon;
grant execute on function private.rpc_create_thread_invited(uuid, text, uuid, text) to authenticated;
revoke all on function public.create_thread_invited(uuid, text, uuid, text) from public, anon;
grant execute on function public.create_thread_invited(uuid, text, uuid, text) to authenticated;
revoke all on function private.trg_release_thread_invitees() from public, anon, authenticated;
revoke all on function public.thread_invitees_list(uuid[]) from public, anon;
grant execute on function public.thread_invitees_list(uuid[]) to authenticated;

do $readback$
begin
  if to_regprocedure('public.create_thread_invited(uuid,text,uuid,text)') is null then raise exception 'readback: create_thread_invited missing'; end if;
  if to_regprocedure('public.thread_invitees_list(uuid[])') is null then raise exception 'readback: thread_invitees_list missing'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'zz_release_thread_invitees' and not tgisinternal) then
    raise exception 'readback: release trigger missing'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.thread_invitees'::regclass) then
    raise exception 'readback: thread_invitees is not locked down'; end if;
  if has_table_privilege('authenticated', 'public.thread_invitees', 'select') or has_table_privilege('anon', 'public.thread_invitees', 'select') then
    raise exception 'readback: thread_invitees can be read directly'; end if;
end
$readback$;
commit;

notify pgrst, 'reload schema';
