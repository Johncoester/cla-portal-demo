/* FF-107 items 1-4 (Francis Santos, confirmed Nov 23 2026, 12:04 PM ET, Gmail 1a2095e4887afd30).
 * Folders on Documents are clickable and open to list, preview, download, and upload inside.
 * Move-from-folder and Save are not in this item. Sales still cannot move. No Word editor.
 * Fake names. No network. */
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
globalThis.sessionStorage = mem();
globalThis.localStorage = mem();

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

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
  return { root, user: session, deal };
}
const bindElements = (form) => {
  if (!form) return null;
  const named = {};
  form.querySelectorAll('[name]').forEach((el) => { named[el.name] = el; });
  Object.defineProperty(form, 'elements', { configurable: true, get: () => named });
  return form;
};

await api.signInDev('u-proc');
const added = await api.addDocument('deal-1', {
  name: 'inside-folder.pdf', description: 'inside', mimeType: 'application/pdf', size: 40,
  dataUrl: 'data:application/pdf;base64,QQ==', visibility: 'staff', docType: 'Other',
});
const folders = await api.listDealFolders('deal-1');
const contract = folders.find((f) => f.name === 'Contract & addenda' && !f.virtual);
ok(!!contract && !!added && added.id, 'a processor can add a file on this order');
await api.moveDocument(added.id, contract.id);
const staffOnly = await api.addDocument('deal-1', {
  name: 'staff-only-in-folder.pdf', description: 'staff', mimeType: 'application/pdf', size: 20,
  dataUrl: 'data:application/pdf;base64,QQ==', visibility: 'staff', docType: 'Other', folderId: contract.id,
});

const list = await paint('u-proc', '#/deals/deal-1/documents?t=folders');
ok(list.root.querySelector('#foldertable') && !list.root.querySelector('#doctable'), 'Folders still lists folders when none is open');
const link = [...list.root.querySelectorAll('[data-open-folder]')].find((a) => a.textContent === 'Contract & addenda');
ok(link && link.getAttribute('href') === `#/deals/deal-1/documents?t=folders&f=${encodeURIComponent(contract.id)}`,
  'each folder name is a link that opens that folder');
ok(list.root.querySelector('[data-open-folder="unfiled"]')?.getAttribute('href') === '#/deals/deal-1/documents?t=folders&f=unfiled',
  'Unfiled is a clickable folder too');
ok(list.root.querySelector('#movefile') && list.root.querySelector('#addfolder'), 'the folder list still has Add folder and Move for a processor');

const open = await paint('u-proc', `#/deals/deal-1/documents?t=folders&f=${contract.id}`);
ok(open.root.querySelector('[data-doc-tab="folders"]').classList.contains('active'), 'Folders stays the open tab inside a folder');
ok(open.root.querySelector('[data-doc-folder-open]') && open.root.querySelector('[data-folder-back]'),
  'an open folder has a back link to the folder list');
ok((open.root.querySelector('[data-open-folder-name]')?.textContent || '') === 'Contract & addenda',
  'the open folder shows its name');
ok(open.root.querySelector('#doctable') && !open.root.querySelector('#foldertable') && !open.root.querySelector('#movefile') && !open.root.querySelector('#addfolder'),
  'an open folder shows its files and does not add a move-from-folder control');
ok(open.root.querySelector(`[data-open="${added.id}"]`) && open.root.querySelector(`[data-open="${staffOnly.id}"]`),
  'a processor can list and preview the files in the folder, including a staff-only file');
ok(open.root.querySelector('#upbtn'), 'a processor can upload from an open folder');
open.root.querySelector('#upbtn').click();
const up = bindElements(document.querySelector('#mf') || document.querySelector('form'));
const folderSelect = up && (up.elements.folderId || up.querySelector?.('[name=folderId]'));
ok(folderSelect && (folderSelect.value === contract.id || folderSelect.getAttribute('value') === contract.id ||
  [...(folderSelect.options || [])].some((o) => o.value === contract.id && o.selected)),
  'upload inside an open folder starts in that folder');

const unfiled = await paint('u-proc', '#/deals/deal-1/documents?t=folders&f=unfiled');
ok((unfiled.root.querySelector('[data-open-folder-name]')?.textContent || '') === 'Unfiled'
  && unfiled.root.querySelector('[data-doc-folder-open="unfiled"]'),
  'Unfiled opens and shows the unfiled files');
ok(!unfiled.root.querySelector(`[data-open="${added.id}"]`),
  'a file in Contract & addenda is not listed under Unfiled');

const missing = await paint('u-proc', '#/deals/deal-1/documents?t=folders&f=not-a-folder');
ok(missing.root.querySelector('[data-folder-missing]') && missing.root.querySelector('[data-folder-back]'),
  'an unknown folder says it is not on this order and offers a way back');

const sales = await paint('u-sp', `#/deals/deal-1/documents?t=folders&f=${contract.id}`);
ok(sales.root.querySelector('[data-doc-tab="folders"]') && sales.root.querySelector(`[data-open="${added.id}"]`),
  'sales can open a folder and see the files inside it');
ok(!sales.root.querySelector('#addfolder') && !sales.root.querySelector('#movefile') && !sales.root.querySelector('#upbtn'),
  'sales still cannot add a folder, move a file, or upload');

const buyerList = await paint('u-buyer', `#/deals/deal-1/documents?t=folders&f=${contract.id}`);
ok(!buyerList.root.querySelector('[data-doc-tab="folders"]') && !buyerList.root.querySelector('[data-doc-folder-open]') && !buyerList.root.querySelector('#foldertable'),
  'a buyer who follows a folder link still does not get the Folders tab or an open folder');
ok(!buyerList.root.querySelector(`[data-open="${added.id}"]`) && !buyerList.root.querySelector(`[data-open="${staffOnly.id}"]`),
  'a buyer does not see a staff-only file that was placed in a folder');

const agent = await paint('u-bagent', `#/deals/deal-1/documents?t=folders&f=${contract.id}`);
ok(!agent.root.querySelector('[data-doc-tab="folders"]') && !agent.root.querySelector(`[data-open="${staffOnly.id}"]`),
  'an agent does not see the Folders tab or a staff-only file inside a folder');

console.log(fail ? fail + ' failed' : 'ff-107 folder open passed');
if (fail) process.exit(1);
