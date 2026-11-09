/* Hosted task rows do not carry mine / canFill / canTick. These helpers add them
 * from the signed-in profile. They do not add tasks, do not return another person's
 * answers, and do not treat Demo view-only as a missing task. */
import { runsOrders, viewOnly, maskAccount } from './constants.js?v=202611100245';
import { fieldsForRole, maskedFields } from './templates.js?v=202611100600';

export const HOSTED_TASK_COLUMNS = 'id, deal_id, title, description, assigned_role, status, due_date, completed_at, completed_by, created_by, created_at, kind, participant_id, owner_profile_id, template_id, template_code, template_version, saved_at, saved_by';

export function camelHosted(o) {
  return Array.isArray(o) ? o.map(camelHosted) : o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camelHosted(v)])) : o;
}

export function shapeListedTask(t, user, opts = {}) {
  if (!t) return t;
  const owner = t.ownerProfileId || t.ownerId || null;
  const roles = (user && (user.roles || [user.role])) || [];
  const mineIds = opts.myParticipantIds || [];
  const ownsCopy = !!(t.participantId && mineIds.includes(t.participantId) && (!owner || owner === user.id));
  const mine = !!(user && (owner === user.id || ownsCopy || (!t.participantId && roles.includes(t.assignedRole))));
  const manager = !!(user && (runsOrders(user) || user.role === 'Transaction Coordinator'));
  const kind = t.kind || (t.templateId ? 'form' : 'simple');
  const readOnly = viewOnly(user);
  const open = t.status !== 'cancelled' && t.status !== 'done';
  const canFill = !readOnly && kind === 'form' && t.status !== 'cancelled' && (mine || manager);
  const canTick = !readOnly && kind === 'simple' && t.status !== 'cancelled' && (manager || mine) && ['todo', 'in_progress', 'done'].includes(t.status);
  return {
    ...t,
    kind,
    mine,
    canFill,
    canTick,
    actionable: canFill || canTick || ((kind === 'sign' || kind === 'agent') && !readOnly && (mine || manager)),
    notYours: !mine && !manager && open,
  };
}

export function taskOpenHref(t) {
  if (!t || !t.dealId || !t.id || t.notYours) return '';
  if (t.kind === 'form' && !t.canFill) return '';
  if (t.kind === 'form' || t.kind === 'sign' || t.kind === 'agent') return `#/deals/${t.dealId}/tasks/${t.id}`;
  return '';
}

export function pendingMine(tasks, statuses = ['todo', 'in_progress', 'blocked']) {
  const seen = new Set();
  return (tasks || []).filter((t) => {
    if (!t || !t.mine || !statuses.includes(t.status) || seen.has(t.id)) return false;
    seen.add(t.id); return true;
  });
}

export async function viewerParticipantIds(sb, dealId, user) {
  if (!sb || typeof sb.rpc !== 'function' || !dealId || !user || !user.id) return [];
  try {
    const res = await sb.rpc('deal_contacts', { p_deal: dealId });
    if (!res || res.error || !Array.isArray(res.data)) return [];
    return res.data.filter((r) => r && r.profile_id === user.id && r.participant_id).map((r) => r.participant_id);
  } catch (e) { return []; }
}

export function mapHostedTaskList(rawRows, user, disabledCodes = [], opts = {}) {
  const off = new Set(disabledCodes || []);
  return (rawRows || []).map((raw) => {
    const t = camelHosted(raw) || {};
    delete t.formData;
    const shaped = shapeListedTask({ ...t, switchedOff: !!(t.templateCode && off.has(t.templateCode)) }, user, opts);
    shaped.href = taskOpenHref(shaped);
    return shaped;
  });
}

function maySeeAnswers(t, user) {
  return !!(t.mine || (user && (runsOrders(user) || user.role === 'Transaction Coordinator')));
}

export function assembleHostedTask(rawRow, user, { template = null, formRpc = null, myParticipantIds = [] } = {}) {
  const t = mapHostedTaskList([rawRow], user, [], { myParticipantIds })[0];
  if (template && template.id) {
    t.template = { id: template.id, code: template.code, version: template.version, title: template.title };
    t.fields = fieldsForRole(template.fields || [], t.assignedRole);
  } else t.fields = t.fields || [];
  if (t.kind === 'form') {
    if (!maySeeAnswers(t, user)) {
      t.formData = {}; t.formHidden = true; t.formError = false; t.canFill = false;
    } else if (!formRpc || formRpc.error) {
      t.formData = {}; t.formError = true; t.formHidden = false; t.canFill = false;
    } else {
      const data = { ...(formRpc.data || {}) };
      const masked = maskedFields(template);
      if (user && user.role === 'Transaction Coordinator' && !runsOrders(user) && masked.length) {
        masked.forEach((k) => { if (data[k]) data[k] = maskAccount(data[k]); });
        t.maskedAnswers = true; t.canFill = false;
      }
      t.formData = data; t.formHidden = false; t.formError = false;
    }
  }
  t.href = taskOpenHref(t);
  return t;
}

export async function fetchHostedTaskRows(sb, dealId) {
  const res = await sb.from('tasks').select(HOSTED_TASK_COLUMNS).eq('deal_id', dealId).order('created_at');
  if (res.error) throw new Error(res.error.message);
  const rows = res.data || [];
  let off = [];
  if (rows.some((t) => t.template_code)) {
    const sw = await sb.from('task_template_switches').select('code').eq('enabled', false);
    if (sw.error) throw new Error(sw.error.message);
    off = (sw.data || []).map((r) => r.code);
  }
  return { rows, off };
}

export async function fetchHostedTaskList(sb, dealId, user) {
  const got = await fetchHostedTaskRows(sb, dealId);
  const myParticipantIds = await viewerParticipantIds(sb, dealId, user);
  return mapHostedTaskList(got.rows, user, got.off, { myParticipantIds });
}

export async function fetchHostedTask(sb, id, user) {
  const res = await sb.from('tasks').select(HOSTED_TASK_COLUMNS).eq('id', id).single();
  if (res.error) throw new Error(res.error.message);
  const myParticipantIds = await viewerParticipantIds(sb, res.data.deal_id, user);
  const preview = mapHostedTaskList([res.data], user, [], { myParticipantIds })[0];
  let template = null;
  if (preview.templateId) {
    const tp = await sb.from('task_templates').select('id, code, version, title, fields').eq('id', preview.templateId).maybeSingle();
    if (tp.error) throw new Error(tp.error.message);
    template = tp.data || null;
  }
  let formRpc = null;
  if (preview.kind === 'form') formRpc = await sb.rpc('get_task_form', { p_task: id });
  return assembleHostedTask(res.data, user, { template, formRpc, myParticipantIds });
}
