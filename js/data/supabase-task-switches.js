/* [SUPABASE] TASK SWITCHES (John, Nov 4; migration 49). Same names / shapes as mock-part-task-switches.js. NOT run against a hosted project
 * (best effort; the mock adapter is the tested one). public.task_template_switches is read by staff; only public.set_task_template_enabled()
 * changes it (active Admin / Super admin only, a reason is required for Off); every change goes to public.task_template_switch_log. OFF = not created
 * from now on; existing copies kept but hidden by RLS (tasks_switch_hidden) from everyone except Admin / Super admin. */
import { switchableTasks, canManageTaskSwitches, cleanReason } from './task-switches.js?v=202611191500';
export function taskSwitchesSupabase({ sb, ok, me }) {
  const admin = async () => { const u = await me(); if (!canManageTaskSwitches(u)) throw new Error('Only an Admin or Super admin can see or change task switches.'); return u; };
  return {
    async listTaskSwitches() {
      await admin();
      const rows = ok(await sb.from('task_template_switches').select('code,enabled,updated_at,updated_by,reason')) || [];
      const tpl = ok(await sb.from('task_templates').select('code,version,title,roles,agent_roles')) || [];
      const log = ok(await sb.from('task_template_switch_log').select('id,code,old_enabled,new_enabled,changed_by,changed_by_name,changed_at,reason').order('changed_at', { ascending: false })) || [];
      const tasks = switchableTasks(tpl.map((t) => ({ code: t.code, version: t.version, title: t.title, roles: t.roles || [], agentRoles: t.agent_roles || [] }))).map((t) => {
        const r = rows.find((z) => z.code === t.code) || {}; return { ...t, enabled: r.enabled !== false, updatedAt: r.updated_at || null, updatedByName: '', reason: r.reason || '', openCount: null, openOnFiles: null, files: [] }; });
      return { tasks, log: log.map((l) => ({ id: l.id, code: l.code, label: (tasks.find((t) => t.code === l.code) || {}).title || l.code, old: l.old_enabled, new: l.new_enabled, at: l.changed_at, byId: l.changed_by, byName: l.changed_by_name, reason: l.reason || '' })) };
    },
    async setTaskEnabled(code, enabled, reason = '') {
      await admin(); if (typeof enabled !== 'boolean') throw new Error('A task switch must be on or off.'); const why = cleanReason(reason, enabled);
      const r = ok(await sb.rpc('set_task_template_enabled', { p_code: code, p_enabled: enabled, p_reason: why }));
      return { code: r.code, enabled: r.enabled !== false, updatedAt: r.updated_at, updatedBy: r.updated_by, reason: r.reason || '' };
    },
  };
}
