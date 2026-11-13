// Supabase order overview. Reads only tables and RPCs that already exist.
// RLS decides the file, the other side's contact, tasks, documents, threads, and demo world.
// activity_log is not read here. The Activity tab loads it.
// A failed read is thrown. An empty list is only what the database returned.
import { buildOrderOverview } from './order-overview.js?v=202611110700';
import { canUseGmail } from './gmail-email.js?v=202611191000';

const CONTACT_MS = 2000;
/* A name lookup made with no user session sends the publishable key as Bearer and PostgREST answers 401.
 * Sign-out clears the session while a file overview can still be resolving actor names. Skip that read. */
export async function profileReadAllowed(sb) {
  if (!sb || !sb.auth || typeof sb.auth.getSession !== 'function') return true;
  try {
    const got = await sb.auth.getSession();
    return !!(got && got.data && got.data.session && got.data.session.access_token);
  } catch (e) { return false; }
}
/* Email/phone is extra. A denied column or a read that never returns must not leave the file on "Loading this page." */
async function processorContact(sb, id) {
  if (!id || !(await profileReadAllowed(sb))) return null;
  let timer;
  try {
    const res = await new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), CONTACT_MS);
      const q = sb.from('profiles').select('id,first_name,last_name,email,phone').eq('id', id).maybeSingle();
      Promise.resolve(q).then((row) => resolve(row), () => resolve(null));
    });
    if (!res || res.error || res.data == null) return null;
    return res.data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function orderOverviewSupabase({ sb, ok, camel, me, api }) {
  const names = async (ids) => {
    const want = [...new Set(ids.filter(Boolean))];
    if (!want.length || !(await profileReadAllowed(sb))) return new Map();
    const rows = camel(ok(await sb.from('profiles').select('id,first_name,last_name').in('id', want))) || [];
    return new Map(rows.map((p) => [p.id, `${p.firstName || ''} ${p.lastName || ''}`.trim()]));
  };
  return {
    async getOrderOverview(dealId) {
      const userP = me();
      const dealP = api.readDeal ? api.readDeal(dealId) : api.getDeal(dealId);
      const listsP = Promise.all([
        api.listTasks(dealId),
        api.listDocuments(dealId),
        api.listThreads(dealId),
      ]);
      const user = await userP;
      if (!user || !user.id) throw new Error('Please sign in.');
      // Staff only. Buyers, sellers, and agents are not asked for deal_emails (RLS would return nothing).
      // A missing read-cursor table resolves to 0 inside fileEmailUnreadCount; it must not reject the file.
      const emailP = (canUseGmail(user) && api.fileEmailUnreadCount) ? api.fileEmailUnreadCount(dealId).catch(() => 0) : Promise.resolve(0);
      const deal = await dealP;
      if (!deal || !deal.id) throw new Error('Order not found.');
      const [tasks, documents, threads] = await listsP;
      if (!Array.isArray(tasks) || !Array.isArray(documents) || !Array.isArray(threads)) {
        throw new Error('Order overview could not be loaded.');
      }
      // Francis, Nov 9: processorNames fills processorName first, so the old "!processorName" gate
      // skipped email/phone. Load them whenever someone is assigned, but a failed or stuck read
      // leaves the address blank instead of rejecting the whole file page.
      if (deal.processorId) {
        const raw = await processorContact(sb, deal.processorId);
        const row = raw ? camel(raw) : null;
        if (row && row.id) {
          if (!deal.processorName) deal.processorName = `${row.firstName || ''} ${row.lastName || ''}`.trim();
          deal.processorEmail = row.email || '';
          deal.processorPhone = row.phone || '';
        }
      }
      const ids = threads.map((t) => t.id);
      const reads = ids.length ? camel(ok(await sb.from('thread_participants').select('thread_id,last_read_at').eq('profile_id', user.id).in('thread_id', ids))) || [] : [];
      const readAt = new Map(reads.map((r) => [r.threadId, r.lastReadAt || '']));
      const actors = await names(threads.flatMap((t) => (t.messages || []).map((m) => m.authorId)));
      for (const t of threads) {
        const since = readAt.get(t.id) || '';
        t.unread = (t.messages || []).filter((m) => m.authorId !== user.id && (!since || String(m.createdAt) > String(since))).length;
        const last = (t.messages || [])[t.messages.length - 1];
        if (last && !last.authorName) last.authorName = actors.get(last.authorId) || '';
      }
      const emailUnread = await emailP;
      return buildOrderOverview({ deal, me: user, tasks, documents, threads, activity: null, salesPeople: deal.salesPeople || [], emailUnread });
    },
    async requestUpdate(dealId, { topic, note } = {}) {
      const user = await me();
      if (!user || !user.id) throw new Error('Please sign in.');
      const id = ok(await sb.rpc('request_update', { p_deal: dealId, p_topic: topic || '', p_note: note || '' }));
      return { id };
    },
    async respondUpdateRequest(id, { response } = {}) {
      const user = await me();
      if (!user || !user.id) throw new Error('Please sign in.');
      ok(await sb.rpc('respond_update_request', { p_id: id, p_response: response || '' }));
      return { id };
    },
    async listUpdateRequests(dealId) {
      const user = await me();
      if (!user || !user.id) throw new Error('Please sign in.');
      const deal = await (api.readDeal ? api.readDeal(dealId) : api.getDeal(dealId));
      if (!deal || !deal.id) throw new Error('Order not found.');
      const rows = camel(ok(await sb.from('update_requests').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }))) || [];
      const who = await names(rows.flatMap((r) => [r.requestedBy, r.respondedBy]));
      return rows.map((r) => ({ ...r, requestedByName: who.get(r.requestedBy) || '', respondedByName: r.respondedBy ? (who.get(r.respondedBy) || '') : '' }));
    },
    async listSharedAccess(dealId) {
      const user = await me();
      if (!user || !user.id) throw new Error('Please sign in.');
      const deal = await (api.readDeal ? api.readDeal(dealId) : api.getDeal(dealId));
      if (!deal || !deal.id) throw new Error('Order not found.');
      const rows = camel(ok(await sb.from('access_invites').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }))) || [];
      const who = await names(rows.map((r) => r.invitedBy));
      return rows.map((r) => ({ ...r, invitedByName: who.get(r.invitedBy) || '' }));
    },
  };
}
