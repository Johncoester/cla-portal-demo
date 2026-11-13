/* Francis Nov 9: Contacts tab "+ Add contact" offers the same Place Order inline
   "Add … as a new person" when the typed name has no match, then links them to the
   already-opened file. Fake/mock data only. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { matchPeople, splitPersonName, mountPicker, pickerHtml, detail, personLabel } from '../js/pages/person-picker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { readFileSync } from 'node:fs';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.KeyboardEvent = window.KeyboardEvent || window.Event;

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const src = readFileSync('js/pages/dealcontacts.js', 'utf8');
ok(/onCreate:\s*quickCreate/.test(src), 'dealcontacts wires picker onCreate');
ok(/allowCreate:\s*\(\)\s*=>\s*!isTc\(\)/.test(src), 'dealcontacts hides inline create for Transaction Coordinator');
ok(/splitPersonName/.test(src), 'dealcontacts imports splitPersonName');
ok(/Add "…" as a new person/.test(src) || /Add "\u2026" as a new person/.test(src) || /as a new person/.test(src), 'dealcontacts tells staff about inline create');

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');

const deal = await api.createDeal({
  street: '9 Contacts Add Way', city: 'Rockville', state: 'MD', zip: '20850', transactionType: 'Purchase',
});

// Existing contact: pick from list and addParticipant (Contacts tab path)
const existing = await api.createContact({ firstName: 'Casey', lastName: 'Buyer', email: 'clatestportal+casey@example.test', contactType: 'buyer_seller' });
await api.addParticipant(deal.id, existing.id, 'Client-Buyer');
let ov = await api.getOrderOverview(deal.id);
ok(ov.parties.some((p) => p.label === 'Buyer' && /Casey/.test(p.name)), 'existing contact linked to opened file');

// Brand-new person via the same picker onCreate path Contacts now uses
const root = document.createElement('div');
root.innerHTML = toText(pickerHtml('contactId', 'Contact'));
document.body.appendChild(root);
const people = await api.listContacts();
let role = 'Buyer Agent';
let created = null;
const isTc = () => role === 'Transaction Coordinator';
const pk = mountPicker(root.querySelector('[data-picker]'), () => (isTc() ? [] : people), {
  createVerb: () => (role === 'Lender' ? 'lender' : 'person'),
  allowCreate: () => !isTc(),
  onCreate: async (typed) => {
    const { firstName, lastName } = splitPersonName(typed);
    created = await api.createContact({ firstName, lastName, email: '', phone: '', company: '', contactType: 'realtor' });
    people.push(created);
    return created;
  },
});
const q = root.querySelector('.picker-q');
q.value = 'Pat Listing';
q.dispatchEvent(new window.Event('input'));
await wait(10);
const createLi = root.querySelector('li[data-create]');
ok(!!createLi && /Add "Pat Listing" as a new person/.test(createLi.textContent), 'Contacts picker shows inline create when no match');
createLi.dispatchEvent(new window.Event('mousedown', { bubbles: true }));
await wait(40);
ok(created && created.firstName === 'Pat' && created.lastName === 'Listing' && pk.value === created.id, 'inline create selects the new contact');
await api.addParticipant(deal.id, created.id, 'Listing Agent');
ov = await api.getOrderOverview(deal.id);
ok(ov.parties.some((p) => p.label === 'Listing Agent' && /Pat Listing/.test(p.name)), 'new person persists on the opened file');

// Lender company-ish create
role = 'Lender';
q.value = 'Acme Mortgage LLC';
q.dispatchEvent(new window.Event('input'));
await wait(10);
ok(!!root.querySelector('li[data-create]') && /new lender/.test(root.querySelector('li[data-create]').textContent), 'lender role uses lender create verb');

// TC: no inline create
role = 'Transaction Coordinator';
q.value = 'Nobody Here';
q.dispatchEvent(new window.Event('input'));
await wait(10);
ok(!root.querySelector('li[data-create]') && /Pick someone from the list/.test(root.querySelector('li[data-none]')?.textContent || ''), 'TC role offers no inline create');

// allowCreate gate unit
ok(matchPeople([{ id: '1', firstName: 'Ann', lastName: 'Buyer', email: '', company: '' }], 'Zzz').length === 0, 'unknown name has no match');

ok(src.includes("tcIds.add('staff:' + t.profileId)") && src.includes('isTcPick'), 'dealcontacts TC list includes staff logins that have no contact row');
ok(src.includes('Any active staff login can be the Transaction Coordinator') && !src.includes('Only users with the Transaction Coordinator account role'), 'dealcontacts TC note allows any active staff login');

// John, 3:11 PM ET Nov 13 video: two John Coesters, one staff login and one realtor contact
const staffJohn = { id: 'staff:u-john', profileId: 'u-john', firstName: 'John', lastName: 'Coester', email: 'jcoester@clatitle.com', accountRole: 'Super admin' };
const realtorJohn = { id: 'c-realtor', firstName: 'John', lastName: 'Coester', email: 'johncoester@gmail.com', phone: '240-277-2894', company: 'Compass', contactType: 'realtor' };
const johnsRoot = document.createElement('div');
johnsRoot.innerHTML = toText(pickerHtml('who', 'Contact'));
document.body.appendChild(johnsRoot);
const johnPk = mountPicker(johnsRoot.querySelector('[data-picker]'), () => [staffJohn, realtorJohn], { allowCreate: () => false });
const johnQ = johnsRoot.querySelector('.picker-q');
johnQ.value = 'john co';
johnQ.dispatchEvent(new window.Event('input'));
await wait(10);
const johnItems = [...johnsRoot.querySelectorAll('li[data-id]')].map((li) => ({ id: li.dataset.id, text: li.textContent.replace(/\s+/g, ' ').trim() }));
ok(johnItems.some((li) => li.id === 'staff:u-john' && /John Coester/.test(li.text) && /Super admin/.test(li.text) && /jcoester@clatitle.com/.test(li.text)), 'typing john co shows John Coester · Super admin · jcoester@clatitle.com');
ok(johnItems.some((li) => li.id === 'c-realtor' && /John Coester/.test(li.text) && /Realtor/.test(li.text) && /johncoester@gmail.com/.test(li.text) && /Compass/.test(li.text)), 'typing john co also shows the realtor John Coester with type, email and company');
johnQ.value = 'jco';
johnQ.dispatchEvent(new window.Event('input'));
await wait(10);
const jcoItems = [...johnsRoot.querySelectorAll('li[data-id]')].map((li) => li.dataset.id);
ok(jcoItems.includes('staff:u-john'), 'typing jco finds the Super admin login by email');
ok(detail(staffJohn) === 'Super admin · jcoester@clatitle.com' && personLabel(staffJohn) === 'John Coester', 'the staff dropdown line is Super admin and the email');
void johnPk;

console.log(fail ? fail + ' failed' : 'contacts inline add passed');
if (fail) process.exit(1);
