-- PROC-1 (John Coester, Nov 14 2026, 1:55 PM ET, screen recording "Adding a processor",
-- confirmed 2:00 PM ET). Order MD-26-97260 on TEST.
-- File Overview > Parties reads deals.processor_id. Contacts writes a deal_participants
-- row with role Processor. Those two were not the same, so a Processor added on Contacts
-- still showed as Not specified on Parties.
-- This file keeps them in step both ways. deals.processor_id stays the file's Processor.
-- Adding or removing the Processor on Contacts updates that field. Setting or clearing
-- it anywhere else (Edit order details, Place Order) adds or removes the Contacts row.
-- Any active staff login can be the Processor (ANYROLE-1, 20261119150000). A contact with
-- no portal login can still be listed on Contacts as Processor. That row is not the file's
-- Processor, which is what Share Files and closing already expect. Demo and real logins stay apart.
-- The one-time copy at the bottom only touches files that look like seeded fake TEST data.
-- It does not rewrite a file that has a real-looking email on it. Not applied by this commit.
-- Do not apply this file on production.
-- Rollback: supabase/rollbacks/20261122180000_processor_party_sync.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.deals') is null or to_regclass('public.deal_participants') is null
     or to_regclass('public.contacts') is null or to_regclass('public.profiles') is null then
    raise exception 'drift: deals, deal_participants, contacts, or profiles is missing';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'processor_id')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'is_demo')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deal_participants' and column_name = 'role')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contacts' and column_name = 'profile_id')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contacts' and column_name = 'is_demo')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'role')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_demo') then
    raise exception 'drift: processor sync columns are missing';
  end if;
  if to_regprocedure('private.lock_function_search_paths()') is null then
    raise exception 'drift: private.lock_function_search_paths() is missing';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.deal_participants'::regclass and tgname = 'participants_processor_sync')
     or exists (select 1 from pg_trigger where tgrelid = 'public.deals'::regclass and tgname = 'deals_processor_party') then
    raise exception 'drift: processor sync triggers already exist';
  end if;
end $$;

-- True only for seeded fake TEST shapes: a demo file, a note that says it is fake,
-- a DEMO- file number, or a generated file number whose contacts use example.test / example.com only.
-- A file that also has some other email is left alone.
create function private.processor_backfill_fake(p_deal uuid) returns boolean
language sql stable security definer
set search_path to pg_catalog, public as $$
  select exists (
    select 1 from public.deals d
    where d.id = p_deal
      and (
        coalesce(d.is_demo, false)
        or coalesce(d.notes, '') ~* 'fake file|test portal|sample only'
        or coalesce(d.street, '') ~* 'fake|sample|test lane|test road|test street'
        or coalesce(d.file_number, '') ~* '^DEMO-'
        or (
          coalesce(d.file_number, '') ~ '^[A-Z]{2}-[0-9]{2}-[0-9]+$'
          and exists (
            select 1 from public.deal_participants dp
            join public.contacts c on c.id = dp.contact_id
            where dp.deal_id = d.id
              and coalesce(c.email, '') ~* '@example\.(test|com)$|\.example\.test$'
          )
          and not exists (
            select 1 from public.deal_participants dp
            join public.contacts c on c.id = dp.contact_id
            where dp.deal_id = d.id
              and btrim(coalesce(c.email, '')) <> ''
              and coalesce(c.email, '') !~* '@example\.(test|com)$'
              and coalesce(c.email, '') !~* '\.example\.test$'
          )
        )
      )
  );
$$;
revoke all on function private.processor_backfill_fake(uuid) from public, anon, authenticated;

-- The staff login behind a contact, or a plain refusal. Same staff list as ANYROLE-1.
create function private.processor_staff_id(p_contact uuid, p_deal uuid) returns uuid
language plpgsql stable security definer
set search_path to pg_catalog, public as $$
declare v_profile uuid; v_role text; v_status text; v_demo boolean; v_deal_demo boolean;
begin
  select c.profile_id, p.role, p.status, p.is_demo
    into v_profile, v_role, v_status, v_demo
    from public.contacts c
    left join public.profiles p on p.id = c.profile_id
   where c.id = p_contact;
  if v_profile is null or v_role is null then
    return null;
  end if;
  if v_role = 'Outside user' then
    raise exception 'An outside user cannot be added as CLA staff. Pick Buyer Agent, Listing Agent, Client-Buyer or Client-Seller.' using errcode = 'P0001';
  end if;
  if v_status is distinct from 'active'
     or v_role not in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin') then
    raise exception 'The Processor on an order must be an active staff login.' using errcode = 'P0001';
  end if;
  select coalesce(d.is_demo, false) into v_deal_demo from public.deals d where d.id = p_deal;
  if coalesce(v_demo, false) is distinct from coalesce(v_deal_demo, false) then
    raise exception 'A real order cannot use a demo login, and a demo order cannot use a real login.' using errcode = 'P0001';
  end if;
  return v_profile;
