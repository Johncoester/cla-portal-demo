/* John, Nov 9: assign / change a file's Processor at any time. Activity row + one in-app notification (SQL trigger), Unassigned badge and
   filter on Orders and the Work Queue, real processor names on hosted orders. No hosted project, no secrets.
   Run: node --import ./test/register-supabase-fake.mjs test/test-processor-assign.js */
import { readFileSync } from 'node:fs';
import { isUnassigned, unassignedOpen, processorFields, missingProcessorIds, nameOfProfile } from '../js/data/processor-assign.js';
import { filterDeals } from '../js/data/task-board.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ---- helpers ----
const deals = [
  { id: 'a', status: 'Open', processorId: null, fileNumber: 'MD-1' },
  { id: 'b', status: 'Open', processorId: 'p1', fileNumber: 'MD-2' },
  { id: 'c', status: 'Closed', processorId: null, fileNumber: 'MD-3' },
  { id: 'd', status: 'Open', processorId: '', fileNumber: 'MD-4' },
];
ok(isUnassigned(deals[0]) && !isUnassigned(deals[1]) && isUnassigned(deals[3]), 'null or blank processorId = Unassigned');
ok(unassignedOpen(deals).map((d) => d.id).join() === 'a,d', 'Work Queue count = open files with no Processor only');
ok(filterDeals(deals, { processor: 'unassigned' }).map((d) => d.id).join() === 'a,c,d', 'Orders filter: Unassigned');
ok(filterDeals(deals, { processor: 'assigned' }).map((d) => d.id).join() === 'b', 'Orders filter: Assigned');
ok(filterDeals(deals, {}).length === 4, 'Orders filter: Any keeps every file');
const names = new Map([['p1', 'Test Processor']]);
ok(processorFields(deals[1], names).processorName === 'Test Processor' && processorFields(deals[1], names).processorUnassigned === false, 'hosted processorName comes from the name map');
ok(processorFields(deals[0], names).processorName === '' && processorFields(deals[0], names).processorUnassigned === true, 'no Processor = blank name + unassigned flag');
ok(processorFields({ processorId: 'zz' }, names).processorName === '', 'an unknown id leaves the name blank (no guess)');
ok(missingProcessorIds([{ processorId: 'p1' }, { processorId: 'p9' }, { processorId: 'p9' }, { processorId: null }], names).join() === 'p9', 'only uncovered ids are looked up, once');
ok(nameOfProfile({ first_name: 'Test', last_name: 'Processor' }) === 'Test Processor' && nameOfProfile({ firstName: 'A', lastName: '' }) === 'A', 'profile names from either key style');

