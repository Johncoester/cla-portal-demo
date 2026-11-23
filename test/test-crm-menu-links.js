/* CRM menu links open a real page (Janine, CRM Feedback 32 item 3). Fake records only. No network. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.location = { hash: '#/crm', search: '', pathname: '/' };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const { toText } = await import('../js/ui.js');
const { navFor } = await import('../js/app.js');
const { render } = await import('../js/pages/crm.js');

const me = { id: 'u-admin', role: 'Admin', isAdmin: true, canEdit: true, canConfigure: true, name: 'Ada Admin' };
const processor = { ...me, id: 'u-proc', role: 'Processor', isAdmin: false, canEdit: false, canConfigure: false, name: 'Pat Processor' };
const calls = [
  { id: 'call-old', subject: 'Older check-in', callType: 'Inbound', callStart: '2026-11-01T09:00', callStatus: 'Completed', ownerName: 'Ada Admin' },
  { id: 'call-new', subject: 'Intro call with Casey Sample', callType: 'Outbound', callStart: '2026-11-18T15:00', callStatus: 'Scheduled', ownerName: 'Ada Admin' },
];
let callRows = calls.slice();
const hits = [];
function apiFor(who) {
  return new Proxy({}, {
    get(_t, prop) {
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      return async (...args) => {
        hits.push(prop);
        if (prop === 'crmMe') return who;
        if (prop === 'getCrmSettings') return { customFields: [], picklists: {}, fields: {} };
        if (prop === 'listCrmModuleRows') return args[0] === 'calls' ? callRows.slice() : [];
        if (prop === 'listCrmDealFilters') return { scope: 'all', statuses: ['Open', 'All'], owners: [], clients: [], sources: [], me: who };
        if (prop === 'listCrmEmailFolders') return { folders: [], canCreate: false };
        if (prop === 'getCrmCall') {
          if (args[0] === 'missing') throw new Error('Call not found.');
          return { id: args[0], subject: 'Intro call with Casey Sample', entity: 'lead', parentName: 'Casey Sample', parentLink: '#/crm/leads/lead-1', parentLabel: 'Lead', callType: 'Outbound', callStatus: 'Scheduled', callStart: '2026-11-18T15:00', ownerName: 'Ada Admin', createdByName: 'Ada Admin', createdAt: '2026-11-01T12:00:00Z', open: true, body: '' };
        }
        return [];
      };
    },
  });
}

function sectionOf(href) {
  const parts = String(href || '').replace(/^#\//, '').split('/').filter(Boolean);
  return { section: parts[1] || 'home', id: parts[2] || '' };
}
async function open(href, who = me, params) {
  location.hash = href;
  const view = await render({ api: apiFor(who), params: params || sectionOf(href), refresh() {}, go() {} });
  const html = toText(view.body);
  return { ...view, html };
}

const menu = navFor(me, null, 0, { crm: true }, 'crm', null).filter((n) => String(n.href || '').startsWith('#/crm'));
const hrefs = menu.map((n) => n.href);
ok(hrefs.includes('#/crm/calls') && menu.some((n) => n.label === 'Calls' && n.href === '#/crm/calls'), 'the CRM menu still has Calls');
ok(new Set(hrefs).size === hrefs.length && hrefs.length >= 6, 'the CRM menu links are present (' + hrefs.join(', ') + ')');

for (const item of menu) {
  hits.length = 0;
  const view = await open(item.href);
  const missing = view.title === 'Not available' || /does not exist/i.test(view.html);
  ok(!missing && /<h2[\s>]/.test(view.html), item.label + ' (' + item.href + ') opens a page' + (missing ? ': ' + view.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) : ''));
}

hits.length = 0;
callRows = calls.slice();
const list = await open('#/crm/calls');
const callReads = hits.filter((n) => n === 'listCrmModuleRows').length;
const detailReads = hits.filter((n) => n === 'getCrmCall').length;
ok(list.title === 'CRM Calls' && list.html.includes('data-calls-list') && !/does not exist/i.test(list.html), 'Calls opens the calls list');
ok(callReads === 1 && detailReads === 0, 'the list reads calls once and does not open each call');
const rows = [...list.html.matchAll(/data-call-row="([^"]+)"/g)].map((m) => m[1]);
ok(rows.join(',') === 'call-new,call-old', 'newer calls are listed first');
ok(list.html.includes('href="#/crm/calls/call-new"') && list.html.includes('Intro call with Casey Sample') && list.html.includes('Scheduled') && list.html.includes('Outbound'), 'each call links to the call that is already saved');
ok(list.html.includes('overflow-x:auto'), 'the list can scroll sideways on a phone');

callRows = [];
const empty = await open('#/crm/calls');
ok(empty.html.includes('data-calls-empty') && empty.html.includes('No calls yet.') && !/does not exist/i.test(empty.html), 'an empty call list says there are no calls yet');

const reader = await open('#/crm/calls', processor);
ok(reader.html.includes('data-readonly') && reader.html.includes('No calls yet.') && !reader.html.includes('data-schedule-call'), 'a processor can see Calls and is not offered a new button');

callRows = calls.slice();
const one = await open('#/crm/calls/call-new', me, { section: 'calls', id: 'call-new' });
ok(one.html.includes('data-call-detail="call-new"') && one.html.includes('Intro call with Casey Sample') && !one.html.includes('data-calls-list'), 'a single call still opens its own page');

const gone = await open('#/crm/calls/missing', me, { section: 'calls', id: 'missing' });
ok(gone.title === 'Not available' && gone.html.includes('Call not found.') && gone.html.includes('href="#/crm/calls"'), 'a missing call says it was not found and goes back to the list');

const bad = await open('#/crm/no-such', me, { section: 'no-such' });
ok(bad.title === 'Not available' && /does not exist/i.test(bad.html), 'a menu key with no page still says the page does not exist');

const bare = await render({
  api: { crmMe: async () => me, listCrmOwners: async () => [], listCrmAssignees: async () => [], getCrmSettings: async () => ({ customFields: [] }) },
  params: { section: 'calls' }, refresh() {}, go() {},
});
const bareHtml = toText(bare.body);
ok(bare.title === 'Not available' && bareHtml.includes('Calls could not be loaded') && bareHtml.includes('Open CRM Home') && !/does not exist/i.test(bareHtml), 'when calls cannot be loaded, the page says what to do next');

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
const stamps = new Map();
for (const file of walk(path.join(root, 'js')).concat(readdirSync(root).filter((n) => n.endsWith('.html')).map((n) => path.join(root, n)))) {
  const rel = path.relative(root, file);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(specRe)) {
    if (!m[2].includes('/')) continue;
    const target = path.normalize(path.join(path.dirname(rel), m[2])).replace(/\\/g, '/');
    if (!stamps.has(target)) stamps.set(target, new Set());
    stamps.get(target).add(m[3]);
  }
}
const dual = [...stamps.entries()].filter(([, set]) => set.size > 1);
ok(dual.length === 0, 'dual-stamp scan ' + dual.length + (dual.length ? ': ' + dual.map(([t, s]) => t + ' ' + [...s].join(',')).join('; ') : ''));
const chain = [
  ['js/pages/crm-calls.js', '202611301000'],
  ['js/pages/crm-forms.js', '202611301000'],
  ['js/pages/crm-home.js', '202611301100'],
  ['js/pages/crm.js', '202611301000'],
  ['js/app.js', '202611301700'],
];
const issues = [];
for (const [target, stamp] of chain) {
  const got = [...(stamps.get(target) || [])];
  if (got.length !== 1 || got[0] !== stamp) issues.push(target + ' ' + (got.join(',') || 'none'));
}
ok(issues.length === 0, 'cache stamps agree' + (issues.length ? ': ' + issues.join('; ') : ''));
ok(read('index.html').includes('js/app.js?v=202611301700'), 'index.html loads the shell at 202611290610');
ok(!read('js/data/adapter.js').includes('202611246800') && !read('js/data/supabase-adapter.js').includes('202611246800') && !read('js/data/mock-adapter.js').includes('202611246800'), 'the shared adapters are not part of this stamp');

console.log('cache-stamp issues', issues.length);
console.log('dual-stamp', dual.length);
console.log(fail ? fail + ' failed' : 'crm menu links passed');
if (fail) process.exit(1);
