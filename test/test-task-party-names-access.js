/* MF-060b follow-up for MF-061 (CLA CRM Bot's post-merge review of PR 416, Nov 23 2026): name escaping and per-role access.
 * The Tasks screen and the task page only show names the viewer's own file read already returns (the same names their
 * Contacts screen shows), and a name is always escaped. Mock data only; hosted rows are simulated (no ownerName, file shell). */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { render as renderTasks } from '../js/pages/dealtasks.js';
import { render as renderTaskForm } from '../js/pages/dealtaskform.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
const hash = { value: '#/deals/deal-2/tasks' };
Object.defineProperty(globalThis, 'location', { configurable: true, value: { get hash() { return hash.value; }, set hash(v) { hash.value = v; }, pathname: '/', search: '' } });
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
const realList = api.listTasks.bind(api);
const realGet = api.getTask.bind(api);
const nameOf = (p) => (p.entity && p.entity.name) || [p.contact && p.contact.firstName, p.contact && p.contact.lastName].filter(Boolean).join(' ');
const BUY = /^(Client-Buyer|Buyer Agent)/; const SELL = /^(Client-Seller|Listing Agent)/;

// render File > Tasks as `who`. Staff open on the file shell (no parties) and read the parties on their own; outside viewers
// get the file with the parties their own file read returns. `parties` overrides that read (a hosted deal_contacts reply).
async function open(who, { parties } = {}) {
  await api.signInDev(who);
  const session = await api.getSession();
  const full = await api.getDeal('deal-2');
  const user = session.role === 'Outside user' && full.myRole ? { ...session, role: full.myRole, roles: full.myRoles || [full.myRole], accountRole: session.role } : session;
  const staff = session.role !== 'Outside user';
  const seen = parties || full.participants;
  const deal = staff || parties ? { ...full, participants: [] } : full;
  api.listTasks = async (id) => (await realList(id)).map((t) => ({ ...t, ownerName: '' }));
  api.listTaskParties = async () => seen;
  hash.value = '#/deals/deal-2/tasks';
  const view = await renderTasks({ api, user, deal, refresh() {} });
  document.body.innerHTML = toText(view.body);
  api.listTasks = realList; delete api.listTaskParties;
  const cells = [...document.querySelectorAll('[data-task-who]')].map((td) => td.textContent.replace(/\s+/g, ' ').trim());
  return { cells, html: toText(view.body), seen, full };
}

// 1. escaping: a party name with markup is shown as text on the Tasks screen and the task page
await api.signInDev('u-proc');
const procFull = await api.getDeal('deal-2');
const evil = '<img src=x onerror="alert(1)">Sally';
const evilParties = procFull.participants.map((p) => (p.role === 'Client-Seller' ? { ...p, contact: { ...p.contact, firstName: evil, lastName: '& Co' } } : p));
const esc = await open('u-proc', { parties: evilParties });
ok(!/<img/i.test(esc.html) && esc.html.includes('&lt;img'), 'Tasks screen: a name with markup is escaped (no <img> in the page)');
ok(esc.cells.some((c) => c.includes('<img src=x onerror="alert(1)">Sally & Co')), 'Tasks screen: the escaped name still reads as typed');
const sellerTask = (await realList('deal-2')).find((t) => t.assignedRole === 'Client-Seller' && t.kind === 'form');
api.getTask = async (id) => ({ ...(await realGet(id)), ownerName: '' });
api.listTaskParties = async () => evilParties;
hash.value = `#/deals/deal-2/tasks/${sellerTask.id}`;
const page = await renderTaskForm({ api, user: await api.getSession(), deal: { ...procFull, participants: [] }, params: { id: 'deal-2', tab: 'tasks', sub: sellerTask.id }, refresh() {}, go() {} });
const ph = toText(page.body);
ok(!/<img/i.test(ph) && /data-task-for>&lt;img/.test(ph), 'task page: the "For ..." header escapes the name');
api.getTask = realGet; delete api.listTaskParties;

// 2. per-role access: each viewer only sees names their own file read returns
const allNames = procFull.participants.filter((p) => BUY.test(p.role) || SELL.test(p.role)).map(nameOf);
const sellerSide = procFull.participants.filter((p) => SELL.test(p.role)).map(nameOf);
const buyerSide = procFull.participants.filter((p) => BUY.test(p.role)).map(nameOf);
const buyer = await open('u-buyer');
ok(!buyer.seen.some((p) => SELL.test(p.role)), 'buyer login: their file read has no seller and no listing agent');
ok(buyer.cells.length > 0 && !buyer.cells.some((c) => sellerSide.some((n) => c.includes(n))), `buyer login: Tasks never shows a seller-side name (${sellerSide.join(', ')})`);
const seller = await open('u-seller');
ok(!seller.seen.some((p) => BUY.test(p.role)), 'seller login: their file read has no buyer and no buyer agent');
ok(seller.cells.length > 0 && !seller.cells.some((c) => buyerSide.some((n) => c.includes(n))), `seller login: Tasks never shows a buyer-side name (${buyerSide.join(', ')})`);
for (const who of ['u-bagent', 'u-lagent', 'u-tc']) {
  const v = await open(who);
  const visible = v.seen.map(nameOf);
  const shown = allNames.filter((n) => v.cells.some((c) => c.includes(n)));
  ok(shown.every((n) => visible.includes(n)), `${who}: every party name on Tasks is one their own file read (Contacts) returns`);
}
// hosted shape: a buyer-only viewer whose deal_contacts reply leaves out the seller side gets "Seller", never a guessed name
const buyerOnly = procFull.participants.filter((p) => !SELL.test(p.role));
const proc = await open('u-proc', { parties: buyerOnly });
ok(proc.cells.some((c) => c === 'Seller') && !proc.cells.some((c) => sellerSide.some((n) => c.includes(n))), 'a parties read without the seller side shows "Seller", not a seller name');
const sellerOnly = procFull.participants.filter((p) => !BUY.test(p.role));
const proc2 = await open('u-proc', { parties: sellerOnly });
ok(proc2.cells.some((c) => c === 'Buyer') && !proc2.cells.some((c) => buyerSide.some((n) => c.includes(n))), 'a parties read without the buyer side shows "Buyer", not a buyer name');
console.log(fail ? `FAIL ${fail}` : 'all task party name access checks passed');
process.exit(fail ? 1 : 0);
