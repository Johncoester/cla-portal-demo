/* TEST contract figures. Fake orders only. Blank stays null. Nothing is posted as a receipt, payoff, or Closing Disclosure. */
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { accountingSupabase } from '../js/data/supabase-accounting.js';
import { cleanContractTerms, illustrative, exactlyOneRow, CONTRACT_NOT_SAVED } from '../js/data/contract-terms.js';
import { autoEntries, ledgerTotals } from '../js/data/accounting.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const rejects = async (p, re) => { try { await p(); return false; } catch (e) { return !re || re.test(e.message); } };

const blank = cleanContractTerms({});
ok(blank.fields.salePrice === null && blank.fields.loanAmount === null && blank.fields.sellerCreditAmount === null && blank.fields.emdAmount === null, 'a blank sheet stores null, not zero');
ok(blank.fields.emdReceipt === 'unknown' && blank.fields.emdMethod === null && blank.fields.posture === 'estimate', 'EMD method and receipt stay unknown');
ok(cleanContractTerms({ sellerCreditAmount: '0' }).fields.sellerCreditAmount === 0, 'a typed zero stays zero');
ok(cleanContractTerms({ sellerCreditAmount: '0.00', sellerCreditAmountBasis: 'explicit' }).flags.sellerCreditAmount.provisional === true, 'an explicit zero stays provisional');
const derived = cleanContractTerms({ loanAmount: '100.00', loanAmountBasis: 'derived', loanAmountSource: 'contract percent, not a funded figure', loanPercent: '80' });
ok(derived.fields.loanAmount === 100 && derived.fields.loanPercent === 80 && derived.flags.loanAmount.basis === 'derived' && derived.flags.loanAmount.provisional === true, 'a derived loan keeps its marker and does not replace the percent');
ok(illustrative(400, 3) === 12 && illustrative(null, 3) === null, 'illustrative math is not produced from a blank');
ok(await rejects(() => Promise.resolve().then(() => cleanContractTerms({ salePrice: '1.234' })), /blank or an amount/), 'too many decimals are refused');
ok(await rejects(() => Promise.resolve().then(() => cleanContractTerms({ emdReceipt: 'received' })), /does not post a receipt/), 'received is not a contract-figure status');
ok(await rejects(() => Promise.resolve().then(() => cleanContractTerms({ posture: 'verified' })), /estimate/), 'the sheet cannot be marked as a verified ledger');
ok(await rejects(() => Promise.resolve().then(() => cleanContractTerms({ loanAmountBasis: 'derived' })), /enter the figure/), 'a marker without a figure is refused');
ok(await rejects(() => Promise.resolve().then(() => cleanContractTerms({ emdReceived: true })), /cannot post a receipt/), 'a receipt flag is refused');
ok(exactlyOneRow([{ sale_price: 1 }]).sale_price === 1 && exactlyOneRow({ sale_price: 2 }).sale_price === 2, 'one returned row is kept');
ok((() => { try { exactlyOneRow([]); return false; } catch (e) { return e.message === CONTRACT_NOT_SAVED; } })(), 'zero returned rows fail');
ok((() => { try { exactlyOneRow([{ sale_price: 1 }, { sale_price: 2 }]); return false; } catch (e) { return e.message === CONTRACT_NOT_SAVED; } })(), 'two returned rows fail');
ok((() => { try { exactlyOneRow(null); return false; } catch (e) { return e.message === CONTRACT_NOT_SAVED; } })(), 'a missing row fails');
ok(autoEntries({ purchasePrice: 485000, loanAmount: 388000, emdAmount: 10000 }).length === 0, 'order price, loan, and deposit are not ledger lines');
ok(ledgerTotals({ purchasePrice: 485000, loanAmount: 388000, emdAmount: 10000 }, []).receipts === 0, 'those order figures are not funds in');

