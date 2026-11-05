/* Funding, seller-proceeds wire tracking, and final policy issuance (Francis Santos, Nov 5).
 * FAKE DATA ONLY. Pure rules shared by the adapter, UI and tests. No bank wire is created and no email is sent.
 * Bank identifiers are last-four-only BY DESIGN; there is no full-number field or reveal path. */
export const FWP_STAFF_ONLY = 'This module is for Processors, the Funding Team and CLA Admins only.';
export const FWP_READ_ONLY = 'Only a Processor, Funding Team member or Admin can change this module.';
export const FUNDING_TASK = 'Complete funding and post-closing';
export const WIRE_TASK = 'Wire Setup';
export const POLICY_TASK = 'Issue Final Policy';
export const fwpCanRead = (u) => !!u && !u.accountRole && (!!u.isAdmin || ['Processor', 'Funding Team'].includes(u.role));
export const fwpCanEdit = fwpCanRead;
export const DISBURSEMENT_METHODS = [['wire', 'Wire'], ['check', 'Check'], ['overnight', 'Overnight check'], ['echeck', 'E-check'], ['other', 'Other']];
export const FUND_KINDS = [['emd', 'EMD'], ['buyer', 'Buyer funds'], ['lender', 'Lender funds']];
export const FUNDING_CHECK_KEYS = ['sellerDocs', 'buyerDocs', 'combinedAlta', 'voidedCheckName', 'altaMatchesLedger'];
export const FUNDING_CHECK_LABELS = { sellerDocs: 'Seller final documents on file', buyerDocs: 'Buyer final documents on file', combinedAlta: 'Combined ALTA on file', voidedCheckName: 'Voided check name matches seller', altaMatchesLedger: 'ALTA totals match accounting ledger' };
export const DISBURSEMENT_TYPES = ['payoff', 'laCommission', 'saCommission', 'mortgageBroker', 'sellerProceeds', 'borrowerProceeds', 'other'];
export const DISBURSEMENT_LABELS = { payoff: 'Payoff', laCommission: 'L/A commission', saCommission: 'S/A commission', mortgageBroker: 'Mortgage broker', sellerProceeds: 'Seller proceeds', borrowerProceeds: 'Borrower proceeds', other: 'Other' };
export const ESCROW_DEFAULTS = [
  { id: 'escrow-md', state: 'MD', accountName: 'CLA Maryland Escrow (FAKE)', accountLast4: '1001' },
  { id: 'escrow-va', state: 'VA', accountName: 'CLA Virginia Escrow (FAKE)', accountLast4: '2002' },
  { id: 'escrow-dc', state: 'DC', accountName: 'CLA District Escrow (FAKE)', accountLast4: '3003' },
  { id: 'escrow-fl', state: 'FL', accountName: 'CLA Florida Escrow (FAKE)', accountLast4: '4004' },
];
export const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function last4(value, label = 'Bank number') {
  const s = String(value == null ? '' : value).replace(/\D/g, '');
  if (!/^\d{4}$/.test(s) || String(value).replace(/[\s-]/g, '').length !== 4) throw new Error(`${label}: enter only its last four digits. Full bank numbers are never stored.`);
  return s;
}
export const masked = (last) => `•••• ${String(last || '')}`;
export const beneficiaryMessage = (deal, phone = '301-555-0100') => `Seller proceeds ${[deal.street, deal.city, [deal.state, deal.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')} BY CLA ${phone} ${deal.fileNumber}`;
export function fundingReadiness(record, funds, checks) {
  const missing = [];
  for (const [key, label] of FUND_KINDS) { const f = (funds || []).find((x) => x.kind === key); if (!f || f.status !== 'received' || f.pending) missing.push(`${label} received and processed`); }
  for (const key of FUNDING_CHECK_KEYS) if (!(checks || []).find((x) => x.checkKey === key && x.passed)) missing.push(FUNDING_CHECK_LABELS[key]);
  if (!record || record.balancedWithLender !== true) missing.push('File balanced / confirmed with lender');
  return { ready: missing.length === 0, missing };
}
export function wireReadiness(w) {
  const missing = [];
  if (!w || w.disbursementMethod !== 'wire') return { ready: false, missing: ['Wire selected as the disbursement method'] };
  for (const [k, l] of [['allSellersSigned', 'Agreement signed by ALL sellers'], ['notarized', 'Agreement notarized'], ['payeeNameMatches', 'Payee name matches seller/entity'], ['payeeAddressMatches', 'Address matches seller contact']]) if (w[k] !== true) missing.push(l);
  if (!w.fromAccountId) missing.push('State escrow account'); if (!(Number(w.amount) > 0)) missing.push('Seller proceeds amount'); if (!w.recipientName || !w.bankName) missing.push('Recipient and bank name');
  if (!/^\d{4}$/.test(w.accountLast4 || '') || !/^\d{4}$/.test(w.abaLast4 || '')) missing.push('Masked account and ABA last four');
  if (!w.beneficiaryMessage) missing.push('Beneficiary message');
  return { ready: !missing.length, missing };
}
export const WIRE_AUDIT = [['amount', 'Amount'], ['accountName', 'Account name'], ['accountNumber', 'Account # (masked)'], ['aba', 'ABA (masked)'], ['purpose', 'Purpose / beneficiary message']];
export const POLICY_TYPES = ["2021 ALTA Homeowner's Policy", "2021 ALTA Owner's Policy", '2021 ALTA Short Form Residential Loan Policy', '2021 ALTA Loan Policy', '2021 ALTA Expanded Coverage Residential Loan Policy', 'Other'];
export const POLICY_FORMS = [['short', 'Short form'], ['long', 'Long form'], ['none', 'No lender title request']];
export const ESTATE_TYPES = ['Fee Simple', 'Leasehold'];
export const ENDORSEMENTS = ['ALTA 6', 'ALTA 8', 'ALTA 8.1', 'ALTA 9', 'PUD', 'Condo'];
export const RIDER_ENDORSEMENTS = { 'Adjustable Rate Rider': 'ALTA 6', 'PUD Rider': 'PUD', 'Condominium Rider': 'Condo' };
export const STANDARD_LENDER_REMOVALS = ['parties_possession', 'encroachment', 'easements', 'liens', 'taxes_special_assessments'];
export const STANDARD_EXCEPTION_LABELS = { parties_possession: 'Rights or claims of parties in possession', encroachment: 'Encroachment', easements: 'Easements', liens: 'Liens', taxes_special_assessments: 'Taxes / special assessments' };
export const POLICY_PRECHECKS = [['balancedFunded', 'Balanced & funded'], ['deed', 'Final signed deed'], ['dot', 'Final signed DOT'], ['closingInstructions', 'Closing instructions or final executed loan package'], ['notesReviewed', 'Notes reviewed']];
export const DOT_CHECKS = [['borrowerMatches', 'Borrower'], ['lenderMatches', 'Lender'], ['trusteeMatches', 'Trustee'], ['amountMatches', 'Loan amount'], ['ridersAttached', 'All checked riders attached']];
export const SIGNATURE_CHECKS = [['ownerSigned', 'Owner policy agent signature'], ['ownerAddress', 'Owner Schedule A property address'], ['ownerInsured', 'Owner Schedule A insured'], ['ownerEstate', 'Owner Schedule A estate / interest'], ['lenderSigned', 'Lender policy signature'], ['lenderAddress', 'Lender address matches DOT / closing instructions'], ['lenderDate', 'Lender date of policy'], ['lenderInsuredBorrower', 'Lender insured and borrower'], ['lenderEndorsements', 'Lender endorsement checkboxes']];
export function insuredVesting(value, isTrust = false) {
  let s = String(value || '').trim(); if (!isTrust) return s;
  return s.replace(/,?\s*(?:a married (?:man|woman|couple)|husband and wife|as tenants by the entirety|tenants by the entirety|married|single|unmarried|widowed)(?:\s+as trustees?)?/gi, '').replace(/\s+,/g, ',').replace(/,\s*$/, '').trim();
}
export function dotException(p) {
  const rec = p.recordingDate || p.instrumentNumber || p.bookPage ? `, recorded ${[p.recordingDate, p.instrumentNumber, p.bookPage].filter(Boolean).join(', ')}` : '';
  return `Deed of Trust from ${p.grantor || '[Grantor]'} to ${p.trustee || '[Trustee]'}, Trustee(s) for ${p.lender || '[Lender]'}, securing ${money(p.dotAmount)}, dated ${p.dotDate || '[Date]'}${rec}`;
}
export const unfilledVariables = (text) => (String(text || '').match(/\[[^\]]+\]|\{\{[^}]+\}\}/g) || []);
export const needsUnderwriterCopy = (name) => /\bdoma\b/i.test(String(name || ''));
export function premiumMismatch(p) { return Number(p.ownerPremium) !== Number(p.altaOwnerCollected) || Number(p.lenderPremium) !== Number(p.altaLenderCollected); }
export function policyBlockers(p, escalations = [], checks = [], requireSignatures = true) {
  const out = []; if (!p) return ['Policy setup has not started'];
  for (const [k, l] of POLICY_PRECHECKS) if (p[k] !== true) out.push(l);
  if (premiumMismatch(p)) out.push('Owner/lender premiums must exactly match combined ALTA collected');
  if ((escalations || []).some((e) => e.status === 'open')) out.push('Resolve all policy escalations');
  if (p.deedVestingMatches !== true || p.deedPriceMatches !== true || p.deedEstateMatches !== true) out.push('Deed vesting, price and estate checks');
  for (const [k, l] of DOT_CHECKS) if (p[k] !== true) out.push(`DOT ${l.toLowerCase()}`);
  if (p.ratesChanged === true) out.push('Refresh rates must not change the premium');
  if (p.ownerPolicyType && !POLICY_TYPES.includes(p.ownerPolicyType)) out.push('Owner policy type');
  if (p.lenderPolicyType && !POLICY_TYPES.includes(p.lenderPolicyType)) out.push('Lender policy type');
  if (!p.ownerSignatory && p.issueOwner !== false) out.push('Owner policy signatory');
  if (!p.lenderSignatory && p.issueLender !== false) out.push('Lender policy signatory');
  if (!requireSignatures) return out;
  for (const [k, l] of SIGNATURE_CHECKS) if (!(checks || []).find((c) => c.checkKey === k && c.passed)) out.push(l);
  return out;
}
export function policyQueue(deals, records, { dateType = 'close', from = '', to = '' } = {}) {
  return deals.filter((d) => ['Purchase', 'Refinance'].includes(d.transactionType)).map((d) => ({ deal: d, record: records.find((r) => r.dealId === d.id && !r.deletedAt) || null }))
    .filter(({ deal }) => { const day = { open: deal.openDate, commitment: deal.commitmentDate, buyerPackage: deal.buyerClosingPackageDate, close: deal.closingDate }[dateType]; return !!day && (!from || day >= from) && (!to || day <= to); })
    .sort((a, b) => String(a.deal.closingDate || '').localeCompare(String(b.deal.closingDate || '')));
}
