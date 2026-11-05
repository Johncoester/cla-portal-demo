/* [SUPABASE] ACCOUNTING (John, Nov 3; migration 34). Same names / shapes as mock-part-accounting.js. NOT run against a hosted project (best
 * effort; the mock adapter is the tested one). Two switches: the browser flag (features.accounting, off unless the config says true) and the
 * database switch (private.features 'accounting', off by default; RLS refuses everything while it is off). RLS + triggers enforce the rules
 * (staff only, Sales read-only, no deletes, refinance has no seller side, every change logged in accounting_fee_log). Nothing is sent. */
// Caroline, Nov 4 (migration 39): prorations, CD details (accounting_cd_details + accounting_cd_log), prepaids / escrow lines, TCs read-only.
import { cleanCdDetails, prepaidEscrowLines, cdcalcFeeInput, diffCdcalc, cdPages, CDCALC_VIA, cdFieldLabel } from './cd-pages.js?v=202611041935';
import { ACCOUNTING_OFF, ACCOUNTING_STAFF_ONLY, ACCOUNTING_READ_ONLY, TEST_MARK, cleanFee, allEntries, ledgerTotals, altaStatement, closingDisclosure, presetsFor, presetAmount, presetFee, CALC_SOURCE_ID, isCalculated, withCalcFlags, liveProration, feeChanges } from './accounting.js?v=202611041935';
// CLA RATES (migration 36): calculated fees carry calc_source = 'cla-rates' + calc_key / calc_fields / rate_source / calculation / calc_inputs /
// calc_version / calc_at; the trigger keeps `overridden` (a person changed what the calculation set). The engine loads lazily (flag off = never).
const engine = () => import('./fee-engine.js?v=202611041935');
const calcRow = (f) => (f.calc ? { calc_source: CALC_SOURCE_ID, calc_key: f.calc.key, calc_fields: f.calc.fields, rate_source: f.calc.rateSource, calculation: f.calc.calculation, calc_inputs: f.calc.inputs, calc_version: f.calc.version, calc_at: f.calc.at } : {});

const toRow = (f) => ({ kind: f.kind, description: f.description, alta_section: f.altaSection, cd_section: f.cdSection, cd_line: f.cdLine, payee: f.payee, amount: f.amount, note: f.note, preset_key: f.presetKey,
  paid_by: f.paidBy, split_buyer: f.split ? f.split.buyer : 0, split_seller: f.split ? f.split.seller : 0, split_lender: f.split ? f.split.lender : 0, split_other: f.split ? f.split.other : 0,
  timing: f.timing, poc: f.poc, title_prefix: f.titlePrefix, credit_from: f.from, credit_to: f.to,
  // migration 39 (Caroline, Nov 4): aggregate adjustment, lender credit, calculated proration
  reduces: !!f.reduces, lender_credit: !!f.lenderCredit, proration: f.proration || null, charge_meta: f.meta || null });   // charge_meta: Qualia line settings + payments (migration 40)
const fromRow = (r) => ({ id: r.id, dealId: r.deal_id, kind: r.kind, description: r.description, altaSection: r.alta_section, cdSection: r.cd_section, cdLine: r.cd_line, payee: r.payee, amount: Number(r.amount), note: r.note, presetKey: r.preset_key,
  paidBy: r.paid_by, split: r.kind === 'charge' ? { buyer: Number(r.split_buyer), seller: Number(r.split_seller), lender: Number(r.split_lender), other: Number(r.split_other) } : null,
  timing: r.timing, poc: r.poc, titlePrefix: r.title_prefix, from: r.credit_from, to: r.credit_to, retired: !!r.retired_at, retiredAt: r.retired_at, retiredBy: r.retired_by,
  createdAt: r.created_at, createdBy: r.created_by, updatedAt: r.updated_at, updatedBy: r.updated_by,
  ...(r.reduces ? { reduces: true } : {}), ...(r.lender_credit ? { lenderCredit: true } : {}), ...(r.proration ? { proration: r.proration } : {}), ...(r.charge_meta ? { meta: r.charge_meta } : {}),
  ...(r.calc_source ? { source: r.calc_source, calc: { key: r.calc_key, fields: r.calc_fields, rateSource: r.rate_source, calculation: r.calculation, inputs: r.calc_inputs, version: r.calc_version, at: r.calc_at } } : {}) });
