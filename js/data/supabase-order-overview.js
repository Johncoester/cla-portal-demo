// Supabase order overview. Reads only tables and RPCs that already exist.
// RLS decides the file, the other side's contact, tasks, documents, threads, activity, and demo world.
// A failed read is thrown. An empty list is only what the database returned.
import { buildOrderOverview } from './order-overview.js?v=202611061858';

export function orderOverviewSupabase({ sb, ok, camel, me, api }) {
  const names = async (ids) => {
    const want = [...new Set(ids.filter(Boolean))];
    if (!want.length) return new Map();
    const rows = camel(ok(await sb.from('profiles').select('id,first_name,last_name').in('id', want))) || [];
    return new Map(rows.map((p) => [p.id, `${p.firstName || ''} ${p.lastName || ''}`.trim()]));
  };
  return {
    async getOrderOverview(dealId) {
      const user = await me();
      if (!user || !user.id) throw new Error('Please sign in.');
      const deal = await api.getDeal(dealId);
      if (!deal || !deal.id) throw new Error('Order not found.');
      const [tasks, documents, threads, activity] = await Promise.all([
        api.listTasks(dealId),
        api.listDocuments(dealId),
        api.listThreads(dealId),
        api.listActivity(dealId),
      ]);
      if (!Array.isArray(tasks) || !Array.isArray(documents) || !Array.isArray(threads) || !activity || !Array.isArray(activity.items)) {
        throw new Error('Order overview could not be loaded.');
      }
      if (deal.processorId && !deal.processorName) {
        const row = camel(ok(await sb.from('profiles').select('id,first_name,last_name,email,phone').eq('id', deal.processorId).maybeSingle()));
        if (row && row.id) {
          deal.processorName = `${row.firstName || ''} ${row.lastName || ''}`.trim();
          deal.processorEmail = row.email || '';
          deal.processorPhone = row.phone || '';
        }
      }
      const ids = threads.map((t) => t.id);
      const reads = ids.length ? camel(ok(await sb.from('thread_participants').select('thread_id,last_read_at').eq('profile_id', user.id).in('thread_id', ids))) || [] : [];
      const readAt = new Map(reads.map((r) => [r.threadId, r.lastReadAt || '']));
      const actors = await names([
        ...activity.items.map((a) => a.actorId),
        ...threads.flatMap((t) => (t.messages || []).map((m) => m.authorId)),
      ]);
      for (const t of threads) {
        const since = readAt.get(t.id) || '';
        t.unread = (t.messages || []).filter((m) => m.authorId !== user.id && (!since || String(m.createdAt) > String(since))).length;
        const last = (t.messages || [])[t.messages.length - 1];
        if (last && !last.authorName) last.authorName = actors.get(last.authorId) || '';
      }
      for (const item of activity.items) if (!item.actorName) item.actorName = actors.get(item.actorId) || '';
      return buildOrderOverview({ deal, me: user, tasks, documents, threads, activity: activity.items, salesPeople: deal.salesPeople || [] });
    },
    async listUpdateRequests(dealId) {
      const user = await me();
      if (!user || !user.id) throw new Error('Please sign in.');
      const deal = await api.getDeal(dealId);
      if (!deal || !deal.id) throw new Error('Order not found.');
      const rows = camel(ok(await sb.from('update_requests').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }))) || [];
      const who = await names(rows.flatMap((r) => [r.requestedBy, r.respondedBy]));
      return rows.map((r) => ({ ...r, requestedByName: who.get(r.requestedBy) || '', respondedByName: r.respondedBy ? (who.get(r.respondedBy) || '') : '' }));
    },
    async listSharedAccess(dealId) {
      const user = await me();
      if (!user || !user.id) throw new Error('Please sign in.');
      const deal = await api.getDeal(dealId);
      if (!deal || !deal.id) throw new Error('Order not found.');
      const rows = camel(ok(await sb.from('access_invites').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }))) || [];
      const who = await names(rows.map((r) => r.invitedBy));
      return rows.map((r) => ({ ...r, invitedByName: who.get(r.invitedBy) || '' }));
    },
  };
}
