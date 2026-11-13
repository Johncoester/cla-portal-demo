/* FF-066 #6 (Janine's Nov 12 video; Francis confirm-back Nov 12 6:14 PM ET): the seller proceeds acknowledgment lives in the proceeds task. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { intakeFormHtml } from '../js/pages/dealtaskform.js';
import { toText } from '../js/ui.js';
import { TEMPLATE_DEFS, applyProceedsMove, PROCEEDS_WIRE_NOTE } from '../js/data/templates.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const deal = await api.createDeal({ street: '9 Proceeds Way', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc' });
await api.addParticipant(deal.id, 'c-seller', 'Client-Seller');
await api.signInDev('u-seller');
const tasks = await api.listTasks(deal.id);
const proceeds = await api.getTask(tasks.find((t) => t.templateCode === 'seller_proceeds' && t.mine).id);
const personal = await api.getTask(tasks.find((t) => t.templateCode === 'personal_info' && t.mine).id);
const keys = proceeds.fields.map((f) => f.k);
ok(keys.includes('proceeds_wire_note') && keys.includes('proceeds_statement') && keys.includes('proceeds_ack'), 'the proceeds task has the wire note, statement and checkbox');
ok(keys.indexOf('proceeds_ack') > keys.indexOf('method') && keys[keys.length - 1] === 'notes', 'they sit after the payout questions, before notes');
ok(proceeds.fields.find((f) => f.k === 'proceeds_ack').req === true, 'the checkbox is required');
ok(proceeds.fields.find((f) => f.k === 'proceeds_wire_note').text === PROCEEDS_WIRE_NOTE && /\$5,000\.00 or more/.test(PROCEEDS_WIRE_NOTE), 'the $5,000 wire note');
ok(!personal.fields.some((f) => f.k === 'proceeds_ack' || f.k === 'proceeds_statement'), 'Personal information no longer has it');
ok(personal.fields.some((f) => f.k === 'water_meter') && personal.fields.some((f) => f.k === 'citizenship'), 'Personal information keeps the seller questions');
const html = toText(intakeFormHtml({ ...proceeds, canFill: true }, { page: true, state: 'MD' }));
ok(html.includes(PROCEEDS_WIRE_NOTE) && html.includes('I acknowledge and understand the above statement.'), 'the seller sees the note and the checkbox');

let blocked = '';
try { await api.saveTaskForm(proceeds.id, { method: 'Check at settlement', settlement_ack: true }, { complete: true }); } catch (e) { blocked = e.message; }
ok(blocked.includes('I acknowledge'), 'cannot submit without the checkbox');
const done = await api.saveTaskForm(proceeds.id, { method: 'Check at settlement', settlement_ack: true, proceeds_ack: true }, { complete: true });
ok(done.status === 'done' && done.formData.proceeds_ack === true, 'submits with the checkbox');

// Existing answers stay: a copy on the old version with saved answers keeps its version and answers; an untouched copy moves.
const old = TEMPLATE_DEFS.find((t) => t.code === 'personal_info' && t.version === 6);
const d = { taskTemplates: [{ ...old, id: 'tt-personal_info-v6', active: true }, { ...TEMPLATE_DEFS.find((t) => t.code === 'seller_proceeds' && t.version === 1), id: 'tt-seller_proceeds-v1', active: true }],
  tasks: [{ id: 'a', templateCode: 'personal_info', templateId: 'tt-personal_info-v6', kind: 'form', status: 'done', savedAt: 'x', formData: { proceeds_ack: true, full_name: 'S' } },
          { id: 'b', templateCode: 'personal_info', templateId: 'tt-personal_info-v6', kind: 'form', status: 'todo', savedAt: null, formData: {} },
          { id: 'c', templateCode: 'seller_proceeds', templateId: 'tt-seller_proceeds-v1', kind: 'form', status: 'todo', savedAt: 'x', formData: { method: 'Wire' } }] };
const r = applyProceedsMove(d);
ok(r.added.length === 2 && r.moved === 1, 'publishes two versions and moves only the untouched copy');
ok(d.tasks[0].templateId === 'tt-personal_info-v6' && d.tasks[0].formData.proceeds_ack === true, 'an answered copy keeps its version and its acknowledgment');
ok(d.tasks[2].templateId === 'tt-seller_proceeds-v1' && d.tasks[2].formData.method === 'Wire', 'an answered proceeds copy keeps its answers');
ok(d.tasks[1].templateVersion === 7, 'an untouched copy moves to the new Personal information');
ok(applyProceedsMove(d).added.length === 0, 'running it again changes nothing');

const sql = readFileSync(new URL('../supabase/migrations/20261117040000_proceeds_ack_move.sql', import.meta.url), 'utf8');
ok(/drift/.test(sql) && /pi_active is distinct from 6/.test(sql) && /task\.saved_at is null/.test(sql) && /form_data, '\{\}'::jsonb\) = '\{\}'::jsonb/.test(sql), 'the migration checks versions and only moves untouched copies');
ok(sql.includes(PROCEEDS_WIRE_NOTE), 'the database uses the same wire note');
ok(!/policy|grant /i.test(sql.replace(/No policy, grant or function changes\./, '')), 'no policy or grant changes');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('proceeds ack passed');
