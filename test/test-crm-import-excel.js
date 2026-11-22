/* CRM import accepts Excel as well as CSV. FAKE DATA ONLY. No hosted project. */
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isExcelImport, rowsFromExcel, excelReadError, excelNumberText, excelDateText, excelSheetNotice } from '../js/data/crm-excel.js';
import { parseCsv, toCsvText } from '../js/data/crm-janine.js';
import { createNewMenu, importPage } from '../js/pages/crm-janine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

ok(isExcelImport({ name: 'notes.xlsx', type: '' }) && isExcelImport({ name: 'NOTES.XLS', type: '' }), 'xlsx and xls names are Excel files');
ok(!isExcelImport({ name: 'leads.csv', type: 'application/vnd.ms-excel' }), 'a CSV stays CSV when Windows labels it as Excel');
ok(isExcelImport({ name: 'upload', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'an Excel MIME type is accepted when the name has no extension');
ok(!isExcelImport({ name: 'leads.csv', type: 'text/csv' }), 'a normal CSV is not sent to the Excel reader');

ok(excelNumberText(1.1) === '1.1', '1.1 stays 1.1');
ok(excelNumberText(0.1 + 0.2) === '0.3', 'binary float noise is dropped');
ok(excelNumberText(20852) === '20852' && excelNumberText(3015550101) === '3015550101' && excelNumberText(0) === '0', 'integers stay plain digits');
ok(excelDateText(new Date(Date.UTC(2026, 10, 14))) === '11/14/2026', 'a date is M/D/YYYY');
ok(excelDateText(new Date(Date.UTC(2026, 10, 14, 15, 30))) === '11/14/2026 3:30 PM', 'a time on the date is kept');
ok(excelSheetNotice(1, 'Notes') === '', 'one sheet needs no extra sentence');
ok(excelSheetNotice(3, 'Notes') === 'This Excel file has 3 sheets. The first sheet, "Notes", was used.', 'more than one sheet says which sheet was used');

const password = excelReadError(new Error('File is password-protected'));
const encrypted = excelReadError(new Error('ECMA-376 Encrypted file missing /!DataSpaces/Version'));
ok(password.includes('Remove the password') && password.includes('upload it again') && !password.includes('ECMA'), 'a password-protected file is explained in plain words');
ok(encrypted === password, 'an encrypted workbook uses the same plain password message');
const broken = excelReadError(new Error('parse_xlscfb is not defined'));
ok(broken.includes('could not be read') && broken.includes('upload that file') && !/parse_|ECMA|undefined/.test(broken), 'an unreadable file does not show a technical message');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = Buffer.from(file.data);
    const comp = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localFull = Buffer.concat([local, name, comp]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(localFull);
    centrals.push(Buffer.concat([central, name]));
    offset += localFull.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

// 46340 is Excel's serial for 2026-11-14. The file is built here, not by the reader.
const SERIAL = String(Math.round((Date.UTC(2026, 10, 14) - Date.UTC(1899, 11, 30)) / 86400000));
const xlsx = zipStore([
  { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>` },
  { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
  { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="Notes" sheetId="1" r:id="rId1"/>
<sheet name="Other" sheetId="2" r:id="rId2"/>
</sheets>
</workbook>` },
  { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
  { name: 'xl/sharedStrings.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="8" uniqueCount="8">
<si><t>First Name</t></si>
<si><t>Amount</t></si>
<si><t>When</t></si>
<si><t>Note</t></si>
<si><t>Zip</t></si>
<si><t>Casey</t></si>
<si><t>Talked about closing.</t></si>
<si><t>Robin</t></si>
</sst>` },
  { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>` },
  { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:E4"/>
<sheetData>
<row r="1">
<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c>
</row>
<row r="2">
<c r="A2" t="s"><v>5</v></c><c r="B2"><v>1.1</v></c><c r="C2" s="1"><v>${SERIAL}</v></c><c r="D2" t="s"><v>6</v></c>
</row>
<row r="3">
<c r="A3" t="s"><v>7</v></c><c r="B3"><v>0.30000000000000004</v></c><c r="E3"><v>20852</v></c>
</row>
<row r="4"></row>
</sheetData>
</worksheet>` },
  { name: 'xl/worksheets/sheet2.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Ignore this sheet</t></is></c></row></sheetData>
</worksheet>` },
]);

const parsed = await rowsFromExcel(xlsx);
ok(parsed.sheetName === 'Notes' && parsed.sheetCount === 2, 'the first sheet is Notes and the second sheet is counted');
ok(parsed.notice.includes('Notes') && parsed.notice.includes('2 sheets'), 'the notice names the sheet that was used');
ok(JSON.stringify(parsed.rows) === JSON.stringify([
  ['First Name', 'Amount', 'When', 'Note', 'Zip'],
  ['Casey', '1.1', '11/14/2026', 'Talked about closing.', ''],
  ['Robin', '0.3', '', '', '20852'],
]), 'dates, numbers, and blank cells become the same kind of rows as a CSV: ' + JSON.stringify(parsed.rows));
ok(!JSON.stringify(parsed.rows).includes('Ignore this sheet'), 'the second sheet is not imported');
ok(JSON.stringify(parseCsv(toCsvText(parsed.rows))) === JSON.stringify(parsed.rows), 'the rows go back through the CSV import path unchanged');

const xls = await rowsFromExcel(readFileSync(path.join(root, 'test/fixtures/crm-import-sample.xls')));
ok(xls.sheetName === 'Notes' && xls.sheetCount === 2 && xls.notice.includes('Notes'), 'an .xls file uses the first sheet and says so');
const flat = xls.rows.flat();
ok(flat.includes('José') && flat.includes('1.1') && flat.includes('11/14/2026') && flat.includes('20852') && flat.includes('Robin'), 'an .xls file keeps the name, the date, and the numbers: ' + JSON.stringify(xls.rows));
ok(!flat.includes('Ignore this sheet') && !flat.includes('nope'), 'the other .xls sheet is not imported');
ok(xls.rows[1][3] === '' && xls.rows[2][2] === '', 'blank .xls cells stay empty strings');

let garbage = null;
try { await rowsFromExcel(Buffer.from('this is not a spreadsheet')); } catch (e) { garbage = e; }
ok(garbage && garbage.message.includes('could not be read') && !/ECMA|parse_|at file:/.test(garbage.message), 'a file that is not a spreadsheet is refused in plain words');

const page = read('js/pages/crm-janine.js');
const app = read('js/app.js');
const html = read('index.html');
ok(page.includes('accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"'), 'the file picker lists CSV and both Excel types');
ok(page.includes('Upload a CSV or Excel file') && page.includes('data-import-sheet'), 'the upload label and the sheet notice are on the import screen');
ok(page.includes("import('../data/crm-excel.js?v=202611221700')") && page.indexOf('crm-excel.js') > page.indexOf('data-import-file'), 'the Excel reader is loaded only after a file is picked');
ok(!page.includes('xlsx.core') && !app.includes('xlsx.core') && !html.includes('xlsx.core'), 'the spreadsheet parser is not loaded with the portal shell');
ok(!read('js/data/crm-excel.js').includes('http') && read('js/data/crm-excel.js').includes('./vendor/sheetjs/xlsx.core.min.js?v=202611221700'), 'the parser is the vendored file, not a CDN');

const api = { mode: 'mock', listCrmImports: async () => [] };
const shell = { tabs: () => '', head: () => '' };
const me = { isAdmin: true, canEdit: true };
for (const params of [
  { id: 'leads', sub: 'notes' },
  { id: 'leads' },
  { id: 'contacts', sub: 'notes' },
  { id: 'contacts' },
  { id: 'accounts' },
]) {
  const view = await importPage({ api, me, params }, shell);
  const body = String(view.body);
  const which = `${params.id}${params.sub ? '/' + params.sub : ''}`;
  ok(body.includes('accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"') && body.includes('Upload a CSV or Excel file.'), which + ' upload says CSV or Excel and accepts both');
}
const denied = await importPage({ api, me: { isAdmin: false }, params: { id: 'leads', sub: 'notes' } }, shell);
ok(String(denied.body).includes('data-import-denied') && !String(denied.body).includes('data-import-file'), 'someone who is not an admin still cannot import');
const menu = String(createNewMenu({ canEdit: true, isAdmin: true }));
ok(menu.includes('Import Leads (CSV or Excel)') && menu.includes('Import Clients (CSV or Excel)'), 'the Create New menu says CSV or Excel');

console.log(fail ? fail + ' failed' : 'crm import excel passed');
if (fail) process.exit(1);
