/* CRM Feedback 39: Search Results record name is a link, and it shows the full name.
 * Fake client only. No network. The same client also times the search reads. */
import { readFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { crmSupabase } from '../js/data/supabase-crm.js';
import { toText } from '../js/ui.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const camel = (o) => (Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o);
const unwrap = (r) => { if (r && r.error) throw new Error(r.error.message); return r ? r.data : r; };

const LEAD = { id: 'lead-1', first_name: 'Brendan', last_name: 'Gallagher', company: 'Bay Realty', email: 'brendan.gallagher@example.test', phone: '3015550102', mobile: '', source: 'Website', owner_id: 'u-own', archived_at: null };
const CONTACT = { id: '68', name: 'Gallagher', firstName: 'Brendan', lastName: 'Gallagher', email: 'brendan.gallagher@example.test', phone: '3015550199', companyName: 'Bay Realty' };
const NICK = { id: '70', name: 'Patty Agent', firstName: 'Pat', lastName: 'Agent', email: 'pat.agent@example.test', phone: '', companyName: '' };
const ACCOUNT = { id: 'acct-1', name: 'Gallagher Title', phone: '3015550100', website: 'https://example.test', owner_id: 'u-own', ownerName: 'Ada Admin' };
const DEAL = { id: 'deal-1', name: 'MD-1 1 Main St, Rockville, MD 20850', propertyAddress: '1 Main St, Rockville, MD 20850', fileNumber: 'MD-1', stage: 'Open', status: 'Open', amount: 250000, clientName: 'Brendan Gallagher', contactName: 'Pat Agent' };
const TASK = { id: 'task-1', kind: 'task', subject: 'Follow up', entity: 'contact', entity_id: '68', owner_id: 'u-own', due_date: '2026-12-01', status: 'Not Started', priority: 'Normal' };
const MEETING = { id: 'meet-1', kind: 'meeting', subject: 'Gallagher intro', entity: 'contact', entity_id: '68', owner_id: 'u-own', host_id: 'u-own', starts_at: '2026-12-01T15:00', ends_at: '2026-12-01T15:30' };
const CALL = { id: 'call-1', kind: 'call', subject: 'Gallagher voicemail', entity: 'lead', entity_id: 'lead-1', owner_id: 'u-own', call_type: 'Outbound', call_start: '2026-12-01T09:00', call_duration: 5 };

function client({ delay = 0 } = {}) {
  const calls = [];
  let inflight = 0;
  let maxInflight = 0;
  const pause = () => new Promise((resolve) => {
    inflight += 1;
    maxInflight = Math.max(maxInflight, inflight);
    setTimeout(() => { inflight -= 1; resolve(); }, delay);
  });
  const from = (table) => {
    const q = { table, cols: '*', filters: [] };
    const run = async () => {
      await pause();
      calls.push({ op: 'from', table, cols: q.cols, filters: q.filters.map((f) => f.join(':')) });
      if (table === 'crm_leads') return [LEAD];
      if (table === 'crm_activities') {
        let rows = [TASK, MEETING, CALL];
        for (const f of q.filters) {
          if (f[0] === 'eq' && f[1] === 'kind') rows = rows.filter((r) => r.kind === f[2]);
          if (f[0] === 'in' && f[1] === 'kind') rows = rows.filter((r) => f[2].includes(r.kind));
          if (f[0] === 'eq' && f[1] === 'entity') rows = rows.filter((r) => r.entity === f[2]);
        }
        return rows;
      }
      if (table === 'contacts') return [{ id: '68', first_name: 'Brendan', last_name: 'Gallagher' }];
      if (table === 'crm_accounts') return [{ id: 'acct-1', name: 'Gallagher Title' }];
      if (table === 'deals') return [{ id: 'deal-1', street: '1 Main St', city: 'Rockville', state: 'MD', zip: '20850' }];
      return [];
    };
    const api = {
      select(cols) { q.cols = cols || '*'; return api; },
      eq(k, v) { q.filters.push(['eq', k, v]); return api; },
      in(k, v) { q.filters.push(['in', k, v]); return api; },
      order() { return api; },
      then(res, rej) { return run().then((data) => ({ data, error: null })).then(res, rej); },
    };
    return api;
  };
  const sb = {
    from,
    rpc: async (name) => {
      await pause();
      calls.push({ op: 'rpc', name });
      const data = {
        crm_owners: [{ id: 'u-own', name: 'Ada Admin', role: 'Admin' }],
        crm_assignees: [{ id: 'u-own', name: 'Ada Admin', role: 'Admin' }],
        crm_contact_list: [CONTACT, NICK],
        crm_account_list: [ACCOUNT],
        crm_deals: [DEAL],
      };
      return { data: data[name] || [], error: null };
    },
  };
  return { sb, calls, stats: () => ({ maxInflight, callCount: calls.length }) };
}

function apiFrom(opts) {
  const made = client(opts);
  const me = async () => ({ id: 'u-admin', role: 'Admin', isAdmin: true, email: 'ada@example.test', firstName: 'Ada', lastName: 'Admin' });
  const api = crmSupabase({ sb: made.sb, ok: unwrap, camel, me, flags: { crm: true } });
  return { api, calls: made.calls, stats: made.stats };
}

const { api, calls, stats } = apiFrom({ delay: 40 });
const t0 = Date.now();
const found = await api.searchCrm('gallagher');
const ms = Date.now() - t0;
const speed = stats();
const firstReads = calls.slice();
const group = (m) => found.groups.find((g) => g.module === m);
const rowOf = (m) => (group(m) && group(m).rows[0]) || {};

ok(rowOf('contacts').title === 'Brendan Gallagher' && rowOf('contacts').cells.name === 'Brendan Gallagher', 'a client stored as the last name shows Brendan Gallagher');
ok(rowOf('contacts').link === '#/crm/contacts/68' && rowOf('contacts').links.name === '#/crm/contacts/68', 'the client link is the same address the suggestion uses');
ok(rowOf('leads').title === 'Brendan Gallagher' && rowOf('leads').link === '#/crm/leads/lead-1' && rowOf('leads').links.name === rowOf('leads').link, 'a lead shows the full name and opens #/crm/leads/<id>');
ok(rowOf('accounts').title === 'Gallagher Title' && rowOf('accounts').cells.name === 'Gallagher Title' && rowOf('accounts').link === '#/crm/accounts/acct-1', 'a company keeps its own name and opens #/crm/accounts/<id>');
ok(rowOf('deals').title === '1 Main St, Rockville, MD 20850' && rowOf('deals').link === '#/crm/deals/deal-1' && rowOf('deals').links.name === rowOf('deals').link, 'a deal shows the property address and opens #/crm/deals/<id>');
ok(rowOf('tasks').cells.subject === 'Follow up' && rowOf('tasks').link === '#/crm/tasks/task-1' && rowOf('tasks').links.subject === rowOf('tasks').link, 'a task subject opens #/crm/tasks/<id>');
ok(rowOf('meetings').cells.subject === 'Gallagher intro' && rowOf('meetings').link === '#/crm/meetings/meet-1', 'a meeting title opens #/crm/meetings/<id>');
ok(rowOf('calls').cells.subject === 'Gallagher voicemail' && rowOf('calls').link === '#/crm/calls/call-1', 'a call subject opens #/crm/calls/<id>');

const nick = await api.searchCrm('patty');
const nickRow = (nick.groups.find((g) => g.module === 'contacts') || { rows: [] }).rows.find((r) => r.id === '70');
ok(nickRow && nickRow.cells.name === 'Patty Agent' && nickRow.link === '#/crm/contacts/70', 'a name that is already more than the first and last name is left as it is');

const { searchPage } = await import('../js/pages/crm-search.js');
const view = await searchPage({
  api: { searchCrm: (q, opts) => api.searchCrm(q, opts), getCrmSearchColumns: async () => ({}) },
  params: { id: 'gallagher', section: 'search' },
  me: { id: 'u-admin', name: 'Ada Admin', role: 'Admin', canConfigure: true, canEdit: true },
  refresh() {},
});
const { document } = parseHTML('<!doctype html><body>' + toText(view.body) + '</body>');
const anchor = (module, col) => document.querySelector('[data-search-group="' + module + '"] [data-col="' + col + '"] a');
const expectLink = (module, col, href, text) => {
  const a = anchor(module, col);
  ok(!!a && a.getAttribute('href') === href && a.textContent.replace(/\s+/g, ' ').includes(text), module + ' ' + col + ' is a link to ' + href + ' reading ' + text + (a ? ' (got ' + a.getAttribute('href') + ' / ' + a.textContent + ')' : ' (no link)'));
};
expectLink('contacts', 'name', '#/crm/contacts/68', 'Brendan Gallagher');
expectLink('leads', 'name', '#/crm/leads/lead-1', 'Brendan Gallagher');
expectLink('accounts', 'name', '#/crm/accounts/acct-1', 'Gallagher Title');
expectLink('deals', 'name', '#/crm/deals/deal-1', '1 Main St, Rockville, MD 20850');
expectLink('tasks', 'subject', '#/crm/tasks/task-1', 'Follow up');
expectLink('meetings', 'subject', '#/crm/meetings/meet-1', 'Gallagher intro');
expectLink('calls', 'subject', '#/crm/calls/call-1', 'Gallagher voicemail');

const one = apiFrom({ delay: 0 });
const only = await one.api.searchCrm('gallagher', { module: 'contacts' });
ok(only.groups.length === 1 && only.groups[0].module === 'contacts' && only.groups[0].rows[0].cells.name === 'Brendan Gallagher', 'choosing Clients searches only clients');
ok(!one.calls.some((c) => c.table === 'crm_leads' || c.name === 'crm_deals' || c.name === 'crm_owners'), 'a Clients-only search does not read leads, deals, or owners');

const blank = apiFrom({ delay: 0 });
const none = await blank.api.searchCrm('   ');
ok(none.groups.length === 0 && blank.calls.length === 0, 'a blank search does not read the database');

const star = firstReads.filter((c) => c.op === 'from' && c.cols === '*');
const activityScans = firstReads.filter((c) => c.table === 'crm_activities' && String(c.cols).includes('occurred_on'));
const activityReads = firstReads.filter((c) => c.table === 'crm_activities');
ok(star.length === 0, 'search does not select every column');
ok(activityScans.length === 0, 'search does not read last-activity rows');
ok(activityReads.length === 1, 'tasks, meetings and calls share one activity read (' + activityReads.length + ')');
ok(speed.maxInflight >= 5, 'module reads run together (in flight ' + speed.maxInflight + ')');
ok(ms < 250, 'with a 40ms delay per read, all modules finish in ' + ms + 'ms');
ok(speed.callCount <= 10, 'the all-modules search uses ' + speed.callCount + ' reads');
console.log('search-speed', JSON.stringify({ ms, ...speed, before: { ms: 566, maxInflight: 1, callCount: 14, note: 'same 40ms delay, measured on the previous sequential search' } }));

const src = readFileSync(new URL('../js/pages/crm-search.js', import.meta.url), 'utf8');
ok(src.includes('setTimeout(quick, 200)'), 'the header box still waits 200ms after a keystroke before it searches');

console.log(fail ? fail + ' failed' : 'crm search result links passed');
if (fail) process.exit(1);
