# Custom view name column can move

**Requested by:** Janine, Feedback 30 item 2. Confirmed before this change.

**Tracker:** Feedback 30 item 2. No separate tracker id is stored in this repo.

**Status:** In progress. Not Live until this is merged and someone checks it on TEST. No database file.

## What the user sees

On New Custom View and Edit view, under Choose Columns, the record name stays in the Selected list. That is Lead Name, Client Name, Company Name, or Deal Name.

It is no longer stuck at the top. Drag the row, the same way Manage columns works on the All list. Client Owner, or any other selected column, can sit first. Arrow keys on the focused row move it one place.

The name cannot be removed. It does not appear under Available.

The list for that view shows columns in the saved order. The name still opens the record, in whatever column it sits in.

This is the same on Leads, Clients, Companies, and Deals.

## Older saved views

A view that already stored the name in a position keeps that position.

A view whose saved columns never include the name still shows the name first. Saving it again writes that position.

## What this does not change

The ordinary list's own Manage columns. Reports. Who can open a record. Sharing, criteria, and sort.
