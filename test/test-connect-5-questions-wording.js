/* CONNECT-5 (rows 2.1, 2.2): Yes/No wording on Personal information, Seller Proceeds instructions,
 * and a buyer's visible task list matches the active buyer templates. */
import { readFileSync } from 'node:fs';
import { TEMPLATE_DEFS, fieldsForRole, applyPersonalV9, applyConnect5Questions, CONNECT5_PI_LABELS, PROCEEDS_METHOD_V3, PROCEEDS_STATEMENT_V3 } from '../js/data/templates.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { intakeFormHtml } from '../js/pages/dealtaskform.js';
import { toText } from '../js/ui.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const v9 = TEMPLATE_DEFS.find((t) => t.code === 'personal_info' && t.version === 9);
const v10 = TEMPLATE_DEFS.find((t) => t.code === 'personal_info' && t.version === 10);
const sp2 = TEMPLATE_DEFS.find((t) => t.code === 'seller_proceeds' && t.version === 2);
const sp3 = TEMPLATE_DEFS.find((t) => t.code === 'seller_proceeds' && t.version === 3);
ok(v9 && v10 && sp2 && sp3, 'personal_info v10 and seller_proceeds v3 are published next to the previous versions');
ok(v10.fields.length === v9.fields.length, 'v10 keeps the same number of field definitions as v9');
ok(sp3.fields.length === sp2.fields.length, 'seller_proceeds v3 keeps the same number of fields as v2');

for (const [k, label] of Object.entries(CONNECT5_PI_LABELS)) {
  ok(v10.fields.some((f) => f.k === k && f.label === label), `v10 uses the new label for ${k}`);
  ok(v9.fields.some((f) => f.k === k && f.label !== label), `v9 keeps the previous label for ${k}`);
}

const buyer10 = fieldsForRole(v10.fields, 'Client-Buyer');
const seller10 = fieldsForRole(v10.fields, 'Client-Seller');
ok(!buyer10.some((f) => f.k === 'forwarding_address') && seller10.some((f) => f.k === 'forwarding_address'), 'v10 still hides forwarding address from buyers and keeps it for sellers');
ok(JSON.stringify((v10.fields.find((f) => f.k === 'forwarding_address') || {}).roles) === '["Client-Seller"]', 'v10 keeps forwarding address seller-only (MF-074)');
ok((v10.fields.find((f) => f.k === 'citizenship') || {}).type === 'text', 'v10 leaves citizenship as a typed line (MF-073 later)');
ok((v10.fields.find((f) => f.k === 'primary_residence') || {}).roleLabels['Client-Seller'] === 'Is the property your primary residence?', 'the seller primary-residence wording is unchanged');
ok(buyer10.some((f) => f.k === 'survey' && f.label === 'Wants survey?') && !seller10.some((f) => f.k === 'survey'), 'survey stays buyer-only');
ok(buyer10.some((f) => f.k === 'md_first_time' && f.states && f.states[0] === 'MD') && !seller10.some((f) => f.k === 'md_first_time'), 'the Maryland first-time question stays buyer-only and MD-only');

const method3 = sp3.fields.find((f) => f.k === 'method');
const method2 = sp2.fields.find((f) => f.k === 'method');
ok(method3.label === PROCEEDS_METHOD_V3 && method2.label !== PROCEEDS_METHOD_V3, 'seller_proceeds v3 uses the new Proceeds Instructions label; v2 is unchanged');
ok(JSON.stringify(method3.opts) === JSON.stringify(method2.opts), 'proceeds options (including Check at settlement) are unchanged');
ok(sp3.fields.find((f) => f.k === 'proceeds_statement').text === PROCEEDS_STATEMENT_V3, 'the proceeds acknowledgment uses the SELLER OF RECORD wording');

