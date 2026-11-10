/* V-4: an agent cannot mark a client's task complete. V-6: a used invite opens Sign in with the email. */
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
const buyerForm = tasks.find((t) => t.forClient && t.assignedRole === 'Client-Buyer' && t.kind === 'form' && t.status !== 'done');
ok(!!buyerForm && buyerForm.canComplete === false && !buyerForm.canTick, 'the buyer agent sees the client form without a complete control');
const before = buyerForm.status;
let refused = '';
try { await api.saveTaskForm(buyerForm.id, {}, { complete: true }); } catch (e) { refused = e.message; }
ok(/only complete tasks assigned to you/i.test(refused), 'saving the form as complete is refused');
const again = (await api.listTasks('deal-1')).find((t) => t.id === buyerForm.id);
ok(again.status === before, 'the client task status stays unchanged');

await api.signInDev('u-buyer');
const mine = (await api.listTasks('deal-1')).find((t) => t.id === buyerForm.id);
ok(mine && mine.mine && mine.canComplete !== false, 'the buyer the task belongs to can still complete it');

const used = await api.getAgentInvite('demo-used-ai-1');
ok(used.status === 'accepted' && used.email === 'bianca.buyeragent@example.test', 'a used invite still carries the email');
let dest = '';
const signup = await import('../js/pages/agent-signup.js');
const view = await signup.render({ api, params: { token: 'demo-used-ai-1' }, go(p) { dest = p; } });
ok(dest === '/login?email=bianca.buyeragent%40example.test', 'the used invite opens Sign in with that email');
const text = toText(view.body);
ok(text.includes('data-invite-redirect="signin"') && !/account exists/i.test(text) && !/already used/i.test(text), 'the used invite does not show Account exists');
const pending = await api.getAgentInvite('demo-lena-pending-0001');
ok(pending.status === 'pending', 'a pending invite still opens the setup form');

console.log(fail ? fail + ' failed' : 'agent complete and invite sign-in passed');
if (fail) process.exit(1);
