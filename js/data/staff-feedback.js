/* Staff portal feedback: bugs and fixes for this assistant. Not the file inbox.
 * Buyers, sellers, and agents are refused. A report is private to its reporter and active Admins
 * in the same demo world. Status changes only through setStatus by an admin. Message text never
 * grants a role, a send, or "fixed". The webhook is not called from here. */
import { dispatchEvent } from './staff-feedback-dispatch.js?v=202611071800';

export const FEEDBACK_ROLES = Object.freeze(['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin']);
export const FEEDBACK_STATUSES = Object.freeze(['open', 'needs_info', 'in_review', 'draft_pending', 'in_progress', 'fixed', 'wont_fix', 'reopened']);
export const STATUS_LABELS = Object.freeze({
  open: 'Open', needs_info: 'Needs info', in_review: 'In review', draft_pending: 'Draft pending',
  in_progress: 'In progress', fixed: 'Fixed', wont_fix: "Won't fix", reopened: 'Reopened',
});
export const MAX_BODY = 4000;
export const MAX_TITLE = 140;
export const MAX_SCREENSHOT_BYTES = 5_000_000;
export const MAX_SCREENSHOTS = 4;
export const SCREENSHOT_EXT = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' });
export const SIMULATION_TEXT = 'TEST SIMULATION. This is not the assistant. Nothing was delivered to the bot. No status was changed.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const COMPOSE_NOTICE = 'Nothing is sent from this form. Save the note, then send that saved report. This browser does not send by itself.';
export const PENDING_SEND_NOTICE = 'Saved in the portal. Not delivered. Use Send to the tech assistant. That send is not a reply.';

/* The browser cannot know the server switch. A pending row is waiting for an explicit send. */
export function reportNotice(row) {
  if (!row) return COMPOSE_NOTICE;
  const state = row.deliveryState || row.delivery_state || '';
  const reason = row.deliveryReason || row.delivery_reason || '';
  if (state === 'pending_dispatch') {
    if (reason === 'transport_error' || reason === 'transport_rejected') return 'Saved in the portal. Not delivered. The last send was not accepted.';
    return PENDING_SEND_NOTICE;
  }
  const notice = row.notice || deliveryNotice(state, reason);
  if (/bearer|webhook url|not configured/i.test(String(notice))) return deliveryNotice(state, '');
  return notice;
}

export function deliveryNotice(state, reason) {
  if (state === 'saved') return 'Saved in the portal. Not sent to the assistant.';
  if (state === 'pending_dispatch') return reportNotice({ deliveryState: state, deliveryReason: reason });
  if (state === 'run_accepted') return 'The webhook returned 200. A run was started. The assistant has not read this, and this is not a reply.';
  if (state === 'bot_acknowledged') return 'The assistant has read this report. No reply has been published.';
  if (state === 'replied') return 'A draft reply is waiting for support review. It is not published, and this report is not marked fixed.';
  if (state === 'simulated') return 'Test simulation. This is not the assistant and was not delivered.';
  return 'Saved in the portal. Not delivered.';
}

