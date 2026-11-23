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
window.Element.prototype.scrollIntoView = function (opts) { scrolls.push({ id: this.id, col: this.getAttribute('data-board-col') || '', clients: this.hasAttribute('data-account-contacts'), opts }); };

const { toText } = await import('../js/ui.js');
const { render } = await import('../js/pages/crm.js');
const { wireShortcuts } = await import('../js/pages/crm-shortcuts.js');
const { setModuleMap } = await import('../js/data/modules.js');
const { tabs, setCrmAdmin } = await import('../js/pages/crm-kit.js');

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
  listCrmModuleRows: count(async (module) => (module === 'calls' ? [{ id: 'call-1', subject: 'Intro call with Casey Sample', callType: 'Outbound', callStart: '2026-11-18T15:00', callStatus: 'Scheduled', ownerName: 'Ada Admin' }] : [])),
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
function item(host, key) {
  return host.querySelector('[data-crm-shortcuts] [data-crm-jump="' + key + '"]');
}
const RECORD = 'notes:Notes|open:Open Activities|closed:Closed Activities|emails:Emails|attachments:Attachments';
const WITH_DEALS = 'notes:Notes|deals:Deals|open:Open Activities|closed:Closed Activities|emails:Emails|attachments:Attachments';
const TAB_ORDER = ['home', 'leads', 'contacts', 'accounts', 'deals', 'tasks', 'meetings', 'calls', 'pipeline', 'dashboards', 'reports', 'templates', 'settings'];
const MODULE_JUMPS = ['clients', 'leads', 'task', 'meeting', 'call'];
function tabKeys(host) {
  return [...host.querySelectorAll('[data-crm-tabs] [data-crm-tab]')].map((el) => el.getAttribute('data-crm-tab'));
}
function tabEl(host, key) {
  return host.querySelector('[data-crm-tabs] [data-crm-tab="' + key + '"]');
}
function comingSoon(el) {
  return el && el.tagName === 'SPAN' && el.classList.contains('crm-tab-soon') && el.getAttribute('title') === 'Coming soon' && el.getAttribute('aria-disabled') === 'true' && !el.getAttribute('href') && !el.querySelector('a, button');
}
function noModuleJumps(host) {
  return MODULE_JUMPS.every((key) => !host.querySelector('[data-crm-shortcuts] [data-crm-jump="' + key + '"]'));
}

const list = await open('leads', '', { mount: false });
ok(!list.html.includes('data-crm-shortcuts'), 'the Leads list has no shortcut panel');
ok(tabKeys({ querySelectorAll: (s) => { const box = document.createElement('div'); box.innerHTML = list.html; return box.querySelectorAll(s); } }).join(',') === TAB_ORDER.join(','), 'the Leads list still has the top tabs, with Tasks, Meetings, and Calls added');

