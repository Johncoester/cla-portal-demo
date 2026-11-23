/* RPT-1 (John, Nov 22 2026): file columns on the CRM report builder's Deals report.
 * John's daily pre-closing report needs the processor, the source of business with a phone and email, and each agent with a phone and email.
 * The Deals report had none of them. They are report columns only: the Deals list and its column picker do not change. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { reportFields, moduleFields, FILE_REPORT_FIELDS, FILE_REPORT_KEYS, withFileColumns, runReport } from '../js/data/crm-analytics.js';
import { STAGES } from '../js/data/constants.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ---- the field list ----
const rf = reportFields('deals', [], null).map((f) => f.key); const lf = moduleFields('deals', null).map((f) => f.key);
ok(['processorName', 'sourceOfBusiness', 'sourceContactName', 'sourceCompany', 'sourcePhone', 'sourceEmail', 'buyerAgentName', 'buyerAgentPhone', 'buyerAgentEmail', 'listingAgentName', 'listingAgentPhone', 'listingAgentEmail', 'state', 'fileStep', 'buyerNames', 'sellerNames'].every((k) => rf.includes(k)),
  'a Deals report offers the processor, the source of business with phone and email, both agents with phone and email, state, file step, buyer and seller');
ok(FILE_REPORT_KEYS.every((k) => !lf.includes(k)) && new Set(rf).size === rf.length && FILE_REPORT_FIELDS.length === 23, 'the 23 file columns are on reports only, not on the Deals list or its column picker, and no column is listed twice');
ok(!reportFields('contacts', [], null).some((f) => f.key === 'processorName') && !reportFields('contacts', ['deals'], null).some((f) => f.key === 'deals.processorName'), 'other report types are unchanged');

// ---- merging a row with its file columns ----
const merged = withFileColumns({ id: 'd1', fileNumber: 'MD-26-1', lenderName: '' }, { id: 'd1', stageNo: 5, processorName: 'Pat Processor', lenderName: 'Test Lender Bank', contractDate: '2026-06-01', sourcePhone: '301-555-0101' }, STAGES);
ok(merged.fileStep === 'Processing' && merged.processorName === 'Pat Processor' && merged.lenderName === 'Test Lender Bank' && merged.contractDate === '2026-06-01' && merged.listingAgentEmail === '' && merged.fileNumber === 'MD-26-1', 'a row gets its file columns; the step number becomes the step name; a missing value is blank');
const bare = withFileColumns({ id: 'd2', lenderName: 'Kept Bank' }, undefined, STAGES);
ok(bare.processorName === '' && bare.fileStep === '' && bare.contractDate === null && bare.lenderName === 'Kept Bank', 'a file with no extra row still reports, with blank file columns');

// ---- through the demo portal ----
const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true, crm: true } });
const users = await api.listDevUsers(); const admin = users.find((u) => u.role === 'Super admin') || users.find((u) => u.isAdmin); const proc = users.find((u) => u.role === 'Processor');
await api.signInDev(admin.id);
const deal = await api.createDeal({ street: '77 Report Column Test Rd', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-06-01', closingDate: '2026-07-15', purchasePrice: '500,000', loanAmount: '400,000', lenderName: 'Test Lender Bank' });
const mk = async (firstName, lastName, extra) => (await api.createContact({ firstName, lastName, ...extra })).id;
const buyer = await mk('Testy', 'Buyerman', { email: 'rpt1.testy.buyerman@example.test' });
const seller = await mk('Sally', 'Sellerton', { email: 'rpt1.sally.sellerton@example.test' });
const bAgent = await mk('Bo', 'Buyeragent', { email: 'rpt1.bo@agents.example.test', phone: '301-555-0100', mobile: '240-555-0111', company: 'Test Buyer Realty' });
const lAgent = await mk('Lisa', 'Listing', { email: 'rpt1.lisa@agents.example.test', phone: '301-555-0200', company: 'Test Listing Realty' });
await api.addParticipant(deal.id, buyer, 'Client-Buyer'); await api.addParticipant(deal.id, seller, 'Client-Seller');
await api.addParticipant(deal.id, bAgent, 'Buyer Agent'); await api.addParticipant(deal.id, lAgent, 'Listing Agent');
await api.updateDeal(deal.id, { processorId: proc.id, sourceOfBusiness: 'listing_agent:' + lAgent });
const cols = ['fileNumber', 'openDate', 'closingDate', 'county', 'propertyAddress', 'state', 'processorName', 'fileStep', 'buyerNames', 'sellerNames', 'sourceOfBusiness', 'sourceContactName', 'sourceCompany', 'sourcePhone', 'sourceEmail',
  'buyerAgentName', 'buyerAgentCompany', 'buyerAgentPhone', 'buyerAgentEmail', 'listingAgentName', 'listingAgentCompany', 'listingAgentPhone', 'listingAgentEmail', 'lenderName'];
const out = await api.runCrmReport({ module: 'deals', name: 'Pre-closing', columns: cols, filters: [{ field: 'fileNumber', op: 'is', value: deal.fileNumber }] });
const line = (out.rows || []).map((r) => Object.fromEntries(r.cells.map((c) => [c.key, c.text])))[0] || {};
ok(out.total === 1 && out.columns.length === cols.length, 'the report runs with all ' + cols.length + ' chosen columns and finds the file');
const procName = proc.name || `${proc.firstName || ''} ${proc.lastName || ''}`.trim();
ok(line.processorName === procName && line.state === 'MD' && line.fileStep === 'Opened' && line.buyerNames === 'Testy Buyerman' && line.sellerNames === 'Sally Sellerton', 'processor, state, file step, buyer and seller are filled');
ok(line.buyerAgentName === 'Bo Buyeragent' && line.buyerAgentCompany === 'Test Buyer Realty' && line.buyerAgentPhone === '301-555-0100' && line.buyerAgentEmail === 'rpt1.bo@agents.example.test', 'the buyer agent shows name, company, phone and email');
ok(line.listingAgentName === 'Lisa Listing' && line.listingAgentPhone === '301-555-0200' && line.listingAgentEmail === 'rpt1.lisa@agents.example.test', 'the listing agent shows name, phone and email');
ok(/Listing agent/.test(line.sourceOfBusiness) && line.sourceContactName === 'Lisa Listing' && line.sourceCompany === 'Test Listing Realty' && line.sourcePhone === '301-555-0200' && line.sourceEmail === 'rpt1.lisa@agents.example.test', 'the source of business shows who sent the file, with company, phone and email');
// filters and grouping use the new columns like any other
const byProc = await api.runCrmReport({ module: 'deals', name: 'By processor', columns: ['fileNumber'], filters: [{ field: 'processorName', op: 'contains', value: procName.split(' ').pop() }] });
ok(byProc.total >= 1 && byProc.rows.some((r) => r.cells[0].text === deal.fileNumber), 'a report can filter on the processor');
const grouped = await api.runCrmReport({ module: 'deals', name: 'Grouped', columns: ['fileNumber'], rowGroups: ['processorName'] });
ok(Array.isArray(grouped.groups) && grouped.groups.some((g) => g.label === procName), 'a report can group by processor');
// a saved report keeps the columns
const saved = await api.createCrmReport({ name: 'RPT-1 saved', module: 'deals', columns: ['fileNumber', 'processorName', 'listingAgentEmail'] });
const again = await api.runCrmReport(saved.id);
ok(again.columns.map((c) => c.key).join() === 'fileNumber,processorName,listingAgentEmail', 'a saved report keeps its file columns');
// the Deals list itself is unchanged
const list = await api.listCrmDeals({ status: 'All' });
ok(list.length > 0 && !('processorName' in list[0]) && !('listingAgentEmail' in list[0]), 'the Deals list does not load the file columns');

// ---- a Sales Person still sees only their own files ----
const sales = users.find((u) => u.role === 'Sales Person');
if (sales) { await api.signInDev(sales.id); const mine = await api.runCrmReport({ module: 'deals', name: 'Mine', columns: ['fileNumber', 'processorName'] });
  ok(!mine.rows.some((r) => r.cells[0].text === deal.fileNumber), 'a Sales Person who is not on the file does not get it, or its processor and agents, in a report'); }

// ---- hosted side ----
const hosted = read('../js/data/supabase-crm-surface.js'); const sql = read('../supabase/migrations/20261129010000_crm_deal_report_fields.sql');
ok(hosted.includes("sb.rpc('crm_deal_report_fields')") && hosted.includes('withFileColumns(r, by.get(r.id), STAGES)') && hosted.includes('await reportRowsOf(def.module, def);'), 'the hosted report read loads the file columns once per run and merges them by file');
ok(/catch \(e\) \{ return null; \}/.test(hosted) && hosted.includes('are not on this database yet'), 'if the database file is not applied yet the report still runs and says the file columns are blank');
ok(!/rowsOf = async \(module\) => \{[^}]*crm_deal_report_fields/.test(hosted), 'lists, search and dashboards do not make the extra read');
ok(sql.includes('if not private.crm_user() then raise exception') && sql.includes('where private.crm_deal_visible(g.id)') && sql.includes('revoke all on function public.crm_deal_report_fields() from public, anon;'), 'the database function is staff-only, returns only files the person may see, and is closed to the public');
ok((sql.match(/coalesce\(nullif\(btrim\(c\.mobile\), ''\), c\.phone, ''\) as phone/g) || []).length === 3, 'on the database the phone is the mobile when there is one, else the phone, for both agents and the source contact');
ok(!/create or replace|alter table|drop /i.test(sql.replace(/--.*$/gm, '')), 'the database file adds one function and changes nothing that exists');
const keys = [...sql.matchAll(/'([A-Za-z]+)', /g)].map((m) => m[1]);
ok(FILE_REPORT_KEYS.filter((k) => k !== 'fileStep').every((k) => keys.includes(k)) && keys.includes('stageNo') && keys.includes('id'), 'the database function returns every file column the report offers');
ok(read('../js/pages/crm-reports.js').includes('data-report-notice'), 'the report page shows the notice');

console.log(fail ? fail + ' failed' : 'file report columns passed');
process.exit(fail ? 1 : 0);
