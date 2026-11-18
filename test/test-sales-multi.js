/* FF-092: Place Order salespeople are a search box with chips. Fake people only. The saved field is still salesIds. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { filterSalesPeople, salesPersonLabel, salesMultiHtml, mountSalesMulti } from '../js/pages/sales-multi.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.KeyboardEvent = window.KeyboardEvent || window.Event;
window.KeyboardEvent = class extends window.Event {
  constructor(type, init = {}) { super(type, init); this.key = init.key || ''; }
};
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.location = { href: 'https://testportal.example/#/orders/new', hash: '#/orders/new', search: '' };
window.scrollTo = () => {};
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.sessionStorage = mem();
globalThis.localStorage = mem();
globalThis.FormData = class { constructor(form) { this.form = form; } entries() { const rows = []; this.form.querySelectorAll('[name]').forEach((el) => { if (el.type === 'radio' || el.type === 'checkbox') { if (el.checked) rows.push([el.name, el.value]); return; } if (el.tagName === 'SELECT') { const hit = [...el.querySelectorAll('option')].find((o) => o.selected || o.hasAttribute('selected')); rows.push([el.name, hit ? (hit.getAttribute('value') || '') : '']); return; } rows.push([el.name, el.value]); }); return rows[Symbol.iterator](); } getAll(name) { return [...this.entries()].filter(([k]) => k === name).map(([, v]) => v); } get(name) { const hit = [...this.entries()].find(([k]) => k === name); return hit ? hit[1] : null; } };
Object.defineProperty(window.HTMLFormElement.prototype, 'elements', { get() { return this.querySelectorAll('input, select, textarea, button'); } });
if (!window.HTMLInputElement.prototype.checkValidity) window.HTMLInputElement.prototype.checkValidity = function () { return true; };
if (!window.HTMLSelectElement.prototype.checkValidity) window.HTMLSelectElement.prototype.checkValidity = function () { return true; };
if (!window.HTMLTextAreaElement.prototype.checkValidity) window.HTMLTextAreaElement.prototype.checkValidity = function () { return true; };
try { Object.defineProperty(window.HTMLInputElement.prototype, 'files', { configurable: true, get() { return this.type === 'file' ? [] : undefined; } }); } catch (e) { /* linkedom already has files */ }
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
if (selectValue && !selectValue.set) {
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
    get() { const hit = [...this.options || []].find((o) => o.selected || o.hasAttribute('selected')); return hit ? hit.value : ''; },
    set(v) { [...this.options || []].forEach((o) => { const on = o.value === v; o.selected = on; if (on) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); },
  });
}
for (const C of [window.HTMLInputElement, window.HTMLSelectElement, window.HTMLTextAreaElement]) {
  if (!C.prototype.validity) Object.defineProperty(C.prototype, 'validity', { get() { return { valueMissing: false, typeMismatch: false, rangeOverflow: false, tooLong: false }; } });
  if (!('willValidate' in C.prototype)) Object.defineProperty(C.prototype, 'willValidate', { get() { return false; } });
}

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const staff = [
  { id: 'u-sp', firstName: 'Sam', lastName: 'Salesperson', role: 'Sales Person', email: 'sam.salesperson@example.test' },
  { id: 'u-team', firstName: 'Tina', lastName: 'Salesteam', role: 'Sales Team', email: 'tina.salesteam@example.test' },
  { id: 'u-proc', firstName: 'Paula', lastName: 'Processor', role: 'Processor', email: 'paula.processor@example.test' },
];
ok(filterSalesPeople(staff, 'sam sales').map((p) => p.id).join() === 'u-sp', 'a name search finds that salesperson');
ok(filterSalesPeople(staff, 'sales team').map((p) => p.id).join() === 'u-team', 'a role search finds that role');
ok(filterSalesPeople(staff, 'zzzz').length === 0 && filterSalesPeople(staff, '').length === 3, 'a blank search is everyone and a miss is nobody');
ok(salesPersonLabel(staff[0]) === 'Sam Salesperson (Sales Person)', 'the chip names the person and the role');

