/* Raw hosted task rows through the same functions listTasks and getTask call.
 * The fake client never opens a network connection. */
import { readFileSync } from 'node:fs';
import { HOSTED_TASK_COLUMNS, fetchHostedTaskList, fetchHostedTask } from '../js/data/task-actions.js';
import { contactInsertRow } from '../js/data/contact-insert.js';
import { withMyAcknowledgements } from '../js/data/agreement-link.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const buyer = { id: 'u-buyer', role: 'Client-Buyer', roles: ['Client-Buyer'] };
const seller = { id: 'u-seller', role: 'Client-Seller', roles: ['Client-Seller'] };
const agent = { id: 'u-agent', role: 'Buyer Agent', roles: ['Buyer Agent'] };
const tc = { id: 'u-tc', role: 'Transaction Coordinator', roles: ['Transaction Coordinator'] };
const processor = { id: 'u-proc', role: 'Processor', roles: ['Processor'] };
const sales = { id: 'u-sales', role: 'Sales Person', roles: ['Sales Person'] };
const admin = { id: 'u-admin', role: 'Admin', roles: ['Admin'], isAdmin: true };

const buyerForm = {
  id: 't-buyer', deal_id: 'deal-1', title: 'Personal information', description: 'Your details', assigned_role: 'Client-Buyer', status: 'todo',
  due_date: '2026-11-12', kind: null, participant_id: 'p-buyer', owner_profile_id: 'u-buyer', template_id: 'tpl-personal', template_code: 'personal_info', template_version: 2,
  form_data: { account: 'SHOULD-NOT-LEAK', ssn: 'secret' },
};
const sellerForm = {
  id: 't-seller', deal_id: 'deal-1', title: 'Seller proceeds', description: '', assigned_role: 'Client-Seller', status: 'todo',
  kind: null, participant_id: 'p-seller', owner_profile_id: 'u-seller', template_id: 'tpl-proceeds', template_code: 'seller_proceeds', template_version: 1,
  form_data: { account: '999988887777' },
};
const agentForm = {
  id: 't-agent', deal_id: 'deal-1', title: 'Agency info', description: '', assigned_role: 'Buyer Agent', status: 'todo',
  kind: 'agent', participant_id: 'p-agent', owner_profile_id: 'u-agent', template_id: 'tpl-agent', template_code: 'agent_info', template_version: 1,
};
const simple = {
  id: 't-simple', deal_id: 'deal-1', title: 'Call the lender', description: '', assigned_role: 'Processor', status: 'todo',
  kind: null, participant_id: null, owner_profile_id: null, template_id: null, template_code: null,
};
const switched = {
  id: 't-off', deal_id: 'deal-1', title: 'Retired copy', description: '', assigned_role: 'Client-Buyer', status: 'todo',
  kind: 'form', participant_id: 'p-buyer', owner_profile_id: 'u-buyer', template_id: 'tpl-old', template_code: 'old_form', template_version: 1,
};
const rows = [buyerForm, sellerForm, agentForm, simple, switched];
const templates = [
  { id: 'tpl-personal', code: 'personal_info', version: 2, title: 'Personal information', fields: [{ k: 'first', label: 'First', roles: ['Client-Buyer'] }, { k: 'settle', label: 'Settlement type', roles: ['Client-Seller'] }] },
  { id: 'tpl-proceeds', code: 'seller_proceeds', version: 1, title: 'Seller proceeds', fields: [{ k: 'account', label: 'Account', mask: true }, { k: 'bank', label: 'Bank' }] },
  { id: 'tpl-agent', code: 'agent_info', version: 1, title: 'Agency info', fields: [{ k: 'license', label: 'License' }] },
];
const forms = {
  't-buyer': { data: { first: 'Ben' }, error: null },
  't-seller': { data: { account: '999988887777', bank: 'Example Bank' }, error: null },
  't-agent': { data: { license: 'ABC' }, error: null },
};

