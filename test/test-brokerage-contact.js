/* FF-090 (Francis Santos, Nov 16 2026, 3:10 PM ET): brokerage company and contact on the file.
 * Fake data only. The screen is exercised in a DOM (linkedom). */
import { readFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { lenderFieldsHtml, lenderSectionHtml, mountLenderSection } from '../js/pages/lender-section.js';
import {
  brokerageContact, brokerageContactError, brokerageWrite, brokerageDirectory, cdBrokerCells, brokerageOnFile, mortgageBrokerContact,
} from '../js/data/lender-file.js';
import { toText } from '../js/ui.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
class MiniFormData { constructor(form) { this.map = new Map(); form.querySelectorAll('input, select, textarea').forEach((el) => { if (!el.name || el.type === 'file' || el.disabled) return; if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return; this.map.set(el.name, el.value); }); } entries() { return this.map.entries(); } }
globalThis.FormData = MiniFormData; window.FormData = MiniFormData;

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const clean = brokerageContact({ mortgageBrokerName: '  Harbor   Brokerage (fake) ', mortgageBrokerContact: ' Ann  Broker ', mortgageBrokerPhone: '3015550199', mortgageBrokerEmail: ' Ann.Broker@Example.TEST ', mortgageBrokerAddress: '  1 Main St,  Rockville MD  ' });
ok(clean.mortgageBrokerName === 'Harbor Brokerage (fake)' && clean.mortgageBrokerContact === 'Ann Broker' && clean.mortgageBrokerPhone === '301-555-0199' && clean.mortgageBrokerEmail === 'ann.broker@example.test' && clean.mortgageBrokerAddress === '1 Main St, Rockville MD', 'brokerage contact is trimmed and the phone and email are normalized');
ok(brokerageContactError({ mortgageBrokerName: '' }, { requireCompany: true }) === 'Enter the mortgage brokerage company name.', 'a blank company name is refused');
ok(brokerageContactError({ mortgageBrokerPhone: '12', mortgageBrokerName: 'Harbor' }).includes('10-digit'), 'a short phone is refused in plain words');
ok(brokerageContactError({ mortgageBrokerEmail: 'not-an-email', mortgageBrokerName: 'Harbor' }).includes('valid email'), 'a bad email is refused in plain words');
ok(brokerageContactError({}) === '', 'Place Order can leave the whole brokerage block blank');
ok(brokerageContactError({ mortgageBrokerAddress: '1 Main' }).includes('company name'), 'an address without a company name is refused');
const nameOnly = brokerageWrite({ mortgageBrokerPhone: '301-555-0100' }, { mortgageBrokerName: 'Harbor Brokerage (fake)' });
ok(nameOnly && nameOnly.values.mortgageBrokerName === 'Harbor Brokerage (fake)' && nameOnly.values.mortgageBrokerPhone === undefined, 'saving only the company name does not clear a phone already on the file');
const bad = brokerageWrite({}, { mortgageBrokerName: 'Harbor', mortgageBrokerPhone: '12' });
ok(bad && bad.error && bad.error.includes('10-digit') && !bad.values, 'a bad phone is not written');

const cells = cdBrokerCells({ mortgageBrokerName: 'Harbor Brokerage (fake)', mortgageBrokerContact: 'Ann Broker', mortgageBrokerPhone: '301-555-0199', mortgageBrokerEmail: 'ann.broker@example.test', mortgageBrokerAddress: '1 Main St' }, 'Typed on the CD');
ok(cells.name === 'Harbor Brokerage (fake)' && cells.contact === 'Ann Broker' && cells.phone === '301-555-0199' && cells.email === 'ann.broker@example.test' && cells.address === '1 Main St', 'the CD mortgage broker column uses the file');
ok(cdBrokerCells({}, 'Typed on the CD').name === 'Typed on the CD', 'a name typed only on CD details still shows when the file has no brokerage');
const shown = brokerageOnFile({ mortgageBrokerName: 'Harbor', mortgageBrokerContact: 'Ann', mortgageBrokerPhone: '301-555-0199', mortgageBrokerEmail: 'ann@example.test', mortgageBrokerAddress: '1 Main St' });
ok([shown.contact, shown.phone, shown.email, shown.address].every(Boolean), 'the settlement line has the contact, phone, email and address');

const ann = mortgageBrokerContact({ company: 'Harbor Brokerage (fake)', firstName: 'Ann', lastName: 'Broker', email: 'ann.broker@example.test', phone: '301-555-0199' }).contact;
const officer = { id: 'c-lo', firstName: 'Linda', lastName: 'Lender', company: 'Example Home Loans', lenderRole: 'loan_officer', email: 'linda@example.test' };
const dir = brokerageDirectory([{ ...ann, id: 'c-ann' }, officer]);
ok(dir.people.length === 1 && dir.people[0].value === 'c-ann' && dir.companies.length === 1 && dir.companies[0].label === 'Harbor Brokerage (fake)', 'the lookup lists mortgage brokers and their company, not the loan officer');

const place = toText(lenderFieldsHtml({}));
ok(place.includes('name="mortgageBrokerName"') && place.includes('name="mortgageBrokerContact"') && place.includes('name="mortgageBrokerPhone"') && place.includes('name="mortgageBrokerEmail"') && place.includes('name="mortgageBrokerAddress"'), 'Place Order asks for the brokerage company and its contact');
const lenderOnly = toText(lenderFieldsHtml({}, { brokerage: false }));
ok(!lenderOnly.includes('mortgageBrokerName') && !lenderOnly.includes('mortgageBrokerAddress'), 'the lender form does not carry the brokerage contact');

const readOnly = toText(lenderSectionHtml({ mortgageBrokerName: 'Harbor Brokerage (fake)', mortgageBrokerContact: 'Ann Broker', mortgageBrokerPhone: '301-555-0199', mortgageBrokerEmail: 'ann.broker@example.test', mortgageBrokerAddress: '1 Main St', participants: [] }, { canEdit: false }));
ok(readOnly.includes('Harbor Brokerage (fake)') && readOnly.includes('Ann Broker') && readOnly.includes('301-555-0199') && readOnly.includes('1 Main St') && !readOnly.includes('data-brokerage-form') && !readOnly.includes('Save brokerage'), 'someone who cannot edit the file sees the contact and no form');

const cdSrc = readFileSync(new URL('../js/pages/dealaccounting-cd.js', import.meta.url), 'utf8');
const acctSrc = readFileSync(new URL('../js/pages/dealaccounting.js', import.meta.url), 'utf8');
ok(cdSrc.includes('cdBrokerCells') && cdSrc.includes('data-cd-broker-name') && cdSrc.includes('data-cd-broker-address') && cdSrc.includes('data-cd-broker-contact') && cdSrc.includes('data-cd-broker-email') && cdSrc.includes('data-cd-broker-phone'), 'CD page 5 prints the brokerage in the Mortgage Broker column');
ok(acctSrc.includes('data-stmt-broker') && acctSrc.includes('brokerageOnFile'), 'the settlement statement names the mortgage broker');

const mig = readFileSync(new URL('../supabase/migrations/20261124130000_brokerage_contact.sql', import.meta.url), 'utf8');
const rb = readFileSync(new URL('../supabase/rollbacks/20261124130000_brokerage_contact.sql', import.meta.url), 'utf8');
ok(mig.includes('mortgage_broker_contact') && mig.includes('mortgage_broker_phone') && mig.includes('mortgage_broker_email') && mig.includes('mortgage_broker_address') && mig.includes('FF-090'), 'the database file adds the four contact columns');
ok(rb.includes('drop column mortgage_broker_contact') && rb.includes('mortgage_broker_name was dropped') && !rb.includes('drop column mortgage_broker_name'), 'the rollback drops the contact columns and keeps the company name');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const deal = await api.createDeal({ street: '9 Broker Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-01', transactionType: 'Purchase', lenderName: 'Example Home Loans', processorId: '' });
const savedAnn = await api.createContact(ann);
const root = document.getElementById('app');
const tick = () => new Promise((r) => setTimeout(r, 0));
let current = deal;
const paint = async () => {
  current = await api.getDeal(deal.id);
  root.innerHTML = toText(lenderSectionHtml(current, { canEdit: true }));
  mountLenderSection(root, { api, deal: current, refresh: paint });
};
await paint();
root.querySelector('[data-edit-brokerage]').click();
await tick(); await tick();
const form = root.querySelector('[data-brokerage-form]');
ok(!form.hidden && form.querySelector('[data-brokerage-pick]'), 'Edit Mortgage Brokerage opens the contact fields and the saved-broker list');
const opt = [...form.querySelector('[data-brokerage-pick]').options].find((o) => o.value === savedAnn.id);
ok(!!opt, 'the list offers the saved mortgage broker');
const pick = form.querySelector('[data-brokerage-pick]');
pick.querySelectorAll('option').forEach((o) => { if (o.value === savedAnn.id) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
pick.dispatchEvent(new window.Event('change', { bubbles: true }));
await tick(); await tick();
ok(form.querySelector('[name=mortgageBrokerName]').value === 'Harbor Brokerage (fake)' && form.querySelector('[name=mortgageBrokerContact]').value === 'Ann Broker' && form.querySelector('[name=mortgageBrokerEmail]').value === 'ann.broker@example.test', 'picking a saved broker fills the company and the contact');
form.querySelector('[name=mortgageBrokerAddress]').value = '1 Main St, Rockville, MD 20850';
form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await tick(); await tick();
let again = await api.getDeal(deal.id);
ok(again.mortgageBrokerName === 'Harbor Brokerage (fake)' && again.mortgageBrokerContact === 'Ann Broker' && again.mortgageBrokerPhone === '301-555-0199' && again.mortgageBrokerEmail === 'ann.broker@example.test' && again.mortgageBrokerAddress === '1 Main St, Rockville, MD 20850', 'the brokerage contact saves on the file');
ok(again.participants.some((p) => p.contactId === savedAnn.id && p.contact.lenderRole === 'mortgage_broker'), 'picking a broker also puts that person on the file');
await paint();
const reloaded = toText(lenderSectionHtml(await api.getDeal(deal.id), { canEdit: true }));
ok(reloaded.includes('Ann Broker') && reloaded.includes('1 Main St, Rockville, MD 20850'), 'the contact is still there after the page is opened again');

await paint();
root.querySelector('[data-edit-brokerage]').click();
await tick();
const edit = root.querySelector('[data-brokerage-form]');
edit.querySelector('[name=mortgageBrokerEmail]').value = 'not-an-email';
edit.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await tick();
ok(/valid email/.test(root.querySelector('[data-brokerage-error]').textContent) && edit.querySelector('[name=mortgageBrokerEmail]').value === 'not-an-email' && (await api.getDeal(deal.id)).mortgageBrokerEmail === 'ann.broker@example.test', 'a bad email stays on the form and is not saved');
edit.querySelector('[name=mortgageBrokerEmail]').value = 'ann.broker@example.test';
edit.querySelector('[name=mortgageBrokerPhone]').value = '12';
edit.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await tick();
ok(/10-digit/.test(root.querySelector('[data-brokerage-error]').textContent) && edit.querySelector('[name=mortgageBrokerPhone]').value === '12' && (await api.getDeal(deal.id)).mortgageBrokerPhone === '301-555-0199', 'a bad phone stays on the form and is not saved');
edit.querySelector('[name=mortgageBrokerPhone]').value = '301-555-0199';
edit.querySelector('[name=mortgageBrokerName]').value = '   ';
edit.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await tick();
ok(/company name/.test(root.querySelector('[data-brokerage-error]').textContent) && (await api.getDeal(deal.id)).mortgageBrokerName === 'Harbor Brokerage (fake)', 'a blank company name is refused and the saved contact stays');

await api.signInDev('u-buyer');
let buyerMsg = '';
try { await api.updateDeal(deal.id, { mortgageBrokerContact: 'Buyer Edit' }); } catch (e) { buyerMsg = e.message; }
ok(/Processor or Admin/.test(buyerMsg) && (await api.signInDev('u-proc'), (await api.getDeal(deal.id)).mortgageBrokerContact) === 'Ann Broker', 'a buyer cannot change the brokerage contact');
await api.signInDev('u-sp');
let salesMsg = '';
try { await api.updateDeal(deal.id, { mortgageBrokerAddress: 'Sales Edit' }); } catch (e) { salesMsg = e.message; }
ok(/Processor or Admin/.test(salesMsg), 'a salesperson cannot change the brokerage contact');

console.log(fail ? fail + ' failed' : 'brokerage contact passed');
process.exit(fail ? 1 : 0);
