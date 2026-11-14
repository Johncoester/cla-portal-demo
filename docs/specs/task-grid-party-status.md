# Task grid party status (MF-053)

**Requested by:** Matt Landsberg, Processor User-Task Grid notes, Nov 11 2026 (3:43 PM). Confirmed by email Nov 12 2026, 8:47 AM ET (Gmail 1a1d0042dac2d889). Tracker row MF-053.

**Status:** In progress. See [ROADMAP.md](../../ROADMAP.md).

## What Matt asked for

On the Processor Task Grid, keep File No, Property and Closing Date as they are. Add four columns: Buyer, Seller, Buyer's Agent and Listing Agent.

Each cell:

- A green check when every task for that party on the file is complete.
- A red X when any of that party's tasks is overdue. An overdue task wins even if the others are done.
- Nothing when that party has tasks that are still open and not overdue.
- Blank when that party is not on the file.

## How this build decides "on the file"

The grid already loads every buyer, seller and agent task in one read. It also loads, once for the whole grid, which of those four roles are saved on each file. It does not ask again for each row.

A party is on the file when they are saved on it, or when the file has a task for them that is not cancelled. Cancelled tasks are ignored. A party who is on the file but has no tasks yet gets an empty cell (nothing), not a green check. A party who is not on the file gets a blank cell.

## What stays

The task columns (one per task, grouped Buyer / Seller / Agent) stay to the right of the four party columns. Their checks, dates and dashes are unchanged.
