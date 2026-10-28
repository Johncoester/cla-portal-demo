/* adapter.js : the ONE seam between the screens and the back end.
 * Screens call `await getAdapter()` and nothing else. Two implementations share the same method names:
 *   mock-adapter.js      fake seed data in localStorage (default; no server, no database)
 *   supabase-adapter.js  Supabase Auth + Postgres RLS (see supabase/migrations). Not run against a hosted project.
 * Chosen by public/config.js (gitignored):  window.CLA_PORTAL_CONFIG = { mode: "mock" } or { mode: "supabase", url, anonKey }.
 * No config.js => mock mode.
 *
 * AUTH CONTRACT (the swappable layer):
 *   mode                     "mock" | "supabase"
 *   listDevUsers()           -> [{id, firstName, lastName, role}]  mock only; supabase returns [] (dev picker hidden)
 *   signInDev(userId)        mock only: dev/fake login, pick a fake user, no password
 *   signIn(email, password)  supabase only (go-live: real users, real logins)
 *   signOut(); getSession() -> profile | null; getMyProfile(); updateMyProfile(patch)
 * Everything else (deals, contacts, tasks, documents, messages, activity, admin) is identical in both: see mock-adapter.js.
 * There is intentionally NO deleteDocument in either adapter.
 */
let cached = null;
export async function getAdapter() {
  if (cached) return cached;
  const cfg = (typeof window !== 'undefined' && window.CLA_PORTAL_CONFIG) || { mode: 'mock' };
  if (cfg.mode === 'supabase') { const m = await import('./supabase-adapter.js'); cached = await m.createSupabaseAdapter(cfg); }
  else { const m = await import('./mock-adapter.js'); cached = m.createMockAdapter(); }
  return cached;
}
