/* FF-049 / MF-046: Place Order and the file overview accept a typed party. Mock data only. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.KeyboardEvent = window.KeyboardEvent || window.Event;
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
const tick = () => new Promise((r) => setTimeout(r, 40));

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const user = await api.getSession();
const { render } = await import('../js/pages/ordernew.js');
const page = await render({ api, user, go() {} });
document.body.innerHTML = toText(page.body);
page.mount(document.body);
const orderForm = document.querySelector('#nof');
Object.defineProperty(orderForm, 'elements', { configurable: true, get() { return orderForm.querySelectorAll('input, select, textarea, button'); } });

const buyer = document.querySelector('[data-multi="Client-Buyer"] [data-party-row="1"]');
ok(!!buyer.querySelector('[data-party="first"]') && !!buyer.querySelector('[data-party="email"]') && !!buyer.querySelector('[data-party="phone"]'), 'a buyer row has name, email and phone fields');
ok(!!buyer.querySelector('.picker-q'), 'picking an existing buyer is still offered');
const agentSel = document.querySelector('[data-dir="p:Buyer Agent"] [data-dir-select]');
const lenderSel = document.querySelector('[data-dir="p:Lender"] [data-dir-select]');
const optVal = (sel, id) => sel && [...sel.querySelectorAll('option')].some((o) => o.getAttribute('value') === id);
const groupLabel = (sel, label) => sel && [...sel.querySelectorAll('optgroup')].some((g) => g.getAttribute('label') === label);
ok(optVal(agentSel, 'c-bagent') && groupLabel(agentSel, 'Companies') && groupLabel(agentSel, 'Agents'), 'the buyer agent list has companies and agents');
ok(optVal(lenderSel, 'c-lender1') && groupLabel(lenderSel, 'Companies') && groupLabel(lenderSel, 'Loan officers'), 'the lender list has companies and loan officers');
ok(!!document.querySelector('[data-dir="p:Buyer Agent"] [data-dir-field="person"]') && !!document.querySelector('[data-lender-person]'), 'agent and lender can be typed by hand');

const both = document.querySelector('[name="claRepresentation"][value="both"]');
if (both) both.checked = true;
document.querySelector('[name="street"]').value = '100 Typed Party Lane';
document.querySelector('[name="city"]').value = 'Alexandria';
const state = document.querySelector('[name="state"]');
state.value = 'VA';
const stateOpt = [...state.querySelectorAll('option')].find((o) => o.getAttribute('value') === 'VA');
if (stateOpt) { [...state.querySelectorAll('option')].forEach((o) => o.removeAttribute('selected')); stateOpt.setAttribute('selected', ''); stateOpt.selected = true; }
document.querySelector('[name="zip"]').value = '22314';
buyer.querySelector('[data-party="first"]').value = 'Typed';
buyer.querySelector('[data-party="last"]').value = 'Buyer';
buyer.querySelector('[data-party="email"]').value = 'typed.buyer@example.test';
buyer.querySelector('[data-party="phone"]').value = '301-555-0199';
document.querySelector('[data-dir="p:Buyer Agent"] [data-dir-field="person"]').value = 'Rita Agent';
document.querySelector('[data-dir="p:Buyer Agent"] [data-dir-field="company"]').value = 'New Brokerage (fake)';
document.querySelector('[data-lender-person]').value = 'Sam Officer';
document.querySelector('[name="lenderName"]').value = 'Typed Loans (fake)';
const roleSel = document.querySelector('[data-lender-role]');
const loanOpt = [...roleSel.querySelectorAll('option')].find((o) => o.getAttribute('value') === 'loan_officer');
if (loanOpt) { [...roleSel.querySelectorAll('option')].forEach((o) => { o.removeAttribute('selected'); o.selected = false; }); loanOpt.setAttribute('selected', ''); loanOpt.selected = true; }

const beforeInvites = (await api.listAgentInvites()).length;
for (let i = 0; i < 6; i++) {
  const next = document.querySelector('[data-wiz-next]');
  if (!next || next.hidden) break;
  next.click();
  await tick();
}
const blocked = document.querySelector('[data-wiz-errors]:not([hidden])');
ok(!blocked || !/pick a person from the list/i.test(blocked.textContent), 'stepping ahead does not ask to pick a person' + (blocked ? ' (' + blocked.textContent.replace(/\s+/g, ' ').slice(0, 220) + ')' : ''));
document.querySelector('#nof').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 250));

const { render: renderDeal } = await import('../js/pages/deal.js');
const deals = await api.listDeals();
const mine = (deals || []).find((d) => d.street === '100 Typed Party Lane');
if (!mine) {
  ok(false, 'the typed order was created (' + (document.querySelector('.toast') ? document.querySelector('.toast').textContent : 'no toast') + ')');
} else {
  const opened = await api.getDeal(mine.id);
  const buyerRow = (opened.participants || []).find((p) => p.role === 'Client-Buyer' && !p.removed);
  const agentRow = (opened.participants || []).find((p) => p.role === 'Buyer Agent' && !p.removed);
  const lenderRow = (opened.participants || []).find((p) => p.role === 'Lender' && !p.removed);
  ok(buyerRow && buyerRow.contact.firstName === 'Typed' && buyerRow.contact.email === 'typed.buyer@example.test' && !buyerRow.contact.profileId, 'the typed buyer is on the file with no portal login');
  ok(agentRow && agentRow.contact.firstName === 'Rita' && agentRow.contact.company === 'New Brokerage (fake)' && !agentRow.contact.profileId, 'the typed buyer agent is on the file with no portal login');
  ok(lenderRow && lenderRow.contact.company === 'Typed Loans (fake)' && lenderRow.contact.lenderRole === 'loan_officer' && !lenderRow.contact.profileId, 'the typed lender is on the file with no portal login');
  ok((await api.listAgentInvites()).length === beforeInvites, 'placing the order did not send an invite');
  const overview = await renderDeal({ api, user, params: { id: mine.id, tab: 'overview' }, go() {}, refresh() {} });
  document.body.innerHTML = toText(overview.body);
  overview.mount(document.body);
  ok(!!document.querySelector('[data-add-party="Client-Buyer"]') && !!document.querySelector('[data-add-party="Lender"]'), 'the file overview can add a buyer or a lender');
  document.querySelector('[data-add-party="Client-Seller"]').click();
  await tick();
  const modal = document.getElementById('modal') || document.body;
  ok(/no portal login/i.test(modal.textContent) && !!modal.querySelector('[name="firstName"]'), 'add seller asks for a name and does not create a login');
  modal.querySelector('[name="firstName"]').value = 'Typed';
  modal.querySelector('[name="lastName"]').value = 'Seller';
  modal.querySelector('[name="email"]').value = 'not-an-email';
  modal.querySelector('#apty').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  ok(/valid email/i.test(document.body.textContent), 'a bad seller email says what to fix');
  modal.querySelector('[name="email"]').value = '';
  modal.querySelector('#apty').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  const again = await api.getDeal(mine.id);
  const seller = (again.participants || []).find((p) => p.role === 'Client-Seller' && p.contact && p.contact.firstName === 'Typed');
  ok(seller && !seller.contact.profileId && (await api.listAgentInvites()).length === beforeInvites, 'the typed seller is on the file and was not invited');
}

console.log(fail ? fail + ' failed' : 'file party ui passed');
if (fail) process.exit(1);
