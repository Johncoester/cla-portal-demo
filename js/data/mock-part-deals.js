/* mock adapter, part 1: auth, profile, dashboard, deals. See mock-adapter.js. */
export function dealsAndAuth(x) {
  const { load, save, nid, me, needUser, needProcessor, contactOf, dealsFor, dealOr404, log, nameOf, dealView, taskVisible, clone, now, fail, str, emailOk, money, zipOk, stateCode, dateOrNull, localDate, C } = x;
  const OPEN = ['todo', 'in_progress', 'blocked'];
  // John, Nov 2: several salespeople per file; each must be an ACTIVE Sales Person or Sales Team user. The file's Processor must be an active Processor.
  const checkSales = (id) => { const p = x.prof(id) || fail('Salesperson not found.'); if (!['Sales Person', 'Sales Team'].includes(p.role)) fail('Only a Sales Person or Sales Team user can be a salesperson on an order.');
    if (p.status !== 'active') fail('Only an active salesperson can be added to an order.'); return p; };
  const checkProcessor = (id) => { const p = x.prof(id) || fail('Processor not found.'); if (!C.isProcessor(p.role) || p.status !== 'active') fail('The Processor on an order must be an active Processor.'); return p; };
  const salesList = (inp) => { const v = inp.salesIds !== undefined ? inp.salesIds : inp.salesPersonId; return [...new Set((v == null ? [] : Array.isArray(v) ? v : String(v).split(',')).map((z) => String(z).trim()).filter(Boolean))]; };
  function setSales(u, dealId, ids) { const d = load(); d.dealSalesPeople ||= []; const cur = x.salesOf(dealId).map((s) => s.salesId);
    const add = ids.filter((sid) => !cur.includes(sid)); const drop = cur.filter((sid) => !ids.includes(sid));
    d.dealSalesPeople = d.dealSalesPeople.filter((s) => !(s.dealId === dealId && drop.includes(s.salesId)));
    add.forEach((sid) => { d.dealSalesPeople.push({ dealId, salesId: sid, addedBy: u.id, addedAt: now() }); log(dealId, u.id, 'deal.sales_added', 'deal', dealId, `Salesperson added: ${nameOf(sid)}`); });
    drop.forEach((sid) => log(dealId, u.id, 'deal.sales_removed', 'deal', dealId, `Salesperson removed: ${nameOf(sid)}`)); }
  return {
    // ---------- Profile ----------
    async getMyProfile() { const u = needUser(); return clone({ ...u, fileRoles: C.isOutside(u.role) ? x.fileRolesOf(u) : [], fileLabels: C.isOutside(u.role) ? x.fileLabelsOf(u) : [] }); },
    async updateMyProfile(patch) {
      const u = needUser(); const p = load().profiles.find((q) => q.id === u.id);
      if (patch.firstName != null) p.firstName = str(patch.firstName, 80) || fail('First name is required.');
      if (patch.lastName != null) p.lastName = str(patch.lastName, 80);
      if (patch.phone != null) p.phone = x.phone(patch.phone);
      const c = contactOf(u.id); if (c) { c.firstName = p.firstName; c.lastName = p.lastName; c.phone = p.phone; }
      save(); return clone(p);
    },
    // ---------- Dashboard ----------
    async getWorkQueue() {
      const u = needUser(); const d = load(); const deals = dealsFor(u).filter((q) => q.status === 'Open');
      const tasks = d.tasks.filter((t) => deals.some((q) => q.id === t.dealId) && OPEN.includes(t.status) && taskVisible(x.scopeTo(u, t.dealId), t));
      const today = localDate(); const soon = localDate(21);
      const clientWait = (t) => ['todo', 'in_progress'].includes(t.status) && /^Client/.test(t.assignedRole);
      const attention = deals.map((q) => ({ deal: dealView(u, q), overdue: tasks.filter((t) => t.dealId === q.id && t.dueDate && t.dueDate < today).length,
        blocked: tasks.filter((t) => t.dealId === q.id && t.status === 'blocked').length, waitingOnClients: tasks.filter((t) => t.dealId === q.id && clientWait(t)).length }))
        .filter((r) => r.overdue || r.blocked || r.waitingOnClients);
      return { assigned: deals.length, totalAssigned: dealsFor(u).length, blockedOnClients: tasks.filter(clientWait).length,
        overdueTasks: tasks.filter((t) => t.dueDate && t.dueDate < today).length, closingsToday: deals.filter((q) => q.closingDate === today).length,
        closingSoon: deals.filter((q) => q.closingDate && q.closingDate >= today && q.closingDate <= soon).map((q) => dealView(u, q)).sort((a, b) => a.closingDate.localeCompare(b.closingDate)),
        needsAttention: attention, unreadMessages: deals.reduce((n, q) => n + dealView(u, q).unread, 0) };
    },
    // Place Order: who can be the file's Processor (John, Nov 2: an Admin placing an order must pick one)
    async listProcessors() { const u = needUser(); if (!C.runsOrders(u)) fail('Only a Processor or Admin can do this.');
      return clone(load().profiles.filter((p) => p.status === 'active' && C.isProcessor(p.role)).map(({ id, firstName, lastName, role }) => ({ id, firstName, lastName, role }))); },
    async listSalesStaff() { needUser(); return clone(load().profiles.filter((p) => p.status === 'active' && ['Sales Person', 'Sales Team'].includes(p.role)).map(({ id, firstName, lastName, role }) => ({ id, firstName, lastName, role }))); },
    async unreadCount() { const u = needUser(); return dealsFor(u).reduce((n, q) => n + dealView(u, q).unread, 0); },
    // ---------- Deals ----------
    async listDeals({ status } = {}) {
      const u = needUser();
      return dealsFor(u).filter((q) => !status || status === 'All' || q.status === status).map((q) => dealView(u, q))
        .sort((a, b) => (b.openDate || '').localeCompare(a.openDate || '') || b.fileNumber.localeCompare(a.fileNumber));
    },
    async getDeal(id) { const u0 = needUser(); const q = dealOr404(u0, id); const u = x.scopeTo(u0, id); return { ...dealView(u, q), participants: x.participantsOf(id, u) }; },
    async createDeal(input) {
      const u = needProcessor(); const d = load();
      // the file's Processor: a Processor placing an order is the Processor unless they pick another; an Admin / Super admin must pick one
      const procId = input.processorId || (C.isProcessor(u.role) ? u.id : fail('Pick the Processor for this order.'));
      checkProcessor(procId);
      const salesIds = salesList(input); salesIds.forEach(checkSales);
      const street = str(input.street, 200) || fail('Street address is required.');
      const city = str(input.city, 100) || fail('City is required.');
      const state = stateCode(input.state);
      const zip = str(input.zip, 10); if (!zipOk(zip)) fail('ZIP must be 5 digits (or ZIP+4).');
      const transactionType = C.TX_TYPES.includes(input.transactionType) ? input.transactionType : 'Purchase';
      const nextNum = Math.max(97000, ...d.deals.map((q) => Number(q.fileNumber.split('-')[2]) || 0)) + 1;
      const deal = { id: nid('deal'), fileNumber: `MD-26-${nextNum}`, street, city, state, zip, transactionType, stage: 0, status: 'Open',
        openDate: localDate(), closingDate: dateOrNull(input.closingDate, 'Closing date'), purchasePrice: money(input.purchasePrice, 'Purchase price'), loanAmount: money(input.loanAmount, 'Loan amount'),
        lenderName: '', lenderContact: '', lenderEmail: '', lenderPhone: '', notes: str(input.notes, 2000), processorId: procId, createdBy: u.id, createdAt: now() };
      d.deals.push(deal);
      const pc = contactOf(procId); if (pc) d.participants.push({ id: nid('dp'), dealId: deal.id, contactId: pc.id, role: 'Processor', createdAt: now() });
      x.DEAL_FOLDERS.forEach((name) => d.folders.push({ id: nid('f'), scope: 'deal', dealId: deal.id, name, staffOnly: false, createdBy: u.id, createdAt: now() }));
      // Staff task; participants' intake tasks are copied from the current task templates when each person is added (addParticipant).
      d.tasks.push({ id: nid('t'), dealId: deal.id, participantId: null, templateId: null, templateCode: null, templateVersion: null, kind: 'simple', title: 'Collect executed contract', description: '',
        assignedRole: 'Processor', status: 'todo', dueDate: null, formData: {}, savedAt: null, completedAt: null, completedBy: null, createdBy: u.id, createdAt: now() });
      log(deal.id, u.id, 'deal.created', 'deal', deal.id, `Order ${deal.fileNumber} opened${procId !== u.id ? ` (Processor: ${nameOf(procId)})` : ''}`);
      setSales(u, deal.id, salesIds);
      save(); return clone(dealView(u, deal));
    },
    async updateDeal(id, patch) {
      const u = needProcessor(); const q = load().deals.find((y) => y.id === id) || fail('Order not found.');
      if (patch.state != null) patch = { ...patch, state: stateCode(patch.state) };
      ['street', 'city', 'state', 'zip', 'lenderName', 'lenderContact', 'lenderEmail', 'lenderPhone', 'notes'].forEach((k) => { if (patch[k] != null) q[k] = str(patch[k], k === 'notes' ? 2000 : 200); });
      if (q.lenderEmail && !emailOk(q.lenderEmail)) fail('Lender email is not valid.');
      if (patch.lenderPhone != null) q.lenderPhone = x.phone(patch.lenderPhone, 'Lender phone');
      if (!zipOk(q.zip)) fail('ZIP must be 5 digits (or ZIP+4).');
      if (!q.street || !q.city || !q.state) fail('Street, city and state are required.');
      if (patch.closingDate !== undefined) q.closingDate = dateOrNull(patch.closingDate, 'Closing date');
      if (patch.purchasePrice !== undefined) q.purchasePrice = money(patch.purchasePrice, 'Purchase price');
      if (patch.loanAmount !== undefined) q.loanAmount = money(patch.loanAmount, 'Loan amount');
      if (patch.processorId) { checkProcessor(patch.processorId); if (patch.processorId !== q.processorId) { q.processorId = patch.processorId; log(id, u.id, 'deal.processor', 'deal', id, `Processor set to ${nameOf(q.processorId)}`); } }
      if (patch.salesIds !== undefined || patch.salesPersonId !== undefined) { const ids = salesList(patch); ids.forEach((sid) => { if (!x.salesOf(id).some((s) => s.salesId === sid)) checkSales(sid); }); setSales(u, id, ids); }
      log(id, u.id, 'deal.updated', 'deal', id, 'Order details updated'); save(); return clone(dealView(u, q));
    },
    // ---------- salespeople on a file (John, Nov 2; mirrors public.deal_sales_people, migration 19): Processor and Admins only ----------
    async addDealSalesPerson(dealId, salesId) { const u = needProcessor(); dealOr404(u, dealId);
      if (x.salesOf(dealId).some((s) => s.salesId === salesId)) fail('Already on this order.'); checkSales(salesId);
      setSales(u, dealId, [...x.salesOf(dealId).map((s) => s.salesId), salesId]); save(); return clone(dealView(u, load().deals.find((q) => q.id === dealId)).salesPeople); },
    async removeDealSalesPerson(dealId, salesId) { const u = needProcessor(); dealOr404(u, dealId);
      if (!x.salesOf(dealId).some((s) => s.salesId === salesId)) fail('Not on this order.');
      setSales(u, dealId, x.salesOf(dealId).map((s) => s.salesId).filter((sid) => sid !== salesId)); save(); return clone(dealView(u, load().deals.find((q) => q.id === dealId)).salesPeople); },
    async setDealSalesPeople(dealId, salesIds) { const u = needProcessor(); dealOr404(u, dealId); const ids = salesList({ salesIds });
      ids.forEach((sid) => { if (!x.salesOf(dealId).some((s) => s.salesId === sid)) checkSales(sid); }); setSales(u, dealId, ids); save();
      return clone(dealView(u, load().deals.find((q) => q.id === dealId)).salesPeople); },
    async setStage(id, stage) {
      const u = needProcessor(); const q = load().deals.find((y) => y.id === id) || fail('Order not found.');
      const s = Number(stage); if (!Number.isInteger(s) || s < 0 || s >= C.STAGES.length) fail('Unknown stage.');
      q.stage = s; log(id, u.id, 'stage.changed', 'deal', id, `Stage set to ${C.STAGES[s]}`);
      if (s === C.STAGES.length - 1 && q.status === 'Open') { q.status = 'Closed'; log(id, u.id, 'status.changed', 'deal', id, 'Order closed (funds disbursed)'); }
      save(); return clone(dealView(u, q));
    },
    async setDealStatus(id, status) {
      const u = needProcessor(); const q = load().deals.find((y) => y.id === id) || fail('Order not found.');
      if (!C.DEAL_STATUSES.includes(status)) fail('Unknown status.');
      q.status = status; log(id, u.id, 'status.changed', 'deal', id, `Status set to ${status}`); save(); return clone(dealView(u, q));
    },
  };
}
