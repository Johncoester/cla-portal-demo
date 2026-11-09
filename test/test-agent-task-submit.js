/* Hosted commission task connection. A fake client stands in for the database. No hosted call and no outbox. */
import { readFileSync } from 'node:fs';
import { readHostedAgentTask, submitHostedAgentTask, hostedAgentTaskView } from '../js/data/agent-task-host.js';
import { pendingMine, shapeListedTask } from '../js/data/task-actions.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const adapter = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
ok(adapter.includes('submitHostedAgentTask'), 'the hosted adapter submits through submit_agent_task');
ok(adapter.includes('getAgentTask') && adapter.includes('readHostedAgentTask'), 'the hosted adapter reads through get_agent_task');
const host = readFileSync(new URL('../js/data/agent-task-host.js', import.meta.url), 'utf8');
ok(host.includes("rpc('submit_agent_task'") && host.includes("rpc('get_agent_task'") && !host.includes('queue_'), 'those two calls do not queue a message');

const calls = [];
const sb = { rpc(name, args) { calls.push(name); if (name === 'submit_agent_task' && args.p_answers.holdingEmd === 'No') return { data: 1, error: null }; if (name === 'get_agent_task') return { data: { id: args.p_task, title: 'Confirm Your Transaction Information', status: 'todo', answersHidden: false, answers: { commissions: [{ name: 'Listing commission' }] }, revisions: [] }, error: null }; return { data: null, error: { message: 'not this call' } }; } };
const before = await readHostedAgentTask(sb, 'task-commission');
ok(before.title === 'Confirm Your Transaction Information' && before.answers.commissions[0].name === 'Listing commission', 'the commission task is read from get_agent_task');
const n = await submitHostedAgentTask(sb, 'task-commission', { closingDate: '2026-12-01', purchasePrice: '10', emdAmount: '0', holdingEmd: 'No', commissions: [{ name: 'Listing commission', percent: '3', amount: '' }], fees: [], team: [] });
ok(n === 1 && calls.filter((c) => c.startsWith('queue_') || c.includes('outbox')).length === 0, 'submit_agent_task returns the revision number and does not write the outbox');

const denied = { rpc: async () => ({ data: null, error: { message: 'Only the agent this task is for can submit it.' } }) };
let msg = '';
try { await submitHostedAgentTask(denied, 'task-commission', {}); } catch (e) { msg = e.message; }
ok(msg === 'Only the agent this task is for can submit it.', 'another person cannot submit the commission task');
const hidden = { rpc: async () => ({ data: null, error: { message: 'Task not found' } }) };
try { await readHostedAgentTask(hidden, 'task-commission'); ok(false, 'hidden task'); } catch (e) { ok(e.message === 'Task not found', 'a task the caller cannot see stays Task not found'); }

const agent = { id: 'agent-1', role: 'Listing Agent', roles: ['Listing Agent'] };
const open = shapeListedTask({ id: 'task-commission', dealId: 'deal-1', kind: 'agent', status: 'todo', templateCode: 'agent_transaction_info', ownerProfileId: 'agent-1', participantId: 'part-1', assignedRole: 'Listing Agent' }, agent);
const done = shapeListedTask({ ...open, status: 'done' }, agent);
ok(pendingMine([open]).length === 1 && pendingMine([done]).length === 0, 'a finished commission task leaves the open count');
const view = hostedAgentTaskView({ id: 'task-commission', status: 'done', answers: { holdingEmd: 'No' }, answersHidden: false }, open);
ok(view.submitted === true && view.code === 'agent_transaction_info' && view.answers.holdingEmd === 'No', 'the page receives the saved commission answers');

console.log(fail ? fail + ' failed' : 'agent task submit passed');
if (fail) process.exit(1);
