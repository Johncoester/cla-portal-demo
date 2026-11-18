/* mock adapter: AGENT FEES (AF-2; John, Nov 12 2026). The same rules as the database functions in migrations 20261117100000 / 20261118010000:
 * staff who run the file see and change both sides; an agent sees and changes only their own side; a TC changes the side of an agent on
 * their team (or both sides when they are the file's TC); other CLA staff on the file read both sides; buyers and sellers see nothing.
 * An agent or TC saving confirms the side. Staff need a reason to change a confirmed fee (no re-approval). Every change is logged. FAKE DATA. */
import { runsOrders } from './constants.js?v=202611245800';
import { readAgentFees, groupAgentFees, SIDE_LABEL, defaultPayer, agentFeeLedgerInput, ledgerKey, ledgerShape } from './agent-fees.js?v=202611246500';
import { cleanFee } from './accounting.js?v=202611243300';

export function ensureAgentFees(d) { for (const k of ['agentFees', 'agentFeeLog']) if (!Array.isArray(d[k])) d[k] = []; return d; }

/* AF-8 (John, Nov 14; same rule as SQL 20261123010000): a commission an agent typed on the old "Commission information" task becomes that
 * side's Agent fees commission ($ basis, % from the sales price), only where the side has none. A submitted task counts as the agent
 * confirming it; an unfinished draft does not. A figure that can't be moved (no price, above the price, refinance) is noted in the
 * history once. Idempotent. The demo posts the Accounting line the next time the side is saved. FAKE DATA. */
export function backfillCommissionTasks(d) {
  ensureAgentFees(d); if (!Array.isArray(d.tasks) || !Array.isArray(d.deals)) return d;
  const sideOf = (role) => (role === 'Buyer Agent' ? 'buyer' : role === 'Listing Agent' ? 'listing' : null);
  const amountOf = (t) => String((t.formData || {}).commission_amount || '').trim();
  const picks = new Map();
  d.tasks.filter((t) => t.templateCode === 'commissions' && t.status !== 'cancelled' && sideOf(t.assignedRole) && amountOf(t))
    .sort((a, b) => (Number(b.status === 'done') - Number(a.status === 'done')) || String(b.completedAt || b.savedAt || '').localeCompare(String(a.completedAt || a.savedAt || '')))
    .forEach((t) => { const k = `${t.dealId}|${sideOf(t.assignedRole)}`; if (!picks.has(k)) picks.set(k, t); });
  for (const t of picks.values()) {
    const side = sideOf(t.assignedRole); const deal = d.deals.find((q) => q.id === t.dealId); if (!deal) continue;
    if (d.agentFeeLog.some((l) => l.dealId === deal.id && l.oldValue && l.oldValue.task === t.id)) continue;
    if (d.agentFees.some((f) => f.dealId === deal.id && f.side === side && f.kind === 'commission')) continue;
    const done = t.status === 'done'; const who = t.completedBy || t.savedBy || null; const at = t.completedAt || t.savedAt || new Date().toISOString();
    const paid = String((t.formData || {}).paid_by || '').trim().toLowerCase(); const payer = paid === 'seller' || paid === 'buyer' ? paid : defaultPayer(side);
    const old = { kind: 'commission', from: 'Commission information task', task: t.id, amountTyped: amountOf(t), paidBy: (t.formData || {}).paid_by || '' };
    const note = (reason) => d.agentFeeLog.push({ dealId: deal.id, side, kind: 'commission', slot: 0, oldValue: old, newValue: null, reason, source: 'system', byId: null, at: new Date().toISOString() });
    if (deal.transactionType === 'Refinance') { note('Commission information task not moved: a refinance has no agent fees.'); continue; }
    let fee;
    try { fee = readAgentFees({ commissionBasis: 'amount', commissionAmount: amountOf(t), commissionPayer: payer }, { side, price: deal.purchasePrice }).commission; }
    catch (e) { note(`Commission information task not moved: ${e.message} Enter it in Agent fees.`); continue; }
    if (!fee) continue;
    d.agentFees.push({ dealId: deal.id, side, kind: 'commission', slot: 0, basis: 'amount', percent: fee.percent, amount: fee.amount, payer, description: '', paidTo: '',
      source: 'agent', confirmedBy: done ? who : null, confirmedRole: done ? 'agent' : null, confirmedAt: done ? at : null, updatedBy: who, updatedAt: at });
    d.agentFeeLog.push({ dealId: deal.id, side, kind: 'commission', slot: 0, oldValue: null,
      newValue: { side, kind: 'commission', slot: 0, basis: 'amount', percent: fee.percent, amount: fee.amount, payer },
      reason: done ? "From the agent's Commission information task" : "From the agent's unfinished Commission information task (not confirmed)", source: 'agent', byId: who, at: new Date().toISOString() });
  }
  return d;
}

