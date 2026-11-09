/* mock adapter, part 1: auth, profile, dashboard, deals. See mock-adapter.js. */
import { autoCounty } from './county-auto.js?v=202611090935';
import { checkSource } from './mock-part-nov3b.js?v=202611090935';
import { isRefi, REFI_BLOCKED_FIELDS } from './constants.js?v=202611090935';
import { PROCESSOR_PICK_ROLES, referralWriteError } from './place-order.js?v=202611071845';
import { claRepresentationCode } from './cla-representation.js?v=202611090950';
// Refinance (John, Nov 3): purchase price and EMD must stay empty (the screen hides them and sends nothing). Mirrored by private.deal_refi_guard (migration 32).
const refiNoPrice = (inp, fail) => { for (const [k, l] of REFI_BLOCKED_FIELDS) if (inp[k] != null && String(inp[k]).trim() !== '') fail(`A refinance has no ${l === 'Purchase price' ? 'purchase price' : l}. Leave it empty.`); };
// John, Nov 3 call: the buyer's First-time buyer / Primary residence answers on the order ('yes' | 'no' | '' = not asked yet). Purchases only
// (a refinance keeps neither). They feed the Accounting tab's CLA-rate calculation (e.g. the Maryland first-time homebuyer exemption).
export const YES_NO = ['yes', 'no', ''];
export function occFields(input, transactionType, fail) {
  const v = (x, label) => { const s = String(x == null ? '' : x).trim().toLowerCase(); const t = s === 'true' ? 'yes' : s === 'false' ? 'no' : s; if (!YES_NO.includes(t)) fail(`${label} must be Yes, No or not set.`); return t; };
  const pr = v(input.primaryResidence, 'Primary residence'); const ft = v(input.firstTimeBuyer, 'First-time buyer');
  if (isRefi(transactionType)) return { primaryResidence: '', firstTimeBuyer: '' };
  if (ft === 'yes' && pr === 'no') fail('A first-time buyer exemption needs the home to be the buyer\'s primary residence: answer Primary residence Yes, or First-time buyer No.');
  return { primaryResidence: pr, firstTimeBuyer: ft };
}
export function dealsAndAuth(x) {
  const { load, save, nid, me, needUser, needProcessor, contactOf, dealsFor, dealOr404, log, notify, nameOf, dealView, taskVisible, clone, now, fail, str, emailOk, money, zipOk, stateCode, dateOrNull, localDate, C } = x;
  const OPEN = ['todo', 'in_progress', 'blocked'];
  // John, Nov 2: several salespeople per file; each must be an ACTIVE Sales Person or Sales Team user. The file's Processor must be an active Processor.
  const checkSales = (id) => { const p = x.prof(id) || fail('Salesperson not found.'); if (!['Sales Person', 'Sales Team'].includes(p.role)) fail('Only a Sales Person or Sales Team user can be a salesperson on an order.');
    if (p.status !== 'active') fail('Only an active salesperson can be added to an order.'); return p; };
  const checkPreprocessor = (id) => { if (id == null || id === '') return null; const p = x.prof(id) || fail('Preprocessor not found.'); if (p.role !== 'Preprocessor' || p.status !== 'active') fail('The Preprocessor on an order must be an active Preprocessor.'); return p; };
  const checkProcessor = (id, actor) => { if (id == null || id === '') return null; const p = x.prof(id) || fail('Processor not found.');
    if (!PROCESSOR_PICK_ROLES.includes(p.role) || p.status !== 'active') fail('The Processor on an order must be an active Processor, Preprocessor, Admin or Super admin.');
    if (!!p.isDemo !== !!(actor && actor.isDemo)) fail('A real order cannot use a demo Processor, and a demo order cannot use a real Processor.'); return p; };
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
      return clone(load().profiles.filter((p) => p.status === 'active' && PROCESSOR_PICK_ROLES.includes(p.role) && !!p.isDemo === !!u.isDemo).map(({ id, firstName, lastName, role, isDemo }) => ({ id, firstName, lastName, role, isDemo: !!isDemo }))); },
    async listPreprocessors() { const u = needUser(); if (!C.runsOrders(u)) fail('Only a Processor or Admin can do this.');
      return clone(load().profiles.filter((p) => p.status === 'active' && p.role === 'Preprocessor').map(({ id, firstName, lastName, role }) => ({ id, firstName, lastName, role }))); },
    // John, Nov 2: who can be a file's Transaction Coordinator = active users whose account role is exactly 'Transaction Coordinator' (with their contact id)
    async listCoordinators() { const u = needUser(); if (!C.runsOrders(u)) fail('Only a Processor or Admin can do this.');
      return clone(load().profiles.filter((p) => p.status === 'active' && p.role === 'Transaction Coordinator').map((p) => { const c = contactOf(p.id);
        return { id: p.id, contactId: c ? c.id : null, firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone, company: c ? c.company : '', role: p.role }; }).filter((p) => p.contactId)); },
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
      const proc = checkProcessor(input.processorId || null, u); const procId = proc ? proc.id : null;
      const claRepresentation = input.claRepresentation === undefined ? null : claRepresentationCode(input.claRepresentation);
      const preprocId = checkPreprocessor(input.preprocessorUserId || null);
      const salesIds = salesList(input); salesIds.forEach(checkSales);
      const street = str(input.street, 200) || fail('Street address is required.');
      const city = str(input.city, 100) || fail('City is required.');
      const state = stateCode(input.state); if (!C.US_STATES.includes(state)) fail('Pick a US state.');
      // John, Nov 2: Open Date = the day the order came in (defaults to today; may be backdated, never in the future). createdAt stays the system timestamp.
      const openDate = dateOrNull(input.openDate, 'Open date') || localDate(); if (openDate > localDate()) fail('Open date cannot be in the future.');
      const zip = str(input.zip, 10); if (!zipOk(zip)) fail('ZIP must be 5 digits (or ZIP+4).');
      const ac = await autoCounty({ county: str(input.county, C.COUNTY_MAX), zip, state }); const county = str(ac.county, C.COUNTY_MAX);   // John, Nov 2: optional, free text (e.g. Frederick); live40: blank -> from the ZIP
      const transactionType = C.TX_TYPES.includes(input.transactionType) ? input.transactionType : 'Purchase';
      if (isRefi(transactionType)) refiNoPrice(input, fail);
      const nextNum = Math.max(97000, ...d.deals.map((q) => Number(q.fileNumber.split('-')[2]) || 0)) + 1;
      const deal = { id: nid('deal'), fileNumber: `MD-26-${nextNum}`, street, city, state, zip, county, countySource: ac.countySource, transactionType, stage: 0, status: 'Open',
        openDate, closingDate: dateOrNull(input.closingDate, 'Closing date'), purchasePrice: money(input.purchasePrice, 'Purchase price'), loanAmount: money(input.loanAmount, 'Loan amount'),
        emdAmount: money(input.emdAmount, 'EMD amount'), emdDueDate: dateOrNull(input.emdDueDate, 'EMD due date'),
        // Matt, Nov 3 (b): lender phone + email (and the picked lender's name / company) and the source of business are set at placement
        lenderName: str(input.lenderName, 200), lenderContact: str(input.lenderContact, 200), lenderEmail: str(input.lenderEmail, 200).toLowerCase(), lenderPhone: x.phone(input.lenderPhone, 'Lender phone'),
        sourceOfBusiness: (() => { const src = checkSource(d, input.sourceOfBusiness, '', fail); const msg = referralWriteError({ source: src, contacts: d.contacts, profiles: d.profiles, actor: u, participants: d.participants, dealId: '' }); if (msg) fail(msg); return src; })(), ...occFields(input, transactionType, fail), notes: str(input.notes, 2000), claRepresentation, processorId: procId, processorUnassigned: !procId, preprocessorUserId: preprocId ? preprocId.id : null, createdBy: u.id, createdAt: now() };
      if (deal.lenderEmail && !emailOk(deal.lenderEmail)) fail('Lender email is not valid.');
      d.deals.push(deal);
      const pc = procId && contactOf(procId); if (pc) d.participants.push({ id: nid('dp'), dealId: deal.id, contactId: pc.id, role: 'Processor', createdAt: now() });
      const prec = preprocId && contactOf(preprocId.id); if (prec) d.participants.push({ id: nid('dp'), dealId: deal.id, contactId: prec.id, role: 'Preprocessor', createdAt: now() });
      x.DEAL_FOLDERS.forEach((name) => d.folders.push({ id: nid('f'), scope: 'deal', dealId: deal.id, name, staffOnly: false, createdBy: u.id, createdAt: now() }));
      // Staff task; participants' intake tasks are copied from the current task templates when each person is added (addParticipant).
      d.tasks.push({ id: nid('t'), dealId: deal.id, participantId: null, templateId: null, templateCode: null, templateVersion: null, kind: 'simple', title: 'Collect executed contract', description: '',
        assignedRole: 'Processor', status: 'todo', dueDate: null, formData: {}, savedAt: null, completedAt: null, completedBy: null, createdBy: u.id, createdAt: now() });
      log(deal.id, u.id, 'deal.created', 'deal', deal.id, `Order ${deal.fileNumber} opened${procId ? ` (Processor: ${nameOf(procId)})` : ' (Processor unassigned)'}`);
      setSales(u, deal.id, salesIds);
      save(); return clone(dealView(u, deal));
    },
    async updateDeal(id, patch) {
      const u = needProcessor(); const d = load(); const q = d.deals.find((y) => y.id === id) || fail('Order not found.');
      if (patch.state != null) { patch = { ...patch, state: stateCode(patch.state) }; if (patch.state !== q.state && !C.US_STATES.includes(patch.state)) fail('Pick a US state.'); }
      ['street', 'city', 'state', 'zip', 'lenderName', 'lenderContact', 'lenderEmail', 'lenderPhone', 'notes'].forEach((k) => { if (patch[k] != null) q[k] = str(patch[k], k === 'notes' ? 2000 : 200); });
      if (patch.county != null) q.county = str(patch.county, C.COUNTY_MAX);
      if (q.lenderEmail && !emailOk(q.lenderEmail)) fail('Lender email is not valid.');
      if (patch.lenderPhone != null) q.lenderPhone = x.phone(patch.lenderPhone, 'Lender phone');
      if (!zipOk(q.zip)) fail('ZIP must be 5 digits (or ZIP+4).');
      if (!q.street || !q.city || !q.state) fail('Street, city and state are required.');
      if (patch.openDate) { const o = dateOrNull(patch.openDate, 'Open date'); if (o > localDate()) fail('Open date cannot be in the future.'); q.openDate = o; }
      if (patch.closingDate !== undefined) q.closingDate = dateOrNull(patch.closingDate, 'Closing date');
      if (isRefi(q)) refiNoPrice(patch, fail);   // a refinance keeps no purchase price / EMD (clearing one an old order still has is allowed)
      if (patch.purchasePrice !== undefined) q.purchasePrice = money(patch.purchasePrice, 'Purchase price');
      if (patch.loanAmount !== undefined) q.loanAmount = money(patch.loanAmount, 'Loan amount');
      // John, Nov 2: earnest money deposit (optional; amount >= 0)
      if (patch.emdAmount !== undefined) q.emdAmount = money(patch.emdAmount, 'EMD amount');
      if (patch.emdDueDate !== undefined) q.emdDueDate = dateOrNull(patch.emdDueDate, 'EMD due date');
      if (patch.primaryResidence !== undefined || patch.firstTimeBuyer !== undefined) Object.assign(q, occFields({ primaryResidence: patch.primaryResidence !== undefined ? patch.primaryResidence : q.primaryResidence, firstTimeBuyer: patch.firstTimeBuyer !== undefined ? patch.firstTimeBuyer : q.firstTimeBuyer }, q.transactionType, fail));   // John, Nov 3 call
      if (patch.claRepresentation !== undefined) q.claRepresentation = claRepresentationCode(patch.claRepresentation);
      if (patch.sourceOfBusiness !== undefined) { const src = checkSource(load(), patch.sourceOfBusiness, q.sourceOfBusiness, fail); const msg = referralWriteError({ source: src, contacts: d.contacts, profiles: d.profiles, actor: u, participants: d.participants, dealId: id }); if (msg) fail(msg); q.sourceOfBusiness = src; }   // Matt, Nov 3 (b); Nov 7: one contact on the file, or a legacy value left as stored
      if (patch.preprocessorUserId !== undefined) { const pre = checkPreprocessor(patch.preprocessorUserId || null); const next = pre ? pre.id : null; if (next !== (q.preprocessorUserId || null)) { q.preprocessorUserId = next; const c = next && contactOf(next); d.participants = d.participants.filter((p) => !(p.dealId === id && p.role === 'Preprocessor')); if (c) d.participants.push({ id: nid('dp'), dealId: id, contactId: c.id, role: 'Preprocessor', createdAt: now() }); log(id, u.id, 'deal.preprocessor', 'deal', id, `Preprocessor ${next ? 'set to ' + nameOf(next) : 'cleared'}`); } }
      if (patch.processorId !== undefined) { const next = checkProcessor(patch.processorId || null, u); const nextId = next ? next.id : null; const prev = q.processorId || null;
        if (nextId !== prev) { q.processorId = nextId; const prevContact = prev && contactOf(prev); if (prevContact) d.participants = d.participants.filter((p) => !(p.dealId === id && p.role === 'Processor' && p.contactId === prevContact.id));
          const nc = next && contactOf(next.id); if (nc && !d.participants.some((p) => p.dealId === id && p.role === 'Processor' && p.contactId === nc.id)) d.participants.push({ id: nid('dp'), dealId: id, contactId: nc.id, role: 'Processor', createdAt: now() });
          log(id, u.id, 'deal.processor', 'deal', id, nextId ? `Processor set to ${nameOf(nextId)}` : 'Processor unassigned'); } }
      // John, Nov 9: the file's Transaction Coordinator (informational; staff set / change / clear it any time). Same activity + one notification as the hosted trigger.
      if (patch.tcUserId !== undefined) { const nextId = patch.tcUserId || null; const prev = q.tcUserId || null;
        if (nextId && !d.profiles.some((p) => p.id === nextId && p.status === 'active' && p.role === 'Transaction Coordinator')) fail('The Transaction Coordinator on an order must be an active Transaction Coordinator.');
        if (nextId !== prev) { q.tcUserId = nextId; log(id, u.id, 'deal.tc', 'deal', id, nextId ? `Transaction Coordinator set to ${nameOf(nextId)}` : 'Transaction Coordinator unassigned');
          if (nextId) notify([nextId], { kind: 'tc', dealId: id, title: `You are now the Transaction Coordinator on ${q.fileNumber || 'an order'}`, link: `#/deals/${id}` }, u.id); } }
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
      const u = needProcessor(); const d = load(); const q = d.deals.find((y) => y.id === id) || fail('Order not found.');
      const s = Number(stage); if (!Number.isInteger(s) || s < 0 || s >= C.STAGES.length) fail('Unknown stage.');
      q.stage = s; log(id, u.id, 'stage.changed', 'deal', id, `Stage set to ${C.STAGES[s]}`);
      if (s === C.STAGES.length - 1 && q.status === 'Open') { q.status = 'Closed'; log(id, u.id, 'status.changed', 'deal', id, 'Order closed (funds disbursed)'); }
      save(); return clone(dealView(u, q));
    },
    async setDealStatus(id, status) {
      const u = needProcessor(); const d = load(); const q = d.deals.find((y) => y.id === id) || fail('Order not found.');
      if (!C.DEAL_STATUSES.includes(status)) fail('Unknown status.');
      q.status = status; log(id, u.id, 'status.changed', 'deal', id, `Status set to ${status}`); save(); return clone(dealView(u, q));
    },
  };
}
