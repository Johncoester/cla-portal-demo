/* outbox-send (OUTBOX-SEND-1/2, CLA Portal Live Test). Called every minute by pg_cron 'outbox-send-every-minute' once John creates
 * the Vault token 'outbox_send_token'. Logic: ../_shared/outbox-core.mjs (tested in test/test-outbox-sender.js).
 * Sends each email from the file's processor's own connected Gmail (same connection as gmail-send). Uses the project's existing
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET function secrets; no new secret. Nothing is logged or returned that holds a token.
 * Deploy with --no-verify-jwt: the caller proves itself with the Vault token instead. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleOutboxSend } from '../_shared/outbox-core.mjs';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

const deps = {
  clientId: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
  clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
  fetch: (u: string, init?: RequestInit) => fetch(u, init),
  now: () => Date.now(),
  rpc,
  checkToken: async (t: string) => !!(await rpc('outbox_svc_check_token', { p_token: t })),
  async fileFor(outboxId: string) {
    const { data: o, error } = await admin.from('outbox').select('deal_id').eq('id', outboxId).maybeSingle();
    if (error) throw new Error('outbox read failed');
    if (!o || !o.deal_id) return null;
    const { data: d, error: de } = await admin.from('deals').select('id, file_number, processor_id').eq('id', o.deal_id).maybeSingle();
    if (de) throw new Error('file read failed');
    if (!d) return null;
    let p = null;
    if (d.processor_id) {
      const { data: pr, error: pe } = await admin.from('profiles').select('id, first_name, last_name, status').eq('id', d.processor_id).maybeSingle();
      if (pe) throw new Error('processor read failed');
      p = pr;
    }
    return { dealId: d.id, fileNumber: d.file_number || '', processorId: p ? p.id : null,
      processorName: p ? `${p.first_name || ''} ${p.last_name || ''}`.replace(/\s+/g, ' ').trim() : '', processorStatus: p ? p.status : null };
  },
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
