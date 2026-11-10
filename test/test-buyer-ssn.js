/* FF-020: full SSN is private. Fake number only. Staff see it; the buyer sees the last 4; the log does not. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { buyerSsnHtml } from '../js/pages/dealtaskform.js';
import { toText } from '../js/ui.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const NUMBER = '900-00-0001';
const DIGITS = '900000001';
const MASK = '***-**-0001';
const leaked = (value) => {
  const text = JSON.stringify(value);
  return text.includes(NUMBER) || text.includes(DIGITS);
};

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const deal = await api.createDeal({ street: '16 SSN Lane', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc', preprocessorUserId: 'u-preproc' });
await api.addParticipant(deal.id, 'c-buyer', 'Client-Buyer');
await api.addParticipant(deal.id, 'c-seller', 'Client-Seller');
await api.addParticipant(deal.id, 'c-bagent', 'Buyer Agent');
await api.addParticipant(deal.id, 'c-lagent', 'Listing Agent');
await api.addDealSalesPerson(deal.id, 'u-sp');

await api.signInDev('u-buyer');
const task = (await api.listTasks(deal.id)).find((t) => t.templateCode === 'personal_info' && t.assignedRole === 'Client-Buyer');
await api.saveBuyerSsn(task.id, NUMBER);
const buyerView = await api.readBuyerSsn(task.id);
ok(buyerView === MASK, 'the buyer sees only the last 4');
const savedForm = await api.saveTaskForm(task.id, { ssn: NUMBER, social_security: NUMBER, full_name: 'Bea Buyer' });
ok(!leaked(savedForm.formData) && savedForm.formData.full_name === 'Bea Buyer', 'the task answers do not keep the number');
const reopened = await api.getTask(task.id);
ok(!leaked(reopened) && reopened.formData.full_name === 'Bea Buyer', 'opening the task again does not include the number');

const staff = [
  ['u-admin', 'super admin'],
  ['u-adam', 'admin'],
  ['u-proc', 'processor'],
  ['u-preproc', 'preprocessor'],
  ['u-tc', 'transaction coordinator'],
  ['u-sp', 'sales person'],
  ['u-team', 'sales team'],
];
for (const [id, label] of staff) {
  await api.signInDev(id);
  const seen = await api.readBuyerSsn(task.id);
  ok(seen === NUMBER, `${label} sees the full number`);
}

const refused = async (id, label) => {
  await api.signInDev(id);
  let message = '';
  try { await api.readBuyerSsn(task.id); } catch (e) { message = e.message; }
  ok((message === 'Not available.' || message === 'Task not found.') && !message.includes('900'), `${label} cannot see the number`);
};
await refused('u-bagent', 'buyer agent');
await refused('u-lagent', 'listing agent');
await refused('u-seller', 'seller');

await api.signInDev('u-proc');
const activity = await api.listActivity(deal.id);
ok(activity.items.some((row) => row.action === 'task.ssn' && row.detail === 'Social Security number saved'), 'the activity log records that a number was saved');
ok(!leaked(activity), 'the activity log does not contain the number');

const buyerHtml = toText(buyerSsnHtml(MASK, false));
const staffHtml = toText(buyerSsnHtml(NUMBER, true));
ok(buyerHtml.includes('data-ssn-mask') && buyerHtml.includes(MASK) && !buyerHtml.includes(NUMBER) && buyerHtml.includes('type="password"') && !buyerHtml.includes('name='), 'the buyer input is masked and is not a named answer');
ok(staffHtml.includes('data-ssn-staff') && staffHtml.includes('type="password"') && !/value="900/.test(staffHtml), 'the staff view is not prefilled into the password box');

const sql = readFileSync('supabase/migrations/20261112010100_buyer_ssn.sql', 'utf8');
ok(/vault\.decrypted_secrets/.test(sql) && /buyer_ssn_key/.test(sql) && /pgp_sym_encrypt/.test(sql), 'the number is encrypted with the Vault key');
ok(!/900-00-0001/.test(sql) && !/create_secret\(\s*'[A-Za-z0-9+/=]{16,}/.test(sql), 'the migration does not contain a key or a sample number');
ok(/Social Security number saved/.test(sql) && /private\.buyer_ssn/.test(sql), 'the activity note and the private table are in the migration');
const hash = createHash('sha256').update(readFileSync('supabase/migrations/20261112010100_buyer_ssn.sql')).digest('hex');
const roll = createHash('sha256').update(readFileSync('supabase/rollbacks/20261112010100_buyer_ssn.sql')).digest('hex');
console.log('buyer-ssn-migration-sha256', hash);
console.log('buyer-ssn-rollback-sha256', roll);

console.log(fail ? fail + ' failed' : 'buyer ssn passed');
if (fail) process.exit(1);
