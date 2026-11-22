# CRM record shortcuts

**Requested by:** Janine, CRM Feedback 28 item 3. Confirmed Nov 16 2026. Order updated by Janine on Nov 18 2026, 5:23 PM ET. Feedback 36 (Janine, Nov 20 2026, 12:40 PM ET) moved the module links off this panel and onto the CRM top tabs. Tracker row F36, row 416.

**Status:** In progress. The first panel was pull request [337](https://github.com/Johncoester/cla-portal-demo/pull/337), merged as 3212c332. The order change is pull request [360](https://github.com/Johncoester/cla-portal-demo/pull/360). Call on a deal opened the Calls list in pull request [368](https://github.com/Johncoester/cla-portal-demo/pull/368). Feedback 36 moves the modules to the top tabs. Not Live. No database file. See [ROADMAP.md](../../ROADMAP.md) and [crm-module-tabs.md](crm-module-tabs.md).

## What the user sees

On a Lead, Client, Deal, or Company record, a shortcut panel sits on the left.

The panel lists only that record's own shortcuts, and only when the section is already on the page. The order is Notes, Deals, Open Activities, Closed Activities, Emails, Attachments.

A click moves down the page to that section. Nothing new is loaded.

Attachments is the only shortcut with a count. The number is the files already shown on the record. An empty list shows no number. More than 10 shows 10+. Notes, Deals, and the activity shortcuts do not show a number.

On a wide screen the panel stays in view while the record scrolls. On a narrow screen the shortcuts wrap across the top of the record instead of sitting in a side column.

## Which shortcuts each record shows

- **Lead:** Notes, Open Activities, Closed Activities, Emails, and Attachments. A lead has no orders list on the page, so Deals is not on the panel.
- **Client:** Notes, then Deals (the orders already listed for that client), then Open Activities, Closed Activities, Emails, and Attachments. The orders card still says Orders in the portal.
- **Company:** The same list as a client. Deals moves to the orders already listed. The clients at that company stay on the page. They are not a left-panel shortcut.
- **Deal:** Emails only. A deal has no Notes, orders list, activities, or Attachments section, so those stay off the panel.

The Leads, Clients, Companies, and Deals lists do not get this panel.

Clients, Leads, Companies, Deals, Tasks, Meetings, and Calls are top tabs, not shortcuts on the record. See [crm-module-tabs.md](crm-module-tabs.md).

## What this does not change

The sections themselves are unchanged. Nothing new is loaded for the panel. No email is sent. No database file. No counts are added except the Attachments count.