document.body.innerHTML = toText(salesMultiHtml(staff));
const box = mountSalesMulti(document.querySelector('[data-sales-multi]'), staff);
const q = document.querySelector('.picker-q');
ok(q.getAttribute('role') === 'combobox' && q.getAttribute('aria-expanded') === 'false', 'the search box is a closed combobox');
q.value = 'Tina';
q.dispatchEvent(new window.Event('input', { bubbles: true }));
ok(document.querySelector('[role="option"]').textContent.includes('Tina') && q.getAttribute('aria-expanded') === 'true', 'typing opens the matching names');
const enter = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
q.dispatchEvent(enter);
ok(enter.defaultPrevented, 'Enter in the search box does not submit the order');
ok(document.querySelector('input[name="salesIds"]').value === 'u-team' && document.querySelector('[data-sales-chip]').textContent.includes('Tina'), 'Enter adds that person as salesIds and a chip');
box.addAndSelect({ id: 'u-sp', firstName: 'Sam', lastName: 'Salesperson', role: 'Sales Person' });
ok([...document.querySelectorAll('input[name="salesIds"]')].map((el) => el.value).join() === 'u-sp,u-team', 'an existing salesperson added from Add new user is selected with the others');
document.querySelector('[data-sales-remove="u-team"]').click();
ok([...document.querySelectorAll('input[name="salesIds"]')].map((el) => el.value).join() === 'u-sp', 'Remove takes that person off and leaves the other');
box.restore(['u-team', 'missing']);
ok([...document.querySelectorAll('input[name="salesIds"]')].map((el) => el.value).join() === 'u-team', 'a saved draft restores a known salesperson and skips an unknown one');
q.value = 'zzzz-not-a-person';
q.dispatchEvent(new window.Event('input', { bubbles: true }));
ok(/No match/.test(document.querySelector('[data-none]').textContent), 'a name that is not on the list says there is no match');
document.body.innerHTML = toText(salesMultiHtml([]));
ok(!!document.querySelector('[data-no-sales]') && document.querySelector('.picker-q').disabled, 'an empty list says none are available and the search stays off');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const user = await api.getSession();
const { render } = await import('../js/pages/ordernew.js');
const page = await render({ api, user, go() {} });
document.body.innerHTML = toText(page.body);
page.mount(document.body);
const orderForm = document.querySelector('#nof');
Object.defineProperty(orderForm, 'elements', { configurable: true, get() { return orderForm.querySelectorAll('input, select, textarea, button'); } });
ok(!document.querySelector('input[type="checkbox"][name="salesIds"]') && document.querySelector('[data-sales-multi] .picker-q'), 'Place Order has the search box and no salesperson checkboxes');
ok(document.querySelector('[data-sales-picker] legend').textContent === 'Salespeople on this order', 'the field is still Salespeople on this order');
const salesSearch = document.querySelector('[data-sales-multi] .picker-q');
salesSearch.value = '';
salesSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
const listed = [...document.querySelectorAll('#sales-people-list [data-id]')].map((el) => el.getAttribute('data-id'));
ok(listed.includes('u-sp') && listed.includes('u-team') && !listed.includes('u-proc') && !listed.includes('u-admin'), 'Salespeople on this order lists Sales Person and Sales Team only (FF-092a) ' + listed.join(','));

const setState = (value) => {
  const state = document.querySelector('[name="state"]');
  state.value = value;
  const opt = [...state.querySelectorAll('option')].find((o) => o.getAttribute('value') === value);
  if (opt) { [...state.querySelectorAll('option')].forEach((o) => o.removeAttribute('selected')); opt.setAttribute('selected', ''); opt.selected = true; }
};
document.querySelector('[name="street"]').value = '100 Sales Picker Lane';
document.querySelector('[name="city"]').value = 'Alexandria';
setState('VA');
document.querySelector('[name="zip"]').value = '22314';
const both = document.querySelector('[name="claRepresentation"][value="both"]');
if (both) both.checked = true;
const search = document.querySelector('[data-sales-multi] .picker-q');
search.value = 'Sam';
search.dispatchEvent(new window.Event('input', { bubbles: true }));
document.querySelector('#sales-people-list [data-id="u-sp"]').dispatchEvent(new window.Event('mousedown', { bubbles: true, cancelable: true }));
ok(document.querySelector('[data-sales-values] input[name="salesIds"]').value === 'u-sp', 'choosing Sam from the list stores his id');
document.querySelector('[data-wiz-tab="review"]').click();
ok(document.querySelector('[data-review]').textContent.includes('Sam Salesperson'), 'review names the salesperson');
const bad = document.createElement('input');
bad.type = 'hidden';
bad.name = 'salesIds';
bad.value = 'not-a-person';
document.querySelector('[data-sales-values]').appendChild(bad);
document.querySelector('#nof').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 300));
const err = document.querySelector('.toast.err');
ok(!!err && /salesperson/i.test(err.textContent) && document.querySelector('[name="street"]').value === '100 Sales Picker Lane', 'a person who cannot be on the order is refused and the address stays' + (err ? ' [' + err.textContent.replace(/\s+/g, ' ').slice(0, 180) + ']' : ' [no toast]'));
ok(!(await api.listDeals()).some((d) => d.street === '100 Sales Picker Lane'), 'the refused order was not created');
bad.remove();
document.querySelector('#nof').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 400));
const made = (await api.listDeals()).find((d) => d.street === '100 Sales Picker Lane');
ok(!!made && (made.salesPeople || []).some((s) => s.id === 'u-sp') && !(made.salesPeople || []).some((s) => s.id === 'not-a-person'), 'the order saves Sam and nobody else' + (made ? ' (' + (made.salesPeople || []).map((s) => s.id).join(',') + ')' : ' (no order)'));

