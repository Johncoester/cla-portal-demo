/* Speed (Nov 9): carried order reads across a tab switch, the dashboard's one-go task read, and the sidebar's shared deal list.
 * Real adapter, fake client. No hosted project and no secrets.
 * Run: node --import ./test/register-supabase-fake.mjs test/test-nav-carry.js */
import { createSupabaseAdapter } from '../js/data/supabase-adapter.js';
import { carriedReads } from '../js/data/read-batch.js';

let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };

// ---- carriedReads on its own ----
{
  let t = 0;
  const c = carriedReads({ ttlMs: 1000, now: () => t });
  c.keep('A', 'deal:1', Promise.resolve('one'));
  check(c.get('A', 'deal:1') !== null, 'the same person gets the kept read back');
  check(c.get('B', 'deal:1') === null, 'another person does not get it');
  c.keep('A', 'deal:1', Promise.resolve('one'));
  t = 1001;
  check(c.get('A', 'deal:1') === null, 'a read older than the limit is not reused');
  t = 0;
  const bad = Promise.reject(new Error('nope'));
  c.keep('A', 'docs:1', bad);
  await bad.catch(() => {}); await null;
  check(c.get('A', 'docs:1') === null, 'a failed read is not kept');
  c.keep('', 'deal:2', Promise.resolve('x'));
  check(c.get('', 'deal:2') === null, 'a read with no known person is not kept');
}

// ---- fake Supabase client: deals, tasks (paged), switches, deal_contacts ----
function makeClient(state) {
  const query = (table) => {
    const q = { table, filters: [], span: null };
    const rows = () => {
      let r = (state.tables[table] || []).slice();
      for (const [kind, col, val] of q.filters) r = r.filter((x) => (kind === 'in' ? val.includes(x[col]) : x[col] === val));
      r.sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)) || String(x.id).localeCompare(String(y.id)));
      const capped = q.span ? r.slice(q.span[0], q.span[1] + 1) : r.slice(0, 1000);   // PostgREST caps unranged reads too
      return capped;
    };
    Object.assign(q, {
      select() { return q; }, order() { return q; },
      eq(col, val) { q.filters.push(['eq', col, val]); return q; },
      in(col, val) { q.filters.push(['in', col, val]); return q; },
      range(a, b) { q.span = [a, b]; return q; },
      async single() { state.reads.push(`${table}:single:${state.who}`); const r = rows()[0]; return { data: r ? { ...r, street: r.street + '-FOR-' + state.who } : null, error: r ? null : { message: 'none' } }; },
      async maybeSingle() { return { data: rows()[0] || null, error: null }; },
      then(res, rej) { state.reads.push(`${table}:${state.who}`); return Promise.resolve({ data: rows(), error: null }).then(res, rej); },
    });
    return q;
  };
  return {
    auth: { onAuthStateChange(fn) { state.cb = fn; }, async getUser() { return { data: { user: state.who ? { id: state.who } : null } }; }, async signOut() { state.who = ''; return { error: null }; } },
    from: query,
    async rpc(name, args) {
      state.rpcs.push(name);
      if (name === 'my_profile') return { data: { id: state.who, role: state.role || 'Processor', is_demo: false }, error: null };
      if (name === 'demo_view_status') return { data: { active: false }, error: null };
      if (name === 'deal_contacts') return { data: (state.contacts[args.p_deal] || []), error: null };
      return { data: [], error: null };
    },
    functions: {},
  };
}

const deal = (id) => ({ id, street: 'STREET-' + id, city: 'C', state: 'MD', zip: '1', status: 'Open', created_at: '2026-01-01' });

// ---- a tab switch inside one order reuses that order's reads; a write, another person, or sign-out reads again ----
{
  const state = { who: 'A', reads: [], rpcs: [], contacts: {}, tables: { deals: [deal('f1')] } };
  globalThis.__fakeSB = makeClient(state);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  state.cb('INITIAL_SESSION', { user: { id: 'A' } });
  const shellReads = () => state.reads.filter((r) => r.startsWith('deals:single')).length;

  let nav = await api.beginNavigation({ dealId: 'f1', tab: 'contacts' }); await nav.hr; await nav.demo;
  const s1 = await api.readFileShell('f1');
  check(shellReads() === 1 && s1.street === 'STREET-f1-FOR-A', 'the first visit reads the order once');

  nav = await api.beginNavigation({ dealId: 'f1', tab: 'documents' }); await nav.hr; await nav.demo;
  const s2 = await api.readFileShell('f1');
  check(shellReads() === 1 && s2.street === 'STREET-f1-FOR-A', 'switching tabs inside the same order reuses the order read');

  await api.resetDemoData();   // any write
  nav = await api.beginNavigation({ dealId: 'f1', tab: 'contacts' }); await nav.hr; await nav.demo;
  await api.readFileShell('f1');
  check(shellReads() === 2, 'after a write the next visit reads the order again');

  const before = api.writeSerial();
  await api.resetDemoData();
  check(api.writeSerial() > before, 'writes move the write counter the sidebar watches');

  // another person signs in on the same browser
  state.who = 'B';
  state.cb('SIGNED_IN', { user: { id: 'B' } });
  nav = await api.beginNavigation({ dealId: 'f1', tab: 'contacts' }); await nav.hr; await nav.demo;
  const sB = await api.readFileShell('f1');
  check(nav.user.id === 'B' && sB.street === 'STREET-f1-FOR-B' && shellReads() === 3, 'another person never gets the first person\'s carried read');

  await api.signOut();
  state.who = 'B';
  state.cb('SIGNED_IN', { user: { id: 'B' } });
  nav = await api.beginNavigation({ dealId: 'f1', tab: 'contacts' }); await nav.hr; await nav.demo;
  await api.readFileShell('f1');
  check(shellReads() === 4, 'signing out drops the carried reads');
}