const lead = await open('leads', 'rec-1');
ok(lead.duringMount === 0, 'opening the shortcuts does not make another request');
ok(keys(lead.host).join('|') === RECORD, 'a lead lists Notes, Open Activities, Closed Activities, Emails, and Attachments');
ok(!item(lead.host, 'deals'), 'a lead has no orders list, so Deals stays off the panel');
ok(noModuleJumps(lead.host), 'Clients, Leads, Task, Meeting, and Call are not on the lead panel');
ok(!lead.host.querySelector('[data-crm-shortcuts] a'), 'the lead panel has no module links');
const leadNav = lead.host.querySelector('[data-crm-shortcuts]');
const leadMain = lead.host.querySelector('[data-crm-record-main]');
ok(leadNav && leadMain && leadNav.nextElementSibling === leadMain, 'the panel sits to the left of the record');
ok(lead.host.querySelector('#crm-shortcut-css').textContent.includes('position: sticky') && lead.host.querySelector('#crm-shortcut-css').textContent.includes('@media (max-width: 800px)'), 'the page carries the sticky and narrow-screen rules');
ok(tabKeys(lead.host).join(',') === TAB_ORDER.join(','), 'a lead keeps the existing tab order and adds Tasks, Meetings, and Calls after Deals');
ok(tabEl(lead.host, 'leads').classList.contains('active') && tabEl(lead.host, 'home').getAttribute('href') === '#/crm/home', 'Home still opens CRM Home, and the Leads tab is the current one');
ok(tabEl(lead.host, 'tasks').tagName === 'A' && tabEl(lead.host, 'tasks').getAttribute('href') === '#/crm' && !tabEl(lead.host, 'tasks').classList.contains('active'), 'Tasks opens CRM Home, the same place the old Task shortcut opened');
ok(comingSoon(tabEl(lead.host, 'meetings')), 'Meetings is grey Coming soon text and is not a link');
ok(tabEl(lead.host, 'calls').tagName === 'A' && tabEl(lead.host, 'calls').getAttribute('href') === '#/crm/calls' && !tabEl(lead.host, 'calls').getAttribute('href').includes('?'), 'Calls opens the Calls list');
ok(tabEl(lead.host, 'reports').getAttribute('href') === '#/crm/reports' && tabEl(lead.host, 'templates').getAttribute('href') === '#/crm/templates', 'Reports and Email Templates stay on the tab row');
ok(!lead.host.querySelector('[data-crm-tabs] [data-crm-count]'), 'module tabs do not show a count');
ok(lead.host.querySelector('#crm-tab-soon-css').textContent.includes('var(--ink-4)'), 'Coming soon uses the portal grey');

scrolls.length = 0;
lead.host.querySelector('[data-crm-jump="notes"]').click();
ok(scrolls.length === 1 && scrolls[0].opts && scrolls[0].opts.behavior === 'smooth' && scrolls[0].opts.block === 'start' && lead.host.querySelector('[data-notes]').id === 'crm-section-notes', 'Notes smooth-scrolls to the Notes section');
ok(lead.host.querySelector('[data-crm-jump="notes"]').getAttribute('aria-current') === 'true' && !lead.host.querySelector('[data-crm-jump="emails"]').hasAttribute('aria-current'), 'the shortcut you clicked is the current one');
lead.host.querySelector('[data-crm-jump="open"]').click();
ok(lead.host.querySelector('[data-open-acts]').id === 'crm-section-open' && lead.host.querySelector('[data-crm-jump="open"]').getAttribute('aria-current') === 'true' && !lead.host.querySelector('[data-crm-jump="notes"]').hasAttribute('aria-current'), 'Open Activities jumps to the open activities section');
scrolls.length = 0;
tabEl(lead.host, 'meetings').click();
ok(scrolls.length === 0 && !tabEl(lead.host, 'meetings').hasAttribute('aria-current'), 'Coming soon Meetings does not scroll and is not a current tab');

const client = await open('contacts', 'rec-1');
ok(keys(client.host).join('|') === WITH_DEALS, 'a client lists Notes, Deals, then the other record shortcuts');
ok(noModuleJumps(client.host) && item(client.host, 'deals').tagName === 'BUTTON', 'Deals stays on the client, on the orders already listed');
scrolls.length = 0;
client.host.querySelector('[data-crm-jump="deals"]').click();
ok(scrolls.length === 1 && client.host.querySelector('[data-crm-orders]').id === 'crm-section-deals' && client.host.querySelector('[data-crm-orders] h3').textContent.includes('Orders in the portal'), 'Deals jumps to the orders already listed on the client');
ok(!item(client.host, 'attachments').querySelector('[data-crm-count]') && item(client.host, 'attachments').textContent.trim() === 'Attachments', 'an empty Attachments list shows no number');
ok(!item(client.host, 'notes').querySelector('[data-crm-count]') && !item(client.host, 'open').querySelector('[data-crm-count]'), 'Notes and Open Activities do not show a count');