/* Verified auth.uid values. Names, emails, and role are not a way in. */
export const FEEDBACK_PILOT_IDS = Object.freeze([
  '149e612a-6e14-4ee1-9890-0f29d6f89156',
  'd02722a1-582b-42c0-b3d1-28d25adb758d',
]);
export function isFeedbackPilot(u, { demoActive = false, viewingAs = false } = {}) {
  if (!u || demoActive || viewingAs || u.demoViewActive || u.isDemo) return false;
  if ((u.status || 'active') !== 'active') return false;
  return FEEDBACK_PILOT_IDS.includes(String(u.id || '').toLowerCase());
}
export function canReportStaffFeedback(u, opts) { return isFeedbackPilot(u, opts); }
export function canSupportStaffFeedback(u, opts) { return isFeedbackPilot(u, opts); }
export function newId() {
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function sanitizePage(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) throw new Error('Enter the page to include, or leave that box unchecked.');
  const hash = s.indexOf('#');
  if (/^https?:\/\//i.test(s)) {
    if (hash < 0) throw new Error('The page note must be a portal path such as #/orders.');
    s = s.slice(hash);
  }
  s = s.split('?')[0].trim();
  if (s.length > 200) throw new Error('The page note is too long.');
  if (!s.startsWith('#/')) throw new Error('The page note must be a portal path such as #/orders.');
  if (/[<>"'`]/.test(s) || /token|bearer|secret|password|apikey|api_key|eyJ/i.test(s)) throw new Error('The page note can only be a portal path, with no query or secrets.');
  return s;
}

export function cleanText(raw, max, label) {
  const s = String(raw == null ? '' : raw).replace(/\u0000/g, '').trim();
  if (!s) throw new Error(`Enter ${label}.`);
  if (s.length > max) throw new Error(`${label} is too long.`);
  if (/sb_secret|service_role|eyJ[A-Za-z0-9_-]{10,}/.test(s)) throw new Error('Remove keys or session tokens before saving.');
  return s;
}

export function screenshotMeta(file) {
  const name = String(file && file.name || '');
  const ext = (name.split('.').pop() || '').toLowerCase();
  const mime = String(file && file.mimeType || '').toLowerCase();
  if (file && file.webkitRelativePath) throw new Error('Choose one screenshot. Folder upload is not available.');
  if (!SCREENSHOT_EXT[ext] || (mime && mime !== SCREENSHOT_EXT[ext])) throw new Error('Screenshots must be PNG, JPEG, WEBP, or GIF.');
  const size = Number(file && file.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_SCREENSHOT_BYTES) throw new Error('Screenshots must be 5 MB or smaller.');
  const data = String(file && file.dataUrl || '');
  if (/^data:image\/svg/i.test(data) || /<svg/i.test(data.slice(0, 300))) throw new Error('SVG files are not accepted.');
  return { ext, mime: SCREENSHOT_EXT[ext], size, name: name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) };
}

export function emptyBag() {
  return { reports: [], messages: [], attachments: [], outbox: [] };
}

function fail(message) { throw new Error(message); }

function assertReporter(actor) {
  if (!isFeedbackPilot(actor)) fail(actor && actor.demoViewActive ? 'Leave demo view before using portal feedback.' : actor && (actor.status || 'active') !== 'active' ? 'This account cannot use portal feedback.' : 'Portal feedback is not available for this account.');
}
function assertSupport(actor) { assertReporter(actor); }
function canSee(actor, row) {
  if (!isFeedbackPilot(actor) || !row || row.isDemo) return false;
  return true;
}
function reportOr404(bag, actor, id) {
  const row = bag.reports.find((r) => r.id === id);
  if (!row || !canSee(actor, row)) fail('Report not found.');
  return row;
}
function stamp(row, state, reason) {
  row.deliveryState = state;
  row.deliveryReason = reason;
  row.notice = deliveryNotice(state, reason);
  row.portalSaved = true;
  row.sent = false;
  row.runAccepted = state === 'run_accepted' || state === 'bot_acknowledged' || state === 'replied';
  row.botRead = state === 'bot_acknowledged' || state === 'replied';
  return row;
}
function syncReport(bag, report) {
  const ev = bag.outbox.find((e) => e.id === report.createdEventId);
  if (!ev) return report;
  return stamp(report, ev.deliveryState, ev.reason);
}
function nameOf(actor) {
  return `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || 'CLA staff';
}
function publicMessage(m) {
  return {
    id: m.id, reportId: m.reportId, authorKind: m.authorKind, authorName: m.authorName, body: m.body,
    visibility: m.visibility, simulation: !!m.simulation, createdAt: m.createdAt, publishedAt: m.publishedAt || null,
  };
}
function view(bag, actor, report) {
  syncReport(bag, report);
  const support = canSupportStaffFeedback(actor) && !!actor.isDemo === !!report.isDemo;
  const messages = bag.messages.filter((m) => m.reportId === report.id && m.visibility === 'published').map(publicMessage);
  const drafts = support ? bag.messages.filter((m) => m.reportId === report.id && m.visibility === 'draft_pending').map(publicMessage) : [];
  const attachments = bag.attachments.filter((a) => a.reportId === report.id).map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, createdAt: a.createdAt }));
  return {
    id: report.id, conversationId: report.conversationId, title: report.title, body: report.body, status: report.status,
    statusLabel: STATUS_LABELS[report.status] || report.status, deliveryState: report.deliveryState, deliveryReason: report.deliveryReason,
    notice: report.notice, pagePath: report.pagePath, orderDealId: report.orderDealId, orderFileNumber: report.orderFileNumber,
    reporterId: report.reporterId, reporterRole: report.reporterRole, reporterName: report.reporterName, isDemo: !!report.isDemo,
    createdAt: report.createdAt, updatedAt: report.updatedAt, mine: actor.id === report.reporterId, canSupport: support,
    portalSaved: true, sent: false, runAccepted: !!report.runAccepted, botRead: !!report.botRead, messages, drafts, attachments,
  };
}

export function listReports(bag, actor) {
  assertReporter(actor);
  return bag.reports.filter((r) => canSee(actor, r)).map((r) => {
    const full = view(bag, actor, r);
    return { id: full.id, conversationId: full.conversationId, title: full.title, status: full.status, statusLabel: full.statusLabel, deliveryState: full.deliveryState, deliveryReason: full.deliveryReason, notice: full.notice, reporterName: full.reporterName, mine: full.mine, canSupport: full.canSupport, createdAt: full.createdAt, portalSaved: true, sent: false, runAccepted: full.runAccepted, botRead: full.botRead };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function getReport(bag, actor, id) {
  assertReporter(actor);
  return view(bag, actor, reportOr404(bag, actor, id));
}

export function createReport(bag, actor, input = {}, { now = () => new Date().toISOString(), id = newId, findOrder } = {}) {
  assertReporter(actor);
  const key = String(input.idempotencyKey || '');
  if (!UUID.test(key)) fail('Save could not be retried safely. Reload this page.');
  const prior = bag.reports.find((r) => r.reporterId === actor.id && r.idempotencyKey === key);
  if (prior) return view(bag, actor, prior);
  const title = cleanText(input.title, MAX_TITLE, 'a short title');
  const body = cleanText(input.body, MAX_BODY, 'what happened');
  let pagePath = null;
  if (input.includePage) pagePath = sanitizePage(input.page);
  let orderDealId = null; let orderFileNumber = null;
  if (input.includeOrder) {
    if (typeof findOrder !== 'function') fail('That order is not on your account, so it was not attached.');
    const found = findOrder(actor, input.fileNumber);
    if (!found || !found.id || !found.fileNumber) fail('That order is not on your account, so it was not attached.');
    orderDealId = found.id;
    orderFileNumber = String(found.fileNumber);
  }
  const createdAt = now();
  const report = {
    id: id(), conversationId: id(), idempotencyKey: key, reporterId: actor.id, reporterRole: actor.role, reporterName: nameOf(actor),
    isDemo: !!actor.isDemo, title, body, status: 'open', pagePath, orderDealId, orderFileNumber, createdAt, updatedAt: createdAt, createdEventId: id(),
  };
  stamp(report, 'pending_dispatch', 'bridge_unconfigured');
  bag.reports.push(report);
  bag.messages.push({ id: id(), reportId: report.id, authorId: actor.id, authorKind: 'reporter', authorName: report.reporterName, body, visibility: 'published', simulation: false, createdAt, idempotencyKey: key });
  bag.outbox.push({
    id: report.createdEventId, reportId: report.id, feedbackId: report.id, conversationId: report.conversationId, eventName: 'cla.feedback.created',
    deliveryState: 'pending_dispatch', dispatchAllowed: false, reason: 'bridge_unconfigured', attemptCount: 0, httpStatus: null, createdAt, reviewedAt: null,
  });
  return view(bag, actor, report);
}

export function conversationTitle(text) {
  const line = String(text || '').trim().split('\n')[0].replace(/\s+/g, ' ');
  return (line || 'Portal conversation').slice(0, 80);
}

export function addFollowUp(bag, actor, reportId, input = {}, { now = () => new Date().toISOString(), id = newId } = {}) {
  assertReporter(actor);
  const report = reportOr404(bag, actor, reportId);
  if (actor.id !== report.reporterId) fail('Report not found.');
  const key = String(input.idempotencyKey || '');
  if (!UUID.test(key)) fail('Save could not be retried safely. Reload this page.');
  const prior = bag.messages.find((m) => m.reportId === report.id && m.idempotencyKey === key);
  if (prior) {
    const ev = bag.outbox.find((e) => e.messageId === prior.id && e.eventName === 'cla.feedback.follow_up');
    return { ...view(bag, actor, report), turnEventId: ev ? ev.id : null };
  }
  if (report.status === 'fixed' || report.status === 'wont_fix') fail('This conversation is closed.');
  const recent = bag.outbox.filter((e) => e.reportId === report.id && e.eventName === 'cla.feedback.follow_up');
  if (recent.length >= 20) fail('This conversation has reached the message limit.');
  const cutoff = Date.now() - 10 * 60 * 1000;
  if (recent.filter((e) => Date.parse(e.createdAt) > cutoff).length >= 8) fail('Send the next message in a few minutes.');
  const body = cleanText(input.body, MAX_BODY, 'a message');
  const createdAt = now();
  const messageId = id();
  const eventId = id();
  if (eventId === report.id) fail('That message was not found.');
  bag.messages.push({ id: messageId, reportId: report.id, authorId: actor.id, authorKind: 'reporter', authorName: nameOf(actor), body, visibility: 'published', simulation: false, createdAt, idempotencyKey: key });
  bag.outbox.push({ id: eventId, reportId: report.id, feedbackId: report.id, conversationId: report.conversationId, messageId, eventName: 'cla.feedback.follow_up', deliveryState: 'pending_dispatch', dispatchAllowed: false, reason: 'pending_explicit', replyEnabled: true, attemptCount: 0, httpStatus: null, createdAt, outcome: null });
  report.updatedAt = createdAt;
  return { ...view(bag, actor, report), turnEventId: eventId };
}

/* Local demo only. It does not call the tech assistant. */
export function noteLocalDemoDispatch(bag, actor, reportId, eventId) {
  assertReporter(actor);
  const report = reportOr404(bag, actor, reportId);
  const ev = eventId
    ? bag.outbox.find((e) => e.id === eventId && e.feedbackId === report.id && (e.eventName === 'cla.feedback.created' || e.eventName === 'cla.feedback.follow_up'))
    : bag.outbox.find((e) => e.feedbackId === report.id && e.eventName === 'cla.feedback.created');
  if (!ev || ev.id === report.id) fail('That message was not found.');
  if (ev.outcome === 'outcome_unknown' || ev.outcome === 'accepted_unrecorded') {
    return { sent: false, replied: false, runAccepted: false, recorded: true, localDemo: true, reason: ev.outcome, error: 'Local demo only. Nothing was sent again.' };
  }
  if (ev.deliveryState === 'pending_dispatch') {
    ev.deliveryState = 'run_accepted';
    ev.reason = 'run_started';
    ev.dispatchAllowed = true;
    report.deliveryState = 'run_accepted';
    report.deliveryReason = 'run_started';
  }
  return { sent: false, replied: false, runAccepted: ev.deliveryState === 'run_accepted', recorded: true, localDemo: true, reason: 'run_started', error: '' };
}

/* Local demo only. The bubble is marked and is not a reply from the tech assistant. */
export function recordLocalDemoReply(bag, actor, reportId, input = {}, { now = () => new Date().toISOString(), id = newId } = {}) {
  assertReporter(actor);
  const report = reportOr404(bag, actor, reportId);
  const ev = input.eventId
    ? bag.outbox.find((e) => e.id === input.eventId && e.feedbackId === report.id)
    : [...bag.outbox].reverse().find((e) => e.feedbackId === report.id && e.deliveryState === 'run_accepted');
  if (!ev || ev.deliveryState !== 'run_accepted') fail('A local demo reply needs a locally accepted turn.');
  const key = String(input.idempotencyKey || '');
  if (!UUID.test(key)) fail('Save could not be retried safely. Reload this page.');
  const prior = bag.messages.find((m) => m.reportId === report.id && m.idempotencyKey === key);
  if (prior) return view(bag, actor, report);
  bag.messages.push({
    id: id(), reportId: report.id, authorId: null, authorKind: 'bot', authorName: 'Local demo',
    body: cleanText(input.body, MAX_BODY, 'a reply'), visibility: 'published', simulation: true, createdAt: now(), idempotencyKey: key,
  });
  return view(bag, actor, report);
}

export function replyToReport(bag, actor, reportId, input = {}, { now = () => new Date().toISOString(), id = newId } = {}) {
  assertReporter(actor);
  const report = reportOr404(bag, actor, reportId);
  const key = String(input.idempotencyKey || '');
  if (!UUID.test(key)) fail('Save could not be retried safely. Reload this page.');
  const prior = bag.messages.find((m) => m.reportId === report.id && m.idempotencyKey === key);
  if (prior) return view(bag, actor, report);
  const body = cleanText(input.body, MAX_BODY, 'a reply');
  const createdAt = now();
  const messageId = id();
  bag.messages.push({ id: messageId, reportId: report.id, authorId: actor.id, authorKind: canSupportStaffFeedback(actor) && actor.id !== report.reporterId ? 'support' : 'reporter', authorName: nameOf(actor), body, visibility: 'published', simulation: false, createdAt, idempotencyKey: key });
  bag.outbox.push({
    id: id(), reportId: report.id, feedbackId: report.id, conversationId: report.conversationId, messageId, eventName: 'cla.feedback.staff_reply',
    deliveryState: 'saved', dispatchAllowed: false, reason: 'staff_reply_held', attemptCount: 0, httpStatus: null, createdAt, reviewedAt: null,
  });
  report.updatedAt = createdAt;
  return view(bag, actor, report);
}

export function setReportStatus(bag, actor, reportId, status, { now = () => new Date().toISOString() } = {}) {
  assertSupport(actor);
  const report = reportOr404(bag, actor, reportId);
  if (!FEEDBACK_STATUSES.includes(status)) fail('Choose a status from the list.');
  report.status = status;
  report.updatedAt = now();
  report.statusSetBy = actor.id;
  return view(bag, actor, report);
}

export function addAttachment(bag, actor, reportId, file, { now = () => new Date().toISOString(), id = newId } = {}) {
  assertReporter(actor);
  const report = reportOr404(bag, actor, reportId);
  if (actor.id !== report.reporterId && !canSupportStaffFeedback(actor)) fail('Report not found.');
  const key = String(file && file.idempotencyKey || '');
  if (!UUID.test(key)) fail('Save could not be retried safely. Reload this page.');
  const prior = bag.attachments.find((a) => a.reportId === report.id && a.idempotencyKey === key);
  if (prior) return view(bag, actor, report);
  if (bag.attachments.filter((a) => a.reportId === report.id).length >= MAX_SCREENSHOTS) fail('Four screenshots is the limit on one report.');
  const meta = screenshotMeta(file);
  const attachmentId = id();
  bag.attachments.push({
    id: attachmentId, reportId: report.id, idempotencyKey: key, fileName: meta.name, mimeType: meta.mime, sizeBytes: meta.size,
    storagePath: `reports/${report.id}/${attachmentId}.${meta.ext}`, dataUrl: file.dataUrl || null, createdBy: actor.id, createdAt: now(),
  });
  report.updatedAt = now();
  return view(bag, actor, report);
}

export function attachmentContent(bag, actor, attachmentId) {
  assertReporter(actor);
  const row = bag.attachments.find((a) => a.id === attachmentId);
  const report = row && bag.reports.find((r) => r.id === row.reportId);
  if (!row || !report || !canSee(actor, report)) fail('Screenshot not found.');
  return { id: row.id, fileName: row.fileName, mimeType: row.mimeType, dataUrl: row.dataUrl || null, storagePath: row.storagePath };
}

export function publishDraft(bag, actor, messageId, { now = () => new Date().toISOString() } = {}) {
  assertSupport(actor);
  const message = bag.messages.find((m) => m.id === messageId);
  const report = message && reportOr404(bag, actor, message.reportId);
  if (!message || message.visibility !== 'draft_pending') fail('Draft not found.');
  const statusBefore = report.status;
  message.visibility = 'published';
  message.publishedAt = now();
  message.publishedBy = actor.id;
  report.updatedAt = now();
  report.status = statusBefore;
  return view(bag, actor, report);
}

export function reviewStaffReply(bag, actor, eventId, { now = () => new Date().toISOString() } = {}) {
  assertSupport(actor);
  const ev = bag.outbox.find((e) => e.id === eventId);
  const report = ev && reportOr404(bag, actor, ev.reportId);
  if (!ev || ev.eventName !== 'cla.feedback.staff_reply') fail('Reply not found.');
  ev.reviewedAt = now();
  ev.reviewedBy = actor.id;
  ev.deliveryState = 'saved';
  ev.dispatchAllowed = false;
  ev.reason = 'staff_reply_held';
  report.updatedAt = now();
  return view(bag, actor, report);
}

export function simulateReport(bag, actor, reportId, { now = () => new Date().toISOString(), id = newId } = {}) {
  assertReporter(actor);
  const report = reportOr404(bag, actor, reportId);
  const ev = bag.outbox.find((e) => e.id === report.createdEventId);
  if (ev && (ev.deliveryState === 'run_accepted' || ev.deliveryState === 'bot_acknowledged' || ev.deliveryState === 'replied')) fail('A webhook run was already accepted. The test simulation will not change that.');
  const createdAt = now();
  bag.messages.push({ id: id(), reportId: report.id, authorId: null, authorKind: 'simulation', authorName: 'Test simulation', body: SIMULATION_TEXT, visibility: 'published', simulation: true, createdAt, idempotencyKey: id() });
  if (ev) { ev.deliveryState = 'simulated'; ev.reason = 'simulated'; ev.dispatchAllowed = false; }
  report.updatedAt = createdAt;
  return view(bag, actor, report);
}

export async function dispatchOutboxEvent(bag, eventId, config, transport) {
  const ev = bag.outbox.find((e) => e.id === eventId);
  if (!ev) fail('Event not found.');
  const decision = await dispatchEvent({
    eventId: ev.id, feedbackId: ev.feedbackId, conversationId: ev.conversationId, eventName: ev.eventName,
    deliveryState: ev.deliveryState, dispatchAllowed: ev.dispatchAllowed,
  }, config, transport);
  if (!decision.duplicate) {
    if (decision.transportCalled) ev.attemptCount = (ev.attemptCount || 0) + 1;
    ev.deliveryState = decision.deliveryState;
    ev.reason = decision.reason;
    ev.httpStatus = decision.httpStatus;
    if (decision.deliveryState === 'run_accepted' && !ev.acceptedAt) ev.acceptedAt = new Date().toISOString();
  }
  const report = bag.reports.find((r) => r.createdEventId === ev.id);
  if (report) syncReport(bag, report);
  const packed = JSON.stringify(ev);
  if (config && config.token && packed.includes(config.token)) fail('A secret was stored. That is a bug.');
  return { ...decision, eventId: ev.id, attemptCount: ev.attemptCount || 0 };
}

export function botGet(bag, feedbackId, { asBot = false } = {}) {
  if (!asBot) fail('Portal users cannot load the bot copy.');
  const report = bag.reports.find((r) => r.id === feedbackId);
  if (!report) fail('Report not found.');
  return {
    id: report.id, conversationId: report.conversationId, title: report.title, body: report.body, status: report.status,
    pagePath: report.pagePath, orderDealId: report.orderDealId, orderFileNumber: report.orderFileNumber, isDemo: !!report.isDemo,
    reporterRole: report.reporterRole, reporterName: report.reporterName,
    messages: bag.messages.filter((m) => m.reportId === report.id).map(publicMessage),
    attachments: bag.attachments.filter((a) => a.reportId === report.id).map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, storagePath: a.storagePath })),
  };
}

export function botAck(bag, eventId, { asBot = false, now = () => new Date().toISOString() } = {}) {
  if (!asBot) fail('Portal users cannot acknowledge delivery.');
  const ev = bag.outbox.find((e) => e.id === eventId);
  if (!ev) fail('Event not found.');
  if (ev.deliveryState === 'bot_acknowledged' || ev.deliveryState === 'replied') return { eventId: ev.id, deliveryState: ev.deliveryState, idempotent: true };
  if (ev.deliveryState !== 'run_accepted') fail('This event has not been accepted by the webhook yet.');
  ev.deliveryState = 'bot_acknowledged';
  ev.reason = 'bot_read';
  ev.acknowledgedAt = now();
  const report = bag.reports.find((r) => r.createdEventId === ev.id);
  if (report) syncReport(bag, report);
  return { eventId: ev.id, deliveryState: ev.deliveryState, idempotent: false };
}

export function botDraftReply(bag, eventId, body, { asBot = false, now = () => new Date().toISOString(), id = newId } = {}) {
  if (!asBot) fail('Portal users cannot draft an assistant reply.');
  const ev = bag.outbox.find((e) => e.id === eventId);
  if (!ev) fail('Event not found.');
  const report = bag.reports.find((r) => r.id === ev.reportId);
  if (!report) fail('Report not found.');
  const statusBefore = report.status;
  if (ev.deliveryState === 'replied' && ev.draftMessageId) return { eventId: ev.id, messageId: ev.draftMessageId, deliveryState: 'replied', idempotent: true, status: report.status };
  if (ev.deliveryState !== 'bot_acknowledged') fail('Acknowledge the event before drafting a reply.');
  const text = cleanText(body, MAX_BODY, 'a draft reply');
  const messageId = id();
  bag.messages.push({ id: messageId, reportId: report.id, authorId: null, authorKind: 'bot', authorName: 'Assistant (draft)', body: text, visibility: 'draft_pending', simulation: false, createdAt: now(), idempotencyKey: messageId });
  ev.deliveryState = 'replied';
  ev.reason = 'draft_pending';
  ev.repliedAt = now();
  ev.draftMessageId = messageId;
  report.status = statusBefore;
  syncReport(bag, report);
  return { eventId: ev.id, messageId, deliveryState: 'replied', status: report.status, idempotent: false };
}
