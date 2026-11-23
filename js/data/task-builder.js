/* TASK BUILDER (John, Nov 13 2026; spec docs/specs/task-builder.md). Admin > Task Builder: admins build automated workflows ("flows")
 * for title files. Each flow is an if-then flow: a TRIGGER (something happens on a file), CONDITIONS (which files), then ACTIONS
 * (create tasks, send emails, wait, check again). Builds on the Task Templates work (PR 141).
 * TB-1: the page, who can use it, and the list of flows with a name, a trigger and an On / Off switch.
 * TB-2: conditions, steps (create a task, phone call task, wait, stop if EMD received) and the engine that runs them. Admins and Super admins only.
 * TB-6 (Nov 20): "Request a form from a party" steps (client requests; js/data/client-requests.js).
 * TB-7 (Nov 20): "Send an email" steps (js/data/flow-email.js) and the "File closed" trigger, for emails after closing.
 * Shared by the mock adapter (mock-part-task-builder.js), the Supabase adapter (supabase-task-builder.js) and the page. */

import { cleanRequestStep, requestStepText, formTitle } from './client-requests.js?v=202611261000';
import { cleanEmailStep, emailStepText } from './flow-email.js?v=202611291500';
export const TASK_BUILDER_ADMIN_ONLY = 'Only an Admin or Super admin can use Task Builder.';
export const FLOWS_RUN_NOTE = 'Templates that are On check open files about every 15 minutes and add their tasks to the file\'s Tasks tab. A template starts once per file (a closing date change can start it again). Use Try on one file to see a template work on a single order first.';
export const TRIAL_NOTE = 'Runs every step on this one file now, even while the template is Off. Every step runs now, whatever its day, so you see everything at once. The tasks are real tasks on this file, marked "Test run". It does not count as the template\'s real run on this file. A test run emails no client: form requests are added as tasks but not emailed, and an email step sends its test copy only to you.';

// What starts a flow. `days` = the trigger needs a number of days (1 to 60).
export const TRIGGERS = [
  { code: 'order_opened', label: 'Order opened' },
  { code: 'contract_received', label: 'Contract received' },
  { code: 'emd_received', label: 'EMD received' },
  { code: 'emd_not_received', label: 'EMD not received', days: 'days after the order was opened' },
  { code: 'commitment_received', label: 'Title commitment received' },
  { code: 'closing_date_set', label: 'Closing date set or changed' },
  { code: 'days_before_closing', label: 'Days before closing', days: 'days before the closing date' },
  { code: 'file_closed', label: 'File closed' },   // TB-7: the file's status becomes Closed (funds disbursed)
];
export const triggerOf = (code) => TRIGGERS.find((t) => t.code === code) || null;
export const triggerNeedsDays = (code) => !!(triggerOf(code) || {}).days;
// "EMD not received, 2 days after the order was opened"
export function triggerText(code, days) {
  const t = triggerOf(code); if (!t) return 'Unknown trigger';
  return t.days ? `${t.label}, ${days} ${Number(days) === 1 ? t.days.replace(/^days/, 'day') : t.days}` : t.label;
}

export const NAME_MIN = 3;
export const NAME_MAX = 80;
export const DESC_MAX = 500;
export const DAYS_MIN = 1;
export const DAYS_MAX = 60;

export function canManageTaskBuilder(u) {
  return !!(u && u.isAdmin && (u.status || 'active') === 'active' && !u.accountRole);
}

// Check what the admin typed. Throws a plain-English message; returns the cleaned flow fields.
export function cleanFlow(input = {}) {
  const name = String(input.name == null ? '' : input.name).replace(/\s+/g, ' ').trim();
  const description = String(input.description == null ? '' : input.description).trim();
  const trigger = String(input.trigger == null ? '' : input.trigger).trim();
  if (!name) throw new Error('Give the template a name, for example "EMD reminder".');
  if (name.length < NAME_MIN) throw new Error(`The name is too short. Use at least ${NAME_MIN} characters.`);
  if (name.length > NAME_MAX) throw new Error(`The name is too long. Use ${NAME_MAX} characters or fewer.`);
  if (description.length > DESC_MAX) throw new Error(`The description is too long. Use ${DESC_MAX} characters or fewer.`);
  if (!trigger) throw new Error('Choose what starts the template.');
  if (!triggerOf(trigger)) throw new Error('That trigger is not on the list. Choose one from "What starts it".');
  let triggerDays = null;
  if (triggerNeedsDays(trigger)) {
    const raw = String(input.triggerDays == null ? '' : input.triggerDays).trim();
    const n = Number(raw);
    if (!raw) throw new Error(`Enter how many days (${DAYS_MIN} to ${DAYS_MAX}).`);
    if (!Number.isInteger(n) || n < DAYS_MIN || n > DAYS_MAX) throw new Error(`Days must be a whole number from ${DAYS_MIN} to ${DAYS_MAX}.`);
    triggerDays = n;
  }
  return { name, description, trigger, triggerDays, conditions: cleanConditions(input.conditions), steps: cleanSteps(input.steps) };
}