const kept = await api.createDeal({ street: '200 Kept Sales Lane', city: 'Alexandria', state: 'VA', zip: '22314', processorId: 'u-proc', openDate: '2026-11-01', salesIds: ['u-proc'] });
ok((kept.salesPeople || []).some((s) => s.id === 'u-proc' && s.name === 'Paula Processor'), 'a Processor can still be saved as a salesperson');
const { render: renderDeal } = await import('../js/pages/deal.js');
const overview = await renderDeal({ api, user, params: { id: kept.id, tab: 'overview' }, go() {}, refresh() {} });
document.body.innerHTML = toText(overview.body);
overview.mount(document.body);
const shown = document.querySelector('[data-sales-person="u-proc"]');
ok(!!shown && shown.textContent.includes('Paula Processor'), 'the file still shows a salesperson whose role is not in the list');
const addOpts = [...document.querySelectorAll('#addsales option')].map((o) => o.getAttribute('value')).filter(Boolean);
ok(addOpts.includes('u-sp') && addOpts.includes('u-team') && !addOpts.includes('u-admin') && !addOpts.includes('u-preproc'), 'Add a salesperson lists Sales Person and Sales Team only (' + addOpts.join(',') + ')');

const { render: renderLegacy } = await import('../js/pages/deal-buyer-legacy.js');
const legacy = await renderLegacy({ api, user, params: { id: kept.id, tab: 'overview' }, go() {}, refresh() {} });
document.body.innerHTML = toText(legacy.body);
legacy.mount(document.body);
const legacyShown = document.querySelector('[data-sales-person="u-proc"]');
ok(!!legacyShown && legacyShown.textContent.includes('Paula Processor'), 'the older file page still shows a salesperson whose role is not in the list');
const legacyOpts = [...document.querySelectorAll('#addsales option')].map((o) => o.getAttribute('value')).filter(Boolean);
ok(legacyOpts.includes('u-sp') && legacyOpts.includes('u-team') && !legacyOpts.includes('u-admin') && !legacyOpts.includes('u-preproc'), 'the older file page adds only Sales Person and Sales Team (' + legacyOpts.join(',') + ')');

await api.signInDev('u-admin');
await api.createTaskFlow({ name: 'Keep Paula', trigger: 'order_opened', conditions: { salesPeople: ['u-proc'] }, steps: [] });
const { render: renderBuilder } = await import('../js/pages/task-builder.js');
const built = await renderBuilder({ api, user: await api.getSession(), refresh() {} });
document.body.innerHTML = toText(built.body);
built.mount(document.body);
ok(/Sales: Paula Processor/.test(document.body.textContent), 'Task Builder names a saved person who is not in the sales list');
document.querySelector('[data-tb-edit]').click();
const boxes = [...document.querySelectorAll('[data-tb-cond="salesPeople"]')];
const procBox = boxes.find((b) => b.value === 'u-proc');
ok(!!procBox && (procBox.checked || procBox.hasAttribute('checked')) && /Paula Processor/.test((procBox.parentElement || procBox).textContent), 'editing the flow still shows that saved person by name, already chosen');
ok(boxes.some((b) => b.value === 'u-sp') && !boxes.some((b) => b.value === 'u-admin'), 'new Task Builder sales choices are Sales Person and Sales Team only');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('sales multi passed');
