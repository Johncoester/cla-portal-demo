/* CRM record open on the hosted adapter. Fake client only. No network and no database. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { crmSupabase } from '../js/data/supabase-crm.js';
import { CRM_OFF } from '../js/data/features.js';
import { toText } from '../js/ui.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const local = mem(); const session = mem();
window.localStorage = local; window.sessionStorage = session;
globalThis.window = window; globalThis.document = document;
globalThis.localStorage = local; globalThis.sessionStorage = session;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
let hash = '#/crm/deals';
const location = {
  get hash() { return hash; },
  set hash(v) { hash = String(v); },
  search: '', pathname: '/', href: 'http://localhost/',
};
window.location = location; globalThis.location = location;
window.history = { replaceState() {} }; globalThis.history = window.history;

const NativeForm = globalThis.FormData;
globalThis.FormData = class extends NativeForm {
  constructor(form) {
    super();
    if (form && form.querySelectorAll) form.querySelectorAll('[name]').forEach((el) => { if (!el.disabled) this.append(el.name, el.value || ''); });
  }
};
const nameForms = (root) => { root.querySelectorAll('form').forEach((f) => { f.querySelectorAll('[name]').forEach((el) => { f[el.name] = el; }); }); };
const paint = (view) => { const host = document.getElementById('app'); host.innerHTML = toText(view.body); nameForms(host); if (view.mount) view.mount(host); return host; };

const { dealsPage } = await import('../js/pages/crm-deals.js');
const { render } = await import('../js/pages/crm.js');
const { pipelinePage } = await import('../js/pages/crm-more.js');

const DEAL = '81c35d28-8563-4801-b46e-79aa9313dc9b';
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let fail = 0;
const check = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const okFn = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
const camel = (o) => (Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o);

function client(store) {
  const calls = [];
  const from = (table) => {
    const q = { table, filters: [] };
    const run = () => {
      calls.push({ op: 'from', table, filters: q.filters.slice() });
      const data = store({ op: 'from', table, filters: q.filters });
      const error = data && data.__error ? { message: data.__error } : null;
      return Promise.resolve({ data: error ? null : data, error });
    };
    const api = { select() { return api; }, eq(k, v) { q.filters.push([k, v]); return api; }, order() { return api; }, then(res, rej) { return run().then(res, rej); } };
    return api;
  };
  const sb = { from, calls, rpc: async (name, args) => { calls.push({ op: 'rpc', name, args }); const data = store({ op: 'rpc', name, args }); const error = data && data.__error ? { message: data.__error } : null; return { data: error ? null : data, error }; } };
  return { sb, calls };
}

const dealRow = { id: DEAL, name: 'MD-26-97215 1 Main St', fileNumber: 'MD-26-97215', propertyAddress: '1 Main St', amount: 250000, loanAmount: null, stage: 'Active', status: 'Open', closingDate: '2026-12-01', openDate: '2026-11-01', ownerName: 'Sam Sales', salesReps: 'Sam Sales', transactionType: 'Purchase', clientName: 'Ada Buyer', contactName: 'Riley Agent' };
const contacts = [
  { role: 'Client-Buyer', first_name: 'Ada', last_name: 'Buyer', email: 'ada@example.test', contact_id: 'c1', contact_hidden: false },
  { role: 'Buyer Agent', first_name: 'Hidden', last_name: 'Agent', email: 'secret@example.test', contact_id: 'c2', contact_hidden: true, removed: true },
];

function hosted(extra = {}) {
  const { sb, calls } = client((q) => {
    if (q.op === 'rpc' && q.name === 'crm_deals') return [dealRow, { id: OTHER, name: 'Other', fileNumber: 'MD-1', clientName: '', contactName: '' }];
    if (q.op === 'rpc' && q.name === 'deal_contacts') return extra.contactsError ? { __error: 'deal_contacts refused' } : contacts;
    if (q.op === 'from' && q.table === 'crm_emails') return extra.emailRows || { __error: 'relation crm_emails does not exist' };
    return [];
  });
  const me = async () => ({ id: 'u-sales', role: 'Sales Person', isAdmin: false, email: 'sam@example.test', firstName: 'Sam', lastName: 'Sales', ...(extra.user || {}) });
  const api = crmSupabase({ sb, ok: okFn, camel, me, flags: { crm: extra.crm === false ? false : true } });
  return { api, calls, me };
}

const off = hosted({ crm: false });
let offMsg = '';
try { await off.api.getCrmDeal(DEAL); } catch (e) { offMsg = e.message; }
check(offMsg === CRM_OFF && off.calls.length === 0, 'the CRM flag refuses the deal read before any query');

const { api, calls } = hosted();
const who = await api.crmMe();
check(who.scope === 'own' && who.canEdit === true && who.id === 'u-sales', 'crmMe runs for a sales person');
const proc = crmSupabase({ sb: hosted().calls && client(() => []).sb, ok: okFn, camel, me: async () => ({ id: 'u-proc', role: 'Processor', isAdmin: false, email: 'p@example.test', firstName: 'Pat', lastName: 'Proc' }), flags: { crm: true } });
let procMsg = '';
try { await proc.crmMe(); } catch (e) { procMsg = e.message; }
check(procMsg === 'The CRM is for CLA staff only.', 'a processor is not a CRM user');

const opened = await api.getCrmDeal(DEAL);
check(opened.fileNumber === 'MD-26-97215' && opened._portalLink === `#/deals/${DEAL}` && opened._link === `#/crm/deals/${DEAL}`, 'the deal detail uses the list row and the portal order link');
check(opened.people.length === 1 && opened.people[0].name === 'Ada Buyer' && opened.people[0].email === 'ada@example.test' && opened.people[0].link === '#/crm/contacts/c1', 'people come from one deal_contacts call');
check(opened.emails.length === 0, 'a missing email table does not fail the deal');
const dealRpcs = calls.filter((c) => c.op === 'rpc' && c.name === 'crm_deals');
const contactRpcs = calls.filter((c) => c.op === 'rpc' && c.name === 'deal_contacts');
check(dealRpcs.length === 1 && dealRpcs[0].args.p_status === 'All' && contactRpcs.length === 1 && contactRpcs[0].args.p_deal === DEAL, 'opening one deal is one list read and one contacts read');
check(calls.filter((c) => c.op === 'from').every((c) => c.table === 'crm_emails') && calls.filter((c) => c.op === 'rpc').every((c) => c.name === 'crm_deals' || c.name === 'deal_contacts'), 'the open path does not call a per-row access helper');

let missing = '';
try { await api.getCrmDeal('missing-deal'); } catch (e) { missing = e.message; }
check(missing === 'Deal not found.', 'a deal outside the CRM list is refused');
check(calls.filter((c) => c.op === 'rpc' && c.name === 'deal_contacts').length === 1, 'a missing deal does not read contacts');

const fallback = hosted({ contactsError: true });
const fb = await fallback.api.getCrmDeal(DEAL);
check(fb.people.length === 2 && fb.people[0].name === 'Ada Buyer' && fb.people[1].name === 'Riley Agent', 'names already on the list row stand in when contacts fail');

const mailed = hosted({ emailRows: [{ id: 'em1', from_email: 'sam@example.test', to_emails: ['ada@example.test'], cc_emails: [], bcc_emails: [], subject: 'Hello', body_html: '<p>Hi</p>', status: 'drafted', scheduled_at: null, created_at: '2026-11-01T00:00:00Z' }] });
const withMail = await mailed.api.getCrmDeal(DEAL);
check(withMail.emails.length === 1 && withMail.emails[0].to[0] === 'ada@example.test' && withMail.emails[0].statusLabel === 'Drafted (not sent)', 'a saved draft is listed and still not sent');
check((await mailed.api.listCrmEmails('nope', 'x')).length === 0, 'an unknown record type has no email list');
check((await api.noteCrmRecent('deal', DEAL)).ok === true && calls.filter((c) => c.op !== 'rpc' && c.op !== 'from').length === 0, 'a recent-item note does not write');

const staff = { id: 'u-sales', role: 'Sales Person', isAdmin: false, canEdit: true, canConfigure: false, name: 'Sam Sales', email: 'sam@example.test' };
const detailApi = hosted();
detailApi.api.getCrmDealDisbursement = async () => { throw new Error('relation deal_disbursements does not exist'); };
delete detailApi.api.noteCrmRecent;
const broken = await dealsPage({ api: detailApi.api, me: staff, params: { id: DEAL, section: 'deals' }, refresh() {} });
const brokenHtml = toText(broken.body);
check(brokenHtml.includes('data-deal-summary') && brokenHtml.includes('MD-26-97215') && brokenHtml.includes(`href="#/deals/${DEAL}"`) && brokenHtml.includes('data-new-task') === false, 'the deal page opens when disbursement storage and recent notes are missing');
check(brokenHtml.includes('Ada Buyer') && brokenHtml.includes('ada@example.test'), 'the opened deal shows the person on the file');

const shaped = await dealsPage({ api: { getCrmDeal: async () => ({ ...opened, emails: [] }), getCrmDealDisbursement: async () => ({ values: { actualRevenue: 10 }, canEdit: false, history: [] }) }, me: staff, params: { id: DEAL }, refresh() {} });
const shapedHtml = toText(shaped.body);
check(shapedHtml.includes('data-disb="actualRevenue"') && shapedHtml.includes('$10.00'), 'nested disbursement values still show on the deal');

const listApi = {
  listCrmDealFilters: async () => ({ scope: 'own', me: { id: 'u-sales' }, statuses: ['Open', 'Closed', 'On Hold', 'Cancelled', 'All'], owners: [], clients: [], sources: [] }),
  listCrmDeals: async () => [{ ...dealRow, _link: `#/crm/deals/${DEAL}`, _portalLink: `#/deals/${DEAL}`, sourceText: '', propertyAddress: '1 Main St' }],
  listCrmViews: async () => [],
  listCrmSavedFilters: async () => [],
};
hash = '#/crm/deals';
const list = await dealsPage({ api: listApi, me: staff, params: { section: 'deals' }, refresh() {} });
const host = paint(list);
const nameLink = host.querySelector(`[data-open="${DEAL}"]`);
const click = new window.Event('click', { bubbles: true, cancelable: true });
nameLink.dispatchEvent(click);
check(nameLink.getAttribute('href') === `#/crm/deals/${DEAL}` && click.defaultPrevented === false, 'the deal name is a real link to the CRM deal');
host.querySelector('td[data-col="stage"]').click();
check(location.hash === `#/crm/deals/${DEAL}`, 'clicking another cell on the deal row opens that deal');
host.querySelector('td[data-col="clientName"]').click();
check(location.hash === `#/crm/deals/${DEAL}`, 'a client name that is not its own link still opens the deal');

const blank = (extra) => ({ id: 'rec-1', name: 'Ada Buyer', ownerName: 'Sam', email: 'ada@example.test', phone: '', company: 'Harbor', activities: [], invitedMeetings: [], attachments: [], links: {}, archived: false, ...extra });
const shell = (over) => ({
  crmMe: async () => staff,
  listCrmOwners: async () => [],
  listCrmAssignees: async () => [],
  getCrmSettings: async () => ({ customFields: [] }),
  listCrmViews: async () => [],
  listCrmSavedFilters: async () => [],
  listCrmAccounts: async () => [],
  listCrmEmails: async () => { throw new Error('relation crm_emails does not exist'); },
  ...over,
});
async function openRecord(section, record, lists) {
  const view = await render({ api: shell({ ...lists, [`getCrm${section === 'leads' ? 'Lead' : section === 'contacts' ? 'Contact' : 'Account'}`]: async () => record }), params: { section, id: record.id }, refresh() {}, go() {} });
  return toText(view.body);
}
const leadHtml = await openRecord('leads', blank({ relationshipStatus: 'Prospecting', leadSource: '', converted: false }), { listCrmLeads: async () => [blank()] });
check(leadHtml.includes('data-lead="rec-1"') && leadHtml.includes('data-new-task') && leadHtml.includes('data-no-emails'), 'a lead opens and can take a task when the email list fails and recent notes are absent');
const clientHtml = await openRecord('contacts', blank({ salesReps: [], tags: [], orders: [], totals: { orders: 0, open: 0, closed: 0, cancelled: 0, volume: 0 }, opportunities: [], accountId: null, company: 'Harbor', hasLogin: false }), { listCrmContacts: async () => [blank()] });
check(clientHtml.includes('data-contact="rec-1"') && clientHtml.includes('data-new-task'), 'a client opens and can take a task on the same path');
const companyHtml = await openRecord('accounts', { id: 'co-1', name: 'Harbor Realty', kind: 'brokerage', phone: '', website: '', city: '', state: 'MD', notes: '', ownerName: 'Sam', archived: false, contactList: [], orders: [], totals: { orders: 0, open: 0, closed: 0, cancelled: 0, volume: 0 }, opportunities: [], activities: [], invitedMeetings: [], attachments: [] }, { listCrmAccounts: async () => [{ id: 'co-1', name: 'Harbor Realty', archived: false }] });
check(companyHtml.includes('data-account="co-1"') && companyHtml.includes('data-new-task'), 'a company opens and can take a task on the same path');

hash = '#/crm/leads';
const leadList = await render({ api: shell({ listCrmLeads: async () => [blank()] }), params: { section: 'leads' }, refresh() {}, go() {} });
paint(leadList);
const leadName = host.querySelector('[data-open="rec-1"]');
check(leadName && leadName.getAttribute('href') === '#/crm/leads/rec-1', 'a lead name links to the lead record');
host.querySelector('#crm-t-leads td[data-col="email"]').click();
check(location.hash === '#/crm/leads/rec-1', 'clicking another lead cell opens the lead');

const clientRow = blank({ companyName: 'Harbor', company: 'Harbor', orders: 0, volume: 0, salesReps: [], tags: [] });
hash = '#/crm/contacts';
paint(await render({ api: shell({ listCrmContacts: async () => [clientRow] }), params: { section: 'contacts' }, refresh() {}, go() {} }));
check(host.querySelector('[data-open="rec-1"]').getAttribute('href') === '#/crm/contacts/rec-1', 'a client name links to the client record');
host.querySelector('#crm-t-contacts td[data-col="email"]').click();
check(location.hash === '#/crm/contacts/rec-1', 'clicking another client cell opens the client');

const companyRow = { id: 'co-1', name: 'Harbor Realty', kind: 'brokerage', place: 'Rockville, MD', city: 'Rockville', state: 'MD', ownerName: 'Sam', contacts: 0, orders: 0, volume: 0, archived: false };
hash = '#/crm/accounts';
paint(await render({ api: shell({ listCrmAccounts: async () => [companyRow] }), params: { section: 'accounts' }, refresh() {}, go() {} }));
check(host.querySelector('[data-open="co-1"]').getAttribute('href') === '#/crm/accounts/co-1', 'a company name links to the company record');
host.querySelector('#crm-t-accounts td[data-col="contacts"]').click();
check(location.hash === '#/crm/accounts/co-1', 'clicking another company cell opens the company');

hash = '#/crm/pipeline';
const pipe = await pipelinePage({ api: shell({ listCrmContacts: async () => [], listCrmOpportunities: async () => [{ id: 'opp-1', name: 'Harbor referral', stage: 'New', ownerName: 'Sam', accountName: 'Harbor', contactName: 'Ada', estVolume: 1, archived: false, ownerId: 'u-sales' }] }), me: staff, owners: [{ id: 'u-sales', name: 'Sam Sales', role: 'Sales Person' }], cfg: { customFields: [], picklists: { oppStage: [{ value: 'New', label: 'New', retired: false }] } }, refresh() {}, go() {} });
const pipeHtml = toText(pipe.body);
check(pipeHtml.includes('<strong>Harbor referral</strong>') && !pipeHtml.includes('#/crm/opportunities/') && !pipeHtml.includes('data-open="opp-1"'), 'an opportunity has no record route; its name is not a broken open link');

console.log(fail ? `${fail} failed` : 'crm deal open passed');
if (fail) process.exit(1);
