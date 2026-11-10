/* Real adapter, fake client. Event order is controlled. No hosted project and no secrets. */
import { createSupabaseAdapter } from '../js/data/supabase-adapter.js';
import { modulesSupabase } from '../js/data/supabase-modules.js';

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
      if (hooks.from) return hooks.from(name);
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
  check(nav.user && nav.user.id === 'B' && shell.street === 'PRIVATE-FOR-B' && reads.length > 0 && reads.every((r) => r === 'B') && shell.street !== 'PRIVATE-FOR-A', 'a startup switch from A to B does not serve A\'s file row');
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
  check(nav.user && nav.user.id === 'B' && shell.street === 'PRIVATE-FOR-B' && reads.length > 0 && reads.every((r) => r === 'B'), 'a file read starts for the confirmed person and does not serve A');
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

async function initialThenOther() {
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
  hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
  who = 'B';
  hooks.cb('SIGNED_IN', { user: { id: 'B' } });
  resolveUser({ data: { user: { id: 'B' } } });
  const nav = await pending;
  await nav.hr; await nav.demo;
  const shell = await api.readFileShell('file-1');
  check(nav.user && nav.user.id === 'B' && shell.street === 'PRIVATE-FOR-B' && reads.length > 0 && reads.every((r) => r === 'B'), 'INITIAL_SESSION A then SIGNED_IN B does not serve A\'s file row');
}

async function firstEventOther() {
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
  who = 'B';
  hooks.cb('SIGNED_IN', { user: { id: 'B' } });
  resolveUser({ data: { user: { id: 'B' } } });
  const nav = await pending;
  await nav.hr; await nav.demo;
  const shell = await api.readFileShell('file-1');
  check(nav.user && nav.user.id === 'B' && shell.street === 'PRIVATE-FOR-B' && reads.length > 0 && reads.every((r) => r === 'B'), 'the first observed sign-in does not read the file before that person is confirmed');
}

async function delayedAfterOther() {
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
  hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
  who = 'B';
  hooks.cb('SIGNED_IN', { user: { id: 'B' } });
  resolveUser({ data: { user: { id: 'B' } } });
  for (let i = 0; i < 6; i += 1) { await wait(0); releases.splice(0).forEach((fn) => fn()); }
  const nav = await pending;
  await nav.hr; await nav.demo;
  const shell = await api.readFileShell('file-1');
  check(nav.user && nav.user.id === 'B' && shell.street === 'PRIVATE-FOR-B' && reads.length > 0 && reads.every((r) => r === 'B'), 'a file read starts for B and does not serve A');
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
  check(nav.user && nav.user.id === 'A' && nav.user.role === 'Processor' && shell.street === 'PRIVATE-FOR-A' && api.authGeneration() === 0 && reads.length >= 1 && reads.every((id) => id === 'A'), 'one session restore returns that person\'s file row and does not keep an unowned read');
}

async function ownedRestore() {
  let who = 'A';
  const reads = [];
  const hooks = {
    getUser() { return Promise.resolve({ data: { user: { id: who } } }); },
    single() { reads.push(who); return { data: { id: 'file-1', street: 'PRIVATE-FOR-' + who }, error: null }; },
    rpc(name) { return { data: name === 'my_profile' ? { id: who, role: 'Processor', is_demo: false } : name === 'demo_view_status' ? { active: false } : [], error: null }; },
  };
  globalThis.__fakeSB = client(hooks);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
  const nav = await api.beginNavigation({ dealId: 'file-1', tab: 'contacts' });
  await nav.hr; await nav.demo;
  const shell = await api.readFileShell('file-1');
  check(nav.user && nav.user.id === 'A' && nav.user.role === 'Processor' && shell.street === 'PRIVATE-FOR-A' && reads.length === 1 && api.authGeneration() === 0, 'a restore whose owner is already known keeps that one file row');
}

