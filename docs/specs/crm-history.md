# CRM history on a fresh database

Source: John Coester, Nov 15 2026, 5:23 PM ET (t1737u). TEST history version 20261105222910, name crm. This waits until pull request 291 has merged.

## What was asked

Put TEST's CRM history statement into the migration folder as its own labeled file, using the exact text. The repo already has a file with that same version that only creates the feature flag. Take the CRM tables that this statement creates out of the scratch precondition, so a fresh database builds them from the history file.

## What it does

A fresh database runs the whole Nov 2 CRM statement. The feature-flag file still runs after it and does not replace that statement. Nothing is applied to TEST again.

## What's still missing

The earlier insert-email policy is saved in `supabase/rollbacks/20261109172229_crm_attachment_email_rls.sql` and in the scratch precondition. A hand change copied from the rollback runs just before the November 9 check. That check then passes. The clean load stops next because `20261110035000_crm_leads_person_dup_hand_change.sql` creates `crm_leads_person_dup`, and crm_nov3b already created that trigger. The column comparison does not run. On TEST the live insert-email policy is the corrected November 9 version (`e.id = crm_attachments.entity_id` and `private.effective_uid()`), not the history version and not the earlier preimage.
