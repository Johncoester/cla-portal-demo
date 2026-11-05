/* mock adapter: ACCOUNTING (John, Nov 3; storage v26; mirrored by migration 34 + supabase-accounting.js). FAKE DATA ONLY; nothing is sent.
 * One fee ledger per order (d.accountingFees) feeding the ALTA Settlement Statement and the Closing Disclosure fee view (accounting.js).
 * Access: the `accounting` feature flag must be on (else every method refuses). Processor / Admin / Super admin edit (any order they run);
 * Sales Person / Sales Team read the orders they can see; Transaction Coordinators, agents and clients get nothing.
 * Every add / edit / retire / restore is logged in d.accountingLog (who, when, field, old, new). Fees are RETIRED, never deleted. */
import { ACCOUNTING_OFF, ACCOUNTING_STAFF_ONLY, ACCOUNTING_READ_ONLY, TEST_MARK, acctCanRead, acctCanEdit, cleanFee, feeChanges, allEntries, ledgerTotals,
  altaStatement, closingDisclosure, presetsFor, presetAmount, presetFee, CALC_SOURCE_ID, isCalculated, withCalcFlags, liveProration } from './accounting.js?v=202611052122';
// Caroline Kim, Nov 4 2026: prorations from the settlement date, the rest of the CD (details, prepaids F, initial escrow G), TCs read-only.
import { cleanCdDetails, cdDetailChanges, prepaidEscrowLines, cdcalcFeeInput, diffCdcalc, cdPages, CDCALC_VIA } from './cd-pages.js?v=202611052122';
const PRORATION_VIA = 'Settlement date change (prorations re-saved)';
// CLA RATES (John, Nov 3): the fee engine (+ the vendored calculator code and rate tables) is loaded only when a CLA-rate method is called,
// so with the flag off it is never loaded at all.
const engine = () => import('./fee-engine.js?v=202611052122');
const VIA = 'CLA rates';

// accountingCd (Caroline, Nov 4): one record of manual Closing Disclosure entries per order; added lazily, so the storage key stays v26
export function ensureAccounting(d) { if (!Array.isArray(d.accountingFees)) d.accountingFees = []; if (!Array.isArray(d.accountingLog)) d.accountingLog = []; if (!Array.isArray(d.accountingCd)) d.accountingCd = []; return d; }

