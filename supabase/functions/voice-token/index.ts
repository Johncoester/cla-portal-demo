/* TEST project only. verify_jwt stays on, so an anonymous call never reaches this file.
 * Secrets, set in the TEST function settings, not in the repo:
 *   XAI_API_KEY
 *   VOICE_ALLOWLIST = the two confirmed auth user ids, comma-separated
 * Do not log either secret or the short-lived pass. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleVoiceToken, parseAllowlist, projectRefFromUrl, createMintLog, corsHeaders, TOKEN_SECONDS } from './logic.mjs';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const mints = createMintLog();

function headersFor(req: Request) {
  return corsHeaders(req.headers.get('Origin') ?? '');
}

async function mint(key: string) {
  const res = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expires_after: { seconds: TOKEN_SECONDS } }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  const value = typeof body.value === 'string' ? body.value : '';
  if (!value.startsWith('xai-realtime-client-secret-')) return null;
  return { value, expires_at: body.expires_at };
}

Deno.serve((req: Request) => {
  const auth = req.headers.get('Authorization') ?? '';
  const sb = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  return handleVoiceToken(req, {
    projectRef: projectRefFromUrl(url),
    allowlist: parseAllowlist(Deno.env.get('VOICE_ALLOWLIST') ?? ''),
    providerKey: Deno.env.get('XAI_API_KEY') ?? '',
    mints,
    headers: headersFor(req),
    getUser: async () => {
      const token = auth.replace(/^Bearer\s+/i, '');
      if (!token) return null;
      const { data, error } = await sb.auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id, is_anonymous: data.user.is_anonymous === true };
    },
    profile: async (id: string) => {
      const { data, error } = await sb.rpc('my_profile');
      if (error || !data) return null;
      const rowId = data.id || data.profile_id;
      if (rowId && String(rowId).toLowerCase() !== String(id).toLowerCase()) return null;
      return { status: data.status };
    },
    demoView: async () => {
      const { data, error } = await sb.rpc('demo_view_status');
      if (error || !data) return { active: false };
      return { active: data.active === true };
    },
    mint,
  });
});
