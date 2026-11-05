/* title.js : TITLE MODULE (title review) rules, templates and the auto-generated text (John, Nov 4 2026; Maria Irene Go's 21-minute Qualia
 * "Title Review" walkthrough). Pure functions only: the mock adapter (mock-part-title.js), the page (pages/dealtitle.js), the tests and the SQL
 * (migration 61) all follow what is written here. FAKE DATA ONLY. Rules that matter:
 *   - CLA staff only (Processor / Transaction Coordinator / Admin / Super admin edit; Sales Person / Sales Team read). Agents and clients never.
 *   - NO SSN IS EVER STORED: the bankruptcy (PACER) search records only the party, the search type, the result and the receipt document.
 *   - Every field is typed (no JSON blobs for anything reported on); rows are soft-deleted (deleted_at), never removed.
 *   - The portal sends nothing: "Send Title Package" only queues an outbox entry + records who / when. */
import { US_STATE_NAMES } from './constants.js?v=202611051010';

export const TITLE_OFF = 'The Title module is turned off on this portal.';
export const TITLE_STAFF_ONLY = 'The Title module is for CLA staff only.';
export const TITLE_READ_ONLY = 'Read only for your role: a Processor, Transaction Coordinator, Admin or Super admin changes the title review.';
export const TITLE_EDIT_ROLES = ['Processor', 'Transaction Coordinator'];
export const TITLE_READ_ROLES = ['Sales Person', 'Sales Team'];
// outside users (agents / clients) never: they have accountRole set when scoped to a file, and their account role is 'Outside user'
export const titleCanRead = (u) => !!u && !u.accountRole && u.role !== 'Outside user' && u.role !== 'Employee' && (!!u.isAdmin || TITLE_EDIT_ROLES.includes(u.role) || TITLE_READ_ROLES.includes(u.role));
export const titleCanEdit = (u) => titleCanRead(u) && (!!u.isAdmin || TITLE_EDIT_ROLES.includes(u.role));

// ---------- order status (deals.title_review_status) ----------
export const REVIEW_STATUSES = [['not_started', 'Not started'], ['in_progress', 'In progress'], ['pending_requirements', 'Pending requirements'], ['clear_to_close', 'Clear to close']];
export const reviewStatusLabel = (k) => (REVIEW_STATUSES.find(([v]) => v === k) || REVIEW_STATUSES[0])[1];

// ---------- the step checklist (header progress) ----------
// auto: set by the module when the matching action happens (the reviewer can still tick / untick / N/A it)
export const STEPS = [
  ['notes_reviewed', 'Reviewed order notes', 'notes'],
  ['docs_organized', 'Documents organized into the title folders', 'notes'],
  ['md_ack', 'Acknowledgement of Receipt of Commitment – MD on file (MD only)', 'notes'],
  ['eo_doc', 'E&O on file', 'notes'],
  ['pacer_buyer', 'Search for Buyer – Completed', 'pacer'],
  ['pacer_seller', 'Search for Seller – Completed', 'pacer'],
  ['title_order_email', 'Title order email reviewed (100 Processing)', 'search'],
  ['sdat_check', 'SDAT check (tax ID, owner, premises, legal)', 'search'],
  ['tax_info', 'Tax info entered', 'search'],
  ['vesting_deed', 'Current vesting deed matches the seller', 'search'],
  ['contract_review', 'Contract review', 'contract'],
  ['chain_of_title', 'Chain of title checked', 'chain'],
  ['loan_check', 'Loan check (title request vs. the loan)', 'loan'],
  ['schedule_a', 'Commitment Schedule A (legal description + being clause)', 'schedulea'],
  ['requirements', 'Requirements (Schedule B-I)', 'requirements'],
  ['exceptions', 'Exceptions (Schedule B-II)', 'exceptions'],
  ['policy_info', 'Verified buyer and lender info (Policy Info & Rates)', 'policies'],
  ['finalized', 'Commitment finalized', 'finalize'],
  ['cpl_buyer', 'CPL issued for Buyer', 'cpl'],
  ['cpl_seller', 'CPL issued for Seller', 'cpl'],
  ['prelim_cd', 'Prelim CD filed in 200 Title', 'finalize'],
  ['buyer_copy', "Buyer's Initial Commitment copy sent for e-sign", 'finalize'],
  ['title_package', 'Title Package built', 'finalize'],
  ['summary_note', 'Title review summary note posted', 'summary'],
  ['send_package', 'Send Title Package', 'finalize'],
  ['tasks_updated', 'Tasks updated (Title - CLEAR TO CLOSE)', 'summary'],
];
export const STEP_KEYS = STEPS.map(([k]) => k);
export const STEP_STATUSES = ['open', 'done', 'na'];
export const stepLabel = (k) => (STEPS.find(([s]) => s === k) || [k, k])[1];
// progress: N/A counts as handled (e.g. the MD acknowledgement on a VA file)
export function progressOf(rows) { const by = new Map((rows || []).map((r) => [r.stepKey, r.status]));
  const done = STEP_KEYS.filter((k) => ['done', 'na'].includes(by.get(k))).length; return { done, total: STEP_KEYS.length, text: `${done}/${STEP_KEYS.length}` }; }

