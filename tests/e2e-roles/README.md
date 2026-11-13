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

A failure leaves a screenshot and a trace under `tests/e2e-roles/test-results/` (`trace-1.zip`, `trace-2.zip`, ...: the trace pauses while a test signs in, so typed login values and the sign-in request are never in it; see `fixtures.js`). The pass/fail list is printed and written to `tests/e2e-roles/test-results/summary.md`.

## Run it against TEST

Only `https://testportal.clatitle.com/`. The config refuses any other host when `E2E_TARGET=test`, and it refuses a non-loopback host in mock mode.

1. Create the logins, then link the file. The script talks to the TEST Auth admin API and does not apply SQL. Two ways, both reading passwords from env and never printing them:
   - A developer machine that already has the service-role key: `E2E_TARGET=test E2E_CONFIRM_TEST_SEED=yes node tests/e2e-roles/seed-accounts.mjs`.
   - No key on the developer machine: run the GitHub Actions workflow **e2e-roles-test** with **Seed TEST accounts** checked. That `workflow_dispatch` job injects the repo secrets. `--workflow-dispatch` refuses to run anywhere else.
2. In the TEST SQL editor, apply the two files below, in order. CI does not apply them. The alias base is hard-coded as `clatestportal@gmail.com`. There is no session setting. Each file raises if a login it needs is missing, and neither file inserts into `auth.users`.
   - `supabase/migrations/20261110140000_e2e_role_profiles.sql` writes each login's profile (`status` active, `is_demo` false, `is_admin` only for the super admin) and that login's own contact, plus the loginless `+e2e-invitee` contact. It finds the nine logins with `lower(email)` on `auth.users`.
   - `supabase/migrations/20261110140100_e2e_role_file_seed.sql` writes the E2E deal (`notes = E2E-ROLE-FILE`), `deal_participants`, and `deal_sales_people`.
   Rollbacks, file first: `supabase/rollbacks/20261110140100_e2e_role_file_seed.sql`, then `supabase/rollbacks/20261110140000_e2e_role_profiles.sql`. They delete only rows tagged as E2E and never the auth users.
   A future fresh seed sends `portal_role` in `user_metadata` and `app_metadata` so `on_auth_user_sync` creates the profile. The nine logins already on TEST were created without that key, which is why the profiles file writes them.
3. Connect Gmail on the Processor login (Profile Setting). File email and invite email go out from that mailbox.
4. Export the secrets and run:

```bash
E2E_TARGET=test npm run test:e2e
```

`E2E_BASE_URL` defaults to the TEST origin. Do not point it anywhere else.

Rows a run creates are tagged `E2E-RUN-<id>` (order notes, message subjects, upload names). The workflow deletes them again at the end of every run, pass or fail (`tests/e2e-roles/cleanup-runs.mjs`, service-role key, TEST only; `--dry-run` counts without deleting). `tests/e2e-roles/cleanup-run.sql` deletes one run's rows by hand. It is not a migration. The seeded file (`notes = E2E-ROLE-FILE`, street `100 E2E Test File`) is removed only by the rollback.

## Secrets John needs to set

Nothing here is a password. GitHub Actions reads the same names from repository secrets. The workflow never prints the values.

| Name | Used for |
| --- | --- |
| `E2E_MAIL_TO` | Dedicated test inbox. The seed and the profile migration require `clatestportal@gmail.com`. Role addresses are plus-aliases of it. |
| `E2E_GMAIL_CLIENT_ID` | Optional override. Leave it empty. The email test reads the client id from TEST Vault. |
| `E2E_GMAIL_CLIENT_SECRET` | Optional override. Leave it empty. The email test reads the client secret from TEST Vault. |
| `E2E_GMAIL_REFRESH_TOKEN` | Optional override. Leave it empty. The email test reads the refresh token from TEST Vault. |
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
| `SUPABASE_SERVICE_ROLE_KEY` | Seed script only. Repo secret for the workflow_dispatch seed. Do not put it on a developer machine if you use that job, and never in the browser. |