async function profileOverlapsConfirmation() {
  let resolveUser = null;
  let releaseProfile = null;
  let profileCalls = 0;
  let settingsWhileProfileOpen = false;
  const hooks = {
    getUser() { if (resolveUser) return Promise.resolve({ data: { user: { id: 'A' } } }); return new Promise((r) => { resolveUser = () => r({ data: { user: { id: 'A' } } }); }); },
    single() { return { data: { id: 'file-1', street: 'PRIVATE-FOR-A' }, error: null }; },
    rpc(name) {
      if (name === 'my_profile') {
        profileCalls += 1;
        return new Promise((r) => { releaseProfile = () => r({ data: { id: 'A', role: 'Processor', is_demo: false }, error: null }); });
      }
      if (name === 'demo_view_status') return { data: { active: false }, error: null };
      return { data: [], error: null };
    },
    from(name) {
      if (name === 'module_settings') {
        return { select() { settingsWhileProfileOpen = typeof releaseProfile === 'function'; return Promise.resolve({ data: [], error: null }); } };
      }
      return { select() { return this; }, eq() { return this; }, order() { return this; }, async single() { return { data: null, error: null }; }, async maybeSingle() { return { data: null, error: null }; } };
    },
  };
  globalThis.__fakeSB = client(hooks);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
  const pending = api.beginNavigation({ dealId: 'file-1', tab: 'contacts' });
  await wait(0);
  check(profileCalls === 1 && typeof resolveUser === 'function', 'the profile read starts before the signed-in person is confirmed');
  const confirm = resolveUser;
  confirm();
  await wait(0);
  check(settingsWhileProfileOpen === true && profileCalls === 1, 'module settings start while that profile read is still open');
  releaseProfile();
  const nav = await pending;
  await nav.hr; await nav.demo; await nav.mods;
  check(nav.user && nav.user.id === 'A' && nav.user.role === 'Processor' && profileCalls === 1, 'the matching profile is the one that is kept');
}

async function mismatchedProfileRefetches() {
  let resolveUser = null;
  let who = 'A';
  let profileCalls = 0;
  const hooks = {
    getUser() { if (resolveUser) return Promise.resolve({ data: { user: { id: who } } }); return new Promise((r) => { resolveUser = r; }); },
    single() { return { data: { id: 'file-1', street: 'PRIVATE-FOR-' + who }, error: null }; },
    rpc(name) {
      if (name === 'my_profile') { profileCalls += 1; return { data: { id: who, role: who === 'B' ? 'Client-Buyer' : 'Processor', is_demo: false }, error: null }; }
      if (name === 'demo_view_status') return { data: { active: false }, error: null };
      return { data: [], error: null };
    },
  };
  globalThis.__fakeSB = client(hooks);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
  const pending = api.beginNavigation({ dealId: 'file-1', tab: 'contacts' });
  await wait(0);
  who = 'B';
  resolveUser({ data: { user: { id: 'B' } } });
  const nav = await pending;
  await nav.hr; await nav.demo;
  const shell = await api.readFileShell('file-1');
  check(nav.user && nav.user.id === 'B' && nav.user.role === 'Client-Buyer' && profileCalls >= 2 && shell.street === 'PRIVATE-FOR-B', 'a profile read for A is not kept when the confirmed person is B');
}

