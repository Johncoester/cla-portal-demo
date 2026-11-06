// Calls the accept-invite edge function, then the page signs in with the new password.
// The publishable key identifies the project. The service-role key is not in this file.
const GENERIC = 'This invite link is not valid or has expired.';
export async function acceptInviteRemote(sb, body) {
  const base = String(sb.supabaseUrl || '').replace(/\/$/, '');
  const key = sb.supabaseKey;
  if (!base || !key) throw new Error(GENERIC);
  const res = await fetch(base + '/functions/v1/accept-invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
    body: JSON.stringify(body),
  });
  let payload = {};
  try { payload = await res.json(); } catch { payload = {}; }
  if (!res.ok || !payload.ok) throw new Error((payload && payload.error) || GENERIC);
  return payload;
}
