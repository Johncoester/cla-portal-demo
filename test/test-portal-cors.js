/* Both portal origins are named exactly. A third origin is not, and * is never sent. */
import { corsHeaders, PORTAL_ORIGINS } from '../supabase/functions/voice-token/logic.mjs';
import { corsFor, handleAcceptInvite, PORTAL_ORIGINS as inviteOrigins } from '../supabase/functions/accept-invite/logic.mjs';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const OLD = 'https://johncoester.github.io';
const NEXT = 'https://testportal.clatitle.com';
ok(PORTAL_ORIGINS.join() === [OLD, NEXT].join() && inviteOrigins.join() === PORTAL_ORIGINS.join(), 'voice and invites name the same two origins');
for (const origin of [OLD, NEXT]) {
  const voice = corsHeaders(origin);
  const invite = corsFor(origin);
  ok(voice['Access-Control-Allow-Origin'] === origin && !String(voice['Access-Control-Allow-Origin']).includes('*'), 'voice echoes ' + origin);
  ok(invite.allow === true && invite.headers['Access-Control-Allow-Origin'] === origin, 'invites echo ' + origin);
}
const badVoice = corsHeaders('https://evil.example');
const badInvite = corsFor('https://clatitle.com');
ok(!badVoice['Access-Control-Allow-Origin'] && badInvite.allow === false, 'a different host is refused');
ok(!corsHeaders(OLD + '.evil.com')['Access-Control-Allow-Origin'], 'a lookalike host is refused');

const deps = { called: 0, async sha256(t) { return t; }, async gate() { this.called += 1; return true; }, async email() { return 'person@example.test'; }, async createUser() { this.called += 1; return { id: 'user' }; }, async deleteUser() {}, async accept() { this.called += 1; } };
const token = 'a'.repeat(64);
const req = (origin) => new Request('https://example.test', { method: 'POST', headers: origin ? { origin } : {}, body: JSON.stringify({ kind: 'agent', token, password: 'longpassword' }) });
const oldRes = await handleAcceptInvite(req(OLD), deps);
ok(oldRes.status === 200 && oldRes.headers.get('access-control-allow-origin') === OLD, 'the current Pages origin can still finish an invite');
const nextRes = await handleAcceptInvite(req(NEXT), deps);
ok(nextRes.status === 200 && nextRes.headers.get('access-control-allow-origin') === NEXT, 'the test portal origin is allowed the same way');
const before = deps.called;
const blocked = await handleAcceptInvite(req('https://evil.example'), deps);
ok(blocked.status === 403 && deps.called === before, 'a foreign origin is stopped before any invite work');
const opt = await handleAcceptInvite(new Request('https://example.test', { method: 'OPTIONS', headers: { origin: NEXT } }), deps);
ok(opt.status === 204 && opt.headers.get('access-control-allow-origin') === NEXT, 'a preflight from the test portal is allowed');
console.log(fail ? fail + ' failed' : 'portal cors passed');
if (fail) process.exit(1);