end $$;
revoke all on function private.processor_staff_id(uuid, uuid) from public, anon, authenticated;

-- Contact row for a staff login. Links an unused contact with the same email. Does not check who is signed in;
-- the caller is a trigger that already checked the login.
create function private.processor_party_contact(p_profile uuid) returns uuid
language plpgsql security definer
set search_path to pg_catalog, public as $$
declare p public.profiles; cid uuid; v_email text;
begin
  select * into p from public.profiles where id = p_profile;
  if p.id is null then
    raise exception 'The Processor on an order must be an active staff login.' using errcode = 'P0001';
  end if;
  select c.id into cid from public.contacts c where c.profile_id = p.id order by c.id limit 1;
  if cid is not null then return cid; end if;
  v_email := nullif(lower(btrim(coalesce(p.email, ''))), '');
  if v_email is not null then
    select c.id into cid from public.contacts c
     where c.profile_id is null
       and nullif(lower(btrim(coalesce(c.email, ''))), '') = v_email
     order by c.id limit 1;
    if cid is not null then
      update public.contacts
         set profile_id = p.id,
             first_name = coalesce(nullif(btrim(first_name), ''), coalesce(p.first_name, '')),
             last_name = coalesce(nullif(btrim(last_name), ''), coalesce(p.last_name, '')),
             is_demo = coalesce(p.is_demo, false)
       where id = cid;
      return cid;
    end if;
  end if;
  begin
    insert into public.contacts (id, profile_id, first_name, last_name, email, phone, company, is_demo)
    values (gen_random_uuid(), p.id, coalesce(p.first_name, ''), coalesce(p.last_name, ''), coalesce(v_email, ''),
            coalesce(p.phone, ''), '', coalesce(p.is_demo, false))
    returning id into cid;
  exception when unique_violation then
    raise exception 'That staff login shares an email with a different contact. Pick the staff login from the list.' using errcode = 'P0001';
  end;
  return cid;
end $$;
revoke all on function private.processor_party_contact(uuid) from public, anon, authenticated;

-- Make the staff Contacts row match deals.processor_id. A Processor row whose contact has no login is left alone.
create function private.apply_processor_party(p_deal uuid) returns void
language plpgsql security definer
set search_path to pg_catalog, public as $$
declare v_proc uuid; cid uuid;
begin
  perform set_config('cla.processor_sync', 'on', true);
  select processor_id into v_proc from public.deals where id = p_deal;
  if v_proc is null then
    delete from public.deal_participants dp
     using public.contacts c
     where dp.deal_id = p_deal and dp.role = 'Processor' and c.id = dp.contact_id and c.profile_id is not null;
  else
    cid := private.processor_party_contact(v_proc);
    delete from public.deal_participants dp
     using public.contacts c
     where dp.deal_id = p_deal and dp.role = 'Processor' and dp.contact_id is distinct from cid
       and c.id = dp.contact_id and c.profile_id is not null;
    insert into public.deal_participants (id, deal_id, contact_id, role)
    select gen_random_uuid(), p_deal, cid, 'Processor'
     where not exists (
       select 1 from public.deal_participants
        where deal_id = p_deal and contact_id = cid and role = 'Processor');
  end if;
  perform set_config('cla.processor_sync', 'off', true);
end $$;
revoke all on function private.apply_processor_party(uuid) from public, anon, authenticated;

