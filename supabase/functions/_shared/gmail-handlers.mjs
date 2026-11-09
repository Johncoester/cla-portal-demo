/* Gmail phase 1 request handlers (TEST only). Everything outside comes in through `deps`, so the Node tests run these with fakes:
 *   deps.projectRef, deps.clientId, deps.clientSecret (never logged or returned), deps.fetch (Google only), deps.headers (CORS)
 *   deps.getUser() -> { id } | null                 verified Supabase session (the user's JWT)
 *   deps.myContext() -> gmail_my_context() as the user
 *   deps.svc(fn, args) -> data                      service-role RPC (gmail_svc_*), throws on error
 *   deps.userDeal(id), deps.userDocs(dealId, ids), deps.userDocBytes(path), deps.userEmail(id)   reads AS THE USER (RLS decides)
 *   deps.storeAttachment(path, bytes, mime)         service-role upload to deal-documents
 *   deps.newId() -> uuid, deps.now() -> ms */
import { TEST_PROJECT_REF, PORTAL_ORIGIN, REDIRECT_URI, GMAIL_ROLES, MAX_RECIPIENTS, MAX_DOCS, MAX_ATTACH_BYTES, MAX_SAVE_BYTES, MAX_BODY_CHARS, TEST_ALLOWLIST_NOTE,
  isAllowedTestRecipient, parseAddressList, subjectWithTag, sanitizeHtml, htmlToText, hasWireDetails, isWireName, extOk, safeName, buildMime, b64url, b64urlToBytes,
  parseGmailMessage, randomToken, sha256Hex, pkceChallenge, authUrl, decodeJwtPayload, missingScopes, oneLine, json } from './gmail-core.mjs';

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
async function revoke(deps, token) {
  if (!token) return false;
  try { const r = await deps.fetch(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString() }); return r.ok; } catch (e) { return false; }
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
export async function handleOauthCallback(req, deps) {
  if (wrongProject(deps)) return back('failed');
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const u = new URL(req.url); const state = u.searchParams.get('state') || ''; const code = u.searchParams.get('code') || ''; const err = u.searchParams.get('error') || '';
  if (!state || state.length > 200) return back('failed');
  const taken = rowOf(await deps.svc('gmail_svc_take_oauth', { p_state_hash: await sha256Hex(state) }));
  if (!taken) return back('expired');
  if (err) return back('denied');
  if (!code || !deps.clientId || !deps.clientSecret) return back('failed');
  const t = await googleForm(deps, TOKEN_URL, { code, client_id: deps.clientId, client_secret: deps.clientSecret, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code', code_verifier: taken.code_verifier });
  if (!t.ok || !t.body.access_token) return back('failed');
  const tok = t.body; const kill = async () => { await revoke(deps, tok.refresh_token || tok.access_token); };
  if (missingScopes(tok.scope).length) { await kill(); return back('missing_scope'); }
  const idp = decodeJwtPayload(tok.id_token) || {}; const email = String(idp.email || '').toLowerCase();
  if (!idp.email_verified || idp.hd !== 'clatitle.com' || !/^[^@\s]+@clatitle\.com$/.test(email)) { await kill(); return back('wrong_domain'); }
  const prof = await gmail(deps, tok.access_token, '/profile');
  if (!prof.ok || String(prof.body && prof.body.emailAddress || '').toLowerCase() !== email) { await kill(); return back('failed'); }
  if (!tok.refresh_token) { await kill(); return back('failed'); }
  try { await deps.svc('gmail_svc_connect', { p_profile: taken.profile_id, p_email: email, p_refresh: tok.refresh_token, p_scopes: String(tok.scope || ''), p_history: String(prof.body.historyId || '') }); }
  catch (e) { await kill(); return back(/another portal login/i.test(String(e && e.message)) ? 'in_use' : 'failed'); }
  return back('connected');
}

/* ---------------- gmail-send ---------------- */
export async function handleSend(req, deps) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: deps.headers });
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' }, deps.headers);
  const g = await staffGate(deps); if (g.res) return g.res;
  const { user, ctx } = g; const H = deps.headers;
  let b = {}; try { b = await req.json(); } catch (e) { return json(400, { error: 'Send a JSON body.' }, H); }
  const dryRun = b.dryRun === true;
  const deal = b.dealId ? await deps.userDeal(String(b.dealId)) : null;
  if (!deal) return json(404, { error: 'You cannot open that file.' }, H);
  const to = parseAddressList(b.to); const cc = parseAddressList(b.cc); const bcc = parseAddressList(b.bcc);
  const bad = [...to.bad, ...cc.bad, ...bcc.bad];
  if (bad.length) return json(400, { error: `Not an email address: ${bad.join(', ')}` }, H);
  const all = [...new Set([...to.ok, ...cc.ok, ...bcc.ok])];
  if (!to.ok.length) return json(400, { error: 'Add at least one To address.' }, H);
  if (all.length > MAX_RECIPIENTS) return json(400, { error: `At most ${MAX_RECIPIENTS} recipients per email.` }, H);
  const refused = all.filter((a) => !isAllowedTestRecipient(a));
  if (refused.length) {
    if (!dryRun) await deps.svc('gmail_svc_audit', { p_profile: user.id, p_deal: deal.id, p_action: 'mail.refused', p_detail: `Refused on Live Test (not a test address): ${refused.join(', ')}` });
    return json(403, { error: `Not sent. ${TEST_ALLOWLIST_NOTE}`, refused, dryRun }, H);
  }
  const subjectIn = oneLine(b.subject, 250);
  if (!subjectIn) return json(400, { error: 'Add a subject.' }, H);
  const subject = subjectWithTag(subjectIn, deal.file_number || '');
  const bodyHtml = sanitizeHtml(b.html || '');
  if (!htmlToText(bodyHtml)) return json(400, { error: 'Write a message first.' }, H);
  if (bodyHtml.length > MAX_BODY_CHARS) return json(400, { error: 'The message is too long.' }, H);
  if (hasWireDetails(htmlToText(bodyHtml)) || hasWireDetails(subject)) return json(400, { error: 'Wire / bank account details cannot be emailed from the portal. Remove them and call the buyer instead.' }, H);
  const ids = [...new Set((Array.isArray(b.documentIds) ? b.documentIds : []).map(String))];
  if (ids.length > MAX_DOCS) return json(400, { error: `At most ${MAX_DOCS} attachments.` }, H);
  const docs = ids.length ? await deps.userDocs(deal.id, ids) : [];
  if (docs.length !== ids.length || docs.some((d) => d.deal_id !== deal.id)) return json(400, { error: 'An attachment is not a document on this file that you can open.' }, H);
  if (docs.some((d) => d.wire_instructions || isWireName(d.name))) return json(400, { error: 'Wire instructions cannot be attached to an email from the portal.' }, H);
  const total = docs.reduce((s, d) => s + Number(d.size_bytes || 0), 0);
  if (total > MAX_ATTACH_BYTES) return json(400, { error: 'Attachments are over 18 MB. Send fewer files.' }, H);
  let reply = null;
  if (b.replyToEmailId) { reply = await deps.userEmail(String(b.replyToEmailId)); if (!reply || reply.deal_id !== deal.id) return json(400, { error: 'That email is not on this file.' }, H); }
  const sig = sanitizeHtml(ctx.signatureHtml || '');
  const html = sig && htmlToText(sig) ? `${bodyHtml}<br><div class="gmail_signature">${sig}</div>` : bodyHtml;
  const fromName = `${ctx.firstName || ''} ${ctx.lastName || ''}`.trim();
  const preview = { from: ctx.mailbox || null, fromName, to: to.ok, cc: cc.ok, bcc: bcc.ok, subject, signatureAdded: html !== bodyHtml, attachments: docs.map((d) => ({ id: d.id, name: d.name, size: Number(d.size_bytes || 0) })), threaded: !!(reply && reply.mailbox_email === ctx.mailbox) };
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
  for (const d of docs) attachments.push({ name: d.name, mime: d.mime_type, bytes: await deps.userDocBytes(d.storage_path) });
  const raw = buildMime({ from: tok.email, fromName, to: to.ok, cc: cc.ok, bcc: bcc.ok, subject, html, text: htmlToText(html), attachments,
    inReplyTo: reply && reply.rfc_message_id || '', references: reply && reply.rfc_message_id || '', seed: deps.newId() });
  const sendBody = { raw: b64url(raw) }; if (preview.threaded) sendBody.threadId = reply.gmail_thread_id;
  const sent = await gmail(deps, access, '/messages/send', { method: 'POST', body: JSON.stringify(sendBody) });
  if (!sent.ok || !sent.body || !sent.body.id) {
    await deps.svc('gmail_svc_audit', { p_profile: user.id, p_deal: deal.id, p_action: 'mail.failed', p_detail: `Gmail refused the send (HTTP ${sent.status}). Subject: ${subject}` });
    return json(502, { error: `Gmail did not send it (HTTP ${sent.status}). Nothing was sent.` }, H);
  }
  let rfc = '';
  const meta = await gmail(deps, access, `/messages/${encodeURIComponent(sent.body.id)}?format=metadata&metadataHeaders=Message-ID`);
  if (meta.ok && meta.body && meta.body.payload) rfc = ((meta.body.payload.headers || []).find((h) => /^message-id$/i.test(h.name)) || {}).value || '';
  const id = await deps.svc('gmail_svc_record', { p: { deal_id: deal.id, mailbox_profile_id: user.id, mailbox_email: tok.email, direction: 'out', source: 'portal',
    gmail_message_id: sent.body.id, gmail_thread_id: sent.body.threadId, rfc_message_id: rfc, from_email: tok.email, from_name: fromName, to_emails: to.ok, cc_emails: cc.ok, bcc_emails: bcc.ok,
    subject, body_html: html, snippet: htmlToText(bodyHtml).slice(0, 200), sent_at: new Date(deps.now()).toISOString(), attachment_document_ids: docs.map((d) => d.id),
    attachment_names: docs.map((d) => d.name), template_key: oneLine(b.templateKey, 60) || null, sent_by: user.id } });
  return json(200, { ok: true, id, gmailMessageId: sent.body.id, threadId: sent.body.threadId, ...preview, from: tok.email }, H);
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
        if (!extOk(a.filename) || Number(a.size || 0) > MAX_SAVE_BYTES) { names.push(`${a.filename} (not saved: file type or size not allowed)`); continue; }
        let data = a.data;
        if (!data && a.attachmentId) { const ar = await gmail(deps, access, `/messages/${encodeURIComponent(mid)}/attachments/${encodeURIComponent(a.attachmentId)}`); if (ar.ok && ar.body) data = ar.body.data; }
        if (!data) { names.push(`${a.filename} (not saved: could not download)`); continue; }
        const bytes = b64urlToBytes(data); const id = deps.newId(); const name = safeName(a.filename); const path = `${link.deal_id}/${id}/${name}`;
        await deps.storeAttachment(path, bytes, a.mimeType);
        docs.push({ id, name, mime: a.mimeType, size: bytes.length, path }); names.push(name);
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
