/* Title adapter. Staff only. No SSN and nothing sent. No hosted project. */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { titleSupabase } from '../js/data/supabase-title.js';

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
        eq(c, v) { q.filters.push([c, v]); return api; }, is(c, v) { q.filters.push([c, v]); return api; }, in() { return api; },
        maybeSingle() { return exec(true); }, single() { return exec(true); }, then(res, rej) { return exec(false).then(res, rej); },
      };
      function match(row) { return q.filters.every(([c, v]) => row[c] === v); }
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
    rpc() { calls.push({ rpc: true }); return Promise.resolve({ data: { cplNumber: 'CPL-FAKE' }, error: null }); },
  };
}
const deal = { id: 'file-1', file_number: 'MD-26-100', street: '1 Main', city: 'Rockville', state: 'VA', zip: '20850', county: 'Montgomery', transaction_type: 'Purchase', purchase_price: 100, loan_amount: 80, lender_name: 'Example Home Loans (fake)', lender_email: 'lender@example.test', closing_date: '2026-11-20', loan_id_number: '', loss_payee_name: '', uses_mers: null, funding_type: '', first_payment_date: '', interest_type: '', loan_type: '', title_review_status: 'not_started', notes: '' };
const staff = async () => ({ id: 'p1', role: 'Processor' });
const calls = [];
const store = { deals: [{ ...deal }], deal_participants: [], contacts: [], documents: [] };
const api = titleSupabase({ sb: fakeSb(store, calls), ok: pass, flags: { title: true }, me: staff });
const before = calls.length;
const opened = await api.getTitle('file-1');
const openReads = calls.slice(before).filter((c) => c.table);
check(opened.review == null && opened.canEdit === true && opened.steps.length > 0 && opened.progress.total > 0, 'a file with no review still opens the title tab');
check(openReads.length === 4 && openReads.every((c) => c.op === 'select'), 'the checklist reads 4 tables and writes nothing');
const chainCalls = [];
await titleSupabase({ sb: fakeSb({ ...store, deals: store.deals }, chainCalls), ok: pass, flags: { title: true }, me: staff }).getTitle('file-1', { section: 'chain' });
check(chainCalls.filter((c) => c.table).length === 5, 'chain of title adds one table');
const started = await api.startTitleReview('file-1');
check(started.review && store.title_reviews[0].commitment_status === 'draft', 'starting a review writes title_reviews');
await api.saveTitleReview('file-1', { commitmentNumber: 'C-FAKE', underwriter: 'Example Underwriter (fake)' });
check(store.title_reviews[0].commitment_number === 'C-FAKE', 'the review form saves');
let ssn = '';
try { await api.savePacerSearch('file-1', { partyName: 'Ann', notes: 'SSN 123-45-6789' }); } catch (e) { ssn = e.message; }
check(/SSN/i.test(ssn), 'an SSN is not stored');
const outside = [];
const buyer = titleSupabase({ sb: fakeSb(store, outside), ok: pass, flags: { title: true }, me: async () => ({ id: 'b', role: 'Outside user' }) });
let msg = '';
try { await buyer.getTitle('file-1'); } catch (e) { msg = e.message; }
check(/staff only/i.test(msg) && outside.length === 0, 'an outside user cannot open title');
check(!calls.some((c) => c.table === 'outbox'), 'opening and saving title does not queue mail');
const dealPage = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
check(!dealPage.includes('getTitle('), 'a file overview does not open title');
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
check(missing.length === 0 && seen.has('js/data/supabase-title.js') && seen.has('js/pages/dealtitle.js'), 'the import walk from js/app.js shows 0 missing modules');
console.log(fail ? fail + ' failed' : 'supabase title passed');
process.exit(fail ? 1 : 0);
