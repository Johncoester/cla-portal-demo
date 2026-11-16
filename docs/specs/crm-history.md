# CRM history on a fresh database

Source: John Coester, Nov 15 2026, 5:23 PM ET (t1737u). TEST history version 20261105222910, name crm. This waits until pull request 291 has merged.

## What was asked

Put TEST's CRM history statement into the migration folder as its own labeled file, using the exact text. The repo already has a file with that same version that only creates the feature flag. Take the CRM tables that this statement creates out of the scratch precondition, so a fresh database builds them from the history file.

## What it does

A fresh database runs the whole Nov 2 CRM statement. The feature-flag file still runs after it and does not replace that statement. Nothing is applied to TEST again.

## What's still missing

John, Nov 16 2026, about 12:24 PM ET, added crm_email_templates (20261105222930) and crm_nov3b (20261105222939). Those files create the template and email attachment policies. The clean load now stops inside the November 9 check because the insert-email policy from crm_nov3b does not match the captured text (`e.created_by = private.effective_uid()` and `e.id = e.entity_id`). No TEST history row contains that captured text. The column comparison does not run. crm_zoho still adds crm_city, crm_county, crm_state, modified_at, and role_in_company. crm_settings still adds custom.
