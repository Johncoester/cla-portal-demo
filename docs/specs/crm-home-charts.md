# Add dashboard charts to CRM Home

**Requested by:** Janine, the CRM user. CRM Feedback 31, item 1. She confirmed it on Nov 18 2026: "Add to Home for dashboard charts, with Refresh, rename, and Remove on Home."

**Tracker:** CRM Feedback 31 item 1.

**Status:** In progress. Pull request [359](https://github.com/Johncoester/cla-portal-demo/pull/359). Not merged. Not Live. A database file is included and has not been applied.

## What the user sees

On a CRM dashboard, each chart has **Add to Home**. That puts a copy on the signed-in person's CRM Home.

On Home, each added chart has **Refresh**, **Rename**, and **Remove**. The person can drag a chart by its title to change the order. There is no resize.

Rename and Remove change only the Home copy. The chart on the dashboard keeps its name, and Remove only takes it off Home.

Each person has their own Home charts. One person adding a chart does not put it on anyone else's Home.

Until the database file is applied on TEST, **Add to Home** is not shown.

## What is stored

A new table, `crm_home_charts`, one row per person per chart: the chart id, a name used only on Home (blank means "use the chart's name"), and the order. The portal did not already store that. List column preferences cannot hold it, because those rows are only for the lead, client, company, and deal lists.

Nothing in this change is applied to the database. The lead applies `supabase/migrations/20261125320000_crm_home_charts.sql` on TEST. The undo file is `supabase/rollbacks/20261125320000_crm_home_charts.sql`.

A person can read and change only their own rows.

## What this does not change

The dashboard chart itself: its name, its numbers setup, who can edit the dashboard, and delete (retire) on the dashboard.

Home's task list, today's leads, and amount by stage. Those load the same way as before. Home does not ask for charts in that same step. If this person has no charts on Home, Home does not ask again for the rest of that browser tab, and it does not load the chart numbers.

Resizing. Janine said it is not needed.