async function ownedWarmReadIsKept() {
  let who = 'A';
  const reads = [];
  let holdUser = false;
  let resolveUser = null;
  const hooks = {
    getUser() {
      if (!holdUser) return Promise.resolve({ data: { user: { id: who } } });
      return new Promise((r) => { resolveUser = () => r({ data: { user: { id: who } } }); });
    },
    single() { reads.push(who); return { data: { id: 'file-1', street: 'PRIVATE-FOR-' + who }, error: null }; },
    rpc(name) {
      if (name === 'my_profile') return { data: { id: who, role: 'Processor', is_demo: false }, error: null };
      if (name === 'demo_view_status') return { data: { active: false }, error: null };
      return { data: [], error: null };
    },
  };
  globalThis.__fakeSB = client(hooks);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
  const first = await api.beginNavigation({ dealId: 'file-1', tab: 'contacts' });
  await first.hr; await first.demo;
  await api.readFileShell('file-1');
  await api.resetDemoData();   // a write: drops the carried order reads, so the next navigation reads the shell again early
  const afterFirst = reads.length;
  holdUser = true;
  const second = api.beginNavigation({ dealId: 'file-1', tab: 'contacts' });
  await wait(0);
  const warmed = reads.length;
  resolveUser();
  const nav = await second;
  await nav.hr; await nav.demo;
  const shell = await api.readFileShell('file-1');
  check(warmed === afterFirst + 1 && reads.length === warmed && shell.street === 'PRIVATE-FOR-A' && nav.user.id === 'A', 'a file read started for the confirmed person is kept for that navigation');
}

async function speculativeFailuresStayVisible() {
  const errors = [];
  const onErr = (err) => { errors.push(err && err.message || String(err)); };
  process.on('unhandledRejection', onErr);
  try {
    let resolveUser = null;
    const hooks = {
      getUser() { return new Promise((r) => { resolveUser = r; }); },
      single() { return { data: { id: 'file-1', street: 'PRIVATE-FOR-A' }, error: null }; },
      rpc(name) { if (name === 'my_profile') throw new Error('EARLY_PROFILE_FAILED'); return { data: [], error: null }; },
    };
    globalThis.__fakeSB = client(hooks);
    const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
    hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
    const pending = api.beginNavigation();
    pending.catch(() => {});
    await wait(30);
    check(errors.length === 0, 'an early profile failure is handled while getUser is still pending');
    hooks.cb('SIGNED_OUT', null);
    resolveUser({ data: { user: null } });
    await wait(0);
    resolveUser({ data: { user: null } });
    await pending;
    check(errors.length === 0, 'an abandoned profile failure stays handled after the navigation is invalidated');

    errors.length = 0;
    const failingUser = {
      getUser() { return Promise.reject(new Error('GET_USER_FAILED')); },
      single() { return { data: null, error: null }; },
      rpc(name) { if (name === 'my_profile') throw new Error('EARLY_PROFILE_FAILED'); return { data: [], error: null }; },
    };
    globalThis.__fakeSB = client(failingUser);
    const api2 = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
    failingUser.cb('INITIAL_SESSION', { user: { id: 'A' } });
    let seen = '';
    try { await api2.beginNavigation(); } catch (err) { seen = err.message; }
    await wait(30);
    check(errors.length === 0 && seen === 'GET_USER_FAILED', 'a getUser failure still surfaces while the early profile failure stays handled');

    errors.length = 0;
    let confirm = null;
    const modules = modulesSupabase({
      sb: { from() { return { select() { return Promise.reject(new Error('MODULE_SETTINGS_FAILED')); } }; } },
      ok: (row) => { if (row && row.error) throw new Error(row.error.message); return row && row.data; },
      me: () => new Promise((resolve) => { confirm = resolve; }),
      flags: {},
    });
    const access = modules.getModuleAccess();
    access.catch(() => {});
    await wait(30);
    check(errors.length === 0, 'a settings failure is handled while the profile read is still pending');
    confirm({ id: 'A', role: 'Processor' });
    let caller = '';
    try { await access; } catch (err) { caller = err.message; }
    check(caller === 'MODULE_SETTINGS_FAILED' && errors.length === 0, 'the caller still receives the settings failure');
  } finally {
    process.off('unhandledRejection', onErr);
  }
}

