/* mock adapter, part 3: messages, activity log, user admin (Sales Processor only). */
export function messagesAdmin(x) {
  const { load, save, nid, needUser, needProcessor, notViewOnly, dealOr404, log, nameOf, roleOf, threadVisible, unreadIn, participantsOf, contactOf, clone, now, fail, str, emailOk, C } = x;
  const withPeople = (t) => ({ ...t, participants: t.participantIds.map((id) => ({ id, name: nameOf(id), role: roleOf(id) })) });
  const api = {
    async listMessageRecipients(dealId) {
      const u = needUser(); dealOr404(u, dealId); const ids = new Set(participantsOf(dealId, u).map((p) => p.contact.profileId).filter(Boolean));
      ids.add(load().deals.find((z) => z.id === dealId).processorId);
      return clone(load().profiles.filter((p) => ids.has(p.id) && p.id !== u.id && p.status === 'active').map(({ id, firstName, lastName, role }) => ({ id, firstName, lastName, role })));
    },
    async listThreads(dealId) {
      const u = needUser(); dealOr404(u, dealId); const d = load();
      return clone(d.threads.filter((t) => t.dealId === dealId && threadVisible(u, t)).map((t) => {
        const ms = d.messages.filter((m) => m.threadId === t.id); const last = ms[ms.length - 1];
        return { ...withPeople(t), count: ms.length, lastAt: last ? last.createdAt : t.createdAt, lastBody: last ? last.body : '', unread: unreadIn(u, t) };
      }).sort((a, b) => b.lastAt.localeCompare(a.lastAt)));
    },
    async getThread(id) {
      const u = needUser(); const d = load(); const t = d.threads.find((z) => z.id === id) || fail('Conversation not found.'); dealOr404(u, t.dealId); if (!threadVisible(u, t)) fail('Conversation not found.');
      return clone({ ...withPeople(t), messages: d.messages.filter((m) => m.threadId === id).map((m) => ({ ...m, authorName: nameOf(m.authorId), mine: m.authorId === u.id })) });
    },
    async createThread(dealId, { subject, participantIds, body }) {
      const u = needUser(); dealOr404(u, dealId); notViewOnly(u); const d = load();
      const allowed = new Set((await api.listMessageRecipients(dealId)).map((p) => p.id)); const ids = [...new Set((participantIds || []).filter((i) => allowed.has(i)))];
      if (!ids.length) fail('Pick at least one recipient on this order.'); if (!str(body, 4000)) fail('Write a message first.');
      const t = { id: nid('th'), dealId, subject: str(subject, 150) || 'New conversation', createdBy: u.id, createdAt: now(), participantIds: [u.id, ...ids] };
      d.threads.push(t); d.messages.push({ id: nid('m'), threadId: t.id, authorId: u.id, body: str(body, 4000), createdAt: now() }); d.reads.push({ threadId: t.id, profileId: u.id, at: now() });
      log(dealId, u.id, 'message.thread', 'thread', t.id, `Started conversation: ${t.subject}`); save(); return clone(t);
    },
    async postMessage(threadId, body) {
      const u = needUser(); const d = load(); const t = d.threads.find((z) => z.id === threadId) || fail('Conversation not found.'); dealOr404(u, t.dealId); notViewOnly(u);
      if (!threadVisible(u, t) || !t.participantIds.includes(u.id)) fail('You are not part of this conversation.');
      const text = str(body, 4000); if (!text) fail('Write a message first.');
      const m = { id: nid('m'), threadId, authorId: u.id, body: text, createdAt: now() }; d.messages.push(m);
      log(t.dealId, u.id, 'message.posted', 'thread', threadId, `Message in: ${t.subject}`); await api.markThreadRead(threadId); save(); return clone(m);
    },
    async markThreadRead(threadId) {
      const u = needUser(); const d = load(); let r = d.reads.find((z) => z.threadId === threadId && z.profileId === u.id);
      if (!r) { r = { threadId, profileId: u.id, at: '' }; d.reads.push(r); } r.at = new Date(Date.now() + 1).toISOString(); save();
    },
    // ---------- Activity log (read-only; written by the actions above) ----------
    async listActivity(dealId) {
      const u = needUser(); if (dealId) dealOr404(u, dealId); else needProcessor();
      if (C.isClient(u.role)) fail('Activity is for staff, agents and coordinators.');
      return clone(load().activity.filter((a) => !dealId || a.dealId === dealId)
        .map((a) => ({ ...a, actorName: nameOf(a.actorId), fileNumber: (load().deals.find((z) => z.id === a.dealId) || {}).fileNumber }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200));
    },
    // ---------- User management (Sales Processor only; users are disabled, never deleted) ----------
    async adminListUsers() { needProcessor(); return clone(load().profiles); },
    async adminUpdateUser(id, patch) {
      const u = needProcessor(); const p = load().profiles.find((z) => z.id === id) || fail('User not found.');
      if (patch.role != null) { if (!C.ROLES.includes(patch.role)) fail('Unknown role.'); if (p.id === u.id && patch.role !== p.role) fail('You cannot change your own role.'); p.role = patch.role; }
      if (patch.status != null) { if (!['active', 'disabled'].includes(patch.status)) fail('Unknown status.'); if (p.id === u.id && patch.status !== 'active') fail('You cannot disable yourself.'); p.status = patch.status; }
      ['firstName', 'lastName', 'phone'].forEach((k) => { if (patch[k] != null) p[k] = str(patch[k], 80); });
      const c = contactOf(p.id); if (c) { c.firstName = p.firstName; c.lastName = p.lastName; c.phone = p.phone; }
      save(); return clone(p);
    },
    async adminCreateUser(input) {
      const u = needProcessor(); const d = load(); const email = str(input.email, 200).toLowerCase();
      if (!emailOk(email)) fail('A valid email is required.');
      if (d.profiles.some((p) => p.email === email)) fail('A user with this email already exists.');
      if (!C.ROLES.includes(input.role)) fail('Pick a role.');
      const firstName = str(input.firstName, 80) || fail('First name is required.');
      const p = { id: nid('u'), email, firstName, lastName: str(input.lastName, 80), phone: str(input.phone, 40), role: input.role, status: 'active', createdAt: now() };
      d.profiles.push(p);
      const existing = d.contacts.find((c) => c.email === email);   // reuse an existing contact so earlier order links carry over
      if (existing) existing.profileId = p.id;
      else d.contacts.push({ id: nid('c'), profileId: p.id, firstName: p.firstName, lastName: p.lastName, email, phone: p.phone, company: '', createdBy: u.id, createdAt: now() });
      save(); return clone(p);
    },
  };
  return api;
}