function fakeSb(store) {
  const calls = [];
  const resultFor = (q) => {
    if (q.table === 'tasks') {
      let found = store.tasks;
      for (const [col, val] of q.filters) found = found.filter((r) => r[col] === val);
      if (q.one) return { data: found[0] || null, error: found[0] ? null : { message: 'Task not found.' } };
      return { data: found, error: null };
    }
    if (q.table === 'task_template_switches') return { data: store.switches, error: null };
    if (q.table === 'task_templates') {
      const id = (q.filters.find((f) => f[0] === 'id') || [])[1];
      return { data: store.templates.find((t) => t.id === id) || null, error: null };
    }
    return { data: null, error: { message: 'unexpected table ' + q.table } };
  };
  const from = (table) => {
    const q = { table, filters: [], select: '', one: false };
    const api = {
      select(cols) { q.select = cols; return api; },
      eq(col, val) { q.filters.push([col, val]); return api; },
      order(col) { q.order = col; return api; },
      single() { q.one = true; return api; },
      maybeSingle() { q.one = true; return api; },
      then(resolve, reject) { try { calls.push({ table: q.table, select: q.select, filters: q.filters.map((f) => f.join('=')), one: q.one }); resolve(resultFor(q)); } catch (e) { reject(e); } },
    };
    return api;
  };
  return {
    calls,
    from,
    rpc(name, args) {
      calls.push({ rpc: name, args });
      if (name !== 'get_task_form') return Promise.resolve({ data: null, error: { message: 'unexpected rpc ' + name } });
      return Promise.resolve(store.forms[args.p_task] || { data: null, error: { message: 'not allowed' } });
    },
  };
}

const sb = fakeSb({ tasks: rows, switches: [{ code: 'old_form' }], templates, forms });
const listed = await fetchHostedTaskList(sb, 'deal-1', buyer);
ok(sb.calls[0].select === HOSTED_TASK_COLUMNS && !HOSTED_TASK_COLUMNS.includes('form_data'), 'the hosted list selects task columns and not the answer column');
ok(sb.calls.some((c) => c.table === 'task_template_switches'), 'a template code looks up which copies are switched off');
const mine = listed.find((t) => t.id === 't-buyer');
ok(mine.kind === 'form' && mine.mine && mine.canFill && mine.canTick === false && mine.href === '#/deals/deal-1/tasks/t-buyer', 'a null kind with a template id opens as the buyer form');
ok(!JSON.stringify(mine).includes('SHOULD-NOT-LEAK') && !JSON.stringify(listed).includes('999988887777'), 'list rows do not carry answers from the raw fixture');
const other = listed.find((t) => t.id === 't-seller');
ok(other.notYours && !other.canFill && other.href === '', 'the buyer is not given the seller form');
ok(listed.find((t) => t.id === 't-off').switchedOff === true, 'a switched-off code is marked and not invented or deleted here');

const sellerList = await fetchHostedTaskList(sb, 'deal-1', seller);
ok(sellerList.find((t) => t.id === 't-seller').mine && sellerList.find((t) => t.id === 't-seller').canFill && sellerList.find((t) => t.id === 't-buyer').href === '', 'the seller opens only the seller form');
const agentList = await fetchHostedTaskList(sb, 'deal-1', agent);
ok(agentList.find((t) => t.id === 't-agent').mine && agentList.find((t) => t.id === 't-agent').href === '#/deals/deal-1/tasks/t-agent' && !agentList.find((t) => t.id === 't-buyer').canFill, 'the agent opens their own task and not the buyer form');
const tcList = await fetchHostedTaskList(sb, 'deal-1', tc);
ok(tcList.find((t) => t.id === 't-buyer').canFill && tcList.find((t) => t.id === 't-simple').canTick, 'a coordinator can open a managed form and tick a simple task');
const procList = await fetchHostedTaskList(sb, 'deal-1', processor);
ok(procList.find((t) => t.id === 't-buyer').canFill && procList.find((t) => t.id === 't-seller').canFill, 'a processor can open buyer and seller forms');
const adminList = await fetchHostedTaskList(sb, 'deal-1', admin);
ok(adminList.every((t) => t.kind === 'form' || t.kind === 'agent' || t.kind === 'simple') && adminList.find((t) => t.id === 't-simple').href === '', 'staff still get a kind, and a simple task is not a form link');
const salesList = await fetchHostedTaskList(sb, 'deal-1', sales);
ok(salesList.every((t) => !t.canFill && !t.canTick), 'a view-only sales login is not given Fill; that is the existing view-only rule');
const demoBuyer = await fetchHostedTaskList(sb, 'deal-1', { ...buyer, demoActive: true });
ok(demoBuyer.find((t) => t.id === 't-buyer').canFill && demoBuyer.find((t) => t.id === 't-seller').href === '', 'a demo flag does not hide the persona own task or open someone else');

