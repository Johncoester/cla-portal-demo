/* CONTACT-REUSE-1. John, Nov 20 2026, 11:33 AM ET.
 * Adding a person whose email is already on a contact must reuse that contact
 * and can put them on another file. Fake/mock data only. */
import { readFileSync } from 'node:fs';
import { existingContactByEmail, isUniqueEmailError, normContactEmail, reuseContactMessage } from '../js/data/contact-reuse.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(normContactEmail('  TCPortalJC@Gmail.com ') === 'tcportaljc@gmail.com', 'email is trimmed and lowercased');
ok(!existingContactByEmail([{ email: 'a@b.c' }], ''), 'a blank email is not treated as a match');
ok(!existingContactByEmail([{ email: '' }, { email: '   ' }], ''), 'blank stored emails are not a match');
const people = [
  { id: 'c1', firstName: 'TC Portal', lastName: 'Jc', email: 'tcportaljc@gmail.com' },
  { id: 'c2', firstName: 'Ann', lastName: 'Buyer', email: 'ann@example.test' },
];
ok(existingContactByEmail(people, 'TCPortalJC@Gmail.com').id === 'c1', 'a case-insensitive email finds the saved contact');
ok(!existingContactByEmail(people, 'missing@example.test'), 'an unknown email is not a match');
ok(isUniqueEmailError({ code: '23505', message: 'duplicate key value violates unique constraint "contacts_email_uq"', details: 'Key (email)=(a@b.c) already exists.' }), 'the unique email constraint is recognized');
ok(isUniqueEmailError(new Error('A contact with this email already exists.')), 'the mock duplicate message is recognized');
ok(!isUniqueEmailError({ code: '23502', message: 'null value in column "first_name"' }), 'a different database error is not treated as a duplicate email');
ok(reuseContactMessage(people[0]) === 'TC Portal Jc is already a contact. They were added to this file. A second record was not created.', 'the reuse note names the person');

const contactsSrc = readFileSync('js/pages/dealcontacts.js', 'utf8');
ok(contactsSrc.includes("from '../data/contact-reuse.js?v=202611249950'"), 'Order Contacts loads the reuse helper at the current stamp');
ok(/If that email is already on a contact/.test(contactsSrc), 'Add contact tells staff that an existing email is reused');
ok(!/That email is already saved on a contact\. Pick that person from the list/.test(contactsSrc), 'Add contact does not send the user back to the list on a known email');

const dealSrc = readFileSync('js/pages/deal.js', 'utf8');
ok(dealSrc.includes("from '../data/contact-reuse.js?v=202611249950'"), 'File Overview loads the reuse helper at the current stamp');
ok(/If that email is already on a contact/.test(dealSrc), 'the party buttons tell staff that an existing email is reused');
ok(!/That email is already saved on a contact\. Pick that person from the list/.test(dealSrc), 'the party buttons no longer stop on a known email');

const adapterSrc = readFileSync('js/data/supabase-adapter.js', 'utf8');
ok(/findContactByEmail/.test(adapterSrc) && /isUniqueEmailError/.test(adapterSrc), 'the hosted adapter looks up an existing email and catches the unique constraint');

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');

const first = await api.createContact({ firstName: 'TC Portal', lastName: 'Jc', email: 'tcportaljc@gmail.com', phone: '301-200-4609', contactType: 'agent_tc' });
const again = await api.createContact({ firstName: 'Different', lastName: 'Name', email: '  TCPortalJC@Gmail.com  ', phone: '000-000-0000', company: 'Other Co', contactType: 'realtor' });
ok(again.id === first.id && again.lastName === 'Jc' && again.firstName === 'TC Portal' && again.phone === '301-200-4609' && again.company === '' && again.contactType === 'agent_tc', 'creating with the same email returns the saved contact and does not overwrite it');
const listed = (await api.listContacts('tcportaljc@gmail.com')).filter((c) => (c.email || '').toLowerCase() === 'tcportaljc@gmail.com');
ok(listed.length === 1 && listed[0].id === first.id, 'the directory still has only one contact for that email');

const fileA = await api.createDeal({ street: '3425 Winmoor Drive', city: 'Silver Spring', state: 'MD', zip: '20906', transactionType: 'Purchase' });
const fileB = await api.createDeal({ street: '909 3rd Place SE', city: 'Washington', state: 'DC', zip: '20003', transactionType: 'Purchase' });
const agentA = await api.createContact({ firstName: 'John', lastName: 'Agent', email: 'john-agent-reuse@example.test', contactType: 'realtor' });
const agentB = await api.createContact({ firstName: 'Noah', lastName: 'Fields', email: 'noah-fields-reuse@example.test', contactType: 'realtor' });
await api.addParticipant(fileA.id, agentA.id, 'Buyer Agent');
await api.addParticipant(fileB.id, agentB.id, 'Buyer Agent');
await api.addParticipant(fileA.id, first.id, 'Buyer Agent TC');
const linked = await api.createContact({ firstName: 'TC Portal', lastName: 'Jc', email: 'tcportaljc@gmail.com', contactType: 'agent_tc' });
await api.addParticipant(fileB.id, linked.id, 'Buyer Agent TC');
ok(linked.id === first.id, 'the second file receives the same contact, not a new one');
const dealA = await api.getDeal(fileA.id);
const dealB = await api.getDeal(fileB.id);
const onFile = (deal) => (deal.participants || []).some((p) => p.contactId === first.id && p.role === 'Buyer Agent TC');
ok(onFile(dealA) && onFile(dealB), 'the same coordinator is on both files');

const blankA = await api.createContact({ firstName: 'No', lastName: 'Mail', email: '', contactType: 'buyer_seller' });
const blankB = await api.createContact({ firstName: 'Also', lastName: 'Blank', email: '', contactType: 'buyer_seller' });
ok(blankA.id !== blankB.id, 'two contacts with no email are still allowed');

const kept = await api.createContact({ firstName: 'Kept', lastName: 'Email', email: 'kept.email@example.test', contactType: 'buyer_seller' });
const other = await api.createContact({ firstName: 'Other', lastName: 'Person', email: 'other.person@example.test', contactType: 'buyer_seller' });
let updateErr = '';
try { await api.updateContact(other.id, { email: 'kept.email@example.test' }); } catch (e) { updateErr = e.message || String(e); }
const otherReload = (await api.listContacts('other.person@example.test')).find((c) => c.id === other.id);
ok(/already exists/i.test(updateErr) && otherReload.email === 'other.person@example.test' && kept.email === 'kept.email@example.test', 'changing a contact to an email already in use still fails and does not overwrite either record');

if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log('all ok');
