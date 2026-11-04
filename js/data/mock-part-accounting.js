/* mock adapter: ACCOUNTING (John, Nov 3; storage v26; mirrored by migration 34 + supabase-accounting.js). FAKE DATA ONLY; nothing is sent.
 * One fee ledger per order (d.accountingFees) feeding the ALTA Settlement Statement and the Closing Disclosure fee view (accounting.js).
 * Access: the `accounting` feature flag must be on (else every method refuses). Processor / Admin / Super admin edit (any order they run);
 * Sales Person / Sales Team read the orders they can see; Transaction Coordinators, agents and clients get nothing.
 * Every add / edit / retire / restore is logged in d.accountingLog (who, when, field, old, new). Fees are RETIRED, never deleted. */
import { ACCOUNTING_OFF, ACCOUNTING_STAFF_ONLY, ACCOUNTING_READ_ONLY, TEST_MARK, acctCanRead, acctCanEdit, cleanFee, feeChanges, allEntries, ledgerTotals,
  altaStatement, closingDisclosure, presetsFor, presetAmount, presetFee } from './accounting.js?v=202611031946';

export function ensureAccounting(d) { if (!Array.isArray(d.accountingFees)) d.accountingFees = []; if (!Array.isArray(d.accountingLog)) d.accountingLog = []; return d; }

export function accountingPart(x, flags) {
  const { load, save, nid, needUser, dealsFor, fail, now, nameOf, clone } = x;
  const on = () => { if (!flags.accounting) fail(ACCOUNTING_OFF); };
  const db = () => ensureAccounting(load());
  const reader = (dealId) => { on(); const u = needUser(); if (!acctCanRead(u)) fail(ACCOUNTING_STAFF_ONLY);
    const deal = dealsFor(u).find((q) => q.id === dealId) || fail('Order not found.'); return { u, deal }; };
  const editor = (dealId) => { const r = reader(dealId); if (!acctCanEdit(r.u)) fail(ACCOUNTING_READ_ONLY); return r; };
  const feeOf = (id) => db().accountingFees.find((f) => f.id === id) || fail('Fee not found.');
  const feesOf = (dealId) => db().accountingFees.filter((f) => f.dealId === dealId);
  const logIt = (u, f, action, changes) => db().accountingLog.push({ id: nid('alog'), dealId: f.dealId, feeId: f.id, description: f.description, action, at: now(), byId: u.id, byName: nameOf(u.id), changes });
  const out = (f) => clone(f);
  return {
    async getAccounting(dealId, { includeRetired = false } = {}) {
      const { u, deal } = reader(dealId); const fees = feesOf(dealId);
      return { dealId, fileNumber: deal.fileNumber, state: deal.state, transactionType: deal.transactionType || 'Purchase', refi: deal.transactionType === 'Refinance',
        purchasePrice: deal.purchasePrice ?? null, loanAmount: deal.loanAmount ?? null, emdAmount: deal.emdAmount ?? null, canEdit: acctCanEdit(u), mark: TEST_MARK,
        entries: clone(allEntries(deal, fees, { includeRetired })), retiredCount: fees.filter((f) => f.retired).length, totals: ledgerTotals(deal, fees) };
    },
    async listAccountingPresets(dealId) { const { deal } = reader(dealId);
      return presetsFor(deal.state).map((p) => ({ ...p, exampleAmount: presetAmount(p, deal), fee: presetFee(p.key, deal) })); },
    async addAccountingFee(dealId, input) {
      const { u, deal } = editor(dealId); const clean = cleanFee(input, deal);
      const f = { id: nid('fee'), dealId, ...clean, retired: false, retiredAt: null, retiredBy: null, createdAt: now(), createdBy: u.id, updatedAt: now(), updatedBy: u.id };
      db().accountingFees.push(f); logIt(u, f, 'added', feeChanges(null, f)); save(); return out(f);
    },
    async addAccountingPreset(dealId, key, overrides = {}) { const { deal } = editor(dealId); return this.addAccountingFee(dealId, { ...presetFee(key, deal), ...overrides }); },
    async updateAccountingFee(id, patch) {
      on(); const f = feeOf(id); const { u, deal } = editor(f.dealId); if (f.retired) fail('This fee is retired. Restore it before editing.');
      if (patch && (patch.dealId && patch.dealId !== f.dealId)) fail('A fee cannot move to another order.');
      const clean = cleanFee(patch, deal, f); const changes = feeChanges(f, clean); if (!changes.length) return out(f);
      Object.assign(f, clean, { updatedAt: now(), updatedBy: u.id }); logIt(u, f, 'edited', changes); save(); return out(f);
    },
    async retireAccountingFee(id, retired = true) {
      on(); const f = feeOf(id); const { u } = editor(f.dealId); const on2 = !!retired; if (f.retired === on2) return out(f);
      f.retired = on2; f.retiredAt = on2 ? now() : null; f.retiredBy = on2 ? u.id : null; f.updatedAt = now(); f.updatedBy = u.id;
      logIt(u, f, on2 ? 'retired' : 'restored', [{ field: 'retired', old: !on2, new: on2 }]); save(); return out(f);
    },
    async listAccountingLog(dealId) { reader(dealId); return clone(db().accountingLog.filter((l) => l.dealId === dealId)).reverse(); },
    async getAltaStatement(dealId, view = 'combined') { const { deal } = reader(dealId); return altaStatement(deal, feesOf(dealId), view); },
    async getClosingDisclosure(dealId) { const { deal } = reader(dealId); return closingDisclosure(deal, feesOf(dealId)); },
  };
}
