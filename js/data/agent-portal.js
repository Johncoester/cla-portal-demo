// agent-portal.js : Qualia-Connect-style agent experience (Francis Santos, video 1, Nov 3). FAKE DATA ONLY. Pure helpers shared by the mock
// adapter, the pages and the tests. Mirrored in SQL by migration 28 (supabase/migrations/20261103000028_agent_portal.sql).
//  * ONE source for the closing progress: phaseOf(deal) is computed from the order's stage + status only; the header badge, the 4-step tracker and
//    the SQL public.order_progress() all use it (Qualia's badge and pipeline could disagree; ours cannot).
//  * Agent tasks (Confirm Client Contact Information / Your Transaction Information / Home Warranty Information): structured answers, submit,
//    View Submission, Modify -> Submit Revision (every revision kept).
//  * Request Update topics, Share Access permissions (invites are RECORDED only, nothing is sent), invite email preview ("Complete Requests Now").
//  * Rich-text message HTML sanitizer (Bold, Italic, Underline, bullet / numbered lists, links; nothing else survives).
import { STAGES, phoneOk, fmtPhone, isRealDate } from './constants.js?v=202611041131';

export const PHASES = ['Title Processing', 'Closing Prep', 'Scheduled Closing Date', 'Closed'];
// stage indexes (constants.js STAGES): 0-2 Opened / EMD Receipt / Buyer Info Received -> Title Processing; 3-6 Schedule Closing .. Buyer Final Doc
// Review -> Closing Prep; 7-8 Closing Date / Funding auth -> Scheduled Closing Date; 9 Disbursed Funds or status Closed -> Closed.
export const PHASE_OF_STAGE = [0, 0, 0, 1, 1, 1, 1, 2, 2, 3];
export function phaseOf(deal) {
  const stage = Math.max(0, Math.min(STAGES.length - 1, Number(deal && deal.stage) || 0));
  const status = (deal && deal.status) || 'Open';
  const phase = status === 'Closed' ? 3 : PHASE_OF_STAGE[stage];
  // the badge is derived from the SAME numbers: status wins only when the order is not moving (On Hold / Cancelled)
  const badge = status === 'On Hold' || status === 'Cancelled' ? status : PHASES[phase];
  return { phase, phaseName: PHASES[phase], stage, stageName: STAGES[stage], status, badge, steps: PHASES.map((name, i) => ({ name, state: i < phase || (i === phase && phase === 3) ? 'done' : i === phase ? 'current' : 'todo' })) };
}

export const UPDATE_TOPICS = ["Buyer's agency package", 'Clear to Close', 'Commission info received', 'Confirmation of EMD Received', 'Confirmation of Seller representation', 'Contract Received'];
export const ORG_PERMISSIONS = ['View only', 'View and message', 'Same access as me'];
export const MARITAL = ['Single', 'Married', 'Divorced', 'Widowed'];
export const YES_NO = ['Yes', 'No'];

export const AGENT_TASKS = [
  { code: 'agent_client_contacts', title: 'Confirm Client Contact Information', dueDays: 3,
    about: 'Tell us which of the clients on this order you represent and confirm how to reach them (and their spouse, if married). Add anyone we are missing.' },
  { code: 'agent_transaction_info', title: 'Confirm Your Transaction Information', dueDays: 3,
    about: 'Check the closing date and price we have, give your commission split, any fees or credits for the settlement statement, the earnest money, and the people on your team.' },
  { code: 'agent_home_warranty', title: 'Confirm Home Warranty Information', dueDays: 5,
    about: 'Let us know whether you or someone else will be purchasing a home warranty for this property.' },
];
export const agentTaskDef = (code) => AGENT_TASKS.find((t) => t.code === code);
export const CLIENT_ROLE_OF = { 'Buyer Agent': 'Client-Buyer', 'Listing Agent': 'Client-Seller' };
export const COMMISSION_LABEL = { 'Buyer Agent': 'Selling commission', 'Listing Agent': 'Listing commission' };

const s = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const num = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[$,%\s]/g, '')); return isFinite(n) && n >= 0 ? n : NaN; };
const rows = (v, max = 20) => (Array.isArray(v) ? v.slice(0, max) : []);