const dealOf = (d) => ({ id: d.id, fileNumber: d.file_number, state: d.state, county: d.county || '', primaryResidence: d.primary_residence || '', firstTimeBuyer: d.first_time_buyer || '', transactionType: d.transaction_type, purchasePrice: d.purchase_price == null ? null : Number(d.purchase_price), loanAmount: d.loan_amount == null ? null : Number(d.loan_amount), emdAmount: d.emd_amount == null ? null : Number(d.emd_amount),
  closingDate: d.closing_date || null, lenderName: d.lender_name || '', street: d.street || '', city: d.city || '', zip: d.zip || '' });

export function accountingSupabase({ sb, ok, flags }) {
  const on = () => { if (!flags.accounting) throw new Error(ACCOUNTING_OFF); };
  const deal = async (id) => { const d = ok(await sb.from('deals').select('id,file_number,state,county,transaction_type,purchase_price,loan_amount,emd_amount,primary_residence,first_time_buyer,closing_date,lender_name,street,city,zip').eq('id', id).maybeSingle()); if (!d) throw new Error('Order not found.'); return dealOf(d); };
  const access = async (id) => { const a = ok(await sb.rpc('accounting_access', { p_deal: id })); if (a === 'off') throw new Error(ACCOUNTING_OFF); if (a === 'none') throw new Error(ACCOUNTING_STAFF_ONLY); return a; };
  const fees = async (id) => (ok(await sb.from('accounting_fees').select('*').eq('deal_id', id).order('created_at')) || []).map(fromRow);
  const editor = async (id) => { const a = await access(id); if (a !== 'edit') throw new Error(ACCOUNTING_READ_ONLY); return a; };
  const insertCalc = async (E, d, all, line, P, overrides = {}, at = new Date().toISOString()) => {
    if (all.some((f) => !f.retired && isCalculated(f) && f.calc.key === line.key)) throw new Error(`"${line.description}" is already on the ledger from CLA rates. Use "Calculate fees from CLA rates" to update it.`);
    const clean = cleanFee({ ...E.feeInput(line), ...overrides, presetKey: 'cla:' + line.key }, d);
    return withCalcFlags(fromRow(ok(await sb.from('accounting_fees').insert({ deal_id: d.id, ...toRow(clean), ...calcRow({ calc: E.calcBlock(line, P, at) }) }).select('*').single()))); };
  const feeRow = async (id) => { const r = ok(await sb.from('accounting_fees').select('*').eq('id', id).maybeSingle()); if (!r) throw new Error('Fee not found.'); return fromRow(r); };
  return {
    async getAccounting(dealId, { includeRetired = false } = {}) { on(); const a = await access(dealId); const d = await deal(dealId); const all = await fees(dealId); const live = all.filter((f) => !f.retired);
      return { dealId, fileNumber: d.fileNumber, state: d.state, transactionType: d.transactionType, refi: d.transactionType === 'Refinance', purchasePrice: d.purchasePrice, loanAmount: d.loanAmount, emdAmount: d.emdAmount,
        canEdit: a === 'edit', mark: TEST_MARK, entries: allEntries(d, all, { includeRetired }).map(withCalcFlags), retiredCount: all.length - live.length, totals: ledgerTotals(d, live) }; },
    async listAccountingPresets(dealId) { on(); await access(dealId); const d = await deal(dealId); const E = await engine(); const ch = E.presetChoices(d, E.lastOptions(await fees(dealId), d));
      return [...ch.calculated, ...presetsFor(d.state).filter((p) => !ch.replaced.includes(p.key)).map((p) => ({ ...p, exampleAmount: presetAmount(p, d), fee: presetFee(p.key, d) }))]; },
    async addAccountingFee(dealId, input) { on(); const d = await deal(dealId);
      if (input && /^cla:/.test(String(input.presetKey || ''))) { await editor(dealId); const E = await engine(); const all = await fees(dealId); const P = E.proposeFees(d, E.lastOptions(all, d));
        const line = P.lines.find((l) => 'cla:' + l.key === input.presetKey); if (!line) throw new Error('That CLA rate does not apply to this order any more. Pick the preset again.');
        return insertCalc(E, d, all, line, P, input); }
      const clean = cleanFee(input, d);
      return fromRow(ok(await sb.from('accounting_fees').insert({ deal_id: dealId, ...toRow(clean) }).select('*').single())); },
    async addAccountingPreset(dealId, key, overrides = {}) { on(); const d = await deal(dealId); const E = await engine(); const all = await fees(dealId);
      let P = null; try { P = E.proposeFees(d, E.lastOptions(all, d)); } catch (e) { if (/^cla:/.test(key)) throw e; }
      const active = (k) => all.some((f) => !f.retired && isCalculated(f) && f.calc.key === k);
      const lines = !P ? [] : /^cla:/.test(key) ? P.lines.filter((l) => 'cla:' + l.key === key) : P.lines.filter((l) => l.replacesPresets.includes(key) && !active(l.key));
      if (/^cla:/.test(key) && !lines.length) throw new Error('That CLA rate does not apply to this order.');
      if (!lines.length) return this.addAccountingFee(dealId, { ...presetFee(key, d), ...overrides });
      await editor(dealId); const added = []; for (const [k, l] of lines.entries()) added.push(await insertCalc(E, d, all, l, P, k === 0 ? overrides : {})); return { ...added[0], alsoAdded: added.slice(1).map((f) => f.id) }; },
    async getCalculatorSetup(dealId) { on(); await editor(dealId); const d = await deal(dealId); const E = await engine(); return E.calcSetup(d, await fees(dealId)); },
    async previewCalculatedFees(dealId, options) { on(); await editor(dealId); const d = await deal(dealId); const E = await engine(); const all = await fees(dealId); const opts = E.cleanOptions(options || E.lastOptions(all, d));
      const P = E.proposeFees(d, opts); return E.previewView(P, E.diffProposal(P, all), opts); },
    async applyCalculatedFees(dealId, options, { token = null, retireExamples = true } = {}) {
      on(); await editor(dealId); const d = await deal(dealId); const E = await engine(); const all = await fees(dealId); const opts = E.cleanOptions(options || E.lastOptions(all, d));
      const P = E.proposeFees(d, opts); const D = E.diffProposal(P, all); if (token && token !== D.token) throw new Error('The fee ledger or the order changed since the preview. Preview again before applying.');
      const at = new Date().toISOString(); const r = { added: 0, updated: 0, retired: 0, examplesRetired: 0, kept: D.counts.overridden, unchanged: D.counts.unchanged, skipped: D.counts.retired };
      for (const row of D.rows) {
        if (row.status === 'new') { await insertCalc(E, d, all, row.proposed, P, {}, at); r.added++; }
        else if (row.status === 'changed') { const clean = cleanFee(E.feeInput(row.proposed), d, row.current); ok(await sb.from('accounting_fees').update({ ...toRow(clean), ...calcRow({ calc: E.calcBlock(row.proposed, P, at) }) }).eq('id', row.current.id).select('id').single()); r.updated++; }
        else if (row.status === 'retire') { ok(await sb.from('accounting_fees').update({ retired_at: at }).eq('id', row.current.id).select('id').single()); r.retired++; }
      }
      if (retireExamples) for (const x of D.examples) { ok(await sb.from('accounting_fees').update({ retired_at: at }).eq('id', x.id).select('id').single()); r.examplesRetired++; }
      return r; },
    async updateAccountingFee(id, patch) { on(); const f = await feeRow(id); if (f.retired) throw new Error('This fee is retired. Restore it before editing.'); const d = await deal(f.dealId);
      return fromRow(ok(await sb.from('accounting_fees').update(toRow(cleanFee(patch, d, f))).eq('id', id).select('*').single())); },
    async retireAccountingFee(id, retired = true) { on(); return fromRow(ok(await sb.from('accounting_fees').update({ retired_at: retired ? new Date().toISOString() : null }).eq('id', id).select('*').single())); },
    async refreshAccountingProrations(dealId) { on(); await editor(dealId); const d = await deal(dealId); let updated = 0;
      for (const f of (await fees(dealId)).filter((x) => !x.retired && x.proration)) { const live = liveProration(f, d); if (!live.prorationStale || live.prorationError) continue;
        const clean = cleanFee({ proration: f.proration, description: f.description }, d, f); if (!feeChanges(f, clean).length) continue;
        ok(await sb.from('accounting_fees').update(toRow(clean)).eq('id', f.id).select('id').single()); updated++; }
      return { updated }; },
    async getAccountingCd(dealId) { on(); const a = await access(dealId); const d = await deal(dealId); const rec = ok(await sb.from('accounting_cd_details').select('*').eq('deal_id', dealId).maybeSingle());
      const details = rec ? rec.data || {} : {}; const cd = closingDisclosure(d, (await fees(dealId)).filter((f) => !f.retired));
      let calc = { lines: [], warnings: [], escrow: null }; try { calc = prepaidEscrowLines(d, details); } catch (e) { calc.warnings = [e.message]; }
      return { dealId, canEdit: a === 'edit', details, updatedAt: rec ? rec.updated_at : null, updatedByName: '', cd, pages: cdPages(d, cd, details, calc.escrow), escrow: calc.escrow, calcWarnings: calc.warnings, mark: TEST_MARK,
        deal: { closingDate: d.closingDate, loanAmount: d.loanAmount, purchasePrice: d.purchasePrice, lenderName: d.lenderName, street: d.street, city: d.city, state: d.state, zip: d.zip } }; },
    async saveAccountingCd(dealId, input) { on(); await editor(dealId); const next = cleanCdDetails(input || {});
      const rec = ok(await sb.from('accounting_cd_details').select('deal_id,data').eq('deal_id', dealId).maybeSingle());
      if (rec) ok(await sb.from('accounting_cd_details').update({ data: next }).eq('deal_id', dealId).select('deal_id').single());
      else ok(await sb.from('accounting_cd_details').insert({ deal_id: dealId, data: next }).select('deal_id').single());
      return { changed: null }; },
    async previewAccountingPrepaids(dealId) { on(); await editor(dealId); const d = await deal(dealId); const rec = ok(await sb.from('accounting_cd_details').select('data').eq('deal_id', dealId).maybeSingle());
      const P = prepaidEscrowLines(d, rec ? rec.data : {}); return { ...P, ...diffCdcalc(P.lines, await fees(dealId)) }; },
    async applyAccountingPrepaids(dealId, { retireExamples = true } = {}) { on(); await editor(dealId); const d = await deal(dealId); const rec = ok(await sb.from('accounting_cd_details').select('data').eq('deal_id', dealId).maybeSingle());
      const P = prepaidEscrowLines(d, rec ? rec.data : {}); const all = await fees(dealId); const D = diffCdcalc(P.lines, all); const at = new Date().toISOString(); const r = { added: 0, updated: 0, retired: 0, examplesRetired: 0 };
      for (const row of D.rows) {
        if (row.status === 'new') { ok(await sb.from('accounting_fees').insert({ deal_id: dealId, ...toRow(cleanFee(cdcalcFeeInput(row.proposed), d)) }).select('id').single()); r.added++; }
        else if (row.status === 'changed') { const cur = all.find((f) => f.id === row.current.id); ok(await sb.from('accounting_fees').update(toRow(cleanFee(cdcalcFeeInput(row.proposed), d, cur))).eq('id', cur.id).select('id').single()); r.updated++; }
        else if (row.status === 'retire') { ok(await sb.from('accounting_fees').update({ retired_at: at }).eq('id', row.current.id).select('id').single()); r.retired++; } }
      if (retireExamples) for (const x of D.examples) { ok(await sb.from('accounting_fees').update({ retired_at: at }).eq('id', x.id).select('id').single()); r.examplesRetired++; }
      return r; },
    async listAccountingLog(dealId) { on(); await access(dealId); const rows = ok(await sb.from('accounting_fee_log').select('*').eq('deal_id', dealId).order('changed_at', { ascending: false })) || [];
      const cdRows = (ok(await sb.from('accounting_cd_log').select('*').eq('deal_id', dealId).order('changed_at', { ascending: false })) || []).map((l) => ({ id: l.id, dealId: l.deal_id, feeId: 'cd', description: 'Closing Disclosure details', action: l.action, at: l.changed_at, byId: l.changed_by, byName: '', cd: true,
        changes: (l.changes || []).map((c) => ({ field: c.field, label: cdFieldLabel(c.field), old: c.old, new: c.new })) }));
      return [...cdRows, ...rows.map((l) => ({ id: l.id, dealId: l.deal_id, feeId: l.fee_id, description: (l.new_row || {}).description || '', action: l.action, at: l.changed_at, byId: l.changed_by, byName: '',
        ...((l.changes || []).some((c) => /^calc_|^calculation$|^rate_source$/.test(c.field)) ? { via: 'CLA rates' } : {}),
        ...((l.changes || []).some((c) => c.field === 'preset_key' && /^cdcalc:/.test(String(c.new || ''))) || /^cdcalc:/.test(String((l.new_row || {}).preset_key || '')) ? { via: CDCALC_VIA } : {}),
        changes: (l.changes || []).map((c) => ({ field: c.field, old: c.old, new: c.new })) }))].sort((x, y) => String(y.at).localeCompare(String(x.at))); },
    async getAltaStatement(dealId, view = 'combined') { on(); await access(dealId); const d = await deal(dealId); return altaStatement(d, (await fees(dealId)).filter((f) => !f.retired), view); },
    async getClosingDisclosure(dealId) { on(); await access(dealId); const d = await deal(dealId); return closingDisclosure(d, (await fees(dealId)).filter((f) => !f.retired)); },
  };
}