const company = await open('accounts', 'co-1');
ok(keys(company.host).join('|') === WITH_DEALS, 'a company lists Notes, Deals, then the other record shortcuts');
ok(company.duringMount === 0, 'the company panel does not make another request');
ok(noModuleJumps(company.host) && item(company.host, 'deals').tagName === 'BUTTON', 'Deals stays on the company; the module links are gone');
ok(company.host.querySelector('[data-account-contacts]'), 'the clients already listed for the company stay on the page');
scrolls.length = 0;
company.host.querySelector('[data-crm-jump="deals"]').click();
ok(scrolls.length === 1 && company.host.querySelector('[data-crm-orders]').id === 'crm-section-deals', 'Deals jumps to the orders already listed for the company');

const deal = await open('deals', 'd1');
ok(keys(deal.host).join('|') === 'emails:Emails', 'a deal lists Emails only');
ok(!deal.host.querySelector('[data-crm-jump="notes"]') && !deal.host.querySelector('[data-crm-jump="attachments"]') && !deal.host.querySelector('[data-crm-jump="open"]') && !deal.host.querySelector('[data-crm-jump="deals"]'), 'Notes, Deals, Attachments, and Open Activities stay off a deal');
ok(noModuleJumps(deal.host) && !deal.host.querySelector('[data-crm-shortcuts] a'), 'a deal panel has no module links');
ok(tabEl(deal.host, 'deals').classList.contains('active') && tabEl(deal.host, 'tasks').getAttribute('href') === '#/crm', 'on a deal, Deals is the current tab and Tasks still opens CRM Home');
ok(comingSoon(tabEl(deal.host, 'meetings')) && tabEl(deal.host, 'calls').getAttribute('href') === '#/crm/calls', 'on a deal, Meetings stays Coming soon and Calls opens the Calls list');
scrolls.length = 0;
deal.host.querySelector('[data-crm-jump="emails"]').click();
ok(scrolls.length === 1 && scrolls[0].opts.behavior === 'smooth' && deal.host.querySelector('[data-emails-list]').id === 'crm-section-emails', 'Emails smooth-scrolls to the emails section');

const partial = document.createElement('div');
partial.innerHTML = '<div data-crm-record class="crm-record has-shortcuts"><nav data-crm-shortcuts></nav><div data-crm-record-main><div data-notes></div></div></div>';
ok(wireShortcuts(partial).join(',') === 'notes' && !partial.querySelector('[data-crm-jump="emails"]') && !partial.querySelector('[data-crm-jump="deals"]'), 'a section that is not on the page is left out');
const empty = document.createElement('div');
empty.innerHTML = '<div data-crm-record class="crm-record has-shortcuts"><nav data-crm-shortcuts></nav><div data-crm-record-main><p>No related lists.</p></div></div>';
ok(wireShortcuts(empty).join(',') === '' && empty.querySelector('[data-crm-shortcuts]').hidden === true && !empty.querySelector('[data-crm-record]').classList.contains('has-shortcuts'), 'with no record sections, the panel is hidden');

function attachmentsHost(n) {
  const rows = Array.from({ length: n }, (_, i) => '<tr data-att="a' + i + '"></tr>').join('');
  const host = document.createElement('div');
  host.innerHTML = '<div data-crm-record class="crm-record has-shortcuts"><nav data-crm-shortcuts></nav><div data-crm-record-main><div data-notes></div><div data-open-acts></div><div data-attachments><table>' + rows + '</table></div></div></div>';
  wireShortcuts(host);
  return host;
}
const none = attachmentsHost(0);
ok(item(none, 'attachments').textContent.trim() === 'Attachments' && !item(none, 'attachments').querySelector('[data-crm-count]'), 'zero attachments shows no number');
const few = attachmentsHost(3);
ok(item(few, 'attachments').querySelector('[data-crm-count]').textContent === '3' && item(few, 'attachments').querySelector('[data-crm-count]').getAttribute('data-crm-count') === '3', 'three attachments shows 3');
ok(!item(few, 'notes').querySelector('[data-crm-count]') && !item(few, 'open').querySelector('[data-crm-count]'), 'only Attachments gets a count');
const many = attachmentsHost(11);
ok(item(many, 'attachments').querySelector('[data-crm-count]').textContent === '10+' && !item(many, 'attachments').textContent.includes('11'), 'more than 10 attachments shows 10+');