// Validate + clean one agent task submission. Throws an Error with .fieldErrors [{k, msg}] (k = 'clients.0.email' style paths).
export function validateAgentAnswers(code, input = {}, { clients = [] } = {}) {
  const errs = []; const e = (k, msg) => errs.push({ k, msg });
  const person = (p, k, { needEmail = true, needPhone = true } = {}) => {
    const o = { firstName: s(p.firstName, 80), lastName: s(p.lastName, 80), email: s(p.email, 200).toLowerCase(), phone: s(p.phone, 40) };
    if (!o.firstName) e(`${k}.firstName`, 'First name is required.'); if (!o.lastName) e(`${k}.lastName`, 'Last name is required.');
    if (o.email ? !emailOk(o.email) : needEmail) e(`${k}.email`, o.email ? 'Enter a valid email.' : 'Email is required.');
    if (o.phone) { if (!phoneOk(o.phone)) e(`${k}.phone`, 'Phone must be 10 digits (xxx-xxx-xxxx).'); else o.phone = fmtPhone(o.phone); } else if (needPhone) e(`${k}.phone`, 'Phone is required.');
    return o; };
  const marital = (p, k, o) => { o.maritalStatus = s(p.maritalStatus, 20); if (!MARITAL.includes(o.maritalStatus)) e(`${k}.maritalStatus`, 'Choose a marital status.');
    if (o.maritalStatus === 'Married') o.spouse = person(p.spouse || {}, `${k}.spouse`, { needEmail: false, needPhone: false }); return o; };
  let out;
  if (code === 'agent_client_contacts') {
    const given = rows(input.clients); const byId = new Map(given.map((c) => [c.participantId, c]));
    out = { clients: clients.map((c, i) => { const g = byId.get(c.participantId) || {}; const represent = s(g.represent, 3); const k = `clients.${i}`;
      if (!YES_NO.includes(represent)) e(`${k}.represent`, `Do you represent ${c.name}? Choose Yes or No.`);
      if (represent !== 'Yes') return { participantId: c.participantId, represent };
      return { participantId: c.participantId, represent, ...marital(g, k, person(g, k)) }; }),
    added: rows(input.added).map((g, i) => marital(g, `added.${i}`, person(g, `added.${i}`, { needPhone: false }))) };
    if (!out.clients.length && !out.added.length) e('added', 'Add at least one client contact.');
  } else if (code === 'agent_transaction_info') {
    out = { closingDate: s(input.closingDate, 10), purchasePrice: num(input.purchasePrice), emdAmount: num(input.emdAmount), holdingEmd: s(input.holdingEmd, 3), licenseId: s(input.licenseId, 40),
      commissions: rows(input.commissions).map((c, i) => { const o = { name: s(c.name, 80) || 'Commission', percent: num(c.percent), amount: num(c.amount) };
        if (Number.isNaN(o.percent) || (o.percent != null && o.percent > 100)) e(`commissions.${i}.percent`, 'Percent must be 0 to 100.');
        if (Number.isNaN(o.amount)) e(`commissions.${i}.amount`, 'Amount must be a positive number.');
        if (o.percent == null && o.amount == null) e(`commissions.${i}.amount`, 'Give a percent or an amount.'); return o; }),
      fees: rows(input.fees).map((f, i) => { const o = { name: s(f.name, 80), type: s(f.type, 10), amount: num(f.amount), paidBy: s(f.paidBy, 10) };
        if (!o.name) e(`fees.${i}.name`, 'Name the fee or credit.'); if (!['Fee', 'Credit'].includes(o.type)) e(`fees.${i}.type`, 'Fee or Credit?');
        if (o.amount == null || Number.isNaN(o.amount)) e(`fees.${i}.amount`, 'Amount is required.'); if (!['Buyer', 'Seller'].includes(o.paidBy)) e(`fees.${i}.paidBy`, 'Paid by Buyer or Seller?'); return o; }),
      team: rows(input.team).map((p, i) => ({ ...person(p, `team.${i}`, { needPhone: false }), company: s(p.company, 120), licenseId: s(p.licenseId, 40) })) };
    if (!out.closingDate) e('closingDate', 'Estimated closing date is required.'); else if (!isRealDate(out.closingDate)) e('closingDate', 'Enter a real date (YYYY-MM-DD).');
    if (out.purchasePrice == null || Number.isNaN(out.purchasePrice)) e('purchasePrice', 'Purchase price is required.');
    if (!out.commissions.length) e('commissions', 'Add your commission (percent or amount).');
    if (out.emdAmount == null || Number.isNaN(out.emdAmount)) e('emdAmount', 'Earnest deposit amount is required (0 if none).');
    if (!YES_NO.includes(out.holdingEmd)) e('holdingEmd', 'Are you holding earnest money given to you by the buyer? Choose Yes or No.');
  } else if (code === 'agent_home_warranty') {
    out = { willPurchase: s(input.willPurchase, 3) }; if (!YES_NO.includes(out.willPurchase)) e('willPurchase', 'Choose Yes or No.');
    if (out.willPurchase === 'Yes') { out.purchaser = s(input.purchaser, 20); out.company = s(input.company, 120);
      if (!['Me', 'Someone else'].includes(out.purchaser)) e('purchaser', 'Who is purchasing it: you or someone else?'); }
  } else throw new Error('Unknown agent task.');
  if (errs.length) { const err = new Error(`Please fix ${errs.length} field(s).`); err.fieldErrors = errs; throw err; }
  return out;
}

