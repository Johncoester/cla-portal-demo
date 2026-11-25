/* MF-045 (Matt, "Processor User-Documents" notes; confirmed Nov 11 2:33 PM ET): the Documents From column shows the name and role
 * of whoever shared each document. On the hosted site the rows only had the sender's id, so From was blank. No network. */
import { readFileSync } from 'node:fs';
import { nameDocSenders, sendersToLookUp, applyEmailSenders, emailFromLabel, CLA_SENDER, CLA_SHARED, EMAIL_SENDER_ROLE } from '../js/data/doc-senders.js';
import { docMatches, sortDocs } from '../js/data/doc-list.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const parts = [
  { role: 'Buyer Agent', contact: { profileId: 'p-agent', firstName: 'Pat', lastName: 'Agent' } },
  { role: 'Client-Buyer', contact: { profileId: 'p-buyer', firstName: 'Bea', lastName: 'Buyer' } },
  { role: 'Client-Seller', contact: { profileId: 'p-both', firstName: 'Sam', lastName: 'Both' } },
  { role: 'Listing Agent', contact: { profileId: 'p-both', firstName: 'Sam', lastName: 'Both' } },
  { role: 'Listing Agent', removed: true, contact: { profileId: 'p-gone', firstName: 'Gone', lastName: 'Agent' } },
  { role: 'Client-Seller', contact: { profileId: null, firstName: 'No', lastName: 'Login' } },
];
const staff = [{ id: 'p-proc', firstName: 'Proc', lastName: 'One', role: 'Processor' }, { id: 'p-sales', firstName: '', lastName: '', role: 'Sales Person' }];
const docs = [
  { id: 'd1', name: 'CD.pdf', uploadedBy: 'p-proc' }, { id: 'd2', name: 'Contract.pdf', uploadedBy: 'p-agent' }, { id: 'd3', name: 'ID.png', uploadedBy: 'p-buyer' },
  { id: 'd4', name: 'Deed.pdf', uploadedBy: 'p-both' }, { id: 'd5', name: 'Old.pdf', uploadedBy: null }, { id: 'd6', name: 'Mystery.pdf', uploadedBy: 'p-unknown' },
  { id: 'd7', name: 'Sales.pdf', uploadedBy: 'p-sales' }, { id: 'd8', name: 'Kept.pdf', uploadedBy: 'p-agent', uploadedByName: 'Already Named', uploadedByRole: 'Demo role' },
];
const by = (list, id) => list.find((d) => d.id === id);

// a processor looking at the file (Matt's case)
const proc = { id: 'p-proc', firstName: 'Proc', lastName: 'One', role: 'Processor' };
const a = nameDocSenders(docs, { user: proc, participants: parts, profiles: staff });
ok(by(a, 'd1').uploadedByName === 'Proc One' && by(a, 'd1').uploadedByRole === 'Processor', 'a document the processor shared shows their own name and "Processor"');
ok(by(a, 'd2').uploadedByName === 'Pat Agent' && by(a, 'd2').uploadedByRole === "Buyer's agent", "a document from the buyer's agent shows the agent's name and role on this file");
ok(by(a, 'd3').uploadedByName === 'Bea Buyer' && by(a, 'd3').uploadedByRole === 'Buyer', 'a document from the buyer shows the buyer');
ok(by(a, 'd4').uploadedByName === 'Sam Both' && by(a, 'd4').uploadedByRole === 'Listing agent, Seller', 'someone with two roles on the file shows both, agent first');
ok(by(a, 'd5').uploadedByName === '' && by(a, 'd5').uploadedByRole === '', 'a document with no sender on record stays blank (the page says "Not recorded")');
ok(by(a, 'd6').uploadedByName === CLA_SENDER && by(a, 'd6').uploadedByRole === 'CLA Title', 'a sender this sign-in cannot read shows as CLA Title & Escrow');
ok(by(a, 'd7').uploadedByName === 'Sales Person' && by(a, 'd7').uploadedByRole === 'Sales Person', 'a staff login with no name on it shows its role');
ok(by(a, 'd8').uploadedByName === 'Already Named' && by(a, 'd8').uploadedByRole === 'Demo role', 'a row that already has a name (the demo data) is left alone');
ok(a.length === docs.length && docs.every((d) => !('uploadedByName' in d) || d.id === 'd8'), 'no row is added or dropped, and the loaded rows are not changed');

