/* mock adapter: in-app notifications (bell dropdown). Created by messages, uploads, tasks, closing requests and reminders. Never emailed from this build. */
export function notificationsPart(x) {
  const { load, save, needUser, clone, now, fail } = x;
  const mine = (u) => load().notifications.filter((n) => n.profileId === u.id);
  return {
    async listNotifications({ limit = 20 } = {}) { const u = needUser(); return clone(mine(u).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, Math.min(100, limit))); },
    async notificationCount() { const u = needUser(); return mine(u).filter((n) => !n.readAt).length; },
    async markNotificationRead(id) { const u = needUser(); const n = mine(u).find((z) => z.id === id) || fail('Notification not found.'); if (!n.readAt) n.readAt = now(); save(); return true; },
    async markAllNotificationsRead() { const u = needUser(); mine(u).forEach((n) => { if (!n.readAt) n.readAt = now(); }); save(); return true; },
  };
}