// ---------- rich-text messages: allow b/strong, i/em, u, ul/ol/li, a[href http(s)/mailto], br, p, div. Everything else is dropped (text kept, escaped). ----------
const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a', 'br', 'p', 'div']);
const escT = (t) => t.replace(/&(?!(?:amp|lt|gt|quot|#39|nbsp);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function sanitizeMessageHtml(input, max = 8000) {
  let h = String(input == null ? '' : input).slice(0, 20000);
  h = h.replace(/<!--[\s\S]*?(-->|$)/g, '').replace(/<(script|style|iframe|object|embed|svg|math|template|textarea|select|noscript)\b[\s\S]*?(<\/\1\s*>|$)/gi, '');
  const out = []; const stack = []; let last = 0; const RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g; let m;
  while ((m = RE.exec(h))) {
    out.push(escT(h.slice(last, m.index).replace(/[<>]/g, ''))); last = RE.lastIndex;
    const close = !!m[1]; const tag = m[2].toLowerCase(); if (!ALLOWED.has(tag)) continue;
    if (close) { if (tag === 'br') continue; const i = stack.lastIndexOf(tag); if (i < 0) continue; while (stack.length > i) out.push(`</${stack.pop()}>`); continue; }
    if (tag === 'br') { out.push('<br>'); continue; }
    if (tag === 'a') { const hm = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(m[3]); const href = hm ? (hm[1] || hm[2] || hm[3] || '').trim().replace(/[\u0000-\u001f\s]/g, '') : '';
      if (!/^(https?:\/\/|mailto:)/i.test(href)) { stack.push('a-skip'); continue; }
      out.push(`<a href="${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}" target="_blank" rel="noopener noreferrer">`); stack.push('a'); continue; }
    out.push(`<${tag}>`); stack.push(tag);
  }
  out.push(escT(h.slice(last).replace(/[<>]/g, ''))); while (stack.length) { const t = stack.pop(); if (t !== 'a-skip') out.push(`</${t}>`); }
  return out.join('').replace(/<\/a-skip>/g, '').slice(0, max);
}
export const htmlToText = (h) => String(h || '').replace(/<(br|\/p|\/div|\/li)\s*\/?>/gi, '\n').replace(/<li>/gi, '\u2022 ').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();

// "Complete Requests Now" invite email (preview + outbox only; nothing is sent from this build)
export function inviteEmail({ firstName, deal, link, openTasks }) {
  return { subject: `Action needed: ${deal.street}, ${deal.city} (Order # ${deal.fileNumber})`, buttonLabel: 'Complete Requests Now', link,
    body: `Hi ${firstName}, CLA Title & Escrow has shared ${deal.street}, ${deal.city}, ${deal.state} (Order # ${deal.fileNumber}) with you on the CLA portal. `
      + `${openTasks ? `You have ${openTasks} request(s) to complete. ` : ''}Use the "Complete Requests Now" button to sign in and go straight to this order's tasks. `
      + 'You can also follow the closing progress, message our team and share documents there.' };
}

// v19 -> v20 data: collections + one copy of each agent task for every agent on an OPEN order (fixed ids so this never duplicates), plus 2 fake
// conversations with a PDF attachment (one per side). Idempotent: safe on a fresh seed and on upgraded data.
export function ensureAgentPortal(d) {
  ['updateRequests', 'accessInvites', 'agentTaskRevisions'].forEach((k) => { if (!Array.isArray(d[k])) d[k] = []; });
  const at = '2026-11-02T14:00:00Z'; const addDays = (n) => new Date(Date.parse(at) + n * 864e5).toISOString().slice(0, 10);
  const contactOf = (cid) => d.contacts.find((c) => c.id === cid);
  d.deals.filter((q) => q.status === 'Open').forEach((q) => d.participants.filter((p) => p.dealId === q.id && (p.role === 'Buyer Agent' || p.role === 'Listing Agent')).forEach((p) => {
    const c = contactOf(p.contactId); if (!c || !c.profileId) return;
    AGENT_TASKS.forEach((def) => { if (d.tasks.some((t) => t.participantId === p.id && t.templateCode === def.code && t.status !== 'cancelled')) return;
      d.tasks.push({ id: `t-ap-${p.id}-${def.code}`, dealId: q.id, participantId: p.id, templateId: null, templateCode: def.code, templateVersion: 1, kind: 'agent', title: def.title, description: def.about,
        assignedRole: p.role, status: 'todo', dueDate: addDays(def.dueDays), formData: {}, savedAt: null, savedBy: null, completedAt: null, completedBy: null, createdBy: q.processorId || 'u-proc', createdAt: at }); });
  }));
  return d;
}
