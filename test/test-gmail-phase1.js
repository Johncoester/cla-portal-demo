/* Gmail phase 1 (John, Nov 9): the gmail-* edge function logic with fake Google + fake database. No network, no secrets. */
import { readFileSync } from 'node:fs';
import { parseAddressList, subjectWithTag, formatPropertyAddress, fileTag, sanitizeHtml, buildMime, b64url, b64urlToText, bytesToB64, estimateMimeBytes, MAX_MESSAGE_BYTES, hasWireDetails, parseGmailMessage, authUrl, SCOPES, REDIRECT_URI, extOk, SETTINGS_SCOPE, pickSendAsSignature, withSignature, hasSettingsScope, matchUploadKeys } from '../supabase/functions/_shared/gmail-core.mjs';
import { handleOauthStart, handleOauthCallback, handleSend, handleSync } from '../supabase/functions/_shared/gmail-handlers.mjs';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const JOHN = '149e612a-6e14-4ee1-9890-0f29d6f89156'; const DEAL = 'f2c086d7-8043-46c4-99b1-03ee5b061897';
const SECRET = 'client-secret-do-not-leak'; const REFRESH = 'refresh-token-do-not-leak';

// ---- addresses (Nov 13, John: no test-address list on TEST; any valid address may be emailed) ----
const pl = parseAddressList('Pat <PAT@clatitle.com>, pat@clatitle.com; not an address');
ok(pl.ok.length === 1 && pl.ok[0] === 'pat@clatitle.com' && pl.bad.length === 1, 'address list: names stripped, duplicates merged, junk reported');
ok(formatPropertyAddress({ street: '123 Main St', city: 'Rockville', state: 'MD', zip: '20850' }) === '123 Main St, Rockville MD 20850', 'address format: street, city state zip');
ok(formatPropertyAddress({ street: '3650 Southwest 13th Street', city: 'Miami', state: 'FL', zip: '33145' }) === '3650 Southwest 13th Street, Miami FL 33145', 'address format with longer street');
ok(formatPropertyAddress({}) === '' && formatPropertyAddress({ city: 'Rockville' }) === 'Rockville', 'missing address parts omitted gracefully');
ok(fileTag('MD-26-97218') === '[CLA #MD-26-97218]', 'tag without address stays file-number only');
ok(fileTag('MD-26-97218', { street: '123 Main St', city: 'Rockville', state: 'MD', zip: '20850' }) === '[CLA #MD-26-97218 - 123 Main St, Rockville MD 20850]', 'tag with address');
ok(subjectWithTag('Introduction', 'MD-26-97207') === 'Introduction [CLA #MD-26-97207]', 'subject gets the [CLA #order] tag');
ok(subjectWithTag('Testing', 'MD-26-97218', { street: '123 Main St', city: 'Rockville', state: 'MD', zip: '20850' }) === 'Testing [CLA #MD-26-97218 - 123 Main St, Rockville MD 20850]', 'subject gets file + address tag');
ok(subjectWithTag('Re: Introduction [CLA #MD-26-97207]', 'MD-26-97207', { street: '1 Main' }) === 'Re: Introduction [CLA #MD-26-97207]', 'old subject without address is not re-tagged');
ok(subjectWithTag('Re: Testing [CLA #MD-26-97218 - 123 Main St, Rockville MD 20850]', 'MD-26-97218', { street: 'Other' }) === 'Re: Testing [CLA #MD-26-97218 - 123 Main St, Rockville MD 20850]', 'address tag is not doubled on reply');
ok(!/[\r\n]/.test(subjectWithTag('Hi\r\nBcc: evil@x.com', '1')), 'no line breaks survive in a subject (header injection)');
const clean = sanitizeHtml('<p onclick="x()">Hi</p><script>alert(1)</script><img src="javascript:alert(1)" onerror=alert(1)><a href="https://ok.test">ok</a><iframe src="https://x"></iframe>');
ok(!/script|onclick|onerror|javascript:|iframe/i.test(clean) && clean.includes('https://ok.test'), 'sanitize removes scripts, handlers, javascript: links and iframes');
ok(hasWireDetails('Routing number 021000021, account number 12345678') && !hasWireDetails('Never wire money without calling our office first.'), 'wire check: bank numbers refused, a wire-fraud warning is fine');
ok(extOk('a.pdf') && !extOk('a.exe') && !extOk('.pdf'), 'attachment types match the portal upload list');
const uploadKey = matchUploadKeys('gSentUp', ['Contract.pdf'], [{ id: 'up1', name: 'photo.png' }], [{ filename: 'Contract.pdf', attachmentId: 'oldAtt' }, { filename: 'photo.png', attachmentId: 'newAtt' }]);
ok(uploadKey.length === 1 && uploadKey[0].id === 'up1' && uploadKey[0].key === 'gSentUp:newAtt', 'a computer upload is keyed like the later Gmail sync of that sent message');
ok(matchUploadKeys('g1', ['Contract.pdf'], [{ id: 'up1', name: 'photo.png' }], []).length === 1 && matchUploadKeys('g1', ['Contract.pdf'], [{ id: 'up1', name: 'photo.png' }], [])[0].key === 'g1:photo.png', 'without a Gmail attachment id the key is the message and the file name');
const u = new URL(authUrl({ clientId: 'cid', state: 'st', challenge: 'ch', loginHint: 'me@clatitle.com' }));
ok(u.searchParams.get('scope') === SCOPES.join(' ') && !/gmail\.modify|mail\.google\.com/.test(u.searchParams.get('scope')), 'consent asks for gmail.send + gmail.readonly only');
ok(!SCOPES.includes(SETTINGS_SCOPE) && !SCOPES.some((x) => /settings|gmail\.compose|gmail\.modify/.test(x)), 'signature import needs no extra permission (gmail.readonly reads send-as signatures)');
ok(u.searchParams.get('code_challenge_method') === 'S256' && u.searchParams.get('redirect_uri') === REDIRECT_URI && u.searchParams.get('hd') === 'clatitle.com' && u.searchParams.get('access_type') === 'offline', 'PKCE S256, exact redirect, clatitle.com accounts, offline access');