// who is worth a lookup
ok(sendersToLookUp(docs, { user: proc, participants: parts }).join(',') === 'p-unknown,p-sales', 'only senders who are not the viewer and not on the file are looked up, once each');
ok(sendersToLookUp([{ uploadedBy: 'p-agent' }, { uploadedBy: 'p-proc' }], { user: proc, participants: parts }).length === 0, 'a list from the viewer and the file parties needs no lookup');

// an agent sees names; a buyer or seller does not see who on the file uploaded what CLA shared with them
const agent = { id: 'p-agent', firstName: 'Pat', lastName: 'Agent', role: 'Outside user' };
const b = nameDocSenders(docs, { user: agent, participants: parts, profiles: [] });
ok(by(b, 'd2').uploadedByName === 'Pat Agent' && by(b, 'd2').uploadedByRole === "Buyer's agent", 'an agent sees their own name and file role on what they sent');
ok(by(b, 'd3').uploadedByName === 'Bea Buyer' && by(b, 'd1').uploadedByName === CLA_SENDER, 'an agent sees their buyer by name; CLA staff they cannot read show as CLA Title & Escrow');
const buyer = { id: 'p-buyer', firstName: 'Bea', lastName: 'Buyer', role: 'Outside user' };
const c = nameDocSenders(docs, { user: buyer, participants: parts, profiles: [] });
ok(by(c, 'd3').uploadedByName === 'Bea Buyer' && by(c, 'd3').uploadedByRole === 'Buyer', 'a buyer sees their own uploads under their name');
ok(by(c, 'd2').uploadedByName === CLA_SENDER && by(c, 'd2').uploadedByRole === CLA_SHARED && by(c, 'd4').uploadedByName === CLA_SENDER, 'a buyer is not shown which other party uploaded a document CLA shared with them');
ok(nameDocSenders(null).length === 0 && nameDocSenders([{ id: 'x', uploadedBy: 'p' }])[0].uploadedByName === CLA_SENDER, 'missing inputs do not throw');

// search and sort (Documents search box and the From header) now work on the sender
ok(a.filter((d) => docMatches(d, 'pat')).map((d) => d.id).join(',') === 'd2' && a.filter((d) => docMatches(d, "buyer's agent")).length === 1, 'the search box finds a document by who shared it or their role');
ok(sortDocs(a, 'from', 'asc').slice(0, 2).map((d) => d.id).join(',') === 'd8,d3', 'the From header sorts by the sender name');


