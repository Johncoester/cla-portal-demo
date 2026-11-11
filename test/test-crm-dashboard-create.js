/* CRM dashboard create. Fake client only. No network and no database.
 * insert().select() is INSERT ... RETURNING. crm_dashboards_select then calls crm_dash_visible,
 * which cannot see the new row yet, so create and clone fail. The id is minted here, the insert
 * does not read the row back, and a following select loads it. Names stay within the 100-character check. */
import { readFileSync } from 'node:fs';
import { crmSurfaceSupabase } from '../js/data/supabase-crm-surface.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const pass = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
const camel = (o) => (Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o);
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const JANINE = '00000000-0000-4000-8000-0000000000aa';
const SRC = '00000000-0000-4000-8000-0000000000bb';
const rows = new Map();
rows.set(SRC, { id: SRC, name: 'Lead dashboard', description: 'Built in', owner_id: null, visibility: 'all', share: { users: [], roles: [], departments: [] }, locked: true, builtin: true, created_by: null, retired_at: null });
const calls = [];

function from(table) {
  const q = { table, op: 'select', payload: null, filters: [], returning: false };
  const exec = (mode) => {
    const snap = { table: q.table, op: q.op, returning: q.returning, payload: q.payload, filters: q.filters.map((pair) => pair.slice()) };
    calls.push(snap);
    if (q.op === 'insert' && q.returning) return Promise.resolve({ data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "crm_dashboards"' } });
    if (q.op === 'insert') { rows.set(q.payload.id, { ...q.payload }); return Promise.resolve({ data: null, error: null }); }
    if (q.op === 'update') {
      const id = (q.filters.find(([k]) => k === 'id') || [])[1];
      const cur = rows.get(id);
      if (!cur) return Promise.resolve({ data: null, error: { message: 'missing' } });
      Object.assign(cur, q.payload);
      return Promise.resolve({ data: q.returning ? { ...cur } : null, error: null });
    }
    let data = q.table === 'crm_dashboards' ? [...rows.values()].filter((row) => q.filters.every(([k, v]) => row[k] === v)) : [];
    if (mode === 'many') return Promise.resolve({ data, error: null });
    const row = data[0] || null;
    if (mode === 'maybe') return Promise.resolve({ data: row, error: null });
    if (!row) return Promise.resolve({ data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } });
    return Promise.resolve({ data: { ...row }, error: null });
  };
  const api = {
    insert(row) { q.op = 'insert'; q.payload = row; return api; },
    update(row) { q.op = 'update'; q.payload = row; return api; },
    select() { if (q.op === 'insert' || q.op === 'update') q.returning = true; else q.op = 'select'; return api; },
    eq(k, v) { q.filters.push([k, v]); return api; },
    order() { return api; },
    is() { return api; },
    single() { return exec('single'); },
    maybeSingle() { return exec('maybe'); },
    then(resolve, reject) { return exec('many').then(resolve, reject); },
  };
  return api;
}

const me = async () => ({ id: JANINE, role: 'Super admin', isAdmin: true, email: 'janine@example.test', firstName: 'Janine', lastName: 'Admin' });
const surface = crmSurfaceSupabase({ sb: { from }, ok: pass, camel, me, on() {}, self: { getCrmSettings: async () => ({ picklists: {}, fields: [] }) } });

let blank = '';
try { await surface.createCrmDashboard({ name: '   ', visibility: 'me' }); } catch (e) { blank = e.message; }
ok(blank === 'Dashboard Name is required.' && calls.length === 0, 'a blank dashboard name is refused before any request');

const hundred = 'A'.repeat(100);
const made = await surface.createCrmDashboard({ name: '  ' + 'B'.repeat(120) + '  ', description: 'Only me', visibility: 'me', locked: false });
const insert = calls.find((c) => c.op === 'insert');
const readBack = calls.filter((c) => c.op === 'select' && c.table === 'crm_dashboards');
ok(calls.length === 2 && insert && insert.returning === false && readBack.length === 1, 'create is one insert with no read-back, then one fetch');
ok(insert.payload.id === made.id && UUID.test(made.id) && insert.payload.owner_id === JANINE && insert.payload.created_by === JANINE && insert.payload.visibility === 'me' && insert.payload.locked === false, 'the browser mints the id and stores Only me, unlocked, for this super admin');
ok(insert.payload.name === 'B'.repeat(100) && made.name === 'B'.repeat(100) && insert.payload.name.length === 100, 'a longer dashboard name is stored at 100 characters');
ok(readBack[0].filters.some(([k, v]) => k === 'id' && v === made.id) && rows.get(made.id).name === made.name, 'the following select loads that same id');
const kept = await surface.createCrmDashboard({ name: hundred, visibility: 'me' });
ok(kept.name === hundred && kept.name.length === 100, 'a 100-character name is kept whole');

calls.length = 0;
const renamed = await surface.updateCrmDashboard(made.id, { name: 'C'.repeat(120) });
const upd = calls.find((c) => c.op === 'update');
ok(calls.length === 1 && upd && upd.payload.name.length === 100 && renamed.name.length === 100, 'renaming also stops at 100 characters, in the same request');

calls.length = 0;
const copy = await surface.cloneCrmDashboard(SRC, { name: 'D'.repeat(130) });
const copies = calls.filter((c) => c.op === 'insert');
const copyRead = calls.filter((c) => c.op === 'select' && c.table === 'crm_dashboards' && c.filters.some(([k, v]) => k === 'id' && v === copy.id));
ok(copies.length === 1 && copies[0].returning === false && copyRead.length === 1 && copy.id !== SRC && copy.name.length === 100 && copy.visibility === 'me', 'clone uses the same insert, then one fetch of the new id');
ok(calls.filter((c) => c.op === 'insert' && c.returning).length === 0, 'clone does not ask the insert to return the new row');

const page = read('js/pages/crm-dashboards.js');
ok(page.includes('Dashboard Name<input name="name" maxlength="100"') && page.includes('Component Name<input name="name" maxlength="100"'), 'dashboard and component name fields stop at 100 characters');
const hosted = read('js/data/supabase-crm-surface.js');
const createFn = hosted.slice(hosted.indexOf('async createCrmDashboard'), hosted.indexOf('async updateCrmDashboard'));
ok(createFn.includes('crypto.randomUUID') && createFn.includes('.insert(row)') && !createFn.includes('.insert(row).select') && createFn.includes(".select('*').eq('id', id)"), 'the create source inserts, then reads that id');
ok(createFn.includes('slice(0, 100)') && !createFn.includes('120'), 'the hosted create path no longer trims a dashboard name to 120');

const mockApi = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await mockApi.signInDev('u-admin');
const exact = await mockApi.createCrmDashboard({ name: 'E'.repeat(100), visibility: 'me' });
ok(exact.name.length === 100 && exact.visibility === 'me', 'the demo create keeps a 100-character name');
let tooLong = '';
try { await mockApi.createCrmDashboard({ name: 'F'.repeat(101), visibility: 'me' }); } catch (e) { tooLong = e.message; }
ok(tooLong === 'Dashboard Name can be at most 100 characters.', 'the demo create refuses a name past 100 characters');
const listed = await mockApi.listCrmDashboards();
const cloned = await mockApi.cloneCrmDashboard(listed[0].id, { name: 'G'.repeat(140) });
ok(cloned.name.length === 100 && cloned.id !== listed[0].id, 'the demo clone stores at most 100 characters');

console.log(fail ? fail + ' failed' : 'crm dashboard create passed');
if (fail) process.exit(1);
