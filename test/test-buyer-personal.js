/* FF-020: buyer Personal information. Save and reload, Maryland only, agents cannot see the answers. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { intakeFormHtml } from '../js/pages/dealtaskform.js';
import { toText } from '../js/ui.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const place = (state) => api.createDeal({ street: '16 Buyer Lane', city: 'Rockville', state, zip: '20850', processorId: 'u-proc' });
const md = await place('MD');
const va = await place('VA');
await api.addParticipant(md.id, 'c-buyer', 'Client-Buyer');
await api.addParticipant(md.id, 'c-seller', 'Client-Seller');
await api.addParticipant(md.id, 'c-bagent', 'Buyer Agent');
await api.addParticipant(va.id, 'c-buyer', 'Client-Buyer');

const mine = async (dealId, who) => {
  await api.signInDev(who);
  const tasks = await api.listTasks(dealId);
  return tasks.find((t) => t.templateCode === 'personal_info' && t.assignedRole === 'Client-Buyer' && t.mine);
};
const buyerTask = await mine(md.id, 'u-buyer');
const opened = await api.getTask(buyerTask.id);
for (const key of ['citizenship', 'gender', 'date_of_birth', 'forwarding_address', 'leaving_town', 'divorce', 'primary_residence', 'survey', 'md_first_time', 'current_address', 'attending_closing']) {
  ok(opened.fields.some((f) => f.k === key), `the buyer form includes ${key}`);
}
ok(!opened.fields.some((f) => /ssn|spouse/i.test(`${f.k} ${f.label}`)), 'SSN and spouse match are not on the form');

const saved = await api.saveTaskForm(buyerTask.id, {
  citizenship: 'Canada', gender: 'Female', date_of_birth: '1990-04-02', forwarding_address: '9 Next Street, Rockville, MD 20850',
  leaving_town: 'No', divorce: 'No', primary_residence: 'Yes', survey: 'Yes', md_first_time: 'Yes',
});
ok(saved.formData.citizenship === 'Canada' && saved.formData.md_first_time === 'Yes', 'saving keeps the new answers');
const again = await api.getTask(buyerTask.id);
ok(again.formData.date_of_birth === '1990-04-02' && again.formData.survey === 'Yes' && again.formData.forwarding_address.includes('9 Next Street'), 'opening the task again shows the saved answers');

const html = toText(intakeFormHtml({ ...again, fields: again.fields }, { page: true, state: 'MD' }));
ok(html.includes('Are you a first-time homebuyer in Maryland?') && html.includes('value="1990-04-02"'), 'the Maryland form shows the saved date of birth and the Maryland question');
const vaHtml = toText(intakeFormHtml({ fields: opened.fields, assignedRole: 'Client-Buyer', formData: {}, canFill: true }, { page: true, state: 'VA' }));
ok(!vaHtml.includes('first-time homebuyer') && vaHtml.includes('Would you like to obtain a survey?'), 'a Virginia file hides the Maryland question and still shows the survey question');

await api.signInDev('u-buyer');
const vaTask = (await api.listTasks(va.id)).find((t) => t.templateCode === 'personal_info' && t.assignedRole === 'Client-Buyer');
const vaOpen = await api.getTask(vaTask.id);
ok(!vaOpen.fields.some((f) => f.k === 'md_first_time') && vaOpen.fields.some((f) => f.k === 'survey'), 'the buyer task on a Virginia file does not carry the Maryland question');

await api.signInDev('u-seller');
const seller = (await api.listTasks(md.id)).find((t) => t.templateCode === 'personal_info' && t.assignedRole === 'Client-Seller');
const sellerOpen = await api.getTask(seller.id);
ok(!sellerOpen.fields.some((f) => f.k === 'citizenship' || f.k === 'md_first_time'), 'the seller copy does not get the buyer questions');

await api.signInDev('u-bagent');
let agent = null; let agentErr = '';
try { agent = await api.getTask(buyerTask.id); } catch (e) { agentErr = e.message; }
ok(agent && agent.formHidden && !agent.formData.citizenship, `the buyer agent cannot see the answers${agentErr ? ` (${agentErr})` : ''}`);

await api.signInDev('u-proc');
const staff = await api.getTask(buyerTask.id);
ok(!staff.formHidden && staff.formData.citizenship === 'Canada' && staff.formData.primary_residence === 'Yes', 'the processor can see the saved answers');

const sql = readFileSync('supabase/migrations/20261112010000_buyer_personal_info.sql', 'utf8');
const added = sql.slice(sql.indexOf('$buyer$'), sql.lastIndexOf('$buyer$'));
ok(/md_first_time/.test(added) && /"states":\["MD"\]/.test(added) && !/ssn|spouse/i.test(added) && !/create function/i.test(sql), 'the migration adds the Maryland question, skips SSN and spouse match, and does not add a read');
const turnedOff = sql.indexOf("set active = false where code = 'personal_info' and active");
const inserted = sql.indexOf('insert into public.task_templates');
ok(turnedOff > 0 && inserted > turnedOff, 'version 4 is deactivated before version 5 is inserted');
const rollSql = readFileSync('supabase/rollbacks/20261112010000_buyer_personal_info.sql', 'utf8');
const rollOff = rollSql.indexOf("set active = false where code = 'personal_info' and version = 5");
const rollOn = rollSql.indexOf("set active = true where code = 'personal_info' and version = 4");
ok(rollOff > 0 && rollOn > rollOff, 'the rollback turns version 5 off before version 4 comes back on');
const hash = createHash('sha256').update(readFileSync('supabase/migrations/20261112010000_buyer_personal_info.sql')).digest('hex');
const roll = createHash('sha256').update(rollSql).digest('hex');
console.log('buyer-personal-migration-sha256', hash);
console.log('buyer-personal-rollback-sha256', roll);

console.log(fail ? fail + ' failed' : 'buyer personal passed');
if (fail) process.exit(1);
