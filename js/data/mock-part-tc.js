/* TC PORTAL (John, Nov 5): typed contract / EMD / ALTA fields + staff-coordinated all-parties thread.
 * Mirrors supabase/migrations/20261105000071_tc_contract_emd_alta.sql. FAKE DATA ONLY. */
// Commissions are not contract figures any more: they are Agent fees (one place, John Nov 13 2026).
export const TC_CONTRACT_FIELDS = ['purchasePrice', 'contractDate', 'sellerConcessions', 'emdAmount', 'emdHolder', 'closingDate'];
export function ensureTc(d) {
  (d.deals || []).forEach((q) => {
    const defaults = { contractDate: q.openDate || null, emdHolder: '', emdReceived: false, emdReceivedDate: null, emdReceivedAmount: null,
      altaReceived: false, altaReceivedDate: null, altaDocumentId: null, stageDates: {}, sellerConcessions: null };
    Object.keys(defaults).forEach((k) => { if (q[k] === undefined) q[k] = defaults[k]; });
  });
  return d;
}
export function tcPortal(x, api) {
  const { load, save, needUser, onDeal, dealOr404, log, clone, fail, str, dateOrNull, emailOk, C } = x;
  const OPEN = ['todo', 'in_progress', 'blocked'];
  const canEdit = (id) => { const u = needUser(); dealOr404(u, id); if (!(C.runsOrders(u) || u.role === 'Transaction Coordinator' || u.isAdmin)) fail('Only the CLA Title processor or coordinator can edit this.'); x.notViewOnly(u); return u; };
  const num = (v, label) => { if (v === undefined || v === null || String(v).trim() === '') return null; const n = Number(String(v).replace(/[$,\s]/g, '')); if (!Number.isFinite(n) || n < 0) fail(`${label} must be a non-negative number.`); return n; };
  const dt = (v, label) => (v == null || v === '' ? null : dateOrNull(v, label));
  const milestones = (q) => C.STAGES.map((name, i) => ({ index: i, name, state: q.status === 'Closed' ? 'done' : i < q.stage ? 'done' : i === q.stage ? 'current' : 'upcoming',
    date: (q.stageDates || {})[i] || (i === 0 ? q.openDate : i === 3 ? q.closingDate : i === 9 && q.status === 'Closed' ? q.closingDate : null) }));
  const emdAlta = (q) => ({ received: !!q.emdReceived, receivedDate: q.emdReceivedDate || null, receivedAmount: q.emdReceivedAmount == null ? q.emdAmount : q.emdReceivedAmount,
    holder: q.emdHolder || '', altaReceived: !!q.altaReceived, altaReceivedDate: q.altaReceivedDate || null, altaDocumentId: q.altaDocumentId || null });
  const part = {
    async getContractInfo(id) { const u = needUser(); dealOr404(u, id); const q = load().deals.find((z) => z.id === id); const deal = await api.getDeal(id);
      return clone({ ...Object.fromEntries(TC_CONTRACT_FIELDS.map((k) => [k, q[k] == null ? '' : q[k]])),
        clients: deal.participants.filter((p) => ['Client-Buyer', 'Client-Seller'].includes(p.role)).map((p) => ({ participantId: p.id, contactId: p.contactId, role: p.role, firstName: p.contact.firstName, lastName: p.contact.lastName, email: p.contact.email || '', phone: p.contact.phone || '' })) }); },
    async updateContractInfo(id, patch = {}) { const u = canEdit(id); const q = load().deals.find((z) => z.id === id);
      const nums = { purchasePrice: 'Purchase price', sellerConcessions: 'Seller concessions', emdAmount: 'EMD amount' };
      for (const [k, label] of Object.entries(nums)) if (patch[k] !== undefined) q[k] = num(patch[k], label);
      if (patch.contractDate !== undefined) q.contractDate = dt(patch.contractDate, 'Contract date');
      if (patch.closingDate !== undefined) q.closingDate = dt(patch.closingDate, 'Settlement date');
      if (patch.emdHolder !== undefined) q.emdHolder = str(patch.emdHolder, 200);
      log(id, u.id, 'deal.contract_updated', 'deal', id, 'Contract info updated (TC portal)'); save(); return part.getContractInfo(id); },
    async updateClientContact(id, participantId, patch) { const u = canEdit(id); const p = load().participants.find((z) => z.id === participantId && z.dealId === id) || fail('Person not found on this order.');
      if (!['Client-Buyer', 'Client-Seller'].includes(p.role)) fail('Only a buyer or seller contact is edited here.'); const c = load().contacts.find((z) => z.id === p.contactId) || fail('Contact not found.');
      const first = str(patch.firstName, 80); if (!first) fail('First name is required.'); const em = str(patch.email, 200).toLowerCase(); if (em && !emailOk(em)) fail('Email is not valid.');
      c.firstName = first; c.lastName = str(patch.lastName, 80); c.email = em; c.phone = x.phone(patch.phone || '', 'Client phone');
      if (c.profileId) { const pr = x.prof(c.profileId); if (pr) { pr.firstName = c.firstName; pr.lastName = c.lastName; pr.phone = c.phone; } }
      log(id, u.id, 'contact.client_updated', 'contact', c.id, `Client contact updated: ${c.firstName} ${c.lastName}`); save(); return clone(c); },
    async getMilestones(id) { const u = needUser(); const q = dealOr404(u, id); return clone(milestones(q)); },
    async getEmdAlta(id) { const u = needUser(); const q = dealOr404(u, id); return clone(emdAlta(q)); },
    async updateEmdAlta(id, p = {}) { const u = canEdit(id); const q = load().deals.find((z) => z.id === id);
      if (p.received !== undefined) { q.emdReceived = p.received === true || p.received === 'yes' || p.received === 'true' || p.received === 'on';
        if (q.emdReceived) { q.emdReceivedDate = dt(p.receivedDate, 'EMD received date') || q.emdReceivedDate || x.localDate(); q.emdReceivedAmount = p.receivedAmount !== undefined ? num(p.receivedAmount, 'EMD received amount') : (q.emdReceivedAmount == null ? q.emdAmount : q.emdReceivedAmount); }
        else { q.emdReceivedDate = null; q.emdReceivedAmount = null; } }
      else { if (p.receivedDate !== undefined) q.emdReceivedDate = dt(p.receivedDate, 'EMD received date'); if (p.receivedAmount !== undefined) q.emdReceivedAmount = num(p.receivedAmount, 'EMD received amount'); }
      if (p.altaDocumentId) { const doc = load().documents.find((z) => z.id === p.altaDocumentId && z.dealId === id) || fail('ALTA document not found on this order.'); q.altaDocumentId = doc.id; q.altaReceived = true; q.altaReceivedDate = dt(p.altaReceivedDate, 'Signed ALTA date') || x.localDate(); }
      if (p.altaReceived !== undefined) { q.altaReceived = p.altaReceived === true || p.altaReceived === 'yes' || p.altaReceived === 'true' || p.altaReceived === 'on';
        if (q.altaReceived) q.altaReceivedDate = dt(p.altaReceivedDate, 'Signed ALTA date') || q.altaReceivedDate || x.localDate(); else { q.altaReceivedDate = null; q.altaDocumentId = null; } }
      log(id, u.id, 'deal.emd_alta_updated', 'deal', id, 'EMD / ALTA tracker updated'); save(); return clone(emdAlta(q)); },
    async getTcFileSummary(id) { const u = needUser(); const q = dealOr404(u, id); const tasks = (await api.listTasks(id)).filter((t) => OPEN.includes(t.status));
      return clone({ deal: await api.getDeal(id), milestones: milestones(q), emdAlta: emdAlta(q), outstanding: tasks.length, tasks: tasks.slice(0, 12) }); },
    async getTcFileSummaries(ids) { const u = needUser(); const want = new Set(ids || []); const rows = [];
      for (const q of load().deals) { if (!want.has(q.id)) continue; try { dealOr404(u, q.id); } catch (e) { continue; }
        const tasks = (await api.listTasks(q.id)).filter((t) => OPEN.includes(t.status));
        rows.push(clone({ dealId: q.id, milestones: milestones(q), emdAlta: emdAlta(q), outstanding: tasks.length, tasks: tasks.slice(0, 12) })); }
      return rows; },
    async createAllPartiesThread(id, { subject, body }) { const u = canEdit(id); onDeal(u, id); const all = await api.listMessageRecipients(id);
      const staff = all.filter((r) => r.side === 'staff').map((r) => r.id); const t = await api.createThread(id, { subject, participantIds: staff, body });
      const th = load().threads.find((z) => z.id === t.id); th.staffCoordinated = true; th.participantIds = [...new Set([u.id, ...all.map((r) => r.id)])];
      load().messages.filter((m) => m.threadId === t.id).forEach((m) => { m.staffCoordinated = true; });
      log(id, u.id, 'message.coordinated', 'thread', t.id, 'Started all-parties coordination (each client sees only their own side + CLA staff)'); save(); return clone(t); },
  };
  return part;
}
export function tcMessageViews(api, x) {
  const { load, needUser, nameOf } = x; const list = api.listThreads; const get = api.getThread; const post = api.postMessage;
  const allowedOn = (u, dealId, pid) => pid === u.id || x.personSide(pid, dealId) === 'staff' || x.personSide(pid, dealId) === x.personSide(u.id, dealId);
  api.listThreads = async function (dealId) {
    const rows = await list.call(this, dealId); const u = needUser();
    return rows.map((t) => {
      const raw = load().threads.find((z) => z.id === t.id); const sc = !!raw?.staffCoordinated;
      if (!sc || x.isStaffView(u)) return { ...t, staffCoordinated: sc };
      const ms = load().messages.filter((m) => m.threadId === t.id && allowedOn(u, dealId, m.authorId));
      const last = ms[ms.length - 1];
      return { ...t, staffCoordinated: true, participants: (t.participants || []).filter((p) => allowedOn(u, dealId, p.id)),
        count: ms.length, lastAt: last ? last.createdAt : t.createdAt || t.lastAt, lastBody: last ? last.body : '', lastFrom: last ? nameOf(last.authorId) : '' };
    });
  };
  api.getThread = async function (id) { const t = await get.call(this, id); const u = needUser(); const raw = load().threads.find((z) => z.id === id);
    if (!raw?.staffCoordinated) return t; if (x.isStaffView(u)) return { ...t, staffCoordinated: true };
    return { ...t, staffCoordinated: true, participants: t.participants.filter((p) => allowedOn(u, t.dealId, p.id)), messages: t.messages.filter((m) => allowedOn(u, t.dealId, m.authorId)) }; };
  // Staff-coordinated: outside parties may reply (they still only READ staff + own side). Notify staff + the author's side only.
  api.postMessage = async function (threadId, body) {
    const raw = load().threads.find((z) => z.id === threadId);
    if (!raw?.staffCoordinated) return post.call(this, threadId, body);
    const u = needUser(); x.onDeal(u, raw.dealId); x.notViewOnly(u);
    if (!x.threadVisible(u, raw) || (!raw.participantIds.includes(u.id) && !x.isStaffView(u))) throw new Error('You are not part of this conversation.');
    const text = x.str(body, 4000); if (!text) throw new Error('Write a message first.');
    const side = x.personSide(u.id, raw.dealId);
    const visibleIds = raw.participantIds.filter((pid) => x.isStaffView(u) || allowedOn(u, raw.dealId, pid));
    x.wireTextGuard(visibleIds, raw.dealId, text);
    const m = { id: x.nid('m'), threadId, authorId: u.id, body: text, createdAt: x.now(), staffCoordinated: true };
    load().messages.push(m); x.log(raw.dealId, u.id, 'message.posted', 'thread', threadId, `Message in: ${raw.subject}`);
    const targets = raw.participantIds.filter((pid) => pid !== u.id && (x.personSide(pid, raw.dealId) === 'staff' || x.personSide(pid, raw.dealId) === side));
    x.notify(targets, { kind: 'message', dealId: raw.dealId, title: `New message from ${nameOf(u.id)}: ${raw.subject}`, link: `#/deals/${raw.dealId}/inbox/${raw.id}` }, u.id);
    await api.markThreadRead(threadId); x.save(); return x.clone(m);
  };
  return api;
}
