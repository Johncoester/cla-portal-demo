# CRM history on a fresh database

Source: John Coester, Nov 15 2026, 5:23 PM ET (t1737u). TEST history version 20261105222910, name crm. This waits until pull request 291 has merged.

## What was asked

Put TEST's CRM history statement into the migration folder as its own labeled file, using the exact text. The repo already has a file with that same version that only creates the feature flag. Take the CRM tables that this statement creates out of the scratch precondition, so a fresh database builds them from the history file.

## What it does

A fresh database runs the whole Nov 2 CRM statement. The feature-flag file still runs after it and does not replace that statement. Nothing is applied to TEST again.

## What's still missing

John, Nov 16 2026, 10:46 AM ET (t1768u), added three more exact history statements: crm_zoho (20261105222920), crm_settings (20261105222924), and crm_janine_nov3 (20261105223011). crm_zoho adds crm_city, crm_county, crm_state, modified_at, and role_in_company on leads. crm_settings adds custom. The clean load now stops earlier, at the November 9 attachment-policy check: the attachments table has 2 policies and that check expects 6. The column comparison does not run. The other four policies are created by TEST history rows that are not in this pull request: crm_email_templates (20261105222930) creates the template policies, and crm_nov3b (20261105222939) creates the email policies.
