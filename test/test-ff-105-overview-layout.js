/* FF-105 (Francis Santos, Nov 19 2026, 12:23 PM ET, confirmed 2:35 PM ET).
 * Staff File Overview layout only. Fake names. No database. */
import { buildOrderOverview } from '../js/data/order-overview.js';
import { toText } from '../js/ui.js';
import { agencyDisplayName, closingTeamCards, partiesList, staffFileFacts, staffPartyPlan, staffRoleTitle } from '../js/pages/deal.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const deal = {
  id: 'deal-1', fileNumber: 'MD-26-97183', transactionType: 'Purchase', purchasePrice: 450000, loanAmount: 80,
  openDate: '2026-11-02', closingDate: '2026-12-15', stage: 1, status: 'Open', state: 'MD',
  processorName: 'Paula Processor', processorId: 'u-proc', tcName: 'Tina Coordinator', tcUserId: 'u-tc',
  closerName: 'Chris Closer', closerProfileId: 'u-closer',
  salesPeople: [{ id: 'u-sp1', name: 'Sam Sales' }, { id: 'u-sp2', name: 'Sue Sales' }],
  participants: [
    { role: 'Client-Buyer', contact: { firstName: 'Ben', lastName: 'Buyer', email: 'ben@example.test', phone: '3015550107', company: '' } },
    { role: 'Client-Seller', contact: { firstName: 'Sue', lastName: 'Seller', email: 'sue@example.test', phone: '3015550108', company: '' } },
    { role: 'Buyer Agent', contact: { firstName: 'Bianca', lastName: 'Buyer-Agent', email: 'bianca@example.test', phone: '3015550105', company: 'Harbor Realty' } },
    { role: 'Listing Agent', contact: { firstName: 'Larry', lastName: 'Listing-Agent', email: 'larry@example.test', phone: '3015550106', company: 'Bay Listings' } },
    { role: 'Lender', contact: { firstName: 'Lena', lastName: 'Lender', email: 'lena@example.test', phone: '3015550109', company: 'First Bank', lenderRole: 'loan_officer' } },
    { role: 'Buyer Agent TC', contactId: 'c-tc', contact: { firstName: 'Riley', lastName: 'Coordinator', email: 'riley@example.test', phone: '3015550110', company: 'Harbor Realty' } },
  ],
};
const me = { id: 'u-proc', role: 'Processor' };
const ov = buildOrderOverview({ deal, me, tasks: [], documents: [], threads: [], activity: [] });
const facts = staffFileFacts(deal);
ok(facts.map((f) => f.label).join('|') === 'Transaction Type|Open Date|Close Date|Purchase Price', 'the four boxes use the names Francis asked for');
ok(facts[0].value === 'Purchase' && facts[1].value === '11/02/2026' && facts[2].value === '12/15/2026' && facts[3].value === '$450,000', 'the four boxes show the values already on the file');
ok(staffFileFacts({ transactionType: 'Refinance', purchasePrice: null }).every((f, i) => i === 0 ? f.value === 'Refinance' : f.value === ''), 'a missing date or price stays blank and the box label remains');

const cards = closingTeamCards(deal);
ok(cards.map((c) => c.role).join('|') === 'Processor|CLA Transaction Coordinator|Licensed Settlement Agent|Sales Person|Sales Person', 'Closing Team is those roles, with one Sales Person card each');
ok(cards[0].name === 'Paula Processor' && cards[1].name === 'Tina Coordinator' && cards[2].name === '' && cards[2].blankBecause === 'no-field', 'assigned people show, and Licensed Settlement Agent stays blank');
ok(!cards.some((c) => c.name === 'Chris Closer'), 'Closer is not renamed into Licensed Settlement Agent');
ok(closingTeamCards({ salesPeople: [] }).filter((c) => c.role === 'Sales Person').length === 1 && closingTeamCards({}).find((c) => c.role === 'Sales Person').name === '', 'no salesperson still shows the Sales Person title with a blank name');

