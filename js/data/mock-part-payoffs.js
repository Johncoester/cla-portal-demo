/* mock adapter: PAYOFFS, HOA, FRONT FOOT BENEFIT (FFB), GROUND RENT (Qualia, Francis Santos's video; John, Nov 4 2026 "yes build it", "mimic Qualia
 * exactly for now"). Behind the same `accounting` flag as the Accounting tab. CLA staff only: agents and clients never see payoffs (lenders,
 * loan numbers, amounts), the Other Contacts list, the order info or the payoff notes. Processor / Admin / Super admin edit; Sales and TCs read.
 * Payoffs flow into the fee ledger (ALTA Payoffs, CD seller side N / a refinance's payoffs) as ONE line per payoff, kept in step on every save.
 * Nothing is ever deleted (retire = soft delete, logged) and nothing is sent. No wire instructions, bank details or SSNs are stored. FAKE DATA. */
import { cleanPayoff, payoffCalc, payoffFeeInput, cleanCompany, companyMatches, cleanOrderInfo, orderInfoLines, cleanNote, hoaGrFeeInput, HOA_GR_PRESETS, PAYOFF_TASKS, PAYOFF_FOLDERS,
  OTHER_CONTACT_TYPES, MANAGED_TYPES, otherTypeLabel, MAX_PAYOFFS, PAYOFF_TABS } from './payoffs.js?v=202611060220';
import { acctCanRead, acctCanEdit, ACCOUNTING_OFF, ACCOUNTING_STAFF_ONLY, ACCOUNTING_READ_ONLY, closingDateOf } from './accounting.js?v=202611060220';
import { SETTLEMENT_AGENT } from './qualia-charges.js?v=202611060220';
export function ensurePayoffs(d) { for (const k of ['payoffs', 'otherCompanies', 'dealOtherContacts', 'payoffInfo', 'payoffNotes', 'payoffLog']) if (!Array.isArray(d[k])) d[k] = []; return d; }