// ---------- sections of the Title page (?v=) ----------
export const SECTIONS = [['overview', 'Checklist'], ['notes', 'Notes & Documents'], ['pacer', 'Bankruptcy (PACER)'], ['search', 'Search package'], ['contract', 'Contract review'],
  ['chain', 'Chain of title'], ['loan', 'Loan check'], ['schedulea', 'Schedule A'], ['requirements', 'Requirements'], ['exceptions', 'Exceptions'], ['policies', 'Policy Info & Rates'],
  ['cpl', 'CPL'], ['finalize', 'Finalize & Package'], ['summary', 'Summary note']];

// ---------- documents: Qualia's folders (all staff only) ----------
export const TITLE_FOLDERS = ['100 Processing', '200 Title', '200 Title › SEARCH', '200 Title › BK Search', '300 Payoffs and Invoices', '400 Lender Closing Instructions', '450 Prior Closing Documents',
  '500 Post Closing - Final Signed Docs', '500a Post Closing - Funding/Disbursement Docs', '700 Recorded Documents and Policies'];
// the one folder a buyer can open: the Buyer's Initial Commitment copy is signed by the buyer, so it cannot sit in a staff-only folder
export const BUYER_COPY_FOLDER = '200 Title › Buyer copy (shared with the buyer for e-sign)';
// title document kinds (documents.title_doc_kind) -> label + the folder they are filed in
export const DOC_KINDS = [
  ['title_order_email', 'Title order email', '100 Processing'],
  ['search_package', 'Search package', '200 Title'],   // moved from SEARCH into 200 Title (video)
  ['tax_cert', 'Tax certificate', '200 Title'],
  ['md_ack', 'Acknowledgement of Receipt of Commitment – MD', '200 Title'],
  ['eo', 'E&O (errors & omissions) certificate', '200 Title'],
  ['title_commitment_request', 'Title commitment request (from the lender)', '400 Lender Closing Instructions'],
  ['pacer_receipt', 'PACER search receipt', '200 Title › BK Search'],
  ['title_commitment', 'Title Commitment', '200 Title'],
  ['cpl', 'Closing Protection Letter', '200 Title'],
  ['prelim_cd', 'Prelim CD', '200 Title'],
  ['buyer_commitment_copy', 'Buyers Initial Commitment copy', BUYER_COPY_FOLDER],
  ['title_package', 'Title Package', '200 Title'],
  ['prior_policy', 'Prior title policy', '450 Prior Closing Documents'],
  ['other', 'Other title document', '200 Title'],
];
export const docKindLabel = (k) => (DOC_KINDS.find(([v]) => v === k) || [k, k])[1];
export const docKindFolder = (k) => (DOC_KINDS.find(([v]) => v === k) || [k, k, '200 Title'])[2];
// RULE (video): the "Acknowledgement of Receipt of Commitment – MD" is required for Maryland files only (property state = MD)
export const mdAckRequired = (deal) => String((deal && deal.state) || '').toUpperCase() === 'MD';
export const MD_ACK_MISSING = 'Maryland file: the "Acknowledgement of Receipt of Commitment – MD" is missing. Add it to 200 Title.';
export function mdAckWarning(deal, docs) { if (!mdAckRequired(deal)) return ''; return (docs || []).some((z) => z.titleDocKind === 'md_ack' && !z.deletedAt) ? '' : MD_ACK_MISSING; }
// Title Package = CPL + Title Commitment + Tax Certificate + E&O + Prelim CD (in this order)
export const PACKAGE_KINDS = ['cpl', 'title_commitment', 'tax_cert', 'eo', 'prelim_cd'];
// Buyer's Initial Commitment copy = MD acknowledgement (MD files only) + Title Commitment
export const buyerCopyKinds = (deal) => (mdAckRequired(deal) ? ['md_ack', 'title_commitment'] : ['title_commitment']);

// ---------- NO SSN, EVER ----------
const SSN_RE = /(^|[^\d])\d{3}[- .]?\d{2}[- .]?\d{4}([^\d]|$)/;
export const looksLikeSsn = (v) => SSN_RE.test(String(v == null ? '' : v));
const SSN_KEYS = /ssn|social|taxpayer|^tin$|itin/i;
// typed number / date / money fields (liber, folio, instrument #, tax ID, loan ID ...) may hold 9 digits; free text may not
const SSN_EXEMPT = /(at|date|number|book|page|amount|phone|id|time|year|hyperlink|position|cost)$/i;
export const NO_SSN = 'SSNs are never stored in the portal. Type the SSN into PACER only.';
export function noSsn(input) {
  for (const [k, v] of Object.entries(input || {})) { if (SSN_KEYS.test(k)) throw new Error(NO_SSN); if (typeof v === 'string' && looksLikeSsn(v) && !SSN_EXEMPT.test(k)) throw new Error(NO_SSN); }
  return input; }

