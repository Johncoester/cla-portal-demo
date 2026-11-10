# Role smoke for CLA Portal Live Test

Playwright (Chromium) checks for the portals John asked to cover:

- Order Entry, driven by the Processor fake login
- Buyer and Seller portals
- Buyer Agent and Listing Agent portals
- Transaction Coordinator portal
- Sales Person and Sales Team portals

Accounting, payoffs, title, CRM, HR, funding, wires, and policy are not opened. CRM coverage stays deferred until John says to add it. The file Contacts / Parties edit is part of Order Entry. It is not the CRM.

The suite does not merge, deploy, or apply SQL. It does not send mail in mock mode.

## Run it locally (mock)

From the repo root, with no `config.js` (the page stays in mock mode):

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

That serves the static site on `http://127.0.0.1:4173` and signs in through the fake-person picker (`window.CLA_DEV_PICKER`). No passwords. No network calls to Gmail.

Mock portal checks use the built-in file **MD-26-97183** (145 Main Street, `deal-1`). Those fake people already hold the roles. Order Entry places a new file whose street starts with `100 E2E Test File`, checks the edit, parties, referral source, and state prefix, then sets the status to Cancelled. The browser context is thrown away with the run.

A failure leaves a screenshot and a trace under `tests/e2e-roles/test-results/`. The pass/fail list is printed and written to `tests/e2e-roles/test-results/summary.md`.

## Run it against TEST

Only `https://testportal.clatitle.com/`. The config refuses any other host when `E2E_TARGET=test`, and it refuses a non-loopback host in mock mode.

1. Create the logins with `node tests/e2e-roles/seed-accounts.mjs` (see secrets below). That script talks to the TEST Auth admin API and does not apply SQL.
2. In the TEST SQL editor, set `e2e.mail_to` and apply `supabase/migrations/20261110103000_e2e_role_file_seed.sql`. The file is not applied by this repo's CI. Its rollback is `supabase/rollbacks/20261110103000_e2e_role_file_seed.sql`.
3. Connect Gmail on the Processor login (Profile Setting). File email and invite email go out from that mailbox.
4. Export the secrets and run:

```bash
E2E_TARGET=test npm run test:e2e
```

`E2E_BASE_URL` defaults to the TEST origin. Do not point it anywhere else.

Rows a run creates are tagged `E2E-RUN-<id>` (order notes, message subjects, upload names). `tests/e2e-roles/cleanup-run.sql` deletes only those rows. It is not a migration. The seeded file (`notes = E2E-ROLE-FILE`, street `100 E2E Test File`) is removed only by the rollback.

## Secrets John needs to set

Nothing here is a password. GitHub Actions reads the same names from repository secrets. The workflow never prints the values.

| Name | Used for |
| --- | --- |
| `E2E_MAIL_TO` | Dedicated test inbox. Use `clatestportal@gmail.com` or an `@clatitle.com` address with no plus-tag. Role addresses are plus-aliases of it. |
| `E2E_GMAIL_CLIENT_ID` | Gmail API client for that inbox (poll, reply, trash). |
| `E2E_GMAIL_CLIENT_SECRET` | Gmail API client secret. |
| `E2E_GMAIL_REFRESH_TOKEN` | Refresh token for `E2E_MAIL_TO` with read and send. |
| `E2E_SUPER_ADMIN_EMAIL` / `E2E_SUPER_ADMIN_PASSWORD` | Seeded Super admin. The smoke does not browse admin modules. |
| `E2E_PROCESSOR_EMAIL` / `E2E_PROCESSOR_PASSWORD` | Order Entry and, on TEST, file email. |
| `E2E_SALES_PERSON_EMAIL` / `E2E_SALES_PERSON_PASSWORD` | Sales Person portal. |
| `E2E_SALES_TEAM_EMAIL` / `E2E_SALES_TEAM_PASSWORD` | Sales Team portal and the invite copy-link check. |
| `E2E_TRANSACTION_COORDINATOR_EMAIL` / `E2E_TRANSACTION_COORDINATOR_PASSWORD` | Transaction Coordinator portal. |
| `E2E_BUYER_AGENT_EMAIL` / `E2E_BUYER_AGENT_PASSWORD` | Buyer Agent portal. |
| `E2E_LISTING_AGENT_EMAIL` / `E2E_LISTING_AGENT_PASSWORD` | Listing Agent portal. |
| `E2E_CLIENT_BUYER_EMAIL` / `E2E_CLIENT_BUYER_PASSWORD` | Buyer portal. |
| `E2E_CLIENT_SELLER_EMAIL` / `E2E_CLIENT_SELLER_PASSWORD` | Seller portal. |
| `SUPABASE_URL` | `https://aqcervntopidtcazcmlv.supabase.co` for the seed script only. |
| `SUPABASE_SERVICE_ROLE_KEY` | Seed script only. Never put this in the browser or in Actions. |

