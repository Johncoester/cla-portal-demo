/* TASK BUILDER, mock adapter (mirrors public.task_flows / task_flow_log / task_flow_runs; migrations 20261120010000_task_builder_flows.sql
 * and 20261121010000_task_flow_engine.sql).
 * TB-1 (John, Nov 13 2026): Admin > Task Builder lists flows (name, what starts it, On / Off). Admins and Super admins only, read and write.
 * Nothing is deleted: a flow is switched Off. Every create, change and switch is kept in a history (who, when, what).
 * TB-2: conditions and steps, and the engine. Events on a file (order opened, EMD received, closing date set) start runs; waits and the
 * day-based triggers are checked whenever the demo portal reads a file or task list (the hosted portal checks every 15 minutes).
 * Tasks a flow makes go to everyone on the file with the chosen role, like template copies (staff mark them done). */
import { cleanFlow, canManageTaskBuilder, TASK_BUILDER_ADMIN_ONLY, sameName, DUPLICATE_NAME, triggerText, triggerRuns, TRIGGER_NOT_RUNNING,
  hasTaskStep, NO_TASK_STEP, flowsForEvent, timeTriggerMet, mayStart, newRun, advanceRun, dealRuns, stepText, conditionsText } from './task-builder.js?v=202611211000';

export function ensureTaskFlows(d) {
  if (!Array.isArray(d.taskFlows)) d.taskFlows = [];
  if (!Array.isArray(d.taskFlowLog)) d.taskFlowLog = [];
  if (!Array.isArray(d.taskFlowRuns)) d.taskFlowRuns = [];
  d.taskFlows.forEach((f) => { if (!f.conditions) f.conditions = { transactionTypes: [], states: [], salesPeople: [] }; if (!Array.isArray(f.steps)) f.steps = []; });
  return d;
}

