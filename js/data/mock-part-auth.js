/* mock adapter, auth part: DEV/FAKE sign-in only (pick a fake user from a list, no password).
 * After John confirms the login switch, the Supabase adapter implements signIn(email, password). This portal stays CLA Portal Live Test. */
export function devAuth(x) {
  const { load, me, clone, fail } = x;
  return {
    async listDevUsers() { return clone(load().profiles.filter((p) => p.status === 'active').map(({ id, firstName, lastName, role, isAdmin, email }) => ({ id, firstName, lastName, role, email, isAdmin: !!isAdmin, contactType: ((load().contacts || []).find((c) => c.profileId === id) || {}).contactType || null,
      fileRoles: role === 'Outside user' ? x.fileRolesOf({ id, role }) : [], fileLabels: role === 'Outside user' ? x.fileLabelsOf({ id, role }) : [] }))); },   // outside users: the roles they hold on their files
    async signInDev(userId) {
      const p = load().profiles.find((q) => q.id === userId);
      if (!p) fail('Unknown fake user.');
      if (p.status !== 'active') fail('This account is disabled.');
      x.sess.setItem(x.SESSION_KEY, p.id);
      return clone(p);
    },
    async pickPerson(userId) { return this.signInDev(userId); },   // UI-facing name for the dev picker
    async getSession() { const u = me(); return u ? clone({ ...u, contactType: ((load().contacts || []).find((c) => c.profileId === u.id) || {}).contactType || null, fileRoles: u.role === 'Outside user' ? x.fileRolesOf(u) : [], fileLabels: u.role === 'Outside user' ? x.fileLabelsOf(u) : [] }) : null; },
    async signOut() { x.sess.removeItem(x.SESSION_KEY); },
    async resetDemoData() { x.reset(); },
  };
}
