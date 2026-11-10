/* [SUPABASE] WIRES. Same names as mock-part-fwp.js. Reads and writes public.wire_records,
 * public.wire_audit_log, and public.escrow_accounts. RLS is private.fwp_staff('wires', deal):
 * Processor, Preprocessor, Funding Team, or Admin, the wires feature on, and the file open to them.
 * Agents, buyers, and sellers get no rows. Account and ABA values are last-four only. Nothing is sent. */
import * as R from './funding-wire-policy.js?v=202611070139';

const OFF = 'Wires are turned off on this portal.';
const STAFF = R.FWP_STAFF_ONLY;
const ROLES = ['Processor', 'Preprocessor', 'Funding Team'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEAL_COLS = 'id,file_number,street,city,state,zip,processor_id,transaction_type,closing_date,open_date,status,stage';

const staff = (u) => !!u && !u.accountRole && u.role !== 'Outside user' && u.role !== 'Employee' && (!!u.isAdmin || ROLES.includes(u.role));
const text = (v, n = 500) => String(v == null ? '' : v).trim().slice(0, n);
const flag = (v) => v === true || v === 'true' || v === 'on' || v === 'yes';
const money = (v, label) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[$,]/g, ''));
  if (!isFinite(n) || n < 0) throw new Error(`${label} must be a positive amount.`);
  return Math.round(n * 100) / 100;
};
const denied = (error) => /row-level security|42501|permission denied/i.test(String(error && error.message || error || ''));

/* A saved row comes back masked. Re-saving that mask keeps the same four digits. A new value must be exactly four digits. */
export function wireLast4(value, label) {
  const raw = text(value, 40);
  if (!raw || raw === '••••') return '';
  const shown = raw.match(/^•+\s*(\d{4})$/);
  if (shown) return shown[1];
  return R.last4(raw, label);
}

function present(row) {
  const last = row.account_last4 || '';
  const aba = row.aba_last4 || '';
  const view = {
    id: row.id, dealId: row.deal_id, payeeParticipantId: row.payee_participant_id || '', payeeName: row.payee_name || '',
    allSellersSigned: !!row.all_sellers_signed, notarized: !!row.notarized, disbursementMethod: row.disbursement_method || '',
    payeeNameMatches: !!row.payee_name_matches, payeeAddressMatches: !!row.payee_address_matches, sellerContactAddress: row.seller_contact_address || '',
    fromAccountId: row.from_account_id || '', amount: row.amount == null ? null : Number(row.amount), recipientName: row.recipient_name || '',
    bankName: row.bank_name || '', accountLast4: last, abaLast4: aba, beneficiaryMessage: row.beneficiary_message || '',
    status: row.status || 'Drafted', queueStatus: row.queue_status || '',
    auditAmount: !!row.audit_amount, auditAccountName: !!row.audit_account_name, auditAccountNumber: !!row.audit_account_number,
    auditAba: !!row.audit_aba, auditPurpose: !!row.audit_purpose, verifiedAt: row.verified_at || null, postedAt: row.posted_at || null,
  };
  const readiness = R.wireReadiness(view);
  return { ...view, accountLast4: last ? R.masked(last) : '', abaLast4: aba ? R.masked(aba) : '', accountMasked: last ? R.masked(last) : '', abaMasked: aba ? R.masked(aba) : '', readiness };
}

function escrowView(row) {
  return { id: row.id, state: row.state, accountName: row.account_name, active: row.active !== false, accountMasked: R.masked(row.account_last4) };
}

const blank = () => present({
  id: '', deal_id: '', payee_name: '', all_sellers_signed: false, notarized: false, disbursement_method: 'wire',
  payee_name_matches: false, payee_address_matches: false, seller_contact_address: '', from_account_id: '', amount: null,
  recipient_name: '', bank_name: '', account_last4: '', aba_last4: '', beneficiary_message: '', status: 'Drafted', queue_status: '',
  audit_amount: false, audit_account_name: false, audit_account_number: false, audit_aba: false, audit_purpose: false, posted_at: null,
});

