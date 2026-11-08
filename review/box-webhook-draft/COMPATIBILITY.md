# Live receiver helper reference (read-only copy, 2026-11-07 ET)
Source: /home/box/sand-data/agents/752e2581-88e2-419c-b848-3054e2607315/webhook-state/ (canonical; /home/box/agent-data is a symlink to sand-data)
Excluded: pilot_ledger.sqlite3 and any db/wal/shm/runtime data. No credentials or message bodies in these files. Test fixtures use fake UUIDs plus the two public pilot profile ids and the TEST project ref.

Gaps between draft ledger 01M6WC5JN797FV9QT4XZQVRXEW.py and these live files:
1. Extend live ledger.py in place (events table, statuses claimed/completed/blocked_with_unknown_outcome, project+reporter pin, BEGIN IMMEDIATE, symlink/0700/0600/quick_check guards, no-delete trigger). Do not use a separate `wakes` db; old created rows must keep deduping.
2. Keep payload.py strictness (exact key set any order, no duplicate keys, lowercase UUIDs, version int not bool). Add only `cla.feedback.follow_up`. Draft accepts version=True and non-UUID ids.
3. Add prepared_replies(event_id FK events, response_key unique, body, state prepared|written|needs_review, message_id) via CREATE TABLE IF NOT EXISTS. awaiting_acceptance stays prepared; needs_review only for outcome_unknown.
4. Update README (bodies now stored for reconcile) and READ_TEMPLATE (FEEDBACK_READ_SQL -> staff_feedback_receiver_read; allow only staff_feedback_record_assistant_reply write and read-only staff_feedback_inspect_prepared). Completed = written message_id.
5. Keep existing tests passing; add follow-up, prepared, conflict, migration-of-existing-db tests.
