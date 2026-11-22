/* Gmail phase 1 request handlers (TEST only). Everything outside comes in through `deps`, so the Node tests run these with fakes:
 *   deps.projectRef, deps.clientId, deps.clientSecret (never logged or returned), deps.fetch (Google only), deps.headers (CORS)
 *   deps.getUser() -> { id } | null                 verified Supabase session (the user's JWT)
 *   deps.myContext() -> gmail_my_context() as the user
 *   deps.svc(fn, args) -> data                      service-role RPC (gmail_svc_*), throws on error
 *   deps.userDeal(id), deps.userDocs(dealId, ids), deps.userDocBytes(path), deps.userEmail(id)   reads AS THE USER (RLS decides)
 *   deps.storeAttachment(path, bytes, mime)         service-role upload to deal-documents
 *   deps.userRpc(fn, args) -> data                 RPC AS THE USER (their JWT), throws with the database message (invite_send_info)
 *   deps.authInvite(email, { redirectTo, data }) -> { id } | { error, exists }   TEST Auth "Invite user" email (from testportal@clatitle.com)
 *   deps.authStub(email) -> { id, invited, hasProfile } | null, deps.deleteAuthUser(id)   an invite-only login that never became a portal user
 *   deps.newId() -> uuid, deps.now() -> ms */
import { TEST_PROJECT_REF, PORTAL_ORIGIN, REDIRECT_URI, GMAIL_ROLES, MAX_RECIPIENTS, MAX_DOCS, MAX_ATTACH_BYTES, MAX_MESSAGE_BYTES, MAX_SAVE_BYTES, MAX_BODY_CHARS,
  parseAddressList, subjectWithTag, formatPropertyAddress, sanitizeHtml, htmlToText, hasWireDetails, isWireName, extOk, safeName, matchUploadKeys, buildMime, b64url, b64urlToBytes, utf8, estimateMimeBytes,
  parseGmailMessage, randomToken, sha256Hex, pkceChallenge, authUrl, decodeJwtPayload, missingScopes, oneLine, json, hasSettingsScope, pickSendAsSignature, withSignature, isEmail, INVITE_TOKEN_RE, unnotifiedTasks, AUTH_INVITE_SUBJECT, PORTAL_INVITE_SENDER, inviteAuthRedirect, inviteAuthData, inviteSubjectFor } from './gmail-core.mjs';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const STAFF_ONLY = `Gmail in the portal is for CLA staff logins (${GMAIL_ROLES.join(', ')}).`;

class ReconnectError extends Error {}
const wrongProject = (deps) => deps.projectRef !== TEST_PROJECT_REF;

async function staffGate(deps) {
  if (wrongProject(deps)) return { res: json(503, { error: 'Gmail phase 1 runs on CLA Portal Live Test only.' }, deps.headers) };
  const user = await deps.getUser();
  if (!user) return { res: json(401, { error: 'Please sign in.' }, deps.headers) };
  const ctx = await deps.myContext();
  if (!ctx || String(ctx.uid || '').toLowerCase() !== String(user.id).toLowerCase()) return { res: json(401, { error: 'Please sign in.' }, deps.headers) };
  if (ctx.viewAs) return { res: json(403, { error: 'View as is read-only. Go back to your account to use Gmail.' }, deps.headers) };
  if (!ctx.allowed) return { res: json(403, { error: STAFF_ONLY }, deps.headers) };
  return { user, ctx };
}

