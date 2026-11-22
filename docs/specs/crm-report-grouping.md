# CRM report grouping without fiscal buckets

**Requested by:** Janine Santos, "We can remove fiscal for now."

**Tracker:** No tracker row is stored in this repo for this note.

**Status:** In progress. Pull request: https://github.com/Johncoester/cla-portal-demo/pull/333. Not Live until this is merged and someone checks it on TEST. No database file.

## What the user sees

On a CRM report, Date grouping offers By Day, By Calendar Week, By Month, By Quarter, and By Year.

On a CRM chart, the date grouping list is the same.

By Fiscal Week, By Fiscal Quarter, and By Fiscal Year are gone.

A report or chart that was saved with one of those still opens. Fiscal week loads as calendar week, fiscal quarter as quarter, and fiscal year as year. Nothing fails, and the groups match the calendar choice.

On a date filter, Previous FY, Current FY, and Next FY now read Previous Year, Current Year, and Next Year. The dates are still 1 January through 31 December. A saved filter or view that still has the old FY choice opens on the renamed year choice and does not show an error.

## What this does not change

This Year stays on the date list. It is the same January-through-December range as Current Year.

Maryland property-tax year text in the closing-cost calculator. That is not a CRM screen.
