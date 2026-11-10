/* [SUPABASE] TITLE. Same names the Title tab calls on the mock adapter.
 * Uses the title_* tables, order_notes, and documents.title_doc_kind already on TEST.
 * RLS is private.title_reader / title_editor. Sales read. Processor, Preprocessor, TC, and Admin edit.
 * Agents, buyers, and sellers get no rows. Nothing is sent. No SSN is stored. */
import * as T from './title.js?v=202611101015';

const READ = ['Processor', 'Preprocessor', 'Transaction Coordinator', 'Sales Person', 'Sales Team'];
const EDIT = ['Processor', 'Preprocessor', 'Transaction Coordinator'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEAL = 'id,file_number,street,city,state,zip,county,transaction_type,purchase_price,loan_amount,lender_name,lender_email,closing_date,loan_id_number,loss_payee_name,uses_mers,funding_type,first_payment_date,interest_type,loan_type,title_review_status,notes';
const denied = (error) => /row-level security|42501|permission denied/i.test(String(error && error.message || error || ''));
const canRead = (u) => !!u && !u.accountRole && u.role !== 'Outside user' && u.role !== 'Employee' && (!!u.isAdmin || READ.includes(u.role));
const canEdit = (u) => !!u && !u.accountRole && (!!u.isAdmin || EDIT.includes(u.role));
const snake = (k) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const text = (v, n = 4000) => String(v == null ? '' : v).trim().slice(0, n);
const num = (v) => (v == null || v === '' ? null : Number(v));

export function titleSupabase({ sb, ok, flags, me }) {
  const fail = (error) => { if (denied(error)) throw new Error(T.TITLE_STAFF_ONLY); throw error instanceof Error ? error : new Error(String(error && error.message || error)); };
  const run = async (q) => { const r = await q; if (r.error) fail(r.error); return r.data; };
  const gate = async (edit) => {
    if (!flags.title) throw new Error(T.TITLE_OFF);
    const u = await me();
    if (!u || !u.id) throw new Error('Please sign in.');
    if (!canRead(u)) throw new Error(T.TITLE_STAFF_ONLY);
    if (edit && !canEdit(u)) throw new Error(T.TITLE_READ_ONLY);
    return u;
  };
  const dealOf = async (id) => { const d = ok(await sb.from('deals').select(DEAL).eq('id', id).maybeSingle()); if (!d) throw new Error('Order not found.'); return d; };
  const live = async (table, dealId) => (ok(await sb.from(table).select('*').eq('deal_id', dealId).is('deleted_at', null)) || []);
  const reviewRow = async (id) => ok(await sb.from('title_reviews').select('*').eq('deal_id', id).maybeSingle());
  const names = async (dealId, role) => {
    const parts = ok(await sb.from('deal_participants').select('contact_id,role').eq('deal_id', dealId).eq('role', role)) || [];
    const ids = parts.map((p) => p.contact_id).filter(Boolean);
    if (!ids.length) return [];
    const contacts = ok(await sb.from('contacts').select('id,first_name,last_name').in('id', ids)) || [];
    return contacts.map((c) => `${c.first_name || ''} ${c.last_name || ''}`.trim()).filter(Boolean);
  };
  const view = async (deal, userEdit) => {
    const raw = await reviewRow(deal.id);
    const review = raw && !raw.deleted_at ? raw : null;
    const steps = T.STEPS.map(([key, label, section]) => ({ key, label, section, status: 'open', doneAt: null, doneByName: '', note: '' }));
    for (const row of await live('title_checklist_items', deal.id)) {
      const step = steps.find((s) => s.key === row.step_key);
      if (step) { step.status = row.status || 'open'; step.doneAt = row.done_at; step.note = row.note || ''; }
    }
    const chain = (await live('title_chain_entries', deal.id)).sort((a, b) => a.position - b.position).map((e) => ({ ...e, id: e.id, instrumentType: e.instrument_type, documentName: e.document_name, grantor: e.grantor, grantee: e.grantee, documentDate: e.document_date, recordedDate: e.recorded_date, book: e.book, page: e.page, instrumentNumber: e.instrument_number, pertainsToProperty: e.pertains_to_property, overrideOn: e.override_on, overrideText: e.override_text, position: e.position, text: e.generated_text || '' }));
    const docs = (ok(await sb.from('documents').select('id,name,title_doc_kind,created_at').eq('deal_id', deal.id)) || []).filter((d) => d.title_doc_kind).map((d) => ({ id: d.id, name: d.name, kind: d.title_doc_kind, kindLabel: T.docKindLabel(d.title_doc_kind), folder: '', generated: true, createdAt: d.created_at }));
    const reviewView = review ? {
      ...review, commitmentStatus: review.commitment_status || 'draft', commitmentNumber: review.commitment_number || '', underwriter: review.underwriter || '', effectiveDate: review.effective_date, vestingText: review.vesting_text || '', legalDescription: review.legal_description || '',
      proposedInsured: review.proposed_insured || '', ownerPolicyType: review.owner_policy_type || '', lenderPolicyType: review.lender_policy_type || '', beingOverrideOn: review.being_override_on, beingOverrideText: review.being_override_text || '', sdatTaxId: review.sdat_tax_id || '',
    } : null;
    return {
      dealId: deal.id, canEdit: userEdit, canPayoffs: false, status: deal.title_review_status || 'not_started', statusLabel: T.reviewStatusLabel(deal.title_review_status || 'not_started'),
      deal: { id: deal.id, fileNumber: deal.file_number, street: deal.street, city: deal.city, state: deal.state, zip: deal.zip, county: deal.county || '', transactionType: deal.transaction_type, purchasePrice: num(deal.purchase_price), loanAmount: num(deal.loan_amount), lenderName: deal.lender_name || '', lenderEmail: deal.lender_email || '', closingDate: deal.closing_date, loanIdNumber: deal.loan_id_number || '', lossPayeeName: deal.loss_payee_name || '', usesMers: deal.uses_mers, fundingType: deal.funding_type || '', firstPaymentDate: deal.first_payment_date || '', interestType: deal.interest_type || '', loanType: deal.loan_type || '', buyers: await names(deal.id, 'Client-Buyer'), sellers: await names(deal.id, 'Client-Seller') },
      review: reviewView, steps, progress: T.progressOf(steps.map((s) => ({ stepKey: s.key, status: s.status }))), mdAckRequired: T.mdAckRequired(deal), warnings: [],
      pacer: (await live('title_pacer_searches', deal.id)).map((z) => ({ id: z.id, partyName: z.party_name, partyRole: z.party_role, searchType: z.search_type, result: z.result, notes: z.notes || '', exactMatch: z.exact_match })),
      pacerParties: [], discrepancies: (await live('title_discrepancies', deal.id)).map((z) => ({ id: z.id, discrepancyType: z.discrepancy_type, description: z.description, status: z.status, label: T.discrepancyLabel(z.discrepancy_type) })),
      chain, being: { generated: '', text: review ? review.legal_description || '' : '', overrideOn: !!(review && review.being_override_on), overrideText: review ? review.being_override_text || '' : '', vestingId: null },
      infoBlock: '', requirements: (await live('title_items', deal.id)).filter((r) => r.kind === 'requirement').map((r) => ({ ...r, text: r.body_text || r.generated_text || '', templateLabel: r.template_key || 'Custom', hasPayoff: false })),
      exceptions: (await live('title_items', deal.id)).filter((r) => r.kind === 'exception').map((r) => ({ ...r, text: r.body_text || r.generated_text || '', templateLabel: r.template_key || 'Custom' })),
      cpls: (await live('title_cpls', deal.id)).map((c) => ({ id: c.id, cplNumber: c.cpl_number, protectedParty: c.protected_party, cplFor: c.cpl_for, cost: num(c.cost), status: c.status })),
      docs, orderDocs: [], notes: { orderNote: deal.notes || '', sticky: (await live('order_notes', deal.id)).map((n) => ({ id: n.id, category: n.category, body: n.body, issueResolved: n.issue_resolved })), payoff: [] },
      payoffs: [], hoaLinked: false, hoaFound: false, packageComponents: [], packageMissing: [], signatures: [],
      search: null, searches: await live('title_search_tracking', deal.id), searchBlocked: false, emdReceived: false,
      liens: await live('title_curative_liens', deal.id), entities: await live('title_entity_reviews', deal.id), lienCerts: await live('title_lien_certificates', deal.id),
      ctcChecks: T.CTC_ITEMS.map(([key, label]) => ({ checkKey: key, label, status: 'open', note: '', id: null })), processorNotes: [], staffAttorneys: [], packageRecipients: T.PACKAGE_RECIPIENT_ROLES || [],
      summary: null, ownerMatches: null, outbox: [], log: [],
    };
  };

  return {
    async getTitle(dealId) { const u = await gate(false); return view(await dealOf(dealId), canEdit(u)); },
    async startTitleReview(dealId) {
      const u = await gate(true); const deal = await dealOf(dealId); const cur = await reviewRow(dealId);
      if (!cur) await run(sb.from('title_reviews').insert({ deal_id: dealId, reviewer_id: u.id, review_date: new Date().toLocaleDateString('en-CA'), commitment_status: 'draft' }).select('id').single());
      else if (cur.deleted_at) await run(sb.from('title_reviews').update({ deleted_at: null, commitment_status: 'draft' }).eq('id', cur.id).select('id').single());
      await run(sb.from('deals').update({ title_review_status: 'in_progress' }).eq('id', dealId).select('id').single());
      return view(deal, true);
    },
    async saveTitleReview(dealId, input = {}) {
      await gate(true); T.noSsn(input); const deal = await dealOf(dealId); await this.startTitleReview(dealId);
      const row = {};
      for (const [k, v] of Object.entries(input)) row[snake(k)] = typeof v === 'string' ? text(v) : v;
      if (Object.keys(row).length) await run(sb.from('title_reviews').update(row).eq('deal_id', dealId).select('id').single());
      return view(deal, true);
    },
    async setTitleReviewStatus(dealId, status) { await gate(true); await dealOf(dealId); await run(sb.from('deals').update({ title_review_status: status }).eq('id', dealId).select('id').single()); return true; },
    async setTitleStep(dealId, key, status) {
      await gate(true); if (!T.STEPS.some(([k]) => k === key)) throw new Error('Unknown checklist step.');
      const cur = (await live('title_checklist_items', dealId)).find((s) => s.step_key === key);
      const patch = { status, done_at: status === 'open' ? null : new Date().toISOString() };
      if (cur) await run(sb.from('title_checklist_items').update(patch).eq('id', cur.id).select('id').single());
      else await run(sb.from('title_checklist_items').insert({ deal_id: dealId, step_key: key, ...patch }).select('id').single());
      return true;
    },
    async saveTitleLoan(dealId, input = {}) {
      await gate(true); T.noSsn(input); await dealOf(dealId);
      const row = {};
      for (const [from, to] of [['loanIdNumber', 'loan_id_number'], ['lossPayeeName', 'loss_payee_name'], ['usesMers', 'uses_mers'], ['fundingType', 'funding_type'], ['firstPaymentDate', 'first_payment_date'], ['interestType', 'interest_type'], ['loanType', 'loan_type'], ['lenderName', 'lender_name'], ['loanAmount', 'loan_amount']]) if (input[from] !== undefined) row[to] = to.endsWith('amount') ? num(input[from]) : input[from];
      if (Object.keys(row).length) await run(sb.from('deals').update(row).eq('id', dealId).select('id').single());
      return { diffs: [] };
    },
    async ensureTitleFolders(dealId) { await gate(true); let n = 0; for (const name of T.TITLE_FOLDERS) { const cur = (ok(await sb.from('folders').select('id').eq('deal_id', dealId).eq('name', name)) || [])[0]; if (!cur) { await run(sb.from('folders').insert({ scope: 'deal', deal_id: dealId, name, staff_only: true }).select('id').single()); n += 1; } } return n || T.TITLE_FOLDERS.length; },
    async tagTitleDocument(dealId, docId, kind) { await gate(true); await run(sb.from('documents').update({ title_doc_kind: kind || null }).eq('id', docId).eq('deal_id', dealId).select('id').single()); return true; },
    async addTitleDocRecord(dealId, kind, name) { const u = await gate(true); T.noSsn({ name }); if (!T.DOC_KINDS.some(([k]) => k === kind)) throw new Error('Unknown title document kind.'); return run(sb.from('documents').insert({ deal_id: dealId, name: text(name, 200) || T.docKindLabel(kind) + '.pdf', mime_type: 'application/pdf', visibility: 'staff', uploaded_by: u.id, title_doc_kind: kind, title_generated: true, wire_instructions: false }).select('id').single()); },
    async addOrderNote(dealId, input = {}) { await gate(true); T.noSsn(input); return run(sb.from('order_notes').insert({ deal_id: dealId, category: text(input.category, 80) || 'General', body: text(input.body) }).select('id').single()); },
    async setOrderNoteResolved(id, resolved) { await gate(true); await run(sb.from('order_notes').update({ issue_resolved: !!resolved, resolved_at: resolved ? new Date().toISOString() : null }).eq('id', id).select('id').single()); return true; },
    async savePacerSearch(dealId, input = {}) { await gate(true); T.noSsn(input); return run(sb.from('title_pacer_searches').insert({ deal_id: dealId, party_name: text(input.partyName, 200) || 'Party', party_role: text(input.partyRole, 40) || 'buyer', search_type: input.searchType || 'party_name', result: input.result || 'no_results', exact_match: !!input.exactMatch, notes: text(input.notes) }).select('id').single()); },
    async retirePacerSearch(id) { await gate(true); await run(sb.from('title_pacer_searches').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id').single()); return true; },
    async addTitleDiscrepancy(dealId, input = {}) { await gate(true); T.noSsn(input); return run(sb.from('title_discrepancies').insert({ deal_id: dealId, discrepancy_type: text(input.type, 80), description: text(input.description), status: 'open' }).select('id').single()); },
    async resolveTitleDiscrepancy(id, note) { await gate(true); T.noSsn({ note }); await run(sb.from('title_discrepancies').update({ status: 'resolved', resolution_note: text(note), resolved_at: new Date().toISOString() }).eq('id', id).select('id').single()); return true; },
    async saveChainEntry(dealId, input = {}) {
      await gate(true); T.noSsn(input); const id = text(input.id, 80);
      const row = { instrument_type: text(input.instrumentType, 80) || 'Deed', document_name: text(input.documentName), grantor: text(input.grantor), grantee: text(input.grantee), document_date: text(input.documentDate, 10) || null, recorded_date: text(input.recordedDate, 10) || null, book: text(input.book, 40), page: text(input.page, 40), instrument_number: text(input.instrumentNumber, 80), pertains_to_property: input.pertainsToProperty !== false, override_on: input.overrideOn === true || input.overrideOn === 'true', override_text: text(input.overrideText) };
      if (id && UUID.test(id)) return run(sb.from('title_chain_entries').update(row).eq('id', id).eq('deal_id', dealId).select('id').single());
      const pos = ((await live('title_chain_entries', dealId)).reduce((m, z) => Math.max(m, z.position || 0), 0)) + 1;
      return run(sb.from('title_chain_entries').insert({ deal_id: dealId, position: pos, ...row }).select('id').single());
    },
    async retireChainEntry(id) { await gate(true); await run(sb.from('title_chain_entries').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id').single()); return true; },
    async insertBeingClause(dealId) { await gate(true); const cur = await reviewRow(dealId); const textClause = 'FOR INFORMATIONAL PURPOSES ONLY:'; const legal = cur && cur.legal_description && cur.legal_description.includes(textClause) ? cur.legal_description : `${(cur && cur.legal_description) || ''}\n${textClause}`.trim(); await run(sb.from('title_reviews').update({ legal_description: legal }).eq('deal_id', dealId).select('id').single()); return true; },
    async finalizeCommitment(dealId) { await gate(true); await run(sb.from('title_reviews').update({ commitment_status: 'final', finalized_at: new Date().toISOString() }).eq('deal_id', dealId).select('id').single()); return true; },
    async reopenCommitment(dealId) { await gate(true); await run(sb.from('title_reviews').update({ commitment_status: 'draft' }).eq('deal_id', dealId).select('id').single()); return true; },
    async listTitleTemplates(kind) { await gate(false); const rows = kind === 'exception' ? T.EXCEPTION_TEMPLATES || [] : T.REQUIREMENT_TEMPLATES || []; return { templates: rows, groups: kind === 'exception' ? T.EXCEPTION_GROUPS : T.REQUIREMENT_GROUPS }; },
    async addTitleItem(dealId, input = {}) { await gate(true); const kind = input.kind === 'exception' ? 'exception' : 'requirement'; const pos = ((await live('title_items', dealId)).filter((r) => r.kind === kind).reduce((m, z) => Math.max(m, z.position || 0), 0)) + 1; return run(sb.from('title_items').insert({ deal_id: dealId, kind, position: pos, template_key: text(input.templateKey, 80), body_text: text(input.bodyText), status: 'open', parent_id: input.parentId && UUID.test(input.parentId) ? input.parentId : null }).select('*').single()); },
    async addTitleGroup(dealId, kind, groupKey) { await gate(true); const group = (kind === 'exception' ? T.EXCEPTION_GROUPS : T.REQUIREMENT_GROUPS).find((g) => g.key === groupKey); if (!group) throw new Error('Unknown group.'); for (const key of group.items || []) await this.addTitleItem(dealId, { kind, templateKey: key }); return true; },
    async updateTitleItem(id, patch = {}) { await gate(true); T.noSsn(patch); const row = {}; if (patch.bodyText != null) row.body_text = text(patch.bodyText); if (patch.status) row.status = text(patch.status, 40); if (Object.keys(row).length) await run(sb.from('title_items').update(row).eq('id', id).select('id').single()); return true; },
    async moveTitleItem(id, dir) { await gate(true); const cur = ok(await sb.from('title_items').select('id,position').eq('id', id).maybeSingle()); if (!cur) throw new Error('Item not found.'); await run(sb.from('title_items').update({ position: Math.max(1, (cur.position || 1) + (dir === 'up' ? -1 : 1)) }).eq('id', id).select('id').single()); return true; },
    async retireTitleItem(id) { await gate(true); await run(sb.from('title_items').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id').single()); return true; },
    async createPayoffFromItem() { throw new Error('Create the payoff from Payoffs / HOA. Title does not write payoff rows from this tab.'); },
    async createHoaPayoffFromTitle() { throw new Error('Add the HOA from Payoffs / HOA. Title does not write that contact from this tab.'); },
    async issueCpl(dealId, input = {}) { await gate(true); T.noSsn(input); return ok(await sb.rpc('issue_cpl_guarded', { p_deal: dealId, p_party: text(input.protectedParty, 200), p_clause: text(input.lenderClause, 500), p_for: text(input.cplFor, 40) || 'lender', p_legacy_type: text(input.cplType, 40) })); },
    async filePrelimCd(dealId) { return this.addTitleDocRecord(dealId, 'prelim_cd', 'Prelim CD (fake).pdf'); },
    async buildBuyerCommitmentCopy(dealId) { const doc = await this.addTitleDocRecord(dealId, 'buyer_commitment_copy', 'Buyers Initial Commitment copy (fake).pdf'); return { documentId: doc.id, signatures: [] }; },
    async buildTitlePackage(dealId) { const doc = await this.addTitleDocRecord(dealId, 'title_package', 'Title Package (fake).pdf'); return { documentId: doc.id, missing: [] }; },
    async sendTitlePackage(dealId) { await gate(true); const deal = await dealOf(dealId); await run(sb.rpc('queue_staff_outbox', { p_deal: dealId, p_module: 'title', p_type: 'title_package', p_email: deal.lender_email || 'lender@example.test', p_name: deal.lender_name || 'Lender', p_profile: null, p_subject: `Title Package - ${deal.file_number}`, p_body: 'Title commitment only. Payoffs, wires, and cash-to-close are not included. Queued only; nothing was sent.' })); return true; },
    async prefillTitleSummary(dealId) { const u = await gate(false); const v = await view(await dealOf(dealId), canEdit(u)); return { reviewerFirstName: '', noteDate: new Date().toLocaleDateString('en-CA'), fileNumber: v.deal.fileNumber }; },
    async saveTitleSummary(dealId, input = {}) { await gate(true); T.noSsn(input); return run(sb.from('title_summary_notes').insert({ deal_id: dealId, note_date: text(input.noteDate, 10) || new Date().toLocaleDateString('en-CA'), reviewer_first_name: text(input.reviewerFirstName, 80), note_body: text(input.noteBody || input.body) }).select('id').single()); },
    async updateTitleTasks(dealId) { return this.alignTitleTasks(dealId); },
    async saveTitleSearch(dealId, input = {}) { await gate(true); const cur = (await live('title_search_tracking', dealId))[0]; const row = { ordered_date: text(input.orderedDate, 10) || null, due_date: text(input.dueDate, 10) || null, received_date: text(input.receivedDate, 10) || null, abstractor: text(input.abstractor), notes: text(input.notes) }; return cur ? run(sb.from('title_search_tracking').update(row).eq('id', cur.id).select('id').single()) : run(sb.from('title_search_tracking').insert({ deal_id: dealId, ...row }).select('id').single()); },
    async saveTitleLien(dealId, input = {}) { await gate(true); T.noSsn(input); const id = text(input.id, 80); const row = { item_type: text(input.itemType, 80) || 'judgment', case_number: text(input.caseNumber), amount: num(input.amount), status: text(input.status, 40) || 'open', notes: text(input.notes) }; if (id && UUID.test(id)) return run(sb.from('title_curative_liens').update(row).eq('id', id).select('id').single()); return run(sb.from('title_curative_liens').insert({ deal_id: dealId, ...row }).select('id').single()); },
    async generateLienRequirement(id) { await gate(true); const lien = ok(await sb.from('title_curative_liens').select('deal_id,item_type').eq('id', id).maybeSingle()); if (!lien) throw new Error('Curative item not found.'); return this.addTitleItem(lien.deal_id, { kind: 'requirement', bodyText: `Curative: ${lien.item_type}` }); },
    async saveTitleEntity(dealId, input = {}) { await gate(true); T.noSsn(input); const id = text(input.id, 80); const row = { side: input.side === 'seller' ? 'seller' : 'buyer', entity_name: text(input.entityName), entity_type: text(input.entityType), issue_notes: text(input.issueNotes) }; if (id && UUID.test(id)) return run(sb.from('title_entity_reviews').update(row).eq('id', id).select('id').single()); return run(sb.from('title_entity_reviews').insert({ deal_id: dealId, ...row }).select('id').single()); },
    async approveTitleEntity(id, note) { await gate(true); await run(sb.from('title_entity_reviews').update({ attorney_approved: true, attorney_approval_notes: text(note) }).eq('id', id).select('id').single()); return true; },
    async saveTitleLienCert(dealId, input = {}) { await gate(true); const id = text(input.id, 80); const row = { outcome: text(input.outcome, 40) || 'pending', notes: text(input.notes), outstanding_amount: num(input.outstandingAmount) }; if (id && UUID.test(id)) return run(sb.from('title_lien_certificates').update(row).eq('id', id).select('id').single()); return run(sb.from('title_lien_certificates').insert({ deal_id: dealId, ...row }).select('id').single()); },
    async saveTitleCtcCheck(dealId, key, input = {}) { await gate(true); if (!T.CTC_ITEMS.some(([k]) => k === key)) throw new Error('Unknown CTC check.'); const cur = (await live('title_ctc_checks', dealId)).find((c) => c.check_key === key); const patch = { status: text(input.status, 20) || 'open', note: text(input.note, 500) }; return cur ? run(sb.from('title_ctc_checks').update(patch).eq('id', cur.id).select('id').single()) : run(sb.from('title_ctc_checks').insert({ deal_id: dealId, check_key: key, ...patch }).select('id').single()); },
    async completeTitleCtc(dealId, note = '') { await gate(true); T.noSsn({ note }); await run(sb.from('deals').update({ title_review_status: 'clear_to_close' }).eq('id', dealId).select('id').single()); if (text(note)) await run(sb.from('title_processor_notes').insert({ deal_id: dealId, body: text(note) }).select('id').single()); return true; },
    async alignTitleTasks(dealId) { await gate(true); return (T.TITLE_ALIGNMENT_TASKS || []).length; },
  };
}
