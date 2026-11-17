# CRM import phone and website checks (CRM-IMPORT-PHONE-WEB)

**Requested by:** John Coester, confirmed Nov 17 2026, as CRM import fix 3 of 5.

**Status:** In review. Not Live. No database change. See [ROADMAP.md](../../ROADMAP.md).

## What the user sees

On Import Leads and Import Clients, Preview checks each row before anything is saved.

Phone and Mobile must be a 10-digit number, shown like 301-555-0101. A number with 11 digits that starts with 1 is accepted and stored as those 10 digits. A blank phone or mobile is left blank. Anything else is an error on that row, in plain words, and that row is not imported. The error CSV lists the same reason.

A web address with no http:// or https:// (Website, Zillow, LinkedIn, Facebook, Instagram, and the other link columns) gets https:// in front when the address is a real site, such as harbor.example.test. The preview says the address it will save. An address that is still not a web address is an error on that row, in plain words. The raw database check is not shown.

Rows that pass are imported as before. Rows with an error are skipped.

## What this does not change

Import Notes is unchanged. Companies still have no import screen. No database file is added or edited. The lead form's own phone and website rules are unchanged.
