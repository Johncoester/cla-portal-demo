/* Post-Closing Scanbacks + E-Recording (Simplifile tracking only). Francis, Nov 5 2026.
 * Pure validation/domain helpers. FAKE DATA ONLY; no SSNs, real credentials or integration. */
export const PC_STAFF_ONLY = 'Post-closing and e-recording are for CLA staff only.';
export const PC_OFF = 'Accounting is turned off on this portal.';
export const PC_ROLES = ['Processor', 'Transaction Coordinator'];
export const pcCanRead = (u) => !!(u && !u.accountRole && (u.isAdmin || PC_ROLES.includes(u.role) || ['Sales Person', 'Sales Team'].includes(u.role)));
export const pcCanEdit = (u) => !!(u && !u.accountRole && (u.isAdmin || PC_ROLES.includes(u.role)));
export const SCAN_FOLDER = '500 Post Closing - Final Signed Docs › SCANBACKS';
export const FINAL_SIGNED_FOLDER = '500 Post Closing - Final Signed Docs';
export const SCAN_DOCS = ['BUYER DOCS', 'SELLER SIGNED COMPLIANCE DOC', 'BUYER ALTA', 'SELLER ALTA SIG', 'SELLER CD', 'DEED', 'COMBINED ALTA', 'Exhibit A', 'DOCS FOR FA'];
export const SCAN_FIELDS = {
  buyerSide: 'b', sellerSide: 'b', buyerSource: 'e:email|office_original', sellerSource: 'e:email|office_original', receivedThankYou: 'b',
  fileNumberMatch: 'b', addressMatch: 'b', buyerNamesMatch: 'b', sellerNamesMatch: 'b', purchaseRefi: 'e:Purchase|Refinance',
  faNeeded: 'b', fundingDate: 'd', cashDeal: 'b', eSigned: 'b', additionalNotes: 'L', signedNotarized: 'b', settlementAgentStamped: 'b',
  faStatus: 'e:not_started|queued|follow_up|additional_docs|approved', buyerCopiesSent: 'b', sellerCopiesSent: 'b', auditResolved: 'b'
};
export const REC_FIELDS = {
  disbursementDate: 'd', processorName: 's', recordingMethod: 'e:online|manual', methodNote: 'L', assignedTo: 's', recordingInstructions: 'L',
  packageName: 's', paymentAccount: 's', deedDocumentId: 's', dotDocumentId: 's', mdIntakeAttached: 'b', mdClearMortgageBalance: 'b',
  mdSubdivision: 's', mdDocument2GranteeTrustee: 'b', mdReturnToPostClosing: 'b', whArExemption: 'b', firstTimeHomeBuyer: 'b', ownerOccupancy: 'b',
  propertyTaxRequired: 'b', countyTaxAmount: 'm', accountingTaxAmount: 'm', collectedFees: 'm', estimatedFees: 'm', platformFeePaid: 'b',
  rejectionReason: 'L', recordedDate: 'd', releaseFundsNotified: 'b'
};
export const REC_DOCS = ['DEED FOR RECORDING', 'DOT FOR RECORDING'];
export const REC_CHECKLIST = [
  ['deed_address', 'Deed', 'Property address'], ['deed_tax_id', 'Deed', 'Tax ID'], ['deed_closing_date', 'Deed', 'Closing date'],
  ['deed_grantor', 'Deed', 'Grantor = sellers'], ['deed_grantee', 'Deed', 'Grantee = buyers'], ['deed_tenancy', 'Deed', 'Tenancy'],
  ['deed_sales_price', 'Deed', 'Sales price'], ['deed_county', 'Deed', 'County'], ['deed_exhibit_a', 'Deed', 'Exhibit A matches'],
  ['deed_affidavits', 'Deed', 'Affidavits signed and notarized'], ['dot_tax_id', 'DOT', 'Tax ID'], ['dot_grantor', 'DOT', 'Grantor = borrowers'],
  ['dot_trustee', 'DOT', 'Trustee'], ['dot_lender', 'DOT', 'Lender'], ['dot_loan_amount', 'DOT', 'Loan amount'],
  ['dot_riders', 'DOT', 'Riders (PUD / VA / other)'], ['dot_signatures', 'DOT', 'Signatures'], ['dot_dates', 'DOT', 'Dates'],
  ['dot_notary', 'DOT', 'Notary seals'], ['dot_consideration', 'DOT', 'Affidavit of consideration']
];
export const REC_TASKS = ['Simplifile Recording', 'Submit for recording', 'Recording note updated and resubmitted', 'Recording completed', 'Receive recording docs'];
export const SCAN_TASKS = ['Receive Buyer Scanbacks/ID', 'Received Buyer ID', 'Receive Seller Scanbacks/ID', 'Received Seller ID', 'Funding Authorization Request Sent', 'Send final signed ALTA to Agents', 'Funding Authorization Received'];
export const money2 = (n) => Math.round(Number(n || 0) * 100) / 100;
export const moneyEqual = (a, b) => a != null && b != null && Math.abs(money2(a) - money2(b)) < .005;
export const recordingBalanced = (r) => moneyEqual(r.collectedFees, r.estimatedFees) && (!r.propertyTaxRequired || moneyEqual(r.countyTaxAmount, r.accountingTaxAmount));
export const packageName = (deal) => `${String(deal.fileNumber || '').replace(/\s+[A-Za-z'-]+$/, '')} ${deal.transactionType === 'Refinance' ? 'R' : 'P'}`;
export const recordingDocStatus = (r) => r.deedDocumentId && r.dotDocumentId ? 'WITH DOCS' : 'NO DOCS';
export const scanPriority = (r, deal) => [r.faNeeded ? 0 : 1, ['FL', 'VA', 'NC'].includes(deal.state) ? 0 : 1, deal.fileNumber || ''];
export const recordingDay = (deal, disbursements = []) => (disbursements.find((z) => z.dealId === deal.id) || {}).disbursementDate || deal.disbursementDate || deal.closingDate || null;
export const scanAudits = (r, deal, today) => {
  if (!deal.closingDate || !today || Math.floor((Date.parse(today) - Date.parse(deal.closingDate)) / 864e5) < 7) return [];
  const out = []; if (!r.buyerSide) out.push('Buyer closing package not received'); if (!r.sellerSide && deal.transactionType !== 'Refinance') out.push('Seller closing package not received');
  if (!r.buyerCopiesSent) out.push('Signed docs not sent to buyer'); if (!r.sellerCopiesSent && deal.transactionType !== 'Refinance') out.push('Signed docs not sent to seller'); return out;
};
export function cleanTyped(input, spec, label) {
  const out = {}; const v = input || {}; for (const [k, x] of Object.entries(v)) {
    const t = spec[k]; if (!t) throw new Error(`${label}: unknown field "${k}".`); const s = String(x == null ? '' : x).trim();
    if (/(^|[^0-9])\d{3}[- ]?\d{2}[- ]?\d{4}([^0-9]|$)/.test(s)) throw new Error(`${label}: never enter an SSN.`);
    if (t === 'b') out[k] = x === '' || x == null ? null : x === true || x === 'true' || x === 'on';
    else if (t === 'd') { if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${label}: ${k} must be YYYY-MM-DD.`); out[k] = s || null; }
    else if (t === 'm') { if (!s) out[k] = null; else { const n = Number(s.replace(/[$,\s]/g, '')); if (!isFinite(n) || n < 0 || n > 1e9) throw new Error(`${label}: ${k} must be a positive amount.`); out[k] = money2(n); } }
    else if (t.startsWith('e:')) { if (s && !t.slice(2).split('|').includes(s)) throw new Error(`${label}: pick ${k} from the list.`); out[k] = s || null; }
    else out[k] = s.slice(0, t === 'L' ? 4000 : 500);
  } return out;
}