const adapter = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await adapter.signInDev('u-proc');
const before = await adapter.getDeal('deal-1');
const saved = await adapter.saveContractTerms('deal-1', { salePrice: '', loanAmount: '100.50', loanAmountBasis: 'derived', loanAmountSource: 'fake fixture', sellerCreditAmount: '', emdAmount: '25', emdMethod: '', emdReceipt: 'pending', hoaMonthly: '10', hoaCertificateBalance: '4', hoaCertificateBalanceBasis: 'historical', taxLevy: '20', taxPayable: '', warrantyCap: '6', internalNote: 'fixture only' });
ok(saved.saved === true && saved.fields.salePrice === null && saved.fields.loanAmount === 100.5 && saved.fields.sellerCreditAmount === null && saved.fields.taxPayable === null, 'the processor save keeps blanks null');
ok(saved.fields.emdMethod === null && saved.fields.emdReceipt === 'pending' && saved.flags.loanAmount.basis === 'derived' && saved.flags.hoaCertificateBalance.basis === 'historical', 'method, receipt, and markers persist');
const again = await adapter.getContractTerms('deal-1');
ok(again.saved && again.fields.loanAmount === 100.5 && again.fields.salePrice === null && again.fields.emdAmount === 25, 'reopening the sheet reads the same figures');
const deal = await adapter.getDeal('deal-1');
ok(deal.purchasePrice === before.purchasePrice && deal.loanAmount === before.loanAmount && deal.emdAmount === before.emdAmount, 'saving contract figures does not change the order');
const fees = await adapter.getAccounting('deal-1');
ok(!fees.entries.some((e) => e.auto) && fees.totals.receipts === 0, 'the fee ledger does not receive the contract figures');
const cd = await adapter.getClosingDisclosure('deal-1');
const labels = ['K', 'L', 'M', 'N'].flatMap((k) => ((cd.summaries[k] || {}).rows || []).map((r) => r.label));
ok(!labels.some((l) => /Sale Price|Deposit|Loan Amount/.test(l)), 'the Closing Disclosure does not list the contract promises');
const feeCount = (await adapter.getAccounting('deal-1')).entries.length;
await adapter.updateDeal('deal-1', { purchasePrice: '100', loanAmount: '80', emdAmount: '5' });
const edited = await adapter.getAccounting('deal-1');
ok(edited.entries.length === feeCount && edited.totals.receipts === 0 && !edited.entries.some((e) => e.auto), 'editing the order price, loan, and EMD does not post ledger funds');
const opened = await adapter.createDeal({ street: '1 Fixture Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-01', purchasePrice: '500', loanAmount: '400', emdAmount: '25' });
const fresh = await adapter.getAccounting(opened.id);
const freshCd = await adapter.getClosingDisclosure(opened.id);
const freshLabels = ['K', 'L', 'M', 'N'].flatMap((k) => ((freshCd.summaries[k] || {}).rows || []).map((r) => r.label));
ok(opened.purchasePrice === 500 && fresh.entries.length === 0 && fresh.totals.receipts === 0 && !freshLabels.some((l) => /Sale Price|Deposit|Loan Amount/.test(l)), 'opening an order does not post its price, loan, or EMD onto the ledger');
ok((await adapter.getContractTerms('deal-2')).saved === false && (await adapter.getContractTerms('deal-2')).fields.loanAmount === null, 'another order stays blank');
const badBefore = await adapter.getContractTerms('deal-1');
ok(await rejects(() => adapter.saveContractTerms('deal-1', { salePrice: 'nope' }), /blank or an amount/), 'a bad amount is refused');
const badAfter = await adapter.getContractTerms('deal-1');
ok(badAfter.fields.loanAmount === badBefore.fields.loanAmount && badAfter.fields.salePrice === null, 'a refused save leaves the stored sheet alone');

await adapter.signInDev('u-sp');
const salesView = await adapter.getContractTerms('deal-1');
ok(salesView.saved && salesView.canEdit === false && salesView.fields.loanAmount === 100.5, 'sales can read and cannot edit');
ok(await rejects(() => adapter.saveContractTerms('deal-1', { loanAmount: '1' }), /read-only/i), 'sales cannot save');
await adapter.signInDev('u-tc2');
ok((await adapter.getContractTerms('deal-1')).canEdit === false, 'a transaction coordinator is read only');
ok(await rejects(() => adapter.saveContractTerms('deal-1', { loanAmount: '1' }), /read-only/i), 'a transaction coordinator cannot save');
await adapter.signInDev('u-buyer');
ok(await rejects(() => adapter.getContractTerms('deal-1'), /staff only/i), 'a client cannot read contract figures');
ok(await rejects(() => adapter.saveContractTerms('deal-1', { loanAmount: '1' }), /staff only/i), 'a client cannot save contract figures');
await adapter.signInDev('u-bagent');
ok(await rejects(() => adapter.getContractTerms('deal-1'), /staff only/i), 'an agent cannot read contract figures');
await adapter.signInDev('u-preproc');
ok((await adapter.getContractTerms('deal-1')).canEdit === true, 'a preprocessor can edit');

const off = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: false } });
await off.signInDev('u-proc');
ok(await rejects(() => off.getContractTerms('deal-1'), /turned off/), 'the feature flag still refuses contract figures');
ok(await rejects(() => off.getAccounting('deal-1'), /turned off/), 'the fee ledger stays off with the flag');

