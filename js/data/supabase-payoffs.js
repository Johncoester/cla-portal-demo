/* [SUPABASE] PAYOFFS / HOA / FFB / GROUND RENT (John, Nov 4 2026; migration 42). Same names / shapes as mock-part-payoffs.js. NOT run against a
 * hosted project (best effort; the mock adapter is the tested one). Behind features.accounting AND the database 'accounting' switch. RLS + triggers
 * enforce the rules (staff only, Processor / Admin edit, Sales / TC read, no deletes, no bank / wire / SSN keys, every change logged in
 * deal_payoff_log). Pre-Closing tasks and payoff folders wait on createTask / createFolder being wired in supabase mode. Nothing is sent. */
import { cleanPayoff, payoffCalc, payoffFeeInput, cleanCompany, cleanOrderInfo, orderInfoLines, cleanNote, hoaGrFeeInput, HOA_GR_PRESETS, PAYOFF_TABS, MAX_PAYOFFS, otherTypeLabel } from './payoffs.js?v=202611041856';
import { ACCOUNTING_OFF, ACCOUNTING_STAFF_ONLY, ACCOUNTING_READ_ONLY } from './accounting.js?v=202611041856';
import { SETTLEMENT_AGENT } from './qualia-charges.js?v=202611041856';

const payoffOf = (r) => ({ id: r.id, dealId: r.deal_id, position: r.position, lender: r.lender, loanNumber: r.loan_number, lienHolder: r.lien_holder, trustee: r.trustee, isMortgage: r.is_mortgage, recording: r.recording || {},
  principal: num(r.principal), interest: num(r.interest), additionalInterest: num(r.additional_interest), escrow: num(r.escrow), prepayPenalty: num(r.prepay_penalty), releaseCharge: num(r.release_charge), lateCharge: num(r.late_charge),
  interestTo: r.interest_to, interestMode: r.interest_mode, calc: r.calc || {}, items: r.items || [], goodThrough: r.good_through, note: r.note, feeId: r.fee_id, retired: !!r.retired_at, createdAt: r.created_at, updatedAt: r.updated_at });
const num = (x) => (x == null ? null : Number(x));
const payoffRow = (c) => ({ position: c.position, lender: c.lender, loan_number: c.loanNumber, lien_holder: c.lienHolder, trustee: c.trustee, is_mortgage: c.isMortgage, recording: c.recording,
  principal: c.principal, interest: c.interest, additional_interest: c.additionalInterest, escrow: c.escrow, prepay_penalty: c.prepayPenalty, release_charge: c.releaseCharge, late_charge: c.lateCharge,
  interest_to: c.interestTo, interest_mode: c.interestMode, calc: c.calc, items: c.items, good_through: c.goodThrough, note: c.note });
const companyOf = (r) => ({ id: r.id, name: r.name, type: r.company_type, phone: r.phone, fax: r.fax, address: r.address, managementCompanyId: r.management_company_id });

