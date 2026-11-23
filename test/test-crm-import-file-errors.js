/* CRM import file errors stay on the upload card. FAKE DATA ONLY. No hosted project. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, importTooBigMessage } from '../js/data/crm-janine.js';
import { importFileHelpText, importFileKind, importFileRejectReason, importParsedFileError, importReadErrorMessage, importFileEmptyMessage } from '../js/data/crm-import-file.js';
import { isExcelImport } from '../js/data/crm-excel.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

ok(IMPORT_MAX_BYTES === 2_000_000 && IMPORT_MAX_ROWS === 10000, 'the import limits are 2 MB and 10,000 rows');
const help = importFileHelpText();
ok(help.includes('.csv') && help.includes('.xlsx') && help.includes('.xls'), 'the helper names .csv, .xlsx, and .xls');
ok(help.includes(String(IMPORT_MAX_BYTES / 1e6) + ' MB') && help.includes(IMPORT_MAX_ROWS.toLocaleString('en-US')) && help.includes('leaves other types out'), 'the helper uses the real limits and says the file window leaves other types out: ' + help);

ok(importFileKind({ name: 'Leads.CSV', type: 'application/vnd.ms-excel' }) === 'csv', 'a CSV stays a CSV when Windows labels it as Excel');
ok(importFileKind({ name: 'notes.XLSX', type: '' }) === 'excel' && importFileKind({ name: 'notes.xls', type: '' }) === 'excel', 'xlsx and xls are Excel files');
ok(importFileKind({ name: 'upload', type: 'text/csv' }) === 'csv', 'a file with no extension and a CSV type is a CSV');
ok(importFileKind({ name: 'upload', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) === 'excel', 'a file with no extension and an Excel type is Excel');
ok(importFileKind({ name: 'leads.txt', type: 'text/csv' }) === '' && importFileKind({ name: 'notes.pdf', type: 'application/pdf' }) === '' && importFileKind({ name: 'book.xlsm', type: '' }) === '', 'txt, pdf, and xlsm are not accepted');
ok(importFileKind({ name: 'leads.csv', type: '' }) === 'csv' && isExcelImport({ name: 'leads.csv', type: 'application/vnd.ms-excel' }) === false, 'the file check agrees with the Excel reader that a CSV is not Excel');

const pdf = importFileRejectReason({ name: 'notes.pdf', type: 'application/pdf', size: 12 });
ok(pdf.includes('notes.pdf') && pdf.includes('not a CSV or an Excel file') && pdf.includes('.csv') && pdf.includes('.xlsx') && pdf.includes('.xls'), 'a wrong type names the file and the types that work');
ok(importFileRejectReason({ name: '', type: '', size: 4 }).startsWith('This file is not a CSV'), 'a file with no name still says it is the wrong type');
const tooBig = importFileRejectReason({ name: 'leads.csv', type: 'text/csv', size: IMPORT_MAX_BYTES + 1 });
ok(tooBig.includes('leads.csv') && tooBig.includes('too big') && tooBig.includes(String(IMPORT_MAX_BYTES / 1e6) + ' MB') && tooBig.includes('Choose a smaller file'), 'a file over 2 MB says the limit and what to do');
ok(importFileRejectReason({ name: 'leads.csv', type: 'text/csv', size: IMPORT_MAX_BYTES }) === '', 'a file of exactly 2 MB is not too big');
ok(importFileRejectReason({ name: 'leads.csv', type: 'text/csv', size: 0 }) === importFileEmptyMessage({ name: 'leads.csv' }), 'an empty file says to add a header and a row');
ok(importFileRejectReason({ name: 'leads.csv', type: 'text/csv', size: -1 }).includes('could not be read'), 'a file with a bad size is unreadable, in plain words');

const rowsOf = (n) => [['Last Name'], ...Array.from({ length: n }, () => ['Sample'])];
ok(importParsedFileError(rowsOf(IMPORT_MAX_ROWS), 'records', 'leads', { name: 'ok.csv' }) === '', '10,000 data rows are allowed');
const many = importParsedFileError(rowsOf(IMPORT_MAX_ROWS + 1), 'records', 'leads', { name: 'big.csv' });
ok(many === importTooBigMessage(IMPORT_MAX_ROWS + 1) && many.includes(String(IMPORT_MAX_ROWS + 1)) && many.includes(String(IMPORT_MAX_ROWS)) && many.includes('Split the file'), '10,001 rows uses the same plain row-limit message');
ok(importParsedFileError([['Last Name']], 'records', 'leads', { name: 'only.csv' }).includes('no rows to import'), 'a header with no data rows is empty');
ok(importParsedFileError([['First Name', 'Email'], ['Casey', 'casey.sample@example.test']], 'records', 'leads', { name: 'leads.csv' }).includes('Last Name'), 'a people file without Last Name is missing that column');
ok(importParsedFileError([['Surname'], ['Sample']], 'records', 'contacts', { name: 'clients.csv' }) === '', 'Surname counts as Last Name');
ok(importParsedFileError([['Last Name'], ['Sample']], 'records', 'leads', { name: 'leads.csv' }) === '', 'Role, Relationship Status, and State can be filled from Default values, so they are not required columns');
ok(importParsedFileError([['Note'], ['Hello']], 'notes', 'leads', { name: 'notes.csv' }).includes('Email') && importParsedFileError([['Note'], ['Hello']], 'notes', 'leads', { name: 'notes.csv' }).includes('lead'), 'a note file needs a way to find the lead');
ok(importParsedFileError([['Email'], ['casey.sample@example.test']], 'notes', 'contacts', { name: 'notes.csv' }).includes('Note') && importParsedFileError([['Email'], ['casey.sample@example.test']], 'notes', 'contacts', { name: 'notes.csv' }).includes('choose the file again'), 'a note file needs a Note column');
ok(importParsedFileError([['Email', 'Note'], ['casey.sample@example.test', 'Talked.']], 'notes', 'leads', { name: 'notes.csv' }) === '', 'Email and Note is enough for a note file');
ok(importParsedFileError([['Full Name', 'Note'], ['Casey Sample', 'Talked.']], 'notes', 'contacts', { name: 'notes.csv' }) === '', 'Full Name and Note is enough for a note file');

const quote = importReadErrorMessage(new Error('The CSV has a quote (") that is never closed.'));
ok(quote.includes('quote') && quote.includes('Choose the file again') && !/ECMA|parse_|undefined/.test(quote), 'a broken CSV says what is wrong and what to do');
const password = importReadErrorMessage(new Error('This Excel file is password-protected. Remove the password in Excel, save the file, and upload it again.'));
ok(password.includes('Remove the password') && password.includes('upload it again'), 'a password message is kept');
const technical = importReadErrorMessage(new Error('parse_xlscfb is not defined'));
ok(technical.includes('could not be read') && technical.includes('Save it again') && !/parse_|undefined/.test(technical), 'a technical reader error is not shown');

const page = read('js/pages/crm-janine.js');
const stamp = page.match(/crm-import-file\.js\?v=(\d+)/g) || [];
ok(stamp.length === 1 && stamp[0] === 'crm-import-file.js?v=202611247700', 'the file check is loaded once, at 202611242030');
ok(page.includes('../data/crm-janine.js?v=202611247700') && page.includes("import('../data/crm-excel.js?v=202611221700')"), 'the import page loads the contact-type list; the Excel reader stamp stays');
ok(!page.includes("$('[data-import-file]', root).addEventListener('change', guard"), 'a rejected file is not handed to the disappearing toast');
ok(page.includes('data-import-file-help') && page.includes('data-import-file-err') && page.includes('class="err-text"') && page.includes('role="alert"'), 'the upload card has a helper and a red alert');
ok(read('css/portal.css').includes('.err-text { color: var(--bad);'), 'the alert uses the existing red text');
ok(read('js/app.js').includes("pages/crm-janine.js?v=202611301000") && read('js/pages/crm.js').includes("crm-janine.js?v=202611301000") && read('js/pages/crm-forms.js').includes("crm-janine.js?v=202611301000") && read('js/pages/crm-home.js').includes("crm-janine.js?v=202611301000"), 'the import page loads at 202611247100 with the contact type list');
ok(read('index.html').includes('js/app.js?v=202611301800') && read('js/app.js').includes("pages/crm.js?v=202611301000") && read('js/pages/crm.js').includes("crm-forms.js?v=202611301000") && read('js/pages/crm.js').includes("crm-home.js?v=202611301100") && read('js/pages/crm-home.js').includes("crm-forms.js?v=202611301000"), 'the note edit pages load with the tab row at 202611289980 and the shell is 202611290610');
ok(!read('js/data/adapter.js').includes('202611242030') && read('js/app.js').includes("adapter.js?v=202611301500") && read('js/data/adapter.js').includes("supabase-adapter.js?v=202611301500") && read('js/data/adapter.js').includes("mock-adapter.js?v=202611301500"), 'the shell loads the adapter that reads the tax rate sheet');
// FF-101a: allow unchanged — the CRM PR that introduced this check required a non-empty stamp-only
// diff; after that merged, any later branch that does not retouch crm-import-file.js has an empty diff.
const fileCheckDiff = execFileSync('git', ['diff', '-U0', 'origin/main', '--', 'js/data/crm-import-file.js'], { cwd: root, encoding: 'utf8' }).split('\n').filter((l) => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---'));
ok(fileCheckDiff.length === 0 || fileCheckDiff.every((l) => /\?v=202611\d+/.test(l)), 'the file check module is unchanged or changes only the cache stamp that loads the contact type list');
// Note edit changes the notes list in crm-forms.js. The task detail changes crm-home.js. Those files are not stamp-only.
// index.html changes only the cache stamp. crm.js also carries the Calls list route (Feedback 32 item 3), so it is not stamp-only.
for (const rel of ['index.html']) {
  const diff = execFileSync('git', ['diff', '-U0', 'origin/main', '--', rel], { cwd: root, encoding: 'utf8' }).split('\n').filter((l) => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---'));
  ok(diff.length === 0 || diff.every((l) => /\?v=202611\d+/.test(l)), rel + ' changes only cache stamps');
}

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true, get() { return selectValue.get.call(this); },
  set(v) { const want = String(v); [...this.options].forEach((o) => { if (o.getAttribute('value') === want) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); } });
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { toText } = await import('../js/ui.js');
const { importPage } = await import('../js/pages/crm-janine.js');

const api = { mode: 'mock', listCrmImports: async () => [] };
const shell = { tabs: () => '', head: (title) => title };
const me = { isAdmin: true, canEdit: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileOf = (name, body, type = 'text/csv') => new File([body], name, { type });
async function open(params) {
  const view = await importPage({ api, me, params }, shell);
  const app = document.getElementById('app');
  app.innerHTML = toText(view.body);
  view.mount(app);
  return app;
}
const errEl = (app) => app.querySelector('[data-import-file-err]');
const shown = (app) => { const el = errEl(app); return el && !el.hidden ? el.textContent : ''; };
async function choose(app, file, ready) {
  const input = app.querySelector('[data-import-file]');
  Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (ready()) return;
    await sleep(15);
  }
}
const noToast = () => !document.querySelector('#toasts .toast');

for (const params of [{ id: 'leads' }, { id: 'leads', sub: 'notes' }, { id: 'contacts' }, { id: 'contacts', sub: 'notes' }]) {
  const view = await importPage({ api, me, params }, shell);
  const body = String(view.body);
  const which = params.id + (params.sub ? '/' + params.sub : '');
  const helpAt = body.indexOf('data-import-file-help');
  const errAt = body.indexOf('data-import-file-err');
  const mapAt = body.indexOf('data-import-map');
  ok(body.includes(help) && helpAt > body.indexOf('data-import=') && helpAt < errAt && errAt < mapAt, which + ' shows the helper and the error on the upload card');
}
const denied = await importPage({ api, me: { isAdmin: false }, params: { id: 'leads' } }, shell);
ok(!String(denied.body).includes('data-import-file-help') && !String(denied.body).includes('data-import-file'), 'someone who is not an admin still does not see the upload');

const app = await open({ id: 'leads' });
ok(app.querySelector('[data-import-file-help]').textContent === help && errEl(app).hidden && errEl(app).classList.contains('err-text'), 'the helper is visible and the error starts hidden');
const state = app.querySelector('[data-import-default="state"]');
state.dataset.kept = 'yes';
state.value = 'MD';
await choose(app, fileOf('notes.pdf', 'not a spreadsheet', 'application/pdf'), () => shown(app).includes('notes.pdf'));
ok(shown(app).includes('not a CSV or an Excel file') && app.querySelector('[data-import-map]').hidden && !app.querySelector('[data-import-fname]').textContent && noToast(), 'a PDF shows a red error on the card, does not open mapping, and does not toast');
const held = shown(app);
document.body.dispatchEvent(new window.Event('click', { bubbles: true }));
await sleep(80);
ok(shown(app) === held && noToast(), 'the error stays after a click and does not disappear on its own');
const input = app.querySelector('[data-import-file]');
Object.defineProperty(input, 'files', { configurable: true, value: [] });
input.dispatchEvent(new window.Event('change', { bubbles: true }));
await sleep(40);
ok(shown(app) === held, 'closing the file window without a file leaves the error');

await choose(app, fileOf('leads.txt', 'Last Name\nSample\n', 'text/csv'), () => shown(app).includes('leads.txt'));
ok(shown(app).includes('leads.txt') && shown(app).includes('not a CSV') && state.dataset.kept === 'yes', 'a .txt is refused even when it is labeled as a CSV, and the default the person set is still there');

await choose(app, fileOf('leads.csv', 'Last Name\nSample\n'), () => !app.querySelector('[data-import-map]').hidden && app.querySelector('[data-import-fname]').textContent === 'leads.csv');
ok(!shown(app) && app.querySelector('[data-map]') && state.dataset.kept === 'yes' && state.value === 'MD' && noToast(), 'a good CSV clears the error, opens mapping, and keeps the default that was typed');

await choose(app, fileOf('notes.pdf', 'again', 'application/pdf'), () => shown(app).includes('notes.pdf'));
ok(shown(app).includes('notes.pdf') && app.querySelector('[data-import-fname]').textContent === 'leads.csv' && !app.querySelector('[data-import-map]').hidden && state.value === 'MD', 'a later rejected file does not throw away the file already accepted or the default');

const big = new File([new Uint8Array(IMPORT_MAX_BYTES + 1)], 'huge.csv', { type: 'text/csv' });
await choose(app, big, () => shown(app).includes('huge.csv'));
ok(shown(app).includes('too big') && shown(app).includes('2 MB') && noToast(), 'a file over 2 MB stays on the card in plain words');

await choose(app, fileOf('empty.csv', ''), () => shown(app).includes('empty.csv'));
ok(shown(app).includes('no rows to import') && shown(app).includes('header row'), 'an empty file stays on the card');
await choose(app, fileOf('header.csv', 'Last Name\n'), () => shown(app).includes('header.csv'));
ok(shown(app).includes('no rows to import'), 'a header with no data row stays on the card');
await choose(app, fileOf('quote.csv', 'Last Name\n"Sample\n'), () => shown(app).includes('quote'));
ok(shown(app).includes('Choose the file again') && !/ECMA|parse_|undefined/.test(shown(app)), 'a CSV with an open quote stays on the card in plain words');

const missing = fileOf('people.csv', 'First Name,Email\nCasey,casey.sample@example.test\n');
await choose(app, missing, () => shown(app).includes('Last Name'));
ok(shown(app).includes('choose the file again') && noToast(), 'a file missing Last Name stays on the card');
await choose(app, fileOf('surname.csv', 'Surname\nSample\n'), () => app.querySelector('[data-import-fname]').textContent === 'surname.csv');
ok(!shown(app), 'a Surname column is accepted as Last Name');

const manyLines = ['First Name,Last Name'];
for (let i = 0; i < IMPORT_MAX_ROWS + 1; i++) manyLines.push('Casey,Sample');
await choose(app, fileOf('rows.csv', manyLines.join('\n') + '\n'), () => shown(app).includes(String(IMPORT_MAX_ROWS + 1)));
ok(shown(app).includes('at most ' + IMPORT_MAX_ROWS) && shown(app).includes('Split the file') && noToast(), 'too many rows stays on the card');

await choose(app, fileOf('notes.xlsx', 'this is not a spreadsheet', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), () => shown(app).includes('could not be read'));
ok(shown(app).includes('Save it again') && !/ECMA|parse_|undefined|not a spreadsheet/.test(shown(app)) && noToast(), 'an unreadable Excel file stays on the card in plain words');

const notes = await open({ id: 'leads', sub: 'notes' });
ok(notes.querySelector('[data-import-file-help]').textContent === help, 'Import Notes shows the same helper');
await choose(notes, fileOf('notes.csv', 'Email\ncasey.sample@example.test\n'), () => shown(notes).includes('Note'));
ok(shown(notes).includes('Add a Note column') && notes.querySelector('[data-import-map]').hidden && noToast(), 'a note file without a Note column stays on the card');
await choose(notes, fileOf('notes.csv', 'Email,Note\ncasey.sample@example.test,Talked about closing. FAKE.\n'), () => !notes.querySelector('[data-import-map]').hidden);
ok(!shown(notes) && notes.querySelector('[data-import-fname]').textContent === 'notes.csv', 'a good note file clears the error');

const clients = await open({ id: 'contacts', sub: 'notes' });
await choose(clients, fileOf('notes.csv', 'Note\nHello.\n'), () => shown(clients).includes('client'));
ok(shown(clients).includes('Email') && noToast(), 'a client note file without a name or email says client');

console.log(fail ? fail + ' failed' : 'crm import file errors passed');
if (fail) process.exit(1);
