# CRM record shortcuts

**Requested by:** Janine, CRM Feedback 28 item 3. Confirmed Nov 16 2026. Order updated by Janine on Nov 18 2026, 5:23 PM ET (reply on the Nov 18 portal update, item 5).

**Status:** In progress. The first panel was pull request [337](https://github.com/Johncoester/cla-portal-demo/pull/337), merged as 3212c332. The order change is pull request [360](https://github.com/Johncoester/cla-portal-demo/pull/360). Not Live. No database file. See [ROADMAP.md](../../ROADMAP.md).

## What the user sees

On a Lead, Client, Deal, or Company record, a shortcut panel sits on the left.

The first six shortcuts are always, in this order: Clients, Leads, Deals, Task, Meeting, Call.

If that record already has a section for the module, the shortcut moves down the page to it. If it does not, the shortcut opens that module's list. Nothing new is loaded, and no new rows are added to the record.

After those six, the older shortcuts stay in their previous order, and only when that section is already on the record: Notes, Open Activities, Closed Activities, Emails, Attachments.

On a wide screen the panel stays in view while the record scrolls. On a narrow screen the shortcuts wrap across the top of the record instead of sitting in a side column.

## Which shortcuts each record shows

- **Lead:** Clients, Leads, and Deals open their lists. Task, Meeting, and Call move to Open Tasks, Open Meetings, and Open Calls already on the lead. Then Notes, Open Activities, Closed Activities, Emails, and Attachments.
- **Client:** Clients and Leads open their lists. Deals moves to the orders already listed for that client. Task, Meeting, and Call move to the open columns on the page. Then the same five older shortcuts. The orders card still says Orders in the portal.
- **Company:** Clients moves to "Clients at {company}". Leads opens the Leads list. Deals moves to the orders already listed. Task, Meeting, and Call move to the open columns. Then the same five older shortcuts.
- **Deal:** Clients, Leads, and Deals open their lists. Task opens CRM Home, where My Open Tasks is listed. Meeting opens the Meetings address and Call opens the Calls address. Then Emails. A deal has no Notes, activities, or Attachments section, so those stay off the panel.

The Leads, Clients, Companies, and Deals lists do not get this panel.

## What this does not change

The sections themselves are unchanged. Nothing new is loaded for the panel. No email is sent. No database file.

There is no Meetings list page. On a Deal, Meeting opens an address the portal does not have yet, so it says that page does not exist. Calls in the menu is a separate change. Until that list is on TEST, Call on a Deal does the same.