// Same name check the database makes (case and spacing don't count).
export const sameName = (a, b) => String(a || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase();
export const DUPLICATE_NAME = 'Another template already has that name. Use a different name.';

/* ---------- TB-2 (John, Nov 13 2026): conditions, steps and the flow engine ----------
 * A flow's CONDITIONS pick which files it applies to. Each list is optional; an empty list means "any". All the lists
 * that are filled in must match (and); inside one list any value matches (or).
 * Its STEPS run in order: create a task, create a phone call task, wait a number of days, or stop if the EMD has been received.
 * Tasks go to everyone on the file who holds the chosen role. A named person, a backup person and "who can see it" come in TB-3.
 * The engine below is the one the demo portal runs; the database runs the same rules (migration 20261121010000_task_flow_engine.sql). */

export const RUNNABLE_TRIGGERS = ['order_opened', 'emd_received', 'emd_not_received', 'closing_date_set', 'days_before_closing', 'file_closed'];
// triggers that only ever start on something happening from now on, so turning the flow on asks no "which files" question
export const FROM_NOW_TRIGGERS = ['order_opened', 'file_closed'];
export const triggerRuns = (code) => RUNNABLE_TRIGGERS.includes(code);
export const TRIGGER_NOT_RUNNING = 'Templates that start on "Contract received" or "Title commitment received" can be saved but cannot be turned on yet. Those two triggers come in a later step.';

export const TX_KINDS = [['Purchase', 'Purchase (with a loan)'], ['Cash purchase', 'Cash purchase (no loan)'], ['Refinance', 'Refinance']];
export const STATES = ['MD', 'VA', 'DC', 'FL'];
// What kind of deal a file is, for the "Transaction type" condition.
export function dealTxKind(deal = {}) {
  if (deal.transactionType === 'Refinance') return 'Refinance';
  return Number(deal.loanAmount) > 0 ? 'Purchase' : 'Cash purchase';
}

// Who a task can go to (John, Nov 13). Value = the role on the file; label = what the admin sees.
export const ASSIGN_ROLES = [['Processor', 'Processor'], ['Preprocessor', 'Pre-processor'], ['Sales Person', 'Sales person'], ['Buyer Agent', "Buyer's agent"],
  ['Listing Agent', 'Listing agent'], ['Client-Buyer', 'Buyer'], ['Client-Seller', 'Seller'], ['Transaction Coordinator', 'Transaction coordinator'], ['Lender', 'Lender']];
export const roleLabel = (r) => (ASSIGN_ROLES.find(([v]) => v === r) || [r, r])[1];

export const STEP_TYPES = [['create_task', 'Create a task'], ['call_task', 'Create a phone call task'], ['client_request', 'Request a form from a party'], ['send_email', 'Send an email'], ['wait', 'Wait'], ['stop_if_emd_received', 'Stop if the EMD has been received']];
export const STEP_MAX = 20;
export const TITLE_MAX = 120;
export const DUE_MAX = 60;
export function stepText(s) {
  if (!s) return '';
  if (s.type === 'create_task' || s.type === 'call_task') {
    const due = Number(s.dueDays) === 0 ? 'due the same day' : `due in ${s.dueDays} ${Number(s.dueDays) === 1 ? 'day' : 'days'}`;
    return `${s.type === 'call_task' ? 'Phone call task' : 'Task'} for the ${roleLabel(s.assignTo).toLowerCase()}: "${s.title}", ${due}`;
  }
  if (s.type === 'client_request') return requestStepText(s);
  if (s.type === 'send_email') return emailStepText(s);
  if (s.type === 'wait') return `Wait ${s.days} ${Number(s.days) === 1 ? 'day' : 'days'}`;
  if (s.type === 'stop_if_emd_received') return 'Stop if the EMD has been received';
  return 'Unknown step';
}

const intIn = (v, lo, hi) => { const s = String(v == null ? '' : v).trim(); const n = Number(s); return s !== '' && Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
// Check the steps an admin entered. Throws plain words naming the step; returns the cleaned list.
export function cleanSteps(steps) {
  const list = Array.isArray(steps) ? steps : [];
  if (list.length > STEP_MAX) throw new Error(`A flow can have up to ${STEP_MAX} steps.`);
  return list.map((s, i) => {
    const n = `Step ${i + 1}`; const type = String((s && s.type) || '');
    if (!STEP_TYPES.some(([v]) => v === type)) throw new Error(`${n}: choose what the step does.`);
    if (type === 'create_task' || type === 'call_task') {
      const title = String(s.title == null ? '' : s.title).replace(/\s+/g, ' ').trim();
      if (title.length < 3) throw new Error(`${n}: give the task a name (at least 3 characters).`);
      if (title.length > TITLE_MAX) throw new Error(`${n}: the task name is too long. Use ${TITLE_MAX} characters or fewer.`);
      if (!ASSIGN_ROLES.some(([v]) => v === s.assignTo)) throw new Error(`${n}: choose who the task is for.`);
      const dueDays = intIn(s.dueDays, 0, DUE_MAX);
      if (dueDays == null) throw new Error(`${n}: due in must be a whole number of days from 0 to ${DUE_MAX}.`);
      return { type, title, assignTo: s.assignTo, dueDays };
    }
    if (type === 'client_request') return cleanRequestStep(s, n);
    if (type === 'send_email') return cleanEmailStep(s, n);
    if (type === 'wait') {
      const days = intIn(s.days, DAYS_MIN, DAYS_MAX);
      if (days == null) throw new Error(`${n}: wait must be a whole number of days from ${DAYS_MIN} to ${DAYS_MAX}.`);
      return { type, days };
    }
    return { type };
  });
}
export const hasTaskStep = (steps) => (steps || []).some((s) => ['create_task', 'call_task', 'client_request', 'send_email'].includes(s.type));
export const NO_TASK_STEP = 'Add at least one step that creates a task, requests a form or sends an email before turning the template on.';

export function cleanConditions(c = {}) {
  const pick = (v, ok) => [...new Set((Array.isArray(v) ? v : []).map(String))].filter(ok);
  const transactionTypes = pick(c.transactionTypes, (v) => TX_KINDS.some(([k]) => k === v));
  const states = pick(c.states, (v) => STATES.includes(v));
  const salesPeople = pick(c.salesPeople, (v) => /^[\w-]{1,64}$/.test(v)).slice(0, 50);
  return { transactionTypes, states, salesPeople };
}
export function conditionsText(c = {}) {
  const parts = [];
  if ((c.transactionTypes || []).length) parts.push(c.transactionTypes.join(' or '));
  if ((c.states || []).length) parts.push(c.states.join(' or '));
  if ((c.salesPeople || []).length) parts.push(`${c.salesPeople.length} sales ${c.salesPeople.length === 1 ? 'person' : 'people'}`);
  return parts.length ? parts.join('; ') : 'All files';
}
// Does this file match? salesIds = the sales people on the file.
export function flowMatches(conditions = {}, deal = {}, salesIds = []) {
  const c = cleanConditions(conditions);
  if (c.transactionTypes.length && !c.transactionTypes.includes(dealTxKind(deal))) return false;
  if (c.states.length && !c.states.includes(deal.state)) return false;
  if (c.salesPeople.length && !c.salesPeople.some((id) => salesIds.includes(id))) return false;
  return true;
}

/* ---------- the engine (pure; the adapters store runs and create the tasks) ----------
 * A run = one flow on one file: { flowId, dealId, stepIndex, nextAt, status: 'waiting' | 'done' | 'stopped' | 'skipped', checked }.
 * Only open files run. A flow starts once per file, except "Closing date set or changed", which can start again after its last run ended. */
const DAY = 86400000;
export const addDays = (iso, n) => new Date(new Date(iso).getTime() + n * DAY).toISOString();
export const dateOnly = (iso) => String(iso).slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(dateOnly(a) + 'T00:00:00Z') - Date.parse(dateOnly(b) + 'T00:00:00Z')) / DAY);
export const dealRuns = (deal) => !!deal && (deal.status || 'Open') === 'Open';
// a "File closed" flow runs on its closed file (a thank-you email after closing); every other flow only on open files
export const dealRunsFor = (flow, deal) => dealRuns(deal) || (!!flow && flow.trigger === 'file_closed' && !!deal && deal.status === 'Closed');

