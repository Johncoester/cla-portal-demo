# Task Builder (automated workflows for title files)

**Requested by:** John Coester, Nov 13 2026 (chat with Claude, "Task Builder – Spec for Grok").
**Status:** TB-1 Live on TEST (PR 261, Nov 14). TB-2 merged (PR 263), not Live. TB-2b pull request open. See [ROADMAP.md](../../ROADMAP.md#task-builder).
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
| TB-6 | Client requests: request an intake form from a party, completes itself, reminders, one email per person (John, Nov 20) |
| TB-7 | Email step (saved template or written message with merge fields) and the File closed trigger (John, Nov 20) |
| TB-10 | Part of TB-4: send an email step as a named staff member, with that person's signature (John, Nov 22) |
| TB-11 | "Task completed" trigger: a template starts when a chosen task is checked off (John, Nov 22) |
| TB-12 | The page calls them "automations", not "templates" (John, Nov 23) |

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

## TB-2b: Try on one file, and new files only (John, Nov 14 2026)

John: turning a flow on with a hundred open orders gives no safe way to test it. So:

- **Try on one file** (on any flow with a task step): pick one open file; the flow runs on it now, whether the flow is On or Off. Waits are skipped so every step shows at once; "Stop if the EMD has been received" still checks the file. Its tasks are real tasks on that file, marked "Test run", and the window links to the file's tasks. A test run never counts as, or blocks, the flow's real run on that file. A closed or missing file, or a flow with no task step, gets a plain message.
- **Turn on** asks which files: **New files only** (the default) = files opened after the flow was turned on; **Existing open files too** = also the open files already there. Turning it off and on again starts "from now" again. An "Order opened" flow only ever runs on new orders, so it asks nothing. The list shows the choice under On, and History records it.
- Flows already On before this change keep running on existing files.
- Migration `20261122010000_task_flow_try_and_scope.sql` (after TB-2's), rollback in `supabase/rollbacks/`.

## TB-6: Client requests (John, Nov 20 2026)

John: build Qualia-style client requests into Task Builder. Each request says who it goes to, which form, and when it is sent. It completes itself when the party answers. Reminders are a setting. **Each person gets ONE email listing everything still needed, not one email per request.** Built by Claude (John: "build it because Grok's too slow"); John waived rule 18 for this PR.

- **New step "Request a form from a party"**: **Form** (one of the portal's intake forms: Upload identification, Personal information, Title vesting, Lender information, Confirm HOA Information, Outstanding Mortgage Information, Home warranty, Commission information, Forwarding address, How you want your proceeds), **Send to** (buyer, seller, buyer's agent, listing agent, narrowed to who fills that form in), **Due in** 0–60 days, **Remind every** 0–14 days (0 = no reminders) and **Remind up to** 1–10 times. **When** it is sent is its place in the flow: right after what starts the flow, or after a wait or other steps.
- **The request is the party's own form task.** When the party already has an open copy of that form on the file (most do: forms are added when a party is added), the request uses it and keeps its due date; otherwise it adds a new copy of the current form version, due as the step says. A form the party already submitted is not asked again; a switched-off or retired form is not requested. The run history says why in each case. It completes itself when the party submits the form, the same as any form task.
- **One email per person and file.** When a flow requests forms, each person gets one email listing everything still needed from them on that file, soonest due first ("2 items still needed for MD-26-…"). Reminders work the same way: one email listing everything still open, not just the item that came due, and never two reminder emails to the same person on the same file within 20 hours. A form comes off the list as soon as it is submitted; reminders stop once the set number is used up.
- Emails are queued in the **outbox only**, from the file's processor, like every reminder today (nothing is sent automatically from TEST). Like every reminder, they go to people with a portal account. A party who has not accepted their portal invite yet keeps their request waiting, and it goes out in the first email after they have an account. The run history says so.
- **Try on one file** runs request steps too: it adds the form tasks (marked "Test run") but **emails nobody**.
- A flow can be turned on with only request steps. **Check files now** also says how many request emails it queued.
- **Hosted:** migration `20261126010000_task_flow_client_requests.sql` (after TB-2 and TB-2b's files) adds `task_flow_requests` (one row per requested task: reminder setting, emails sent, next reminder) and the email step; the 15-minute check sends the reminders that are due. Rollback in `supabase/rollbacks/` takes request steps out of saved flows and turns off any flow left with no task step. Tests: `test/test-client-requests.js` (rules, demo portal, editor) and `test/test-task-flow-requests-sql.sh` (database).
- **Not yet:** one email across several files for an agent on many orders (today it is one email per person per file, sent as that file's processor); a request for a document upload that is not an intake form; editing the email wording (TB-4).

## TB-7: Email step and File closed (John, Nov 20 2026)

John: flows should also send emails that are not chasing anything, for example a thank-you after closing: "file closed, two days after, send email", from a saved template or written on the step, with the buyer's first name and the property address filled in. It sends for real once the flow is on; there must be a way to test it first ("I'll test it and turn it on when I feel ready").

- **New step "Send an email"**: **Send to** (buyer, seller, buyer's agent, listing agent, transaction coordinator, lender) and **Email**: a saved shared template from Admin > Email Templates, or **Write my own** (subject up to 200 characters, message up to 5,000). Both use the file template merge fields, listed under the message: {{buyer_first_name}}, {{property_address}}, {{recipient_first_name}}, {{closing_date}}, {{processor_line}} and the rest. A field that is not on the list is caught when saving ("{{nickname}} is not a merge field"). Fields fill in from the file when the email goes; a blank one is left out ("Hi ," becomes "Hi there,").
- **Who gets it:** everyone on the file with that role who has an email address, portal account or not, each with their own copy ({{recipient_first_name}} is theirs). Nobody with that role, or no email address, is skipped and the run history says so. A template that was turned off sends nothing and the history says so.
- **New trigger "File closed"**: starts when the file's status becomes Closed (on the demo portal, also the last stage, funds disbursed). A File closed flow keeps running on its closed file through its waits; every other flow still stops when a file is no longer open. Turning it on asks nothing: it runs on any file that closes from now on, including files opened before it was turned on.
- **Sending:** emails are queued in the outbox from the file's processor, like every portal email, and go out once the portal's mail switch is on. Flows start Off, so nothing is queued for a client until an Admin turns the flow on.
- **Testing (John):** **Try on one file** fills in that file's real names and address but sends the email **only to the admin trying it**, with "[Test]" in the subject and a first line saying who the real email would go to. A File closed flow can be tried on an open or closed file.
- **Hosted:** migration `20261127010000_task_flow_email_step.sql` (after TB-6's): the email step and its merge fields in SQL, the File closed trigger (status on deals), `task_flow_runs.trial_to`, and outbox kind `task_flow_email` allowed for a party with no portal account (email and name needed). Rollback in `supabase/rollbacks/`. Tests: `test/test-flow-email.js` and `test/test-task-flow-email-sql.sh`.
- **Not yet:** HTML formatting in flow emails (a saved template is sent as plain text, the outbox carries text); attachments; an entity buyer or seller shows the person's name rather than the entity's; "Funds disbursed" as its own trigger (closing a file covers it today).


## TB-8: easier steps (John, Nov 21 2026, by voice)

- **Plain timing.** Every step shows one line saying when it happens, counted from what starts the flow and adding up the Wait steps before it: "2 days after the order opens: create this task, due 1 day later", "On the closing date: create this phone call task", "2 days after the file closes: send this email". The due boxes say "Due (days after it's created)" / "(days after it's sent)". The flow list shows the same lines.
- **Sales person = any staff member.** The "Which files" Sales person choice lists every active staff member, with a box to type a name. John: "I'm an admin but I also do sales… I will be a salesperson from the file level." It matches the sales people on the file. Open: Place Order and the file only offer Sales Person and Sales Team logins (Janine, Nov 18).
- **Email the agents who didn't refer the file.** A Send an email step can go to "Agents who didn't refer the file": the buyer's and listing agents on the file except the one in the file's Source of business (the referral field). If the source names an agent side but no person, that whole side counts as the referrer; any other source (buyer, lender, a lead source, blank) means every agent gets it. Example: Order opened → email the non-referring agents John's owner intro with {{recipient_first_name}}.
- Emails still send from the file's processor (as all flow emails do). Sending as a named person, such as John, is not built.
- Database: `20261128010000_task_flow_non_referring_agents.sql` (after TB-7's file); rollback in `supabase/rollbacks/`.

## TB-9: easier to build (John, Nov 21 2026, second voice pass)

John, trying TB-8 on TEST: "it's a little still confusing."
- **Templates, not flows.** "Name... should be called template name." The page says templates everywhere ("+ New template", "Template name", "Create template"); one template holds one step or up to 20. Saved email choices now read "Saved email: <name>" so they aren't mixed up with Task Builder templates. (Admin > Task Templates, PR 141, is a different page and keeps its name.)
- **Limit to certain files (optional).** "What happens if we need to create a task that's not a salesperson?" Which files sits behind a closed "Limit to certain files" link (open when the template already uses it). It says that it only picks which files run; who gets each task is set on the step.
- **A When box on each step.** "Where do I put in here when to send this email?" Each step has "When: [N] days after it starts" (0 = right away), with the plain sentence above it ("2 days after the order opens: email the buyer."). There is no Wait step to choose any more. Saving sorts the steps by day and puts Waits between days; opening a saved template turns its Waits back into days, so the engine, the database and older templates are unchanged. A new step starts on the same day as the one before it.
- **Insert field.** "Pretty difficult here to have to copy and paste that." Under the email's subject and message, an Insert field list in plain words ("Buyer first name", "Property address"...). Choosing one drops the {{field}} where the cursor is, in the message unless the subject was clicked last.
- No database change.

## TB-10: send as a staff member, with a signature (John, Nov 22 2026, by voice)

John: "Is there a way to add your signature line?... What about my signature?... Yeah, all right, let's do that." He wants owner intro emails to go out as him.
- **From.** Each email step has From: "The file's processor" (blank, the old behavior) or any active staff member. The email goes out under that person's name and address, and {{sender_name}} fills in with them. If that person is no longer active (or has no email) when the step runs, it goes from the processor and the run's history says why.
- **Add the sender's signature.** A tick box, on by default for new email steps. It adds the sender's signature under the message: their portal signature (Profile > Gmail card), else their CRM signature, else name / CLA Title & Escrow / email · phone. Steps saved before this have no signature unless it is ticked.
- **Try on one file** sends the test copy from that person, with the signature, so John can see exactly what goes out.
- **Wording.** The Insert field list says "Recipient's first name" and "Recipient's full name(s)" (no "from To").
- Database: 20261129010000_task_flow_send_as.sql (rollback in supabase/rollbacks). Emails still wait in the outbox like every portal email; nothing sends until the portal's mail switch is on. Not applied on TEST yet.

## TB-11: Task completed trigger (John, Nov 22 2026, by voice)

John: "Could Task Builder send an automatic email once a task is checked off?... let's create that ASAP for any task that we want to have." "If we received the EMD and we click EMD received, an automatic email should go out."
- **What starts it: Task completed**, then **Which task**: every standard task (Admin > Task Templates, latest active version), every task a Task Builder template creates, or **Another task (type its name)** for any task added by hand. A task added later shows up in the list by itself.
- A task key is `tpl:<code>` (a standard task, any version) or `title:<name>` (matched by name; case and spacing don't count).
- When the task becomes done on an open file, the template starts there (once per file, like the other triggers) and its first steps run straight away, so an email is queued as soon as the box is ticked. Unchecking and checking again does not start it twice. Test-run tasks never start anything. A problem in the template never stops the task from saving (it is written to task_flow_errors).
- Turning it on asks no "which files" question: it runs on any open file from now on.
- Database: 20261129020000_task_flow_task_completed.sql (task_flows.trigger_task and trigger_task_name, save_task_flow_v3, a trigger on tasks). The page uses save_task_flow_v3 only for this trigger, so other templates keep saving before the file is applied. Rollback in supabase/rollbacks (deletes Task completed templates). Not applied on TEST yet.
- Note: the file's own "EMD received" box already has its own trigger ("EMD received"), which can send the same email today once a template uses it.

## TB-12: automations, not templates (John, Nov 23 2026, by voice)

There were two things called "templates": Admin > Task Templates (the standard tasks and forms) and Task Builder's own. John: "Yeah, name it automations." Task Builder now says "+ New automation", "Automation name", "Automations", "Create automation", and its messages say automation. Saved email templates keep their name. The database's own messages still say "flow" (unchanged). No database change.

