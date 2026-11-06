/* The voice pass is decided on the server. A named email or a fake id in the body does not count. */
import { handleVoiceToken, parseAllowlist, projectRefFromUrl, createMintLog, TEST_PROJECT_REF } from '../supabase/functions/voice-token/logic.mjs';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const JOHN = '11111111-1111-4111-8111-111111111111';
const MATT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const allow = parseAllowlist(`${JOHN}, ${MATT}, not-an-id`);
ok(allow.size === 2 && allow.has(JOHN) && allow.has(MATT), 'only two real-looking ids stay on the list');
ok(projectRefFromUrl('https://aqcervntopidtcazcmlv.supabase.co') === TEST_PROJECT_REF, 'the Live Test project ref is recognized');
ok(projectRefFromUrl('https://bxixxgcqxmtzkrolywas.supabase.co') !== TEST_PROJECT_REF, 'production is not the voice project');

function ctx(over = {}) {
  const mints = createMintLog();
  let providerCalls = 0;
  const deps = {
    projectRef: TEST_PROJECT_REF,
    allowlist: allow,
    providerKey: 'xai-test-key-do-not-log',
    mints,
    now: 1_000_000,
    getUser: async () => ({ id: JOHN, is_anonymous: false }),
    profile: async () => ({ status: 'active' }),
    demoView: async () => ({ active: false }),
    mint: async (key) => { providerCalls += 1; if (key !== 'xai-test-key-do-not-log') throw new Error('wrong key'); return { value: 'xai-realtime-client-secret-shortPass1', expires_at: 99 }; },
    ...over,
  };
  return { deps, mints, calls: () => providerCalls };
}
async function post(body, over) {
  const bag = ctx(over);
  const res = await handleVoiceToken(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) }), bag.deps);
  const json = await res.json();
  return { status: res.status, json, calls: bag.calls() };
}
const check = await post({ action: 'check', email: 'attacker@example.com', userId: OTHER });
ok(check.status === 200 && check.json.allowed === true && check.calls === 0, 'an allowlisted active account can be checked without calling Grok');
const spoof = await post({ action: 'mint', userId: JOHN, email: 'john@example.com' }, { getUser: async () => ({ id: OTHER, is_anonymous: false }) });
ok(spoof.status === 403 && spoof.calls === 0, 'a body that names an allowlisted id is ignored');
const anon = await post({ action: 'mint' }, { getUser: async () => null });
ok(anon.status === 401 && anon.calls === 0, 'no session is refused');
const guest = await post({ action: 'mint' }, { getUser: async () => ({ id: OTHER, is_anonymous: true }) });
ok(guest.status === 403 && guest.calls === 0, 'an anonymous sign-in is refused');
const staff = await post({ action: 'mint' }, { getUser: async () => ({ id: OTHER, is_anonymous: false }) });
ok(staff.status === 403 && staff.calls === 0, 'another staff account is refused');
const client = await post({ action: 'mint' }, { getUser: async () => ({ id: '44444444-4444-4444-8444-444444444444', is_anonymous: false }) });
ok(client.status === 403 && client.calls === 0, 'a client account is refused');
const disabled = await post({ action: 'mint' }, { profile: async () => ({ status: 'disabled' }) });
ok(disabled.status === 403 && disabled.calls === 0, 'a disabled allowlisted account is refused');
const viewing = await post({ action: 'mint' }, { demoView: async () => ({ active: true }) });
ok(viewing.status === 403 && viewing.calls === 0, 'demo view is refused');
const empty = await post({ action: 'mint' }, { allowlist: parseAllowlist('') });
ok(empty.status === 403 && empty.calls === 0, 'an empty allowlist refuses everyone');
const prod = await post({ action: 'mint' }, { projectRef: 'bxixxgcqxmtzkrolywas' });
ok(prod.status === 403 && prod.calls === 0, 'production cannot mint a pass');
const nokey = await post({ action: 'mint' }, { providerKey: '' });
ok(nokey.status === 503 && nokey.calls === 0 && nokey.json.error.includes('not configured'), 'without the provider key, Grok is not called');
const minted = await post({ action: 'mint' });
ok(minted.status === 200 && minted.json.value.startsWith('xai-realtime-client-secret-') && minted.calls === 1, 'an allowlisted account can mint one pass');
ok(!JSON.stringify(minted.json).includes('xai-test-key'), 'the provider key is not in the response');
const shared = createMintLog();
let sharedCalls = 0;
const limitedDeps = ctx({
  now: 2_000_000,
  mints: shared,
  mint: async () => { sharedCalls += 1; return { value: 'xai-realtime-client-secret-shortPass1', expires_at: 99 }; },
}).deps;
for (let i = 0; i < 4; i++) {
  const res = await handleVoiceToken(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ action: 'mint' }) }), limitedDeps);
  ok(res.status === 200, 'pass ' + (i + 1) + ' is allowed');
}
const pausedRes = await handleVoiceToken(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ action: 'mint' }) }), limitedDeps);
ok(pausedRes.status === 429 && sharedCalls === 4, 'a fifth pass inside ten minutes is refused');
console.log(fail ? fail + ' failed' : 'voice token passed');
if (fail) process.exit(1);
