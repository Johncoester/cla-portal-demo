/* MF-061 (Matt Landsberg, "Portal Feedback Nov 22"; confirm-back reply Nov 22 2026, 1:54 PM ET, Gmail 1a2049c9ec631d7b).
 * The processor's Tasks screen names each buyer and seller ("Sally Seller", Seller) instead of the generic "Client-Seller" label.
 * The buyer and seller logins see their own names the same way. Mock data only; hosted rows are simulated (no ownerName, file shell). */
import { readFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { render as renderTasks } from '../js/pages/dealtasks.js';
import { render as renderTaskForm } from '../js/pages/dealtaskform.js';
import { nameTasks, taskRoleLabel, taskWhoText, sideWord } from '../js/data/task-party-names.js';

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

// helpers
const parts = [
  { id: 'p1', role: 'Client-Seller', contact: { firstName: 'Bob', lastName: 'Smith' } },
  { id: 'p2', role: 'Client-Seller', contact: { firstName: 'Susan', lastName: 'Smith' } },
  { id: 'p3', role: 'Client-Buyer', entity: { name: 'Acme Holdings LLC' }, contact: { firstName: 'Ann', lastName: 'Rep' } },
  { id: 'p4', role: 'Client-Buyer', removed: true, contact: { firstName: 'Old', lastName: 'Buyer' } },
];
const named = nameTasks([
  { id: 'a', assignedRole: 'Client-Seller', participantId: 'p1' },
  { id: 'b', assignedRole: 'Client-Seller', participantId: 'p2' },
  { id: 'c', assignedRole: 'Client-Seller', participantId: null },
  { id: 'd', assignedRole: 'Client-Buyer', participantId: 'p3' },
  { id: 'e', assignedRole: 'Client-Buyer', participantId: null },
  { id: 'f', assignedRole: 'Processor', participantId: null },
  { id: 'g', assignedRole: 'Client-Seller', participantId: 'p1', ownerName: 'Kept Name' },
], parts);
const by = Object.fromEntries(named.map((t) => [t.id, t]));
ok(taskWhoText(by.a) === 'Bob Smith (Seller)' && taskWhoText(by.b) === 'Susan Smith (Seller)', 'each seller copy names that seller: "Bob Smith (Seller)", "Susan Smith (Seller)"');
ok(taskWhoText(by.c) === 'Bob Smith & Susan Smith (Sellers)', 'a task for the whole seller side names every seller');
ok(taskWhoText(by.d) === 'Acme Holdings LLC (Buyer)', 'an entity buyer is named by the entity');
ok(taskWhoText(by.e) === 'Acme Holdings LLC (Buyer)', 'a removed buyer is not named');
ok(taskWhoText(by.f) === 'Processor' && taskWhoText(by.g) === 'Kept Name (Seller)', 'staff roles keep their name; a name already on the task is kept');
ok(taskRoleLabel({ assignedRole: 'Client-Buyer' }, { refi: true }) === 'Borrower' && sideWord('Client-Seller') === 'Seller', 'a refinance buyer is the Borrower');
ok(taskWhoText({ assignedRole: 'Client-Seller' }) === 'Seller', 'no name on file: just "Seller", never "Client-Seller"');
ok(nameTasks([{ id: 'x', assignedRole: 'Client-Seller', participantId: 'p1' }], []).every((t) => !t.ownerName), 'no parties: nothing is guessed');

// the Tasks screen, the way it opens on TEST: the file shell (no parties) and task rows with no owner name
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
const realList = api.listTasks.bind(api);
const realGet = api.getTask.bind(api);
let partyReads = 0;
async function open(who, { failParties = false } = {}) {
  await api.signInDev(who);
  const session = await api.getSession();
  const full = await api.getDeal('deal-2');
  const user = session.role === 'Outside user' && full.myRole ? { ...session, role: full.myRole, roles: full.myRoles || [full.myRole], accountRole: session.role } : session;
  const staff = session.role !== 'Outside user';
  const deal = staff ? { ...full, participants: [] } : full;
  api.listTasks = async (id) => (await realList(id)).map((t) => ({ ...t, ownerName: '' }));
  api.listTaskParties = async () => { partyReads += 1; if (failParties) throw new Error('read failed'); return full.participants; };
  hash.value = '#/deals/deal-2/tasks';
  const view = await renderTasks({ api, user, deal, refresh() {} });
  document.body.innerHTML = toText(view.body);
  api.listTasks = realList; delete api.listTaskParties;
  const cells = [...document.querySelectorAll('[data-task-who]')].map((td) => td.textContent.replace(/\s+/g, ' ').trim());
  return { cells, html: document.body.innerHTML, user, deal };
}
const proc = await open('u-proc');
ok(partyReads === 1, 'processor: the parties are read once for the file shell');
ok(proc.cells.some((c) => c.startsWith('Sally Seller') && c.includes('Seller')), 'processor Tasks: a seller task says "Sally Seller" with "Seller" under it');
ok(proc.cells.some((c) => c.startsWith('Ben Buyer') && c.includes('Buyer')) && proc.cells.some((c) => c.startsWith('Morgan Realtor')), 'processor Tasks: each buyer task names that buyer (two buyers on this file)');
ok(!proc.cells.some((c) => /Client-(Buyer|Seller)/.test(c)), 'processor Tasks: no "Client-Buyer" / "Client-Seller" label left in Assigned to');
ok(!/Fill in for client/.test(proc.html), 'processor Tasks: no "Fill in for client" button text');
const fallback = await open('u-proc', { failParties: true });
ok(fallback.cells.length > 0 && fallback.cells.some((c) => c === 'Seller') && !fallback.cells.some((c) => /Client-/.test(c)), 'a failed parties read still loads the list and shows "Seller", not an error or "Client-Seller"');
for (const who of ['u-preproc', 'u-adam', 'u-admin', 'u-tc', 'u-sp', 'u-team']) {
  const v = await open(who);
  ok(!v.cells.some((c) => /Client-(Buyer|Seller)/.test(c)) && (v.cells.length === 0 || v.cells.some((c) => /Sally Seller|Ben Buyer|Morgan Realtor|Bianca|Larry|Seller|Buyer/.test(c))), `${who}: Assigned to shows names or Buyer / Seller, never Client-Buyer / Client-Seller (${v.cells.length} rows)`);
}
const buyer = await open('u-buyer');
ok(buyer.cells.length > 0 && buyer.cells.every((c) => c.startsWith('Ben Buyer') || /^Buyer/.test(c)) && !buyer.cells.some((c) => /Client-|Sally|Morgan/.test(c)), 'buyer login: their To-do list names them ("Ben Buyer", Buyer), and no other buyer or seller');
const seller = await open('u-seller');
ok(seller.cells.length > 0 && seller.cells.every((c) => c.startsWith('Sally Seller') || /^Seller/.test(c)) && !seller.cells.some((c) => /Client-|Ben Buyer|Morgan/.test(c)), 'seller login: their To-do list names them ("Sally Seller", Seller), and no buyer');
for (const who of ['u-bagent', 'u-lagent']) {
  const v = await open(who);
  ok(!v.cells.some((c) => /Client-(Buyer|Seller)/.test(c)), `${who}: agent My Tasks has no Client-Buyer / Client-Seller label`);
}

// the task page header: "For Sally Seller (Seller)"
await api.signInDev('u-proc');
const full = await api.getDeal('deal-2');
const sellerTask = (await realList('deal-2')).find((t) => t.assignedRole === 'Client-Seller' && t.kind === 'form');
api.getTask = async (id) => ({ ...(await realGet(id)), ownerName: '' });
api.listTaskParties = async () => full.participants;
hash.value = `#/deals/deal-2/tasks/${sellerTask.id}`;
const page = await renderTaskForm({ api, user: await api.getSession(), deal: { ...full, participants: [] }, params: { id: 'deal-2', tab: 'tasks', sub: sellerTask.id }, refresh() {}, go() {} });
const ph = toText(page.body);
ok(/For <strong data-task-for>Sally Seller<\/strong> \(Seller\)/.test(ph) && !/Client-Seller/.test(ph.slice(0, ph.indexOf('data-task-for') + 200)), 'task page: "For Sally Seller (Seller)", not "Client-Seller (Client-Seller)"');
api.getTask = realGet; delete api.listTaskParties;

// hosted adapter: one cached parties read, warmed when the Tasks tab opens
const ad = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
ok(/async listTaskParties\(dealId\)[\s\S]{0,200}fileRead\('taskparties:'/.test(ad) && ad.includes("sb.rpc('deal_contacts', { p_deal: dealId })") && ad.includes("sb.rpc('deal_entities', { p_deal: dealId })"), 'hosted: names come from the existing deal_contacts / deal_entities reads, cached per file');
ok(/tab === 'tasks'\) \{ fileRead\('taskrows:'[^\n]*a\.listTaskParties\(id\)/.test(ad), 'hosted: the parties read starts with the task rows when the Tasks tab opens (no extra wait)');
console.log(fail ? `FAIL ${fail}` : 'all task party name checks passed');
process.exit(fail ? 1 : 0);
