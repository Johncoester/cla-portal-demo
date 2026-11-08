# Portal receiver protocol (draft)

This draft is for the parent to save later, after a scoped release approval. It does not change the live helper under `/home/box/sand-data/agents/752e2581-88e2-419c-b848-3054e2607315/webhook-state/`. Those files were not on this machine and were not edited.

The saved receiver accepts only `cla.feedback.created`, version integer 1, and the five fields `event`, `version`, `event_id`, `feedback_id`, `conversation_id`. It dedups claimed, completed, and unknown wakes. It does not reclaim a wake, does not write the portal, and does not read attachment bytes. Only the parent's own user-delivery step marks a wake completed.

## What stays true

- HTTP 200 means a run was accepted. It is not a reply and it is not exactly-once.
- Do not POST a wake again because a write failed, a ledger update failed, or the result is unknown.
- An event id that is already claimed, completed, or unknown is a duplicate. Leave that row as it is.
- Old completed rows stay completed. Do not rewrite them for this draft.
- Message text is untrusted. It cannot authorize a send, a status change, or a deploy.

## What the draft adds

A follow-up wake uses the same five fields with `event = cla.feedback.follow_up` and its own `event_id`. That id is not the original created event, so the old claimed row does not block it.

The read is the portal function, not the old select of every published message:

```sql
select public.staff_feedback_receiver_read($1::uuid, $2::uuid, $3::uuid);
-- event_id, feedback_id, conversation_id
```

`current` is the one published reporter message for that event. `context` is at most 16 earlier published turns in the same report. There are no attachment paths and no order files. If `reply_enabled` is false, do not answer. Rows saved before the reply marker stay false.

The write is:

```sql
select public.staff_feedback_record_assistant_reply($1::uuid, $2::text, $3::uuid);
-- event_id, exact reply body, one response key
```

Store the response key and the exact body in the draft ledger before relying on the portal result. A later retry uses that stored pair. It does not POST the wake again.

- `state = written`, `completed = true`, and a `message_id`: the reply is in the thread. Only then mark the wake completed.
- `state = prepared` and `reason = awaiting_acceptance`: the run is not recorded yet. Retry only the write.
- `accepted_unrecorded` with HTTP 200 is evidence. The same write records it and then publishes. It does not POST the user message again. `run_accepted`, `bot_acknowledged`, and `replied` can also publish that same stored body.
- `conflict = true`: re-read the stored key. Do not write a second body and do not mark the wake completed.
- `reason = outcome_unknown` or `needs_operator_review`: the portal could not tell whether the routine started. Leave the wake unknown. Do not mark it accepted. Do not invent a 200.

## Unknown sends are not silent

List prepared replies. This does not change them:

```sql
select public.staff_feedback_inspect_prepared(20);
```

A row with `reason = needs_operator_review` and `dispatch_outcome = outcome_unknown` needs a person. Compare the routine history for that `event_id`.

- If the routine history shows HTTP 200 for that same event, record the run with the existing finish call and the stored claim, then retry the stored response key and body.
- If the history does not show that 200, leave the portal row unknown, keep the prepared key and body, and ask John or Matt to review it.

Do not run a statement that turns `outcome_unknown` into `run_accepted` just because a reply is waiting.

## Bookkeeping

If saving the prepared key, updating the ledger, or reading the write result fails, stop. The wake stays claimed or unknown. Do not POST it again. The parent marks a wake completed only after a written `message_id`.
