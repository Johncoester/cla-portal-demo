/* John, t1500u: on Place Order step 3, clearing Buyer 2 and then clicking Seller 1 put the cursor back in Buyer 2
 * and brought the old person back. Cause: an emptied picker box kept the old contact id (so the draft restored it),
 * and the emptied box opened the full people list over the next field, so a click on Seller 1 landed on that list.
 * No hosted project. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { toText } from '../js/ui.js';
import { mountPicker, pickerHtml } from '../js/pages/person-picker.js';
import { collectOrderFields } from '../js/data/order-draft.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const people = [
  { id: 'c-buyer', firstName: 'Ben', lastName: 'Buyer' },
  { id: 'c-buyer2', firstName: 'Bea', lastName: 'Buyer' },
  { id: 'c-seller', firstName: 'Sally', lastName: 'Seller' },
];
document.body.innerHTML = `<form id="nof">${toText(pickerHtml('p:Client-Buyer:2', 'Buyer 2'))}</form>`;
const form = document.querySelector('#nof');
const el = document.querySelector('[data-picker]');
const pk = mountPicker(el, () => people, {});
const q = el.querySelector('.picker-q');
const hid = el.querySelector('input[type=hidden]');
const list = el.querySelector('.picker-list');
const type = (v) => { q.value = v; q.dispatchEvent(new window.Event('input')); };

type('Bea');
el.querySelector('li[data-id="c-buyer2"]').dispatchEvent(new window.Event('mousedown', { bubbles: true }));
ok(pk.value === 'c-buyer2' && hid.value === 'c-buyer2', 'Buyer 2 is picked');
type('Bea Buyer');
ok(pk.value === 'c-buyer2', 'a stray input with the same name keeps the person');

type('');
ok(pk.value === '' && hid.value === '', 'clearing the box drops the person');
ok(!el.hasAttribute('data-selected') && el.querySelector('[data-chosen]').textContent === '', 'the "Selected:" line goes away');
ok(list.hidden, 'the emptied box does not open the full list over the next field');
ok(collectOrderFields({ elements: [...form.querySelectorAll('input')] }).fields['p:Client-Buyer:2'] === '', 'the saved draft has no Buyer 2, so it cannot restore the old name');

type('Sal');
ok(!list.hidden && list.querySelector('li[data-id="c-seller"]'), 'typing again still searches');
type('   ');
ok(list.hidden && pk.value === '', 'spaces only count as empty');

if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log('all ok');
