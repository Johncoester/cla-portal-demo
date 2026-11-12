/* Matt, Nov 11 ("Processor User-Documents" notes): the Documents tab has a search box and sortable columns
 * on All files, Received and Sent. Search and sort run on the rows already loaded. No network. */
import { readFileSync } from 'node:fs';
import { DOC_SORTS, DOC_SORT_DIR, docSearchText, docMatches, docSortValue, sortDocs } from '../js/data/doc-list.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const names = (list) => list.map((d) => d.name).join(',');

const docs = [
  { id: 'a', name: 'Sales Contract.pdf', docType: 'Contract', folderName: 'Contract', createdAt: '2026-11-09T15:00:00Z', uploadedByName: 'Pat Agent', uploadedByRole: 'Buyer Agent', description: 'Ratified copy' },
  { id: 'b', name: 'photo id 2.png', docType: 'Photo ID', folderName: '', createdAt: '2026-11-11T09:30:00Z', uploadedByName: 'Bea Buyer', uploadedByRole: 'Buyer', description: '' },
  { id: 'c', name: 'Photo ID 10.png', docType: 'Photo ID', folderName: 'Buyer', createdAt: '2026-11-10T12:00:00Z', uploadedByName: 'bea buyer', uploadedByRole: 'Buyer', description: '' },
  { id: 'd', name: 'Commitment.docx', docType: '', folderName: 'Title', createdAt: '', uploadedByName: 'Proc One', uploadedByRole: 'Processor', description: 'Send to lender' },
];
const before = names(docs);

// search
ok(docMatches(docs[0], '') && docMatches(docs[0], '   ') && docMatches(docs[0], null), 'an empty search shows every document');
ok(names(docs.filter((d) => docMatches(d, 'photo'))) === 'photo id 2.png,Photo ID 10.png', 'search finds a file by name, in any letter case');
ok(names(docs.filter((d) => docMatches(d, 'PAT'))) === 'Sales Contract.pdf', 'search finds a file by who sent it');
ok(names(docs.filter((d) => docMatches(d, 'processor'))) === 'Commitment.docx', 'search finds a file by the sender role');
ok(names(docs.filter((d) => docMatches(d, 'title'))) === 'Commitment.docx', 'search finds a file by its folder');
ok(names(docs.filter((d) => docMatches(d, 'lender'))) === 'Commitment.docx', 'search finds a file by the additional instruction');
ok(names(docs.filter((d) => docMatches(d, 'photo bea 10'))) === 'Photo ID 10.png', 'every word typed has to match');
ok(docs.filter((d) => docMatches(d, 'zzz')).length === 0, 'a search with no match shows nothing');
ok(!docSearchText({ name: 'A', visibility: 'staff', storagePath: 'x/secret.pdf' }).includes('secret'), 'search only reads what the row shows');

// sort
ok(names(sortDocs(docs, 'name', 'asc')) === 'Commitment.docx,photo id 2.png,Photo ID 10.png,Sales Contract.pdf', 'name sorts A to Z, ignoring case, with 2 before 10');
ok(names(sortDocs(docs, 'name', 'desc')) === 'Sales Contract.pdf,Photo ID 10.png,photo id 2.png,Commitment.docx', 'a second click reverses the name sort');
ok(names(sortDocs(docs, 'date', 'desc')) === 'photo id 2.png,Photo ID 10.png,Sales Contract.pdf,Commitment.docx', 'date sorts newest first and a file with no date goes last');
ok(names(sortDocs(docs, 'date', 'asc')) === 'Sales Contract.pdf,Photo ID 10.png,photo id 2.png,Commitment.docx', 'date sorts oldest first and a file with no date still goes last');
ok(names(sortDocs(docs, 'from', 'asc')) === 'photo id 2.png,Photo ID 10.png,Sales Contract.pdf,Commitment.docx', 'sender sorts A to Z and the same sender keeps the loaded order');
ok(names(sortDocs(docs, 'folder', 'asc')) === 'Photo ID 10.png,Sales Contract.pdf,Commitment.docx,photo id 2.png', 'folder sorts A to Z and an unfiled document goes last');
ok(names(sortDocs(docs, 'type', 'asc')) === 'Sales Contract.pdf,photo id 2.png,Photo ID 10.png,Commitment.docx', 'file type sorts A to Z and a document with no type goes last');
ok(names(sortDocs(docs, 'size', 'asc')) === before && names(sortDocs(docs, '', 'asc')) === before, 'an unknown column leaves the order alone');
ok(names(docs) === before, 'sorting returns a new list and does not reorder the loaded rows');
ok(sortDocs(null, 'name', 'asc').length === 0 && docSortValue(null, 'date') === null, 'missing rows do not throw');
ok(DOC_SORTS.join(',') === 'type,name,folder,date,from' && DOC_SORT_DIR.date === 'desc', 'the sortable columns are type, name, folder, date and sender; date opens newest first');

// the page wires them on all three tabs, from rows already loaded
const src = readFileSync(new URL('../js/pages/dealdocs.js', import.meta.url), 'utf8');
ok(src.includes('data-doc-search') && src.includes('docMatches(d, view.q)'), 'the Documents tab has a search box');
ok(['type', 'name', 'folder', 'date', 'from'].every((k) => src.includes(`sortHead('${k}'`)), 'File Type, File Name, Folder, Date and From can be sorted from the header');
ok(src.includes('sortDocs(shown, view.sort, view.dir)') && src.includes('data-doc-nomatch'), 'sort and search act on the rows shown for the tab, with a no-match line');
ok(src.includes("['all', 'All files']") && src.includes("['received', 'Received']") && src.includes("['sent', 'Sent']") && src.includes('keptView'), 'the same search and sort apply on All files, Received and Sent');
const mountPart = src.slice(src.indexOf('// Matt, Nov 11: search and sort run in the browser'), src.indexOf("const ub = $('#upbtn', root)"));
ok(mountPart.length > 0 && !mountPart.includes('api.'), 'search and sort make no request');

console.log(fail ? fail + ' failed' : 'doc search and sort passed');
if (fail) process.exit(1);
