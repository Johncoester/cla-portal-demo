HELD, NOT APPLIED to TEST (Nov 9 2026).
- 20261107023000_task_owner_backfill.sql: rewrites owner_profile_id on 13 existing TEST tasks (MD-26-97207, MD-26-97213). Held: no existing-order data edits without John's explicit OK. The portal counts a task copy as yours by its file-party row instead (task-actions viewerParticipantIds).
- 20261107024500_agent_document_insert.sql: superseded by supabase/migrations/20261109140000_agent_document_staff_insert.sql, which adds only the staff-only case and keeps the file-type, folder, view-only and effective_uid checks this draft skipped.
