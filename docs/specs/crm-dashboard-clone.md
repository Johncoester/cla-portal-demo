# Clone a CRM dashboard copies its charts

**Requested by:** Janine, the CRM user, confirmed Nov 18 2026. CRM Feedback 31, item 2. She said: "Clone should copy the charts."

**Tracker:** Feedback 31 item 2. No separate tracker id is stored in this repo.

**Status:** In progress. Pull request: [PR 357](https://github.com/Johncoester/cla-portal-demo/pull/357). Not Live until this is merged and someone checks it on TEST. No database file.

## What the user sees

On a CRM dashboard, the title menu still has Clone. The suggested name is the current name plus " (copy)", for example "Lead dashboard (copy)".

The new dashboard opens with the same charts. Each chart keeps its name, type, module, measure, grouping, filters, width, height, and place in the order.

The original dashboard is unchanged. A chart that was retired (hidden) is not on the copy. The copy is Only me.

A blank name is refused. Nothing is saved, and the message says "Dashboard Name is required."

## What this does not change

Editing one chart, moving a chart, or cloning a single chart on the same dashboard. Reports. Who can see the original dashboard. Sharing on the copy starts as Only me.
