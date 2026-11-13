/* mock adapter: the Qualia-style agent portal (Francis Santos, video 1, Nov 3). FAKE DATA ONLY. Mirrored by migration 28.
 * Order overview (one-source progress, Order Details, Parties with Message / Call, counts for the tab badges), agent tasks with View Submission /
 * Modify / Submit Revision, task-tied messages, Request Update (staff answer it), Share Access (RECORDED only: no email, no login is created),
 * "Complete Requests Now" invite email (preview + outbox only), rich-text messages with file attachments (Share Files), and the outside user's own
 * Activity feed (only things they can already open). Nothing here deletes anything; documents stay permanent. */
import { phaseOf, UPDATE_TOPICS, ORG_PERMISSIONS, AGENT_TASKS, agentTaskDef, CLIENT_ROLE_OF, validateAgentAnswers, sanitizeMessageHtml, htmlToText, inviteEmail } from './agent-portal.js?v=202611191500';
import { senderFor } from './email-senders.js?v=202611101015';
import { CLA_PHONE, isRefi } from './constants.js?v=202611101015';
export function agentPortal(x) {
  const { api: root, load, save, nid, needUser, isManager, notViewOnly, dealOr404, onDeal, log, prof, nameOf, ownerOf, taskVisible, threadVisible, unreadIn, docVisible, participantsOf, isStaffView,
    notify, dealProfileIds, dealView, contactOf, clone, now, fail, str, emailOk, C } = x;
  const deal = (id) => load().deals.find((q) => q.id === id);
  const OPEN = ['todo', 'in_progress', 'blocked'];
  const isAgentHere = (u) => C.isAgent(u.role);
  // SHARE ACCESS (John, Nov 4): the agents on the order AND the buyer on their own file (same flow: recorded on the order, nothing is sent).
  // A buyer's share is scoped to their own file and side: whoever they add could only ever get what the buyer sees there, which never
  // includes the listing agent or anything CLA keeps staff-only. Sellers do not share access (not asked for).
  // SELLER MIRROR (John, Nov 4): the seller shares access to their own file the same way (seller side; never someone already on the order).
  const canShare = (u) => isAgentHere(u) || x.holds(u, 'Client-Buyer') || x.holds(u, 'Client-Seller');
  const agentTask = (u, id) => { const t = load().tasks.find((z) => z.id === id && z.kind === 'agent') || fail('Task not found.'); const v = onDeal(u, t.dealId); if (!taskVisible(v, t)) fail('Task not found.'); return [t, v]; };
  // clients this agent may say they represent: the clients on the agent's own side of the order (Client-Buyer for a Buyer Agent ...)
  const clientsFor = (t) => { const d = load(); const role = CLIENT_ROLE_OF[t.assignedRole];
    return d.participants.filter((p) => p.dealId === t.dealId && p.role === role).map((p) => { const c = d.contacts.find((z) => z.id === p.contactId) || {};
      return { participantId: p.id, name: `${c.firstName || ''} ${c.lastName || ''}`.trim(), firstName: c.firstName || '', lastName: c.lastName || '', email: c.email || '', phone: c.phone || '' }; }); };
  const answersVisible = (u, t) => u.isAdmin || isManager(u) || ownerOf(t) === u.id;   // the agent themself + processor / coordinator / Admin (not the other agent, not clients, not sales)
  const prefill = (t) => { const q = deal(t.dealId); const lic = (load().tasks.find((z) => z.participantId === t.participantId && z.templateCode === 'commissions') || { formData: {} }).formData.license_id || '';
    if (t.templateCode === 'agent_client_contacts') return { clients: clientsFor(t).map((c) => ({ participantId: c.participantId, represent: '', firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, maritalStatus: '' })), added: [] };
    if (t.templateCode === 'agent_transaction_info') return { closingDate: q.closingDate || '', purchasePrice: q.purchasePrice == null ? '' : q.purchasePrice, emdAmount: q.emdAmount == null ? '' : q.emdAmount, holdingEmd: '', licenseId: lic,
      team: [] };
    return { willPurchase: '' }; };
  const taskOut = (u, t) => { const o = x.taskOut(u, t); const def = agentTaskDef(t.templateCode) || {}; const vis = answersVisible(u, t);
    const revs = load().agentTaskRevisions.filter((r) => r.taskId === t.id);
    return { ...o, about: def.about, code: t.templateCode, canSubmit: ownerOf(t) === u.id && t.status !== 'cancelled' && !C.viewOnly(u), submitted: t.status === 'done',
      answers: vis ? (t.status === 'done' || t.savedAt ? clone(t.formData) : prefill(t)) : null, answersHidden: !vis, clients: vis ? clientsFor(t) : [],
      revisions: vis ? revs.map((r) => ({ n: r.n, at: r.at, by: nameOf(r.by), kind: r.n === 1 ? 'submission' : 'revision' })) : [], revisionCount: revs.length }; };
  const progressOut = (q) => phaseOf(q);
  const activityFor = (u, dealId) => { const d = load(); const staff = isStaffView(u);
    if (staff) return null;   // staff use the full log (listActivity)
    // an outside user's feed: their own actions, plus messages in their conversations, uploads they can open and answers to their update requests
    return d.activity.filter((a) => a.dealId === dealId && a.action !== 'document.viewed' && (a.actorId === u.id
      || (a.entity === 'thread' && (() => { const t = d.threads.find((z) => z.id === a.entityId); return t && t.participantIds.includes(u.id); })())
      || (a.entity === 'document' && (a.action === 'document.uploaded' || (a.action === 'document.shared_client' && x.pureBuyer(u)) || (a.action === 'document.shared_seller' && x.pureSeller(u))) && (() => { const z = d.documents.find((q) => q.id === a.entityId); return z && docVisible(u, z); })())
      || (a.entity === 'update_request' && (() => { const r = d.updateRequests.find((q) => q.id === a.entityId); return r && r.requestedBy === u.id; })())))
      .filter((a) => !x.hiddenFromClient(u, a.actorId, dealId))   // the buyer never sees the listing agent (the seller never sees the buyer's agent), even as the one who uploaded a file CLA later shared (Nov 4)
      .map((a) => ({ id: a.id, createdAt: a.createdAt, action: a.action, detail: a.detail, actorName: nameOf(a.actorId), actorRole: x.fileRoleText(a.actorId, a.dealId), mine: a.actorId === u.id }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)); };
  // documents shared through messages: who can see them follows the normal visibility rules (outside sender: their own side + CLA)
  const shareVisibility = (u, ids, dealId) => { if (!isStaffView(u)) return C.sideOf(u.role) || 'all';
    const sides = [...new Set(ids.map((id) => x.personSide(id, dealId)).filter((sd) => sd !== 'staff'))]; return sides.length === 0 ? 'staff' : sides.length === 1 && sides[0] ? sides[0] : 'all'; };
  // WIRE INSTRUCTIONS (John, Nov 3): a file that is (or is named as) wire instructions may only go to people who may get them: CLA staff + the buyer
  // clients on this file. A conversation that includes an agent (or the seller side, or a side-less outside user) is refused, before anything is stored.
  const wireFile = (u, f) => x.isWireDocName(f && f.name) || (!!(f && f.wireInstructions) && isStaffView(u));
  const wireGuard = (u, ids, dealId, files) => { if (!(files || []).some((f) => wireFile(u, f))) return;
    const no = [...new Set(ids)].filter((id) => !x.wireAllowed(id, dealId));
    if (no.length) fail(`${x.WIRE_BUYER_ONLY} ${no.map((id) => `${nameOf(id)} (${x.fileRoleText(id, dealId)})`).join(', ')} cannot receive them. Use Share Files and send them to the buyer alone.`); };
  const attach = async (u, dealId, files, vis) => { const ids = [];
    for (const f of (files || []).slice(0, 10)) { const doc = x.newDoc(u, { name: f.name, description: str(f.description, 500) || 'Shared in a message', mimeType: f.mimeType, size: f.size, dataUrl: f.dataUrl, visibility: vis, docType: f.docType || '', wireInstructions: wireFile(u, f) });
      doc.dealId = dealId; doc.folderId = null; doc.sharedInMessage = true; await x.keepFile(doc); load().documents.push(doc); ids.push(doc.id);
      log(dealId, u.id, 'document.uploaded', 'document', doc.id, `Uploaded ${doc.name} (shared in a message)`); }
    return ids; };
  const msgOut = (u, m) => { const d = load(); const atts = (m.attachmentIds || []).map((id) => d.documents.find((z) => z.id === id)).filter((z) => z && docVisible(u, z));
    return { ...m, bodyHtml: m.bodyHtml ? sanitizeMessageHtml(m.bodyHtml) : '', attachments: atts.map((z) => ({ id: z.id, name: z.name, size: z.size, wire: x.isWireDoc(z) })) }; };

  const api = {
    // ---------- Overview ----------
    async getOrderOverview(dealId) {
      let u = needUser(); const q = dealOr404(u, dealId); u = onDeal(u, dealId); const d = load(); const v = dealView(u, q); const staff = isStaffView(u);
      const ps = participantsOf(dealId, u); const pid = (p) => p.contact && p.contact.profileId;
      const party = (label, p) => { const hidden = !!(p && p.contact && p.contact.contactHidden);
        return { label, name: p ? (`${p.contact.firstName || ''} ${p.contact.lastName || ''}`.trim() || p.contact.company || 'Unnamed contact') : 'Not specified', company: p ? p.contact.company || '' : '', email: p && !hidden ? p.contact.email || '' : '', phone: p && !hidden ? p.contact.phone || '' : '',
        contactHidden: hidden, entity: p && p.entity ? p.entity : null, contactId: !p || hidden ? '' : (p.contactId || (p.contact && p.contact.id) || ''), profileId: p ? pid(p) || null : null, canMessage: !!(p && pid(p) && pid(p) !== u.id && !C.viewOnly(u) && x.canMessage(u, pid(p), dealId) && (prof(pid(p)) || {}).status === 'active') }; };
      const all = (role) => ps.filter((p) => p.role === role);
      const proc = prof(q.processorId);
      // Refinance (John, Nov 3): the borrower(s), the settlement agent and the lender only; no realtor or seller placeholders (an older refinance that still has one shows it)
      const refi = isRefi(q); const opt = (role, label) => (all(role).length ? all(role).map((p) => party(label, p)) : refi ? [] : [party(label, null)]);
      // TITLE SALES REP (John, Nov 4): the file's CLA Title salesperson(s) from deal_sales_people (the existing link, no new field), shown to the
      // Buyer Agent / Listing Agent only. Work contact only (name, work phone, work email); CLA staff are messageable by either side, so Message
      // follows the usual canMessage rule. None assigned: one 'Not specified' card, like the other placeholders. Mirrored by migration 46.
      const salesReps = () => { if (!isAgentHere(u)) return [];
        const rows = (d.dealSalesPeople || []).filter((s) => s.dealId === dealId).map((s) => prof(s.salesId)).filter((p) => p && p.status === 'active');
        if (!rows.length) return [{ label: 'Title Sales Rep', name: 'Not specified', company: 'CLA Title', email: '', phone: '', contactHidden: false, profileId: null, canMessage: false, salesRep: true }];
        return rows.map((p) => ({ label: 'Title Sales Rep', name: `${p.firstName} ${p.lastName}`.trim(), company: 'CLA Title', email: p.email || '', phone: p.phone || '', contactHidden: false,
          profileId: p.id, photo: p.photo || '', initials: `${(p.firstName || '')[0] || ''}${(p.lastName || '')[0] || ''}`.toUpperCase(), salesRep: true,
          canMessage: p.id !== u.id && !C.viewOnly(u) && x.canMessage(u, p.id, dealId) })); };
      const parties = [...all('Client-Buyer').map((p) => party(refi ? 'Borrower' : 'Buyer', p)), ...(all('Client-Buyer').length ? [] : [party(refi ? 'Borrower' : 'Buyer', null)]),
        { label: 'Processor', name: proc ? `${proc.firstName} ${proc.lastName}` : 'Not specified', company: 'CLA Title & Escrow', email: proc ? proc.email : '', phone: proc ? proc.phone : '', contactHidden: false, profileId: proc ? proc.id : null,
          canMessage: !!(proc && proc.id !== u.id && !C.viewOnly(u)) },
        { label: 'Title Company', name: 'CLA Title & Escrow', company: '', email: '', phone: CLA_PHONE, contactHidden: false, profileId: null, canMessage: false },
        ...salesReps(),
        ...opt('Buyer Agent', 'Buyer Agent'), ...opt('Listing Agent', 'Listing Agent'), ...(refi ? all('Lender').map((p) => party('Lender', p)) : []),
        ...all('Client-Seller').map((p) => party('Seller', p))];
      // Agency License ID: an agent sees their own (from their transaction info / commission task); staff see each agent's
      const lic = (role) => { const p = d.participants.find((z) => z.dealId === dealId && z.role === role); if (!p) return '';
        const t = d.tasks.find((z) => z.participantId === p.id && z.templateCode === 'agent_transaction_info' && z.formData && z.formData.licenseId);
        const c = d.tasks.find((z) => z.participantId === p.id && z.templateCode === 'commissions' && z.formData && z.formData.license_id); return (t && t.formData.licenseId) || (c && c.formData.license_id) || ''; };
      const licenseId = staff ? ['Buyer Agent', 'Listing Agent'].map((r) => lic(r) && `${r}: ${lic(r)}`).filter(Boolean).join(' \u00b7 ') : isAgentHere(u) ? lic(u.role) : '';
      const threads = d.threads.filter((t) => t.dealId === dealId && threadVisible(u, t)).map((t) => { const ms = d.messages.filter((m) => m.threadId === t.id); const last = ms[ms.length - 1];
        return { id: t.id, subject: t.subject, lastAt: last ? last.createdAt : t.createdAt, lastFrom: last ? nameOf(last.authorId) : '', lastBody: last ? last.body.slice(0, 120) : '', unread: unreadIn(u, t) }; }).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
      const docs = d.documents.filter((z) => z.dealId === dealId && docVisible(u, z));
      const act = staff ? (await root.listActivity(dealId, {})).items.map((a) => ({ id: a.id, createdAt: a.createdAt, action: a.action, detail: a.detail, actorName: a.actorName })) : activityFor(u, dealId);
      const tasks = d.tasks.filter((t) => t.dealId === dealId && taskVisible(u, t));
      const outstanding = staff ? v.openTasks : tasks.filter((t) => OPEN.includes(t.status) && (ownerOf(t) === u.id || (!t.participantId && x.holds(u, t.assignedRole)) || x.agentCanFill(u, t))).length;
      // EMD BANNER (John, Nov 4): true for a pure buyer while the file's EMD receipt task is still open (same rule as the bell / outbox reminders); the task itself stays hidden
      const emdPending = x.pureBuyer(u) && d.tasks.some((t) => t.dealId === dealId && t.assignedRole === 'Client-Buyer' && x.EMD_RECEIPT.test(t.title || '') && OPEN.includes(t.status));
      return clone({ progress: progressOut(q), outstanding, emdPending,
        counts: { tasks: staff ? v.openTasks : outstanding, inbox: v.unread, threads: threads.length, documents: docs.filter((z) => !z.sample).length, activity: act.length },
        orderDetails: { propertyAddress: v.address, orderId: q.id, orderType: q.transactionType || 'Purchase', refinance: refi, purchasePrice: refi ? null : q.purchasePrice, loanAmount: q.loanAmount, fileNumber: q.fileNumber, agencyLicenseId: licenseId },
        parties, recentActivity: act.slice(0, 6), conversations: threads.slice(0, 5),
        canRequestUpdate: !staff && !!C.sideOf(u.role) && !C.viewOnly(u), canShareAccess: canShare(u) && !C.viewOnly(u), canAnswerUpdates: staff && (isManager(u) || u.isAdmin),
        updateTopics: UPDATE_TOPICS, permissions: ORG_PERMISSIONS });
    },
    async getOrderProgress(dealId) { const u = needUser(); return clone(progressOut(dealOr404(u, dealId))); },
    // ---------- Request Update ----------
    async requestUpdate(dealId, { topic, note } = {}) {
      let u = needUser(); dealOr404(u, dealId); u = onDeal(u, dealId); notViewOnly(u);
      if (isStaffView(u)) fail('Request Update is for the agents and clients on the order.'); if (!C.sideOf(u.role)) fail('You are not a buyer or seller party on this order.');
      const tp = str(topic, 80); if (!UPDATE_TOPICS.includes(tp)) fail('Pick what you want an update on.');
      const d = load(); if (d.updateRequests.some((r) => r.dealId === dealId && r.requestedBy === u.id && r.topic === tp && r.status === 'open')) fail('You already asked for this update; CLA Title will answer it soon.');
      const r = { id: nid('ur'), dealId, topic: tp, note: str(note, 1000), requestedBy: u.id, requestedRole: u.role, status: 'open', response: '', respondedBy: null, respondedAt: null, createdAt: now() };
      d.updateRequests.push(r); log(dealId, u.id, 'update.requested', 'update_request', r.id, `Requested an update: ${tp}`);
      notify([deal(dealId).processorId], { kind: 'update_request', dealId, title: `${nameOf(u.id)} requested an update: ${tp}`, link: `#/deals/${dealId}` }, u.id); save(); return clone(r);
    },
    async listUpdateRequests(dealId) {
      let u = needUser(); dealOr404(u, dealId); u = onDeal(u, dealId); const staff = isStaffView(u);
      return clone(load().updateRequests.filter((r) => r.dealId === dealId && (staff || r.requestedBy === u.id)).map((r) => ({ ...r, requestedByName: nameOf(r.requestedBy), respondedByName: r.respondedBy ? nameOf(r.respondedBy) : '' }))
        .sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt)));
    },
    async respondUpdateRequest(id, { response } = {}) {
      let u = needUser(); const r = load().updateRequests.find((z) => z.id === id) || fail('Update request not found.'); dealOr404(u, r.dealId); u = onDeal(u, r.dealId);
      if (!(isManager(u) || u.isAdmin)) fail('Only the processor, coordinator or Admin can answer update requests.');
      const text = str(response, 2000); if (!text) fail('Write the update first.');
      r.response = text; r.status = 'answered'; r.respondedBy = u.id; r.respondedAt = now();
      log(r.dealId, u.id, 'update.answered', 'update_request', r.id, `Answered update request: ${r.topic}`);
      notify([r.requestedBy], { kind: 'update_request', dealId: r.dealId, title: `Update on ${r.topic}: ${text.slice(0, 120)}`, link: `#/deals/${r.dealId}` }, u.id); save(); return clone(r);
    },
    // ---------- Share Access (recorded only) ----------
    async shareAccess(dealId, { firstName, lastName, email, permission } = {}) {
      let u = needUser(); dealOr404(u, dealId); u = onDeal(u, dealId); notViewOnly(u); if (!canShare(u)) fail('Only the agents and the buyer or seller on this order can share access.');
      const asBuyer = !isAgentHere(u);   // a pure client (buyer or seller): scoped to their own side of their own file
      const asRole = x.holds(u, 'Client-Buyer') ? 'Client-Buyer' : 'Client-Seller';
      const inv = { id: nid('inv'), dealId, firstName: str(firstName, 80), lastName: str(lastName, 80), email: str(email, 200).toLowerCase(), permission: str(permission, 40), side: asBuyer ? C.sideOf(asRole) : C.sideOf(u.role),
        invitedAs: asBuyer ? asRole : u.role, invitedBy: u.id, status: 'recorded', createdAt: now() };
      if (asBuyer && x.dealProfileIds(dealId).some((pid) => { const p = prof(pid); return p && p.email.toLowerCase() === inv.email && (!C.isOutside(p.role) || x.fileRoles(pid, dealId).some((r) => r !== asRole)); }))
        fail('That person already works on this order. Pick someone of your own (for example a family member or attorney).');
      if (!inv.firstName || !inv.lastName) fail('First and last name are required.'); if (!emailOk(inv.email)) fail('Enter a valid email address.');
      if (!ORG_PERMISSIONS.includes(inv.permission)) fail('Choose the access to give.');
      const d = load(); if (d.accessInvites.some((z) => z.dealId === dealId && z.email === inv.email)) fail('That email already has access shared on this order.');
      d.accessInvites.push(inv); log(dealId, u.id, 'access.shared', 'invite', inv.id, `Shared access with ${inv.firstName} ${inv.lastName} (${inv.permission}); recorded, no email sent`);
      notify([deal(dealId).processorId], { kind: 'invite', dealId, title: `${nameOf(u.id)} shared access with ${inv.firstName} ${inv.lastName} (${inv.permission})`, link: `#/deals/${dealId}` }, u.id); save(); return clone(inv);
    },
    async listSharedAccess(dealId) {
      let u = needUser(); dealOr404(u, dealId); u = onDeal(u, dealId); const staff = isStaffView(u);
      return clone(load().accessInvites.filter((z) => z.dealId === dealId && (staff || z.invitedBy === u.id)).map((z) => ({ ...z, invitedByName: nameOf(z.invitedBy) })));
    },
    // ---------- "Complete Requests Now" invite email: preview + outbox (staff). Nothing is sent. ----------
    async getPortalWelcomeEmail(dealId, profileId) {
      let u = needUser(); const q = dealOr404(u, dealId); u = onDeal(u, dealId); if (!(isManager(u) || u.isAdmin)) fail('Only the processor, coordinator or Admin can invite people.');
      const p = prof(profileId); if (!p || p.status !== 'active' || !dealProfileIds(dealId).includes(p.id) || !C.isOutside(p.role)) fail('Pick an agent or client on this order who has a portal login.');
      const v = dealView(p, q); const link = `#/deals/${dealId}/tasks`;
      return clone({ to: p.email, toName: `${p.firstName} ${p.lastName}`, ...inviteEmail({ firstName: p.firstName, deal: q, link, openTasks: v.myOpenTasks }) });
    },
    async queuePortalWelcomeEmail(dealId, profileId) {
      const e = await api.getPortalWelcomeEmail(dealId, profileId); const u = needUser(); const d = load();
      const ob = { id: nid('ob'), channel: 'email', kind: 'invite', status: 'queued', toProfileId: profileId, toEmail: e.to, subject: e.subject, body: `${e.body} [${e.buttonLabel}: ${e.link}]`, link: e.link, buttonLabel: e.buttonLabel,
        taskId: null, dealId, createdBy: u.id, createdAt: now(), sentAt: null };
      Object.assign(ob, senderFor(d, 'portal', dealId)); d.outbox.push(ob); log(dealId, u.id, 'invite.queued', 'deal', dealId, `Portal invite for ${e.toName} queued in the outbox (not sent)`); save(); return clone(ob);
    },
    // ---------- Agent tasks ----------
    async getAgentTask(id) { const u0 = needUser(); const [t, u] = agentTask(u0, id); return clone(taskOut(u, t)); },
    async submitAgentTask(id, answers) {
      const u0 = needUser(); const [t, u] = agentTask(u0, id); notViewOnly(u);
      if (ownerOf(t) !== u.id) fail('Only the agent this task is for can submit it.'); if (t.status === 'cancelled') fail('This task was cancelled.');
      const clean = validateAgentAnswers(t.templateCode, answers, { clients: clientsFor(t) });
      const d = load(); const n = d.agentTaskRevisions.filter((r) => r.taskId === t.id).length + 1; const revision = t.status === 'done';
      d.agentTaskRevisions.push({ id: nid('atr'), taskId: t.id, n, answers: clone(clean), by: u.id, at: now() });
      t.formData = clean; t.savedAt = now(); t.savedBy = u.id; t.status = 'done'; t.completedAt = now(); t.completedBy = u.id;
      log(t.dealId, u.id, revision ? 'task.revised' : 'task.submitted', 'task', t.id, `${t.title}: ${revision ? `revision ${n - 1} submitted` : 'submitted'}`);
      notify([deal(t.dealId).processorId], { kind: 'task', dealId: t.dealId, title: `${nameOf(u.id)} ${revision ? 'revised' : 'completed'} "${t.title}"`, link: `#/deals/${t.dealId}/tasks/${t.id}` }, u.id);
      save(); return clone(taskOut(u, t));
    },
    async listAgentTaskRevisions(id) { const u0 = needUser(); const [t, u] = agentTask(u0, id); if (!answersVisible(u, t)) fail('Only the agent, the processor, the coordinator and Admin can see these answers.');
      return clone(load().agentTaskRevisions.filter((r) => r.taskId === t.id).map((r) => ({ ...r, byName: nameOf(r.by) }))); },
    // "Send Message" from a task's About This Task box: one conversation per task and person, with the order's processor
    async messageAboutTask(id, body) {
      const u0 = needUser(); const t0 = load().tasks.find((z) => z.id === id) || fail('Task not found.'); const u = onDeal(u0, t0.dealId); if (!taskVisible(u, t0)) fail('Task not found.'); notViewOnly(u);
      const text = str(body, 4000); if (!text) fail('Write a message first.'); const d = load();
      const th = d.threads.find((z) => z.taskId === id && z.createdBy === u.id);
      if (th) { await root.postMessage(th.id, text); return clone(load().threads.find((z) => z.id === th.id)); }
      const q = deal(t0.dealId); const to = isStaffView(u) ? [ownerOf(t0)].filter(Boolean) : [q.processorId];
      const created = await root.createThread(t0.dealId, { subject: `About task: ${t0.title}`, participantIds: to, body: text });
      const t = load().threads.find((z) => z.id === created.id); t.taskId = id; save(); return clone(t);
    },
    // ---------- Messages: rich text + attachments (Share Files = a new conversation with files) ----------
    async sendMessage({ dealId, threadId, subject, to, bodyHtml, files } = {}) {
      let u = needUser(); const clean = sanitizeMessageHtml(bodyHtml); const text = htmlToText(clean).slice(0, 4000); if (!text && !(files || []).length) fail('Write a message first.');
      if (threadId) { const t = load().threads.find((z) => z.id === threadId) || fail('Conversation not found.'); u = onDeal(u, t.dealId); notViewOnly(u);
        if (!t.participantIds.includes(u.id)) fail('You are not part of this conversation.');
        wireGuard(u, t.participantIds, t.dealId, files); x.wireTextGuard(t.participantIds, t.dealId, text);
        const ids = await attach(u, t.dealId, files, shareVisibility(u, t.participantIds.filter((i) => i !== u.id), t.dealId));
        const m = await root.postMessage(threadId, text || '(file shared)'); const mm = load().messages.find((z) => z.id === m.id); mm.bodyHtml = clean; mm.attachmentIds = ids; save(); return clone(msgOut(u, mm)); }
      u = onDeal(u, dealId); notViewOnly(u); const allowed = new Set((await root.listMessageRecipients(dealId)).map((p) => p.id)); const rec = [...new Set(to || [])];
      if (!rec.length) fail('Pick who to send it to.'); if (rec.some((i) => !allowed.has(i))) fail('You can message CLA Title staff and people on your own side of this order only.');
      const profiles = rec.filter((i) => !String(i).startsWith('contact:')); const externals = rec.filter((i) => String(i).startsWith('contact:'));
      if (externals.length && !x.isStaffView(u)) fail('You can message CLA Title staff and people on your own side of this order only.');
      if (externals.length) { const d0 = load(); for (const id of externals) { const c = d0.contacts.find((z) => z.id === id.slice(8)); if (!c) fail('That contact is not on this order.');
        d0.outbox.push({ id: nid('ob'), channel: 'email', status: 'queued', toEmail: c.email || '', toName: `${c.firstName} ${c.lastName}`.trim(), subject: str(subject, 150) || 'Message', body: text || '(file shared)', dealId, createdBy: u.id, createdAt: now(), sentAt: null }); } save(); }
      if (!profiles.length) { const d0 = load(); const t0 = { id: nid('th'), dealId, subject: str(subject, 150) || 'New conversation', createdBy: u.id, createdAt: now(), participantIds: [u.id] };
        d0.threads.push(t0); d0.messages.push({ id: nid('m'), threadId: t0.id, authorId: u.id, body: text || '(queued to a contact without a portal login)', createdAt: now() }); save();
        return clone({ ...t0, invited: { contactId: externals[0].slice(8), link: '', already: false, error: 'Demo: nothing is emailed' } }); }   // FF-055 / MF-048: the page says it is held for them
      if (x.mixedSides([u.id, ...profiles], dealId)) fail('A conversation can include CLA Title staff and ONE side of the order, not both.');
      wireGuard(u, [u.id, ...profiles], dealId, files); x.wireTextGuard([u.id, ...profiles], dealId, `${str(subject, 150)}\n${text}`);
      const ids = await attach(u, dealId, files, shareVisibility(u, profiles, dealId));
      const t = await root.createThread(dealId, { subject: str(subject, 150) || ((files || []).length ? 'Shared files' : 'New conversation'), participantIds: profiles, body: text || '(file shared)' });
      const d = load(); const m = d.messages.filter((z) => z.threadId === t.id)[0]; m.bodyHtml = clean; m.attachmentIds = ids; save(); return clone({ ...t, message: msgOut(u, m) });
    },
    async getThreadDetail(id) { const t = await root.getThread(id); const u = onDeal(needUser(), t.dealId); const d = load();
      const thr = d.threads.find((z) => z.id === id); const task = thr.taskId ? d.tasks.find((z) => z.id === thr.taskId) : null;
      return clone({ ...t, task: task ? { id: task.id, title: task.title } : null, messages: t.messages.map((m) => ({ ...msgOut(u, d.messages.find((z) => z.id === m.id)), authorName: m.authorName, mine: m.mine })) }); },
    // ---------- Activity for outside users (their own actions + what they can already open) ----------
    async listMyActivity(dealId) { let u = needUser(); dealOr404(u, dealId); u = onDeal(u, dealId); if (isStaffView(u)) return clone((await root.listActivity(dealId, {})).items);
      return clone(activityFor(u, dealId)); },
    // staff: everything waiting on CLA from the agent side of one order (open update requests + agent submissions not yet reviewed)
    async listAgentInbox(dealId) { let u = needUser(); dealOr404(u, dealId); u = onDeal(u, dealId); if (!isStaffView(u)) fail('This list is for CLA Title staff.');
      const d = load(); return clone({ updateRequests: (await api.listUpdateRequests(dealId)).filter((r) => r.status === 'open'),
        submissions: d.tasks.filter((t) => t.dealId === dealId && t.kind === 'agent' && t.status === 'done').map((t) => ({ id: t.id, title: t.title, by: nameOf(t.completedBy), role: t.assignedRole, at: t.completedAt,
          revisions: d.agentTaskRevisions.filter((r) => r.taskId === t.id).length })), invites: await api.listSharedAccess(dealId) }); },
  };
  x.agentPortalEnsure = (dealId) => {};   // (copies are created by ensureAgentPortal on load / when an agent is added)
  return api;
}
