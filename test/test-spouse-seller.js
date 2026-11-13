/* FF-021 and FF-022. Fake numbers only. Spouse data loads inside Personal information, not with the file. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { intakeFormHtml } from '../js/pages/dealtaskform.js';
import { render as taskPage } from '../js/pages/dealtaskform.js';
import { toText } from '../js/ui.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const BUYER = '900-00-0001';
const SELLER = '900-00-0002';
const SPOUSE = '900-00-0003';
const leaked = (value) => {
  const text = JSON.stringify(value);
  return text.includes(BUYER) || text.includes(SELLER) || text.includes(SPOUSE) || text.includes('900000001') || text.includes('900000002') || text.includes('900000003');
};

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const deal = await api.createDeal({ street: '22 Seller Lane', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc', preprocessorUserId: 'u-preproc' });
await api.addParticipant(deal.id, 'c-buyer', 'Client-Buyer');
await api.addParticipant(deal.id, 'c-seller', 'Client-Seller');
await api.addParticipant(deal.id, 'c-bagent', 'Buyer Agent');
await api.addParticipant(deal.id, 'c-lagent', 'Listing Agent');
await api.addDealSalesPerson(deal.id, 'u-sp');
const parties = (await api.getDeal(deal.id)).participants;
const buyerParty = parties.find((p) => p.role === 'Client-Buyer');
const sellerParty = parties.find((p) => p.role === 'Client-Seller');

const taskOf = async (who, code, role) => {
  await api.signInDev(who);
  return (await api.listTasks(deal.id)).find((t) => t.templateCode === code && t.assignedRole === role && t.mine);
};

const sellerPersonal = await taskOf('u-seller', 'personal_info', 'Client-Seller');
const opened = await api.getTask(sellerPersonal.id);
const sellerKeys = ['citizenship', 'gender', 'date_of_birth', 'current_address', 'forwarding_address', 'ground_rent', 'front_foot', 'leaving_town', 'travel_dates', 'divorce', 'primary_residence', 'homestead', 'tenants_after', 'water_provider', 'deceased_owners', 'in_state', 'name_changed', 'existing_survey', 'bankruptcy', 'water_meter', 'water_meter_where'];
for (const key of sellerKeys) ok(opened.fields.some((f) => f.k === key), `the seller form includes ${key}`);
ok(!opened.fields.some((f) => /ssn|social.?security|spouse/i.test(`${f.k} ${f.label}`)), 'SSN and spouse match are not fields on the seller form');
// FF-066 #6 (Francis confirm-back Nov 12 6:14 PM ET): the proceeds acknowledgment moved from Personal information to the proceeds task.
ok(!opened.fields.some((f) => f.k === 'proceeds_statement' || f.k === 'proceeds_ack'), 'Personal information no longer asks for the proceeds acknowledgment');
const proceedsTask = await api.getTask((await taskOf('u-seller', 'seller_proceeds', 'Client-Seller')).id);
const statement = proceedsTask.fields.find((f) => f.k === 'proceeds_statement');
ok(statement && statement.text === 'I understand that all seller proceeds must be disbursed to the seller(s) of record. If the seller is an entity or trust, the proceeds must be disbursed directly to that entity or trust.', 'the proceeds statement is the required wording');
ok(proceedsTask.fields.find((f) => f.k === 'proceeds_ack').req === true, 'the acknowledgment is required');

const answers = {
  full_name: 'Sara Seller', email: 'sara.seller@example.test', cell_phone: '3015550100', current_address: '22 Seller Lane, Rockville, MD 20850',
  marital_status: 'Married', attending_closing: 'Yes', settlement_type: 'In person',
  citizenship: 'U.S. Citizen', gender: 'Female', date_of_birth: '1985-06-15', forwarding_address: '9 Next Street, Rockville, MD 20850',
  ground_rent: 'Yes', front_foot: 'No', leaving_town: 'Yes', travel_dates: 'Dec 1 to Dec 4', divorce: 'No', primary_residence: 'Yes',
  homestead: 'Yes', tenants_after: 'No', water_provider: 'WSSC', deceased_owners: 'No', in_state: 'Yes', name_changed: 'No',
  existing_survey: 'Yes', bankruptcy: 'No', water_meter: 'Outside', water_meter_where: 'By the front steps',
};
const saved = await api.saveTaskForm(sellerPersonal.id, answers);
for (const key of Object.keys(answers)) ok(saved.formData[key] === answers[key] || (key === 'cell_phone' && String(saved.formData[key]).includes('301')), `saved ${key}`);
const again = await api.getTask(sellerPersonal.id);
for (const key of ['citizenship', 'gender', 'date_of_birth', 'forwarding_address', 'ground_rent', 'front_foot', 'travel_dates', 'homestead', 'tenants_after', 'water_provider', 'deceased_owners', 'in_state', 'name_changed', 'existing_survey', 'bankruptcy', 'water_meter', 'water_meter_where']) {
  ok(again.formData[key] === answers[key], `reopen keeps ${key}`);
}
const done = await api.saveTaskForm(sellerPersonal.id, answers, { complete: true });
ok(done.status === 'done' && !('proceeds_ack' in done.formData), 'Personal information completes without the proceeds acknowledgment (it moved to the proceeds task)');
const proceedsAnswers = { method: 'Check at settlement', settlement_ack: true };
let blocked = '';
try { await api.saveTaskForm(proceedsTask.id, proceedsAnswers, { complete: true }); } catch (e) { blocked = e.message; }
ok(blocked.includes('I acknowledge and understand the above statement.'), 'the proceeds task cannot be submitted without the acknowledgment');
const pdone = await api.saveTaskForm(proceedsTask.id, { ...proceedsAnswers, proceeds_ack: true }, { complete: true });
ok(pdone.status === 'done' && pdone.formData.proceeds_ack === true, 'ticking the acknowledgment lets the seller submit the proceeds task');

const hoa = await taskOf('u-seller', 'hoa_info', 'Client-Seller');
ok(hoa.title === 'Confirm HOA Information', 'the HOA task is the confirmation task');
const hoaAnswers = { association_name: 'Oak HOA', assoc_type: 'HOA', dues_amount: '120', payment_schedule: 'Monthly', confirm_hoa: true };
await api.saveTaskForm(hoa.id, hoaAnswers);
const hoaAgain = await api.getTask(hoa.id);
ok(hoaAgain.formData.association_name === 'Oak HOA' && hoaAgain.formData.confirm_hoa === true, 'HOA confirmation saves and reloads');

const idTask = await api.getTask((await taskOf('u-seller', 'id_upload', 'Client-Seller')).id);
ok(idTask.fields.some((f) => f.k === 'id_front' && f.req) && idTask.fields.some((f) => f.k === 'id_back' && f.req), 'front and back are both required');
const idBase = { id_type: "Driver's license", id_expires: '2030-01-15' };
let idErr = '';
try { await api.saveTaskForm(idTask.id, idBase, { complete: true }); } catch (e) { idErr = e.message; }
ok(idErr.includes('Identification, front') && idErr.includes('Identification, back'), 'submitting without front and back is refused');
const front = await api.uploadForTask(idTask.id, { name: 'front.png', mimeType: 'image/png', size: 8, dataUrl: 'data:image/png;base64,AA==', field: 'id_front' });
try { await api.saveTaskForm(idTask.id, { ...idBase, id_front: front.id }, { complete: true }); idErr = ''; } catch (e) { idErr = e.message; }
ok(idErr.includes('Identification, back') && !idErr.includes('Identification, front is required'), 'the back is still required after the front is uploaded');
const back = await api.uploadForTask(idTask.id, { name: 'back.png', mimeType: 'image/png', size: 8, dataUrl: 'data:image/png;base64,BB==', field: 'id_back' });
const idDone = await api.saveTaskForm(idTask.id, { ...idBase, id_front: front.id, id_back: back.id }, { complete: true });
ok(idDone.status === 'done' && idDone.formData.id_front === front.id && idDone.formData.id_back === back.id, 'front and back both save and the task can be submitted');

const mortgage = await api.getTask((await taskOf('u-seller', 'mortgage_info', 'Client-Seller')).id);
ok(mortgage.title === 'Outstanding Mortgage Information' && mortgage.fields.some((f) => f.type === 'mortgages'), 'mortgages are one repeatable field');
const loans = [{ lender: 'First Bank', phone: '3015550111', last4: '1111', loan_type: 'First' }, { lender: 'Second Bank', phone: '3015550222', last4: '2222', loan_type: 'HELOC' }];
await api.saveTaskForm(mortgage.id, { mortgages: JSON.stringify(loans) });
const loansAgain = JSON.parse((await api.getTask(mortgage.id)).formData.mortgages);
ok(loansAgain.length === 2 && loansAgain[0].lender === 'First Bank' && loansAgain[1].lender === 'Second Bank' && loansAgain[1].loan_number === '2222', 'two mortgages save and reload');
let loanErr = '';
try { await api.saveTaskForm(mortgage.id, { mortgages: '[]' }, { complete: true }); } catch (e) { loanErr = e.message; }
ok(loanErr.includes('Add at least one mortgage'), 'an empty mortgage list cannot be submitted');
const loansDone = await api.saveTaskForm(mortgage.id, { mortgages: JSON.stringify(loans) }, { complete: true });
ok(loansDone.status === 'done' && JSON.parse(loansDone.formData.mortgages).length === 2, 'submitting keeps both mortgages');

await api.signInDev('u-buyer');
const buyerPersonal = (await api.listTasks(deal.id)).find((t) => t.templateCode === 'personal_info' && t.assignedRole === 'Client-Buyer');
await api.saveBuyerSsn(buyerPersonal.id, BUYER);
await api.savePartySsn(buyerPersonal.id, 'spouse', SPOUSE);
const spouseInput = { fullName: 'Sam Spouse', citizenship: 'Canada', gender: 'Female', maritalStatus: 'Married', cellPhone: '3015550199', homePhone: '3015550188', workPhone: '3015550177', email: 'sam.spouse@example.test', dateOfBirth: '1988-03-04', poaGiven: 'Yes' };
await api.saveSpouse(deal.id, buyerParty.id, spouseInput);
const mine = (await api.getSpouse(deal.id)).find((row) => row.participantId === buyerParty.id);
for (const key of Object.keys(spouseInput)) ok(mine[key] === spouseInput[key], `spouse ${key} reloads`);
ok(mine.ssn === '***-**-0003', 'the buyer sees only the last 4 of the spouse number');
ok((await api.readBuyerSsn(buyerPersonal.id)) === '***-**-0001', 'the buyer sees only the last 4 of their own number');
ok(!leaked((await api.getTask(buyerPersonal.id)).formData), 'the buyer task answers do not contain either number');

await api.signInDev('u-seller');
await api.saveBuyerSsn(sellerPersonal.id, SELLER);
ok((await api.readBuyerSsn(sellerPersonal.id)) === '***-**-0002', 'the seller sees only the last 4 of their own number');
const sellerSpouse = await api.getSpouse(deal.id);
ok(sellerSpouse.length === 1 && sellerSpouse[0].participantId === sellerParty.id && !leaked(sellerSpouse), 'the seller spouse tab does not include the buyer spouse number');

const staff = [['u-admin', 'super admin'], ['u-adam', 'admin'], ['u-proc', 'processor'], ['u-preproc', 'preprocessor'], ['u-tc', 'transaction coordinator'], ['u-sp', 'sales person'], ['u-team', 'sales team']];
for (const [id, label] of staff) {
  await api.signInDev(id);
  const buyerNo = await api.readBuyerSsn(buyerPersonal.id);
  const sellerNo = await api.readBuyerSsn(sellerPersonal.id);
  const spouseNo = await api.readPartySsn(buyerPersonal.id, 'spouse');
  ok(buyerNo === BUYER && sellerNo === SELLER && spouseNo === SPOUSE, `${label} sees the full buyer, seller, and spouse numbers`);
}

const refused = async (id, label, taskId, subject) => {
  await api.signInDev(id);
  let message = '';
  try { await api.readPartySsn(taskId, subject); } catch (e) { message = e.message; }
  ok((message === 'Not available.' || message === 'Task not found.') && !/900/.test(message), `${label} cannot read that number`);
};
await refused('u-bagent', 'buyer agent', buyerPersonal.id, 'self');
await refused('u-lagent', 'listing agent', sellerPersonal.id, 'self');
await refused('u-seller', 'seller', buyerPersonal.id, 'self');
await refused('u-buyer', 'buyer', sellerPersonal.id, 'self');
await refused('u-bagent', 'buyer agent', buyerPersonal.id, 'spouse');
await refused('u-seller', 'seller', buyerPersonal.id, 'spouse');
await api.signInDev('u-bagent');
let agentSpouse = '';
try { await api.getSpouse(deal.id); } catch (e) { agentSpouse = e.message; }
ok(agentSpouse === 'Not available.' && !/900/.test(agentSpouse), 'an agent cannot open spouse information');

await api.signInDev('u-proc');
const activity = await api.listActivity(deal.id);
ok(activity.items.some((row) => row.detail === 'Social Security number saved'), 'saving a number is logged without the digits');
ok(activity.items.some((row) => row.detail === 'Spouse Social Security number saved'), 'saving a spouse number is logged without the digits');
ok(activity.items.some((row) => row.detail === 'Spouse information saved'), 'saving spouse details is logged');
ok(!leaked(activity), 'the activity log does not contain a number');
ok(!leaked(await api.listNotifications()), 'notifications do not contain a number');

const counts = { task: 0, ssn: 0, spouse: 0 };
const orig = { getTask: api.getTask.bind(api), readBuyerSsn: api.readBuyerSsn.bind(api), getSpouse: api.getSpouse.bind(api) };
api.getTask = async (id) => { counts.task += 1; return orig.getTask(id); };
api.readBuyerSsn = async (id, subject) => { counts.ssn += 1; return orig.readBuyerSsn(id, subject); };
api.getSpouse = async (id) => { counts.spouse += 1; return orig.getSpouse(id); };
const user = { id: 'u-proc', role: 'Processor', roles: ['Processor'] };
const quiet = { refresh() {}, go() {} };
counts.task = 0; counts.ssn = 0; counts.spouse = 0;
await taskPage({ api, deal, params: { sub: sellerPersonal.id }, user, ...quiet });
ok(counts.ssn === 1 && counts.spouse === 1, 'opening seller personal information reads the number once and the spouse section once');
const personalReads = { task: counts.task, ssn: counts.ssn };
counts.task = 0; counts.ssn = 0; counts.spouse = 0;
await taskPage({ api, deal, params: { sub: hoa.id }, user, ...quiet });
const hoaReads = { task: counts.task, ssn: counts.ssn, spouse: counts.spouse };
counts.task = 0; counts.ssn = 0;
await taskPage({ api, deal, params: { sub: idTask.id }, user, ...quiet });
const idReads = { task: counts.task, ssn: counts.ssn };
counts.task = 0; counts.ssn = 0;
await taskPage({ api, deal, params: { sub: mortgage.id }, user, ...quiet });
const loanReads = { task: counts.task, ssn: counts.ssn };
ok(hoaReads.ssn === 0 && hoaReads.spouse === 0 && idReads.ssn === 0 && loanReads.ssn === 0, 'HOA, identification, and mortgages add no number read');
console.log('query-count personal-info-spouse', 1);
console.log('query-count seller-personal-ssn', personalReads.ssn, 'task-reads', personalReads.task);
console.log('query-count hoa-task-reads', hoaReads.task, 'extra', hoaReads.ssn);
console.log('query-count id-task-reads', idReads.task, 'extra', idReads.ssn);
console.log('query-count mortgage-task-reads', loanReads.task, 'extra', loanReads.ssn);

const overview = readFileSync('js/pages/client-overview.js', 'utf8');
const dealPage = readFileSync('js/pages/deal.js', 'utf8');
const taskList = readFileSync('js/pages/dealtasks.js', 'utf8');
const beforeOpen = taskList.slice(0, taskList.indexOf('const showIntake'));
ok(!overview.includes('getSpouse') && !overview.includes('readBuyerSsn') && !dealPage.includes('getSpouse'), 'overview and the file page do not load spouse data');
ok(!beforeOpen.includes('readBuyerSsn') && !beforeOpen.includes('getSpouse'), 'the task list does not read a number or spouse data while it loads');
const formHtml = toText(intakeFormHtml(opened, { page: true, state: 'MD' }));
ok(formHtml.includes('Add another mortgage') === false && !formHtml.includes('I acknowledge and understand the above statement.'), 'the seller Personal information form no longer shows the proceeds acknowledgment (FF-066: it is on the proceeds task)');
ok(toText(intakeFormHtml({ ...proceedsTask, canFill: true }, { page: true, state: 'MD' })).includes('I acknowledge and understand the above statement.'), 'the proceeds task shows the acknowledgment');
const loanHtml = toText(intakeFormHtml({ ...mortgage, formData: { mortgages: JSON.stringify(loans) }, canFill: true }, { page: true }));
ok(loanHtml.includes('Add another mortgage') && loanHtml.includes('First Bank') && loanHtml.includes('Second Bank'), 'the mortgage form shows every saved mortgage and the add button');

const sql = readFileSync('supabase/migrations/20261112020000_spouse_seller_ssn.sql', 'utf8');
ok(/buyer_ssn_key/.test(sql) && /pgp_sym_encrypt/.test(sql) && !/900-00-000/.test(sql) && !/create_secret\(\s*'[A-Za-z0-9+/=]{16,}/.test(sql), 'the migration reuses the Vault key and contains no sample number');
ok(/proceeds_ack/.test(sql) && /id_front/.test(sql) && /id_back/.test(sql) && /mortgages/.test(sql), 'the migration publishes the seller questions and tasks');
const personalOff = sql.indexOf("set active = false where code = 'personal_info' and active");
const personalIn = sql.indexOf("t.code, 6, t.title");
ok(personalOff > 0 && personalIn > personalOff, 'personal information v5 is turned off before v6 is inserted');
const rollSql = readFileSync('supabase/rollbacks/20261112020000_spouse_seller_ssn.sql', 'utf8');
ok(rollSql.indexOf("set active = false where code = 'personal_info' and version = 6") < rollSql.indexOf("set active = true where code = 'personal_info' and version = 5"), 'the rollback turns v6 off before v5 comes back on');
const hash = createHash('sha256').update(readFileSync('supabase/migrations/20261112020000_spouse_seller_ssn.sql')).digest('hex');
const roll = createHash('sha256').update(readFileSync('supabase/rollbacks/20261112020000_spouse_seller_ssn.sql')).digest('hex');
console.log('spouse-seller-migration-sha256', hash);
console.log('spouse-seller-rollback-sha256', roll);

console.log(fail ? fail + ' failed' : 'spouse seller passed');
if (fail) process.exit(1);
