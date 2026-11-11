/* John t1500u (Nov 11): Place Order failed on TEST with a blank Parcel ID:
 * 'null value in column "parcel_id" of relation "deals" violates not-null constraint'.
 * deals.parcel_id is text NOT NULL DEFAULT ''. createDeal and updateDeal must send '' for a blank parcel, never null.
 * Real adapter, fake client that refuses null in the deals NOT NULL text columns like the database does. No hosted project.
 * Run: node --import ./test/register-supabase-fake.mjs test/test-place-order-blank-parcel.js */
import { createSupabaseAdapter } from '../js/data/supabase-adapter.js';

let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };

// deals text columns that are NOT NULL on TEST (information_schema, Nov 11) and that these two writes can set
const NOT_NULL_TEXT = ['parcel_id', 'street', 'city', 'state', 'zip', 'county', 'notes', 'lender_name', 'lender_contact', 'lender_phone', 'lender_email',
  'loss_payee_name', 'primary_residence', 'first_time_buyer', 'closer_name', 'closing_time', 'lender_address', 'cpl_address', 'mortgage_broker_name'];
const writes = [];
const refuse = (row) => { const bad = NOT_NULL_TEXT.find((c) => c in row && row[c] === null); return bad ? { code: '23502', message: `null value in column "${bad}" of relation "deals" violates not-null constraint` } : null; };
const client = {
  auth: { onAuthStateChange() {}, async getUser() { return { data: { user: { id: 'u1' } } }; }, async signOut() { return { error: null }; } },
  from(table) {
    return {
      insert(row) { writes.push({ kind: 'insert', table, row }); const err = refuse(row);
        return { select() { return { async single() { return err ? { data: null, error: err } : { data: { id: 'd-new', file_number: 'MD-26-00001', ...row }, error: null }; } }; } }; },
      update(row) { writes.push({ kind: 'update', table, row }); const err = refuse(row); return { async eq() { return { data: null, error: err }; } }; },
      select() { return this; }, eq() { return this; }, async single() { return { data: null, error: null }; },
      then(res) { return Promise.resolve({ data: [], error: null }).then(res); },
    };
  },
  async rpc() { return { data: [], error: null }; },
  functions: {},
};
globalThis.__fakeSB = client;
const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });

const base = { street: '1 No Parcel Ln', city: 'Annapolis', state: 'MD', zip: '21401', county: 'Anne Arundel', transactionType: 'Purchase', purchasePrice: '100000' };
for (const [label, extra] of [['Parcel ID left blank', { parcelId: '' }], ['Parcel ID only spaces', { parcelId: '   ' }], ['blank Parcel ID and an empty list', { parcelId: '', parcelIds: [] }], ['no Parcel ID field at all', {}]]) {
  writes.length = 0;
  let err = null;
  try { await api.createDeal({ ...base, ...extra }); } catch (e) { err = e; }
  const ins = writes.find((w) => w.kind === 'insert' && w.table === 'deals');
  check(!err, `Place Order saves with ${label}${err ? ': ' + err.message : ''}`);
  check(ins && (!('parcel_id' in ins.row) || ins.row.parcel_id === ''), `${label}: parcel_id is '' or left to the column default, never null`);
}

writes.length = 0;
let uerr = null;
try { await api.updateDeal('d-new', { parcelId: '' }); } catch (e) { uerr = e; }
const up = writes.find((w) => w.kind === 'update' && w.table === 'deals');
// the fake has no row to read back after the update, so only a not-null refusal counts as a failure here
check(up && up.row.parcel_id === '' && !(uerr && /not-null/.test(uerr.message)), 'clearing the Parcel ID on an existing order saves parcel_id as an empty string');

writes.length = 0;
await api.createDeal({ ...base, parcelId: 'P-1', parcelIds: ['P-1', 'P-2'] });
const kept = writes.find((w) => w.kind === 'insert');
check(kept.row.parcel_id === 'P-1', 'a typed Parcel ID is still saved');

console.log(fail ? fail + ' failed' : 'place order blank parcel passed');
if (fail) process.exit(1);
