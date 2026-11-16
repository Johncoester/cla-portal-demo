# Party task completion (MF-057)

**Requested by:** Matt Landsberg, Gemini notes "Portal Feedback Nov 16", FF-086 item 2. Confirmed "Yes" on Nov 16 2026, 10:45 AM ET. Tracker row MF-057.

**Status:** In progress. See [ROADMAP.md](../../ROADMAP.md).

## What Matt asked for

When a file has two or more buyers, or two or more sellers, a party task counts as complete only after every buyer (or every seller) on that side has completed it. Until then it stays open for staff views, the task list, the Task Grid and dashboard counts.

Show partial progress on the task, and list who still needs to finish. Each buyer or seller still sees and completes their own copy. A file with one buyer or one seller behaves exactly as it does today.

## How tasks are assigned today

Adding a buyer or seller creates a separate copy of each task for that person. The copy records that person (`participant_id`) and their login (`owner_profile_id`). Marking a copy done changes only that copy. It does not mark the other person's copy done.

## What this build does

The completion rule is in `js/data/party-task-completion.js`. The Task Grid party columns (MF-053) can call the same helper.

- Two or more people on the buyer side, or on the seller side, must each finish their own copy before that task counts as done for staff.
- The task shows "1 of 2 done" (or N of M) and the names of who still need to finish. If a name is missing, it says how many buyers or sellers still need to finish.
- Staff views, the task list, the Task Grid and the dashboard file counts keep the task open until then. A copy someone has already finished still counts as open in those counts, and it is not counted as overdue.
- One person on the side, a cancelled copy, an agent task and a staff task are unchanged.
- The person who finished still sees their own copy as done. They do not see the other person's answers.

## Database

`supabase/migrations/20261124100000_party_task_completion.sql` changes `dashboard_file_task_counts` so the dashboard file numbers use the same rule. Nothing is stored on the task row. The rollback puts the previous count back. This file is not applied on TEST by the pull request.

## Still to confirm with Matt

Showing "N of M done" and the names of who still need to finish, on staff screens only, is the default chosen for the open question. A buyer or seller does not see the other person's progress on their own task.