const okFn = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
function fakeSb(behavior) {
  return {
    rpc() { return Promise.resolve({ data: behavior.access || 'edit', error: null }); },
    from() {
      const state = { op: 'select', payload: null, filters: [] };
      const finish = () => Promise.resolve(behavior.run(state));
      const b = {
        select() { return b; },
        insert(row) { state.op = 'insert'; state.payload = row; return b; },
        update(row) { state.op = 'update'; state.payload = row; return b; },
        eq(k, v) { state.filters.push([k, v]); return b; },
        order() { return b; },
        maybeSingle: finish,
        single: finish,
        then(res, rej) { return finish().then(res, rej); },
      };
      return b;
    },
  };
}
const dealId = '22222222-2222-2222-2222-222222222222';
const store = new Map();
const live = accountingSupabase({ sb: fakeSb({ run(s) {
  const id = (s.filters.find((x) => x[0] === 'deal_id') || [])[1] || (s.payload && s.payload.deal_id);
  if (s.op === 'select') return { data: store.get(id) || null, error: null };
  if (s.op === 'insert') { const row = { ...s.payload, updated_at: '2026-11-07T00:00:00Z' }; store.set(id, row); return { data: row, error: null }; }
  if (s.op === 'update') { if (!store.has(id)) return { data: [], error: null }; const row = { ...store.get(id), ...s.payload, updated_at: '2026-11-07T00:00:00Z' }; store.set(id, row); return { data: [row], error: null }; }
  return { data: null, error: { message: 'unexpected' } };
} }), ok: okFn, flags: { accounting: true } });
const hosted = await live.saveContractTerms(dealId, { loanAmount: '', salePrice: '10', salePriceBasis: 'explicit' });
ok(hosted.saved === true && hosted.fields.loanAmount === null && hosted.fields.salePrice === 10, 'a database save that returns the row is kept');
ok((await live.getContractTerms(dealId)).fields.salePrice === 10, 'the following read sees that row');
const blocked = accountingSupabase({ sb: fakeSb({ run(s) {
  if (s.op === 'select') return { data: { deal_id: dealId, posture: 'estimate', sale_price: 10, loan_amount: null, emd_receipt: 'unknown', field_flags: { salePrice: { basis: 'explicit', provisional: true, source: '' } }, warranty_payer: '', hoa_name: '', condo_name: '', deferred_schedule: '', deferred_payee: '', tax_period: '', emd_holder: '', source_note: '', internal_note: '' }, error: null };
  if (s.op === 'update') return { data: [], error: null };
  return { data: null, error: null };
} }), ok: okFn, flags: { accounting: true } });
let threw = false;
try { const saved = await blocked.saveContractTerms(dealId, { salePrice: '12', salePriceBasis: 'explicit' }); threw = !(saved && saved.saved === true); } catch (e) { threw = e.message === CONTRACT_NOT_SAVED; }
ok(threw, 'an update that changes no row is not reported as saved');
const prior = { deal_id: dealId, posture: 'estimate', sale_price: 10, loan_amount: null, emd_receipt: 'unknown', field_flags: { salePrice: { basis: 'explicit', provisional: true, source: '' } }, warranty_payer: '', hoa_name: '', condo_name: '', deferred_schedule: '', deferred_payee: '', tax_period: '', emd_holder: '', source_note: '', internal_note: '' };
const many = accountingSupabase({ sb: fakeSb({ run(s) {
  if (s.op === 'select') return { data: prior, error: null };
  if (s.op === 'update') return { data: [{ ...prior, sale_price: 12 }, { ...prior, sale_price: 99 }], error: null };
  return { data: null, error: null };
} }), ok: okFn, flags: { accounting: true } });
let manyFailed = false;
try { const saved = await many.saveContractTerms(dealId, { salePrice: '12', salePriceBasis: 'explicit' }); manyFailed = !(saved && saved.saved === true); } catch (e) { manyFailed = e.message === CONTRACT_NOT_SAVED; }
ok(manyFailed, 'an update that returns two rows is not reported as saved');
const missingInsert = accountingSupabase({ sb: fakeSb({ run(s) {
  if (s.op === 'select') return { data: null, error: null };
  if (s.op === 'insert') return { data: null, error: null };
  return { data: null, error: null };
} }), ok: okFn, flags: { accounting: true } });
ok(await rejects(() => missingInsert.saveContractTerms(dealId, { salePrice: '12', salePriceBasis: 'explicit' }), new RegExp(CONTRACT_NOT_SAVED)), 'an insert that returns no row is not reported as saved');
const manyInsert = accountingSupabase({ sb: fakeSb({ run(s) {
  if (s.op === 'select') return { data: null, error: null };
  if (s.op === 'insert') return { data: [{ ...prior, sale_price: 12 }, { ...prior, sale_price: 99 }], error: null };
  return { data: null, error: null };
} }), ok: okFn, flags: { accounting: true } });
ok(await rejects(() => manyInsert.saveContractTerms(dealId, { salePrice: '12', salePriceBasis: 'explicit' }), new RegExp(CONTRACT_NOT_SAVED)), 'an insert that returns two rows is not reported as saved');
const denied = accountingSupabase({ sb: fakeSb({ run() { return { data: null, error: { message: 'new row violates row-level security policy' } }; } }), ok: okFn, flags: { accounting: true } });
ok(await rejects(() => denied.saveContractTerms(dealId, { salePrice: '12' }), /row-level security/), 'a database refusal is returned as a failure');
const switchedOff = accountingSupabase({ sb: fakeSb({ access: 'off', run() { return { data: { deal_id: dealId }, error: null }; } }), ok: okFn, flags: { accounting: true } });
ok(await rejects(() => switchedOff.getContractTerms(dealId), /turned off/), 'the database switch still turns the sheet off');

console.log(fail ? fail + ' failed' : 'accounting contract figures passed');
if (fail) process.exit(1);
