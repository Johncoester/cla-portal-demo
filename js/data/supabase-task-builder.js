/* [SUPABASE] Admin > Task Builder, TB-1 (John, Nov 13 2026; migration 20261120010000_task_builder_flows.sql). Same names and shapes as
 * mock-part-task-builder.js. Every read and write goes through the database functions (Admin / Super admin only); nobody reads the tables directly.
 * Until the migration is applied on TEST, the page says so in plain words instead of showing a database error. */
import { cleanFlow, triggerText } from './task-builder.js?v=202611201000';

export const NOT_SET_UP = 'Task Builder is not set up on this site yet. Its database file has to be applied first.';
const plainErr = (e) => {
  const m = String((e && e.message) || e || '');
  if (/could not find the function|does not exist|schema cache/i.test(m)) return new Error(NOT_SET_UP);
  if (/permission denied/i.test(m)) return new Error('Only an Admin or Super admin can use Task Builder.');
  return e instanceof Error ? e : new Error(m);
};
const flowRow = (r) => ({ id: r.id, name: r.name, description: r.description || '', trigger: r.trigger, triggerDays: r.trigger_days == null ? null : Number(r.trigger_days),
  active: !!r.active, steps: Array.isArray(r.steps) ? r.steps : [], createdAt: r.created_at, createdBy: r.created_by, createdByName: r.created_by_name || '',
  updatedAt: r.updated_at, updatedBy: r.updated_by, updatedByName: r.updated_by_name || '', triggerText: triggerText(r.trigger, r.trigger_days) });
const logRow = (l) => ({ id: l.id, at: l.at, by: l.by, byName: l.by_name || '', flowId: l.flow_id, flowName: l.flow_name, action: l.action, detail: l.detail || '' });

export function taskBuilderSupabase({ sb, ok }) {
  const call = async (fn, args) => { try { return ok(await sb.rpc(fn, args)); } catch (e) { throw plainErr(e); } };
  const all = async () => { const r = (await call('list_task_flows', {})) || {}; return { flows: (r.flows || []).map(flowRow), log: (r.log || []).map(logRow) }; };
  const save = async (id, input) => { const v = cleanFlow(input);
    const newId = await call('save_task_flow', { p_id: id, p_name: v.name, p_description: v.description, p_trigger: v.trigger, p_trigger_days: v.triggerDays });
    return (await all()).flows.find((f) => f.id === newId) || null; };
  return {
    async listTaskFlows() { const r = await all(); return { ...r, canEdit: true }; },
    async createTaskFlow(input = {}) { return save(null, input); },
    async updateTaskFlow(id, input = {}) { return save(id, input); },
    async setTaskFlowActive(id, active) { await call('set_task_flow_active', { p_id: id, p_active: !!active }); return (await all()).flows.find((f) => f.id === id) || null; },
  };
}
