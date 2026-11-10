/* Wires adapter: staff-only, last four digits, no bank send. No hosted project. */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wiresSupabase, wireLast4 } from '../js/data/supabase-wires.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const ok = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };

function fakeSb(store, calls) {
  return {
    from(name) {
      const q = { op: 'select', filters: [] };
      const api = {
        select() { return api; },
        insert(row) { q.op = 'insert'; q.payload = row; return api; },
        update(row) { q.op = 'update'; q.payload = row; return api; },
        eq(col, val) { q.filters.push([col, val]); return api; },
        in(col, vals) { q.filters.push([col, vals, 'in']); return api; },
        is(col, val) { q.filters.push([col, val]); return api; },
        order() { return api; },
        maybeSingle() { return exec(true); },
        single() { return exec(true); },
        then(resolve, reject) { return exec(false).then(resolve, reject); },
      };
      function match(row) { return q.filters.every(([col, val, op]) => op === 'in' ? val.includes(row[col]) : row[col] === val); }
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
    rpc(name, args) { calls.push({ rpc: name, args }); return Promise.resolve({ data: true, error: null }); },
  };
}

const pass = (r) => { if (r && r.error) throw new Error(r.error.message); return r.data; };
const deal = { id: 'file-1', file_number: 'MD-26-100', street: '1 Main', city: 'Rockville', state: 'MD', zip: '20850', processor_id: null, transaction_type: 'Purchase', closing_date: '2026-11-20', open_date: '2026-11-01', status: 'Open', stage: 2 };
const escrow = { id: '11111111-1111-4111-8111-111111111111', state: 'MD', account_name: 'CLA Maryland Escrow (FAKE)', account_last4: '1001', active: true, deleted_at: null };
const staff = async () => ({ id: 'staff-1', role: 'Processor', isAdmin: false });
const flags = { wires: true };

ok(wireLast4('4242', 'Account number') === '4242' && wireLast4('•••• 4242', 'Account number') === '4242', 'a masked account keeps the same four digits');
let refused = false;
try { wireLast4('123456789', 'Account number'); } catch (e) { refused = /last four/i.test(e.message); }
ok(refused, 'a full account number is refused');

const calls = [];
const store = { deals: [{ ...deal }], escrow_accounts: [{ ...escrow }], wire_records: [], wire_audit_log: [], tasks: [] };
const api = wiresSupabase({ sb: fakeSb(store, calls), ok: pass, flags, me: staff });
const beforeOpen = calls.length;
const opened = await api.getWire('file-1');
const openCalls = calls.slice(beforeOpen).filter((c) => c.table);
ok(openCalls.length === 3 && openCalls.every((c) => c.op === 'select') && openCalls.map((c) => c.table).sort().join() === 'deals,escrow_accounts,wire_records', 'opening one file reads 3 tables and writes nothing');
ok(opened.canEdit === true && opened.wires.length === 1 && opened.wires[0].id === '' && opened.escrowAccounts[0].accountMasked === '•••• 1001' && !('accountLast4' in opened.escrowAccounts[0]), 'an empty file opens one unsaved wire and a masked escrow account');

const saved = await api.saveWire('file-1', { payeeName: 'Seller Example', disbursementMethod: 'wire', amount: '1500', accountLast4: '•••• 4242', abaLast4: '9999', fromAccountId: escrow.id, allSellersSigned: 'true', notarized: 'true', payeeNameMatches: 'true', payeeAddressMatches: 'true', recipientName: 'Seller Example', bankName: 'Example Bank', beneficiaryMessage: 'Seller proceeds FAKE' });
const inserted = calls.find((c) => c.table === 'wire_records' && c.op === 'insert');
ok(saved.accountLast4 === '•••• 4242' && saved.abaLast4 === '•••• 9999' && saved.accountMasked === '•••• 4242' && inserted && inserted.payload.account_last4 === '4242' && inserted.payload.aba_last4 === '9999', 'the save stores four digits and the screen value is masked');
ok(inserted.payload.status === 'Drafted' && inserted.payload.account_last4.length === 4 && inserted.payload.aba_last4.length === 4 && inserted.payload.posted_at == null, 'the stored wire keeps only the last four and is not sent');

const outsideCalls = [];
const outside = wiresSupabase({ sb: fakeSb(store, outsideCalls), ok: pass, flags, me: async () => ({ id: 'out-1', role: 'Outside user' }) });
let blocked = '';
try { await outside.getWire('file-1'); } catch (e) { blocked = e.message; }
ok(/Funding Team and CLA Admins only/i.test(blocked) && outsideCalls.length === 0, 'an outside user is refused before any wire read');
for (const role of ['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller', 'Employee']) {
  const log = [];
  const who = wiresSupabase({ sb: fakeSb(store, log), ok: pass, flags, me: async () => ({ id: 'x', role, accountRole: role === 'Employee' ? undefined : 'Outside user' }) });
  let msg = '';
  try { await who.saveWire('file-1', { accountLast4: '4242' }); } catch (e) { msg = e.message; }
  ok(/CLA Admins only|sign in/i.test(msg) && log.length === 0, role + ' cannot save a wire');
}
const off = wiresSupabase({ sb: fakeSb(store, []), ok: pass, flags: { wires: false }, me: staff });
let offMsg = '';
try { await off.listWireQueue(); } catch (e) { offMsg = e.message; }
ok(/turned off/i.test(offMsg), 'the wires flag refuses the queue');

const verified = await api.verifyWire(saved.id, { auditAmount: 'true', auditAccountName: 'true', auditAccountNumber: 'true', auditAba: 'true', auditPurpose: 'true' });
ok(verified.status === 'Verified' && store.wire_audit_log.length === 1 && store.wire_audit_log[0].account_number === true, 'verification records the audit without a bank number');
ok(await api.postWireDisbursement(saved.id) === true && store.wire_records[0].queue_status === 'Done' && store.tasks[0].title === 'Wire Setup' && store.tasks[0].status === 'done', 'posting completes the wire task and does not send');
ok(!calls.some((c) => c.rpc && c.rpc !== 'set_task_status') && !calls.some((c) => /send|wire_transfer|bank/i.test(c.rpc || '')), 'no outbound send is called');

const proc = wiresSupabase({ sb: fakeSb(store, []), ok: pass, flags, me: staff });
let adminOnly = '';
try { await proc.saveEscrowAccount({ state: 'MD', accountName: 'Other', accountLast4: '1001' }); } catch (e) { adminOnly = e.message; }
ok(/Admin/i.test(adminOnly), 'a processor cannot change escrow accounts');
const queueCalls = [];
const queueApi = wiresSupabase({ sb: fakeSb({ wire_records: [], deals: [] }, queueCalls), ok: pass, flags, me: staff });
await queueApi.listWireQueue();
ok(queueCalls.filter((c) => c.table).length === 1 && queueCalls[0].table === 'wire_records', 'an empty wire queue reads one table');
const dealPage = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(!dealPage.includes('getWire(') && !dealPage.includes('listWireQueue'), 'a file overview does not call the wires tab');
const fwp = readFileSync(new URL('../js/pages/dealfwp.js', import.meta.url), 'utf8');
ok(fwp.includes("kind === 'wires' && sec === 'queue'") && fwp.includes('listWireQueue()'), 'the wire queue does not load this file first');

function walk(file, missing, seen = new Set()) {
  const rel = file.replace(/\\/g, '/');
  if (seen.has(rel)) return seen;
  seen.add(rel);
  const full = path.join(root, rel);
  if (!existsSync(full)) { missing.push(rel); return seen; }
  const text = readFileSync(full, 'utf8');
  const specs = [
    ...text.matchAll(/(?:from|import)\s*\(\s*['"](\.[^'"]+)['"]|from\s+['"](\.[^'"]+)['"]/g),
    ...text.matchAll(/['"](\.\/[^'"]+\.js)\?v=\d+['"]/g),
  ].map((m) => m[1] || m[2]);
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
ok(missing.length === 0 && seen.has('js/data/supabase-wires.js') && seen.has('js/pages/dealfwp.js'), 'the import walk from js/app.js shows 0 missing modules');
if (missing.length) console.log(missing.join('\n'));

console.log(fail ? fail + ' failed' : 'supabase wires passed');
process.exit(fail ? 1 : 0);
