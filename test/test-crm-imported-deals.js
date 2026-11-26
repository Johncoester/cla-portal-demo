/* CRM-FEED-1 imported Zoho deals on the hosted adapter and the Deals pages. Fake client only. No network and no database. */
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

/* CRM-FEED-1: portal orders are the CRM deals; Zoho deals Janine imports link to the matching order. Fake data only.
 * The match rules themselves are checked on a disposable local Postgres by test/test-crm-feed-sql.sh. */
import { readFileSync } from 'node:fs';
const { dealsPage, importedDealName } = await import('../js/pages/crm-deals.js');
const { dealImportPage, dealImportResultCell } = await import('../js/pages/crm-deal-import.js');
const { mergeImportedDeals, importedStatusOf, runDealImportChunks, DEAL_IMPORT_FIELDS, DEAL_IMPORT_CHUNK } = await import('../js/data/crm-imported-deals.js');
const { guessMapping } = await import('../js/data/crm-janine.js');

let fail = 0;
const check = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const okFn = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
const camel = (o) => (Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o);

const D1 = '20000000-0000-4000-8000-000000000001';
const D2 = '20000000-0000-4000-8000-000000000002';
const order = (id, file, extra = {}) => ({ id, fileNumber: file, propertyAddress: `${file} street`, name: '', status: 'Open', stage: 'Opened', clientName: 'Ann Test', ...extra });
const imp = (id, extra = {}) => ({ id, dealId: null, zohoId: 'Z' + id, name: 'Zoho ' + id, fileNumber: '', propertyAddress: '1 Nowhere Ln, Miami, FL', clientName: 'Pat Zoho', amount: 1000, stage: 'Qualification', matchStatus: 'unmatched', matchNote: 'No portal order matches.', ...extra });

// ---------- merge ----------
const rows = [order(D1, 'FL-26-1000'), order(D2, 'FL-26-1001')];
const imported = [imp('a', { dealId: D1, matchStatus: 'linked', matchNote: 'Linked to order FL-26-1000 by file number.' }), imp('b'), imp('c', { matchStatus: 'ambiguous', matchNote: 'More than one portal order.' }), imp('d', { stage: 'Closed Won' }),
  imp('e', { dealId: '20000000-0000-4000-8000-0000000000ee', matchStatus: 'linked' })];
const merged = mergeImportedDeals(rows, imported, { status: 'Open' });
check(merged.length === 4, 'Open: two orders + two open unlinked Zoho deals (linked one is not a second row; closed one filtered)');
check(merged[0].id === D1 && merged[0].zoho && merged[0].zoho.zohoId === 'Za', 'a linked Zoho deal adds its fields to the order row (no duplicate)');
check(!merged.some((r) => r.id === 'zoho:a'), 'linked Zoho deal never shows as its own row');
check(!merged.some((r) => r.id === 'zoho:e'), 'a Zoho deal linked to an order this person cannot see is not shown at all');
check(merged.find((r) => r.id === 'zoho:b').imported === true && merged.find((r) => r.id === 'zoho:b').ambiguous === false, 'no match: shown as its own CRM deal');
check(merged.find((r) => r.id === 'zoho:c').ambiguous === true, 'ambiguous: shown once, flagged needs review');
check(mergeImportedDeals(rows, imported, { status: 'All' }).length === 5, 'All shows the closed Zoho deal too');
check(mergeImportedDeals([], imported, { status: 'Closed' }).map((r) => r.id).join() === 'zoho:d', 'Closed: Zoho "Closed Won" maps to Closed');
check(mergeImportedDeals(rows, imported, { status: 'All', ownerId: 'u1' }).length === 2, 'an owner filter hides unlinked Zoho deals (no portal owner)');
check(mergeImportedDeals(rows, [], {}) === rows, 'nothing imported: the order list is returned unchanged');
check(importedStatusOf('Closed Lost') === 'Cancelled' && importedStatusOf('On Hold') === 'On Hold' && importedStatusOf('Funded') === 'Closed' && importedStatusOf('') === 'Open', 'Zoho stage words map to order statuses');

