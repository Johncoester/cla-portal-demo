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
  check(nav.user && nav.user.id === 'B' && shell.street === 'PRIVATE-FOR-B' && reads[0] === 'A' && reads.includes('B') && shell.street !== 'PRIVATE-FOR-A', 'a startup switch from A to B does not serve A\'s file row');
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
  check(nav.user && nav.user.id === 'B' && shell.street === 'PRIVATE-FOR-B' && reads.includes('A') && reads.includes('B') && shell.street !== 'PRIVATE-FOR-A', 'INITIAL_SESSION A then SIGNED_IN B does not serve A\'s file row');
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
  check(nav.user && nav.user.id === 'B' && shell.street === 'PRIVATE-FOR-B' && reads.includes('A') && reads.includes('B'), 'the first observed sign-in does not adopt a file read that started with no owner');
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
  check(nav.user && nav.user.id === 'B' && shell.street === 'PRIVATE-FOR-B' && reads.includes('A') && reads.includes('B'), 'a file read started as A resolves too late to be served after B is confirmed');
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
  check(nav.user && nav.user.id === 'A' && nav.user.role === 'Processor' && shell.street === 'PRIVATE-FOR-A' && api.authGeneration() === 0 && reads.length > 1 && reads.every((id) => id === 'A'), 'one session restore returns that person\'s file row and does not keep an unowned read');
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
await happyReload();
await ownedRestore();
console.log(fail ? fail + ' failed' : 'supabase auth startup passed');
process.exit(fail ? 1 : 0);
