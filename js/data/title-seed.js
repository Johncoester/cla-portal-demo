/* TITLE MODULE sample orders. FAKE DATA ONLY: invented people (example.test emails, 555 phones), invented addresses and invented recording references.
 * No SSNs anywhere. Added once (d.titleSampleSeeded) to the existing v29 data, so nothing that is already stored changes.
 *  deal-t1 MD-26-90101  MD condo, title review IN PROGRESS (Jordan Sample buys from Pat Example; the vesting deed shows an owner mismatch)
 *  deal-t2 VA-26-90102  VA single-family, FINISHED (Final commitment, issued CPL, package queued earlier)
 *  deal-t3 DC-26-90103  DC rowhouse, title review NOT STARTED */
import * as T from './title.js?v=202611052140';

const AT = (day, h = 14) => `2026-${day}T${String(h).padStart(2, '0')}:00:00Z`;
export function seedTitleSamples(d) {
  // ADDITIVE ONLY: runs once per browser (marker d.titleSampleSeeded, set by ensureTitle). Every row is inserted only if its id is not taken;
  // nothing that already exists is overwritten or removed. If any sample order id or file number is already in use, nothing is added.
  const ids = ['deal-t1', 'deal-t2', 'deal-t3']; const files = ['MD-26-90101', 'VA-26-90102', 'DC-26-90103'];
  if (d.deals.some((q) => ids.includes(q.id) || files.includes(q.fileNumber))) return;
  for (const k of ['titleReviews', 'titleSteps', 'titlePacer', 'titleDiscrepancies', 'titleChain', 'titleItems', 'titleCpls', 'titlePackageComponents', 'titleSignatures', 'titleSummaries', 'titleCurative', 'titleSearches', 'titleLiens', 'titleEntities', 'titleLienCerts', 'titleCtcChecks', 'titleProcessorNotes', 'orderNotes', 'titleLog']) if (!Array.isArray(d[k])) d[k] = [];
  const free = (list, id) => !list.some((z) => z.id === id);
  const base = { stage: 2, status: 'Open', emdAmount: 5000, emdDueDate: null, lenderContact: 'Linda Lender', lenderEmail: 'linda.lender@example.test', lenderPhone: '410-555-0111', processorId: 'u-proc', salesPersonId: 'u-sp', createdBy: 'u-proc' };
  const deals = [
    { ...base, id: 'deal-t1', fileNumber: 'MD-26-90101', street: '400 Sample Court, Unit 2B', city: 'Rockville', state: 'MD', zip: '20850', county: 'Montgomery', transactionType: 'Purchase', openDate: '2026-10-22', closingDate: '2026-12-04',
      purchasePrice: 315000, loanAmount: 252000, lenderName: 'Example Home Loans (fake)', notes: 'Fake file (Title module sample). Condo purchase; title review in progress.', createdAt: AT('10-22'),
      loanIdNumber: 'FAKE-LN-0101', lossPayeeName: 'Example Home Loans (fake), ISAOA/ATIMA', usesMers: true, fundingType: 'net', firstPaymentDate: '2027-02-01', interestType: 'Fixed', loanType: 'Conventional', titleReviewStatus: 'in_progress' },
    { ...base, id: 'deal-t2', fileNumber: 'VA-26-90102', street: '12 Example Lane', city: 'Alexandria', state: 'VA', zip: '22301', county: 'City of Alexandria', transactionType: 'Purchase', stage: 6, openDate: '2026-10-01', closingDate: '2026-11-13',
      purchasePrice: 640000, loanAmount: 512000, lenderName: 'Example Home Loans (fake)', notes: 'Fake file (Title module sample). Title review finished; clear to close.', createdAt: AT('10-01'),
      loanIdNumber: 'FAKE-LN-0102', lossPayeeName: 'Example Home Loans (fake), ISAOA/ATIMA', usesMers: false, fundingType: 'gross', firstPaymentDate: '2027-01-01', interestType: 'Fixed', loanType: 'Conventional', titleReviewStatus: 'clear_to_close' },
    { ...base, id: 'deal-t3', fileNumber: 'DC-26-90103', street: '77 Placeholder Street NW', city: 'Washington', state: 'DC', zip: '20001', county: 'District of Columbia', transactionType: 'Purchase', stage: 0, openDate: '2026-11-02', closingDate: '2026-12-18',
      purchasePrice: 899000, loanAmount: 719200, lenderName: 'Example Home Loans (fake)', notes: 'Fake file (Title module sample). New order; title review not started.', createdAt: AT('11-02'), titleReviewStatus: 'not_started' },
  ];
  d.deals.push(...deals);
  const person = (id, first, last, phone) => ({ id, profileId: null, contactType: 'buyer_seller', firstName: first, lastName: last, email: `${first}.${last}`.toLowerCase() + '@example.test', phone, company: '', createdBy: 'u-proc', createdAt: AT('10-01') });
  const people = [person('c-tt-jordan', 'Jordan', 'Sample', '301-555-0201'), person('c-tt-pat', 'Pat', 'Example', '301-555-0202'), person('c-tt-riley', 'Riley', 'Placeholder', '703-555-0203'),
    person('c-tt-casey', 'Casey', 'Testcase', '703-555-0204'), person('c-tt-avery', 'Avery', 'Demo', '202-555-0205'), person('c-tt-quinn', 'Quinn', 'Mockley', '202-555-0206')];
  people.forEach((c) => { if (!d.contacts.some((z) => z.id === c.id)) d.contacts.push(c); });
  const link = (deal, cid, role) => free(d.participants, `dp-${deal.slice(5)}-${cid.slice(2)}`) && d.participants.push({ id: `dp-${deal.slice(5)}-${cid.slice(2)}`, dealId: deal, contactId: cid, role, createdAt: AT('10-01') });
  for (const [deal, buyer, seller] of [['deal-t1', 'c-tt-jordan', 'c-tt-pat'], ['deal-t2', 'c-tt-riley', 'c-tt-casey'], ['deal-t3', 'c-tt-avery', 'c-tt-quinn']]) {
    link(deal, 'c-proc', 'Processor'); link(deal, 'c-sp', 'Sales Person'); link(deal, buyer, 'Client-Buyer'); link(deal, seller, 'Client-Seller'); link(deal, 'c-lender1', 'Lender');
    if (Array.isArray(d.dealSalesPeople)) d.dealSalesPeople.push({ dealId: deal, salesId: 'u-sp', addedBy: 'u-proc', addedAt: AT('10-01') });
  }
  const folder = (deal, name, staffOnly = true) => { let f = d.folders.find((z) => z.dealId === deal && z.name === name); if (!f) { let n = d.folders.length + 1; while (!free(d.folders, `f-${deal.slice(5)}-${n}`)) n++; f = { id: `f-${deal.slice(5)}-${n}`, scope: 'deal', dealId: deal, name, staffOnly, createdBy: 'u-proc', createdAt: AT('10-01') }; d.folders.push(f); } return f; };
  ['Contract & addenda', 'IDs & personal', 'Lender & payoff', 'HOA', 'Closing'].forEach((n) => deals.forEach((q) => folder(q.id, n, false)));
  ['deal-t1', 'deal-t2'].forEach((q) => T.TITLE_FOLDERS.forEach((n) => folder(q, n)));
  let dn = 0; const doc = (deal, kind, name, when, extra = {}) => { let id; do { id = `doc-t${deal.slice(6)}-${++dn}`; } while (!free(d.documents, id)); d.documents.push({ id, dealId: deal, folderId: folder(deal, extra.folder || T.docKindFolder(kind), !extra.folder).id, name, description: 'FAKE sample record (no file content).',
    mimeType: 'application/pdf', size: 0, dataUrl: null, uploadedBy: 'u-proc', visibility: extra.visibility || 'staff', docType: '', sharedWithClient: false, sharedWithClientBy: null, sharedWithClientAt: null, wireInstructions: false, createdAt: when, titleDocKind: kind, titleGenerated: !!extra.generated, titleLinkedHash: '' }); return id; };
  const S = (row, when) => ({ ...row, createdAt: when, createdBy: 'u-proc', updatedAt: when, updatedBy: 'u-proc', deletedAt: null, deletedBy: null });
  const steps = (deal, keys, when) => keys.forEach((k) => d.titleSteps.push(S({ id: `tstep-${deal.slice(5)}-${k}`, dealId: deal, stepKey: k, status: 'done', doneAt: when, doneBy: 'u-proc', note: '' }, when)));
  const ctxMD = { county: 'Montgomery', state: 'MD' }; const ctxVA = { county: 'City of Alexandria', state: 'VA' };

  // ===== deal-t1: MD condo, mid-review =====
  const w1 = AT('11-03', 15);
  doc('deal-t1', 'title_order_email', 'Title order email - MD-26-90101.pdf', AT('10-22')); doc('deal-t1', 'search_package', 'Search package - 400 Sample Court.pdf', AT('10-28'));
  doc('deal-t1', 'tax_cert', 'Tax certificate - 04-00000001.pdf', AT('10-28'));
  const p1 = doc('deal-t1', 'pacer_receipt', 'Jordan Sample - Pacer Search - No Result.pdf', w1, { generated: true });
  d.titleReviews.push(S({ id: 'trev-t1', dealId: 'deal-t1', reviewerId: 'u-proc', reviewDate: '2026-11-03', commitmentStatus: 'draft', statusManual: false, propertyType: 'Condo', titleOrderEmailNotes: 'Lender requests a 2021 ALTA loan policy with ALTA 4.1 and 8.1-06 (fake).',
    sdatTaxId: '04-00000001', sdatOwnerName: 'PAT EXAMPLE & LEE EXAMPLE', sdatPremisesAddress: '400 SAMPLE CT UNIT 2B', sdatLegalShort: 'UNIT 2B SAMPLE COURT CONDO', sdatMatches: true,
    taxYear: '2026', taxBaseAnnual: 1851.46, taxFirstHalfStatus: 'paid', taxFirstHalfAmount: 925.73, taxSecondHalfStatus: 'unpaid', taxSecondHalfAmount: 925.73, taxDueDates: '12/31/2026', taxDelinquentAmount: null, taxPenaltyInterest: null, taxForwardBillTo: '',
    vestingOwnerName: 'Pat Example and Lee Example', contractBuyerMatch: true, contractSellerMatch: false, contractAddressMatch: true, contractLegalMatch: true, contractTaxIdMatch: true,
    assocType: 'condo', assocName: 'Sample Court Condominium (fake)', assocFee: 412, assocFeeFrequency: 'Monthly', feeInclWater: true, feeInclSewer: true, feeInclHeat: false, feeInclElectric: false, feeInclGas: true, feeInclAc: false,
    waterType: 'public', sewerType: 'public', frontFootBenefit: 'no', groundRent: 'no', transferTaxSplit: 'Split 50/50 (MD first-time buyer exemption not claimed)', contractNotes: 'Contract seller is Pat Example only; deed shows Pat and Lee Example (fake).',
    trLoanAmount: 252000, trLenderName: 'Example Home Loans (fake)', trLoanIdNumber: 'FAKE-LN-0101',
    underwriter: T.UNDERWRITERS[0], commitmentNumber: 'FAKE-MD-90101', commitmentForm: '2021 ALTA', effectiveDate: '2026-10-27', effectiveTime: '8:00 AM', proposedInsured: 'Jordan Sample', vestingText: 'Pat Example and Lee Example, as tenants by the entirety',
    legalDescription: 'Unit 2B in "Sample Court Condominium" (fake), as established by a Declaration recorded among the Land Records of Montgomery County, Maryland in Liber 50001 at folio 001.', beingOverrideOn: false, beingOverrideText: '',
    lenderPolicyType: T.LENDER_POLICY_TYPES[1], lenderPolicyForm: '2021 ALTA', lenderPolicyAmount: 252000, lenderRateType: 'Basic', lenderRateEffectiveDate: '2026-10-27', lenderProposedInsured: 'Example Home Loans (fake), ISAOA/ATIMA',
    ownerPolicyType: T.OWNER_POLICY_TYPES[0], ownerPolicyForm: '2021 ALTA', ownerPolicyAmount: 315000, ownerRateType: 'Basic', ownerRateEffectiveDate: '2026-10-27', ownerProposedInsured: 'Jordan Sample' }, w1));
  steps('deal-t1', ['notes_reviewed', 'docs_organized', 'pacer_buyer', 'title_order_email', 'sdat_check', 'tax_info', 'contract_review', 'chain_of_title', 'loan_check'], w1);
  d.titlePacer.push(S({ id: 'tpac-t1-1', dealId: 'deal-t1', participantId: 'dp-t1-tt-jordan', partyName: 'Jordan Sample', partyRole: 'buyer', searchType: 'party_name', exactMatch: true, searchedAt: w1, searchedBy: 'u-proc', result: 'no_results', notes: '', documentId: p1 }, w1));
  d.titleDiscrepancies.push(S({ id: 'tdis-t1-1', dealId: 'deal-t1', discrepancyType: 'owner_seller_mismatch', description: 'Vesting deed owner "Pat Example and Lee Example" does not match the seller(s) in the portal (Pat Example).', status: 'open', resolvedBy: null, resolvedAt: null, resolutionNote: '' }, w1));
  const ch = (id, pos, e) => { const row = S({ id, dealId: 'deal-t1', position: pos, pertainsToProperty: true, overrideOn: false, overrideText: '', instrumentNumber: '', certOfTitleNumber: '', documentNumber: '', ...e }, w1); row.generatedText = T.chainClause(row, ctxMD); d.titleChain.push(row); };
  ch('tch-t1-1', 1, { instrumentType: 'Deed', documentName: 'Deed', grantor: 'Sample Court Developers LLC (fake)', grantee: 'Morgan Former (fake)', documentDate: '2009-05-01', recordedDate: '2009-05-20', book: '37001', page: '210' });
  ch('tch-t1-2', 2, { instrumentType: 'Deed', documentName: 'Deed', grantor: 'Morgan Former (fake)', grantee: 'Pat Example and Lee Example', documentDate: '2016-08-12', recordedDate: '2016-09-01', book: '52801', page: '377' });
  const item = (id, kind, pos, key, f, parentId = null) => { const row = S({ id, dealId: 'deal-t1', kind, parentId, position: pos, templateKey: key, status: 'open', overrideOn: false, overrideText: '', bodyText: '', payoffId: null, dotNeedsPayoff: key === 'dot_release' ? true : null }, w1);
    T.ITEM_FIELD_KEYS.forEach((k) => { row[k] = null; }); Object.assign(row, f); row.generatedText = T.itemGeneratedText(row, ctxMD); d.titleItems.push(row); };
  item('titem-t1-1', 'requirement', 1, 'payment_release', {});
  item('titem-t1-2', 'requirement', 1, 'dot_release', { dotLender: 'Sample Savings Bank (fake)', dotTrustee: 'Trustee Sample (fake)', dotGrantor: 'Pat Example and Lee Example', dotDate: '2016-08-12', dotRecordedDate: '2016-09-01', dotAmount: 240000, dotBook: '55501', dotPage: '115' }, 'titem-t1-1');
  item('titem-t1-3', 'requirement', 2, 'tax', { taxIdNumber: '04-00000001', taxYear: '2026', taxBaseAnnual: 1851.46, taxFirstHalfStatus: 'paid', taxFirstHalfAmount: 925.73, taxSecondHalfStatus: 'unpaid', taxSecondHalfAmount: 925.73, taxDueDates: '12/31/2026' });
  item('titem-t1-4', 'requirement', 3, 'deed', { deedGrantor: 'Pat Example and Lee Example', deedGrantee: 'Jordan Sample' });
  item('titem-t1-5', 'requirement', 4, 'new_dot', { newDotGrantor: 'Jordan Sample', newDotLender: 'Example Home Loans (fake)', newDotAmount: 252000 });
  item('titem-t1-6', 'requirement', 5, 'spousal_joinder', {});
  item('titem-t1-7', 'exception', 1, 'condo_endorsement', {}); item('titem-t1-8', 'exception', 2, 'taxes', {}); item('titem-t1-9', 'exception', 3, 'alta_4_1', {}); item('titem-t1-10', 'exception', 4, 'alta_8_1', {});
  d.orderNotes.push(S({ id: 'onote-t1-1', dealId: 'deal-t1', category: 'TITLE', body: 'Seller says Lee Example signed a separation agreement (fake). Confirm who must sign the deed.', issueResolved: false, resolvedBy: null, resolvedAt: null, titleSummaryId: null }, AT('10-29')));


  // ===== Nov 5 demo: search, curative, entity, lien cert, CTC. FAKE ONLY =====
  link('deal-t1', 'c-lena', 'Listing Agent');
  d.titleSearches.push(S({ id: 'tsrch-t1', dealId: 'deal-t1', orderedDate: '2026-10-22', dueDate: '2026-10-27', receivedDate: '2026-10-28', abstractor: 'Example Abstract Services (fake)', assignedTypistId: 'u-proc', notes: 'Abstract in 200 Title; commitment typing assigned.' }, w1));
  d.titleSearches.push(S({ id: 'tsrch-t3', dealId: 'deal-t3', orderedDate: '2026-11-03', dueDate: '2026-11-05', receivedDate: null, abstractor: 'Example Abstract Services (fake)', assignedTypistId: null, notes: '' }, w1));
  const lien = (row) => d.titleLiens.push(S(row, w1));
  lien({ id: 'tlien-t1-dot', dealId: 'deal-t1', itemType: 'deed_of_trust', caseNumber: '', mortgagor: 'Pat Example and Lee Example', beneficiary: 'Sample Savings Bank (fake)', trustee: 'Trustee Sample (fake)', instrumentDate: '2016-08-12', recordedDate: '2016-09-01', amount: 240000, book: '55501', page: '115', instrumentNumber: '', jurisdictionState: 'MD', status: 'payoff_requested', verificationMethod: 'attorney_call', attorneyName: 'Example Law Office (fake)', documentId: null, notes: 'Fake payoff request queued internally.' });
  lien({ id: 'tlien-t1-tax', dealId: 'deal-t1', itemType: 'state_tax_lien', caseNumber: 'FAKE-TAX-001', mortgagor: 'Pat Example', beneficiary: 'Example State Revenue Office (fake)', entryDate: '2024-02-01', recordedDate: '2024-02-08', amount: 1850, jurisdictionState: 'MD', status: 'verifying', verificationMethod: 'identity_match', identityVerified: false, identityVerifiedBy: '', identityVerifiedDate: null, documentId: null, notes: 'No call; identity match only.' });
  lien({ id: 'tlien-t1-expired', dealId: 'deal-t1', itemType: 'court_judgment', caseNumber: 'FAKE-CV-2001', mortgagor: 'Pat Example', beneficiary: 'Old Example Creditor (fake)', entryDate: '2001-01-15', renewalDate: null, amount: 3000, jurisdictionState: 'MD', status: 'expired', verificationMethod: 'expiry_rule', identityVerified: null, documentId: null, notes: 'MD 12-year rule; no payoff.' });
  d.titleEntities.push(S({ id: 'tent-t1-seller', dealId: 'deal-t1', side: 'seller', entityName: 'Example Sellers LLC (fake)', entityType: 'LLC', articlesReceived: true, operatingAgreementReceived: true, resolutionsReceived: false, goodStandingReceived: true, goodStandingYear: '2026', einReceived: true, goodStandingVerified: true, goodStandingStateSite: 'Fake State Entity Search (demo record)', signerAuthorized: false, memberStructure: 'multi', managementStructure: 'Member managed', requiredSignaturesCaptured: false, criticalIssue: true, issueNotes: 'Fake signer mismatch; assigned attorney must review.', assignedAttorneyId: 'u-admin', attorneyApproved: false, attorneyApprovalNotes: '', folderDocumentId: null }, w1));
  d.titleLienCerts.push(S({ id: 'tlc-t1', dealId: 'deal-t1', receivedAt: '2026-11-05T13:00:00Z', reviewDueAt: '2026-11-06T13:00:00Z', addressMatch: true, parcelMatch: true, allAmountsPaid: false, outstandingAmount: 45.25, zeroViolations: true, violationCount: '0', signedDated: true, outcome: 'curative_needed', notes: 'Fake water balance remains.', documentId: null }, w1));
  T.CTC_ITEMS.slice(0, 5).forEach(([checkKey], i) => d.titleCtcChecks.push(S({ id: `tctc-t1-${i}`, dealId: 'deal-t1', checkKey, status: i === 2 ? 'issue' : 'pass', note: i === 2 ? 'Update effective date before settlement.' : '' }, w1)));

  // ===== deal-t2: VA single-family, finished =====
  const w2 = AT('11-02', 16);
  doc('deal-t2', 'title_order_email', 'Title order email - VA-26-90102.pdf', AT('10-01')); doc('deal-t2', 'search_package', 'Search package - 12 Example Lane.pdf', AT('10-08'));
  doc('deal-t2', 'tax_cert', 'Tax certificate - 000000102.pdf', AT('10-08')); doc('deal-t2', 'eo', 'E&O certificate (fake).pdf', AT('10-08'));
  const pr = doc('deal-t2', 'pacer_receipt', 'Riley Placeholder - Pacer Search - No Result.pdf', AT('10-09'), { generated: true }); const ps = doc('deal-t2', 'pacer_receipt', 'Casey Testcase - Pacer Search - No Result.pdf', AT('10-09'), { generated: true });
  const tc = doc('deal-t2', 'title_commitment', 'Title Commitment.pdf', AT('10-20'), { generated: true }); const cpl = doc('deal-t2', 'cpl', 'Closing Protection Letter (CPL-FAKE-700102).pdf', AT('10-20'), { generated: true });
  doc('deal-t2', 'prelim_cd', 'Prelim CD.pdf', AT('10-30'), { generated: true }); const pkg = doc('deal-t2', 'title_package', 'Title Package.pdf', w2, { generated: true });
  const legal2 = 'Lot 12, Block B, Section One, "Example Lane Subdivision" (fake), as per plat recorded among the Land Records of the City of Alexandria, Virginia as Instrument Number 000000001.';
  const vest2 = S({ id: 'tch-t2-1', dealId: 'deal-t2', position: 1, instrumentType: 'Deed', documentName: 'Deed', grantor: 'Jamie Prior (fake)', grantee: 'Casey Testcase', documentDate: '2019-03-04', recordedDate: '2019-03-11', book: '', page: '', instrumentNumber: '190000123', certOfTitleNumber: '', documentNumber: '', pertainsToProperty: true, overrideOn: false, overrideText: '' }, AT('10-10'));
  vest2.generatedText = T.chainClause(vest2, ctxVA); d.titleChain.push(vest2);
  const deal2 = deals[1]; const info2 = T.infoBlock({ being: T.beingClause(vest2, ctxVA), deal: deal2, taxId: '000000102' });
  d.titleReviews.push(S({ id: 'trev-t2', dealId: 'deal-t2', reviewerId: 'u-proc', reviewDate: '2026-10-20', commitmentStatus: 'final', statusManual: false, finalizedAt: AT('10-20'), finalizedBy: 'u-proc', commitmentDocumentId: tc, titlePackageDocumentId: pkg,
    packageSentAt: w2, packageSentBy: 'u-proc', packageOutboxId: null, propertyType: 'Fee Simple', sdatTaxId: '000000102', sdatOwnerName: 'CASEY TESTCASE', sdatMatches: true, taxYear: '2026', taxBaseAnnual: 6120, taxFirstHalfStatus: 'paid', taxFirstHalfAmount: 3060, taxSecondHalfStatus: 'unpaid', taxSecondHalfAmount: 3060, taxDueDates: '11/15/2026',
    vestingOwnerName: 'Casey Testcase', contractBuyerMatch: true, contractSellerMatch: true, contractAddressMatch: true, contractLegalMatch: true, contractTaxIdMatch: true, assocType: 'none', waterType: 'public', sewerType: 'public', frontFootBenefit: 'no', groundRent: 'no', transferTaxSplit: 'Per VA custom: seller pays grantor tax',
    trLoanAmount: 512000, trLenderName: 'Example Home Loans (fake)', trLoanIdNumber: 'FAKE-LN-0102', underwriter: T.UNDERWRITERS[2], commitmentNumber: 'FAKE-VA-90102', commitmentForm: '2021 ALTA', effectiveDate: '2026-10-07', effectiveTime: '8:00 AM', proposedInsured: 'Riley Placeholder',
    vestingText: 'Casey Testcase', legalDescription: T.insertBeingClause(legal2, info2), beingOverrideOn: false, beingOverrideText: '',
    lenderPolicyType: T.LENDER_POLICY_TYPES[1], lenderPolicyForm: '2021 ALTA', lenderPolicyAmount: 512000, lenderRateType: 'Basic', lenderProposedInsured: 'Example Home Loans (fake), ISAOA/ATIMA',
    ownerPolicyType: T.OWNER_POLICY_TYPES[0], ownerPolicyForm: '2021 ALTA', ownerPolicyAmount: 640000, ownerRateType: 'Basic', ownerProposedInsured: 'Riley Placeholder' }, w2));
  steps('deal-t2', T.STEP_KEYS.filter((k) => k !== 'md_ack' && k !== 'buyer_copy'), w2);
  d.titleSteps.push(S({ id: 'tstep-t2-md_ack', dealId: 'deal-t2', stepKey: 'md_ack', status: 'na', doneAt: w2, doneBy: 'u-proc', note: 'Virginia file: the MD acknowledgement does not apply.' }, w2));
  d.titlePacer.push(S({ id: 'tpac-t2-1', dealId: 'deal-t2', participantId: 'dp-t2-tt-riley', partyName: 'Riley Placeholder', partyRole: 'buyer', searchType: 'party_name', exactMatch: true, searchedAt: AT('10-09'), searchedBy: 'u-proc', result: 'no_results', notes: '', documentId: pr }, AT('10-09')),
    S({ id: 'tpac-t2-2', dealId: 'deal-t2', participantId: 'dp-t2-tt-casey', partyName: 'Casey Testcase', partyRole: 'seller', searchType: 'party_name', exactMatch: true, searchedAt: AT('10-09'), searchedBy: 'u-proc', result: 'no_results', notes: '', documentId: ps }, AT('10-09')));
  const item2 = (id, kind, pos, key, f, status = 'satisfied') => { const row = S({ id, dealId: 'deal-t2', kind, parentId: null, position: pos, templateKey: key, status, overrideOn: false, overrideText: '', bodyText: '', payoffId: null, dotNeedsPayoff: null }, AT('10-15'));
    T.ITEM_FIELD_KEYS.forEach((k) => { row[k] = null; }); Object.assign(row, f); row.generatedText = T.itemGeneratedText(row, ctxVA); d.titleItems.push(row); };
  item2('titem-t2-1', 'requirement', 1, 'deed', { deedGrantor: 'Casey Testcase', deedGrantee: 'Riley Placeholder' }); item2('titem-t2-2', 'requirement', 2, 'new_dot', { newDotGrantor: 'Riley Placeholder', newDotLender: 'Example Home Loans (fake)', newDotAmount: 512000 });
  item2('titem-t2-3', 'requirement', 3, 'tax', { taxIdNumber: '000000102', taxYear: '2026', taxBaseAnnual: 6120, taxFirstHalfStatus: 'paid', taxFirstHalfAmount: 3060, taxSecondHalfStatus: 'unpaid', taxSecondHalfAmount: 3060, taxDueDates: '11/15/2026' });
  item2('titem-t2-4', 'exception', 1, 'taxes', {}, 'open'); item2('titem-t2-5', 'exception', 2, 'setback', {}, 'open');
  d.titleCpls.push(S({ id: 'tcpl-t2-1', dealId: 'deal-t2', cplNumber: 'CPL-FAKE-700102', protectedParty: 'Example Home Loans (fake)', lenderNameAtIssue: 'Example Home Loans (fake)', lenderMatch: true, cplType: 'Standard', lenderClause: 'ISAOA/ATIMA', cost: 50, cplFor: 'buyer', issuedAt: AT('10-20'), issuedBy: 'u-proc', documentId: cpl }, AT('10-20')));
  T.PACKAGE_KINDS.forEach((k, i) => { const z = d.documents.find((q) => q.dealId === 'deal-t2' && q.titleDocKind === k); d.titlePackageComponents.push(S({ id: `tpc-t2-${i + 1}`, dealId: 'deal-t2', packageDocumentId: pkg, packageKind: 'title_package', componentKind: k, componentDocumentId: z ? z.id : null, position: i + 1, missing: !z }, w2)); });
  // ===== deal-t3: DC, not started (nothing but the order itself) =====
}
