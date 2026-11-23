/* TASK BUILDER, mock adapter (mirrors public.task_flows / task_flow_log / task_flow_runs; migrations 20261120010000_task_builder_flows.sql
 * and 20261121010000_task_flow_engine.sql).
 * TB-1 (John, Nov 13 2026): Admin > Task Builder lists flows (name, what starts it, On / Off). Admins and Super admins only, read and write.
 * Nothing is deleted: a flow is switched Off. Every create, change and switch is kept in a history (who, when, what).
 * TB-2: conditions and steps, and the engine. Events on a file (order opened, EMD received, closing date set) start runs; waits and the
 * day-based triggers are checked whenever the demo portal reads a file or task list (the hosted portal checks every 15 minutes).
 * Tasks a flow makes go to everyone on the file with the chosen role, like template copies (staff mark them done).
 * Nov 14 (John): turning a flow on asks "new files only" (default) or "existing open files too"; "Try on one file" runs a flow once on a
 * chosen file as a test run (On or Off, waits skipped, tasks marked "Test run").
 * TB-6 (John, Nov 20): "Request a form from a party" steps (client requests). The request is the party's own intake form task (the
 * existing copy when the file already has one, else a new copy), so it completes itself when they submit it. Reminder state is kept in
 * d.taskFlowRequests, and every email is ONE digest per person and file listing everything still needed (outbox only).
 * TB-7 (John, Nov 20): "Send an email" steps (a saved file template or a written message, with merge fields) and the "File closed"
 * trigger. Emails are queued in the outbox; a test run sends the email only to the admin trying it. */
import { cleanFlow, canManageTaskBuilder, TASK_BUILDER_ADMIN_ONLY, sameName, DUPLICATE_NAME, triggerText, triggerRuns, TRIGGER_NOT_RUNNING,
  hasTaskStep, NO_TASK_STEP, flowsForEvent, taskKeys, isTestRunTask, timeTriggerMet, mayStart, newRun, advanceRun, dealRuns, dealRunsFor, stepText, conditionsText, cleanScope, scopeText } from './task-builder.js?v=202611291600';
import { renderFlowEmail, testCopy, emailRecipients, emailRoleName, signatureText, withSignature } from './flow-email.js?v=202611291500';
import { SEED_SHARED } from './file-email-templates.js?v=202611291500';
import { newRequestState, afterSent, digestsDue, digestEmail } from './client-requests.js?v=202611261000';
import { senderFor } from './email-senders.js?v=202611247700';
import { taskEnabled } from './task-switches.js?v=202611247700';

export function ensureTaskFlows(d) {
  if (!Array.isArray(d.taskFlows)) d.taskFlows = [];
  if (!Array.isArray(d.taskFlowLog)) d.taskFlowLog = [];
  if (!Array.isArray(d.taskFlowRuns)) d.taskFlowRuns = [];
  if (!Array.isArray(d.taskFlowRequests)) d.taskFlowRequests = [];
  d.taskFlows.forEach((f) => { if (!f.conditions) f.conditions = { transactionTypes: [], states: [], salesPeople: [] }; if (!Array.isArray(f.steps)) f.steps = []; });
  return d;
}

