/* Post-Closing and E-Recording adapter. Staff only. Outbox is queued, never sent. No hosted project. */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { postClosingSupabase } from '../js/data/supabase-postclosing.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };
const pass = (r) => { if (r && r.error) throw new Error(r.error.message); return r.data; };

function fakeSb(store, calls) {
  return {
    from(name) {
      const q = { op: 'select', filters: [] };
      const api = {
        select() { return api; },
        insert(row) { q.op = 'insert'; q.payload = row; return api; },
        update(row) { q.op = 'update'; q.payload = row; return api; },
        eq(col, val) { q.filters.push([col, val]); return api; },
        is(col, val) { q.filters.push([col, val]); return api; },
        in() { return api; },
        order() { return api; },
        maybeSingle() { return exec(true); },
        single() { return exec(true); },
        then(resolve, reject) { return exec(false).then(resolve, reject); },
      };
      function match(row) { return q.filters.every(([col, val]) => row[col] === val); }
      function exec(one) {
        calls.push({ table: name, op: q.op, payload: q.payload ? JSON.parse(JSON.stringify(q.payload)) : null });
        if (!store[name]) store[name] = [];
        if (q.op === 'insert') {
          const row = { id: name + '-' + (store[name].length + 1), deleted_at: null, ...q.payload };
          store[name].push(row);
          return Promise.resolve({ data: one ? row : [row], error: null });
        }
        const rows = store[name].filter(match);
        if (q.op === 'update') {
          rows.forEach((row) => Object.assign(row, q.payload));
          return Promise.resolve({ data: one ? rows[0] : rows, error: null });
        }
        return Promise.resolve({ data: one ? (rows[0] || null) : rows, error: null });
      }
      return api;
    },
    rpc(name, args) {
      calls.push({ rpc: name, args });
      if (name === 'transition_recording') return Promise.resolve({ data: { ...(store.recording_packages || []).find((r) => r.deal_id === args.p_deal), status: 'ready' }, error: null });
      return Promise.resolve({ data: 'outbox-1', error: null });
    },
  };
}

const deal = { id: 'file-1', file_number: 'MD-26-100', street: '1 Main', city: 'Rockville', state: 'MD', zip: '20850', transaction_type: 'Purchase', closing_date: '2026-11-20', processor_id: null, purchase_price: 100, loan_amount: 80, status: 'Open' };
const staff = async () => ({ id: 'staff-1', role: 'Processor', isAdmin: false });
const flags = { accounting: true, funding: true };
const calls = [];
const store = { deals: [{ ...deal }], post_closing_scanbacks: [], scanback_documents: [], scanback_events: [], recording_packages: [], recording_instruments: [], recording_review_checks: [], recording_events: [], outbox: [], tasks: [], documents: [] };
const api = postClosingSupabase({ sb: fakeSb(store, calls), ok: pass, flags, me: staff });

const before = calls.length;
const empty = await api.getPostClosing('file-1');
const fileReads = calls.slice(before).filter((c) => c.table);
check(fileReads.length === 7 && fileReads.every((c) => c.op === 'select'), 'one file reads 7 tables and writes nothing');
const beforeQ = calls.length;
await api.listPostClosingQueue();
check(calls.slice(beforeQ).filter((c) => c.table).length === 3, 'the staff queue reads 3 tables');
const dealPage = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
check(!dealPage.includes('getPostClosing') && !dealPage.includes('listPostClosingQueue'), 'a file overview does not open post-closing');
check(empty.canEdit === true && empty.scanback == null && empty.recording == null, 'a file with no post-closing row offers a start');
const started = await api.startPostClosing('file-1');
check(started.scanback && started.recording && started.recording.status === 'draft' && started.fundingLink === '#/deals/file-1/funding', 'start creates a scanback and a recording package');
const saved = await api.saveScanback('file-1', { buyerSide: true, faNeeded: true, faStatus: 'not_started', purchaseRefi: 'Purchase', additionalNotes: 'Fake package' });
check(saved.buyerSide === true && saved.faNeeded === true && saved.additionalNotes === 'Fake package', 'the PC package log saves');
const doc = await api.setScanbackDoc('file-1', 'DOCS FOR FA', true);
check(doc.present === true && doc.kind === 'DOCS FOR FA', 'a scanback checklist ref is saved without a real file');
const queued = await api.queueScanback('file-1', 'fa');
const rpc = calls.find((c) => c.rpc === 'queue_staff_outbox');
check(queued.length === 1 && rpc && rpc.args.p_type === 'funding_authorization_secure_portal' && /never sent|Never plain email/.test(rpc.args.p_body) && !calls.some((c) => /send_email|gmail/i.test(c.rpc || '')), 'FA is queued and nothing is sent');

const salesCalls = [];
const sales = postClosingSupabase({ sb: fakeSb(store, salesCalls), ok: pass, flags, me: async () => ({ id: 'sales-1', role: 'Sales Person' }) });
const view = await sales.getPostClosing('file-1');
check(view.canEdit === false, 'sales can read and cannot edit');
let readOnly = '';
try { await sales.saveScanback('file-1', { additionalNotes: 'no' }); } catch (e) { readOnly = e.message; }
check(/Read only/.test(readOnly) && !salesCalls.some((c) => c.op === 'update' || c.op === 'insert'), 'a sales save does not write');

for (const role of ['Outside user', 'Buyer Agent', 'Client-Seller', 'Employee']) {
  const log = [];
  const who = postClosingSupabase({ sb: fakeSb({ deals: [] }, log), ok: pass, flags, me: async () => ({ id: 'x', role, accountRole: role === 'Employee' ? undefined : (role === 'Outside user' ? undefined : 'Outside user') }) });
  let msg = '';
  try { await who.getPostClosing('file-1'); } catch (e) { msg = e.message; }
  check(/staff only/i.test(msg) && log.length === 0, role + ' cannot open post-closing');
}

function walk(file, missing, seen = new Set()) {
  const rel = file.replace(/\\/g, '/');
  if (seen.has(rel)) return seen;
  seen.add(rel);
  const full = path.join(root, rel);
  if (!existsSync(full)) { missing.push(rel); return seen; }
  const text = readFileSync(full, 'utf8');
  const specs = [...text.matchAll(/(?:from|import)\s*\(\s*['"](\.[^'"]+)['"]|from\s+['"](\.[^'"]+)['"]|['"](\.\/[^'"]+\.js)\?v=\d+['"]/g)].map((m) => m[1] || m[2] || m[3]);
  for (const spec of specs) {
    const bare = spec.split('?')[0];
    const next = path.normalize(path.join(path.dirname(rel), bare.endsWith('.js') ? bare : bare + '.js')).replace(/\\/g, '/');
    walk(next, missing, seen);
  }
  return seen;
}
const missing = [];
const seen = walk('js/app.js', missing);
console.log('import walk from js/app.js:', missing.length, 'missing modules');
check(missing.length === 0 && seen.has('js/data/supabase-postclosing.js') && seen.has('js/pages/dealpostclosing.js'), 'the import walk from js/app.js shows 0 missing modules');

console.log(fail ? fail + ' failed' : 'supabase post-closing passed');
process.exit(fail ? 1 : 0);
