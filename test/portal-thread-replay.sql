-- Local replay of the TEST create_thread body, read from pg_get_functiondef.
-- The helper functions below are stand-ins for helpers that already exist on TEST.
-- This file is not applied to the hosted project.

alter table public.threads add column if not exists created_by uuid;
alter table public.threads alter column id set default gen_random_uuid();
alter table public.messages add column if not exists body_html text;
alter table public.messages alter column id set default gen_random_uuid();

create or replace function private.effective_uid() returns uuid language sql stable as $$
  select auth.uid() $$;
create or replace function private.is_view_only() returns boolean language sql stable as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Sales Person', 'Sales Team')) $$;
create or replace function private.is_staffish() returns boolean language sql stable as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Processor', 'Preprocessor', 'Transaction Coordinator', 'Admin', 'Super admin')) $$;
drop function if exists private.can_access_deal(uuid);
create or replace function private.can_access_deal(d uuid) returns boolean language sql stable as $$
  select private.is_staffish() or exists (
    select 1 from public.deal_participants dp join public.contacts c on c.id = dp.contact_id
    where dp.deal_id = d and c.profile_id = auth.uid()) $$;
create or replace function private.person_side(pid uuid, d uuid) returns text language sql stable as $$
  select case
    when exists (select 1 from public.profiles p where p.id = pid and p.role in ('Processor', 'Preprocessor', 'Transaction Coordinator', 'Admin', 'Super admin', 'Sales Person', 'Sales Team')) then 'staff'
    when exists (select 1 from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = d and c.profile_id = pid and dp.role in ('Buyer Agent', 'Client-Buyer')) then 'buyer'
    when exists (select 1 from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = d and c.profile_id = pid and dp.role in ('Listing Agent', 'Client-Seller')) then 'seller'
    else null end $$;
create or replace function private.my_side(d uuid) returns text language sql stable as $$
  select private.person_side(auth.uid(), d) $$;
create or replace function private.can_message(pid uuid, d uuid) returns boolean language sql stable as $$
  select private.is_staffish() or private.person_side(pid, d) = 'staff' or (private.my_side(d) in ('buyer', 'seller') and private.person_side(pid, d) = private.my_side(d)) $$;
create or replace function private.one_side(members uuid[], d uuid) returns boolean language sql stable as $$
  select (select count(distinct s) from unnest(members) m(id), lateral (select private.person_side(m.id, d) s) z where z.s in ('buyer', 'seller')) <= 1 $$;

-- Exact TEST body of private.rpc_create_thread.
create or replace function private.rpc_create_thread(p_deal uuid, p_subject text, p_participants uuid[], p_body text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare tid uuid; pid uuid; members uuid[];
begin
  if not private.can_access_deal(p_deal) or private.is_view_only() then raise exception 'Not allowed'; end if;
  if coalesce(array_length(p_participants, 1), 0) = 0 then raise exception 'Pick at least one recipient on this order'; end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Write a message first'; end if;
  members := array[private.effective_uid()];
  foreach pid in array p_participants loop
    if pid = private.effective_uid() then continue; end if;
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
  insert into public.thread_participants (thread_id, profile_id) select tid, m from (select distinct unnest(members) m) z;
  insert into public.messages (thread_id, author_id, body) values (tid, private.effective_uid(), left(trim(p_body), 4000));
  return tid; end $$;

grant usage on schema private to authenticated;
grant execute on function private.rpc_create_thread(uuid, text, uuid[], text) to authenticated;
grant usage on schema auth to authenticated;

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
set role authenticated;
select public.rls_try('listing opens a portal conversation with the seller', $$select private.rpc_create_thread('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Commission', array['66666666-6666-6666-6666-666666666666']::uuid[], 'Please confirm the commission.')$$, 'allowed');
select public.rls_try('listing cannot start a conversation with the buyer agent', $$select private.rpc_create_thread('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Wrong side', array['55555555-5555-5555-5555-555555555555']::uuid[], 'Hello')$$, 'You can message CLA Title staff and people on your own side of this order only');

reset role;
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
set role authenticated;
insert into public.rls_results (name, ok, detail)
select 'seller reads the new portal conversation', count(*) = 1, max(body) from public.messages m
 where m.body = 'Please confirm the commission.'
   and exists (select 1 from public.thread_participants tp where tp.thread_id = m.thread_id and tp.profile_id = auth.uid());