export function payoffsPart(x, flags, api) {
  const { load, save, nid, needUser, dealsFor, fail, now, nameOf, clone } = x;
  const db = () => ensurePayoffs(load());
  const reader = (dealId) => { if (!flags.accounting) fail(ACCOUNTING_OFF); const u = needUser(); if (!acctCanRead(u)) fail(ACCOUNTING_STAFF_ONLY);
    const deal = dealsFor(u).find((q) => q.id === dealId) || fail('Order not found.'); return { u, deal, canEdit: acctCanEdit(u) }; };
  const editor = (dealId) => { const r = reader(dealId); if (!r.canEdit) fail(ACCOUNTING_READ_ONLY); return r; };
  const staff = () => { if (!flags.accounting) fail(ACCOUNTING_OFF); const u = needUser(); if (!acctCanRead(u)) fail(ACCOUNTING_STAFF_ONLY); return u; };
  const refiOf = (deal) => deal.transactionType === 'Refinance';
  const logIt = (u, dealId, what, action, detail) => db().payoffLog.push({ id: nid('plog'), dealId, what, action, detail: String(detail || '').slice(0, 500), at: now(), byId: u.id, byName: nameOf(u.id) });
  const company = (id) => db().otherCompanies.find((c) => c.id === id);
  const view = (p, deal) => { const c = payoffCalc(p, { closingDate: closingDateOf(deal) }); return { ...clone(p), calcOut: c, total: c.total, tab: PAYOFF_TABS[p.position - 1] }; };
  // keep the payoff's fee-ledger line in step: total > 0 = add / update it; total 0 (e.g. "ZERO BALANCE") or retired = retire it
  const syncFee = async (p, deal) => { const total = payoffCalc(p, { closingDate: closingDateOf(deal) }).total; const fees = (await api.getAccounting(deal.id, { includeRetired: true })).entries;
    const cur = p.feeId ? fees.find((f) => f.id === p.feeId) : null; const input = { ...payoffFeeInput(p, refiOf(deal), total), presetKey: 'payoff:' + p.id };
    if (p.retired || !(total > 0)) { if (cur && !cur.retired) await api.retireAccountingFee(cur.id, true); return; }
    if (cur) { if (cur.retired) await api.retireAccountingFee(cur.id, false); await api.updateAccountingFee(cur.id, input); }
    else { const f = await api.addAccountingFee(deal.id, input); const rec = db().payoffs.find((z) => z.id === p.id); rec.feeId = f.id; save(); } };
  const otherOut = (oc) => { const c = company(oc.companyId) || {}; const m = c.managementCompanyId ? company(c.managementCompanyId) : null;
    return { ...clone(oc), name: c.name, type: oc.type, typeLabel: otherTypeLabel(oc.type), phone: c.phone || '', fax: c.fax || '', address: c.address || '', management: m ? { id: m.id, name: m.name } : null }; };
  const othersOf = (dealId) => db().dealOtherContacts.filter((z) => z.dealId === dealId && !z.retired);

  return {
    // ---------- Mortgage Payoffs ----------
    async listPayoffs(dealId) { const { deal, canEdit } = reader(dealId);
      const list = db().payoffs.filter((p) => p.dealId === dealId && !p.retired).sort((a, b) => a.position - b.position).map((p) => view(p, deal));
      return { dealId, canEdit, refi: refiOf(deal), closingDate: closingDateOf(deal), max: MAX_PAYOFFS, payoffs: list, totalDue: Math.round(list.reduce((t, p) => t + p.total, 0) * 100) / 100 }; },
    async savePayoff(dealId, input) { const { u, deal } = editor(dealId); const clean = cleanPayoff(input); const list = db().payoffs;
      let p = list.find((z) => z.dealId === dealId && !z.retired && z.position === clean.position); const first = !p;
      if (clean.lender.otherContactId && !db().dealOtherContacts.some((z) => z.id === clean.lender.otherContactId && z.dealId === dealId)) fail('That payoff lender is not on this order.');
      if (!p) { p = { id: nid('pay'), dealId, feeId: null, retired: false, createdAt: now(), createdBy: u.id }; list.push(p); }
      Object.assign(p, clean, { updatedAt: now(), updatedBy: u.id }); logIt(u, dealId, `${PAYOFF_TABS[p.position - 1]} (${p.lender.name})`, first ? 'added' : 'edited', payoffCalc(p, { closingDate: closingDateOf(deal) }).text); save();
      await syncFee(p, deal); return view(db().payoffs.find((z) => z.id === p.id), deal); },
    async retirePayoff(id) { const p = db().payoffs.find((z) => z.id === id) || fail('Payoff not found.'); const { u, deal } = editor(p.dealId); if (p.retired) return true;
      p.retired = true; p.retiredAt = now(); p.retiredBy = u.id; logIt(u, p.dealId, `${PAYOFF_TABS[p.position - 1]} (${p.lender.name})`, 'retired', 'Payoff retired (kept in the history); its fee-ledger line is retired too.'); save();
      await syncFee(p, deal); return true; },
    async listPayoffLog(dealId) { reader(dealId); return clone(db().payoffLog.filter((l) => l.dealId === dealId)).reverse(); },

    // ---------- Other Contacts (Contacts › Add Other Contact) ----------
    async searchOtherCompanies(q = '', type = '') { staff(); return clone(db().otherCompanies.filter((c) => companyMatches(c, q, type)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 25)); },
    async createOtherCompany(input) { const u = staff(); if (!acctCanEdit(u)) fail(ACCOUNTING_READ_ONLY); const c = cleanCompany(input);
      if (c.managementCompanyId && !company(c.managementCompanyId)) fail('Management company not found.');
      if (db().otherCompanies.some((z) => z.type === c.type && z.name.toLowerCase() === c.name.toLowerCase())) fail(`${c.name} is already a ${otherTypeLabel(c.type)}: pick it from Existing instead.`);
      const rec = { id: nid('oco'), ...c, createdAt: now(), createdBy: u.id }; db().otherCompanies.push(rec); save(); return clone(rec); },
    async updateOtherCompany(id, patch) { const u = staff(); if (!acctCanEdit(u)) fail(ACCOUNTING_READ_ONLY); const c = company(id) || fail('Company not found.');
      const next = cleanCompany({ name: c.name, type: c.type, phone: c.phone, fax: c.fax, address: c.address, managementCompanyId: c.managementCompanyId, ...patch, type: c.type });
      if (next.managementCompanyId === id) fail('A company cannot manage itself.'); if (next.managementCompanyId && !company(next.managementCompanyId)) fail('Management company not found.');
      Object.assign(c, next, { updatedAt: now(), updatedBy: u.id }); save(); return clone(c); },
    async listOtherContacts(dealId) { reader(dealId); return othersOf(dealId).map(otherOut); },
    async addOtherContact(dealId, companyId, type) { const { u } = editor(dealId); const c = company(companyId) || fail('Company not found.'); const t = type || c.type;
      if (!OTHER_CONTACT_TYPES.some(([k]) => k === t)) fail('Unknown contact type.');
      if (othersOf(dealId).some((z) => z.companyId === companyId && z.type === t)) fail(`${c.name} is already on this order as ${otherTypeLabel(t)}.`);
      const oc = { id: nid('doc2'), dealId, companyId, type: t, retired: false, createdAt: now(), createdBy: u.id }; db().dealOtherContacts.push(oc);
      logIt(u, dealId, `${otherTypeLabel(t)}: ${c.name}`, 'added', 'Other contact added'); save(); return otherOut(oc); },
    async removeOtherContact(id) { const oc = db().dealOtherContacts.find((z) => z.id === id) || fail('Contact not found.'); const { u } = editor(oc.dealId);
      if (db().payoffs.some((p) => !p.retired && p.lender.otherContactId === id)) fail('This company is a payoff lender on this order. Retire or switch that payoff first.');
      oc.retired = true; oc.retiredAt = now(); oc.retiredBy = u.id; logIt(u, oc.dealId, `${otherTypeLabel(oc.type)}: ${(company(oc.companyId) || {}).name}`, 'removed', 'Removed from this order (the company stays in the list)'); save(); return true; },
    // payees for the H lines: the file's Other Contacts with their role (Qualia: "CLA Title & Escrow — Settlement Agency")
    async listPayoffPayees(dealId) { reader(dealId); return [{ name: SETTLEMENT_AGENT, role: 'Settlement Agency' }, ...othersOf(dealId).map(otherOut).flatMap((o) => [{ name: o.name, role: o.typeLabel }, ...(o.management ? [{ name: o.management.name, role: `${o.typeLabel} management` }] : [])])]; },

    // ---------- order info (ground rent, SDAT, redemption) ----------
    async getPayoffOrderInfo(dealId) { const { canEdit } = reader(dealId); const r = db().payoffInfo.find((z) => z.dealId === dealId); const data = r ? clone(r.data) : {};
      return { dealId, canEdit, data, lines: orderInfoLines(data), updatedAt: r ? r.updatedAt : null, updatedByName: r ? nameOf(r.updatedBy) : '' }; },
    async savePayoffOrderInfo(dealId, input) { const { u } = editor(dealId); const data = cleanOrderInfo(input); let r = db().payoffInfo.find((z) => z.dealId === dealId);
      if (!r) { r = { id: nid('pinfo'), dealId, data: {}, createdAt: now(), createdBy: u.id }; db().payoffInfo.push(r); }
      r.data = data; r.updatedAt = now(); r.updatedBy = u.id; logIt(u, dealId, 'Order info', 'edited', orderInfoLines(data).join('; ')); save(); return this.getPayoffOrderInfo(dealId); },

    // ---------- notes (PAYOFF TEAM, HOA, FFB, GROUND RENT, ORDER INFO) ----------
    async listPayoffNotes(dealId) { reader(dealId); return clone(db().payoffNotes.filter((n) => n.dealId === dealId && !n.retired)).map((n) => ({ ...n, byName: nameOf(n.createdBy), editedByName: n.updatedBy ? nameOf(n.updatedBy) : '' })).reverse(); },
    async addPayoffNote(dealId, input) { const { u } = editor(dealId); const n = { id: nid('pnote'), dealId, ...cleanNote(input), retired: false, createdAt: now(), createdBy: u.id };
      db().payoffNotes.push(n); logIt(u, dealId, `Note (${n.section})`, 'added', n.body.split('\n')[0]); save(); return clone(n); },
    async updatePayoffNote(id, input) { const n = db().payoffNotes.find((z) => z.id === id && !z.retired) || fail('Note not found.'); const { u } = editor(n.dealId);
      const c = cleanNote({ section: n.section, ...input }); n.history = [...(n.history || []), { body: n.body, at: n.updatedAt || n.createdAt, by: n.updatedBy || n.createdBy }].slice(-20);
      Object.assign(n, c, { updatedAt: now(), updatedBy: u.id }); logIt(u, n.dealId, `Note (${n.section})`, 'edited', c.body.split('\n')[0]); save(); return clone(n); },

    // ---------- Pre-Closing tasks (created once each; "Update Payoff" is due on the first payoff's good-through date). Nothing is sent. ----------
    async addPayoffTasks(dealId) { const { u, deal } = editor(dealId); const have = (await api.listTasks(dealId)).filter((t) => t.status !== 'cancelled').map((t) => t.title.toLowerCase());
      const gt = (db().payoffs.find((p) => p.dealId === dealId && !p.retired && p.position === 1) || {}).goodThrough || null; let added = 0, skipped = 0;
      const day = (n) => { const t = new Date(Date.now() + n * 864e5); return t.toISOString().slice(0, 10); };
      for (const t of PAYOFF_TASKS) { if (have.includes(t.title.toLowerCase())) { skipped++; continue; }
        await api.createTask(dealId, { title: t.title, description: `Pre-Closing (payoffs, HOA, FFB, ground rent). ${t.due === 'goodThrough' ? (gt ? 'Due on the payoff good-through date.' : 'Due on the payoff good-through date (not set yet).') : ''}`.trim(), assignedRole: 'Processor', dueDate: t.due === 'goodThrough' ? gt || null : day(t.due) }); added++; }
      logIt(u, dealId, 'Pre-Closing tasks', 'added', `${added} added, ${skipped} already there`); save(); void deal; return { added, skipped }; },
    // ---------- documents: "300 Payoffs and Invoices" › PAYOFF FORMS / PAYOFF FOLDER (staff only) ----------
    async ensurePayoffFolders(dealId) { const { u } = editor(dealId); const d = db(); let created = 0;
      for (const name of PAYOFF_FOLDERS) if (!d.folders.some((f) => f.scope === 'deal' && f.dealId === dealId && f.name.toLowerCase() === name.toLowerCase())) {
        d.folders.push({ id: nid('f'), scope: 'deal', dealId, name, staffOnly: true, createdBy: u.id, createdAt: now() }); created++; }
      if (created) { logIt(u, dealId, 'Payoff folders', 'added', `${created} folder(s)`); save(); }
      return clone(d.folders.filter((f) => f.dealId === dealId && PAYOFF_FOLDERS.includes(f.name))); },
    async listPayoffFolders(dealId) { reader(dealId); const d = db(); return clone(d.folders.filter((f) => f.dealId === dealId && PAYOFF_FOLDERS.includes(f.name)).map((f) => ({ ...f, count: d.documents.filter((z) => z.folderId === f.id).length }))); },

    // ---------- H "HOA / Condo / Ground Rent / Payoffs" lines ----------
    async addHoaGrCharge(dealId, key, { amount = null, paidTo = '', payee = null } = {}) { const { deal } = editor(dealId); const pr = HOA_GR_PRESETS.find((p) => p.key === key) || fail('Unknown HOA / FFB / ground rent line.');
      if (refiOf(deal) && pr.side === 'seller') fail('A refinance has no seller side.');
      const fees = (await api.getAccounting(dealId)).entries.filter((f) => f.cdSection === 'H' && !f.retired); const used = new Set(fees.map((f) => f.cdLine).filter(Boolean));
      let n = 1; while (used.has(String(n).padStart(2, '0'))) n++; if (n > 99) fail('Section H is full.');
      const others = othersOf(dealId).map(otherOut); const pick = (t) => (others.find((o) => o.type === t) || {}).name || '';
      const auto = pr.payeeType === 'cla' ? SETTLEMENT_AGENT : pr.payeeType === 'utilityMgmt' ? ((others.find((o) => o.type === 'utility') || {}).management || {}).name || pick('utility') : pick(pr.payeeType);
      return api.addAccountingFee(dealId, hoaGrFeeInput(pr, String(n).padStart(2, '0'), payee != null ? payee : auto, amount, paidTo)); },

    // ---------- FAKE demo data (a button on the Payoffs page; never automatic) ----------
    async loadPayoffDemo(dealId) { const { u, deal } = editor(dealId); if (db().payoffs.some((p) => p.dealId === dealId && !p.retired)) fail('This order already has a payoff. The demo only loads on an order without one.');
      const co = async (input) => (db().otherCompanies.find((c) => c.type === input.type && c.name === input.name)) || this.createOtherCompany(input);
      const lender = await co({ type: 'payoffLender', name: 'Example Loan Servicing, Inc. (fake)', phone: '(555) 010-2424', address: '100 Example Plaza, Anytown, CA 90000' });
      const mgmt = await co({ type: 'hoaMgmt', name: 'Sample HOA Management Services (fake)', phone: '(555) 010-0818', fax: '(555) 010-0816', address: '1 Sample Avenue, Suite 100, Alexandria, VA 22300' });
      const hoa = await co({ type: 'hoa', name: 'Maple Glen Homeowners Association (fake)', address: '1 Sample Avenue, Alexandria, VA 22300', managementCompanyId: mgmt.id });
      const ffbMgmt = await co({ type: 'hoaMgmt', name: 'Example Benefit Management Group (fake)', address: '3 Example Drive, Olney, MD 20800' });
      const util = await co({ type: 'utility', name: 'Example Village Utility Co. (fake)', address: '3 Example Drive, Olney, MD 20800', managementCompanyId: ffbMgmt.id });
      const gr = await co({ type: 'grLeaseholder', name: 'Example Ground Lease LLC (fake)', address: 'P.O. Box 0000, Exampleville, MD 21000' });
      const oc = {}; for (const [k, c] of [['lender', lender], ['hoa', hoa], ['mgmt', mgmt], ['util', util], ['gr', gr]]) { const ex = othersOf(dealId).find((z) => z.companyId === c.id); oc[k] = ex || await this.addOtherContact(dealId, c.id, c.type); }
      const p = await this.savePayoff(dealId, { position: 1, lender: { name: lender.name, phone: lender.phone, address: lender.address, otherContactId: oc.lender.id }, loanNumber: '9990000001', lienHolder: lender.name, isMortgage: true,
        principal: '85548.08', interest: '1408.92', interestTo: '2026-11-27', interestMode: 'to', goodThrough: '2026-11-27', calc: { daysPerYear: '360', perDiem: '24.71' },
        items: [['Late Fee Unpaid', '79.00'], ['Unpaid NSF Chg', '40.00'], ['Est Legal Charges', '2850.00'], ['Estimated Payoff BK Chg', '200.00'], ['Est Payoff Chgs/FC', '25.00'], ['Recording Fees', '30.00'], ['Corp Adv (Maint/Insp)', '330.00'], ['Suspense Balance', '-8.58']].map(([label, amount]) => ({ label, amount })) });
      await this.savePayoffOrderInfo(dealId, { propertyType: 'leasehold', needPayoff: 'yes', hoa: 'yes', condo: 'no', ffb: 'yes', groundRent: 'yes', grContractPage: '30', sdatGrRegistration: true, redemption: 'none', deedsOfTrust: 1 });
      const lines = [];
      if (!refiOf(deal)) for (const [k, a, to] of [['hoaReimb', '70.66', ''], ['hoaTransfer', '70.66', ''], ['hoaPrepaid', '511.00', ''], ['ffbBalance', '1006.00', ''], ['ffbFee', '50.00', ''], ['groundRent', '96.00', 'In Escrow']]) lines.push(await this.addHoaGrCharge(dealId, k, { amount: a, paidTo: to }));
      await this.addPayoffNote(dealId, { section: 'payoff', body: `# PAYOFF TEAM\n## PAYOFF - ${lender.name} --\n*Loan#: 9990000001*\n11.04 ${u.firstName || 'Staff'} - Received payoff GDTH 11/27\n10.28 ${u.firstName || 'Staff'} - Ordered Payoff via email\n10.26 ${u.firstName || 'Staff'} - Requested auth from the seller` });
      await this.addPayoffNote(dealId, { section: 'ffb', body: `FFB - ${ffbMgmt.name}\n10.21 ${u.firstName || 'Staff'} - RECEIVED - ANNUALLY - PAST DUE\n10.14 ${u.firstName || 'Staff'} - Ordered FFB via email` });
      return { payoff: p, lines: lines.length }; },
  };
}
