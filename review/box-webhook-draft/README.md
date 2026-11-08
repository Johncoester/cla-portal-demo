# TEST webhook pilot: dedup helper (BOX-only) — DRAFT

This is a draft of the helper. It is not installed at the canonical path.
Canonical path (symlink-free, REQUIRED): /home/box/sand-data/agents/752e2581-88e2-419c-b848-3054e2607315/webhook-state
(/home/box/agent-data is a symlink to /home/box/sand-data, so the helper refuses /home/box/agent-data paths with exit 3.)
Files: ledger.py (SQLite ledger pilot_ledger.sqlite3), payload.py (inbound shape check), READ_TEMPLATE.txt, tests.
The events table still stores ids, status, and timestamps for project aqcervntopidtcazcmlv and the two pilot reporters. version stays text. Statuses stay claimed, completed, and blocked_with_unknown_outcome. Rows are not deleted.
prepared_replies stores one response key and body per event so a write can be retried. It does not store URLs or tokens. Opening an existing ledger adds that table and does not change event rows. Claimed rows already stored are left for the parent to review. This draft does not finish them.

## Routine protocol (every wake)
L="python3 /home/box/sand-data/agents/752e2581-88e2-419c-b848-3054e2607315/webhook-state/ledger.py"; V="--version 1 --expected-version 1"
1. Pipe the raw inbound JSON to payload.py. Exit 2 means stop (no read, no send, no chat delivery). The JSON must have exactly this set of 5 fields, in any order: event, version, event_id, feedback_id, conversation_id. Duplicate, extra, or missing keys are rejected. Valid output is normalized to that order. event must be cla.feedback.created or cla.feedback.follow_up. version must be integer 1, not a bool or string. The 3 ids must be lowercase UUIDs. Never add or accept project or reporter fields.
2. Run `$L status --event-id <event_id>`. Exit 0 with {"state":"absent"} means continue. Exit 0 with claimed, completed, or blocked_with_unknown_outcome is a quiet duplicate: do not read again and do not deliver the note into chat again. A later write retry is a different command and is not a new wake. Exit 2/3 means stop and alert the operator.
3. Run only staff_feedback_receiver_read from READ_TEMPLATE.txt through the fixed TEST connector. No attachment SQL, no order columns, no other write. Zero rows means stop. The returned event_id, feedback_id, and conversation_id must equal the inputs. reporter_id must be John 149e612a-6e14-4ee1-9890-0f29d6f89156 or Matt d02722a1-582b-42c0-b3d1-28d25adb758d.
4. Claim: `$L claim --event-id E --feedback-id F --conversation-id C --reporter-id <verified reporter> --event-type <validated event> $V`. Only exit 0 may proceed. Exit 10 means a concurrent wake won, so stop quietly and do not deliver. Exit 20/2/3 means stop and alert.
5. If reply_enabled is false, this is the old one-way path. Deliver the note once, then `$L finish ...same ids... $V --outcome completed`. Do not call the assistant write. If the send is ambiguous, `--outcome unknown` or leave it claimed. Never post the webhook again.
6. If reply_enabled is true, this is a new two-way event (a new created event or a follow_up). Do not mark the ledger completed from chat delivery.
   - `$L prepare ...same ids... --response-key <one uuid> --body <exact reply>`. The body is kept for a later write. Exit 20 on a different body keeps the stored body.
   - Call only staff_feedback_record_assistant_reply with that event id, that body, and that key.
   - awaiting_acceptance, or portal state prepared: `$L record-write ... --write-state prepared`. The reply stays prepared. The event stays claimed. Do not deliver the chat note again.
   - outcome_unknown, or no trustworthy write result: `$L record-write ... --write-state unknown` (or finish --outcome unknown). The reply becomes needs_review and the event becomes blocked_with_unknown_outcome. Do not treat it as accepted and do not post again. Ask a person to compare the routine history. staff_feedback_inspect_prepared lists the portal side; it does not accept the run.
   - conflict: `$L record-write ... --write-state conflict`. The stored body stays. Do not complete.
   - state written with a message_id: `$L record-write ... --write-state written --message-id <id>`. That is the only completion for a new two-way event.
7. If prepare or record-write fails after claim, do not post and do not deliver the chat note again. The event stays claimed or unknown. Retry record-write later with the stored key and body. A failed bookkeeping update rolls back. It is not a reason to reclaim or resend.
8. A duplicate wake (exit 10, or status other than absent) does not read and does not deliver into chat again.

Exit codes: 0 ok, 10 duplicate, 20 correlation conflict, 2 invalid, 3 unsafe/busy/corrupt storage. Every ledger command that names an event carries $V. The directory must be mode 0700 and the db mode 0600, both owned by the helper user, with no symlink in the path.

## Limitations
- Not exactly-once. A crash after claim and before prepare leaves a claimed row with no reply. Do not reclaim it and do not resend. The parent reviews claimed rows.
- There is no reset, delete, or stale expiry. Manual review only.
- HTTP 200 means a run was accepted, not that a reply was written. outcome_unknown is not accepted by guessing.
- Old completed one-way rows stay completed. This draft does not rewrite them.
