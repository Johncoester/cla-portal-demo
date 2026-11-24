/* OUTBOX-SEND-2 (John, Nov 24 2026, 12:24 PM ET): the outbox-send edge function's logic. Tested in test/test-outbox-sender.js.
 * Every automatic portal email is sent from the file's processor's own Gmail, through the same per-staff Gmail connection
 * gmail-send uses (Profile Setting > Gmail; refresh token in Vault, read with gmail_svc_token). Google code is shared with
 * gmail-send (gmail-handlers.mjs), not copied.
 * The database decides what may be sent (public.outbox_claim_batch: send_blocked, the TC-only rule, Test mode, the backlog cut-off).
 * This file checks Test mode again before every send, so a wrong row can not go out even if the database check were changed.
 * An email the processor can not send (no file, no processor, Gmail not connected or revoked) is marked failed with the reason,
 * one row at a time and never retried. Only a temporary Google problem (429, 5xx, network) is retried. */
import { json, isWireName, MAX_ATTACH_BYTES, isEmail, buildMime, b64url, utf8, textToHtml, htmlToText } from './gmail-core.mjs';
import { accessTokenFor, ReconnectError, gmail, sendRfc822 } from './gmail-handlers.mjs';

export const TEST_ADDRESS_RE = /^clatestportal\+[a-z0-9._-]+@gmail\.com$/;
export const TIME_BUDGET_MS = 45000;
export const REASONS = {
  noFile: 'Not sent: this email is not on a file, so there is no processor to send it from.',
  noProcessor: (file) => `Not sent: no processor is assigned to ${file || 'this file'}. Assign a processor; new emails on the file will then go out from their Gmail.`,
  inactive: (name) => `Not sent: the file's processor (${name}) is not an active portal user.`,
  notConnected: (name) => `Not sent: ${name}'s Gmail is not connected to the portal (Profile Setting > Gmail > Connect).`,
  reconnect: (name) => `Not sent: ${name}'s Gmail needs to be connected again (Profile Setting > Gmail). Google access was revoked or expired.`,
};

// every address of one claimed row passes Test mode (to, cc and bcc): the stored pattern AND the built-in one
export function testModeProblem(row, regexSource) {
  let re = TEST_ADDRESS_RE;
  try { if (regexSource) re = new RegExp(regexSource); } catch (e) { re = TEST_ADDRESS_RE; }
  const all = [row.to, ...(row.cc || []), ...(row.bcc || [])].map((a) => String(a || '').trim().toLowerCase());
  const bad = all.filter((a) => !re.test(a) || !TEST_ADDRESS_RE.test(a));
  return bad.length ? `Test mode: ${bad.join(', ')} is not a clatestportal+ test address, so nothing was sent.` : null;
}

/* who sends it: the processor on the row's file. { ok: true, processor } or { ok: false, reason } (never retried) */
export function pickSender(file) {
  if (!file || !file.dealId) return { ok: false, reason: REASONS.noFile };
  if (!file.processorId) return { ok: false, reason: REASONS.noProcessor(file.fileNumber) };
  const name = String(file.processorName || '').trim() || 'The processor';
  if (file.processorStatus && file.processorStatus !== 'active') return { ok: false, reason: REASONS.inactive(name) };
  return { ok: true, processor: { id: file.processorId, name } };
}

const retryableHttp = (s) => s === 0 || s === 401 || s === 429 || s >= 500;

/* deps: { checkToken(t), clientId, clientSecret, fetch, now(),
 *         rpc(fn, args)             service-role RPC (outbox_claim_batch, outbox_mark_result, gmail_svc_token, gmail_svc_update_account, gmail_svc_record)
 *         fileFor(outboxId) -> { dealId, fileNumber, processorId, processorName, processorStatus } | null
 *         loadDocs(ids) -> [{ name, mime, size, wire, bytes() }] } */
