# CRM record shortcuts

**Requested by:** Janine, CRM Feedback 28 item 3. Confirmed Nov 16 2026.

**Status:** In progress. Pull request [337](https://github.com/Johncoester/cla-portal-demo/pull/337). Not Live. No database file. See [ROADMAP.md](../../ROADMAP.md).

## What the user sees

On a Lead, Client, Deal, or Company record, a shortcut panel sits on the left. The shortcuts are Notes, Deals, Open Activities, Closed Activities, Emails, and Attachments.

A shortcut is shown only when that section is already on the record. Clicking it moves down the page to that section.

On a wide screen the panel stays in view while the record scrolls. On a narrow screen the shortcuts wrap across the top of the record instead of sitting in a side column.

## Which shortcuts each record shows

- **Lead:** Notes, Open Activities, Closed Activities, Emails, Attachments. A lead has no deals list, so Deals is not shown.
- **Client:** all six. Deals jumps to the orders already listed for that client. The card still says Orders in the portal.
- **Company:** all six. Deals jumps to the orders already listed for that company.
- **Deal:** Emails only. A deal record does not have its own Notes, Deals, activities, or Attachments sections.

The Leads, Clients, Companies, and Deals lists do not get this panel.

## What this does not change

The sections themselves are unchanged. Nothing new is loaded for the panel. No email is sent. No database file.
