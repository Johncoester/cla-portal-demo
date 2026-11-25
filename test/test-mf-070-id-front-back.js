/* MF-070 (Matt, Nov 25 2026): Buyer ID requires front and back. A passport needs one image only. */
import { readFileSync } from 'node:fs';
import { TEMPLATE_DEFS, fieldsForRole, fieldActive, validateForm, applyIdUploadV3 } from '../js/data/templates.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(fieldActive({ k: 'poa_reason', when: ['power_of_attorney', 'Yes'] }, { power_of_attorney: 'Yes' }), 'a single-value when still shows when it matches');
ok(!fieldActive({ k: 'poa_reason', when: ['power_of_attorney', 'Yes'] }, { power_of_attorney: 'No' }), 'a single-value when still hides when it does not match');

const v2 = TEMPLATE_DEFS.find((t) => t.code === 'id_upload' && t.version === 2);
const v3 = TEMPLATE_DEFS.find((t) => t.code === 'id_upload' && t.version === 3);
ok(v3 && v2, 'id_upload v3 is published next to v2');
const buyer3 = fieldsForRole(v3.fields, 'Client-Buyer');
const seller3 = fieldsForRole(v3.fields, 'Client-Seller');
const buyer2 = fieldsForRole(v2.fields, 'Client-Buyer');
ok(buyer3.some((f) => f.k === 'id_front' && f.req) && buyer3.some((f) => f.k === 'id_back' && f.req), 'v3 requires front and back on a buyer copy');
ok(seller3.some((f) => f.k === 'id_front' && f.req) && seller3.some((f) => f.k === 'id_back' && f.req), 'v3 requires front and back on a seller copy');
ok(!buyer3.some((f) => f.k === 'id_document') && buyer2.some((f) => f.k === 'id_document'), 'v3 drops the single buyer ID document field; v2 still has it');
ok(v3.fields.length === 4 && v2.fields.length === 5, 'v3 has four questions; v2 is unchanged');

const back = v3.fields.find((f) => f.k === 'id_back');
ok(fieldActive(back, { id_type: "Driver's license" }) && fieldActive(back, { id_type: 'State ID' }) && fieldActive(back, { id_type: 'Military ID' }), 'the back is shown for a license, state ID or military ID');
ok(!fieldActive(back, { id_type: 'Passport' }) && !fieldActive(back, {}), 'the back is hidden for a passport and before an ID type is chosen');

const license = { id_type: "Driver's license", id_expires: '2030-01-15', id_front: '11111111-1111-4111-8111-111111111111' };
const onlyFront = validateForm(v3.fields, license, true);
ok(onlyFront.errors.some((e) => /back/i.test(e.msg)), 'a license cannot be submitted with only the front');
const both = validateForm(v3.fields, { ...license, id_back: '22222222-2222-4222-8222-222222222222' }, true);
ok(both.errors.length === 0, 'a license can be submitted with front and back');
const passport = validateForm(v3.fields, { id_type: 'Passport', id_expires: '2030-01-15', id_front: '11111111-1111-4111-8111-111111111111' }, true);
ok(passport.errors.length === 0 && passport.data.id_back === undefined, 'a passport can be submitted with one image, and a leftover back answer is dropped');
const passBlank = validateForm(v3.fields, { id_type: 'Passport', id_expires: '2030-01-15' }, true);
ok(passBlank.errors.some((e) => /front/i.test(e.msg)) && !passBlank.errors.some((e) => /back/i.test(e.msg)), 'a passport still requires the one image, but not the back');

