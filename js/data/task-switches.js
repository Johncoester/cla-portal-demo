// task-switches.js : TASK SWITCHES (John, Nov 4 meeting; mockup 04-admin-task-toggles). One On/Off switch per task template code, on the
// Task Templates admin area (Admin / Super admin only). OFF = the task is not created from now on (new files, and people added later);
// tasks already on files are KEPT (never deleted or cancelled) but HIDDEN from the file's task lists, counts and boards for everyone except
// Admin / Super admin (they still see them, marked "Switched off"). Turning it back on shows them again. Every change is logged: who, when,
// why (a reason is required to switch a task off), old -> new (like the Modules change log).
// Mirrored by migration 49 (public.task_template_switches + public.task_template_switch_log, both typed / queryable).
import { TEMPLATE_DEFS } from './templates.js?v=202611090935';
import { AGENT_TASKS } from './agent-portal.js?v=202611090935';
// loan-related tasks: the first ones John wants to switch (shown first, "Showing: loan-related tasks")
export const LOAN_CODES = ['lender_info', 'mortgage_info'];
// every switchable code: the intake templates (latest title) + the 3 agent tasks
export function switchableTasks(templates = TEMPLATE_DEFS) {
  const by = new Map();
  for (const t of templates) { const cur = by.get(t.code); if (!cur || (t.version || 1) >= (cur.version || 1)) by.set(t.code, { code: t.code, title: t.title, roles: t.roles || [], agentRoles: t.agentRoles || [], type: 'Intake form', version: t.version || 1 }); }
  for (const a of AGENT_TASKS) by.set(a.code, { code: a.code, title: a.title, roles: ['Buyer Agent', 'Listing Agent'], agentRoles: [], type: 'Agent task', version: 1 });
  return [...by.values()].map((t) => ({ ...t, loan: LOAN_CODES.includes(t.code) })).sort((a, b) => (b.loan - a.loan) || (a.loan && b.loan ? LOAN_CODES.indexOf(a.code) - LOAN_CODES.indexOf(b.code) : a.title.localeCompare(b.title)));
}
export const canManageTaskSwitches = (u) => !!(u && u.isAdmin && (u.status || 'active') === 'active');
// d.taskSwitches: [{ code, enabled, updatedAt, updatedBy }] (a code with no row is ON); d.taskSwitchLog: [{ id, code, label, old, new, at, byId, byName }]
export function ensureTaskSwitches(d) { if (!Array.isArray(d.taskSwitches)) d.taskSwitches = []; if (!Array.isArray(d.taskSwitchLog)) d.taskSwitchLog = []; return d; }
// why a task was switched off: required for Off (3-500 characters), optional for On
export const REASON_MSG = 'Say why this task is being switched off (3 to 500 characters).';
export function cleanReason(v, enabled) { const r = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (!enabled && r.length < 3) throw new Error(REASON_MSG); if (r.length > 500) throw new Error(REASON_MSG); return r; }
// a task copy made from a switched-off code: kept, but only Admin / Super admin see it (mirrored by the tasks_switch_hidden RLS policy, migration 49)
export const taskSwitchedOff = (d, t) => !!(t && t.templateCode) && !taskEnabled(d, t.templateCode);
export const taskShownTo = (d, u, t) => !taskSwitchedOff(d, t) || !!(u && u.isAdmin);
export const taskEnabled = (d, code) => { const s = (d && Array.isArray(d.taskSwitches) ? d.taskSwitches : []).find((x) => x.code === code); return !s || s.enabled !== false; };
