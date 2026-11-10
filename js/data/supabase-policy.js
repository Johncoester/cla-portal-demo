/* [SUPABASE] FINAL POLICY. Same names as the policy half of mock-part-fwp.js.
 * Tables already on TEST: policy_records, policy_checks, policy_exceptions, policy_endorsements fees,
 * policy_escalations. Title fields come from policy_title_data (staff only).
 * RLS is private.fwp_staff('policy', deal). Issuance is re-checked by policy_guard. Nothing is sent. */
import * as R from './funding-wire-policy.js?v=202611070139';

const OFF = 'Final Policy is turned off on this portal.';
const ROLES = ['Processor', 'Preprocessor', 'Funding Team'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEAL = 'id,file_number,street,city,state,zip,processor_id,transaction_type,closing_date,open_date,status,stage,lender_name,purchase_price,loan_amount';
const denied = (error) => /row-level security|42501|permission denied/i.test(String(error && error.message || error || ''));
const staff = (u) => !!u && !u.accountRole && u.role !== 'Outside user' && u.role !== 'Employee' && u.role !== 'Transaction Coordinator' && (!!u.isAdmin || ROLES.includes(u.role));
const text = (v, n = 2000) => String(v == null ? '' : v).trim().slice(0, n);
const flag = (v) => v === true || v === 'true' || v === 'on' || v === 'yes';
const tri = (v) => (v === '' || v == null ? null : flag(v));
const money = (v, label) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[$,]/g, '')); if (!isFinite(n) || n < 0) throw new Error(`${label} must be a positive amount.`); return Math.round(n * 100) / 100; };
const num = (v) => (v == null || v === '' ? null : Number(v));
const list = (v) => Array.isArray(v) ? v.map((z) => text(z, 100)).filter(Boolean) : text(v).split(/[\n,]/).map((z) => z.trim()).filter(Boolean);

function recordView(row) {
  const riders = row.riders || [];
  const required = row.required_endorsements || [];
  const endorsements = row.endorsements || [];
  return {
    id: row.id, dealId: row.deal_id, status: row.status || 'pending', balancedFunded: !!row.balanced_funded, deed: !!row.deed, dot: !!row.dot, closingInstructions: !!row.closing_instructions, notesReviewed: !!row.notes_reviewed,
    ownerPremium: num(row.owner_premium), lenderPremium: num(row.lender_premium), altaOwnerCollected: num(row.alta_owner_collected), altaLenderCollected: num(row.alta_lender_collected),
    lenderTitleForm: row.lender_title_form || 'none', requiredEndorsements: required, commitmentScheduleANotes: row.commitment_schedule_a_notes || '', closingInstructionsAddress: row.closing_instructions_address || '',
    closingInstructionAddressWins: row.closing_instruction_address_wins !== false, lenderClause: row.lender_clause || '', closingInstructionsVerified: !!row.closing_instructions_verified,
    deedVesting: row.deed_vesting || '', deedVestingMatches: row.deed_vesting_matches, deedPrice: num(row.deed_price), deedPriceMatches: row.deed_price_matches, deedEstate: row.deed_estate || '', deedEstateMatches: row.deed_estate_matches,
    dotBorrower: row.dot_borrower || '', dotLender: row.dot_lender || '', dotTrustee: row.dot_trustee || '', dotAmount: num(row.dot_amount), dotDate: row.dot_date || '', borrowerMatches: row.borrower_matches, lenderMatches: row.lender_matches, trusteeMatches: row.trustee_matches, amountMatches: row.amount_matches,
    riders, ridersAttached: row.riders_attached, ownerPolicyType: row.owner_policy_type || '', lenderPolicyType: row.lender_policy_type || '', ownerSignatory: row.owner_signatory || '', lenderSignatory: row.lender_signatory || '', endorsements,
    issueOwner: row.issue_owner !== false, issueLender: row.issue_lender !== false, ratesChanged: row.rates_changed, lastRefreshedPremium: num(row.last_refreshed_premium),
    insuredVesting: row.insured_vesting || '', insuredIsTrust: !!row.insured_is_trust, estateType: row.estate_type || '', effectiveDate: row.effective_date || '', useRecordingDate: row.use_recording_date !== false, includeEndorsements: row.include_endorsements !== false,
    grantor: row.grantor || '', trustee: row.trustee || '', lender: row.lender || '', recordingDate: row.recording_date || '', instrumentNumber: row.instrument_number || '', bookPage: row.book_page || '',
    issuedAt: row.issued_at || null, completedAt: row.completed_at || null, completedLender: row.completed_lender, completedOwner: row.completed_owner, completedType: row.completed_type || '',
    ownerDocumentId: row.owner_document_id || null, lenderDocumentId: row.lender_document_id || null,
  };
}

