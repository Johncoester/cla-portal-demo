// FAKE DATA ONLY. Fictional people, example.test addresses, 555 phone numbers. No real clients, no credentials.
export function buildSeed() {
  const P = (id, first, last, role, n) => ({ id, email: `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.test', firstName: first, lastName: last,
    phone: `301-555-01${String(n).padStart(2, '0')}`, role, status: 'active', createdAt: '2026-09-01T12:00:00Z' });
  const profiles = [
    P('u-proc', 'Paula', 'Processor', 'Sales Processor', 1),
    P('u-sp', 'Sam', 'Salesperson', 'Sales Person', 2),
    P('u-team', 'Tina', 'Salesteam', 'Sales Team', 3),
    P('u-tc', 'Terry', 'Coordinator', 'Transaction Coordinator', 4),
    P('u-bagent', 'Bianca', 'Buyer-Agent', 'Buyer Agent', 5),
    P('u-lagent', 'Larry', 'Listing-Agent', 'Listing Agent', 6),
    P('u-buyer', 'Ben', 'Buyer', 'Client-Buyer', 7),
    P('u-seller', 'Sally', 'Seller', 'Client-Seller', 8),
  ];
  // One contact per login person (linked by profileId) + non-login parties
  const contacts = profiles.map((p) => ({ id: 'c-' + p.id.slice(2), profileId: p.id, firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone,
    company: ({ 'Buyer Agent': 'Harbor Realty (fake)', 'Listing Agent': 'Oak Street Realty (fake)' })[p.role] || (p.role.startsWith('Client') ? '' : 'CLA Title & Escrow'), createdBy: 'u-proc', createdAt: p.createdAt }));
  contacts.push(
    { id: 'c-lender1', profileId: null, firstName: 'Linda', lastName: 'Lender', email: 'linda.lender@example.test', phone: '410-555-0111', company: 'Example Home Loans (fake)', createdBy: 'u-proc', createdAt: '2026-09-01T12:00:00Z' },
    { id: 'c-hoa1', profileId: null, firstName: 'Hank', lastName: 'Hoa-Manager', email: 'hank.hoa@example.test', phone: '410-555-0122', company: 'Maple Ridge HOA (fake)', createdBy: 'u-proc', createdAt: '2026-09-01T12:00:00Z' });

  const deals = [
    { id: 'deal-1', fileNumber: 'MD-26-97183', street: '145 Main Street', city: 'Rockville', state: 'MD', zip: '20850', transactionType: 'Purchase', stage: 2, status: 'Open',
      openDate: '2026-09-28', closingDate: '2026-11-18', purchasePrice: 485000, loanAmount: 388000, lenderName: 'Example Home Loans (fake)', lenderContact: 'Linda Lender', lenderEmail: 'linda.lender@example.test', lenderPhone: '410-555-0111',
      notes: 'Fake file. Buyer needs to upload photo ID; HOA resale certificate ordered.', processorId: 'u-proc', salesPersonId: 'u-sp', createdBy: 'u-proc', createdAt: '2026-09-28T14:00:00Z' },
    { id: 'deal-2', fileNumber: 'MD-26-97201', street: '22 Elm Court', city: 'Bethesda', state: 'MD', zip: '20814', transactionType: 'Purchase', stage: 0, status: 'Open',
      openDate: '2026-09-28', closingDate: '2026-12-02', purchasePrice: 720000, loanAmount: 540000, lenderName: '', lenderContact: '', lenderEmail: '', lenderPhone: '',
      notes: 'Fake file. New order; waiting on contract and EMD.', processorId: 'u-proc', salesPersonId: 'u-team', createdBy: 'u-proc', createdAt: '2026-09-28T15:00:00Z' },
    { id: 'deal-3', fileNumber: 'MD-26-96877', street: '9 Harbor Lane', city: 'Annapolis', state: 'MD', zip: '21401', transactionType: 'Purchase', stage: 9, status: 'Closed',
      openDate: '2026-08-10', closingDate: '2026-10-15', purchasePrice: 610000, loanAmount: 450000, lenderName: 'Example Home Loans (fake)', lenderContact: 'Linda Lender', lenderEmail: 'linda.lender@example.test', lenderPhone: '410-555-0111',
      notes: 'Fake file. Closed and funded.', processorId: 'u-proc', salesPersonId: 'u-sp', createdBy: 'u-proc', createdAt: '2026-08-10T14:00:00Z' },
  ];
  const participants = [];
  deals.forEach((d, i) => {
    const link = (cid, role) => participants.push({ id: `dp-${i + 1}-${cid.slice(2)}`, dealId: d.id, contactId: cid, role, createdAt: d.createdAt });
    link('c-proc', 'Sales Processor'); link('c-sp', 'Sales Person'); link('c-team', 'Sales Team'); link('c-tc', 'Transaction Coordinator');
    link('c-bagent', 'Buyer Agent'); link('c-lagent', 'Listing Agent'); link('c-buyer', 'Client-Buyer'); link('c-seller', 'Client-Seller');
    if (i !== 1) link('c-lender1', 'Lender');
    if (i === 0) link('c-hoa1', 'HOA');
  });

  const T = (id, dealId, title, role, status, due, desc = '') => ({ id, dealId, title, description: desc, assignedRole: role, status, dueDate: due, completedAt: status === 'done' ? '2026-10-01T15:00:00Z' : null, completedBy: status === 'done' ? 'u-proc' : null, createdBy: 'u-proc', createdAt: '2026-09-28T16:00:00Z' });
  const tasks = [
    T('t-1', 'deal-1', 'Personal information form', 'Client-Buyer', 'done', '2026-10-05'),
    T('t-2', 'deal-1', 'Upload photo ID', 'Client-Buyer', 'todo', '2026-11-04', 'Clear photo of a government ID (JPG/PNG/PDF).'),
    T('t-3', 'deal-1', 'Title vesting details', 'Client-Buyer', 'todo', '2026-11-04'),
    T('t-4', 'deal-1', 'Confirm lender information', 'Buyer Agent', 'blocked', '2026-11-08', 'Waiting on lender to confirm closing disclosure timing.'),
    T('t-5', 'deal-1', 'Order HOA resale certificate', 'Sales Processor', 'done', '2026-10-10'),
    T('t-6', 'deal-1', 'Payoff statement for seller mortgage', 'Client-Seller', 'todo', '2026-11-06'),
    T('t-7', 'deal-1', 'Schedule closing appointment', 'Transaction Coordinator', 'todo', '2026-11-10'),
    T('t-8', 'deal-2', 'Collect executed contract', 'Sales Processor', 'todo', '2026-10-30'),
    T('t-9', 'deal-2', 'Earnest money deposit receipt', 'Client-Buyer', 'todo', '2026-10-30'),
    T('t-10', 'deal-2', 'Personal information form', 'Client-Buyer', 'todo', '2026-11-10'),
    T('t-11', 'deal-2', 'Listing agent commission instructions', 'Listing Agent', 'todo', '2026-11-12'),
    T('t-12', 'deal-3', 'Record deed', 'Sales Processor', 'done', '2026-10-16'),
    T('t-13', 'deal-3', 'Disburse funds', 'Sales Processor', 'done', '2026-10-15'),
  ];
  const D = (id, dealId, name, desc, by, vis, size) => ({ id, dealId, name, description: desc, mimeType: name.endsWith('.pdf') ? 'application/pdf' : 'text/plain', size, dataUrl: null, uploadedBy: by, visibility: vis, createdAt: '2026-10-10T15:00:00Z' });
  const documents = [
    D('doc-1', 'deal-1', 'Purchase Contract (fake).pdf', 'Fully executed contract', 'u-lagent', 'all', 182340),
    D('doc-2', 'deal-1', 'HOA Resale Certificate (fake).pdf', 'HOA docs (fake)', 'u-lagent', 'all', 96120),
    D('doc-3', 'deal-1', 'Buyer Pre-Approval (fake).pdf', 'Lender pre-approval letter', 'u-bagent', 'buyer', 48200),
    D('doc-4', 'deal-1', 'Seller Payoff Request (fake).pdf', 'Seller side only', 'u-seller', 'seller', 30114),
    D('doc-5', 'deal-1', 'Processor Checklist (fake).txt', 'Internal staff note', 'u-proc', 'staff', 1200),
    D('doc-6', 'deal-2', 'Draft Contract (fake).pdf', 'Awaiting signatures', 'u-bagent', 'all', 150000),
    D('doc-7', 'deal-3', 'Final Settlement Statement (fake).pdf', 'Closed file', 'u-proc', 'all', 120000),
  ];
  const threads = [
    { id: 'th-1', dealId: 'deal-1', subject: 'Welcome - 145 Main Street (MD-26-97183)', createdBy: 'u-proc', createdAt: '2026-09-28T16:30:00Z', participantIds: ['u-proc', 'u-sp', 'u-tc', 'u-bagent', 'u-buyer'] },
    { id: 'th-2', dealId: 'deal-1', subject: 'Seller side - payoff and HOA', createdBy: 'u-proc', createdAt: '2026-10-02T13:00:00Z', participantIds: ['u-proc', 'u-lagent', 'u-seller'] },
    { id: 'th-3', dealId: 'deal-2', subject: 'Welcome - 22 Elm Court (MD-26-97201)', createdBy: 'u-proc', createdAt: '2026-09-28T17:00:00Z', participantIds: ['u-proc', 'u-bagent', 'u-buyer'] },
  ];
  const messages = [
    { id: 'm-1', threadId: 'th-1', authorId: 'u-proc', body: 'Welcome! This is the thread for the Main Street purchase. Ben, please upload your photo ID when you can.', createdAt: '2026-09-28T16:30:00Z' },
    { id: 'm-2', threadId: 'th-1', authorId: 'u-buyer', body: 'Thanks Paula, I will do it this week.', createdAt: '2026-09-29T10:15:00Z' },
    { id: 'm-3', threadId: 'th-2', authorId: 'u-proc', body: 'Sally, can you send the payoff request and the HOA contact?', createdAt: '2026-10-02T13:00:00Z' },
    { id: 'm-4', threadId: 'th-2', authorId: 'u-lagent', body: 'HOA docs are uploaded in Documents. Payoff request coming from Sally.', createdAt: '2026-10-02T14:20:00Z' },
    { id: 'm-5', threadId: 'th-3', authorId: 'u-proc', body: 'Welcome to the Elm Court file. We are waiting on the signed contract and EMD.', createdAt: '2026-09-28T17:00:00Z' },
  ];
  const reads = [ { threadId: 'th-1', profileId: 'u-proc', at: '2026-10-28T00:00:00Z' }, { threadId: 'th-2', profileId: 'u-proc', at: '2026-10-02T14:20:00Z' }, { threadId: 'th-3', profileId: 'u-proc', at: '2026-10-28T00:00:00Z' } ];
  const activity = [
    { id: 'a-1', dealId: 'deal-1', actorId: 'u-proc', action: 'deal.created', entity: 'deal', entityId: 'deal-1', detail: 'Order MD-26-97183 opened', createdAt: '2026-09-28T14:00:00Z' },
    { id: 'a-2', dealId: 'deal-1', actorId: 'u-lagent', action: 'document.uploaded', entity: 'document', entityId: 'doc-2', detail: 'Uploaded HOA Resale Certificate (fake).pdf', createdAt: '2026-10-10T15:00:00Z' },
    { id: 'a-3', dealId: 'deal-1', actorId: 'u-proc', action: 'stage.changed', entity: 'deal', entityId: 'deal-1', detail: 'Stage set to Buyer Info Received', createdAt: '2026-10-12T15:00:00Z' },
    { id: 'a-4', dealId: 'deal-3', actorId: 'u-proc', action: 'stage.changed', entity: 'deal', entityId: 'deal-3', detail: 'Stage set to Disbursed Funds', createdAt: '2026-10-15T20:00:00Z' },
  ];
  return { version: 1, seq: 100, profiles, contacts, deals, participants, tasks, documents, threads, messages, reads, activity };
}
