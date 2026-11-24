/* FF-105 (Francis Santos, Nov 19 2026, 12:23 PM ET, confirmed 2:35 PM ET).
 * Staff File Overview layout only. Fake names. No database.
 * Rule 5: the Closing Team role list was updated in FF-106b, not loosened to make a test pass.
 * Francis's 2:33 PM ET retest (Gmail 1a209e6c78047e5d) and the Nov 23 confirm-back require the
 * former Transaction Coordinator slot to be labelled Preprocessor; the extra TC card is gone. */
import { buildOrderOverview } from '../js/data/order-overview.js';
import { toText } from '../js/ui.js';
import { STAGES } from '../js/data/constants.js';
import { agencyDisplayName, closingTeamCards, closingTeamHtml, nameInitials, partiesList, staffFileFacts, staffPartyPlan, staffRoleTitle, staffSummaryHtml, staffTrackerLabel } from '../js/pages/deal.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const deal = {
  id: 'deal-1', fileNumber: 'MD-26-97183', transactionType: 'Purchase', purchasePrice: 450000, loanAmount: 80,
  openDate: '2026-11-02', closingDate: '2026-12-15', stage: 1, status: 'Open', state: 'MD',
  processorName: 'Paula Processor', processorId: 'u-proc', preprocessorName: 'Pat Pre', preprocessorUserId: 'u-pre',
  tcName: 'Tina Coordinator', tcUserId: 'u-tc',
  closerName: 'Chris Closer', closerProfileId: 'u-closer',
  salesPeople: [{ id: 'u-sp1', name: 'Sam Sales' }, { id: 'u-sp2', name: 'Sue Sales' }],
  participants: [
    { role: 'Client-Buyer', contact: { firstName: 'Ben', lastName: 'Buyer', email: 'ben@example.test', phone: '3015550107', company: '' } },
    { role: 'Client-Seller', contact: { firstName: 'Sue', lastName: 'Seller', email: 'sue@example.test', phone: '3015550108', company: '' } },
    { role: 'Buyer Agent', contact: { firstName: 'Bianca', lastName: 'Buyer-Agent', email: 'bianca@example.test', phone: '3015550105', company: 'Harbor Realty' } },
    { role: 'Listing Agent', contact: { firstName: 'Larry', lastName: 'Listing-Agent', email: 'larry@example.test', phone: '3015550106', company: 'Bay Listings' } },
    { role: 'Lender', contactId: 'c-bank', contact: { id: 'c-bank', firstName: 'First', lastName: 'Bank', email: 'bank@example.test', phone: '3015550109', company: 'First Bank' } },
    { role: 'Lender', contactId: 'c-lo', contact: { id: 'c-lo', firstName: 'Lena', lastName: 'Officer', email: 'lena@example.test', phone: '3015550119', company: 'First Bank', lenderRole: 'loan_officer' } },
    { role: 'Buyer Agent TC', contactId: 'c-tc', contact: { firstName: 'Riley', lastName: 'Coordinator', email: 'riley@example.test', phone: '3015550110', company: 'Harbor Realty' } },
    { role: 'Listing Agent TC', contactId: 'c-ltc', contact: { firstName: 'Lee', lastName: 'Listing-TC', email: 'lee@example.test', phone: '3015550112', company: 'Bay Listings' } },
  ],
};
const me = { id: 'u-proc', role: 'Processor' };
const ov = buildOrderOverview({ deal, me, tasks: [], documents: [], threads: [], activity: [] });
const facts = staffFileFacts(deal);
ok(facts.map((f) => f.label).join('|') === 'Transaction Type|Open Date|Close Date|Purchase Price', 'the four boxes use the names Francis asked for');
ok(facts[0].value === 'Purchase' && facts[1].value === '11/02/2026' && facts[2].value === '12/15/2026' && facts[3].value === '$450,000', 'the four boxes show the values already on the file');
ok(staffFileFacts({ transactionType: 'Refinance', purchasePrice: null }).every((f, i) => i === 0 ? f.value === 'Refinance' : f.value === ''), 'a missing date or price stays blank and the box label remains');

