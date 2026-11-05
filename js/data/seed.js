// FAKE DATA ONLY. Fictional people, example.test addresses, 555 phone numbers. No real clients, no credentials.
import { TEMPLATE_DEFS, applyNov3Templates, applyNov3bTemplates } from './templates.js?v=202611051216';
import { crmZohoUpgrade } from './crm.js?v=202611051216';
import { ensureEmailTemplates } from './crm-templates.js?v=202611051216';
export const DEAL_FOLDERS = ['Contract & addenda', 'IDs & personal', 'Lender & payoff', 'HOA', 'Closing'];
const addDays = (iso, n) => new Date(Date.parse(iso.slice(0, 10) + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export function buildSeed() {
  const P = (id, first, last, role, n, extra = {}) => ({ id, email: `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.test', firstName: first, lastName: last,
    phone: `301-555-01${String(n).padStart(2, '0')}`, role, isAdmin: false, status: 'active', createdAt: '2026-09-01T12:00:00Z', ...extra });
  const profiles = [
    P('u-proc', 'Paula', 'Processor', 'Processor', 1),
    P('u-preproc', 'Pat', 'Preprocessor', 'Preprocessor', 15),
    P('u-sp', 'Sam', 'Salesperson', 'Sales Person', 2),
    P('u-team', 'Tina', 'Salesteam', 'Sales Team', 3),
    P('u-tc', 'Terry', 'Coordinator', 'Transaction Coordinator', 4),
    P('u-tc2', 'Morgan', 'Coordinator', 'Transaction Coordinator', 14),   // John, Nov 4: the Transaction Coordinator on Ben's file MD-26-97183 (Harbor team). A TC on a file must be a TC login, so this is a staff Morgan, not Morgan Multi-Role.
    // Outside users (agents, clients): no fixed role. What they can do on each order comes from their role ON THAT ORDER (participants below).
    P('u-bagent', 'Bianca', 'Buyer-Agent', 'Outside user', 5, { co: 'Harbor Realty (fake)' }),
    P('u-lagent', 'Larry', 'Listing-Agent', 'Outside user', 6, { co: 'Oak Street Realty (fake)' }),
    P('u-buyer', 'Ben', 'Buyer', 'Outside user', 7, { co: '' }),
    P('u-seller', 'Sally', 'Seller', 'Outside user', 8, { co: '' }),
    P('u-multi', 'Morgan', 'Realtor', 'Outside user', 11, { co: 'Harbor Realty (fake)', email: 'morgan.multirole@example.test' }),   // live40: was 'Multi-Role' (display name only; id, email and file roles unchanged)   // one login, two hats: buyer's agent on MD-26-97183, a buyer on MD-26-97201
    P('u-selfrep', 'Alex', 'Agent-Buyer', 'Outside user', 12, { co: 'Harbor Realty (fake)' }),   // a licensed agent buying for himself: Client-Buyer AND Buyer Agent on MD-26-97240
    P('u-admin', 'King John', 'Admin', 'Super admin', 9, { isAdmin: true }),   // Nov 2: role 'Super admin' (always isAdmin; isAdmin is the permission check)
    P('u-adam', 'Adam', 'Admin', 'Admin', 13, { isAdmin: true }),   // Nov 2: a plain Admin (cannot delete/suspend/demote a Super admin or grant Super admin)
    P('u-gone', 'Gary', 'Gone', 'Outside user', 10, { co: 'Harbor Realty (fake)', status: 'removed', removedAt: '2026-10-20T15:00:00Z', removedBy: 'u-admin' }),   // deleted by Admin; history kept
  ];
  const contacts = profiles.map((p) => ({ id: 'c-' + p.id.slice(2), profileId: p.id, firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone,
    company: p.co != null ? p.co : 'CLA Title & Escrow', createdBy: 'u-proc', createdAt: p.createdAt }));
  profiles.forEach((p) => { delete p.co; });
  // CONTACT TYPE (John, Nov 2): agents -> realtor, clients -> buyer_seller; staff have none (set below for the extra contacts too)
  const CT = { 'u-bagent': 'realtor', 'u-lagent': 'realtor', 'u-multi': 'realtor', 'u-selfrep': 'realtor', 'u-gone': 'realtor', 'u-buyer': 'buyer_seller', 'u-seller': 'buyer_seller' };
  contacts.forEach((c) => { c.contactType = CT[c.profileId] || null; });
  contacts.push(
    { id: 'c-cora', profileId: null, contactType: 'buyer_seller', firstName: 'Cora', lastName: 'Seller', email: 'cora.seller@example.test', phone: '410-555-0133', company: '', createdBy: 'u-proc', createdAt: '2026-10-01T12:00:00Z' },
    { id: 'c-lena', profileId: null, contactType: 'realtor', firstName: 'Lena', lastName: 'Listing', email: 'lena.listing@example.test', phone: '410-555-0144', company: 'Bayview Realty (fake)', createdBy: 'u-proc', createdAt: '2026-10-01T12:00:00Z' },
    { id: 'c-lender1', profileId: null, contactType: 'lender', firstName: 'Linda', lastName: 'Lender', email: 'linda.lender@example.test', phone: '410-555-0111', company: 'Example Home Loans (fake)', createdBy: 'u-proc', createdAt: '2026-09-01T12:00:00Z' },
    { id: 'c-wbuyer', profileId: null, contactType: 'buyer_seller', firstName: 'Wendy', lastName: 'Willow-Buyer', email: 'wendy.willow-buyer@example.test', phone: '410-555-0155', company: '', createdBy: 'u-proc', createdAt: '2026-10-20T12:00:00Z' },
    { id: 'c-wseller', profileId: null, contactType: 'buyer_seller', firstName: 'Walt', lastName: 'Willow-Seller', email: 'walt.willow-seller@example.test', phone: '410-555-0166', company: '', createdBy: 'u-proc', createdAt: '2026-10-20T12:00:00Z' },
    { id: 'c-hoa1', profileId: null, contactType: null, firstName: 'Hank', lastName: 'Hoa-Manager', email: 'hank.hoa@example.test', phone: '410-555-0122', company: 'Maple Ridge HOA (fake)', createdBy: 'u-proc', createdAt: '2026-09-01T12:00:00Z' });
  // TC access comes from TEAMS: a coordinator sees the deals of the agents on their team(s).
  const teams = [{ id: 'team-harbor', name: 'Harbor Realty team', createdBy: 'u-admin', createdAt: '2026-09-01T12:00:00Z' }, { id: 'team-oak', name: 'Oak Street team', createdBy: 'u-admin', createdAt: '2026-09-01T12:00:00Z' }];
  const teamMembers = [{ teamId: 'team-harbor', profileId: 'u-tc', memberRole: 'coordinator', addedAt: '2026-09-01T12:00:00Z' }, { teamId: 'team-harbor', profileId: 'u-bagent', memberRole: 'agent', addedAt: '2026-09-01T12:00:00Z' },
    { teamId: 'team-oak', profileId: 'u-lagent', memberRole: 'agent', addedAt: '2026-09-01T12:00:00Z' },
    { teamId: 'team-harbor', profileId: 'u-multi', memberRole: 'agent', addedAt: '2026-09-01T12:00:00Z' },   // TC sees Morgan's files only where she is an AGENT
    { teamId: 'team-harbor', profileId: 'u-tc2', memberRole: 'coordinator', addedAt: '2026-11-04T12:00:00Z' }];   // Morgan Coordinator reaches Ben's file through the Harbor team (Bianca)   // TC sees Morgan's files only where she is an AGENT
  const deals = [
    { id: 'deal-1', fileNumber: 'MD-26-97183', street: '145 Main Street', city: 'Rockville', state: 'MD', zip: '20850', county: 'Montgomery', transactionType: 'Purchase', stage: 3, status: 'Open',
      openDate: '2026-09-28', closingDate: null, purchasePrice: 485000, loanAmount: 388000, emdAmount: 10000, emdDueDate: '2026-10-03', lenderName: 'Example Home Loans (fake)', lenderContact: 'Linda Lender', lenderEmail: 'linda.lender@example.test', lenderPhone: '410-555-0111',
      notes: 'Fake file. Buyer needs to finish photo ID; closing date request is out to both sides.', processorId: 'u-proc', preprocessorUserId: 'u-preproc', salesPersonId: 'u-sp', createdBy: 'u-proc', createdAt: '2026-09-28T14:00:00Z' },
    { id: 'deal-2', fileNumber: 'MD-26-97201', street: '22 Elm Court', city: 'Bethesda', state: 'MD', zip: '20814', county: 'Montgomery', transactionType: 'Purchase', stage: 0, status: 'Open',
      openDate: '2026-09-28', closingDate: '2026-12-02', purchasePrice: 720000, loanAmount: 540000, emdAmount: null, emdDueDate: null, lenderName: '', lenderContact: '', lenderEmail: '', lenderPhone: '',
      notes: 'Fake file. New order; waiting on contract and EMD.', processorId: 'u-proc', preprocessorUserId: 'u-preproc', salesPersonId: 'u-team', createdBy: 'u-proc', createdAt: '2026-09-28T15:00:00Z' },
    { id: 'deal-3', fileNumber: 'MD-26-96877', street: '9 Harbor Lane', city: 'Annapolis', state: 'MD', zip: '21401', county: 'Anne Arundel', transactionType: 'Purchase', stage: 9, status: 'Closed',
      openDate: '2026-08-10', closingDate: '2026-10-15', purchasePrice: 610000, loanAmount: 450000, emdAmount: 15000, emdDueDate: '2026-08-14', lenderName: 'Example Home Loans (fake)', lenderContact: 'Linda Lender', lenderEmail: 'linda.lender@example.test', lenderPhone: '410-555-0111',
      notes: 'Fake file. Closed and funded. Buyer agent (Gary Gone) was later removed by Admin; his file history is kept.', processorId: 'u-proc', salesPersonId: 'u-sp', createdBy: 'u-proc', createdAt: '2026-08-10T14:00:00Z' },
    { id: 'deal-4', fileNumber: 'MD-26-97240', street: '7 Cedar Way', city: 'Silver Spring', state: 'MD', zip: '20901', county: 'Montgomery', transactionType: 'Purchase', stage: 1, status: 'Open',
      openDate: '2026-10-01', closingDate: '2026-12-10', purchasePrice: 455000, loanAmount: 364000, emdAmount: 5000, emdDueDate: '2026-11-05', lenderName: '', lenderContact: '', lenderEmail: '', lenderPhone: '',
      notes: 'Fake file. The buyer (Alex Agent-Buyer) is a licensed agent representing himself: licensee disclosure required.', processorId: 'u-proc', salesPersonId: 'u-team', createdBy: 'u-proc', createdAt: '2026-10-01T14:00:00Z' },
    // John, Nov 4: the same two agents on OPPOSITE sides of Ben's file: here Larry is the Buyer's Agent and Bianca the Listing Agent.
    { id: 'deal-5', fileNumber: 'MD-26-97262', street: '18 Willow Drive', city: 'Gaithersburg', state: 'MD', zip: '20878', county: 'Montgomery', transactionType: 'Purchase', stage: 1, status: 'Open',
      openDate: '2026-10-20', closingDate: '2026-12-15', purchasePrice: 532000, loanAmount: 425600, emdAmount: 8000, emdDueDate: '2026-11-10', lenderName: '', lenderContact: '', lenderEmail: '', lenderPhone: '',
      notes: 'Fake file. Bianca Buyer-Agent lists it and Larry Listing-Agent brings the buyer (the reverse of 145 Main Street).', processorId: 'u-proc', salesPersonId: 'u-sp', createdBy: 'u-proc', createdAt: '2026-10-20T14:00:00Z' },
  ];
  const participants = [];
  const link = (n, cid, role) => participants.push({ id: participants.some((z) => z.id === `dp-${n}-${cid.slice(2)}`) ? `dp-${n}-${cid.slice(2)}-${role.toLowerCase().replace(/[^a-z]/g, '')}` : `dp-${n}-${cid.slice(2)}`, dealId: `deal-${n}`, contactId: cid, role, createdAt: deals[n - 1].createdAt });
  [1, 2].forEach((n) => { link(n, 'c-proc', 'Processor'); link(n, 'c-preproc', 'Preprocessor'); link(n, 'c-sp', 'Sales Person'); link(n, 'c-team', 'Sales Team'); link(n, 'c-tc', 'Transaction Coordinator');
    link(n, 'c-bagent', 'Buyer Agent'); link(n, 'c-lagent', 'Listing Agent'); link(n, 'c-buyer', 'Client-Buyer'); link(n, 'c-seller', 'Client-Seller'); });
  link(1, 'c-tc2', 'Transaction Coordinator');   // John, Nov 4: Morgan Coordinator is the TC on Ben's file (Terry stays on too; Bianca stays its Buyer Agent)
  link(1, 'c-lender1', 'Lender'); link(1, 'c-hoa1', 'HOA');
  link(1, 'c-multi', 'Buyer Agent');    // Morgan: co-buyer's agent with Bianca on deal 1 ...
  link(2, 'c-multi', 'Client-Buyer');   // ... and a co-buyer (her own purchase) on deal 2
  link(3, 'c-proc', 'Processor'); link(3, 'c-sp', 'Sales Person'); link(3, 'c-gone', 'Buyer Agent'); link(3, 'c-lagent', 'Listing Agent');
  // deal 4: Alex is BOTH the buyer and the buyer's agent (self-represented). Seller side has no portal logins.
  link(4, 'c-proc', 'Processor'); link(4, 'c-team', 'Sales Team'); link(4, 'c-selfrep', 'Client-Buyer'); link(4, 'c-selfrep', 'Buyer Agent');
  link(4, 'c-cora', 'Client-Seller'); link(4, 'c-lena', 'Listing Agent');
  // deal 5 (John, Nov 4): agents swap sides vs deal 1. Clients have no portal logins. Morgan Coordinator is the TC.
  link(5, 'c-proc', 'Processor'); link(5, 'c-sp', 'Sales Person'); link(5, 'c-tc2', 'Transaction Coordinator');
  link(5, 'c-lagent', 'Buyer Agent'); link(5, 'c-bagent', 'Listing Agent'); link(5, 'c-wbuyer', 'Client-Buyer'); link(5, 'c-wseller', 'Client-Seller');
  link(3, 'c-buyer', 'Client-Buyer'); link(3, 'c-seller', 'Client-Seller'); link(3, 'c-lender1', 'Lender');

  const taskTemplates = TEMPLATE_DEFS.map((t) => ({ id: `tt-${t.code}-v${t.version}`, ...JSON.parse(JSON.stringify(t)),
    active: !TEMPLATE_DEFS.some((o) => o.code === t.code && o.version > t.version), publishedBy: 'u-admin', publishedAt: t.version > 1 ? '2026-09-20T12:00:00Z' : '2026-08-01T12:00:00Z' }));
  const tasks = [];
  const copy = (n, code, version, role, status, formData = {}, cid = null) => {
    const t = taskTemplates.find((z) => z.code === code && z.version === version); const p = participants.find((z) => z.dealId === `deal-${n}` && z.role === role && (!cid || z.contactId === cid));
    const done = status === 'done';
    tasks.push({ id: `t-${n}-${code}-${p.contactId.slice(2)}`, dealId: `deal-${n}`, participantId: p.id, templateId: t.id, templateCode: code, templateVersion: version, kind: 'form',
      title: t.title, description: t.description, assignedRole: role, status, dueDate: addDays(deals[n - 1].openDate, t.dueDays), formData, savedAt: Object.keys(formData).length ? '2026-10-05T15:00:00Z' : null, savedBy: Object.keys(formData).length ? p.contactId.replace('c-', 'u-') : null,
      completedAt: done ? '2026-10-06T15:00:00Z' : null, completedBy: done ? (participants.find((z) => z.id === p.id).contactId.replace('c-', 'u-')) : null, createdBy: 'u-proc', createdAt: deals[n - 1].createdAt });
  };
  const adhoc = (id, n, title, role, status, due, desc = '') => tasks.push({ id, dealId: `deal-${n}`, participantId: null, templateId: null, templateCode: null, templateVersion: null, kind: 'simple',
    title, description: desc, assignedRole: role, status, dueDate: due, formData: {}, savedAt: null, savedBy: null, completedAt: status === 'done' ? '2026-10-10T15:00:00Z' : null, completedBy: status === 'done' ? 'u-proc' : null, createdBy: 'u-proc', createdAt: deals[n - 1].createdAt });
  const benInfo = { full_name: 'Ben Buyer', email: 'ben.buyer@example.test', cell_phone: '301-555-0107', current_address: '1 Sample Road, Gaithersburg, MD 20878', marital_status: 'Single', attending_closing: 'Yes', settlement_type: 'In person' };
  const sallyInfo = { full_name: 'Sally Seller', email: 'sally.seller@example.test', cell_phone: '301-555-0108', current_address: '145 Main Street, Rockville, MD 20850', marital_status: 'Married', attending_closing: 'Yes', settlement_type: 'Online' };
  // deal 1: a mix of states
  copy(1, 'id_upload', 1, 'Client-Buyer', 'in_progress', { id_type: "Driver's license" }); copy(1, 'personal_info', 2, 'Client-Buyer', 'done', benInfo);
  copy(1, 'title_vesting', 1, 'Client-Buyer', 'todo'); copy(1, 'lender_info', 1, 'Client-Buyer', 'done', { company: 'Example Home Loans (fake)', officer_name: 'Linda Lender', officer_email: 'linda.lender@example.test', officer_phone: '410-555-0111', loan_type: 'Conventional' });
  copy(1, 'home_warranty', 1, 'Client-Buyer', 'todo'); copy(1, 'id_upload', 1, 'Client-Seller', 'todo'); copy(1, 'personal_info', 2, 'Client-Seller', 'done', sallyInfo);
  copy(1, 'hoa_info', 1, 'Client-Seller', 'done', { association_name: 'Maple Ridge HOA (fake)', assoc_type: 'HOA', contact_name: 'Hank Hoa-Manager', contact_email: 'hank.hoa@example.test', dues_amount: '85', payment_schedule: 'Monthly' });
  copy(1, 'mortgage_info', 1, 'Client-Seller', 'in_progress', { lender_name: 'Sample Savings Bank (fake)' }); copy(1, 'home_warranty', 2, 'Client-Seller', 'todo'); copy(1, 'commissions', 1, 'Buyer Agent', 'todo');
  copy(1, 'commissions', 1, 'Listing Agent', 'done', { brokerage: 'Oak Street Realty (fake)', license_id: 'FAKE-0606', commission_amount: '14550', paid_by: 'Seller' });
  adhoc('t-1-hoa-cert', 1, 'Order HOA resale certificate', 'Processor', 'done', '2026-10-10'); adhoc('t-1-sched', 1, 'Confirm closing appointment', 'Transaction Coordinator', 'todo', '2026-11-10');
  // deal 2: brand new
  ['id_upload', 'title_vesting', 'lender_info', 'home_warranty'].forEach((c) => copy(2, c, 1, 'Client-Buyer', 'todo')); copy(2, 'personal_info', 2, 'Client-Buyer', 'todo');
  ['id_upload', 'hoa_info', 'mortgage_info'].forEach((c) => copy(2, c, 1, 'Client-Seller', 'todo')); copy(2, 'personal_info', 2, 'Client-Seller', 'todo');
  copy(2, 'home_warranty', 2, 'Client-Seller', 'todo');
  ['id_upload', 'title_vesting', 'lender_info', 'home_warranty'].forEach((c) => copy(2, c, 1, 'Client-Buyer', 'todo', {}, 'c-multi')); copy(2, 'personal_info', 2, 'Client-Buyer', 'todo', {}, 'c-multi');
  copy(2, 'commissions', 1, 'Buyer Agent', 'todo'); copy(2, 'commissions', 1, 'Listing Agent', 'todo');
  copy(5, 'commissions', 1, 'Buyer Agent', 'todo'); copy(5, 'commissions', 1, 'Listing Agent', 'todo');   // Nov 4: Larry (buyer's agent) / Bianca (listing agent) on Willow Drive
  adhoc('t-2-contract', 2, 'Collect executed contract', 'Processor', 'todo', '2026-10-30'); adhoc('t-2-emd', 2, 'Earnest money deposit receipt', 'Client-Buyer', 'todo', '2026-10-24', 'Upload the EMD receipt.');
  // deal 4: Alex's client copies + his agent copy, one list on one file
  ['id_upload', 'title_vesting', 'home_warranty'].forEach((c) => copy(4, c, 1, 'Client-Buyer', 'todo')); copy(4, 'personal_info', 2, 'Client-Buyer', 'todo');
  copy(4, 'lender_info', 1, 'Client-Buyer', 'in_progress', { company: 'Example Home Loans (fake)' }); copy(4, 'commissions', 1, 'Buyer Agent', 'todo');
  ['id_upload', 'hoa_info', 'mortgage_info'].forEach((c) => copy(4, c, 1, 'Client-Seller', 'todo')); copy(4, 'personal_info', 2, 'Client-Seller', 'todo');
  adhoc('t-4-emd', 4, 'Earnest money deposit receipt', 'Client-Buyer', 'todo', '2026-11-05', 'Upload the EMD receipt.');
  // deal 3: closed; personal info used the OLDER template version 1
  copy(3, 'personal_info', 1, 'Client-Buyer', 'done', { ...benInfo, settlement_type: undefined }); copy(3, 'personal_info', 1, 'Client-Seller', 'done', { ...sallyInfo, settlement_type: undefined });
  copy(3, 'commissions', 1, 'Buyer Agent', 'done', { brokerage: 'Harbor Realty (fake)', license_id: 'FAKE-1010', commission_amount: '15250', paid_by: 'Seller' });
  adhoc('t-3-deed', 3, 'Record deed', 'Processor', 'done', '2026-10-16'); adhoc('t-3-disburse', 3, 'Disburse funds', 'Processor', 'done', '2026-10-15');
  // Matt, Oct 31: seller forwarding address + proceeds questions (migration 14)
  [1, 2].forEach((n) => { copy(n, 'forwarding_address', 1, 'Client-Seller', 'todo'); copy(n, 'seller_proceeds', 1, 'Client-Seller', 'todo'); });
  copy(4, 'forwarding_address', 1, 'Client-Seller', 'todo'); copy(4, 'seller_proceeds', 1, 'Client-Seller', 'todo');
  // Matt, Nov 2: the 7 Cedar Way seller side (no portal logins yet) was only just engaged, so their items are not due yet (shows 'not yet due' on the task grid)
  tasks.filter((t) => t.dealId === 'deal-4' && t.assignedRole === 'Client-Seller').forEach((t) => { t.dueDate = '2026-11-20'; });
  // Matt, Nov 2: more for Terry Coordinator (TC) to work on. He sees deal-1 and deal-2 through the Harbor Realty team (Bianca / Morgan are buyer's agents there).
  adhoc('t-1-tc-id', 1, 'Chase buyer photo ID', 'Transaction Coordinator', 'todo', '2026-10-30', 'Ben still needs to finish the photo ID upload.');
  adhoc('t-1-tc-loan', 1, 'Confirm loan commitment with lender', 'Transaction Coordinator', 'in_progress', '2026-11-12', 'Fake lender: Example Home Loans.');
  adhoc('t-2-tc-contract', 2, 'Get fully executed contract to CLA', 'Transaction Coordinator', 'done', '2026-10-05');
  adhoc('t-2-tc-hoa', 2, 'Request HOA documents from listing agent', 'Transaction Coordinator', 'todo', '2026-11-20');
  adhoc('t-2-ba-addendum', 2, 'Upload financing addendum', 'Buyer Agent', 'todo', '2026-10-31', 'Signed financing contingency addendum.');
  adhoc('t-1-la-repairs', 1, 'Upload repair addendum', 'Listing Agent', 'done', '2026-10-20');
  tasks.forEach((t) => Object.keys(t.formData).forEach((k) => t.formData[k] === undefined && delete t.formData[k]));
  // John, Nov 2: clients linked to salespeople (many-to-many). Ben -> Sam; Sally -> Sam + Tina. The link does not change who can see which file.
  const clientSalesReps = [{ clientId: 'u-buyer', salesId: 'u-sp', createdBy: 'u-admin', createdAt: '2026-10-01T12:00:00Z' },
    { clientId: 'u-seller', salesId: 'u-sp', createdBy: 'u-admin', createdAt: '2026-10-01T12:00:00Z' }, { clientId: 'u-seller', salesId: 'u-team', createdBy: 'u-admin', createdAt: '2026-10-01T12:00:00Z' }];
  // John, Nov 2 (migration 19): a file can have several salespeople (deal_sales_people). The old single salesPersonId moves into the join list;
  // MD-26-97183 also gets Tina (Sales Team) so the demo shows two names.
  const dealSalesPeople = deals.filter((q) => q.salesPersonId).map((q) => ({ dealId: q.id, salesId: q.salesPersonId, addedBy: 'u-proc', addedAt: q.createdAt }));
  dealSalesPeople.push({ dealId: 'deal-1', salesId: 'u-team', addedBy: 'u-proc', addedAt: '2026-09-28T14:05:00Z' });
  deals.forEach((q) => { delete q.salesPersonId; });
  // Matt, Nov 3: open (untouched) personal info / title vesting copies use the new versions (POA follow-ups, entity, seller-only settlement type, vesting help)
  const seed = { version: 2, seq: 100, profiles, contacts, teams, teamMembers, deals, participants, taskTemplates, tasks, clientSalesReps, dealSalesPeople, ...crm(contacts), ...more(deals) };
  applyNov3Templates(seed); applyNov3bTemplates(seed); ensureEmailTemplates(seed); return seed;   // Nov 3: + 3 fake CRM email templates, 4 shared folders, 2 signatures
}

function more(deals) {
  const folders = [
    { id: 'f-lib-wire', scope: 'library', dealId: null, name: 'Wire safety', staffOnly: false, createdBy: 'u-admin', createdAt: '2026-08-01T12:00:00Z' },
    { id: 'f-lib-forms', scope: 'library', dealId: null, name: 'Forms & checklists', staffOnly: false, createdBy: 'u-admin', createdAt: '2026-08-01T12:00:00Z' },
    { id: 'f-lib-staff', scope: 'library', dealId: null, name: 'Internal procedures (staff)', staffOnly: true, createdBy: 'u-admin', createdAt: '2026-08-01T12:00:00Z' },
  ];
  deals.forEach((d, i) => DEAL_FOLDERS.forEach((name, j) => folders.push({ id: `f-${i + 1}-${j + 1}`, scope: 'deal', dealId: d.id, name, staffOnly: false, createdBy: 'u-proc', createdAt: d.createdAt })));
  const D = (id, dealId, folderId, name, desc, by, vis, size, at = '2026-10-10T15:00:00Z') => ({ id, dealId, folderId, name, description: desc, mimeType: name.endsWith('.pdf') ? 'application/pdf' : 'text/plain', size, dataUrl: null, uploadedBy: by, visibility: vis, createdAt: at });
  const documents = [
    D('doc-1', 'deal-1', 'f-1-1', 'Purchase Contract (fake).pdf', 'Fully executed contract', 'u-lagent', 'all', 182340),
    D('doc-2', 'deal-1', 'f-1-4', 'HOA Resale Certificate (fake).pdf', 'HOA docs (fake)', 'u-lagent', 'all', 96120),
    D('doc-3', 'deal-1', 'f-1-3', 'Buyer Pre-Approval (fake).pdf', 'Lender pre-approval letter', 'u-bagent', 'buyer', 48200),
    D('doc-4', 'deal-1', 'f-1-3', 'Seller Payoff Request (fake).pdf', 'Seller side only', 'u-seller', 'seller', 30114),
    D('doc-5', 'deal-1', null, 'Processor Checklist (fake).txt', 'Internal staff note', 'u-proc', 'staff', 1200),
    D('doc-6', 'deal-2', 'f-2-1', 'Draft Contract (fake).pdf', 'Awaiting signatures', 'u-bagent', 'all', 150000),
    D('doc-7', 'deal-3', 'f-3-5', 'Final Settlement Statement (fake).pdf', 'Closed file', 'u-proc', 'all', 120000),
    D('doc-8', 'deal-3', 'f-3-1', 'Buyer Agent Addendum (fake).pdf', 'Uploaded by a user who was later removed', 'u-gone', 'all', 64000, '2026-09-01T15:00:00Z'),
    D('doc-lib-1', null, 'f-lib-wire', 'Wire Fraud Warning (fake).pdf', 'Read before sending any money', 'u-admin', 'all', 52000, '2026-08-01T12:00:00Z'),
    D('doc-lib-2', null, 'f-lib-forms', 'Buyer Closing Checklist (fake).pdf', 'What to bring to closing', 'u-admin', 'all', 41000, '2026-08-01T12:00:00Z'),
    D('doc-lib-3', null, 'f-lib-forms', 'Seller Closing Checklist (fake).pdf', 'What sellers need', 'u-admin', 'all', 39000, '2026-08-01T12:00:00Z'),
    D('doc-lib-4', null, 'f-lib-staff', 'Processor Procedures (fake).txt', 'Staff only', 'u-admin', 'staff', 8000, '2026-08-01T12:00:00Z'),
  ];
  const threads = [
    { id: 'th-1', dealId: 'deal-1', subject: 'Welcome - 145 Main Street (MD-26-97183)', createdBy: 'u-proc', createdAt: '2026-09-28T16:30:00Z', participantIds: ['u-proc', 'u-sp', 'u-tc', 'u-bagent', 'u-buyer'] },
    { id: 'th-2', dealId: 'deal-1', subject: 'Seller side - payoff and HOA', createdBy: 'u-proc', createdAt: '2026-10-02T13:00:00Z', participantIds: ['u-proc', 'u-lagent', 'u-seller'] },
    { id: 'th-3', dealId: 'deal-2', subject: 'Welcome - 22 Elm Court (MD-26-97201)', createdBy: 'u-proc', createdAt: '2026-09-28T17:00:00Z', participantIds: ['u-proc', 'u-bagent', 'u-buyer'] },
    { id: 'th-4', dealId: 'deal-3', subject: 'Closing wrap-up', createdBy: 'u-proc', createdAt: '2026-10-14T13:00:00Z', participantIds: ['u-proc', 'u-gone', 'u-buyer'] },
  ];
  const messages = [
    { id: 'm-1', threadId: 'th-1', authorId: 'u-proc', body: 'Welcome! This is the thread for the Main Street purchase. Ben, please upload your photo ID when you can.', createdAt: '2026-09-28T16:30:00Z' },
    { id: 'm-2', threadId: 'th-1', authorId: 'u-buyer', body: 'Thanks Paula, I will do it this week.', createdAt: '2026-10-28T10:15:00Z' },
    { id: 'm-3', threadId: 'th-2', authorId: 'u-proc', body: 'Sally, can you send the payoff request and the HOA contact?', createdAt: '2026-10-02T13:00:00Z' },
    { id: 'm-4', threadId: 'th-2', authorId: 'u-lagent', body: 'HOA docs are uploaded in Documents. Payoff request coming from Sally.', createdAt: '2026-10-02T14:20:00Z' },
    { id: 'm-5', threadId: 'th-3', authorId: 'u-proc', body: 'Welcome to the Elm Court file. We are waiting on the signed contract and EMD.', createdAt: '2026-09-28T17:00:00Z' },
    { id: 'm-6', threadId: 'th-4', authorId: 'u-gone', body: 'Addendum is uploaded. Thanks all!', createdAt: '2026-10-14T14:00:00Z' },
  ];
  const reads = [{ threadId: 'th-1', profileId: 'u-proc', at: '2026-10-01T00:00:00Z' }, { threadId: 'th-2', profileId: 'u-proc', at: '2026-10-02T14:20:00Z' }, { threadId: 'th-3', profileId: 'u-proc', at: '2026-10-28T00:00:00Z' }, { threadId: 'th-4', profileId: 'u-proc', at: '2026-10-28T00:00:00Z' }];
  const A = (id, dealId, actorId, action, entity, entityId, detail, createdAt) => ({ id, dealId, actorId, action, entity, entityId, detail, createdAt });
  const activity = [
    A('a-1', 'deal-1', 'u-proc', 'deal.created', 'deal', 'deal-1', 'Order MD-26-97183 opened', '2026-09-28T14:00:00Z'),
    A('a-2', 'deal-1', 'u-lagent', 'document.uploaded', 'document', 'doc-2', 'Uploaded HOA Resale Certificate (fake).pdf', '2026-10-10T15:00:00Z'),
    A('a-3', 'deal-1', 'u-buyer', 'task.completed', 'task', 't-1-personal_info-buyer', 'Personal information: completed', '2026-10-06T15:00:00Z'),
    A('a-4', 'deal-1', 'u-proc', 'stage.changed', 'deal', 'deal-1', 'Stage set to Schedule Closing', '2026-10-20T15:00:00Z'),
    A('a-5', 'deal-1', 'u-proc', 'settlement.requested', 'settlement', 's-1', 'Closing date request sent with 3 options', '2026-10-21T14:00:00Z'),
    A('a-6', 'deal-1', 'u-buyer', 'settlement.responded', 'settlement', 's-1', 'Buyer side picked 2 option(s)', '2026-10-22T09:00:00Z'),
    A('a-7', 'deal-3', 'u-gone', 'document.uploaded', 'document', 'doc-8', 'Uploaded Buyer Agent Addendum (fake).pdf', '2026-09-01T15:00:00Z'),
    A('a-8', 'deal-3', 'u-proc', 'settlement.confirmed', 'settlement', 's-2', 'Closing confirmed for 2026-10-15 10:00', '2026-10-08T14:00:00Z'),
    A('a-9', 'deal-3', 'u-proc', 'stage.changed', 'deal', 'deal-3', 'Stage set to Disbursed Funds', '2026-10-15T20:00:00Z'),
    A('a-10', null, 'u-admin', 'user.removed', 'user', 'u-gone', 'Removed user Gary Gone (documents, messages and history kept)', '2026-10-20T15:00:00Z'),
  ];
  const N = (id, profileId, kind, dealId, title, link, createdAt, readAt = null) => ({ id, profileId, kind, dealId, title, link, createdAt, readAt });
  const notifications = [
    N('n-1', 'u-proc', 'message', 'deal-1', 'New message from Ben Buyer: Welcome - 145 Main Street', '#/deals/deal-1/inbox', '2026-10-28T10:15:00Z'),
    N('n-2', 'u-proc', 'settlement', 'deal-1', 'Buyer side answered the closing date request', '#/deals/deal-1/closing', '2026-10-22T09:00:00Z'),
    N('n-3', 'u-proc', 'document', 'deal-1', 'Larry Listing-Agent uploaded HOA Resale Certificate (fake).pdf', '#/deals/deal-1/documents', '2026-10-10T15:00:00Z', '2026-10-11T12:00:00Z'),
    N('n-4', 'u-buyer', 'task', 'deal-1', 'Task waiting for you: Title vesting', '#/deals/deal-1/tasks', '2026-09-28T16:00:00Z'),
    N('n-5', 'u-seller', 'settlement', 'deal-1', 'Please pick a closing time for 145 Main Street', '#/deals/deal-1/closing', '2026-10-21T14:00:00Z'),
    N('n-6', 'u-bagent', 'settlement', 'deal-1', 'Closing date request sent for 145 Main Street', '#/deals/deal-1/closing', '2026-10-21T14:00:00Z'),
    N('n-7', 'u-tc', 'task', 'deal-1', 'New task: Chase buyer photo ID', '#/deals/deal-1/tasks', '2026-10-27T13:00:00Z'),
    N('n-8', 'u-tc', 'message', 'deal-1', 'New message from Ben Buyer: Welcome - 145 Main Street', '#/deals/deal-1/inbox', '2026-10-28T10:15:00Z'),
    N('n-9', 'u-tc', 'task', 'deal-2', 'New task: Request HOA documents from listing agent', '#/deals/deal-2/tasks', '2026-10-29T13:00:00Z'),
  ];
  const settlements = [
    { id: 's-1', dealId: 'deal-1', status: 'open', round: 1, slots: ['2026-11-17T10:00', '2026-11-18T14:00', '2026-11-19T11:00'], location: 'CLA Title office, Rockville (fake)', note: 'Please pick every time that works for your side.',
      tokens: { buyer: 'demo-buyer-7f3c9a1e5d', seller: 'demo-seller-2b8d4e6f0a' }, confirmedSlot: null, createdBy: 'u-proc', createdAt: '2026-10-21T14:00:00Z', confirmedAt: null, history: [] },
    { id: 's-2', dealId: 'deal-3', status: 'confirmed', round: 1, slots: ['2026-10-15T10:00', '2026-10-16T13:00'], location: 'CLA Title office, Annapolis (fake)', note: '',
      tokens: { buyer: 'demo-buyer-closed-11aa22', seller: 'demo-seller-closed-33bb44' }, confirmedSlot: 0, createdBy: 'u-proc', createdAt: '2026-10-01T14:00:00Z', confirmedAt: '2026-10-08T14:00:00Z', history: [] },
  ];
  const settlementResponses = [
    { id: 'sr-1', settlementId: 's-1', round: 1, side: 'buyer', picks: [1, 2], note: 'Afternoons are best for us.', respondedBy: 'u-buyer', responderName: 'Ben Buyer', at: '2026-10-22T09:00:00Z' },
    { id: 'sr-2', settlementId: 's-2', round: 1, side: 'buyer', picks: [0], note: '', respondedBy: 'u-buyer', responderName: 'Ben Buyer', at: '2026-10-03T09:00:00Z' },
    { id: 'sr-3', settlementId: 's-2', round: 1, side: 'seller', picks: [0, 1], note: '', respondedBy: 'u-seller', responderName: 'Sally Seller', at: '2026-10-04T09:00:00Z' },
  ];
  // Matt, Oct 31 (priority 2): agreement acknowledgements, closing proposals, e-sign requests. FAKE.
  const agreementAcks = [{ id: 'ack-1', dealId: 'deal-1', code: 'wire_fraud', version: 1, profileId: 'u-buyer', roleLabel: 'Client-Buyer', at: '2026-10-06T14:00:00Z' }];
  const closingProposals = [{ id: 'cp-1', dealId: 'deal-1', side: 'seller', proposedBy: 'u-lagent', roleLabel: 'Listing Agent', at: '2026-11-19T11:00', location: 'CLA Title office', note: 'Sally prefers late morning.', status: 'proposed', createdAt: '2026-10-23T14:00:00Z' }];
  return { folders, documents, threads, messages, reads, activity, notifications, settlements, settlementResponses, outbox: [], agreementAcks, closingProposals, signatureRequests: [] };
}

// CRM (John, Nov 2). FAKE DATA ONLY: fictional brokerages / lenders / leads, example.test emails, 555 phones. Adds CRM fields to the portal's
// own contacts (no parallel people table) and returns the CRM-only tables. Owners are the fake salespeople Sam (u-sp) and Tina (u-team).
function crm(contacts) {
  const T = '2026-10-01T12:00:00Z';
  const crmAccounts = [
    { id: 'acc-harbor', name: 'Harbor Realty (fake)', kind: 'brokerage', phone: '301-555-0170', website: 'harbor-realty.example.test', city: 'Rockville', state: 'MD', ownerId: 'u-sp', notes: 'Biggest referral source. Fake.', archivedAt: null, createdBy: 'u-admin', createdAt: T },
    { id: 'acc-oak', name: 'Oak Street Realty (fake)', kind: 'brokerage', phone: '301-555-0171', website: '', city: 'Bethesda', state: 'MD', ownerId: 'u-team', notes: '', archivedAt: null, createdBy: 'u-admin', createdAt: T },
    { id: 'acc-bayview', name: 'Bayview Realty (fake)', kind: 'brokerage', phone: '410-555-0172', website: '', city: 'Annapolis', state: 'MD', ownerId: 'u-sp', notes: '', archivedAt: null, createdBy: 'u-admin', createdAt: T },
    { id: 'acc-ehl', name: 'Example Home Loans (fake)', kind: 'lender', phone: '410-555-0173', website: 'example-home-loans.example.test', city: 'Baltimore', state: 'MD', ownerId: 'u-team', notes: '', archivedAt: null, createdBy: 'u-admin', createdAt: T },
    { id: 'acc-summit', name: 'Summit Mortgage (fake)', kind: 'lender', phone: '', website: '', city: 'Columbia', state: 'MD', ownerId: 'u-sp', notes: 'Prospect lender.', archivedAt: null, createdBy: 'u-admin', createdAt: T },
    { id: 'acc-old', name: 'Old Town Brokers (fake)', kind: 'brokerage', phone: '', website: '', city: 'Frederick', state: 'MD', ownerId: 'u-team', notes: 'Closed their office. Archived, never deleted.', archivedAt: '2026-10-20T12:00:00Z', createdBy: 'u-admin', createdAt: T },
  ];
  const F = { // contact id: [owner, account, stage, last contacted, tags]
    'c-bagent': ['u-sp', 'acc-harbor', 'active_partner', '2026-10-28', ['top producer']], 'c-multi': ['u-sp', 'acc-harbor', 'prospect', '2026-10-12', []],
    'c-selfrep': [null, 'acc-harbor', 'prospect', null, []], 'c-gone': [null, 'acc-harbor', 'inactive', '2026-08-30', []],
    'c-lagent': ['u-team', 'acc-oak', 'active_partner', '2026-10-15', ['listing specialist']], 'c-lena': ['u-sp', 'acc-bayview', 'prospect', null, ['new agent']],
    'c-lender1': ['u-team', 'acc-ehl', 'active_partner', '2026-10-21', ['preferred lender']], 'c-buyer': ['u-sp', null, 'active_partner', '2026-10-28', ['past client']],
    'c-seller': [null, null, 'prospect', null, []], 'c-cora': [null, null, 'prospect', null, []], 'c-hoa1': [null, null, null, null, []] };
  contacts.forEach((c) => { const v = F[c.id] || [null, null, null, null, []];
    Object.assign(c, { crmOwnerId: v[0], accountId: v[1], crmStage: v[2], lastContactedOn: v[3], tags: v[4], crmNotes: '', crmLeadId: null, crmArchivedAt: null }); });
  const L = (id, first, last, company, ct, source, status, ownerId, createdAt, notes = '') => ({ id, firstName: first, lastName: last, company, email: `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.test',
    phone: '', contactType: ct, source, status, ownerId, notes, convertedAt: null, convertedContactId: null, convertedAccountId: null, archivedAt: null, createdBy: ownerId || 'u-admin', createdAt });
  const crmLeads = [
    L('lead-1', 'Rachel', 'Realtor-Lead', 'Coastal Homes (fake)', 'realtor', 'Referral', 'New', 'u-sp', '2026-10-25T14:00:00Z', 'Referred by Bianca. Does ~20 deals a year (fake).'),
    L('lead-2', 'Marco', 'Mortgage-Lead', 'Summit Mortgage (fake)', 'lender', 'Event', 'Contacted', 'u-sp', '2026-10-10T14:00:00Z'),
    L('lead-3', 'Nina', 'Newagent', 'Bayview Realty (fake)', 'realtor', 'Website', 'Qualified', 'u-team', '2026-10-05T14:00:00Z'),
    L('lead-4', 'Victor', 'Vendor', '', 'buyer_seller', 'Cold call', 'Unqualified', 'u-team', '2026-09-15T14:00:00Z'),
    L('lead-5', 'Olivia', 'Openhouse', 'Harbor Realty (fake)', 'realtor', 'Open house', 'New', null, '2026-10-30T14:00:00Z', 'Not assigned yet.'),
    L('lead-6', 'Paul', 'Pastclient', '', 'buyer_seller', 'Past client', 'Contacted', 'u-sp', '2026-09-20T14:00:00Z'),
  ];
  crmLeads[1].phone = '410-555-0180';
  const O = (id, name, stage, contactId, accountId, ownerId, estVolume, expectedClose) => ({ id, name, stage, contactId, accountId, ownerId, estVolume, expectedClose, notes: '', archivedAt: null, createdBy: 'u-admin', createdAt: T });
  const crmOpportunities = [
    O('opp-1', 'Harbor Realty: monthly referrals', 'Won', 'c-bagent', 'acc-harbor', 'u-sp', 2400000, '2026-09-30'),
    O('opp-2', 'Bayview Realty: onboard Lena', 'Meeting set', 'c-lena', 'acc-bayview', 'u-sp', 900000, '2026-11-30'),
    O('opp-3', 'Summit Mortgage partnership', 'Proposal', null, 'acc-summit', 'u-sp', 1500000, '2026-12-15'),
    O('opp-4', 'Oak Street: listing referrals', 'New', 'c-lagent', 'acc-oak', 'u-team', 1200000, '2027-01-15'),
    O('opp-5', 'Example Home Loans co-marketing', 'Lost', 'c-lender1', 'acc-ehl', 'u-team', 600000, '2026-10-15'),
  ];
  const A = (id, entity, entityId, kind, subject, ownerId, extra = {}) => ({ id, entity, entityId, kind, subject, body: '', status: kind === 'task' ? 'open' : 'done', dueDate: null, occurredOn: kind === 'task' ? null : '2026-10-28',
    ownerId, system: false, createdBy: ownerId || 'u-admin', createdAt: '2026-10-28T15:00:00Z', doneAt: kind === 'task' ? null : '2026-10-28T15:00:00Z', ...extra });
  const crmActivities = [
    A('ca-1', 'contact', 'c-bagent', 'call', 'Quarterly check-in call', 'u-sp', { body: 'Two new buyers coming in November (fake).' }),
    A('ca-2', 'contact', 'c-bagent', 'task', 'Send November rate sheet', 'u-sp', { dueDate: '2026-10-30' }),   // overdue
    A('ca-3', 'lead', 'lead-1', 'task', 'Intro call with Rachel', 'u-sp', { dueDate: '2026-11-20' }),
    A('ca-4', 'lead', 'lead-2', 'email', 'Sent intro email (logged only, nothing sent)', 'u-sp', { occurredOn: '2026-10-11', createdAt: '2026-10-11T15:00:00Z' }),
    A('ca-5', 'account', 'acc-oak', 'meeting', 'Office meeting: title process lunch-and-learn', 'u-team', { occurredOn: '2026-10-15', createdAt: '2026-10-15T15:00:00Z' }),
    A('ca-6', 'contact', 'c-lender1', 'task', 'Follow up on co-marketing', 'u-team', { dueDate: '2026-10-25' }),   // overdue
    A('ca-7', 'opportunity', 'opp-2', 'note', 'Lena wants a demo of the portal', 'u-sp'),
    A('ca-8', 'contact', 'c-lagent', 'task', 'Thank-you card after closing', 'u-team', { dueDate: '2026-10-16', status: 'done', doneAt: '2026-10-16T15:00:00Z' }),
  ];
  // Nov 2 (Zoho match): the same mapping a stored v16 browser gets (Zoho lead sources / relationship status, follow-ups -> tasks), then fake Zoho details
  const out = crmZohoUpgrade({ contacts, crmLeads, crmActivities });
  const Z = { // id: [role in company, title, county, city, extra]
    'c-bagent': ['Realtor', 'Buyer Specialist', 'Montgomery', 'Rockville', { leadSource: 'Existing Client or Agent', agentSplit: 70, licenseNo: 'MD-RE-000101 (fake)', salesVolumeLastYear: 9800000, dealsClosedLastYear: 21,
      mobile: '301-555-0191', zillowUrl: 'https://www.zillow.com/profile/bianca-fake', links: { website: 'https://harbor-realty.example.test/bianca', linkedin: 'https://www.linkedin.com/in/bianca-fake' } }],
    'c-multi': ['Realtor', '', 'Montgomery', 'Bethesda', { leadSource: 'Personal Network' }], 'c-selfrep': ['Realtor', '', 'Montgomery', 'Silver Spring', {}], 'c-gone': ['Realtor', '', 'Anne Arundel', 'Annapolis', {}],
    'c-lagent': ['Team Lead', 'Listing Team Lead', 'Montgomery', 'Bethesda', { leadSource: 'Business Group', assistant: 'Avery Assistant (fake)', asstPhone: '301-555-0192', links: { facebookPage: 'https://www.facebook.com/oak-street-fake' } }],
    'c-lena': ['Realtor', 'Associate Agent', 'Anne Arundel', 'Annapolis', { leadSource: 'Facebook Group', links: { instagram: 'https://www.instagram.com/lena-fake', linktree: 'https://linktr.ee/lena-fake' } }],
    'c-lender1': ['Loan Officer', 'Senior Loan Officer', 'Baltimore', 'Baltimore', { leadSource: 'Warm Call' }], 'c-buyer': ['', '', 'Montgomery', 'Rockville', {}], 'c-seller': ['', '', 'Montgomery', 'Bethesda', {}],
    'c-cora': ['', '', 'Anne Arundel', 'Annapolis', {}] };
  contacts.forEach((c) => { const z = Z[c.id]; if (!z) return; Object.assign(c, { roleInCompany: z[0] || c.roleInCompany, title: z[1], county: z[2], city: z[3], state: 'MD' }, z[4]); });
  const LZ = { 'lead-1': ['Montgomery', { agentSplit: 80, dealsClosedLastYear: 20 }], 'lead-2': ['Howard', { roleInCompany: 'Mortgage Broker', title: 'Branch Manager' }], 'lead-3': ['Anne Arundel', {}],
    'lead-4': ['Frederick', { roleInCompany: 'Real Estate Broker' }], 'lead-5': ['Montgomery', { links: { facebookProfile: 'https://www.facebook.com/olivia-fake' } }], 'lead-6': ['Montgomery', { roleInCompany: 'Transaction Coordinator' }] };
  crmLeads.forEach((l) => { const z = LZ[l.id]; if (z) Object.assign(l, { state: 'MD', county: z[0] }, z[1]); });
  const t = (id) => crmActivities.find((a) => a.id === id);
  Object.assign(t('ca-2'), { priority: 'Highest' }); Object.assign(t('ca-3'), { priority: 'Normal', reminder: true, reminderAt: '2026-11-19T09:00' }); Object.assign(t('ca-6'), { priority: 'High', status: 'In Progress' });
  Object.assign(t('ca-5'), { meetingType: 'Lunch Meeting', location: 'Oak Street Realty office (fake)' });
  // one upcoming meeting (a week from today) so Open Activities / Invited Meetings have something to show. No invitations are ever sent.
  const soon = addDays(new Date().toISOString(), 7);
  crmActivities.push({ id: 'ca-9', entity: 'contact', entityId: 'c-bagent', kind: 'meeting', subject: 'Coffee with Bianca', body: 'Talk about the spring buyer pipeline (fake).', status: 'done', dueDate: null, occurredOn: soon,
    ownerId: 'u-sp', hostId: 'u-sp', allDay: false, startsAt: soon + 'T10:00', endsAt: soon + 'T11:00', location: 'Harbor Coffee (fake)', meetingType: 'Coffee', participants: ['contact:c-bagent', 'contact:c-multi', 'user:u-sp'],
    system: false, createdBy: 'u-sp', createdAt: '2026-10-29T15:00:00Z', doneAt: null, modifiedBy: 'u-sp', modifiedAt: '2026-10-29T15:00:00Z' });
  return { crmAccounts, crmLeads, crmOpportunities, crmActivities, crmAttachments: out.crmAttachments };
}
