/* Janine buyer bugs. Fake people only. The hosted file is not written. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { UPDATE_TOPICS } from '../js/data/agent-portal.js';
import { intakeCompletes } from '../js/pages/dealtaskform.js';
import { uploadFileName } from '../js/data/upload-bytes.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const src = (p) => readFileSync(p, 'utf8');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-buyer');
for (const topic of UPDATE_TOPICS) {
  const row = await api.requestUpdate('deal-1', { topic, note: 'E2E buyer check' });
  ok(!!row.id, `buyer can ask for ${topic}`);
}
let duplicate = '';
try { await api.requestUpdate('deal-1', { topic: UPDATE_TOPICS[0], note: 'again' }); } catch (e) { duplicate = e.message; }
ok(/already asked/i.test(duplicate), 'a second ask for the same topic is the already-asked message');

await api.signInDev('u-admin');
const deal = await api.createDeal({ street: '44 Buyer Lane', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc', preprocessorUserId: 'u-preproc' });
await api.addParticipant(deal.id, 'c-buyer', 'Client-Buyer');
await api.signInDev('u-buyer');
const tasks = await api.listTasks(deal.id);
const lender = tasks.find((t) => t.templateCode === 'lender_info' && t.mine);
const idTask = tasks.find((t) => t.templateCode === 'id_upload' && t.mine);
const personal = tasks.find((t) => t.templateCode === 'personal_info' && t.mine);
ok(!!lender && lender.status !== 'done', 'the new buyer file has an open lender task');
const lenderData = { company: 'E2E Lender', officer_name: 'Ada Officer', officer_email: 'ada.officer@example.test', officer_phone: '202-555-0100' };
ok(intakeCompletes({ templateCode: 'lender_info' }, lenderData, 'save'), 'saving finished lender info closes the task');
ok(!intakeCompletes({ templateCode: 'lender_info' }, { company: 'Only the company' }, 'save'), 'a partial lender save stays open');
const saved = await api.saveTaskForm(lender.id, lenderData, { complete: intakeCompletes({ templateCode: 'lender_info' }, lenderData, 'save') });
ok(saved.status === 'done', 'the lender task is done after the buyer saves the lender');

ok(uploadFileName('image', 'image/jpeg') === 'image.jpg', 'a camera photo with no extension is stored as a jpeg');
ok(uploadFileName('id.pdf', 'application/pdf') === 'id.pdf', 'a pdf keeps its name');
const uploaded = await api.uploadForTask(idTask.id, { name: uploadFileName('image', 'image/jpeg'), mimeType: 'image/jpeg', size: 8, dataUrl: 'data:image/jpeg;base64,AA==', field: 'id_document' });
ok(!!uploaded.id, 'the buyer can upload an ID');
const idDone = await api.saveTaskForm(idTask.id, { id_type: "Driver's license", id_expires: '2030-01-01', id_document: uploaded.id }, { complete: true });
ok(idDone.status === 'done', 'the ID task is done after the upload');

const personalData = { full_name: 'Ben Buyer', email: 'ben.buyer@example.test', cell_phone: '301-555-0107', current_address: '1 Sample Road', marital_status: 'Single', attending_closing: 'Yes' };
await api.saveBuyerSsn(personal.id, '900-12-3456');
const personalDone = await api.saveTaskForm(personal.id, personalData, { complete: true });
ok(personalDone.status === 'done', 'personal information completes');
const again = await api.getTask(personal.id);
ok(!again.formError && again.status === 'done', 'opening a completed personal information task is not an error');

const form = src('js/pages/dealtaskform.js');
const ssnAt = form.indexOf('saveBuyerSsn');
const completeAt = form.indexOf('saveTaskForm(t.id');
ok(ssnAt > 0 && completeAt > ssnAt, 'the Social Security number is saved before the task is marked complete');
const staffJs = src('js/data/supabase-staff.js');
ok(/from\('documents'\)\.insert\(row\)/.test(staffJs) && !/from\('documents'\)\.insert\(row\)\.select\(/.test(staffJs), 'the ID upload does not ask the database to return the new row');
const overview = src('js/data/supabase-order-overview.js');
ok(overview.includes("rpc('request_update'"), 'hosted Ask for an update calls request_update');
const order = src('js/pages/ordernew.js');
ok(order.includes('Salespeople on this order') && order.includes('type="checkbox" name="salesIds"'), 'Place Order salespeople are checkboxes with a matching label');
const sql = src('supabase/migrations/20261112060200_buyer_task_holder.sql');
ok(sql.includes('owner_profile_id is null') && sql.includes('rpc_save_party_ssn'), 'a blank task owner can still save the form and the Social Security number');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('buyer janine checks passed');
