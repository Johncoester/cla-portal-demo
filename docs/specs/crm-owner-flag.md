# Who can own a CRM record (CRM-OWNER-1)

**Requested by:** John Coester, Nov 15 2026, 3:11 PM ET. Confirmed Nov 16 2026, 10:55 AM ET.

**Tracker:** Requests tab, row 315, CRM-OWNER-1.

**Status:** In progress. Not applied on TEST. Not Live.

## What the user sees

On Admin, then User List, then Edit user, there is a checkbox labeled **Can own CRM records**.

It starts off for every person, including Admins and Super admins. An Admin or a Super admin can turn it on or off. Anyone else sees it and cannot change it.

A person who is ticked shows up in every CRM owner list, whatever their role. That is the owner on a lead, a client, a company, and a deal, the Change owner action, and the Owner column when a spreadsheet is imported (including the default owner).

Someone who is not ticked does not appear in those lists. A record that already names them still shows their name.

Who can open the CRM does not change. Role access stays as it is.

## What is stored

`profiles.can_own_crm` is false unless an Admin or Super admin sets it. The database file does not turn anyone on.

Only an Admin or Super admin can change the column. A database function checks the role and writes the activity log: who changed it, which user, the old value, the new value, and when.

## What this does not change

Opening the CRM, role access, and the name already stored on a lead, client, company, or deal.