const cards = closingTeamCards(deal);
ok(cards.map((c) => c.role).join('|') === 'Processor|Preprocessor|Licensed Settlement Agent|Sales Person|Sales Person', 'Closing Team uses the picture role names with the CLA slot labelled Preprocessor (FF-106b), with one Sales Person card each');
ok(cards[0].name === 'Paula Processor' && cards[1].role === 'Preprocessor' && cards[1].name === 'Pat Pre' && cards[2].role === 'Licensed Settlement Agent' && cards[2].name === '' && !cards[2].blankBecause, 'assigned people show, the CLA slot is Preprocessor, and Licensed Settlement Agent stays blank until one is assigned');
ok(!cards.some((c) => c.role === 'Transaction Coordinator') && !cards.some((c) => c.name === 'Tina Coordinator'), 'the CLA Transaction Coordinator is not a Closing Team card (FF-106b relabel)');
ok(!cards.some((c) => c.name === 'Chris Closer') && !cards.some((c) => c.name === 'Transaction Coordinator for CLA'), 'Closer is not renamed, and the sample coordinator name is not stored');
ok(nameInitials('Paula Processor') === 'PP' && nameInitials('') === '', 'a card uses initials, and a blank name has none');
const teamHtml = toText(closingTeamHtml(deal));
ok(teamHtml.indexOf('data-team-name') < teamHtml.indexOf('op-box-label') && teamHtml.includes('op-team-av'), 'each Closing Team card puts initials, then the name, then the role');
const summaryHtml = toText(staffSummaryHtml(deal));
ok(summaryHtml.indexOf('>$450,000<') < summaryHtml.indexOf('>Purchase Price<'), 'each summary box puts the value above the label');
ok(closingTeamCards({ salesPeople: [] }).filter((c) => c.role === 'Sales Person').length === 1 && closingTeamCards({}).find((c) => c.role === 'Sales Person').name === '', 'no salesperson still shows the Sales Person title with a blank name');
ok(STAGES[4] === 'Wire/Cash to Close Awareness' && STAGES[8] === 'Funding auth', 'the stored stage names stay the same');
ok(staffTrackerLabel(4) === 'Wire/Cash to Close Acknowledge' && staffTrackerLabel(8) === 'Funding Auth' && staffTrackerLabel(0) === 'Opened', 'the staff tracker shows the picture words for those two steps only');

const html = toText(partiesList(deal, ov, true, { edit: true, source: '', sourceLabel: '' }));
ok(html.includes('>Selling Agent<') && html.includes('data-party="Buyer Agent"') && !html.includes('>Buyer Agent<'), 'Selling Agent is the label and the stored role stays Buyer Agent');
ok(html.includes('>Selling Agent TC<') && html.includes('>Listing Agent TC<') && html.includes('>Title Abstractor<') && html.includes('data-party="Abstractor"'), 'coordinator and abstractor rows use the picture words, and the stored abstractor key stays');
ok(staffRoleTitle({ label: 'Buyer Agent' }) === 'Selling Agent' && staffRoleTitle({ fileRole: 'Buyer Agent TC' }) === 'Selling Agent TC' && staffRoleTitle({ label: 'Abstractor' }) === 'Title Abstractor', 'display titles do not change the stored role');
ok(html.includes('>Loan Officer<') && html.includes('data-party="Lender"'), 'a saved loan officer is labeled Loan Officer and stays a lender contact');
const marks = ['data-party="Buyer"', 'data-party="Seller"', '>Lender<', '>Loan Officer<', 'data-party-display="Selling Agency"', '>Selling Agent<', '>Selling Agent TC<', 'data-party-display="Listing Agency"', 'data-party="Listing Agent"', '>Listing Agent TC<', '>Title Abstractor<', 'data-party="Underwriter"', 'data-party="Processor"', 'data-party="Title Company"'];
let at = -1; let orderOk = true;
for (const bit of marks) { const next = html.indexOf(bit, at + 1); if (next <= at) orderOk = false; at = next; }
ok(orderOk, 'parties follow the picture, then the rows the picture left out');
ok(!html.includes('data-party-align'), 'the picture is one list, not two columns');
ok(html.includes('data-party-display="Selling Agency"') && html.includes('Harbor Realty') && html.includes('data-party-display="Listing Agency"') && html.includes('Bay Listings'), 'agency names come from the agent company already on the row');
ok(agencyDisplayName([{ company: 'Harbor Realty' }, { company: 'Harbor Realty', placeholder: true }, { company: '' }]) === 'Harbor Realty', 'a blank or placeholder company is not invented');
ok(html.includes('data-party="Processor"') && html.includes('data-party="Title Company"') && html.includes('Paula Processor') && html.includes('CLA Title'), 'Processor and Title Company stay on the list');
ok(html.includes('data-call') && html.includes('data-email') && html.includes('data-copy-field') && html.includes('data-source-of-business') && html.includes('data-pick-processor'), 'Call, Email, copy, source of business, and the processor action stay');