On TEST the emails are `local+e2e-<role>@domain` from `E2E_MAIL_TO`, for example `clatestportal+e2e-buyer@gmail.com`. An invitee with no login is `+e2e-invitee`. The harness aborts before send if any recipient is outside that set, or if Live Test's own allowlist would refuse it (`clatestportal@gmail.com`, `clatestportal+tag@gmail.com`, or `@clatitle.com`).

The Processor login on TEST must already have Gmail connected. The suite does not run the Google consent screen.

## What the email checks cover

These portals send three kinds of mail. The suite covers those and nothing else.

- **Invites** from a file (agent, buyer, seller). The Sales Team check only copies the link. A route blocks `gmail-send` so that check cannot email anyone. On TEST, the email spec sends one invite to an allowlisted address and polls the inbox.
- **File email** from the file Email tab: a template, no leftover `{{ }}`, subject shaped `[CLA #file - property address]`, and one attachment larger than 5 MB (the FF-006 size). Arrival is polled for up to 3 minutes. Latency is the time until the inbox returns the message.
- **Replies.** The test inbox replies on that Gmail thread with one PDF. Check for replies must show the inbound message, and the attachment must land on Documents once.

Mock mode checks the composer, the subject hint, merge output, and the allowlist. It does not send. Live delivery is skipped unless `E2E_TARGET=test`.

HR staff invites are the same sender, but the HR module is not opened. Task reminders and the seller/agent preview (`automation.js`) do not send mail. They are not in this suite.

Messages the suite receives in the test inbox are moved to trash. The copy in the Processor's Sent mail is outside that token. Delete it there if you want it gone.

## GitHub Actions

`.github/workflows/e2e-roles-test.yml`

- After the Pages workflow `pages-build-deployment` succeeds.
- After a successful `deployment_status`, except an environment named production.
- Nightly at 02:00 America/New_York (the 06:00 and 07:00 UTC crons; the job exits unless the Eastern hour is 02).
- `workflow_dispatch` for a manual run.

The base URL is hard-coded to `https://testportal.clatitle.com/`. A screenshot and a trace are uploaded when the job fails. The job summary is the pass/fail table, including expected failures and email latency when a live send ran.

## Permissions matrix

Derived from `js/data/constants.js`, `js/data/agent-profile.js`, `js/pages/dealdocs.js`, `js/pages/deal.js`, `js/data/mock-part-msgs.js`, and the RLS comments in the migrations that are in this repo. "Offered" means the control is on the page.

