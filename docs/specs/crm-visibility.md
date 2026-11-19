# Who can see and change a CRM record (CRM-VIS-1)

**Requested by:** Janine Santos, the CRM user, confirmed Nov 18 2026. Designed by the portal lead.

**Tracker:** CRM-VIS-1.

**Status:** In progress. The database file is in the pull request and has not been applied on TEST. Not Live.

## What the user sees

On a lead, client, company, pipeline opportunity, or activity (a note, task, call, or meeting):

- An Admin or a Super admin can open Edit and Archive, and can change the record.
- Anyone else can open the record and read it. Edit and Archive are greyed out unless they are the owner. The screen says "Only the owner or an admin can change this record."
- Mass update, change owner, create task, and the other bulk actions skip records that person does not own. The result says how many were skipped.

Archive is how a record leaves the working list. The database still does not erase the row.

## What is stored

The owner is the column already on the record: `owner_id` on leads, companies, pipeline opportunities, and activities, and `crm_owner_id` on clients. A new owner must still be an active person with **Can own CRM records** turned on. That check is unchanged.

Row security lets every CRM user read the CRM tables. An update is allowed only when the signed-in person is an admin, or the owner column is their login. The same check runs inside the database functions that write these records, because those functions do not use row security.

On clients, the extra policies apply only when `crm_stage` is set. That is the mark the CRM already uses: creating a client sets a stage, and the database comment says a row with a CRM stage is a CRM client. A person on a file has no stage, so these policies do not open that row. Staff logins are left out by one list of profile ids for the whole query.

Portal orders stay on `public.deals`. Those policies are not changed. The CRM Deals tab is that shared order list.

## What this does not change

Who can open the CRM. Who can be picked as an owner. Portal contact edits on a file by a processor. The Deals tab policies.
