/* Excel files for the CRM import screens. The parser loads only when a file is read.
 * FAKE DATA ONLY. Nothing here talks to the network. */
const PARSER = './vendor/sheetjs/xlsx.core.min.js?v=202611221700';
const EXCEL_MIME = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

// A .csv file stays CSV even when Windows reports the Excel MIME type.
export function isExcelImport(file) {
  const name = String(file && file.name || '');
  if (/\.csv$/i.test(name)) return false;
  if (/\.(xlsx|xls)$/i.test(name)) return true;
  return EXCEL_MIME.has(String(file && file.type || '').toLowerCase());
}

export function excelSheetNotice(sheetCount, sheetName) {
  const n = Number(sheetCount) || 0;
  if (n <= 1) return '';
  const name = String(sheetName || '').trim() || 'the first sheet';
  return `This Excel file has ${n} sheets. The first sheet, "${name}", was used.`;
}

export function excelReadError(err) {
  const raw = String(err && err.message || err || '');
  if (/password|encrypt/i.test(raw)) {
    return 'This Excel file is password-protected. Remove the password in Excel, save the file, and upload it again.';
  }
  return 'This Excel file could not be read. Save it again as a CSV or as an Excel file without a password, and upload that file.';
}

// Dates are UTC so a value around midnight does not slip to the previous day in Eastern time.
export function excelDateText(value) {
  const d = value instanceof Date ? value : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const text = `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  const ss = d.getUTCSeconds();
  if (hh === 0 && mm === 0 && ss === 0) return text;
  const h12 = hh % 12 || 12;
  const ap = hh < 12 ? 'AM' : 'PM';
  const sec = ss ? `:${String(ss).padStart(2, '0')}` : '';
  return `${text} ${h12}:${String(mm).padStart(2, '0')}${sec} ${ap}`;
}

// Excel's general display: drop binary float noise, keep integers as digits (zip codes, phone numbers).
export function excelNumberText(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || Object.is(n, -0)) return n === 0 || Object.is(n, -0) ? '0' : '';
  const cleaned = Number(n.toPrecision(15));
  if (!Number.isFinite(cleaned) || Object.is(cleaned, -0)) return cleaned === 0 || Object.is(cleaned, -0) ? '0' : '';
  const abs = Math.abs(cleaned);
  if (Number.isInteger(cleaned) && abs < 1e15) return String(cleaned);
  const s = String(cleaned);
  if (!/[eE]/.test(s)) return s;
  return cleaned.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 10 });
}

function serialToUtc(serial) {
  const days = Math.floor(serial);
  const frac = serial - days;
  return new Date(Date.UTC(1899, 11, 30) + days * 86400000 + Math.round(frac * 86400000));
}

function isDateFormat(cell, XLSX) {
  const fmt = cell && cell.z;
  if (!fmt || fmt === 'General') return false;
  try { return !!(XLSX.SSF && typeof XLSX.SSF.is_date === 'function' && XLSX.SSF.is_date(fmt)); }
  catch (e) { return false; }
}

function cellText(cell, XLSX) {
  if (!cell || cell.t === 'z') return '';
  if (cell.t === 'd' || cell.v instanceof Date) return excelDateText(cell.v);
  if (cell.t === 'n' && typeof cell.v === 'number' && isDateFormat(cell, XLSX)) return excelDateText(serialToUtc(cell.v));
  if (cell.t === 'n' && typeof cell.v === 'number') return excelNumberText(cell.v);
  if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE';
  if (cell.t === 'e' || cell.v == null || cell.v === '') return '';
  if (typeof cell.v === 'object') return typeof cell.v.text === 'string' ? cell.v.text : '';
  return String(cell.v);
}

function sheetToRows(XLSX, sheet) {
  if (!sheet || !sheet['!ref']) return [];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const rows = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = [];
    let any = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const text = cellText(sheet[XLSX.utils.encode_cell({ r, c })], XLSX);
      if (text !== '') any = true;
      row.push(text);
    }
    if (any) rows.push(row);
  }
  let width = 0;
  for (const row of rows) {
    let last = -1;
    for (let i = 0; i < row.length; i++) if (row[i] !== '') last = i;
    if (last + 1 > width) width = last + 1;
  }
  return rows.map((row) => {
    const out = row.slice(0, width);
    while (out.length < width) out.push('');
    return out;
  });
}

function plainError(message) {
  const err = new Error(message);
  err.plain = true;
  return err;
}

let parserPromise = null;
function loadParser() {
  if (!parserPromise) {
    parserPromise = import(PARSER).then((mod) => {
      const XLSX = mod && (mod.XLSX || mod.default);
      if (!XLSX || typeof XLSX.read !== 'function') throw new Error('The Excel reader did not load.');
      return XLSX;
    }).catch((err) => { parserPromise = null; throw err; });
  }
  return parserPromise;
}

function toBytes(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  throw plainError(excelReadError(new Error('unreadable')));
}

// .xlsx is a zip (PK). .xls and a password-protected workbook are an OLE file (D0 CF 11 E0).
// Anything else is not a spreadsheet we can read. Password-protected OLE files are still passed to the reader so the password message can be shown.
function looksLikeExcel(bytes) {
  if (!bytes || bytes.length < 4) return false;
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  return zip || ole;
}

// First sheet only, as rows of strings. Same shape parseCsv returns.
export async function rowsFromExcel(bytes) {
  try {
    const data = toBytes(bytes);
    if (!looksLikeExcel(data)) throw plainError(excelReadError(new Error('unreadable')));
    const XLSX = await loadParser();
    const wb = XLSX.read(data, { type: 'array', cellDates: true, cellNF: true });
    const names = wb && Array.isArray(wb.SheetNames) ? wb.SheetNames : [];
    if (!names.length) throw plainError('This Excel file has no sheets. Add a header row and at least one row of data on the first sheet, then upload it again.');
    const sheetName = names[0];
    const rows = sheetToRows(XLSX, wb.Sheets[sheetName]);
    return { rows, sheetName, sheetCount: names.length, notice: excelSheetNotice(names.length, sheetName) };
  } catch (err) {
    if (err && err.plain) throw err;
    throw plainError(excelReadError(err));
  }
}