// ---------- chunks ----------
const seen = [];
const chunkCall = async (a) => { seen.push(a); return { importId: 'imp-1', rows: a.p_rows.map((_, i) => ({ line: i + 1, status: 'ok', match: 'unmatched' })), counts: { total: a.p_rows.length, created: a.p_rows.length, linked: 1, ambiguous: 0, duplicates: 0, errors: 0 } }; };
const big = await runDealImportChunks(chunkCall, Array.from({ length: DEAL_IMPORT_CHUNK + 3 }, (_, i) => ({ fileNumber: 'F' + i })), true, 'z.csv');
check(seen.length === 2 && seen[0].p_rows.length === DEAL_IMPORT_CHUNK && seen[1].p_rows.length === 3, 'rows go to the server 500 at a time');
check(seen[0].p_import === null && seen[1].p_import === 'imp-1' && seen.every((a) => a.p_commit === true && a.p_file_name === 'z.csv'), 'later chunks carry the first import id');
check(big.rows.length === DEAL_IMPORT_CHUNK + 3 && big.rows[DEAL_IMPORT_CHUNK].line === DEAL_IMPORT_CHUNK + 1 && big.counts.linked === 2 && big.counts.total === DEAL_IMPORT_CHUNK + 3, 'lines are file-wide and counts add up');

// ---------- Zoho headers ----------
const g = guessMapping(['Record Id', 'Deal Name', 'File Number', 'Property Address', 'City', 'State', 'Zip Code', 'Contact Name', 'Email', 'Amount', 'Stage', 'Closing Date', 'Deal Owner'], DEAL_IMPORT_FIELDS);
check(g.join() === 'zohoId,name,fileNumber,street,city,state,zip,clientName,clientEmail,amount,stage,closingDate,ownerName', 'Zoho Deals export headers map without manual picking');

// ---------- hosted adapter ----------
function hosted({ listError = false } = {}) {
  const calls = [];
  const sb = {
    rpc: async (name, args) => { calls.push({ name, args });
      if (name === 'crm_deals') return { data: rows.map((r) => ({ ...r })), error: null };
      if (name === 'crm_imported_deals_list') return listError ? { data: null, error: { message: 'function public.crm_imported_deals_list() does not exist' } } : { data: imported, error: null };
      if (name === 'crm_import_deals') return { data: { importId: 'i', rows: [{ line: 1, status: 'ok', match: 'linked', dealId: D1, fileNumber: 'FL-26-1000' }], counts: { total: 1, created: 1, linked: 1, ambiguous: 0, duplicates: 0, errors: 0 } }, error: null };
      return { data: [], error: null }; },
    from: () => { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, then: (res) => Promise.resolve({ data: [], error: null }).then(res) }; return q; },
  };
  const me = async () => ({ id: 'u-admin', role: 'Admin', isAdmin: true, email: 'a@example.test', firstName: 'A', lastName: 'D' });
  return { api: crmSupabase({ sb, ok: okFn, camel, me, flags: { crm: true } }), calls };
}
const h = hosted();
const listed = await h.api.listCrmDeals({ status: 'Open' });
check(h.calls.filter((c) => c.name === 'crm_deals').length === 1 && h.calls.filter((c) => c.name === 'crm_imported_deals_list').length === 1, 'the Deals list is one orders call + one imported-deals call');
check(listed.length === 4 && listed[0]._link === `#/crm/deals/${D1}` && listed[0].zoho, 'hosted list merges the Zoho deals');
const h2 = hosted({ listError: true });
const before = await h2.api.listCrmDeals({ status: 'Open' });
check(before.length === 2 && before.every((r) => !r.imported), 'before the migration is applied the list is the orders alone (no error)');
const pv = await h.api.previewCrmDealImport({ records: [{ fileNumber: 'FL-26-1000' }], fileName: 'z.csv' });
const pvCall = h.calls.find((c) => c.name === 'crm_import_deals');
check(pvCall.args.p_commit === false && pv.counts.linked === 1, 'preview calls crm_import_deals with p_commit false');
await h.api.runCrmDealImport({ records: [{ fileNumber: 'FL-26-1000' }], fileName: 'z.csv' });
check(h.calls.filter((c) => c.name === 'crm_import_deals').pop().args.p_commit === true, 'import calls crm_import_deals with p_commit true');

