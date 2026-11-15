/* FF-050 (Francis, Nov 11 email; tracker row 176): staff who can edit a file can change its number.
 * New files stay auto-generated. A taken number is refused and the old number stays. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { cleanFileNumber, FILE_NUMBER_TAKEN } from '../js/data/file-number.js';
import { configurationSection } from '../js/pages/deal.js';
import { toText } from '../js/ui.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });

ok(!cleanFileNumber('  ').ok && cleanFileNumber('').error === 'Enter a file number.', 'a blank file number is refused');
ok(cleanFileNumber('  INT  1001 ').value === 'INT 1001', 'extra spaces are tidied');
ok(!cleanFileNumber('nope!').ok, 'a mark the form does not allow is refused');

await api.signInDev('u-proc');
const before = await api.getDeal('deal-1');
ok(before.fileNumber === 'MD-26-97183', 'the file still starts with its generated number');
let refused = '';
try { await api.updateFileNumber('deal-1', 'MD-26-97201'); } catch (e) { refused = e.message; }
const kept = await api.getDeal('deal-1');
ok(refused === FILE_NUMBER_TAKEN && kept.fileNumber === 'MD-26-97183', 'a number already on another file is refused and the old number stays');
try { await api.updateFileNumber('deal-1', ''); } catch (e) { refused = e.message; }
ok(refused === 'Enter a file number.' && (await api.getDeal('deal-1')).fileNumber === 'MD-26-97183', 'a blank save does not clear the number');

const saved = await api.updateFileNumber('deal-1', 'INT-1001');
ok(saved.fileNumber === 'INT-1001', 'a processor can save a new file number');
const listed = await api.listDeals({ status: 'Open' });
ok(listed.some((d) => d.id === 'deal-1' && d.fileNumber === 'INT-1001'), 'Open Orders shows the new number');
const log = await api.listActivity('deal-1', {});
ok((log.items || []).some((a) => a.action === 'deal.file_number' && a.detail === 'File number changed from MD-26-97183 to INT-1001'), 'the activity log names the old number and the new one');

const orders = readFileSync(new URL('../js/pages/orders.js', import.meta.url), 'utf8');
const search = readFileSync(new URL('../js/sidebar-search.js', import.meta.url), 'utf8');
const header = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
ok(orders.includes('d.fileNumber') && orders.includes('data-search'), 'Open Orders search is built from the file number');
ok(search.includes('d.fileNumber'), 'sidebar search is built from the file number');
ok(header.includes('deal.fileNumber') && header.includes('data-file-order'), 'the file header shows the file number');

const created = await api.createDeal({ street: '1 Oak', city: 'Rockville', state: 'MD', zip: '20850', transactionType: 'Purchase', purchasePrice: 100000, loanAmount: 0 });
ok(/^[A-Z]{2}-\d{2}-\d+$/.test(created.fileNumber) && created.fileNumber !== 'INT-1001', 'a new order still gets a generated number');

await api.signInDev('u-sp');
let blocked = '';
try { await api.updateFileNumber('deal-1', 'SALES-1'); } catch (e) { blocked = e.message; }
ok(/Processor or Admin/i.test(blocked), 'a sales person cannot change a file number');
await api.signInDev('u-proc');
ok((await api.getDeal('deal-1')).fileNumber === 'INT-1001', 'the refused sales edit did not change the number');

await api.signInDev('u-buyer');
blocked = '';
try { await api.updateFileNumber('deal-1', 'BUYER-1'); } catch (e) { blocked = e.message; }
ok(/Processor or Admin/i.test(blocked), 'a buyer cannot change a file number');

const section = toText(configurationSection({ fileNumber: 'INT-1001' }));
ok(section.includes('Configuration') && section.includes('Edit File Number') && section.includes('INT-1001') && section.includes('data-edit-file-number'), 'Edit File Number is under Configuration');

console.log(fail ? fail + ' failed' : 'edit file number passed');
process.exit(fail ? 1 : 0);
