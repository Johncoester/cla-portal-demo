/* mock adapter: TITLE MODULE (title review inside an order; John, Nov 4 2026: "build it"; Maria Irene Go's Qualia "Title Review" walkthrough).
 * Behind the `title` feature flag (on with the test / demo config) and the 'title' module switch. CLA STAFF ONLY: Processor / Transaction Coordinator /
 * Admin / Super admin edit; Sales Person / Sales Team read. Agents and clients never see it (the one exception: the buyer's e-sign task for the
 * "Buyers Initial Commitment copy", made with the existing signature-request / task pattern).
 * Every value is a typed field on a typed row (mirrors migration 61), rows are soft-deleted (deletedAt), nothing is ever sent (outbox = queued only),
 * NO SSN is ever stored (the PACER rows hold party, search type, result and the receipt document only). FAKE DATA ONLY. */
import * as T from './title.js?v=202611060220';
import { senderFor } from './email-senders.js?v=202611060220';
import { ensureNov5 } from './mock-part-nov5.js?v=202611060220';
import { resolveCplPrice, CPL_UNRESOLVED, attorneyAuthorized } from './nov5-rules.js?v=202611060220';
import { seedTitleSamples } from './title-seed.js?v=202611060220';

const COLS = ['titleReviews', 'titleSteps', 'titlePacer', 'titleDiscrepancies', 'titleChain', 'titleItems', 'titleCpls', 'titlePackageComponents', 'titleSignatures', 'titleSummaries', 'titleCurative', 'orderNotes', 'titleLog', 'titleSearches', 'titleLiens', 'titleEntities', 'titleLienCerts', 'titleCtcChecks', 'titleProcessorNotes'];
// typed review fields (title_reviews columns): s = text, L = long text, m = money, d = date, b = boolean, e:<list> = one of a list
const REVIEW_FIELDS = {
  reviewerId: 's', reviewDate: 'd', propertyType: 'e:' + T.PROPERTY_TYPES.join('|'), titleOrderEmailNotes: 'L',
  sdatTaxId: 's', sdatOwnerName: 's', sdatPremisesAddress: 's', sdatLegalShort: 's', sdatMatches: 'b',
  taxYear: 's', taxBaseAnnual: 'm', taxFirstHalfStatus: 'e:paid|unpaid', taxFirstHalfAmount: 'm', taxSecondHalfStatus: 'e:paid|unpaid', taxSecondHalfAmount: 'm',
  taxDueDates: 's', taxDelinquentAmount: 'm', taxPenaltyInterest: 'm', taxForwardBillTo: 's', vestingOwnerName: 's',
  contractBuyerMatch: 'b', contractSellerMatch: 'b', contractAddressMatch: 'b', contractLegalMatch: 'b', contractTaxIdMatch: 'b',
  assocType: 'e:none|hoa|condo|both', assocName: 's', assocFee: 'm', assocFeeFrequency: 'e:' + T.FEE_FREQUENCIES.join('|'),
  feeInclWater: 'b', feeInclSewer: 'b', feeInclHeat: 'b', feeInclElectric: 'b', feeInclGas: 'b', feeInclAc: 'b',
  waterType: 'e:public|private|well', sewerType: 'e:public|private|septic', frontFootBenefit: 'e:yes|no|unknown', groundRent: 'e:yes|no|unknown', transferTaxSplit: 's', contractNotes: 'L',
  trLoanAmount: 'm', trLenderName: 's', trLoanIdNumber: 's', trVestingText: 's', trLegalDescription: 'L', vestingContractMatch: 'b', legalContractMatch: 'b', vestingLenderMatch: 'b', legalLenderMatch: 'b', titleNotes: 'L', curativePending: 'L',
  underwriter: 's', commitmentNumber: 's', commitmentForm: 'e:' + T.COMMITMENT_FORMS.join('|'), effectiveDate: 'd', effectiveTime: 's', proposedInsured: 's', vestingText: 's', legalDescription: 'L',
  beingOverrideOn: 'b', beingOverrideText: 'L',
  lenderPolicyType: 's', lenderPolicyForm: 's', lenderPolicyAmount: 'm', lenderRateType: 's', lenderRateEffectiveDate: 'd', lenderProposedInsured: 's',
  ownerPolicyType: 's', ownerPolicyForm: 's', ownerPolicyAmount: 'm', ownerRateType: 's', ownerRateEffectiveDate: 'd', ownerProposedInsured: 's',
};
const LOAN_DEAL_FIELDS = { loanIdNumber: 's', lossPayeeName: 's', usesMers: 'b', fundingType: 'e:net|gross', firstPaymentDate: 'd', interestType: 'e:' + T.INTEREST_TYPES.join('|'), loanType: 's' };
const CHAIN_FIELDS = { instrumentType: 'e:' + T.INSTRUMENT_TYPES.join('|'), documentName: 's', grantor: 's', grantee: 's', documentDate: 'd', recordedDate: 'd', book: 's', page: 's', instrumentNumber: 's', certOfTitleNumber: 's', documentNumber: 's', pertainsToProperty: 'b', overrideOn: 'b', overrideText: 'L' };
const ITEM_FIELDS = Object.fromEntries([...T.ITEM_FIELD_KEYS.map((k) => [k, T.MONEY_FIELDS.includes(k) ? 'm' : T.DATE_FIELDS.includes(k) ? 'd' : /Status$/.test(k) ? 'e:paid|unpaid' : 's']), ['dotNeedsPayoff', 'b'], ['bodyText', 'L'], ['overrideOn', 'b'], ['overrideText', 'L'], ['status', 'e:open|satisfied|waived']]);
const SEARCH_FIELDS = { orderedDate: 'd', dueDate: 'd', receivedDate: 'd', abstractor: 's', assignedTypistId: 's', notes: 'L' };
const LIEN_FIELDS = { itemType: 'e:' + T.CURATIVE_TYPES.map(x => x[0]).join('|'), caseNumber: 's', mortgagor: 's', beneficiary: 's', trustee: 's', instrumentDate: 'd', recordedDate: 'd', entryDate: 'd', renewalDate: 'd', filingDate: 'd', jurisdictionState: 's', amount: 'm', book: 's', page: 's', instrumentNumber: 's', status: 'e:' + T.CURATIVE_STATUSES.map(x => x[0]).join('|'), verificationMethod: 'e:' + T.VERIFICATION_METHODS.map(x => x[0]).join('|'), identityVerified: 'b', identityVerifiedBy: 's', identityVerifiedDate: 'd', documentId: 's', attorneyName: 's', sufficientFundsAffidavit: 'b', notes: 'L' };
const ENTITY_FIELDS = { side: 'e:buyer|seller', entityName: 's', entityType: 's', articlesReceived: 'b', operatingAgreementReceived: 'b', resolutionsReceived: 'b', goodStandingReceived: 'b', goodStandingYear: 's', einReceived: 'b', goodStandingVerified: 'b', goodStandingStateSite: 's', signerAuthorized: 'b', memberStructure: 'e:single|multi', managementStructure: 's', requiredSignaturesCaptured: 'b', criticalIssue: 'b', issueNotes: 'L', assignedAttorneyId: 's', attorneyApproved: 'b', attorneyApprovalNotes: 'L', folderDocumentId: 's' };
const CERT_FIELDS = { receivedAt: 's', addressMatch: 'b', parcelMatch: 'b', allAmountsPaid: 'b', outstandingAmount: 'm', zeroViolations: 'b', violationCount: 's', signedDated: 'b', outcome: 'e:pending|clear_to_close|curative_needed', notes: 'L', documentId: 's' };
const CTC_FIELDS = { status: 'e:open|pass|na|issue', note: 's' };
const SUMMARY_TYPES = Object.fromEntries(T.SUMMARY_KEYS.map((k) => [k, 's']));

// in-place, idempotent: the title collections + (once, only where the title flag is on) the three FAKE sample orders. Storage key stays v29 (nothing existing changes).
export function ensureTitle(d, { seed = false } = {}) {
  for (const k of COLS) if (!Array.isArray(d[k])) d[k] = [];
  if (seed && !d.titleSampleSeeded && Array.isArray(d.deals) && Array.isArray(d.participants) && Array.isArray(d.contacts) && Array.isArray(d.documents) && Array.isArray(d.folders)) { seedTitleSamples(d); d.titleSampleSeeded = true; d.titleSeedAddedNow = true; }
  return d;
}

