# TC-ONLY-1: "Only communicate with TC" on a file's agent

**Asked by:** John Coester, phone call and chat, Nov 22 2026, 3:12-4:09 PM ET ("Ok" to build at 4:09 PM).
John: "maybe we can have a box saying only communicate with TC ... in the file ... any email that goes out to the realtor will
automatically go to the TC that's assigned to them."

## What it does
- Each buyer's agent and listing agent on a file has its own **Only communicate with TC** box (`deal_participants.tc_only`).
  The two sides are set separately.
- When the box is ticked, every email and portal alert meant for that agent on that file goes to **their TC** instead:
  the "Buyer Agent TC" / "Listing Agent TC" on the same side of the file who is linked to that agent (agent_tc_links).
  If several TCs are linked, each gets it. The greeting ("Hi Pat,") uses the TC's first name.
- **No TC on that side:** nothing goes to the agent. A queued email is held in the outbox (`send_blocked` says why), an alert
  is dropped, and the file's processor gets a portal alert (at most one per reason per hour) pointing to Contacts.
  A typed email is refused with a plain message, and nothing is sent.
- A TC-only agent on Cc or Bcc of a queued email is swapped for their TC, or dropped when they have none (logged, and the processor
  is alerted, the same as on To).
- Every swap and every hold is written to `public.comm_redirect_log` (readable by Admins and CLA staff on the file).
- Only CLA staff on the file (processor, pre-processor, CLA TC, Admin) can tick it, and only when a TC is linked on that side.

## Where it is enforced (one place)
`private.resolve_recipients(deal, profile, email)` decides. It is called by:
- a guard on `public.outbox` (every queued email: Task Builder emails and form-request digests, task reminders, title commitment,
  portal invites, agent fee notices, scheduling, post-closing, and anything added later),
- a guard on `public.notifications` (every portal alert: new tasks, documents, messages, closing updates, fees),
- `public.comm_route_emails`, which gmail-send calls before every typed email and "Email sellers and agents" send.

Task Builder's "Transaction coordinator" email choice now also reaches the agents' TCs (it used to match only CLA's staff TC role).

## Limits (by design)
- The guards check emails and alerts when they are **queued** (INSERT), on a file (`deal_id` set). Emails queued before the box
  was ticked, rows re-addressed later by an UPDATE, and agent emails with no file are not re-checked.
- Nothing delivers the outbox yet. Whatever sender comes later must skip rows with `send_blocked` set.
- Staff who add a participant row directly could set `tc_only` without the "TC must be linked" check; it still fails closed
  (held, never sent to the agent).
- `comm_redirect_log` has no `demo_scope` policy (demo viewers are not managers, so they cannot read it), and its `deal_id`
  has no `on delete`, so a file with log rows cannot be hard-deleted until they are removed.

## Defaults until the team answers (questions emailed Nov 22 to Matt, Francis and Janine)
1. In-app alerts are swapped too, not only emails.
2. The agent stays in existing message threads and document shares; only the alert goes to the TC.
3. Fee-change and title-commitment notices also go to the TC (the agent is not copied).
4. Only CLA staff can tick the box.
5. Typed emails are covered: the agent's address is swapped for the TC's before Gmail sends it.
6. Merge fields / greeting use the TC's name when an email is swapped.

## TC-ONLY-2: the screens (no database file)
- **Order Contacts:** each buyer's agent / listing agent row has an **Only communicate with TC** box, read with `tc_only_status` and set
  with `set_participant_tc_only`. Only CLA staff see it. The processor, pre-processor, CLA TC and Admins can change it; other staff see it greyed out.
  It is disabled until a TC is linked on that side. The line under it names the TC who gets the emails, or says what to add first.
  A box already ticked can always be unticked.
- **Compose (File > Email):** when a TC-only agent is in To, Cc or Bcc, a note says the email goes to their TC instead, or that it can't be
  sent to them because no TC is linked.
- **Email sellers and agents:** the preview for a TC-only agent says the email goes to their TC instead, or is held.
- Code: `js/data/tc-only.js` (the rules for the box and notes), `js/data/supabase-tc-only.js`, `js/data/mock-part-tc-only.js`,
  `js/pages/dealcontacts.js`, `js/pages/dealemail.js`, `js/pages/deal.js`. Test: `test/test-tc-only-ui.js` (every role on the demo portal).

## Not done yet
- Task Builder pages do not show the "goes to the TC" note. Their emails are still routed by the database.
- Invites the staff send to an agent's own login are not swapped (the invite is for the agent's account).