| | Processor (Order Entry only) | Sales Person | Sales Team | Transaction Coordinator | Buyer Agent | Listing Agent | Client-Buyer | Client-Seller |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Open the shared file | yes, and any file | files they are on, plus sales links | every file (`seesAll`) | every file (migration `20261109190000`) | files where they are the buyer agent | files where they are the listing agent | their purchase | their sale |
| Place Order | yes | no | no | no | no | no | no | no |
| Edit order details, parties, referral, state prefix | yes | no (view-only) | no (view-only) | no (`runsOrders` is false) | no | no | no | no |
| File tabs | staff set, modules below not opened | staff set, no upload, no new message | same as Sales Person | Overview, Tasks, Messages, Documents, Closing, Contacts, Activity, and Email on the later tab chrome | client set including Contacts and Agreements | same as Buyer Agent | Overview, To-do, Messages, Documents, Closing, Activity | same as the buyer |
| Fill In on assigned forms | not the focus of Order Entry | no forms of their own on the sample file | same | simple tasks, not intake forms | commission form | view the completed commission form | own intake, including photo ID | own intake, including photo ID |
| Documents upload | not in the Order Entry path | control is absent | control is absent | every visibility label | CLA staff only, own side, everyone | CLA staff only, own side, everyone | one option, Share with CLA Title (`staff`) | one option, Share with CLA Title (stored value `seller`) |
| Share Files | not in this path | button absent | button absent | both sides plus staff (staff recipient rule) | own side plus staff, not the seller side | own side plus staff, not the buyer side | buyer agent plus staff, not the listing agent or seller | listing agent plus staff, not the buyer agent or buyer |
| Portal message | not in this path | button absent | button absent | yes | yes | yes | yes | yes |
| Contacts edit | yes | no | no | no Edit button | no | no | no Contacts tab | no Contacts tab |
| Invite from the file | yes | yes, for a party with no login | yes | no (`canInviteAgents` excludes TC) | no | no | no | no |
| File email | on TEST, from the Processor's Gmail | the screen exists for staff in supabase mode; this suite does not send as Sales | same | Email tab renders; this suite does not send as the TC | no | no | no | no |

### Ambiguities

- **Seller "Share with CLA Title".** The label is shared with the buyer, but the stored value for a seller is `seller`, not `staff`. The comment in `constants.js` says a seller share is CLA staff plus their own agent. The buyer comment says staff only. `documents_assigned_agent_insert` allows `staff` for Buyer Agent and Listing Agent, not for Client-Buyer. The older `documents_insert` policy is not in this repo, so whether TEST accepts a seller's `seller` value is not proven here. The test treats "offered and refused" as a failure.
- **Who counts as CLA staff in Share Files.** The mock recipient list adds the processor, preprocessor, salespeople, coordinator, and same-side parties. The hosted `message_recipients` function body is not in this repo. If TEST omits view-only sales, that is a difference from the mock, not a guessed rule. The buyer assertion only requires some staff role plus the buyer agent.
- **FF ticket numbers are not in the repo.** They are mapped from John's list of bugs: FF-015 Fill In shows `template n/a` and no fields (buyer and seller), FF-016 the buyer's Share with CLA Title upload is denied, FF-017 the buyer's Share Files list is only the buyer agent, FF-NEW-2 a contact edit reports Contact saved when the email did not persist (PR 107), MF-024 the agent invite fails because the stored email is blank. On TEST those tests are expected failures. In mock they assert the correct behavior and are expected to pass. They are not skipped.
- **Sales Team sees every file in the mock** (`seesAll`). The SQL for that on TEST was not re-read as a policy body here. The sample file is one they are also linked to as a salesperson.
- **Email on the TC overview.** The overview pill nav does not include Email. The tab chrome on the other TC pages does, and only when `listDealEmails` exists. The suite opens Email from that chrome and does not treat a missing overview link as a failure.

## Known failures

Marked with Playwright `test.fail` only when `E2E_TARGET=test`, so a fix that makes them pass fails the run until the marker is removed.

| Ticket | Test |
| --- | --- |
| FF-015 | Buyer Fill In, and seller Fill In |
| FF-016 | Buyer document upload, Share with CLA Title |
| FF-017 | Buyer Share Files recipients |
| FF-NEW-2 | Contact edit must persist, including the email (PR 107) |
| MF-024 | Invite shows the stored email and still produces a copy link |
