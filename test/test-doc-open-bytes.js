/* Hosted document open: the stored blob is what downloads (fake bytes, no network). Harbor Tree staff contract shape. */
import { nov5Supabase } from '../js/data/supabase-nov5.js';
import { downloadNamed } from '../js/data/file-open.js';
import { docListRow, downloadHref } from '../js/pages/dealdocs.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const DOC = '7c831281-ed4e-4e23-830a-c71ea2bd4198';
const SIZE = 6441501;
const bytes = new Uint8Array(SIZE); bytes[0] = 0x25; bytes[SIZE - 1] = 0x0a;
const stored = new Blob([bytes], { type: 'application/pdf' });
const asked = [];
const sb = {
  auth: { getUser: async () => ({ data: { user: { id: 'staff-1' } } }) },
  from(t) { const q = { select() { return q; }, eq(k, v) { asked.push([t, k, v]); return q; }, single: async () => ({ data: { id: DOC, name: 'contract.pdf', storage_path: 'deal/' + DOC + '/contract.pdf', mime_type: 'application/pdf' }, error: null }) }; return q; },
  storage: { from(bucket) { return { download: async (path) => { asked.push(['storage', bucket, path]); return { data: stored, error: null }; } }; } },
};
const camel = (o) => o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])) : o;
const okr = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
const api = nov5Supabase({ sb, ok: okr, camel, me: async () => ({ id: 'staff-1' }) });
const content = await api.getDocumentContent(DOC);
ok(content.blob && content.blob.size === SIZE && !content.dataUrl, 'the hosted read returns the stored blob with every byte');
ok(asked.some((a) => a[0] === 'storage' && a[1] === 'deal-documents' && a[2].endsWith('/contract.pdf')), 'the bytes come from the deal-documents bucket path on the row');

const clicked = []; let made = null; const revoked = [];
globalThis.URL.createObjectURL = (b) => { made = b; return 'blob:fake-1'; };
globalThis.URL.revokeObjectURL = (h) => revoked.push(h);
globalThis.document = { createElement: () => ({ click() { clicked.push({ href: this.href, download: this.download }); }, remove() {} }), body: { appendChild() {} } };
downloadNamed(content);
ok(made === stored && made.size === SIZE, 'the download link is made from the full stored blob');
ok(clicked.length === 1 && clicked[0].href === 'blob:fake-1' && clicked[0].download === 'contract.pdf', 'the browser is asked to save contract.pdf from that blob');
await new Promise((r) => setTimeout(r, 1600));
ok(revoked[0] === 'blob:fake-1', 'the temporary blob link is released afterwards');
let threw = '';
try { downloadNamed({ name: 'seed.pdf' }); } catch (e) { threw = e.message; }
ok(/no stored content/.test(threw), 'a row with no bytes does not pretend to download');
const before = clicked.length;
downloadNamed({ name: 'x.pdf', dataUrl: 'data:application/pdf;base64,QQ==' });
ok(clicked.length === before + 1 && clicked[clicked.length - 1].href.startsWith('data:'), 'a mock data URL still opens');
const row = docListRow({ id: DOC, name: 'contract.pdf', sizeBytes: SIZE, storagePath: 'p', folderId: null, visibility: 'staff' }, []);
ok(row.size === SIZE && row.hasContent === true && row.folderName === '', 'the list shows 6.1 MB stored, not a 0 B sample');
ok(typeof downloadHref === 'function', 'dealdocs keeps the href helper');
import { readFileSync } from 'node:fs';
const hosted = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
ok(hosted.includes('filterListedDocuments(rows, folderId)'), 'the hosted list honours the chosen folder');
console.log(fail ? fail + ' failed' : 'doc open bytes passed');
if (fail) process.exit(1);