// FF-113: emailed attachments show the email's sender, not the processor mailbox stored in uploadedBy
const mailDocs = [
  { id: 'e1', name: 'W9.pdf', uploadedBy: 'p-proc', emailAttachmentKey: 'msg-in:att1' },
  { id: 'e2', name: 'ID.png', uploadedBy: 'p-buyer' },
  { id: 'e3', name: 'Old.pdf', uploadedBy: 'p-proc', emailAttachmentKey: 'msg-gone:att1' },
  { id: 'e4', name: 'Out.pdf', uploadedBy: 'p-proc', emailAttachmentKey: 'msg-out:att1' },
];
const emails = [
  { id: 'm-in', direction: 'in', fromName: 'Pat Agent', fromEmail: 'pat@broker.test', sentAt: '2026-11-20T15:00:00Z', attachmentDocumentIds: ['e1'] },
  { id: 'm-out', direction: 'out', fromName: 'Proc One', fromEmail: 'proc@clatitle.com', sentAt: '2026-11-21T15:00:00Z', attachmentDocumentIds: ['e4'] },
  { id: 'm-later', direction: 'out', fromName: 'Should Not Win', fromEmail: 'other@clatitle.com', sentAt: '2026-11-22T15:00:00Z', attachmentDocumentIds: ['e1'] },
];
const partsWithEmail = parts.map((p) => p.role === 'Buyer Agent' ? { ...p, contact: { ...p.contact, email: 'pat@broker.test' } } : p);
const labeled = applyEmailSenders(mailDocs, emails, { participants: partsWithEmail });
ok(by(labeled, 'e1').uploadedByName === 'Pat Agent' && by(labeled, 'e1').uploadedByRole === "Buyer's agent", 'an inbound email attachment shows the sender who is on the file, not the processor mailbox');
ok(applyEmailSenders([{ id: 'e5', uploadedBy: 'p-proc', emailAttachmentKey: 'msg-x:1' }], [{ direction: 'in', fromName: 'Kim Lender', fromEmail: 'kim@bank.test', attachmentDocumentIds: ['e5'] }])[0].uploadedByName === 'Kim Lender' && applyEmailSenders([{ id: 'e5', uploadedBy: 'p-proc', emailAttachmentKey: 'msg-x:1' }], [{ direction: 'in', fromName: 'Kim Lender', fromEmail: 'kim@bank.test', attachmentDocumentIds: ['e5'] }])[0].uploadedByRole === 'kim@bank.test', 'an emailed attachment from someone not on the file shows their From name and address');
ok(by(labeled, 'e2').uploadedByName === undefined && by(labeled, 'e2').uploadedBy === 'p-buyer', 'an agent or client upload is left for nameDocSenders (the uploader)');
const after = nameDocSenders(labeled, { user: proc, participants: parts, profiles: staff });
ok(by(after, 'e2').uploadedByName === 'Bea Buyer' && by(after, 'e2').uploadedByRole === 'Buyer', 'after the email labels, a client upload still shows the uploader');
ok(by(after, 'e1').uploadedByName === 'Pat Agent' && by(after, 'e1').uploadedByRole === "Buyer's agent", 'nameDocSenders leaves an email-labeled row alone');
ok(by(labeled, 'e3').uploadedByName === undefined, 'a keyed attachment with no matching email is left alone so the From column can still use the stored uploader');
ok(by(labeled, 'e4').uploadedByName === 'Proc One' && by(labeled, 'e4').uploadedByRole === 'proc@clatitle.com', 'an outbound Gmail attachment shows the email From name and address');
ok(emailFromLabel({ fromName: '', fromEmail: 'pat@broker.test' }).name === 'pat@broker.test' && emailFromLabel({ fromName: '', fromEmail: '' }) === null, 'a missing display name falls back to the address; a blank From stays unlabeled');
ok(applyEmailSenders(null, null).length === 0 && applyEmailSenders(mailDocs, []).every((d, i) => d === mailDocs[i]), 'missing emails do not throw and do not rewrite rows');

// wiring
const ad = read('js/data/supabase-adapter.js');
ok(ad.includes('async listDocuments(dealId, { folderId, senders = false } = {})') && ad.includes('if (!senders) return listed'), 'only a caller that asks for senders pays for it; every other caller gets the rows as before');
ok(ad.includes("sb.from('deal_emails').select('from_email, from_name, direction, sent_at, attachment_document_ids')") && ad.includes('applyEmailSenders(listed, emails, { participants })'), 'email attachments get the email From from deal_emails; uploaded_by is left as the mailbox for access rules');
ok(ad.includes("sb.from('profiles').select('id, first_name, last_name, role').in('id', ids)") && ad.includes('a.readDeal(dealId)') && ad.includes('nameDocSenders(withEmail, { user, participants, profiles })'), 'uploads still get a profiles read for senders not on the file; the parties come from the file read the page already made');
const page = read('js/pages/dealdocs.js');
ok(page.includes('{ senders: true }') && page.includes('folderId: folder, senders: true'), 'the Documents tab asks for senders, with or without a folder picked');
ok(page.includes('data-doc-from') && page.includes('Not recorded') && page.includes('data-doc-from-role'), 'the From column shows the name with the role under it, or "Not recorded"');

console.log(fail ? fail + ' failed' : 'document senders passed');
if (fail) process.exit(1);
