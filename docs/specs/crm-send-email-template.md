# CRM Send Email keeps the record's module and the Cc

**Requested by:** Janine Santos, on the TEST portal, Nov 24 2026, 6:06 PM ET. Tracker JN-CRM-CC-1 (row 470). She opened a Client, clicked Send Email, and Insert Template said: "Email templates belong to Leads, Clients, Companies or Opportunities; there are no report templates yet." She was checking that a Cc added on that window is still there after Send, in the record's email history.

**Status:** In progress. Not Live until this is merged and someone checks it on TEST. No database file. See [ROADMAP.md](../../ROADMAP.md).

## What the user sees

On a Client, Lead, or Company, Send Email → Insert Template opens the templates for that module. The subject fills from the template. Send still does not send anything: the email is saved as Drafted (not sent). A Cc (and a Bcc) typed in that window is stored with the email and shown on the record's Emails list. Opening the email shows the Cc again.

A Deal still has no email templates. The message names Deal, not a report. A report still says there are no report templates.

## What this does not change

Nothing is emailed. Gmail is not connected. An Opportunity still cannot store its own Send Email draft; that row only allows a lead, client, company, or deal. The pipeline's Email button is a different window and already asked for Opportunity templates. No database change.