// ---- SQL migration + rollback ----
const mig = read('supabase/migrations/20261109160000_deal_processor_audit_notify.sql');
const rb = read('supabase/rollbacks/20261109160000_deal_processor_audit_notify.sql');
ok(/security definer set search_path = pg_catalog, public, extensions/.test(mig), 'trigger function is SECURITY DEFINER with a fixed search_path');
ok(/after update of processor_id on public\.deals\s+for each row when \(old\.processor_id is distinct from new\.processor_id\)/.test(mig), 'trigger fires only when processor_id actually changes');
ok(mig.includes("'deal.processor'") && mig.includes("'Processor set to '") && mig.includes("'Processor unassigned'"), 'activity wording matches the mock adapter');
ok(/private\.notify\(array\[new\.processor_id\], 'processor'/.test(mig) && mig.includes("'#/deals/' || new.id::text"), 'one notification for the new Processor with a link to the file');
ok(mig.indexOf("'Processor unassigned'") < mig.indexOf('private.notify(') && /Processor unassigned'\);\s*return new;/.test(mig), 'unassign logs and returns before any notification');
ok(!/\b(create|alter|drop) policy\b/i.test(mig) && !/private\.(can_access_deal|deal_roles|crm_\w+_visible)/.test(mig), 'no RLS policy or visibility helper is touched');
ok(!/\b(email|sms|outbox|net\.http|pg_net)\b/i.test(mig.replace(/^--.*$/gm, '').replace(/p\.email/g, '')), 'in-app only: no email, SMS or outbox');
ok(/raise exception 'drift:/.test(mig) && mig.includes('0bd05140a5c19aa77dbbe906f73aa50f'), 'guarded against drift');
ok(/drop trigger if exists deals_processor_activity on public\.deals;/.test(rb) && /drop function if exists private\.trg_deal_processor\(\);/.test(rb), 'rollback drops exactly the trigger and function');

// ---- pages ----
const orders = read('js/pages/orders.js'); const dash = read('js/pages/dashboard.js'); const deal = read('js/pages/deal.js');
ok(orders.includes('data-unassigned') && orders.includes('name="processor"') && orders.includes("processor: f.get('processor')"), 'Orders: Unassigned badge and Processor filter');
ok(orders.includes("q.get('p')") && dash.includes("#/orders?s=Open&p=unassigned"), 'Work Queue links straight to the Unassigned filter');
ok(/async function processor[\s\S]*?unassignedCard\(open\)/.test(dash) && /async function admin[\s\S]*?unassignedCard\(open\)/.test(dash), 'Work Queue and Admin overview show Unassigned files');
ok(deal.includes('data-unassigned-processor') && deal.includes('data-processor-name'), 'file header shows the real name or an Unassigned badge');

// ---- hosted adapter: processorName on listDeals / getDeal ----
const reads = [];
const q = (table) => { const st = { table, filters: [] }; const api = {
  select() { return api; }, eq(c, v) { st.filters.push(['eq', c, v]); return api; }, in(c, v) { st.filters.push(['in', c, v]); return api; }, order() { return api; }, is() { return api; },
  single() { return Promise.resolve(res(st, true)); }, maybeSingle() { return Promise.resolve(res(st, true)); }, then(a, b) { return Promise.resolve(res(st, false)).then(a, b); } }; return api; };
const dealRows = [{ id: 'd1', file_number: 'MD-1', street: '1 A St', city: 'X', state: 'MD', zip: '20000', status: 'Open', processor_id: null },
  { id: 'd2', file_number: 'MD-2', street: '2 B St', city: 'X', state: 'MD', zip: '20000', status: 'Open', processor_id: 'tp' },
  { id: 'd3', file_number: 'MD-3', street: '3 C St', city: 'X', state: 'MD', zip: '20000', status: 'Open', processor_id: 'oldrole' }];
function res(st, single) {
  reads.push(st);
  if (st.table === 'deals') { const id = (st.filters.find((f) => f[0] === 'eq' && f[1] === 'id') || [])[2]; const rows = id ? dealRows.filter((r) => r.id === id) : dealRows; return { data: single ? rows[0] : rows, error: null }; }
  if (st.table === 'profiles') { const byId = st.filters.find((f) => f[0] === 'in' && f[1] === 'id'); if (byId) return { data: byId[2].includes('oldrole') ? [{ id: 'oldrole', first_name: 'Former', last_name: 'Proc' }] : [], error: null };
    return { data: [{ id: 'tp', first_name: 'Test', last_name: 'Processor' }], error: null }; }
  return { data: single ? null : [], error: null, count: 0 };
}
globalThis.__fakeSB = { auth: { onAuthStateChange() {}, getUser: async () => ({ data: { user: { id: 'u1' } } }), signOut: async () => ({}) },
  rpc: async (name) => ({ data: name === 'my_profile' ? { id: 'u1', role: 'Processor', status: 'active' } : name === 'demo_view_status' ? { active: false } : [], error: null }),
  from: (t) => q(t), functions: { invoke: async () => ({ data: {}, error: null }) } };
try {
  const { createSupabaseAdapter } = await import('../js/data/supabase-adapter.js');
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  const list = await api.listDeals({ status: 'All' });
  const by = Object.fromEntries(list.map((d) => [d.id, d]));
  ok(by.d2.processorName === 'Test Processor' && by.d2.processorUnassigned === false, 'hosted listDeals carries the real processor name');
  ok(by.d1.processorName === '' && by.d1.processorUnassigned === true, 'hosted listDeals marks the unassigned file');
  ok(by.d3.processorName === 'Former Proc', 'a Processor outside the pick roles is looked up once by id');
  const one = await api.getDeal('d2');
  ok(one.processorName === 'Test Processor', 'hosted getDeal carries the real processor name');
  const staffReads = reads.filter((r) => r.table === 'profiles' && r.filters.some((f) => f[1] === 'role'));
  ok(staffReads.length === 1, 'the staff-name read is shared between list and file reads (one request)');
} catch (e) { fail += 1; console.log('FAIL hosted adapter check threw:', e && e.message); }

console.log(fail ? fail + ' failed' : 'processor assign passed');
if (fail) process.exit(1);
