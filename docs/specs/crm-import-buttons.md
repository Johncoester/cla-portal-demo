# CRM import buttons (CRM-IMPORT-1)

**Requested by:** John Coester, confirmed Nov 17, 2026. CRM import fix 1 of 5. People were opening Import Notes when they meant to import leads or clients.

**Status:** In progress. Not Live. No database change. See [ROADMAP.md](../../ROADMAP.md).

## What the user sees

On CRM Leads, an Admin or Super admin sees **Import Leads** first. It uses the same main button style as the rest of the portal. **Import Notes** is the quieter button after it.

On CRM Clients, the same pair is **Import Clients**, then **Import Notes**.

Someone who is not an Admin or Super admin does not see either button. Companies do not get an import button.

## Where each button goes

- Import Leads opens `#/crm/import/leads`.
- Import Notes on Leads opens `#/crm/import/leads/notes`.
- Import Clients opens `#/crm/import/contacts`.
- Import Notes on Clients opens `#/crm/import/contacts/notes`.

The import screens themselves are unchanged. From a lead or client import, "Import Notes instead" still opens notes. From a notes import, "Import Leads instead" or "Import Clients instead" still opens the record import.

## What this does not change

This does not change how a file is read, mapped, or saved. It does not add an import for Companies. It does not change who is allowed to import.

No database file. Fake and TEST data only.
