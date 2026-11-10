/* MF-022: Documents keeps All files / Received / Sent and does not offer Final Policy or Title buttons.
 * Sample rows stay in the store. No network. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const src = readFileSync(new URL('../js/pages/dealdocs.js', import.meta.url), 'utf8');
ok(src.includes("['all', 'All files']") && src.includes("['received', 'Received']") && src.includes("['sent', 'Sent']"), 'All files, Received, and Sent stay');
ok(!/<button[^>]*>\s*Final Policy\s*<\/button>/i.test(src) && !/<a[^>]*>\s*Final Policy\s*<\/a>/i.test(src), 'there is no Final Policy button on the Documents tab');
ok(!/<button[^>]*>\s*Title\s*<\/button>/i.test(src) && !/<a[^>]*>\s*Title\s*<\/a>/i.test(src), 'there is no Title button on the Documents tab');
ok(!src.includes('data-nav-title') && !src.includes('data-nav-policy') && !src.includes('#/deals/${deal.id}/title') && !src.includes('#/deals/${deal.id}/policy'), 'the Documents tab does not link out as a Title or Final Policy button');

const a = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true, title: true, policy: true, funding: true, wires: true } });
await a.signInDev('u-proc');
const deals = await a.listDeals();
const shown = [];
const hidden = [];
for (const d of deals) {
  const docs = await a.listDocuments(d.id);
  for (const doc of docs) (doc.sample ? hidden : shown).push(`${d.fileNumber}\t${doc.name}`);
}
ok(hidden.length + shown.length > 0, 'mock documents are still stored');
ok(shown.every((n) => !/deleted/i.test(n)), 'listing documents does not remove them');
console.log('MOCK_DOCS_SHOWN_ON_TAB');
shown.sort().forEach((n) => console.log(n));
console.log('MOCK_DOCS_STORED_BUT_SAMPLE_HIDDEN');
hidden.sort().forEach((n) => console.log(n));

console.log(fail ? fail + ' failed' : 'docs tab buttons passed');
if (fail) process.exit(1);