// ---------- PACER ----------
export const PACER_SEARCH_TYPES = [['ssn', 'SSN search (typed into PACER only, never here)'], ['party_name', 'Party (name) search, exact match']];
export const PACER_RESULTS = [['no_results', 'No results found'], ['results_found', 'Results found']];
export const pacerDocName = (name, result) => `${String(name || 'Party').trim()} - Pacer Search - ${result === 'results_found' ? 'Results Found' : 'No Result'}.pdf`;
// Qualia: the buyer is searched by SSN, the seller by party name (exact match)
export const defaultSearchType = (role) => (role === 'buyer' ? 'ssn' : 'party_name');

// ---------- discrepancies ----------
export const DISCREPANCY_TYPES = [['owner_seller_mismatch', 'Owner/seller mismatch'], ['buyer_name_mismatch', 'Buyer name mismatch'], ['seller_name_mismatch', 'Seller name mismatch'],
  ['address_mismatch', 'Property address mismatch'], ['legal_description_mismatch', 'Legal description mismatch'], ['tax_id_mismatch', 'Tax account # mismatch'], ['cpl_lender_mismatch', 'CPL protected party / lender mismatch'],
  ['chain_gap', 'Chain of title gap'], ['loan_mismatch', 'Loan / title request mismatch'], ['other', 'Other']];
export const discrepancyLabel = (k) => (DISCREPANCY_TYPES.find(([v]) => v === k) || [k, k])[1];