On TEST the seeded emails are `clatestportal+e2e-<role>@gmail.com`, for example `clatestportal+e2e-buyer@gmail.com`. An invitee with no login is `clatestportal+e2e-invitee@gmail.com`. The suite keeps no allowed-inbox list of its own (John, Nov 13): the email spec sends to whatever addresses are on the test file, plus `E2E_MAIL_TO`. The portal no longer limits which addresses Live Test emails either (John, Nov 13).

The Processor login on TEST must already have Gmail connected. That is the staff mailbox the file email is sent from. The suite's own inbox is separate. See "Connect the test inbox" below.

## Connect the test inbox (one time)

The staff "Connect Gmail" button cannot do this. That client is an internal `@clatitle.com` app, and it does not ask for permission to trash mail. The test inbox is `clatestportal@gmail.com`, so it needs its own Google client. Francis does the Google part and the consent. She does not need GitHub, and she never copies a token into chat, email, or GitHub.

### What has to be deployed first

On CLA Portal Live Test only (`aqcervntopidtcazcmlv`):

1. Apply `supabase/migrations/20261110180000_e2e_gmail_vault.sql` in the TEST SQL editor. Do not apply the rollback.
2. Deploy the Edge Function `e2e-gmail-oauth` with JWT verification turned off. It has no extra secrets. Google's redirect has no portal login, and the function checks the Admin JWT itself on save.

   `supabase functions deploy e2e-gmail-oauth --no-verify-jwt --project-ref aqcervntopidtcazcmlv`
3. Deploy this branch to the TEST site so Profile Setting shows the new box.

