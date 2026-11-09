/* Francis Nov 9: Place Order pickers offer inline "Add … as a new person" when there is no match;
   lender company + loss payee are saved on the order. Fake/mock data only. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { matchPeople, splitPersonName, personLabel, mountPicker, pickerHtml } from '../js/pages/person-picker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.KeyboardEvent = window.KeyboardEvent || window.Event;

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

ok(splitPersonName('Warren Spencer').firstName === 'Warren' && splitPersonName('Warren Spencer').lastName === 'Spencer', 'split two-word person name');
ok(splitPersonName('Cher').firstName === 'Cher' && splitPersonName('Cher').lastName === '', 'split single-word name');
ok(matchPeople([{ id: '1', firstName: 'Ann', lastName: 'Buyer', email: '', company: '' }], 'Warren').length === 0, 'no match for unknown name');

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');

const root = document.createElement('div');
root.innerHTML = toText(pickerHtml('p:Client-Buyer', 'Buyer'));
document.body.appendChild(root);
const people = [];
let created = null;
const pk = mountPicker(root.querySelector('[data-picker]'), () => people, {
  createVerb: 'buyer',
  onCreate: async (typed) => {
    const { firstName, lastName } = splitPersonName(typed);
    created = await api.createContact({ firstName, lastName, email: '', phone: '', company: '', contactType: 'buyer_seller' });
    people.push(created);
    return created;
  },
});
const q = root.querySelector('.picker-q');
q.value = 'Warren Spencer';
q.dispatchEvent(new window.Event('input'));
await wait(10);
const createLi = root.querySelector('li[data-create]');
ok(!!createLi && /Add "Warren Spencer" as a new buyer/.test(createLi.textContent), 'picker shows inline create when no match');
createLi.dispatchEvent(new window.Event('mousedown', { bubbles: true }));
await wait(40);
ok(created && created.firstName === 'Warren' && created.lastName === 'Spencer' && pk.value === created.id, 'inline create selects the new contact');

const lenderCo = await api.createContact({ firstName: '', lastName: '', company: 'Rocket Mortgage LLC', email: '', contactType: 'lender' });
ok(personLabel(lenderCo) === 'Rocket Mortgage LLC', 'lender company-only contact labels as the company');

const lender = await api.createContact({ firstName: 'Test', lastName: 'Officer', company: 'Test lender', email: 'clatestportal+lender@example.test', contactType: 'lender' });
const deal = await api.createDeal({
  street: '1 Inline Party Way', city: 'Rockville', state: 'MD', zip: '20850', transactionType: 'Purchase',
  lenderName: 'Test lender', lenderContact: personLabel(lender), lenderPhone: '301-555-0100', lenderEmail: 'clatestportal+lender@example.test',
  lossPayeeName: 'Test lender, ISAOA/ATIMA', processorId: '',
});
ok(deal.lenderName === 'Test lender' && deal.lossPayeeName === 'Test lender, ISAOA/ATIMA', 'createDeal keeps lender company and loss payee');
await api.addParticipant(deal.id, created.id, 'Client-Buyer');
await api.addParticipant(deal.id, lender.id, 'Lender');
const ov = await api.getOrderOverview(deal.id);
ok(ov.parties.some((p) => p.label === 'Buyer' && p.name === 'Warren Spencer'), 'buyer from inline create is on the order');

console.log(fail ? fail + ' failed' : 'inline party create passed');
if (fail) process.exit(1);
