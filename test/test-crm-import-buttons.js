/* CRM import buttons: Import Leads / Import Clients first (main button), Import Notes second. Fake data only. */
import { toText } from '../js/ui.js';
import { render } from '../js/pages/crm.js';
import { importPage } from '../js/pages/crm-janine.js';
import { tabs, head } from '../js/pages/crm-kit.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const admin = { id: 'u-admin', role: 'Admin', isAdmin: true, canEdit: true, canConfigure: true, name: 'Ada Admin', email: 'ada.admin@example.test' };
const sales = { id: 'u-sales', role: 'Sales Person', isAdmin: false, canEdit: true, canConfigure: false, name: 'Sam Sales', email: 'sam.sales@example.test' };
const cfg = { customFields: [], picklists: {} };
const blank = (extra) => ({ id: 'rec-1', name: 'Casey Sample', ownerName: 'Ada Admin', email: 'casey.sample@example.test', phone: '', company: 'Harbor Realty (fake)', activities: [], invitedMeetings: [], attachments: [], links: {}, archived: false, ...extra });

function shell(me, over) {
  return {
    crmMe: async () => me,
    listCrmOwners: async () => [],
    listCrmAssignees: async () => [],
    getCrmSettings: async () => cfg,
    listCrmViews: async () => [],
    listCrmSavedFilters: async () => [],
    listCrmLeads: async () => [blank()],
    listCrmContacts: async () => [blank({ companyName: 'Harbor Realty (fake)', company: 'Harbor Realty (fake)', orders: 0, volume: 0, salesReps: [], tags: [] })],
    listCrmAccounts: async () => [{ id: 'co-1', name: 'Harbor Realty (fake)', kind: 'brokerage', place: 'Rockville, MD', city: 'Rockville', state: 'MD', ownerName: 'Ada Admin', contacts: 0, orders: 0, volume: 0, archived: false }],
    ...over,
  };
}

function importButtons(html) {
  const headHtml = html.slice(0, html.indexOf('data-crm-tabs'));
  const re = /<a\b([^>]*)>([^<]*)<\/a>/g;
  return [...headHtml.matchAll(re)].map((m) => {
    const attrs = m[1];
    const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
    const href = (attrs.match(/href="([^"]*)"/) || [])[1] || '';
    const notes = (attrs.match(/data-import-notes-btn="([^"]*)"/) || [])[1] || '';
    const main = (attrs.match(/data-import-btn="([^"]*)"/) || [])[1] || '';
    return { cls, href, notes, main, text: m[2].replace(/\s+/g, ' ').trim() };
  }).filter((a) => a.notes || a.main);
}

async function page(section, me) {
  const view = await render({ api: shell(me), params: { section }, refresh() {}, go() {} });
  return toText(view.body);
}

const leads = await page('leads', admin);
const leadBtns = importButtons(leads);
ok(leadBtns.length === 2 && leadBtns[0].main === 'leads' && leadBtns[1].notes === 'leads', 'on Leads, Import Leads comes before Import Notes');
ok(leadBtns[0].text === 'Import Leads' && leadBtns[0].href === '#/crm/import/leads' && leadBtns[0].cls.split(/\s+/).includes('m-btn') && !leadBtns[0].cls.split(/\s+/).includes('ghost'), 'Import Leads is the main button and opens the lead import');
ok(leadBtns[1].text === 'Import Notes' && leadBtns[1].href === '#/crm/import/leads/notes' && leadBtns[1].cls.split(/\s+/).includes('ghost') && !leadBtns[1].cls.split(/\s+/).includes('m-btn'), 'Import Notes on Leads is the quieter button after it');
ok(leads.indexOf('data-import-btn="leads"') < leads.indexOf('data-import-notes-btn="leads"'), 'the lead import button is earlier in the page than Import Notes');

const clients = await page('contacts', admin);
const clientBtns = importButtons(clients);
ok(clientBtns.length === 2 && clientBtns[0].main === 'contacts' && clientBtns[1].notes === 'contacts', 'on Clients, Import Clients comes before Import Notes');
ok(clientBtns[0].text === 'Import Clients' && clientBtns[0].href === '#/crm/import/contacts' && clientBtns[0].cls.split(/\s+/).includes('m-btn') && !clientBtns[0].cls.split(/\s+/).includes('ghost'), 'Import Clients is the main button and opens the client import');
ok(clientBtns[1].text === 'Import Notes' && clientBtns[1].href === '#/crm/import/contacts/notes' && clientBtns[1].cls.split(/\s+/).includes('ghost') && !clientBtns[1].cls.split(/\s+/).includes('m-btn'), 'Import Notes on Clients is the quieter button after it');

const salesLeads = importButtons(await page('leads', sales));
const salesClients = importButtons(await page('contacts', sales));
ok(salesLeads.length === 0 && salesClients.length === 0 && !(await page('leads', sales)).includes('data-import-btn') && !(await page('contacts', sales)).includes('Import Notes'), 'someone who is not an admin does not see either import button');

const companies = await page('accounts', admin);
ok(importButtons(companies).length === 0 && !companies.includes('data-import-btn') && !companies.includes('#/crm/import/'), 'Companies has no import button');

const importApi = { listCrmImports: async () => [], mode: 'mock' };
const routes = [
  ['leads', undefined, 'leads:records', 'Import Leads', '#/crm/import/leads/notes', 'Import Notes instead'],
  ['leads', 'notes', 'leads:notes', 'Import Notes (on Leads)', '#/crm/import/leads', 'Import Leads instead'],
  ['contacts', undefined, 'contacts:records', 'Import Clients', '#/crm/import/contacts/notes', 'Import Notes instead'],
  ['contacts', 'notes', 'contacts:notes', 'Import Notes (on Clients)', '#/crm/import/contacts', 'Import Clients instead'],
];
for (const [id, sub, attr, title, otherHref, otherText] of routes) {
  const view = await importPage({ api: importApi, me: admin, params: { section: 'import', id, sub }, owners: [], cfg }, { tabs, head });
  const body = toText(view.body);
  const other = body.match(/<a\b[^>]*data-import-other[^>]*>[^<]*<\/a>/);
  ok(view.title === title && body.includes(`data-import="${attr}"`) && other && other[0].includes(`href="${otherHref}"`) && other[0].includes(otherText), `${title} stays on ${attr}`);
}

const denied = await importPage({ api: importApi, me: sales, params: { section: 'import', id: 'leads' }, owners: [], cfg }, { tabs, head });
const deniedBody = toText(denied.body);
ok(deniedBody.includes('data-import-denied') && !deniedBody.includes('data-import-file') && !deniedBody.includes('data-import-btn='), 'someone who is not an admin still cannot open the import screen to upload');

console.log(fail ? fail + ' failed' : 'crm import buttons passed');
if (fail) process.exit(1);