/* NEW FILES ONLY or EXISTING FILES TOO (John, Nov 14 2026): chosen when a flow is turned on. "New files only" (the default) means files
 * opened after the flow was turned on, so turning a flow on never sweeps the open files already there. Turning it off and on again
 * starts "from now" again. "Existing open files too" also covers the open files already there. */
export const SCOPES = [['new', 'New files only (opened from now on)'], ['all', 'Existing open files too']];
export const scopeText = (f) => (f && f.scope === 'all' ? 'New and existing open files' : 'New files only');
export const cleanScope = (v) => (v === 'all' ? 'all' : 'new');
export function inScope(flow, deal) {
  if (!flow || flow.scope === 'all' || !flow.activatedAt || flow.trigger === 'file_closed') return true;   // File closed: any file that closes from now on
  const made = Date.parse((deal && deal.createdAt) || '');
  return Number.isFinite(made) && made >= Date.parse(flow.activatedAt);
}
// Which active, runnable flows an event on a file starts. events: 'order_opened' | 'emd_received' | 'closing_date_set'.
export function flowsForEvent(flows, event, deal) {
  return (flows || []).filter((f) => f.active && f.trigger === event && triggerRuns(f.trigger) && hasTaskStep(f.steps) && (!deal || inScope(f, deal)));
}
// Time-based triggers: does this file meet the flow's trigger today?
export function timeTriggerMet(flow, deal, todayIso) {
  if (!dealRuns(deal) || !inScope(flow, deal)) return false;
  if (flow.trigger === 'emd_not_received') return !deal.emdReceived && !!deal.openDate && dayDiff(todayIso, deal.openDate) >= flow.triggerDays;
  if (flow.trigger === 'days_before_closing') { if (!deal.closingDate) return false; const left = dayDiff(deal.closingDate, todayIso); return left >= 0 && left <= flow.triggerDays; }
  return false;
}
// May this flow start on this file now? (no run yet; or, for closing date changes, the last run has ended)
export function mayStart(flow, runs) {
  const mine = (runs || []).filter((r) => r.flowId === flow.id && !r.trial);   // a test run never blocks the real one
  if (!mine.length) return true;
  return flow.trigger === 'closing_date_set' && mine.every((r) => r.status !== 'waiting');
}
export const newRun = (flow, dealId, nowIso, trial = false) => ({ flowId: flow.id, dealId, stepIndex: 0, nextAt: nowIso, status: 'waiting', checked: false, trial: !!trial, startedAt: nowIso, finishedAt: null, log: [] });

