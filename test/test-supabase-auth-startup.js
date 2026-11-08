/* Real adapter, fake client. Event order is controlled. No hosted project and no secrets. */
import { createSupabaseAdapter } from '../js/data/supabase-adapter.js';

let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function client(hooks) {
  return {
    auth: {
      onAuthStateChange(fn) { hooks.cb = fn; },
      getUser() { return hooks.getUser(); },
      async signOut() { hooks.who = ''; return { error: null }; },
    },
    from(name) {
      return { select() { return this; }, eq() { return this; }, order() { return this; },
        async single() { return hooks.single(name); },
        async maybeSingle() { return { data: null, error: null }; } };
    },
    async rpc(name) { return hooks.rpc(name); },
  };
}

async function startupSwitch() {
  let resolveUser = null;
  let who = 'A';
  const reads = [];
  const hooks = {
    who: 'A',
    getUser() { if (resolveUser) return Promise.resolve({ data: { user: { id: who } } }); return new Promise((r) => { resolveUser = r; }); },
    single() { reads.push(who); return { data: { id: 'file-1', street: 'PRIVATE-FOR-' + who }, error: null }; },
    rpc(name) { return { data: name === 'my_profile' ? { id: who, role: 'Processor', is_demo: false } : name === 'demo_view_status' ? { active: false } : [], error: null }; },
  };
  globalThis.__fakeSB = client(hooks);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  const pending = api.beginNavigation({ dealId: 'file-1', tab: 'contacts' });
  await wait(0);
  hooks.cb('SIGNED_IN', { user: { id: 'A' } });
  who = 'B';
  hooks.cb('SIGNED_IN', { user: { id: 'B' } });
  resolveUser({ data: { user: { id: 'B' } } });
  const nav = await pending;
  await nav.hr; await nav.demo;
  const shell = await api.readFileShell('file-1');
  check(nav.user && nav.user.id === 'B' && shell.street === 'PRIVATE-FOR-B' && reads.includes('B') && shell.street !== 'PRIVATE-FOR-A', 'a startup switch from A to B does not serve A\'s file row');
}

async function delayedOldRead() {
  let resolveUser = null;
  let who = 'A';
  const reads = [];
  const releases = [];
  const hooks = {
    getUser() { if (resolveUser) return Promise.resolve({ data: { user: { id: who } } }); return new Promise((r) => { resolveUser = r; }); },
    single() {
      const owner = who;
      reads.push(owner);
      return new Promise((r) => { releases.push(() => r({ data: { id: 'file-1', street: 'PRIVATE-FOR-' + owner }, error: null })); });
    },
    rpc(name) { return { data: name === 'my_profile' ? { id: who, role: 'Processor', is_demo: false } : name === 'demo_view_status' ? { active: false } : [], error: null }; },
  };
  globalThis.__fakeSB = client(hooks);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  const pending = api.beginNavigation({ dealId: 'file-1', tab: 'contacts' });
  await wait(0);
  hooks.cb('SIGNED_IN', { user: { id: 'A' } });
  who = 'B';
  hooks.cb('SIGNED_IN', { user: { id: 'B' } });
  resolveUser({ data: { user: { id: 'B' } } });
  for (let i = 0; i < 6; i += 1) { await wait(0); releases.splice(0).forEach((fn) => fn()); }
  const nav = await pending;
  await nav.hr; await nav.demo;
  const shell = await api.readFileShell('file-1');
  check(nav.user && nav.user.id === 'B' && shell.street === 'PRIVATE-FOR-B' && reads.includes('A') && reads.includes('B'), 'a file read started as A resolves too late to be served to B');
}