async function oneFreshUserPerNavigation() {
  const run = async (tab) => {
    const counter = { calls: 0 };
    const tables = [];
    const hooks = {
      getUser() { counter.calls += 1; return Promise.resolve({ data: { user: { id: 'A' } } }); },
      single() { tables.push('deals'); return { data: { id: 'file-1', street: 'PRIVATE-FOR-A' }, error: null }; },
      rpc(name) {
        if (name === 'my_profile') return { data: { id: 'A', role: 'Processor', is_demo: false }, error: null };
        if (name === 'demo_view_status') return { data: { active: false }, error: null };
        return { data: [], error: null };
      },
      from(name) {
        tables.push(name);
        return { select() { return Promise.resolve({ data: [], error: null }); }, eq() { return this; }, order() { return this; }, is() { return this; }, in() { return this; },
          async single() { return { data: { id: 'file-1', street: 'PRIVATE-FOR-A' }, error: null }; },
          async maybeSingle() { return { data: null, error: null }; } };
      },
    };
    globalThis.__fakeSB = client(hooks);
    const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
    hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
    const nav = await api.beginNavigation({ dealId: 'file-1', tab });
    await nav.hr; await nav.demo; const mods = await nav.mods;
    return { counter, nav, mods, tables, api, hooks };
  };
  const tasks = await run('tasks');
  check(tasks.counter.calls === 1 && tasks.nav.user && tasks.nav.user.role === 'Processor' && tasks.mods && typeof tasks.mods === 'object', 'a tasks navigation asks who is signed in once and still reads the profile');
  const again = await tasks.api.beginNavigation({ dealId: 'file-1', tab: 'tasks' });
  await again.hr; await again.mods;
  check(tasks.counter.calls === 2 && again.user && again.user.id === 'A', 'the next navigation asks who is signed in again');
  const docs = await run('documents');
  check(docs.counter.calls === 1 && docs.tables.includes('folders') && docs.nav.user.role === 'Processor', 'a documents navigation asks who is signed in once and still reads folders');
}

async function signOutDropsInFlightUser() {
  const pending = [];
  let calls = 0;
  const hooks = {
    getUser() { calls += 1; return new Promise((r) => pending.push(r)); },
    single() { return { data: { id: 'file-1', street: 'PRIVATE-FOR-A' }, error: null }; },
    rpc(name) {
      if (name === 'my_profile') return { data: { id: 'A', role: 'Processor', is_demo: false }, error: null };
      return { data: [], error: null };
    },
  };
  globalThis.__fakeSB = client(hooks);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
  const navP = api.beginNavigation({ dealId: 'file-1', tab: 'tasks' });
  await wait(0);
  const first = calls;
  hooks.cb('SIGNED_OUT', null);
  pending[0]({ data: { user: { id: 'A' } } });
  await wait(0);
  pending[pending.length - 1]({ data: { user: null } });
  const nav = await navP;
  check(first === 1 && calls > first && !nav.user, 'a sign-out drops the in-flight person and the next check asks again');
}

async function lateUserADoesNotReplaceB() {
  const pending = [];
  const hooks = {
    getUser() { return new Promise((r) => pending.push(r)); },
    single() { return { data: { id: 'file-1', street: 'PRIVATE-FOR-B' }, error: null }; },
    rpc(name) {
      if (name === 'my_profile') return { data: { id: 'B', role: 'Client-Buyer', is_demo: false }, error: null };
      if (name === 'demo_view_status') return { data: { active: false }, error: null };
      return { data: [], error: null };
    },
  };
  globalThis.__fakeSB = client(hooks);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
  const navP = api.beginNavigation({ dealId: 'file-1', tab: 'tasks' });
  await wait(0);
  hooks.cb('SIGNED_IN', { user: { id: 'B' } });
  pending[0]({ data: { user: { id: 'A' } } });
  await wait(0);
  pending[pending.length - 1]({ data: { user: { id: 'B' } } });
  const nav = await navP;
  await nav.hr; await nav.demo;
  check(nav.user && nav.user.id === 'B' && nav.user.role === 'Client-Buyer' && pending.length >= 2, 'a late sign-in result for A is not kept after B is confirmed');
}

