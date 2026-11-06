/* Edge-function decisions for buyer/seller invites. No network and no service key. */
import { checkBody, handleAcceptInvite, GENERIC } from '../supabase/functions/accept-invite/logic.mjs';
const token = 'ab'.repeat(32);
const secret = 'edge-test-pass-1';
let pass = 0, fails = 0;
const ok = (c, name) => { if (c) pass++; else { fails++; console.log('FAIL', name); } };
const req = (body, headers = {}) => new Request('https://example.test/accept-invite', {
  method: 'POST', headers: { origin: 'https://johncoester.github.io', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});
ok(checkBody({ kind: 'hr', token, password: secret }).ok === true, 'hr still accepts a password');
ok(checkBody({ kind: 'hr', token }).ok === false, 'hr still requires a password');
ok(checkBody({ kind: 'client', token, existing: true }).ok === true, 'an existing client login does not need a new password');
ok(checkBody({ kind: 'hr', token, password: secret, existing: true }).ok === false, 'existing is only for a buyer or seller');
ok(checkBody({ kind: 'client', token, password: 'short' }).ok === false, 'a new client password is at least 8 characters');
ok(checkBody({ kind: 'client', token: 'nope', password: secret }).ok === false, 'a short token is refused');

async function run(body, deps) {
  const calls = { create: 0, accept: 0, deleted: 0 };
  const res = await handleAcceptInvite(req(body), {
    sha256: async (t) => t,
    gate: async () => true,
    email: async () => 'wendy@example.test',
    createUser: async () => { calls.create += 1; return { id: 'new-user' }; },
    deleteUser: async () => { calls.deleted += 1; },
    sessionUser: async () => deps.session || null,
    accept: async (_k, _t, id, profile) => { calls.accept += 1; calls.user = id; calls.profile = profile; if (deps.reject) { const e = new Error(GENERIC); e.code = 'P0001'; throw e; } },
  });
  const payload = await res.json();
  return { status: res.status, payload, calls };
}

const linked = await run({ kind: 'client', token, existing: true }, { session: { id: 'outside-1', email: 'Wendy@example.test' } });
ok(linked.status === 200 && linked.payload.linked === true && linked.calls.create === 0 && linked.calls.accept === 1 && linked.calls.user === 'outside-1', 'existing account links without creating a user');
ok(linked.calls.profile.existing === true && linked.payload.error == null, 'existing accept does not return a password');

const mismatch = await run({ kind: 'client', token, existing: true }, { session: { id: 'ben', email: 'ben@example.test' } });
ok(mismatch.status === 400 && mismatch.payload.error === GENERIC && mismatch.calls.create === 0 && mismatch.calls.accept === 0, 'a different email cannot link');

const staff = await run({ kind: 'client', token, existing: true }, { session: { id: 'admin-1', email: 'wendy@example.test' }, reject: true });
ok(staff.status === 400 && staff.calls.create === 0 && staff.calls.deleted === 0 && staff.payload.error === GENERIC, 'a refused existing link does not create or delete a user');

const created = await run({ kind: 'client', token, password: secret }, {});
ok(created.status === 200 && created.calls.create === 1 && created.calls.accept === 1 && created.payload.ok === true && !JSON.stringify(created.payload).includes(secret), 'a new login is created from the invite email');

const taken = await run({ kind: 'client', token, password: secret }, { reject: true });
ok(taken.status === 400 && taken.calls.deleted === 1 && taken.payload.error === GENERIC, 'a failed new login is removed');

console.log(fails ? `FAILED ${fails}` : `ok ${pass}`);
process.exit(fails ? 1 : 0);