const html = toText(partiesList(deal, ov, true, { edit: true, source: '', sourceLabel: '' }));
ok(html.includes('>Selling Agent<') && html.includes('data-party="Buyer Agent"') && !html.includes('>Buyer Agent<'), 'Selling Agent is the label and the stored role stays Buyer Agent');
ok(staffRoleTitle({ label: 'Buyer Agent' }) === 'Selling Agent' && staffRoleTitle({ label: 'Listing Agent' }) === 'Listing Agent', 'only the buyer agent row is relabeled');
const sellingAt = html.indexOf('data-party-align="agents"');
const sellingSide = html.indexOf('data-side="selling"', sellingAt);
const listingSide = html.indexOf('data-side="listing"', sellingAt);
ok(sellingAt > 0 && sellingSide > sellingAt && listingSide > sellingSide && html.indexOf('data-party="Buyer Agent"') > sellingSide && html.indexOf('data-party="Buyer Agent"') < listingSide && html.indexOf('data-party="Listing Agent"') > listingSide, 'Selling Agent sits on the same row as Listing Agent');
ok(html.includes('data-party-display="Selling Agency"') && html.includes('Harbor Realty') && html.includes('data-party-display="Listing Agency"') && html.includes('Bay Listings'), 'agency names come from the agent company already on the row');
ok(agencyDisplayName([{ company: 'Harbor Realty' }, { company: 'Harbor Realty', placeholder: true }, { company: '' }]) === 'Harbor Realty', 'a blank or placeholder company is not invented');
ok(html.includes('data-party="Processor"') && html.includes('data-party="Title Company"') && html.includes('Paula Processor') && html.includes('CLA Title'), 'Processor and Title Company stay on the list');
ok(html.includes('data-call') && html.includes('data-email') && html.includes('data-copy-field') && html.includes('data-source-of-business') && html.includes('data-pick-processor'), 'Call, Email, copy, source of business, and the processor action stay');
ok(html.includes('Transaction coordinator') && html.includes('data-party="Abstractor"') && html.includes('data-party="Underwriter"'), 'the coordinator, abstractor, and underwriter rows stay');
ok(html.indexOf('data-party="Buyer"') < html.indexOf('data-party="Seller"') && html.indexOf('data-party="Seller"') < html.indexOf('data-party-align="agencies"') && html.indexOf('data-party="Lender"') < html.indexOf('data-party-align="agencies"'), 'buyer, seller, and lender come before the agency row');

const plan = staffPartyPlan([
  { label: 'Buyer', name: 'Ben' },
  { label: 'Processor', name: 'Paula' },
  { label: 'Title Company', name: 'CLA Title & Escrow' },
  { label: 'Title Sales Rep', name: 'Sam Sales', salesRep: true },
  { label: 'Buyer Agent', name: 'Bianca', company: 'Harbor Realty' },
  { label: 'Listing Agent', name: 'Larry', company: 'Bay Listings' },
  { label: 'Preprocessor', name: 'Pat Pre' },
]);
const kept = [...plan.buyers, ...plan.sellers, ...plan.lenders, ...plan.sellingAgents, ...plan.listingAgents, ...plan.sellingTcs, ...plan.listingTcs, ...plan.rest];
ok(kept.length === 7 && plan.rest.some((p) => p.label === 'Processor') && plan.rest.some((p) => p.label === 'Title Company') && plan.rest.some((p) => p.label === 'Title Sales Rep') && plan.rest.some((p) => p.label === 'Preprocessor'), 'reordering does not drop Processor, Title Company, the sales rep, or Preprocessor');

const agentHtml = toText(partiesList(deal, buildOrderOverview({ deal: { ...deal, myRole: 'Buyer Agent', myRoles: ['Buyer Agent'] }, me: { id: 'u-bagent', role: 'Outside user' }, tasks: [], documents: [], threads: [], activity: [] }), false));
ok(agentHtml.includes('>Buyer Agent<') && !agentHtml.includes('data-file-summary') && !agentHtml.includes('data-closing-team') && !agentHtml.includes('Selling Agency'), 'an agent overview keeps the Buyer Agent words and does not get the staff strip');

const refi = { ...deal, transactionType: 'Refinance', participants: deal.participants.filter((p) => p.role === 'Client-Buyer' || p.role === 'Lender') };
const refiHtml = toText(partiesList(refi, buildOrderOverview({ deal: refi, me, tasks: [], documents: [], threads: [], activity: [] }), true));
ok(!refiHtml.includes('Selling Agency') && !refiHtml.includes('data-party-align="agents"') && refiHtml.includes('data-party="Processor"'), 'a refinance with no agents does not add an empty agency row');

console.log(fail ? fail + ' failed' : 'ff-105 overview layout passed');
if (fail) process.exit(1);
