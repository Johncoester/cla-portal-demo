import { isSuperAdmin } from './constants.js?v=202611100245';
export function emailSendersSupabase({ sb, ok, me }) {
  const guard = async () => { const u = await me(); if (!isSuperAdmin(u)) throw new Error('Only a Super admin can see or change email sender settings.'); };
  return {
    async listEmailSenderSettings() { await guard(); const rows = ok(await sb.from('email_sender_settings').select('*')) || []; return Object.fromEntries(rows.map((r) => [r.sender_type, { email: r.email, displayName: r.display_name, updatedAt: r.updated_at, updatedBy: r.updated_by }])); },
    async updateEmailSenderSettings(input) { await guard(); const out = {}; for (const type of ['hr', 'portal']) { const v = input[type]; if (!v) continue; const r = ok(await sb.rpc('set_email_sender', { p_type: type, p_email: v.email, p_display: v.displayName })); out[type] = { email: r.email, displayName: r.display_name }; } return out; },
  };
}
