# Portal email sender (OUTBOX-SEND-1)

Asked by John Coester, Nov 24 2026, 11:06 AM ET (t2041u): "go-live blocker: automatic portal emails never send."

## How it should work

Every automatic portal email (agent fee notices, reminders, scheduling, title package, Task Builder emails, post-closing alerts) is written
to `public.outbox` by the database. A sender picks up new rows every minute, sends them through an email service from
`portal@clatitle.com` (or the file's processor / HR address when the row says so), and records what happened on the row.

| Status | Meaning |
|---|---|
| queued | waiting for the sender (or waiting for another try after a failure) |
| sending | the sender has taken it; nobody else can take it |
| sent | the email service accepted it. `sent_at` and `provider_message_id` are set |
| failed | not sent. `status_reason` says why (refused by the service, gave up after 5 tries, attachment problem, or the sender stopped mid-send) |
| skipped | not sent on purpose: Test mode and a non-test address, or the pre-sender backlog |
| blocked | not sent because a portal rule holds it: `send_blocked` is filled in, or the TC-only rule says the agent's mail goes to their TC |

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
- From is the row's own `@clatitle.com` sender; anything else falls back to `portal@clatitle.com` / "CLA Title Portal".

## No double sends, retries

- The claim locks the settings row and takes rows with `FOR UPDATE SKIP LOCKED`, marking them `sending` in the same transaction.
- A result is recorded only on a row that is still `sending`.
- A temporary failure (429, 5xx, network) goes back to `queued` with a wait of 2, 4, 8, 16 minutes, then `failed` after 5 tries.
- A row left `sending` for 10 minutes (the function crashed mid-send) is marked `failed` and **not** retried, because it may have gone out.
- Resend calls carry an idempotency key per row.

## The backlog

Every row queued before the database file ran is marked `skipped`, "pre-sender backlog, not sent". `not_before` is set to that moment
and the claim never takes an older row, even if someone puts it back to `queued`.

## Email service: recommendation

**Amazon SES** (John already has an AWS account), with Resend built in as a drop-in alternative (`OUTBOX_PROVIDER=resend`).

| | Amazon SES | Resend | Gmail API as portal@ (what gmail-send uses) |
|---|---|---|---|
| How it signs in | IAM access key limited to sending from clatitle.com | one API key | a person signs in to a real portal@ mailbox and connects it (per-user OAuth) |
| SPF / DKIM / DMARC | Easy DKIM (3 CNAMEs) + custom MAIL FROM `mail.clatitle.com` = SPF and DKIM aligned | DKIM TXT + `send.` subdomain | Google signs it (already set up) |
| Cost | about $0.10 per 1,000 emails | free to 3,000/month, then $20/month | needs a Workspace license for portal@ |
| Limits | sandbox until AWS approves production access (about a day) | 100/day on free plan | 2,000/day per mailbox; breaks if the token is revoked or the password changes |
| Bounces / complaints | event feed available (later) | dashboard + webhooks | none |

gmail-send authenticates with each staff member's own Google OAuth connection (refresh token in Vault, `gmail.send` scope), not a service
account with domain-wide delegation. Reusing it for portal@ would need a licensed portal@ mailbox someone signs in to, and it ties
automatic mail to one person's OAuth grant, so it is not recommended for system mail.

## Turning it on (John, his Workspace admin, his website person)

### 1. AWS (John)
1. AWS console, region **US East (N. Virginia) us-east-1** > Amazon SES > Identities > Create identity > Domain `clatitle.com`.
   Easy DKIM, RSA 2048-bit. Tick "Use a custom MAIL FROM domain": `mail.clatitle.com`, "Use default MAIL FROM domain" if MX fails.
2. SES shows 3 DKIM CNAMEs and the MAIL FROM MX and TXT. Send them to the website person (step 2).
3. SES > Account dashboard > Request production access: transactional, "title and escrow notices to our clients and agents, about N per day,
   bounces handled". Until approved, SES only delivers to addresses verified in SES (verify `clatestportal@gmail.com` to test sooner).
4. IAM > Users > Create user `cla-portal-outbox-test`, no console access. Inline policy:
   ```json
   {"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["ses:SendEmail","ses:SendRawEmail"],
     "Resource":"arn:aws:ses:us-east-1:<ACCOUNT_ID>:identity/clatitle.com"}]}
   ```
   Create an access key (type "Application running outside AWS"). Keep it for step 4; do not paste it in chat or email.

### 2. DNS in Cloudflare (website person). All records "DNS only" (grey cloud).

| Type | Name | Value | Notes |
|---|---|---|---|
| CNAME | `<token1>._domainkey` | `<token1>.dkim.amazonses.com` | DKIM 1 of 3, tokens come from SES step 1.2 |
| CNAME | `<token2>._domainkey` | `<token2>.dkim.amazonses.com` | DKIM 2 of 3 |
| CNAME | `<token3>._domainkey` | `<token3>.dkim.amazonses.com` | DKIM 3 of 3 |
| MX | `mail` | `feedback-smtp.us-east-1.amazonses.com`, priority 10 | bounces for the MAIL FROM subdomain |
| TXT | `mail` | `v=spf1 include:amazonses.com ~all` | SPF for the MAIL FROM subdomain |
| TXT | `_dmarc` | leave as is for now (`v=DMARC1; p=none; ...`) | after 2 clean weeks, change `p=none` to `p=quarantine` |

Do not change the root `clatitle.com` SPF (`v=spf1 include:_spf.google.com include:one.zoho.com ~all`) or the Google MX records.
SES verifies the domain on its own once the records are in (usually under an hour).

### 3. Google Workspace (admin)
Create `portal@clatitle.com` as a **Google Group** (free, no license) with John and the processors as members, "Anyone on the web can
post", so replies to portal emails reach a person. Sending through SES does not need a mailbox; this is only for replies.

### 4. Supabase TEST (John)
1. Edge Functions > Secrets (project aqcervntopidtcazcmlv): `OUTBOX_PROVIDER` = `ses`, `AWS_SES_REGION` = `us-east-1`,
   `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY` (from step 1.4).
2. The `outbox-send` function is deployed by Grok with no secrets (it answers "idle" and touches nothing).
3. SQL editor, once, to let the every-minute job call it:
   ```sql
   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'outbox_send_token', 'pg_cron -> outbox-send');
   ```
   Nobody needs to see this value; the database checks it.
4. The mode stays `test`. Live is a separate decision for go-live.

## Files

- Pull request: [PR 436](https://github.com/Johncoester/cla-portal-demo/pull/436)
- `supabase/migrations/20261131000000_outbox_sender.sql` (rollback in `supabase/rollbacks/`)
- `supabase/functions/outbox-send/index.ts`, `supabase/functions/_shared/outbox-core.mjs`, `supabase/functions/_shared/outbox-providers.mjs`
- Tests: `test/test-outbox-sender.js`, `test/test-outbox-sender-sql.sh`
