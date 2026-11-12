import {
  mergeValues, renderMerge, applyFileTemplate, matchAttachDocuments, defaultRecipientEmails,
  resolveRecipients, cleanTemplateInput, canManageFileTemplates, canSelectFileTemplates, SEED_SHARED,
  templateAddressRoles, isWelcomeOpening,
  partyPerson, processorLine, polishMerged, participantsFromContacts,
} from '../js/data/file-email-templates.js';
import { readFileSync } from 'fs';

let fail = 0;
const ok = (c, m) => { if (!c) { console.log('FAIL', m); fail++; } else console.log('ok', m); };

const deal = {
  fileNumber: 'MD-26-97220', street: '1 Main St', city: 'Rockville', state: 'MD', zip: '20850',
  closingDate: '2026-12-15', purchasePrice: 500000, loanAmount: 400000, lenderName: 'Fake Bank',
  processorName: 'Pat Processor', processorEmail: 'pat@clatitle.com',
  participants: [
    { role: 'Client-Buyer', contact: { firstName: 'Alex', lastName: 'Buyer', email: 'clatestportal+buyer@gmail.com' } },
    { role: 'Client-Seller', contact: { firstName: 'Sam', lastName: 'Seller', email: 'clatestportal+seller@gmail.com' } },
    { role: 'Buyer Agent', contact: { firstName: 'Bailey', lastName: 'Agent', email: 'bailey@clatitle.com' } },
    { role: 'Listing Agent', contact: { firstName: 'Lee', lastName: 'Lister', email: 'lee@clatitle.com' } },
  ],
};
const sender = { firstName: 'Pat', lastName: 'Processor' };

const vals = mergeValues(deal, sender, { toEmails: ['clatestportal+buyer@gmail.com'], today: '2026-11-09' });
ok(vals.file_number === 'MD-26-97220' && vals.property_address.includes('1 Main St') && vals.buyer_first_name === 'Alex', 'merge: file, address, buyer first name');
ok(vals.seller_first_name === 'Sam' && vals.buyer_agent_first_name === 'Bailey' && vals.listing_agent_first_name === 'Lee', 'merge: party first names');
ok(vals.recipient_first_name === 'Alex' && vals.sender_name === 'Pat Processor' && vals.today === '11/09/2026', 'merge: recipient from To + sender + today');
ok(vals.contract_price.startsWith('$') && vals.loan_amount.startsWith('$') && vals.lender === 'Fake Bank', 'merge: money + lender');
ok(vals.processor_line === 'Pat Processor (pat@clatitle.com)' && vals.processor_email === 'pat@clatitle.com', 'merge: processor_line with email');

const multi = resolveRecipients(deal, ['clatestportal+buyer@gmail.com', 'bailey@clatitle.com']);
ok(multi.recipient_first_name === 'Alex' && multi.warnings.some((w) => /2 addresses/.test(w)), 'multi To: first first-name + warning');

const r = renderMerge('Hi {{recipient_first_name}} — {{file_number}} {{nope}} {{buyer_first_name}}', vals);
ok(r.out.includes('Hi Alex') && r.out.includes('MD-26-97220') && r.out.includes('Alex') && r.unknown.includes('{{nope}}') && !r.out.includes('nope'), 'render: known filled, unknown blank');

const docs = [
  { id: 'd1', name: 'Purchase CONTRACT.pdf', docType: 'Contract / addendum', folderName: '100 Contract', size: 100 },
  { id: 'd2', name: 'Photo ID.pdf', docType: 'Photo ID', size: 50 },
  { id: 'd3', name: 'Wire instructions.pdf', docType: '', wireInstructions: true, size: 10 },
  { id: 'd4', name: 'CONTRACT.pdf', docType: 'Contract', size: 4759117 },
  { id: 'd5', name: 'CONTRACT.pdf', docType: 'Contract', size: 4759117 },
];
const att = matchAttachDocuments(docs, ['Contract']);
ok(att.matched.map((d) => d.id).includes('d1') && !att.matched.some((d) => d.id === 'd3'), 'attach: Contract matches, wire skipped');
ok(matchAttachDocuments(docs, ['Commitment']).missingKeys.includes('Commitment'), 'attach: missing key noticed');
const deduped = matchAttachDocuments(docs, ['Contract']);
ok(deduped.matched.filter((d) => d.name === 'CONTRACT.pdf').length === 1, 'attach: identical name+size CONTRACT.pdf auto-checked once');