async function googleForm(deps, url, form) {
  const res = await deps.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
  let body = {}; try { body = await res.json(); } catch (e) { body = {}; }
  return { ok: res.ok, status: res.status, body };
}
export async function accessTokenFor(deps, refresh) {
  const r = await googleForm(deps, TOKEN_URL, { client_id: deps.clientId, client_secret: deps.clientSecret, refresh_token: refresh, grant_type: 'refresh_token' });
  if (r.ok && r.body.access_token) return r.body.access_token;
  if (r.body && (r.body.error === 'invalid_grant' || r.body.error === 'unauthorized_client')) throw new ReconnectError('Google access was revoked or expired. Connect Gmail again on your Profile.');
  throw new Error(`Google did not refresh access (HTTP ${r.status}).`);
}
async function gmail(deps, token, path, init = {}) {
  const res = await deps.fetch(`${GMAIL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
  let body = null; try { body = await res.json(); } catch (e) { body = null; }
  return { ok: res.ok, status: res.status, body };
}
const headerGet = (res, name) => {
  const h = res && res.headers;
  if (!h) return '';
  if (typeof h.get === 'function') return h.get(name) || h.get(name.toLowerCase()) || '';
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? String(h[key] || '') : '';
};
// Filenames Gmail actually stored. Large parts come back with a size and no inline bytes.
function filesOnPayload(payload) {
  const out = [];
  const walk = (p) => { if (!p) return; if (p.filename) out.push({ name: String(p.filename), size: Number((p.body && p.body.size) || 0) || ((p.body && p.body.data) ? 1 : 0) }); for (const c of p.parts || []) walk(c); };
  walk(payload);
  return out;
}
function sameFileList(wanted, got) {
  const pool = got.filter((g) => g.size > 0).map((g) => g.name);
  for (const name of wanted) { const i = pool.indexOf(name); if (i < 0) return false; pool.splice(i, 1); }
  return true;
}
/* JSON {raw: base64url} drops attachments once the message is more than a few MB (Gmail still returns 200
 * and a message id, so the portal used to record the names and tell the sender it worked). Attachments go
 * as the RFC822 bytes on the resumable upload endpoint instead. */
async function sendRfc822(deps, access, rawBytes, { threadId } = {}) {
  const start = await deps.fetch('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=resumable', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'message/rfc822', 'X-Upload-Content-Length': String(rawBytes.length) },
    body: JSON.stringify(threadId ? { threadId } : {}),
  });
  let startBody = null; try { startBody = await start.json(); } catch (e) { startBody = null; }
  const loc = headerGet(start, 'Location');
  let host = ''; try { host = new URL(loc).hostname; } catch (e) { host = ''; }
  if (!start.ok || !loc || !/(^|\.)googleapis\.com$/i.test(host)) return { ok: false, status: start.status || 502, body: startBody };
  const put = await deps.fetch(loc, { method: 'PUT', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'message/rfc822' }, body: rawBytes });
  let body = null; try { body = await put.json(); } catch (e) { body = null; }
  return { ok: put.ok || put.status === 201, status: put.status, body };
}
async function revoke(deps, token) {
  if (!token) return false;
  try { const r = await deps.fetch(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString() }); return r.ok; } catch (e) { return false; }
}
// read-only: the person's current Gmail signature (needs gmail.settings.basic). { ok, html } or { ok: false, scope: true } on a missing scope
async function gmailSignature(deps, access) {
  const r = await gmail(deps, access, '/settings/sendAs');
  if (r.ok) return { ok: true, html: pickSendAsSignature(r.body) };
  const reason = JSON.stringify((r.body && r.body.error) || {});
  return { ok: false, scope: r.status === 403 && /insufficient|scope|PERMISSION_DENIED/i.test(reason), status: r.status };
}
const rowOf = (x) => (Array.isArray(x) ? x[0] : x) || null;

/* ---------------- gmail-oauth-start: start | status | disconnect ---------------- */
export async function handleOauthStart(req, deps) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: deps.headers });
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' }, deps.headers);
  const g = await staffGate(deps); if (g.res) return g.res;
  let body = {}; try { body = await req.json(); } catch (e) { body = {}; }
  const action = body && typeof body.action === 'string' ? body.action : 'status';
  if (action === 'status') return json(200, { allowed: true, connected: !!g.ctx.mailbox, mailbox: g.ctx.mailbox || null, status: g.ctx.mailboxStatus || null }, deps.headers);
  if (action === 'start') {
    if (!deps.clientId || !deps.clientSecret) return json(503, { error: 'Gmail is not set up on this project yet.' }, deps.headers);
    const state = randomToken(32); const verifier = randomToken(48);
    await deps.svc('gmail_svc_begin_oauth', { p_profile: g.user.id, p_state_hash: await sha256Hex(state), p_verifier: verifier });
    return json(200, { url: authUrl({ clientId: deps.clientId, state, challenge: await pkceChallenge(verifier), loginHint: g.ctx.email }) }, deps.headers);
  }
  if (action === 'refresh_signature') {
    if (!g.ctx.mailbox) return json(409, { error: 'Connect Gmail first.' }, deps.headers);
    if (!g.ctx.signatureScope) return json(409, { error: 'Reconnect Gmail to import your signature.', needsReconnect: true }, deps.headers);
    const row = rowOf(await deps.svc('gmail_svc_token', { p_profile: g.user.id }));
    if (!row || !row.refresh_token) return json(409, { error: 'Connect Gmail first.' }, deps.headers);
    let access; try { access = await accessTokenFor(deps, row.refresh_token); }
    catch (e) { return json(e instanceof ReconnectError ? 409 : 502, { error: e instanceof ReconnectError ? e.message : 'Google did not answer. Try again.' }, deps.headers); }
    const sig = await gmailSignature(deps, access);
    if (!sig.ok) return json(sig.scope ? 409 : 502, sig.scope ? { error: 'Reconnect Gmail to import your signature.', needsReconnect: true } : { error: `Gmail did not return your signature (HTTP ${sig.status}).` }, deps.headers);
    await deps.svc('gmail_svc_set_gmail_signature', { p_profile: g.user.id, p_html: sig.html, p_force: true });
    return json(200, { ok: true, signatureHtml: sig.html, empty: !htmlToText(sig.html) }, deps.headers);
  }
  if (action === 'disconnect') {
    const row = rowOf(await deps.svc('gmail_svc_token', { p_profile: g.user.id }));
    const revoked = row ? await revoke(deps, row.refresh_token) : false;
    const email = await deps.svc('gmail_svc_disconnect', { p_profile: g.user.id, p_detail: row ? (revoked ? 'token revoked at Google' : 'Google did not confirm the revoke') : 'no stored token' });
    if (row && !revoked) await deps.svc('gmail_svc_audit', { p_profile: g.user.id, p_deal: null, p_action: 'mail.revoke_failed', p_detail: 'Google did not confirm the token revoke on Disconnect. The stored token was deleted.' });
    return json(200, { disconnected: true, mailbox: email || null, revoked }, deps.headers);
  }
  return json(400, { error: 'Unknown action.' }, deps.headers);
}

/* ---------------- gmail-oauth-callback (Google redirects the browser here; verify_jwt off) ---------------- */
const back = (code) => new Response(null, { status: 302, headers: { Location: `${PORTAL_ORIGIN}/#/profile?gmail=${code}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
// which step failed, with Google's own error code (never a token, code, or secret), so a failed connect can be diagnosed from the function logs
const gErr = (b) => { if (!b || typeof b !== 'object') return ''; const e = b.error; if (typeof e === 'string') return `${e}${b.error_description ? ` (${String(b.error_description).slice(0, 200)})` : ''}`;
  if (e && typeof e === 'object') { const r = (e.errors && e.errors[0] && e.errors[0].reason) || (e.details && e.details[0] && e.details[0].reason) || ''; return `${e.status || ''} ${r} ${String(e.message || '').slice(0, 240)}`.trim(); } return ''; };
export const callbackDiag = (step, res) => `gmail-oauth-callback failed at ${step}${res ? `: HTTP ${res.status} ${gErr(res.body)}` : ''}`.trim();
const why = (deps, step, res) => { try { (deps.log || console.warn)(callbackDiag(step, res)); } catch (e) { /* logging never breaks the redirect */ } };
export async function handleOauthCallback(req, deps) {
  if (wrongProject(deps)) return back('failed');
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const u = new URL(req.url); const state = u.searchParams.get('state') || ''; const code = u.searchParams.get('code') || ''; const err = u.searchParams.get('error') || '';
  if (!state || state.length > 200) return back('failed');
  const taken = rowOf(await deps.svc('gmail_svc_take_oauth', { p_state_hash: await sha256Hex(state) }));
  if (!taken) return back('expired');
  if (err) return back('denied');
  if (!code || !deps.clientId || !deps.clientSecret) { why(deps, !code ? 'no code from Google' : 'client id / secret not set'); return back('failed'); }
  const t = await googleForm(deps, TOKEN_URL, { code, client_id: deps.clientId, client_secret: deps.clientSecret, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code', code_verifier: taken.code_verifier });
  if (!t.ok || !t.body.access_token) { why(deps, 'token exchange', t); return back('failed'); }
  const tok = t.body; const kill = async () => { await revoke(deps, tok.refresh_token || tok.access_token); };
  if (missingScopes(tok.scope).length) { why(deps, `scopes (granted: ${String(tok.scope || '')})`); await kill(); return back('missing_scope'); }
  const idp = decodeJwtPayload(tok.id_token) || {}; const email = String(idp.email || '').toLowerCase();
  if (!idp.email_verified || idp.hd !== 'clatitle.com' || !/^[^@\s]+@clatitle\.com$/.test(email)) { why(deps, `domain check (hd=${idp.hd || 'none'}, verified=${!!idp.email_verified})`); await kill(); return back('wrong_domain'); }
  const prof = await gmail(deps, tok.access_token, '/profile');
  if (!prof.ok || String(prof.body && prof.body.emailAddress || '').toLowerCase() !== email) { why(deps, prof.ok ? 'Gmail profile address differs from the Google sign-in' : 'Gmail profile', prof.ok ? null : prof); await kill(); return back('failed'); }
  if (!tok.refresh_token) { why(deps, 'no refresh token from Google'); await kill(); return back('failed'); }
  try { await deps.svc('gmail_svc_connect', { p_profile: taken.profile_id, p_email: email, p_refresh: tok.refresh_token, p_scopes: String(tok.scope || ''), p_history: String(prof.body.historyId || '') }); }
  catch (e) { why(deps, `saving the connection: ${String(e && e.message || e).slice(0, 200)}`); await kill(); return back(/another portal login/i.test(String(e && e.message)) ? 'in_use' : 'failed'); }
  // import the current Gmail signature (never blocks the connect; a typed portal signature is kept)
  if (hasSettingsScope(tok.scope)) {
    try { const sig = await gmailSignature(deps, tok.access_token);
      if (sig.ok) await deps.svc('gmail_svc_set_gmail_signature', { p_profile: taken.profile_id, p_html: sig.html, p_force: false }); else why(deps, 'signature import (connect still saved)', { status: sig.status, body: {} });
    } catch (e) { why(deps, `signature import (connect still saved): ${String(e && e.message || e).slice(0, 120)}`); }
  }
  return back('connected');
}

/* ---------------- gmail-send ---------------- */
export async function handleSend(req, deps) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: deps.headers });
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' }, deps.headers);
  const g = await staffGate(deps); if (g.res) return g.res;
  const { user, ctx } = g; const H = deps.headers;
  let b = {}; try { b = await req.json(); } catch (e) { return json(400, { error: 'Send a JSON body.' }, H); }
  if (b.invite) return inviteSend(b.invite, user, ctx, deps);
  const dryRun = b.dryRun === true;
  const deal = b.dealId ? await deps.userDeal(String(b.dealId)) : null;
  if (!deal) return json(404, { error: 'You cannot open that file.' }, H);
  const to = parseAddressList(b.to); const cc = parseAddressList(b.cc); const bcc = parseAddressList(b.bcc);
  const bad = [...to.bad, ...cc.bad, ...bcc.bad];
  if (bad.length) return json(400, { error: `Not an email address: ${bad.join(', ')}` }, H);
  const all = [...new Set([...to.ok, ...cc.ok, ...bcc.ok])];
  if (!to.ok.length) return json(400, { error: 'Add at least one To address.' }, H);
  if (all.length > MAX_RECIPIENTS) return json(400, { error: `At most ${MAX_RECIPIENTS} recipients per email.` }, H);
  // Nov 13 (John): no list of allowed test addresses. The team emails real addresses on TEST on purpose.
  const subjectIn = oneLine(b.subject, 250);
  if (!subjectIn) return json(400, { error: 'Add a subject.' }, H);
  const subject = subjectWithTag(subjectIn, deal.file_number || '', formatPropertyAddress(deal));
  const bodyHtml = sanitizeHtml(b.html || '');
  if (!htmlToText(bodyHtml)) return json(400, { error: 'Write a message first.' }, H);
  if (bodyHtml.length > MAX_BODY_CHARS) return json(400, { error: 'The message is too long.' }, H);
  if (hasWireDetails(htmlToText(bodyHtml)) || hasWireDetails(subject)) return json(400, { error: 'Wire / bank account details cannot be emailed from the portal. Remove them and call the buyer instead.' }, H);
  const ids = [...new Set((Array.isArray(b.documentIds) ? b.documentIds : []).map(String))];
  const uploadIds = [...new Set((Array.isArray(b.uploadIds) ? b.uploadIds : []).map(String))].filter((id) => !ids.includes(id));
  const pending = (Array.isArray(b.pendingUploads) ? b.pendingUploads : []).map((p) => ({ name: safeName(p && p.name), size: Number(p && p.size) || 0 })).filter((p) => p.name && p.name !== 'attachment');
  if (ids.length + uploadIds.length + (dryRun ? pending.length : 0) > MAX_DOCS) return json(400, { error: `At most ${MAX_DOCS} attachments.` }, H);
  if (pending.some((p) => !extOk(p.name) || isWireName(p.name))) return json(400, { error: 'That file cannot be attached. Wire instructions are never emailed, and the file type has to be one the portal allows.' }, H);
  const allIds = [...ids, ...uploadIds];
  const docs = allIds.length ? await deps.userDocs(deal.id, allIds) : [];
  if (docs.length !== allIds.length || docs.some((d) => d.deal_id !== deal.id)) return json(400, { error: 'An attachment is not a document on this file that you can open.' }, H);
  if (docs.some((d) => d.wire_instructions || isWireName(d.name))) return json(400, { error: 'Wire instructions cannot be attached to an email from the portal.' }, H);
  const picked = docs.filter((d) => ids.includes(d.id));
  const uploaded = docs.filter((d) => uploadIds.includes(d.id));
  const ordered = [...picked, ...uploaded];
  const total = ordered.reduce((s, d) => s + Number(d.size_bytes || 0), 0) + pending.reduce((s, p) => s + p.size, 0);
  if (total > MAX_ATTACH_BYTES) return json(400, { error: 'Attachments are over 18 MB. Send fewer files. Nothing was sent.' }, H);
  if ((ordered.length || pending.length) && estimateMimeBytes(total, 8000) > MAX_MESSAGE_BYTES) return json(400, { error: 'These files are too large to email (Gmail allows 25 MB for the whole message). Send fewer files. Nothing was sent.' }, H);
  let reply = null;
  if (b.replyToEmailId) { reply = await deps.userEmail(String(b.replyToEmailId)); if (!reply || reply.deal_id !== deal.id) return json(400, { error: 'That email is not on this file.' }, H); }
  const html = withSignature(bodyHtml, ctx.signatureHtml || '');
  const fromName = `${ctx.firstName || ''} ${ctx.lastName || ''}`.trim();
  const preview = { from: ctx.mailbox || null, fromName, to: to.ok, cc: cc.ok, bcc: bcc.ok, subject, signatureAdded: html !== bodyHtml, attachments: [...ordered.map((d) => ({ id: d.id, name: d.name, size: Number(d.size_bytes || 0) })), ...pending.map((p) => ({ id: null, name: p.name, size: p.size, pending: true }))], threaded: !!(reply && reply.mailbox_email === ctx.mailbox) };
  if (dryRun) return json(200, { ok: true, dryRun: true, connected: !!ctx.mailbox && ctx.mailboxStatus === 'connected', ...preview }, H);
  if (!ctx.mailbox) return json(409, { error: 'Connect Gmail first (Profile Setting > Gmail).' }, H);
  if (ctx.mailboxStatus !== 'connected') return json(409, { error: 'Your Gmail needs to be connected again (Profile Setting > Gmail).' }, H);
  const tok = rowOf(await deps.svc('gmail_svc_token', { p_profile: user.id }));
  if (!tok || !tok.refresh_token) return json(409, { error: 'Connect Gmail first (Profile Setting > Gmail).' }, H);
  let access;
  try { access = await accessTokenFor(deps, tok.refresh_token); }
  catch (e) {
    if (e instanceof ReconnectError) { await deps.svc('gmail_svc_update_account', { p_profile: user.id, p_status: 'needs_reconnect', p_error: e.message, p_history: null, p_synced: false }); return json(409, { error: e.message }, H); }
    await deps.svc('gmail_svc_audit', { p_profile: user.id, p_deal: deal.id, p_action: 'mail.failed', p_detail: `Not sent: ${e.message}` });
    return json(502, { error: 'Google did not answer. Nothing was sent.' }, H);
  }
  const attachments = [];
  for (const d of ordered) {
    let bytes;
    try { bytes = await deps.userDocBytes(d.storage_path); }
    catch (e) { return json(502, { error: `Could not read "${d.name}" from this file. Nothing was sent.` }, H); }
    if (!bytes || !bytes.length) return json(502, { error: `"${d.name}" is empty, so it was not attached. Nothing was sent.` }, H);
    attachments.push({ name: d.name, mime: d.mime_type, bytes });
  }
  const counted = ordered.reduce((s, d, i) => s + Math.max(Number(d.size_bytes) || 0, attachments[i].bytes.length), 0);
  if (ordered.length && estimateMimeBytes(counted, html.length + 8000) > MAX_MESSAGE_BYTES) return json(400, { error: 'These files are too large to email (Gmail allows 25 MB for the whole message). Send fewer files. Nothing was sent.' }, H);
  const raw = buildMime({ from: tok.email, fromName, to: to.ok, cc: cc.ok, bcc: bcc.ok, subject, html, text: htmlToText(html), attachments,
    inReplyTo: reply && reply.rfc_message_id || '', references: reply && reply.rfc_message_id || '', seed: deps.newId() });
  let sent;
  if (attachments.length) sent = await sendRfc822(deps, access, utf8(raw), { threadId: preview.threaded ? reply.gmail_thread_id : '' });
  else {
    const sendBody = { raw: b64url(raw) }; if (preview.threaded) sendBody.threadId = reply.gmail_thread_id;
    sent = await gmail(deps, access, '/messages/send', { method: 'POST', body: JSON.stringify(sendBody) });
  }
  if (!sent.ok || !sent.body || !sent.body.id) {
    await deps.svc('gmail_svc_audit', { p_profile: user.id, p_deal: deal.id, p_action: 'mail.failed', p_detail: `Gmail refused the send (HTTP ${sent.status}). Subject: ${subject}` });
    return json(502, { error: `Gmail did not send it (HTTP ${sent.status}). Nothing was sent.` }, H);
  }
  let rfc = ''; let confirmed = !attachments.length; let gotFiles = []; let gmailParts = [];
  const meta = await gmail(deps, access, `/messages/${encodeURIComponent(sent.body.id)}?format=${attachments.length ? 'full' : 'metadata'}&metadataHeaders=Message-ID`);
  if (meta.ok && meta.body && meta.body.payload) {
    rfc = ((meta.body.payload.headers || []).find((h) => /^message-id$/i.test(h.name)) || {}).value || '';
    if (attachments.length) { gotFiles = filesOnPayload(meta.body.payload); confirmed = sameFileList(ordered.map((d) => d.name), gotFiles); }
    if (uploaded.length) { const parsed = parseGmailMessage(meta.body); if (!rfc) rfc = parsed.rfcMessageId || ''; gmailParts = parsed.attachments || []; }
  }
  const keyed = confirmed ? matchUploadKeys(sent.body.id, picked.map((d) => d.name), uploaded.map((d) => ({ id: d.id, name: d.name })), gmailParts) : [];
  const savedNames = confirmed ? ordered.map((d) => d.name) : [];
  const savedIds = confirmed ? ordered.map((d) => d.id) : [];
  let id = null;
  try {
    id = await deps.svc('gmail_svc_record', { p: { deal_id: deal.id, mailbox_profile_id: user.id, mailbox_email: tok.email, direction: 'out', source: 'portal',
      gmail_message_id: sent.body.id, gmail_thread_id: sent.body.threadId, rfc_message_id: rfc, from_email: tok.email, from_name: fromName, to_emails: to.ok, cc_emails: cc.ok, bcc_emails: bcc.ok,
      subject, body_html: html, snippet: htmlToText(bodyHtml).slice(0, 200), sent_at: new Date(deps.now()).toISOString(), attachment_document_ids: savedIds,
      attachment_names: savedNames, keyed_documents: keyed, template_key: oneLine(b.templateKey, 60) || null, sent_by: user.id } });
  } catch (e) {
    return json(502, { error: 'Gmail sent the email, but the portal could not save it on the file. It will not show on the Email tab until it is checked again.', gmailMessageId: sent.body.id }, H);
  }
  if (!confirmed) {
    const unread = !(meta.ok && meta.body && meta.body.payload);
    const missing = ordered.map((d) => d.name).filter((n) => !gotFiles.some((g) => g.name === n && g.size > 0));
    const error = unread
      ? 'Gmail sent the email, but the portal could not confirm the attachments were kept. Check the sent message. It is saved on the file without attachment names.'
      : `Gmail sent the email but did not keep ${missing.length ? missing.join(', ') : 'the selected documents'}. The message is on the file without those attachments.`;
    return json(502, { error, id, gmailMessageId: sent.body.id }, H);
  }
  return json(200, { ok: true, id, gmailMessageId: sent.body.id, threadId: sent.body.threadId, ...preview, from: tok.email }, H);
}

/* ---------------- portal invite email ----------------
 * body { invite: { kind: 'agent' | 'hr', token } }. kind 'agent' = agent and buyer / seller invites, 'hr' = staff invites.
 * John, Nov 11 (t1488u / t1490u): invites come FROM testportal@clatitle.com, never from the inviter's Gmail or jcoester.
 * The recipient comes from invite_send_info() run AS THE INVITER. TEST Auth sends its approved Nov 9 "Invite user"
 * template (subject "You're invited to the CLA Title Portal") through its custom SMTP login testportal@clatitle.com.
 * The button lands on ?portal_invite=<kind>.<token>, which opens this portal's own accept page (the token stays the credential).
 * No inviter Gmail is read or used, so no "Connect Gmail" is needed. Live Test still refuses non-test addresses,
 * staffGate refuses every project other than TEST, sent_by is the inviter, and the body is not copied into deal_emails.
 * The follow-up task email is NOT sent here: it has no testportal path yet and must not go out from the inviter's Gmail. */
async function inviteSend(inv, user, ctx, deps) {
  const H = deps.headers;
  const kind = inv && inv.kind === 'hr' ? 'hr' : inv && inv.kind === 'agent' ? 'agent' : '';
  const token = String((inv && inv.token) || '').trim().toLowerCase();
  if (!kind || !INVITE_TOKEN_RE.test(token)) return json(400, { error: 'That is not a valid invite link.' }, H);
  let info = null;
  try { info = await deps.userRpc('invite_send_info', { p_kind: kind, p_token: token }); }
  catch (e) { return json(403, { error: oneLine(e && e.message, 200) || 'You cannot send this invite.' }, H); }
  if (!info || !isEmail(info.email)) return json(400, { error: 'This invite has no valid email address.' }, H);
  const to = String(info.email || '').trim().toLowerCase();
  const mark = async (messageId, error) => { try { await deps.svc('invite_svc_mark_sent', { p_kind: kind, p_token: token, p_profile: user.id, p_to: to, p_message_id: messageId, p_error: error }); } catch (e) { /* the send result still goes back to the page */ } };
  if (deps.projectRef !== TEST_PROJECT_REF) return json(503, { error: 'Gmail phase 1 runs on CLA Portal Live Test only.' }, H);
  if (typeof deps.authInvite !== 'function') return json(503, { error: `The portal mailbox (${PORTAL_INVITE_SENDER}) is not set up here. The invite was not emailed.`, to }, H);
  // portal_invite also rides in the Auth login itself, so the landing still finds the accept page if Auth falls back to its Site URL.
  // first_name / party_role / property_address go in the same metadata so the Auth invite template can name the property (FF-073d).
  const opts = { redirectTo: inviteAuthRedirect(kind, token), data: inviteAuthData(info, { kind, token }) };
  // An earlier invite email left an invite-only login that never became a portal user: replace it, so this email carries this link.
  // A real portal login (not Auth-invited, or already linked to a profile) is never touched.
  const stub = typeof deps.authStub === 'function' ? await deps.authStub(to) : null;
  if (stub && stub.id && !(stub.invited && !stub.hasProfile)) { await mark(null, 'Not sent: this email already has a portal login.'); return json(409, { error: 'This email already has a portal login, so the invite was not emailed. Copy the link below and send it yourself.', to }, H); }
  if (stub && stub.id && typeof deps.deleteAuthUser === 'function') await deps.deleteAuthUser(stub.id);
  const sent = await deps.authInvite(to, opts);
  if (sent && sent.exists) { await mark(null, 'Not sent: this email already has a portal login.'); return json(409, { error: 'This email already has a portal login, so the invite was not emailed. Copy the link below and send it yourself.', to }, H); }
  if (!sent || sent.error || !sent.id) {
    const why = oneLine(sent && sent.error, 160) || 'no answer';
    await mark(null, `The portal mailbox did not send it (${why}).`);
    return json(502, { error: `The portal mailbox (${PORTAL_INVITE_SENDER}) did not send it. The invite was not emailed.`, to }, H);
  }
  await mark(`auth-invite:${sent.id}`, null);
  const pending = kind === 'agent' ? unnotifiedTasks(info).length : 0;
  const taskNotice = pending ? { sent: false, count: pending, error: 'The task email is not sent with portal-mailbox invites yet.' } : { sent: false, count: 0 };
  const subject = kind === 'hr' ? AUTH_INVITE_SUBJECT : inviteSubjectFor(info);
  return json(200, { ok: true, sent: true, via: 'auth', to, from: PORTAL_INVITE_SENDER, subject, authUserId: sent.id, taskNotice }, H);
}

/* ---------------- gmail-sync (cron every 3 minutes, or "Check for replies") ---------------- */
export async function syncAccount(deps, acct, { maxMessages = 50 } = {}) {
  const out = { mailbox: acct.email, stored: 0, skipped: 0, error: null };
  const tok = rowOf(await deps.svc('gmail_svc_token', { p_profile: acct.profile_id }));
  if (!tok || tok.status !== 'connected' || !tok.refresh_token) { out.error = 'not connected'; return out; }
  let access;
  try { access = await accessTokenFor(deps, tok.refresh_token); }
  catch (e) { if (e instanceof ReconnectError) await deps.svc('gmail_svc_update_account', { p_profile: acct.profile_id, p_status: 'needs_reconnect', p_error: e.message, p_history: null, p_synced: false }); out.error = e.message; return out; }
  const threads = new Map((await deps.svc('gmail_svc_linked_threads', { p_email: tok.email }) || []).map((t) => [t.gmail_thread_id, t]));
  const latest = async () => { const p = await gmail(deps, access, '/profile'); return p.ok && p.body ? String(p.body.historyId || '') : ''; };
  if (!tok.history_id || !threads.size) { await deps.svc('gmail_svc_update_account', { p_profile: acct.profile_id, p_status: null, p_error: null, p_history: await latest(), p_synced: true }); return out; }
  let ids = []; let newest = ''; let page = ''; let fallback = false;
  for (let i = 0; i < 5; i++) {
    const r = await gmail(deps, access, `/history?startHistoryId=${encodeURIComponent(tok.history_id)}&historyTypes=messageAdded&maxResults=500${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`);
    if (r.status === 404) { fallback = true; break; }
    if (!r.ok || !r.body) { out.error = `history HTTP ${r.status}`; return out; }
    for (const h of r.body.history || []) for (const ma of h.messagesAdded || []) { const m = ma.message || {}; if (threads.has(m.threadId) && !(m.labelIds || []).includes('DRAFT')) ids.push(m.id); }
    newest = String(r.body.historyId || newest); page = r.body.nextPageToken || ''; if (!page) break;
  }
  if (fallback) {   // cursor too old: re-read only the linked threads from the last 30 days
    const since = deps.now() - 30 * 86400000;
    for (const t of [...threads.values()].filter((x) => new Date(x.linked_at).getTime() >= since).slice(0, 20)) {
      const r = await gmail(deps, access, `/threads/${encodeURIComponent(t.gmail_thread_id)}?format=minimal`);
      if (r.ok && r.body) (r.body.messages || []).forEach((m) => { if (!(m.labelIds || []).includes('DRAFT')) ids.push(m.id); });
    }
    newest = await latest();
  }
  ids = [...new Set(ids)];
  const known = new Set(ids.length ? (await deps.svc('gmail_svc_known_messages', { p_email: tok.email, p_ids: ids }) || []).map((x) => (typeof x === 'string' ? x : x.gmail_svc_known_messages)) : []);
  const todo = ids.filter((x) => !known.has(x)); out.skipped = ids.length - todo.length;
  let failed = false;
  for (const mid of todo.slice(0, maxMessages)) {
    try {
      const r = await gmail(deps, access, `/messages/${encodeURIComponent(mid)}?format=full`);
      if (!r.ok || !r.body) { failed = true; continue; }
      const m = parseGmailMessage(r.body); const link = threads.get(m.threadId); if (!link || m.labelIds.includes('DRAFT')) continue;
      const docs = []; const names = [];
      for (const a of m.attachments) {
        const name = safeName(a.filename);
        // Stable across a re-run. A new document id is only the storage name; the database keeps one row per key.
        const key = `${m.id}:${a.attachmentId || name}`;
        if (!extOk(a.filename) || Number(a.size || 0) > MAX_SAVE_BYTES) { names.push(`${a.filename} (not saved: file type or size not allowed)`); continue; }
        let data = a.data;
        if (!data && a.attachmentId) { const ar = await gmail(deps, access, `/messages/${encodeURIComponent(mid)}/attachments/${encodeURIComponent(a.attachmentId)}`); if (ar.ok && ar.body) data = ar.body.data; }
        if (!data) { names.push(`${a.filename} (not saved: could not download)`); continue; }
        const bytes = b64urlToBytes(data); const id = deps.newId(); const path = `${link.deal_id}/${id}/${name}`;
        await deps.storeAttachment(path, bytes, a.mimeType);
        docs.push({ id, name, mime: a.mimeType, size: bytes.length, path, key }); names.push(name);
      }
      const dir = m.labelIds.includes('SENT') ? 'out' : 'in';
      await deps.svc('gmail_svc_record', { p: { deal_id: link.deal_id, mailbox_profile_id: acct.profile_id, mailbox_email: tok.email, direction: dir, source: 'gmail',
        gmail_message_id: m.id, gmail_thread_id: m.threadId, rfc_message_id: m.rfcMessageId, from_email: m.from, from_name: m.fromName, to_emails: m.to, cc_emails: m.cc,
        subject: m.subject, body_html: m.html, snippet: m.snippet, sent_at: m.internalDate, documents: docs, attachment_names: names } });
      out.stored++;
    } catch (e) { failed = true; }
  }
  // the cursor moves only when every linked message was handled (a retry is safe: stored ids are skipped)
  const done = !failed && todo.length <= maxMessages;
  await deps.svc('gmail_svc_update_account', { p_profile: acct.profile_id, p_status: null, p_error: failed ? 'Some messages could not be read; retrying.' : null, p_history: done ? newest : null, p_synced: done });
  return out;
}

export async function handleSync(req, deps) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: deps.headers });
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' }, deps.headers);
  if (wrongProject(deps)) return json(503, { error: 'Gmail phase 1 runs on CLA Portal Live Test only.' }, deps.headers);
  const syncToken = req.headers.get('x-gmail-sync-token') || '';
  let accounts = [];
  if (syncToken) {
    if (!(await deps.svc('gmail_svc_check_sync_token', { p_token: syncToken }))) return json(401, { error: 'Not allowed.' }, deps.headers);
    accounts = await deps.svc('gmail_svc_connected_accounts', {}) || [];
  } else {
    const g = await staffGate(deps); if (g.res) return g.res;
    if (!g.ctx.mailbox) return json(409, { error: 'Connect Gmail first (Profile Setting > Gmail).' }, deps.headers);
    accounts = [{ profile_id: g.user.id, email: g.ctx.mailbox }];
  }
  const started = deps.now(); const results = [];
  for (const a of accounts) { if (deps.now() - started > 40000) break; try { results.push(await syncAccount(deps, a)); } catch (e) { results.push({ mailbox: a.email, stored: 0, error: 'sync failed' }); } }
  return json(200, { ok: true, accounts: results.length, stored: results.reduce((s, r) => s + (r.stored || 0), 0), errors: results.filter((r) => r.error).length }, deps.headers);
}
