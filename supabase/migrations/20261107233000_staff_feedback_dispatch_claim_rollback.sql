-- Undo the dispatch claim columns and functions. Does not delete reports, storage, or buckets.

drop function if exists public.staff_feedback_finish_dispatch(uuid, uuid, text, integer);
drop function if exists public.staff_feedback_claim_dispatch(uuid, uuid);
drop function if exists private.staff_feedback_finish_dispatch(uuid, uuid, text, integer);
drop function if exists private.staff_feedback_claim_dispatch(uuid, uuid);

alter table public.staff_feedback_outbox drop constraint if exists staff_feedback_outbox_outcome_chk;
alter table public.staff_feedback_outbox drop column if exists last_http_status;
alter table public.staff_feedback_outbox drop column if exists dispatch_outcome;
alter table public.staff_feedback_outbox drop column if exists claimed_at;
alter table public.staff_feedback_outbox drop column if exists claim_id;
