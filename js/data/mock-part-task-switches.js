/* mock adapter: TASK SWITCHES (John, Nov 4; mirrored by migration 49 + supabase-task-switches.js). FAKE DATA ONLY; nothing is sent.
 * d.taskSwitches = one row per switched code { code, enabled, updatedAt, updatedBy, reason }; d.taskSwitchLog = every change { id, code, label, old, new, at, byId, byName, reason }.
 * Added on first use (ensureTaskSwitches) without a storage-key bump: nothing existing changes. Only Admin / Super admin read the list + log and flip a switch.
 * OFF = not created from now on; tasks already on files are kept (never deleted or cancelled) but hidden from everyone except Admin / Super admin
 * (taskShownTo, used by taskVisible in mock-adapter.js). A reason is required to switch a task off. Rows and log entries are never deleted. */
import { switchableTasks, canManageTaskSwitches, ensureTaskSwitches, taskEnabled, cleanReason } from './task-switches.js?v=202611170900';

export function taskSwitchesPart(x) {
  const { load, save, nid, needUser, fail, now, nameOf, clone } = x;
  const db = () => ensureTaskSwitches(load());
  const admin = () => { const u = needUser(); if (!canManageTaskSwitches(u)) fail('Only an Admin or Super admin can see or change task switches.'); return u; };
  const OPEN = ['todo', 'in_progress', 'blocked'];
  return {
    async listTaskSwitches() {
      admin(); const d = db(); const openDeals = new Map(d.deals.filter((q) => q.status === 'Open').map((q) => [q.id, q]));
      const tasks = switchableTasks(d.taskTemplates).map((t) => { const s = d.taskSwitches.find((z) => z.code === t.code) || {};
        const onFiles = d.tasks.filter((z) => z.templateCode === t.code && z.status !== 'cancelled' && openDeals.has(z.dealId));
        const files = [...new Set(onFiles.map((z) => openDeals.get(z.dealId).fileNumber))].sort();
        return { ...t, enabled: taskEnabled(d, t.code), updatedAt: s.updatedAt || null, updatedByName: s.updatedBy ? nameOf(s.updatedBy) : '', reason: s.reason || '',
          openCount: onFiles.length, openOnFiles: onFiles.filter((z) => OPEN.includes(z.status)).length, files }; });
      const log = clone(d.taskSwitchLog).sort((a, b) => String(b.at).localeCompare(String(a.at)) || (Number(String(b.id).split('-').pop()) - Number(String(a.id).split('-').pop())));
      return { tasks, log };
    },
    async setTaskEnabled(code, enabled, reason = '') {
      const u = admin(); if (typeof enabled !== 'boolean') fail('A task switch must be on or off.');
      const d = db(); const t = switchableTasks(d.taskTemplates).find((z) => z.code === code) || fail('Unknown task.');
      let why = ''; try { why = cleanReason(reason, enabled); } catch (e) { fail(e.message); }
      let s = d.taskSwitches.find((z) => z.code === code);
      const old = s ? s.enabled !== false : true; if (old === enabled) return clone(s || { code, enabled, updatedAt: null, updatedBy: null });
      if (!s) { s = { code, enabled: true, updatedAt: null, updatedBy: null, reason: '' }; d.taskSwitches.push(s); }
      s.enabled = enabled; s.updatedAt = now(); s.updatedBy = u.id; s.reason = why;
      d.taskSwitchLog.push({ id: nid('tslog'), code, label: t.title, old, new: enabled, at: s.updatedAt, byId: u.id, byName: nameOf(u.id), reason: why });
      x.log(null, u.id, 'task_switch.changed', 'task_template', code, `Task "${t.title}" switched ${enabled ? 'on' : 'off'} (was ${old ? 'on' : 'off'})${why ? `: ${why}` : ''}`);
      save(); return clone(s);
    },
  };
}