const opened = await fetchHostedTask(sb, 't-buyer', buyer);
ok(opened.template.code === 'personal_info' && opened.template.version === 2 && opened.fields.some((f) => f.k === 'first') && !opened.fields.some((f) => f.k === 'settle'), 'the template join keeps this role fields only');
ok(opened.canFill && opened.formData.first === 'Ben' && opened.href === '#/deals/deal-1/tasks/t-buyer', 'the owner gets the form answers and the task url');
const denied = await fetchHostedTask(sb, 't-seller', buyer);
ok(denied.formHidden && denied.formData && Object.keys(denied.formData).length === 0 && !denied.canFill && !JSON.stringify(denied).includes('999988887777'), 'opening another person form returns no answers');
const masked = await fetchHostedTask(sb, 't-seller', tc);
ok(masked.maskedAnswers && masked.canFill === false && String(masked.formData.account).includes('7777') && !String(masked.formData.account).includes('99998888'), 'a coordinator sees a masked account and cannot edit it');
const full = await fetchHostedTask(sb, 't-seller', processor);
ok(full.canFill && full.formData.account === '999988887777' && !full.maskedAnswers, 'the processor still sees the account the form returned');
const broken = fakeSb({ tasks: rows, switches: [], templates, forms: { 't-buyer': { data: null, error: { message: 'could not load' } } } });
const erred = await fetchHostedTask(broken, 't-buyer', buyer);
ok(erred.formError && erred.canFill === false && (!erred.formData || Object.keys(erred.formData).length === 0), 'a form that fails to load is an error and is not marked complete');

const company = contactInsertRow({ firstName: '', lastName: '', company: 'Example Home Loans', email: 'Loans@Example.test', phone: '', contactType: 'lender' });
ok(company.first_name === '' && company.last_name === '' && company.company === 'Example Home Loans' && company.email === 'loans@example.test' && company.contact_type === 'lender', 'a company-only contact insert sends empty names and does not invent a surname');
let badType = '';
try { contactInsertRow({ firstName: '', company: 'X', contactType: 'vendor' }); } catch (e) { badType = e.message; }
ok(/contact type/.test(badType), 'an unknown contact type is refused');
const adapter = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
const createFn = adapter.slice(adapter.indexOf('async createContact'), adapter.indexOf('async updateContact'));
ok(createFn.includes("from('contacts').insert(contactInsertRow(input))") && !createFn.includes('crm_create_contact') && !adapter.slice(adapter.indexOf('async addParticipant'), adapter.indexOf('async setParticipantEntity')).includes('crm_'), 'place-order contacts use the direct insert, and an entity uses the participant RPC');
const orderSrc = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
const dup = orderSrc.slice(orderSrc.indexOf('one person per email'), orderSrc.indexOf('if (role === \'Sales Person\') throw'));
ok(dup.includes('Select existing person') && !dup.includes('updateContact') && !dup.includes('createCrmContact'), 'an existing email selects that contact and does not overwrite it');
const linked = withMyAcknowledgements([{ code: 'wire', version: 2, title: 'Wire' }, { code: 'privacy', version: 1, title: 'Privacy' }], [{ agreementCode: 'wire', version: 1, acknowledgedAt: '2026-11-01' }]);
ok(linked[0].myAck == null && linked[1].myAck == null, 'an acknowledgement of an older version does not count for the current text');
const current = withMyAcknowledgements([{ code: 'wire', version: 2 }], [{ agreementCode: 'wire', version: 2, acknowledgedAt: '2026-11-02', roleLabel: 'Buyer' }]);
ok(current[0].myAck && current[0].myAck.at === '2026-11-02', 'the same agreement and version stays linked');
const docSrc = adapter.slice(adapter.indexOf('async listDocuments'), adapter.indexOf('async listAllTasks'));
const nov5 = readFileSync(new URL('../js/data/supabase-nov5.js', import.meta.url), 'utf8');
ok(docSrc.includes(".from('documents').select('*').eq('deal_id', dealId)") && !docSrc.includes('share_parties') && nov5.includes('visibility: file.visibility') && !nov5.includes('share_parties'), 'document list and upload use the saved visibility and not the held party-checkbox share');

console.log(fail ? fail + ' failed' : 'hosted task path passed');
if (fail) process.exit(1);
