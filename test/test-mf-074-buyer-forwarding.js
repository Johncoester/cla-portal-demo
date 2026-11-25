/* MF-074 (Matt, Nov 25 2026): Forwarding Address is removed from Buyer Intake. Sellers keep it. */
import { readFileSync } from 'node:fs';
import { TEMPLATE_DEFS, fieldsForRole, applyPersonalV8, applyPersonalV9 } from '../js/data/templates.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const v8 = TEMPLATE_DEFS.find((t) => t.code === 'personal_info' && t.version === 8);
const v9 = TEMPLATE_DEFS.find((t) => t.code === 'personal_info' && t.version === 9);
ok(v9 && v8, 'personal_info v9 is published next to v8');
const buyer9 = fieldsForRole(v9.fields, 'Client-Buyer');
const seller9 = fieldsForRole(v9.fields, 'Client-Seller');
const buyer8 = fieldsForRole(v8.fields, 'Client-Buyer');
const seller8 = fieldsForRole(v8.fields, 'Client-Seller');
ok(!buyer9.some((f) => f.k === 'forwarding_address') && seller9.some((f) => f.k === 'forwarding_address'), 'v9 hides forwarding address from buyers and keeps it for sellers');
ok(buyer8.some((f) => f.k === 'forwarding_address') && seller8.some((f) => f.k === 'forwarding_address'), 'v8 is unchanged: both sides still have forwarding address');
ok(v9.fields.length === v8.fields.length, 'v9 keeps the same number of field definitions as v8');
ok(JSON.stringify((v9.fields.find((f) => f.k === 'forwarding_address') || {}).roles) === '["Client-Seller"]', 'v9 marks forwarding address as seller-only');

const sellerTask = TEMPLATE_DEFS.find((t) => t.code === 'forwarding_address' && t.version === 1);
ok(sellerTask && sellerTask.roles.includes('Client-Seller') && !sellerTask.roles.includes('Client-Buyer'), 'the standalone seller forwarding-address task is unchanged');

const d = { taskTemplates: [{ ...v8, id: 'tt-personal_info-v8', active: true }], tasks: [
  { id: 'saved', templateCode: 'personal_info', templateId: 'tt-personal_info-v8', kind: 'form', status: 'todo', savedAt: 'x', formData: { forwarding_address: '9 Next Street, Rockville, MD 20850' } },
  { id: 'fresh', templateCode: 'personal_info', templateId: 'tt-personal_info-v8', kind: 'form', status: 'todo', savedAt: null, formData: {} },
] };
const r = applyPersonalV9(d);
ok(r.added.length === 1 && r.moved === 1, 'v9 is added and only the untouched copy moves');
ok(d.tasks[0].templateId === 'tt-personal_info-v8' && d.tasks[0].formData.forwarding_address.includes('9 Next Street'), 'a buyer copy with a saved forwarding address stays on v8');
ok(d.tasks[1].templateVersion === 9 && d.tasks[1].templateId !== 'tt-personal_info-v8', 'the empty to-do copy moves to v9');
ok(applyPersonalV9(d).added.length === 0 && applyPersonalV9(d).moved === 0, 'running it again changes nothing');

// applyPersonalV8 still recognises v8 and does not treat v9 as v8
const onlyV7 = { taskTemplates: [{ ...TEMPLATE_DEFS.find((t) => t.code === 'personal_info' && t.version === 7), id: 'tt-v7', active: true }], tasks: [
  { id: 'a', templateCode: 'personal_info', templateId: 'tt-v7', kind: 'form', status: 'todo', savedAt: null, formData: {} },
] };
const toV8 = applyPersonalV8(onlyV7);
ok(toV8.added.length === 1 && onlyV7.tasks[0].templateVersion === 8, 'applyPersonalV8 still publishes v8 from a v7 copy');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const deal = await api.createDeal({ street: '16 Buyer Lane', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc' });
await api.addParticipant(deal.id, 'c-buyer', 'Client-Buyer');
await api.addParticipant(deal.id, 'c-seller', 'Client-Seller');
await api.signInDev('u-buyer');
const buyerTask = (await api.listTasks(deal.id)).find((t) => t.templateCode === 'personal_info' && t.assignedRole === 'Client-Buyer' && t.mine);
const buyerOpen = await api.getTask(buyerTask.id);
ok(buyerOpen.templateVersion === 9 && !buyerOpen.fields.some((f) => f.k === 'forwarding_address'), 'a new buyer Personal information task is v9 and has no forwarding address');
ok(buyerOpen.fields.some((f) => f.k === 'current_address'), 'the buyer current address question stays');
await api.signInDev('u-seller');
const sellerPi = (await api.listTasks(deal.id)).find((t) => t.templateCode === 'personal_info' && t.assignedRole === 'Client-Seller');
const sellerOpen = await api.getTask(sellerPi.id);
ok(sellerOpen.fields.some((f) => f.k === 'forwarding_address'), 'the seller Personal information task still has forwarding address');
const sellerFwd = (await api.listTasks(deal.id)).find((t) => t.templateCode === 'forwarding_address' && t.assignedRole === 'Client-Seller');
ok(sellerFwd, 'the standalone seller Forwarding address task is still created');

const sql = readFileSync('supabase/migrations/20261131080000_personal_info_v9.sql', 'utf8');
const roll = readFileSync('supabase/rollbacks/20261131080000_personal_info_v9.sql', 'utf8');
ok(/Client-Seller/.test(sql) && /task\.saved_at is null/.test(sql) && /drift: personal_info v8/.test(sql) && !/\bgrant\s+(select|insert|update|execute)\b/i.test(sql) && !/security definer/i.test(sql), 'the database file publishes v9 from v8, moves only untouched copies, and does not change grants or RLS');
ok(/version = 9/.test(roll) && /version = 8/.test(roll) && /forwarding_address task is not touched/.test(roll), 'the rollback returns untouched copies to v8 and leaves the seller task alone');

console.log(fail ? fail + ' failed' : 'mf-074 buyer forwarding passed');
if (fail) process.exit(1);