// ---- MIME ----
const raw = buildMime({ from: 'me@clatitle.com', fromName: 'Me Person', to: ['clatestportal+b@gmail.com'], cc: [], bcc: ['x@clatitle.com'], subject: 'Héllo [CLA #1]', html: '<p>Hi</p>', text: 'Hi', attachments: [{ name: 'a.pdf', mime: 'application/pdf', bytes: new Uint8Array([37, 80, 68, 70]) }], inReplyTo: '<m1@mail>', seed: 's1' });
ok(/^From: "Me Person" <me@clatitle\.com>\r\n/.test(raw) && raw.includes('Bcc: x@clatitle.com') && raw.includes('Subject: =?UTF-8?B?') && raw.includes('In-Reply-To: <m1@mail>'), 'MIME headers: From, Bcc, encoded subject, reply headers');
ok(raw.includes('Content-Disposition: attachment; filename="a.pdf"') && raw.includes('name="a.pdf"') && raw.includes('JVBERg==') && raw.endsWith('\r\n'), 'MIME carries the attachment bytes and ends on a CRLF');
{ const big = new Uint8Array(9000); for (let i = 0; i < big.length; i++) big[i] = i % 256; const back = Buffer.from(bytesToB64(big), 'base64'); let bad = 0; for (let i = 0; i < big.length; i++) if (back[i] !== big[i]) bad++; ok(bad === 0 && back.length === big.length, 'base64 of a multi-chunk file (including bytes over 127) round-trips'); }
ok(estimateMimeBytes(17_900_000, 8000) > MAX_MESSAGE_BYTES && estimateMimeBytes(9_500_000, 8000) < MAX_MESSAGE_BYTES, 'two contracts fit under 25 MB; a single almost-18 MB file does not once base64-encoded');
ok(b64urlToText(b64url('ü?>>')) === 'ü?>>', 'base64url round trip');
const pm = parseGmailMessage({ id: 'g1', threadId: 't1', labelIds: ['INBOX'], payload: { headers: [{ name: 'From', value: '"Buyer, Pat" <clatestportal+b@gmail.com>' }, { name: 'To', value: 'me@clatitle.com' }, { name: 'Subject', value: 'Re: x' }],
  parts: [{ mimeType: 'text/html', body: { data: b64url('<p>Thanks</p><script>x</script>') } }, { filename: 'c.pdf', mimeType: 'application/pdf', body: { attachmentId: 'att1', size: 4 } }] } });
ok(pm.from === 'clatestportal+b@gmail.com' && pm.fromName === 'Buyer, Pat' && pm.html === '<p>Thanks</p>' && pm.attachments[0].attachmentId === 'att1', 'incoming message parsed (quoted name with comma, html sanitized, attachment found)');

