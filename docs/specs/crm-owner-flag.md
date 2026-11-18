# Who can own a CRM record (CRM-OWNER-1)

**Requested by:** John Coester, Nov 15 2026, 3:11 PM ET. Confirmed Nov 16 2026, 10:55 AM ET.

**Tracker:** Requests tab, row 315, CRM-OWNER-1.

**Status:** In progress. Pull request [306](https://github.com/Johncoester/cla-portal-demo/pull/306) added the tick. The column and the guard are on TEST. Saving the tick needs the grant in "Saving the tick" below. Not Live.

## What the user sees

On Admin, then User List, then Edit user, there is a checkbox labeled **Can own CRM records**.

It starts off for every person, including Admins and Super admins. An Admin or a Super admin can turn it on or off. Anyone else sees it and cannot change it.

A person who is ticked shows up in every CRM owner list, whatever their role. That is the owner on a lead, a client, a company, and a deal, the Change owner action, and the Owner column when a spreadsheet is imported (including the default owner).

Someone who is not ticked does not appear in those lists. A record that already names them still shows their name.

Who can open the CRM does not change. Role access stays as it is.

## What is stored

`profiles.can_own_crm` is false unless an Admin or Super admin sets it. The database file does not turn anyone on.

Only an Admin or Super admin can change the column. A database function checks the role and writes the activity log: who changed it, which user, the old value, the new value, and when.

The signed-in role must also be allowed to update that column. Profiles grants update one column at a time. The grant file gives `authenticated` update on `can_own_crm` only. The guard function is unchanged.

## Saving the tick (CRM-OWNER-1b)

**Requested by:** Janine Santos, by email to John, Nov 18 2026, 9:36 AM ET, with a screenshot.

**Tracker:** CRM-OWNER-1b.

On Admin, then User List, then Edit user, ticking **Can own CRM records** and saving showed "This was not saved: your login is not allowed to change this." Janine is an active Super admin.

The column and the guard were already on TEST. The signed-in role could read the column and could not update it, so the database refused the save before the guard ran.

The grant file is `supabase/migrations/20261125210000_crm_owner_flag_grant.sql`. It is not applied on TEST by the pull request. Not Live until someone applies it and a Super admin saves a tick, reloads, and sees it still ticked.

The shell cache stamp is 202611245200.

## What this does not change

Opening the CRM, role access, and the name already stored on a lead, client, company, or deal.
