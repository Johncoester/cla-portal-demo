/* [SUPABASE] ACCOUNTING (John, Nov 3; migration 34). Same names / shapes as mock-part-accounting.js. NOT run against a hosted project (best
 * effort; the mock adapter is the tested one). Two switches: the browser flag (features.accounting, off unless the config says true) and the
 * database switch (private.features 'accounting', off by default; RLS refuses everything while it is off). RLS + triggers enforce the rules
 * (staff only, Sales read-only, no deletes, refinance has no seller side, every change logged in accounting_fee_log). Nothing is sent. */
import { ACCOUNTING_OFF, ACCOUNTING_STAFF_ONLY, TEST_MARK, cleanFee, allEntries, ledgerTotals, altaStatement, closingDisclosure, presetsFor, presetAmount, presetFee } from './accounting.js?v=202611031946';

const toRow = (f) => ({ kind: f.kind, description: f.description, alta_section: f.altaSection, cd_section: f.cdSection, cd_line: f.cdLine, payee: f.payee, amount: f.amount, note: f.note, preset_key: f.presetKey,
  paid_by: f.paidBy, split_buyer: f.split ? f.split.buyer : 0, split_seller: f.split ? f.split.seller : 0, split_lender: f.split ? f.split.lender : 0, split_other: f.split ? f.split.other : 0,
  timing: f.timing, poc: f.poc, title_prefix: f.titlePrefix, credit_from: f.from, credit_to: f.to });
const fromRow = (r) => ({ id: r.id, dealId: r.deal_id, kind: r.kind, description: r.description, altaSection: r.alta_section, cdSection: r.cd_section, cdLine: r.cd_line, payee: r.payee, amount: Number(r.amount), note: r.note, presetKey: r.preset_key,
  paidBy: r.paid_by, split: r.kind === 'charge' ? { buyer: Number(r.split_buyer), seller: Number(r.split_seller), lender: Number(r.split_lender), other: Number(r.split_other) } : null,
  timing: r.timing, poc: r.poc, titlePrefix: r.title_prefix, from: r.credit_from, to: r.credit_to, retired: !!r.retired_at, retiredAt: r.retired_at, retiredBy: r.retired_by,
  createdAt: r.created_at, createdBy: r.created_by, updatedAt: r.updated_at, updatedBy: r.updated_by });
const dealOf = (d) => ({ id: d.id, fileNumber: d.file_number, state: d.state, transactionType: d.transaction_type, purchasePrice: d.purchase_price == null ? null : Number(d.purchase_price), loanAmount: d.loan_amount == null ? null : Number(d.loan_amount), emdAmount: d.emd_amount == null ? null : Number(d.emd_amount) });

export function accountingSupabase({ sb, ok, flags }) {
  const on = () => { if (!flags.accounting) throw new Error(ACCOUNTING_OFF); };
  const deal = async (id) => { const d = ok(await sb.from('deals').select('id,file_number,state,transaction_type,purchase_price,loan_amount,emd_amount').eq('id', id).maybeSingle()); if (!d) throw new Error('Order not found.'); return dealOf(d); };
  const access = async (id) => { const a = ok(await sb.rpc('accounting_access', { p_deal: id })); if (a === 'off') throw new Error(ACCOUNTING_OFF); if (a === 'none') throw new Error(ACCOUNTING_STAFF_ONLY); return a; };
  const fees = async (id) => (ok(await sb.from('accounting_fees').select('*').eq('deal_id', id).order('created_at')) || []).map(fromRow);
  const feeRow = async (id) => { const r = ok(await sb.from('accounting_fees').select('*').eq('id', id).maybeSingle()); if (!r) throw new Error('Fee not found.'); return fromRow(r); };
  return {
    async getAccounting(dealId, { includeRetired = false } = {}) { on(); const a = await access(dealId); const d = await deal(dealId); const all = await fees(dealId); const live = all.filter((f) => !f.retired);
      return { dealId, fileNumber: d.fileNumber, state: d.state, transactionType: d.transactionType, refi: d.transactionType === 'Refinance', purchasePrice: d.purchasePrice, loanAmount: d.loanAmount, emdAmount: d.emdAmount,
        canEdit: a === 'edit', mark: TEST_MARK, entries: allEntries(d, all, { includeRetired }), retiredCount: all.length - live.length, totals: ledgerTotals(d, live) }; },
    async listAccountingPresets(dealId) { on(); await access(dealId); const d = await deal(dealId); return presetsFor(d.state).map((p) => ({ ...p, exampleAmount: presetAmount(p, d), fee: presetFee(p.key, d) })); },
    async addAccountingFee(dealId, input) { on(); const d = await deal(dealId); const clean = cleanFee(input, d);
      return fromRow(ok(await sb.from('accounting_fees').insert({ deal_id: dealId, ...toRow(clean) }).select('*').single())); },
    async addAccountingPreset(dealId, key, overrides = {}) { on(); const d = await deal(dealId); return this.addAccountingFee(dealId, { ...presetFee(key, d), ...overrides }); },
    async updateAccountingFee(id, patch) { on(); const f = await feeRow(id); if (f.retired) throw new Error('This fee is retired. Restore it before editing.'); const d = await deal(f.dealId);
      return fromRow(ok(await sb.from('accounting_fees').update(toRow(cleanFee(patch, d, f))).eq('id', id).select('*').single())); },
    async retireAccountingFee(id, retired = true) { on(); return fromRow(ok(await sb.from('accounting_fees').update({ retired_at: retired ? new Date().toISOString() : null }).eq('id', id).select('*').single())); },
    async listAccountingLog(dealId) { on(); await access(dealId); const rows = ok(await sb.from('accounting_fee_log').select('*').eq('deal_id', dealId).order('changed_at', { ascending: false })) || [];
      return rows.map((l) => ({ id: l.id, dealId: l.deal_id, feeId: l.fee_id, description: (l.new_row || {}).description || '', action: l.action, at: l.changed_at, byId: l.changed_by, byName: '',
        changes: (l.changes || []).map((c) => ({ field: c.field, old: c.old, new: c.new })) })); },
    async getAltaStatement(dealId, view = 'combined') { on(); await access(dealId); const d = await deal(dealId); return altaStatement(d, (await fees(dealId)).filter((f) => !f.retired), view); },
    async getClosingDisclosure(dealId) { on(); await access(dealId); const d = await deal(dealId); return closingDisclosure(d, (await fees(dealId)).filter((f) => !f.retired)); },
  };
}