export function payoffsSupabase({ sb, ok, flags, api }) {
  const on = () => { if (!flags.accounting) throw new Error(ACCOUNTING_OFF); };
  const access = async (id) => { on(); const a = ok(await sb.rpc('accounting_access', { p_deal: id })); if (a === 'off') throw new Error(ACCOUNTING_OFF); if (a === 'none') throw new Error(ACCOUNTING_STAFF_ONLY); return a; };
  const editor = async (id) => { const a = await access(id); if (a !== 'edit') throw new Error(ACCOUNTING_READ_ONLY); return a; };
  const dealOf = async (id) => ok(await sb.from('deals').select('id,transaction_type,closing_date').eq('id', id).maybeSingle()) || {};
  const view = (p, d) => { const c = payoffCalc(p, { closingDate: d.closing_date || null }); return { ...p, calcOut: c, total: c.total, tab: PAYOFF_TABS[p.position - 1] }; };
  const others = async (dealId) => { const rows = ok(await sb.from('deal_other_contacts').select('id,deal_id,contact_type,company_id,created_at,company:other_companies(*, mgmt:management_company_id(id,name))').eq('deal_id', dealId).is('retired_at', null)) || [];
    return rows.map((r) => ({ id: r.id, dealId: r.deal_id, companyId: r.company_id, type: r.contact_type, typeLabel: otherTypeLabel(r.contact_type), name: r.company && r.company.name, phone: (r.company || {}).phone || '', fax: (r.company || {}).fax || '', address: (r.company || {}).address || '',
      management: r.company && r.company.mgmt ? { id: r.company.mgmt.id, name: r.company.mgmt.name } : null })); };
  const syncFee = async (p, d) => { const total = payoffCalc(p, { closingDate: d.closing_date || null }).total; const input = { ...payoffFeeInput(p, d.transaction_type === 'Refinance', total), presetKey: 'payoff:' + p.id };
    const fees = (await api.getAccounting(p.dealId, { includeRetired: true })).entries; const cur = p.feeId ? fees.find((f) => f.id === p.feeId) : null;
    if (p.retired || !(total > 0)) { if (cur && !cur.retired) await api.retireAccountingFee(cur.id, true); return; }
    if (cur) { if (cur.retired) await api.retireAccountingFee(cur.id, false); await api.updateAccountingFee(cur.id, input); }
    else { const f = await api.addAccountingFee(p.dealId, input); ok(await sb.from('deal_payoffs').update({ fee_id: f.id }).eq('id', p.id)); } };
  return {
    async listPayoffs(dealId) { const a = await access(dealId); const d = await dealOf(dealId);
      const list = (ok(await sb.from('deal_payoffs').select('*').eq('deal_id', dealId).is('retired_at', null).order('position')) || []).map((r) => view(payoffOf(r), d));
      return { dealId, canEdit: a === 'edit', refi: d.transaction_type === 'Refinance', closingDate: d.closing_date || null, max: MAX_PAYOFFS, payoffs: list, totalDue: Math.round(list.reduce((t, p) => t + p.total, 0) * 100) / 100 }; },
    async savePayoff(dealId, input) { await editor(dealId); const d = await dealOf(dealId); const c = cleanPayoff(input);
      const cur = ok(await sb.from('deal_payoffs').select('id').eq('deal_id', dealId).eq('position', c.position).is('retired_at', null).maybeSingle());
      const r = cur ? ok(await sb.from('deal_payoffs').update(payoffRow(c)).eq('id', cur.id).select('*').single()) : ok(await sb.from('deal_payoffs').insert({ deal_id: dealId, ...payoffRow(c) }).select('*').single());
      const p = payoffOf(r); await syncFee(p, d); return view(payoffOf(ok(await sb.from('deal_payoffs').select('*').eq('id', p.id).single())), d); },
    async retirePayoff(id) { const r = ok(await sb.from('deal_payoffs').select('*').eq('id', id).maybeSingle()); if (!r) throw new Error('Payoff not found.'); await editor(r.deal_id);
      const x = ok(await sb.from('deal_payoffs').update({ retired_at: new Date().toISOString() }).eq('id', id).select('*').single()); await syncFee(payoffOf(x), await dealOf(r.deal_id)); return true; },
    async listPayoffLog(dealId) { await access(dealId); return (ok(await sb.from('deal_payoff_log').select('*').eq('deal_id', dealId).order('changed_at', { ascending: false })) || []).map((l) => ({ id: l.id, dealId: l.deal_id, what: l.what, action: l.action, at: l.changed_at, byId: l.changed_by, detail: '' })); },

    async searchOtherCompanies(q = '', type = '') { on(); let s = sb.from('other_companies').select('*').order('name').limit(25); if (type) s = s.eq('company_type', type); if (q) s = s.ilike('name', `%${String(q).replace(/[%_]/g, '')}%`); return (ok(await s) || []).map(companyOf); },
    async createOtherCompany(input) { on(); const c = cleanCompany(input); return companyOf(ok(await sb.from('other_companies').insert({ name: c.name, company_type: c.type, phone: c.phone, fax: c.fax, address: c.address, management_company_id: c.managementCompanyId }).select('*').single())); },
    async updateOtherCompany(id, patch) { on(); const cur = ok(await sb.from('other_companies').select('*').eq('id', id).maybeSingle()); if (!cur) throw new Error('Company not found.');
      const c = cleanCompany({ ...companyOf(cur), ...patch, type: cur.company_type }); delete c.id;
      return companyOf(ok(await sb.from('other_companies').update({ name: c.name, phone: c.phone, fax: c.fax, address: c.address, management_company_id: c.managementCompanyId }).eq('id', id).select('*').single())); },
    async listOtherContacts(dealId) { await access(dealId); return others(dealId); },
    async addOtherContact(dealId, companyId, type) { await editor(dealId); const co = ok(await sb.from('other_companies').select('*').eq('id', companyId).maybeSingle()); if (!co) throw new Error('Company not found.');
      ok(await sb.from('deal_other_contacts').insert({ deal_id: dealId, company_id: companyId, contact_type: type || co.company_type })); return (await others(dealId)).find((o) => o.companyId === companyId); },
    async removeOtherContact(id) { ok(await sb.from('deal_other_contacts').update({ retired_at: new Date().toISOString() }).eq('id', id)); return true; },
    async listPayoffPayees(dealId) { await access(dealId); return [{ name: SETTLEMENT_AGENT, role: 'Settlement Agency' }, ...(await others(dealId)).flatMap((o) => [{ name: o.name, role: o.typeLabel }, ...(o.management ? [{ name: o.management.name, role: `${o.typeLabel} management` }] : [])])]; },

    async getPayoffOrderInfo(dealId) { const a = await access(dealId); const r = ok(await sb.from('deal_payoff_info').select('*').eq('deal_id', dealId).maybeSingle()); const data = r ? r.data : {};
      return { dealId, canEdit: a === 'edit', data, lines: orderInfoLines(data), updatedAt: r ? r.updated_at : null, updatedByName: '' }; },
    async savePayoffOrderInfo(dealId, input) { await editor(dealId); const data = cleanOrderInfo(input); ok(await sb.from('deal_payoff_info').upsert({ deal_id: dealId, data }, { onConflict: 'deal_id' })); return this.getPayoffOrderInfo(dealId); },

    async listPayoffNotes(dealId) { await access(dealId); return (ok(await sb.from('deal_payoff_notes').select('*').eq('deal_id', dealId).is('retired_at', null).order('created_at', { ascending: false })) || [])
      .map((n) => ({ id: n.id, dealId: n.deal_id, section: n.section, body: n.body, critical: n.critical, createdAt: n.created_at, createdBy: n.created_by, updatedAt: n.updated_at, byName: '', editedByName: '' })); },
    async addPayoffNote(dealId, input) { await editor(dealId); const n = cleanNote(input); return ok(await sb.from('deal_payoff_notes').insert({ deal_id: dealId, ...n }).select('*').single()); },
    async updatePayoffNote(id, input) { const cur = ok(await sb.from('deal_payoff_notes').select('section').eq('id', id).maybeSingle()); if (!cur) throw new Error('Note not found.'); const n = cleanNote({ section: cur.section, ...input });
      return ok(await sb.from('deal_payoff_notes').update({ body: n.body, critical: n.critical }).eq('id', id).select('*').single()); },

    async addHoaGrCharge(dealId, key, { amount = null, paidTo = '', payee = null } = {}) { await editor(dealId); const pr = HOA_GR_PRESETS.find((p) => p.key === key); if (!pr) throw new Error('Unknown HOA / FFB / ground rent line.');
      const d = await dealOf(dealId); if (d.transaction_type === 'Refinance' && pr.side === 'seller') throw new Error('A refinance has no seller side.');
      const used = new Set((await api.getAccounting(dealId)).entries.filter((f) => f.cdSection === 'H' && !f.retired).map((f) => f.cdLine)); let n = 1; while (used.has(String(n).padStart(2, '0'))) n++;
      const os = await others(dealId); const pick = (t) => (os.find((o) => o.type === t) || {}).name || '';
      const auto = pr.payeeType === 'cla' ? SETTLEMENT_AGENT : pr.payeeType === 'utilityMgmt' ? ((os.find((o) => o.type === 'utility') || {}).management || {}).name || pick('utility') : pick(pr.payeeType);
      return api.addAccountingFee(dealId, hoaGrFeeInput(pr, String(n).padStart(2, '0'), payee != null ? payee : auto, amount, paidTo)); },
    // createTask / createFolder are not wired in supabase mode yet (supabase-adapter.js todo list); the mock adapter has them
    async addPayoffTasks() { throw new Error('Pre-Closing payoff tasks: not wired in Supabase mode yet (createTask is still to wire).'); },
    async ensurePayoffFolders() { throw new Error('Payoff folders: not wired in Supabase mode yet (createFolder is still to wire). Migration 42 allows staff-only deal folders.'); },
    async listPayoffFolders() { return []; },
    async loadPayoffDemo() { throw new Error('The FAKE payoff demo is mock mode only.'); },
  };
}
