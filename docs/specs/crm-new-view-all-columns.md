# New custom view starts with the All list columns

**Requested by:** Janine Santos, Feedback 30 follow-up item 2. Confirmed by email Nov 19, 2026, 6:30 PM ET: "Yes".

**Tracker:** Feedback 30 follow-up item 2. No separate tracker id is stored in this repo.

**Status:** In progress. Not Live until this is merged and someone checks it on TEST. No database file.

## What the user sees

On Leads, Clients, Companies, and Deals, New Custom View opens with Choose Columns already filled in.

The selected columns, and their order, are the same columns the All list is using: All Leads, All Clients, All Companies, or All Deals.

If that person has chosen their own columns on the All list, the new view starts from that choice. If they have not, it starts from the columns the All list shows before anyone changes them.

They can still add a column, remove one, or move one up or down, and then save.

Edit on a view that is already saved still shows that view's own columns. Saving it again does not replace them with the All list.

The record name stays selected. If the All list already has the name in a chosen spot, the new view keeps that spot. If the All list is not showing the name, the new view puts the name first. The name still cannot be removed, and it still opens the record.

## How the columns are chosen

The All list and New Custom View use one column list.

All Leads, All Clients, and All Companies start with the first columns of that list, up to ten. A hidden built-in field is left out, the same way the list leaves it out.

All Deals starts with the deal columns that are not hidden. An older choice that only hid columns is still used when this login has not saved a column order.

A column order saved on the login replaces that starting list. The browser's own copy is used when the login has no order, or when that read fails.

The All list calls the owner column ownerName and the Companies city column place. A view stores ownerId and city, which are the same columns on the form. A list column the view cannot store, such as Source on Deals, is not selected.

## What this does not change

Manage columns on the All list. A view that is already saved. Who can see a record. Sharing, criteria, and sort. Reports.

A column change on the All list that has not been saved to the login yet is not copied into a new view opened in that same moment. After the columns have saved, a new view uses them.
