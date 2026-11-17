# Task grid party status (MF-053)

**Requested by:** Matt Landsberg, Processor User-Task Grid notes, Nov 11 2026 (3:43 PM). Gmail message 1a1cc5d934e36305. Confirmed by email Nov 12 2026, 8:47 AM ET (Gmail 1a1d0042dac2d889). Confirmed again Nov 16 2026, 10:45 AM ET as FF-086 item 1 (Gmail 1a1e5097c877c077). Tracker row MF-053.

**Status:** In progress. See [ROADMAP.md](../../ROADMAP.md).

## What Matt asked for

On the Processor Task Grid, keep File No, Property and Closing Date as they are. Show four party columns, in this order: Buyer, Seller, Buyer's Agent and Listing Agent. Drop the individual task columns that used to sit to the right, so those seven columns are the whole grid.

Each cell:

- A green check when every task for that party on the file is complete.
- A red X when any of that party's tasks is overdue (past its due date and not completed). An overdue task wins even if the others are done.
- Nothing when that party has tasks that are still open and not overdue.
- Blank when that party is not on the file.

Matt has not restated the exact column list since Nov 12. The order above is the order he confirmed that day. It should be confirmed with him again.

## How this build decides "on the file"

The grid already loads every buyer, seller and agent task in one read. It also loads, once for the whole grid, which of those four roles are saved on each file. It does not ask again for each row.

A party is on the file when they are saved on it, or when the file has a task for them that is not cancelled. Cancelled tasks are ignored. A party who is on the file but has no tasks yet gets an empty cell (nothing), not a green check. A party who is not on the file gets a blank cell.

## Where a later change plugs in

`partyTaskMark` in `js/data/task-grid-parties.js` is the only place that decides a green check, a red X, or nothing. MF-057 (a separate change) will make a task shared by more than one buyer, or more than one seller, count as done only when every one of them has finished. That change edits `taskCopiesDone` inside the same helper. This grid already treats a shared task as done only when every copy is done.

## What is not on the grid

The individual task columns (one per task) are not shown. File tasks are still opened from the file number.
