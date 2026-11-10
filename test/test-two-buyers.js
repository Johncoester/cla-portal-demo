/* Two buyers on one file. A blank owner does not let one buyer open the other's Personal information. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-buyer');
const ben = (await api.listTasks('deal-2')).find((t) => t.templateCode === 'personal_info' && t.assignedRole === 'Client-Buyer' && t.mine);
ok(ben, 'the first buyer has their own personal information task');
await api.signInDev('u-multi');
const morgan = (await api.listTasks('deal-2')).find((t) => t.templateCode === 'personal_info' && t.assignedRole === 'Client-Buyer' && t.mine);
ok(morgan && morgan.id !== ben.id, 'the second buyer has a different personal information task');

await api.signInDev('u-buyer');
let opened = '';
try { const t = await api.getTask(morgan.id); opened = t.formHidden ? 'hidden' : 'open'; } catch (e) { opened = e.message; }
ok(opened === 'hidden' || /not found|cannot|Not available/i.test(opened), 'the first buyer cannot open the second buyer\'s form');
let saved = '';
try { await api.saveTaskForm(morgan.id, { citizenship: 'U.S. Citizen' }); } catch (e) { saved = e.message; }
ok(/cannot|not found|Not available/i.test(saved), 'the first buyer cannot save the second buyer\'s form');
let ssn = '';
try { await api.savePartySsn(morgan.id, 'self', '900-12-3456'); } catch (e) { ssn = e.message; }
ok(/Not available|not found|cannot/i.test(ssn), 'the first buyer cannot save the second buyer\'s Social Security number');

await api.signInDev('u-admin');
const blank = await api.createTask('deal-2', { title: 'Personal information extra', assignedRole: 'Client-Buyer' });
await api.signInDev('u-buyer');
let blankSave = '';
try { await api.savePartySsn(blank.id, 'self', '900-12-3456'); } catch (e) { blankSave = e.message; }
ok(/Not available|not found|cannot/i.test(blankSave), 'a task with no participant is not a buyer\'s copy');

const sql = readFileSync('supabase/migrations/20261112060200_buyer_task_holder.sql', 'utf8');
const bodies = ['rpc_get_task_form', 'rpc_save_task_form', 'rpc_save_party_ssn', 'rpc_read_party_ssn'];
ok(bodies.every((name) => sql.includes(name)), 'all four functions are in the migration');
const copies = sql.split('t.participant_id is not null').length - 1;
ok(copies >= 4, 'each function requires the task participant to be present');
ok(!sql.slice(0, sql.indexOf('$readback$')).includes('assigned_role = any (private.deal_roles'), 'a blank owner is not granted to every client who holds that role');

console.log(fail ? fail + ' failed' : 'two buyers passed');
if (fail) process.exit(1);