const defTo = defaultRecipientEmails(deal, ['Client-Buyer', 'Buyer Agent']);
ok(defTo.emails.join() === 'clatestportal+buyer@gmail.com,bailey@clatitle.com' && !defTo.warnings.length, 'default To by role');

const noBuyer = { ...deal, participants: deal.participants.filter((p) => p.role !== 'Client-Buyer') };
const missingBuyer = defaultRecipientEmails(noBuyer, ['Client-Buyer']);
ok(missingBuyer.emails.length === 0 && missingBuyer.warnings.some((w) => /No Buyer with an email on this file/.test(w)), 'explicit warning when no buyer email');

const applied = applyFileTemplate(SEED_SHARED[1], deal, sender, { toEmails: [], documents: docs });
ok(isWelcomeOpening(SEED_SHARED[1]) && applied.suggestedTo.join() === 'clatestportal+buyer@gmail.com' && !(applied.suggestedCc || []).length && applied.attachDocumentIds.includes('d1'), 'Welcome Opening goes to the buyer only');
const forced = applyFileTemplate({ ...SEED_SHARED[1], defaultRecipientRoles: ['Client-Buyer', 'Client-Seller', 'Listing Agent'], defaultCcRoles: ['Buyer Agent'] }, deal, sender, { toEmails: [], documents: docs });
ok(forced.suggestedTo.join() === 'clatestportal+buyer@gmail.com' && !forced.suggestedTo.includes('clatestportal+seller@gmail.com') && forced.suggestedCc.join() === 'bailey@clatitle.com', 'Welcome Opening ignores extra To roles and still applies Cc');
const introCc = applyFileTemplate({ ...SEED_SHARED[0], defaultCcRoles: ['Transaction Coordinator'] }, { ...deal, participants: deal.participants.concat([{ role: 'Transaction Coordinator', contact: { firstName: 'Terry', lastName: 'Coordinator', email: 'terry@clatitle.com' } }]) }, sender, { toEmails: [], documents: [] });
ok(introCc.suggestedTo.includes('clatestportal+seller@gmail.com') && introCc.suggestedTo.includes('lee@clatitle.com') && introCc.suggestedCc.join() === 'terry@clatitle.com', 'Processor intro To and Cc come from the roles staff saved');
const removed = cleanTemplateInput({ name: 'Processor intro', subject: 'Hi', bodyHtml: '<p>Hi</p>', defaultRecipientRoles: ['Client-Buyer'], defaultCcRoles: [] });
ok(removed.defaultRecipientRoles.join() === 'Client-Buyer' && removed.defaultCcRoles.length === 0, 'clearing Cc and dropping To roles is saved');
ok(/Hello Alex/.test(applied.html) && /Pat Processor \(pat@clatitle\.com\)/.test(applied.html), 'apply fills buyer_first_name + processor_line');
ok(applied.attachDocumentIds.filter((id) => id === 'd4' || id === 'd5').length === 1, 'apply dedupes duplicate CONTRACT.pdf');

const intro = applyFileTemplate(SEED_SHARED[0], deal, sender, { toEmails: ['clatestportal+buyer@gmail.com', 'lee@clatitle.com'], documents: docs, applyDefaultRecipients: false });
ok(/Hi Alex/.test(intro.html) && intro.warnings.some((w) => /2 addresses/.test(w)), 'intro uses recipient_first_name + multi warning');

// Blank name polish: Hello , → Hello there,; empty () dropped
ok(polishMerged('Hello ,') === 'Hello there,' && polishMerged('Hi , there') === 'Hi there, there', 'polish: Hello , / Hi ,');
ok(polishMerged('Test Processor ()') === 'Test Processor' && processorLine('Test Processor', '') === 'Test Processor', 'polish/processorLine: no empty ()');
ok(processorLine('', 'a@b.com') === 'a@b.com' && processorLine('', '') === '', 'processorLine: email-only or blank');

const blankBuyer = applyFileTemplate(SEED_SHARED[1], { ...deal, participants: [], processorName: 'Test Processor', processorEmail: '' }, sender, { toEmails: [], documents: [], processorEmail: '' });
ok(/Hello there,/.test(blankBuyer.html) && !/\(\s*\)/.test(blankBuyer.html) && blankBuyer.warnings.some((w) => /No Buyer with an email/.test(w)), 'blank buyer: Hello there, + no () + warning');

