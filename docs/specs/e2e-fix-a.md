# Buyer agent walkthrough matches My Tasks (E2E-FIX-A)

Source: John Coester, Nov 19 2026. Tracker row E2E-FIX-A. No video. The failing check is Actions run 44513431332 (failing since run 44452846353).

## What was asked

The walkthrough still expected a Client-Buyer task row on the buyer agent's Tasks page, and a block on completing that client's work. Since FF-101a (PR 355, merge 8b2ce856) that page is My Tasks and lists only the agent's own tasks. Completing a client task from the agent login is out of scope. Rewrite that one check. Do not change the portal, and do not change the other walkthrough checks.

## What it does

Signed in as the buyer agent, opening `#/deals/:id/tasks` must show My Tasks, the Buyer's Agent tasks list, and only that agent's own rows. It must not show a Client-Buyer row, a Client-Seller row, a "Fill in for client" link, or a Complete control for the client's work. The used-invite check in the same file is unchanged.

## Why the test changed

The old check was written when a buyer agent could see the client's tasks and was stopped from marking them complete. FF-101a changed that on purpose: the agent no longer sees those client tasks. The walkthrough was still looking for a Client-Buyer row, so it failed even though the page was doing what Francis asked and John confirmed. The check now matches that behavior. It was not loosened to hide a bug.

## What is not in this change

No screen change on testportal.clatitle.com. No database file. No cache stamp. The other failures in run 44513431332 (used invite, agent fees, file email, Place Order) are not part of this change.
