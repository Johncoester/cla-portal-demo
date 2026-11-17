# Page load retry (LOAD-RETRY-1)

**Requested by:** John Coester, Nov 17 2026, from the walkthrough runs on main: 44105290718, 44111742709, and 44117024772.

**Tracker:** LOAD-RETRY-1.

**Status:** In review. Not Live until this is merged and someone checks it on TEST. No database file.

## What went wrong

Opening a page loads its JavaScript in pieces. GitHub Pages sometimes answers 503 for one of those files. The files seen failing were Scheduling, the document list, processor assignment, and CRM templates.

The page had already shown "Loading this page." The failed piece rejected the load, and nothing replaced that line, so the page sat there.

The same thing can happen to a person using the portal, not only the walkthrough.

## What the user sees

If the file arrives on a second or third try, the page opens as usual. The wait is short.

If it still does not arrive, "Loading this page." is replaced with "This page didn't load. Check your connection and try again." and a Reload button. The loading line does not stay up.

The screen does not show a code or a file name.

## What this does not change

Which page opens. Who can open it. The words on a page that did load. No database file.
