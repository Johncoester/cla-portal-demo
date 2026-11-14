/* TASK BUILDER (John, Nov 13 2026; spec docs/specs/task-builder.md). Admin > Task Builder: admins build automated workflows ("flows")
 * for title files. Each flow is an if-then flow: a TRIGGER (something happens on a file), CONDITIONS (which files), then ACTIONS
 * (create tasks, send emails, wait, check again). Builds on the Task Templates work (PR 141).
 * TB-1 (this step): the page, who can use it, and the list of flows with a name, a trigger and an On / Off switch.
 * Flows do NOT run on files yet: conditions and actions come in TB-2. Only Admins and Super admins can open or change it.
 * Shared by the mock adapter (mock-part-task-builder.js), the Supabase adapter (supabase-task-builder.js) and the page. */

export const TASK_BUILDER_ADMIN_ONLY = 'Only an Admin or Super admin can use Task Builder.';
export const FLOWS_NOT_RUNNING = 'Flows are saved here but do not run on files yet. Conditions and actions (create a task, send an email, wait, check again) come in the next step.';

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
  return { name, description, trigger, triggerDays };
}

// Same name check the database makes (case and spacing don't count).
export const sameName = (a, b) => String(a || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase();
export const DUPLICATE_NAME = 'Another flow already has that name. Use a different name.';
