/* CONNECT-3 (John, Nov 25 2026; Connect Live Test rows 7.3 and 7.7): Personal Information answers and the spouse show on the
 * order's Contacts tab, and staff copy name or phone onto the contact. A client's save never writes the contact. Fake data only. */
import { readFileSync } from 'node:fs';
import { toText } from '../js/ui.js';
import { personalInfoTaskFor, answerDetails, spouseDetails, contactProposal, proposalPatch, splitFullName } from '../js/data/personal-info-contact.js';
import { loadPersonalInfo, personalInfoHtml } from '../js/pages/dealcontacts.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const tasks = [
  { id: 't1', dealId: 'd1', participantId: 'pB', templateCode: 'personal_info', status: 'done', savedAt: '2026-11-25T20:00:00Z' },
  { id: 't0', dealId: 'd1', participantId: 'pB', templateCode: 'personal_info', status: 'cancelled', savedAt: '2026-11-26T20:00:00Z' },
  { id: 't2', dealId: 'd1', participantId: 'pS', templateCode: 'personal_info', status: 'todo', savedAt: null },
  { id: 't3', dealId: 'd1', participantId: 'pB', templateCode: 'id_upload', status: 'done', savedAt: '2026-11-27T20:00:00Z' },
];
ok(personalInfoTaskFor(tasks, 'pB').id === 't1', 'the party\'s saved Personal Information copy is used, not a cancelled one or another task');
ok(personalInfoTaskFor(tasks, 'pS') === null, 'an untouched copy with no saved answers shows nothing');
ok(splitFullName('Deborah Jean Stack').lastName === 'Jean Stack' && splitFullName('Cher').lastName === '', 'full name splits like the contact picker');

const contact = { id: 'c1', firstName: 'Deborah', lastName: 'Jean Stack', phone: '301-284-0250', email: 'clatestportal+buyerdeborah@gmail.com' };
const answers = { full_name: 'Deborah  Jean Stack', cell_phone: '888-888-8888', email: 'clatestportal+other@gmail.com', current_address: '123 Test', marital_status: 'Married', citizenship: 'US' };
const prop = contactProposal(contact, answers);
ok(!prop.fields.some((f) => f.key === 'name'), 'the same name with different spacing is not a difference');
const ph = prop.fields.find((f) => f.key === 'phone');
ok(ph && !ph.blank && ph.current === '301-284-0250' && ph.answered === '888-888-8888', 'a different phone is shown side by side and starts unticked (row 7.7: staff approve)');
ok(prop.emailNote.includes('clatestportal+other@gmail.com') && prop.emailNote.includes('Use Edit'), 'a different email is never copied; staff are told to use Edit');
ok(!prop.fields.some((f) => f.key === 'email'), 'email is not offered as a field to copy');
ok(contactProposal({ ...contact, phone: '(301) 284-0250' }, { cell_phone: '301.284.0250' }).fields.length === 0, 'the same phone in another format is not a difference');

const blankC = { id: 'c2', firstName: '', lastName: '', phone: '', email: 'x@example.test' };
const p2 = contactProposal(blankC, { full_name: 'Sam Seller', cell_phone: '301-555-0101' });
ok(p2.fields.every((f) => f.blank), 'blank contact fields start ticked');
const patch = proposalPatch(p2, ['name', 'phone']);
ok(patch && patch.firstName === 'Sam' && patch.lastName === 'Seller' && patch.phone === '301-555-0101' && !('email' in patch), 'the patch holds only name and phone');
ok(proposalPatch(p2, []) === null, 'nothing ticked saves nothing');
ok(contactProposal(blankC, { is_entity: true, entity_name: 'Sam LLC', full_name: 'Sam Rep' }).fields.every((f) => f.key !== 'name'), 'an entity\'s representative name does not replace the party name');

const det = answerDetails(answers);
ok(det.map((d) => d.label).join('|') === 'Current address|Marital status|Citizenship', 'address, marital status and citizenship are shown');
ok(answerDetails({ is_entity: 'true', entity_name: 'Acme Trust', entity_type: 'Trust' })[0].value === 'Acme Trust', 'an entity name is shown');
ok(spouseDetails({ fullName: '' }) === null && spouseDetails({ fullName: 'Michael Stack', homePhone: '301-555-0102' }).phone === '301-555-0102', 'a spouse shows when one was entered');

// page: one task list, one spouse read, one answers read per saved copy; failures leave the party out
const parties = [
  { id: 'pB', role: 'Client-Buyer', contactId: 'c1', contact },
  { id: 'pS', role: 'Client-Seller', contactId: 'c2', contact: blankC },
];
let getTaskCalls = 0;
const api = {
  listTasks: async () => tasks,
  getSpouse: async () => [{ participantId: 'pB', fullName: 'Michael Stack', maritalStatus: 'Married', cellPhone: '301-555-0103', email: '', ssn: '123-45-6789' }],
  getTask: async (id) => { getTaskCalls++; return { id, formData: answers }; },
};
const pi = await loadPersonalInfo(api, 'd1', parties);
ok(pi.size === 1 && pi.get('pB') && getTaskCalls === 1, 'only the saved copy is read');
const out = toText(personalInfoHtml(parties, pi));
ok(out.includes('From Personal Information') && out.includes('Married') && out.includes('123 Test'), 'the Contacts tab shows the buyer\'s answers');
ok(out.includes('Michael Stack') && !out.includes('123-45-6789'), 'the spouse shows on Contacts without the SSN');
ok(out.includes('Answers differ from the contact') && out.includes('data-pi-review="pB"') && out.includes('#/deals/d1/tasks/t1'), 'differences are flagged with Review answers and a task link');
ok(personalInfoHtml(parties, new Map()) === '', 'no saved answers: no section');
const broken = await loadPersonalInfo({ ...api, getTask: async () => { throw new Error('nope'); } }, 'd1', parties);
ok(broken.size === 0, 'an answers read that fails leaves the party out');
const hidden = await loadPersonalInfo({ ...api, getTask: async () => ({ formHidden: true, formData: {} }) }, 'd1', parties);
ok(hidden.size === 0, 'answers the viewer may not see are not shown');

const src = readFileSync('js/pages/dealcontacts.js', 'utf8');
ok(src.includes("staffView && edit ? list.filter((p) => CLIENT_ROLES.includes(p.role)"), 'only staff who run orders get the answers section');
ok(!readFileSync('js/data/personal-info-contact.js', 'utf8').includes('updateContact'), 'the data module never writes; only the staff Save does');

console.log(fail ? fail + ' failed' : 'connect-3 personal info contact passed');
if (fail) process.exit(1);
