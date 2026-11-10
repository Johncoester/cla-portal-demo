/* [SUPABASE] FUNDING. Same names as the funding half of mock-part-fwp.js.
 * Tables already on TEST: funding_records, funding_funds, funding_checks, funding_disbursements.
 * RLS is private.fwp_staff('funding', deal). Agents, buyers, sellers, and TCs are not in that list.
 * The disbursed-status trigger re-checks funds, document checks, and invoices. Nothing is sent. */
import * as R from './funding-wire-policy.js?v=202611070139';
import { ledgerTotals } from './accounting.js?v=202611071751';

const OFF = 'Funding is turned off on this portal.';
const ROLES = ['Processor', 'Preprocessor', 'Funding Team'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEAL = 'id,file_number,street,city,state,zip,processor_id,transaction_type,closing_date,open_date,status,stage,lender_name,purchase_price,loan_amount';
const denied = (error) => /row-level security|42501|permission denied/i.test(String(error && error.message || error || ''));
const staff = (u) => !!u && !u.accountRole && u.role !== 'Outside user' && u.role !== 'Employee' && u.role !== 'Transaction Coordinator' && (!!u.isAdmin || ROLES.includes(u.role));
const text = (v, n = 1000) => String(v == null ? '' : v).trim().slice(0, n);
const flag = (v) => v === true || v === 'true' || v === 'on' || v === 'yes';
const tri = (v) => (v === '' || v == null ? null : flag(v));
const money = (v, label) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[$,]/g, ''));
  if (!isFinite(n) || n < 0) throw new Error(`${label} must be a positive amount.`);
  return Math.round(n * 100) / 100;
};
const num = (v) => (v == null || v === '' ? null : Number(v));

function fundView(row, kind) {
  const src = row || { kind, status: 'pending', pending: true };
  return { id: src.id || '', dealId: src.deal_id || '', kind: src.kind || kind, status: src.status || 'pending', pending: src.pending !== false, amount: num(src.amount), postedOn: src.posted_on || '', instrumentNumber: src.instrument_number || '', entryType: src.entry_type || '', description: src.description || '', toFrom: src.to_from || '', credit: num(src.credit), debit: num(src.debit), balance: num(src.balance), ledgerEntryId: src.ledger_entry_id || '' };
}
function checkView(row) { return { id: row.id, dealId: row.deal_id, checkKey: row.check_key, passed: !!row.passed, note: row.note || '' }; }
function disbView(row) {
  return { id: row.id || '', dealId: row.deal_id || '', kind: row.kind || 'other', payee: row.payee || '', address: row.address || '', memo: row.memo || '', amount: num(row.amount) || 0, breakdown: row.breakdown || '', invoicePayee: row.invoice_payee || '', invoiceAddress: row.invoice_address || '', invoiceVerified: !!row.invoice_verified, printed: !!row.printed, fedexTracking: row.fedex_tracking || '', method: row.method || 'check', status: row.status || 'undisbursed', voidedAt: row.voided_at || null, disbursedAt: row.disbursed_at || null, voidReason: row.void_reason || '' };
}
function recordView(row) {
  return {
    id: row.id, dealId: row.deal_id, lender: row.lender || '', fundingAuthorizationNeeded: row.funding_authorization_needed, lenderClosingPortal: row.lender_closing_portal || '', uploadFd: !!row.upload_fd, overagesTo: row.overages_to || '', sendDocumentsTo: row.send_documents_to || '',
    laAmount: num(row.la_amount), laMethod: row.la_method || '', saAmount: num(row.sa_amount), saMethod: row.sa_method || '', mortgageBrokerAmount: num(row.mortgage_broker_amount),
    sellerProceedsAmount: num(row.seller_proceeds_amount), sellerProceedsMethod: row.seller_proceeds_method || '', buyerProceedsAmount: num(row.buyer_proceeds_amount), buyerProceedsMethod: row.buyer_proceeds_method || '',
    principalReductionAdvanced: !!row.principal_reduction_advanced, principalReductionConfirmed: !!row.principal_reduction_confirmed, balancedWithLender: !!row.balanced_with_lender,
    closingTime: row.closing_time || '', remarks: row.remarks || '', checksDisbursed: row.checks_disbursed || 0, checksUndisbursed: row.checks_undisbursed || 0, status: row.status || 'pending',
    wireTeamNotifiedAt: row.wire_team_notified_at || null, disbursedAt: row.disbursed_at || null,
  };
}

