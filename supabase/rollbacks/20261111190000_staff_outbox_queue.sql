-- Removes the staff outbox queue function. Does not delete outbox rows.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

drop function if exists public.queue_staff_outbox(uuid, text, text, text, text, uuid, text, text);
drop function if exists private.rpc_queue_staff_outbox(uuid, text, text, text, text, uuid, text, text);

commit;
