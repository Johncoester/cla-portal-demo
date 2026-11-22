-- Rollback for 20261122180000_processor_party_sync.sql.
-- Drops the sync only. Rows already copied (a fake file's processor field or Contacts row)
-- are left as they are. The next add or remove will not stay in step until this file is applied again.
begin;
set local lock_timeout = '3s';

drop trigger if exists participants_processor_sync on public.deal_participants;
drop trigger if exists deals_processor_party on public.deals;

drop function if exists private.trg_processor_party();
drop function if exists private.trg_processor_deal();
drop function if exists private.apply_processor_party(uuid);
drop function if exists private.processor_party_contact(uuid);
drop function if exists private.processor_staff_id(uuid, uuid);
drop function if exists private.processor_backfill_fake(uuid);

commit;

notify pgrst, 'reload schema';
