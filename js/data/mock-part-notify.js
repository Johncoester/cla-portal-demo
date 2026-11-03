/* mock adapter: in-app notifications (bell dropdown). Created by messages, uploads, tasks, closing requests and reminders. Never emailed from this build.
 * Matt, Nov 2: each notification carries its file's number and property address (fileNumber, address) when it is about a file the person can still open.
 * Mirrored by public.my_notifications() in SQL (migration 16). */
export function notificationsPart(x) {
  const { load, save, needUser, dealsFor, clone, now, fail } = x;
  // John, Nov 3: a notification that names a wire-instructions file never shows to someone who may not get wire instructions (an agent), including ones
  // stored before the fix. Mirrored by migration 29 (old titles rewritten; new ones never created for agents).
  const mine = (u) => load().notifications.filter((n) => n.profileId === u.id && !(x.isWireDocName(n.title) && !x.wireAllowed(u.id, n.dealId)));
  const withFile = (u, list) => { const seen = new Map(dealsFor(u).map((q) => [q.id, q]));
    return list.map((n) => { const q = n.dealId && seen.get(n.dealId); return { ...clone(n), fileNumber: q ? q.fileNumber : '', address: q ? `${q.street}, ${q.city}, ${q.state} ${q.zip}` : '' }; }); };
  return {
    async listNotifications({ limit = 20 } = {}) { const u = needUser(); return withFile(u, mine(u).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, Math.min(100, limit))); },
    async notificationCount() { const u = needUser(); return mine(u).filter((n) => !n.readAt).length; },
    async markNotificationRead(id) { const u = needUser(); const n = mine(u).find((z) => z.id === id) || fail('Notification not found.'); if (!n.readAt) n.readAt = now(); save(); return true; },
    async markAllNotificationsRead() { const u = needUser(); mine(u).forEach((n) => { if (!n.readAt) n.readAt = now(); }); save(); return true; },
  };
}
