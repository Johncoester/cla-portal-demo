/* FF-097: staff edit the settlement date and the disbursement date on the file header.
 * Fake rows only. The buyer's "+ Propose a closing time" still does not change the file date. */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toText } from '../js/ui.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { disbursementFor } from '../js/data/disbursement.js';
import { fileDatesHtml, fileDateCanEdit, closingDatePatch, disbursementDatePatch, datesSaved } from '../js/pages/file-dates.js';
import { render as schedulingPage } from '../js/pages/dealclosing.js';
import { prorationsView } from '../js/pages/dealaccounting-prorations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const boom = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

const purchase = { id: 'deal-2', transactionType: 'Purchase', closingDate: '2026-12-02', disbursementDate: '' };
const paint = (user, deal = purchase, extra = {}) => toText(fileDatesHtml(deal, { canEdit: fileDateCanEdit(user, extra) }));
for (const user of [
  { role: 'Processor' },
  { role: 'Preprocessor' },
  { role: 'Admin', isAdmin: true },
  { role: 'Super admin', isAdmin: true },
]) {
  const html = paint(user);
  ok(html.includes('data-oh-edit="closing"') && html.includes('data-oh-edit="disbursement"') && html.includes('value="2026-12-02"') && html.includes('Settlement date') && html.includes('Disbursement date'), `${user.role} can edit both dates on the file header`);
}
ok(!paint({ role: 'Processor' }, purchase, { demoLocked: true }).includes('data-oh-edit'), 'demo view keeps both dates read-only');
for (const user of [
  { role: 'Sales Person' },
  { role: 'Sales Team' },
  { role: 'Transaction Coordinator' },
  { role: 'Outside user' },
  { role: 'Client-Buyer', accountRole: 'Outside user' },
  { role: 'Client-Seller', accountRole: 'Outside user' },
  { role: 'Buyer Agent', accountRole: 'Outside user' },
  { role: 'Listing Agent', accountRole: 'Outside user' },
]) {
  const html = paint(user);
  ok(!html.includes('data-oh-edit') && !html.includes('<input') && html.includes('data-oh-closing') && html.includes('12/02/2026') && html.includes('data-oh-disbursement-date'), `${user.role} sees both dates and cannot edit them`);
}
ok(boom(() => closingDatePatch('13/40/2026')).includes('settlement date') && !/42501|P0001/.test(boom(() => closingDatePatch('nope'))), 'a bad settlement date says to enter a real date or clear it');
ok(closingDatePatch('').closingDate === '' && closingDatePatch('2026-06-15').closingDate === '2026-06-15', 'a blank settlement date clears it and a real date is kept');
const refi = { transactionType: 'Refinance', closingDate: '2026-12-01' };
const autoRefi = disbursementFor(refi).date;
ok(disbursementDatePatch(refi, autoRefi).disbursementDate === '' && disbursementDatePatch(refi, '2026-12-01').disbursementDate === '2026-12-01', 'a refinance disbursement that matches the automatic date stays blank, and a different date is stored');
ok(datesSaved({ closingDate: null, disbursementDate: null }, { closingDate: '', disbursementDate: '' }) === '', 'a cleared date counts as saved');
ok(datesSaved({ closingDate: '2026-01-01' }, { closingDate: '2026-06-15' }).includes('settlement date was not saved'), 'a date that did not stick tells the person to reload');

