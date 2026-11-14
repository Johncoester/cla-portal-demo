/* [SUPABASE] Admin > Task Builder (John, Nov 13 2026). Same names and shapes as mock-part-task-builder.js.
 * TB-1 (migration 20261120010000_task_builder_flows.sql): flows, On / Off, history.
 * TB-2 (migration 20261121010000_task_flow_engine.sql): conditions, steps, runs, "Check files now". The database runs the flows itself
 * (on a file event, and every 15 minutes); the page only reads and saves.
 * Every read and write goes through the database functions (Admin / Super admin only); nobody reads the tables directly.
 * Until a migration is applied on TEST, the page says so in plain words instead of showing a database error. */
import { cleanFlow, triggerText, stepText, conditionsText, triggerRuns, cleanConditions } from './task-builder.js?v=202611211000';

export const NOT_SET_UP = 'Task Builder is not set up on this site yet. Its database file has to be applied first.';
const plainErr = (e) => {
  const m = String((e && e.message) || e || '');
  if (/could not find the function|does not exist|schema cache/i.test(m)) return new Error(NOT_SET_UP);
  if (/permission denied/i.test(m)) return new Error('Only an Admin or Super admin can use Task Builder.');
  return e instanceof Error ? e : new Error(m);
};
const flowRow = (r) => { const steps = Array.isArray(r.steps) ? r.steps : []; const conditions = cleanConditions(r.conditions || {});
  return { id: r.id, name: r.name, description: r.description || '', trigger: r.trigger, triggerDays: r.trigger_days == null ? null : Number(r.trigger_days),
    active: !!r.active, steps: steps.map((s) => ({ ...s, text: stepText(s) })), conditions, conditionsText: conditionsText(conditions), runsNow: triggerRuns(r.trigger),
    createdAt: r.created_at, createdBy: r.created_by, createdByName: r.created_by_name || '',
    updatedAt: r.updated_at, updatedBy: r.updated_by, updatedByName: r.updated_by_name || '', triggerText: triggerText(r.trigger, r.trigger_days) }; };
const logRow = (l) => ({ id: l.id, at: l.at, by: l.by, byName: l.by_name || 'Task Builder', flowId: l.flow_id, flowName: l.flow_name, action: l.action, detail: l.detail || '' });
const runRow = (r) => ({ id: r.id, flowId: r.flow_id, dealId: r.deal_id, flowName: r.flow_name || '', fileNumber: r.file_number || '', status: r.status,
  stepIndex: r.step_index, nextAt: r.next_at, startedAt: r.started_at, finishedAt: r.finished_at, log: Array.isArray(r.log) ? r.log : [] });

export function taskBuilderSupabase({ sb, ok }) {
  const call = async (fn, args) => { try { return ok(await sb.rpc(fn, args)); } catch (e) { throw plainErr(e); } };
  const all = async () => { const r = (await call('list_task_flows', {})) || {};
    return { flows: (r.flows || []).map(flowRow), log: (r.log || []).map(logRow), runs: (r.runs || []).map(runRow) }; };
  const save = async (id, input) => { const v = cleanFlow(input);
    const newId = await call('save_task_flow_v2', { p_id: id, p_name: v.name, p_description: v.description, p_trigger: v.trigger, p_trigger_days: v.triggerDays,
      p_conditions: v.conditions, p_steps: v.steps });
    return (await all()).flows.find((f) => f.id === newId) || null; };
  return {
    async listTaskFlows() { const r = await all(); return { ...r, canEdit: true }; },
    async createTaskFlow(input = {}) { return save(null, input); },
    async updateTaskFlow(id, input = {}) { return save(id, input); },
    async setTaskFlowActive(id, active) { await call('set_task_flow_active', { p_id: id, p_active: !!active }); return (await all()).flows.find((f) => f.id === id) || null; },
    async runTaskFlowsNow() { const r = (await call('run_task_flows_now', {})) || {}; return { started: Number(r.started) || 0, tasks: Number(r.tasks) || 0 }; },
  };
}
