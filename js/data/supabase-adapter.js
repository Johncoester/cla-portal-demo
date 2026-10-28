/* [SUPABASE] Skeleton of the real adapter. NOT connected to any project and NOT tested against one.
 * Implemented: sign-in/out/session and a few reads/writes to show the pattern (RLS in supabase/migrations does the access control).
 * Everything else throws "not implemented yet" and is the next piece of work (see docs/PLAN.md). Method names match mock-adapter.js. */
const SB = 'https://esm.sh/@supabase/supabase-js@2.45.4';   // pinned; vendor locally before go-live
const todo = (n) => async () => { throw new Error('Supabase adapter: ' + n + ' is not implemented yet.'); };

export async function createSupabaseAdapter(cfg) {
  const { createClient } = await import(SB);
  const sb = createClient(cfg.url, cfg.anonKey);
  const ok = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
  const camel = (o) => Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o;
  const me = async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return null;
    return camel(ok(await sb.from('profiles').select('*').eq('id', user.id).single()));
  };
  const a = {
    // ---- auth (real logins at go-live; the dev picker is mock-only) ----
    async listDevUsers() { return []; },
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); return me(); },
    async getSession() { return me(); },
    async signOut() { await sb.auth.signOut(); },
    async resetDemoData() {},
    async getMyProfile() { return me(); },
    // ---- examples of the pattern ----
    async listDeals() { return camel(ok(await sb.from('deals').select('*').order('created_at', { ascending: false }))); },
    async getDeal(id) { return camel(ok(await sb.from('deals').select('*, deal_participants(*, contacts(*))').eq('id', id).single())); },
    async listTasks(dealId) { return camel(ok(await sb.from('tasks').select('*').eq('deal_id', dealId).order('created_at'))); },
    async updateTask(id, patch) { return ok(await sb.rpc('set_task_status', { p_task: id, p_status: patch.status })); },
    async listDocuments(dealId) { return camel(ok(await sb.from('documents').select('*').eq('deal_id', dealId))); },
    // NOTE: there is intentionally no deleteDocument anywhere.
  };
  for (const n of ['pickPerson', 'signInDev', 'updateMyProfile', 'getWorkQueue', 'unreadCount', 'createDeal', 'updateDeal', 'setStage', 'setDealStatus',
    'listContacts', 'createContact', 'updateContact', 'addParticipant', 'removeParticipant', 'createTask', 'addDocument', 'updateDocumentMeta', 'getDocumentContent',
    'listMessageRecipients', 'listThreads', 'getThread', 'createThread', 'postMessage', 'markThreadRead', 'listActivity', 'adminListUsers', 'adminUpdateUser', 'adminCreateUser']) a[n] = todo(n);
  return a;
}