export function taskBuilderPart({ load, save, needUser, nid, now, fail, nameOf, notify }) {
  const db = () => ensureTaskFlows(load());
  const admin = () => { const u = needUser(); if (!canManageTaskBuilder(u)) fail(TASK_BUILDER_ADMIN_ONLY); return u; };
  const clean = (input) => { try { return cleanFlow(input); } catch (e) { return fail(e.message); } };
  const view = (f) => ({ ...f, steps: (f.steps || []).map((s) => ({ ...s, text: stepText(s) })), conditions: { ...f.conditions }, triggerText: triggerText(f.trigger, f.triggerDays),
    conditionsText: conditionsText(f.conditions), runsNow: triggerRuns(f.trigger),
    createdByName: f.createdBy ? nameOf(f.createdBy) : '', updatedByName: f.updatedBy ? nameOf(f.updatedBy) : '' });
  const one = (d, id) => d.taskFlows.find((f) => f.id === id) || fail('That flow was not found. Refresh the page and try again.');
  const nameTaken = (d, name, id) => d.taskFlows.some((f) => f.id !== id && sameName(f.name, name));
  const log = (d, u, f, action, detail = '') => d.taskFlowLog.unshift({ id: nid('tfl'), at: now(), by: u ? u.id : null, flowId: f.id, flowName: f.name, action, detail });
  const canRun = (f) => { if (!triggerRuns(f.trigger)) return TRIGGER_NOT_RUNNING; if (!hasTaskStep(f.steps)) return NO_TASK_STEP; return ''; };

  // ---------- the engine ----------
  const salesOn = (d, dealId) => [...new Set([...(d.dealSalesPeople || []).filter((s) => s.dealId === dealId).map((s) => s.salesId),
    ...d.participants.filter((p) => p.dealId === dealId && !p.removed && ['Sales Person', 'Sales Team'].includes(p.role)).map((p) => (d.contacts.find((c) => c.id === p.contactId) || {}).profileId).filter(Boolean)])];
  // Who gets a task: everyone on the file with that role. The file's processor, pre-processor and TC are also set on the order itself,
  // so when no one holds the role on the file's party list, the person set on the order gets it.
  const ORDER_FIELD = { Processor: 'processorId', Preprocessor: 'preprocessorUserId', 'Transaction Coordinator': 'tcUserId' };
  const holdersOf = (d, deal, role) => {
    const people = d.participants.filter((p) => p.dealId === deal.id && !p.removed && p.role === role)
      .map((p) => ({ participantId: p.id, profileId: (d.contacts.find((c) => c.id === p.contactId) || {}).profileId || null }));
    if (people.length || !ORDER_FIELD[role] || !deal[ORDER_FIELD[role]]) return people;
    return [{ participantId: null, profileId: deal[ORDER_FIELD[role]] }];
  };
  const makeTasks = (d, flow, run, deal, specs, at) => {
    let made = 0; const notes = [];
    specs.forEach((t) => {
      const people = holdersOf(d, deal, t.assignTo);
      if (!people.length) { notes.push({ at, text: `No ${t.assignTo} on this file, so "${t.title}" was not created.` }); return; }
      people.forEach((p) => {
        d.tasks.push({ id: nid('t'), dealId: deal.id, participantId: p.participantId, templateId: null, templateCode: null, templateVersion: null, kind: 'simple', title: t.title,
          description: `${t.call ? 'Phone call. ' : ''}Added by the "${flow.name}" flow (Task Builder).`, assignedRole: t.assignTo, status: 'todo', dueDate: t.dueDate, dueOverridden: false,
          formData: {}, savedAt: null, savedBy: null, completedAt: null, completedBy: null, createdBy: null, createdAt: at, lane: null, audiences: null, flowId: flow.id, flowRunId: run.id });
        made++;
        if (p.profileId && notify) notify([p.profileId], { kind: 'task', dealId: deal.id, title: `New task: ${t.title}`, link: `#/deals/${deal.id}/tasks` }, null);
      });
    });
    if (notes.length) { const last = run.status !== 'waiting' ? run.log.pop() : null; run.log.push(...notes); if (last) run.log.push(last); }
    return made;
  };
  const step = (d, run, at) => {
    const flow = d.taskFlows.find((f) => f.id === run.flowId); const deal = d.deals.find((x) => x.id === run.dealId);
    if (!flow || !deal) return 0;
    const specs = advanceRun(run, flow, { deal, salesIds: salesOn(d, deal.id), emdReceived: !!deal.emdReceived, nowIso: at });
    return specs.length ? makeTasks(d, flow, run, deal, specs, at) : 0;
  };
  const start = (d, flow, deal, at) => { const r = { id: nid('tfr'), ...newRun(flow, deal.id, at) }; d.taskFlowRuns.push(r); return r; };
  // an event on a file: start the flows it triggers. A new order's runs move on at the next check, after Place Order has added the people;
  // an EMD or closing date change moves them on straight away.
  function onEvent(dealId, event) {
    const d = db(); const deal = d.deals.find((x) => x.id === dealId); if (!dealRuns(deal)) return 0; const at = now(); let n = 0;
    flowsForEvent(d.taskFlows, event).forEach((f) => { if (mayStart(f, d.taskFlowRuns.filter((r) => r.dealId === dealId))) { start(d, f, deal, at); n++; } });
    if (!n) return 0;
    save(); lastTick = 0;
    if (event !== 'order_opened') tick();
    return n;
  }
  // day-based triggers and waits that are due
  function tick() {
    const d = db(); const at = now(); const today = at.slice(0, 10); let started = 0; let made = 0;
    d.taskFlows.filter((f) => f.active && ['emd_not_received', 'days_before_closing'].includes(f.trigger) && !canRun(f)).forEach((f) => {
      d.deals.forEach((deal) => { if (timeTriggerMet(f, deal, today) && mayStart(f, d.taskFlowRuns.filter((r) => r.dealId === deal.id))) { start(d, f, deal, at); started++; } }); });
    d.taskFlowRuns.filter((r) => r.status === 'waiting' && Date.parse(r.nextAt) <= Date.parse(at)).forEach((r) => { made += step(d, r, at); });
    if (started || made || d.taskFlowRuns.some((r) => r.finishedAt === at)) save();
    return { started, tasks: made };
  }
  let lastTick = 0;
  const lazyTick = () => { const t = Date.now(); if (t - lastTick < 5000) return; lastTick = t; try { tick(); } catch (e) { /* a flow problem never stops the page */ } };

  return {
    async listTaskFlows() { admin(); lazyTick(); const d = db();
      return { flows: d.taskFlows.map(view).sort((a, b) => a.name.localeCompare(b.name)),
        log: d.taskFlowLog.slice(0, 50).map((l) => ({ ...l, byName: l.by ? nameOf(l.by) : 'Task Builder' })),
        runs: d.taskFlowRuns.slice(-50).reverse().map((r) => { const f = d.taskFlows.find((z) => z.id === r.flowId) || {}; const deal = d.deals.find((z) => z.id === r.dealId) || {};
          return { ...r, log: [...r.log], flowName: f.name || '', fileNumber: deal.fileNumber || '' }; }),
        canEdit: true }; },
    async createTaskFlow(input = {}) { const u = admin(); const v = clean(input); const d = db();
      if (nameTaken(d, v.name, null)) fail(DUPLICATE_NAME);
      const t = now(); const f = { id: nid('flow'), ...v, active: false, createdAt: t, createdBy: u.id, updatedAt: t, updatedBy: u.id };
      d.taskFlows.push(f); log(d, u, f, 'created', `Starts: ${triggerText(f.trigger, f.triggerDays)}. ${f.steps.length} ${f.steps.length === 1 ? 'step' : 'steps'}. Off.`); save(); return view(f); },
    async updateTaskFlow(id, input = {}) { const u = admin(); const v = clean(input); const d = db(); const f = one(d, id);
      if (nameTaken(d, v.name, id)) fail(DUPLICATE_NAME);
      const changes = [];
      if (f.name !== v.name) changes.push(`name was "${f.name}"`);
      if (f.trigger !== v.trigger || (f.triggerDays || null) !== (v.triggerDays || null)) changes.push(`starts: was ${triggerText(f.trigger, f.triggerDays)}, now ${triggerText(v.trigger, v.triggerDays)}`);
      if ((f.description || '') !== v.description) changes.push('description changed');
      if (JSON.stringify(f.conditions) !== JSON.stringify(v.conditions)) changes.push(`which files: now ${conditionsText(v.conditions)}`);
      if (JSON.stringify(f.steps) !== JSON.stringify(v.steps)) changes.push(`steps changed (${v.steps.length})`);
      if (!changes.length) return view(f);
      if (f.active && canRun(v)) fail(canRun(v));
      Object.assign(f, v, { updatedAt: now(), updatedBy: u.id }); log(d, u, f, 'changed', changes.join('; ')); save(); return view(f); },
    async setTaskFlowActive(id, active) { const u = admin(); const d = db(); const f = one(d, id); const on = !!active;
      if (f.active === on) return view(f);
      if (on && canRun(f)) fail(canRun(f));
      f.active = on; f.updatedAt = now(); f.updatedBy = u.id; log(d, u, f, on ? 'turned on' : 'turned off'); save(); return view(f); },
    // Admin button: check every file now instead of waiting for the next check
    async runTaskFlowsNow() { admin(); lastTick = Date.now(); return tick(); },
    // used by the adapter's wrappers (mock-adapter.js): not for the page
    _taskFlowEvent: onEvent,
    _taskFlowTick: lazyTick,
  };
}

