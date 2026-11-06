/* Which tasks a person can open. Used for the hosted task list, which does not send these flags itself.
 * It does not add tasks and does not show another person's answers. */
import { runsOrders } from './constants.js?v=202611062210';

export function shapeListedTask(t, user) {
  if (!t) return t;
  const owner = t.ownerProfileId || t.ownerId || null;
  const roles = (user && (user.roles || [user.role])) || [];
  const mine = !!(user && (owner === user.id || (!t.participantId && roles.includes(t.assignedRole))));
  const manager = !!(user && (runsOrders(user) || user.role === 'Transaction Coordinator'));
  const kind = t.kind || (t.templateId ? 'form' : 'simple');
  const open = t.status !== 'cancelled' && t.status !== 'done';
  return {
    ...t,
    kind,
    mine,
    canFill: kind === 'form' && t.status !== 'cancelled' && (mine || manager),
    canTick: kind === 'simple' && t.status !== 'cancelled' && (manager || mine) && ['todo', 'in_progress', 'done'].includes(t.status),
    actionable: (kind === 'form' && t.status !== 'cancelled' && (mine || manager)) || kind === 'sign' || kind === 'agent' || (kind === 'simple' && (manager || mine)),
    notYours: !mine && !manager && open,
  };
}
