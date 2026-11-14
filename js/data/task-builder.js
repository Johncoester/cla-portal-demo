/* TASK BUILDER (John, Nov 13 2026; spec docs/specs/task-builder.md). Admin > Task Builder: admins build automated workflows ("flows")
 * for title files. Each flow is an if-then flow: a TRIGGER (something happens on a file), CONDITIONS (which files), then ACTIONS
 * (create tasks, send emails, wait, check again). Builds on the Task Templates work (PR 141).
 * TB-1: the page, who can use it, and the list of flows with a name, a trigger and an On / Off switch.
 * TB-2: conditions, steps (create a task, phone call task, wait, stop if EMD received) and the engine that runs them. Admins and Super admins only.
 * Shared by the mock adapter (mock-part-task-builder.js), the Supabase adapter (supabase-task-builder.js) and the page. */

export const TASK_BUILDER_ADMIN_ONLY = 'Only an Admin or Super admin can use Task Builder.';
export const FLOWS_RUN_NOTE = 'Flows that are On check open files about every 15 minutes and add their tasks to the file\'s Tasks tab. A flow starts once per file (a closing date change can start it again).';

// What starts a flow. `days` = the trigger needs a number of days (1 to 60).
export const TRIGGERS = [
  { code: 'order_opened', label: 'Order opened' },
  { code: 'contract_received', label: 'Contract received' },
  { code: 'emd_received', label: 'EMD received' },
  { code: 'emd_not_received', label: 'EMD not received', days: 'days after the order was opened' },
  { code: 'commitment_received', label: 'Title commitment received' },
  { code: 'closing_date_set', label: 'Closing date set or changed' },
  { code: 'days_before_closing', label: 'Days before closing', days: 'days before the closing date' },
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
  if (!name) throw new Error('Give the flow a name, for example "EMD reminder".');
  if (name.length < NAME_MIN) throw new Error(`The name is too short. Use at least ${NAME_MIN} characters.`);
  if (name.length > NAME_MAX) throw new Error(`The name is too long. Use ${NAME_MAX} characters or fewer.`);
  if (description.length > DESC_MAX) throw new Error(`The description is too long. Use ${DESC_MAX} characters or fewer.`);
  if (!trigger) throw new Error('Choose what starts the flow.');
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
export const DUPLICATE_NAME = 'Another flow already has that name. Use a different name.';

/* ---------- TB-2 (John, Nov 13 2026): conditions, steps and the flow engine ----------
 * A flow's CONDITIONS pick which files it applies to. Each list is optional; an empty list means "any". All the lists
 * that are filled in must match (and); inside one list any value matches (or).
 * Its STEPS run in order: create a task, create a phone call task, wait a number of days, or stop if the EMD has been received.
 * Tasks go to everyone on the file who holds the chosen role. A named person, a backup person and "who can see it" come in TB-3.
 * The engine below is the one the demo portal runs; the database runs the same rules (migration 20261121010000_task_flow_engine.sql). */

export const RUNNABLE_TRIGGERS = ['order_opened', 'emd_received', 'emd_not_received', 'closing_date_set', 'days_before_closing'];
export const triggerRuns = (code) => RUNNABLE_TRIGGERS.includes(code);
export const TRIGGER_NOT_RUNNING = 'Flows that start on "Contract received" or "Title commitment received" can be saved but cannot be turned on yet. Those two triggers come in a later step.';

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

export const STEP_TYPES = [['create_task', 'Create a task'], ['call_task', 'Create a phone call task'], ['wait', 'Wait'], ['stop_if_emd_received', 'Stop if the EMD has been received']];
export const STEP_MAX = 20;
export const TITLE_MAX = 120;
export const DUE_MAX = 60;
export function stepText(s) {
  if (!s) return '';
  if (s.type === 'create_task' || s.type === 'call_task') {
    const due = Number(s.dueDays) === 0 ? 'due the same day' : `due in ${s.dueDays} ${Number(s.dueDays) === 1 ? 'day' : 'days'}`;
    return `${s.type === 'call_task' ? 'Phone call task' : 'Task'} for the ${roleLabel(s.assignTo).toLowerCase()}: "${s.title}", ${due}`;
  }
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
    if (type === 'wait') {
      const days = intIn(s.days, DAYS_MIN, DAYS_MAX);
      if (days == null) throw new Error(`${n}: wait must be a whole number of days from ${DAYS_MIN} to ${DAYS_MAX}.`);
      return { type, days };
    }
    return { type };
  });
}
export const hasTaskStep = (steps) => (steps || []).some((s) => s.type === 'create_task' || s.type === 'call_task');
export const NO_TASK_STEP = 'Add at least one "Create a task" or "Create a phone call task" step before turning the flow on.';

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

// Which active, runnable flows an event on a file starts. events: 'order_opened' | 'emd_received' | 'closing_date_set'.
export function flowsForEvent(flows, event) {
  return (flows || []).filter((f) => f.active && f.trigger === event && triggerRuns(f.trigger) && hasTaskStep(f.steps));
}
// Time-based triggers: does this file meet the flow's trigger today?
export function timeTriggerMet(flow, deal, todayIso) {
  if (!dealRuns(deal)) return false;
  if (flow.trigger === 'emd_not_received') return !deal.emdReceived && !!deal.openDate && dayDiff(todayIso, deal.openDate) >= flow.triggerDays;
  if (flow.trigger === 'days_before_closing') { if (!deal.closingDate) return false; const left = dayDiff(deal.closingDate, todayIso); return left >= 0 && left <= flow.triggerDays; }
  return false;
}
// May this flow start on this file now? (no run yet; or, for closing date changes, the last run has ended)
export function mayStart(flow, runs) {
  const mine = (runs || []).filter((r) => r.flowId === flow.id);
  if (!mine.length) return true;
  return flow.trigger === 'closing_date_set' && mine.every((r) => r.status !== 'waiting');
}
export const newRun = (flow, dealId, nowIso) => ({ flowId: flow.id, dealId, stepIndex: 0, nextAt: nowIso, status: 'waiting', checked: false, startedAt: nowIso, finishedAt: null, log: [] });

/* Move a run forward as far as it can go now. ctx: { deal, salesIds, emdReceived, nowIso }.
 * Returns the tasks to create ({ step, title, assignTo, dueDate, call }) and changes the run in place.
 * The flow's conditions are checked on the run's first move, so people added to the order after it was opened count. */
export function advanceRun(run, flow, ctx) {
  const out = [];
  if (run.status !== 'waiting' || !flow || !flow.active || Date.parse(run.nextAt) > Date.parse(ctx.nowIso)) return out;
  const end = (status, text) => { run.status = status; run.finishedAt = ctx.nowIso; run.log.push({ at: ctx.nowIso, text }); };
  if (!dealRuns(ctx.deal)) { end('stopped', 'Stopped: the file is no longer open.'); return out; }
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
    } else if (s.type === 'wait') {
      run.nextAt = addDays(ctx.nowIso, s.days); run.log.push({ at: ctx.nowIso, text: `Step ${run.stepIndex}: waiting ${s.days} ${s.days === 1 ? 'day' : 'days'}` }); return out;
    } else if (s.type === 'stop_if_emd_received') {
      if (ctx.emdReceived) { end('stopped', `Step ${run.stepIndex}: stopped, the EMD has been received.`); return out; }
      run.log.push({ at: ctx.nowIso, text: `Step ${run.stepIndex}: EMD not received yet, going on` });
    }
  }
  end('done', 'Finished.'); return out;
}