export function policySupabase({ sb, ok, flags, me }) {
  const fail = (error) => { if (denied(error)) throw new Error(R.FWP_STAFF_ONLY); throw error instanceof Error ? error : new Error(String(error && error.message || error)); };
  const run = async (q) => { const r = await q; if (r.error) fail(r.error); return r.data; };
  const gate = async () => {
    if (!flags.policy) throw new Error(OFF);
    const u = await me();
    if (!u || !u.id) throw new Error('Please sign in.');
    if (!staff(u)) throw new Error(R.FWP_STAFF_ONLY);
    return u;
  };
  const dealOf = async (id) => { const d = ok(await sb.from('deals').select(DEAL).eq('id', id).maybeSingle()); if (!d) throw new Error('Order not found.'); return d; };
  const queueRow = (d, record) => ({ id: d.id, fileNumber: d.file_number, address: [d.street, d.city, [d.state, d.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '), processorName: '', transactionType: d.transaction_type, closingDate: d.closing_date, openDate: d.open_date, status: d.status, stage: d.stage, record });
  const rowOf = async (id) => ok(await sb.from('policy_records').select('*').eq('deal_id', id).maybeSingle());
  const ensure = async (id, deal) => {
    const cur = await rowOf(id);
    if (cur && !cur.deleted_at) return cur;
    const seed = { lender: deal.lender_name || '', lender_clause: deal.lender_name ? `${deal.lender_name} its successors and/or assigns` : '', dot_lender: deal.lender_name || '', effective_date: deal.closing_date || null, status: 'pending' };
    if (cur) return run(sb.from('policy_records').update({ ...seed, deleted_at: null }).eq('id', cur.id).select('*').single());
    return run(sb.from('policy_records').insert({ deal_id: id, ...seed }).select('*').single());
  };
  const titleOf = async (dealId) => {
    let raw = null;
    try { raw = ok(await sb.rpc('policy_title_data', { p_deal: dealId })); } catch (e) { raw = null; }
    const row = Array.isArray(raw) ? raw[0] : raw;
    return { underwriter: (row && row.underwriter) || '', commitmentNumber: (row && row.commitment_number) || '', commitmentStatus: (row && row.commitment_status) || '', effectiveDate: (row && row.effective_date) || '', lenderPolicyType: (row && row.lender_policy_type) || '', ownerPolicyType: (row && row.owner_policy_type) || '', cplCount: 0 };
  };
  const pieces = async (dealId) => ({
    checks: (ok(await sb.from('policy_checks').select('*').eq('deal_id', dealId).is('deleted_at', null)) || []).map((c) => ({ id: c.id, checkKey: c.check_key, passed: !!c.passed, note: c.note || '' })),
    exceptions: (ok(await sb.from('policy_exceptions').select('*').eq('deal_id', dealId).is('deleted_at', null).order('position')) || []).map((e) => ({ id: e.id, policySide: e.policy_side, exceptionKey: e.exception_key, text: e.text, position: e.position, included: e.included !== false })),
    escalations: (ok(await sb.from('policy_escalations').select('*').eq('deal_id', dealId).is('deleted_at', null)) || []).map((e) => ({ id: e.id, type: e.type, description: e.description, status: e.status, resolutionNote: e.resolution_note || '' })),
    outbox: (ok(await sb.from('outbox').select('id,subject,to_email,status,kind,deal_id').eq('deal_id', dealId)) || []).filter((o) => String(o.kind || '').startsWith('policy')),
  });
  const view = async (deal, row) => {
    const p = recordView(row);
    const extra = await pieces(deal.id);
    const blockers = R.policyBlockers(p, extra.escalations, [], false);
    const warnings = extra.exceptions.filter((e) => e.included).flatMap((e) => R.unfilledVariables(e.text).map((v) => `${e.exceptionKey}: ${v}`));
    return { deal: queueRow(deal, p), record: p, title: await titleOf(deal.id), ...extra, blockers, finalBlockers: R.policyBlockers(p, extra.escalations, extra.checks, !p.completedAt), warnings, canEdit: true };
  };
  const patchFrom = (input) => {
    const spec = { balancedFunded: 'b', deed: 'b', dot: 'b', closingInstructions: 'b', notesReviewed: 'b', ownerPremium: 'm', lenderPremium: 'm', altaOwnerCollected: 'm', altaLenderCollected: 'm', lenderTitleForm: 's', requiredEndorsements: 'a', commitmentScheduleANotes: 's', closingInstructionsAddress: 's', closingInstructionAddressWins: 'b', lenderClause: 's', closingInstructionsVerified: 'b', deedVesting: 's', deedVestingMatches: 't', deedPrice: 'm', deedPriceMatches: 't', deedEstate: 's', deedEstateMatches: 't', dotBorrower: 's', dotLender: 's', dotTrustee: 's', dotAmount: 'm', dotDate: 'd', borrowerMatches: 't', lenderMatches: 't', trusteeMatches: 't', amountMatches: 't', riders: 'a', ridersAttached: 't', ownerPolicyType: 's', lenderPolicyType: 's', ownerSignatory: 's', lenderSignatory: 's', endorsements: 'a', issueOwner: 'b', issueLender: 'b', insuredVesting: 's', insuredIsTrust: 'b', estateType: 's', effectiveDate: 'd', useRecordingDate: 'b', includeEndorsements: 'b', grantor: 's', trustee: 's', lender: 's', recordingDate: 'd', instrumentNumber: 's', bookPage: 's' };
    const col = { balancedFunded: 'balanced_funded', deed: 'deed', dot: 'dot', closingInstructions: 'closing_instructions', notesReviewed: 'notes_reviewed', ownerPremium: 'owner_premium', lenderPremium: 'lender_premium', altaOwnerCollected: 'alta_owner_collected', altaLenderCollected: 'alta_lender_collected', lenderTitleForm: 'lender_title_form', requiredEndorsements: 'required_endorsements', commitmentScheduleANotes: 'commitment_schedule_a_notes', closingInstructionsAddress: 'closing_instructions_address', closingInstructionAddressWins: 'closing_instruction_address_wins', lenderClause: 'lender_clause', closingInstructionsVerified: 'closing_instructions_verified', deedVesting: 'deed_vesting', deedVestingMatches: 'deed_vesting_matches', deedPrice: 'deed_price', deedPriceMatches: 'deed_price_matches', deedEstate: 'deed_estate', deedEstateMatches: 'deed_estate_matches', dotBorrower: 'dot_borrower', dotLender: 'dot_lender', dotTrustee: 'dot_trustee', dotAmount: 'dot_amount', dotDate: 'dot_date', borrowerMatches: 'borrower_matches', lenderMatches: 'lender_matches', trusteeMatches: 'trustee_matches', amountMatches: 'amount_matches', riders: 'riders', ridersAttached: 'riders_attached', ownerPolicyType: 'owner_policy_type', lenderPolicyType: 'lender_policy_type', ownerSignatory: 'owner_signatory', lenderSignatory: 'lender_signatory', endorsements: 'endorsements', issueOwner: 'issue_owner', issueLender: 'issue_lender', insuredVesting: 'insured_vesting', insuredIsTrust: 'insured_is_trust', estateType: 'estate_type', effectiveDate: 'effective_date', useRecordingDate: 'use_recording_date', includeEndorsements: 'include_endorsements', grantor: 'grantor', trustee: 'trustee', lender: 'lender', recordingDate: 'recording_date', instrumentNumber: 'instrument_number', bookPage: 'book_page' };
    const out = {};
    for (const [k, v] of Object.entries(input || {})) {
      const t = spec[k]; if (!t) continue;
      const name = col[k];
      if (t === 'b') out[name] = flag(v);
      else if (t === 't') out[name] = tri(v);
      else if (t === 'm') out[name] = money(v, k);
      else if (t === 'a') out[name] = list(v);
      else if (t === 'd') out[name] = text(v, 10) || null;
      else out[name] = text(v);
    }
    if (out.lender_title_form && !R.POLICY_FORMS.some(([k]) => k === out.lender_title_form)) throw new Error('Unknown lender title form.');
    if (out.estate_type && !R.ESTATE_TYPES.includes(out.estate_type)) throw new Error('Estate type is Fee Simple or Leasehold.');
    if (out.owner_policy_type && !R.POLICY_TYPES.includes(out.owner_policy_type)) throw new Error('Unknown owner policy type.');
    if (out.lender_policy_type && !R.POLICY_TYPES.includes(out.lender_policy_type)) throw new Error('Unknown lender policy type.');
    if (out.insured_vesting != null || out.insured_is_trust != null) out.insured_vesting = R.insuredVesting(out.insured_vesting || '', !!out.insured_is_trust);
    return out;
  };

  return {
    async listPolicyQueue(filters = {}) {
      await gate();
      const deals = (ok(await sb.from('deals').select(DEAL)) || []).map((d) => ({ id: d.id, transactionType: d.transaction_type, openDate: d.open_date, closingDate: d.closing_date, commitmentDate: d.commitment_date || '', buyerClosingPackageDate: d.buyer_closing_package_date || '', fileNumber: d.file_number, street: d.street, city: d.city, state: d.state, zip: d.zip, status: d.status, stage: d.stage }));
      const rows = ok(await sb.from('policy_records').select('*').is('deleted_at', null)) || [];
      const funding = ok(await sb.from('funding_records').select('deal_id,disbursed_at').is('deleted_at', null)) || [];
      const disb = new Map(funding.map((f) => [f.deal_id, f.disbursed_at || null]));
      return R.policyQueue(deals, rows.map((r) => ({ ...recordView(r), deletedAt: null })), filters).map(({ deal, record }) => ({ ...queueRow(deal, record), fundingDate: disb.get(deal.id) || null, disbursementDate: disb.get(deal.id) || null, title: { underwriter: '', commitmentNumber: '', commitmentStatus: '', cplCount: 0 } }));
    },
    async getPolicy(dealId) { await gate(); const deal = await dealOf(dealId); return view(deal, await ensure(dealId, deal)); },
    async savePolicy(dealId, input) {
      await gate();
      const deal = await dealOf(dealId);
      const cur = await ensure(dealId, deal);
      if (cur.completed_at) throw new Error('A completed policy log is locked.');
      await run(sb.from('policy_records').update(patchFrom(input)).eq('id', cur.id).select('id').single());
      return this.getPolicy(dealId);
    },
    async refreshPolicyRates(dealId, input = {}) {
      await gate();
      const deal = await dealOf(dealId);
      const cur = await ensure(dealId, deal);
      const before = Math.round(((Number(cur.owner_premium) || 0) + (Number(cur.lender_premium) || 0)) * 100);
      const owner = money(input.ownerPremium, 'Owner premium'); const lender = money(input.lenderPremium, 'Lender premium');
      const after = Math.round(((owner || 0) + (lender || 0)) * 100);
      const endorsements = [...new Set([...(cur.endorsements || []), ...list(input.endorsements), ...(cur.riders || []).map((r) => R.RIDER_ENDORSEMENTS[r]).filter(Boolean)])];
      await run(sb.from('policy_records').update({ owner_premium: owner, lender_premium: lender, endorsements, rates_changed: before !== after, last_refreshed_premium: after / 100 }).eq('id', cur.id).select('id').single());
      const fee = money(input.uncollectedEndorsementFee || 0, 'Endorsement fee') || 0;
      if (fee > 0) {
        await run(sb.from('policy_endorsement_fees').insert({ deal_id: dealId, endorsement: text(input.endorsement) || 'Endorsement', amount: fee, collected_at_closing: false, status: 'open' }).select('id').single());
        await this.queuePolicyEscalation(dealId, { type: 'uncollected_endorsement_fee', description: `${input.endorsement || 'Endorsement'} adds ${R.money(fee)} that was not collected at closing.` });
      }
      return this.getPolicy(dealId);
    },
    async addPolicyException(dealId, input = {}) {
      await gate();
      const deal = await dealOf(dealId);
      await ensure(dealId, deal);
      const side = input.policySide === 'lender' ? 'lender' : 'owner';
      const key = text(input.exceptionKey, 80) || 'custom';
      if (side === 'lender' && R.STANDARD_LENDER_REMOVALS.includes(key) && flag(input.included)) throw new Error('The lender policy removes this standard exception.');
      const body = text(input.text, 4000);
      if (!body) throw new Error('Exception text is required.');
      return run(sb.from('policy_exceptions').insert({ deal_id: dealId, policy_side: side, exception_key: key, text: body, position: Number(input.position) || 99, included: input.included == null ? true : flag(input.included), auto_added: false }).select('*').single());
    },
    async queuePolicyEscalation(dealId, input = {}) {
      await gate();
      const deal = await dealOf(dealId);
      await ensure(dealId, deal);
      const type = text(input.type);
      if (!['premium_mismatch', 'deed_mismatch', 'uncollected_endorsement_fee'].includes(type)) throw new Error('Unknown escalation type.');
      const description = text(input.description, 2000) || 'Policy issue needs resolution before issuance.';
      const row = await run(sb.from('policy_escalations').insert({ deal_id: dealId, type, description, status: 'open' }).select('*').single());
      const who = type === 'premium_mismatch' ? { email: 'manager@example.test', name: 'Title Manager (FAKE)' } : { email: 'processor@example.test', name: 'Processor (FAKE)' };
      const id = await run(sb.rpc('queue_staff_outbox', { p_deal: dealId, p_module: 'policy', p_type: type, p_email: who.email, p_name: who.name, p_profile: null, p_subject: `Policy escalation: ${type.replaceAll('_', ' ')} - ${deal.file_number}`, p_body: description }));
      if (UUID.test(String(id || ''))) await run(sb.from('policy_escalations').update({ outbox_ids: [id] }).eq('id', row.id).select('id').single());
      return { id: row.id, type, description, status: 'open' };
    },
    async resolvePolicyEscalation(id, note) {
      await gate();
      if (!text(note)) throw new Error('Add a resolution note.');
      const cur = ok(await sb.from('policy_escalations').select('id,deal_id').eq('id', id).maybeSingle());
      if (!cur) throw new Error('Record not found.');
      await dealOf(cur.deal_id);
      await run(sb.from('policy_escalations').update({ status: 'resolved', resolution_note: text(note), resolved_at: new Date().toISOString() }).eq('id', id).select('id').single());
      return true;
    },
    async setPolicyCheck(dealId, key, passed, note = '') {
      await gate();
      const deal = await dealOf(dealId);
      if (!R.SIGNATURE_CHECKS.some(([k]) => k === key)) throw new Error('Unknown signature / Schedule A check.');
      await ensure(dealId, deal);
      const cur = (ok(await sb.from('policy_checks').select('*').eq('deal_id', dealId).eq('check_key', key).is('deleted_at', null)) || [])[0];
      const patch = { passed: !!passed, note: text(note), checked_at: new Date().toISOString() };
      const saved = cur ? await run(sb.from('policy_checks').update(patch).eq('id', cur.id).select('*').single()) : await run(sb.from('policy_checks').insert({ deal_id: dealId, check_key: key, ...patch }).select('*').single());
      return { id: saved.id, checkKey: saved.check_key, passed: !!saved.passed };
    },
    async issuePolicies(dealId) {
      await gate();
      const u = await me();
      const deal = await dealOf(dealId);
      const v = await view(deal, await ensure(dealId, deal));
      if (v.blockers.length) throw new Error(`Policy issuance is blocked: ${v.blockers.join('; ')}`);
      const p = v.record;
      const mk = async (side) => {
        const doc = await run(sb.from('documents').insert({ deal_id: dealId, name: `Full ${side === 'owner' ? 'Owner' : 'Lender'} Policy - ${deal.file_number}.pdf`, description: 'Final issued policy record. Fake. No PDF was generated.', mime_type: 'application/pdf', visibility: 'staff', uploaded_by: u.id, wire_instructions: false }).select('id').single());
        return doc.id;
      };
      const ownerDocumentId = p.issueOwner && !p.ownerDocumentId ? await mk('owner') : p.ownerDocumentId;
      const lenderDocumentId = p.issueLender && !p.lenderDocumentId ? await mk('lender') : p.lenderDocumentId;
      await run(sb.from('policy_records').update({ status: 'issued', issued_at: new Date().toISOString(), owner_document_id: ownerDocumentId, lender_document_id: lenderDocumentId }).eq('deal_id', dealId).select('id').single());
      return { issued: true, warnings: v.warnings, ownerDocumentId, lenderDocumentId, underwriterCopyQueued: false };
    },
    async completePolicy(dealId) {
      await gate();
      const deal = await dealOf(dealId);
      const v = await view(deal, await ensure(dealId, deal));
      const p = v.record;
      if (!p.issuedAt) throw new Error('Issue the policies first.');
      if (v.finalBlockers.length) throw new Error(`Final verification is incomplete: ${v.finalBlockers.join('; ')}`);
      await run(sb.from('policy_records').update({ status: 'completed', completed_at: new Date().toISOString(), completed_lender: p.issueLender, completed_owner: p.issueOwner, completed_type: deal.transaction_type || '' }).eq('deal_id', dealId).select('id').single());
      const tasks = ok(await sb.from('tasks').select('id,title,status').eq('deal_id', dealId)) || [];
      const t = tasks.find((z) => z.title === R.POLICY_TASK && z.status !== 'cancelled');
      if (!t) await run(sb.from('tasks').insert({ deal_id: dealId, title: R.POLICY_TASK, status: 'done', kind: 'simple', assigned_role: 'Processor', description: 'Final policy completed. Nothing was sent.' }).select('id').single());
      else if (t.status !== 'done') ok(await sb.rpc('set_task_status', { p_task: t.id, p_status: 'done' }));
      return { completed: true, lender: p.issueLender, owner: p.issueOwner, type: deal.transaction_type };
    },
  };
}