async function rejectedAuthIsNotReused() {
  let calls = 0;
  const hooks = {
    getUser() {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('GET_USER_FAILED'));
      return Promise.resolve({ data: { user: { id: 'A' } } });
    },
    single() { return { data: { id: 'file-1', street: 'PRIVATE-FOR-A' }, error: null }; },
    rpc(name) {
      if (name === 'my_profile') return { data: { id: 'A', role: 'Processor', is_demo: false }, error: null };
      if (name === 'demo_view_status') return { data: { active: false }, error: null };
      return { data: [], error: null };
    },
  };
  globalThis.__fakeSB = client(hooks);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
  let seen = '';
  try { await api.beginNavigation({ dealId: 'file-1', tab: 'tasks' }); } catch (err) { seen = err.message; }
  const nav = await api.beginNavigation({ dealId: 'file-1', tab: 'tasks' });
  await nav.hr; await nav.mods;
  check(seen === 'GET_USER_FAILED' && calls === 2 && nav.user && nav.user.role === 'Processor', 'a rejected sign-in check is not reused for the next navigation');
}

async function overlappingNavigationsAskTwice() {
  const pending = [];
  let calls = 0;
  const hooks = {
    getUser() { calls += 1; return new Promise((r) => pending.push(r)); },
    single() { return { data: { id: 'file-1', street: 'PRIVATE-FOR-A' }, error: null }; },
    rpc(name) {
      if (name === 'my_profile') return { data: { id: 'A', role: 'Processor', is_demo: false }, error: null };
      if (name === 'demo_view_status') return { data: { active: false }, error: null };
      return { data: [], error: null };
    },
  };
  globalThis.__fakeSB = client(hooks);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
  const first = api.beginNavigation({ dealId: 'file-1', tab: 'tasks' });
  await wait(0);
  const second = api.beginNavigation({ dealId: 'file-1', tab: 'documents' });
  await wait(0);
  const atSecond = calls;
  pending.forEach((resolve) => resolve({ data: { user: { id: 'A' } } }));
  const results = await Promise.all([first, second]);
  check(atSecond === 2 && results[1].user && results[1].user.id === 'A', 'a second navigation does not reuse the first navigation\'s sign-in check');
}

async function oldNavigationDoesNotClearNewFlight() {
  const pending = [];
  let who = 'A';
  const hooks = {
    getUser() { return new Promise((resolve, reject) => pending.push({ resolve, reject })); },
    single() { return { data: { id: 'file-1', street: 'PRIVATE-FOR-' + who }, error: null }; },
    rpc(name) {
      if (name === 'my_profile') return { data: { id: who, role: 'Processor', is_demo: false }, error: null };
      if (name === 'demo_view_status') return { data: { active: false }, error: null };
      return { data: [], error: null };
    },
  };
  globalThis.__fakeSB = client(hooks);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
  const first = api.beginNavigation({ dealId: 'file-1', tab: 'tasks' });
  first.catch(() => {});
  await wait(0);
  who = 'B';
  hooks.cb('SIGNED_IN', { user: { id: 'B' } });
  const second = api.beginNavigation({ dealId: 'file-1', tab: 'tasks' });
  await wait(0);
  const beforeReject = pending.length;
  pending[0].reject(new Error('OLD_A_AUTH_FAILED'));
  try { await first; } catch (err) { /* the old navigation can end without a person */ }
  const profile = api.getMyProfile();
  await wait(0);
  const observed = pending.length;
  pending.slice(1).forEach((item) => item.resolve({ data: { user: { id: 'B' } } }));
  const [nav, person] = await Promise.all([second, profile]);
  check(beforeReject === 2 && observed === 2 && nav.user && nav.user.id === 'B' && person && person.id === 'B', 'an old navigation does not drop the newer sign-in check');
}