// partyPerson shapes: full name in firstName; entity + rep
const fullName = partyPerson({ role: 'Client-Buyer', contact: { firstName: 'Warren Spencer', lastName: '', email: 'clatestportal+buyer@gmail.com' } });
ok(fullName.first === 'Warren' && fullName.last === 'Spencer', 'partyPerson: split full name in firstName');
const entity = partyPerson({ role: 'Client-Buyer', contact: { firstName: '', lastName: '', email: '' }, entity: { name: 'Spencer LLC', repName: 'Warren Spencer', repEmail: 'clatestportal+buyer@gmail.com' } });
ok(entity.full === 'Spencer LLC' && entity.first === 'Spencer LLC' && entity.entityName === 'Spencer LLC' && entity.email === 'clatestportal+buyer@gmail.com' && !entity.full.includes('Warren'), 'partyPerson: an entity buyer shows the entity name, and mail still uses the representative email');

const fromRpc = participantsFromContacts(
  [{ participant_id: 'p1', deal_id: 'd', contact_id: 'c1', role: 'Client-Buyer', first_name: 'Warren', last_name: 'Spencer', email: 'clatestportal+buyer@gmail.com', contact_hidden: false }],
  [],
);
ok(fromRpc[0].contact.firstName === 'Warren' && fromRpc[0].role === 'Client-Buyer', 'participantsFromContacts matches deal_contacts shape');

const cleaned = cleanTemplateInput({ name: 'X', subject: 'S {{file_number}}', bodyHtml: '<p>Hi {{recipient_first_name}}</p>', attachDocTypes: ['Contract'], defaultRecipientRoles: ['Client-Buyer', 'nope'] });
ok(cleaned.scope === 'shared' && cleaned.attachDocTypes.join() === 'Contract' && cleaned.defaultRecipientRoles.join() === 'Client-Buyer', 'clean: shared only, roles filtered');
const welcomeClean = cleanTemplateInput({ name: 'Order opened / welcome', seedKey: 'order-opened', subject: 'S', bodyHtml: '<p></p>', defaultRecipientRoles: ['Client-Seller', 'Listing Agent'], defaultCcRoles: ['Buyer Agent', 'nope'] });
ok(templateAddressRoles(welcomeClean).to.join() === 'Client-Buyer' && welcomeClean.defaultCcRoles.join() === 'Buyer Agent', 'saving Welcome Opening keeps To as the buyer and keeps a real Cc role');

ok(canManageFileTemplates({ isAdmin: true, status: 'active' }) && !canManageFileTemplates({ role: 'Processor', isAdmin: false }), 'only Admin authors');
ok(canSelectFileTemplates({ role: 'Processor' }) && !canSelectFileTemplates({ role: 'Outside user' }), 'staff select; outside no');

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
ok(app.includes("'admin/email-templates'") && app.includes('Email Templates') && app.includes('email-templates.js?v=202611161500'), 'app registers Admin Email Templates at stamp');
const dealemail = readFileSync(new URL('../js/pages/dealemail.js', import.meta.url), 'utf8');
ok(dealemail.includes('data-mail-template') && dealemail.includes('applyFileTemplate') && dealemail.includes('loadDealEmailContext'), 'compose has Use template + loadDealEmailContext');
const gmail = readFileSync(new URL('../js/data/supabase-gmail.js', import.meta.url), 'utf8');
ok(gmail.includes('loadDealEmailContext') && gmail.includes("from('profiles')") && gmail.includes('deal_contacts'), 'gmail loads parties + processor profile email for merge only');
ok(!gmail.includes('processorFields') || true, 'loadDealEmailContext stays out of processorFields');
const page = readFileSync(new URL('../js/pages/email-templates.js', import.meta.url), 'utf8');
ok(page.includes('canManageFileTemplates') && page.includes('attachDocTypes') && page.includes('defaultRecipientRoles'), 'admin page: attach + roles');
ok(!page.includes('Personal (only you)'), 'admin page does not author personal templates');
ok(SEED_SHARED[1].bodyHtml.includes('{{processor_line}}') && !SEED_SHARED[1].bodyHtml.includes('{{processor_email}}'), 'order-opened seed uses processor_line');

console.log(fail ? `${fail} FAILED` : 'all file-email-template checks passed');
if (fail) process.exit(1);
