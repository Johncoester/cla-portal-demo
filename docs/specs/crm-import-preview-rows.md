# CRM import preview row reasons (CRM-201)

**Requested by:** John Coester, confirmed Nov 17 2026, CRM import fix 5 of 5. Tracker row CRM-201. The earlier attempt was pull request 139 (closed, not merged, Nov 12 2026).

**Status:** In progress. Not Live until the portal lead applies `supabase/migrations/20261125110000_crm_import_preview_row_errors.sql` on TEST and someone checks a preview there. See [ROADMAP.md](../../ROADMAP.md).

## What the user sees

On Import Leads, Import Clients, and Import Notes, Preview shows a plain sentence at the top and a reason on every row.

When the preview finishes, the sentence is: "Nothing was saved. Each row shows whether it is ready, a duplicate, or what to fix." Each row still says Ready, Duplicate, or Error, with the reason for that row.

When the preview does not finish (the old preview call came back as a server error, often because the database raised P0004 and the detail with the row reasons was dropped), the screen does not stop at one generic failure. The sentence says nothing was saved and that each row shows what happened. Each row that was sent says it was not checked, in plain words. Rows that were already checked stay on the screen with the reason they already had. A preview that takes too long says that, after one retry, and does not show the database's timeout text.

A real import that stops part way still says which rows were saved and which chunk failed. That path is unchanged.

## What this does not change

Companies do not have an import screen.

The database file is not applied by this change. The portal lead applies it on TEST. It is not applied to production.

The lead email lookup is the same query as before. No new helper runs once per row. Policies on deals, tasks, and profiles are unchanged.

Until the database file is applied, a preview that still comes back with the old P0004 detail is read, and the same plain sentence is shown. A preview that comes back with no row details is mapped onto the rows as above.
