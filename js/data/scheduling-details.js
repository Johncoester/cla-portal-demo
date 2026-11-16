/* MF-056 Scheduling Details (Matt Landsberg, Nov 16 2026). Pure helpers. No network.
 * The buyer's settlement date is not copied onto the file closing date. That lock is held for a later change.
 * A scheduling link is queued in the outbox from testportal@clatitle.com. Nothing is sent. */
import { US_STATES } from './constants.js?v=202611101015';

export const SCHEDULE_CODE = 'agent_schedule_settlement';
export const INVITE_FROM = 'testportal@clatitle.com';
export const INVITE_FROM_NAME = 'CLA Title Portal';
export const PLACE_OFFICE = 'office';
export const PLACE_OTHER = 'other';
export const PLACE_RON = 'ron';
export const OTHER_LABEL = 'Settlement Agent/Notary at a different location';
export const RON_LABEL = 'Prefer a Remote Online Notarization via a computer';
export const ASK_BUYER_LABEL = 'Ask the buyer instead and notify me';
export const ASK_SELLER_LABEL = 'Ask the Seller instead and Notify Me';

const TIMES = [];
for (let h = 9; h <= 18; h += 1) {
  for (const m of ['00', '30']) {
    if (h === 18 && m === '30') continue;
    TIMES.push(`${String(h).padStart(2, '0')}:${m}`);
  }
}
export const SCHEDULE_TIMES = TIMES;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const trim = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const cap = (side) => (side === 'seller' ? 'Seller' : 'Buyer');

export function scheduleTimeLabel(value) {
  const m = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function propertyAddress(deal) {
  if (!deal) return '';
  const tail = [deal.state, deal.zip].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
  return [deal.street, deal.city, tail].map((s) => String(s || '').trim()).filter(Boolean).join(', ');
}

export function scheduleTaskTitle(deal) {
  const addr = propertyAddress(deal);
  return addr ? `Schedule the Settlement for ${addr}` : 'Schedule the Settlement';
}

export function sideOfRole(role) {
  if (role === 'Listing Agent') return 'seller';
  if (role === 'Buyer Agent') return 'buyer';
  return '';
}

export function askLabel(side) {
  return side === 'seller' ? ASK_SELLER_LABEL : ASK_BUYER_LABEL;
}

/* Staff whose portal role is a settlement agent or a closer. None of today's roles match, so the box is free text. */
export function settlementAgentChoices(staff) {
  return (staff || []).filter((p) => p && p.id && (p.status || 'active') === 'active' && /settlement agent|closer/i.test(String(p.role || '')))
    .map((p) => ({ id: p.id, role: p.role, name: `${p.firstName || ''} ${p.lastName || p.name || ''}`.replace(/\s+/g, ' ').trim() }))
    .filter((p) => p.name)
    .sort((a, b) => a.name.localeCompare(b.name) || a.role.localeCompare(b.role));
}

export function resolveSettlementAgent(text, choices, profileId) {
  const name = trim(text, 120);
  const list = choices || [];
  if (!name && !profileId) return { settlementAgentName: '', settlementAgentProfileId: null };
  const byId = profileId ? list.find((c) => c.id === profileId) : null;
  if (byId) return { settlementAgentName: byId.name, settlementAgentProfileId: byId.id };
  const byName = list.filter((c) => c.name.toLowerCase() === name.toLowerCase());
  if (byName.length === 1) return { settlementAgentName: byName[0].name, settlementAgentProfileId: byName[0].id };
  if (list.length && (name || profileId)) {
    const err = new Error('Choose a settlement agent from the list.');
    err.fieldErrors = [{ k: 'name', msg: err.message }];
    throw err;
  }
  return { settlementAgentName: name, settlementAgentProfileId: null };
}

export function defaultSchedule(deal, side, officeId) {
  return {
    side, askParty: false, date: (deal && deal.closingDate) || '', time: '', placeKind: PLACE_OFFICE,
    officeId: officeId || '', street: '', city: '', state: '', zip: '', notes: '', preferRon: false,
  };
}

function failFields(errs) {
  const err = new Error(errs[0].msg);
  err.fieldErrors = errs;
  throw err;
}

/* Clean one side. A blank contract date stays blank and is required, unless this side is handed to the buyer or seller. */
export function cleanScheduleAnswers(input = {}, { side, offices = [] } = {}) {
  const who = side === 'seller' || side === 'buyer' ? side : '';
  if (!who) failFields([{ k: 'side', msg: 'Pick the buyer side or the seller side.' }]);
  const errs = [];
  const e = (k, msg) => errs.push({ k, msg });
  const ask = input.askParty === true || ['yes', 'true', 'on'].includes(String(input.askParty || '').toLowerCase());
  const date = trim(input.date, 10);
  const time = trim(input.time, 5);
  let placeKind = trim(input.placeKind, 20);
  const wantsRon = placeKind === PLACE_RON || input.preferRon === true || ['yes', 'true', 'on'].includes(String(input.preferRon || '').toLowerCase());
  if (wantsRon && who !== 'seller') e('placeKind', 'Remote online notarization is only for the seller side.');
  const ron = who === 'seller' && wantsRon;
  if (ron) placeKind = PLACE_RON;
  else if (placeKind !== PLACE_OFFICE && placeKind !== PLACE_OTHER) placeKind = '';
  const officeId = trim(input.officeId, 80);
  const street = trim(input.street, 120);
  const city = trim(input.city, 80);
  const state = trim(input.state, 2).toUpperCase();
  const zip = trim(input.zip, 10);
  const notes = trim(input.notes, 1000);
  if (String(input.notes || '').trim().length > 1000) e('notes', 'Notes can be up to 1,000 characters. Shorten the note and save again.');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) e('date', 'Enter the settlement date as YYYY-MM-DD.');
  if (time && !SCHEDULE_TIMES.includes(time)) e('time', 'Choose a time between 9:00 AM and 6:00 PM.');
  if (placeKind === PLACE_RON && who !== 'seller') e('placeKind', 'Remote online notarization is only for the seller side.');
  if (!ask) {
    if (!date) e('date', 'Enter the settlement date. The contract has no closing date, so type one.');
    if (!time || !SCHEDULE_TIMES.includes(time)) e('time', 'Choose a time between 9:00 AM and 6:00 PM.');
    if (!placeKind) e('placeKind', 'Choose a CLA office or a different location.');
    if (placeKind === PLACE_OFFICE) {
      const known = !offices.length || offices.some((o) => o.id === officeId);
      if (!officeId || !known) e('officeId', 'Choose the CLA office.');
    }
    if (placeKind === PLACE_OTHER && (!street || !city || !US_STATES.includes(state) || !ZIP_RE.test(zip))) {
      e('street', 'Enter the street, city, state, and ZIP for the other location.');
    }
  }
  if (errs.length) failFields(errs);
  return {
    side: who, askParty: !!ask, date, time: SCHEDULE_TIMES.includes(time) ? time : '',
    placeKind, officeId: placeKind === PLACE_OFFICE ? officeId : '',
    street: placeKind === PLACE_OTHER ? street : '', city: placeKind === PLACE_OTHER ? city : '',
    state: placeKind === PLACE_OTHER ? state : '', zip: placeKind === PLACE_OTHER ? zip : '',
    notes, preferRon: placeKind === PLACE_RON,
  };
}

