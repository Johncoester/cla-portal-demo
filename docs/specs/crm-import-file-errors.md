# CRM import file errors (CRM import fix 2 of 5)

**Requested by:** John Coester, confirmed Nov 17 2026. CRM import fix 2 of 5.

**Status:** In progress. Not Live until this is merged and someone tries a bad file on TEST. See [ROADMAP.md](../../ROADMAP.md).

## What the user sees

On Import Leads, Import Clients, and Import Notes for either one, the upload card always says which files work: .csv, .xlsx, and .xls, up to 2 MB and 10,000 rows. It also says the file window shows those types and leaves other types out.

When a file is not accepted, the reason stays in red on that same card until another file is chosen. It does not pop up and disappear. The reasons are:

- The file is not a .csv, .xlsx, or .xls.
- The file is over 2 MB.
- The file has more than 10,000 rows.
- The file is empty, or it has no data rows, or it cannot be read.
- A people file has no Last Name column. A note file has no Note column, or no Email or name column to find the lead or client.

A file that is not accepted does not replace a file that was already accepted, and it does not clear a default value the person already picked.

## What this does not change

Role in Company, Relationship Status, and State can still be filled from Default values, so a people file is not refused just because those columns are missing.

Companies still have no import screen.

Nothing is written to the database by this change. No email is sent.