The link Francis uses after that is [Profile Setting on the test portal](https://testportal.clatitle.com/#/profile).

### What Francis does

1. Sign in to [Google Cloud Console](https://console.cloud.google.com/) as `clatestportal@gmail.com`.
2. Create a project named `CLA Portal E2E Gmail`.
3. Open APIs & Services, then Library. Search for Gmail API and enable it.
4. Open Google Auth Platform. Older consoles call this APIs & Services, then OAuth consent screen.
   - User type: External.
   - App name: `CLA Portal E2E`.
   - User support email and developer contact: `clatestportal@gmail.com`.
   - Publishing status: Testing.
   - Test users: add `clatestportal@gmail.com`.
   - Data access, or Scopes: add `openid`, `email`, and these three:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/gmail.modify`
5. Open Clients. Older consoles call this APIs & Services, then Credentials. Create an OAuth client ID, type Web application, name `CLA Portal E2E`.
6. Authorized redirect URI, exactly one line and nothing after it:

   `https://aqcervntopidtcazcmlv.supabase.co/functions/v1/e2e-gmail-oauth`

7. Google shows the client ID and the client secret on that screen. Leave the tab open. Do not email them, do not put them in chat, and do not put them in GitHub.
8. In another tab, sign in to the TEST portal as an Admin or Super admin and open <https://testportal.clatitle.com/#/profile>.
9. In the box "Test inbox for the automated email checks", paste the client ID and the client secret and press Save. The boxes go blank. Close the Google Cloud tab.
10. Press "Open the Google consent page". If Google asks which account, choose `clatestportal@gmail.com`. Allow the permissions.
11. The next page says the test inbox is connected. Stop there. The redirect turns itself off. GitHub already has the service-role key, and the email test reads the client and the token from the vault when it runs.

A Google app left in Testing makes that permission stop working after 7 days. When the email checks start failing, open the same Profile page, press "Allow one new consent", then "Open the Google consent page" again, and allow it as `clatestportal@gmail.com`.

The nightly run does not need `E2E_GMAIL_CLIENT_ID`, `E2E_GMAIL_CLIENT_SECRET`, or `E2E_GMAIL_REFRESH_TOKEN` in GitHub. Those three stay in the TEST vault. If a value was already stored in GitHub, it is used instead and the vault is not read.

## What the email checks cover

These portals send three kinds of mail. The suite covers those and nothing else.

- **Invites** from a file (agent, buyer, seller). The Sales Team check only copies the link. A route blocks `gmail-send` so that check cannot email anyone. On TEST, the email spec sends one invite to the address on the file's invite row and polls the inbox.
- **File email** from the file Email tab, to every address on the test file plus `E2E_MAIL_TO` (the log prints the list, with `E2E_MAIL_TO` by name): a template, no leftover `{{ }}`, subject shaped `[CLA #file - property address]`, and one attachment larger than 5 MB (the FF-006 size). Arrival is polled for up to 3 minutes. Latency is the time until the inbox returns the message.
- **Replies.** The test inbox replies on that Gmail thread with one PDF. Check for replies must show the inbound message, and the attachment must land on Documents once.

Mock mode checks the composer, the subject hint, merge output, and that mock mode cannot send (there is no test-address list any more, John, Nov 13). It does not send. Live delivery is skipped unless `E2E_TARGET=test`.

HR staff invites are the same sender, but the HR module is not opened. Task reminders and the seller/agent preview (`automation.js`) do not send mail. They are not in this suite.

Messages the suite receives in the test inbox are moved to trash. The copy in the Processor's Sent mail is outside that token. Delete it there if you want it gone.

## GitHub Actions

`.github/workflows/e2e-roles-test.yml`

- After the Pages workflow `pages-build-deployment` succeeds. That is the only deploy trigger, so one deploy starts one run.
- Nightly at 02:00 America/New_York (the 06:00 and 07:00 UTC crons; the job exits unless the Eastern hour is 02).
- `workflow_dispatch` for a manual run.

The job runs on `ubuntu-24.04`. Overlapping runs share the `e2e-roles-test` concurrency group and queue.

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
| Documents upload | not in the Order Entry path | control is absent | control is absent | Who can see it: named parties plus CLA only. Both sides stores everyone on the file | CLA only, own side, everyone | CLA only, own side, everyone | one checkbox, Share with CLA Title, stored as `buyer` | one checkbox, Share with CLA Title, stored as `seller` |
| Share Files | not in this path | button absent | button absent | both sides plus the assigned staff | own side plus assigned staff, not the seller side | own side plus assigned staff, not the buyer side | buyer agent, processor, TC, and sales; preprocessor only when one is assigned; not the other side | listing agent plus that same staff list; not the buyer side |
| Portal message | not in this path | button absent | button absent | yes | yes | yes | yes | yes |
| Contacts edit | yes | no | no | no Edit button | no | no | no Contacts tab | no Contacts tab |
| Invite from the file | yes | yes, for a party with no login | yes | no (`canInviteAgents` excludes TC) | no | no | no | no |
| File email | on TEST, from the Processor's Gmail | the screen exists for staff in supabase mode; this suite does not send as Sales | same | Email tab renders; this suite does not send as the TC | no | no | no | no |

### Ambiguities

- **Share with CLA Title.** The label stays. The stored value is the client's own side: `buyer` or `seller`. CLA staff and that client's agent can see it. The other side cannot. PR 129 is on TEST, so the buyer upload has to store `buyer`.
- **Share Files staff.** The list is the preprocessor when one is assigned, the transaction coordinator, salespeople, and the processor (or every active processor when none is assigned). The mock sample file assigns a preprocessor. The TEST seed file `MD-26-99001` does not, so the suite does not require `(Preprocessor)` there.
- **`documents_insert` on TEST** is not in this repo. An offered sharing option that the upload refuses still fails the test.
- **Sales Team sees every file in the mock** (`seesAll`). The SQL for that on TEST was not re-read as a policy body here. The sample file is one they are also linked to as a salesperson.
- **Email on the TC overview.** The overview pill nav does not include Email. The tab chrome on the other TC pages does, and only when `listDealEmails` exists. The suite opens Email from that chrome and does not treat a missing overview link as a failure.

## Known failures

`tests/e2e-roles/known-failures.js` is the only switch. A test may still call `onTest('FF-016')`. With the row gone, that call does not expect a failure, so the post-fix assertion has to pass. FF-015, FF-016, and FF-017 landed in PR 129. FF-NEW-2 landed in PR 124. MF-024 means Fill In, which is the same landed fix, and it is not the invite ticket. The list is empty, so the suite shows the current behavior.
