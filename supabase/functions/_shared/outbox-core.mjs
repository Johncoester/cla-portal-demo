/* OUTBOX-SEND-1 (John, Nov 24 2026): the outbox-send edge function's logic. Tested in test/test-outbox-sender.js.
 * The database decides what may be sent (public.outbox_claim_batch: send_blocked, the TC-only rule, Test mode, the backlog cut-off).
 * This file checks Test mode again before every send, so a wrong row can not go out even if the database check were changed. */
import { json, isWireName, MAX_ATTACH_BYTES, isEmail } from './gmail-core.mjs';
import { pickProvider, messageHtml } from './outbox-providers.mjs';

export const TEST_ADDRESS_RE = /^clatestportal\+[a-z0-9._-]+@gmail\.com$/;
export const TIME_BUDGET_MS = 45000;

// every address of one claimed row passes Test mode (to, cc and bcc)
export function testModeProblem(row, regexSource) {
  let re = TEST_ADDRESS_RE;
  try { if (regexSource) re = new RegExp(regexSource); } catch (e) { re = TEST_ADDRESS_RE; }
  const all = [row.to, ...(row.cc || []), ...(row.bcc || [])].map((a) => String(a || '').trim().toLowerCase());
  const bad = all.filter((a) => !re.test(a) || !TEST_ADDRESS_RE.test(a));   // both the stored pattern and the built-in one
  return bad.length ? `Test mode: ${bad.join(', ')} is not a clatestportal+ test address, so nothing was sent.` : null;
}

export function buildMessage(row, attachments = []) {
  const text = String(row.body || '');
  return { id: row.id, from: row.from, fromName: row.fromName || '', to: String(row.to).trim(), cc: (row.cc || []).map((a) => String(a).trim()),
    bcc: (row.bcc || []).map((a) => String(a).trim()), subject: String(row.subject || ''), text, html: messageHtml(text), attachments };
}

/* deps: { checkToken(t), env, fetch, rpc(fn, args), loadDocs(ids) -> [{ name, mime, size, wire, bytes() }], now() } */
export async function handleOutboxSend(req, deps) {
  if (req.method !== 'POST') return json(405, { error: 'POST only.' });
  const token = req.headers.get('x-outbox-send-token') || '';
  if (token.length < 32 || !(await deps.checkToken(token))) return json(401, { error: 'Not allowed.' });
  // no email service connected: do nothing at all (no row is claimed, skipped or failed)
  const picked = pickProvider(deps.env, deps.fetch);
  if (!picked.provider) return json(200, { status: 'idle', reason: `No email service is connected yet (not set: ${picked.missing}). Nothing was sent and no email was changed.` });
  const started = deps.now();
  const claim = await deps.rpc('outbox_claim_batch', { p_limit: null });
  const rows = (claim && Array.isArray(claim.rows)) ? claim.rows : [];
  const out = { status: 'ok', mode: claim && claim.mode, provider: picked.provider.name, sent: 0, failed: 0, retry: 0, guarded: 0 };
  for (const row of rows) {
    const mark = (ok, id, error, retry) => deps.rpc('outbox_mark_result', { p_id: row.id, p_ok: ok, p_provider_id: id || null, p_error: error || null, p_retry: !!retry });
    if (deps.now() - started > TIME_BUDGET_MS) { await mark(false, null, 'The send run ran out of time before this email.', true); out.retry++; continue; }
    if (!claim || (claim.mode !== 'test' && claim.mode !== 'live')) { await mark(false, null, 'The send mode is off.', false); out.failed++; continue; }
    const guard = claim.mode === 'test' ? testModeProblem(row, claim.testAddressRegex) : null;
    const badAddr = [row.to, ...(row.cc || []), ...(row.bcc || [])].find((a) => !isEmail(String(a || '').trim().toLowerCase()));
    if (guard || badAddr !== undefined || !isEmail(String(row.from || '').toLowerCase())) {
      await mark(false, null, guard || 'An email address on this message is not valid.', false); out.guarded++; continue;
    }
    let attachments = [];
    if ((row.attachmentIds || []).length) {
      try {
        const docs = await deps.loadDocs(row.attachmentIds);
        if (docs.length !== row.attachmentIds.length) throw new Error('An attached document could not be found.');
        if (docs.some((d) => d.wire || isWireName(d.name))) throw new Error('Wire instructions are never emailed from the portal.');
        if (docs.reduce((n, d) => n + (Number(d.size) || 0), 0) > MAX_ATTACH_BYTES) throw new Error('The attachments are larger than 18 MB.');
        for (const d of docs) attachments.push({ name: d.name, mime: d.mime, bytes: await d.bytes() });
      } catch (e) { await mark(false, null, String(e && e.message || 'Could not read an attachment.').slice(0, 200), false); out.failed++; continue; }
    }
    let r;
    try { r = await picked.provider.send(buildMessage(row, attachments)); }
    catch (e) { r = { ok: false, error: 'The email service could not be reached.', retry: true }; }
    await mark(!!r.ok, r.id, r.error, r.retry);
    if (r.ok) out.sent++; else if (r.retry) out.retry++; else out.failed++;
  }
  return json(200, out);
}