/* Move a run forward as far as it can go now. ctx: { deal, salesIds, emdReceived, nowIso }.
 * Returns the tasks to create ({ step, title, assignTo, dueDate, call }) and changes the run in place.
 * The flow's conditions are checked on the run's first move, so people added to the order after it was opened count.
 * A TEST RUN (run.trial, "Try on one file", John Nov 14) runs whether the flow is On or Off and skips its waits, so the admin sees every
 * step on that one file at once. Its tasks are real tasks on that file, marked "Test run". */
export function advanceRun(run, flow, ctx) {
  const out = [];
  if (run.status !== 'waiting' || !flow || (!flow.active && !run.trial) || Date.parse(run.nextAt) > Date.parse(ctx.nowIso)) return out;
  const end = (status, text) => { run.status = status; run.finishedAt = ctx.nowIso; run.log.push({ at: ctx.nowIso, text }); };
  if (!dealRunsFor(flow, ctx.deal)) { end('stopped', 'Stopped: the file is no longer open.'); return out; }
  if (!run.checked) {
    run.checked = true;
    if (!flowMatches(flow.conditions, ctx.deal, ctx.salesIds || [])) { end('skipped', 'Skipped: this file does not match the flow\'s conditions.'); return out; }
  }
  const steps = flow.steps || [];
  for (let guard = 0; guard <= STEP_MAX; guard++) {
    const s = steps[run.stepIndex];
    if (!s) { end('done', 'Finished.'); return out; }
    run.stepIndex += 1;
    if (s.type === 'create_task' || s.type === 'call_task') {
      out.push({ step: run.stepIndex, title: s.title, assignTo: s.assignTo, call: s.type === 'call_task', dueDate: dateOnly(addDays(ctx.nowIso, s.dueDays)) });
      run.log.push({ at: ctx.nowIso, text: `Step ${run.stepIndex}: ${stepText(s)}` });
    } else if (s.type === 'client_request') {
      out.push({ step: run.stepIndex, request: true, formCode: s.formCode, title: formTitle(s.formCode), assignTo: s.sendTo, dueDate: dateOnly(addDays(ctx.nowIso, s.dueDays)), remindEvery: s.remindEvery, remindTimes: s.remindTimes });
      run.log.push({ at: ctx.nowIso, text: `Step ${run.stepIndex}: ${stepText(s)}` });
    } else if (s.type === 'send_email') {
      out.push({ step: run.stepIndex, email: true, assignTo: s.sendTo, templateId: s.templateId || null, subject: s.subject || '', body: s.body || '', templateName: s.templateName || '', from: s.from || '', signature: !!s.signature });
      run.log.push({ at: ctx.nowIso, text: `Step ${run.stepIndex}: ${stepText(s)}${run.trial ? ' (test run: sent only to you)' : ''}` });
    } else if (s.type === 'wait' && run.trial) {
      run.log.push({ at: ctx.nowIso, text: `Step ${run.stepIndex}: wait ${s.days} ${s.days === 1 ? 'day' : 'days'} (skipped in a test run)` });
    } else if (s.type === 'wait') {
      run.nextAt = addDays(ctx.nowIso, s.days); run.log.push({ at: ctx.nowIso, text: `Step ${run.stepIndex}: waiting ${s.days} ${s.days === 1 ? 'day' : 'days'}` }); return out;
    } else if (s.type === 'stop_if_emd_received') {
      if (ctx.emdReceived) { end('stopped', `Step ${run.stepIndex}: stopped, the EMD has been received.`); return out; }
      run.log.push({ at: ctx.nowIso, text: `Step ${run.stepIndex}: EMD not received yet, going on` });
    }
  }
  end('done', 'Finished.'); return out;
}

