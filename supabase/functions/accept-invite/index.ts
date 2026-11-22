// accept-invite: create a portal login from a one-time HR or agent invite.
// verify_jwt MUST be false. Deploy with: supabase functions deploy accept-invite --no-verify-jwt
// The invitee has no session. The invite token is the credential. Public sign-up stays off.
// CORS allows only the current Pages origin and https://testportal.clatitle.com. The service-role key stays in this function's environment.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { GENERIC, handleAcceptInvite } from './logic.mjs';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve((req: Request) => handleAcceptInvite(req, {
  sha256,
  gate: async (k: string) => {
    const r = await admin.rpc('service_invite_gate', { p_key: k });
    return !r.error && r.data === true;
  },
  email: async (kind: string, token: string) => {
    const r = await admin.rpc('service_invite_email', { p_kind: kind, p_token: token });
    if (r.error) return null;
    return r.data;
  },
  createUser: async ({ email, password, email_confirm }: { email: string; password: string; email_confirm: boolean }) => {
    const r = await admin.auth.admin.createUser({ email, password, email_confirm });
    if (r.error || !r.data.user) throw new Error('create');
    return { id: r.data.user.id };
  },
  deleteUser: async (id: string) => { await admin.auth.admin.deleteUser(id); },
  findStub: async (email: string) => {
    const want = String(email || '').trim().toLowerCase();
    for (let page = 1; page <= 10; page += 1) {
      const r = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (r.error || !r.data) return null;
      const u = r.data.users.find((x) => String(x.email || '').toLowerCase() === want);
      if (u) {
        const p = await admin.from('profiles').select('id').eq('id', u.id).maybeSingle();
        if (p.error) return null;
        return { id: u.id, invited: !!u.invited_at, hasProfile: !!p.data };
      }
      if (r.data.users.length < 1000) return null;
    }
    return null;
  },
  hasProfile: async (id: string) => {
    const p = await admin.from('profiles').select('id').eq('id', id).maybeSingle();
    if (p.error) throw new Error('profile');
    return !!p.data;
  },
  claimStub: async (id: string, password: string) => {
    const r = await admin.auth.admin.updateUserById(id, { password, email_confirm: true });
    if (r.error) throw new Error('claim');
  },
  accept: async (kind: string, token: string, userId: string, profile: Record<string, unknown>) => {
    const r = await admin.rpc('service_accept_invite', { p_kind: kind, p_token: token, p_user: userId, p: profile });
    if (r.error) {
      const err = new Error(GENERIC);
      if (r.error.code === '22023') { err.message = r.error.message; (err as Error & { code?: string }).code = '22023'; }
      throw err;
    }
  },
}));
