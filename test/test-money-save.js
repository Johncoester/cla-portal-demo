/* Contract money is saved by the same rules whether or not the display formatter ran. No hosted project and no secrets. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { moneyAmount } from '../js/data/constants.js';
import { formatMoneyInput } from '../js/pages/money-input.js';
import { tcSupabase } from '../js/data/supabase-tc.js';
import { toText } from '../js/ui.js';
import { renderTcOverview } from '../js/pages/tc-overview.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
globalThis.FormData = window.FormData || globalThis.FormData;
window.HTMLElement = window.HTMLElement;
class MiniFormData { constructor(form) { this.map = new Map(); form.querySelectorAll('input, select, textarea').forEach((el) => { if (!el.name || el.type === 'file' || el.disabled) return; if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return; this.map.set(el.name, el.value); }); } entries() { return this.map.entries(); } }
globalThis.FormData = MiniFormData; window.FormData = MiniFormData;
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => realSetTimeout(fn, ms || 0);
window.setTimeout = globalThis.setTimeout;

let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };
const cents = (n) => Math.round(Number(n) * 100);

check(moneyAmount('') === null && moneyAmount('  ') === null && moneyAmount(null) === null, 'a blank amount clears');
check(moneyAmount('0') === 0 && moneyAmount('0.00') === 0 && moneyAmount('$0') === 0, 'zero stays zero');
check(cents(moneyAmount('12.3.4')) === 1234 && cents(moneyAmount('1,234.50')) === 123450 && cents(moneyAmount('$1,234.5')) === 123450, 'commas, a dollar sign, and an extra dot follow the typing rules');
check(cents(moneyAmount('1,234.567')) === 123456, 'a third decimal digit is dropped, not rounded up');
check(moneyAmount('1e3') === 13 && moneyAmount('1abc2') === 12 && moneyAmount('-12.34') === 12.34, 'letter and sign stripping stays as it was');
for (const sample of ['', '0', '0.00', '12.34', '12.3.4', '1,234.50', '1,234.567', '-12.34', '1e3', '1abc2']) {
  const once = moneyAmount(sample);
  check(moneyAmount(once) === once, 'saving ' + JSON.stringify(sample) + ' again does not change it');
}
for (const sample of ['0.29', '1.1', '1.01', '1000000.29', '35184372088831.99']) {
  const once = moneyAmount(sample);
  const again = moneyAmount(once);
  const wire = JSON.parse(JSON.stringify(once));
  check(cents(once) === cents(sample) && again === once && cents(again) === cents(once) && cents(wire) === cents(once), 'cents stay put for ' + sample);
}
for (const bad of ['70368744177664.01', 70368744177664.01, '35184372088832.00', '35184372088832.01', '35184372088832.02', '1000000000000000000000', 1e21, 1e-7]) {
  let threw = false; try { moneyAmount(bad); } catch (err) { threw = true; }
  check(threw && moneyAmount('12.34') === 12.34, 'refuses an amount that is not a safe number of cents: ' + bad);
}
for (const bad of ['abc', 'Infinity', 'NaN', Number.NaN, Number.POSITIVE_INFINITY]) {
  let threw = false; try { moneyAmount(bad); } catch (err) { threw = true; }
  check(threw, 'refuses ' + bad);
}

const rpc = [];
const dealRow = { id: 'file-1', purchasePrice: null, contractDate: null, listingCommissionPct: null, listingCommissionAmount: null, buyerCommissionPct: null, buyerCommissionAmount: null, sellerConcessions: null, emdAmount: null, emdHolder: '', closingDate: null, status: 'Open', stage: 1, openDate: '2026-01-01', emdReceived: false, emdReceivedDate: null, emdReceivedAmount: null, altaReceived: false, altaReceivedDate: null, altaDocumentId: null };
const sb = { rpc(name, args) { rpc.push({ name, args: JSON.parse(JSON.stringify(args)) }); return Promise.resolve({ data: true, error: null }); }, from() { return { select() { return this; }, eq() { return this; }, single() { return Promise.resolve({ data: { ...dealRow }, error: null }); } }; } };
const ok = (row) => { if (row && row.error) throw new Error(row.error.message || 'failed'); return row.data; };
const participants = [{ id: 'p1', role: 'Client-Buyer', removed: false, contact: { firstName: 'Ann', lastName: 'Lee', email: 'a@b.c', phone: '3015550100' } }];
const tc = tcSupabase({ sb, ok, camel: (row) => row, api: { getDeal: async () => ({ participants }), listTasks: async () => [] } });
const saved = async (raw) => { const before = rpc.length; const out = await tc.updateContractInfo('file-1', { purchasePrice: raw, contractDate: '2026-02-01', listingCommissionPct: '2.5', listingCommissionAmount: '0', buyerCommissionPct: '', buyerCommissionAmount: '', sellerConcessions: '', emdAmount: '0.00', emdHolder: 'CLA', closingDate: '' }); return { args: rpc[rpc.length - 1].args, calls: rpc.length - before, out }; };

const loaded = await saved('12.3.4');
check(loaded.calls === 1 && cents(loaded.args.p_purchase_price) === 1234 && loaded.args.p_emd_amount === 0 && loaded.args.p_listing_commission_pct === null && loaded.args.p_buyer_commission_pct === null, 'the contract RPC stores 12.34 and a real zero; commissions are never sent (they are Agent fees since Nov 13)');
const wide = await saved('1,234.567');
check(cents(wide.args.p_purchase_price) === 123456, 'the contract RPC stores 1234.56 from 1,234.567');
let refused = 0; const beforeRefuse = rpc.length;
try { await tc.updateContractInfo('file-1', { purchasePrice: 'abc' }); } catch (err) { refused += 1; }
check(refused === 1 && rpc.length === beforeRefuse, 'a word is not sent to the contract RPC');
const emd = [];
const emdSb = { ...sb, rpc(name, args) { emd.push(JSON.parse(JSON.stringify(args))); return Promise.resolve({ data: true, error: null }); } };
const emdApi = tcSupabase({ sb: emdSb, ok, camel: (row) => row, api: { getDeal: async () => ({ participants }), listTasks: async () => [] } });
await emdApi.updateEmdAlta('file-1', { received: true, receivedAmount: '12.3.4' });
check(cents(emd[0].p_emd_received_amount) === 1234, 'EMD received amount uses the same cents rule');

const d = { id: 'file-1', fileNumber: 'MD-26-97216', street: '1 Main', city: 'Baltimore', state: 'MD', zip: '21201', status: 'Open', stage: 1 };
const view = await renderTcOverview({ api: { listTasks: async () => [], getDeal: async () => ({ participants }), getMilestones: tc.getMilestones.bind(tc), getEmdAlta: tc.getEmdAlta.bind(tc), getContractInfo: tc.getContractInfo.bind(tc), updateContractInfo: tc.updateContractInfo.bind(tc), updateClientContact: async () => ({}), updateEmdAlta: tc.updateEmdAlta.bind(tc) }, user: { firstName: 'Pat' }, refresh() {} }, d);
const host = document.createElement('div'); host.innerHTML = toText(view.body); document.body.appendChild(host); view.mount(host);
const submit = async (raw, format) => {
  if (!document.querySelector('#tc-ci')) host.querySelector('[data-tc-action="contract"]').click();
  const box = document.querySelector('#tc-ci [name=purchasePrice]');
  box.value = raw; if (format) formatMoneyInput(box);
  document.querySelector('#tc-ci').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => realSetTimeout(r, 30));
};
const at = rpc.length;
await submit('12.3.4', true);
const withFormat = rpc[rpc.length - 1];
await submit('12.3.4', false);
const withoutFormat = rpc[rpc.length - 1];
check(withFormat && withoutFormat && cents(withFormat.args.p_purchase_price) === 1234 && cents(withoutFormat.args.p_purchase_price) === 1234 && rpc.length === at + 2, 'typing 12.3.4 saves 12.34 with the formatter and without it');
await submit('1,234.567', false);
check(cents(rpc[rpc.length - 1].args.p_purchase_price) === 123456, 'typing 1,234.567 saves 1234.56 without the formatter');
const savedNote = document.querySelector('#toasts'); if (savedNote) savedNote.textContent = '';
await submit('abc', false);
const notes = (document.querySelector('#toasts') || { textContent: '' }).textContent;
check(!!document.querySelector('#modal') && notes.includes('Enter an amount') && !notes.includes('Contract info and client details saved') && rpc.length === at + 3, 'a refused amount stays in the open form and is not announced as saved');
if (savedNote) savedNote.textContent = '';
await submit('12.00', false);
check((document.querySelector('#toasts') || { textContent: '' }).textContent.includes('Contract info and client details saved') && cents(rpc[rpc.length - 1].args.p_purchase_price) === 1200, 'a valid contract save is still announced');

const heldDir = '/tmp/held-money-5f500';
mkdirSync(heldDir + '/js/data', { recursive: true });
for (const file of ['js/data/supabase-tc.js', 'js/data/constants.js']) writeFileSync(heldDir + '/' + file, execFileSync('git', ['show', '5f500bca9964b0688fdb4e2fe57db01531a36ccf:' + file]));
const held = await import('file:///tmp/held-money-5f500/js/data/supabase-tc.js');
const heldRpc = [];
const heldTc = held.tcSupabase({ sb: { rpc(name, args) { heldRpc.push(JSON.parse(JSON.stringify(args))); return Promise.resolve({ data: true, error: null }); }, from: sb.from }, ok, camel: (row) => row, api: { getDeal: async () => ({ participants }), listTasks: async () => [] } });
await heldTc.updateContractInfo('file-1', { purchasePrice: '12.3.4', listingCommissionAmount: '', buyerCommissionAmount: '', sellerConcessions: '', emdAmount: '' });
check(heldRpc[0].p_purchase_price === null, 'the held builder turns 12.3.4 into a null write');
await heldTc.updateContractInfo('file-1', { purchasePrice: '1000000000000000000000', listingCommissionAmount: '', buyerCommissionAmount: '', sellerConcessions: '', emdAmount: '' });
check(heldRpc[1].p_purchase_price === 1e21 && heldRpc[1].p_purchase_price !== 121, 'the held builder sends the huge amount as 1e21, not 121');
const toastBox = document.querySelector('#toasts'); if (toastBox) toastBox.textContent = '';
const beforeHuge = rpc.length;
await submit('1000000000000000000000', false);
const hugeNotes = (document.querySelector('#toasts') || { textContent: '' }).textContent;
check(!!document.querySelector('#modal') && rpc.length === beforeHuge && hugeNotes.includes('Enter an amount') && !hugeNotes.includes('Contract info and client details saved'), 'an oversized amount stays in the form and is not written');
const beforeDrift = rpc.length;
if (toastBox) toastBox.textContent = '';
await submit('70368744177664.01', false);
const driftNotes = (document.querySelector('#toasts') || { textContent: '' }).textContent;
check(!!document.querySelector('#modal') && rpc.length === beforeDrift && driftNotes.includes('Enter an amount') && !driftNotes.includes('Contract info and client details saved'), '70368744177664.01 is not written when the formatter did not run');
if (toastBox) toastBox.textContent = '';
await submit('70368744177664.01', true);
const driftFmt = (document.querySelector('#toasts') || { textContent: '' }).textContent;
check(!!document.querySelector('#modal') && rpc.length === beforeDrift && driftFmt.includes('Enter an amount'), '70368744177664.01 is not written after the formatter runs');
const box = document.querySelector('#tc-ci [name=purchasePrice]');
box.value = '70368744177664.01';
box.dispatchEvent(new window.Event('focusout', { bubbles: true }));
document.querySelector('#tc-ci').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => realSetTimeout(r, 30));
check(rpc.length === beforeDrift && !!document.querySelector('#modal'), 'blur then submit does not write 70368744177664.01');
let driftRpc = 0;
try { await tc.updateContractInfo('file-1', { purchasePrice: '70368744177664.01' }); } catch (err) { driftRpc += 1; }
try { await tc.updateContractInfo('file-1', { purchasePrice: 70368744177664.01 }); } catch (err) { driftRpc += 1; }
check(driftRpc === 2 && rpc.length === beforeDrift, 'the contract RPC refuses the drifted amount as a string and as a number');

const { createSupabaseAdapter } = await import('../js/data/supabase-adapter.js');
const writes = [];
globalThis.__fakeSB = {
  auth: { onAuthStateChange(fn) { fn('INITIAL_SESSION', { user: { id: 'u1' } }); }, getUser() { return Promise.resolve({ data: { user: { id: 'u1' } }, error: null }); }, async signOut() { return { error: null }; } },
  from(table) { return { insert(row) { writes.push({ op: 'insert', table, row }); return this; }, update(row) { writes.push({ op: 'update', table, row }); return this; }, select() { return this; }, eq() { return this; }, order() { return this; }, in() { return this; }, is() { return this; }, async single() { return { data: { id: 'file-1', street: '1 Main', city: 'Baltimore', state: 'MD', zip: '21201' }, error: null }; }, async maybeSingle() { return { data: null, error: null }; } }; },
  async rpc() { return { data: [], error: null }; },
};
const adapter = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE' });
let placeRefused = '';
try { await adapter.createDeal({ street: '1 Main', city: 'Baltimore', state: 'MD', zip: '21201', transactionType: 'Purchase', purchasePrice: '1000000000000000000000', loanAmount: '0', emdAmount: '' }); }
catch (err) { placeRefused = err.message; }
check(placeRefused.includes('amount') && !writes.some((w) => w.op === 'insert'), 'place order does not insert an oversized price');
try { await adapter.createDeal({ street: '1 Main', city: 'Baltimore', state: 'MD', zip: '21201', transactionType: 'Purchase', purchasePrice: '70368744177664.01', loanAmount: '0.29', emdAmount: '1.01' }); }
catch (err) { placeRefused = err.message; }
check(placeRefused.includes('amount') && !writes.some((w) => w.op === 'insert'), 'place order does not insert 70368744177664.01');
writes.length = 0;
await adapter.createDeal({ street: '1 Main', city: 'Baltimore', state: 'MD', zip: '21201', transactionType: 'Purchase', purchasePrice: '12.3.4', loanAmount: '0', emdAmount: '1,234.567' }).catch(() => {});
const placed = writes.find((w) => w.op === 'insert');
check(placed && cents(placed.row.purchase_price) === 1234 && placed.row.loan_amount === 0 && cents(placed.row.emd_amount) === 123456, 'place order stores 12.34, zero, and 1234.56');
writes.length = 0;
let editRefused = '';
try { await adapter.updateDeal('file-1', { loanAmount: 1e21 }); } catch (err) { editRefused = err.message; }
check(editRefused.includes('amount') && writes.length === 0, 'a file edit does not write 1e21');
try { await adapter.updateDeal('file-1', { purchasePrice: '70368744177664.01' }); } catch (err) { editRefused = err.message; }
check(editRefused.includes('amount') && writes.length === 0, 'a file edit does not write 70368744177664.01');
await adapter.updateDeal('file-1', { purchasePrice: '-12.34', loanAmount: '1abc2', emdAmount: '' }).catch(() => {});
const edited = writes.find((w) => w.op === 'update');
check(edited && edited.row.purchase_price === 12.34 && edited.row.loan_amount === 12 && edited.row.emd_amount === null, 'a file edit keeps the existing letter and sign rules and a blank clear');

console.log(fail ? fail + ' failed' : 'money save passed');
process.exit(fail ? 1 : 0);
