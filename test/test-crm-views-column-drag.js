/* Choose Columns uses the All list's drag row instead of up/down arrows.
 * A drag changes the order the view stores and the order the view shows.
 * Fake data only. No network. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { toText } from '../js/ui.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { viewPage } from '../js/pages/crm-views.js';
import { columnChooserHtml, reorderColumns, wireColumnChooser } from '../js/pages/crm-columns.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.location = { hash: '#/crm', pathname: '/', search: '' };

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), get length() { return m.size; }, key: (i) => [...m.keys()][i] }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const keysOf = (root, sel) => [...root.querySelectorAll(sel)].map((el) => el.dataset.colKey || el.dataset.vcol);

function drag(from, to) {
  from.dispatchEvent(new window.Event('dragstart', { bubbles: true }));
  to.dispatchEvent(new window.Event('dragover', { bubbles: true, cancelable: true }));
  to.dispatchEvent(new window.Event('drop', { bubbles: true, cancelable: true }));
}
function arrow(li, key) {
  let ev;
  if (typeof window.KeyboardEvent === 'function') ev = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  else { ev = new window.Event('keydown', { bubbles: true, cancelable: true }); Object.defineProperty(ev, 'key', { value: key }); }
  li.dispatchEvent(ev);
}

const chooserRoot = document.createElement('div');
document.body.appendChild(chooserRoot);
const fields = [{ key: 'name', label: 'Client Name' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }];
chooserRoot.innerHTML = toText(columnChooserHtml('contacts', fields, ['name', 'email', 'phone']));
let allOrder = ['name', 'email', 'phone'];
wireColumnChooser(chooserRoot, {
  module: 'contacts', userId: 'u-admin', fields, visible: allOrder.slice(), defaults: allOrder.slice(), known: fields.map((f) => f.key), storage: mem(),
  onChange: (next) => { allOrder = next.slice(); },
});
const allKeys = () => keysOf(chooserRoot, '[data-col-order] [data-col-key]');
const allLi = (key) => chooserRoot.querySelector(`[data-col-key="${key}"]`);
drag(allLi('phone'), allLi('name'));
ok(allOrder.join() === 'phone,name,email' && allKeys().join() === allOrder.join(), 'All list drag uses the shared reorder (' + allOrder.join() + ')');
arrow(allLi('phone'), 'ArrowUp');
ok(allOrder.join() === 'phone,name,email', 'ArrowUp on the first All list row stays put');
arrow(allLi('email'), 'ArrowUp');
ok(allOrder.join() === 'phone,email,name', 'ArrowUp on an All list row moves that column one place');
ok(!chooserRoot.querySelector('[data-vcol-up]') && !chooserRoot.querySelector('[data-vcol-down]'), 'the All list chooser has no up or down arrow');
const allRow = allLi('phone');
ok(allRow.getAttribute('draggable') === 'true' && allRow.getAttribute('tabindex') === '0' && allRow.closest('.col-chooser'), 'an All list row is the drag handle');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const me = await api.crmMe();
const cfg = await api.getCrmSettings();
const owners = await api.listCrmOwners();
const root = document.getElementById('app');
const seen = [];
const create = api.createCrmView.bind(api);
api.createCrmView = async (input) => { seen.push(input.columns.slice()); return create(input); };

const MODULES = [['leads', 'Leads'], ['contacts', 'Clients'], ['accounts', 'Companies'], ['deals', 'Deals']];
for (const [module, label] of MODULES) {
  seen.length = 0;
  const page = await viewPage({ api, me, cfg, owners, params: { id: 'new', sub: module } });
  root.innerHTML = toText(page.body);
  page.mount(root);
  const keys = () => keysOf(root, '[data-vcol-list] [data-col-key]');
  const li = (key) => root.querySelector(`[data-vcol-list] [data-col-key="${key}"]`);
  const before = keys();
  const viewRow = li(before[0]);
  const allSame = viewRow.getAttribute('draggable') === allRow.getAttribute('draggable') && viewRow.getAttribute('tabindex') === allRow.getAttribute('tabindex') && viewRow.closest('.col-chooser') && viewRow.closest('[data-col-order]');
  ok(allSame, label + ' selected column uses the All list drag row');
  ok(!root.querySelector('[data-vcol-up]') && !root.querySelector('[data-vcol-down]'), label + ' the up and down arrows are gone');
  const removable = before.find((k) => k !== 'name');
  ok(!li('name').querySelector('[data-vcol-x]') && !!li(removable).querySelector('[data-vcol-x]'), label + ' the name stays and another column can be removed');
  const moved = before[before.length - 1];
  const expected = reorderColumns(before, moved, before[0]);
  drag(li(moved), li(before[0]));
  ok(expected && keys().join() === expected.join() && keys().includes('name') && !li('name').querySelector('[data-vcol-x]'), label + ' drag reorders the selected columns (' + keys().join() + ')');
  const afterDrag = keys();
  const stepFrom = afterDrag.length > 2 ? afterDrag[1] : afterDrag[0];
  const stepTo = afterDrag[afterDrag.indexOf(stepFrom) + 1];
  arrow(li(stepFrom), 'ArrowDown');
  const stepped = stepTo ? reorderColumns(afterDrag, stepFrom, stepTo) : null;
  ok(keys().join() === (stepped || afterDrag).join(), label + ' ArrowDown moves the focused column one place');
  const kept = keys();
  drag(li(kept[0]), li(kept[0]));
  ok(keys().join() === kept.join(), label + ' dropping a column on itself leaves the order');
  const attempted = seen.length;
  root.querySelector('[data-view-name]').value = '';
  root.querySelector('[data-view-save]').click();
  await new Promise((r) => setTimeout(r, 0));
  const toast = document.querySelector('#toasts .toast.err');
  const refused = toast && /name/i.test(toast.textContent) && keys().join() === kept.join() && (seen.length === attempted || seen[seen.length - 1].join() === kept.join());
  ok(refused, label + ' a blank view name is refused and the dragged order stays');
  if (toast) toast.remove();
  seen.length = 0;
  root.querySelector('[data-view-name]').value = label + ' dragged columns';
  root.querySelector('[data-view-save]').click();
  await new Promise((r) => setTimeout(r, 20));
  const id = (location.hash.match(/#\/crm\/views\/([^/?]+)/) || [])[1];
  const stored = id && (await api.listCrmViews(module)).find((v) => v.id === id);
  ok(seen.length === 1 && seen[0].join() === kept.join() && stored && stored.columns.join() === kept.join(), label + ' the saved columns are the dragged order');
  if (!stored) continue;
  const shown = await viewPage({ api, me, cfg, owners, params: { id } });
  root.innerHTML = toText(shown.body);
  shown.mount(root);
  const heads = [...root.querySelectorAll('thead th[data-sort]')].map((th) => th.dataset.sort);
  const check = root.querySelector('thead [data-bulk-page]');
  const checkTh = check && check.closest('th');
  ok(check && checkTh && !checkTh.dataset.sort && !checkTh.dataset.col && checkTh.getAttribute('draggable') !== 'true' && heads.join() === stored.columns.join(), label + ' the view list shows the saved column order, with a checkbox that is not a column');
}

const edited = await api.createCrmView({ module: 'contacts', name: 'Edit drag', columns: ['ownerId', 'name', 'email'], criteria: [], pin: false });
const edit = await viewPage({ api, me, cfg, owners, params: { id: edited.id, sub: 'edit' } });
root.innerHTML = toText(edit.body);
edit.mount(root);
const editKeys = () => keysOf(root, '[data-vcol-list] [data-col-key]');
ok(editKeys().join() === 'ownerId,name,email' && !root.querySelector('[data-vcol-up]'), 'edit opens the saved columns with no arrows');
drag(root.querySelector('[data-col-key="email"]'), root.querySelector('[data-col-key="ownerId"]'));
const editOrder = editKeys().join();
ok(editOrder === 'email,ownerId,name', 'dragging Email onto Client Owner on an edit puts Email first');
root.querySelector('[data-view-save]').click();
await new Promise((r) => setTimeout(r, 20));
const again = (await api.listCrmViews('contacts')).find((v) => v.id === edited.id);
const ran = await api.runCrmView(edited.id);
ok(again && again.columns.join() === editOrder && ran.columns.map((c) => c.key).join() === editOrder, 'the edited view stores and shows that dragged order');

console.log(fail ? fail + ' failed' : 'crm view column drag passed');
if (fail) process.exit(1);