// ---- listTasksForDeals gives exactly what listTasks gives, file by file, in far fewer reads ----
{
  const tasks = [];
  let n = 0;
  const add = (dealId, extra = {}) => { n += 1; tasks.push({ id: 't' + String(n).padStart(5, '0'), deal_id: dealId, title: 'T' + n, assigned_role: 'Buyer Agent', status: 'todo', created_at: '2026-01-01T00:00:' + String(n % 60).padStart(2, '0'), kind: 'simple', participant_id: null, owner_profile_id: null, template_id: null, template_code: null, ...extra }); };
  for (let i = 0; i < 1100; i += 1) add('d1');   // more than one PostgREST page on one file
  add('d2', { participant_id: 'p-me', assigned_role: 'Client-Buyer' });   // my party copy
  add('d2', { participant_id: 'p-other', assigned_role: 'Client-Buyer' });   // someone else's copy
  add('d2', { template_code: 'OFFCODE', template_id: 'tpl', kind: 'form' });   // switched off
  add('d3', { owner_profile_id: 'A' });
  const state = { who: 'A', role: 'Outside user', reads: [], rpcs: [], tables: { tasks, task_template_switches: [{ code: 'OFFCODE', enabled: false }], deals: [deal('d1'), deal('d2'), deal('d3'), deal('d4')] },
    contacts: { d2: [{ participant_id: 'p-me', profile_id: 'A' }, { participant_id: 'p-other', profile_id: 'Z' }] } };
  globalThis.__fakeSB = makeClient(state);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  state.cb('INITIAL_SESSION', { user: { id: 'A' } });
  const nav = await api.beginNavigation(null); await nav.hr; await nav.demo;
  const ids = ['d1', 'd2', 'd3', 'd4'];

  state.reads.length = 0; state.rpcs.length = 0;
  const batched = await api.listTasksForDeals(ids);
  const batchReads = state.reads.length + state.rpcs.filter((r) => r === 'deal_contacts').length;

  state.reads.length = 0; state.rpcs.length = 0;
  const one = {};
  for (const id of ids) one[id] = await api.listTasks(id);
  const oneReads = state.reads.length + state.rpcs.filter((r) => r === 'deal_contacts').length;

  check(['d2', 'd3', 'd4'].every((id) => JSON.stringify(batched.get(id)) === JSON.stringify(one[id])), 'every file gets the same task list as listTasks (order, mine, switched off, links)');
  // listTasks reads one file without paging, so the server's 1000-row cap cuts it short; the batched read pages past it
  check(JSON.stringify(batched.get('d1').slice(0, 1000)) === JSON.stringify(one.d1) && one.d1.length === 1000, 'past 1000 tasks the batched list starts with exactly what listTasks shows');
  check(batched.get('d1').length === 1100, 'a file with more than 1000 tasks is read in full');
  check(batched.get('d2').find((t) => t.participantId === 'p-me').mine === true && batched.get('d2').find((t) => t.participantId === 'p-other').mine === false, 'my own party copy is mine; another party\'s is not');
  check(batched.get('d4').length === 0, 'a file with no tasks gets an empty list');
  check(batchReads < oneReads, `fewer reads than one listTasks per file (${batchReads} vs ${oneReads})`);
}

// ---- the sidebar's deal list is shared across renders until a write, another person, or the time limit ----
{
  const { wireSideSearch } = await import('../js/sidebar-search.js');
  let calls = 0; let serial = 0;
  const api = { mode: 'supabase', writeSerial: () => serial, listDeals: async () => { calls += 1; return [{ id: 'x', street: 'S', fileNumber: 'F', status: 'Open' }]; } };
  // a minimal page: one Switch order select
  const sel = { insertAdjacentHTML() {}, addEventListener() {} };
  globalThis.document = { querySelector: (s) => (s === '[data-switch-order]' ? sel : null), querySelectorAll: () => [] };
  globalThis.location = { hash: '#/deals/y/overview' };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  wireSideSearch(api, { id: 'A' }, () => {}); await settle();
  wireSideSearch(api, { id: 'A' }, () => {}); await settle();
  check(calls === 1, 'two renders inside an order read the deal list once');
  serial += 1;
  wireSideSearch(api, { id: 'A' }, () => {}); await settle();
  check(calls === 2, 'a write reads the deal list again');
  wireSideSearch(api, { id: 'B' }, () => {}); await settle();
  check(calls === 3, 'another person reads their own deal list');
  let mockCalls = 0;
  const mock = { mode: 'mock', listDeals: async () => { mockCalls += 1; return []; } };
  wireSideSearch(mock, { id: 'A' }, () => {}); await settle();
  wireSideSearch(mock, { id: 'A' }, () => {}); await settle();
  check(mockCalls === 2, 'the mock (local data) still reads every time');
}

console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
