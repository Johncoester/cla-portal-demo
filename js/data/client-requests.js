/* CLIENT REQUESTS in Task Builder (TB-6, John, Nov 20 2026; spec docs/specs/task-builder.md "TB-6").
 * Like Qualia's client requests: a flow step asks a party on the file to fill in one of the portal's intake forms.
 * The step says WHO (a party role), WHICH FORM (an intake template) and WHEN (its place in the flow: after the trigger, after a wait...).
 * The request completes itself: it is the party's own form task, which is marked done when they submit the form.
 * Reminders are a setting on the step: every N days, up to M times (0 = no reminders).
 * ONE EMAIL PER PERSON (John): requests and reminders are never emailed one by one. Each person gets one email per file listing
 * EVERYTHING still needed from them on that file, and at most one reminder email a day. Emails go to the outbox (queued; nothing is
 * auto-sent from TEST). Mirrored in SQL: migration 20261126010000_task_flow_client_requests.sql. Pure: no adapter, no DOM. */

// The intake forms a request can ask for, and which roles fill each one (same roles as js/data/templates.js TEMPLATE_DEFS, latest versions;
// test/test-client-requests.js checks they match).
export const REQUEST_FORMS = [
  ['id_upload', 'Upload identification', ['Client-Buyer', 'Client-Seller']],
  ['personal_info', 'Personal information', ['Client-Buyer', 'Client-Seller']],
  ['title_vesting', 'Title vesting', ['Client-Buyer']],
  ['lender_info', 'Lender information', ['Client-Buyer']],
  ['hoa_info', 'Confirm HOA Information', ['Client-Seller']],
  ['mortgage_info', 'Outstanding Mortgage Information', ['Client-Seller']],
  ['home_warranty', 'Home warranty', ['Client-Buyer', 'Client-Seller']],
  ['commissions', 'Commission information', ['Buyer Agent', 'Listing Agent']],
  ['forwarding_address', 'Forwarding address', ['Client-Seller']],
  ['seller_proceeds', 'How you want your proceeds', ['Client-Seller']],
];
export const requestForm = (code) => REQUEST_FORMS.find(([c]) => c === code) || null;
export const formTitle = (code) => (requestForm(code) || [code, code])[1];
export const formRoles = (code) => (requestForm(code) || [null, null, []])[2];
export const REQUEST_ROLES = [['Client-Buyer', 'Buyer'], ['Client-Seller', 'Seller'], ['Buyer Agent', "Buyer's agent"], ['Listing Agent', 'Listing agent']];
const roleName = (r) => (REQUEST_ROLES.find(([v]) => v === r) || [r, r])[1];

export const REMIND_EVERY_MAX = 14;
export const REMIND_TIMES_MAX = 10;
export const REQUEST_DUE_MAX = 60;
// one reminder email a day per person and file, at most: a digest sent less than this long ago holds back the next REMINDER
// (a brand-new request still goes out straight away, in its own digest listing everything still needed)
export const DIGEST_GAP_HOURS = 20;

const intIn = (v, lo, hi) => { const s = String(v == null ? '' : v).trim(); const n = Number(s); return s !== '' && Number.isInteger(n) && n >= lo && n <= hi ? n : null; };

// Check one "Request a form" step. n = "Step 3" for the error. Returns the cleaned step; throws plain words.
export function cleanRequestStep(s = {}, n = 'Step') {
  const form = requestForm(s.formCode);
  if (!form) throw new Error(`${n}: choose which form to request.`);
  if (!REQUEST_ROLES.some(([v]) => v === s.sendTo)) throw new Error(`${n}: choose who the request goes to.`);
  if (!form[2].includes(s.sendTo)) throw new Error(`${n}: "${form[1]}" is not filled in by the ${roleName(s.sendTo).toLowerCase()}. Choose ${form[2].map((r) => 'the ' + roleName(r).toLowerCase()).join(' or ')}.`);
  const dueDays = intIn(s.dueDays, 0, REQUEST_DUE_MAX);
  if (dueDays == null) throw new Error(`${n}: due in must be a whole number of days from 0 to ${REQUEST_DUE_MAX}.`);
  const remindEvery = intIn(s.remindEvery == null || s.remindEvery === '' ? 0 : s.remindEvery, 0, REMIND_EVERY_MAX);
  if (remindEvery == null) throw new Error(`${n}: remind every must be a whole number of days from 0 (no reminders) to ${REMIND_EVERY_MAX}.`);
  let remindTimes = intIn(s.remindTimes == null || s.remindTimes === '' ? 0 : s.remindTimes, 0, REMIND_TIMES_MAX);
  if (remindTimes == null) throw new Error(`${n}: remind up to must be a whole number from 0 to ${REMIND_TIMES_MAX}.`);
  if (remindEvery === 0) remindTimes = 0;
  else if (remindTimes === 0) throw new Error(`${n}: say how many reminders to send (1 to ${REMIND_TIMES_MAX}), or set remind every to 0 for none.`);
  return { type: 'client_request', formCode: form[0], sendTo: s.sendTo, dueDays, remindEvery, remindTimes };
}