const pages = [lead.host, client.host, company.host, deal.host];
ok(pages.every((host) => !host.querySelector('[data-crm-shortcuts] a')), 'no record panel links out to a module');
const callsView = await render({ api, me, params: { section: 'calls' }, refresh() {}, go() {} });
const callsHtml = toText(callsView.body);
ok(callsView.title === 'CRM Calls' && callsHtml.includes('data-calls-list') && callsHtml.includes('href="#/crm/calls/call-1"') && callsHtml.includes('Intro call with Casey Sample') && callsHtml.includes('data-crm-tab="calls"'), 'opening Calls shows the Calls list');
const callsBox = document.createElement('div');
callsBox.innerHTML = callsHtml;
ok(tabEl(callsBox, 'calls').classList.contains('active'), 'the Calls tab is current on the Calls list');
const meetingsView = await render({ api, me, params: { section: 'meetings' }, refresh() {}, go() {} });
ok(toText(meetingsView.body).includes('That CRM page does not exist.'), 'there is still no Meetings list');
setModuleMap({ calls: 'off' });
const callsOff = await render({ api, me, params: { section: 'leads', id: 'rec-1' }, refresh() {}, go() {} });
const offBox = document.createElement('div');
offBox.innerHTML = toText(callsOff.body);
ok(!tabEl(offBox, 'calls') && tabEl(offBox, 'tasks') && comingSoon(tabEl(offBox, 'meetings')), 'a switched-off Calls module hides that tab and leaves Tasks and Meetings');
setModuleMap({ calls: 'beta' });
setCrmAdmin(true);
const betaBox = document.createElement('div');
betaBox.innerHTML = toText(tabs('home'));
ok(tabEl(betaBox, 'calls') && tabEl(betaBox, 'calls').querySelector('[data-beta-badge="calls"]') && tabEl(betaBox, 'home').classList.contains('active'), 'Calls in testing keeps the beta badge, and Home stays the current tab');
setModuleMap({});
const callsSrc = read('js/pages/crm-calls.js');
const listFn = callsSrc.slice(callsSrc.indexOf('export async function callsList'), callsSrc.indexOf('export async function callPage'));
ok(listFn.includes("listCrmModuleRows('calls')") && !/URLSearchParams|location\.hash|searchParams|dealId|relatedId/.test(listFn), 'the Calls list has no deal filter, so the shortcut opens the whole list');

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
  ['js/pages/crm-shortcuts.js', '202611289980'],
  ['js/pages/crm-deals.js', '202611290800'],
  ['js/pages/crm.js', '202611290800'],
  ['js/app.js', '202611291500'],
];
const issues = [];
for (const [target, stamp] of chain) {
  const stamps = [...(hits.get(target) || [])];
  if (stamps.length !== 1 || stamps[0] !== stamp) issues.push(target + ' ' + (stamps.join(',') || 'none'));
}
ok(issues.length === 0, 'cache stamps agree' + (issues.length ? ': ' + issues.join('; ') : ''));
const appFrom = [...(hits.get('js/app.js') || [])];
ok(read('index.html').includes('js/app.js?v=202611291500') && appFrom.length === 1 && appFrom[0] === '202611291400', 'index.html loads the shell at 202611290610');
ok(read('js/app.js').includes('adapter.js?v=202611291500'), 'the shell loads the adapter at 202611290200 so Home reads company and deal names');

console.log('cache-stamp issues', issues.length);
console.log('dual-stamp', dual.length);
console.log(fail ? fail + ' failed' : 'crm shortcuts passed');
if (fail) process.exit(1);
