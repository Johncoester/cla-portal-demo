# CRM history on a fresh database

Source: John Coester, Nov 15 2026, 5:23 PM ET (t1737u). TEST history version 20261105222910, name crm. This waits until pull request 291 has merged.

## What was asked

Put TEST's CRM history statement into the migration folder as its own labeled file, using the exact text. The repo already has a file with that same version that only creates the feature flag. Take the CRM tables that this statement creates out of the scratch precondition, so a fresh database builds them from the history file.

## What it does

A fresh database runs the whole Nov 2 CRM statement. The feature-flag file still runs after it and does not replace that statement. Nothing is applied to TEST again.

## What's still missing

The lead duplicate stand-in no longer creates `crm_leads_person_dup`, because crm_nov3b already does. The live `private.crm_person_dup` body is copied exactly from `20261110040000_crm_person_dup_index.sql` into `20261110040001_crm_person_dup_hand_change.sql`, which runs just after that file. Its full definition checksum is `618de60d1b35841405a26ed27364ae8e`, the same as TEST. The column comparison then fails: `crm_activities` is missing call and recording columns. TEST history `crm_calls` (20261105222949) contains those columns. That file is not in this pull request.
