/* e2e-gmail-oauth (TEST only). One-time redirect for the clatestportal@gmail.com inbox.
 * Deploy with JWT verification OFF. Google sends the browser here with no Supabase JWT.
 * POST from Profile Setting still requires a signed-in Admin or Super admin; this file checks that JWT itself.
 * No function secrets. The client id, client secret, and refresh token stay in Vault.
 * Do not log the request URL. Logic: ../_shared/e2e-gmail.mjs */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleE2eGmail, e2eCors } from '../_shared/e2e-gmail.mjs';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const projectRef = (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/) || [])[1] || '';
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

function safeLine(e: unknown) {
  const s = String((e as Error)?.message || e || '').slice(0, 180);
  if (/refresh|secret|ya29\.|access_token|client_secret|code=/i.test(s)) return 'e2e-gmail-oauth failed';
  return `e2e-gmail-oauth failed: ${s}`;
}

function buildDeps(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  return {
    projectRef,
    headers: e2eCors(req.headers.get('Origin') ?? ''),
    fetch: (u: string, init?: RequestInit) => fetch(u, init),
    log: (line: string) => console.warn(String(line).slice(0, 120)),
    async getUser() {
      if (!jwt || jwt === anon) return null;
      const { data, error } = await admin.auth.getUser(jwt);
      if (error || !data.user || data.user.is_anonymous) return null;
      return { id: data.user.id };
    },
    async svc(fn: string, args: Record<string, unknown>) {
      const { data, error } = await admin.rpc(fn, args);
      if (error) throw new Error(error.message);
      return data;
    },
  };
}

Deno.serve(async (req: Request) => {
  const deps = buildDeps(req);
  try { return await handleE2eGmail(req, deps); }
  catch (e) {
    console.warn(safeLine(e));
    const body = req.method === 'GET'
      ? 'The connection did not finish. Go back to Profile Setting and open the consent page again.'
      : JSON.stringify({ error: 'The setup did not finish.' });
    return new Response(body, { status: 500, headers: { ...deps.headers, 'Content-Type': req.method === 'GET' ? 'text/plain; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store' } });
  }
});
