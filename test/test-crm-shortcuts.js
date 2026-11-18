/* CRM record shortcuts (Janine, Feedback 28 item 3). Fake records only. No network. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const src = read('js/pages/crm-shortcuts.js');
ok(!src.includes('fetch(') && !src.includes('listCrm') && !/\bapi\./.test(src), 'the shortcut panel does not ask the server for anything');
ok(src.includes("behavior: 'smooth'") && src.includes("block: 'start'") && src.includes('position: sticky') && src.includes('max-width: 800px') && src.includes('position: static'), 'a click smooth-scrolls, the panel sticks on a desktop, and it wraps on a narrow screen');

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const scrolls = [];
window.Element.prototype.scrollIntoView = function (opts) { scrolls.push({ id: this.id, attr: this.getAttribute('data-notes') != null ? 'notes' : this.getAttribute('data-crm-orders') != null ? 'deals' : this.getAttribute('data-emails-list') != null ? 'emails' : this.getAttribute('data-open-acts') != null ? 'open' : '', opts }); };

const { toText } = await import('../js/ui.js');
const { render } = await import('../js/pages/crm.js');
const { wireShortcuts } = await import('../js/pages/crm-shortcuts.js');

const me = { id: 'u-admin', role: 'Admin', isAdmin: true, canEdit: true, canConfigure: true, name: 'Ada Admin' };
const cfg = { customFields: [], picklists: {} };
const totals = { orders: 1, open: 1, closed: 0, cancelled: 0, volume: 1000 };
const person = { id: 'rec-1', name: 'Casey Sample', ownerName: 'Ada Admin', email: 'casey.sample@example.test', phone: '', company: 'Harbor Realty (fake)', activities: [], invitedMeetings: [], attachments: [], links: {}, archived: false, converted: false };
let calls = 0;
function count(fn) { return async (...args) => { calls += 1; return fn(...args); }; }
const api = {
  crmMe: count(async () => me),
  listCrmOwners: count(async () => []),
  listCrmAssignees: count(async () => []),
  getCrmSettings: count(async () => cfg),
  listCrmViews: count(async () => []),
  listCrmAccounts: count(async () => []),
  listCrmLeads: count(async () => [person]),
  listCrmContacts: count(async () => [person]),
  getCrmLead: count(async () => person),
  getCrmContact: count(async () => ({ ...person, salesReps: [], tags: [], orders: [{ dealId: 'd1', fileNumber: 'FAKE-1', address: '1 Main St', roles: ['Buyer'], people: [], canOpen: false, openDate: '2026-11-01', status: 'Open', purchasePrice: 1000 }], totals, opportunities: [], hasLogin: false, lastContactedOn: '' })),
  getCrmAccount: count(async () => ({ id: 'co-1', name: 'Harbor Realty (fake)', kind: 'brokerage', city: 'Rockville', state: 'MD', ownerName: 'Ada Admin', contactList: [], orders: [{ dealId: 'd1', fileNumber: 'FAKE-1', address: '1 Main St', roles: [], people: ['Casey Sample (Buyer)'], canOpen: false, openDate: '2026-11-01', status: 'Open', purchasePrice: 1000 }], totals, opportunities: [], activities: [], invitedMeetings: [], attachments: [] })),
  getCrmDeal: count(async () => ({ id: 'd1', name: '1 Main St', fileNumber: 'FAKE-1', propertyAddress: '1 Main St', amount: 1000, stage: 'Opened', status: 'Open', people: [], emails: [] })),
};

async function open(section, id, { mount = true } = {}) {
  const before = calls;
  const view = await render({ api, me, params: { section, id }, refresh() {}, go() {} });
  const host = document.getElementById('app');
  host.innerHTML = toText(view.body);
  const atMount = calls;
  if (mount && view.mount) view.mount(host);
  return { host, duringMount: calls - atMount, duringLoad: atMount - before, html: host.innerHTML };
}

function keys(host) {
  return [...host.querySelectorAll('[data-crm-shortcuts] [data-crm-jump]')].map((b) => b.getAttribute('data-crm-jump') + ':' + b.textContent.trim());
}

const list = await open('leads', '', { mount: false });
ok(!list.html.includes('data-crm-shortcuts'), 'the Leads list has no shortcut panel');

const lead = await open('leads', 'rec-1');
ok(lead.duringMount === 0, 'opening the shortcuts does not make another request');
ok(keys(lead.host).join('|') === 'notes:Notes|open:Open Activities|closed:Closed Activities|emails:Emails|attachments:Attachments', 'a lead shows Notes, Open Activities, Closed Activities, Emails, and Attachments');
ok(!lead.host.querySelector('[data-crm-jump="deals"]'), 'a lead has no Deals shortcut, because that section is not on the page');
const leadNav = lead.host.querySelector('[data-crm-shortcuts]');
const leadMain = lead.host.querySelector('[data-crm-record-main]');
ok(leadNav && leadMain && leadNav.nextElementSibling === leadMain, 'the panel sits to the left of the record');
ok(lead.host.querySelector('#crm-shortcut-css').textContent.includes('position: sticky') && lead.host.querySelector('#crm-shortcut-css').textContent.includes('@media (max-width: 800px)'), 'the page carries the sticky and narrow-screen rules');

scrolls.length = 0;
lead.host.querySelector('[data-crm-jump="notes"]').click();
ok(scrolls.length === 1 && scrolls[0].opts && scrolls[0].opts.behavior === 'smooth' && scrolls[0].opts.block === 'start' && lead.host.querySelector('[data-notes]').id === 'crm-section-notes', 'Notes smooth-scrolls to the Notes section');
ok(lead.host.querySelector('[data-crm-jump="notes"]').getAttribute('aria-current') === 'true' && !lead.host.querySelector('[data-crm-jump="emails"]').hasAttribute('aria-current'), 'the shortcut you clicked is the current one');
lead.host.querySelector('[data-crm-jump="open"]').click();
ok(lead.host.querySelector('[data-open-acts]').id === 'crm-section-open' && lead.host.querySelector('[data-crm-jump="open"]').getAttribute('aria-current') === 'true' && !lead.host.querySelector('[data-crm-jump="notes"]').hasAttribute('aria-current'), 'Open Activities jumps to the open activities section');

const client = await open('contacts', 'rec-1');
ok(keys(client.host).join('|') === 'notes:Notes|deals:Deals|open:Open Activities|closed:Closed Activities|emails:Emails|attachments:Attachments', 'a client shows all six shortcuts');
scrolls.length = 0;
client.host.querySelector('[data-crm-jump="deals"]').click();
ok(scrolls.length === 1 && client.host.querySelector('[data-crm-orders]').id === 'crm-section-deals' && client.host.querySelector('[data-crm-orders] h3').textContent.includes('Orders in the portal'), 'Deals jumps to the orders already listed on the client');

const company = await open('accounts', 'co-1');
ok(keys(company.host).join('|') === 'notes:Notes|deals:Deals|open:Open Activities|closed:Closed Activities|emails:Emails|attachments:Attachments', 'a company shows all six shortcuts');
ok(company.duringMount === 0, 'the company panel does not make another request');

const deal = await open('deals', 'd1');
ok(keys(deal.host).join('|') === 'emails:Emails', 'a deal shows only Emails, because the other five sections are not on that page');
ok(!deal.host.querySelector('[data-crm-jump="notes"]') && !deal.host.querySelector('[data-crm-jump="attachments"]') && !deal.host.querySelector('[data-crm-jump="deals"]'), 'Notes, Attachments, and Deals are left off a deal');
scrolls.length = 0;
deal.host.querySelector('[data-crm-jump="emails"]').click();
ok(scrolls.length === 1 && scrolls[0].opts.behavior === 'smooth' && deal.host.querySelector('[data-emails-list]').id === 'crm-section-emails', 'Emails smooth-scrolls to the emails section');

const partial = document.createElement('div');
partial.innerHTML = '<div data-crm-record class="crm-record has-shortcuts"><nav data-crm-shortcuts></nav><div data-crm-record-main><div data-notes></div></div></div>';
ok(wireShortcuts(partial).join(',') === 'notes' && !partial.querySelector('[data-crm-jump="emails"]'), 'a section that is not on the page is left out, not shown as a dead shortcut');
const empty = document.createElement('div');
empty.innerHTML = '<div data-crm-record class="crm-record has-shortcuts"><nav data-crm-shortcuts></nav><div data-crm-record-main><p>No related lists.</p></div></div>';
ok(wireShortcuts(empty).length === 0 && empty.querySelector('[data-crm-shortcuts]').hidden === true && !empty.querySelector('[data-crm-record]').classList.contains('has-shortcuts'), 'with no sections, the panel is hidden and the record uses the full width');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'vendor') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|html|css)$/.test(name)) out.push(full);
  }
  return out;
}
const specRe = /(['"])([^'"\s]+?\.(?:js|css))\?v=([A-Za-z0-9]+)\1/g;
const hits = new Map();
for (const file of walk(path.join(root, 'js')).concat(readdirSync(root).filter((n) => n.endsWith('.html')).map((n) => path.join(root, n)))) {
  const rel = path.relative(root, file);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(specRe)) {
    if (!m[2].includes('/')) continue;
    const target = path.normalize(path.join(path.dirname(rel), m[2])).replace(/\\/g, '/');
    if (!hits.has(target)) hits.set(target, new Set());
    hits.get(target).add(m[3]);
  }
}
const dual = [...hits.entries()].filter(([, stamps]) => stamps.size > 1);
ok(dual.length === 0, 'dual-stamp scan ' + dual.length + (dual.length ? ': ' + dual.map(([t, s]) => t + ' ' + [...s].join(',')).join('; ') : ''));
const chain = [
  ['js/pages/crm-shortcuts.js', '202611244500'],
  ['js/pages/crm-deals.js', '202611244500'],
  ['js/pages/crm.js', '202611244900'],
  ['js/app.js', '202611245000'],
];
const issues = [];
for (const [target, stamp] of chain) {
  const stamps = [...(hits.get(target) || [])];
  if (stamps.length !== 1 || stamps[0] !== stamp) issues.push(target + ' ' + (stamps.join(',') || 'none'));
}
ok(issues.length === 0, 'cache stamps agree' + (issues.length ? ': ' + issues.join('; ') : ''));
const appFrom = [...(hits.get('js/app.js') || [])];
ok(read('index.html').includes('js/app.js?v=202611245000') && appFrom.length === 1 && appFrom[0] === '202611245000', 'index.html loads the shell at 202611245000');
ok(!read('js/data/adapter.js').includes('202611244500') && !read('js/app.js').includes('adapter.js?v=202611244500'), 'the shortcut stamp does not move the shared adapter');

console.log('cache-stamp issues', issues.length);
console.log('dual-stamp', dual.length);
console.log(fail ? fail + ' failed' : 'crm shortcuts passed');
if (fail) process.exit(1);
