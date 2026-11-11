/* Contract figures: a save the database kept must not report "not saved" because jsonb reordered the flag keys.
 * Fake client only (it reorders keys the way Postgres jsonb does). No network, no hosted database. */
import { accountingSupabase } from '../js/data/supabase-accounting.js';
import { canonicalJson, contractMismatch, cleanContractTerms, fromContractRow, toContractRow, CONTRACT_NOT_SAVED } from '../js/data/contract-terms.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

// Postgres jsonb object key order: shorter keys first, then bytewise. Applied recursively.
const pgKeyOrder = (a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0);
const asJsonb = (v) => (Array.isArray(v) ? v.map(asJsonb) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort(pgKeyOrder).map((k) => [k, asJsonb(v[k])])) : v);

// Same flag keys as the Evarts and Harbor saves on TEST (read-only check: stored order emdAmount,salePrice / taxLevy,loanRate,emdAmount,salePrice,...)
const input = { salePrice: '515000', salePriceBasis: 'explicit', emdAmount: '10000', emdAmountBasis: 'explicit', emdAmountSource: 'Contract p.2', loanRate: '6.25', loanRateBasis: 'quoted' };
const clean = cleanContractTerms(input);
const sentOrder = Object.keys(clean.flags).join(',');
const storedOrder = Object.keys(asJsonb(clean.flags)).join(',');
ok(sentOrder !== storedOrder, `the fake reorders like jsonb (${sentOrder} -> ${storedOrder})`);

const back = fromContractRow({ ...toContractRow(clean), field_flags: asJsonb(toContractRow(clean).field_flags), updated_at: '2026-11-09T14:00:00Z' });
const legacyMismatch = JSON.stringify(clean.flags) !== JSON.stringify(back.flags);
ok(legacyMismatch, 'reproduced: the old order-sensitive compare called this saved row different');
ok(contractMismatch(clean, back) === null, 'the same flags in a different key order are the same');
ok(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 2 }] } }) === canonicalJson({ a: { c: [3, { e: 2, f: 1 }], d: 2 }, b: 1 }), 'content compare ignores key order at every level');
ok(canonicalJson([1, 2]) !== canonicalJson([2, 1]), 'array order still counts');

// A real difference is still caught
ok(contractMismatch(clean, { ...back, flags: { ...back.flags, emdAmount: { ...back.flags.emdAmount, source: 'changed' } } }) === 'flags', 'a changed source is still a failed save');
const dropped = { ...back.flags }; delete dropped.loanRate;
ok(contractMismatch(clean, { ...back, flags: dropped }) === 'flags', 'a dropped flag is still a failed save');
ok(contractMismatch(clean, { ...back, fields: { ...back.fields, salePrice: 1 } }) === 'salePrice', 'a changed figure is still a failed save');

// End to end through the hosted adapter with a fake client that stores jsonb
function fakeSb({ existing = null, tamper = null } = {}) {
  let row = existing;
  let deal = { transaction_type: 'Purchase', emd_amount: null, emd_due_date: null, financial: {} };
  const writes = [];
  const table = (name) => {
    const q = { _op: 'select', _payload: null };
    const done = async () => {
      if (name === 'deals') {
        // PR 187: earnest money and commissions live on the order; the contract sheet reads and writes them there.
        if (q._op === 'update') { deal = { ...deal, ...q._payload }; return { data: [deal], error: null }; }
        return { data: deal, error: null };
      }
      if (name !== 'accounting_contract_terms') return { data: null, error: { message: 'unexpected table ' + name } };
      if (q._op === 'update' || q._op === 'insert') {
        writes.push(q._op);
        const stored = { ...(row || { deal_id: 'deal-x' }), ...q._payload, field_flags: asJsonb(q._payload.field_flags), updated_at: '2026-11-09T14:00:00Z' };
        row = tamper ? tamper(stored) : stored;
        return { data: q._op === 'update' ? [row] : row, error: null };
      }
      return { data: row, error: null };
    };
    Object.assign(q, {
      select() { return q; }, eq() { return q; },
      update(p) { q._op = 'update'; q._payload = p; return q; },
      insert(p) { q._op = 'insert'; q._payload = p; return q; },
      maybeSingle: done, single: done, then(res, rej) { return done().then(res, rej); },
    });
    return q;
  };
  return { writes, from: table, rpc: async (fn) => ({ data: fn === 'accounting_access' ? 'edit' : null, error: null }) };
}
const okr = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
const sb1 = fakeSb();
const api1 = accountingSupabase({ sb: sb1, ok: okr, flags: { accounting: true } });
const saved = await api1.saveContractTerms('deal-x', input);
ok(saved.saved === true && sb1.writes.join() === 'insert' && saved.fields.salePrice === 515000, 'a first save that the database kept shows success');
const again = await api1.saveContractTerms('deal-x', { ...input, salePrice: '520000' });
ok(again.saved === true && sb1.writes.join() === 'insert,update' && again.fields.salePrice === 520000, 'an edit that the database kept shows success');
const same = await api1.saveContractTerms('deal-x', { ...input, salePrice: '520000' });
ok(same.saved === true && sb1.writes.length === 2, 'saving unchanged figures does not write again');
const sb2 = fakeSb({ tamper: (r) => ({ ...r, field_flags: { ...r.field_flags, salePrice: { ...r.field_flags.salePrice, basis: 'derived' } } }) });
let msg = '';
try { await accountingSupabase({ sb: sb2, ok: okr, flags: { accounting: true } }).saveContractTerms('deal-x', input); } catch (e) { msg = e.message; }
ok(msg === CONTRACT_NOT_SAVED, 'a row that came back different still says not saved');

console.log(fail ? fail + ' failed' : 'accounting flags order passed');
if (fail) process.exit(1);
