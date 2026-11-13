/* FF-071 #21 (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis confirm-back Nov 12 6:14 PM ET):
   the Documents page uses the screen width without sideways scrolling, and newest first is the default order. */
import { readFileSync } from 'node:fs';
import { sortDocs } from '../js/data/doc-list.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const src = readFileSync(new URL('../js/pages/dealdocs.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/portal.css', import.meta.url), 'utf8');
ok(src.includes("let keptView = { dealId: '', q: '', sort: 'date', dir: 'desc' };") && src.includes("keptView = { dealId: deal.id, q: '', sort: 'date', dir: 'desc' };"), 'a file\'s Documents tab starts sorted by Date, newest first');
ok(src.includes('const rows = (view.sort ? sortDocs(shown, view.sort, view.dir) : shown).map((d) =>'), 'rows are drawn in that order (no reshuffle after the page shows)');
const docs = [{ id: 'a', createdAt: '2026-11-10T10:00:00Z' }, { id: 'b', createdAt: '2026-11-12T10:00:00Z' }, { id: 'c', createdAt: '2026-11-11T10:00:00Z' }];
ok(sortDocs(docs, 'date', 'desc').map((d) => d.id).join('') === 'bca', 'newest first means the latest upload is on top');
ok(css.includes('#doctable td { overflow-wrap: anywhere; }') && css.includes('#doctable td.nowrap { white-space: normal; }') && css.includes('#doctable .pill { white-space: normal; }'), 'long names, instructions, access labels and row buttons wrap inside the table instead of widening it');
console.log(fail ? `FAIL ${fail}` : 'all documents width checks passed');
process.exit(fail ? 1 : 0);
