# Add dashboard charts to CRM Home

**Requested by:** Janine, the CRM user. CRM Feedback 31, item 1. She confirmed it on Nov 18 2026: "Add to Home for dashboard charts, with Refresh, rename, and Remove on Home."

**Tracker:** CRM Feedback 31 item 1.

**Status:** In progress. Pull request [359](https://github.com/Johncoester/cla-portal-demo/pull/359) added the charts. Reorder (F31b, row 414) landed in pull request [393](https://github.com/Johncoester/cla-portal-demo/pull/393). Janine's Nov 23 2026 retest failed with one chart. That fix is pull request [423](https://github.com/Johncoester/cla-portal-demo/pull/423). Not Live until it is checked on TEST. A database file is included and has not been applied.

## What the user sees

On a CRM dashboard, each chart has **Add to Home**. That puts a copy on the signed-in person's CRM Home.

On Home, each added chart has **Refresh**, **Rename**, and **Remove**. There is no resize.

The charts sit below the fixed Home sections: the task list, Today's Leads, and Amount by Stage.

The **...** button at the top right of CRM Home opens a small menu with **Reorder**. Reorder is offered only when Home has two or more charts. It shows **Move up** and **Move down** on each chart, and **Done**. That order is saved for the signed-in person and is still there after they leave Home and come back. Dragging a chart by its title can also change the order. It is not the only way.

The top chart's **Move up** and the bottom chart's **Move down** are greyed out. They do not move that chart. A second click while a save is still running waits, so the saves cannot land out of order.

When Home has one chart, Reorder is greyed out and the menu says: Add another chart to Home to reorder. There is only one. Removing charts until one is left closes Reorder and shows that same note. When Home has no charts, Reorder is greyed out and the menu says there is nothing to reorder.

Rename and Remove change only the Home copy. The chart on the dashboard keeps its name, and Remove only takes it off Home.

Each person has their own Home charts. One person adding a chart does not put it on anyone else's Home.

Until the database file is applied on TEST, **Add to Home** is not shown.

## What is stored

A table, `crm_home_charts`, one row per person per chart: the chart id, a name used only on Home (blank means "use the chart's name"), and the order (`position`). Reorder writes that same order. It does not add a table. List column preferences cannot hold it, because those rows are only for the lead, client, company, and deal lists.

Nothing in this change is applied to the database. The lead applies `supabase/migrations/20261125320000_crm_home_charts.sql` on TEST. The undo file is `supabase/rollbacks/20261125320000_crm_home_charts.sql`.

A person can read and change only their own rows.

## What this does not change

The dashboard chart itself: its name, its numbers setup, who can edit the dashboard, and delete (retire) on the dashboard.

Home's task list, today's leads, and amount by stage. Those load the same way as before. Home does not ask for charts in that same step. If this person has no charts on Home, Home does not ask again for the rest of that browser tab, and it does not load the chart numbers.

Resizing. Janine said it is not needed.
