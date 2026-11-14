# CRM Excel import (CRM-IMPORT-XLSX)

**Requested by:** John Coester, Nov 14 2026, 1:42 PM ET, after a screen recording of Import Notes (on Leads). Windows' file picker hid his Excel files because the box only accepted CSV.

**Status:** In progress. Not Live until this is merged and an Excel file is tried on TEST. See [ROADMAP.md](../../ROADMAP.md).

## What the user sees

On Import Leads, Import Clients, and Import Notes for either one, the upload says CSV or Excel. The file box accepts .csv, .xlsx, and .xls.

Picking an Excel file reads the first sheet. The column mapping, the preview, the row and size limits, the import itself, the error CSV, and resume work the same way they do for a CSV.

If the file has more than one sheet, the screen says which sheet was used. The other sheets are not imported.

A password-protected file asks the person to remove the password and upload it again. A file that cannot be read asks them to save it again as a CSV or as an Excel file without a password.

## Dates, numbers, and blanks

- A date is shown as month/day/year, for example 11/14/2026.
- If that cell also has a time, the time is kept after the date so it is not thrown away.
- Numbers are plain text. A zip code stays digits. A value that Excel stored with extra float noise shows as the number a person would expect (0.3, not a long decimal).
- An empty cell is an empty string, so the columns still line up.

## What this does not change

Companies do not have an import screen. This does not add one.

Nothing is written to the database by a new file. The existing import is used after the sheet has been turned into rows.

The reader is SheetJS Community Edition 0.20.3 (Apache-2.0), the core build, stored under `js/data/vendor/sheetjs/`. It is not loaded from the internet, and it is not loaded until an Excel file is picked. The smaller mini build does not read .xls files.
