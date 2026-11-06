/* mock adapter: messages (with notifications) and the activity log (with filters). User admin lives in mock-part-admin.js (Admin flag only). */
export function messagesActivity(x) {
  const { load, save, nid, needUser, notViewOnly, dealOr404, onDeal, fileRole, dealsFor, log, nameOf, roleOf, threadVisible, unreadIn, participantsOf, notify, clone, now, fail, str, docVisible, taskVisible, localDayOf, C } = x;
  const withPeople = (t) => ({ ...t, participants: t.participantIds.map((id) => ({ id, name: nameOf(id), role: x.fileRoleText(id, t.dealId), wireOk: x.wireAllowed(id, t.dealId) })) });
  // WIRE INSTRUCTIONS (John, Nov 3): text that carries wire details never goes into a conversation that includes anyone who may not get them (an agent,
  // the seller side ...). Staff start a conversation with the buyer alone instead. Mirrored by the messages_wire_guard trigger (migration 29).
  x.wireTextGuard = (ids, dealId, text) => { if (!x.looksLikeWireDetails(text)) return; const no = [...new Set(ids)].filter((id) => !x.wireAllowed(id, dealId));
    if (no.length) fail(`${x.WIRE_BUYER_ONLY} This conversation includes ${no.map((id) => `${nameOf(id)} (${x.fileRoleText(id, dealId)})`).join(', ')}. Start a conversation with the buyer alone to send wire details.`); };
  const api = {
    // { wire: true }: only the people who may receive WIRE INSTRUCTIONS (CLA staff + the buyer clients on this file; never an agent). Every row says wireOk.
    async listMessageRecipients(dealId, { wire = false } = {}) {
      let u = needUser(); u = onDeal(u, dealId); const staff = x.isStaffView(u); const seen = new Set(); const rows = [];
      const add = (id, firstName, lastName, role) => { if (!id || id === u.id || seen.has(id)) return; if (!staff && String(id).startsWith('contact:')) return;
        if (!String(id).startsWith('contact:') && !x.canMessage(u, id, dealId)) return; if (wire && (String(id).startsWith('contact:') || !x.wireAllowed(id, dealId))) return;
        seen.add(id); rows.push({ id, firstName, lastName, role: role || x.fileRoleText(id, dealId), side: String(id).startsWith('contact:') ? null : x.personSide(id, dealId), wireOk: String(id).startsWith('contact:') ? false : x.wireAllowed(id, dealId) }); };
      for (const p of participantsOf(dealId, u)) { if (p.removed || !p.contact) continue; const c = p.contact;
        add(c.profileId || (staff ? `contact:${c.id}` : null), c.firstName, c.lastName, p.role); }
      const deal = load().deals.find((z) => z.id === dealId);
      if (deal) { add(deal.processorId, (load().profiles.find((p) => p.id === deal.processorId) || {}).firstName, (load().profiles.find((p) => p.id === deal.processorId) || {}).lastName, 'Processor');
        add(deal.preprocessorUserId, (load().profiles.find((p) => p.id === deal.preprocessorUserId) || {}).firstName, (load().profiles.find((p) => p.id === deal.preprocessorUserId) || {}).lastName, 'Preprocessor'); }
      for (const s of load().dealSalesPeople || []) if (s.dealId === dealId) { const p = load().profiles.find((z) => z.id === s.salesId); if (p) add(p.id, p.firstName, p.lastName, p.role); }
      if (u.role === 'Transaction Coordinator') add(u.id, u.firstName, u.lastName, u.role);
      return clone(rows.filter((r) => r.id !== u.id));
    },
    async listThreads(dealId) {
      let u = needUser(); u = onDeal(u, dealId); const d = load();
      return clone(d.threads.filter((t) => t.dealId === dealId && threadVisible(u, t)).map((t) => {
        const ms = d.messages.filter((m) => m.threadId === t.id); const last = ms[ms.length - 1];
        return { ...withPeople(t), count: ms.length, lastAt: last ? last.createdAt : t.createdAt, lastBody: last ? last.body : '', lastFrom: last ? nameOf(last.authorId) : '', hasFiles: ms.some((m) => (m.attachmentIds || []).some((id) => { const z = d.documents.find((q) => q.id === id); return z && docVisible(u, z); })), taskId: t.taskId || null, unread: unreadIn(u, t) };
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
      const profiles = ids.filter((i) => !String(i).startsWith('contact:')); const externals = ids.filter((i) => String(i).startsWith('contact:'));
      if (externals.length && !x.isStaffView(u)) fail('You can message CLA Title staff and people on your own side of this order only.');
      if (profiles.length && x.mixedSides([u.id, ...profiles], dealId)) fail('A conversation can include CLA Title staff and ONE side of the order (buyer side or seller side), not both. Start a separate conversation for each side.');
      x.wireTextGuard([u.id, ...profiles], dealId, `${str(subject, 150)}\n${str(body, 4000)}`);
      if (externals.length) { for (const id of externals) { const c = d.contacts.find((z) => z.id === id.slice(8)); if (!c) fail('That contact is not on this order.');
        d.outbox.push({ id: nid('ob'), channel: 'email', status: 'queued', toEmail: c.email || '', toName: `${c.firstName} ${c.lastName}`.trim(), subject: str(subject, 150) || 'New conversation', body: str(body, 4000), dealId, createdBy: u.id, createdAt: now(), sentAt: null }); } }
      const t = { id: nid('th'), dealId, subject: str(subject, 150) || 'New conversation', createdBy: u.id, createdAt: now(), participantIds: [u.id, ...profiles] };
      d.threads.push(t); d.messages.push({ id: nid('m'), threadId: t.id, authorId: u.id, body: str(body, 4000), createdAt: now() }); d.reads.push({ threadId: t.id, profileId: u.id, at: now() });
      log(dealId, u.id, 'message.thread', 'thread', t.id, `Started conversation: ${t.subject}`);
      notify(t.participantIds, { kind: 'message', dealId, title: `New conversation from ${nameOf(u.id)}: ${t.subject}`, link: `#/deals/${dealId}/inbox/${t.id}` }, u.id); save(); return clone(t);
    },
    async postMessage(threadId, body) {
      let u = needUser(); const d = load(); const t = d.threads.find((z) => z.id === threadId) || fail('Conversation not found.'); u = onDeal(u, t.dealId); notViewOnly(u);
      if (!threadVisible(u, t) || !t.participantIds.includes(u.id)) fail('You are not part of this conversation.');
      if (!x.isStaffView(u) && t.participantIds.some((pid) => pid !== u.id && !x.canMessage(u, pid, t.dealId))) fail('This conversation includes the other side of the order. Ask CLA Title to start a separate conversation for your side.');
      const text = str(body, 4000); if (!text) fail('Write a message first.'); x.wireTextGuard(t.participantIds, t.dealId, text);
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
      else { if (!(C.runsOrders(u) || u.isAdmin)) fail('The full activity log is for the processor and Admin.'); ids = null; }
      // ACTIVITY LOG = CLA staff only (Matt, Oct 31): processor + Admin see everything; TC / Sales Person / Sales Team keep their order log (filtered below).
      // Every outside user (buyers, sellers, agents; self-represented too) is refused, in the UI and here. Mirrored by RLS activity_select (migration 13).
      if (!x.isStaffView(u)) fail('The activity log is for CLA Title staff only.');
      const d = load(); const deals = new Map(d.deals.map((q) => [q.id, q]));
      // Entries about things this viewer cannot open (staff-only / other-side documents, conversations they are not in, hidden tasks) are left out,
      // otherwise the log leaks file names and subjects. Processor and Admin see everything.
      const full = C.runsOrders(u) || u.isAdmin;
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
