/* TC-VIS-1. John Coester, Nov 20 2026 (standing rule) and Nov 21 2026: a transaction coordinator sees everything
 * their agent sees on the file, open and closed tasks, commissions and other agent fees. This covers the screen:
 * the coordinator's My Tasks keeps the agent's tasks, and the mock adapter treats a coordinator put on the file
 * by hand (no link) the same as the database does. Fake data only. */
import { readFileSync } from 'node:fs';
import { shapeListedTask } from '../js/data/task-actions.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const tc = { id: 'p-tc', role: 'Outside user' };
const agentTask = { id: 't1', assignedRole: 'Buyer Agent', ownerProfileId: 'p-agent', participantId: 'dp-agent', kind: 'agent', status: 'todo' };
const doneForm = { id: 't2', assignedRole: 'Buyer Agent', ownerProfileId: 'p-agent', participantId: 'dp-agent', kind: 'form', status: 'done' };
const noLogin = { id: 't3', assignedRole: 'Buyer Agent', ownerProfileId: null, participantId: 'dp-nologin', kind: 'form', status: 'todo' };
const otherSide = { id: 't4', assignedRole: 'Listing Agent', ownerProfileId: 'p-la', participantId: 'dp-la', kind: 'agent', status: 'todo' };
const client = { id: 't5', assignedRole: 'Client-Buyer', ownerProfileId: 'p-buyer', participantId: 'dp-buyer', kind: 'simple', status: 'todo' };
const asTc = (t) => shapeListedTask(t, tc, { myParticipantIds: ['dp-tc'], fileRoles: ['Buyer Agent TC'] });

const a = asTc(agentTask);
ok(a.mine && a.forAgent && !a.notYours, 'the buyer agent\'s open task is the coordinator\'s to work, marked as for their agent');
const f = asTc(doneForm);
ok(f.mine && f.forAgent && f.canFill, 'the agent\'s finished form is listed for the coordinator and can be opened');
const n = asTc(noLogin);
ok(n.mine && n.forAgent && n.canFill, 'an agent with no login: the coordinator fills in their form');
ok(!asTc(otherSide).mine && !asTc(otherSide).forAgent, 'the other side\'s agent task is not the coordinator\'s');
ok(!asTc(client).mine && !asTc(client).forAgent, 'the buyer\'s own task is not the coordinator\'s');
const lister = shapeListedTask(agentTask, tc, { myParticipantIds: ['dp-tc'], fileRoles: ['Listing Agent TC'] });
ok(!lister.mine && !lister.forAgent, 'a listing-side coordinator does not get the buyer agent\'s task');

// E2E-FIX-C stays: a second buyer's agent (not a coordinator) does not get the first agent's own copy.
const second = shapeListedTask(agentTask, { id: 'p-agent2', role: 'Outside user' }, { myParticipantIds: ['dp-agent2'], fileRoles: ['Buyer Agent'] });
ok(!second.mine && !second.forAgent, 'a second buyer\'s agent still sees only their own copy');
const own = shapeListedTask(agentTask, { id: 'p-agent', role: 'Outside user' }, { myParticipantIds: ['dp-agent'], fileRoles: ['Buyer Agent'] });
ok(own.mine && !own.forAgent, 'the agent\'s own task is still theirs, not marked as for an agent');

// Mock adapter: a coordinator put on the file by hand, with no link to the agent.
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const login = await api.adminCreateUser({ firstName: 'Tess', lastName: 'Handadded', email: 'tess.handtc@example.test', phone: '301-555-0177', role: 'Outside user', contactType: 'realtor' });
await api.signInDev('u-proc');
const tess = (await api.listContacts()).find((c) => c.profileId === login.id);
await api.addParticipant('deal-1', tess.id, 'Buyer Agent TC');
await api.signInDev(login.id);
const deal = await api.getDeal('deal-1');
ok((deal.myRoles || []).includes('Buyer Agent'), 'on the file by hand, the coordinator acts as the buyer\'s agent');
const tasks = await api.listTasks('deal-1');
const agents = tasks.filter((t) => t.assignedRole === 'Buyer Agent' && t.ownerId === 'u-bagent');
ok(agents.length > 0 && agents.every((t) => t.mine), 'the coordinator sees the buyer agent\'s tasks as theirs to work');
ok(!tasks.some((t) => t.assignedRole === 'Listing Agent' && t.mine), 'and none of the listing agent\'s');

const mig = readFileSync(new URL('../supabase/migrations/20261126990000_tc_sees_agent_file.sql', import.meta.url), 'utf8');
ok(/x\.role in \('Buyer Agent TC', 'Listing Agent TC'\)/.test(mig) && mig.includes("tc_for_agent.role || ' TC'"), 'the database treats a coordinator on the file like a linked one');
ok(mig.includes('language plpgsql') && mig.includes('drift:'), 'the per-file check keeps its plan between calls, and the file stops on drift');
console.log(fail ? `tc-vis-1: ${fail} failed` : 'tc-vis-1 passed');
if (fail) process.exit(1);
