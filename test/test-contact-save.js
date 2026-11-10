/* A contact edit reports success only when the stored row matches what was submitted.
 * Two listing-agent rows for the same person stay separate contacts, and a second add is refused.
 * Fake data only. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { assertContactSaved, contactSaveMiss, contactWritePatch, duplicatePartyMessage, sameParty } from '../js/data/contact-save.js';
import { toText } from '../js/ui.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.location = { href: 'https://testportal.example/#/deals/d1/contacts', hash: '#/deals/d1/contacts', split: (s) => String(location.href).split(s) };

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const rejects = async (fn, re, m) => { try { await fn(); ok(false, m + ' (no error)'); } catch (e) { ok(re.test(e.message), m + ' -> ' + e.message); } };

const opened = { firstName: '', lastName: 'Nalli', email: '', phone: '', company: 'Al Nalli Realty Group', contactType: 'realtor' };
const typed = { ...opened, firstName: 'Danf', email: 'clatester+87@gmail.com' };
const patch = contactWritePatch(opened, typed);
ok(patch.firstName === 'Danf' && patch.email === 'clatester+87@gmail.com' && patch.phone === undefined && patch.company === undefined, 'a typed first name and email are the only fields written');
ok(Object.keys(contactWritePatch(opened, opened)).length === 0, 'an untouched blank email is not written back');
ok(contactSaveMiss({ message: 'JSON object requested, multiple (or no) rows returned' }).message === 'This contact was not saved. Nothing was changed.', 'a zero-row update is a clear error');
await rejects(() => { assertContactSaved({ email: 'clatester+87@gmail.com' }, { id: 'c1', email: '' }); }, /Email was not saved/, 'a returned row that dropped the email is not success');
await rejects(() => { assertContactSaved({ email: 'clatester+87@gmail.com' }, null); }, /was not saved/, 'no row is not success');
ok(assertContactSaved({ email: 'ClaTester+87@gmail.com', phone: '8888888888' }, { id: 'c1', email: 'clatester+87@gmail.com', phone: '888-888-8888' }).id === 'c1', 'saved email and phone match after normalization');

const row = (id, contact) => ({ id: 'p-' + id, contactId: id, role: 'Listing Agent', contact: { id, ...contact } });
const first = row('c1', { firstName: 'Danf', lastName: 'Nalli', company: 'Al Nalli Realty Group', email: '' });
const second = row('c2', { firstName: 'Danf', lastName: 'Nalli', company: 'Al Nalli Realty Group', email: 'danf.nalli@example.test' });
ok(sameParty([second], first.contact, 'Listing Agent') && sameParty([first], second.contact, 'Listing Agent'), 'two listing agents with the same name and company are the same person');
ok(duplicatePartyMessage(first.contact, 'Listing Agent').includes('Edit that row'), 'the duplicate message points at the existing row');

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const deal = await api.createDeal({ street: '13 Drumcastle Ct', city: 'Germantown', state: 'MD', zip: '20876', transactionType: 'Purchase' });
const a = await api.createContact({ firstName: 'Danf', lastName: 'Nalli', company: 'Al Nalli Realty Group', email: '', contactType: 'realtor' });
const b = await api.createContact({ firstName: 'Danf', lastName: 'Nalli', company: 'Al Nalli Realty Group', email: '', contactType: 'realtor' });
await api.addParticipant(deal.id, a.id, 'Listing Agent');
await rejects(() => api.addParticipant(deal.id, b.id, 'Listing Agent'), /already a Listing Agent/, 'a second listing-agent row for the same person is refused');
const saved = await api.updateContact(a.id, { firstName: 'Danf', email: 'clatester+87@gmail.com' });
ok(saved.email === 'clatester+87@gmail.com' && saved.firstName === 'Danf', 'the contact row that was edited keeps the email');
const again = await api.getDeal(deal.id);
ok(again.participants.filter((p) => p.role === 'Listing Agent').length === 1 && again.participants.find((p) => p.contactId === a.id).contact.email === 'clatester+87@gmail.com', 'reopening the file still has one listing agent and the saved email');

const user = await api.getSession();
const { render } = await import('../js/pages/dealcontacts.js');
const shown = {
  id: deal.id,
  participants: [
    { id: 'row-1', contactId: 'c-old', role: 'Listing Agent', contact: { id: 'c-old', firstName: '', lastName: 'Nalli', company: 'Al Nalli Realty Group', email: '', phone: '', contactType: 'realtor', profileId: null } },
    { id: 'row-2', contactId: 'c-new', role: 'Listing Agent', contact: { id: 'c-new', firstName: '', lastName: 'Nalli', company: 'Al Nalli Realty Group', email: 'kept@example.test', phone: '', contactType: 'realtor', profileId: null } },
  ],
};
let calls = [];
const fake = {
  updateContact: async (id, body) => { calls.push({ id, body }); return { id, ...shown.participants.find((p) => p.contactId === id).contact, ...body }; },
  dropFileReads() { calls.push({ drop: true }); },
};
const page = await render({ api: fake, user, deal: shown, refresh: () => { calls.push({ refresh: true }); } });
document.body.innerHTML = toText(page.body);
page.mount(document.body);
ok(document.querySelectorAll('[data-duplicate-party]').length === 2, 'both same-name listing agents are marked as separate contacts');
document.querySelector('[data-edit="row-1"]').dispatchEvent(new window.Event('click', { bubbles: true }));
const modal = document.getElementById('modal');
ok(!!modal, 'edit opens for the first row');
modal.querySelector('[name=firstName]').value = 'Danf';
modal.querySelector('[name=email]').value = 'clatester+87@gmail.com';
modal.querySelector('#ecf').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 30));
ok(calls[0] && calls[0].id === 'c-old' && calls[0].body.email === 'clatester+87@gmail.com' && calls[0].body.firstName === 'Danf' && calls[0].body.phone === undefined, 'the first row saves its own contact, including the typed email, and does not send a blank phone');
ok(calls.some((c) => c.refresh) && !document.getElementById('modal'), 'a matching save closes the dialog and refreshes');

calls = [];
fake.updateContact = async (id, body) => { calls.push({ id, body }); return { id, email: '', firstName: body.firstName, lastName: 'Nalli', company: 'Al Nalli Realty Group', phone: '', contactType: 'realtor' }; };
document.body.innerHTML = toText(page.body);
page.mount(document.body);
document.querySelector('[data-edit="row-2"]').dispatchEvent(new window.Event('click', { bubbles: true }));
const modal2 = document.getElementById('modal');
modal2.querySelector('[name=email]').value = 'other.agent@example.test';
modal2.querySelector('#ecf').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 30));
ok(calls[0] && calls[0].id === 'c-new', 'the lower row edits its own contact, not the first row');
ok(!!document.getElementById('modal') && /Email was not saved/.test(document.body.textContent), 'when the stored email does not match, the dialog stays open and says so');

console.log(fail ? fail + ' failed' : 'contact save passed');
if (fail) process.exit(1);