// Watch the calls that open a file, change its closing date or mark the EMD received, and fire the matching events afterwards.
export function watchTaskFlowEvents(api, load) {
  const event = api._taskFlowEvent; const lazyTick = api._taskFlowTick;   // the plain functions, taken before the adapter wraps every call
  const snap = (id) => { const deal = (load().deals || []).find((x) => x.id === id); return deal ? { emd: !!deal.emdReceived, closing: deal.closingDate || null } : null; };
  const fire = (id, before) => { const after = snap(id); if (!after) return;
    try {
      if (!before) event(id, 'order_opened');
      if (after.emd && !(before && before.emd)) event(id, 'emd_received');
      if (after.closing && after.closing !== (before && before.closing)) event(id, 'closing_date_set');
    } catch (e) { /* a flow problem never stops saving an order */ } };
  const wrap = (name, idOf) => { const fn = api[name]; if (typeof fn !== 'function') return;
    api[name] = async function (...args) { const id0 = idOf(args); const before = id0 ? snap(id0) : null; const r = await fn.apply(this, args);
      const id = id0 || (r && r.id); if (id) fire(id, before); return r; }; };
  wrap('createDeal', () => null);
  wrap('updateDeal', (a) => a[0]);
  wrap('updateEmdAlta', (a) => a[0]);
  ['getDeal', 'listTasks'].forEach((name) => { const fn = api[name]; if (typeof fn !== 'function') return;
    api[name] = async function (...args) { lazyTick(); return fn.apply(this, args); }; });
}
