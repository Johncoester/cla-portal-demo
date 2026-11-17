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
ok(stamp.length === 1 && stamp[0] === 'crm-import-file.js?v=202611242030', 'the file check is loaded once, at 202611242030');
ok(page.includes('../data/crm-janine.js?v=202611101600') && page.includes("import('../data/crm-excel.js?v=202611221700')"), 'the existing CRM stamps stay as they are');
ok(!page.includes("$('[data-import-file]', root).addEventListener('change', guard"), 'a rejected file is not handed to the disappearing toast');
ok(page.includes('data-import-file-help') && page.includes('data-import-file-err') && page.includes('class="err-text"') && page.includes('role="alert"'), 'the upload card has a helper and a red alert');
ok(read('css/portal.css').includes('.err-text { color: var(--bad);'), 'the alert uses the existing red text');
ok(read('js/app.js').includes("pages/crm-janine.js?v=202611242290") && read('js/pages/crm.js').includes("crm-janine.js?v=202611242290") && read('js/pages/crm-forms.js').includes("crm-janine.js?v=202611242290") && read('js/pages/crm-home.js').includes("crm-janine.js?v=202611242290"), 'the import page stays at main\'s stamp');
ok(read('index.html').includes('js/app.js?v=202611242860') && read('js/app.js').includes("pages/crm.js?v=202611242290") && read('js/pages/crm.js').includes("crm-forms.js?v=202611242290") && read('js/pages/crm.js').includes("crm-home.js?v=202611242290") && read('js/pages/crm-home.js').includes("crm-forms.js?v=202611242290"), 'the CRM pages stay on main\'s stamp and the shell is 202611242860');
ok(!read('js/data/adapter.js').includes('202611242030') && read('js/app.js').includes("adapter.js?v=202611242400") && read('js/data/adapter.js').includes("supabase-adapter.js?v=202611242400"), 'the shell loads the changed adapter at 202611242400');
o