export function titlePart(x, flags, api) {
  const { load, save, nid, needUser, dealsFor, fail, now, nameOf, clone, prof, localDate, isStaffView, isManager, notify } = x;
  const db = () => ensureTitle(load());
  const str = (v, n = 500) => String(v == null ? '' : v).trim().slice(0, n);
  const reader = (dealId) => { if (!flags.title) fail(T.TITLE_OFF); const u = needUser(); if (!T.titleCanRead(u)) fail(T.TITLE_STAFF_ONLY);
    const deal = dealsFor(u).find((q) => q.id === dealId) || fail('Order not found.'); return { u, deal, canEdit: T.titleCanEdit(u) }; };
  const editor = (dealId) => { const r = reader(dealId); if (!r.canEdit) fail(T.TITLE_READ_ONLY); return r; };
  const logIt = (u, dealId, what, detail) => db().titleLog.push({ id: nid('tlog'), dealId, what, detail: str(detail, 500), at: now(), byId: u.id, byName: nameOf(u.id) });
  const stamp = (row, u, first) => { if (first) { row.createdAt = now(); row.createdBy = u.id; row.deletedAt = null; row.deletedBy = null; } row.updatedAt = now(); row.updatedBy = u.id; return row; };
  // typed cleaning: unknown keys are refused, every value is checked against its column type; NO SSN anywhere
  const clean = (input, spec, label) => { const v = input || {}; T.noSsn(v); const out = {};
    for (const [k, rawV] of Object.entries(v)) { const t = spec[k]; if (!t) fail(`${label}: unknown field "${k}".`);
      if (t === 's' || t === 'L') out[k] = str(rawV, t === 'L' ? 8000 : 500);
      else if (t === 'm') { if (rawV === '' || rawV == null) out[k] = null; else { const n = Number(String(rawV).replace(/[$,\s]/g, '')); if (!isFinite(n) || n < 0 || n > 1e10) fail(`${label}: ${k} must be an amount.`); out[k] = Math.round(n * 100) / 100; } }
      else if (t === 'd') { const s = str(rawV, 10); if (s && !T.isYmd(s)) fail(`${label}: ${k} must be a date (YYYY-MM-DD).`); out[k] = s || null; }
      else if (t === 'b') out[k] = rawV === '' || rawV == null ? null : rawV === true || rawV === 'true' || rawV === 'yes' || rawV === 'on';
      else if (t.startsWith('e:')) { const s = str(rawV, 120); if (s && !t.slice(2).split('|').includes(s)) fail(`${label}: pick ${k} from the list.`); out[k] = s || null; } }
    return out; };
  const parties = (dealId, role) => { const d = db(); return d.participants.filter((p) => p.dealId === dealId && p.role === role).map((p) => { const c = d.contacts.find((z) => z.id === p.contactId) || {};
    return { participantId: p.id, name: `${c.firstName || ''} ${c.lastName || ''}`.trim(), profileId: c.profileId || null, contactId: c.id }; }).filter((p) => p.name); };
  const reviewOf = (dealId) => db().titleReviews.find((r) => r.dealId === dealId && !r.deletedAt) || null;
  const ensureReview = (u, deal) => { let r = reviewOf(deal.id); if (r) return r;
    r = stamp({ id: nid('trev'), dealId: deal.id, reviewerId: u.id, reviewDate: localDate(), commitmentStatus: 'draft', commitmentForm: '2021 ALTA', underwriter: T.UNDERWRITERS[0], effectiveTime: '8:00 AM', legalDescription: '',
      lenderPolicyType: T.LENDER_POLICY_TYPES[0], lenderPolicyForm: '2021 ALTA', lenderPolicyAmount: deal.loanAmount ?? null, lenderProposedInsured: deal.lenderName ? `${deal.lenderName}, ISAOA/ATIMA` : '',
      ownerPolicyType: T.OWNER_POLICY_TYPES[0], ownerPolicyForm: '2021 ALTA', ownerPolicyAmount: deal.purchasePrice ?? null, ownerProposedInsured: T.joinNames(buyerNames(deal.id)), proposedInsured: T.joinNames(buyerNames(deal.id)),
      lenderRateType: 'Basic', ownerRateType: 'Basic', statusManual: false }, u, true);
    db().titleReviews.push(r); logIt(u, deal.id, 'Title review', 'started'); return r; };
  const live = (k, dealId) => db()[k].filter((z) => z.dealId === dealId && !z.deletedAt);
  const stepRow = (dealId, key) => db().titleSteps.find((s) => s.dealId === dealId && s.stepKey === key);
  const setStep = (u, dealId, key, status, note) => { if (!T.STEP_KEYS.includes(key)) fail('Unknown checklist step.'); if (!T.STEP_STATUSES.includes(status)) fail('Step status must be open, done or N/A.');
    let s = stepRow(dealId, key); const first = !s; if (!s) { s = { id: nid('tstep'), dealId, stepKey: key, note: '' }; db().titleSteps.push(s); }
    s.status = status; s.doneAt = status === 'open' ? null : now(); s.doneBy = status === 'open' ? null : u.id; if (note != null) { T.noSsn({ note }); s.note = str(note, 500); } stamp(s, u, first); return s; };
  const ctxOf = (deal) => ({ county: deal.county, state: deal.state });
  const genItem = (row, deal) => { row.generatedText = T.itemGeneratedText(row, ctxOf(deal)); return row; };
  const folderFor = (u, dealId, name) => { const d = db(); let f = d.folders.find((z) => z.scope === 'deal' && z.dealId === dealId && z.name.toLowerCase() === name.toLowerCase());
    if (!f) { f = { id: nid('f'), scope: 'deal', dealId, name, staffOnly: name !== T.BUYER_COPY_FOLDER, createdBy: u.id, createdAt: now() }; d.folders.push(f); } return f; };
  const mkDoc = (u, dealId, kind, name, { folder, visibility = 'staff', description = '', linkedHash = '' } = {}) => { const f = folderFor(u, dealId, folder || T.docKindFolder(kind));
    const doc = { id: nid('doc'), dealId, folderId: f.id, name: str(name, 200).replace(/[\\/]/g, '_'), description: str(description, 500), mimeType: 'application/pdf', size: 0, dataUrl: null, uploadedBy: u.id, visibility,
      docType: '', sharedWithClient: false, sharedWithClientBy: null, sharedWithClientAt: null, wireInstructions: false, createdAt: now(), titleDocKind: kind, titleGenerated: true, titleLinkedHash: linkedHash };
    db().documents.push(doc); return doc; };
  const titleDocs = (dealId) => db().documents.filter((z) => z.dealId === dealId && z.titleDocKind);
  const docOfKind = (dealId, kind) => titleDocs(dealId).filter((z) => z.titleDocKind === kind).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
  const items = (dealId, kind) => live('titleItems', dealId).filter((r) => !kind || r.kind === kind);
  const hoaFound = (r) => !!(r && r.assocType && r.assocType !== 'none');
  // order status (deals.titleReviewStatus): automatic unless a reviewer set it by hand
  const autoStatus = (deal) => { const r = reviewOf(deal.id); if (r && r.statusManual) return;
    const openReq = items(deal.id, 'requirement').some((z) => z.status === 'open'); const any = !!r || db().titleSteps.some((s) => s.dealId === deal.id && s.status !== 'open');
    deal.titleReviewStatus = !any ? 'not_started' : r && r.commitmentStatus === 'final' ? (openReq ? 'pending_requirements' : r.packageSentAt ? 'clear_to_close' : 'in_progress') : 'in_progress'; };
  const done = (u, deal, msg) => { autoStatus(deal); if (msg) logIt(u, deal.id, msg[0], msg[1]); save(); };
  const flag = (u, dealId, type, description) => { if (db().titleDiscrepancies.some((z) => z.dealId === dealId && !z.deletedAt && z.discrepancyType === type && z.status === 'open')) return null;
    const row = stamp({ id: nid('tdis'), dealId, discrepancyType: type, description: str(description, 500), status: 'open', resolvedBy: null, resolvedAt: null, resolutionNote: '' }, u, true); db().titleDiscrepancies.push(row); return row; };
  const sellerNames = (dealId) => parties(dealId, 'Client-Seller').map((p) => p.name); const buyerNames = (dealId) => parties(dealId, 'Client-Buyer').map((p) => p.name);
  const pacerComplete = (dealId, role) => { const ps = parties(dealId, role === 'buyer' ? 'Client-Buyer' : 'Client-Seller'); const rows = live('titlePacer', dealId).filter((z) => z.partyRole === role);
    return ps.length > 0 && ps.every((p) => rows.some((z) => z.participantId === p.participantId || T.normName(z.partyName) === T.normName(p.name))); };
  const cplFor = (dealId, who) => live('titleCpls', dealId).find((c) => c.cplFor === who) || null;
  const nextPos = (list) => list.reduce((m, z) => Math.max(m, z.position || 0), 0) + 1;
  function ensureTask(u, deal, title, reviewerId) { const d = db(); let t = d.tasks.find((z) => z.dealId === deal.id && z.title === title && z.status !== 'cancelled');
    if (!t) { const rv = prof(reviewerId || u.id); const role = rv && ['Processor', 'Preprocessor', 'Transaction Coordinator'].includes(rv.role) ? rv.role : 'Processor';
      t = { id: nid('t'), dealId: deal.id, participantId: null, templateId: null, templateCode: null, templateVersion: null, kind: 'simple', title, description: '', assignedRole: role, status: 'todo', dueDate: deal.closingDate || localDate(7), formData: {},
        savedAt: null, savedBy: null, completedAt: null, completedBy: null, createdBy: u.id, createdAt: now(), taskGroup: T.TITLE_TASK_GROUP, assigneeId: reviewerId || u.id }; d.tasks.push(t); }
    return t; }
  function completeTask(u, deal, title, note) { const t = ensureTask(u, deal, title, (reviewOf(deal.id) || {}).reviewerId); t.status = 'done'; t.completedAt = now(); t.completedBy = u.id; if (note) t.description = str(note, 1000); return t; }

  function view(u, deal, canEdit) {
    const d = db(); const r = reviewOf(deal.id); const ctx = ctxOf(deal);
    const chain = live('titleChain', deal.id).sort((a, b) => a.position - b.position).map((e) => ({ ...clone(e), text: T.textOf(e) }));
    const vest = T.vestingEntry(chain); const beingGenerated = T.beingClause(vest, ctx);
    const beingText = r && r.beingOverrideOn && str(r.beingOverrideText) ? r.beingOverrideText : beingGenerated;
    const numbered = (kind) => T.numberItems(items(deal.id, kind)).map((z) => ({ ...clone(z), text: T.textOf(z), templateLabel: (T.templateOf(kind, z.templateKey) || {}).label || 'Custom', hasPayoff: !!(z.payoffId && (d.payoffs || []).some((p) => p.id === z.payoffId && !p.retired)) }));
    const reqs = numbered('requirement'); const excs = numbered('exception');
    const fname = (id) => (d.folders.find((f) => f.id === id) || {}).name || 'Unfiled';
    const docs = titleDocs(deal.id).map((z) => ({ id: z.id, name: z.name, kind: z.titleDocKind, kindLabel: T.docKindLabel(z.titleDocKind), folder: fname(z.folderId), generated: !!z.titleGenerated, createdAt: z.createdAt, linkedHash: z.titleLinkedHash || '' }));
    const orderDocs = d.documents.filter((z) => z.dealId === deal.id && !x.isWireDoc(z)).map((z) => ({ id: z.id, name: z.name, kind: z.titleDocKind || '', folder: fname(z.folderId) }));
    const steps = T.STEPS.map(([k, label, section]) => { const s = stepRow(deal.id, k); return { key: k, label, section, status: s ? s.status : 'open', doneAt: s ? s.doneAt : null, doneByName: s && s.doneBy ? nameOf(s.doneBy) : '', note: s ? s.note || '' : '' }; });
    const warnings = []; const mdw = T.mdAckWarning(deal, titleDocs(deal.id)); if (mdw) warnings.push({ key: 'md_ack', text: mdw });
    const searches = live('titleSearches', deal.id); const srch = searches[0] || null; const curatives = live('titleLiens', deal.id);
    curatives.forEach(z => { const ex=T.curativeExpiry(z); if(ex&&ex.expired&&(z.status!=='expired'||z.verificationMethod!=='expiry_rule')){z.status='expired';z.verificationMethod='expiry_rule';} });
    if (srch && T.searchBlocked(deal, d.tasks.filter(t => t.dealId === deal.id))) warnings.push({ key: 'emd_block', text: T.EMD_BLOCK, red: true });
    if (r && T.beingClauseMissing(r.legalDescription)) warnings.push({ key: 'being', text: T.BEING_MISSING });
    live('titleDiscrepancies', deal.id).filter((z) => z.status === 'open').forEach((z) => warnings.push({ key: 'discrepancy', id: z.id, text: `${z.discrepancyType === 'owner_seller_mismatch' ? T.OWNER_MISMATCH : T.discrepancyLabel(z.discrepancyType)}: ${z.description}`, red: true }));
    const cpls = live('titleCpls', deal.id).map((c) => ({ ...clone(c), issuedByName: nameOf(c.issuedBy), lenderMatch: T.cplLenderMatches(c.protectedParty, deal.lenderName) }));
    T.chainGaps(chain).forEach((g) => warnings.push({ key: 'chain', text: `Chain of title: ${g}` }));
    const pkg = docOfKind(deal.id, 'title_package'); const comps = pkg ? d.titlePackageComponents.filter((c) => c.packageDocumentId === pkg.id && !c.deletedAt).sort((a, b) => a.position - b.position).map((c) => ({ ...clone(c), label: T.docKindLabel(c.componentKind), name: c.componentDocumentId ? ((d.documents.find((z) => z.id === c.componentDocumentId) || {}).name || '') : '' })) : [];
    const notes = { orderNote: deal.notes || '', sticky: live('orderNotes', deal.id).map((n) => ({ ...clone(n), byName: nameOf(n.createdBy) })).reverse(),
      payoff: flags.accounting ? (d.payoffNotes || []).filter((n) => n.dealId === deal.id && !n.retired).map((n) => ({ section: n.section, body: n.body, at: n.createdAt, byName: nameOf(n.createdBy) })) : [] };
    const payoffs = (d.payoffs || []).filter((p) => p.dealId === deal.id && !p.retired).map((p) => ({ id: p.id, position: p.position, lender: (p.lender || {}).name || '', titleItemId: p.titleItemId || null }));
    const hoaLinked = (d.dealOtherContacts || []).find((o) => o.dealId === deal.id && !o.retired && o.fromTitleReviewId);
    const summary = d.titleSummaries.filter((s) => s.dealId === deal.id && !s.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
    return { dealId: deal.id, canEdit, canPayoffs: !!flags.accounting && !!u && (u.isAdmin || ['Processor','Preprocessor'].includes(u.role)), status: deal.titleReviewStatus || 'not_started', statusLabel: T.reviewStatusLabel(deal.titleReviewStatus || 'not_started'),
      deal: { id: deal.id, fileNumber: deal.fileNumber, street: deal.street, city: deal.city, state: deal.state, zip: deal.zip, county: deal.county || '', transactionType: deal.transactionType, purchasePrice: deal.purchasePrice, loanAmount: deal.loanAmount,
        lenderName: deal.lenderName || '', lenderContact: deal.lenderContact || '', lenderEmail: deal.lenderEmail || '', closingDate: deal.closingDate, loanIdNumber: deal.loanIdNumber || '', lossPayeeName: deal.lossPayeeName || '', usesMers: deal.usesMers ?? null,
        fundingType: deal.fundingType || '', firstPaymentDate: deal.firstPaymentDate || '', interestType: deal.interestType || '', loanType: deal.loanType || '', buyers: buyerNames(deal.id), sellers: sellerNames(deal.id) },
      review: r ? { ...clone(r), reviewerName: r.reviewerId ? nameOf(r.reviewerId) : '', finalizedByName: r.finalizedBy ? nameOf(r.finalizedBy) : '', packageSentByName: r.packageSentBy ? nameOf(r.packageSentBy) : '' } : null,
      steps, progress: T.progressOf(steps.map((s) => ({ stepKey: s.key, status: s.status }))), mdAckRequired: T.mdAckRequired(deal), warnings,
      pacer: live('titlePacer', deal.id).map((z) => ({ ...clone(z), searchedByName: nameOf(z.searchedBy), documentName: ((d.documents.find((y) => y.id === z.documentId) || {}).name) || '' })),
      pacerParties: [...parties(deal.id, 'Client-Buyer').map((p) => ({ ...p, role: 'buyer' })), ...parties(deal.id, 'Client-Seller').map((p) => ({ ...p, role: 'seller' }))].map((p) => ({ ...p, searched: live('titlePacer', deal.id).some((z) => z.participantId === p.participantId) })),
      discrepancies: d.titleDiscrepancies.filter((z) => z.dealId === deal.id && !z.deletedAt).map((z) => ({ ...clone(z), label: T.discrepancyLabel(z.discrepancyType), resolvedByName: z.resolvedBy ? nameOf(z.resolvedBy) : '' })),
      chain, being: { generated: beingGenerated, text: beingText, overrideOn: !!(r && r.beingOverrideOn), overrideText: r ? r.beingOverrideText || '' : '', vestingId: vest ? vest.id : null },
      infoBlock: T.infoBlock({ being: beingText, deal, taxId: r ? r.sdatTaxId : '' }), requirements: reqs, exceptions: excs, cpls, docs, orderDocs, notes, payoffs, hoaLinked: !!hoaLinked, hoaFound: hoaFound(r),
      packageComponents: comps, packageMissing: T.PACKAGE_KINDS.filter((k) => !docOfKind(deal.id, k)).map(T.docKindLabel), signatures: live('titleSignatures', deal.id).map((s) => ({ ...clone(s), requestedByName: nameOf(s.requestedBy) })),
      search: srch ? clone(srch) : null, searches: searches.map(clone), searchBlocked: T.searchBlocked(deal, d.tasks.filter(t => t.dealId === deal.id)), emdReceived: T.emdReceived(deal, d.tasks.filter(t => t.dealId === deal.id)),
      liens: live('titleLiens', deal.id).map(z => ({ ...clone(z), expiry: T.curativeExpiry(z), requirementText: T.requirementFromCurative(z, ctx), documentName: ((d.documents.find(y => y.id === z.documentId) || {}).name || '') })),
      entities: live('titleEntities', deal.id).map(z => ({ ...clone(z), assignedAttorneyName: z.assignedAttorneyId ? nameOf(z.assignedAttorneyId) : '', complete: T.entityDocsComplete(z) })),
      lienCerts: live('titleLienCerts', deal.id).map(z => ({ ...clone(z), overdue: T.lienCertOverdue(z), complete: T.lienCertChecksComplete(z) })),
      ctcChecks: T.CTC_ITEMS.map(([key, label]) => { const q = live('titleCtcChecks', deal.id).find(z => z.checkKey === key); return { checkKey: key, label, status: q ? q.status : 'open', note: q ? q.note : '', id: q ? q.id : null }; }), effectiveDateCheck: T.effectiveDateCheck(r && r.effectiveDate, deal.closingDate),
      processorNotes: live('titleProcessorNotes', deal.id).map(z => ({ ...clone(z), byName: nameOf(z.createdBy) })).reverse(),
      staffAttorneys: ensureNov5(d).entityAttorneys.filter((z) => z.active && !z.retiredAt).map((z) => ({ id: z.id, profileId: z.profileId, name: z.displayName, role: z.assignmentRole, authorized: !!z.profileId })),
      packageRecipients: T.PACKAGE_RECIPIENT_ROLES,
      summary: summary ? { ...clone(summary), curative: d.titleCurative.filter((c) => c.summaryId === summary.id && !c.deletedAt).sort((a, b) => a.position - b.position).map((c) => c.text) } : null,
      ownerMatches: r && r.vestingOwnerName ? T.namesMatch(r.vestingOwnerName, sellerNames(deal.id)) : null,
      outbox: (d.outbox || []).filter((o) => o.dealId === deal.id && o.titlePackage).map((o) => ({ id: o.id, toEmail: o.toEmail, toName: o.toName, status: o.status, createdAt: o.createdAt, sentAt: o.sentAt })),
      log: clone(d.titleLog.filter((l) => l.dealId === deal.id)).reverse().slice(0, 40) };
  }

  return {
    async getTitle(dealId) { const { u, deal, canEdit } = reader(dealId); return view(u, deal, canEdit); },
    async startTitleReview(dealId) { const { u, deal } = editor(dealId); ensureReview(u, deal); done(u, deal, ['Title review', 'opened']); return view(u, deal, true); },
    async saveTitleReview(dealId, input) { const { u, deal } = editor(dealId); const c = clean(input, REVIEW_FIELDS, 'Title review'); const r = ensureReview(u, deal);
      if (c.reviewerId && !(prof(c.reviewerId) && T.titleCanEdit(prof(c.reviewerId)))) fail('The reviewer must be CLA staff who can edit the title review.');
      Object.assign(r, c); stamp(r, u, false);
      // RULE: the current vesting deed's owner must match the seller(s) in the portal; a discrepancy is flagged for review (typed row)
      if (c.vestingOwnerName && !T.namesMatch(c.vestingOwnerName, sellerNames(dealId))) flag(u, dealId, 'owner_seller_mismatch', `Vesting deed owner "${c.vestingOwnerName}" does not match the seller(s) in the portal (${sellerNames(dealId).join(', ') || 'none'}).`);
      for (const [k, type, what] of [['contractBuyerMatch', 'buyer_name_mismatch', 'Buyer names on the contract'], ['contractSellerMatch', 'seller_name_mismatch', 'Seller names on the contract'], ['contractAddressMatch', 'address_mismatch', 'Property address on the contract'],
        ['contractLegalMatch', 'legal_description_mismatch', 'Legal description on the contract'], ['contractTaxIdMatch', 'tax_id_mismatch', 'Tax account # on the contract'], ['sdatMatches', 'tax_id_mismatch', 'SDAT record (tax ID / owner / premises / legal)']])
        if (c[k] === false) flag(u, dealId, type, `${what} does not match the subject property / the portal.`);
      done(u, deal, ['Title review', `saved: ${Object.keys(c).join(', ')}`]); return view(u, deal, true); },
    async setTitleReviewStatus(dealId, status) { const { u, deal } = editor(dealId); const r = ensureReview(u, deal);
      if (status === 'auto') r.statusManual = false; else { if (!T.REVIEW_STATUSES.some(([k]) => k === status)) fail('Unknown title review status.'); r.statusManual = true; deal.titleReviewStatus = status; }
      stamp(r, u, false); done(u, deal, ['Title review status', status]); return view(u, deal, true); },
    async setTitleStep(dealId, key, status, note) { const { u, deal } = editor(dealId); ensureReview(u, deal); setStep(u, dealId, key, status, note); done(u, deal, ['Checklist', `${T.stepLabel(key)}: ${status}`]); return view(u, deal, true); },

    // ---------- documents ----------
    async ensureTitleFolders(dealId) { const { u, deal } = editor(dealId); T.TITLE_FOLDERS.forEach((n) => folderFor(u, dealId, n)); done(u, deal, ['Folders', 'title folders added']); return T.TITLE_FOLDERS.length; },
    async tagTitleDocument(dealId, docId, kind) { const { u, deal } = editor(dealId); const doc = db().documents.find((z) => z.id === docId && z.dealId === dealId) || fail('Document not found.');
      if (kind && !T.DOC_KINDS.some(([k]) => k === kind)) fail('Unknown title document kind.'); if (x.isWireDoc(doc)) fail('Wire instructions are not title documents.');
      doc.titleDocKind = kind || null; if (kind) doc.folderId = folderFor(u, dealId, T.docKindFolder(kind)).id;   // e.g. the search package and the tax certificate move from SEARCH into 200 Title
      if (kind === 'md_ack') setStep(u, dealId, 'md_ack', 'done'); if (kind === 'eo') setStep(u, dealId, 'eo_doc', 'done');
      done(u, deal, ['Document', `${doc.name}: ${kind ? T.docKindLabel(kind) : 'not a title document'}`]); return true; },
    async addTitleDocRecord(dealId, kind, name) { const { u, deal } = editor(dealId); if (!T.DOC_KINDS.some(([k]) => k === kind)) fail('Unknown title document kind.'); T.noSsn({ name });
      const n = str(name, 180) || `${T.docKindLabel(kind)}.pdf`; const doc = mkDoc(u, dealId, kind, /\.\w{2,4}$/.test(n) ? n : n + '.pdf', { description: 'Record added in the Title module (FAKE demo: no file content).' });
      if (kind === 'md_ack') setStep(u, dealId, 'md_ack', 'done'); if (kind === 'eo') setStep(u, dealId, 'eo_doc', 'done');
      done(u, deal, ['Document', `${doc.name} added`]); return { id: doc.id, name: doc.name }; },

    // ---------- bankruptcy (PACER): party, search type, result, receipt. NO SSN. ----------
    async savePacerSearch(dealId, input) { const { u, deal } = editor(dealId); T.noSsn(input);
      const allowed = ['participantId', 'partyName', 'partyRole', 'searchType', 'exactMatch', 'result', 'notes']; for (const k of Object.keys(input || {})) if (!allowed.includes(k)) fail(`PACER search: unknown field "${k}".`);
      const role = input.partyRole === 'buyer' || input.partyRole === 'seller' ? input.partyRole : fail('Party role must be buyer or seller.');
      const p = input.participantId ? parties(dealId, role === 'buyer' ? 'Client-Buyer' : 'Client-Seller').find((z) => z.participantId === input.participantId) || fail('That party is not on this order.') : null;
      const name = p ? p.name : str(input.partyName, 120) || fail('Party name is required.');
      const type = T.PACER_SEARCH_TYPES.some(([k]) => k === input.searchType) ? input.searchType : fail('Search type must be SSN search or Party (name) search.');
      const result = T.PACER_RESULTS.some(([k]) => k === input.result) ? input.result : fail('Result must be "No results found" or "Results found".');
      if (result === 'results_found' && !str(input.notes)) fail('Results found: add a note describing the case(s).');
      ensureReview(u, deal); const doc = mkDoc(u, dealId, 'pacer_receipt', T.pacerDocName(name, result), { description: `PACER ${type === 'ssn' ? 'SSN' : 'party name'} search receipt (FAKE demo record).` });
      const row = stamp({ id: nid('tpac'), dealId, participantId: p ? p.participantId : null, partyName: name, partyRole: role, searchType: type, exactMatch: type === 'party_name' ? !(input.exactMatch === false || input.exactMatch === 'false') : null,
        searchedAt: now(), searchedBy: u.id, result, notes: str(input.notes, 1000), documentId: doc.id }, u, true);
      db().titlePacer.push(row);
      for (const rl of ['buyer', 'seller']) if (pacerComplete(dealId, rl)) setStep(u, dealId, rl === 'buyer' ? 'pacer_buyer' : 'pacer_seller', 'done');
      done(u, deal, ['PACER', `${name} (${role}): ${result === 'no_results' ? 'No results found' : 'Results found'}`]); return clone(row); },
    async retirePacerSearch(id) { const row = db().titlePacer.find((z) => z.id === id && !z.deletedAt) || fail('Search not found.'); const { u, deal } = editor(row.dealId); row.deletedAt = now(); row.deletedBy = u.id; stamp(row, u, false); done(u, deal, ['PACER', `${row.partyName} search removed (kept in history)`]); return true; },

    // ---------- discrepancies ----------
    async addTitleDiscrepancy(dealId, { type, description } = {}) { const { u, deal } = editor(dealId); if (!T.DISCREPANCY_TYPES.some(([k]) => k === type)) fail('Unknown discrepancy type.'); T.noSsn({ description });
      const row = stamp({ id: nid('tdis'), dealId, discrepancyType: type, description: str(description, 500) || fail('Describe the discrepancy.'), status: 'open', resolvedBy: null, resolvedAt: null, resolutionNote: '' }, u, true); db().titleDiscrepancies.push(row); done(u, deal, ['Discrepancy', `${T.discrepancyLabel(type)} flagged`]); return clone(row); },
    async resolveTitleDiscrepancy(id, note) { const row = db().titleDiscrepancies.find((z) => z.id === id && !z.deletedAt) || fail('Discrepancy not found.'); const { u, deal } = editor(row.dealId); T.noSsn({ note });
      row.status = 'resolved'; row.resolvedBy = u.id; row.resolvedAt = now(); row.resolutionNote = str(note, 500); stamp(row, u, false); done(u, deal, ['Discrepancy', `${T.discrepancyLabel(row.discrepancyType)} resolved`]); return clone(row); },

    // ---------- chain of title ----------
    async saveChainEntry(dealId, input) { const { u, deal } = editor(dealId); const { id, ...rest } = input || {}; const c = clean(rest, CHAIN_FIELDS, 'Chain of title'); ensureReview(u, deal);
      let e = id ? db().titleChain.find((z) => z.id === id && z.dealId === dealId && !z.deletedAt) || fail('Chain entry not found.') : null; const first = !e;
      if (!e) { e = { id: nid('tch'), dealId, position: nextPos(live('titleChain', dealId)), instrumentType: 'Deed', pertainsToProperty: true, overrideOn: false, overrideText: '', instrumentNumber: '', certOfTitleNumber: '', documentNumber: '' }; db().titleChain.push(e); }
      Object.assign(e, c); e.generatedText = T.chainClause(e, ctxOf(deal)); stamp(e, u, first); done(u, deal, ['Chain of title', `#${e.position} ${e.instrumentType} ${first ? 'added' : 'edited'}`]); return clone(e); },
    async retireChainEntry(id) { const e = db().titleChain.find((z) => z.id === id && !z.deletedAt) || fail('Chain entry not found.'); const { u, deal } = editor(e.dealId); e.deletedAt = now(); e.deletedBy = u.id; stamp(e, u, false); done(u, deal, ['Chain of title', `#${e.position} removed (soft delete)`]); return true; },

    // ---------- loan check: reuses the order's loan fields (lender, loan amount); adds only the missing ones on the order ----------
    async saveTitleLoan(dealId, input) { const { u, deal } = editor(dealId); const { lenderName, loanAmount, ...rest } = input || {}; T.noSsn({ lenderName });
      const c = clean(rest, { ...LOAN_DEAL_FIELDS, trLoanAmount: 'm', trLenderName: 's', trLoanIdNumber: 's' }, 'Loan check');
      const r = ensureReview(u, deal); for (const k of Object.keys(LOAN_DEAL_FIELDS)) if (k in c) deal[k] = c[k];
      if (lenderName != null) deal.lenderName = str(lenderName, 200);
      if (loanAmount !== undefined) { const n = loanAmount === '' || loanAmount == null ? null : Number(String(loanAmount).replace(/[$,]/g, '')); if (n != null && (!isFinite(n) || n < 0)) fail('Loan amount must be a positive number.'); deal.loanAmount = n; }
      for (const k of ['trLoanAmount', 'trLenderName', 'trLoanIdNumber']) if (k in c) r[k] = c[k]; stamp(r, u, false);
      const diffs = []; if (r.trLoanAmount != null && deal.loanAmount != null && Number(r.trLoanAmount) !== Number(deal.loanAmount)) diffs.push(`loan amount ${T.usd2(r.trLoanAmount)} vs ${T.usd2(deal.loanAmount)}`);
      if (r.trLenderName && deal.lenderName && T.coreLender(r.trLenderName) !== T.coreLender(deal.lenderName)) diffs.push(`lender "${r.trLenderName}" vs "${deal.lenderName}"`);
      if (r.trLoanIdNumber && deal.loanIdNumber && r.trLoanIdNumber !== deal.loanIdNumber) diffs.push(`loan ID ${r.trLoanIdNumber} vs ${deal.loanIdNumber}`);
      if (diffs.length) flag(u, dealId, 'loan_mismatch', `Title request vs the order: ${diffs.join('; ')}.`);
      done(u, deal, ['Loan check', diffs.length ? `mismatch: ${diffs.join('; ')}` : 'saved']); return { diffs, view: view(u, deal, true) }; },

    // ---------- Schedule A: "Insert being clause" builds the FOR INFORMATIONAL PURPOSES ONLY block at the end of the legal description ----------
    async insertBeingClause(dealId) { const { u, deal } = editor(dealId); const r = ensureReview(u, deal); const v = view(u, deal, true);
      r.legalDescription = T.insertBeingClause(r.legalDescription, v.infoBlock); stamp(r, u, false); done(u, deal, ['Schedule A', 'being clause inserted']); return r.legalDescription; },

    // ---------- requirements (B-I) / exceptions (B-II) ----------
    async listTitleTemplates(kind) { if (!flags.title) fail(T.TITLE_OFF); const u = needUser(); if (!T.titleCanRead(u)) fail(T.TITLE_STAFF_ONLY);
      const ex = kind === 'exception'; const list = ex ? T.EXCEPTION_TEMPLATES : T.REQUIREMENT_TEMPLATES; const groups = ex ? T.EXCEPTION_GROUPS : T.REQUIREMENT_GROUPS;
      const recent = [...new Set(db().titleItems.filter((z) => z.kind === (ex ? 'exception' : 'requirement') && z.createdBy === u.id && z.templateKey).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((z) => z.templateKey))].slice(0, 8);
      const out = (t) => ({ key: t.key, label: t.label, tab: t.tab, fields: t.fields || '', preview: t.text || '' });
      return { all: list.map(out), standard: list.filter((t) => t.tab === 'standard').map(out), groups: groups.map((g) => ({ key: g.key, label: g.label, items: [...g.items] })), recent: recent.map((k) => list.find((t) => t.key === k)).filter(Boolean).map(out), custom: [{ key: '', label: 'Custom (type your own text)', tab: 'custom', fields: '', preview: '' }] }; },
    async addTitleItem(dealId, input = {}) { const { u, deal } = editor(dealId); const kind = input.kind === 'exception' ? 'exception' : input.kind === 'requirement' ? 'requirement' : fail('Kind must be requirement or exception.');
      const key = str(input.templateKey, 60); const t = key ? T.templateOf(kind, key) || fail('Unknown template.') : null; T.noSsn({ bodyText: input.bodyText });
      if (!t && !str(input.bodyText)) fail('Type the text of the custom item.');
      const parent = input.parentId ? items(dealId, kind).find((z) => z.id === input.parentId && !z.parentId) || fail('Parent item not found (sub-items go one level deep).') : null;
      const r = ensureReview(u, deal); const siblings = items(dealId, kind).filter((z) => (z.parentId || null) === (parent ? parent.id : null));
      const row = { id: nid('titem'), dealId, kind, parentId: parent ? parent.id : null, position: nextPos(siblings), templateKey: t ? t.key : '', status: 'open', overrideOn: false, overrideText: '', bodyText: t ? '' : str(input.bodyText, 8000), payoffId: null, dotNeedsPayoff: t && t.key === 'dot_release' ? true : null };
      T.ITEM_FIELD_KEYS.forEach((k) => { row[k] = null; });
      // auto-fill from the order: tax ID / tax info from the search package; deed + new DOT from the parties, the lender and the loan amount
      if (t && t.key === 'tax') Object.assign(row, { taxIdNumber: r.sdatTaxId || null, taxYear: r.taxYear || null, taxBaseAnnual: r.taxBaseAnnual ?? null, taxFirstHalfStatus: r.taxFirstHalfStatus || null, taxFirstHalfAmount: r.taxFirstHalfAmount ?? null, taxSecondHalfStatus: r.taxSecondHalfStatus || null,
        taxSecondHalfAmount: r.taxSecondHalfAmount ?? null, taxDueDates: r.taxDueDates || null, taxPenaltyInterest: r.taxPenaltyInterest ?? null, taxDelinquentAmount: r.taxDelinquentAmount ?? null, taxForwardBillTo: r.taxForwardBillTo || null });
      if (t && t.key === 'deed') Object.assign(row, { deedGrantor: T.joinNames(sellerNames(dealId)) || null, deedGrantee: T.joinNames(buyerNames(dealId)) || null });
      if (t && t.key === 'new_dot') Object.assign(row, { newDotGrantor: T.joinNames(buyerNames(dealId)) || null, newDotLender: deal.lenderName || null, newDotAmount: deal.loanAmount ?? null });
      if (t && t.key === 'dot_release') Object.assign(row, { dotGrantor: T.joinNames(sellerNames(dealId)) || null });
      Object.assign(row, input.fields ? clean(input.fields, ITEM_FIELDS, 'Requirement') : {}); genItem(row, deal); stamp(row, u, true); db().titleItems.push(row);
      done(u, deal, [kind === 'exception' ? 'Exception' : 'Requirement', `${t ? t.label : 'Custom'} added`]); return clone(row); },
    async addTitleGroup(dealId, kind, groupKey) { const g = (kind === 'exception' ? T.EXCEPTION_GROUPS : T.REQUIREMENT_GROUPS).find((z) => z.key === groupKey) || fail('Unknown group.'); let parent = null; const out = [];
      for (const k of g.items) { const row = await this.addTitleItem(dealId, { kind, templateKey: k, parentId: g.nest && parent ? parent.id : null }); if (g.nest && !parent) parent = row; out.push(row); } return out; },
    async updateTitleItem(id, patch) { const row = db().titleItems.find((z) => z.id === id && !z.deletedAt) || fail('Item not found.'); const { u, deal } = editor(row.dealId);
      const c = clean(patch, ITEM_FIELDS, row.kind === 'exception' ? 'Exception' : 'Requirement'); if (c.bodyText != null && row.templateKey) delete c.bodyText;
      Object.assign(row, c); genItem(row, deal); stamp(row, u, false); done(u, deal, [row.kind === 'exception' ? 'Exception' : 'Requirement', `edited${c.status ? ` (${c.status})` : ''}`]); return clone(row); },
    async moveTitleItem(id, dir) { const row = db().titleItems.find((z) => z.id === id && !z.deletedAt) || fail('Item not found.'); const { u, deal } = editor(row.dealId);
      const sib = items(row.dealId, row.kind).filter((z) => (z.parentId || null) === (row.parentId || null)).sort((a, b) => a.position - b.position); const i = sib.findIndex((z) => z.id === id); const j = dir === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= sib.length) return false; const p = sib[i].position; sib[i].position = sib[j].position; sib[j].position = p; stamp(sib[i], u, false); stamp(sib[j], u, false); done(u, deal, ['Reorder', `${row.kind} moved ${dir}`]); return true; },
    // SOFT delete. A parent with indented sub-conditions: withChildren true deletes them too ("Delete sub-conditions?" Yes); false keeps them, moved to the top level
    async retireTitleItem(id, { withChildren = false } = {}) { const row = db().titleItems.find((z) => z.id === id && !z.deletedAt) || fail('Item not found.'); const { u, deal } = editor(row.dealId);
      const kids = items(row.dealId, row.kind).filter((z) => z.parentId === row.id); const top = items(row.dealId, row.kind).filter((z) => !z.parentId); const base = nextPos(top);
      kids.forEach((k, i) => { if (withChildren) { k.deletedAt = now(); k.deletedBy = u.id; } else { k.parentId = null; k.position = base + i; } stamp(k, u, false); });
      row.deletedAt = now(); row.deletedBy = u.id; stamp(row, u, false);
      done(u, deal, [row.kind === 'exception' ? 'Exception' : 'Requirement', `deleted (soft)${kids.length ? (withChildren ? ` with ${kids.length} sub-condition(s)` : `; ${kids.length} sub-condition(s) kept`) : ''}`]); return { deleted: 1 + (withChildren ? kids.length : 0) }; },

    // ---------- tie-in with Payoffs / HOA (linked both ways) ----------
    async createPayoffFromItem(itemId) { const row = db().titleItems.find((z) => z.id === itemId && !z.deletedAt && z.templateKey === 'dot_release') || fail('Pick a Deed of Trust requirement.'); const { u, deal } = editor(row.dealId);
      if (!flags.accounting) fail('Payoffs / HOA is not turned on in this portal.'); if (!u || !(u.isAdmin || ['Processor','Preprocessor'].includes(u.role))) fail('Only a Processor or Admin creates payoffs.');
      if (row.payoffId && (db().payoffs || []).some((p) => p.id === row.payoffId && !p.retired)) fail('This Deed of Trust already has a payoff.');
      const used = new Set((db().payoffs || []).filter((p) => p.dealId === row.dealId && !p.retired).map((p) => p.position)); let pos = 1; while (used.has(pos)) pos++; if (pos > 4) fail('This order already has 4 payoffs.');
      const rec = {}; if (row.dotLender) rec.originalMortgagee = row.dotLender; if (row.dotTrustee) rec.originalTrustee = row.dotTrustee; if (row.dotAmount != null) rec.originalAmount = row.dotAmount; if (row.dotDate) rec.dotDate = row.dotDate;
      if (row.dotRecordedDate) rec.dateRecorded = row.dotRecordedDate; if (row.dotInstrumentNumber) rec.instrument = row.dotInstrumentNumber; if (row.dotBook) rec.book = row.dotBook; if (row.dotPage) rec.page = row.dotPage;
      const n = T.numberItems(items(row.dealId, 'requirement')).find((z) => z.id === row.id);
      const p = await api.savePayoff(row.dealId, { position: pos, lender: { name: row.dotLender || 'Payoff lender (from Title)' }, lienHolder: row.dotLender || '', trustee: row.dotTrustee || '', isMortgage: true, recording: rec, note: `From Title REQ#${n ? n.number : ''}: ${T.dotPayoffLine(row)}` });
      const pr = db().payoffs.find((z) => z.id === p.id); pr.titleItemId = row.id; const r2 = db().titleItems.find((z) => z.id === row.id); r2.payoffId = p.id; stamp(r2, u, false);
      done(u, deal, ['Payoff', `created from REQ#${n ? n.number : ''} (${PO_TAB(pos)})`]); return { payoffId: p.id, position: pos }; },
    async createHoaPayoffFromTitle(dealId) { const { u, deal } = editor(dealId); if (!flags.accounting) fail('Payoffs / HOA is not turned on in this portal.'); if (!u || !(u.isAdmin || ['Processor','Preprocessor'].includes(u.role))) fail('Only a Processor or Admin creates payoffs.');
      const r = reviewOf(dealId); if (!hoaFound(r) || !str(r.assocName)) fail('Enter the HOA / condo association on Contract review first.');
      const name = r.assocName; const comp = (db().otherCompanies || []).find((c) => c.type === 'hoa' && c.name.toLowerCase() === name.toLowerCase()) || await api.createOtherCompany({ type: 'hoa', name });
      const have = (db().dealOtherContacts || []).find((o) => o.dealId === dealId && !o.retired && o.companyId === comp.id); const oc = have || await api.addOtherContact(dealId, comp.id, 'hoa');
      const rec = db().dealOtherContacts.find((o) => o.id === oc.id); rec.fromTitleReviewId = r.id; const r2 = reviewOf(dealId); r2.hoaOtherContactId = oc.id; stamp(r2, u, false);
      done(u, deal, ['HOA payoff', `${name} added to Payoffs / HOA`]); return { otherContactId: oc.id }; },

    // ---------- finalize / CPL / Prelim CD / buyer copy / package / send ----------
    async finalizeCommitment(dealId) { const { u, deal } = editor(dealId); const r = ensureReview(u, deal);
      if (T.beingClauseMissing(r.legalDescription)) fail(T.BEING_MISSING); if (!str(r.commitmentNumber)) fail('Add the commitment number on Schedule A first.');
      r.commitmentStatus = 'final'; r.finalizedAt = now(); r.finalizedBy = u.id; stamp(r, u, false);
      let doc = docOfKind(dealId, 'title_commitment'); if (!doc) doc = mkDoc(u, dealId, 'title_commitment', 'Title Commitment.pdf', { description: `Commitment ${r.commitmentNumber} (${r.commitmentForm || ''}), generated by the Title module (FAKE).` });
      r.commitmentDocumentId = doc.id; setStep(u, dealId, 'finalized', 'done'); setStep(u, dealId, 'schedule_a', 'done'); done(u, deal, ['Commitment', `Final (${r.commitmentNumber})`]); return { documentId: doc.id }; },
    async reopenCommitment(dealId) { const { u, deal } = editor(dealId); const r = ensureReview(u, deal); r.commitmentStatus = 'draft'; stamp(r, u, false); setStep(u, dealId, 'finalized', 'open'); done(u, deal, ['Commitment', 'back to Draft']); return true; },
    async issueCpl(dealId, input = {}) { const { u, deal } = editor(dealId); T.noSsn(input); const protectedParty = str(input.protectedParty, 200) || deal.lenderName || fail('Protected party is required.');
      const legacy = str(input.cplType, 80); const type = legacy && T.CPL_TYPES.includes(legacy) ? legacy : ''; const clause = T.LENDER_CLAUSES.includes(input.lenderClause) ? input.lenderClause : T.LENDER_CLAUSES[0];
      const who = input.cplFor === 'seller' ? 'seller' : 'buyer'; const review = ensureReview(u, deal);
      const price = resolveCplPrice(ensureNov5(db()).cplPrices, { state: deal.state, underwriter: review.underwriter || '' });
      const match = T.cplLenderMatches(protectedParty, deal.lenderName); const number = T.fakeCplId(db().seq + 1);
      if (price.unresolved) {
        const row = stamp({ id: nid('tcpl'), dealId, cplNumber: number, protectedParty, lenderNameAtIssue: deal.lenderName || '', lenderMatch: match, cplType: type, lenderClause: clause, cost: null, status: 'blocked', escalated: true, cplFor: who, issuedAt: null, issuedBy: null, documentId: null, priceId: null }, u, true);
        db().titleCpls.push(row); notify([deal.processorId || u.id], { kind: 'cpl-price', dealId, title: `CPL price needed: ${deal.fileNumber}`, link: `#/deals/${dealId}/title?v=cpl` });
        const ob = { id: nid('ob'), channel: 'email', status: 'queued', toProfileId: deal.processorId || u.id, toEmail: '', toName: nameOf(deal.processorId || u.id), subject: `CPL price unresolved - ${deal.fileNumber}`, body: `${CPL_UNRESOLVED}\n\nTEST PORTAL: queued only; never sent.`, dealId, createdBy: u.id, createdAt: now(), sentAt: null, sendBlocked: 'No CPL price is configured.', titlePackage: false };
        db().outbox.push(ob); done(u, deal, ['CPL', `${number} blocked: price unresolved (not zero)`]); return { ...clone(row), issued: false, blocked: true, escalated: true, cost: null, warning: CPL_UNRESOLVED }; }
      const doc = mkDoc(u, dealId, 'cpl', `Closing Protection Letter (${number}).pdf`, { description: `CPL for the ${who}, protected party ${protectedParty} (FAKE).` });
      const row = stamp({ id: nid('tcpl'), dealId, cplNumber: number, protectedParty, lenderNameAtIssue: deal.lenderName || '', lenderMatch: match, cplType: type, lenderClause: clause, cost: price.amount, status: 'issued', escalated: false, cplFor: who, issuedAt: now(), issuedBy: u.id, documentId: doc.id, priceId: price.priceId }, u, true);
      db().titleCpls.push(row); if (!match) flag(u, dealId, 'cpl_lender_mismatch', `${number}: protected party "${protectedParty}" does not match the order's lender "${deal.lenderName || 'none'}".`);
      setStep(u, dealId, who === 'seller' ? 'cpl_seller' : 'cpl_buyer', 'done'); done(u, deal, ['CPL', `${number} issued for the ${who}${match ? '' : ' (lender mismatch flagged)'}`]); return { ...clone(row), issued: true, blocked: false, warning: match ? '' : T.CPL_LENDER_MISMATCH }; },
    async filePrelimCd(dealId) { const { u, deal } = editor(dealId); ensureReview(u, deal); let doc = docOfKind(dealId, 'prelim_cd');
      if (!doc) doc = mkDoc(u, dealId, 'prelim_cd', 'Prelim CD.pdf', { description: 'Closing Disclosure draft from the Accounting tab, NOT shared (staff only; TEST, not a legal disclosure).', linkedHash: `#/deals/${dealId}/accounting?v=cd` });
      setStep(u, dealId, 'prelim_cd', 'done'); done(u, deal, ['Prelim CD', 'filed in 200 Title (unshared)']); return { documentId: doc.id }; },
    async buildBuyerCommitmentCopy(dealId, { signaturePage = 1, signatureX = 70, signatureY = 85 } = {}) { const { u, deal } = editor(dealId); const kinds = T.buyerCopyKinds(deal);
      const missing = kinds.filter((k) => !docOfKind(dealId, k)); if (missing.length) fail(`Missing for the buyer copy: ${missing.map(T.docKindLabel).join(', ')}.`);
      const buyers = parties(dealId, 'Client-Buyer'); if (!buyers.length) fail('No buyer on this order.');
      const doc = mkDoc(u, dealId, 'buyer_commitment_copy', 'Buyers Initial Commitment copy.pdf', { folder: T.BUYER_COPY_FOLDER, visibility: 'buyer', description: `Merged: ${kinds.map(T.docKindLabel).join(' + ')} (FAKE demo record; no PDF merge).` });
      kinds.forEach((k, i) => db().titlePackageComponents.push(stamp({ id: nid('tpc'), dealId, packageDocumentId: doc.id, packageKind: 'buyer_commitment_copy', componentKind: k, componentDocumentId: docOfKind(dealId, k).id, position: i + 1, missing: false }, u, true)));
      // e-sign: no real provider. Buyers with a portal login get the existing signature request (sign task + bell); the others a plain buyer task. Reminders: the existing outbox pattern (queued only).
      const withLogin = buyers.filter((b) => b.profileId && prof(b.profileId) && prof(b.profileId).status === 'active'); let portalReq = null;
      if (withLogin.length) portalReq = await api.requestSignature(doc.id, { signerIds: withLogin.map((b) => b.profileId), message: "Please review and sign your Buyer's Initial Commitment copy (title commitment). FAKE demo." });
      const out = [];
      for (const b of buyers) { let taskId = null;
        if (portalReq) { const s = (db().signatureRequests || []).find((q) => q.id === portalReq.id); const sg = s && s.signers.find((z) => z.profileId === b.profileId); if (sg) taskId = sg.taskId; }
        if (!taskId) { const t = { id: nid('t'), dealId, participantId: b.participantId, templateId: null, templateCode: null, templateVersion: null, kind: 'simple', title: 'Sign: Buyers Initial Commitment copy', description: 'Review and sign the Buyers Initial Commitment copy (title commitment). CLA Title sends it for e-signature once you have a portal login. FAKE demo.',
          assignedRole: 'Client-Buyer', status: 'todo', dueDate: localDate(3), formData: {}, savedAt: null, savedBy: null, completedAt: null, completedBy: null, createdBy: u.id, createdAt: now() }; db().tasks.push(t); taskId = t.id; }
        const s = stamp({ id: nid('tsig'), dealId, documentId: doc.id, signerParticipantId: b.participantId, signerName: b.name, status: 'requested', requestedAt: now(), requestedBy: u.id, signedAt: null, signaturePage: Number(signaturePage) || 1, signatureX: Number(signatureX) || 0, signatureY: Number(signatureY) || 0, portalSignatureRequestId: portalReq ? portalReq.id : null, taskId }, u, true);
        db().titleSignatures.push(s); out.push(clone(s)); }
      setStep(u, dealId, 'buyer_copy', 'done'); done(u, deal, ['Buyer copy', `e-sign requested from ${buyers.map((b) => b.name).join(', ')} (nothing sent)`]); return { documentId: doc.id, signatures: out }; },
    async buildTitlePackage(dealId) { const { u, deal } = editor(dealId); const r = ensureReview(u, deal);
      const doc = mkDoc(u, dealId, 'title_package', 'Title Package.pdf', { description: 'Title Package: CPL + Title Commitment + Tax Certificate + E&O + Prelim CD (component list; FAKE demo record, no PDF merge).' });
      const missing = []; T.PACKAGE_KINDS.forEach((k, i) => { const c = docOfKind(dealId, k); if (!c) missing.push(k);
        db().titlePackageComponents.push(stamp({ id: nid('tpc'), dealId, packageDocumentId: doc.id, packageKind: 'title_package', componentKind: k, componentDocumentId: c ? c.id : null, position: i + 1, missing: !c }, u, true)); });
      r.titlePackageDocumentId = doc.id; stamp(r, u, false); setStep(u, dealId, 'title_package', 'done');
      done(u, deal, ['Title Package', missing.length ? `built; MISSING ${missing.map(T.docKindLabel).join(', ')}` : 'built']); return { documentId: doc.id, missing: missing.map(T.docKindLabel) }; },
    // QUEUED ONLY: an outbox entry to the lender contact with the Title Package attached, + sent_at / by on the review. Nothing is sent.
    async sendTitlePackage(dealId, recipients = ['lender']) { const { u, deal } = editor(dealId); const r = ensureReview(u, deal);
      const roles = [...new Set((Array.isArray(recipients) ? recipients : [recipients]).filter(z => T.PACKAGE_RECIPIENT_ROLES.includes(z)))]; if (!roles.length) fail('Pick lender, buyer, listing agent, and/or buyer agent.');
      const packageRoles = roles.filter((z) => z !== 'buyer_agent');
      const pkg = packageRoles.length ? (docOfKind(dealId, 'title_package') || fail('Build the Title Package first.')) : null;
      const d = db(); const out = []; const add = (role, name, email, profileId = null) => { if (!email && !profileId) fail(`${role}: no email/contact on the order.`); const ob = { id: nid('ob'), channel: 'email', status: 'queued', toProfileId: profileId, toName: name, toEmail: email, subject: `Title Package - ${deal.fileNumber} - ${deal.street}, ${deal.city}`,
        body: `Template: ${T.TITLE_PACKAGE_TEMPLATE}. Hello ${name}, attached is the Title Package (CPL, Title Commitment, Tax Certificate, E&O, Prelim CD) for ${deal.street}, ${deal.city}, ${deal.state}. CLA Title & Escrow. (TEST portal: queued only, never sent.)`, templateKey: T.TITLE_PACKAGE_TEMPLATE,
        taskId: null, dealId, createdBy: u.id, createdAt: now(), sentAt: null, attachmentDocumentIds: [pkg.id], titlePackage: true }; Object.assign(ob, senderFor(d, 'processor', dealId)); d.outbox.push(ob); out.push(ob); };
      if (roles.includes('lender')) add('lender', deal.lenderContact || deal.lenderName || 'Lender', deal.lenderEmail);
      if (roles.includes('buyer')) for (const b of parties(dealId, 'Client-Buyer')) { const c = d.contacts.find(z => z.id === b.contactId) || {}; add('buyer', b.name, c.email, b.profileId); }
      if (roles.includes('listing_agent')) { const as = parties(dealId, 'Listing Agent'); if (!as.length) fail('No listing agent on this order.'); for (const a of as) { const c = d.contacts.find(z => z.id === a.contactId) || {}; add('listing_agent', a.name, c.email, a.profileId); } }
      if (roles.includes('buyer_agent')) { const commitment = docOfKind(dealId, 'title_commitment') || fail('The buyer agent receives the title commitment only. Finalize the commitment first.');
        const agents = parties(dealId, 'Buyer Agent'); if (!agents.length) fail('No buyer agent on this order.');
        for (const a of agents) { const c = d.contacts.find(z => z.id === a.contactId) || {}; const ob = { id: nid('ob'), channel: 'email', status: 'queued', toProfileId: a.profileId || null, toName: a.name, toEmail: c.email || '', subject: `Title commitment - ${deal.fileNumber} - ${deal.street}`,
          body: `Hello ${a.name}, attached is the title commitment only for ${deal.street}, ${deal.city}. Payoffs, wires, cash-to-close, curative and entity material are not included. (TEST portal: queued only, never sent.)`, templateKey: 'TITLE - Commitment only',
          taskId: null, dealId, createdBy: u.id, createdAt: now(), sentAt: null, attachmentDocumentIds: [commitment.id], titlePackage: false, titleRecipientRole: 'buyer_agent_commitment' }; Object.assign(ob, senderFor(d, 'processor', dealId)); d.outbox.push(ob); out.push(ob); } }
      r.packageSentAt = now(); r.packageSentBy = u.id; r.packageOutboxId = out[0].id; stamp(r, u, false); setStep(u, dealId, 'send_package', 'done');
      completeTask(u, deal, T.SEND_TASK, `${T.TITLE_PACKAGE_TEMPLATE} queued to ${roles.join(', ')} (outbox only, not sent).`); completeTask(u, deal, 'Title commitment sent');
      done(u, deal, ['Send Title Package', `queued to ${roles.join(', ')} (not sent; buyer agent gets the commitment only)`]); return { outboxId: out[0].id, outboxIds: out.map(o => o.id) }; },

    // ---------- Nov 5: search tracking / EMD gate and queues ----------
    async saveTitleSearch(dealId, input = {}) { const { u, deal } = editor(dealId); const c = clean(input, SEARCH_FIELDS, 'Title search');
      if (c.assignedTypistId && !(prof(c.assignedTypistId) && T.titleCanEdit(prof(c.assignedTypistId)))) fail('Assigned typist must be CLA Title staff.');
      if (!T.emdReceived(deal, db().tasks.filter(t => t.dealId === dealId)) && (c.receivedDate || c.assignedTypistId || c.notes)) fail(T.EMD_BLOCK);
      ensureReview(u, deal); let row = live('titleSearches', dealId)[0]; const first = !row; if (!row) { row = { id: nid('tsrch'), dealId }; db().titleSearches.push(row); }
      Object.assign(row, c); stamp(row, u, first); done(u, deal, ['Title search', first ? 'tracking added' : 'tracking updated']); return clone(row); },
    async getTitleSearchQueues() { const u = needUser(); if (!flags.title || !T.titleCanRead(u)) fail(T.TITLE_STAFF_ONLY); const d = db(); const deals = dealsFor(u); return T.searchQueues(d.titleSearches, deals, d.tasks).overdue.map(x => ({ ...clone(x.search), fileNumber: x.deal.fileNumber, processor: nameOf(x.deal.processorId), transactionType: x.deal.transactionType, openDate: x.deal.openDate })).concat([]); },
    async getTitleQueueView(kind) { const u = needUser(); if (!flags.title || !T.titleCanRead(u)) fail(T.TITLE_STAFF_ONLY); const d = db(); const q = T.searchQueues(d.titleSearches, dealsFor(u), d.tasks); const rows = kind === 'package_review' ? q.packageReview : q.overdue;
      return rows.map(x => ({ ...clone(x.search), fileNumber: x.deal.fileNumber, processor: nameOf(x.deal.processorId), transactionType: x.deal.transactionType, openDate: x.deal.openDate, typistName: x.search.typistId || x.search.assignedTypistId ? nameOf(x.search.typistId || x.search.assignedTypistId) : '' })); },
    async getLienCertQueue() { const u = needUser(); if (!flags.title || !T.titleCanRead(u)) fail(T.TITLE_STAFF_ONLY); const d = db(); return d.titleLienCerts.filter(z => !z.deletedAt && dealsFor(u).some(q => q.id === z.dealId)).map(z => ({ ...clone(z), fileNumber: (d.deals.find(q => q.id === z.dealId) || {}).fileNumber, overdue: T.lienCertOverdue(z) })); },

    // ---------- curative: one typed row per DOT / lien / judgment; no SSN or identity details ----------
    async saveTitleLien(dealId, input = {}) { const { u, deal } = editor(dealId); const { id, ...rest } = input; const c = clean(rest, LIEN_FIELDS, 'Curative item'); ensureReview(u, deal);
      let row = id ? db().titleLiens.find(z => z.id === id && z.dealId === dealId && !z.deletedAt) || fail('Curative item not found.') : null; const first = !row;
      if (!row) { row = { id: nid('tlien'), dealId, itemType: 'other', status: 'open', identityVerified: null }; db().titleLiens.push(row); }
      const candidate = { ...row, ...c }; const ex = T.curativeExpiry(candidate); if (ex && ex.expired) { c.status = 'expired'; c.verificationMethod = 'expiry_rule'; }
      if (candidate.itemType === 'state_tax_lien' && c.verificationMethod && c.verificationMethod !== 'identity_match' && c.verificationMethod !== 'recorded_release' && c.verificationMethod !== 'other') fail('State tax lien: verify identity match; no attorney call is needed.');
      if (c.identityVerified === true) { if (!str(c.identityVerifiedBy) || !c.identityVerifiedDate) fail('Identity verified: record yes, by and date only. Never enter an SSN.'); }
      if (candidate.itemType === 'mechanics_lien' && candidate.jurisdictionState === 'FL' && c.status === 'cleared' && ex && !ex.expired && candidate.sufficientFundsAffidavit !== true) fail('FL Notice of Commencement: sufficient funds affidavit required before clearance.');
      Object.assign(row, c); stamp(row, u, first); done(u, deal, ['Curative item', `${row.itemType}: ${row.status}`]); return clone(row); },
    async retireTitleLien(id) { const row = db().titleLiens.find(z => z.id === id && !z.deletedAt) || fail('Curative item not found.'); const { u, deal } = editor(row.dealId); row.deletedAt = now(); row.deletedBy = u.id; stamp(row, u, false); done(u, deal, ['Curative item', `${row.itemType} removed (soft)`]); return true; },
    async generateLienRequirement(id) { const row = db().titleLiens.find(z => z.id === id && !z.deletedAt) || fail('Curative item not found.'); if (row.status === 'expired') fail('Expired item: no payoff or B-I requirement.'); const { u, deal } = editor(row.dealId);
      const req = await this.addTitleItem(deal.id, { kind: 'requirement', templateKey: row.itemType === 'deed_of_trust' ? 'dot_release' : 'judgment_release', fields: row.itemType === 'deed_of_trust' ? { dotGrantor: row.mortgagor, dotLender: row.beneficiary, dotTrustee: row.trustee, dotDate: row.instrumentDate, dotRecordedDate: row.recordedDate, dotAmount: row.amount, dotBook: row.book, dotPage: row.page, dotInstrumentNumber: row.instrumentNumber } : {} });
      if (row.itemType !== 'deed_of_trust') { req.generatedText = T.requirementFromCurative(row, ctxOf(deal)); req.overrideOn = true; req.overrideText = req.generatedText; }
      row.requirementItemId = req.id; stamp(row, u, false); save(); return clone(req); },

    // ---------- entity review and attorney task ----------
    async saveTitleEntity(dealId, input = {}) { const { u, deal } = editor(dealId); const { id, ...rest } = input; const c = clean(rest, ENTITY_FIELDS, 'Entity review'); ensureReview(u, deal);
      let row = id ? db().titleEntities.find(z => z.id === id && z.dealId === dealId && !z.deletedAt) || fail('Entity review not found.') : null; const first = !row;
      if (!row) { row = { id: nid('tent'), dealId, side: 'buyer', criticalIssue: false, attorneyApproved: false }; db().titleEntities.push(row); }
      if (c.assignedAttorneyId) { const list = ensureNov5(db()).entityAttorneys; const byRow = list.find((a) => a.id === c.assignedAttorneyId && a.active && !a.retiredAt); if (byRow) c.assignedAttorneyId = byRow.profileId || fail('Link this attorney to a staff profile id before assigning them. A display name is not authorization.'); if (!attorneyAuthorized(list, c.assignedAttorneyId)) fail('Choose an entity-review attorney by profile id. A display name is not authorization.'); }
      Object.assign(row, c); if (!T.entityDocsComplete(row)) row.attorneyApproved = false; stamp(row, u, first);
      T.ENTITY_TASKS.forEach(name => ensureTask(u, deal, name, row.assignedAttorneyId || u.id));
      const req = db().tasks.find(t => t.dealId === dealId && t.title === 'Entity Documents Requested'); if (req) req.status = 'done';
      if (T.ENTITY_DOC_FIELDS.some(([k]) => row[k])) { const t = db().tasks.find(t => t.dealId === dealId && t.title === 'Entity Documents Received'); if (t) t.status = 'done'; }
      done(u, deal, ['Entity review', `${row.side}: ${row.criticalIssue ? 'CRITICAL ISSUE — attorney approval required' : 'saved'}`]); return clone(row); },
    async approveTitleEntity(id, note) { const row = db().titleEntities.find(z => z.id === id && !z.deletedAt) || fail('Entity review not found.'); const { u, deal } = editor(row.dealId);
      if (!attorneyAuthorized(ensureNov5(db()).entityAttorneys, u.id)) fail('Only a configured entity-review attorney can approve this. Authorization is the profile id on the list, not a name.'); T.noSsn({ note });
      row.attorneyApproved = true; row.attorneyApprovalNotes = str(note, 1000); stamp(row, u, false); completeTask(u, deal, 'Entity Documents Review Completed', row.attorneyApprovalNotes); done(u, deal, ['Entity review', 'attorney approved']); return clone(row); },

    // ---------- lien certificate: review due 24 hours after receipt ----------
    async saveTitleLienCert(dealId, input = {}) { const { u, deal } = editor(dealId); const { id, ...rest } = input; const c = clean(rest, CERT_FIELDS, 'Lien certificate'); ensureReview(u, deal);
      let row = id ? db().titleLienCerts.find(z => z.id === id && z.dealId === dealId && !z.deletedAt) || fail('Lien certificate not found.') : null; const first = !row;
      if (!row) { row = { id: nid('tlc'), dealId, outcome: 'pending' }; db().titleLienCerts.push(row); }
      if (c.receivedAt && isNaN(Date.parse(c.receivedAt))) fail('Receipt date/time is invalid.'); Object.assign(row, c); if (row.receivedAt) row.reviewDueAt = T.lienCertDue(row.receivedAt);
      if (row.outcome === 'clear_to_close' && !T.lienCertChecksComplete(row)) fail('Clear to close requires address/parcel match, all paid, zero violations and signed/dated.');
      stamp(row, u, first); ensureTask(u, deal, 'Lien Cert Review', u.id); if (row.outcome === 'clear_to_close') completeTask(u, deal, 'Lien Cert - Cleared to Close'); if (row.outcome === 'curative_needed') completeTask(u, deal, 'Lien Cert - Curative Needed');
      done(u, deal, ['Lien certificate', row.outcome]); return clone(row); },

    // ---------- Title CTC: every check is a typed row; processor note is internal only ----------
    async saveTitleCtcCheck(dealId, checkKey, input = {}) { const { u, deal } = editor(dealId); if (!T.CTC_ITEMS.some(([k]) => k === checkKey)) fail('Unknown CTC check.'); const c = clean(input, CTC_FIELDS, 'CTC check'); ensureReview(u, deal);
      if (checkKey === 'effectiveDate' && c.status === 'pass' && !T.effectiveDateCheck(reviewOf(dealId).effectiveDate, deal.closingDate).valid) fail('Effective date must be within 30 days before settlement.');
      let row = live('titleCtcChecks', dealId).find(z => z.checkKey === checkKey); const first = !row; if (!row) { row = { id: nid('tctc'), dealId, checkKey }; db().titleCtcChecks.push(row); } Object.assign(row, c); stamp(row, u, first); done(u, deal, ['Title CTC', `${checkKey}: ${row.status}`]); return clone(row); },
    async completeTitleCtc(dealId, processorNote = '') { const { u, deal } = editor(dealId); if (!T.ctcComplete(live('titleCtcChecks', dealId))) fail('Complete every Title CTC check as Pass or N/A first.'); T.noSsn({ processorNote });
      completeTask(u, deal, T.CTC_TASK, str(processorNote, 1000)); if (str(processorNote)) { db().titleProcessorNotes.push(stamp({ id: nid('tpnote'), dealId, body: str(processorNote, 1000) }, u, true)); notify([deal.processorId || u.id], { kind: 'title', dealId, title: `Title CLEAR TO CLOSE: ${deal.fileNumber}`, link: `#/deals/${dealId}/title?v=ctc` }); }
      setStep(u, dealId, 'tasks_updated', 'done'); done(u, deal, ['Title CTC', 'CLEAR TO CLOSE']); return true; },
    async alignTitleTasks(dealId) { const { u, deal } = editor(dealId); T.TITLE_ALIGNMENT_TASKS.forEach(t => ensureTask(u, deal, t)); done(u, deal, ['Title tasks', 'task list aligned']); return T.TITLE_ALIGNMENT_TASKS.length; },

    // ---------- the summary note + tasks ----------
    async prefillTitleSummary(dealId) { const { u, deal } = reader(dealId); const v = view(u, deal, false); const r = v.review || {};
      const dots = v.requirements.filter((z) => z.templateKey === 'dot_release'); const need = dots.filter((z) => z.dotNeedsPayoff !== false && z.status === 'open');
      const marital = (role) => db().tasks.filter((t) => t.dealId === dealId && t.assignedRole === role && t.templateCode === 'personal_info' && t.formData && t.formData.marital_status).map((t) => t.formData.marital_status);
      const pac = (role) => { const rows = v.pacer.filter((z) => z.partyRole === role); return pacerComplete(dealId, role) ? `Completed - ${rows.every((z) => z.result === 'no_results') ? 'No results found' : 'RESULTS FOUND'}` : rows.length ? 'Partial' : 'Pending'; };
      const step = (k) => (v.steps.find((s) => s.key === k) || {}).status;
      const assoc = (T.ASSOC_TYPES.find(([k]) => k === r.assocType) || [, ''])[1].toUpperCase();
      const out = { reviewerFirstName: (prof(r.reviewerId || u.id) || {}).firstName || '', noteDate: localDate(), sellerQuotedDeedPrep: '', buyerReceivingCpl: cplFor(dealId, 'buyer') ? 'YES' : '',
        propertyType: r.propertyType || (['condo', 'both'].includes(r.assocType) ? 'Condo' : ''), maritalStatus: [marital('Client-Seller').length ? `Seller: ${marital('Client-Seller').join(', ')}` : '', marital('Client-Buyer').length ? `Buyer: ${marital('Client-Buyer').join(', ')}` : ''].filter(Boolean).join(' / '),
        totalDots: String(dots.length), payoff1: need[0] ? T.dotPayoffLine(need[0]) : 'NO', payoff2: need[1] ? T.dotPayoffLine(need[1]) : 'NO', payoff3: need[2] ? T.dotPayoffLine(need[2]) : 'NO', judgmentsLiens: '',
        hoaCondo: hoaFound(r) ? `${assoc} - ${r.assocName || '[name]'}${r.assocFee != null ? ` - ${T.usd2(r.assocFee)} ${String(r.assocFeeFrequency || '').toUpperCase()}` : ''}` : 'NO',
        groundRent: r.groundRent ? r.groundRent.toUpperCase() : '', taxes: T.taxesLine(r), waterSewerAccount: '', taxSale: '', openPermits: '', surveyRequest: '', searchBuyer: pac('buyer'), searchSeller: pac('seller'), titleToIssue: 'Title Team',
        lienCert: '', priorTitlePolicy: v.docs.some((z) => z.kind === 'prior_policy') ? 'YES' : 'NO', cplBuyer: cplFor(dealId, 'buyer') ? 'Completed' : step('cpl_buyer') === 'na' ? 'N/A' : 'Pending', cplSeller: cplFor(dealId, 'seller') ? 'Completed' : step('cpl_seller') === 'na' ? 'N/A' : 'Pending',
        waterSewerExceptions: v.exceptions.some((z) => z.templateKey === 'water') ? 'YES' : 'NO' };
      return { fields: out, curative: T.curativeSuggestions(items(dealId), { hoaFound: ['condo', 'both'].includes(r.assocType) }) }; },
    async saveTitleSummary(dealId, input = {}) { const { u, deal } = editor(dealId); const { curative, reviewerFirstName, noteDate, ...rest } = input; const c = clean(rest, SUMMARY_TYPES, 'Summary note'); T.noSsn({ reviewerFirstName });
      const list = (Array.isArray(curative) ? curative : String(curative || '').split('\n')).map((z) => str(String(z).replace(/^\s*-\s*/, ''), 300)).filter(Boolean); list.forEach((z) => T.noSsn({ curative: z }));
      const date = T.isYmd(noteDate) ? noteDate : localDate(); const first = str(reviewerFirstName, 60) || (prof(u.id) || {}).firstName || '';
      ensureReview(u, deal); const s = stamp({ id: nid('tsum'), dealId, reviewerFirstName: first, noteDate: date, ...Object.fromEntries(T.SUMMARY_KEYS.map((k) => [k, c[k] ?? ''])) }, u, true);
      const body = T.summaryNoteText(s, list); const note = stamp({ id: nid('onote'), dealId, category: 'GENERAL', body, issueResolved: false, resolvedBy: null, resolvedAt: null, titleSummaryId: s.id }, u, true);
      s.orderNoteId = note.id; s.noteBody = body; db().titleSummaries.push(s); db().orderNotes.push(note);
      list.forEach((z, i) => db().titleCurative.push(stamp({ id: nid('tcur'), dealId, summaryId: s.id, position: i + 1, text: z }, u, true)));
      setStep(u, dealId, 'summary_note', 'done'); completeTask(u, deal, T.REVIEW_TASK, `Title review summary posted ${T.mmdd(date)} by ${first}.`);
      done(u, deal, ['Summary note', `posted to Notes (${list.length} curative item(s))`]); return { summaryId: s.id, noteId: note.id, body }; },
    // copy the outstanding title requirements (curative) into the notes of "Title - CLEAR TO CLOSE" (group "Title - Other"; created when missing)
    async updateTitleTasks(dealId) { const { u, deal } = editor(dealId); const r = ensureReview(u, deal); const pre = await this.prefillTitleSummary(dealId);
      const s = db().titleSummaries.filter((z) => z.dealId === dealId && !z.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const cur = s ? db().titleCurative.filter((c) => c.summaryId === s.id && !c.deletedAt).sort((a, b) => a.position - b.position).map((c) => c.text) : pre.curative;
      const note = T.ctcTaskNote(localDate(), (prof(r.reviewerId || u.id) || {}).firstName, cur); const t = ensureTask(u, deal, T.CTC_TASK, r.reviewerId); t.description = note.slice(0, 1000);
      ensureTask(u, deal, T.REVIEW_TASK, r.reviewerId); ensureTask(u, deal, T.SEND_TASK, r.reviewerId);
      setStep(u, dealId, 'tasks_updated', 'done'); done(u, deal, ['Tasks', `${T.CTC_TASK} notes updated`]); return { taskId: t.id, note }; },

    // ---------- order notes (Qualia sticky notes; CLA staff only; never deleted) ----------
    async listOrderNotes(dealId) { const u = needUser(); dealsFor(u).find((q) => q.id === dealId) || fail('Order not found.'); if (!isStaffView(x.scopeTo(u, dealId))) return [];
      return clone(live('orderNotes', dealId)).map((n) => ({ ...n, byName: nameOf(n.createdBy), resolvedByName: n.resolvedBy ? nameOf(n.resolvedBy) : '' })).reverse(); },
    async addOrderNote(dealId, { category, body } = {}) { const u = needUser(); const deal = dealsFor(u).find((q) => q.id === dealId) || fail('Order not found.'); if (!isStaffView(x.scopeTo(u, dealId)) || !isManager(u)) fail('Only the processor or coordinator adds order notes.');
      if (!T.NOTE_CATEGORIES.includes(category)) fail('Pick a note category.'); T.noSsn({ body }); if (x.looksLikeWireDetails && x.looksLikeWireDetails(String(body || ''))) fail('Notes cannot hold bank or wire details.');
      const n = stamp({ id: nid('onote'), dealId: deal.id, category, body: str(body, 4000) || fail('Write the note.'), issueResolved: false, resolvedBy: null, resolvedAt: null, titleSummaryId: null }, u, true); db().orderNotes.push(n); save(); return clone(n); },
    async setOrderNoteResolved(id, resolved) { const u = needUser(); const n = db().orderNotes.find((z) => z.id === id && !z.deletedAt) || fail('Note not found.'); dealsFor(u).find((q) => q.id === n.dealId) || fail('Order not found.');
      if (!isStaffView(x.scopeTo(u, n.dealId)) || !isManager(u)) fail('Only the processor or coordinator changes notes.'); n.issueResolved = !!resolved; n.resolvedBy = resolved ? u.id : null; n.resolvedAt = resolved ? now() : null; stamp(n, u, false); save(); return clone(n); },
    // printable view of a generated title record (no file content: the view is built from the typed rows)
    async getTitleDocumentView(docId) { const doc = db().documents.find((z) => z.id === docId && z.titleDocKind) || fail('Document not found.'); const { u, deal } = reader(doc.dealId); const v = view(u, deal, false);
      const comps = db().titlePackageComponents.filter((c) => c.packageDocumentId === doc.id && !c.deletedAt).sort((a, b) => a.position - b.position).map((c) => ({ kind: c.componentKind, label: T.docKindLabel(c.componentKind), missing: c.missing, name: c.componentDocumentId ? ((db().documents.find((z) => z.id === c.componentDocumentId) || {}).name || '') : '' }));
      return { doc: { id: doc.id, name: doc.name, kind: doc.titleDocKind, createdAt: doc.createdAt, description: doc.description }, title: v, components: comps, cpl: clone(db().titleCpls.find((c) => c.documentId === doc.id) || null) }; },
  };
}
const PO_TAB = (n) => ['First Payoff', 'Second Payoff', 'Third Payoff', 'Fourth Payoff'][n - 1] || `Payoff ${n}`;