export async function handleOutboxSend(req, deps) {
  if (req.method !== 'POST') return json(405, { error: 'POST only.' });
  const token = req.headers.get('x-outbox-send-token') || '';
  if (token.length < 32 || !(await deps.checkToken(token))) return json(401, { error: 'Not allowed.' });
  // the Google app that staff Gmail connections use (the same function secrets gmail-send uses). Missing: do nothing at all.
  if (!String(deps.clientId || '').trim() || !String(deps.clientSecret || '').trim()) {
    return json(200, { status: 'idle', reason: 'The Google sign-in app (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) is not set for this function. Nothing was sent and no email was changed.' });
  }
  const started = deps.now();
  const claim = await deps.rpc('outbox_claim_batch', { p_limit: null });
  const rows = (claim && Array.isArray(claim.rows)) ? claim.rows : [];
  const out = { status: 'ok', mode: claim && claim.mode, sent: 0, failed: 0, retry: 0, guarded: 0 };
  const access = new Map();   // processor id -> { token } | { error, retry } for this run
  const g = { clientId: deps.clientId, clientSecret: deps.clientSecret, fetch: deps.fetch };
  for (const row of rows) {
    const mark = (ok, id, error, retry) => deps.rpc('outbox_mark_result', { p_id: row.id, p_ok: ok, p_provider_id: id || null, p_error: error || null, p_retry: !!retry });
    const fail = async (reason, retry = false) => { await mark(false, null, reason, retry); if (retry) out.retry++; else out.failed++; };
    if (deps.now() - started > TIME_BUDGET_MS) { await fail('The send run ran out of time before this email.', true); continue; }
    if (!claim || (claim.mode !== 'test' && claim.mode !== 'live')) { await fail('The send mode is off.'); continue; }
    const guard = claim.mode === 'test' ? testModeProblem(row, claim.testAddressRegex) : null;
    const badAddr = [row.to, ...(row.cc || []), ...(row.bcc || [])].find((a) => !isEmail(String(a || '').trim().toLowerCase()));
    if (guard || badAddr !== undefined) { await mark(false, null, guard || 'Not sent: an email address on this message is not valid.', false); out.guarded++; continue; }

    let file = null;
    try { file = await deps.fileFor(row.id); } catch (e) { await fail('Could not read the file for this email. Trying again later.', true); continue; }
    const who = pickSender(file);
    if (!who.ok) { await fail(who.reason); continue; }
    const p = who.processor;

    let tok = null;
    try { const t = await deps.rpc('gmail_svc_token', { p_profile: p.id }); tok = (Array.isArray(t) ? t[0] : t) || null; }
    catch (e) { await fail('Could not read the processor\'s Gmail connection. Trying again later.', true); continue; }
    if (!tok || !tok.refresh_token || !isEmail(String(tok.email || '').toLowerCase())) { await fail(REASONS.notConnected(p.name)); continue; }
    if (tok.status !== 'connected') { await fail(REASONS.reconnect(p.name)); continue; }

    if (!access.has(p.id)) {
      try { access.set(p.id, { token: await accessTokenFor(g, tok.refresh_token) }); }
      catch (e) {
        if (e instanceof ReconnectError) {
          access.set(p.id, { error: REASONS.reconnect(p.name), retry: false });
          try { await deps.rpc('gmail_svc_update_account', { p_profile: p.id, p_status: 'needs_reconnect', p_error: e.message, p_history: null, p_synced: false }); } catch (x) { /* the row still records why */ }
        } else access.set(p.id, { error: `Google did not answer when refreshing ${p.name}'s Gmail access. Trying again later.`, retry: true });
      }
    }
    const acc = access.get(p.id);
    if (!acc.token) { await fail(acc.error, acc.retry); continue; }

    let attachments = [];
    if ((row.attachmentIds || []).length) {
      try {
        const docs = await deps.loadDocs(row.attachmentIds);
        if (docs.length !== row.attachmentIds.length) throw new Error('Not sent: an attached document could not be found.');
        if (docs.some((d) => d.wire || isWireName(d.name))) throw new Error('Not sent: wire instructions are never emailed from the portal.');
        if (docs.reduce((n, d) => n + (Number(d.size) || 0), 0) > MAX_ATTACH_BYTES) throw new Error('Not sent: the attachments are larger than 18 MB.');
        for (const d of docs) attachments.push({ name: d.name, mime: d.mime, bytes: await d.bytes() });
      } catch (e) { await fail(String(e && e.message || 'Not sent: could not read an attachment.').slice(0, 200)); continue; }
    }

    const text = String(row.body || '');
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${textToHtml(text)}</div>`;
    const from = String(tok.email).toLowerCase();
    const raw = buildMime({ from, fromName: p.name, to: [String(row.to).trim()], cc: (row.cc || []).map((a) => String(a).trim()), bcc: (row.bcc || []).map((a) => String(a).trim()),
      subject: String(row.subject || ''), text, html, attachments, seed: row.id });
    let sent;
    try {
      sent = attachments.length ? await sendRfc822(g, acc.token, utf8(raw)) : await gmail(g, acc.token, '/messages/send', { method: 'POST', body: JSON.stringify({ raw: b64url(raw) }) });
    } catch (e) { sent = { ok: false, status: 0 }; }
    if (!sent.ok || !sent.body || !sent.body.id) {
      const reason = sent.status ? `Gmail (${from}) did not send it (HTTP ${sent.status}).` : 'Could not reach Gmail.';
      await fail(retryableHttp(sent.status) ? `${reason} Trying again later.` : `Not sent: ${reason}`, retryableHttp(sent.status));
      continue;
    }
    await mark(true, sent.body.id, null, false); out.sent++;
    // also on the file's Email tab, like a send from the portal (best effort: the email already went out)
    try {
      await deps.rpc('gmail_svc_record', { p: { deal_id: file.dealId, mailbox_profile_id: p.id, mailbox_email: from, direction: 'out', source: 'portal',
        gmail_message_id: sent.body.id, gmail_thread_id: sent.body.threadId || null, rfc_message_id: '', from_email: from, from_name: p.name, to_emails: [String(row.to).trim()],
        cc_emails: row.cc || [], bcc_emails: row.bcc || [], subject: String(row.subject || ''), body_html: html, snippet: htmlToText(html).slice(0, 200),
        sent_at: new Date(deps.now()).toISOString(), attachment_document_ids: row.attachmentIds || [], attachment_names: attachments.map((a) => a.name), keyed_documents: [],
        template_key: null, sent_by: p.id } });
    } catch (e) { /* not recorded on the Email tab; the outbox row says sent */ }
  }
  return json(200, out);
}
