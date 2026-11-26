/* File checks for the CRM import screens. FAKE DATA ONLY. Nothing here talks to the network.
 * The size and row limits live in crm-janine.js. Messages stay on the upload card until another file is chosen. */
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, importTooBigMessage, guessMapping, PERSON_IMPORT_FIELDS, NOTE_IMPORT_FIELDS } from './crm-janine.js?v=202611247700';
import { uploadTooLargeMessage } from './upload-limit.js?v=202611312900';

const CSV_MIME = new Set(['text/csv', 'application/csv', 'text/comma-separated-values']);
const EXCEL_MIME = new Set(['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

function limitMb() {
  const mb = IMPORT_MAX_BYTES / 1e6;
  return Number.isInteger(mb) ? String(mb) : String(Math.round(mb * 10) / 10);
}

function fileLabel(file) {
  const name = String(file && file.name || '').trim();
  return name || 'This file';
}

// .csv stays CSV even when Windows reports the Excel type. Any other extension is refused.
export function importFileKind(file) {
  const name = String(file && file.name || '');
  const type = String(file && file.type || '').toLowerCase();
  if (/\.csv$/i.test(name)) return 'csv';
  if (/\.(xlsx|xls)$/i.test(name)) return 'excel';
  if (/\.[a-z0-9]+$/i.test(name)) return '';
  if (CSV_MIME.has(type)) return 'csv';
  if (EXCEL_MIME.has(type)) return 'excel';
  return '';
}

export function importFileHelpText() {
  const rows = IMPORT_MAX_ROWS.toLocaleString('en-US');
  return `Accepted files: .csv, .xlsx, and .xls. Up to ${limitMb()} MB and ${rows} rows. The file window shows those types and leaves other types out.`;
}

export function importFileEmptyMessage(file) {
  return `${fileLabel(file)} has no rows to import. Add a header row and at least one row of data, then choose the file again.`;
}

// Wrong type, too big, or empty, before the file is read. '' means keep going.
export function importFileRejectReason(file) {
  const label = fileLabel(file);
  if (!importFileKind(file)) return `${label} is not a CSV or an Excel file. Choose a .csv, .xlsx, or .xls file.`;
  const size = Number(file && file.size);
  if (!Number.isFinite(size) || size < 0) return 'This file could not be read. Save it again as a CSV or an Excel file, then choose that file.';
  if (size > IMPORT_MAX_BYTES) return uploadTooLargeMessage(IMPORT_MAX_BYTES);
  if (size === 0) return importFileEmptyMessage(file);
  return '';
}

const normHeader = (h) => String(h || '').toLowerCase().replace(/\*/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// The shared guesser does not treat a "Full Name" heading as the note's name column. Count it, and pre-select it.
export function importColumnGuess(header, fields, kind) {
  const guess = guessMapping(Array.isArray(header) ? header : [], fields);
  if (kind === 'notes' && !guess.includes('fullName')) {
    const i = (header || []).findIndex((h) => normHeader(h) === 'full name');
    if (i >= 0 && !guess[i]) guess[i] = 'fullName';
  }
  return guess;
}

function missingColumnsMessage(header, kind, module) {
  const fields = kind === 'notes' ? NOTE_IMPORT_FIELDS : PERSON_IMPORT_FIELDS;
  const mapping = importColumnGuess(header, fields, kind);
  const who = module === 'contacts' ? 'client' : 'lead';
  if (kind === 'notes') {
    const note = mapping.includes('note');
    const link = mapping.some((k) => k === 'email' || k === 'fullName' || k === 'lastName');
    if (note && link) return '';
    if (!note && !link) return `This file is missing required columns: Note, and an Email or a name, so each note can find its ${who}. Add those columns and choose the file again.`;
    if (!note) return 'This file is missing a required column: Note. Add a Note column and choose the file again.';
    return `This file is missing a required column. Add an Email column, or a name column, so each note can find its ${who}. Then choose the file again.`;
  }
  if (mapping.includes('lastName')) return '';
  return 'This file is missing a required column: Last Name. Add a Last Name column (or rename the column that has the last name) and choose the file again.';
}

// After the rows are read: no data, too many rows, or a required column the file itself must have.
export function importParsedFileError(rows, kind, module, file) {
  if (!Array.isArray(rows) || rows.length < 2) return importFileEmptyMessage(file);
  const count = rows.length - 1;
  if (count > IMPORT_MAX_ROWS) return importTooBigMessage(count);
  return missingColumnsMessage(rows[0], kind, module);
}

// A reader failure, in plain words. A message that already says what to do is kept.
export function importReadErrorMessage(err) {
  const text = String(err && err.message || '').trim();
  const technical = /ECMA|parse_|undefined|TypeError|SyntaxError|is not a function|at file:/i.test(text);
  const plain = /password|could not be read|no sheets|quote \("\)|header row/i.test(text);
  if (text && plain && !technical) {
    if (/again|upload that file|choose the file/i.test(text)) return text;
    return text.replace(/[. ]*$/, '') + '. Choose the file again.';
  }
  return 'This file could not be read. Save it again as a CSV or an Excel file, then choose that file.';
}
