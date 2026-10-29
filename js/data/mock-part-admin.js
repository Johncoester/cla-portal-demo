/* mock adapter: Admin only (isAdmin = the permission check; role 'Admin' always has it, and other roles may carry the flag as in the old portal). Users: add, edit, disable, DELETE. Teams: create, rename, add/remove members.
 * "Delete user" = status 'removed': they can never sign in again and drop off teams and pickers, but the row stays so their documents, messages,
 * task answers and audit history keep an author shown as "Name (removed)". Documents are never deleted, by anyone. */
export function adminUsersTeams(x) {
  const { load, save, nid, needUser, needAdmin, contactOf, prof, nameOf, log, clone, now, fail, str, emailOk, C } = x;
  // role 'Admin' <=> isAdmin; leaving the Admin role clears isAdmin unless the same edit sets it; never leave the portal without an active Admin
  const lastAdminGuard = (p, next) => {
    if (p.isAdmin && p.status === 'active' && !(next.isAdmin && next.status === 'active')
      && !load().profiles.some((q) => q.id !== p.id && q.isAdmin && q.status === 'active')) fail('There must always be at least one Admin.');
  };
  const teamOut = (t) => { const d = load(); return { ...t, members: d.teamMembers.filter((m) => m.teamId === t.id).map((m) => ({ ...m, name: nameOf(m.profileId), role: (prof(m.profileId) || {}).role })) }; };
  return {
    // ---------- Users ----------
    async adminListUsers() { needAdmin(); const d = load();
      return clone(d.profiles.map((p) => ({ ...p, teams: d.teamMembers.filter((m) => m.profileId === p.id).map((m) => (d.teams.find((t) => t.id === m.teamId) || {}).name) }))); },
    async adminCreateUser(input) {
      const u = needAdmin(); const d = load(); const email = str(input.email, 200).toLowerCase();
      if (!emailOk(email)) fail('A valid email is required.');
      if (d.profiles.some((p) => p.email === email && p.status !== 'removed')) fail('A user with this email already exists.');
      if (!C.ROLES.includes(input.role)) fail('Pick a role.');
      const firstName = str(input.firstName, 80) || fail('First name is required.');
      const p = { id: nid('u'), email, firstName, lastName: str(input.lastName, 80), phone: str(input.phone, 40), role: input.role, isAdmin: input.role === C.ADMIN_ROLE || input.isAdmin === true || input.isAdmin === 'on',
        status: 'active', createdAt: now() };
      d.profiles.push(p);
      const existing = d.contacts.find((c) => c.email === email && !(c.profileId && (prof(c.profileId) || {}).status === 'removed'));   // reuse a contact so earlier order links carry over
      if (existing) existing.profileId = p.id;
      else if (p.role !== C.ADMIN_ROLE) d.contacts.push({ id: nid('c'), profileId: p.id, firstName: p.firstName, lastName: p.lastName, email, phone: p.phone, company: '', createdBy: u.id, createdAt: now() });
      log(null, u.id, 'user.created', 'user', p.id, `Created user ${p.firstName} ${p.lastName} (${p.role}${p.isAdmin ? ', Admin' : ''})`); save(); return clone(p);
    },
    async adminUpdateUser(id, patch) {
      const u = needAdmin(); const p = prof(id) || fail('User not found.'); if (p.status === 'removed') fail('This user was removed.');
      const next = { role: p.role, isAdmin: !!p.isAdmin, status: p.status };
      if (patch.role != null && patch.role !== p.role) { if (!C.ROLES.includes(patch.role)) fail('Unknown role.'); next.role = patch.role; }
      if (patch.isAdmin != null) next.isAdmin = patch.isAdmin === true || patch.isAdmin === 'on' || patch.isAdmin === 'true';
      if (patch.status != null) { if (!['active', 'disabled'].includes(patch.status)) fail('Unknown status.'); next.status = patch.status; }
      if (p.id === u.id && p.isAdmin && !next.isAdmin) fail('You cannot remove your own Admin access.');
      if (next.role === C.ADMIN_ROLE) { if (p.role === C.ADMIN_ROLE && patch.isAdmin != null && !next.isAdmin) fail('An Admin-role user keeps Admin access; change the role first.'); next.isAdmin = true; }
      else if (p.role === C.ADMIN_ROLE && patch.isAdmin == null) next.isAdmin = false;
      if (p.id === u.id && p.isAdmin && !next.isAdmin) fail('You cannot remove your own Admin access.');
      if (p.id === u.id && next.status !== 'active') fail('You cannot disable yourself.');
      lastAdminGuard(p, next);
      Object.assign(p, next);
      ['firstName', 'lastName', 'phone'].forEach((k) => { if (patch[k] != null) p[k] = str(patch[k], 80); });
      if (!p.firstName) fail('First name is required.');
      const c = contactOf(p.id); if (c) { c.firstName = p.firstName; c.lastName = p.lastName; c.phone = p.phone; }
      log(null, u.id, 'user.updated', 'user', p.id, `Updated user ${p.firstName} ${p.lastName}`); save(); return clone(p);
    },
    async adminDeleteUser(id) {
      const u = needAdmin(); const d = load(); const p = prof(id) || fail('User not found.');
      if (p.id === u.id) fail('You cannot delete your own account.'); if (p.status === 'removed') fail('This user was already removed.');
      lastAdminGuard(p, { isAdmin: false, status: 'removed' });
      p.status = 'removed'; p.isAdmin = false; p.removedAt = now(); p.removedBy = u.id;
      d.teamMembers = d.teamMembers.filter((m) => m.profileId !== id);   // access through teams ends now
      log(null, u.id, 'user.removed', 'user', id, `Removed user ${p.firstName} ${p.lastName} (documents, messages and history kept)`); save(); return true;
    },
    // ---------- Teams (TC access) ----------
    async listTeams() {
      const u = needUser(); const d = load();
      const mine = d.teams.filter((t) => u.isAdmin || d.teamMembers.some((m) => m.teamId === t.id && m.profileId === u.id));
      return clone(mine.map(teamOut).sort((a, b) => a.name.localeCompare(b.name)));
    },
    async createTeam(name) {
      const u = needAdmin(); const n = str(name, 120) || fail('Team name is required.'); const d = load();
      if (d.teams.some((t) => t.name.toLowerCase() === n.toLowerCase())) fail('A team with this name already exists.');
      const t = { id: nid('team'), name: n, createdBy: u.id, createdAt: now() }; d.teams.push(t); log(null, u.id, 'team.created', 'team', t.id, `Created team ${n}`); save(); return clone(teamOut(t));
    },
    async renameTeam(teamId, name) {
      const u = needAdmin(); const t = load().teams.find((z) => z.id === teamId) || fail('Team not found.'); const n = str(name, 120) || fail('Team name is required.');
      if (load().teams.some((z) => z.id !== t.id && z.name.toLowerCase() === n.toLowerCase())) fail('A team with this name already exists.'); t.name = n;
      log(null, u.id, 'team.renamed', 'team', teamId, `Renamed team to ${t.name}`); save(); return clone(teamOut(t));
    },
    async addTeamMember(teamId, profileId, memberRole) {
      const u = needAdmin(); const d = load(); const t = d.teams.find((z) => z.id === teamId) || fail('Team not found.'); const p = prof(profileId) || fail('User not found.');
      if (p.status !== 'active') fail('Only active users can join a team.');
      const want = memberRole || (p.role === 'Transaction Coordinator' ? 'coordinator' : 'agent');
      if (want === 'coordinator' && p.role !== 'Transaction Coordinator') fail('Only a transaction coordinator can be a team coordinator.');
      if (want === 'agent' && !C.isAgent(p.role)) fail('Only buyer or listing agents can be team agents.');
      if (d.teamMembers.some((m) => m.teamId === teamId && m.profileId === profileId)) fail('Already on this team.');
      d.teamMembers.push({ teamId, profileId, memberRole: want, addedAt: now() }); log(null, u.id, 'team.member_added', 'team', teamId, `${nameOf(profileId)} added to ${t.name} as ${want}`); save(); return true;
    },
    async removeTeamMember(teamId, profileId) {   // access to that team's deals ends immediately
      const u = needAdmin(); const d = load(); const t = d.teams.find((z) => z.id === teamId) || fail('Team not found.');
      const before = d.teamMembers.length; d.teamMembers = d.teamMembers.filter((m) => !(m.teamId === teamId && m.profileId === profileId)); if (d.teamMembers.length === before) fail('Not on this team.');
      log(null, u.id, 'team.member_removed', 'team', teamId, `${nameOf(profileId)} removed from ${t.name}`); save(); return true;
    },
  };
}