export function fundingSupabase({ sb, ok, flags, me }) {
  const fail = (error) => { if (denied(error)) throw new Error(R.FWP_STAFF_ONLY); throw error instanceof Error ? error : new Error(String(error && error.message || error)); };
  const run = async (q) => { const r = await q; if (r.error) fail(r.error); return r.data; };
  const gate = async () => {
    if (!flags.funding) throw new Error(OFF);
    const u = await me();
    if (!u || !u.id) throw new Error('Please sign in.');
    if (!staff(u)) throw new Error(R.FWP_STAFF_ONLY);
    return u;
  };
  const dealOf = async (id) => { const d = ok(await sb.from('deals').select(DEAL).eq('id', id).maybeSingle()); if (!d) throw new Error('Order not found.'); return d; };
  const queueRow = (d, record) => ({ id: d.id, fileNumber: d.file_number, address: [d.street, d.city, [d.state, d.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '), processorName: '', transactionType: d.transaction_type, closingDate: d.closing_date, openDate: d.open_date, status: d.status, stage: d.stage, record: record || null });
  const recordRow = async (id) => ok(await sb.from('funding_records').select('*').eq('deal_id', id).maybeSingle());
  const ensure = async (id, deal) => {
    const cur = await recordRow(id);
    if (cur && !cur.deleted_at) return cur;
    const seed = { lender: deal.lender_name || '', status: 'pending' };
    if (cur) return run(sb.from('funding_records').update({ ...seed, deleted_at: null }).eq('id', cur.id).select('*').single());
    return run(sb.from('funding_records').insert({ deal_id: id, ...seed }).select('*').single());
  };
  const child = async (table, dealId) => (ok(await sb.from(table).select('*').eq('deal_id', dealId).is('deleted_at', null)) || []);
  const ledger = async (deal) => {
    try {
      const fees = ok(await sb.from('accounting_fees').select('*').eq('deal_id', deal.id).is('retired_at', null)) || [];
      const shaped = fees.map((f) => ({ kind: f.kind, description: f.description, amount: Number(f.amount), split: f.kind === 'charge' ? { buyer: Number(f.split_buyer), seller: Number(f.split_seller), lender: Number(f.split_lender), other: Number(f.split_other) } : null, timing: f.timing, poc: f.poc, from: f.credit_from, to: f.credit_to, reduces: !!f.reduces, retired: false, transactionType: deal.transaction_type }));
      const t = ledgerTotals({ transactionType: deal.transaction_type }, shaped);
      return { balanced: !!t.balanced, receipts: t.receipts, disbursements: t.disbursements, difference: t.difference, dueToSeller: t.dueToSeller, dueToBuyer: t.dueToBuyer };
    } catch (e) { return { balanced: false, receipts: 0, disbursements: 0, difference: 0, dueToSeller: 0, dueToBuyer: 0 }; }
  };
  const view = async (deal, row) => {
    const funds = await child('funding_funds', deal.id);
    const checks = (await child('funding_checks', deal.id)).map(checkView);
    const disbursements = (await child('funding_disbursements', deal.id)).map(disbView);
    const record = recordView(row);
    const fundRows = R.FUND_KINDS.map(([kind]) => fundView(funds.find((f) => f.kind === kind), kind));
    const readiness = R.fundingReadiness(record, fundRows, checks);
    const blockers = [...readiness.missing];
    if (!record.wireTeamNotifiedAt) blockers.push('Wire team notified to release');
    if (disbursements.some((z) => z.status !== 'void' && z.id && (!z.invoiceVerified || !z.printed || (['check', 'overnight'].includes(z.method || 'check') && !z.fedexTracking)))) blockers.push('Every check invoice-verified, printed and given FedEx tracking');
    disbursements.push(disbView({ kind: 'other', status: 'undisbursed', method: 'check' }));
    return { deal: queueRow(deal, record), record, funds: fundRows, checks, disbursements, readiness, blockers, ledger: await ledger(deal), canEdit: true };
  };

  return {
    async listFundingQueue() {
      await gate();
      const deals = ok(await sb.from('deals').select(DEAL)) || [];
      const rows = ok(await sb.from('funding_records').select('*').is('deleted_at', null)) || [];
      const by = new Map(rows.map((r) => [r.deal_id, r]));
      return deals.filter((d) => (d.status === 'Closed' || Number(d.stage) >= 2 || d.closing_date) && !(by.get(d.id) && by.get(d.id).disbursed_at)).map((d) => queueRow(d, by.get(d.id) ? recordView(by.get(d.id)) : null)).sort((a, b) => String(a.closingDate || '').localeCompare(String(b.closingDate || '')));
    },
    async getFunding(dealId) { await gate(); const deal = await dealOf(dealId); return view(deal, await ensure(dealId, deal)); },
    async saveFunding(dealId, input = {}) {
      await gate();
      const deal = await dealOf(dealId);
      const cur = await ensure(dealId, deal);
      if (cur.disbursed_at) throw new Error('A disbursed funding record is locked; void a disbursement instead.');
      const row = {
        lender: text(input.lender), funding_authorization_needed: tri(input.fundingAuthorizationNeeded), lender_closing_portal: text(input.lenderClosingPortal), upload_fd: flag(input.uploadFd),
        overages_to: text(input.overagesTo), send_documents_to: text(input.sendDocumentsTo), la_amount: money(input.laAmount, 'L/A commission'), la_method: text(input.laMethod),
        sa_amount: money(input.saAmount, 'S/A commission'), sa_method: text(input.saMethod), mortgage_broker_amount: money(input.mortgageBrokerAmount, 'Mortgage broker commission'),
        seller_proceeds_amount: money(input.sellerProceedsAmount, 'Seller proceeds'), seller_proceeds_method: text(input.sellerProceedsMethod), buyer_proceeds_amount: money(input.buyerProceedsAmount, 'Buyer proceeds'), buyer_proceeds_method: text(input.buyerProceedsMethod),
        principal_reduction_advanced: flag(input.principalReductionAdvanced), principal_reduction_confirmed: flag(input.principalReductionConfirmed), balanced_with_lender: flag(input.balancedWithLender),
        closing_time: text(input.closingTime), remarks: text(input.remarks, 4000), checks_disbursed: Math.round(money(input.checksDisbursed, 'Checks disbursed') || 0), checks_undisbursed: Math.round(money(input.checksUndisbursed, 'Checks undisbursed') || 0),
      };
      await run(sb.from('funding_records').update(row).eq('id', cur.id).select('id').single());
      return this.getFunding(dealId);
    },
    async saveFundingFund(dealId, kind, input = {}) {
      await gate();
      const deal = await dealOf(dealId);
      if (!R.FUND_KINDS.some(([k]) => k === kind)) throw new Error('Unknown fund type.');
      await ensure(dealId, deal);
      if (input.status && !['pending', 'received'].includes(input.status)) throw new Error('Fund status is pending or received.');
      const patch = { status: input.status || 'pending', pending: flag(input.pending), amount: money(input.amount, 'Amount'), posted_on: text(input.postedOn, 10) || null, instrument_number: text(input.instrumentNumber), entry_type: text(input.entryType), description: text(input.description), to_from: text(input.toFrom), credit: money(input.credit, 'Credit'), debit: money(input.debit, 'Debit'), balance: money(input.balance, 'Balance'), ledger_entry_id: text(input.ledgerEntryId) };
      const cur = (await child('funding_funds', dealId)).find((f) => f.kind === kind);
      const saved = cur
        ? await run(sb.from('funding_funds').update(patch).eq('id', cur.id).select('*').single())
        : await run(sb.from('funding_funds').insert({ deal_id: dealId, kind, ...patch }).select('*').single());
      return fundView(saved, kind);
    },
    async setFundingCheck(dealId, key, passed, note = '') {
      await gate();
      const deal = await dealOf(dealId);
      if (!R.FUNDING_CHECK_KEYS.includes(key)) throw new Error('Unknown document check.');
      await ensure(dealId, deal);
      const cur = (await child('funding_checks', dealId)).find((c) => c.check_key === key);
      const patch = { passed: !!passed, note: text(note), checked_at: new Date().toISOString() };
      const saved = cur ? await run(sb.from('funding_checks').update(patch).eq('id', cur.id).select('*').single()) : await run(sb.from('funding_checks').insert({ deal_id: dealId, check_key: key, ...patch }).select('*').single());
      return checkView(saved);
    },
    async saveFundingDisbursement(dealId, input = {}) {
      await gate();
      const deal = await dealOf(dealId);
      await ensure(dealId, deal);
      const id = text(input.id, 80);
      const cur = id && UUID.test(id) ? ok(await sb.from('funding_disbursements').select('*').eq('id', id).maybeSingle()) : null;
      if (cur && cur.deal_id !== dealId) throw new Error('Disbursement not found on this order.');
      if (cur && cur.disbursed_at) throw new Error('A posted disbursement cannot be edited. Void it instead.');
      if (input.kind && !R.DISBURSEMENT_TYPES.includes(input.kind)) throw new Error('Unknown disbursement type.');
      const payee = text(input.payee); const address = text(input.address); const invoicePayee = text(input.invoicePayee); const invoiceAddress = text(input.invoiceAddress);
      if (flag(input.invoiceVerified) && invoicePayee && payee && invoicePayee !== payee) throw new Error('Invoice payee must match the payment payee.');
      if (flag(input.invoiceVerified) && invoiceAddress && address && invoiceAddress !== address) throw new Error('Invoice address must match the payment address.');
      const patch = { kind: input.kind || (cur && cur.kind) || 'other', payee, address, memo: text(input.memo), amount: money(input.amount, 'Amount') || 0, breakdown: text(input.breakdown), invoice_payee: invoicePayee, invoice_address: invoiceAddress, invoice_verified: flag(input.invoiceVerified), printed: flag(input.printed), fedex_tracking: text(input.fedexTracking), method: input.method || 'check' };
      const saved = cur ? await run(sb.from('funding_disbursements').update(patch).eq('id', cur.id).select('*').single()) : await run(sb.from('funding_disbursements').insert({ deal_id: dealId, status: 'undisbursed', ...patch }).select('*').single());
      return disbView(saved);
    },
    async notifyWireTeam(dealId) {
      await gate();
      const deal = await dealOf(dealId);
      const v = await view(deal, await ensure(dealId, deal));
      if (!v.readiness.ready) throw new Error(`Cannot notify the wire team yet: ${v.readiness.missing.join('; ')}`);
      await run(sb.from('funding_records').update({ wire_team_notified_at: new Date().toISOString() }).eq('deal_id', dealId).select('id').single());
      return true;
    },
    async queueFundsDisbursedNotification(dealId) {
      await gate();
      const deal = await dealOf(dealId);
      const cur = await ensure(dealId, deal);
      if (cur.status !== 'disbursed') throw new Error('Mark the file disbursed before queuing the notification.');
      const parts = ok(await sb.from('deal_participants').select('id,role,contact_id').eq('deal_id', dealId)) || [];
      const ids = parts.filter((p) => ['Listing Agent', 'Buyer Agent'].includes(p.role)).map((p) => p.contact_id).filter(Boolean);
      const contacts = ids.length ? ok(await sb.from('contacts').select('id,email,first_name,last_name').in('id', ids)) || [] : [];
      const agents = contacts.filter((c) => c.email);
      if (!agents.length) throw new Error('Add the listing and selling agents with email addresses first.');
      const idsOut = [];
      for (const a of agents) idsOut.push(await run(sb.rpc('queue_staff_outbox', { p_deal: dealId, p_module: 'funding', p_type: 'funds_disbursed', p_email: a.email, p_name: `${a.first_name || ''} ${a.last_name || ''}`.trim(), p_profile: null, p_subject: `Funds Disbursed Notification - ${deal.file_number}`, p_body: `Funds have been disbursed for ${deal.street}. File ${deal.file_number}. The portal sends nothing.` })));
      return idsOut;
    },
    async markFundingDisbursed(dealId) {
      await gate();
      const deal = await dealOf(dealId);
      const v = await view(deal, await ensure(dealId, deal));
      if (v.blockers.length) throw new Error(`Not ready to disburse: ${v.blockers.join('; ')}`);
      await run(sb.from('funding_records').update({ status: 'disbursed', disbursed_at: new Date().toISOString() }).eq('deal_id', dealId).select('id').single());
      return true;
    },
    async voidFundingDisbursement(id, reason) {
      await gate();
      if (!text(reason)) throw new Error('A void reason is required.');
      const cur = ok(await sb.from('funding_disbursements').select('*').eq('id', id).maybeSingle());
      if (!cur) throw new Error('Record not found.');
      await dealOf(cur.deal_id);
      await run(sb.from('funding_disbursements').update({ status: 'void', voided_at: new Date().toISOString(), void_reason: text(reason) }).eq('id', id).select('id').single());
      return true;
    },
    async completeFundingTasks(dealId) {
      await gate();
      const deal = await dealOf(dealId);
      const cur = await ensure(dealId, deal);
      if (cur.status !== 'disbursed') throw new Error('Disburse the file before completing funding tasks.');
      for (const title of [R.FUNDING_TASK, 'Funding file review']) {
        const tasks = ok(await sb.from('tasks').select('id,title,status').eq('deal_id', dealId)) || [];
        const t = tasks.find((z) => z.title === title && z.status !== 'cancelled');
        if (!t) await run(sb.from('tasks').insert({ deal_id: dealId, title, status: 'done', kind: 'simple', assigned_role: 'Processor', description: 'Funding task. Nothing was sent.' }).select('id').single());
        else if (t.status !== 'done') ok(await sb.rpc('set_task_status', { p_task: t.id, p_status: 'done' }));
      }
      await run(sb.from('funding_records').update({ funding_tasks_completed_at: new Date().toISOString() }).eq('deal_id', dealId).select('id').single());
      return true;
    },
  };
}
