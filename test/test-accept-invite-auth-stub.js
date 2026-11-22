/* accept-invite (John, Nov 11): the invite email now comes from TEST Auth (testportal@clatitle.com), which makes an invite-only login first.
   Accepting claims that login only when Auth invited it and it never became a portal user. Every dependency is a fake. */
import { handleAcceptInvite, GENERIC, PORTAL_ORIGINS } from '../supabase/functions/accept-invite/logic.mjs';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const TOKEN = 'c'.repeat(64);
const req = (origin = 'https://testportal.clatitle.com') => new Request('https://x.supabase.co/functions/v1/accept-invite', { method: 'POST', headers: { 'Content-Type': 'application/json', origin },
  body: JSON.stringify({ kind: 'agent', token: TOKEN, password: 'long-enough-1', profile: { firstName: 'Bea', lastName: 'Buyer', cellPhone: '3015550100' } }) });
function deps({ exists = false, stub = null, acceptError = null } = {}) {
  const calls = { create: 0, claim: [], del: [], accept: [] };
  return { calls, d: {
    sha256: async (t) => t, gate: async () => true, email: async () => 'testbuyerjohnc@gmail.com',
    createUser: async () => { calls.create += 1; if (exists) throw new Error('create'); return { id: 'new-1' }; },
    findStub: async () => stub, claimStub: async (id, pw) => { calls.claim.push({ id, pw }); },
    deleteUser: async (id) => { calls.del.push(id); },
    accept: async (kind, token, userId) => { calls.accept.push(userId); if (acceptError) throw acceptError; },
  } };
}
const go = async (o, origin) => { const f = deps(o); const res = await handleAcceptInvite(req(origin), f.d); return { res, j: await res.json(), calls: f.calls }; };

ok(PORTAL_ORIGINS.includes('https://testportal.clatitle.com'), 'the test portal origin is allowed (matches the deployed function)');
let r = await go();
ok(r.res.status === 200 && r.calls.accept[0] === 'new-1' && !r.calls.claim.length, 'no earlier login: a new login is created as before');
r = await go({ exists: true, stub: { id: 'stub-1', invited: true, hasProfile: false } });
ok(r.res.status === 200 && r.calls.claim[0].id === 'stub-1' && r.calls.claim[0].pw === 'long-enough-1' && r.calls.accept[0] === 'stub-1', 'an Auth invite-only login is claimed with the chosen password and linked');
r = await go({ exists: true, stub: { id: 'real-1', invited: false, hasProfile: true } });
ok(r.res.status === 400 && r.j.error === GENERIC && !r.calls.claim.length && !r.calls.accept.length, 'an existing real login is never taken over');
r = await go({ exists: true, stub: { id: 'used-1', invited: true, hasProfile: true } });
ok(r.res.status === 400 && !r.calls.claim.length, 'an invite login that already became a portal user is never taken over');
r = await go({ exists: true, stub: null });
ok(r.res.status === 400 && !r.calls.claim.length, 'an unknown existing login is refused');
r = await go({ exists: true, stub: { id: 'stub-2', invited: true, hasProfile: false }, acceptError: Object.assign(new Error('Cell phone must be a 10-digit phone number.'), { code: '22023' }) });
// FF-073a (Nov 12): a claimed invite-only login is no longer deleted on a rejected form. It stays invited with no profile,
// so the person can still try again (the next submit claims it again), and a duplicate submit can no longer delete a linked login.
ok(r.res.status === 400 && r.j.error === 'Cell phone must be a 10-digit phone number.' && !r.calls.del.length, 'a rejected form keeps the invite-only login so the person can try again');
r = await go({}, 'https://evil.example');
ok(r.res.status === 403 && !r.calls.create, 'other origins are refused');

console.log(fail ? `FAIL ${fail}` : 'all accept-invite auth stub checks passed');
process.exit(fail ? 1 : 0);
