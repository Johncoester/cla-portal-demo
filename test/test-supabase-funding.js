/* Funding adapter. Staff only. No bank send and no hosted project. */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fundingSupabase } from '../js/data/supabase-funding.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };
const pass = (r) => { if (r && r.error) throw new Error(r.error.message); return r.data; };

function fakeSb(store, calls) {
  return {
    from(name) {
      const q = { op: 'select', filters: [] };
      const api = {
        select() { return api; }, insert(row) { q.op = 'insert'; q.payload = row; return api; }, update(row) { q.op = 'update'; q.payload = row; return api; },
        eq(col, val) { q.filters.push([col, val]); return api; }, is(col, val) { q.filters.push([col, val]); return api; }, in() { return api; },
        maybeSingle() { return exec(true); }, single() { return exec(true); }, then(resolve, reject) { return exec(false).then(resolve, reject); },
      };
      function match(row) { return q.filters.every(([col, val]) => row[col] === val); }
      function exec(one) {
        calls.push({ table: name, op: q.op });
        if (!store[name]) store[name] = [];
        if (q.op === 'insert') { const row = { id: name + '-' + (store[name].length + 1), deleted_at: null, ...q.payload }; store[name].push(row); return Promise.resolve({ data: one ? row : [row], error: null }); }
        const rows = store[name].filter(match);
        if (q.op === 'update') { rows.forEach((row) => Object.assign(row, q.payload)); return Promise.resolve({ data: one ? rows[0] : rows, error: null }); }
        return Promise.resolve({ data: one ? (rows[0] || null) : rows, error: null });
      }
      return api;
    },
    rpc(name, args) { calls.push({ rpc: name, args }); return Promise.resolve({ data: 'queued', error: null }); },
  };
}
const deal = { id: 'file-1', file_number: 'MD-26-100', street: '1 Main', city: 'Rockville', state: 'MD', zip: '20850', processor_id: null, transaction_type: 'Purchase', closing_date: '2026-11-20', open_date: '2026-11-01', status: 'Open', stage: 2, lender_name: 'Example Home Loans (fake)', purchase_price: 100, loan_amount: 80 };
const staff = async () => ({ id: 'p1', role: 'Funding Team' });
const flags = { funding: true, accounting: true };
const calls = [];
const store = { deals: [{ ...deal }], funding_records: [], funding_funds: [], funding_checks: [], funding_disbursements: [], accounting_fees: [], tasks: [], deal_participants: [], contacts: [] };
const api = fundingSupabase({ sb: fakeSb(store, calls), ok: pass, flags, me: staff });
const opened = await api.getFunding('file-1');
check(opened.record && opened.record.status === 'pending' && opened.funds.length === 3 && opened.disbursements.some((d) => !d.id), 'opening funding creates the record and shows the three fund lines');
const saved = await api.saveFunding('file-1', { lender: 'Example Home Loans (fake)', balancedWithLender: 'true', sellerProceedsAmount: '10', checksDisbursed: '2' });
check(saved.record.lender.includes('fake') && saved.record.balancedWithLender === true && saved.record.sellerProceedsAmount === 10, 'funding figures save');
await api.saveFundingFund('file-1', 'emd', { status: 'received', pending: 'false', amount: '5' });
check(store.funding_funds[0].kind === 'emd' && store.funding_funds[0].status === 'received', 'a fund receipt saves');
const outside = [];
const buyer = fundingSupabase({ sb: fakeSb(store, outside), ok: pass, flags, me: async () => ({ id: 'b', role: 'Outside user' }) });
let msg = '';
try { await buyer.getFunding('file-1'); } catch (e) { msg = e.message; }
check(/Funding Team and CLA Admins only/.test(msg) && outside.length === 0, 'an outside user is refused before a funding read');
for (const role of ['Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent', 'Transaction Coordinator', 'Employee']) {
  const log = [];
  const who = fundingSupabase({ sb: fakeSb(store, log), ok: pass, flags, me: async () => ({ id: 'x', role }) });
  let m = '';
  try { await who.saveFunding('file-1', { lender: 'x' }); } catch (e) { m = e.message; }
  check(/CLA Admins only/.test(m) && log.length === 0, role + ' cannot save funding');
}
const off = fundingSupabase({ sb: fakeSb(store, []), ok: pass, flags: { funding: false }, me: staff });
let offMsg = '';
try { await off.listFundingQueue(); } catch (e) { offMsg = e.message; }
check(/turned off/.test(offMsg), 'the funding flag refuses the queue');
check(!calls.some((c) => /send/i.test(c.rpc || '')), 'opening and saving funding does not send');

function walk(file, missing, seen = new Set()) {
  const rel = file.replace(/\\/g, '/');
  if (seen.has(rel)) return seen;
  seen.add(rel);
  if (!existsSync(path.join(root, rel))) { missing.push(rel); return seen; }
  const text = readFileSync(path.join(root, rel), 'utf8');
  const specs = [...text.matchAll(/(?:from|import)\s*\(\s*['"](\.[^'"]+)['"]|from\s+['"](\.[^'"]+)['"]|['"](\.\/[^'"]+\.js)\?v=\d+['"]/g)].map((m) => m[1] || m[2] || m[3]);
  for (const spec of specs) {
    const bare = spec.split('?')[0];
    walk(path.normalize(path.join(path.dirname(rel), bare.endsWith('.js') ? bare : bare + '.js')).replace(/\\/g, '/'), missing, seen);
  }
  return seen;
}
const missing = [];
const seen = walk('js/app.js', missing);
console.log('import walk from js/app.js:', missing.length, 'missing modules');
check(missing.length === 0 && seen.has('js/data/supabase-funding.js'), 'the import walk from js/app.js shows 0 missing modules');
console.log(fail ? fail + ' failed' : 'supabase funding passed');
process.exit(fail ? 1 : 0);
