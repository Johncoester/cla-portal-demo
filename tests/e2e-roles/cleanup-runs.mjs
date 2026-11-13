/* Delete the rows E2E runs left on CLA Portal Live Test. Runs at the end of every e2e-roles-test job.
 * Same rows as cleanup-run.sql, but for every run at once: each test makes its own run id, so there is no single id per job.
 *   documents  name like 'e2e-%'          (uploads: e2e-<run>-<visibility>.pdf)
 *   threads    subject like 'E2E-RUN-%'   (and their messages and participants)
 *   update_requests  note like 'E2E-RUN-%', and open ones on the seeded file (notes = E2E-ROLE-FILE)
 *   deals      notes like 'E2E-RUN-%'     (and their tasks, participants, folders, business source and activity log). The seeded file (notes = E2E-ROLE-FILE) never matches.
 * Bob, Nov 10: left behind, these rows grew TEST every deploy (task copies 186 -> 251) and slowed task_board for everyone.
 * Takes a legacy service_role key or a new secret key (sb_secret_...). Does not print the key or row contents. Storage objects behind deleted documents are not removed.
 *
 * In the workflow:   node tests/e2e-roles/cleanup-runs.mjs --workflow
 * On a developer machine (service-role key already in hand):
 *   E2E_TARGET=test E2E_CONFIRM_TEST_CLEANUP=yes SUPABASE_URL=https://aqcervntopidtcazcmlv.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
 *   node tests/e2e-roles/cleanup-runs.mjs [--dry-run]
 */
const TEST_REF = 'aqcervntopidtcazcmlv';
const TEST_PROFILES = ['149e612a-6e14-4ee1-9890-0f29d6f89156', 'd02722a1-582b-42c0-b3d1-28d25adb758d'];   // same check as cleanup-run.sql

function fail(msg) { console.error(msg); process.exit(1); }

const inWorkflow = process.argv.includes('--workflow');
const dryRun = process.argv.includes('--dry-run');
if (inWorkflow) {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_WORKFLOW !== 'e2e-roles-test') fail('Refusing. --workflow runs only from the e2e-roles-test GitHub Actions job.');
} else if (process.env.GITHUB_ACTIONS === 'true' || process.env.E2E_TARGET !== 'test' || process.env.E2E_CONFIRM_TEST_CLEANUP !== 'yes') {
  fail('Refusing. On a developer machine set E2E_TARGET=test and E2E_CONFIRM_TEST_CLEANUP=yes.');
}
const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
if (new URL(url).hostname !== `${TEST_REF}.supabase.co`) fail(`Refusing. SUPABASE_URL must be the TEST project (${TEST_REF}).`);
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!key) fail('Missing secret SUPABASE_SERVICE_ROLE_KEY.');

// A legacy service_role key is a JWT and also goes in Authorization. A new secret key (sb_secret_...) is not a JWT:
// Supabase takes it in the apikey header only.
const headers = { apikey: key, 'Content-Type': 'application/json', ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
async function rest(method, path) {
  const res = await fetch(`${url}/rest/v1/${path}`, { method, headers: method === 'GET' ? headers : { ...headers, Prefer: 'return=representation' } });
  if (!res.ok) throw new Error(`${method} ${path.split('?')[0]} failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
const ids = (rows) => rows.map((r) => r.id);
const chunks = (a, n = 100) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
// Nov 13: rows come back with only the filter column. thread_participants and deal_business_sources have no id column,
// so asking for id made both deletes fail (HTTP 400, 42703) and the thread and order deletes after them failed too.
async function removeIn(table, col, list) {
  let n = 0;
  for (const part of chunks(list)) n += dryRun ? (await rest('GET', `${table}?select=${col}&${col}=in.(${part.join(',')})`)).length
    : (await rest('DELETE', `${table}?${col}=in.(${part.join(',')})&select=${col}`)).length;
  return n;
}
async function removeLike(table, col, pattern) {
  return dryRun ? (await rest('GET', `${table}?select=id&${col}=like.${encodeURIComponent(pattern)}`)).length
    : (await rest('DELETE', `${table}?${col}=like.${encodeURIComponent(pattern)}&select=id`)).length;
}

const found = await rest('GET', `profiles?select=id&id=in.(${TEST_PROFILES.join(',')})`);
if (!found.length) fail('Refusing. Not the CLA Portal Live Test database.');

const done = [];
const problems = [];
async function step(label, fn) {
  try { done.push(`${label}: ${await fn()}`); } catch (e) { problems.push(`${label}: ${e.message}`); }
}
await step('documents', () => removeLike('documents', 'name', 'e2e-*'));
// Nov 11: request_update refuses a repeat open request, so a run's requests have to go too.
await step('update_requests', () => removeLike('update_requests', 'note', 'E2E-RUN-*'));
const seeded = ids(await rest('GET', `deals?select=id&notes=eq.E2E-ROLE-FILE`));
await step('update_requests (seeded file, open)', async () => {
  let n = 0;
  for (const part of chunks(seeded)) n += dryRun ? (await rest('GET', `update_requests?select=id&status=eq.open&deal_id=in.(${part.join(',')})`)).length
    : (await rest('DELETE', `update_requests?status=eq.open&deal_id=in.(${part.join(',')})&select=id`)).length;
  return n;
});
const threads = ids(await rest('GET', `threads?select=id&subject=like.${encodeURIComponent('E2E-RUN-*')}`));
await step('messages', () => removeIn('messages', 'thread_id', threads));
// Nov 13: threads.id is still referenced from thread_participants, so the thread delete failed (409) on every run and
// E2E-RUN threads piled up (451 on Nov 13). Their participants go first.
await step('thread_participants', () => removeIn('thread_participants', 'thread_id', threads));
await step('threads', () => removeIn('threads', 'id', threads));
const deals = ids(await rest('GET', `deals?select=id&notes=like.${encodeURIComponent('E2E-RUN-*')}`));
await step('tasks', () => removeIn('tasks', 'deal_id', deals));
await step('deal_participants', () => removeIn('deal_participants', 'deal_id', deals));
// Nov 13: deals.id is still referenced from folders, deal_business_sources and activity_log, so the order delete failed (409)
// on every run (95 E2E-RUN orders left on Nov 13). Those rows go first; activity_log last, after the deletes that log.
await step('folders', () => removeIn('folders', 'deal_id', deals));
await step('deal_business_sources', () => removeIn('deal_business_sources', 'deal_id', deals));
await step('activity_log', () => removeIn('activity_log', 'deal_id', deals));
await step('deals', () => removeIn('deals', 'id', deals));

console.log(`${dryRun ? 'Would delete' : 'Deleted'} E2E rows on TEST. ${done.join(', ')}`);
if (problems.length) { console.error(`Not cleaned:\n  ${problems.join('\n  ')}`); process.exit(1); }
