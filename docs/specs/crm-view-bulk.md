# Checkboxes and mass actions on a custom view

**Requested by:** Janine Santos, Feedback 37 video. Confirmed Nov 20, 2026, 12:40 PM ET: "yes, that's it".

**Tracker:** F37, row 417.

**Status:** In progress. Not Live until this is merged and someone checks it on TEST. No database file.

## What the user sees

On a saved custom view for Leads, Clients, Companies, or Deals, each row has the same checkbox as that module's All list. The header checkbox selects every row on the page. A second click clears them.

The selection bar is the same bar as the All list: Update a field, Email (draft only), Change owner (Change salesperson on Deals), Create task, and Clear. Nothing is deleted and nothing is sent.

When the page does not hold every row in the view, selecting the page offers Select all matching. That selects every row in the view, including the search typed on that view. Clear selection puts the checkboxes back.

A salesperson can change a record they own. A record they do not own is skipped. The result says how many were saved and how many were skipped.

Choose Columns is unchanged. The checkbox is not in Available or Selected, and it cannot be dragged. The saved column order still shows, with the checkbox sitting in front of those columns.

All Leads, All Clients, All Companies, and All Deals keep the checkboxes and mass actions they already had.

## What this does not change

Who can open a record. Sharing, criteria, and sort on the view. The fields Update a field offers (on Deals that is still Notes, the same as All Deals). Change owner and Create task still apply to the rows ticked on this page, the same as the All list. Reports. No new database file.

## How Select all matching stays on this view

The view already decides which rows match its criteria. Select all matching sends those rows, and only those rows, through the same mass update and mass email the All list uses. The All list's match function does not understand a view's criteria, so the ids of the view's rows are sent instead, one page at a time. A client outside the view is not included.
