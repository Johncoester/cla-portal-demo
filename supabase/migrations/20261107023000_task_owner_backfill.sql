-- Backfill a blank task owner from that task's own participant on the same file.
-- Uses deal_participants, which is the file-party table. Does not change row security.
-- Apply only after a separate approval. This file is not applied from the portal.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tasks'
      and column_name = 'owner_profile_id'
  ) then
    update public.tasks as t
    set owner_profile_id = c.profile_id
    from public.deal_participants as p
    join public.contacts as c on c.id = p.contact_id
    where t.participant_id = p.id
      and t.deal_id = p.deal_id
      and t.owner_profile_id is null
      and c.profile_id is not null;
  end if;
end $$;
