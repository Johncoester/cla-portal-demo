/* FF-073a (Janine's video, Nov 12; Francis Feedback ticket): Joyce Wiggins accepted her buyer invite and set a password,
   and one second later accept-invite deleted her login. A duplicate submit (double-click or a second tab) failed at the
   accept step and its error cleanup removed the login the first submit had just linked.
   accept-invite must never delete an existing or just-claimed login. Every dependency is a fake. */
import { handleAcceptInvite, GENERIC } from '../supabase/functions/accept-invite/logic.mjs';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const TOKEN = 'd'.repeat(64);
const req = () => new Request('https://x.supabase.co/functions/v1/accept-invite', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'https://testportal.clatitle.com' },
  body: JSON.stringify({ kind: 'agent', token: TOKEN, password: 'long-enough-1', profile: { firstName: 'Joyce', lastName: 'Wiggins', cellPhone: '3015550100' } }) });

// A tiny in-memory Auth + profiles store shared by two requests, like two tabs hitting the same function.
function world({ stubInvited = true } = {}) {
  const users = new Map([['joyce-1', { email: 'buyer@example.com', invited: stubInvited }]]);
  const profiles = new Set();
  let accepted = false;
  const calls = { del: [] };
  const d = {
    sha256: async (t) => t, gate: async () => true, email: async () => 'buyer@example.com',
    createUser: async ({ email }) => { for (const u of users.values()) if (u.email === email) throw new Error('create'); users.set('new-x', { email, invited: false }); return { id: 'new-x' }; },
    findStub: async (email) => { for (const [id, u] of users) if (u.email === email) return { id, invited: u.invited, hasProfile: profiles.has(id) }; return null; },
    claimStub: async () => {},
    hasProfile: async (id) => profiles.has(id),
    deleteUser: async (id) => { calls.del.push(id); users.delete(id); },
    accept: async (kind, token, userId) => { if (accepted) throw new Error(GENERIC); accepted = true; profiles.add(userId); },
  };
  return { d, users, profiles, calls };
}

// 1. Two submits of the same invite: the first links the login, the second must not delete it.
let w = world();
const r1 = await handleAcceptInvite(req(), w.d);
const r2 = await handleAcceptInvite(req(), w.d);
ok(r1.status === 200, 'the first submit links the invite-only login');
ok(!w.calls.del.length && w.users.has('joyce-1') && w.profiles.has('joyce-1'), 'the duplicate submit never deletes the linked login (Joyce keeps her sign-in)');
ok(r2.status === 400 && (await r2.json()).error === GENERIC, 'a later duplicate submit is refused without touching the login (an already-used invite is never taken over)');

// 2. Race: the second request read the stub before the first linked it, then its accept fails. Still no delete.
w = world();
const slow = { ...w.d, accept: async (k, t, id) => { throw new Error(GENERIC); } };
await handleAcceptInvite(req(), w.d);   // first one links
const r3 = await handleAcceptInvite(req(), { ...slow, findStub: async () => ({ id: 'joyce-1', invited: true, hasProfile: false }) });
ok(!w.calls.del.length && w.users.has('joyce-1'), 'a stale read of the stub followed by a failed accept never deletes the login');
ok(r3.status === 200, 'that stale duplicate still answers ok because the profile is linked');

// 3. A login made in this same request whose accept fails, with no profile, is cleaned up as before.
const del = [];
let res = await handleAcceptInvite(req(), {
  sha256: async (t) => t, gate: async () => true, email: async () => 'new@example.com',
  createUser: async () => ({ id: 'fresh-1' }), deleteUser: async (id) => { del.push(id); }, hasProfile: async () => false,
  accept: async () => { throw Object.assign(new Error('Cell phone must be a 10-digit phone number.'), { code: '22023' }); },
});
ok(res.status === 400 && (await res.json()).error === 'Cell phone must be a 10-digit phone number.' && del[0] === 'fresh-1', 'a brand-new login from this request with no profile is removed so the person can try again');

// 4. If the profile check itself fails, nothing is deleted.
del.length = 0;
res = await handleAcceptInvite(req(), {
  sha256: async (t) => t, gate: async () => true, email: async () => 'new@example.com',
  createUser: async () => ({ id: 'fresh-2' }), deleteUser: async (id) => { del.push(id); }, hasProfile: async () => { throw new Error('down'); },
  accept: async () => { throw new Error('x'); },
});
ok(res.status === 400 && !del.length, 'when the profile check fails, the login is kept (never guess and delete)');

// 5. A claimed invite-only login whose form is rejected is kept, so the person can fix the form and resubmit.
w = world();
const r5 = await handleAcceptInvite(req(), { ...w.d, accept: async () => { throw Object.assign(new Error('Use the invited email.'), { code: '22023' }); } });
ok(r5.status === 400 && (await r5.json()).error === 'Use the invited email.' && !w.calls.del.length && w.users.has('joyce-1'), 'a rejected form never deletes a claimed invite-only login');
const r6 = await handleAcceptInvite(req(), w.d);
ok(r6.status === 200 && w.profiles.has('joyce-1'), 'the corrected resubmit then links the same login');

console.log(fail ? `FAIL ${fail}` : 'all accept-invite no-delete checks passed');
process.exit(fail ? 1 : 0);
