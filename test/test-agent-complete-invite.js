/* V-4: an agent cannot mark a client's task complete.
   John, Nov 14 2026 (t1667u): a used invite goes straight to Sign in. The old test expected an
   "already used" page because that was the behavior Janine confirmed on Nov 13. John changed it. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { shapeListedTask } from '../js/data/task-actions.js';
import { toText } from '../js/ui.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const outside = { id: 'agent', role: 'Buyer Agent', roles: ['Buyer Agent'] };
const clientTask = shapeListedTask({ id: 't', kind: 'form', status: 'todo', assignedRole: 'Client-Buyer', ownerProfileId: 'buyer', participantId: 'p', title: 'Personal information' }, outside);
ok(clientTask.canComplete === false && clientTask.canTick === false && clientTask.canFill === false, 'a buyer agent is not given a complete control on a buyer task');
const own = shapeListedTask({ id: 'c', kind: 'simple', status: 'todo', assignedRole: 'Client-Buyer', ownerProfileId: null, participantId: null }, { id: 'buyer', role: 'Client-Buyer', roles: ['Client-Buyer'] });
ok(own.canComplete === true && own.canTick === true, 'the client can still complete their own unowned task');
const staff = shapeListedTask({ id: 't', kind: 'simple', status: 'todo', assignedRole: 'Client-Buyer', ownerProfileId: 'buyer', participantId: 'p' }, { id: 'proc', role: 'Processor', roles: ['Processor'] });
ok(staff.canComplete === true && staff.canTick === true, 'staff can still complete a client task');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-bagent');
const tasks = await api.listTasks('deal-1');
// FF-101a (Francis Nov 18, John confirmed 2:13 PM ET): agents no longer see client tasks on their side.
// V-4 still refuses completing a client task if one were opened; the list itself is own-tasks only.
ok(!tasks.some((t) => t.assignedRole === 'Client-Buyer' || t.forClient), 'the buyer agent no longer sees client forms on the file (FF-101a)');
ok(tasks.some((t) => t.assignedRole === 'Buyer Agent' && t.mine), 'the buyer agent still sees their own tasks');
const clientFormId = (await (async () => {
  await api.signInDev('u-proc');
  const all = await api.listTasks('deal-1');
  return (all.find((t) => t.assignedRole === 'Client-Buyer' && t.kind === 'form' && t.status !== 'done') || {}).id;
})());
ok(!!clientFormId, 'staff can still see a buyer form on the file');
await api.signInDev('u-bagent');
let hidden = '';
try { await api.getTask(clientFormId); } catch (e) { hidden = e.message; }
ok(/not found/i.test(hidden), 'opening a client task by id is refused for the agent');

await api.signInDev('u-buyer');
const mine = (await api.listTasks('deal-1')).find((t) => t.id === clientFormId);
ok(mine && mine.mine && mine.canComplete !== false, 'the buyer the task belongs to can still complete it');

const used = await api.getAgentInvite('demo-used-ai-1');
ok(used.status === 'accepted' && used.email === 'bianca.buyeragent@example.test', 'a used invite still carries the email');
let dest = '';
const signup = await import('../js/pages/agent-signup.js');
const view = await signup.render({ api, params: { token: 'demo-used-ai-1' }, go(p) { dest = p; } });
const text = toText(view.body);
ok(dest === '/login?email=bianca.buyeragent%40example.test' && view.redirect === dest, 'a used invite goes straight to Sign in with that email');
ok(!/already used/i.test(text) && !text.includes('data-invite-used') && !text.includes('data-invite-signin') && !/not valid/i.test(text) && !/expired/i.test(text), 'the used invite shows no error and no in-between page');
const existsApi = { getAgentInvite: async () => ({ status: 'exists', email: 'ada@example.test', firstName: 'Ada', lastName: 'Buyer', inviteKind: 'client' }) };
dest = '';
const existsView = await signup.render({ api: existsApi, params: { token: 'exists-token' }, go(p) { dest = p; } });
ok(dest === '/login?email=ada%40example.test' && existsView.redirect === dest && !/already used/i.test(toText(existsView.body)) && !/portal login/i.test(toText(existsView.body)), 'an email that already has a login takes the same path to Sign in');
const pending = await api.getAgentInvite('demo-lena-pending-0001');
ok(pending.status === 'pending', 'a pending invite still opens the setup form');
dest = '';
const pendingView = await signup.render({ api, params: { token: 'demo-lena-pending-0001' }, go(p) { dest = p; } });
const pendingText = toText(pendingView.body);
ok(/data-invite-state="pending"/.test(pendingText) && /Set up your agent account/.test(pendingText) && !/already used/i.test(pendingText) && !dest && !pendingView.redirect, 'a pending invite still opens registration, not login');
dest = '';
const expiredView = await signup.render({ api, params: { token: 'demo-expired-0001' }, go(p) { dest = p; } });
const expiredText = toText(expiredView.body);
ok(!dest && !expiredView.redirect && /data-invite-state="expired"/.test(expiredText) && /expired/i.test(expiredText) && /#\/login/.test(expiredText), 'an expired invite still explains itself and offers sign in');
dest = '';
const invalidView = await signup.render({ api, params: { token: 'not-a-real-token' }, go(p) { dest = p; } });
const invalidText = toText(invalidView.body);
ok(!dest && !invalidView.redirect && /data-invite-state="invalid"/.test(invalidText) && /not valid/i.test(invalidText), 'an unknown invite still says the link is not valid');
dest = '';
const revokedView = await signup.render({ api: { getAgentInvite: async () => ({ status: 'revoked', email: 'old@example.test' }) }, params: { token: 'revoked' }, go(p) { dest = p; } });
ok(!dest && !revokedView.redirect && /no longer active/i.test(toText(revokedView.body)), 'a revoked invite still says it is no longer active');
const appSrc = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
ok(/if \(view && view\.redirect\)/.test(appSrc) && appSrc.includes("import('./pages/agent-signup.js?v=202611302000')"), 'the router leaves for Sign in before drawing a used invite');

console.log(fail ? fail + ' failed' : 'agent complete and invite sign-in passed');
if (fail) process.exit(1);
