/* MF-058 (Matt Landsberg, Nov 17 2026). Settlement agent/notary on each side of Scheduling Details.
 * Column names stay settlement_agent_*. This file does not write the file closing date. */
import { fmtPhone, phoneOk } from './constants.js?v=202611245800';
import { placeSummary, propertyAddress, resolveSettlementAgent, scheduleTimeLabel, schedulingFromDeal } from './scheduling-details.js?v=202611246600';

export const AUTOSAVE_MS = 600;
export const AGENT_LABEL = 'Settlement agent/notary';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const trim = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

const ROLE_LABEL = {
  'Client-Buyer': 'Buyer',
  'Buyer Agent': "Buyer's agent",
  'Client-Seller': 'Seller',
  'Listing Agent': 'Listing agent',
};
const ROLES = {
  buyer: ['Client-Buyer', 'Buyer Agent'],
  seller: ['Client-Seller', 'Listing Agent'],
};

function fail(msg, k) {
  const err = new Error(msg);
  err.fieldErrors = [{ k, msg }];
  throw err;
}

/* The list error still says "settlement agent" in the older helper. The screen says settlement agent/notary. */
export function notaryWords(message) {
  return String(message || '').replace(/settlement agent/gi, 'settlement agent/notary');
}

export function cleanSideAgent(input = {}, choices) {
  const side = input.side === 'seller' ? 'seller' : input.side === 'buyer' ? 'buyer' : '';
  if (!side) fail('Pick the buyer side or the seller side.', 'side');
  let resolved;
  try { resolved = resolveSettlementAgent(input.name, choices || [], input.profileId || null); }
  catch (e) { fail(notaryWords(e.message), 'name'); }
  const phoneRaw = trim(input.phone, 40);
  let phone = '';
  if (phoneRaw) {
    if (!phoneOk(phoneRaw)) fail('Enter a 10-digit phone number (xxx-xxx-xxxx), or clear the phone.', 'phone');
    phone = fmtPhone(phoneRaw);
  }
  const email = trim(input.email, 200);
  if (email && !EMAIL_RE.test(email)) fail('Enter a valid email, or clear the email.', 'email');
  const confirmed = input.confirmed === true || ['yes', 'true', 'on'].includes(String(input.confirmed || '').toLowerCase());
  if (confirmed && !resolved.settlementAgentName) fail('Enter the settlement agent/notary before confirming.', 'confirmed');
  return {
    side,
    name: resolved.settlementAgentName,
    profileId: resolved.settlementAgentProfileId,
    phone,
    email,
    confirmed: confirmed && !!resolved.settlementAgentName,
  };
}

export function sideAgentFromDeal(deal, side) {
  const who = side === 'seller' ? 'seller' : 'buyer';
  if (who === 'seller') {
    return {
      side: 'seller',
      name: (deal && deal.sellerSettlementAgentName) || '',
      profileId: (deal && deal.sellerSettlementAgentProfileId) || null,
      phone: (deal && deal.sellerSettlementAgentPhone) || '',
      email: (deal && deal.sellerSettlementAgentEmail) || '',
      confirmed: !!(deal && deal.sellerSettlementAgentConfirmed),
    };
  }
  const view = schedulingFromDeal(deal || {});
  return {
    side: 'buyer',
    name: view.settlementAgentName || '',
    profileId: view.settlementAgentProfileId || null,
    phone: (deal && deal.settlementAgentPhone) || '',
    email: (deal && deal.settlementAgentEmail) || '',
    confirmed: !!view.settlementAgentConfirmed,
  };
}

/* Field names only. Never includes the file closing date. */
export function sideAgentPatch(clean) {
  if (clean.side === 'seller') {
    return {
      sellerSettlementAgentName: clean.name,
      sellerSettlementAgentProfileId: clean.profileId,
      sellerSettlementAgentPhone: clean.phone,
      sellerSettlementAgentEmail: clean.email,
      sellerSettlementAgentConfirmed: !!clean.confirmed,
    };
  }
  return {
    settlementAgentName: clean.name,
    settlementAgentProfileId: clean.profileId,
    settlementAgentPhone: clean.phone,
    settlementAgentEmail: clean.email,
    settlementAgentConfirmed: !!clean.confirmed,
  };
}

export function sameAgent(a, b) {
  if (!a || !b) return false;
  return a.side === b.side && a.name === b.name && (a.profileId || null) === (b.profileId || null)
    && a.phone === b.phone && String(a.email || '').toLowerCase() === String(b.email || '').toLowerCase()
    && !!a.confirmed === !!b.confirmed;
}

/* Buyers and the buyer's agent, or sellers and the listing agent. Addresses come from the file. */
export function reminderRecipients(participants, side) {
  const who = side === 'seller' ? 'seller' : side === 'buyer' ? 'buyer' : '';
  if (!who) fail('Pick the buyer side or the seller side.', 'side');
  const want = ROLES[who];
  const recipients = [];
  const missing = [];
  const seen = new Set();
  const rows = [...(participants || [])].filter((p) => p && !p.removed && want.includes(p.role));
  rows.sort((a, b) => (String(a.role).startsWith('Client-') ? 0 : 1) - (String(b.role).startsWith('Client-') ? 0 : 1));
  for (const p of rows) {
    if (!p || p.removed || !want.includes(p.role)) continue;
    const c = p.contact || {};
    const name = `${c.firstName || ''} ${c.lastName || ''}`.replace(/\s+/g, ' ').trim() || ROLE_LABEL[p.role];
    const email = String(c.email || '').trim();
    if (!email || !EMAIL_RE.test(email)) {
      missing.push({
        name, role: p.role, roleLabel: ROLE_LABEL[p.role],
        reason: email ? 'That email on Contacts is not valid. Fix it, then send again.' : 'No email on Contacts.',
      });
      continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push({ name, email, role: p.role, roleLabel: ROLE_LABEL[p.role], profileId: c.profileId || null });
  }
  return { side: who, recipients, missing };
}

export function reminderEmptyMessage(side) {
  return side === 'seller'
    ? 'Add an email for a seller or the listing agent on Contacts before sending this reminder.'
    : 'Add an email for a buyer or the buyer\'s agent on Contacts before sending this reminder.';
}

export function reminderMessage({ side, firstName, deal }) {
  const who = side === 'seller' ? 'seller' : 'buyer';
  const addr = propertyAddress(deal) || 'the property';
  const file = (deal && deal.fileNumber) || '';
  const order = file ? ` (Order # ${file})` : '';
  const view = (schedulingFromDeal(deal || {})[who]) || {};
  const when = [view.date, view.time ? scheduleTimeLabel(view.time) : ''].filter(Boolean).join(' at ');
  const place = placeSummary(view);
  const where = [when, place].filter(Boolean).join(', ');
  const line = where ? `The ${who} side currently shows ${where}.` : `The ${who} side does not have a settlement date yet.`;
  return {
    subject: `Reminder: settlement for ${addr}${order}`,
    body: `Hi ${firstName || 'there'},\n\nThis is a reminder about the ${who} settlement for ${addr}${order}.\n\n${line}\n\nReply to this email if the plan needs to change.\n\nCLA Title & Escrow`,
  };
}
