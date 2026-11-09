-- Participant-only portal message. Not an email and not marked sent.
-- This is the permission rule the portal already describes. The hosted create_thread
-- function is not in this repository, so this does not claim that function ran.

create table if not exists public.threads (
  id uuid primary key,
  deal_id uuid not null,
  subject text not null
);
create table if not exists public.thread_participants (
  thread_id uuid not null references public.threads(id),
  profile_id uuid not null references public.profiles(id),
  primary key (thread_id, profile_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id),
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.threads enable row level security;
alter table public.thread_participants enable row level security;
alter table public.messages enable row level security;
drop policy if exists threads_member on public.threads;
drop policy if exists thread_participants_self on public.thread_participants;
drop policy if exists messages_member_select on public.messages;
drop policy if exists messages_member_insert on public.messages;
create policy threads_member on public.threads for select to authenticated
  using (exists (select 1 from public.thread_participants tp where tp.thread_id = threads.id and tp.profile_id = auth.uid()));
create policy thread_participants_self on public.thread_participants for select to authenticated
  using (profile_id = auth.uid());
create policy messages_member_select on public.messages for select to authenticated
  using (exists (select 1 from public.thread_participants tp where tp.thread_id = messages.thread_id and tp.profile_id = auth.uid()));
create policy messages_member_insert on public.messages for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.thread_participants tp where tp.thread_id = messages.thread_id and tp.profile_id = auth.uid()));
grant select, insert on public.threads, public.thread_participants, public.messages to authenticated;

insert into public.threads (id, deal_id, subject) values ('d1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'About the file');
insert into public.thread_participants (thread_id, profile_id) values
  ('d1111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444'),
  ('d1111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
set role authenticated;
select public.rls_try('listing saves portal message', $$insert into public.messages (thread_id, author_id, body) values ('d1111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'The commission form is ready.')$$, 'allowed');

reset role;
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
set role authenticated;
insert into public.rls_results (name, ok, detail)
select 'seller reads portal message', count(*) = 1, string_agg(body, '') from public.messages where thread_id = 'd1111111-1111-1111-1111-111111111111';

reset role;
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
set role authenticated;
insert into public.rls_results (name, ok, detail)
select 'buyer agent cannot read that message', count(*) = 0, count(*)::text from public.messages where thread_id = 'd1111111-1111-1111-1111-111111111111';
select public.rls_try('buyer agent cannot post on that thread', $$insert into public.messages (thread_id, author_id, body) values ('d1111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 'I should not be here.')$$, 'new row violates row-level security policy for table "messages"');