const d = { taskTemplates: [{ ...v2, id: 'tt-id_upload-v2', active: true }], tasks: [
  { id: 'saved', templateCode: 'id_upload', templateId: 'tt-id_upload-v2', kind: 'form', status: 'todo', savedAt: 'x', formData: { id_document: 'old' } },
  { id: 'fresh', templateCode: 'id_upload', templateId: 'tt-id_upload-v2', kind: 'form', status: 'todo', savedAt: null, formData: {} },
] };
const r = applyIdUploadV3(d);
ok(r.added.length === 1 && r.moved === 1, 'v3 is added and only the untouched copy moves');
ok(d.tasks[0].templateId === 'tt-id_upload-v2' && d.tasks[0].formData.id_document === 'old', 'a copy with a saved ID stays on v2');
ok(d.tasks[1].templateVersion === 3 && d.tasks[1].templateId !== 'tt-id_upload-v2', 'the empty to-do copy moves to v3');
ok(applyIdUploadV3(d).added.length === 0 && applyIdUploadV3(d).moved === 0, 'running it again changes nothing');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const deal = await api.createDeal({ street: '18 Id Lane', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc' });
await api.addParticipant(deal.id, 'c-buyer', 'Client-Buyer');
await api.addParticipant(deal.id, 'c-seller', 'Client-Seller');
await api.signInDev('u-buyer');
const buyerTask = (await api.listTasks(deal.id)).find((t) => t.templateCode === 'id_upload' && t.assignedRole === 'Client-Buyer' && t.mine);
const buyerOpen = await api.getTask(buyerTask.id);
ok(buyerOpen.templateVersion === 3 && buyerOpen.fields.some((f) => f.k === 'id_front') && buyerOpen.fields.some((f) => f.k === 'id_back') && !buyerOpen.fields.some((f) => f.k === 'id_document'), 'a new buyer ID task is v3 with front and back, not a single document');
const front = await api.uploadForTask(buyerOpen.id, { name: 'front.png', mimeType: 'image/png', size: 8, dataUrl: 'data:image/png;base64,AA==', field: 'id_front' });
let idErr = '';
try { await api.saveTaskForm(buyerOpen.id, { id_type: "Driver's license", id_expires: '2030-01-15', id_front: front.id }, { complete: true }); } catch (e) { idErr = e.message; }
ok(/back/i.test(idErr), 'the buyer cannot finish a license upload without the back');
const backFile = await api.uploadForTask(buyerOpen.id, { name: 'back.png', mimeType: 'image/png', size: 8, dataUrl: 'data:image/png;base64,BB==', field: 'id_back' });
const licenseDone = await api.saveTaskForm(buyerOpen.id, { id_type: "Driver's license", id_expires: '2030-01-15', id_front: front.id, id_back: backFile.id }, { complete: true });
ok(licenseDone.status === 'done', 'the buyer can finish a license upload with front and back');

await api.signInDev('u-seller');
const sellerTask = (await api.listTasks(deal.id)).find((t) => t.templateCode === 'id_upload' && t.assignedRole === 'Client-Seller');
const sellerOpen = await api.getTask(sellerTask.id);
const sFront = await api.uploadForTask(sellerOpen.id, { name: 'pass.png', mimeType: 'image/png', size: 8, dataUrl: 'data:image/png;base64,CC==', field: 'id_front' });
const passDone = await api.saveTaskForm(sellerOpen.id, { id_type: 'Passport', id_expires: '2031-06-01', id_front: sFront.id }, { complete: true });
ok(passDone.status === 'done' && !passDone.formData.id_back, 'a passport can be finished with one image');

const sql = readFileSync('supabase/migrations/20261131090000_id_upload_v3.sql', 'utf8');
const roll = readFileSync('supabase/rollbacks/20261131090000_id_upload_v3.sql', 'utf8');
ok(/jsonb_typeof\(f->'when'->1\)/.test(sql) && /id_upload v2 is not the active version/.test(sql) && /task\.saved_at is null/.test(sql) && /f529aa122dd3f1f9893c786b848f2756/.test(sql), 'the database file extends validate_form, publishes v3 from v2, and moves only untouched copies');
ok(!/\bgrant\s+(select|insert|update|execute)\b/i.test(sql) && !/create policy/i.test(sql), 'the database file does not add grants or RLS policies');
ok(/version = 3/.test(roll) && /version = 2/.test(roll) && /f529aa122dd3f1f9893c786b848f2756/.test(roll), 'the rollback returns untouched copies to v2 and restores the previous validate_form');

console.log(fail ? fail + ' failed' : 'mf-070 id front and back passed');
if (fail) process.exit(1);
