import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { targetMode, TEST_PROJECT_REF } from './gate.js';
import { PEOPLE } from './people.js';

/* FF-069d (Janine, Nov 12): a finished task is read-only for the client. The buyer tests below complete the seeded
 * buyer's Lender information, Upload identification and Personal information tasks on MD-26-99001, so the next run
 * (and a later test in the same run) found them Done, saw "This task is complete. The answers are below." and no form,
 * and timed out after 1.5 minutes. Before each of those tests, the processor puts the seeded buyer's own copy back to
 * To do, the same change a processor makes with the Status list on the Tasks tab. The answers stay.
 * TEST only. Mock runs start from fresh sample data. Passwords and tokens are never logged. */

const TEST_URL = `https://${TEST_PROJECT_REF}.supabase.co`;
const here = path.dirname(fileURLToPath(import.meta.url));

function publishableKey() {
  const text = fs.readFileSync(path.join(here, '..', '..', '..', 'config.js'), 'utf8');
  if (!text.includes(TEST_URL)) throw new Error('config.js does not point at CLA Portal Live Test. Refusing to reopen tasks.');
  const m = text.match(/anonKey:\s*'([^']+)'/);
  if (!m) throw new Error('config.js has no portal key.');
  return m[1];
}

async function call(method, route, { key, token, body } = {}) {
  const res = await fetch(`${TEST_URL}${route}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token || key}`, 'Content-Type': 'application/json', Accept: 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Reopening the seeded buyer task failed (${method} ${route.split('?')[0]}, HTTP ${res.status}): ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

async function signInRest(key, person) {
  const email = process.env[person.emailEnv] || '';
  const password = process.env[person.passwordEnv] || '';
  if (!email || !password) throw new Error(`Missing secret ${person.emailEnv} or ${person.passwordEnv}.`);
  const json = await call('POST', '/auth/v1/token?grant_type=password', { key, body: { email, password } });
  return { token: json.access_token, id: json.user && json.user.id };
}

/* templateCode: lender_info, id_upload or personal_info. dealId: the TEST seed file just opened. Returns how many reopened. */
export async function reopenSeedBuyerTask(dealId, templateCode) {
  if (targetMode() !== 'test') return 0;
  if (!/^[0-9a-f-]{36}$/i.test(String(dealId)) || !/^[a-z_]+$/.test(templateCode)) throw new Error('Bad file or task code.');
  const key = publishableKey();
  const buyer = await signInRest(key, PEOPLE.buyer);
  const processor = await signInRest(key, PEOPLE.processor);
  if (!buyer.id) throw new Error('The seeded buyer sign-in returned no user.');
  const filter = `deal_id=eq.${dealId}&template_code=eq.${templateCode}&assigned_role=eq.Client-Buyer&owner_profile_id=eq.${buyer.id}&status=eq.done`;
  const rows = await call('PATCH', `/rest/v1/tasks?${filter}&select=id`, { key, token: processor.token, body: { status: 'todo', completed_at: null, completed_by: null } });
  return Array.isArray(rows) ? rows.length : 0;
}
