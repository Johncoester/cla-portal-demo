/* [SUPABASE] Post-Closing scanbacks and E-Recording. Same names as mock-part-recording.js.
 * Tables already on TEST: post_closing_scanbacks, scanback_documents, scanback_events,
 * recording_packages, recording_instruments, recording_review_checks, recording_events.
 * RLS: private.post_closing_reader / post_closing_editor. Sales read. Processor, TC, and Admin edit.
 * Agents, buyers, and sellers get no rows. Outbox rows are queued only (queue_staff_outbox). Nothing is sent. */
import * as R from './recording-scanbacks.js?v=202611070139';

const READ = ['Processor', 'Transaction Coordinator', 'Sales Person', 'Sales Team'];
const EDIT = ['Processor', 'Transaction Coordinator'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEAL = 'id,file_number,street,city,state,zip,transaction_type,closing_date,processor_id,purchase_price,loan_amount,status';
const denied = (error) => /row-level security|42501|permission denied|staff only/i.test(String(error && error.message || error || ''));

const staffRead = (u) => !!u && !u.accountRole && u.role !== 'Outside user' && u.role !== 'Employee' && (!!u.isAdmin || READ.includes(u.role));
const staffEdit = (u) => !!u && !u.accountRole && (!!u.isAdmin || EDIT.includes(u.role));

function scanView(row) {
  if (!row || row.deleted_at) return null;
  return {
    id: row.id, dealId: row.deal_id, buyerSide: row.buyer_side, sellerSide: row.seller_side, buyerSource: row.buyer_source, sellerSource: row.seller_source,
    receivedThankYou: row.received_thank_you, fileNumberMatch: row.file_number_match, addressMatch: row.address_match, buyerNamesMatch: row.buyer_names_match, sellerNamesMatch: row.seller_names_match,
    purchaseRefi: row.purchase_refi, faNeeded: row.fa_needed, fundingDate: row.funding_date, cashDeal: row.cash_deal, eSigned: row.e_signed, additionalNotes: row.additional_notes || '',
    signedNotarized: row.signed_notarized, settlementAgentStamped: row.settlement_agent_stamped, faStatus: row.fa_status || 'not_started', buyerCopiesSent: row.buyer_copies_sent, sellerCopiesSent: row.seller_copies_sent, auditResolved: row.audit_resolved,
  };
}
function docView(row) {
  return { id: row.id, dealId: row.deal_id, kind: row.kind, present: !!row.present, documentId: row.document_id || row.document_ref || null, folder: row.folder };
}
function recView(row, deal) {
  if (!row || row.deleted_at) return null;
  const view = {
    id: row.id, dealId: row.deal_id, disbursementDate: row.disbursement_date, processorName: row.processor_name || '', recordingMethod: row.recording_method, methodNote: row.method_note || '',
    assignedTo: row.assigned_to || '', recordingInstructions: row.recording_instructions || '', packageName: row.package_name || '', paymentAccount: row.payment_account || '',
    deedDocumentId: row.deed_document_id || '', dotDocumentId: row.dot_document_id || '', mdIntakeAttached: row.md_intake_attached, mdClearMortgageBalance: row.md_clear_mortgage_balance,
    mdSubdivision: row.md_subdivision || '', mdDocument2GranteeTrustee: row.md_document2_grantee_trustee, mdReturnToPostClosing: row.md_return_to_post_closing, whArExemption: row.wh_ar_exemption,
    firstTimeHomeBuyer: row.first_time_home_buyer, ownerOccupancy: row.owner_occupancy, propertyTaxRequired: row.property_tax_required, countyTaxAmount: num(row.county_tax_amount), accountingTaxAmount: num(row.accounting_tax_amount),
    collectedFees: num(row.collected_fees), estimatedFees: num(row.estimated_fees), platformFeePaid: row.platform_fee_paid, status: row.status || 'draft', sentReceived: row.sent_received, rejectionReason: row.rejection_reason || '',
    recordedDate: row.recorded_date, releaseFundsNotified: row.release_funds_notified,
  };
  return { ...view, balanced: R.recordingBalanced(view), docStatus: R.recordingDocStatus(view), priority: !!(deal && ['VA', 'NC'].includes(deal.state)) };
}
function instView(row) {
  return { id: row.id, dealId: row.deal_id, kind: row.kind, instrumentType: row.instrument_type, documentId: row.document_id, grantor: row.grantor, grantee: row.grantee, tenancy: row.tenancy, zip: row.zip, consideration: num(row.consideration), lender: row.lender, returnTo: row.return_to, collectedFee: num(row.collected_fee), estimatedFee: num(row.estimated_fee) };
}
const num = (v) => (v == null || v === '' ? null : Number(v));
const pack = (row) => Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
const today = () => new Date().toLocaleDateString('en-CA');

export function postClosingSupabase({ sb, ok, flags, me }) {
  const fail = (error) => {
    if (denied(error)) throw new Error(R.PC_STAFF_ONLY);
    throw error instanceof Error ? error : new Error(String(error && error.message || error));
  };
  const run = async (q) => { const r = await q; if (r.error) fail(r.error); return r.data; };
  const gate = async (edit) => {
    if (!flags.accounting) throw new Error(R.PC_OFF);
    const u = await me();
    if (!u || !u.id) throw new Error('Please sign in.');
    if (!staffRead(u)) throw new Error(R.PC_STAFF_ONLY);
    if (edit && !staffEdit(u)) throw new Error('Read only for your role.');
    return u;
  };
  const dealOf = async (id) => {
    const d = ok(await sb.from('deals').select(DEAL).eq('id', id).maybeSingle());
    if (!d) throw new Error('Order not found.');
    return d;
  };
  const scanRow = async (id) => ok(await sb.from('post_closing_scanbacks').select('*').eq('deal_id', id).maybeSingle());
  const recRow = async (id) => ok(await sb.from('recording_packages').select('*').eq('deal_id', id).maybeSingle());
  const event = async (table, dealId, action, detail) => { await run(sb.from(table).insert({ deal_id: dealId, action, detail: String(detail || '').slice(0, 500) })); };
  const finishTask = async (dealId, title) => {
    const tasks = ok(await sb.from('tasks').select('id,title,status').eq('deal_id', dealId)) || [];
    const t = tasks.find((z) => String(z.title).toLowerCase() === title.toLowerCase() && z.status !== 'cancelled');
    if (!t) await run(sb.from('tasks').insert({ deal_id: dealId, title, status: 'done', kind: 'simple', assigned_role: 'Processor', description: 'Post-closing workflow task' }).select('id').single());
    else if (t.status !== 'done') ok(await sb.rpc('set_task_status', { p_task: t.id, p_status: 'done' }));
  };
  const queue = async (dealId, module, type, to, subject, body) => ok(await sb.rpc('queue_staff_outbox', {
    p_deal: dealId, p_module: module, p_type: type, p_email: to.email, p_name: to.name || '', p_profile: to.profileId || null, p_subject: subject, p_body: body,
  }));
  const ensureScan = async (id) => {
    const cur = await scanRow(id);
    if (cur && !cur.deleted_at) return cur;
    if (cur) return run(sb.from('post_closing_scanbacks').update({ deleted_at: null, fa_status: cur.fa_status || 'not_started' }).eq('id', cur.id).select('*').single());
    return run(sb.from('post_closing_scanbacks').insert({ deal_id: id, fa_status: 'not_started', additional_notes: '' }).select('*').single());
  };
  const ensureRec = async (id, deal) => {
    const cur = await recRow(id);
    if (cur && !cur.deleted_at) return cur;
    const seed = { disbursement_date: today(), recording_method: 'online', package_name: R.packageName({ fileNumber: deal.file_number, transactionType: deal.transaction_type }), payment_account: `${deal.state || ''} - echeck`, status: 'draft' };
    if (cur) return run(sb.from('recording_packages').update({ ...seed, deleted_at: null }).eq('id', cur.id).select('*').single());
    return run(sb.from('recording_packages').insert({ deal_id: id, transaction_type: deal.transaction_type || null, ...seed }).select('*').single());
  };
  const docId = async (dealId, value) => {
    const s = String(value == null ? '' : value).trim();
    if (!s) return null;
    if (UUID.test(s)) return s;
    const docs = ok(await sb.from('documents').select('id,name').eq('deal_id', dealId)) || [];
    const hit = docs.find((d) => d.name === s);
    if (!hit) throw new Error('Use a document id from this file, or leave the recording doc ref blank.');
    return hit.id;
  };

  return {
    async getPostClosing(id) {
      const u = await gate(false);
      const [deal, scanRaw, recRaw, docRows, instRows, checkRows, boxRows] = await Promise.all([
        dealOf(id), scanRow(id), recRow(id),
        sb.from('scanback_documents').select('*').eq('deal_id', id).is('deleted_at', null),
        sb.from('recording_instruments').select('*').eq('deal_id', id).is('deleted_at', null),
        sb.from('recording_review_checks').select('*').eq('deal_id', id).is('deleted_at', null),
        sb.from('outbox').select('id,post_closing_type,to_name,subject,status,deal_id').eq('deal_id', id),
      ]);
      const scan = scanView(scanRaw);
      const rec = recView(recRaw, deal);
      const docs = (ok(docRows) || []).map(docView);
      const instruments = (ok(instRows) || []).map(instView);
      const checks = (ok(checkRows) || []).map((z) => ({ id: z.id, dealId: z.deal_id, key: z.check_key, groupName: z.group_name, label: z.label, done: !!z.done, note: z.note || '' }));
      const box = (ok(boxRows) || []).filter((o) => o.post_closing_type).map((o) => ({ id: o.id, postClosingType: o.post_closing_type, toName: o.to_name, subject: o.subject, status: o.status }));
      return {
        deal: { id: deal.id, fileNumber: deal.file_number, state: deal.state, transactionType: deal.transaction_type, closingDate: deal.closing_date },
        canEdit: staffEdit(u), fundingLink: flags.funding ? `#/deals/${id}/funding` : null, scanback: scan, scanbackDocs: docs, scanbackEvents: [],
        recording: rec, recordingDocs: instruments, recordingChecks: checks, recordingEvents: [],
        audits: scan ? R.scanAudits(scan, { closingDate: deal.closing_date, transactionType: deal.transaction_type }, today()) : [], team: [], outbox: box,
      };
    },
    async listPostClosingQueue() {
      await gate(false);
      const [deals, scans, recs] = (await Promise.all([
        sb.from('deals').select(DEAL),
        sb.from('post_closing_scanbacks').select('*').is('deleted_at', null),
        sb.from('recording_packages').select('*').is('deleted_at', null),
      ])).map((r) => ok(r) || []);
      const scanBy = new Map(scans.map((s) => [s.deal_id, s]));
      const recBy = new Map(recs.map((s) => [s.deal_id, s]));
      return deals.map((deal) => ({
        deal: { id: deal.id, fileNumber: deal.file_number, state: deal.state, transactionType: deal.transaction_type },
        scanback: scanView(scanBy.get(deal.id)), recording: recView(recBy.get(deal.id), deal),
      })).filter((r) => r.scanback || r.recording).sort((a, b) => {
        const aa = R.scanPriority(a.scanback || {}, a.deal); const bb = R.scanPriority(b.scanback || {}, b.deal);
        return aa[0] - bb[0] || aa[1] - bb[1] || String(aa[2]).localeCompare(String(bb[2]));
      });
    },
    async startPostClosing(id) {
      await gate(true);
      const deal = await dealOf(id);
      await ensureScan(id); await ensureRec(id, deal);
      return this.getPostClosing(id);
    },
    async saveScanback(id, input) {
      await gate(true);
      await ensureScan(id);
      const c = R.cleanTyped(input, R.SCAN_FIELDS, 'Scanbacks');
      const row = {
        buyer_side: c.buyerSide, seller_side: c.sellerSide, buyer_source: c.buyerSource, seller_source: c.sellerSource, received_thank_you: c.receivedThankYou,
        file_number_match: c.fileNumberMatch, address_match: c.addressMatch, buyer_names_match: c.buyerNamesMatch, seller_names_match: c.sellerNamesMatch, purchase_refi: c.purchaseRefi,
        fa_needed: c.faNeeded, funding_date: c.fundingDate, cash_deal: c.cashDeal, e_signed: c.eSigned, additional_notes: c.additionalNotes ?? '', signed_notarized: c.signedNotarized,
        settlement_agent_stamped: c.settlementAgentStamped, fa_status: c.faStatus || 'not_started', buyer_copies_sent: c.buyerCopiesSent, seller_copies_sent: c.sellerCopiesSent, audit_resolved: c.auditResolved,
      };
      const saved = await run(sb.from('post_closing_scanbacks').update(pack(row)).eq('deal_id', id).select('*').single());
      await event('scanback_events', id, 'saved', 'Intake and PC Package Log saved');
      return scanView(saved);
    },
    async setScanbackDoc(id, kind, present) {
      await gate(true);
      if (!R.SCAN_DOCS.includes(kind)) throw new Error('Unknown scanback document.');
      await ensureScan(id);
      const cur = ok(await sb.from('scanback_documents').select('*').eq('deal_id', id).eq('kind', kind).maybeSingle());
      const patch = { present: !!present, document_ref: present ? (cur && cur.document_ref) || 'fake-ref' : '', folder: R.SCAN_FOLDER };
      const saved = cur
        ? await run(sb.from('scanback_documents').update({ ...patch, deleted_at: null }).eq('id', cur.id).select('*').single())
        : await run(sb.from('scanback_documents').insert({ deal_id: id, kind, ...patch }).select('*').single());
      return docView(saved);
    },
    async queueScanback(id, type) {
      await gate(true);
      const deal = await dealOf(id);
      const scan = await ensureScan(id);
      const docs = ok(await sb.from('scanback_documents').select('kind,present').eq('deal_id', id).is('deleted_at', null)) || [];
      const present = (k) => docs.some((z) => z.kind === k && z.present);
      const file = deal.file_number;
      const sent = [];
      if (type === 'received') sent.push(await queue(id, 'post-closing', 'received_thank_you', { email: 'notary@example.test', name: 'Notary / closer (fake)' }, `Received - ${file}`, 'Received, thank you.'));
      else if (type === 'fa') {
        if (!scan.fa_needed) throw new Error('This file does not require FA.');
        if (!present('DOCS FOR FA')) throw new Error('Add DOCS FOR FA before queueing the secure portal package.');
        sent.push(await queue(id, 'post-closing', 'funding_authorization_secure_portal', { email: 'secure-portal@example.test', name: 'Lender secure portal (fake)' }, `Post Closing - Funding Docs - ${file}`, 'Secure portal upload queued. Never plain email.'));
        await run(sb.from('post_closing_scanbacks').update({ fa_status: 'queued' }).eq('deal_id', id).select('id').single());
        await finishTask(id, 'Funding Authorization Request Sent');
      } else if (type === 'fa_followup') {
        if (!scan.fa_needed) throw new Error('This file does not require FA.');
        sent.push(await queue(id, 'post-closing', 'funding_authorization_followup', { email: 'secure-portal@example.test', name: 'Lender secure portal (fake)' }, `Funding authorization follow-up - ${file}`, 'Secure-portal follow-up queued.'));
        await run(sb.from('post_closing_scanbacks').update({ fa_status: 'follow_up' }).eq('deal_id', id).select('id').single());
      } else if (type === 'agents') {
        if (!present('COMBINED ALTA')) throw new Error('Add COMBINED ALTA first.');
        const parts = ok(await sb.from('deal_participants').select('role,contact_id').eq('deal_id', id)) || [];
        const ids = parts.filter((p) => ['Listing Agent', 'Buyer Agent', 'Sales Person', 'Sales Team', 'Transaction Coordinator'].includes(p.role)).map((p) => p.contact_id).filter(Boolean);
        const contacts = ids.length ? ok(await sb.from('contacts').select('id,first_name,last_name,email').in('id', ids)) || [] : [];
        const tos = contacts.filter((c) => c.email).map((c) => ({ email: c.email, name: `${c.first_name || ''} ${c.last_name || ''}`.trim() }));
        if (!tos.length) throw new Error('No agent / salesperson / TC recipients on this order.');
        for (const to of tos) sent.push(await queue(id, 'post-closing', 'alta_to_agents', to, `Post Closing - ALTA to All Agents - ${file}`, 'Combined final signed ALTA attached (fake ref).'));
        await finishTask(id, 'Send final signed ALTA to Agents');
      } else if (type === 'signed_buyer') {
        sent.push(await queue(id, 'post-closing', 'signed_buyer', { email: 'buyer@example.test', name: 'Buyer (fake)' }, `Signed closing documents - ${file}`, 'Signed copies queued.'));
        await run(sb.from('post_closing_scanbacks').update({ buyer_copies_sent: true }).eq('deal_id', id).select('id').single());
      } else if (type === 'signed_seller') {
        sent.push(await queue(id, 'post-closing', 'signed_seller', { email: 'seller@example.test', name: 'Seller (fake)' }, `Signed closing documents - ${file}`, 'Signed copies queued.'));
        await run(sb.from('post_closing_scanbacks').update({ seller_copies_sent: true }).eq('deal_id', id).select('id').single());
      } else throw new Error('Unknown post-closing queue.');
      await event('scanback_events', id, type, `${sent.length} queued outbox row(s); nothing sent`);
      return sent;
    },
    async setFundingAuthorization(id, status) {
      await gate(true);
      const deal = await dealOf(id);
      if (!['approved', 'additional_docs'].includes(status)) throw new Error('Unknown FA result.');
      await ensureScan(id);
      if (status === 'approved') {
        await run(sb.from('post_closing_scanbacks').update({ fa_status: 'approved' }).eq('deal_id', id).select('id').single());
        await finishTask(id, 'Funding Authorization Received');
      } else {
        await this.queueScanback(id, 'fa_followup');
        await run(sb.from('post_closing_scanbacks').update({ fa_status: 'additional_docs' }).eq('deal_id', id).select('id').single());
        await queue(id, 'post-closing', 'alert', { email: 'postclosing@example.test', name: 'Post Closing' }, `Additional documents requested for ${deal.file_number}`, 'In-app team alert queued. Nothing was sent.');
      }
      await event('scanback_events', id, status, 'Funding authorization result');
      return true;
    },
    async completeIntakeTasks(id, side) {
      await gate(true);
      if (!['buyer', 'seller'].includes(side)) throw new Error('Unknown side.');
      await ensureScan(id);
      await run(sb.from('post_closing_scanbacks').update(side === 'buyer' ? { buyer_side: true } : { seller_side: true }).eq('deal_id', id).select('id').single());
      await finishTask(id, side === 'buyer' ? 'Receive Buyer Scanbacks/ID' : 'Receive Seller Scanbacks/ID');
      await finishTask(id, side === 'buyer' ? 'Received Buyer ID' : 'Received Seller ID');
      return true;
    },
    async saveRecording(id, input) {
      await gate(true);
      const deal = await dealOf(id);
      await ensureRec(id, deal);
      const c = R.cleanTyped(input, R.REC_FIELDS, 'E-recording');
      const deed = c.deedDocumentId !== undefined ? await docId(id, c.deedDocumentId) : undefined;
      const dot = c.dotDocumentId !== undefined ? await docId(id, c.dotDocumentId) : undefined;
      const row = {
        disbursement_date: c.disbursementDate, processor_name: c.processorName ?? '', recording_method: c.recordingMethod, method_note: c.methodNote ?? '', assigned_to: c.assignedTo ?? '',
        recording_instructions: c.recordingInstructions ?? '', package_name: c.packageName ?? '', payment_account: c.paymentAccount ?? '',
        md_intake_attached: c.mdIntakeAttached, md_clear_mortgage_balance: c.mdClearMortgageBalance, md_subdivision: c.mdSubdivision ?? '', md_document2_grantee_trustee: c.mdDocument2GranteeTrustee,
        md_return_to_post_closing: c.mdReturnToPostClosing, wh_ar_exemption: c.whArExemption, first_time_home_buyer: c.firstTimeHomeBuyer, owner_occupancy: c.ownerOccupancy,
        property_tax_required: c.propertyTaxRequired, county_tax_amount: c.countyTaxAmount, accounting_tax_amount: c.accountingTaxAmount, collected_fees: c.collectedFees, estimated_fees: c.estimatedFees,
        platform_fee_paid: c.platformFeePaid, rejection_reason: c.rejectionReason ?? '', recorded_date: c.recordedDate, release_funds_notified: c.releaseFundsNotified,
      };
      if (deed !== undefined) row.deed_document_id = deed;
      if (dot !== undefined) row.dot_document_id = dot;
      const saved = await run(sb.from('recording_packages').update(pack(row)).eq('deal_id', id).select('*').single());
      await event('recording_events', id, 'saved', 'Recording package saved');
      return recView(saved, deal);
    },
    async setRecordingDoc(id, kind, input) {
      await gate(true);
      if (!['deed', 'dot'].includes(kind)) throw new Error('Unknown recording document.');
      const spec = { instrumentType: 's', grantor: 's', grantee: 's', tenancy: 's', zip: 's', consideration: 'm', lender: 's', returnTo: 's', collectedFee: 'm', estimatedFee: 'm' };
      const c = R.cleanTyped(input, spec, 'Recording document');
      const cur = ok(await sb.from('recording_instruments').select('*').eq('deal_id', id).eq('kind', kind).maybeSingle());
      const row = { instrument_type: c.instrumentType || (kind === 'deed' ? 'Deed Simple' : 'Deed of Trust'), grantor: c.grantor ?? '', grantee: c.grantee ?? '', tenancy: c.tenancy ?? '', zip: c.zip ?? '', consideration: c.consideration, lender: c.lender ?? '', return_to: c.returnTo || 'CLA Post Closing Department', collected_fee: c.collectedFee, estimated_fee: c.estimatedFee };
      const saved = cur
        ? await run(sb.from('recording_instruments').update({ ...row, deleted_at: null }).eq('id', cur.id).select('*').single())
        : await run(sb.from('recording_instruments').insert({ deal_id: id, kind, ...row }).select('*').single());
      return instView(saved);
    },
    async setRecordingCheck(id, key, done, note = '') {
      await gate(true);
      const item = R.REC_CHECKLIST.find(([k]) => k === key);
      if (!item) throw new Error('Unknown review check.');
      const cur = ok(await sb.from('recording_review_checks').select('*').eq('deal_id', id).eq('check_key', key).maybeSingle());
      const patch = { done: !!done, note: String(note || '').slice(0, 500), group_name: item[1], label: item[2] };
      const saved = cur
        ? await run(sb.from('recording_review_checks').update({ ...patch, deleted_at: null }).eq('id', cur.id).select('*').single())
        : await run(sb.from('recording_review_checks').insert({ deal_id: id, check_key: key, ...patch }).select('*').single());
      return { id: saved.id, key: saved.check_key, done: !!saved.done, note: saved.note };
    },
    async transitionRecording(id, action, reason = '') {
      await gate(true);
      const deal = await dealOf(id);
      await ensureRec(id, deal);
      const saved = ok(await sb.rpc('transition_recording', { p_deal: id, p_action: action, p_reason: reason || '' }));
      await event('recording_events', id, action, reason || (saved && saved.status) || action);
      return recView(saved, deal);
    },
    async alertPostClosing(id, kind) {
      await gate(true);
      if (!['team', 'funds'].includes(kind)) throw new Error('Unknown alert.');
      const deal = await dealOf(id);
      const title = kind === 'team' ? `E-recording package ready to process: ${deal.file_number}` : `Recorded: release funds for ${deal.file_number}`;
      await queue(id, 'e-recording', 'alert', { email: 'postclosing@example.test', name: 'Post Closing' }, title, 'In-app team alert queued. Nothing was sent.');
      if (kind === 'funds') await run(sb.from('recording_packages').update({ release_funds_notified: true }).eq('deal_id', id).select('id').single());
      return true;
    },
  };
}
