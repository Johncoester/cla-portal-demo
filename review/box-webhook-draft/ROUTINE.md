# Proposed routine intent (draft)

The parent saves this only after one scoped TEST release approval. This file does not change the live routine or the live helper.

The helper draft and this intent are one contract. payload.py accepts created and follow_up only. The ledger dedups claimed, completed, and blocked_with_unknown_outcome before any read or chat delivery. prepared_replies hangs off the existing events row. Old completed one-way rows stay completed. Claimed rows already in the ledger are not finished by this draft.

On each wake:

1. Validate the raw five-field JSON. Stop on exit 2.
2. If the ledger status is not absent, stop. Do not read. Do not deliver the note into chat again. Do not post the webhook again.
3. Read only staff_feedback_receiver_read for those three ids.
4. Claim the event. Exit 10 means stop quietly.
5. reply_enabled false: one-way. Deliver once. finish --outcome completed, or unknown if the delivery is ambiguous. No assistant write.
6. reply_enabled true: two-way. prepare the response key and body. Call staff_feedback_record_assistant_reply. record-write the result. Complete the ledger only when the result is written and has a message_id. awaiting_acceptance stays prepared. unknown becomes needs_review and blocked_with_unknown_outcome. A person compares the routine history before any later written retry. Inspection does not accept the run.
7. If bookkeeping fails, stop. The rollback leaves the previous ledger row. Do not reclaim and do not post.

A write retry is record-write with the stored key and body. It is not a new wake, not a read, and not a chat delivery.
