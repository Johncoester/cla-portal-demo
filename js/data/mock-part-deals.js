/* mock adapter, part 1: auth, profile, dashboard, deals. See mock-adapter.js. */
export function dealsAndAuth(x) {
  const { load, save, nid, me, needUser, needProcessor, contactOf, dealsFor, dealOr404, log, nameOf, dealView, clone, now, fail, str, emailOk, money, zipOk, C } = x;
  return {
    // ---------- Profile ----------
    async getMyProfile() { return clone(needUser()); },
    async updateMyProfile(patch) {
      const u = needUser(); const p = load().profiles.find((q) => q.id === u.id);
      if (patch.firstName != null) p.firstName = str(patch.firstName, 80) || fail('First name is required.');
      if (patch.lastName != null) p.lastName = str(patch.lastName, 80);
      if (patch.phone != null) p.phone = str(patch.phone, 40);
      const c = contactOf(u.id); if (c) { c.firstName = p.firstName; c.lastName = p.lastName; c.phone = p.phone; }
      save(); return clone(p);
    },
    // ---------- Dashboard ----------
    async getWorkQueue() {
      const u = needUser(); const d = load(); const deals = dealsFor(u).filter((q) => q.status === 'Open');
      const tasks = d.tasks.filter((t) => deals.some((q) => q.id === t.dealId) && (t.status === 'todo' || t.status === 'blocked'));
      const today = now().slice(0, 10); const soon = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
      const clientWait = (t) => t.status === 'todo' && /^Client/.test(t.assignedRole);
      const attention = deals.map((q) => ({ deal: dealView(u, q), overdue: tasks.filter((t) => t.dealId === q.id && t.dueDate && t.dueDate < today).length,
        blocked: tasks.filter((t) => t.dealId === q.id && t.status === 'blocked').length, waitingOnClients: tasks.filter((t) => t.dealId === q.id && clientWait(t)).length }))
        .filter((r) => r.overdue || r.blocked || r.waitingOnClients);
      return { assigned: deals.length, totalAssigned: dealsFor(u).length, blockedOnClients: tasks.filter(clientWait).length,
        overdueTasks: tasks.filter((t) => t.dueDate && t.dueDate < today).length, closingsToday: deals.filter((q) => q.closingDate === today).length,
        closingSoon: deals.filter((q) => q.closingDate && q.closingDate >= today && q.closingDate <= soon).map((q) => dealView(u, q)).sort((a, b) => a.closingDate.localeCompare(b.closingDate)),
        needsAttention: attention, unreadMessages: deals.reduce((n, q) => n + dealView(u, q).unread, 0) };
    },
    async unreadCount() { const u = needUser(); return dealsFor(u).reduce((n, q) => n + dealView(u, q).unread, 0); },
    // ---------- Deals ----------
    async listDeals({ status } = {}) {
      const u = needUser();
      return dealsFor(u).filter((q) => !status || status === 'All' || q.status === status).map((q) => dealView(u, q))
        .sort((a, b) => (b.openDate || '').localeCompare(a.openDate || '') || b.fileNumber.localeCompare(a.fileNumber));
    },
    async getDeal(id) { const u = needUser(); const q = dealOr404(u, id); return { ...dealView(u, q), participants: x.participantsOf(id, u) }; },
    async createDeal(input) {
      const u = needProcessor(); const d = load();
      const street = str(input.street, 200) || fail('Street address is required.');
      const city = str(input.city, 100) || fail('City is required.');
      const state = str(input.state, 2).toUpperCase() || fail('State is required.');
      const zip = str(input.zip, 10); if (!zipOk(zip)) fail('ZIP must be 5 digits (or ZIP+4).');
      const transactionType = C.TX_TYPES.includes(input.transactionType) ? input.transactionType : 'Purchase';
      const nextNum = Math.max(97000, ...d.deals.map((q) => Number(q.fileNumber.split('-')[2]) || 0)) + 1;
      const deal = { id: nid('deal'), fileNumber: `MD-26-${nextNum}`, street, city, state, zip, transactionType, stage: 0, status: 'Open',
        openDate: now().slice(0, 10), closingDate: str(input.closingDate, 10) || null, purchasePrice: money(input.purchasePrice, 'Purchase price'), loanAmount: money(input.loanAmount, 'Loan amount'),
        lenderName: '', lenderContact: '', lenderEmail: '', lenderPhone: '', notes: str(input.notes, 2000), processorId: u.id, salesPersonId: input.salesPersonId || null, createdBy: u.id, createdAt: now() };
      d.deals.push(deal);
      const pc = contactOf(u.id); if (pc) d.participants.push({ id: nid('dp'), dealId: deal.id, contactId: pc.id, role: 'Sales Processor', createdAt: now() });
      [['Personal information form', 'Client-Buyer'], ['Upload photo ID', 'Client-Buyer'], ['Title vesting details', 'Client-Buyer'], ['Confirm lender information', 'Buyer Agent'], ['Collect executed contract', 'Sales Processor']]
        .forEach(([title, role]) => d.tasks.push({ id: nid('t'), dealId: deal.id, title, description: '', assignedRole: role, status: 'todo', dueDate: null, completedAt: null, completedBy: null, createdBy: u.id, createdAt: now() }));
      log(deal.id, u.id, 'deal.created', 'deal', deal.id, `Order ${deal.fileNumber} opened`);
      save(); return clone(dealView(u, deal));
    },
    async updateDeal(id, patch) {
      const u = needProcessor(); const q = load().deals.find((y) => y.id === id) || fail('Order not found.');
      ['street', 'city', 'state', 'zip', 'lenderName', 'lenderContact', 'lenderEmail', 'lenderPhone', 'notes'].forEach((k) => { if (patch[k] != null) q[k] = str(patch[k], k === 'notes' ? 2000 : 200); });
      if (q.lenderEmail && !emailOk(q.lenderEmail)) fail('Lender email is not valid.');
      if (!zipOk(q.zip)) fail('ZIP must be 5 digits (or ZIP+4).');
      if (!q.street || !q.city || !q.state) fail('Street, city and state are required.');
      if (patch.closingDate !== undefined) q.closingDate = str(patch.closingDate, 10) || null;
      if (patch.purchasePrice !== undefined) q.purchasePrice = money(patch.purchasePrice, 'Purchase price');
      if (patch.loanAmount !== undefined) q.loanAmount = money(patch.loanAmount, 'Loan amount');
      if (patch.salesPersonId !== undefined) q.salesPersonId = patch.salesPersonId || null;
      log(id, u.id, 'deal.updated', 'deal', id, 'Order details updated'); save(); return clone(dealView(u, q));
    },
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
