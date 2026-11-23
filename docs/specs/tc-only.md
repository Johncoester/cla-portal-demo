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

## TC-ONLY-2b: review fixes (CRM Bot review of PR 414, no database file)

- A TC with no email address is treated as no TC on the screens (the database holds those emails). The box stays disabled until the TC has an email, and the compose and preview notes use the "held" wording.
- When a linked TC has an email but no portal login (`hasLogin` false from `tc_only_status`), the box hint and the notes add: in-app alerts for this agent are held until the TC is invited.
- Who can read or tick it on screen matches `private.is_manager()`: role Processor, Preprocessor or Transaction Coordinator, or the admin flag. The role name Admin or Super admin alone isn't enough.
- The compose matches a TC-only agent by contact email or portal-login email, the same as `resolve_recipients`. The login emails come from one by-id `profiles` read, made only when a ticked agent with a login is on the file.
- Sales staff, and anyone else the server would refuse, don't call `tc_only_status`.

## TC-ONLY-2c: second review fixes (CRM Bot review of PR 415)

- A TC with an email but no portal login: portal alerts and most automatic emails (reminders, portal notices) for the agent are held until the TC is invited. Emails staff type, and title package, post-closing, scheduling and Task Builder emails, still go to the TC's email. The Contacts hint opens with exactly those emails, so it doesn't say "emails and alerts".
- Two TCs where only one has a login: the alerts and automatic emails go to the one with a login. The screens say so per TC and don't say anything is held.
- A TC with no email: one message ("Their linked TC, X, has no email address..."), not two.
- Database (20261129050000_tc_only_needs_tc_email.sql): `public.set_participant_tc_only` refuses to tick the box when no TC linked to the agent on that side has an email (a contact email or a portal-login email). Unticking is always allowed. The activity line and the returned `tcs` list only TCs with an email. Who may call it is unchanged (staff/manager on the file). Rollback: supabase/rollbacks/20261129050000_tc_only_needs_tc_email.sql. Test: test/test-tc-only-needs-email-sql.sh (disposable local Postgres).

## FF-108: listing side, TC order, clearer text (Francis, Nov 23 2026; no database file)

- Cause: Order Contacts > + Add contact > Transaction coordinator > "which agent" saved the person as Buyer Agent TC / Listing Agent TC on the file but did not link them to the agent (agent_tc_links). The box needs a linked TC (private.tc_only_targets), so it stayed greyed out. Now the same save also links them to the chosen agent (link_agent_tc, which a processor may call; the link's own trigger places them on that agent's files as before). If the link is refused, the add stays and the page says why.
- Order Contacts lists the Buyer Agent TC rows right under the Buyer Agent, and the Listing Agent TC rows right under the Listing Agent. Everyone else keeps their order.
- Greyed-out text: "Add a Listing Agent TC for <agent> first to use this." When a TC is on the file for that side but not linked to the agent: "<TC> is on this file as Listing Agent TC but not linked to <agent>. Link them as <agent>'s transaction coordinator on <agent>'s contact record first to use this."
- Tests: test/test-ff-108.js (demo portal, both sides end to end, order, wording) and test/test-ff-108-sql.sh (local Postgres: listing side refused without a linked TC, works once linked, routes to the TC, PR 417 no-email guard, staff only).

## TC-ONLY-3: Francis's answers (Nov 23 2026 1:30 PM ET)

| # | Francis said | Before this | Now |
|---|---|---|---|
| 1 | Emails and portal alerts go to the TC | Same | Same |
| 2 | The agent keeps access to messages and documents | Same (the box changes who gets emails and alerts, never what anyone can open) | Same |
| 3 | Fee change and title commitment notices go to both the agent and the TC | They went to the TC only | Both. The agent's own email/alert is left as it is and each linked TC gets a copy |
| 4 | Only CLA staff can tick the box | Same | Same |
| 5 | Both typed and automatic emails go to the TC | Same | Same |
| 6 | The greeting becomes "Hello [TC Name]" | The opening word was kept ("Hi Sam") | "Hello Sam" (TC's first name), for automatic emails (database) and typed ones (gmail-send) |

- "Fee change notices" = kind agent_fee (the "Agent fees changed / confirmed" email and portal alert). "Title commitment notices" = the buyer agent's title commitment email (title_recipient_role buyer_agent_commitment) and the listing agent's title package (title_recipient_role listing_agent).
- If no TC is linked on that side, these notices still go to the agent; other email stays held as before.
- The TC's copy is logged in comm_redirect_log as "Copy to TC (the agent gets it too): <subject>".
- Not covered: Task Builder emails sent on "Title commitment received" stay TC-only (they are Task Builder emails, not the commitment notice).
- Database file: 20261129110000_tc_only_both_and_hello.sql (replaces private.comm_swap_greeting, private.trg_outbox_tc_only, private.trg_notifications_tc_only; no table, policy or grant change). Tests: test/test-tc-only-3-sql.sh, test/test-tc-only-3.js, test/test-gmail-phase1.js.

## Not done yet
- Task Builder pages do not show the "goes to the TC" note. Their emails are still routed by the database.
- Invites the staff send to an agent's own login are not swapped (the invite is for the agent's account).
