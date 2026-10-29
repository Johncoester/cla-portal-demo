/* mock adapter, auth part: DEV/FAKE sign-in only (pick a fake user from a list, no password).
 * At go-live the Supabase adapter implements signIn(email, password) via Supabase Auth instead. */
export function devAuth(x) {
  const { load, me, clone, fail } = x;
  return {
    async listDevUsers() { return clone(load().profiles.filter((p) => p.status === 'active').map(({ id, firstName, lastName, role, isAdmin }) => ({ id, firstName, lastName, role, isAdmin: !!isAdmin,
      fileRoles: role === 'Outside user' ? x.fileRolesOf({ id, role }) : [] }))); },   // outside users: the roles they hold on their files
    async signInDev(userId) {
      const p = load().profiles.find((q) => q.id === userId);
      if (!p) fail('Unknown fake user.');
      if (p.status !== 'active') fail('This account is disabled.');
      x.sess.setItem(x.SESSION_KEY, p.id);
      return clone(p);
    },
    async pickPerson(userId) { return this.signInDev(userId); },   // UI-facing name for the dev picker
    async getSession() { const u = me(); return u ? clone({ ...u, fileRoles: u.role === 'Outside user' ? x.fileRolesOf(u) : [] }) : null; },
    async signOut() { x.sess.removeItem(x.SESSION_KEY); },
    async resetDemoData() { x.reset(); },
  };
}