export function taskBuilderPart({ load, save, needUser, nid, now, fail, nameOf, notify }) {
  const db = () => ensureTaskFlows(load());
  const admin = () => { const u = needUser(); if (!canManageTaskBuilder(u)) fail(TASK_BUILDER_ADMIN_ONLY); return u; };
  const clean = (input) => { try { return cleanFlow(input); } catch (e) { return fail(e.message); } };
  const view = (f) => ({ ...f, steps: (f.steps || []).map((s) => ({ ...s, text: stepText(s) })), conditions: { ...f.conditions }, triggerText: triggerText(f.trigger, f.triggerDays, f.triggerTaskName), triggerTask: f.triggerTask || null, triggerTaskName: f.triggerTaskName || null,
    conditionsText: conditionsText(f.conditions), runsNow: triggerRuns(f.trigger), scope: f.scope || 'new', scopeText: scopeText(f), activatedAt: f.activatedAt || null,
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
  // ---------- client requests (TB-6) ----------
  const currentTemplate = (d, code) => (taskEnabled(d, code) ? (d.taskTemplates || []) : []).filter((t) => t.code === code && t.active && !t.retiredAt).sort((a, b) => b.version - a.version)[0] || null;
  const contactOf = (d, participantId) => { const p = d.participants.find((z) => z.id === participantId); return p ? d.contacts.find((c) => c.id === p.contactId) || null : null; };
  // who gets a request's email: the party's portal account, worked out when the email goes (like every reminder, only portal accounts are
  // emailed; a party who has not accepted their invite yet keeps the request waiting until they have one)
  const recipientOf = (d, task) => {
    const c = task.participantId ? contactOf(d, task.participantId) : null; const pr = c && c.profileId ? (d.profiles || []).find((z) => z.id === c.profileId) : null;
    if (!pr || pr.status !== 'active' || !pr.email) return null;
    return { key: pr.id, profileId: pr.id, email: pr.email, firstName: pr.firstName || '', name: `${pr.firstName || ''} ${pr.lastName || ''}`.trim() || pr.email };
  };
  const makeRequests = (d, flow, run, deal, t, at, notes) => {
    const parts = d.participants.filter((p) => p.dealId === deal.id && !p.removed && p.role === t.assignTo);
    if (!parts.length) { notes.push({ at, text: `No ${t.assignTo} on this file, so "${t.title}" was not requested.` }); return 0; }
    const tp = currentTemplate(d, t.formCode); let made = 0;
    parts.forEach((p) => {
      let task = d.tasks.find((z) => z.participantId === p.id && z.templateCode === t.formCode && z.status !== 'cancelled');
      if (task && task.status === 'done') { notes.push({ at, text: `"${t.title}" was already submitted by ${nameOfPart(d, p)}, so it was not requested again.` }); return; }
      if (!task) {
        if (!tp) { notes.push({ at, text: `The "${t.title}" form is switched off or retired, so it was not requested.` }); return; }
        task = { id: nid('t'), dealId: deal.id, participantId: p.id, templateId: tp.id, templateCode: tp.code, templateVersion: tp.version, kind: 'form', title: tp.title,
          description: `${run.trial ? 'Test run. ' : ''}Requested by the "${flow.name}" flow (Task Builder). ${tp.description || ''}`.trim(), assignedRole: p.role, status: 'todo', dueDate: t.dueDate, dueOverridden: false,
          formData: {}, savedAt: null, savedBy: null, completedAt: null, completedBy: null, createdBy: null, createdAt: at, lane: tp.lane || null, audiences: tp.audiences ? [...tp.audiences] : null,
          flowId: flow.id, flowRunId: run.id };
        d.tasks.push(task); made++;
      }
      if (run.trial) return;   // a test run makes the task but emails nobody
      if (d.taskFlowRequests.some((r) => r.taskId === task.id)) return;   // already requested by another flow: one set of reminders
      if (!recipientOf(d, task)) notes.push({ at, text: `${nameOfPart(d, p)} has no portal account yet, so the "${t.title}" email waits until they accept their invite.` });
      d.taskFlowRequests.push({ id: nid('tfq'), flowId: flow.id, runId: run.id, ...newRequestState(task.id, deal.id, null, t, at) });
    });
    return made;
  };
  const nameOfPart = (d, p) => { const c = d.contacts.find((z) => z.id === p.contactId); return c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'the party' : 'the party'; };
  // ONE email per person and file, listing everything still needed from them there
  function sendDigests(d, at) {
    const rows = d.taskFlowRequests.map((r) => { const task = d.tasks.find((t) => t.id === r.taskId) || null; const who = task && recipientOf(d, task);
      return { ...r, task, recipientKey: who ? who.key : null }; });
    rows.forEach((r) => { if (r.task && !['todo', 'in_progress', 'blocked'].includes(r.task.status) && r.nextAt) d.taskFlowRequests.find((z) => z.id === r.id).nextAt = null; });
    const last = (key, dealId) => { const o = d.outbox.filter((z) => z.templateKey === 'client_request_digest' && z.recipientKey === key && z.dealId === dealId).map((z) => z.createdAt).sort().pop(); return o || null; };
    let n = 0;
    digestsDue(rows.filter((r) => r.recipientKey), at, last).forEach((g) => {
      const deal = d.deals.find((z) => z.id === g.dealId); if (!deal || !dealRuns(deal)) return;
      const who = recipientOf(d, g.items[0].task); if (!who) return;
      const isReminder = !g.due.some((r) => r.sent === 0);
      const { subject, body } = digestEmail({ firstName: who.firstName, fileNumber: deal.fileNumber, address: [deal.street, deal.city].filter(Boolean).join(', '), items: g.items, isReminder });
      const ob = { id: nid('ob'), channel: 'email', status: 'queued', toProfileId: who.profileId, toEmail: who.email, toName: who.name, subject, body, taskId: null, dealId: deal.id,
        createdBy: null, createdAt: at, sentAt: null, templateKey: 'client_request_digest', recipientKey: who.key, requestTaskIds: g.items.map((r) => r.taskId) };
      Object.assign(ob, senderFor(d, 'processor', deal.id)); d.outbox.push(ob); n++;
      g.items.forEach((r) => { const st = d.taskFlowRequests.find((z) => z.id === r.id); if (st.nextAt && Date.parse(st.nextAt) <= Date.parse(at)) afterSent(st, at); });
      if (who.profileId && notify) notify([who.profileId], { kind: 'reminder', dealId: deal.id, title: subject, link: `#/deals/${deal.id}/tasks` }, null);
    });
    return n;
  }
  // ---------- emails (TB-7) ----------
  // the demo portal's shared file templates (the same list and ids as Admin > Email Templates in the demo, supabase-gmail.js gmailMock)
  const templateOf = (id) => { const i = SEED_SHARED.findIndex((_, k) => `fet-seed-${k + 1}` === id); return i < 0 ? null : SEED_SHARED[i]; };
  const dealForMail = (d, deal) => { const pr = (d.profiles || []).find((z) => z.id === deal.processorId) || null;
    return { ...deal, processorName: pr ? `${pr.firstName || ''} ${pr.lastName || ''}`.trim() : '', processorEmail: pr ? pr.email || '' : '',
      participants: d.participants.filter((p) => p.dealId === deal.id && !p.removed).map((p) => ({ role: p.role, contact: d.contacts.find((c) => c.id === p.contactId) || null })) }; };
  const sendEmails = (d, flow, run, deal, t, at, notes) => {
    let src = t.templateId ? templateOf(t.templateId) : { subject: t.subject, body: t.body };
    if (!src) { notes.push({ at, text: `The "${t.templateName || 'saved'}" template was not found or is turned off, so no email was sent.` }); return; }
    const people = emailRecipients(d.participants.filter((p) => p.dealId === deal.id && !p.removed), t.assignTo, deal.sourceOfBusiness)
      .map((p) => d.contacts.find((c) => c.id === p.contactId)).filter(Boolean);
    const withEmail = people.filter((c) => String(c.email || '').trim());
    const who = emailRoleName(t.assignTo).toLowerCase();
    if (!people.length) { notes.push({ at, text: `No ${who} on this file, so the email was not sent.` }); return; }
    if (!withEmail.length) { notes.push({ at, text: `The ${who} on this file has no email address, so the email was not sent.` }); return; }
    const mailDeal = dealForMail(d, deal); const today = at.slice(0, 10);
    // who it is from (Nov 22): a named staff member, else the file's processor; and their signature when the step asks for it
    let person = t.from ? (d.profiles || []).find((z) => z.id === t.from && (z.status || 'active') === 'active' && z.email) : null;
    if (t.from && !person) notes.push({ at, text: 'The person this email is from is no longer an active staff member with an email, so it goes from the file\'s processor.' });
    const proc = (d.profiles || []).find((z) => z.id === deal.processorId) || null;
    const signer = person || proc;
    const senderName = signer ? `${signer.firstName || ''} ${signer.lastName || ''}`.trim() : '';
    const sig = t.signature && signer ? signatureText(signer, ((d.crmSignatures || {})[signer.id] || {}).html || '') : '';
    const fromFields = person ? { senderType: 'other', senderProfileId: person.id, fromEmail: person.email, fromName: senderName, email: person.email, displayName: senderName, from: `${senderName} <${person.email}>`, senderFallback: false }
      : senderFor(d, 'processor', deal.id);
    const render = (to) => { const mail = renderFlowEmail(mailDeal, { email: to }, src, { today, senderName }); return { ...mail, body: withSignature(mail.body, sig) }; };
    const queue = (toProfileId, toEmail, toName, mail) => { const ob = { id: nid('ob'), channel: 'email', status: 'queued', kind: 'task_flow_email', toProfileId, toEmail, toName,
      subject: mail.subject, body: mail.body, taskId: null, dealId: deal.id, createdBy: run.trialTo || null, createdAt: at, sentAt: null, templateKey: 'task_flow_email', flowId: flow.id, runId: run.id };
      Object.assign(ob, fromFields); d.outbox.push(ob); };
    if (run.trial) {   // test copy: the real names and address, sent only to the admin trying it
      const me = (d.profiles || []).find((z) => z.id === run.trialTo); if (!me || !me.email) return;
      const first = render(String(withEmail[0].email).trim().toLowerCase());
      queue(me.id, me.email, `${me.firstName || ''} ${me.lastName || ''}`.trim() || me.email, testCopy(first, withEmail.map((c) => `${c.firstName || ''} ${c.lastName || ''}`.trim() + ` <${c.email}>`).join(', ')));
      notes.push({ at, text: `Test copy queued for you (${me.email})${person ? `, from ${senderName}` : ''}.` }); return;
    }
    withEmail.forEach((c) => { const to = String(c.email).trim().toLowerCase();
      queue(c.profileId || null, to, `${c.firstName || ''} ${c.lastName || ''}`.trim() || to, render(to)); });
    if (withEmail.length < people.length) notes.push({ at, text: `${people.length - withEmail.length} ${who} on this file has no email address and was skipped.` });
  };
  const makeTasks = (d, flow, run, deal, specs, at) => {
    let made = 0; const notes = [];
    specs.forEach((t) => {
      if (t.request) { made += makeRequests(d, flow, run, deal, t, at, notes); return; }
      if (t.email) { sendEmails(d, flow, run, deal, t, at, notes); return; }
      const people = holdersOf(d, deal, t.assignTo);
      if (!people.length) { notes.push({ at, text: `No ${t.assignTo} on this file, so "${t.title}" was not created.` }); return; }
      people.forEach((p) => {
        d.tasks.push({ id: nid('t'), dealId: deal.id, participantId: p.participantId, templateId: null, templateCode: null, templateVersion: null, kind: 'simple', title: t.title,
          description: `${run.trial ? 'Test run. ' : ''}${t.call ? 'Phone call. ' : ''}Added by the "${flow.name}" flow (Task Builder).`, assignedRole: t.assignTo, status: 'todo', dueDate: t.dueDate, dueOverridden: false,
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
    const made = specs.length ? makeTasks(d, flow, run, deal, specs, at) : 0;
    if (specs.some((t) => t.request) && !run.trial) sendDigests(d, at);   // new requests go out straight away, in one email per person
    return made;
  };
  const start = (d, flow, deal, at) => { const r = { id: nid('tfr'), ...newRun(flow, deal.id, at) }; d.taskFlowRuns.push(r); return r; };
  // an event on a file: start the flows it triggers. A new order's runs move on at the next check, after Place Order has added the people;
  // an EMD or closing date change moves them on straight away.
  function onEvent(dealId, event, keys) {
    const d = db(); const deal = d.deals.find((x) => x.id === dealId); if (!dealRuns(deal) && !(event === 'file_closed' && deal && deal.status === 'Closed')) return 0; const at = now(); let n = 0;
    flowsForEvent(d.taskFlows, event, deal, keys).forEach((f) => { if (mayStart(f, d.taskFlowRuns.filter((r) => r.dealId === dealId))) { start(d, f, deal, at); n++; } });
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
    const emails = sendDigests(d, at);   // reminders that are due, one email per person and file
    if (started || made || emails || d.taskFlowRuns.some((r) => r.finishedAt === at)) save();
    return { started, tasks: made, emails };
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
      d.taskFlows.push(f); log(d, u, f, 'created', `Starts: ${triggerText(f.trigger, f.triggerDays, f.triggerTaskName)}. ${f.steps.length} ${f.steps.length === 1 ? 'step' : 'steps'}. Off.`); save(); return view(f); },
    async updateTaskFlow(id, input = {}) { const u = admin(); const v = clean(input); const d = db(); const f = one(d, id);
      if (nameTaken(d, v.name, id)) fail(DUPLICATE_NAME);
      const changes = [];
      if (f.name !== v.name) changes.push(`name was "${f.name}"`);
      if (f.trigger !== v.trigger || (f.triggerDays || null) !== (v.triggerDays || null) || (f.triggerTask || null) !== (v.triggerTask || null)) changes.push(`starts: was ${triggerText(f.trigger, f.triggerDays, f.triggerTaskName)}, now ${triggerText(v.trigger, v.triggerDays, v.triggerTaskName)}`);
      if ((f.description || '') !== v.description) changes.push('description changed');
      if (JSON.stringify(f.conditions) !== JSON.stringify(v.conditions)) changes.push(`which files: now ${conditionsText(v.conditions)}`);
      if (JSON.stringify(f.steps) !== JSON.stringify(v.steps)) changes.push(`steps changed (${v.steps.length})`);
      if (!changes.length) return view(f);
      if (f.active && canRun(v)) fail(canRun(v));
      Object.assign(f, v, { updatedAt: now(), updatedBy: u.id }); log(d, u, f, 'changed', changes.join('; ')); save(); return view(f); },
    async setTaskFlowActive(id, active, { scope } = {}) { const u = admin(); const d = db(); const f = one(d, id); const on = !!active;
      if (f.active === on) return view(f);
      if (on && canRun(f)) fail(canRun(f));
      if (on) { f.scope = cleanScope(scope); f.activatedAt = now(); }
      f.active = on; f.updatedAt = now(); f.updatedBy = u.id; log(d, u, f, on ? 'turned on' : 'turned off', on ? `${scopeText(f)}.` : ''); save(); return view(f); },
    // Try on one file (John, Nov 14): one test run of this flow on one open file, now
    async tryTaskFlowOnFile(id, dealId) { const u = admin(); const d = db(); const f = one(d, id);
      if (!hasTaskStep(f.steps)) fail(NO_TASK_STEP);
      const deal = d.deals.find((x) => x.id === dealId); if (!deal) fail('Choose a file to try the flow on.');
      if (!dealRunsFor(f, deal)) fail(f.trigger === 'file_closed' ? 'That file is cancelled or on hold. Choose an open or closed file.' : 'That file is not open. Choose an open file.');
      const at = now(); const run = start(d, f, deal, at); run.trial = true; run.trialTo = u.id;
      const tasks = step(d, run, at); save();
      return { runId: run.id, status: run.status, tasks, log: [...run.log], fileNumber: deal.fileNumber || '' }; },
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
  const snap = (id) => { const deal = (load().deals || []).find((x) => x.id === id); return deal ? { emd: !!deal.emdReceived, closing: deal.closingDate || null, status: deal.status || 'Open' } : null; };
  const fire = (id, before) => { const after = snap(id); if (!after) return;
    try {
      if (!before) event(id, 'order_opened');
      if (after.emd && !(before && before.emd)) event(id, 'emd_received');
      if (after.closing && after.closing !== (before && before.closing)) event(id, 'closing_date_set');
      if (before && after.status === 'Closed' && before.status !== 'Closed') event(id, 'file_closed');
    } catch (e) { /* a flow problem never stops saving an order */ } };
  const wrap = (name, idOf) => { const fn = api[name]; if (typeof fn !== 'function') return;
    api[name] = async function (...args) { const id0 = idOf(args); const before = id0 ? snap(id0) : null; const r = await fn.apply(this, args);
      const id = id0 || (r && r.id); if (id) fire(id, before); return r; }; };
  wrap('createDeal', () => null);
  wrap('updateDeal', (a) => a[0]);
  wrap('updateEmdAlta', (a) => a[0]);
  wrap('setStage', (a) => a[0]);   // the last stage closes the file (funds disbursed)
  wrap('setDealStatus', (a) => a[0]);
  // TB-11 (Nov 22): a task checked off on a file starts the "Task completed" templates that name it. Tasks are completed from many places
  // (the task list, forms, scheduling...), so every call that may change data is watched: tasks that are done afterwards but were not before.
  const doneIds = () => new Set((load().tasks || []).filter((t) => t.status === 'done').map((t) => t.id));
  Object.keys(api).forEach((name) => { const fn = api[name];
    if (typeof fn !== 'function' || name.startsWith('_') || /^(list|get|is|can|search|count|find|sign|whoAmI|current)/.test(name)) return;
    api[name] = async function (...args) { const before = doneIds(); const r = await fn.apply(this, args);
      try { (load().tasks || []).filter((t) => t.status === 'done' && !before.has(t.id) && !isTestRunTask(t)).forEach((t) => event(t.dealId, 'task_completed', taskKeys(t))); }
      catch (e) { /* a template problem never stops the task from saving */ }
      return r; }; });
  ['getDeal', 'listTasks'].forEach((name) => { const fn = api[name]; if (typeof fn !== 'function') return;
    api[name] = async function (...args) { lazyTick(); return fn.apply(this, args); }; });
}
