-- Bot queries for CLA Portal Live Test only (aqcervntopidtcazcmlv).
-- Run these as service_role after the migration. Do not put report text in the webhook.
-- Webhook body, and only that body:
--   {"event":"cla.feedback.created","version":1,"event_id":"<outbox uuid>","feedback_id":"<report uuid>","conversation_id":"<conversation uuid>"}
-- HTTP 200 means a run started. Then the bot loads the row and acks by event_id.

-- Pending new reports. Pilot rows are inserted with dispatch_allowed false, so this list is empty
-- until a later reviewed change. Staff replies stay saved and are not in this list.
select id as event_id, feedback_id, conversation_id, delivery_state, reason
from public.staff_feedback_outbox
where event_name = 'cla.feedback.created' and delivery_state = 'pending_dispatch' and dispatch_allowed
order by created_at;

-- After the worker sees HTTP 200. Any other status leaves the row pending. Idempotent once accepted.
-- select public.staff_feedback_mark_run_accepted('<event_id>'::uuid, 200);

-- Bot load. No email, phone, or customer contract text is stored on the report.
-- select public.staff_feedback_bot_get('<feedback_id>'::uuid);

-- After the bot has read that row. Idempotent. Refused before run_accepted.
-- select public.staff_feedback_bot_ack('<event_id>'::uuid);

-- Draft only. Does not publish to the reporter and does not change status.
-- select public.staff_feedback_bot_draft_reply('<event_id>'::uuid, 'draft text');