// ---------- pages ----------
const staff = { id: 'u-admin', role: 'Admin', isAdmin: true, canEdit: true, name: 'A D', email: 'a@example.test' };
const kit = { tabs: () => '', head: (t) => `<h1>${t}</h1>` };
const denied = await dealImportPage({ api: {}, me: { ...staff, isAdmin: false } }, kit);
check(toText(denied.body).includes('data-import-denied'), 'Deals import is Admin / Super admin only');
const pg = await dealImportPage({ api: { mode: 'supabase' }, me: staff }, kit);
const pgHtml = toText(pg.body);
check(pgHtml.includes('data-deal-import-rule') && pgHtml.includes('file number') && pgHtml.includes('property address and the client') && pgHtml.includes('data-import-test-banner'), 'the import page states the match rule and the TEST banner');
check(toText(dealImportResultCell({ status: 'ok', match: 'linked', dealId: D1, fileNumber: 'FL-26-1000', message: 'm' })).includes(`#/crm/deals/${D1}`), 'a linked preview row links to the order');
check(toText(dealImportResultCell({ status: 'ok', match: 'ambiguous', message: 'm' })).includes('Needs review'), 'an ambiguous preview row says Needs review');
check(toText(dealImportResultCell({ status: 'duplicate', message: 'Already imported. Skipped.' })).includes('Duplicate'), 'a re-run row says Duplicate');
check(toText(importedDealName({ id: 'zoho:c', name: 'x', propertyAddress: '1 Nowhere', ambiguous: true })).includes('needs review') && !toText(importedDealName({ id: 'zoho:c', propertyAddress: '1' })).includes('data-open'), 'an imported row has a Zoho pill and no open link');

const listApi = {
  listCrmDealFilters: async () => ({ scope: 'all', me: { id: 'u-admin' }, statuses: ['Open', 'Closed', 'On Hold', 'Cancelled', 'All'], owners: [], clients: [], sources: [] }),
  listCrmDeals: async () => listed.map((r) => ({ ...r, sourceText: r.sourceText || '' })),
  listCrmViews: async () => [], listCrmSavedFilters: async () => [],
};
hash = '#/crm/deals';
const lp = await dealsPage({ api: listApi, me: staff, params: { section: 'deals' }, refresh() {} });
const host = paint(lp);
check(!!host.querySelector('[data-deal-import-link]'), 'an admin sees Import Zoho deals on the Deals list');
check(!!host.querySelector('[data-zoho-linked]') && !!host.querySelector('[data-imported-flag="ambiguous"]') && !!host.querySelector('[data-imported-flag="unmatched"]'), 'the list marks linked, unmatched and needs-review Zoho deals');
check(!host.querySelector('[data-bulk-row][value^="zoho:"]'), 'an imported row cannot be bulk-selected (it is not a portal order)');
hash = '#/crm/deals';
const tr = host.querySelector('tr[data-row="zoho:b"] td:last-child');
if (tr) tr.dispatchEvent(new window.Event('click', { bubbles: true }));
check(hash === '#/crm/deals', 'clicking an imported row does not open a missing order');

// ---------- migration text ----------
const mig = readFileSync(new URL('../supabase/migrations/20261131100000_crm_portal_deal_feed.sql', import.meta.url), 'utf8');
const rb = readFileSync(new URL('../supabase/rollbacks/20261131100000_crm_portal_deal_feed.sql', import.meta.url), 'utf8');
check(/set local lock_timeout = '3s'/.test(mig) && /set local lock_timeout = '3s'/.test(rb), 'migration and rollback set lock_timeout 3s');
check(!/create or replace/i.test(mig) && !/create policy|alter policy|drop policy/i.test(mig), 'the migration replaces nothing and adds no RLS policy');
const fns = [...mig.matchAll(/create function ([a-z_.]+)\(/g)].map((m) => m[1]);
check(fns.length === 8 && fns.every((f) => rb.includes(`drop function if exists ${f}(`)), 'every new function is dropped by the rollback');
check(fns.every((f) => new RegExp(`create function ${f.replace('.', '\\.')}\\([^]*?set search_path = pg_catalog`).test(mig)), 'every new function pins search_path');
check(fns.every((f) => new RegExp(`revoke all on function ${f.replace('.', '\\.')}\\([^)]*\\) from public, anon`).test(mig)), 'every new function is revoked from public and anon');
check(/exception when others then\s+raise warning 'CRM imported-deal link skipped/.test(mig), 'the order triggers swallow a CRM failure');
check(!/private\.crm_deal_visible|private\.can_access_deal/.test(mig.replace(/^--.*$/gm, '')), 'no per-row access helper in the new SQL');
check(['zz_crm_imported_deal_party', 'zz_crm_imported_deal_relink', 'zz_crm_imported_deal_link', 'deals_crm_addr_key_idx', 'public.crm_imported_deals;'].every((x) => rb.includes(x)), 'rollback drops the triggers, the index and the table');

console.log(fail ? `${fail} FAILED` : 'crm imported deals passed');
process.exit(fail ? 1 : 0);
