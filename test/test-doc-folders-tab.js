/* FF-104a (Francis Santos, Nov 19 2026, 1:15 PM ET, confirmed 2:35 PM ET).
   Documents gains a Folders tab for CLA staff. All files, Received and Sent stay.
   No network. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLElement.prototype.focus = () => {};
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
const { render } = await import('../js/pages/dealdocs.js');

async function paint(userId, hash) {
  await api.signInDev(userId);
  const session = await api.getSession();
  const deal = await api.getDeal('deal-1');
  globalThis.location = { hash };
  window.location = globalThis.location;
  const view = await render({ api, user: session, deal, refresh() {} });
  document.body.innerHTML = '';
  document.body.appendChild(document.createElement('div')).innerHTML = String(view.body);
  const root = document.body.firstElementChild;
  view.mount(root);
  return root;
}
const tabs = (root) => [...root.querySelectorAll('[data-doc-tab]')].map((a) => a.dataset.docTab);
const text = (root) => root.textContent || '';
// linkedom does not build form.elements. The browser does. Give the test form the same named fields.
const bindElements = (form) => {
  const named = {};
  form.querySelectorAll('[name]').forEach((el) => { named[el.name] = el; });
  Object.defineProperty(form, 'elements', { configurable: true, get: () => named });
  return form;
};

const staff = await paint('u-proc', '#/deals/deal-1/documents');
ok(tabs(staff).join(',') === 'all,received,sent,folders', 'a processor sees All files, Received, Sent, then Folders');
ok(staff.querySelector('[data-doc-tab="all"]').classList.contains('active'), 'All files stays the tab that opens');
ok((staff.querySelector('#doctable') || staff.querySelector('[data-docs-empty]')) && !staff.querySelector('[data-doc-folders]'), 'All files still shows the file list and not the folder list');
ok(!text(staff).includes('Generate') && !text(staff).includes('Search Packages') && !text(staff).includes('eSign'), 'the file tabs do not add Generate, Search Packages or eSign');

const folders = await paint('u-proc', '#/deals/deal-1/documents?t=folders');
ok(folders.querySelector('[data-doc-tab="folders"]').classList.contains('active'), 'Folders is the open tab');
ok(!folders.querySelector('#doctable') && folders.querySelector('#foldertable'), 'Folders shows the folder list instead of the file table');
ok(!folders.querySelector('[data-doc-search]'), 'Folders does not replace the file search');
const names = [...folders.querySelectorAll('[data-folder-name]')].map((td) => td.textContent);
ok(names.includes('Contract & addenda') && names.includes('Unfiled') && names[names.length - 1] === 'Unfiled', 'each folder on the order is listed, and Unfiled is last');
const contract = [...folders.querySelectorAll('tr[data-folder-row]')].find((tr) => tr.querySelector('[data-folder-name]').textContent === 'Contract & addenda');
ok(contract && /^\d+$/.test(contract.querySelector('[data-folder-count]').textContent), 'each folder shows a file count');
ok(folders.querySelector('#addfolder'), 'a processor can add a folder');
ok(folders.querySelector('#upbtn') && folders.querySelector('#sharefiles'), 'Upload and Share Files stay in the header');

folders.querySelector('#addfolder').click();
const blank = bindElements(document.querySelector('#aff'));
ok(blank, 'Add folder opens a form');
blank.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
ok(document.querySelector('[data-folder-err]').textContent === 'Type a folder name.', 'a blank folder name is refused and the form stays open');
ok(document.querySelector('#aff'), 'the typed form is still there after a blank name');
blank.elements.name.value = 'Contract & addenda';
blank.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 20));
ok(/already exists/.test(document.querySelector('[data-folder-err]').textContent), 'a duplicate folder name is refused in plain words');
ok(blank.elements.name.value === 'Contract & addenda', 'a refused name stays in the form');

let created = 0;
const origCreate = api.createFolder.bind(api);
api.createFolder = async (input) => { created += 1; return origCreate(input); };
blank.elements.name.value = 'Survey';
blank.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 30));
ok(created === 1, 'a new folder name is saved');
const after = await api.listDealFolders('deal-1');
ok(after.some((f) => f.name === 'Survey'), 'the new folder is on this order');

await api.signInDev('u-proc');
await api.addDocument('deal-1', { name: 'survey.pdf', description: '', mimeType: 'application/pdf', size: 20, dataUrl: 'data:application/pdf;base64,QQ==', visibility: 'staff', docType: 'Other' });
const again = await paint('u-proc', '#/deals/deal-1/documents?t=folders');
const move = bindElements(again.querySelector('#movefile'));
ok(move, 'a processor can move a document once the order has a file');
const docOpt = [...move.querySelectorAll('select[name=docId] option')].find((o) => o.value);
const folderOpt = [...move.querySelectorAll('select[name=folderId] option')].find((o) => o.textContent === 'Survey');
ok(docOpt && folderOpt, 'Move lists a document and the new folder');
move.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
ok(again.querySelector('[data-move-err]').textContent === 'Choose a document to move.', 'Move with no document is refused');
const setValue = (el, value) => { Object.defineProperty(el, 'value', { configurable: true, get: () => value }); };
setValue(move.elements.docId, docOpt.value);
setValue(move.elements.folderId, folderOpt.value);
let moved = null;
const origMove = api.moveDocument.bind(api);
api.moveDocument = async (id, folderId) => { moved = { id, folderId }; return origMove(id, folderId); };
move.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 30));
ok(moved && moved.id === docOpt.value && moved.folderId === folderOpt.value, 'Move files the chosen document into the chosen folder');

const buyer = await paint('u-buyer', '#/deals/deal-1/documents?t=folders');
ok(tabs(buyer).join(',') === 'all,received,sent', 'a buyer does not get a Folders tab');
ok(!buyer.querySelector('[data-doc-folders]') && buyer.querySelector('#doctable, [data-docs-empty]'), 'a buyer who asks for Folders still sees the file list');
const scoped = await api.getSession();
const deal = await api.getDeal('deal-1');
const asBuyer = { ...scoped, role: 'Client-Buyer', accountRole: 'Outside user' };
globalThis.location = { hash: '#/deals/deal-1/documents?t=folders' };
const scopedView = await render({ api, user: asBuyer, deal, refresh() {} });
ok(!String(scopedView.body).includes('data-doc-tab="folders"'), 'a buyer scoped to the file still does not see Folders');

const sales = await paint('u-sp', '#/deals/deal-1/documents?t=folders');
ok(sales.querySelector('[data-doc-tab="folders"]') && !sales.querySelector('#addfolder') && !sales.querySelector('#movefile'), 'sales can see the folders and cannot add or move');

const agent = await paint('u-bagent', '#/deals/deal-1/documents');
ok(!agent.querySelector('[data-doc-tab="folders"]'), 'an agent does not see Folders');

console.log(fail ? fail + ' failed' : 'doc folders tab passed');
if (fail) process.exit(1);
