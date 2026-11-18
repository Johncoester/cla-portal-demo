# CRM Home My Tasks

**Requested by:** Janine, CRM Feedback 29 item 4. Confirmed Nov 16 2026.

**Tracker:** CRM Feedback 29 item 4.

**Status:** In progress. Not merged. Not Live. No database file.

## What the user sees

On CRM Home, the task list (Open, Overdue, Closed, Today + Overdue, and every other choice in that menu) shows only tasks assigned to the person who is signed in.

An admin sees only their own tasks here too. A separate Tasks, Meetings, or Calls module for admins is not part of this change.

Dashboards and reports that list tasks are unchanged. Opening one task by its link is unchanged.

## What is stored

Nothing new. The task's assignee is still the owner already stored on the task. The Home list asks the database for that person only, using the owner column that is already indexed. It does not load every task and then hide the others in the browser.

## What this does not change

Who can open the CRM. Who can own a lead, client, company, or deal. Task, deal, and profile access rules. The file-page task list. Reminders still show only for the signed-in person, from the same Home list.