const plainLender = { ...deal, participants: deal.participants.map((p) => p.contactId === 'c-lo' ? { ...p, contact: { ...p.contact, lenderRole: '' } } : p) };
const plainHtml = toText(partiesList(plainLender, buildOrderOverview({ deal: plainLender, me, tasks: [], documents: [], threads: [], activity: [] }), true, { edit: true, source: '', sourceLabel: '' }));
ok(!plainHtml.includes('>Loan Officer<') && plainHtml.includes('data-party="Lender"'), 'with no loan officer on the lender contact, that row is left out');

const plan = staffPartyPlan([
  { label: 'Buyer', name: 'Ben' },
  { label: 'Processor', name: 'Paula' },
  { label: 'Title Company', name: 'CLA Title & Escrow' },
  { label: 'Title Sales Rep', name: 'Sam Sales', salesRep: true },
  { label: 'Buyer Agent', name: 'Bianca', company: 'Harbor Realty' },
  { label: 'Listing Agent', name: 'Larry', company: 'Bay Listings' },
  { label: 'Preprocessor', name: 'Pat Pre' },
]);
const kept = [...plan.image.filter((item) => item.kind === 'party').map((item) => item.party), ...plan.rest];
ok(kept.length === 7 && plan.rest.some((p) => p.label === 'Processor') && plan.rest.some((p) => p.label === 'Title Company') && plan.rest.some((p) => p.label === 'Title Sales Rep') && plan.rest.some((p) => p.label === 'Preprocessor'), 'reordering does not drop Processor, Title Company, the sales rep, or Preprocessor');

const agentHtml = toText(partiesList(deal, buildOrderOverview({ deal: { ...deal, myRole: 'Buyer Agent', myRoles: ['Buyer Agent'] }, me: { id: 'u-bagent', role: 'Outside user' }, tasks: [], documents: [], threads: [], activity: [] }), false));
ok(agentHtml.includes('>Buyer Agent<') && !agentHtml.includes('data-file-summary') && !agentHtml.includes('data-closing-team') && !agentHtml.includes('Selling Agency'), 'an agent overview keeps the Buyer Agent words and does not get the staff strip');

const refi = { ...deal, transactionType: 'Refinance', participants: deal.participants.filter((p) => p.role === 'Client-Buyer' || p.role === 'Lender') };
const refiHtml = toText(partiesList(refi, buildOrderOverview({ deal: refi, me, tasks: [], documents: [], threads: [], activity: [] }), true));
ok(!refiHtml.includes('Selling Agency') && refiHtml.includes('data-party="Processor"'), 'a refinance with no agents does not add an empty agency row');

console.log(fail ? fail + ' failed' : 'ff-105 overview layout passed');
if (fail) process.exit(1);
