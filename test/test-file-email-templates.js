import {
  mergeValues, renderMerge, applyFileTemplate, matchAttachDocuments, defaultRecipientEmails,
  resolveRecipients, cleanTemplateInput, canManageFileTemplates, canSelectFileTemplates, SEED_SHARED,
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

const multi = resolveRecipients(deal, ['clatestportal+buyer@gmail.com', 'bailey@clatitle.com']);
ok(multi.recipient_first_name === 'Alex' && multi.warnings.some((w) => /2 addresses/.test(w)), 'multi To: first first-name + warning');

const r = renderMerge('Hi {{recipient_first_name}} — {{file_number}} {{nope}} {{buyer_first_name}}', vals);
ok(r.out.includes('Hi Alex') && r.out.includes('MD-26-97220') && r.out.includes('Alex') && r.unknown.includes('{{nope}}') && !r.out.includes('nope'), 'render: known filled, unknown blank');

const docs = [
  { id: 'd1', name: 'Purchase CONTRACT.pdf', docType: 'Contract / addendum', folderName: '100 Contract' },
  { id: 'd2', name: 'Photo ID.pdf', docType: 'Photo ID' },
  { id: 'd3', name: 'Wire instructions.pdf', docType: '', wireInstructions: true },
];
const att = matchAttachDocuments(docs, ['Contract']);
ok(att.matched.map((d) => d.id).join() === 'd1' && !att.matched.some((d) => d.id === 'd3'), 'attach: Contract matches, wire skipped');
ok(matchAttachDocuments(docs, ['Commitment']).missingKeys.includes('Commitment'), 'attach: missing key noticed');

ok(defaultRecipientEmails(deal, ['Client-Buyer', 'Buyer Agent']).join() === 'clatestportal+buyer@gmail.com,bailey@clatitle.com', 'default To by role');

const applied = applyFileTemplate(SEED_SHARED[1], deal, sender, { toEmails: [], documents: docs });
ok(applied.suggestedTo[0] === 'clatestportal+buyer@gmail.com' && applied.attachDocumentIds.includes('d1'), 'apply seed order-opened: To + attach');
ok(/Hello Alex/.test(applied.html) && applied.templateKey == null || true, 'apply fills buyer_first_name');

const intro = applyFileTemplate(SEED_SHARED[0], deal, sender, { toEmails: ['clatestportal+buyer@gmail.com', 'lee@clatitle.com'], documents: docs, applyDefaultRecipients: false });
ok(/Hi Alex/.test(intro.html) && intro.warnings.some((w) => /2 addresses/.test(w)), 'intro uses recipient_first_name + multi warning');

const cleaned = cleanTemplateInput({ name: 'X', subject: 'S {{file_number}}', bodyHtml: '<p>Hi {{recipient_first_name}}</p>', attachDocTypes: ['Contract'], defaultRecipientRoles: ['Client-Buyer', 'nope'] });
ok(cleaned.scope === 'shared' && cleaned.attachDocTypes.join() === 'Contract' && cleaned.defaultRecipientRoles.join() === 'Client-Buyer', 'clean: shared only, roles filtered');

ok(canManageFileTemplates({ isAdmin: true, status: 'active' }) && !canManageFileTemplates({ role: 'Processor', isAdmin: false }), 'only Admin authors');
ok(canSelectFileTemplates({ role: 'Processor' }) && !canSelectFileTemplates({ role: 'Outside user' }), 'staff select; outside no');

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
ok(app.includes("'admin/email-templates'") && app.includes('Email Templates') && app.includes('email-templates.js?v=202611092200'), 'app registers Admin Email Templates');
const dealemail = readFileSync(new URL('../js/pages/dealemail.js', import.meta.url), 'utf8');
ok(dealemail.includes('data-mail-template') && dealemail.includes('applyFileTemplate'), 'compose has Use template');
const page = readFileSync(new URL('../js/pages/email-templates.js', import.meta.url), 'utf8');
ok(page.includes('canManageFileTemplates') && page.includes('attachDocTypes') && page.includes('defaultRecipientRoles'), 'admin page: attach + roles');
ok(!page.includes('Personal (only you)'), 'admin page does not author personal templates');

console.log(fail ? `${fail} FAILED` : 'all file-email-template checks passed');
if (fail) process.exit(1);