async function samePersonPermission() {
  let who = 'A';
  let role = 'Processor';
  let demo = false;
  let demoCalls = 0;
  const hooks = {
    getUser() { return Promise.resolve({ data: { user: { id: who } } }); },
    rpc(name) {
      if (name === 'my_profile') return { data: { id: who, role, is_demo: demo }, error: null };
      if (name === 'demo_view_status') { demoCalls += 1; return { data: { active: demo }, error: null }; }
      return { data: [], error: null };
    },
  };
  globalThis.__fakeSB = client(hooks);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  const nav = await api.beginNavigation();
  await nav.hr; await nav.demo;
  const beforeGen = api.authGeneration();
  check((await api.getMyProfile()).role === 'Processor' && (await api.demoViewStatus()).active === false, 'the first confirmation reads the processor profile and demo flag');
  const callsAfterFirst = demoCalls;
  role = 'Client-Buyer'; demo = true;
  hooks.cb('SIGNED_IN', { user: { id: 'A' } });
  const afterSign = await api.getMyProfile();
  const afterDemo = await api.demoViewStatus();
  check(afterSign.role === 'Client-Buyer' && afterSign.isDemo === true && afterDemo.active === true && demoCalls > callsAfterFirst && api.authGeneration() !== beforeGen, 'signing in again as the same person refreshes the role and the demo flag');
  const genAfter = api.authGeneration();
  const callsAfter = demoCalls;
  role = 'Client-Seller'; demo = false;
  hooks.cb('USER_UPDATED', { user: { id: 'A' } });
  const updated = await api.getMyProfile();
  const updatedDemo = await api.demoViewStatus();
  check(updated.role === 'Client-Seller' && updated.isDemo === false && updatedDemo.active === false && demoCalls > callsAfter && api.authGeneration() !== genAfter, 'USER_UPDATED refreshes the profile, the demo flag, and the generation');
}

async function signOutDrops() {
  let who = 'A';
  const reads = [];
  const hooks = {
    getUser() { return Promise.resolve({ data: { user: who ? { id: who } : null } }); },
    single() { reads.push(who || 'none'); return { data: { id: 'file-1', street: 'PRIVATE-FOR-' + (who || 'none') }, error: null }; },
    rpc(name) { return { data: name === 'my_profile' ? { id: who, role: 'Processor', is_demo: false } : name === 'demo_view_status' ? { active: false } : [], error: null }; },
  };
  globalThis.__fakeSB = client(hooks);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  const nav = await api.beginNavigation({ dealId: 'file-1', tab: 'contacts' });
  await nav.hr; await nav.demo;
  await api.readFileShell('file-1');
  const gen = api.authGeneration();
  const before = reads.length;
  who = '';
  hooks.cb('SIGNED_OUT', null);
  check((await api.getMyProfile()) == null && api.authGeneration() !== gen, 'sign-out forgets the profile and moves the generation');
  const shell = await api.readFileShell('file-1');
  check(reads.length > before && shell.street !== 'PRIVATE-FOR-A', 'sign-out does not keep serving the previous person\'s file row');
}

async function happyReload() {
  let resolveUser = null;
  let who = 'A';
  const reads = [];
  const hooks = {
    getUser() { if (resolveUser) return Promise.resolve({ data: { user: { id: who } } }); return new Promise((r) => { resolveUser = r; }); },
    single() { reads.push(who); return { data: { id: 'file-1', street: 'PRIVATE-FOR-' + who }, error: null }; },
    rpc(name) { return { data: name === 'my_profile' ? { id: who, role: 'Processor', is_demo: false } : name === 'demo_view_status' ? { active: false } : [], error: null }; },
  };
  globalThis.__fakeSB = client(hooks);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  const pending = api.beginNavigation({ dealId: 'file-1', tab: 'contacts' });
  await wait(0);
  hooks.cb('SIGNED_IN', { user: { id: 'A' } });
  resolveUser({ data: { user: { id: 'A' } } });
  const nav = await pending;
  await nav.hr; await nav.demo;
  const shell = await api.readFileShell('file-1');
  check(nav.user && nav.user.id === 'A' && shell.street === 'PRIVATE-FOR-A' && reads.length === 1, 'one session restore keeps that person\'s file row');
}

await startupSwitch();
await delayedOldRead();
await samePersonPermission();
await signOutDrops();
await happyReload();
console.log(fail ? fail + ' failed' : 'supabase auth startup passed');
process.exit(fail ? 1 : 0);