create function private.trg_processor_party() returns trigger
language plpgsql security definer
set search_path to pg_catalog, public as $$
declare v_profile uuid; v_deal uuid; v_contact uuid;
begin
  if coalesce(current_setting('cla.processor_sync', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'INSERT' and new.role is distinct from 'Processor' then return new; end if;
  if tg_op = 'DELETE' and old.role is distinct from 'Processor' then return old; end if;
  if tg_op = 'UPDATE' and old.role is distinct from 'Processor' and new.role is distinct from 'Processor' then return new; end if;
  -- A contact with no login can be listed as Processor. That does not change who the file's Processor is.
  if tg_op <> 'DELETE' and new.role = 'Processor'
     and not exists (select 1 from public.contacts c where c.id = new.contact_id and c.profile_id is not null)
     and not (tg_op = 'UPDATE' and old.role = 'Processor' and exists (
       select 1 from public.contacts c where c.id = old.contact_id and c.profile_id is not null)) then
    return new;
  end if;

  perform set_config('cla.processor_sync', 'on', true);

  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.role = 'Processor' and new.role is distinct from 'Processor') then
    v_deal := old.deal_id;
    v_contact := old.contact_id;
    update public.deals d
       set processor_id = null
      from public.contacts c
     where d.id = v_deal and c.id = v_contact and d.processor_id is not distinct from c.profile_id;
    delete from public.deal_participants dp
     using public.contacts c
     where dp.deal_id = v_deal and dp.role = 'Processor' and dp.id is distinct from old.id
       and c.id = dp.contact_id and c.profile_id is not null;
  end if;

  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and new.role = 'Processor'
         and (old.role is distinct from 'Processor' or old.contact_id is distinct from new.contact_id)) then
    v_profile := private.processor_staff_id(new.contact_id, new.deal_id);
    if v_profile is not null then
      update public.deals set processor_id = v_profile
       where id = new.deal_id and processor_id is distinct from v_profile;
      delete from public.deal_participants dp
       using public.contacts c
       where dp.deal_id = new.deal_id and dp.role = 'Processor' and dp.id is distinct from new.id
         and c.id = dp.contact_id and c.profile_id is not null;
    end if;
  end if;

  perform set_config('cla.processor_sync', 'off', true);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.trg_processor_party() from public, anon, authenticated;

create function private.trg_processor_deal() returns trigger
language plpgsql security definer
set search_path to pg_catalog, public as $$
begin
  if coalesce(current_setting('cla.processor_sync', true), '') = 'on' then return new; end if;
  if new.processor_id is not distinct from old.processor_id then return new; end if;
  perform private.apply_processor_party(new.id);
  return new;
end $$;
revoke all on function private.trg_processor_deal() from public, anon, authenticated;

create trigger participants_processor_sync
  after insert or delete or update of role, contact_id on public.deal_participants
  for each row execute function private.trg_processor_party();

create trigger deals_processor_party
  after update of processor_id on public.deals
  for each row when (old.processor_id is distinct from new.processor_id)
  execute function private.trg_processor_deal();

-- One-time copy for fake TEST files only. A file that does not match processor_backfill_fake is not changed.
-- The activity notice trigger is turned off for this copy so nobody is notified about old rows.
do $$
declare r record; v_note boolean;
begin
  v_note := exists (select 1 from pg_trigger where tgrelid = 'public.deals'::regclass and tgname = 'deals_processor_activity' and not tgisinternal);
  if v_note then alter table public.deals disable trigger deals_processor_activity; end if;
  for r in
    select distinct on (dp.deal_id) dp.deal_id, c.profile_id
      from public.deal_participants dp
      join public.contacts c on c.id = dp.contact_id
      join public.profiles p on p.id = c.profile_id
      join public.deals d on d.id = dp.deal_id
     where dp.role = 'Processor'
       and p.status = 'active'
       and p.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin')
       and coalesce(p.is_demo, false) is not distinct from coalesce(d.is_demo, false)
       and private.processor_backfill_fake(dp.deal_id)
       and d.processor_id is distinct from c.profile_id
     order by dp.deal_id, dp.id desc
  loop
    begin
      update public.deals set processor_id = r.profile_id where id = r.deal_id and processor_id is distinct from r.profile_id;
    exception when others then
      null;
    end;
  end loop;
  for r in
    select d.id
      from public.deals d
     where d.processor_id is not null
       and private.processor_backfill_fake(d.id)
       and not exists (
         select 1 from public.deal_participants dp
         join public.contacts c on c.id = dp.contact_id
         where dp.deal_id = d.id and dp.role = 'Processor' and c.profile_id = d.processor_id)
  loop
    begin
      perform private.apply_processor_party(r.id);
    exception when others then
      null;
    end;
  end loop;
  if v_note then alter table public.deals enable trigger deals_processor_activity; end if;
end $$;

select private.lock_function_search_paths();

commit;

notify pgrst, 'reload schema';