const d = { taskTemplates: [
  { ...v9, id: 'tt-personal_info-v9', active: true },
  { ...sp2, id: 'tt-seller_proceeds-v2', active: true },
], tasks: [
  { id: 'saved-pi', templateCode: 'personal_info', templateId: 'tt-personal_info-v9', kind: 'form', status: 'todo', savedAt: 'x', formData: { attending_closing: 'Yes' } },
  { id: 'fresh-pi', templateCode: 'personal_info', templateId: 'tt-personal_info-v9', kind: 'form', status: 'todo', savedAt: null, formData: {} },
  { id: 'saved-sp', templateCode: 'seller_proceeds', templateId: 'tt-seller_proceeds-v2', kind: 'form', status: 'todo', savedAt: 'x', formData: { method: 'Wire transfer' } },
  { id: 'fresh-sp', templateCode: 'seller_proceeds', templateId: 'tt-seller_proceeds-v2', kind: 'form', status: 'todo', savedAt: null, formData: {} },
] };
const r = applyConnect5Questions(d);
ok(r.added.length === 2 && r.moved === 2, 'v10 and v3 are added and only the untouched copies move');
ok(d.tasks[0].templateId === 'tt-personal_info-v9' && d.tasks[0].formData.attending_closing === 'Yes', 'a personal_info copy with answers stays on v9');
ok(d.tasks[1].templateVersion === 10, 'the empty personal_info to-do moves to v10');
ok(d.tasks[2].templateId === 'tt-seller_proceeds-v2' && d.tasks[2].formData.method === 'Wire transfer', 'a proceeds copy with answers stays on v2');
ok(d.tasks[3].templateVersion === 3, 'the empty proceeds to-do moves to v3');
ok(applyConnect5Questions(d).added.length === 0 && applyConnect5Questions(d).moved === 0, 'running it again changes nothing');

