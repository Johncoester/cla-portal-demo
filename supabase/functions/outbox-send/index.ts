/* outbox-send (OUTBOX-SEND-1, CLA Portal Live Test). Called every minute by pg_cron 'outbox-send-every-minute'.
 * Logic: ../_shared/outbox-core.mjs (tested in test/test-outbox-sender.js). Email service: ../_shared/outbox-providers.mjs.
 * Secrets come from the function environment (set by John): OUTBOX_PROVIDER plus the service's keys. They are never logged or returned.
 * Without them the function does nothing. Deploy with --no-verify-jwt: the caller proves itself with the Vault token instead. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleOutboxSend } from '../_shared/outbox-core.mjs';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const env = Object.fromEntries(['OUTBOX_PROVIDER', 'AWS_SES_REGION', 'AWS_SES_ACCESS_KEY_ID', 'AWS_SES_SECRET_ACCESS_KEY', 'AWS_SES_CONFIGURATION_SET', 'RESEND_API_KEY']
  .map((k) => [k, Deno.env.get(k) ?? '']));

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

const deps = {
  env,
  fetch: (u: string, init?: RequestInit) => fetch(u, init),
  now: () => Date.now(),
  rpc,
  checkToken: async (t: string) => !!(await rpc('outbox_svc_check_token', { p_token: t })),
  async loadDocs(ids: string[]) {
    const { data, error } = await admin.from('documents').select('id, name, mime_type, size_bytes, storage_path, wire_instructions').in('id', ids);
    if (error) throw new Error('Could not read the attachments.');
    return (data || []).map((d: Record<string, unknown>) => ({ name: String(d.name || 'attachment'), mime: String(d.mime_type || ''), size: Number(d.size_bytes) || 0,
      wire: !!d.wire_instructions, async bytes() {
        const { data: f, error: e } = await admin.storage.from('deal-documents').download(String(d.storage_path || ''));
        if (e || !f) throw new Error('Could not read an attachment file.');
        return new Uint8Array(await f.arrayBuffer());
      } }));
  },
};

Deno.serve(async (req: Request) => {
  try { return await handleOutboxSend(req, deps); }
  catch (_e) {
    return new Response(JSON.stringify({ error: 'The send run stopped. Emails it had taken are marked failed after 10 minutes and are not sent twice.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
