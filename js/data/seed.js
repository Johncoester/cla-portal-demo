// FAKE DATA ONLY. Fictional people, example.test addresses, 555 phone numbers. No real clients, no credentials.
import { TEMPLATE_DEFS } from './templates.js';
export const DEAL_FOLDERS = ['Contract & addenda', 'IDs & personal', 'Lender & payoff', 'HOA', 'Closing'];
const addDays = (iso, n) => new Date(Date.parse(iso.slice(0, 10) + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export function buildSeed() {
  const P = (id, first, last, role, n, extra = {}) => ({ id, email: `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.test', firstName: first, lastName: last,
    phone: `301-555-01${String(n).padStart(2, '0')}`, role, isAdmin: false, status: 'active', createdAt: '2026-09-01T12:00:00Z', ...extra });
  const profiles = [
    P('u-proc', 'Paula', 'Processor', 'Sales Processor', 1),
    P('u-sp', 'Sam', 'Salesperson', 'Sales Person', 2),
    P('u-team', 'Tina', 'Salesteam', 'Sales Team', 3),
    P('u-tc', 'Terry', 'Coordinator', 'Transaction Coordinator', 4),
    P('u-bagent', 'Bianca', 'Buyer-Agent', 'Buyer Agent', 5),
    P('u-lagent', 'Larry', 'Listing-Agent', 'Listing Agent', 6),
    P('u-buyer', 'Ben', 'Buyer', 'Client-Buyer', 7),
    P('u-seller', 'Sally', 'Seller', 'Client-Seller', 8),
    P('u-admin', 'Ada', 'Admin', 'Sales Team', 9, { isAdmin: true }),   // Admin = a flag on the account, separate from role
    P('u-gone', 'Gary', 'Gone', 'Buyer Agent', 10, { status: 'removed', removedAt: '2026-10-20T15:00:00Z', removedBy: 'u-admin' }),   // deleted by Admin; history kept
  ];
  const contacts = profiles.map((p) => ({ id: 'c-' + p.id.slice(2), profileId: p.id, firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone,
    company: ({ 'Buyer Agent': 'Harbor Realty (fake)', 'Listing Agent': 'Oak Street Realty (fake)' })[p.role] || (p.role.startsWith('Client') ? '' : 'CLA Title & Escrow'), createdBy: 'u-proc', createdAt: p.createdAt }));
  contacts.push(
    { id: 'c-lender1', profileId: null, firstName: 'Linda', lastName: 'Lender', email: 'linda.lender@example.test', phone: '410-555-0111', company: 'Example Home Loans (fake)', createdBy: 'u-proc', createdAt: '2026-09-01T12:00:00Z' },
    { id: 'c-hoa1', profileId: null, firstName: 'Hank', lastName: 'Hoa-Manager', email: 'hank.hoa@example.test', phone: '410-555-0122', company: 'Maple Ridge HOA (fake)', createdBy: 'u-proc', createdAt: '2026-09-01T12:00:00Z' });
  // TC access comes from TEAMS: a coordinator sees the deals of the agents on their team(s).
  const teams = [{ id: 'team-harbor', name: 'Harbor Realty team', createdBy: 'u-admin', createdAt: '2026-09-01T12:00:00Z' }, { id: 'team-oak', name: 'Oak Street team', createdBy: 'u-admin', createdAt: '2026-09-01T12:00:00Z' }];
  const teamMembers = [{ teamId: 'team-harbor', profileId: 'u-tc', memberRole: 'coordinator', addedAt: '2026-09-01T12:00:00Z' }, { teamId: 'team-harbor', profileId: 'u-bagent', memberRole: 'agent', addedAt: '2026-09-01T12:00:00Z' },
    { teamId: 'team-oak', profileId: 'u-lagent', memberRole: 'agent', addedAt: '2026-09-01T12:00:00Z' }];
  const deals = [
    { id: 'deal-1', fileNumber: 'MD-26-97183', street: '145 Main Street', city: 'Rockville', state: 'MD', zip: '20850', transactionType: 'Purchase', stage: 3, status: 'Open',
      openDate: '2026-09-28', closingDate: null, purchasePrice: 485000, loanAmount: 388000, lenderName: 'Example Home Loans (fake)', lenderContact: 'Linda Lender', lenderEmail: 'linda.lender@example.test', lenderPhone: '410-555-0111',
      notes: 'Fake file. Buyer needs to finish photo ID; closing date request is out to both sides.', processorId: 'u-proc', salesPersonId: 'u-sp', createdBy: 'u-proc', createdAt: '2026-09-28T14:00:00Z' },
    { id: 'deal-2', fileNumber: 'MD-26-97201', street: '22 Elm Court', city: 'Bethesda', state: 'MD', zip: '20814', transactionType: 'Purchase', stage: 0, status: 'Open',
      openDate: '2026-09-28', closingDate: '2026-12-02', purchasePrice: 720000, loanAmount: 540000, lenderName: '', lenderContact: '', lenderEmail: '', lenderPhone: '',
      notes: 'Fake file. New order; waiting on contract and EMD.', processorId: 'u-proc', salesPersonId: 'u-team', createdBy: 'u-proc', createdAt: '2026-09-28T15:00:00Z' },
    { id: 'deal-3', fileNumber: 'MD-26-96877', street: '9 Harbor Lane', city: 'Annapolis', state: 'MD', zip: '21401', transactionType: 'Purchase', stage: 9, status: 'Closed',
      openDate: '2026-08-10', closingDate: '2026-10-15', purchasePrice: 610000, loanAmount: 450000, lenderName: 'Example Home Loans (fake)', lenderContact: 'Linda Lender', lenderEmail: 'linda.lender@example.test', lenderPhone: '410-555-0111',
      notes: 'Fake file. Closed and funded. Buyer agent (Gary Gone) was later removed by Admin; his file history is kept.', processorId: 'u-proc', salesPersonId: 'u-sp', createdBy: 'u-proc', createdAt: '2026-08-10T14:00:00Z' },
  ];
  const participants = [];
  const link = (n, cid, role) => participants.push({ id: `dp-${n}-${cid.slice(2)}`, dealId: `deal-${n}`, contactId: cid, role, createdAt: deals[n - 1].createdAt });
  [1, 2].forEach((n) => { link(n, 'c-proc', 'Sales Processor'); link(n, 'c-sp', 'Sales Person'); link(n, 'c-team', 'Sales Team'); link(n, 'c-tc', 'Transaction Coordinator');
    link(n, 'c-bagent', 'Buyer Agent'); link(n, 'c-lagent', 'Listing Agent'); link(n, 'c-buyer', 'Client-Buyer'); link(n, 'c-seller', 'Client-Seller'); });
  link(1, 'c-lender1', 'Lender'); link(1, 'c-hoa1', 'HOA');
  link(3, 'c-proc', 'Sales Processor'); link(3, 'c-sp', 'Sales Person'); link(3, 'c-gone', 'Buyer Agent'); link(3, 'c-lagent', 'Listing Agent');
  link(3, 'c-buyer', 'Client-Buyer'); link(3, 'c-seller', 'Client-Seller'); link(3, 'c-lender1', 'Lender');

  const taskTemplates = TEMPLATE_DEFS.map((t) => ({ id: `tt-${t.code}-v${t.version}`, ...JSON.parse(JSON.stringify(t)),
    active: !TEMPLATE_DEFS.some((o) => o.code === t.code && o.version > t.version), publishedBy: 'u-admin', publishedAt: t.version > 1 ? '2026-09-20T12:00:00Z' : '2026-08-01T12:00:00Z' }));
  const tasks = [];
  const copy = (n, code, version, role, status, formData = {}) => {
    const t = taskTemplates.find((z) => z.code === code && z.version === version); const p = participants.find((z) => z.dealId === `deal-${n}` && z.role === role);
    const done = status === 'done';
    tasks.push({ id: `t-${n}-${code}-${p.contactId.slice(2)}`, dealId: `deal-${n}`, participantId: p.id, templateId: t.id, templateCode: code, templateVersion: version, kind: 'form',
      title: t.title, description: t.description, assignedRole: role, status, dueDate: addDays(deals[n - 1].openDate, t.dueDays), formData, savedAt: Object.keys(formData).length ? '2026-10-05T15:00:00Z' : null,
      completedAt: done ? '2026-10-06T15:00:00Z' : null, completedBy: done ? (participants.find((z) => z.id === p.id).contactId.replace('c-', 'u-')) : null, createdBy: 'u-proc', createdAt: deals[n - 1].createdAt });
  };
  const adhoc = (id, n, title, role, status, due, desc = '') => tasks.push({ id, dealId: `deal-${n}`, participantId: null, templateId: null, templateCode: null, templateVersion: null, kind: 'simple',
    title, description: desc, assignedRole: role, status, dueDate: due, formData: {}, savedAt: null, completedAt: status === 'done' ? '2026-10-10T15:00:00Z' : null, completedBy: status === 'done' ? 'u-proc' : null, createdBy: 'u-proc', createdAt: deals[n - 1].createdAt });
  const benInfo = { full_name: 'Ben Buyer', email: 'ben.buyer@example.test', cell_phone: '301-555-0107', current_address: '1 Sample Road, Gaithersburg, MD 20878', marital_status: 'Single', attending_closing: 'Yes', settlement_type: 'In person' };
  const sallyInfo = { full_name: 'Sally Seller', email: 'sally.seller@example.test', cell_phone: '301-555-0108', current_address: '145 Main Street, Rockville, MD 20850', marital_status: 'Married', attending_closing: 'Yes', settlement_type: 'Online' };
  // deal 1: a mix of states
  copy(1, 'id_upload', 1, 'Client-Buyer', 'in_progress', { id_type: "Driver's license" }); copy(1, 'personal_info', 2, 'Client-Buyer', 'done', benInfo);
  copy(1, 'title_vesting', 1, 'Client-Buyer', 'todo'); copy(1, 'lender_info', 1, 'Client-Buyer', 'done', { company: 'Example Home Loans (fake)', officer_name: 'Linda Lender', officer_email: 'linda.lender@example.test', officer_phone: '410-555-0111', loan_type: 'Conventional' });
  copy(1, 'home_warranty', 1, 'Client-Buyer', 'todo'); copy(1, 'id_upload', 1, 'Client-Seller', 'todo'); copy(1, 'personal_info', 2, 'Client-Seller', 'done', sallyInfo);
  copy(1, 'hoa_info', 1, 'Client-Seller', 'done', { association_name: 'Maple Ridge HOA (fake)', assoc_type: 'HOA', contact_name: 'Hank Hoa-Manager', contact_email: 'hank.hoa@example.test', dues_amount: '85', payment_schedule: 'Monthly' });
  copy(1, 'mortgage_info', 1, 'Client-Seller', 'in_progress', { lender_name: 'Sample Savings Bank (fake)' }); copy(1, 'commissions', 1, 'Buyer Agent', 'todo');
  copy(1, 'commissions', 1, 'Listing Agent', 'done', { brokerage: 'Oak Street Realty (fake)', license_id: 'FAKE-0606', commission_amount: '14550', paid_by: 'Seller' });
  adhoc('t-1-hoa-cert', 1, 'Order HOA resale certificate', 'Sales Processor', 'done', '2026-10-10'); adhoc('t-1-sched', 1, 'Confirm closing appointment', 'Transaction Coordinator', 'todo', '2026-11-10');
  // deal 2: brand new
  ['id_upload', 'title_vesting', 'lender_info', 'home_warranty'].forEach((c) => copy(2, c, 1, 'Client-Buyer', 'todo')); copy(2, 'personal_info', 2, 'Client-Buyer', 'todo');
  ['id_upload', 'hoa_info', 'mortgage_info'].forEach((c) => copy(2, c, 1, 'Client-Seller', 'todo')); copy(2, 'personal_info', 2, 'Client-Seller', 'todo');
  copy(2, 'commissions', 1, 'Buyer Agent', 'todo'); copy(2, 'commissions', 1, 'Listing Agent', 'todo');
  adhoc('t-2-contract', 2, 'Collect executed contract', 'Sales Processor', 'todo', '2026-10-30'); adhoc('t-2-emd', 2, 'Earnest money deposit receipt', 'Client-Buyer', 'todo', '2026-10-24', 'Upload the EMD receipt.');
  // deal 3: closed; personal info used the OLDER template version 1
  copy(3, 'personal_info', 1, 'Client-Buyer', 'done', { ...benInfo, settlement_type: undefined }); copy(3, 'personal_info', 1, 'Client-Seller', 'done', { ...sallyInfo, settlement_type: undefined });
  copy(3, 'commissions', 1, 'Buyer Agent', 'done', { brokerage: 'Harbor Realty (fake)', license_id: 'FAKE-1010', commission_amount: '15250', paid_by: 'Seller' });
  adhoc('t-3-deed', 3, 'Record deed', 'Sales Processor', 'done', '2026-10-16'); adhoc('t-3-disburse', 3, 'Disburse funds', 'Sales Processor', 'done', '2026-10-15');
  tasks.forEach((t) => Object.keys(t.formData).forEach((k) => t.formData[k] === undefined && delete t.formData[k]));
  return { version: 2, seq: 100, profiles, contacts, teams, teamMembers, deals, participants, taskTemplates, tasks, ...more(deals) };
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
  return { folders, documents, threads, messages, reads, activity, notifications, settlements, settlementResponses, outbox: [] };
}
