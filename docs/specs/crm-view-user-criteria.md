# CRM custom view user criteria

**Requested by:** Janine, Feedback 30 item 1. Confirmed before this build.

**Tracker:** Feedback 30 item 1.

**Status:** In progress. Not merged. Not Live. No database file.

## What the user sees

On Leads, Clients, Companies, and Deals, open **New Custom View** and **Specify Criteria**. Pick a field whose value is a person: Created By, Modified By, Last Activity By, or the owner (Lead Owner, Client Owner, Company Owner, Deal Owner), or any other user field.

The value list shows every CRM user the **Share this with > Selected users** list uses: super admins, admins, and sales reps (and the other CRM staff that list already includes). A super admin such as Janine is in the list. It is not limited to sales reps.

The choice is saved as that person's id, the same way a view already stores a user. Running the view keeps the records whose created-by, modified-by, owner, or last-activity person is that id.

Deals do not have a Modified By field. A deal has no modified-by person stored on the file.

## What is stored

Nothing new in the database. A criterion is still `{ field, op, value }` and `value` is the user id. Existing saved views keep working.

## What this does not change

Who can own a CRM record. Owner pickers on the record forms still use the owner tick. Sharing a view still leaves out the person who is signed in. Reports and dashboards are unchanged.
