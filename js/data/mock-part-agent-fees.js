/* mock adapter: AGENT FEES (AF-2; John, Nov 12 2026). The same rules as the database functions in migrations 20261117100000 / 20261118010000:
 * staff who run the file see and change both sides; an agent sees and changes only their own side; a TC changes the side of an agent on
 * their team (or both sides when they are the file's TC); other CLA staff on the file read both sides; buyers and sellers see nothing.
 * An agent or TC saving confirms the side. Staff need a reason to change a confirmed fee (no re-approval). Every change is logged. FAKE DATA. */
import { runsOrders } from './constants.js?v=202611101015';
import { readAgentFees, groupAgentFees, SIDE_LABEL, defaultPayer } from './agent-fees.js?v=202611182110';

export function ensureAgentFees(d) { for (const k of ['agentFees', 'agentFeeLog']) if (!Array.isArray(d[k])) d[k] = []; return d; }

export function agentFeesPart(x) {
  const { load, save, needUser, dealOr404, fileRoles, teamAgentIds, isStaffView, nameOf, now, fail, clone, notify } = x;
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
    if (f.kind === 'commission') { o.basis = f.basis; o.percent = f.percent; } if (f.kind === 'other') { o.description = f.description; o.paidTo = f.paidTo; } return o; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
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
      const back = { commissionBasis: fees.commission ? fees.commission.basis : '', commissionPercent: fees.commission ? fees.commission.percent : '', commissionAmount: fees.commission ? fees.commission.amount : '',
        commissionPayer: fees.commission ? fees.commission.payer : '', adminAmount: fees.admin ? fees.admin.amount : '', adminPayer: fees.admin ? fees.admin.payer : '', other: fees.other || [] };
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
        Object.assign(rec, { basis: w.basis || null, percent: w.percent == null ? null : w.percent, amount: w.amount, payer: w.payer, description: w.description || '', paidTo: w.paidTo || '', source: actor, updatedAt: at, updatedBy: u.id });
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
      save();
      return view(u, deal);
    },
  };
}