/* ---------- PLAIN TIMING (John, Nov 21 2026) ----------
 * "Something simple like 'create this task 2 days after the order opens, due 1 day later'." Each step says when it happens, counted
 * from what starts the flow, adding up the Wait steps before it. Shown under every step in the form and in the flow list. */
const ANCHOR = { order_opened: 'the order opens', contract_received: 'the contract comes in', emd_received: 'the EMD is received',
  emd_not_received: 'the order opens', commitment_received: 'the title commitment comes in', closing_date_set: 'the closing date is set',
  days_before_closing: 'closing', file_closed: 'the file closes' };
const dayWord = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
// when something happens, `offset` days after the start (for "days before closing": counted from the closing date)
export function whenText(trigger, triggerDays, offset = 0) {
  const anchor = ANCHOR[trigger]; if (!anchor) return '';
  if (trigger === 'days_before_closing') {
    const d = offset - (Number(triggerDays) || 0);
    return d < 0 ? `${dayWord(-d)} before closing` : d === 0 ? 'On the closing date' : `${dayWord(d)} after closing`;
  }
  const d = offset + (trigger === 'emd_not_received' ? (Number(triggerDays) || 0) : 0);
  return d === 0 ? `As soon as ${anchor}` : `${dayWord(d)} after ${anchor}`;
}
const dueLater = (n) => (Number(n) === 0 ? 'due the same day' : `due ${dayWord(Number(n))} later`);
// one plain line per step: "2 days after the order opens: create this task, due 1 day later"
export function stepTimeline(trigger, triggerDays, steps) {
  let offset = 0;
  return (steps || []).map((s) => {
    const at = whenText(trigger, triggerDays, offset);
    const pre = at ? `${at}: ` : '';
    if (!s) return '';
    if (s.type === 'create_task') return `${pre}create this task, ${dueLater(s.dueDays || 0)}.`;
    if (s.type === 'call_task') return `${pre}create this phone call task, ${dueLater(s.dueDays || 0)}.`;
    if (s.type === 'client_request') return `${pre}send this request, ${dueLater(s.dueDays || 0)}.`;
    if (s.type === 'send_email') return `${pre}send this email.`;
    if (s.type === 'stop_if_emd_received') return `${pre}stop here if the EMD has been received.`;
    if (s.type === 'wait') { const n = Number(s.days) || 0; offset += n; const next = whenText(trigger, triggerDays, offset);
      return `Wait ${dayWord(n)}.${next ? ` The next step happens ${next.charAt(0).toLowerCase()}${next.slice(1)}.` : ''}`; }
    return '';
  });
}