export function requestStepText(s) {
  const due = Number(s.dueDays) === 0 ? 'due the same day' : `due in ${s.dueDays} ${Number(s.dueDays) === 1 ? 'day' : 'days'}`;
  const rem = !s.remindEvery ? 'no reminders' : `reminder every ${s.remindEvery} ${s.remindEvery === 1 ? 'day' : 'days'}, up to ${s.remindTimes} ${s.remindTimes === 1 ? 'time' : 'times'}`;
  return `Request "${formTitle(s.formCode)}" from the ${roleName(s.sendTo).toLowerCase()}, ${due}, ${rem}`;
}

/* A request's reminder state (SQL table public.task_flow_requests; mock d.taskFlowRequests):
 * { taskId, dealId, remindEvery, remindTimes, sent (emails that listed it, the first one included), nextAt (ISO or null) }.
 * Who it goes to (recipientKey: their portal account) is worked out when an email goes, so a party who accepts their invite later still gets it.
 * A new request has sent 0 and nextAt = now, so the next digest (straight away) carries it. */
export const newRequestState = (taskId, dealId, recipientKey, step, nowIso) => ({ taskId, dealId, ...(recipientKey ? { recipientKey } : {}), remindEvery: step.remindEvery, remindTimes: step.remindTimes, sent: 0, nextAt: nowIso });

const DAY = 86400000;
/* After a digest listed a request: count it, and set when it is next due (null = no more reminders). */
export function afterSent(state, nowIso) {
  state.sent += 1;
  const remindersSent = state.sent - 1;   // the first email is the request itself
  state.nextAt = state.remindEvery && remindersSent < state.remindTimes ? new Date(Date.parse(nowIso) + state.remindEvery * DAY).toISOString() : null;
  return state;
}

/* Who gets a digest now. requests: states joined with their task ({ ...state, task: { status, title, dueDate } }).
 * lastDigestAt(recipientKey, dealId) -> ISO of the last digest to that person on that file, or null.
 * A person and file are due when an OPEN request is due (nextAt <= now) and either it is a brand-new request (sent 0)
 * or no digest went to them on that file in the last DIGEST_GAP_HOURS.
 * Returns [{ recipientKey, dealId, items: every open request for them on that file, due: the due ones }]. */
const OPEN = ['todo', 'in_progress', 'blocked'];
export function digestsDue(requests, nowIso, lastDigestAt = () => null) {
  const now = Date.parse(nowIso); const groups = new Map();
  requests.filter((r) => r.task && OPEN.includes(r.task.status)).forEach((r) => {
    const k = `${r.recipientKey}|${r.dealId}`; if (!groups.has(k)) groups.set(k, { recipientKey: r.recipientKey, dealId: r.dealId, items: [], due: [] });
    const g = groups.get(k); g.items.push(r); if (r.nextAt && Date.parse(r.nextAt) <= now) g.due.push(r);
  });
  return [...groups.values()].filter((g) => {
    if (!g.due.length) return false;
    if (g.due.some((r) => r.sent === 0)) return true;
    const last = lastDigestAt(g.recipientKey, g.dealId);
    return !last || now - Date.parse(last) >= DIGEST_GAP_HOURS * 3600000;
  });
}

/* The one email: everything still needed from this person on this file. */
export function digestEmail({ firstName, fileNumber, address, items, isReminder }) {
  const list = [...items].sort((a, b) => String(a.task.dueDate || '9999').localeCompare(String(b.task.dueDate || '9999')) || a.task.title.localeCompare(b.task.title));
  const lines = list.map((r) => `- ${r.task.title}${r.task.dueDate ? ` (due ${r.task.dueDate})` : ''}`).join('\n');
  const n = list.length;
  const subject = `${isReminder ? 'Reminder: ' : ''}${n === 1 ? '1 item' : `${n} items`} still needed for ${fileNumber}`;
  const body = `Hello ${firstName || 'there'},\n\n${isReminder ? 'This is a reminder that CLA Title & Escrow still needs' : 'CLA Title & Escrow needs'} the following from you for ${address || 'your order'} (order ${fileNumber}):\n\n${lines}\n\n`
    + 'Please sign in to the portal to fill these in. Each item comes off this list once you submit it.\n\nCLA Title & Escrow';
  return { subject, body };
}