export function partyRecipients(participants, contacts, side) {
  const role = side === 'seller' ? 'Client-Seller' : 'Client-Buyer';
  const who = side === 'seller' ? 'seller' : 'buyer';
  const rows = (participants || []).filter((p) => p && p.dealId && p.role === role).map((p) => {
    const c = (contacts || []).find((z) => z.id === p.contactId) || {};
    return { email: String(c.email || '').trim(), name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || (who === 'seller' ? 'Seller' : 'Buyer'), profileId: c.profileId || null };
  }).filter((r) => r.email);
  if (!rows.length) {
    throw new Error(who === 'seller'
      ? 'Add the seller email on Contacts before asking the seller to schedule.'
      : 'Add the buyer email on Contacts before asking the buyer to schedule.');
  }
  return rows;
}

function sideFields(deal, side) {
  const p = cap(side);
  return {
    side, askParty: !!deal[`sched${p}Ask`], date: deal[`sched${p}Date`] || '', time: deal[`sched${p}Time`] || '',
    placeKind: deal[`sched${p}Place`] || '', officeId: deal[`sched${p}OfficeId`] || '', officeName: deal[`sched${p}OfficeName`] || '',
    street: deal[`sched${p}Street`] || '', city: deal[`sched${p}City`] || '', state: deal[`sched${p}State`] || '', zip: deal[`sched${p}Zip`] || '',
    notes: deal[`sched${p}Notes`] || '', preferRon: !!deal[`sched${p}Ron`] || deal[`sched${p}Place`] === PLACE_RON, by: deal[`sched${p}By`] || '',
  };
}