export function accountingPart(x, flags) {
  const { load, save, nid, needUser, dealsFor, fail, now, nameOf, clone } = x;
  const on = () => { if (!flags.accounting) fail(ACCOUNTING_OFF); };
  const db = () => ensureAccounting(load());
  const reader = (dealId) => { on(); const u = needUser(); if (!acctCanRead(u)) fail(ACCOUNTING_STAFF_ONLY);
    const deal = dealsFor(u).find((q) => q.id === dealId) || fail('Order not found.'); return { u, deal }; };
  const editor = (dealId) => { const r = reader(dealId); if (!acctCanEdit(r.u)) fail(ACCOUNTING_READ_ONLY); return r; };
  const feeOf = (id) => db().accountingFees.find((f) => f.id === id) || fail('Fee not found.');
  const feesOf = (dealId) => db().accountingFees.filter((f) => f.dealId === dealId);
  const logIt = (u, f, action, changes, via) => db().accountingLog.push({ id: nid('alog'), dealId: f.dealId, feeId: f.id, description: f.description, action, at: now(), byId: u.id, byName: nameOf(u.id), changes, ...(via ? { via } : {}) });
  const out = (f) => clone(withCalcFlags(f));
  const activeCalc = (dealId, key) => feesOf(dealId).find((f) => !f.retired && isCalculated(f) && f.calc.key === key);
  // a calculated line -> a stored fee (tagged 'From CLA rates'); overrides = fields a person changed before saving (=> overridden)
  const addCalculated = (E, u, deal, line, P, overrides = {}, at = now()) => {
    if (activeCalc(deal.id, line.key)) fail(`"${line.description}" is already on the ledger from CLA rates. Use "Calculate fees from CLA rates" to update it.`);
    const clean = cleanFee({ ...E.feeInput(line), ...overrides }, deal);
    const f = { id: nid('fee'), dealId: deal.id, ...clean, source: CALC_SOURCE_ID, calc: E.calcBlock(line, P, at), retired: false, retiredAt: null, retiredBy: null, createdAt: at, createdBy: u.id, updatedAt: at, updatedBy: u.id };
    db().accountingFees.push(f); logIt(u, f, 'added', feeChanges(null, f), VIA); return f; };
  const retire = (u, f, via) => { f.retired = true; f.retiredAt = now(); f.retiredBy = u.id; f.updatedAt = now(); f.updatedBy = u.id; logIt(u, f, 'retired', [{ field: 'retired', old: false, new: true }], via); };
  return {
    async getAccounting(dealId, { includeRetired = false } = {}) {
      const { u, deal } = reader(dealId); const fees = feesOf(dealId);
      return { dealId, fileNumber: deal.fileNumber, state: deal.state, transactionType: deal.transactionType || 'Purchase', refi: deal.transactionType === 'Refinance',
        purchasePrice: deal.purchasePrice ?? null, loanAmount: deal.loanAmount ?? null, emdAmount: deal.emdAmount ?? null, closingDate: deal.closingDate || null, canEdit: acctCanEdit(u), mark: TEST_MARK,
        entries: clone(allEntries(deal, fees, { includeRetired }).map(withCalcFlags)), retiredCount: fees.filter((f) => f.retired).length, totals: ledgerTotals(deal, fees) };
    },
    // EXAMPLE presets are REPLACED by this order's CLA-rate lines wherever the calculator has them; the rest stay marked EXAMPLE
    async listAccountingPresets(dealId) { const { deal } = reader(dealId); const E = await engine(); const ch = E.presetChoices(deal, E.lastOptions(feesOf(dealId), deal));
      return [...ch.calculated, ...presetsFor(deal.state).filter((p) => !ch.replaced.includes(p.key)).map((p) => ({ ...p, exampleAmount: presetAmount(p, deal), fee: presetFee(p.key, deal) }))]; },
    async addAccountingFee(dealId, input) {
      const { u, deal } = editor(dealId);
      if (input && /^cla:/.test(String(input.presetKey || ''))) {   // started from a CLA-rate preset: stored as a calculated line (overridden if changed before saving)
        const E = await engine(); const P = E.proposeFees(deal, E.lastOptions(feesOf(dealId), deal)); const line = P.lines.find((l) => 'cla:' + l.key === input.presetKey) || fail('That CLA rate does not apply to this order any more. Pick the preset again.');
        const f = addCalculated(E, u, deal, line, P, { ...input, presetKey: 'cla:' + line.key }); save(); return out(f); }
      const clean = cleanFee(input, deal);
      const f = { id: nid('fee'), dealId, ...clean, retired: false, retiredAt: null, retiredBy: null, createdAt: now(), createdBy: u.id, updatedAt: now(), updatedBy: u.id };
      db().accountingFees.push(f); logIt(u, f, 'added', feeChanges(null, f)); save(); return out(f);
    },
    // key 'cla:<line>' = one CLA-rate line. An EXAMPLE key the calculator covers adds the CLA-rate line(s) instead (e.g. the settlement fee: buyer
    // and seller lines; the first is returned). EXAMPLE keys it does not cover, or an order it cannot calculate yet, add the EXAMPLE amount.
    async addAccountingPreset(dealId, key, overrides = {}) { const { u, deal } = editor(dealId); const E = await engine(); const fees = feesOf(dealId);
      let P = null; try { P = E.proposeFees(deal, E.lastOptions(fees, deal)); } catch (e) { if (/^cla:/.test(key)) throw e; }
      const lines = !P ? [] : /^cla:/.test(key) ? P.lines.filter((l) => 'cla:' + l.key === key) : P.lines.filter((l) => l.replacesPresets.includes(key) && !activeCalc(dealId, l.key));
      if (/^cla:/.test(key) && !lines.length) fail('That CLA rate does not apply to this order.');
      if (!lines.length) return this.addAccountingFee(dealId, { ...presetFee(key, deal), ...overrides });
      const added = lines.map((l, k) => addCalculated(E, u, deal, l, P, k === 0 ? overrides : {})); save(); return { ...out(added[0]), alsoAdded: added.slice(1).map((f) => f.id) }; },
    // ---------- CLA RATES: setup, preview diff, apply (Processor / Admin / Super admin) ----------
    async getCalculatorSetup(dealId) { const { deal } = editor(dealId); const E = await engine(); return clone(E.calcSetup(deal, feesOf(dealId))); },
    async previewCalculatedFees(dealId, options) { const { deal } = editor(dealId); const E = await engine(); const opts = E.cleanOptions(options || E.lastOptions(feesOf(dealId), deal));
      const P = E.proposeFees(deal, opts); return clone(E.previewView(P, E.diffProposal(P, feesOf(dealId)), opts)); },
    async applyCalculatedFees(dealId, options, { token = null, retireExamples = true } = {}) {
      const { u, deal } = editor(dealId); const E = await engine(); const opts = E.cleanOptions(options || E.lastOptions(feesOf(dealId), deal));
      const P = E.proposeFees(deal, opts); const D = E.diffProposal(P, feesOf(dealId));
      if (token && token !== D.token) fail('The fee ledger or the order changed since the preview. Preview again before applying.');
      const at = now(); const r = { added: 0, updated: 0, retired: 0, examplesRetired: 0, kept: D.counts.overridden, unchanged: D.counts.unchanged, skipped: D.counts.retired };
      for (const row of D.rows) {
        if (row.status === 'new') { addCalculated(E, u, deal, row.proposed, P, {}, at); r.added++; }
        else if (row.status === 'changed') { const f = feeOf(row.current.id); const clean = cleanFee(E.feeInput(row.proposed), deal, f); const next = E.calcBlock(row.proposed, P, at);
          const changes = feeChanges(f, clean); if (f.calc.calculation !== next.calculation) changes.push({ field: 'calculation', old: f.calc.calculation, new: next.calculation });
          Object.assign(f, clean, { calc: next, updatedAt: at, updatedBy: u.id }); logIt(u, f, 'edited', changes, VIA); r.updated++; }
        else if (row.status === 'retire') { retire(u, feeOf(row.current.id), VIA + ' (no longer calculated for this order)'); r.retired++; }
      }
      if (retireExamples) for (const x of D.examples) { const f = feeOf(x.id); if (!f.retired) { retire(u, f, VIA + ' (EXAMPLE fee replaced)'); r.examplesRetired++; } }
      save(); return r; },
    async updateAccountingFee(id, patch) {
      on(); const f = feeOf(id); const { u, deal } = editor(f.dealId); if (f.retired) fail('This fee is retired. Restore it before editing.');
      if (patch && (patch.dealId && patch.dealId !== f.dealId)) fail('A fee cannot move to another order.');
      const clean = cleanFee(patch, deal, f); const changes = feeChanges(f, clean); if (!changes.length) return out(f);   // a calculated fee keeps its tag + calc block; a changed amount etc. makes it overridden
      Object.assign(f, clean, { updatedAt: now(), updatedBy: u.id }); logIt(u, f, 'edited', changes); save(); return out(f);
    },
    async retireAccountingFee(id, retired = true) {
      on(); const f = feeOf(id); const { u } = editor(f.dealId); const on2 = !!retired; if (f.retired === on2) return out(f);
      if (!on2 && isCalculated(f) && activeCalc(f.dealId, f.calc.key)) fail('A newer CLA-rate line for this fee is already on the ledger. Retire it first.');
      f.retired = on2; f.retiredAt = on2 ? now() : null; f.retiredBy = on2 ? u.id : null; f.updatedAt = now(); f.updatedBy = u.id;
      logIt(u, f, on2 ? 'retired' : 'restored', [{ field: 'retired', old: !on2, new: on2 }]); save(); return out(f);
    },
    // ---------- PRORATIONS (Caroline, Nov 4): re-save every proration whose amount moved with the settlement date (logged) ----------
    async refreshAccountingProrations(dealId) { const { u, deal } = editor(dealId); let updated = 0; const at = now();
      for (const f of feesOf(dealId).filter((x) => !x.retired && x.proration)) { const live = liveProration(f, deal); if (!live.prorationStale || live.prorationError) continue;
        const clean = cleanFee({ proration: f.proration, description: f.description }, deal, f); const changes = feeChanges(f, clean); if (!changes.length) continue;
        Object.assign(f, clean, { updatedAt: at, updatedBy: u.id }); logIt(u, f, 'edited', changes, PRORATION_VIA); updated++; }
      if (updated) save(); return { updated }; },
    // ---------- CLOSING DISCLOSURE details + prepaids / escrow (Caroline, Nov 4) ----------
    async getAccountingCd(dealId) { const { u, deal } = reader(dealId); const rec = db().accountingCd.find((x) => x.dealId === dealId); const details = rec ? rec.data : {};
      const cd = closingDisclosure(deal, feesOf(dealId)); let calc = { lines: [], warnings: [], escrow: null }; try { calc = prepaidEscrowLines(deal, details); } catch (e) { calc.warnings = [e.message]; }
      return clone({ dealId, canEdit: acctCanEdit(u), details, updatedAt: rec ? rec.updatedAt : null, updatedByName: rec ? nameOf(rec.updatedBy) : '', cd, pages: cdPages(deal, cd, details, calc.escrow), escrow: calc.escrow, calcWarnings: calc.warnings, mark: TEST_MARK,
        deal: { closingDate: deal.closingDate || null, loanAmount: deal.loanAmount ?? null, purchasePrice: deal.purchasePrice ?? null, lenderName: deal.lenderName || '', street: deal.street, city: deal.city, state: deal.state, zip: deal.zip } }); },
    async saveAccountingCd(dealId, input) { const { u } = editor(dealId); const list = db().accountingCd; let rec = list.find((x) => x.dealId === dealId);
      const next = cleanCdDetails(input || {}); const changes = cdDetailChanges(rec ? rec.data : {}, next); if (!changes.length) return { changed: 0 };
      const first = !rec; if (!rec) { rec = { id: nid('acd'), dealId, data: {}, createdAt: now(), createdBy: u.id }; list.push(rec); }
      rec.data = next; rec.updatedAt = now(); rec.updatedBy = u.id;
      db().accountingLog.push({ id: nid('alog'), dealId, feeId: rec.id, description: 'Closing Disclosure details', action: first ? 'added' : 'edited', at: now(), byId: u.id, byName: nameOf(u.id), changes, cd: true });
      save(); return { changed: changes.length }; },
    async previewAccountingPrepaids(dealId) { const { deal } = editor(dealId); const rec = db().accountingCd.find((x) => x.dealId === dealId); const P = prepaidEscrowLines(deal, rec ? rec.data : {});
      return clone({ ...P, ...diffCdcalc(P.lines, feesOf(dealId)) }); },
    async applyAccountingPrepaids(dealId, { retireExamples = true } = {}) { const { u, deal } = editor(dealId); const rec = db().accountingCd.find((x) => x.dealId === dealId); const P = prepaidEscrowLines(deal, rec ? rec.data : {});
      const D = diffCdcalc(P.lines, feesOf(dealId)); const at = now(); const r = { added: 0, updated: 0, retired: 0, examplesRetired: 0 };
      for (const row of D.rows) {
        if (row.status === 'new') { const clean = cleanFee(cdcalcFeeInput(row.proposed), deal); const f = { id: nid('fee'), dealId, ...clean, retired: false, retiredAt: null, retiredBy: null, createdAt: at, createdBy: u.id, updatedAt: at, updatedBy: u.id };
          db().accountingFees.push(f); logIt(u, f, 'added', feeChanges(null, f), CDCALC_VIA); r.added++; }
        else if (row.status === 'changed') { const f = feeOf(row.current.id); const clean = cleanFee(cdcalcFeeInput(row.proposed), deal, f); const changes = feeChanges(f, clean); Object.assign(f, clean, { updatedAt: at, updatedBy: u.id }); logIt(u, f, 'edited', changes, CDCALC_VIA); r.updated++; }
        else if (row.status === 'retire') { retire(u, feeOf(row.current.id), CDCALC_VIA + ' (no longer calculated)'); r.retired++; } }
      if (retireExamples) for (const x of D.examples) { const f = feeOf(x.id); if (!f.retired) { retire(u, f, CDCALC_VIA + ' (EXAMPLE fee replaced)'); r.examplesRetired++; } }
      save(); return r; },
    async listAccountingLog(dealId) { reader(dealId); return clone(db().accountingLog.filter((l) => l.dealId === dealId)).reverse(); },
    async getAltaStatement(dealId, view = 'combined') { const { deal } = reader(dealId); return altaStatement(deal, feesOf(dealId), view); },
    async getClosingDisclosure(dealId) { const { deal } = reader(dealId); return closingDisclosure(deal, feesOf(dealId)); },
  };
}
