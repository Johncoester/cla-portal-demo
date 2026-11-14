# Task Builder (automated workflows for title files)

**Requested by:** John Coester, Nov 13 2026 (chat with Claude, "Task Builder – Spec for Grok").
**Status:** TB-1 built by Claude (pull request open, not Live). See [ROADMAP.md](../../ROADMAP.md#task-builder).
**Replaces:** the "Workflow definitions" idea (PR 7, closed, never merged; roadmap PR 218). Builds on Task Templates ([PR 141](https://github.com/Johncoester/cla-portal-demo/pull/141)).

## What John asked for

A **Task Builder** page in the admin section where CLA builds automated workflows ("flows") for title files, without code. Each flow is an if-then flow, like a flowchart:

1. **Trigger** – what starts it. Starter list: order opened, contract received, EMD received, EMD not received after a set number of days, title commitment received, closing date set or changed, a set number of days before closing.
2. **Conditions** – which files it applies to, combined with and/or: sales rep, client (company or person), transaction type (purchase, cash, refinance), state. More fields later.
3. **Actions** – what happens, in order: create a task, send an email (from a template, sent as a chosen person such as the sales rep), create a phone-call task, wait a number of days, check a condition again (for example, is the EMD still not received?), then continue or stop.

The end goal is a drag-and-drop flowchart screen where "almost any task can be added or created". Build in stages: rules and actions first with a simple form, then the drag-and-drop screen on top.

### Settings on every task a flow creates

- **Assigned to:** usually a role on the file; the portal fills in the actual person. Main roles (John, Nov 13): processor, pre-processor, sales person, buyer's agent, listing agent, buyer, seller, transaction coordinator, lender. A specific named person (for example, always Janine) is also possible but less common.
- **Backup (optional):** an "Add backup person" option on any task. Left blank, the task has no backup (John, Nov 13).
- **Who can see it:** internal to CLA only, or also the agent, buyer, seller or lender in the portal.
- **Due date:** counted from the opened, contract or closing date, as in PR 141.

### Decisions so far (John, Nov 13)

- Task Builder is **its own admin menu item**, not under Task Templates.
- Only **Admins and Super admins** can open it and change flows.
- A task can be assigned by role **or** to a named person.
- Backup person is optional, added per task (Nov 13, 8:54 PM ET).

### Still to confirm with John

- Whether clients and agents can tick off tasks they can see, or only staff mark tasks done.
- Two or three real rules from Francis to test against.

## Example flow: EMD not received

- Trigger: order opened. Wait 2 days. Check: has the EMD been received?
- If no: email the buyer's agent a reminder (template, sent as the file's processor).
- Wait 1 more day. Check again. If still no: a call task for the file's processor, due today (backup only if one was added to that task).
- If the EMD is received at any point: stop.

## Build steps (one pull request each)

| Step | What |
|---|---|
| TB-1 | Task Builder admin page and permissions (Admin / Super admin), list of flows with name, what starts it, and an On / Off switch; history of changes |
| TB-2 | The flow engine: conditions and actions (create task, wait, check again) with a simple form; the EMD flow above working on TEST |
| TB-3 | Task settings: assigned to (role or named person), optional backup person, who can see it |
| TB-4 | Email actions with templates and "send as" |
| TB-5 | Drag-and-drop flowchart screen |

## TB-1 as built

- Admin menu item **Task Builder** (`#/task-builder`), shown and reachable only for active Admins and Super admins (Demo mode follows the persona). Anyone else gets "Not authorized". Section link `?section=task-builder`.
- The page lists flows: name and description, what starts it ("EMD not received, 2 days after the order was opened"), On / Off, last changed and by whom. **+ New flow** and **Edit** open a form: name (3–80 characters, unique, case and spacing ignored), what starts it, days (1–60, only for "EMD not received" and "Days before closing"), description (optional, up to 500). Mistakes show in the form in plain words and nothing typed is lost.
- New flows start **Off**. Turn on / Turn off switch them. Nothing is deleted.
- A **History** card lists who created, changed, turned on or turned off each flow, and what changed.
- A notice at the top says flows do not run on files yet.
- Database: `supabase/migrations/20261120010000_task_builder_flows.sql` adds `task_flows` (with an empty `steps` list for TB-2) and `task_flow_log`. Nobody reads or writes the tables directly; `list_task_flows`, `save_task_flow` and `set_task_flow_active` are Admin / Super admin only. Rollback in `supabase/rollbacks/`.

## TB-2 as built

- **Which files** (on the flow): transaction type (Purchase with a loan, Cash purchase with no loan, Refinance), state (MD, VA, DC, FL), sales person. A blank group means any; every filled group must match; any value inside a group matches. Checked when the flow first runs on a file, so people added after the order count.
- **Steps**, up to 20, in order: create a task (name, for whom, due in 0–60 days), create a phone call task (same, marked "Phone call."), wait 1–60 days, stop if the EMD has been received. Steps can be added, changed, moved up or down, and removed. A flow needs one task step before it can be turned on, and an On flow can't lose its last one.
- **Who gets a task:** everyone on the file with that role (processor, pre-processor, sales person, buyer's agent, listing agent, buyer, seller, transaction coordinator, lender). For the processor, pre-processor and TC, the person set on the order gets it when the party list has nobody in that role. Each task says which flow added it. Staff mark tasks done.
- **Runs:** one flow on one file. A flow starts once per file; "Closing date set or changed" can start again after its last run ended. Only open files run; a turned-off flow's runs wait. The page shows recent runs and a **Check files now** button.
- **Hosted:** a trigger on deals starts runs for order opened, EMD received (`emd_received` turned on) and closing date set or changed; a pg_cron job every 15 minutes starts the day-based triggers and moves runs on. Any engine problem is written to `task_flow_errors` and never stops an order from saving. Migration `20261121010000_task_flow_engine.sql`, rollback in `supabase/rollbacks/`.
- **Not yet:** "Contract received" and "Title commitment received" can't be turned on; named person, optional backup and who can see it (TB-3); emails (TB-4); drag and drop (TB-5).