export function wiresSupabase({ sb, ok, flags, me }) {
  const gate = async () => {
    if (!flags.wires) throw new Error(OFF);
    const u = await me();
    if (!u || !u.id) throw new Error('Please sign in.');
    if (!staff(u)) throw new Error(STAFF);
    return u;
  };
  const fail = (error) => { if (denied(error)) throw new Error(STAFF); throw error instanceof Error ? error : new Error(String(error && error.message || error)); };
  const run = async (q) => { const r = await q; if (r.error) fail(r.error); return r.data; };
  const dealOf = async (id) => {
    const d = ok(await sb.from('deals').select(DEAL_COLS).eq('id', id).maybeSingle());
    if (!d) throw new Error('Order not found.');
    return d;
  };
  const queueRow = (d) => ({
    id: d.id, fileNumber: d.file_number, address: [d.street, d.city, [d.state, d.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    processorName: '', transactionType: d.transaction_type, closingDate: d.closing_date, openDate: d.open_date, status: d.status, stage: d.stage,
  });
  const escrow = async () => (ok(await sb.from('escrow_accounts').select('id,state,account_name,account_last4,active').eq('active', true).is('deleted_at', null)) || []).map(escrowView);
  const rows = async (dealId) => ok(await sb.from('wire_records').select('*').eq('deal_id', dealId).is('deleted_at', null)) || [];
  const one = async (id) => { const r = ok(await sb.from('wire_records').select('*').eq('id', id).is('deleted_at', null).maybeSingle()); if (!r) throw new Error('Wire record not found.'); return r; };

  return {
    async listWireQueue() {
      await gate();
      const wires = ok(await sb.from('wire_records').select('*').is('deleted_at', null)) || [];
      const ids = [...new Set(wires.map((w) => w.deal_id))];
      const deals = ids.length ? ok(await sb.from('deals').select(DEAL_COLS).in('id', ids)) || [] : [];
      const byId = new Map(deals.map((d) => [d.id, d]));
      return wires.filter((w) => byId.has(w.deal_id)).map((w) => {
        const shown = present(w);
        return { ...queueRow(byId.get(w.deal_id)), record: shown, wire: shown, queueStatus: w.queue_status === 'Done' ? 'Done' : '' };
      });
    },
    async getWire(dealId) {
      await gate();
      const [deal, wireRows, accounts] = await Promise.all([dealOf(dealId), rows(dealId), escrow()]);
      const wires = wireRows.map(present);
      wires.push({ ...blank(), payeeName: wires.length ? 'Add a wire' : 'New wire' });
      return { deal: queueRow(deal), wires, escrowAccounts: accounts, canEdit: true };
    },
    async saveWire(dealId, input = {}) {
      await gate();
      const deal = await dealOf(dealId);
      const id = text(input.id, 80);
      const current = id && UUID.test(id) ? await one(id) : null;
      if (current && current.deal_id !== dealId) throw new Error('Wire record not found on this order.');
      if (current && current.posted_at) throw new Error('A posted wire tracking record is locked.');
      const accountLast4 = input.accountLast4 == null || input.accountLast4 === '' ? (current ? current.account_last4 : '') : wireLast4(input.accountLast4, 'Account number');
      const abaLast4 = input.abaLast4 == null || input.abaLast4 === '' ? (current ? current.aba_last4 : '') : wireLast4(input.abaLast4, 'ABA');
      if (input.disbursementMethod && !R.DISBURSEMENT_METHODS.some(([k]) => k === input.disbursementMethod)) throw new Error('Unknown disbursement method.');
      let fromAccountId = input.fromAccountId == null ? (current ? current.from_account_id : null) : text(input.fromAccountId, 80);
      if (!fromAccountId) fromAccountId = null;
      else if (!UUID.test(fromAccountId)) throw new Error('Choose an escrow account.');
      const row = {
        payee_name: text(input.payeeName), all_sellers_signed: flag(input.allSellersSigned), notarized: flag(input.notarized),
        disbursement_method: input.disbursementMethod || (current && current.disbursement_method) || 'wire',
        payee_name_matches: flag(input.payeeNameMatches), payee_address_matches: flag(input.payeeAddressMatches),
        seller_contact_address: text(input.sellerContactAddress), from_account_id: fromAccountId,
        amount: money(input.amount, 'Amount'), recipient_name: text(input.recipientName), bank_name: text(input.bankName),
        account_last4: accountLast4, aba_last4: abaLast4,
        beneficiary_message: text(input.beneficiaryMessage, 1000) || R.beneficiaryMessage({ street: deal.street, city: deal.city, state: deal.state, zip: deal.zip, fileNumber: deal.file_number }),
        status: 'Drafted', queue_status: current ? current.queue_status || '' : '',
        audit_amount: false, audit_account_name: false, audit_account_number: false, audit_aba: false, audit_purpose: false,
        verified_at: null, verified_by: null,
      };
      const saved = current
        ? await run(sb.from('wire_records').update(row).eq('id', current.id).select('*').single())
        : await run(sb.from('wire_records').insert({ ...row, deal_id: dealId, posted_at: null }).select('*').single());
      return present(saved);
    },
    async verifyWire(id, input = {}) {
      await gate();
      const w = await one(id);
      if (w.posted_at) throw new Error('A posted wire tracking record is locked.');
      const ready = R.wireReadiness({ ...present(w), accountLast4: w.account_last4, abaLast4: w.aba_last4 });
      if (!ready.ready) throw new Error(`Wire setup is incomplete: ${ready.missing.join('; ')}`);
      for (const [k, label] of R.WIRE_AUDIT) {
        const key = `audit${k[0].toUpperCase()}${k.slice(1)}`;
        if (!flag(input[key])) throw new Error(`Post-draft audit required: ${label}.`);
      }
      const saved = await run(sb.from('wire_records').update({
        status: 'Verified', audit_amount: true, audit_account_name: true, audit_account_number: true, audit_aba: true, audit_purpose: true,
        verified_at: new Date().toISOString(),
      }).eq('id', w.id).select('*').single());
      await run(sb.from('wire_audit_log').insert({
        deal_id: w.deal_id, wire_id: w.id, amount: true, account_name: true, account_number: true, aba: true, purpose: true,
      }));
      return present(saved);
    },
    async postWireDisbursement(id) {
      await gate();
      const w = await one(id);
      if (w.status !== 'Verified' || !w.verified_at) throw new Error('Complete the post-draft audit before posting.');
      if (w.posted_at) return true;
      const tasks = ok(await sb.from('tasks').select('id,title,status').eq('deal_id', w.deal_id)) || [];
      let task = tasks.find((t) => t.title === R.WIRE_TASK && t.status !== 'cancelled');
      if (!task) task = await run(sb.from('tasks').insert({ deal_id: w.deal_id, title: R.WIRE_TASK, status: 'done', kind: 'simple', assigned_role: 'Processor', description: 'Wire setup posted. Nothing was sent to a bank.' }).select('id,title,status').single());
      else if (task.status !== 'done') ok(await sb.rpc('set_task_status', { p_task: task.id, p_status: 'done' }));
      await run(sb.from('wire_records').update({ posted_at: new Date().toISOString(), queue_status: 'Done' }).eq('id', w.id).select('id').single());
      return true;
    },
    async saveEscrowAccount(input = {}) {
      const u = await gate();
      if (!u.isAdmin) throw new Error('Only an Admin changes escrow account configuration.');
      const id = text(input.id, 80);
      const patch = {};
      if (input.state != null) { const state = text(input.state, 2).toUpperCase(); if (!['MD', 'VA', 'DC', 'FL'].includes(state)) throw new Error('Escrow states are MD, VA, DC and FL.'); patch.state = state; }
      if (input.accountName != null) patch.account_name = text(input.accountName);
      if (input.accountLast4 != null && input.accountLast4 !== '') patch.account_last4 = wireLast4(input.accountLast4, 'Escrow account');
      if (input.active != null) patch.active = flag(input.active);
      if (!(id && UUID.test(id)) && (!patch.state || !patch.account_name || !patch.account_last4)) throw new Error('Escrow account needs a state, a name, and the last four digits.');
      const saved = id && UUID.test(id)
        ? await run(sb.from('escrow_accounts').update(patch).eq('id', id).select('id,state,account_name,account_last4,active').single())
        : await run(sb.from('escrow_accounts').insert({ state: patch.state, account_name: patch.account_name, account_last4: patch.account_last4, active: patch.active !== false }).select('id,state,account_name,account_last4,active').single());
      const view = escrowView(saved);
      if (view.accountLast4) delete view.accountLast4;
      return view;
    },
  };
}
