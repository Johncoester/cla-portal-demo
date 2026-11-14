/* TASK BUILDER, mock adapter (mirrors public.task_flows / public.task_flow_log, migration 20261120010000_task_builder_flows.sql).
 * TB-1 (John, Nov 13 2026): Admin > Task Builder lists flows (name, what starts it, On / Off). Admins and Super admins only, read and write.
 * Nothing is deleted: a flow is switched Off. Every create, change and switch is kept in a history (who, when, what).
 * Flows do not run on files yet (TB-2). */
import { cleanFlow, canManageTaskBuilder, TASK_BUILDER_ADMIN_ONLY, sameName, DUPLICATE_NAME, triggerText } from './task-builder.js?v=202611201000';

export function ensureTaskFlows(d) {
  if (!Array.isArray(d.taskFlows)) d.taskFlows = [];
  if (!Array.isArray(d.taskFlowLog)) d.taskFlowLog = [];
  return d;
}

export function taskBuilderPart({ load, save, needUser, nid, now, fail, nameOf }) {
  const db = () => ensureTaskFlows(load());
  const admin = () => { const u = needUser(); if (!canManageTaskBuilder(u)) fail(TASK_BUILDER_ADMIN_ONLY); return u; };
  const clean = (input) => { try { return cleanFlow(input); } catch (e) { return fail(e.message); } };
  const view = (f) => ({ ...f, steps: [...(f.steps || [])], triggerText: triggerText(f.trigger, f.triggerDays),
    createdByName: f.createdBy ? nameOf(f.createdBy) : '', updatedByName: f.updatedBy ? nameOf(f.updatedBy) : '' });
  const one = (d, id) => d.taskFlows.find((f) => f.id === id) || fail('That flow was not found. Refresh the page and try again.');
  const nameTaken = (d, name, id) => d.taskFlows.some((f) => f.id !== id && sameName(f.name, name));
  const log = (d, u, f, action, detail = '') => d.taskFlowLog.unshift({ id: nid('tfl'), at: now(), by: u.id, flowId: f.id, flowName: f.name, action, detail });
  return {
    async listTaskFlows() { admin(); const d = db();
      return { flows: d.taskFlows.map(view).sort((a, b) => a.name.localeCompare(b.name)),
        log: d.taskFlowLog.slice(0, 50).map((l) => ({ ...l, byName: l.by ? nameOf(l.by) : '' })), canEdit: true }; },
    async createTaskFlow(input = {}) { const u = admin(); const v = clean(input); const d = db();
      if (nameTaken(d, v.name, null)) fail(DUPLICATE_NAME);
      const t = now(); const f = { id: nid('flow'), ...v, active: false, steps: [], createdAt: t, createdBy: u.id, updatedAt: t, updatedBy: u.id };
      d.taskFlows.push(f); log(d, u, f, 'created', `Starts: ${triggerText(f.trigger, f.triggerDays)}. Off.`); save(); return view(f); },
    async updateTaskFlow(id, input = {}) { const u = admin(); const v = clean(input); const d = db(); const f = one(d, id);
      if (nameTaken(d, v.name, id)) fail(DUPLICATE_NAME);
      const changes = [];
      if (f.name !== v.name) changes.push(`name was "${f.name}"`);
      if (f.trigger !== v.trigger || (f.triggerDays || null) !== (v.triggerDays || null)) changes.push(`starts: was ${triggerText(f.trigger, f.triggerDays)}, now ${triggerText(v.trigger, v.triggerDays)}`);
      if ((f.description || '') !== v.description) changes.push('description changed');
      if (!changes.length) return view(f);
      Object.assign(f, v, { updatedAt: now(), updatedBy: u.id }); log(d, u, f, 'changed', changes.join('; ')); save(); return view(f); },
    async setTaskFlowActive(id, active) { const u = admin(); const d = db(); const f = one(d, id); const on = !!active;
      if (f.active === on) return view(f);
      f.active = on; f.updatedAt = now(); f.updatedBy = u.id; log(d, u, f, on ? 'turned on' : 'turned off'); save(); return view(f); },
  };
}
