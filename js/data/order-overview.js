// Order overview shape shared by the Supabase adapter. Inputs are already limited by RLS
// (deal_contacts hides the other side, tasks/documents/threads/activity use their own policies).
// This function does not invent rows, prices, or activity. A hidden contact keeps a blank phone and email.
import { phaseOf, UPDATE_TOPICS, ORG_PERMISSIONS } from './agent-portal.js?v=202611061918';
import { CLA_PHONE, isRefi, viewOnly, isAgent, sideOf } from './constants.js?v=202611061918';

const OPEN = ['todo', 'in_progress', 'blocked'];
const EMD_RECEIPT = /earnest money deposit receipt/i;

export function buildOrderOverview({ deal, me, tasks = [], documents = [], threads = [], activity = [], salesPeople = [] }) {
  if (!deal || !deal.id) throw new Error('Order not found.');
  if (!me || !me.id) throw new Error('Please sign in.');
  const actor = me.role === 'Outside user' && deal.myRole ? { ...me, role: deal.myRole, roles: deal.myRoles || [deal.myRole], accountRole: me.role } : me;
  const staff = actor.role !== 'Outside user' && !actor.accountRole;
  const agentHere = isAgent(actor.role);
  const pureBuyer = !staff && (actor.roles || [actor.role]).includes('Client-Buyer') && !(actor.roles || [actor.role]).some((r) => isAgent(r));
  const refi = isRefi(deal);
  const readOnly = viewOnly(actor);
  const party = (label, p) => {
    const hidden = !!(p && p.contact && p.contact.contactHidden);
    const c = p && p.contact;
    const profileId = c && c.profileId || null;
    return { label, name: c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : 'Not specified', company: c && !hidden ? c.company || '' : '',
      email: c && !hidden ? c.email || '' : '', phone: c && !hidden ? c.phone || '' : '', contactHidden: hidden, entity: p && p.entity ? p.entity : null,
      profileId, canMessage: !!(profileId && profileId !== me.id && !hidden && !readOnly) };
  };
  const all = (role) => (deal.participants || []).filter((p) => p.role === role && !p.removed);
  const opt = (role, label) => (all(role).length ? all(role).map((p) => party(label, p)) : refi ? [] : [party(label, null)]);
  const salesReps = () => {
    if (!agentHere) return [];
    const rows = (salesPeople || []).filter((p) => p && p.id && (p.status || 'active') === 'active');
    if (!rows.length) return [{ label: 'Title Sales Rep', name: 'Not specified', company: 'CLA Title', email: '', phone: '', contactHidden: false, profileId: null, canMessage: false, salesRep: true }];
    return rows.map((p) => {
      const name = (p.name || `${p.firstName || ''} ${p.lastName || ''}`).trim();
      const bits = name.split(/\s+/).filter(Boolean);
      return { label: 'Title Sales Rep', name: name || 'Not specified', company: 'CLA Title', email: p.email || '', phone: p.phone || '', contactHidden: false,
        profileId: p.id, initials: `${(bits[0] || '')[0] || ''}${(bits[1] || '')[0] || ''}`.toUpperCase(), salesRep: true, canMessage: p.id !== me.id && !readOnly };
    });
  };
  const parties = [...all('Client-Buyer').map((p) => party(refi ? 'Borrower' : 'Buyer', p)), ...(all('Client-Buyer').length ? [] : [party(refi ? 'Borrower' : 'Buyer', null)]),
    { label: 'Settlement Agent', name: deal.processorName || 'Not specified', company: 'CLA Title & Escrow', email: deal.processorEmail || '', phone: deal.processorPhone || '', contactHidden: false, profileId: deal.processorId || null, canMessage: !!(deal.processorId && deal.processorId !== me.id && !readOnly) },
    { label: 'Title Company', name: 'CLA Title & Escrow', company: '', email: '', phone: CLA_PHONE, contactHidden: false, profileId: null, canMessage: false },
    ...salesReps(), ...opt('Buyer Agent', 'Buyer Agent'), ...opt('Listing Agent', 'Listing Agent'),
    ...(refi ? all('Lender').map((p) => party('Lender', p)) : []), ...all('Client-Seller').map((p) => party('Seller', p))];
  const visibleTasks = tasks.filter((t) => t && t.dealId === deal.id);
  const openMine = visibleTasks.filter((t) => OPEN.includes(t.status) && (t.ownerId === me.id || t.ownerProfileId === me.id || (!t.participantId && (actor.roles || [actor.role]).includes(t.assignedRole))));
  const openAll = visibleTasks.filter((t) => OPEN.includes(t.status));
  const outstanding = staff ? openAll.length : openMine.length;
  const docs = documents.filter((z) => z && z.dealId === deal.id && !z.sample);
  const conversations = (threads || []).map((t) => {
    const ms = t.messages || []; const last = ms[ms.length - 1];
    return { id: t.id, subject: t.subject || '', lastAt: last ? last.createdAt : t.createdAt, lastFrom: last ? (last.authorName || '') : '', lastBody: last ? String(last.body || '').slice(0, 120) : '', unread: t.unread || 0 };
  }).sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
  const act = (activity || []).map((a) => ({ id: a.id, createdAt: a.createdAt, action: a.action, detail: a.detail, actorName: a.actorName || '' }));
  const emdPending = pureBuyer && visibleTasks.some((t) => t.assignedRole === 'Client-Buyer' && EMD_RECEIPT.test(t.title || '') && OPEN.includes(t.status));
  return { progress: phaseOf(deal), outstanding, emdPending,
    counts: { tasks: outstanding, inbox: conversations.reduce((n, t) => n + (t.unread || 0), 0), threads: conversations.length, documents: docs.length, activity: act.length },
    orderDetails: { propertyAddress: deal.address || [deal.street, [deal.city, deal.state, deal.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '), orderId: deal.id, orderType: deal.transactionType || 'Purchase', refinance: refi, purchasePrice: refi ? null : deal.purchasePrice, loanAmount: deal.loanAmount, fileNumber: deal.fileNumber, agencyLicenseId: '' },
    parties, recentActivity: act.slice(0, 6), conversations: conversations.slice(0, 5),
    canRequestUpdate: !staff && !!sideOf(actor.role) && !readOnly, canShareAccess: (agentHere || (actor.roles || [actor.role]).includes('Client-Buyer') || (actor.roles || [actor.role]).includes('Client-Seller')) && !readOnly,
    canAnswerUpdates: staff && (actor.isAdmin || actor.role === 'Processor' || actor.role === 'Preprocessor' || actor.role === 'Transaction Coordinator'),
    updateTopics: UPDATE_TOPICS, permissions: ORG_PERMISSIONS };
}