export function agentFeesPart(x) {
  const { load, save, nid, needUser, dealOr404, fileRoles, teamAgentIds, isStaffView, nameOf, now, fail, clone, notify } = x;
  const db = () => ensureAgentFees(load());
  const actorOf = (u, deal, side) => {
    if (runsOrders(u)) return 'staff';
    const roles = fileRoles(u.id, deal.id) || [];
    if ((side === 'buyer' && roles.includes('Buyer Agent')) || (side === 'listing' && roles.includes('Listing Agent'))) return 'agent';
    if (u.role === 'Transaction Coordinator') {
      if (deal.tcUserId === u.id) return 'tc';
      const mine = teamAgentIds(u); const want = side === 'buyer' ? 'Buyer Agent' : 'Listing Agent';
      const d = load(); const onSide = d.participants.filter((p) => p.dealId === deal.id && p.role === want && !p.removed)
        .map((p) => (d.contacts.find((c) => c.id === p.contactId) || {}).profileId).filter(Boolean);
      if (onSide.some((pid) => mine.has(pid))) return 'tc';
    }
    if (isStaffView(u) && u.role !== 'Transaction Coordinator') return 'reader';
    return null;
  };
  const view = (u, deal) => {
    const sides = {}; Object.keys(SIDE_LABEL).forEach((s) => { const a = actorOf(u, deal, s); if (a) sides[s] = a === 'reader' ? 'read' : 'edit'; });
    const rows = db().agentFees.filter((f) => f.dealId === deal.id && sides[f.side]).map((f) => ({ ...clone(f), confirmedByName: f.confirmedBy ? nameOf(f.confirmedBy) : '', canEdit: sides[f.side] === 'edit' }));
    return { sides, fees: groupAgentFees(rows) };
  };
  const jsonOf = (f) => { if (!f) return null; const o = { kind: f.kind, slot: f.slot, amount: f.amount, payer: f.payer };
    if (f.kind === 'commission') { o.basis = f.basis; o.percent = f.percent; if (f.base) o.base = f.base; if (f.additional) o.additional = f.additional; }
    if (f.payer === 'split') { o.splitBuyer = f.splitBuyer; o.splitSeller = f.splitSeller; }
    if (f.kind === 'other') { o.description = f.description; o.paidTo = f.paidTo; } return o; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // AF-5: keep the side's fee-ledger lines in step (one per fee; a removed fee's line is retired; a line changed by hand is left alone)
  const postLedger = (d, deal, side, u) => {
    if (!Array.isArray(d.accountingFees)) d.accountingFees = []; if (!Array.isArray(d.agentFeeLedger)) d.agentFeeLedger = [];
    if (deal.transactionType === 'Refinance') return;
    const role = side === 'buyer' ? 'Buyer Agent' : 'Listing Agent';
    const part = d.participants.find((p) => p.dealId === deal.id && p.role === role && !p.removed);
    const company = part ? ((d.contacts.find((c) => c.id === part.contactId) || {}).company || '') : '';
    const fees = d.agentFees.filter((f) => f.dealId === deal.id && f.side === side);
    const keys = new Set([...fees.map((f) => ledgerKey(side, f.kind, f.slot)), ...d.agentFeeLedger.filter((l) => l.dealId === deal.id && l.key.startsWith(`agent_fee:${side}:`)).map((l) => l.key)]);
    for (const key of keys) {
      const fee = fees.find((f) => ledgerKey(side, f.kind, f.slot) === key);
      const link = d.agentFeeLedger.find((l) => l.dealId === deal.id && l.key === key);
      const line = link ? d.accountingFees.find((x) => x.id === link.feeId) : null;
      if (line && ledgerShape(line) !== link.posted) continue;   // changed by hand on Accounting
      const at = now();
      if (!fee || !(Number(fee.amount) > 0)) { if (line && !line.retired) Object.assign(line, { retired: true, retiredAt: at, retiredBy: u.id, updatedAt: at, updatedBy: u.id }); if (line) link.posted = ledgerShape(line); continue; }
      const clean = cleanFee(agentFeeLedgerInput({ ...fee, side }, { company }), deal);
      let rec = line;
      if (rec) Object.assign(rec, clean, { retired: false, retiredAt: null, retiredBy: null, updatedAt: at, updatedBy: u.id });
      else { rec = { id: nid('fee'), dealId: deal.id, ...clean, retired: false, retiredAt: null, retiredBy: null, createdAt: at, createdBy: u.id, updatedAt: at, updatedBy: u.id }; d.accountingFees.push(rec); }
      if (link) Object.assign(link, { feeId: rec.id, posted: ledgerShape(rec) }); else d.agentFeeLedger.push({ dealId: deal.id, key, feeId: rec.id, posted: ledgerShape(rec) });
    }
  };
  return {
    async getAgentFees(dealId) { const u = needUser(); return view(u, dealOr404(u, dealId)); },
    async getAgentFeeHistory(dealId) {
      const u = needUser(); const deal = dealOr404(u, dealId); const { sides } = view(u, deal);
      return db().agentFeeLog.filter((l) => l.dealId === dealId && sides[l.side]).slice().reverse().map((l) => ({ ...clone(l), byName: l.byId ? nameOf(l.byId) : '' }));
    },
    async saveAgentFees(dealId, side, fees, reason = '') {
      const u = needUser(); const deal = dealOr404(u, dealId); const actor = actorOf(u, deal, side);
      if (!actor || actor === 'reader') fail("You can't change agent fees on this file.");
      if (deal.transactionType === 'Refinance') fail('A refinance has no agent fees.');
      // check again with the shared rules (the database does the same)
      const c0 = fees.commission || {};
      const back = { commissionBasis: c0.basis || '', commissionPercent: c0.percent == null ? '' : c0.percent, commissionAmount: c0.amount == null ? '' : c0.amount,
        commissionPayer: c0.payer || '', commissionBase: c0.base == null ? '' : c0.base, additionalAmount: c0.additional == null ? '' : c0.additional,
        splitBuyer: c0.splitBuyer == null ? '' : c0.splitBuyer, splitSeller: c0.splitSeller == null ? '' : c0.splitSeller,
        adminAmount: fees.admin ? fees.admin.amount : '', adminPayer: fees.admin ? fees.admin.payer : '', other: fees.other || [] };
      const clean = readAgentFees(back, { side, price: deal.purchasePrice });
      const want = [];
      if (clean.commission) want.push({ kind: 'commission', slot: 0, ...clean.commission });
      if (clean.admin) want.push({ kind: 'admin', slot: 0, ...clean.admin });
      clean.other.forEach((o, i) => want.push({ kind: 'other', slot: i + 1, ...o, payer: o.payer || defaultPayer(side) }));
      const d = db(); const mine = d.agentFees.filter((f) => f.dealId === dealId && f.side === side);
      const why = String(reason || '').trim();
      const key = (f) => `${f.kind}:${f.slot}`; const wantBy = new Map(want.map((w) => [key(w), w]));
      if (actor === 'staff' && mine.some((f) => f.confirmedAt && !same(jsonOf(f), jsonOf(wantBy.get(key(f)) || null))) && why.length < 3) fail('The agent confirmed these fees. Enter a reason for the change.');
      const confirm = actor === 'agent' || actor === 'tc'; const at = now();
      const logIt = (kind, slot, oldValue, newValue, r) => d.agentFeeLog.push({ dealId, side, kind, slot, oldValue, newValue, reason: r || '', source: actor, byId: u.id, at });
      mine.filter((f) => !wantBy.has(key(f))).forEach((f) => { logIt(f.kind, f.slot, jsonOf(f), null, why); d.agentFees.splice(d.agentFees.indexOf(f), 1); });
      for (const w of want) {
        const cur = mine.find((f) => key(f) === key(w)); const fresh = confirm && (!cur || !cur.confirmedAt || cur.source !== actor || cur.confirmedBy !== u.id);
        const changed = !cur || !same(jsonOf(cur), jsonOf(w));
        if (!changed && !fresh) continue;
        const rec = cur || { dealId, side, kind: w.kind, slot: w.slot };
        if (!cur) d.agentFees.push(rec);
        const before = jsonOf(cur);
        Object.assign(rec, { basis: w.basis || null, percent: w.percent == null ? null : w.percent, amount: w.amount, payer: w.payer, description: w.description || '', paidTo: w.paidTo || '',
          base: w.base || null, additional: w.additional || 0, splitBuyer: w.payer === 'split' ? w.splitBuyer : null, splitSeller: w.payer === 'split' ? w.splitSeller : null, source: actor, updatedAt: at, updatedBy: u.id });
        if (confirm) Object.assign(rec, { confirmedBy: u.id, confirmedRole: actor, confirmedAt: at });
        logIt(w.kind, w.slot, before, jsonOf(rec), changed ? why : (why || 'Confirmed'));
      }
      // AF-3: an agent or TC change tells the file's processor, pre-processor and TC (and, for a TC, the agent) in the portal
      const mineNow = d.agentFeeLog.filter((l) => l.dealId === dealId && l.side === side && l.at === at && l.byId === u.id);
      if (confirm && mineNow.length && notify) {
        const agents = d.participants.filter((p) => p.dealId === dealId && p.role === (side === 'buyer' ? 'Buyer Agent' : 'Listing Agent') && !p.removed)
          .map((p) => (d.contacts.find((c) => c.id === p.contactId) || {}).profileId).filter(Boolean);
        const ids = [deal.processorId, deal.preprocessorUserId, deal.tcUserId, ...(actor === 'tc' ? agents : [])].filter(Boolean);
        const changed = mineNow.filter((l) => !same(l.oldValue, l.newValue)).length;
        const sideWord = side === 'buyer' ? "buyer's agent" : 'listing agent';
        notify(ids, { kind: 'agent_fee', dealId, title: `${nameOf(u.id)}${actor === 'tc' ? ' (TC)' : ''} ${changed ? 'changed' : 'confirmed'} the ${sideWord} fees on ${deal.fileNumber || 'a file'}`, link: `#/deals/${dealId}` }, u.id);
      }
      // AF-4: staff changing confirmed fees tells the agent only (who, and the reason). No re-approval.
      if (actor === 'staff' && mineNow.length && notify && (why || d.agentFees.some((f) => f.dealId === dealId && f.side === side && f.confirmedAt))) {
        const agents = d.participants.filter((p) => p.dealId === dealId && p.role === (side === 'buyer' ? 'Buyer Agent' : 'Listing Agent') && !p.removed)
          .map((p) => (d.contacts.find((c) => c.id === p.contactId) || {}).profileId).filter(Boolean);
        notify(agents, { kind: 'agent_fee', dealId, title: `${nameOf(u.id)} (CLA Title) changed your fees on ${deal.fileNumber || 'a file'}${why ? `. Reason: ${why}` : ''}`, link: `#/deals/${dealId}` }, u.id);
      }
      postLedger(d, deal, side, u);
      save();
      return view(u, deal);
    },
  };
}