export function schedulingFromDeal(deal) {
  const empty = { settlementAgentName: '', settlementAgentProfileId: null, settlementAgentConfirmed: false, processorNotes: '' };
  if (!deal) return { buyer: sideFields({}, 'buyer'), seller: sideFields({}, 'seller'), ...empty };
  if (deal.scheduling && deal.scheduling.buyer && deal.scheduling.seller) return deal.scheduling;
  return {
    buyer: sideFields(deal, 'buyer'), seller: sideFields(deal, 'seller'),
    settlementAgentName: deal.settlementAgentName || '',
    settlementAgentProfileId: deal.settlementAgentProfileId || null,
    settlementAgentConfirmed: !!deal.settlementAgentConfirmed,
    processorNotes: deal.schedulingProcessorNotes || '',
  };
}

export function schedulePatch(clean, { by, officeName = '' } = {}) {
  const p = cap(clean.side);
  const asked = !!clean.askParty && by === 'agent';
  const patch = {};
  patch[`sched${p}Ask`] = asked;
  patch[`sched${p}Date`] = clean.date || null;
  patch[`sched${p}Time`] = clean.time || '';
  patch[`sched${p}Place`] = clean.placeKind || '';
  patch[`sched${p}OfficeId`] = clean.officeId || '';
  patch[`sched${p}OfficeName`] = clean.placeKind === PLACE_OFFICE ? (officeName || '') : '';
  patch[`sched${p}Street`] = clean.street || '';
  patch[`sched${p}City`] = clean.city || '';
  patch[`sched${p}State`] = clean.state || '';
  patch[`sched${p}Zip`] = clean.zip || '';
  patch[`sched${p}Notes`] = clean.notes || '';
  patch[`sched${p}Ron`] = !!clean.preferRon;
  patch[`sched${p}By`] = by || '';
  return patch;
}

export function placeSummary(side) {
  if (!side) return '';
  if (side.preferRon || side.placeKind === PLACE_RON) return 'Remote online notarization';
  if (side.placeKind === PLACE_OTHER) return [side.street, side.city, [side.state, side.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (side.placeKind === PLACE_OFFICE) return side.officeName ? `CLA office: ${side.officeName}` : (side.officeId ? 'CLA office' : '');
  return '';
}

export function sideSummary(side, label) {
  if (!side || !(side.date || side.time || side.placeKind || side.askParty)) return '';
  if (side.askParty) return `${label}: asked to schedule`;
  const bits = [];
  if (side.date) bits.push(side.date);
  if (side.time) bits.push(scheduleTimeLabel(side.time));
  const place = placeSummary(side);
  if (place) bits.push(place);
  return bits.length ? `${label}: ${bits.join(', ')}` : '';
}

export function scheduleNavLines(deal) {
  const view = schedulingFromDeal(deal);
  return [sideSummary(view.buyer, 'Buyer'), sideSummary(view.seller, 'Seller')].filter(Boolean);
}

export function schedulingLinkEmail({ side, firstName, deal, link }) {
  const who = side === 'seller' ? 'seller' : 'buyer';
  const addr = propertyAddress(deal) || 'the property';
  return {
    fromEmail: INVITE_FROM, fromName: INVITE_FROM_NAME, from: `${INVITE_FROM_NAME} <${INVITE_FROM}>`,
    subject: `Schedule the settlement for ${addr} (Order # ${deal.fileNumber || ''})`,
    body: `Hi ${firstName || who},\n\nPlease choose a settlement date, time and place for ${addr} (Order # ${deal.fileNumber || ''}).\n\nOpen this link: ${link}\n\nTEST PORTAL: queued only; never sent.`,
  };
}

export function schedulingToldEmail({ side, agentName, deal, answered = false }) {
  const who = side === 'seller' ? 'seller' : 'buyer';
  const addr = propertyAddress(deal) || 'the property';
  const subject = answered ? `The ${who} scheduled the settlement for ${addr}` : `You asked the ${who} to schedule ${addr}`;
  const line = answered
    ? `The ${who} sent a settlement date and place for ${addr} (Order # ${deal.fileNumber || ''}). Open Scheduling Details on the file to see it.`
    : `You asked the ${who} to schedule the settlement for ${addr} (Order # ${deal.fileNumber || ''}). A link was queued for them. Nothing was emailed.`;
  return {
    fromEmail: INVITE_FROM, fromName: INVITE_FROM_NAME, from: `${INVITE_FROM_NAME} <${INVITE_FROM}>`,
    subject, body: `Hi ${agentName || 'there'},\n\n${line}\n\nTEST PORTAL: queued only; never sent.`,
  };
}
