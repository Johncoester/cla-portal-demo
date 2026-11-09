/* Real dependencies for the gmail-* edge functions (TEST project only).
 * Secrets come from the function environment: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (set by John), SUPABASE_SERVICE_ROLE_KEY (platform).
 * They are never logged and never returned. User reads use the caller's JWT so RLS decides what they can open. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from './gmail-core.mjs';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const projectRef = (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/) || [])[1] || '';
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

export function buildDeps(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  return {
    projectRef,
    clientId: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
    headers: corsHeaders(req.headers.get('Origin') ?? ''),
    fetch: (u: string, init?: RequestInit) => fetch(u, init),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    async getUser() {
      if (!jwt) return null;
      const { data, error } = await admin.auth.getUser(jwt);
      if (error || !data.user || data.user.is_anonymous) return null;
      return { id: data.user.id };
    },
    async myContext() {
      const { data, error } = await asUser.rpc('gmail_my_context');
      return error ? null : data;
    },
    async userRpc(fn: string, args: Record<string, unknown>) {
      const { data, error } = await asUser.rpc(fn, args);
      if (error) throw new Error(error.message);
      return data;
    },
    async svc(fn: string, args: Record<string, unknown>) {
      const { data, error } = await admin.rpc(fn, args);
      if (error) throw new Error(error.message);
      return data;
    },
    async userDeal(id: string) {
      const { data } = await asUser.from('deals').select('id, file_number, street, city, state, zip').eq('id', id).maybeSingle();
      return data || null;
    },
    async userDocs(dealId: string, ids: string[]) {
      const { data, error } = await asUser.from('documents').select('id, deal_id, name, mime_type, size_bytes, storage_path, wire_instructions').eq('deal_id', dealId).in('id', ids);
      if (error) throw new Error('Could not read the attachments.');
      return data || [];
    },
    async userDocBytes(path: string) {
      const { data, error } = await asUser.storage.from('deal-documents').download(path);
      if (error || !data) throw new Error('Could not read an attachment file.');
      return new Uint8Array(await data.arrayBuffer());
    },
    async userEmail(id: string) {
      const { data } = await asUser.from('deal_emails').select('id, deal_id, mailbox_email, gmail_thread_id, rfc_message_id').eq('id', id).maybeSingle();
      return data || null;
    },
    async storeAttachment(path: string, bytes: Uint8Array, mime: string) {
      const { error } = await admin.storage.from('deal-documents').upload(path, bytes, { contentType: mime || 'application/octet-stream', upsert: false });
      if (error) throw new Error('Could not save an attachment.');
    },
  };
}
