# CRM owner lists include active Sales Person users (F35)

**Requested by:** Janine Santos, Nov 19 2026, Feedback 35 video. Confirmed Nov 20 2026, 12:40 PM ET ("yes, that's it").

**Tracker:** F35, row 415.

**Status:** In progress. Not Live. The database file is not applied on TEST by the pull request.

## What the user sees

On every CRM owner dropdown and owner filter, the choices are:

- Unassigned
- every active user who already has **Can own CRM records** turned on (John, and anyone else an admin has ticked)
- every active user whose role is Sales Person

A disabled or removed person is not listed. Sales Team is not added just because of that role. An admin or super admin who is not ticked, and is not a Sales Person, stays off the list.

The same names are on Lead Owner, Client Owner, Company Owner, and Deal Owner: the list filters, the custom-view filters that use that owner list, Change owner, and the Add and Edit forms.

A salesperson can still change only a record they own. On someone else's record, Edit stays unavailable and the page still says "Only the owner or an admin can change this record." A salesperson can still assign a record only to themselves.

## What is stored

Nothing new is stored. The tick on User List is unchanged. The owner already saved on a record is unchanged.

The list is `private.rpc_crm_owners`. The screen calls `public.crm_owners`, which on TEST calls that private list. Saving an owner uses `private.crm_owner_check`. The Deal Owner filter uses the same people.

The database file is `supabase/migrations/20261127020000_crm_sales_person_owners.sql`. The rollback is `supabase/rollbacks/20261127020000_crm_sales_person_owners.sql`. It is not applied on TEST by the pull request.

## What this does not change

Who can open the CRM. Who can edit a record they do not own. The assign-to-self rule for a Sales Person. The tick. Spreadsheet import, which still matches an owner by the tick. Zoho sync.

The shell cache stamp is 202611281300.