// ---------- names ----------
export const normName = (s) => String(s || '').toLowerCase().replace(/\(fake\)/g, '').replace(/[.,'’]/g, ' ').replace(/\b(and|&)\b/g, ' ').replace(/\s+/g, ' ').trim();
// every name in `a` appears in `b` (order and "and" / "," do not matter), e.g. vesting "Pat Example and Lee Example" vs sellers ["Pat Example", "Lee Example"]
export function namesMatch(a, names) { const want = (Array.isArray(names) ? names : [names]).map(normName).filter(Boolean); const got = normName(a); if (!want.length || !got) return false;
  return want.every((n) => got.includes(n)) && got.split(' ').every((w) => want.join(' ').split(' ').includes(w)); }
export const OWNER_MISMATCH = 'Owner/seller mismatch, flagged for review';
export const joinNames = (list) => { const l = (list || []).filter(Boolean); return l.length <= 1 ? (l[0] || '') : l.length === 2 ? `${l[0]} and ${l[1]}` : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`; };

// ---------- dates / money ----------
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s + 'T12:00:00Z'));
export const mdy = (s) => (isYmd(s) ? `${s.slice(5, 7)}/${s.slice(8, 10)}/${s.slice(0, 4)}` : '');
export const longDate = (s) => (isYmd(s) ? `${MONTHS[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8, 10))}, ${s.slice(0, 4)}` : '');
export const usd2 = (n) => (n == null || n === '' || !isFinite(Number(n)) ? '' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const plain2 = (n) => (n == null || n === '' || !isFinite(Number(n)) ? '' : String(Math.round(Number(n) * 100) / 100));
const ph = (v, label) => (v == null || String(v).trim() === '' ? `[${label}]` : String(v).trim());
export const stateName = (code) => { const c = String(code || '').toUpperCase(); return (US_STATE_NAMES.find(([k]) => k === c) || [c, c])[1]; };
// "Montgomery County, Maryland"; independent cities / DC are not "X County"
export function landRecordsOf(county, state) { const st = String(state || '').toUpperCase(); const c = String(county || '').trim();
  if (st === 'DC') return 'the District of Columbia';
  if (!c) return `[County] County, ${stateName(st) || '[State]'}`;
  return `${/^city of /i.test(c) ? `the ${c}` : /\bcity$/i.test(c) || /county$/i.test(c) ? c : `${c} County`}, ${stateName(st)}`; }
// recording reference: Liber/Folio when there is a book; otherwise the instrument / document number (VA, DC); placeholders when nothing is typed yet
export const recRef = (e, at = 'at') => (String(e.book || '').trim() || String(e.page || '').trim() || !(String(e.instrumentNumber || '').trim() || String(e.documentNumber || '').trim())
  ? `in Liber ${ph(e.book, 'Book')} ${at} Folio ${ph(e.page, 'Page')}` : `as Instrument Number ${String(e.instrumentNumber || e.documentNumber).trim()}`);
const countyOnly = (county, state) => (String(state || '').toUpperCase() === 'DC' ? 'the District of Columbia' : !String(county || '').trim() ? '[County] County' : /^city of /i.test(county) || /county$/i.test(county) ? String(county).trim() : `${String(county).trim()} County`);

// ---------- chain of title ----------
export const INSTRUMENT_TYPES = ['Deed', 'Quitclaim Deed', 'Confirmatory Deed', 'Deed of Trust', 'Other'];
export const isDeedType = (t) => ['Deed', 'Quitclaim Deed', 'Confirmatory Deed'].includes(t);
// "<Grantor> to <Grantee> by deed dated MM/DD/YYYY and recorded on MM/DD/YYYY in Liber <book> at Folio <page> in the Land Records of <County> County, <State>."
export function chainClause(e, { county, state } = {}) {
  const kind = e.instrumentType && e.instrumentType !== 'Deed' && e.instrumentType !== 'Other' ? e.instrumentType.toLowerCase() : 'deed';
  return `${ph(e.grantor, 'Grantor')} to ${ph(e.grantee, 'Grantee')} by ${kind} dated ${mdy(e.documentDate) || '[MM/DD/YYYY]'} and recorded on ${mdy(e.recordedDate) || '[MM/DD/YYYY]'} ${recRef(e)} in the Land Records of ${landRecordsOf(county, state)}.`;
}
// "Being the same property which by deed dated <Month D, YYYY>, and recorded among the Land Records of <County> County, <State> on <Month D, YYYY>,
//  in Liber <book> at Folio <page>, was granted and conveyed by <grantor> unto <grantee>."
export function beingClause(e, { county, state } = {}) {
  if (!e) return '';
  return `Being the same property which by deed dated ${longDate(e.documentDate) || '[Month D, YYYY]'}, and recorded among the Land Records of ${landRecordsOf(county, state)} on ${longDate(e.recordedDate) || '[Month D, YYYY]'}, ${recRef(e)}, was granted and conveyed by ${ph(e.grantor, 'Grantor')} unto ${ph(e.grantee, 'Grantee')}.`;
}
// the vesting deed = the last deed-type entry in the chain (by position)
export const vestingEntry = (entries) => [...(entries || [])].filter((e) => !e.deletedAt && isDeedType(e.instrumentType)).sort((a, b) => a.position - b.position).pop() || null;
// chain check: each grantor should be the previous deed's grantee
export function chainGaps(entries) { const deeds = [...(entries || [])].filter((e) => !e.deletedAt && isDeedType(e.instrumentType)).sort((a, b) => a.position - b.position); const out = [];
  for (let i = 1; i < deeds.length; i++) if (normName(deeds[i].grantor) && normName(deeds[i - 1].grantee) && normName(deeds[i].grantor) !== normName(deeds[i - 1].grantee)) out.push(`#${deeds[i].position}: grantor "${deeds[i].grantor}" is not the previous grantee "${deeds[i - 1].grantee}"`);
  return out; }
export const textOf = (row) => (row && row.overrideOn && String(row.overrideText || '').trim() ? row.overrideText : (row ? row.generatedText : '')) || '';

// ---------- Schedule A: legal description ----------
export const INFO_HEADER = 'FOR INFORMATIONAL PURPOSES ONLY:';
export function infoBlock({ being, deal, taxId }) {
  const addr = deal ? `${deal.street}, ${deal.city}, ${deal.state} ${deal.zip}`.trim() : '';
  return [INFO_HEADER, being || '[Being clause: add the vesting deed to the chain of title]', `Property Address: ${addr}${deal ? ` (${countyOnly(deal.county, deal.state).replace(/^the /, '')})` : ''}`, `Tax ID: ${taxId || '[Tax ID]'}`].join('\n');
}
// put the block at the END of the legal description (replacing an older block)
export function insertBeingClause(legal, block) { const s = String(legal || ''); const i = s.indexOf(INFO_HEADER); const head = (i >= 0 ? s.slice(0, i) : s).replace(/\s+$/, ''); return (head ? head + '\n\n' : '') + block; }
// RULE (video): the legal description must END with the being clause under "FOR INFORMATIONAL PURPOSES ONLY:"
export function beingClauseMissing(legal) { const s = String(legal || ''); const i = s.indexOf(INFO_HEADER); return i < 0 || !/Being the same property/i.test(s.slice(i)); }
export const BEING_MISSING = 'The legal description must end with the being clause under "FOR INFORMATIONAL PURPOSES ONLY:". Use "Insert being clause".';
export const UNDERWRITERS = ['Fidelity National Title Insurance Company', 'Chicago Title Insurance Company', 'First American Title Insurance Company', 'Stewart Title Guaranty Company', 'Old Republic National Title Insurance Company', 'WFG National Title Insurance Company'];
export const COMMITMENT_FORMS = ['2021 ALTA', '2016 ALTA', '2006 ALTA'];

// ---------- requirements (Schedule B-I) and exceptions (Schedule B-II) ----------
export const ITEM_STATUSES = [['open', 'Open'], ['satisfied', 'Satisfied'], ['waived', 'Waived']];
export const DOT_FIELDS = [['dotLender', 'Lender'], ['dotTrustee', 'Trustee'], ['dotGrantor', 'Grantor'], ['dotDate', 'Date of DOT', 'date'], ['dotRecordedDate', 'Date recorded', 'date'], ['dotAmount', 'Amount', 'money'],
  ['dotBook', 'Book'], ['dotPage', 'Page'], ['dotInstrumentNumber', 'Instrument #'], ['dotHyperlink', 'Instrument hyperlink', 'url']];
export const TAX_FIELDS = [['taxIdNumber', 'Tax ID no'], ['taxYear', 'Tax year'], ['taxBaseAnnual', 'Base annual tax amount', 'money'], ['taxFirstHalfStatus', '1st half', 'paid'], ['taxFirstHalfAmount', '1st half amount', 'money'],
  ['taxSecondHalfStatus', '2nd half', 'paid'], ['taxSecondHalfAmount', '2nd half amount', 'money'], ['taxDueDates', 'Taxes due dates'], ['taxPenaltyInterest', 'Penalty and interest', 'money'], ['taxDueDate', 'Due date', 'date'],
  ['taxDelinquentAmount', 'Delinquent taxes due', 'money'], ['taxForwardBillTo', 'Forwarding tax bill to']];
export const DEED_FIELDS = [['deedGrantor', 'Grantor (seller)'], ['deedGrantee', 'Grantee (buyer)']];
export const NEW_DOT_FIELDS = [['newDotGrantor', 'Grantor (buyer)'], ['newDotLender', 'New lender'], ['newDotTrustee', 'Trustee'], ['newDotAmount', 'Loan amount', 'money']];
export const ITEM_FIELD_KEYS = [...DOT_FIELDS, ...TAX_FIELDS, ...DEED_FIELDS, ...NEW_DOT_FIELDS].map(([k]) => k);
export const MONEY_FIELDS = [...DOT_FIELDS, ...TAX_FIELDS, ...NEW_DOT_FIELDS].filter((f) => f[2] === 'money').map(([k]) => k);
export const DATE_FIELDS = [...DOT_FIELDS, ...TAX_FIELDS].filter((f) => f[2] === 'date').map(([k]) => k);
export const TAX_DISCLAIMER = 'This tax information is furnished for your information only and is not insured. The Company assumes no liability for its accuracy; verify all amounts with the taxing authority before closing.';
// "A Deed of Trust from <grantor> to <trustee or [Trustee]>, securing an indebtedness to <lender>, in the principal amount of $<amount>, dated <Month D, YYYY>
//  and recorded on <Month D, YYYY> in Liber <book>, Folio <page> in the official records of <County> County to be satisfied and released."  Blank = [Field].
export function dotRequirementText(f, { county, state } = {}) {
  return `A Deed of Trust from ${ph(f.dotGrantor, 'Grantor')} to ${ph(f.dotTrustee, 'Trustee')}, securing an indebtedness to ${ph(f.dotLender, 'Lender')}, in the principal amount of ${usd2(f.dotAmount) || '$[Amount]'}, dated ${longDate(f.dotDate) || '[Date of DOT]'} and recorded on ${longDate(f.dotRecordedDate) || '[Date Recorded]'} in Liber ${ph(f.dotBook, 'Book')}, Folio ${ph(f.dotPage, 'Page')} in the official records of ${countyOnly(county, state)} to be satisfied and released.`;
}
// boilerplate, then one line per value; blank values are left out; no trailing period after amounts
export function taxRequirementText(f) {
  const st = (v) => (v === 'paid' ? 'PAID' : v === 'unpaid' ? 'UNPAID' : '');
  const lines = [
    f.taxIdNumber ? `TAX ID NO. ${f.taxIdNumber}` : '', f.taxYear ? `TAX YEAR ${f.taxYear}` : '', f.taxBaseAnnual != null && f.taxBaseAnnual !== '' ? `BASE ANNUAL TAX AMOUNT ${usd2(f.taxBaseAnnual)}` : '',
    st(f.taxFirstHalfStatus) && f.taxFirstHalfAmount != null && f.taxFirstHalfAmount !== '' ? `1ST HALF TAXES ARE ${st(f.taxFirstHalfStatus)} IN THE AMOUNT OF ${usd2(f.taxFirstHalfAmount)}` : st(f.taxFirstHalfStatus) ? `1ST HALF TAXES ARE ${st(f.taxFirstHalfStatus)}` : '',
    st(f.taxSecondHalfStatus) && f.taxSecondHalfAmount != null && f.taxSecondHalfAmount !== '' ? `2ND HALF TAXES ARE ${st(f.taxSecondHalfStatus)} IN THE AMOUNT OF ${usd2(f.taxSecondHalfAmount)}` : st(f.taxSecondHalfStatus) ? `2ND HALF TAXES ARE ${st(f.taxSecondHalfStatus)}` : '',
    f.taxDueDates ? `TAXES DUE DATES ${String(f.taxDueDates).toUpperCase()}` : '', f.taxPenaltyInterest != null && f.taxPenaltyInterest !== '' ? `PENALTY AND INTEREST ${usd2(f.taxPenaltyInterest)}` : '',
    f.taxDueDate ? `DUE DATE ${mdy(f.taxDueDate)}` : '', f.taxDelinquentAmount != null && f.taxDelinquentAmount !== '' ? `DELINQUENT TAXES DUE ${usd2(f.taxDelinquentAmount)}` : '',
    f.taxForwardBillTo ? `FORWARD TAX BILL TO ${String(f.taxForwardBillTo).toUpperCase()}` : ''].filter(Boolean);
  return [TAX_DISCLAIMER, ...lines].join('\n');
}
export const deedRequirementText = (f) => `Deed from ${ph(f.deedGrantor, 'Seller')} to ${ph(f.deedGrantee, 'Buyer')}, to be executed and recorded at closing.`;
export const newDotRequirementText = (f) => `Deed of Trust from ${ph(f.newDotGrantor, 'Buyer')} to ${ph(f.newDotTrustee, 'Trustee')}, for the benefit of ${ph(f.newDotLender, 'Lender')}, securing a loan in the amount of ${usd2(f.newDotAmount) || '$[Loan amount]'}, to be executed and recorded at closing.`;
// seeded standard templates (fake but realistic wording). kind: requirement | exception. gen = live text generator for the typed fields.
export const REQUIREMENT_TEMPLATES = [
  { key: 'dot_release', label: 'Deed of Trust (to be satisfied and released)', tab: 'standard', fields: 'dot', gen: dotRequirementText, curative: 'Seller - Pending Payoff' },
  { key: 'tax', label: 'Tax Requirement', tab: 'standard', fields: 'tax', gen: taxRequirementText, curative: 'Seller - Pending Taxes' },
  { key: 'deed', label: 'Deed from seller to buyer (executed and recorded at closing)', tab: 'standard', fields: 'deed', gen: deedRequirementText, curative: 'Seller - Pending Deed' },
  { key: 'new_dot', label: 'Deed of Trust from buyer to new lender', tab: 'standard', fields: 'newdot', gen: newDotRequirementText, curative: 'Buyer - Pending Closing' },
  { key: 'payment_release', label: 'Payment and release of record of the following items:', tab: 'standard', text: 'Payment and release of record of the following items:' },
  { key: 'owner_affidavit', label: "Owner's / no-lien affidavit", tab: 'standard', text: "Receipt of an Owner's Affidavit and No-Lien Affidavit, executed by the seller(s), satisfactory to the Company.", curative: 'Seller - Pending Affidavit' },
  { key: 'hoa_paid', label: 'HOA / condo assessments paid through closing', tab: 'standard', text: 'Evidence that all homeowners or condominium association assessments due through the date of closing have been paid.', curative: 'Pending Condo Payoff' },
  { key: 'water_paid', label: 'Water and sewer charges paid', tab: 'standard', text: 'Evidence that all water and sewer charges have been paid through the date of closing.', curative: 'Seller - Pending Water' },
  { key: 'spousal_joinder', label: 'Spousal joinder', tab: 'standard', text: "Joinder of the seller's spouse, if any, in the deed to the proposed insured.", curative: 'Seller - Pending Joinder' },
  { key: 'entity_authority', label: 'Entity authority documents', tab: 'standard', text: '**Proper evidence of authority** for the entity to convey: operating agreement, certificate of good standing and a resolution authorizing the sale.', curative: 'Seller - Pending Entity Docs' },
  { key: 'judgment_release', label: 'Release of judgment / lien of record', tab: 'standard', text: 'Release of record of the following judgment(s) or lien(s): [describe], or proof that they do not affect the subject property.', curative: 'Seller - Pending Release' },
  { key: 'survey_affidavit', label: 'Survey or no-change affidavit', tab: 'standard', text: 'A current survey of the land, or a no-change survey affidavit, satisfactory to the Company.', curative: 'Pending Survey' },
];
export const REQUIREMENT_GROUPS = [
  { key: 'purchase_basic', label: 'Purchase with a new loan', items: ['deed', 'new_dot', 'tax', 'owner_affidavit'] },
  { key: 'payoff_block', label: 'Payoffs (parent + Deed of Trust)', items: ['payment_release', 'dot_release'], nest: true },
  { key: 'condo_purchase', label: 'Condo purchase extras', items: ['hoa_paid', 'water_paid'] },
];
export const EXCEPTION_TEMPLATES = [
  { key: 'condo_endorsement', label: 'Condo Endorsement Clause', tab: 'standard', text: 'The policy will include the ALTA 4.1-06 Condominium Endorsement, subject to the terms of the Declaration of Condominium, the By-Laws and the Plats recorded among the Land Records.' },
  { key: 'ex03_condo', label: 'EX-03 CONDO EXCEPTION', tab: 'standard', text: 'Terms, conditions, covenants, easements and restrictions of the Declaration of Condominium and its By-Laws, recorded in Liber [Book] at Folio [Page], and all amendments thereto.' },
  { key: 'ex04_condo', label: 'EX-04 CONDO EXCEPTION', tab: 'standard', text: 'Condominium Plats recorded as Plat Nos. [Plat numbers] among the Land Records, and any matters shown thereon.' },
  { key: 'md_fidelity_condo', label: 'MD - FIDELITY CONDO EXCEPTION', tab: 'standard', text: 'Any lien for unpaid common expense assessments levied by the condominium association under the Maryland Condominium Act, Real Property Article, Title 11, and the Declaration.' },
  { key: 'taxes', label: 'Taxes not yet due and payable', tab: 'standard', text: 'Taxes and assessments for the current tax year and subsequent years, a lien not yet due and payable.' },
  { key: 'water', label: 'Water and sewer charges', tab: 'standard', text: 'Water, sewer and front foot benefit charges, if any, not yet due and payable.' },
  { key: 'setback', label: 'Building restriction / setback lines', tab: 'standard', text: 'Building restriction lines, setback lines and easements as shown on the plat recorded among the Land Records.' },
  { key: 'amendments', label: 'Recorded amendments', tab: 'standard', text: 'Amendments to the Declaration recorded in Liber [Book] at Folio [Page].' },
  { key: 'parties_possession', label: 'Rights of parties in possession', tab: 'standard', text: 'Rights or claims of parties in possession not shown by the public records.' },
  { key: 'alta_4_1', label: 'ALTA 4.1 Endorsement', tab: 'standard', text: 'ALTA 4.1-06 Endorsement (Condominium - Current Assessments) to be issued with the Loan Policy.' },
  { key: 'alta_8_1', label: 'ALTA 8.1-06 Endorsement', tab: 'standard', text: 'ALTA 8.1-06 Endorsement (Environmental Protection Lien) to be issued with the Loan Policy.' },
];
export const EXCEPTION_GROUPS = [{ key: 'condo_set', label: 'MD condo set', items: ['condo_endorsement', 'ex03_condo', 'ex04_condo', 'md_fidelity_condo', 'alta_4_1'] }, { key: 'loan_endorsements', label: 'Loan policy endorsements', items: ['alta_4_1', 'alta_8_1'] }];
export const templateOf = (kind, key) => (kind === 'exception' ? EXCEPTION_TEMPLATES : REQUIREMENT_TEMPLATES).find((t) => t.key === key) || null;
// live generated text for a requirement / exception row (typed fields -> text). Custom rows keep their own text.
export function itemGeneratedText(row, ctx = {}) { const t = templateOf(row.kind, row.templateKey); if (!t) return row.generatedText || '';
  return t.gen ? t.gen(row, ctx) : t.text; }
// numbering: 1, 2, 3 for top level (by position), a., b. for sub-items
export function numberItems(rows) { const live = (rows || []).filter((r) => !r.deletedAt); const top = live.filter((r) => !r.parentId).sort((a, b) => a.position - b.position); const out = [];
  top.forEach((r, i) => { out.push({ ...r, number: String(i + 1), depth: 0 }); live.filter((c) => c.parentId === r.id).sort((a, b) => a.position - b.position).forEach((c, j) => out.push({ ...c, number: `${i + 1}${String.fromCharCode(97 + (j % 26))}`, label: `${String.fromCharCode(97 + (j % 26))}.`, depth: 1 })); });
  return out; }
// tiny safe markdown (bold / italic / "- " lists) for requirement text; input is escaped first
export function miniMarkdown(text, esc) { const lines = String(text || '').split('\n'); let out = ''; let inList = false;
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>');
  for (const l of lines) { if (/^\s*[-*]\s+/.test(l)) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`; continue; }
    if (inList) { out += '</ul>'; inList = false; } out += l.trim() ? `<p>${inline(l)}</p>` : ''; }
  return out + (inList ? '</ul>' : ''); }

// ---------- policies / CPL ----------
export const LENDER_POLICY_TYPES = ['ALTA Short Form Loan Policy', 'ALTA Loan Policy', 'ALTA Expanded Coverage Residential Loan Policy'];
export const OWNER_POLICY_TYPES = ["ALTA Homeowner's Policy", "ALTA Owner's Policy"];
export const RATE_TYPES = ['Basic', 'Reissue', 'Substitution / Refinance', 'Simultaneous Issue'];
export const CPL_TYPES = ['Standard', 'Standard - Buyer/Borrower', 'Standard - Seller', 'Lender Only'];
export const LENDER_CLAUSES = ['ISAOA/ATIMA', 'Its Successors And/Or Assigns', 'ISAOA', '(none)'];
export const CPL_DEFAULT_COST = 50;
export const LOSS_PAYEE_DEFAULT = 'Its Successors And/Or Assigns';
export const FUNDING_TYPES = [['net', 'Net'], ['gross', 'Gross']];
export const INTEREST_TYPES = ['Fixed', 'Adjustable', 'Interest Only', 'Other'];
// lender names compare without the clause ("and/or Warehouse Lenders", "ISAOA/ATIMA", "Its Successors And/Or Assigns") and punctuation
export const coreLender = (s) => normName(String(s || '').replace(/,?\s*(and\/or warehouse lenders?|isaoa\/atima|isaoa|atima|its successors and\/or assigns)/gi, ''));
export const cplLenderMatches = (protectedParty, lender) => !!coreLender(lender) && coreLender(protectedParty) === coreLender(lender);
export const CPL_LENDER_MISMATCH = "The CPL's protected party must match the order's lender. Check the name against the lender on the loan.";
export const fakeCplId = (seq) => `CPL-FAKE-${String(700000 + (Number(seq) || 0) % 300000)}`;

// ---------- the summary note (exact order and wording of the video) ----------
export const SUMMARY_FIELDS = [
  ['sellerQuotedDeedPrep', 'Seller quoted for Deed Prep'], ['buyerReceivingCpl', 'Buyer receiving CPL'], ['propertyType', 'Property Type'], ['maritalStatus', 'Marital Status of Seller/Buyer'],
  ['totalDots', 'Total No. Deed of Trust'], ['payoff1', 'Payoff 1'], ['payoff2', 'Need payoff 2?'], ['payoff3', 'Need payoff 3?'], ['judgmentsLiens', 'Any Judgments/Liens found on record'],
  ['hoaCondo', 'HOA/Condo'], ['groundRent', 'Ground Rent'], ['taxes', 'Taxes'], ['waterSewerAccount', 'Water/Sewer account number found on record'], ['taxSale', 'Tax Sale'],
  ['openPermits', 'Open Permits/Code Violations found on record'], ['surveyRequest', 'Survey Request Received'], ['searchBuyer', 'Search for Buyer'], ['searchSeller', 'Search for Seller'],
  ['titleToIssue', 'Title to Issue'], ['lienCert', 'Lien Cert Received/Needed'], ['priorTitlePolicy', 'Any PRIOR TITLE POLICY RECVD'], ['cplBuyer', 'CPL issued for Buyer'], ['cplSeller', 'CPL issued for Seller'],
  ['waterSewerExceptions', 'Any Water/Sewer Exceptions on Abstract?']];
export const SUMMARY_KEYS = SUMMARY_FIELDS.map(([k]) => k);
export const PROPERTY_TYPES = ['Fee Simple', 'Leasehold', 'Condo', 'Co-op', 'Townhouse (fee simple)'];
export const mmdd = (ymd) => (isYmd(ymd) ? `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}` : '');
export const summaryHeader = (date, reviewerFirst) => `${mmdd(date)} - TITLE REVIEW - ${reviewerFirst || '[Reviewer]'}`;
// "BASE 1851.46 - 1ST HALF PAID - 2ND HALF UNPAID"
export function taxesLine(r) { const p = [r.taxBaseAnnual != null && r.taxBaseAnnual !== '' ? `BASE ${plain2(r.taxBaseAnnual)}` : '', r.taxFirstHalfStatus ? `1ST HALF ${r.taxFirstHalfStatus.toUpperCase()}` : '', r.taxSecondHalfStatus ? `2ND HALF ${r.taxSecondHalfStatus.toUpperCase()}` : ''].filter(Boolean); return p.join(' - '); }
export const dotPayoffLine = (row) => `DOT ${row.dotBook || '[Book]'}-${row.dotPage || '[Page]'} - NEED PAYOFF`;
// CURATIVE suggestions from the open requirements and the DOTs that need a payoff
export function curativeSuggestions(items, { hoaFound = false } = {}) {
  const open = numberItems((items || []).filter((r) => r.kind === 'requirement')).filter((r) => r.status === 'open'); const out = [];
  if (open.length) out.push('TITLE PENDING REQUIREMENTS');
  if (open.some((r) => r.templateKey === 'dot_release' && r.dotNeedsPayoff !== false)) out.push('NEEDS PAYOFF');
  if (hoaFound) out.push('Pending Condo Payoff');
  open.forEach((r) => { const t = templateOf('requirement', r.templateKey); if (t && t.curative) out.push(`REQ#${r.number} - ${t.curative}`); });
  return [...new Set(out)]; }
export function summaryNoteText(s, curative) {
  return ['TITLE NOTES:', summaryHeader(s.noteDate, s.reviewerFirstName), ...SUMMARY_FIELDS.map(([k, l]) => `${l}: ${s[k] == null || s[k] === '' ? '-' : s[k]}`), '', 'CURATIVE:', ...((curative || []).length ? curative.map((c) => `- ${c}`) : ['- NONE'])].join('\n'); }
export const ctcTaskNote = (date, reviewerFirst, curative) => [`${mmdd(date)} - Title ${reviewerFirst || '[Reviewer]'}`, ...((curative || []).length ? curative : ['NO OUTSTANDING TITLE REQUIREMENTS'])].join('\n');
export const CTC_TASK = 'Title - CLEAR TO CLOSE';
export const REVIEW_TASK = 'Review title exam';
export const SEND_TASK = 'Send Title Package';
export const TITLE_TASK_GROUP = 'Title - Other';

// ---------- order notes (Qualia sticky notes) ----------
export const NOTE_CATEGORIES = ['GENERAL', 'FRAUD', 'SCHEDULING', 'FUNDING & POST-CLOSING', 'PROCESSOR NOTE FOR RECORDING', 'RECORDING STATUS/HISTORY', 'ATTY REVIEW NOTE', 'FINAL ORDERING QC CHECKLIST', 'Orders Team Summary Data', 'TITLE'];

// ---------- the contract review lists ----------
export const ASSOC_TYPES = [['none', 'None'], ['hoa', 'HOA'], ['condo', 'Condo association'], ['both', 'HOA + condo']];
export const FEE_FREQUENCIES = ['Monthly', 'Quarterly', 'Semi-annual', 'Annual'];
export const FEE_INCLUDES = [['feeInclWater', 'Water'], ['feeInclSewer', 'Sewer'], ['feeInclHeat', 'Heat'], ['feeInclElectric', 'Electricity'], ['feeInclGas', 'Gas'], ['feeInclAc', 'A/C']];
export const WATER_TYPES = [['public', 'Public'], ['private', 'Private'], ['well', 'Well']];
export const SEWER_TYPES = [['public', 'Public'], ['private', 'Private'], ['septic', 'Septic']];
export const YNU = [['yes', 'Yes'], ['no', 'No'], ['unknown', 'Unknown']];
export const TRANSFER_SPLITS = ['50/50', 'Buyer pays all', 'Seller pays all', 'First-time buyer exemption', 'Other'];