const storage = mem();
const session = mem();
const open = () => createMockAdapter({ storage, sessionStorage: session, features: { accounting: true } });
let api = open();
await api.signInDev('u-proc');
const first = await api.updateDeal('deal-2', closingDatePatch('2026-12-20'));
ok(!datesSaved(first, { closingDate: '2026-12-20' }) && first.closingDate === '2026-12-20', 'the processor save keeps the settlement date');
api = open();
await api.signInDev('u-proc');
let deal = await api.getDeal('deal-2');
ok(deal.closingDate === '2026-12-20', 'the settlement date is still there after a new read');
const board = await api.loadDashboard({ fileStatus: 'All', includeTasks: true });
ok(board.openRows.some((row) => row.id === 'deal-2' && row.closingDate === '2026-12-20'), 'Open Orders reads the saved settlement date');
ok(board.tasks.some((t) => t.dealId === 'deal-2' && t.deal && t.deal.closingDate === '2026-12-20'), 'tasks read the saved settlement date from the file');
const sched = toText((await schedulingPage({ api, user: { id: 'u-proc', role: 'Processor', isAdmin: false }, deal, refresh() {} })).body);
ok(sched.includes('12/20/2026'), 'Scheduling Details shows the saved settlement date');
const proration = { item: 'countyTaxes', cycle: 'annual', cycleAmount: '3650', periodStart: '2026-01-01', basis: '365', status: 'unpaid', debitedTo: 'buyer' };
await api.addAccountingFee('deal-2', { kind: 'credit', altaSection: 'prorations', description: 'County taxes', proration });
let acc = await api.getAccounting('deal-2');
const before = acc.entries.find((e) => e.proration);
ok(acc.closingDate === '2026-12-20' && before && before.prorationLive && before.prorationLive.settlementDate === '2026-12-20', 'Accounting reads the settlement date into the proration');
const beforeAmount = before.amount;
await api.updateDeal('deal-2', closingDatePatch('2026-06-15'));
acc = await api.getAccounting('deal-2');
const after = acc.entries.find((e) => e.proration);
ok(acc.closingDate === '2026-06-15' && after.prorationLive.settlementDate === '2026-06-15' && after.amount !== beforeAmount, 'a new settlement date changes the proration');
const prorationHtml = toText((await prorationsView(api, await api.getDeal('deal-2'), acc, '#/deals/deal-2/accounting')).body);
ok(prorationHtml.includes('06/15/2026'), 'the Prorations page shows the saved settlement date');
const custom = await api.updateDeal('deal-2', disbursementDatePatch(await api.getDeal('deal-2'), '2026-06-18'));
ok(custom.disbursementDate === '2026-06-18', 'a disbursement date that is not the automatic date is stored');
api = open();
await api.signInDev('u-proc');
deal = await api.getDeal('deal-2');
ok(deal.disbursementDate === '2026-06-18' && disbursementFor(deal).source === 'set', 'the disbursement date is still there after a new read');
const cleared = await api.updateDeal('deal-2', disbursementDatePatch(deal, '2026-06-15'));
ok(!cleared.disbursementDate && disbursementFor(cleared).date === '2026-06-15' && disbursementFor(cleared).source === 'auto', 'clearing the disbursement date returns to the automatic date');
await api.signInDev('u-buyer');
const prior = (await api.getDeal('deal-1')).closingDate;
await api.proposeClosing('deal-1', { at: '2027-02-02T15:00', location: 'CLA Title office' });
ok((await api.getDeal('deal-1')).closingDate === prior, 'a buyer proposing a closing time does not change the file settlement date');
await api.signInDev('u-sp');
const denied = await api.updateDeal('deal-2', { closingDate: '2026-08-01' }).then(() => '', (e) => e.message);
ok(/Processor or Admin/.test(denied), 'a sales person cannot save the settlement date');
await api.signInDev('u-bagent');
const agentDenied = await api.updateDeal('deal-2', { closingDate: '2026-08-02' }).then(() => '', (e) => e.message);
ok(/Processor or Admin/.test(agentDenied), 'an agent cannot save the settlement date');
await api.signInDev('u-proc');
ok((await api.getDeal('deal-2')).closingDate === '2026-06-15', 'the refused saves left the settlement date alone');

const app = readFileSync(path.join(root, 'js/app.js'), 'utf8');
const schedSrc = readFileSync(path.join(root, 'js/data/scheduling-details.js'), 'utf8');
ok(app.includes('fileDatesHtml(deal, { canEdit })') && app.includes('mountFileDates(root'), 'the file header paints and saves the two dates');
ok(schedSrc.includes('That lock is held for a later change'), 'the held buyer-date lock is unchanged');
const migrations = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort();
let guard = '';
for (const name of migrations) {
  const text = readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
  if (/function private\.deals_schedule_guard\(\)/.test(text)) guard = text;
}
const body = (guard.split(/function private\.deals_schedule_guard\(\)/)[1] || '').split('$$')[1] || '';
ok(body.includes('sched_buyer_date') && !/closing_date|disbursement_date/.test(body), 'the schedule guard still blocks scheduling columns and not the two dates');
ok(!migrations.some((name) => name.startsWith('20261125150000')), 'this item adds no database file');

console.log(fail ? fail + ' failed' : 'file overview dates passed');
if (fail) process.exit(1);