// applyPersonalV9 still recognises v9 and does not treat v10 as v9
const onlyV8 = { taskTemplates: [{ ...TEMPLATE_DEFS.find((t) => t.code === 'personal_info' && t.version === 8), id: 'tt-v8', active: true }], tasks: [
  { id: 'a', templateCode: 'personal_info', templateId: 'tt-v8', kind: 'form', status: 'todo', savedAt: null, formData: {} },
] };
const toV9 = applyPersonalV9(onlyV8);
ok(toV9.added.length === 1 && onlyV8.tasks[0].templateVersion === 9, 'applyPersonalV9 still publishes v9 from a v8 copy');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const deal = await api.createDeal({ street: '16 Buyer Lane', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc' });
await api.addParticipant(deal.id, 'c-buyer', 'Client-Buyer');
await api.addParticipant(deal.id, 'c-seller', 'Client-Seller');

await api.signInDev('u-buyer');
const buyerTasks = await api.listTasks(deal.id);
const expectedBuyer = TEMPLATE_DEFS.filter((t) => (t.roles || []).includes('Client-Buyer') && !TEMPLATE_DEFS.some((o) => o.code === t.code && o.version > t.version)).map((t) => t.code).sort();
const seenBuyer = [...new Set(buyerTasks.filter((t) => t.assignedRole === 'Client-Buyer' && t.mine).map((t) => t.templateCode))].sort();
ok(expectedBuyer.every((c) => seenBuyer.includes(c)), `the buyer sees every active Client-Buyer template (${expectedBuyer.join(', ')}); saw ${seenBuyer.join(', ') || 'none'}`);
ok(!buyerTasks.some((t) => t.assignedRole === 'Client-Seller' || (t.templateCode && ['seller_proceeds', 'forwarding_address', 'mortgage_info', 'hoa_info'].includes(t.templateCode))), 'the buyer does not see seller-only tasks');

const buyerPi = buyerTasks.find((t) => t.templateCode === 'personal_info' && t.mine);
const buyerOpen = await api.getTask(buyerPi.id);
ok(buyerOpen.templateVersion === 10 && !buyerOpen.fields.some((f) => f.k === 'forwarding_address'), 'a new buyer Personal information task is v10 and has no forwarding address');
const html = toText(intakeFormHtml({ ...buyerOpen, fields: buyerOpen.fields }, { page: true, state: 'MD' }));
ok(html.includes('Attending the closing?') && html.includes('Leaving town before closing?') && html.includes('Currently getting divorced?') && html.includes('Property will be primary residence?') && html.includes('Wants survey?') && html.includes('First-time home buyer in MD?'), 'the buyer form shows the new Yes/No wording, including the Maryland question');

await api.signInDev('u-admin');
const va = await api.createDeal({ street: '9 Oak', city: 'Arlington', state: 'VA', zip: '22201', processorId: 'u-proc' });
await api.addParticipant(va.id, 'c-buyer', 'Client-Buyer');
await api.signInDev('u-buyer');
const vaPi = (await api.listTasks(va.id)).find((t) => t.templateCode === 'personal_info' && t.mine);
const vaOpen = await api.getTask(vaPi.id);
const vaHtml = toText(intakeFormHtml({ ...vaOpen, fields: vaOpen.fields }, { page: true, state: 'VA' }));
ok(!vaHtml.includes('First-time home buyer in MD?') && vaHtml.includes('Wants survey?'), 'a Virginia file hides the Maryland question and still shows the survey question');

await api.signInDev('u-seller');
const sellerTasks = await api.listTasks(deal.id);
const sellerPi = sellerTasks.find((t) => t.templateCode === 'personal_info' && t.assignedRole === 'Client-Seller');
const sellerOpen = await api.getTask(sellerPi.id);
ok(sellerOpen.templateVersion === 10, 'a new seller Personal information task is v10');
ok(sellerOpen.fields.some((f) => f.k === 'ground_rent' && f.label === 'Subject to ground rent?')
  && sellerOpen.fields.some((f) => f.k === 'front_foot' && f.label === 'Subject to front foot benefit?')
  && sellerOpen.fields.some((f) => f.k === 'homestead' && f.label === 'Property is homestead?')
  && sellerOpen.fields.some((f) => f.k === 'tenants_after' && f.label === 'Property has tenants at/after closing?'), 'the seller form uses the new Yes/No wording');
ok(sellerOpen.fields.some((f) => f.k === 'forwarding_address') && !sellerOpen.fields.some((f) => f.k === 'survey' || f.k === 'md_first_time'), 'the seller copy still has forwarding address and not the buyer-only questions');

const sp = sellerTasks.find((t) => t.templateCode === 'seller_proceeds' && t.assignedRole === 'Client-Seller');
const spOpen = await api.getTask(sp.id);
ok(spOpen.templateVersion === 3, 'a new Seller Proceeds task is v3');
const spHtml = toText(intakeFormHtml({ ...spOpen, fields: spOpen.fields }, { page: true }));
ok(spHtml.includes('Proceeds Instructions: Overnight Check or Wire?') && spHtml.includes('SELLER OF RECORD') && spHtml.includes('Entity/Trust'), 'the proceeds form shows the new instructions and acknowledgment');
ok(spHtml.includes('Check at settlement') && spHtml.includes('Wire transfer'), 'the existing proceeds options are still offered');

const sql = readFileSync('supabase/migrations/20261131240000_connect_5_questions_wording.sql', 'utf8');
const roll = readFileSync('supabase/rollbacks/20261131240000_connect_5_questions_wording.sql', 'utf8');
ok(/personal_info v9 is not the active version/.test(sql) && /seller_proceeds v2 is not the active version/.test(sql) && /task\.saved_at is null/.test(sql) && /citizenship type should stay text/.test(sql) && /forwarding_address should stay seller-only/.test(sql) && !/\bgrant\s+(select|insert|update|execute)\b/i.test(sql) && !/security definer/i.test(sql) && !/create (or replace )?function/i.test(sql) && !/validate_form/i.test(sql), 'the database file publishes v10 and v3 from the previous versions, moves only untouched copies, and does not change grants, RLS, functions or the validator');
ok(/version = 10/.test(roll) && /version = 9/.test(roll) && /version = 3/.test(roll) && /version = 2/.test(roll) && /Citizenship and the seller-only forwarding_address task are not touched/.test(roll), 'the rollback returns untouched copies to v9 and v2');

console.log(fail ? fail + ' failed' : 'connect-5 questions wording passed');
if (fail) process.exit(1);
