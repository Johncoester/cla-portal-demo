# CRM import error CSV includes duplicates (CRM import fix 4 of 5)

**Requested by:** John Coester, confirmed as CRM import fix 4 of 5.

**Status:** In progress. No database change. Not Live until this is merged and a duplicate file is tried on TEST. See [ROADMAP.md](../../ROADMAP.md).

## What the user sees

On Import Leads, Import Clients, and Import Notes, preview and the summary offer **Download error CSV** when any row was skipped.

The file lists every skipped row:

- A row that failed a check stays, with the same message as before (for example "State is required.").
- A row skipped because it repeats an earlier row in the file says `Duplicate within file, row 3` (the earlier row's number).
- A row skipped because that person is already in the CRM says `Duplicate of existing lead: Robin Template / robin.template@example.test`, or "client" when the existing person is a client.

The original message is still in the Error column. The Reason column is the plain explanation. Created rows are not in the file.

If every row is ready, the button stays hidden.

## How a duplicate is recognized

This stays in the browser. Nothing new is asked of the database.

- The same email, ignoring capitals, is one person.
- The same phone, counting digits only, is one person when the number has at least 7 digits. A shorter number is not treated as the same phone.
- The same note title and note text on the same person is one note.
- The earliest earlier row in the file wins when a row matches more than one.
- A row that failed a check does not count as the earlier row. The later row is then described as an existing lead or client.

A 10,000-row file is handled in one pass.

## What this does not change

Companies do not have an import screen. This does not add one.

No database file is added or applied. The import rules for what counts as a duplicate are unchanged.

The earlier-imports table still lists rows on screen. It does not download this CSV.

The helper that builds this CSV is loaded at cache stamp 202611242050. The import page's own stamp is unchanged, because the portal shell also loads that page and this fix does not edit the shell. After the change is on TEST, reload the import page if an old copy is still showing.
