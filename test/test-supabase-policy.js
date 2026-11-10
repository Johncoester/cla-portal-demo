/* Final Policy adapter. Staff only. Nothing is sent. No hosted project. */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { policySupabase } from '../js/data/supabase-policy.js';

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
        eq(c, v) { q.filters.push([c, v]); return api; }, is(c, v) { q.filters.push([c, v]); return api; }, order() { return api; }, in() { return api; },
        maybeSingle() { return exec(true); }, single() { return exec(true); }, then(res, rej) { return exec(false).then(res, rej); },
      };
      function match(row) { return q.filters.every(([c, v]) => row[c] === v); }
      function exec(one) {
        calls.push({ table: name, op: q.op, payload: q.payload });
        if (!store[name]) store[name] = [];
        if (q.op === 'insert') { const row = { id: name + '-' + (store[name].length + 1), deleted_at: null, riders: [], required_endorsements: [], endorsements: [], ...q.payload }; store[name].push(row); return Promise.resolve({ data: one ? row : [row], error: null }); }
        const rows = store[name].filter(match);
        if (q.op === 'update') { rows.forEach((row) => Object.assign(row, q.payload)); return Promise.resolve({ data: one ? rows[0] : rows, error: null }); }
        return Promise.resolve({ data: one ? (rows[0] || null) : rows, error: null });
      }
      return api;
    },
    rpc(name, args) { calls.push({ rpc: name, args }); return Promise.resolve({ data: name === 'policy_title_data' ? { underwriter: 'Example Underwriter (fake)', commitment_number: 'C-1', commitment_status: 'draft' } : 'queued', error: null }); },
  };
}
const deal = { id: 'file-1', file_number: 'MD-26-100', street: '1 Main', city: 'Rockville', state: 'MD', zip: '20850', processor_id: null, transaction_type: 'Purchase', closing_date: '2026-11-20', open_date: '2026-11-01', status: 'Open', stage: 2, lender_name: 'Example Home Loans (fake)', purchase_price: 100, loan_amount: 80 };
const staff = async () => ({ id: 'p1', role: 'Processor' });
const flags = { policy: true };
const calls = [];
const store = { deals: [{ ...deal }] };
const api = policySupabase({ sb: fakeSb(store, calls), ok: pass, flags, me: staff });
const opened = await api.getPolicy('file-1');
check(opened.record && opened.record.status === 'pending' && opened.title.underwriter.includes('fake') && Array.isArray(opened.record.requiredEndorsements), 'opening final policy creates the record and reuses title fields');
const saved = await api.savePolicy('file-1', { balancedFunded: 'true', ownerPremium: '100', altaOwnerCollected: '100', lenderPremium: '50', altaLenderCollected: '50', ownerSignatory: 'A Clerk', lenderSignatory: 'A Clerk' });
check(saved.record.balancedFunded === true && saved.record.ownerPremium === 100 && saved.record.ownerSignatory === 'A Clerk', 'policy setup saves');
const outside = [];
const buyer = policySupabase({ sb: fakeSb(store, outside), ok: pass, flags, me: async () => ({ id: 'b', role: 'Client-Buyer' }) });
let msg = '';
try { await buyer.getPolicy('file-1'); } catch (e) { msg = e.message; }
check(/CLA Admins only/.test(msg) && outside.length === 0, 'a buyer cannot open final policy');
check(!calls.some((c) => /send_email|gmail/i.test(c.rpc || '')), 'loading and saving policy does not send');
function walk(file, missing, seen = new Set()) {
  const rel = file.replace(/\\/g, '/');
  if (seen.has(rel)) return seen;
  seen.add(rel);
  if (!existsSync(path.join(root, rel))) { missing.push(rel); return seen; }
  const text = readFileSync(path.join(root, rel), 'utf8');
  const specs = [...text.matchAll(/(?:from|import)\s*\(\s*['"](\.[^'"]+)['"]|from\s+['"](\.[^'"]+)['"]|['"](\.\/[^'"]+\.js)\?v=\d+['"]/g)].map((m) => m[1] || m[2] || m[3]);
  for (const spec of specs) { const bare = spec.split('?')[0]; walk(path.normalize(path.join(path.dirname(rel), bare.endsWith('.js') ? bare : bare + '.js')).replace(/\\/g, '/'), missing, seen); }
  return seen;
}
const missing = [];
const seen = walk('js/app.js', missing);
console.log('import walk from js/app.js:', missing.length, 'missing modules');
check(missing.length === 0 && seen.has('js/data/supabase-policy.js'), 'the import walk from js/app.js shows 0 missing modules');
console.log(fail ? fail + ' failed' : 'supabase policy passed');
process.exit(fail ? 1 : 0);
