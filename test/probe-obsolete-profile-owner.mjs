import assert from 'node:assert/strict';
import { createSupabaseAdapter } from '../js/data/supabase-adapter.js';
for (const switchPerson of [false, true]) {
  let cb, who = 'A', releaseOld;
  let userCalls = 0, profileCalls = 0;
  globalThis.__fakeSB = { auth: { onAuthStateChange(fn) { cb = fn; }, getUser() { userCalls += 1; return Promise.resolve({ data: { user: { id: who } } }); } }, rpc(n) { if (n === 'my_profile') { profileCalls += 1; const owner = who; if (profileCalls === 1) return new Promise((r) => { releaseOld = () => r({ data: { id: owner, role: 'Processor' }, error: null }); }); return Promise.resolve({ data: { id: who, role: 'Processor' }, error: null }); } return Promise.resolve({ data: n === 'demo_view_status' ? { active: false } : [], error: null }); }, from() { return { select() { return Promise.resolve({ data: [], error: null }); } }; } };
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE' });
  cb('INITIAL_SESSION', { user: { id: 'A' } });
  const old = api.beginNavigation();
  await new Promise((r) => setTimeout(r, 0));
  if (switchPerson) { who = 'B'; cb('SIGNED_IN', { user: { id: 'B' } }); }
  const newer = await api.beginNavigation();
  await newer.hr; await newer.mods; await newer.demo;
  assert.equal(newer.user.id, who);
  const before = userCalls;
  releaseOld();
  await old;
  await new Promise((r) => setTimeout(r, 0));
  await api.getMyProfile();
  console.log('switchPerson=', switchPerson, 'checks before obsolete profile completion=', before, 'after=', userCalls, 'profiles=', profileCalls);
  assert.equal(userCalls, before, 'obsolete profile/navigation must not invalidate newer confirmed identity');
}
