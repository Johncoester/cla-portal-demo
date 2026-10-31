/* mock adapter: messages (with notifications) and the activity log (with filters). User admin lives in mock-part-admin.js (Admin flag only). */
export function messagesActivity(x) {
  const { load, save, nid, needUser, notViewOnly, dealOr404, onDeal, fileRole, dealsFor, log, nameOf, roleOf, threadVisible, unreadIn, participantsOf, notify, clone, now, fail, str, docVisible, taskVisible, localDayOf, C } = x;
  const withPeople = (t) => ({ ...t, participants: t.participantIds.map((id) => ({ id, name: nameOf(id), role: x.fileRoleText(id, t.dealId) })) });
  const api = {
    async listMessageRecipients(dealId) {
      let u = needUser(); u = onDeal(u, dealId); const ids = new Set(participantsOf(dealId, u).map((p) => p.contact && p.contact.profileId).filter(Boolean));
      ids.add(load().deals.find((z) => z.id === dealId).processorId);
      if (u.role === 'Transaction Coordinator') ids.add(u.id);
      // outside users: CLA staff + their own side only (never the other side's agent or client)
      return clone(load().profiles.filter((p) => ids.has(p.id) && p.id !== u.id && p.status === 'active' && x.canMessage(u, p.id, dealId))
        .map(({ id, firstName, lastName }) => ({ id, firstName, lastName, role: x.fileRoleText(id, dealId), side: x.personSide(id, dealId) })));
    },
    async listThreads(dealId) {
      let u = needUser(); u = onDeal(u, dealId); const d = load();
      return clone(d.threads.filter((t) => t.dealId === dealId && threadVisible(u, t)).map((t) => {
        const ms = d.messages.filter((m) => m.threadId === t.id); const last = ms[ms.length - 1];
        return { ...withPeople(t), count: ms.length, lastAt: last ? last.createdAt : t.createdAt, lastBody: last ? last.body : '', unread: unreadIn(u, t) };
      }).sort((a, b) => b.lastAt.localeCompare(a.lastAt)));
    },
    async getThread(id) {
      let u = needUser(); const d = load(); const t = d.threads.find((z) => z.id === id) || fail('Conversation not found.'); u = onDeal(u, t.dealId); if (!threadVisible(u, t)) fail('Conversation not found.');
      return clone({ ...withPeople(t), messages: d.messages.filter((m) => m.threadId === id).map((m) => ({ ...m, authorName: nameOf(m.authorId), mine: m.authorId === u.id })) });
    },
    async createThread(dealId, { subject, participantIds, body }) {
      let u = needUser(); u = onDeal(u, dealId); notViewOnly(u); const d = load();
      const allowed = new Set((await api.listMessageRecipients(dealId)).map((p) => p.id)); const ids = [...new Set((participantIds || []).filter((i) => allowed.has(i)))];
      if ((participantIds || []).some((i) => !allowed.has(i) && i !== u.id)) fail('You can message CLA Title staff and people on your own side of this order only.');
      if (!ids.length) fail('Pick at least one recipient on this order.'); if (!str(body, 4000)) fail('Write a message first.');
      if (x.mixedSides([u.id, ...ids], dealId)) fail('A conversation can include CLA Title staff and ONE side of the order (buyer side or seller side), not both. Start a separate conversation for each side.');
      const t = { id: nid('th'), dealId, subject: str(subject, 150) || 'New conversation', createdBy: u.id, createdAt: now(), participantIds: [u.id, ...ids] };
      d.threads.push(t); d.messages.push({ id: nid('m'), threadId: t.id, authorId: u.id, body: str(body, 4000), createdAt: now() }); d.reads.push({ threadId: t.id, profileId: u.id, at: now() });
      log(dealId, u.id, 'message.thread', 'thread', t.id, `Started conversation: ${t.subject}`);
      notify(t.participantIds, { kind: 'message', dealId, title: `New conversation from ${nameOf(u.id)}: ${t.subject}`, link: `#/deals/${dealId}/inbox/${t.id}` }, u.id); save(); return clone(t);
    },
    async postMessage(threadId, body) {
      let u = needUser(); const d = load(); const t = d.threads.find((z) => z.id === threadId) || fail('Conversation not found.'); u = onDeal(u, t.dealId); notViewOnly(u);
      if (!threadVisible(u, t) || !t.participantIds.includes(u.id)) fail('You are not part of this conversation.');
      if (!x.isStaffView(u) && t.participantIds.some((pid) => pid !== u.id && !x.canMessage(u, pid, t.dealId))) fail('This conversation includes the other side of the order. Ask CLA Title to start a separate conversation for your side.');
      const text = str(body, 4000); if (!text) fail('Write a message first.');
      const m = { id: nid('m'), threadId, authorId: u.id, body: text, createdAt: now() }; d.messages.push(m);
      log(t.dealId, u.id, 'message.posted', 'thread', threadId, `Message in: ${t.subject}`);
      notify(t.participantIds, { kind: 'message', dealId: t.dealId, title: `New message from ${nameOf(u.id)}: ${t.subject}`, link: `#/deals/${t.dealId}/inbox/${t.id}` }, u.id); await api.markThreadRead(threadId); save(); return clone(m);
    },
    async markThreadRead(threadId) {
      let u = needUser(); const d = load(); let r = d.reads.find((z) => z.threadId === threadId && z.profileId === u.id);
      if (!r) { r = { threadId, profileId: u.id, at: '' }; d.reads.push(r); } r.at = new Date(Date.now() + 1).toISOString(); save();
    },
    // ---------- Activity log (read-only; written by the actions above). Filters: action prefix, actor, date range, text. ----------
    // dealId given: that order's log (not for clients). No dealId: the whole log (processor and Admin only).
    async listActivity(dealId, f = {}) {
      let u = needUser(); let ids;
      if (dealId) { u = onDeal(u, dealId); ids = new Set([dealId]); }   // outside users: their role ON THIS FILE decides (a client on this file cannot)
      else { if (!(C.isProcessor(u.role) || u.isAdmin)) fail('The full activity log is for the processor and Admin.'); ids = null; }
      // ACTIVITY LOG = CLA staff only (Matt, Oct 31): processor + Admin see everything; TC / Sales Person / Sales Team keep their order log (filtered below).
      // Every outside user (buyers, sellers, agents; self-represented too) is refused, in the UI and here. Mirrored by RLS activity_select (migration 13).
      if (!x.isStaffView(u)) fail('The activity log is for CLA Title staff only.');
      const d = load(); const deals = new Map(d.deals.map((q) => [q.id, q]));
      // Entries about things this viewer cannot open (staff-only / other-side documents, conversations they are not in, hidden tasks) are left out,
      // otherwise the log leaks file names and subjects. Processor and Admin see everything.
      const full = C.isProcessor(u.role) || u.isAdmin;
      const canSee = (a) => { if (full) return true;
        if (a.entity === 'document') { const z = d.documents.find((q) => q.id === a.entityId); return !z || docVisible(u, z); }
        if (a.entity === 'thread') { const t = d.threads.find((q) => q.id === a.entityId); return !t || threadVisible(u, t); }
        if (a.entity === 'task') { const t = d.tasks.find((q) => q.id === a.entityId); return !t || taskVisible(u, t); }
        return true; };
      const base = d.activity.filter((a) => (ids ? ids.has(a.dealId) : (u.isAdmin || a.dealId !== null || a.actorId === u.id)) && canSee(a));
      const q = str(f.q, 100).toLowerCase();
      const items = base.filter((a) => (!f.type || a.action.split('.')[0] === f.type) && (!f.actorId || a.actorId === f.actorId)
        && (!f.from || localDayOf(a.createdAt) >= f.from) && (!f.to || localDayOf(a.createdAt) <= f.to) && (!q || a.detail.toLowerCase().includes(q)))
        .map((a) => ({ ...a, actorName: nameOf(a.actorId), actorRole: x.fileRoleText(a.actorId, a.dealId), fileNumber: a.dealId ? (deals.get(a.dealId) || {}).fileNumber : '' }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return clone({ items: items.slice(0, 300), total: items.length,
        types: [...new Set(base.map((a) => a.action.split('.')[0]))].sort(),
        actors: [...new Set(base.map((a) => a.actorId))].map((id) => ({ id, name: nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name)) });
    },
  };
  return api;
}
