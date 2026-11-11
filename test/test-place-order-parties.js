/* BUG-175 / BUG-176. A selected party is attached from the picker, not only the hidden field.
 * A placed order is not restored as a draft. No hosted project. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { mountPicker, pickerHtml } from '../js/pages/person-picker.js';
import { partyEntries } from '../js/pages/ordernew.js';
import { orderDraftKey, readOrderDraft, tombstoneOrderDraft } from '../js/data/order-draft.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
globalThis.Event = window.Event;

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const people = [
  { id: 'c-buyer', firstName: 'Ben', lastName: 'Buyer' },
  { id: 'c-seller', firstName: 'Sally', lastName: 'Seller' },
  { id: 'c-bagent', firstName: 'Bianca', lastName: 'Buyer-Agent' },
  { id: 'c-lagent', firstName: 'Larry', lastName: 'Listing-Agent' },
  { id: 'c-lender1', firstName: 'Linda', lastName: 'Lender', company: 'Example Home Loans (fake)' },
];
document.body.innerHTML = toText(pickerHtml('p:Client-Seller', 'Seller'));
const pk = mountPicker(document.querySelector('[data-picker]'), () => people, {});
const q = document.querySelector('.picker-q');
q.value = 'Sally';
q.dispatchEvent(new window.Event('input'));
document.querySelector('li[data-id="c-seller"]').dispatchEvent(new window.Event('mousedown', { bubbles: true }));
q.dispatchEvent(new window.Event('input'));
ok(pk.value === 'c-seller' && document.querySelector('input[type=hidden]').value === 'c-seller', 'a stray input does not clear a selected person');
document.querySelector('input[type=hidden]').value = '';
ok(pk.value === 'c-seller', 'the picker still knows the person after the hidden id is cleared');

const formParts = [{ name: 'p:Client-Buyer', contactId: 'c-buyer', role: 'Client-Buyer' }];
const picks = [
  { name: 'p:Client-Buyer', contactId: 'c-buyer', role: 'Client-Buyer' },
  { name: 'p:Client-Seller', contactId: 'c-seller', role: 'Client-Seller' },
  { name: 'p:Buyer Agent', contactId: 'c-bagent', role: 'Buyer Agent' },
  { name: 'p:Listing Agent', contactId: 'c-lagent', role: 'Listing Agent' },
  { name: 'p:Lender', contactId: 'c-lender1', role: 'Lender' },
];
const entries = partyEntries(formParts, picks);
ok(entries.map((e) => e.role + ':' + e.contactId).join('|') === 'Client-Buyer:c-buyer|Client-Seller:c-seller|Buyer Agent:c-bagent|Listing Agent:c-lagent|Lender:c-lender1', 'picker state fills the parties FormData lost');

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
let lists = 0;
const listContacts = api.listContacts.bind(api);
api.listContacts = async (...args) => { lists += 1; return listContacts(...args); };
const deal = await api.createDeal({ street: '100 Place Order Lane', city: 'Alexandria', state: 'VA', zip: '22314', openDate: '2026-11-01', transactionType: 'Purchase', claRepresentation: 'both' });
const before = lists;
for (const entry of entries) await api.addParticipant(deal.id, entry.contactId, entry.role);
ok(lists === before, 'attaching the selected parties does not list contacts again');
const opened = await api.getDeal(deal.id);
const roles = (opened.participants || []).filter((p) => !p.removed).map((p) => p.role + ':' + p.contactId);
ok(['Client-Buyer:c-buyer', 'Client-Seller:c-seller', 'Buyer Agent:c-bagent', 'Listing Agent:c-lagent', 'Lender:c-lender1'].every((row) => roles.includes(row)), 'seller, both agents and the lender are on the file');

const company = await api.createDeal({ street: '200 Company Lane', city: 'Alexandria', state: 'VA', zip: '22314', openDate: '2026-11-01', transactionType: 'Purchase', claRepresentation: 'both', lenderName: 'Only Company Loans' });
const listsAtCompany = lists;
const found = (await api.listContacts()).find((c) => c.company === 'Only Company Loans' && !c.firstName && !c.lastName);
ok(lists === listsAtCompany + 1, 'the test lookup is the only extra contact list');
const lender = found || await api.createContact({ firstName: '', lastName: '', company: 'Only Company Loans', email: '', phone: '', contactType: 'lender' });
await api.addParticipant(company.id, lender.id, 'Lender');
const companyFile = await api.getDeal(company.id);
const row = (companyFile.participants || []).find((p) => p.role === 'Lender' && !p.removed);
ok(row && row.contact.company === 'Only Company Loans' && !row.contact.firstName, 'a company-only lender can be saved with no contact person');

const page = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
const lenderBlock = page.slice(page.indexOf('const lenderCompany'), page.indexOf('if (referral)'));
ok(!lenderBlock.includes('listContacts'), 'Place Order does not list contacts again while saving the lender company');
ok(page.includes('partyEntries(formParts, picks)'), 'Place Order attaches from the picker state');
ok(page.includes("removeEventListener('click', onDocClick, true)") && page.includes("removeEventListener('beforeunload', onLeave)"), 'the draft listeners are removed on unmount');
ok(page.includes('if (problems.length)') && page.indexOf('if (problems.length)') < page.indexOf("go('/deals/' + deal.id)"), 'a failed attach stays on Place Order instead of leaving with a toast');
ok(page.includes('tombstoneOrderDraft'), 'a placed order tombstones the draft');

const user = await api.getSession();
const key = orderDraftKey(user);
const store = mem();
store.setItem(key, JSON.stringify({ fields: { street: '100 Place Order Lane' }, savedAt: new Date().toISOString(), step: 'property' }));
tombstoneOrderDraft(store, key, { dealId: deal.id, fileNumber: deal.fileNumber });
ok(readOrderDraft(store, key) === null, 'step 2 is not restored after the order is placed');

console.log(fail ? fail + ' failed' : 'place order parties passed');
if (fail) process.exit(1);