/* ---------- WHEN BOX ON EACH STEP (John, Nov 21 2026, by voice) ----------
 * "Where do I put in here when to send this email?" Each task, call, request, email or stop step carries its own day: how many days after
 * the template starts it happens (0 = right away). There is no separate Wait step in the form any more. The engine still runs Wait steps:
 * saving puts a Wait between steps whose days differ, and opening a saved template turns its Waits back into days. So nothing in the
 * database or the engine changes, and templates saved before this keep working. */
export const AT_MAX = 60;
const EMAIL_LABEL = { 'Client-Buyer': 'buyer', 'Client-Seller': 'seller', 'Buyer Agent': "buyer's agent", 'Listing Agent': 'listing agent', 'Transaction Coordinator': 'transaction coordinator', Lender: 'lender' };
export const isAction = (s) => !!s && s.type !== 'wait';
// saved steps (with Waits) -> what the form shows: the same steps without Waits, each with its day ("at")
export function stepsToActions(steps) {
  let at = 0; const out = [];
  (steps || []).forEach((s) => { if (!s) return; if (s.type === 'wait') { at += Number(s.days) || 0; return; } out.push({ ...s, at }); });
  return out;
}
// what the form has -> steps to save: in day order (steps on the same day keep their order), a Wait wherever the day goes up
export function actionsToSteps(actions) {
  const list = (actions || []).filter(isAction).map((a, i) => {
    const raw = String(a.at == null ? '' : a.at).trim(); const n = Number(raw);
    if (raw === '' || !Number.isInteger(n) || n < 0 || n > AT_MAX) throw new Error(`Step ${i + 1}: "When" must be a whole number of days from 0 to ${AT_MAX} (0 = right away).`);
    return { a, at: n, i };
  }).sort((x, y) => x.at - y.at || x.i - y.i);
  const out = []; let cur = 0;
  list.forEach(({ a, at }) => { if (at > cur) { out.push({ type: 'wait', days: at - cur }); cur = at; } const { at: _drop, text: _t, ...s } = a; out.push(s); });
  if (out.length > STEP_MAX) throw new Error(`This template has too many steps once the days between them are counted (${out.length}; the most is ${STEP_MAX}). Put more steps on the same day, or split it into two templates.`);
  return out;
}
// one plain sentence for a step: "2 days after the order opens: create a task for the processor, due 1 day later."
export function actionLine(trigger, triggerDays, a) {
  if (!a) return '';
  const at = whenText(trigger, triggerDays, Number(a.at) || 0); const pre = at ? `${at}: ` : '';
  const who = (r) => (r ? `the ${roleLabel(r).toLowerCase()}` : 'someone (choose who below)');
  const due = (n) => (Number(n) === 0 ? 'due the same day' : `due ${n} ${Number(n) === 1 ? 'day' : 'days'} later`);
  if (a.type === 'create_task') return `${pre}create a task for ${who(a.assignTo)}, ${due(a.dueDays || 0)}.`;
  if (a.type === 'call_task') return `${pre}create a phone call task for ${who(a.assignTo)}, ${due(a.dueDays || 0)}.`;
  if (a.type === 'client_request') return `${pre}send a form request to ${who(a.sendTo)}, ${due(a.dueDays || 0)}.`;
  if (a.type === 'send_email') return `${pre}email ${a.sendTo === 'non_referring_agents' ? "the agents who didn't refer the file" : a.sendTo ? `the ${(EMAIL_LABEL[a.sendTo] || a.sendTo).toLowerCase()}` : 'someone (choose who below)'}.`;
  if (a.type === 'stop_if_emd_received') return `${pre}stop here if the EMD has been received.`;
  return '';
}
