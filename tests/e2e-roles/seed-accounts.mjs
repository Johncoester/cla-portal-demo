/* Create the E2E auth users on CLA Portal Live Test. Does not apply SQL.
 * Does not print passwords, the service-role key, or request bodies.
 *
 * Path A, a developer machine that already has the service-role key:
 *   E2E_TARGET=test E2E_CONFIRM_TEST_SEED=yes \
 *   SUPABASE_URL=https://aqcervntopidtcazcmlv.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   E2E_MAIL_TO=clatestportal@gmail.com \
 *   E2E_PROCESSOR_PASSWORD=... (and the other E2E_*_PASSWORD values) \
 *   node tests/e2e-roles/seed-accounts.mjs
 *
 * Path B, no service-role key on the developer machine. Trigger the
 * e2e-roles-test workflow with "Seed TEST accounts" checked. That job
 * injects the repo secrets and runs:
 *   node tests/e2e-roles/seed-accounts.mjs --workflow-dispatch
 * --workflow-dispatch refuses to run anywhere except that GitHub Actions event.
 *
 * Then paste supabase/migrations/20261110140000_e2e_role_file_seed.sql into the
 * TEST SQL editor with e2e.mail_to set. If these users already exist, leave the
 * password settings empty; the SQL only reads a password when the profile is missing.
 */
import { plusAlias } from './helpers/allowlist.js';

const TEST_REF = 'aqcervntopidtcazcmlv';
const ROLES = [
  ['super-admin', 'E2E_SUPER_ADMIN_PASSWORD'],
  ['processor', 'E2E_PROCESSOR_PASSWORD'],
  ['sales-person', 'E2E_SALES_PERSON_PASSWORD'],
  ['sales-team', 'E2E_SALES_TEAM_PASSWORD'],
  ['coordinator', 'E2E_TRANSACTION_COORDINATOR_PASSWORD'],
  ['buyer-agent', 'E2E_BUYER_AGENT_PASSWORD'],
  ['listing-agent', 'E2E_LISTING_AGENT_PASSWORD'],
  ['buyer', 'E2E_CLIENT_BUYER_PASSWORD'],
  ['seller', 'E2E_CLIENT_SELLER_PASSWORD'],
];

function fail(msg) { console.error(msg); process.exit(1); }

const workflowDispatch = process.argv.includes('--workflow-dispatch');
const inDispatchJob = process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
if (workflowDispatch) {
  if (!inDispatchJob) fail('Refusing. --workflow-dispatch runs only from the GitHub Actions workflow_dispatch job. A developer machine uses E2E_CONFIRM_TEST_SEED=yes.');
} else if (process.env.GITHUB_ACTIONS === 'true' || process.env.E2E_TARGET !== 'test' || process.env.E2E_CONFIRM_TEST_SEED !== 'yes') {
  fail('Refusing. On a developer machine set E2E_TARGET=test and E2E_CONFIRM_TEST_SEED=yes. This script is not part of the nightly or post-deploy run.');
}
const url = String(process.env.SUPABASE_URL || '');
if (!url.includes(TEST_REF)) fail(`Refusing. SUPABASE_URL must be the TEST project (${TEST_REF}).`);
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!key) fail('Missing secret SUPABASE_SERVICE_ROLE_KEY.');
const base = String(process.env.E2E_MAIL_TO || '').trim().toLowerCase();
if (!base) fail('Missing secret E2E_MAIL_TO.');

const names = {
  'super-admin': ['E2E Super', 'Admin'],
  processor: ['E2E', 'Processor'],
  'sales-person': ['E2E', 'Salesperson'],
  'sales-team': ['E2E', 'Salesteam'],
  coordinator: ['E2E', 'Coordinator'],
  'buyer-agent': ['E2E', 'Buyeragent'],
  'listing-agent': ['E2E', 'Listingagent'],
  buyer: ['E2E', 'Buyer'],
  seller: ['E2E', 'Seller'],
};

for (const [tag, secret] of ROLES) {
  const email = plusAlias(base, `e2e-${tag}`);
  const password = process.env[secret] || '';
  if (!email) fail(`E2E_MAIL_TO cannot make a plus-alias for ${tag}.`);
  if (password.length < 8) fail(`Missing or short secret ${secret}.`);
  const [first, last] = names[tag];
  const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { first_name: first, last_name: last } }),
  });
  if (res.status === 422 || res.status === 409) {
    console.log(`exists ${email}`);
    continue;
  }
  if (!res.ok) fail(`Auth create failed for ${email} (HTTP ${res.status}).`);
  console.log(`created ${email}`);
}
console.log('Auth users are ready. Apply supabase/migrations/20261110140000_e2e_role_file_seed.sql in the TEST SQL editor. This script did not apply it.');