async function obsoleteProfileDoesNotDropNewerPerson() {
  for (const switchPerson of [false, true]) {
    let who = 'A';
    let releaseOld = null;
    let userCalls = 0;
    let profileCalls = 0;
    const hooks = {
      getUser() { userCalls += 1; return Promise.resolve({ data: { user: { id: who } } }); },
      single() { return { data: { id: 'file-1', street: 'PRIVATE-FOR-' + who }, error: null }; },
      rpc(name) {
        if (name === 'my_profile') {
          profileCalls += 1;
          const owner = who;
          if (profileCalls === 1) return new Promise((resolve) => { releaseOld = () => resolve({ data: { id: owner, role: 'Processor', is_demo: false }, error: null }); });
          return { data: { id: who, role: 'Processor', is_demo: false }, error: null };
        }
        if (name === 'demo_view_status') return { data: { active: false }, error: null };
        return { data: [], error: null };
      },
    };
    globalThis.__fakeSB = client(hooks);
    const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
    hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
    const old = api.beginNavigation();
    await wait(0);
    if (switchPerson) { who = 'B'; hooks.cb('SIGNED_IN', { user: { id: 'B' } }); }
    const newer = await api.beginNavigation();
    await newer.hr; await newer.mods; await newer.demo;
    const before = userCalls;
    releaseOld();
    await old;
    await wait(0);
    const person = await api.getMyProfile();
    check(newer.user && newer.user.id === who && userCalls === before && person && person.id === who, switchPerson ? 'an old profile does not drop the person confirmed after the switch' : 'an old profile does not ask for the signed-in person again');
  }
}

await obsoleteProfileDoesNotDropNewerPerson();
await overlappingNavigationsAskTwice();
await oldNavigationDoesNotClearNewFlight();
await oneFreshUserPerNavigation();
await signOutDropsInFlightUser();
await lateUserADoesNotReplaceB();
await rejectedAuthIsNotReused();
await speculativeFailuresStayVisible();
await profileOverlapsConfirmation();
await mismatchedProfileRefetches();
await ownedWarmReadIsKept();
await startupSwitch();
await delayedOldRead();
await initialThenOther();
await firstEventOther();
await delayedAfterOther();
await samePersonPermission();
await signOutDrops();
async function transientGetUserRetriesThenUsesCache() {
  let calls = 0;
  const hooks = {
    getUser() {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('Failed to fetch'));
      return Promise.resolve({ data: { user: { id: 'A', email: 'a@example.test' } }, error: null });
    },
    rpc(name) {
      if (name === 'my_profile') return { data: { id: 'A', email: 'a@example.test', role: 'Buyer Agent', first_name: 'E2E', last_name: 'Buyeragent', is_demo: false }, error: null };
      if (name === 'demo_view_status') return { data: { active: false }, error: null };
      return { data: [], error: null };
    },
  };
  globalThis.__fakeSB = client(hooks);
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
  const nav = await api.beginNavigation();
  await nav.hr; await nav.demo;
  check(calls === 2 && nav.user && nav.user.id === 'A' && nav.user.role === 'Buyer Agent', 'a Failed to fetch from getUser is retried once and then the person is kept');
  hooks.getUser = () => Promise.reject(new Error('Failed to fetch'));
  const again = await api.beginNavigation();
  await again.hr; await again.demo;
  check(again.user && again.user.id === 'A' && again.user.role === 'Buyer Agent', 'after the retries a transient getUser failure falls back to the cached session');
  hooks.getUser = () => Promise.resolve({ data: { user: null }, error: { message: 'JWT expired', status: 401 } });
  const signedOut = await api.beginNavigation();
  check(!signedOut.user, 'a 401 from auth drops the cached session');
  hooks.getUser = () => Promise.resolve({ data: { user: { id: 'A', email: 'a@example.test' } }, error: null });
  const back = await api.beginNavigation();
  await back.hr; await back.demo;
  hooks.cb('SIGNED_OUT', null);
  hooks.getUser = () => Promise.resolve({ data: { user: null }, error: null });
  const after = await api.getMyProfile();
  check(back.user && back.user.id === 'A' && after == null, 'SIGNED_OUT clears the cached session');
}

await transientGetUserRetriesThenUsesCache();
await happyReload();
await ownedRestore();
console.log(fail ? fail + ' failed' : 'supabase auth startup passed');
process.exit(fail ? 1 : 0);