// ---- fake deps ----
function fakeDeps(over = {}) {
  const calls = { svc: [], fetch: [], stored: [] };
  const db = { states: new Map(), account: null, threads: [{ gmail_thread_id: 'tLinked', deal_id: DEAL, linked_at: new Date().toISOString() }], known: [], syncToken: 'x'.repeat(64) };
  const ctx = { uid: JOHN, viewAs: false, allowed: true, role: 'Super admin', email: 'johncoester@gmail.com', firstName: 'John', lastName: 'Coester', mailbox: 'john@clatitle.com', mailboxStatus: 'connected', signatureHtml: '<p>John Coester<br>CLA Title</p>' };
  const google = over.google || ((url, init) => {
    if (url.includes('oauth2.googleapis.com/token')) return { status: 200, body: { access_token: 'ya29.access', refresh_token: REFRESH, scope: SCOPES.slice(2).join(' ') + ' openid https://www.googleapis.com/auth/userinfo.email', id_token: 'h.' + b64url(JSON.stringify({ email: 'john@clatitle.com', email_verified: true, hd: 'clatitle.com' })) + '.s' } };
    if (url.includes('/revoke')) return { status: 200, body: {} };
    if (url.endsWith('/settings/sendAs')) return over.sendAs || { status: 200, body: { sendAs: [{ sendAsEmail: 'alias@clatitle.com', isPrimary: false, signature: '<p>Alias</p>' }, { sendAsEmail: 'john@clatitle.com', isPrimary: true, isDefault: true, signature: '<div>John Coester | CLA Title<img src="https://x.test/l.png" onerror="alert(1)"></div><script>bad()</script>' }] } };
    if (url.endsWith('/profile')) return { status: 200, body: { emailAddress: 'john@clatitle.com', historyId: '900' } };
    if (url.includes('uploadType=resumable') && !url.includes('upload_id')) return { status: 200, body: {}, headers: { location: 'https://www.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=resumable&upload_id=up1' } };
    if (url.includes('upload_id=up1')) return { status: 200, body: { id: 'gSent1', threadId: 'tNew' } };
    if (url.includes('/messages/gSent1') && url.includes('format=full')) return { status: 200, body: { id: 'gSent1', threadId: 'tNew', payload: { headers: [{ name: 'Message-ID', value: '<sent1@mail.gmail.com>' }], parts: [{ mimeType: 'text/html', filename: '', body: { size: 20 } }, { filename: 'Contract.pdf', mimeType: 'application/pdf', body: { size: 4, attachmentId: 'a1' } }] } } };
    if (url.includes('/messages/send')) return { status: 200, body: { id: 'gSent1', threadId: 'tNew' } };
    if (url.includes('format=metadata')) return { status: 200, body: { payload: { headers: [{ name: 'Message-ID', value: '<sent1@mail.gmail.com>' }] } } };
    if (url.includes('/history?')) return { status: 200, body: { historyId: '950', history: [{ messagesAdded: [{ message: { id: 'mIn', threadId: 'tLinked', labelIds: ['INBOX'] } }, { message: { id: 'mOther', threadId: 'tUNLINKED', labelIds: ['INBOX'] } }, { message: { id: 'mKnown', threadId: 'tLinked', labelIds: ['SENT'] } }] }] } };
    if (url.includes('/messages/mIn/attachments/att1')) return { status: 200, body: { data: b64url('%PDF') } };
    if (url.includes('/messages/mIn?format=full')) return { status: 200, body: { id: 'mIn', threadId: 'tLinked', labelIds: ['INBOX'], internalDate: '1794000000000', snippet: 'Thanks', payload: { headers: [{ name: 'From', value: 'clatestportal+b@gmail.com' }, { name: 'Subject', value: 'Re: Intro [CLA #MD-26-97207]' }], parts: [{ mimeType: 'text/plain', body: { data: b64url('Thanks!') } }, { filename: 'reply.pdf', mimeType: 'application/pdf', body: { attachmentId: 'att1', size: 4 } }, { filename: 'virus.exe', mimeType: 'application/octet-stream', body: { attachmentId: 'att2', size: 4 } }] } } };
    return { status: 404, body: { error: 'not found' } };
  });
  const deps = {
    projectRef: 'aqcervntopidtcazcmlv', clientId: 'cid.apps.googleusercontent.com', clientSecret: SECRET, headers: {}, now: () => Date.now(), newId: () => '00000000-0000-4000-8000-00000000000' + (calls.stored.length + 1),
    fetch: async (url, init = {}) => { calls.fetch.push({ url, method: init.method || 'GET', body: init.body || '', headers: init.headers || {} }); const r = google(url, init); const bag = new Map(Object.entries(r.headers || {}).map(([k, v]) => [k.toLowerCase(), v])); return { ok: r.status < 300, status: r.status, headers: { get: (k) => bag.get(String(k).toLowerCase()) || null }, json: async () => r.body }; },
    getUser: async () => ({ id: JOHN }), myContext: async () => ctx,
    svc: async (fn, args) => { calls.svc.push({ fn, args });
      if (fn === 'gmail_svc_begin_oauth') { db.states.set(args.p_state_hash, args); return null; }
      if (fn === 'gmail_svc_take_oauth') { const s = db.states.get(args.p_state_hash); db.states.delete(args.p_state_hash); return s ? [{ profile_id: s.p_profile, code_verifier: s.p_verifier }] : []; }
      if (fn === 'gmail_svc_token') return [{ email: 'john@clatitle.com', refresh_token: REFRESH, history_id: '800', status: 'connected' }];
      if (fn === 'gmail_svc_linked_threads') return db.threads;
      if (fn === 'gmail_svc_known_messages') return args.p_ids.filter((x) => x === 'mKnown' || db.known.includes(x));
      if (fn === 'gmail_svc_check_sync_token') return args.p_token === db.syncToken;
      if (fn === 'gmail_svc_connected_accounts') return [{ profile_id: JOHN, email: 'john@clatitle.com' }];
      if (fn === 'gmail_svc_disconnect') return 'john@clatitle.com';
      if (fn === 'gmail_svc_record') { if (args.p && args.p.gmail_message_id) db.known.push(args.p.gmail_message_id); return 'rec-1'; }
      return null; },
    userDeal: async (id) => (id === DEAL ? { id: DEAL, file_number: 'MD-26-97207', street: '10423 John Glenn Street #502', city: 'Lanham', state: 'MD', zip: '20706' } : null),
    userDocs: async (dealId, ids) => ids.map((id) => ({ id, deal_id: dealId, name: id === 'wire' ? 'Wire Instructions.pdf' : 'Contract.pdf', mime_type: 'application/pdf', size_bytes: 4, storage_path: `${dealId}/${id}/Contract.pdf`, wire_instructions: false })).filter((d) => d.id !== 'other'),
    userDocBytes: async () => new Uint8Array([37, 80, 68, 70]),
    userEmail: async (id) => (id === 'e1' ? { id: 'e1', deal_id: DEAL, mailbox_email: 'john@clatitle.com', gmail_thread_id: 'tLinked', rfc_message_id: '<orig@mail>' } : null),
    storeAttachment: async (path, bytes, mime) => { calls.stored.push({ path, size: bytes.length, mime }); },
    ...over.deps,
  };
  if (over.ctx) Object.assign(ctx, over.ctx);
  return { deps, calls, db, ctx };
}
const post = (body, headers = {}) => new Request('https://fn.test', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const leaks = (calls, txt) => txt.includes(SECRET) || txt.includes(REFRESH) || txt.includes('ya29.');

// ---- start / status / disconnect ----
{ const f = fakeDeps({ deps: { getUser: async () => null } }); const r = await handleOauthStart(post({ action: 'start' }), f.deps); ok(r.status === 401 && !f.calls.svc.length, 'start: no session -> 401'); }
{ const f = fakeDeps({ ctx: { allowed: false, role: 'Employee' } }); const r = await handleOauthStart(post({ action: 'start' }), f.deps); ok(r.status === 403 && !f.calls.svc.length, 'start: an HR-only Employee is refused'); }
{ const f = fakeDeps({ ctx: { viewAs: true } }); const r = await handleOauthStart(post({ action: 'start' }), f.deps); ok(r.status === 403, 'start: refused while viewing as someone else'); }
{ const f = fakeDeps({ deps: { projectRef: 'bxixxgcqxmtzkrolywas' } }); const r = await handleOauthStart(post({ action: 'start' }), f.deps); ok(r.status === 503, 'start: any project other than Live Test refuses'); }
{ const f = fakeDeps(); const r = await handleOauthStart(post({ action: 'start' }), f.deps); const j = await r.json(); const q = new URL(j.url).searchParams; const saved = f.calls.svc.find((c) => c.fn === 'gmail_svc_begin_oauth').args;
  ok(r.status === 200 && q.get('state') && saved.p_state_hash !== q.get('state') && /^[0-9a-f]{64}$/.test(saved.p_state_hash) && saved.p_profile === JOHN && saved.p_verifier.length >= 43, 'start: state stored only as a hash, bound to the signed-in user, PKCE verifier kept server-side');
  ok(!JSON.stringify(j).includes(SECRET) && !j.url.includes(saved.p_verifier), 'start: no secret and no verifier in the response');
  // callback with that state
  const cb = await handleOauthCallback(new Request(`https://fn.test/?state=${encodeURIComponent(q.get('state'))}&code=abc`), f.deps);
  ok(cb.status === 302 && cb.headers.get('Location') === 'https://testportal.clatitle.com/#/profile?gmail=connected', 'callback: good consent -> back to Profile, connected');
  const tokenCall = f.calls.fetch.find((c) => c.url.includes('/token')); ok(tokenCall && tokenCall.body.includes('code_verifier=' + saved.p_verifier) && tokenCall.body.includes('redirect_uri=' + encodeURIComponent(REDIRECT_URI)), 'callback: code exchanged with the PKCE verifier and the exact redirect');
  const con = f.calls.svc.find((c) => c.fn === 'gmail_svc_connect'); ok(con && con.args.p_refresh === REFRESH && con.args.p_email === 'john@clatitle.com' && con.args.p_history === '900' && con.args.p_profile === JOHN, 'callback: refresh token handed to Vault storage for the login that pressed Connect');
  const again = await handleOauthCallback(new Request(`https://fn.test/?state=${encodeURIComponent(q.get('state'))}&code=abc`), f.deps);
  ok(again.headers.get('Location').endsWith('gmail=expired'), 'callback: a state works once (replay -> expired)'); }
{ const f = fakeDeps(); const r = await handleOauthCallback(new Request('https://fn.test/?state=forged&code=abc'), f.deps); ok(r.headers.get('Location').endsWith('gmail=expired') && !f.calls.fetch.length, 'callback: unknown state -> expired, Google never called'); }
async function cbWith(google) { const f = fakeDeps({ google }); const s = await (await handleOauthStart(post({ action: 'start' }), f.deps)).json(); const st = new URL(s.url).searchParams.get('state');
  const r = await handleOauthCallback(new Request(`https://fn.test/?state=${encodeURIComponent(st)}&code=abc`), f.deps); return { loc: r.headers.get('Location'), f }; }
{ 
  const mk = (patch) => (url) => { if (url.includes('/token')) return { status: 200, body: { access_token: 'ya29.a', refresh_token: REFRESH, scope: SCOPES.join(' '), id_token: 'h.' + b64url(JSON.stringify(patch)) + '.s' } }; if (url.includes('/revoke')) return { status: 200, body: {} }; if (url.endsWith('/profile')) return { status: 200, body: { emailAddress: patch.email, historyId: '1' } }; return { status: 404, body: {} }; };
  const w = await cbWith(mk({ email: 'john@gmail.com', email_verified: true }));
  ok(w.loc.endsWith('gmail=wrong_domain') && w.f.calls.fetch.some((c) => c.url.includes('/revoke')) && !w.f.calls.svc.some((c) => c.fn === 'gmail_svc_connect'), 'callback: a non-clatitle.com Google account is refused and its token revoked');
  const s = await cbWith((url) => (url.includes('/token') ? { status: 200, body: { access_token: 'ya29.a', refresh_token: REFRESH, scope: 'openid email https://www.googleapis.com/auth/gmail.send', id_token: 'h.' + b64url(JSON.stringify({ email: 'j@clatitle.com', email_verified: true, hd: 'clatitle.com' })) + '.s' } } : { status: 200, body: {} }));
  ok(s.loc.endsWith('gmail=missing_scope') && s.f.calls.fetch.some((c) => c.url.includes('/revoke')), 'callback: unticked read permission -> refused and revoked'); }
{ const f = fakeDeps(); const s = await (await handleOauthStart(post({ action: 'start' }), f.deps)).json(); const st = new URL(s.url).searchParams.get('state');
  const r = await handleOauthCallback(new Request(`https://fn.test/?state=${encodeURIComponent(st)}&error=access_denied`), f.deps); ok(r.headers.get('Location').endsWith('gmail=denied') && !f.calls.fetch.length, 'callback: user pressed Cancel -> denied'); }
{ const f = fakeDeps(); const r = await handleOauthStart(post({ action: 'disconnect' }), f.deps); const j = await r.json();
  ok(j.disconnected && j.revoked && f.calls.fetch.some((c) => c.url.includes('/revoke') && c.body.includes(encodeURIComponent(REFRESH))) && f.calls.svc.some((c) => c.fn === 'gmail_svc_disconnect'), 'disconnect: token revoked at Google, then Vault secret deleted'); }

// ---- send ----
const sendBody = (o = {}) => ({ dealId: DEAL, to: 'clatestportal+buyer@gmail.com', subject: 'Introduction', html: '<p>Hello</p>', ...o });
{ const f = fakeDeps(); const r = await handleSend(post(sendBody({ to: 'realbuyer@gmail.com, clatestportal+b@gmail.com', cc: 'agent@remax.com', bcc: 'boss@gmail.com', dryRun: true })), f.deps); const j = await r.json();
  ok(r.status === 200 && j.dryRun && !(j.refused || []).length && !f.calls.svc.some((c) => c.args && c.args.p_action === 'mail.refused') && !f.calls.fetch.length, 'send dry run: real (non-test) addresses are accepted, nothing refused, Google never called'); }
{ const f = fakeDeps({ ctx: { mailbox: null, mailboxStatus: null } }); const r = await handleSend(post(sendBody({ dryRun: true, documentIds: ['d1'] })), f.deps); const j = await r.json();
  ok(r.status === 200 && j.dryRun && j.connected === false && j.subject === 'Introduction [CLA #MD-26-97207 - 10423 John Glenn Street #502, Lanham MD 20706]' && j.attachments.length === 1 && !f.calls.fetch.length && !f.calls.svc.length, 'send dry run: allowed recipients pass, tag added, no Google call, works before connecting'); }
{ const f = fakeDeps({ ctx: { mailbox: null, mailboxStatus: null } }); const r = await handleSend(post(sendBody()), f.deps); ok(r.status === 409 && !f.calls.fetch.length, 'send: not connected -> 409, nothing sent'); }
{ const f = fakeDeps(); const r = await handleSend(post(sendBody({ dealId: 'not-mine' })), f.deps); ok(r.status === 404, 'send: a file the user cannot open -> 404'); }
{ const f = fakeDeps(); const r = await handleSend(post(sendBody({ html: '<p>Routing 021000021 account number 99887766</p>' })), f.deps); ok(r.status === 400 && !f.calls.fetch.length, 'send: wire / bank numbers in the body are refused'); }
{ const f = fakeDeps(); const r = await handleSend(post(sendBody({ documentIds: ['wire'] })), f.deps); ok(r.status === 400 && !f.calls.fetch.length, 'send: wire instructions cannot be attached'); }
{ const f = fakeDeps(); const r = await handleSend(post(sendBody({ documentIds: ['other'] })), f.deps); ok(r.status === 400, 'send: a document the user cannot open (or from another file) is refused'); }
{ const f = fakeDeps(); const r = await handleSend(post(sendBody({ documentIds: ['d1'], replyToEmailId: 'e1', cc: 'fsantos@clatitle.com', templateKey: 'intro' })), f.deps); const j = await r.json();
  const up = f.calls.fetch.find((c) => c.url.includes('uploadType=resumable') && !c.url.includes('upload_id')); const put = f.calls.fetch.find((c) => c.url.includes('upload_id=up1'));
  const mime = new TextDecoder().decode(put.body); const started = JSON.parse(up.body);
  ok(r.status === 200 && j.ok && j.attachments.length === 1 && started.threadId === 'tLinked' && mime.includes('In-Reply-To: <orig@mail>') && !f.calls.fetch.some((c) => c.url.includes('/gmail/v1/users/me/messages/send') && !c.url.includes('upload')), 'send: a reply with a file uses the upload endpoint and stays in the Gmail thread');
  const html = Buffer.from(mime.split('text/html; charset="UTF-8"')[1].split('\r\n\r\n')[1].split('--')[0].replace(/\r\n/g, ''), 'base64').toString();
  ok(mime.startsWith('From: "John Coester" <john@clatitle.com>') && html.includes('John Coester<br>CLA Title') && mime.includes('Contract.pdf') && mime.includes('JVBERg==') && put.headers['Content-Type'] === 'message/rfc822', 'send: from the user\'s own address, portal signature added, file bytes uploaded as the message');
  const rec = f.calls.svc.find((c) => c.fn === 'gmail_svc_record').args.p; ok(rec.direction === 'out' && rec.gmail_thread_id === 'tNew' && rec.rfc_message_id === '<sent1@mail.gmail.com>' && rec.attachment_names.join() === 'Contract.pdf' && rec.attachment_document_ids.join() === 'd1' && rec.subject.endsWith('[CLA #MD-26-97207 - 10423 John Glenn Street #502, Lanham MD 20706]') && rec.template_key === 'intro' && rec.sent_by === JOHN, 'send: recorded on the file with the attachment name, thread id, Message-ID, tag and template');
  ok(!leaks(f.calls, JSON.stringify(j)), 'send: no secret or token in the response'); }
{ const f = fakeDeps(); const orig = f.deps.fetch; f.deps.fetch = async (url, init) => { const res = await orig(url, init); if (String(url).includes('format=full')) return { ...res, json: async () => ({ payload: { headers: [{ name: 'Message-ID', value: '<sent1@mail.gmail.com>' }], parts: [{ mimeType: 'text/html', body: { size: 12 } }] } }) }; return res; };
  const r = await handleSend(post(sendBody({ documentIds: ['d1'] })), f.deps); const j = await r.json(); const rec = f.calls.svc.find((c) => c.fn === 'gmail_svc_record').args.p;
  ok(r.status === 502 && /did not keep Contract\.pdf/.test(j.error) && rec.attachment_names.length === 0 && rec.attachment_document_ids.length === 0 && rec.gmail_message_id === 'gSent1', 'send: Gmail kept no attachment, so the file email is recorded without names and the sender gets an error'); }
{ const f = fakeDeps({ deps: { userDocBytes: async () => new Uint8Array() } }); const r = await handleSend(post(sendBody({ documentIds: ['d1'] })), f.deps); const j = await r.json();
  ok(r.status === 502 && /empty/.test(j.error) && !f.calls.fetch.some((c) => c.url.includes('upload')) && !f.calls.svc.some((c) => c.fn === 'gmail_svc_record'), 'send: an empty file is refused before Gmail is called'); }
{ const f = fakeDeps({ deps: { userDocBytes: async () => { throw new Error('storage down'); } } }); const r = await handleSend(post(sendBody({ documentIds: ['d1'] })), f.deps); const j = await r.json();
  ok(r.status === 502 && /Could not read "Contract\.pdf"/.test(j.error) && /Nothing was sent/.test(j.error) && !f.calls.fetch.some((c) => c.url.includes('upload')), 'send: a storage failure names the file and does not send'); }
{ const f = fakeDeps({ deps: { userDocs: async (dealId, ids) => [{ id: ids[0], deal_id: dealId, name: 'Big.pdf', mime_type: 'application/pdf', size_bytes: 17_900_000, storage_path: 'x', wire_instructions: false }] } }); const r = await handleSend(post(sendBody({ documentIds: ['d1'] })), f.deps); const j = await r.json();
  ok(r.status === 400 && /25 MB/.test(j.error) && !f.calls.fetch.length, 'send: a file that will not fit in a Gmail message is refused before Google is called'); }
{ const f = fakeDeps(); const orig = f.deps.svc; f.deps.svc = async (fn, args) => { if (fn === 'gmail_svc_record') throw new Error('db down'); return orig(fn, args); };
  const r = await handleSend(post(sendBody()), f.deps); const j = await r.json();
  ok(r.status === 502 && /could not save it on the file/.test(j.error) && j.gmailMessageId === 'gSent1', 'send: a record failure after Gmail accepted the message is an error, not a success'); }
{ const idx = readFileSync(new URL('../supabase/functions/gmail-send/index.ts', import.meta.url), 'utf8');
  ok(!idx.includes('catch (_e)') && idx.includes('Nothing was sent') && idx.includes('e.message'), 'gmail-send surfaces a real error instead of hiding every failure'); }
{ const f = fakeDeps({ google: (url) => (url.includes('/token') ? { status: 400, body: { error: 'invalid_grant' } } : { status: 404, body: {} }) }); const r = await handleSend(post(sendBody()), f.deps);
  ok(r.status === 409 && f.calls.svc.some((c) => c.fn === 'gmail_svc_update_account' && c.args.p_status === 'needs_reconnect'), 'send: revoked Google access -> asks to reconnect, nothing sent'); }

// ---- sync ----
{ const f = fakeDeps({ deps: { getUser: async () => null } }); const r = await handleSync(post({}, { 'x-gmail-sync-token': 'y'.repeat(64) }), f.deps); ok(r.status === 401 && !f.calls.fetch.length, 'sync: wrong cron token -> 401'); }
{ const f = fakeDeps({ deps: { getUser: async () => null } }); const r = await handleSync(post({}), f.deps); ok(r.status === 401, 'sync: no token and no session -> 401'); }
{ const f = fakeDeps(); const r = await handleSync(post({}, { 'x-gmail-sync-token': 'x'.repeat(64) }), f.deps); const j = await r.json();
  ok(r.status === 200 && j.stored === 1, 'sync: one new reply stored');
  ok(!f.calls.fetch.some((c) => c.url.includes('mOther')), 'sync: a message in a thread NOT linked to a file is never opened');
  ok(!f.calls.fetch.some((c) => c.url.includes('/messages/mKnown')), 'sync: a message already on the file is skipped');
  const rec = f.calls.svc.find((c) => c.fn === 'gmail_svc_record').args.p; ok(rec.direction === 'in' && rec.source === 'gmail' && rec.deal_id === DEAL && rec.documents.length === 1 && rec.documents[0].key === 'mIn:att1' && rec.documents[0].path.startsWith(DEAL + '/') && rec.attachment_names.some((n) => /virus\.exe \(not saved/.test(n)), 'sync: reply attachment saved to the file documents; a disallowed type is not saved');
  const again = await handleSync(post({}, { 'x-gmail-sync-token': 'x'.repeat(64) }), f.deps); const againJson = await again.json();
  ok(again.status === 200 && againJson.stored === 0 && f.calls.stored.length === 1, 'sync again does not save the same attachment a second time');
  ok(f.calls.stored.length === 1 && f.calls.svc.some((c) => c.fn === 'gmail_svc_update_account' && c.args.p_history === '950'), 'sync: cursor moves forward after everything was handled'); }

// ---- Gmail signature import (John, Nov 9 2:06 PM) ----
ok(pickSendAsSignature({ sendAs: [{ isPrimary: true, signature: '<b>P</b>' }, { isDefault: true, signature: '<i>D</i>' }] }) === '<i>D</i>' && pickSendAsSignature({ sendAs: [{ isPrimary: true, signature: '<b>P</b>' }] }) === '<b>P</b>' && pickSendAsSignature({}) === '', 'signature: the default send-as wins, else the primary');
ok(!/script|onerror/.test(pickSendAsSignature({ sendAs: [{ isDefault: true, signature: '<p onerror="x()">A</p><script>y()</script>' }] })), 'signature: imported HTML is sanitized');
{ const once = withSignature('<p>Hi</p>', '<p>Jo</p>'); ok(once === '<p>Hi</p><br><div class="gmail_signature"><p>Jo</p></div>' && withSignature(once, '<p>Jo</p>') === once && withSignature('<p>Hi</p>', '<p><br></p>') === '<p>Hi</p>', 'signature: appended once, never twice, nothing when empty'); }
ok(hasSettingsScope('openid https://www.googleapis.com/auth/gmail.readonly') && hasSettingsScope(`openid ${SETTINGS_SCOPE}`) && !hasSettingsScope('openid email https://www.googleapis.com/auth/gmail.send'), 'signature: gmail.readonly (or settings.basic) is enough to read it');
{ const f = fakeDeps(); const s = await (await handleOauthStart(post({ action: 'start' }), f.deps)).json(); const st = new URL(s.url).searchParams.get('state');
  const cb = await handleOauthCallback(new Request(`https://fn.test/?state=${encodeURIComponent(st)}&code=abc`), f.deps);
  const set = f.calls.svc.find((c) => c.fn === 'gmail_svc_set_gmail_signature'); const ci = f.calls.svc.findIndex((c) => c.fn === 'gmail_svc_connect');
  ok(cb.headers.get('Location').endsWith('gmail=connected') && set && set.args.p_force === false && set.args.p_html.includes('John Coester | CLA Title') && !/onerror|script/.test(set.args.p_html) && f.calls.svc.indexOf(set) > ci, 'connect: imports the default Gmail signature after saving the connection (keeps a typed override)'); }
{ const f = fakeDeps({ sendAs: { status: 500, body: {} } }); const s = await (await handleOauthStart(post({ action: 'start' }), f.deps)).json(); const st = new URL(s.url).searchParams.get('state');
  const cb = await handleOauthCallback(new Request(`https://fn.test/?state=${encodeURIComponent(st)}&code=abc`), f.deps); ok(cb.headers.get('Location').endsWith('gmail=connected') && !f.calls.svc.some((c) => c.fn === 'gmail_svc_set_gmail_signature'), 'connect: a signature read failure never blocks the connect'); }
{ const tok = (scope) => (url) => (url.includes('/token') ? { status: 200, body: { access_token: 'ya29.a', refresh_token: REFRESH, scope, id_token: 'h.' + b64url(JSON.stringify({ email: 'john@clatitle.com', email_verified: true, hd: 'clatitle.com' })) + '.s' } } : url.endsWith('/profile') ? { status: 200, body: { emailAddress: 'john@clatitle.com', historyId: '1' } } : { status: 200, body: {} });
  const w = await cbWith(tok('openid email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly'));
  ok(w.loc.endsWith('gmail=connected') && w.f.calls.fetch.some((c) => c.url.endsWith('/settings/sendAs')), 'connect with send + read imports the signature (no extra permission)'); }
{ const f = fakeDeps({ ctx: { signatureScope: true } }); const r = await handleOauthStart(post({ action: 'refresh_signature' }), f.deps); const j = await r.json(); const set = f.calls.svc.find((c) => c.fn === 'gmail_svc_set_gmail_signature');
  ok(r.status === 200 && j.ok && j.signatureHtml.includes('John Coester | CLA Title') && set.args.p_force === true && set.args.p_profile === JOHN && !leaks(f.calls, JSON.stringify(j)), 'Refresh from Gmail: reads the signature (read-only) and replaces the portal one'); }
{ const f = fakeDeps({ ctx: { signatureScope: false } }); const r = await handleOauthStart(post({ action: 'refresh_signature' }), f.deps); const j = await r.json();
  ok(r.status === 409 && j.needsReconnect && /Reconnect Gmail to import your signature/.test(j.error) && !f.calls.fetch.length, 'Refresh from Gmail without the permission: asks to reconnect, Google not called'); }
{ const f = fakeDeps({ ctx: { signatureScope: true }, sendAs: { status: 403, body: { error: { status: 'PERMISSION_DENIED', message: 'Request had insufficient authentication scopes.' } } } }); const r = await handleOauthStart(post({ action: 'refresh_signature' }), f.deps); const j = await r.json();
  ok(r.status === 409 && j.needsReconnect && !f.calls.svc.some((c) => c.fn === 'gmail_svc_set_gmail_signature'), 'Refresh from Gmail: Google says the permission is missing -> reconnect, nothing stored'); }
{ const f = fakeDeps({ ctx: { signatureHtml: '<p>John Coester<br>CLA Title</p>' } }); const r = await handleSend(post(sendBody({ html: '<p>Hello</p><p>Thank you,</p><p>John Coester<br>CLA Title</p>' })), f.deps);
  const mime = b64urlToText(JSON.parse(f.calls.fetch.find((c) => c.url.includes('/messages/send')).body).raw); const html = Buffer.from(mime.split('text/html; charset="UTF-8"')[1].split('\r\n\r\n')[1].split('--')[0].replace(/\r\n/g, ''), 'base64').toString();
  const text = Buffer.from(mime.split('text/plain; charset="UTF-8"')[1].split('\r\n\r\n')[1].split('--')[0].replace(/\r\n/g, ''), 'base64').toString();
  ok(r.status === 200 && (html.match(/John Coester/g) || []).length === 1 && (text.match(/John Coester/g) || []).length === 1, 'send: a body that already ends with the signature does not get it twice (HTML and plain text)'); }

{ const f = fakeDeps({ google: (url) => {
  if (url.includes('/token')) return { status: 200, body: { access_token: 'ya29.access' } };
  if (url.includes('/history?')) return { status: 200, body: { historyId: '960', history: [{ messagesAdded: [{ message: { id: 'mOut', threadId: 'tLinked', labelIds: ['SENT'] } }] }] } };
  if (url.includes('/messages/mOut/attachments/att9')) return { status: 200, body: { data: b64url('%PDF') } };
  if (url.includes('/messages/mOut?format=full')) return { status: 200, body: { id: 'mOut', threadId: 'tLinked', labelIds: ['SENT'], internalDate: '1794000001000', snippet: 'From Gmail', payload: { headers: [{ name: 'From', value: 'john@clatitle.com' }, { name: 'To', value: 'clatestportal+b@gmail.com' }, { name: 'Subject', value: 'Outside' }], parts: [{ mimeType: 'text/plain', body: { data: b64url('Attached') } }, { filename: 'outside.pdf', mimeType: 'application/pdf', body: { attachmentId: 'att9', size: 4 } }] } } };
  return { status: 404, body: {} };
} });
  const r = await handleSync(post({}, { 'x-gmail-sync-token': 'x'.repeat(64) }), f.deps);
  const rec = (f.calls.svc.find((c) => c.fn === 'gmail_svc_record') || {}).args.p;
  ok(r.status === 200 && rec && rec.direction === 'out' && rec.source === 'gmail' && rec.documents.length === 1 && rec.documents[0].key === 'mOut:att9' && rec.documents[0].name === 'outside.pdf', 'mail sent from Gmail saves its attachment onto the file'); }
const mig = readFileSync(new URL('../supabase/migrations/20261110070000_gmail_attachment_documents.sql', import.meta.url), 'utf8');
const back = readFileSync(new URL('../supabase/rollbacks/20261110070000_gmail_attachment_documents.sql', import.meta.url), 'utf8');
ok(mig.includes("'staff'") && mig.includes('on conflict (deal_id, email_attachment_key) where email_attachment_key is not null do nothing') && mig.includes("is distinct from 'portal'"), 'migration saves inbound and outside attachments as staff only, once');
ok(back.includes('drop column email_attachment_key') && !back.includes('on conflict (deal_id, email_attachment_key)'), 'rollback restores the previous recorder and drops the attachment key');
{ const f = fakeDeps({
  google: (url) => {
    if (url.includes('/token')) return { status: 200, body: { access_token: 'ya29.access' } };
    if (url.includes('uploadType=resumable') && !url.includes('upload_id')) return { status: 200, body: {}, headers: { location: 'https://www.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=resumable&upload_id=up1' } };
    if (url.includes('upload_id=up1')) return { status: 200, body: { id: 'gSentUp', threadId: 'tUp' } };
    if (url.includes('/messages/gSentUp') && url.includes('format=full')) return { status: 200, body: { id: 'gSentUp', threadId: 'tUp', payload: { headers: [{ name: 'Message-ID', value: '<up@mail>' }], parts: [{ filename: 'Contract.pdf', mimeType: 'application/pdf', body: { attachmentId: 'oldAtt', size: 4 } }, { filename: 'photo.png', mimeType: 'image/png', body: { attachmentId: 'newAtt', size: 8 } }] } } };
    return { status: 404, body: {} };
  },
  deps: { userDocs: async (dealId, ids) => ids.map((id) => ({ id, deal_id: dealId, name: id === 'up1' ? 'photo.png' : 'Contract.pdf', mime_type: id === 'up1' ? 'image/png' : 'application/pdf', size_bytes: 4, storage_path: `${dealId}/${id}/f`, wire_instructions: false })) },
});
  const r = await handleSend(post(sendBody({ documentIds: ['d1'], uploadIds: ['up1', 'd1'] })), f.deps);
  const rec = (f.calls.svc.find((c) => c.fn === 'gmail_svc_record') || {}).args;
  const p = rec && rec.p;
  ok(r.status === 200 && p && p.source === 'portal' && p.attachment_document_ids.join() === 'd1,up1' && p.keyed_documents.length === 1 && p.keyed_documents[0].id === 'up1' && p.keyed_documents[0].key === 'gSentUp:newAtt' && !p.documents && f.calls.stored.length === 0, 'a computer upload is keyed for sync; a document picked from the file is not saved again');
  const before = f.calls.svc.length;
  const dry = await handleSend(post(sendBody({ dryRun: true, pendingUploads: [{ name: 'photo.png', size: 8 }] })), f.deps); const dj = await dry.json();
  ok(dry.status === 200 && dj.dryRun && dj.attachments.some((a) => a.pending && a.name === 'photo.png') && f.calls.svc.length === before && f.calls.stored.length === 0, 'check lists a computer file and does not save it');
  const wire = await handleSend(post(sendBody({ dryRun: true, pendingUploads: [{ name: 'Wire instructions.pdf', size: 4 }] })), f.deps);
  ok(wire.status === 400, 'a computer file named as wire instructions is refused'); }
const portalSql = readFileSync(new URL('../supabase/migrations/20261110070100_gmail_portal_upload_documents.sql', import.meta.url), 'utf8');
const portalBack = readFileSync(new URL('../supabase/rollbacks/20261110070100_gmail_portal_upload_documents.sql', import.meta.url), 'utf8');
ok(portalSql.includes('keyed_documents') && portalSql.includes("visibility = 'staff'") && portalSql.includes("is distinct from 'portal'") && portalSql.includes('already.name'), 'portal uploads are keyed staff documents; picked files and a second sync are not inserted');
ok(portalBack.includes('keyed_documents') && portalBack.includes('portal upload keys are still recorded') && !portalBack.includes("p->'keyed_documents'"), 'rollback removes the portal upload key stamp');

console.log(fail ? `${fail} FAILED` : 'all gmail phase 1 checks passed');
if (fail) process.exit(1);
