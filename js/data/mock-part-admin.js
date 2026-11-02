/* mock adapter: Admin only (isAdmin = the permission check; roles 'Admin' and 'Super admin' always have it, and other roles may carry the flag as in the old portal). Users: add, edit, disable, DELETE. Teams: create, rename, add/remove members.
 * "Delete user" = status 'removed': they can never sign in again and drop off teams and pickers, but the row stays so their documents, messages,
 * task answers and audit history keep an author shown as "Name (removed)". Documents are never deleted, by anyone. */
export function adminUsersTeams(x) {
  const { load, save, nid, needUser, needAdmin, contactOf, prof, nameOf, log, clone, now, fail, str, emailOk, C } = x;
  // role 'Admin' / 'Super admin' <=> isAdmin; leaving those roles clears isAdmin unless the same edit sets it; never leave the portal without an active Admin
  const lastAdminGuard = (p, next) => {
    if (p.isAdmin && p.status === 'active' && !(next.isAdmin && next.status === 'active')
      && !load().profiles.some((q) => q.id !== p.id && q.isAdmin && q.status === 'active')) fail('There must always be at least one Admin.');
  };
  // Nov 2 (John): there must always be at least one active Super admin
  const lastSuperGuard = (p, next) => {
    if (p.role === C.SUPER_ADMIN_ROLE && p.status === 'active' && !(next.role === C.SUPER_ADMIN_ROLE && next.status === 'active')
      && !load().profiles.some((q) => q.id !== p.id && q.role === C.SUPER_ADMIN_ROLE && q.isAdmin && q.status === 'active')) fail('There must always be at least one Super admin.');
  };
  const teamOut = (t) => { const d = load(); return { ...t, members: d.teamMembers.filter((m) => m.teamId === t.id).map((m) => ({ ...m, name: nameOf(m.profileId), role: (prof(m.profileId) || {}).role })) }; };
  const SUPER_ONLY = 'Only a Super admin can do this to a Super admin.';
  // ---------- client <-> salesperson links (John, Nov 2; mirrors public.client_sales_reps, migration 17) ----------
  const links = () => { const d = load(); d.clientSalesReps ||= []; return d.clientSalesReps; };
  const personOut = (id) => { const q = prof(id) || {}; return { id, name: nameOf(id), role: q.role, status: q.status }; };
  const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : String(v).split(',')).map((z) => String(z).trim()).filter(Boolean);
  const checkSales = (id) => { const q = prof(id) || fail('Salesperson not found.');
    if (!C.isSalesRole(q.role)) fail('Only a Sales Person or Sales Team user can be linked to a client.'); if (q.status !== 'active') fail('Only an active salesperson can be linked.'); return q; };
  const checkClient = (id, role) => { const q = prof(id) || fail('User not found.'); if (q.status === 'removed') fail('This user was removed.');
    if (!C.isOutside(role || q.role)) fail('Only an outside user (a client) can be linked to salespeople.'); return q; };
  const isClientUser = (p) => { const d = load(); const c = contactOf(p.id);
    return links().some((l) => l.clientId === p.id) || (!!c && d.participants.some((z) => z.contactId === c.id && C.isClient(z.role))); };
  function setLinks(actor, clientId, salesIds) {
    const want = [...new Set(asList(salesIds))]; const cur = links().filter((l) => l.clientId === clientId).map((l) => l.salesId);
    const add = want.filter((id) => !cur.includes(id)); const drop = cur.filter((id) => !want.includes(id));
    add.forEach(checkSales); const d = load();
    d.clientSalesReps = links().filter((l) => !(l.clientId === clientId && drop.includes(l.salesId)));
    add.forEach((id) => d.clientSalesReps.push({ clientId, salesId: id, createdBy: actor.id, createdAt: now() }));
    add.forEach((id) => log(null, actor.id, 'sales_rep.linked', 'user', clientId, `Linked ${nameOf(clientId)} to salesperson ${nameOf(id)}`));
    drop.forEach((id) => log(null, actor.id, 'sales_rep.unlinked', 'user', clientId, `Removed link between ${nameOf(clientId)} and salesperson ${nameOf(id)}`));
    return add.length + drop.length;
  }
  const linksOf = (clientId) => links().filter((l) => l.clientId === clientId).map((l) => ({ ...personOut(l.salesId), createdAt: l.createdAt }));
  const usersOut = () => { const d = load(); return d.profiles.map((p) => { const c = contactOf(p.id);
        // outside users: their role comes from each order (deal_participants), shown here read-only
        const files = C.isOutside(p.role) && c ? d.participants.filter((z) => z.contactId === c.id && C.OUTSIDE_FILE_ROLES.includes(z.role)).map((z) => ({ dealId: z.dealId, fileNumber: (d.deals.find((q) => q.id === z.dealId) || {}).fileNumber, role: z.role })) : [];
        return { ...p, contactType: (c && c.contactType) || null, files, isClient: C.isOutside(p.role) && isClientUser(p), salesReps: linksOf(p.id),
          clients: links().filter((l) => l.salesId === p.id).map((l) => personOut(l.clientId)),
          teams: d.teamMembers.filter((m) => m.profileId === p.id).map((m) => (d.teams.find((t) => t.id === m.teamId) || {}).name) }; }); };
  return {
    // ---------- Users ----------
    async adminListUsers() { needAdmin(); return clone(usersOut()); },
    async adminGetUser(id) { needAdmin(); return clone(usersOut().find((q) => q.id === id) || fail('User not found.')); },
    async adminCreateUser(input) {
      const u = needAdmin(); const d = load(); const email = str(input.email, 200).toLowerCase();
      const isClient = input.isClient === true || input.isClient === 'on' || input.isClient === 'true'; const salesIds = asList(input.salesIds);
      const role = input.role || (isClient ? C.OUTSIDE : '');
      if (!emailOk(email)) fail('A valid email is required.');
      if (d.profiles.some((p) => p.email === email && p.status !== 'removed')) fail('A user with this email already exists.');
      if (C.OUTSIDE_FILE_ROLES.includes(role)) fail('Agents and clients are outside users: pick "Outside user". Their role is set on each order they are added to.');
      if (!C.ROLES.includes(role)) fail('Pick a role (account type).');
      if (role === C.SUPER_ADMIN_ROLE && !C.isSuperAdmin(u)) fail('Only a Super admin can grant the Super admin role.');
      if ((isClient || salesIds.length) && !C.isOutside(role)) fail('Only an outside user (a client) can be linked to salespeople. Pick "Outside user".');
      salesIds.forEach(checkSales);
      const firstName = str(input.firstName, 80) || fail('First name is required.');
      const p = { id: nid('u'), email, firstName, lastName: str(input.lastName, 80), phone: x.phone(input.phone), role, isAdmin: C.isAdminRole(role) || input.isAdmin === true || input.isAdmin === 'on',
        status: 'active', createdAt: now() };
      d.profiles.push(p);
      const existing = d.contacts.find((c) => c.email === email && !(c.profileId && (prof(c.profileId) || {}).status === 'removed'));   // reuse a contact so earlier order links carry over
      // contact type (John, Nov 2): outside users only; staff have none
      const ct = str(input.contactType, 20) || null; if (ct && !C.CONTACT_TYPE_CODES.includes(ct)) fail('Pick a contact type from the list (Realtor, Lender or Buyer/Seller).'); if (ct && !C.isOutside(role)) fail('CLA staff have no contact type.');
      if (existing) { existing.profileId = p.id; existing.contactType = C.isOutside(role) ? (ct || existing.contactType || null) : null; }
      else if (!C.isAdminRole(p.role)) d.contacts.push({ id: nid('c'), profileId: p.id, firstName: p.firstName, lastName: p.lastName, email, phone: p.phone, company: '', contactType: ct, createdBy: u.id, createdAt: now() });
      log(null, u.id, 'user.created', 'user', p.id, `Created user ${p.firstName} ${p.lastName} (${p.role}${p.isAdmin && !C.isAdminRole(p.role) ? ', Admin' : ''})`);
      if (salesIds.length) setLinks(u, p.id, salesIds);
      save(); return clone({ ...p, salesReps: linksOf(p.id) });
    },
    async adminUpdateUser(id, patch) {
      const u = needAdmin(); const p = prof(id) || fail('User not found.'); if (p.status === 'removed') fail('This user was removed.');
      const next = { role: p.role, isAdmin: !!p.isAdmin, status: p.status };
      if (patch.role != null && patch.role !== p.role) { if (C.OUTSIDE_FILE_ROLES.includes(patch.role)) fail('Agents and clients are outside users: pick "Outside user". Their role is set on each order.'); if (!C.ROLES.includes(patch.role)) fail('Unknown role.'); next.role = patch.role; }
      if (patch.isAdmin != null) next.isAdmin = patch.isAdmin === true || patch.isAdmin === 'on' || patch.isAdmin === 'true';
      if (patch.status != null) { if (!['active', 'disabled'].includes(patch.status)) fail('Unknown status.'); next.status = patch.status; }
      // Super admin rules (Nov 2): only a Super admin grants/removes the role or changes a Super admin's role, status or access
      const changes = next.role !== p.role || next.status !== p.status || next.isAdmin !== !!p.isAdmin;
      if (!C.isSuperAdmin(u)) {
        if (next.role === C.SUPER_ADMIN_ROLE && p.role !== C.SUPER_ADMIN_ROLE) fail('Only a Super admin can grant the Super admin role.');
        if (p.role === C.SUPER_ADMIN_ROLE && changes) fail(next.status !== p.status ? 'Only a Super admin can suspend or re-enable a Super admin.' : SUPER_ONLY);
      }
      if (p.id === u.id && p.isAdmin && !next.isAdmin) fail('You cannot remove your own Admin access.');
      if (C.isAdminRole(next.role)) { if (p.role === next.role && patch.isAdmin != null && !next.isAdmin) fail(`An ${next.role}-role user keeps Admin access; change the role first.`); next.isAdmin = true; }
      else if (C.isAdminRole(p.role) && patch.isAdmin == null) next.isAdmin = false;
      if (p.id === u.id && p.isAdmin && !next.isAdmin) fail('You cannot remove your own Admin access.');
      if (p.id === u.id && next.status !== 'active') fail('You cannot disable yourself.');
      lastAdminGuard(p, next); lastSuperGuard(p, next);
      // salesperson links: only outside users are clients; only Sales Person / Sales Team are salespeople
      const salesIds = patch.salesIds != null ? asList(patch.salesIds) : null;
      if (salesIds && salesIds.length && !C.isOutside(next.role)) fail('Only an outside user (a client) can be linked to salespeople.');
      if (next.role !== p.role) {
        if (!C.isOutside(next.role) && (salesIds ? salesIds.length : links().some((l) => l.clientId === p.id))) fail('This client is linked to salespeople. Remove those links before changing the account type.');
        if (!C.isSalesRole(next.role) && links().some((l) => l.salesId === p.id)) fail('This salesperson is linked to clients. Remove those links before changing the role.');
      }
      if (salesIds) salesIds.forEach((sid) => { if (!links().some((l) => l.clientId === p.id && l.salesId === sid)) checkSales(sid); });
      Object.assign(p, next);
      ['firstName', 'lastName'].forEach((k) => { if (patch[k] != null) p[k] = str(patch[k], 80); }); if (patch.phone != null) p.phone = x.phone(patch.phone);
      if (!p.firstName) fail('First name is required.');
      const c = contactOf(p.id); if (c) { c.firstName = p.firstName; c.lastName = p.lastName; c.phone = p.phone;
        // contact type (John, Nov 2): outside users only; becoming staff clears it
        if (patch.contactType !== undefined) { const ct = str(patch.contactType, 20) || null; if (ct && !C.CONTACT_TYPE_CODES.includes(ct)) fail('Pick a contact type from the list (Realtor, Lender or Buyer/Seller).');
          if (ct && !C.isOutside(p.role)) fail('CLA staff have no contact type.'); c.contactType = ct; }
        if (!C.isOutside(p.role)) c.contactType = null; }
      if (salesIds) setLinks(u, p.id, salesIds);
      log(null, u.id, 'user.updated', 'user', p.id, `Updated user ${p.firstName} ${p.lastName}`); save(); return clone({ ...p, salesReps: linksOf(p.id) });
    },
    async adminDeleteUser(id) {
      const u = needAdmin(); const d = load(); const p = prof(id) || fail('User not found.');
      if (p.id === u.id) fail('You cannot delete your own account.'); if (p.status === 'removed') fail('This user was already removed.');
      if (p.role === C.SUPER_ADMIN_ROLE && !C.isSuperAdmin(u)) fail('Only a Super admin can delete a Super admin.');
      lastAdminGuard(p, { isAdmin: false, status: 'removed' }); lastSuperGuard(p, { role: p.role, status: 'removed' });
      p.status = 'removed'; p.isAdmin = false; p.removedAt = now(); p.removedBy = u.id;
      d.teamMembers = d.teamMembers.filter((m) => m.profileId !== id);   // access through teams ends now
      d.clientSalesReps = links().filter((l) => l.clientId !== id && l.salesId !== id);   // and any client <-> salesperson links
      log(null, u.id, 'user.removed', 'user', id, `Removed user ${p.firstName} ${p.lastName} (documents, messages and history kept)`); save(); return true;
    },
    // ---------- client <-> salesperson links ----------
    async adminSetSalesReps(clientId, salesIds) { const u = needAdmin(); checkClient(clientId); setLinks(u, clientId, salesIds); save(); return clone(linksOf(clientId)); },
    async adminLinkSalesRep(clientId, salesId) { const u = needAdmin(); checkClient(clientId);
      if (links().some((l) => l.clientId === clientId && l.salesId === salesId)) fail('Already linked.'); checkSales(salesId);
      setLinks(u, clientId, [...links().filter((l) => l.clientId === clientId).map((l) => l.salesId), salesId]); save(); return clone(linksOf(clientId)); },
    async adminUnlinkSalesRep(clientId, salesId) { const u = needAdmin();
      if (!links().some((l) => l.clientId === clientId && l.salesId === salesId)) fail('Not linked.');
      setLinks(u, clientId, links().filter((l) => l.clientId === clientId && l.salesId !== salesId).map((l) => l.salesId)); save(); return clone(linksOf(clientId)); },
    // Admin and Processor: every link. Sales Person / Sales Team: their own clients. Everyone else (TC, agents, clients): refused.
    async listClientSalesReps() { const u = needUser();
      const all = u.isAdmin || C.isProcessor(u.role); if (!all && !C.isSalesRole(u.role)) fail('Client-salesperson links are for CLA staff.');
      return clone(links().filter((l) => all || l.salesId === u.id).map((l) => ({ clientId: l.clientId, clientName: nameOf(l.clientId), salesId: l.salesId, salesName: nameOf(l.salesId), salesRole: (prof(l.salesId) || {}).role, createdAt: l.createdAt }))); },
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
      if (want === 'agent' && !C.isOutside(p.role)) fail('Only outside users (agents) can be team agents.');   // the coordinator then sees the files where they are an AGENT
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
