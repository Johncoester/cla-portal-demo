# Portal email sender (OUTBOX-SEND-1)

Asked by John Coester, Nov 24 2026, 11:06 AM ET (t2041u): "go-live blocker: automatic portal emails never send."

## How it should work

Every automatic portal email (agent fee notices, reminders, scheduling, title package, Task Builder emails, post-closing alerts) is written
to `public.outbox` by the database. Every minute the `outbox-send` job sends new rows **from the file's processor's own Gmail**
(John, Nov 24 2026, 12:24 PM ET: "Send reminders from the file's processor"), through the same Gmail connection the processor makes once on
Profile Setting > Gmail and that "Send" on a file already uses. The email also shows on the file's Email tab, and replies land in the
processor's inbox. Each outbox row records what happened, and the Reminder Outbox page shows it.

| Status | Page shows | Meaning |
|---|---|---|
| queued | Waiting to send | waiting for the job (or for another try after a temporary Google problem) |
| sending | Sending | the job has taken it; nobody else can take it |
| sent | Sent + time | Gmail accepted it. `sent_at` and the Gmail message id (`provider_message_id`) are set |
| failed | Not sent + reason | the processor can not send it, or Gmail refused it (reasons below) |
| skipped | Not sent (skipped) + reason | Test mode and a non-test address, or the pre-sender backlog |
| blocked | Held + reason | a portal rule holds it: `send_blocked`, or the TC-only rule |

### Who sends it, and the reasons it is not sent

The sender is the processor assigned to the outbox row's file (`deals.processor_id`). These are marked failed with the reason, one row at a
time, and are not retried (a reminder that goes out days later is worse than one that is visibly not sent):

- "Not sent: this email is not on a file, so there is no processor to send it from."
- "Not sent: no processor is assigned to <file>. Assign a processor; new emails on the file will then go out from their Gmail."
- "Not sent: the file's processor (<name>) is not an active portal user."
- "Not sent: <name>'s Gmail is not connected to the portal (Profile Setting > Gmail > Connect)."
- "Not sent: <name>'s Gmail needs to be connected again (Profile Setting > Gmail). Google access was revoked or expired." (the processor's
  Profile is flagged "needs reconnect", like a manual send)
- "Not sent: Gmail (<address>) did not send it (HTTP 4xx)."

Retried (up to 5 tries, waiting 2, 4, 8, 16 minutes): Google or Gmail busy or down (401, 429, 5xx, network), or the file could not be read.

## The switch

`private.outbox_send_settings.mode`: `test` (default), `live` or `off`.

- **Test**: sends only when every address on the email (to, cc and bcc) is a `clatestportal+...@gmail.com` address. Anything else is
  marked `skipped` with "Test mode: <address> is not a clatestportal+ test address, so nothing was sent." and is never sent later.
- **Live**: sends to everyone.
- **Off**: the sender takes nothing; rows wait as `queued`.

Why it lives there: the private schema is not reachable from the portal, the browser or the server key, so no staff member, no portal
screen and no bug in the web app can change it. Only the database owner can, in the Supabase dashboard SQL editor, and Live needs
confirmation words:

```sql
select private.set_outbox_send_mode('live', 'SEND REAL EMAIL');
select private.set_outbox_send_mode('test');
select private.set_outbox_send_mode('off');
```

An edge-function secret was the other option. It was not chosen because changing it means redeploying the function, and the
database could not enforce it: the claim function itself refuses non-test addresses in Test mode, and the edge function checks again before
every send.

## Rules the sender respects

- `send_blocked` set on the row -> `blocked` with the portal's reason (CPL price, post-closing, buyer agent commitment, TC-only "held").
- TC-only: the `outbox_tc_only` trigger already moves an email to the TC when it is queued. The sender checks again at send time with
  `private.resolve_recipients`: if the recipient, a cc or a bcc is a TC-only agent, the row is `blocked`. Fee change and title commitment
  notices (TC-ONLY-3) are the exception: the agent gets those too.
- Wire instruction documents are never attached.
- From is the file's processor's connected Gmail address and name.

## No double sends, retries

- The claim locks the settings row and takes rows with `FOR UPDATE SKIP LOCKED`, marking them `sending` in the same transaction.
- A result is recorded only on a row that is still `sending`.
- A temporary failure (429, 5xx, network) goes back to `queued` with a wait of 2, 4, 8, 16 minutes, then `failed` after 5 tries.
- A row left `sending` for 10 minutes (the function crashed mid-send) is marked `failed` and **not** retried, because it may have gone out.

## The backlog

Every row queued before the database file ran is marked `skipped`, "pre-sender backlog, not sent". `not_before` is set to that moment
and the claim never takes an older row, even if someone puts it back to `queued`.

## Turning it on (John)

No email service, DNS change, mailbox or new secret is needed. The function uses the project's existing `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` (the Google app staff Gmail connections use); without them it does nothing.

1. Each processor connects Gmail once: Profile Setting > Gmail > Connect (John, Matt, Francis and TEST PROCESSOR01 already have).
2. Supabase dashboard > project aqcervntopidtcazcmlv > SQL editor, once, to start the every-minute job:
   ```sql
   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'outbox_send_token', 'pg_cron -> outbox-send');
   ```
   Nobody needs to see this value; the database checks it. To stop the job: `select private.set_outbox_send_mode('off');`
3. The mode stays `test` (clatestportal+ addresses only). Live is a separate go-live decision:
   `select private.set_outbox_send_mode('live', 'SEND REAL EMAIL');`

Note: in Test mode an email to a clatestportal+ address on Matt's or Francis's file goes out from their real Gmail, so it shows in
their Sent folder.

Amazon SES / Resend (OUTBOX-SEND-1) were removed: processors send their own reminders.

## Files

- Pull requests: [PR 436](https://github.com/Johncoester/cla-portal-demo/pull/436) (sender, statuses, switch, backlog), OUTBOX-SEND-2 (processor Gmail, Reminder Outbox page)
- `supabase/migrations/20261131000000_outbox_sender.sql` (rollback in `supabase/rollbacks/`). OUTBOX-SEND-2 has no database file.
- `supabase/functions/outbox-send/index.ts`, `supabase/functions/_shared/outbox-core.mjs` (Google code shared from `gmail-handlers.mjs`)
- `js/pages/outbox.js` (Reminder Outbox status column)
- Tests: `test/test-outbox-sender.js`, `test/test-outbox-sender-sql.sh`
