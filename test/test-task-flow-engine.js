/* TB-2 Task Builder engine (John, Nov 13 2026; docs/specs/task-builder.md): conditions, steps (task, phone call task, wait,
 * stop if EMD received) and runs. Pure rules first, then the demo portal end to end. The database twin is test-task-flow-engine-sql.sh. */
import { readFileSync } from 'node:fs';
import { cleanSteps, cleanConditions, flowMatches, dealTxKind, advanceRun, newRun, mayStart, timeTriggerMet, stepText, cleanFlow, hasTaskStep, ASSIGN_ROLES } from '../js/data/task-builder.js';
import { createMockAdapter, STORAGE_KEY } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { render } from '../js/pages/task-builder.js';

globalThis.location = { origin: 'https://test.example', pathname: '/portal/', hash: '#/task-builder', reload() {} };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const err = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
const aerr = async (p) => { try { await p; return ''; } catch (e) { return e.message; } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

// roles John named (Nov 13), including the TC and the lender
ok(ASSIGN_ROLES.map(([v]) => v).join() === 'Processor,Preprocessor,Sales Person,Buyer Agent,Listing Agent,Client-Buyer,Client-Seller,Transaction Coordinator,Lender', 'tasks can go to the nine roles John named');

// steps
ok(/Step 2: give the task a name/.test(err(() => cleanSteps([{ type: 'wait', days: 1 }, { type: 'create_task', title: 'x', assignTo: 'Processor', dueDays: 1 }]))), 'a bad step is named by its number');
ok(/Step 1: choose who/.test(err(() => cleanSteps([{ type: 'call_task', title: 'Call the agent', assignTo: 'Janitor', dueDays: 1 }]))), 'an unknown role is refused');
ok(/0 to 60/.test(err(() => cleanSteps([{ type: 'create_task', title: 'Chase EMD', assignTo: 'Processor', dueDays: -1 }]))) && /1 to 60/.test(err(() => cleanSteps([{ type: 'wait', days: 0 }]))), 'due days 0-60, waits 1-60');
ok(/up to 20 steps/.test(err(() => cleanSteps(Array(21).fill({ type: 'stop_if_emd_received' })))), 'at most 20 steps');
const steps = cleanSteps([{ type: 'create_task', title: '  Chase   the EMD ', assignTo: 'Buyer Agent', dueDays: '1', extra: 'x' }, { type: 'wait', days: '1' }, { type: 'stop_if_emd_received' }, { type: 'call_task', title: 'Call about the EMD', assignTo: 'Processor', dueDays: '0' }]);
ok(JSON.stringify(steps[0]) === '{"type":"create_task","title":"Chase the EMD","assignTo":"Buyer Agent","dueDays":1}' && hasTaskStep(steps), 'steps are tidied and keep only their own fields');
ok(stepText(steps[0]) === 'Task for the buyer\'s agent: "Chase the EMD", due in 1 day' && stepText(steps[3]) === 'Phone call task for the processor: "Call about the EMD", due the same day', 'steps read in plain words');

// conditions
ok(JSON.stringify(cleanConditions({ transactionTypes: ['Purchase', 'Lease'], states: ['MD', 'TX'], salesPeople: ['u-sp', '<x>'] })) === '{"transactionTypes":["Purchase"],"states":["MD"],"salesPeople":["u-sp"]}', 'unknown condition values are dropped');
ok(dealTxKind({ transactionType: 'Refinance', loanAmount: 1 }) === 'Refinance' && dealTxKind({ transactionType: 'Purchase', loanAmount: 1 }) === 'Purchase' && dealTxKind({ transactionType: 'Purchase', loanAmount: null }) === 'Cash purchase', 'transaction type: refinance, purchase with a loan, cash purchase');
const md = { state: 'MD', transactionType: 'Purchase', loanAmount: 100 };
ok(flowMatches({}, md) && flowMatches({ states: ['MD', 'VA'] }, md) && !flowMatches({ states: ['VA'] }, md), 'an empty group means any; any value in a group matches');
ok(flowMatches({ states: ['MD'], salesPeople: ['u-sp'] }, md, ['u-sp']) && !flowMatches({ states: ['MD'], salesPeople: ['u-sp'] }, md, ['u-team']), 'every filled group must match');

// the engine
const flow = { id: 'f', active: true, trigger: 'emd_not_received', triggerDays: 2, conditions: {}, steps };
const deal = { id: 'd', status: 'Open', openDate: '2026-11-10', emdReceived: false, state: 'MD' };
ok(timeTriggerMet(flow, deal, '2026-11-12') && !timeTriggerMet(flow, deal, '2026-11-11') && !timeTriggerMet(flow, { ...deal, emdReceived: true }, '2026-11-20') && !timeTriggerMet(flow, { ...deal, status: 'Closed' }, '2026-11-20'), 'EMD not received after 2 days: open files only, not once received');
ok(timeTriggerMet({ trigger: 'days_before_closing', triggerDays: 3 }, { status: 'Open', closingDate: '2026-11-15' }, '2026-11-12') && !timeTriggerMet({ trigger: 'days_before_closing', triggerDays: 3 }, { status: 'Open', closingDate: '2026-11-15' }, '2026-11-11') && !timeTriggerMet({ trigger: 'days_before_closing', triggerDays: 3 }, { status: 'Open', closingDate: '2026-11-15' }, '2026-11-16'), 'days before closing: from N days out until closing day');
const run = newRun(flow, 'd', '2026-11-12T12:00:00.000Z');
let made = advanceRun(run, flow, { deal, emdReceived: false, nowIso: '2026-11-12T12:00:00.000Z' });
ok(made.length === 1 && made[0].dueDate === '2026-11-13' && run.status === 'waiting' && run.nextAt === '2026-11-13T12:00:00.000Z', 'step 1 makes the task, step 2 waits a day');
ok(advanceRun(run, flow, { deal, emdReceived: false, nowIso: '2026-11-13T11:59:00.000Z' }).length === 0, 'nothing happens before the wait is over');
made = advanceRun(run, flow, { deal, emdReceived: false, nowIso: '2026-11-13T12:00:00.000Z' });
ok(made.length === 1 && made[0].call && run.status === 'done', 'still no EMD: the phone call task, then the run finishes');
const run2 = newRun(flow, 'd', '2026-11-12T12:00:00.000Z'); advanceRun(run2, flow, { deal, emdReceived: false, nowIso: '2026-11-12T12:00:00.000Z' });
ok(advanceRun(run2, flow, { deal, emdReceived: true, nowIso: '2026-11-14T00:00:00.000Z' }).length === 0 && run2.status === 'stopped', 'EMD received: the flow stops before the call task');
const run3 = newRun(flow, 'd', '2026-11-12T12:00:00.000Z');
ok(advanceRun(run3, { ...flow, conditions: { states: ['VA'] } }, { deal, nowIso: '2026-11-12T12:00:00.000Z' }).length === 0 && run3.status === 'skipped', 'a file that does not match is skipped');
ok(!mayStart(flow, [{ flowId: 'f', status: 'done' }]) && mayStart({ ...flow, trigger: 'closing_date_set' }, [{ flowId: 'f', status: 'done' }]) && !mayStart({ ...flow, trigger: 'closing_date_set' }, [{ flowId: 'f', status: 'waiting' }]), 'once per file; a closing date change can start it again after it ended');

// the demo portal, end to end
const storage = mem();
const api = createMockAdapter({ storage, sessionStorage: mem() });
await api.signInDev('u-admin');
ok(/Add at least one/.test(await aerr(api.setTaskFlowActive((await api.createTaskFlow({ name: 'Empty', trigger: 'order_opened' })).id, true))), 'a flow with no task step cannot be turned on');
const later = await api.createTaskFlow({ name: 'Contract in', trigger: 'contract_received', steps: [{ type: 'create_task', title: 'Review the contract', assignTo: 'Processor', dueDays: 1 }] });
ok(/cannot be turned on yet/.test(await aerr(api.setTaskFlowActive(later.id, true))), 'contract received cannot be turned on yet');
const emd = await api.createTaskFlow({ name: 'EMD reminder', trigger: 'emd_not_received', triggerDays: 2, conditions: { transactionTypes: ['Purchase'], states: ['MD'] }, steps });
await api.setTaskFlowActive(emd.id, true);
ok(/Add at least one/.test(await aerr(api.updateTaskFlow(emd.id, { name: 'EMD reminder', trigger: 'emd_not_received', triggerDays: 2, steps: [] }))), 'an On flow cannot lose its last task step');
const r1 = await api.runTaskFlowsNow();
const tasks1 = (await api.listTasks('deal-1')).filter((t) => t.title === 'Chase the EMD');
ok(r1.started >= 1 && tasks1.length >= 1 && tasks1.every((t) => t.assignedRole === 'Buyer Agent' && /Added by the "EMD reminder" flow/.test(t.description)), 'Check files now starts the EMD flow on old open files and gives the buyer\'s agents a task');
const listed = await api.listTaskFlows();
ok(listed.runs.some((r) => r.fileNumber === 'MD-26-97183' && r.status === 'waiting') && !listed.runs.some((r) => r.dealId === 'deal-3'), 'the run waits on deal-1; the closed file never starts');
ok((await api.runTaskFlowsNow()).tasks === 0, 'checking again before the wait is over does nothing');

// order opened: the task appears after Place Order has added the people
const welcome = await api.createTaskFlow({ name: 'Welcome call', trigger: 'order_opened', steps: [{ type: 'call_task', title: 'Welcome call to the processor', assignTo: 'Processor', dueDays: 0 }] });
await api.setTaskFlowActive(welcome.id, true);
await api.signInDev('u-proc');
const d0 = JSON.parse(storage.getItem(STORAGE_KEY)).deals.find((x) => x.id === 'deal-1');
const created = await api.createDeal({ street: '1 Test Way', city: 'Rockville', state: 'MD', zip: '20850', county: 'Montgomery', transactionType: 'Purchase', purchasePrice: 400000, loanAmount: 300000, emdAmount: 5000, closingDate: '2027-01-15', processorId: 'u-proc' });
const nd = await api.getDeal(created.id);
ok(nd && (await api.listTasks(created.id)).some((t) => t.title === 'Welcome call to the processor'), 'a new order gets the welcome call task once its processor is on the file');
ok(!!d0, 'fake data has deal-1');
await api.signInDev('u-admin');
const runsAfter = (await api.listTaskFlows()).runs.filter((r) => r.flowId === welcome.id);
ok(runsAfter.length === 1 && runsAfter[0].status === 'done', 'the welcome flow ran once on the new order');

// the page
const page = await render({ api, user: { id: 'u-admin', role: 'Super admin', isAdmin: true, status: 'active' }, refresh() {} });
const body = toText(page.body);
ok(body.includes('Chase the EMD') && body.includes('Purchase (with a loan)') === false && body.includes('Purchase; MD') && body.includes('data-tb-run='), 'the page lists each flow\'s steps, which files, and recent runs');

// migrations are present and unapplied
const mig = readFileSync(new URL('../supabase/migrations/20261121010000_task_flow_engine.sql', import.meta.url), 'utf8');
ok(/exception when others then/.test(mig) && /zz_task_flow_events after insert or update of emd_received, closing_date on public\.deals/.test(mig), 'the deals trigger never stops an order from saving');
ok(/cron\.schedule\('task-flows-every-15-min', '\*\/15 \* \* \* \*'/.test(mig), 'the database checks every 15 minutes');
ok(cleanFlow({ name: 'Abc', trigger: 'order_opened', steps }).steps.length === 4, 'cleanFlow carries the steps');

console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
