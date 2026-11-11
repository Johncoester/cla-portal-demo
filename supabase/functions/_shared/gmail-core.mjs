/* Gmail phase 1 (John, Nov 9): pure helpers shared by the gmail-* edge functions and the Node tests.
 * TEST project only. Nothing here reads a secret, calls Google or touches the database. */
import { AUTH_INVITE_HTML, AUTH_INVITE_LINK_VAR, AUTH_INVITE_SUBJECT } from './auth-invite-template.mjs';
export const TEST_PROJECT_REF = 'aqcervntopidtcazcmlv';
export const PORTAL_ORIGIN = 'https://testportal.clatitle.com';
export const PORTAL_ORIGINS = ['https://testportal.clatitle.com', 'https://johncoester.github.io'];
export const REDIRECT_URI = 'https://aqcervntopidtcazcmlv.supabase.co/functions/v1/gmail-oauth-callback';
export const WORKSPACE_DOMAIN = 'clatitle.com';
export const SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
// Signature import (John, Nov 9 2:06 PM): users.settings.sendAs.list accepts gmail.readonly, which Connect already asks for, so no extra
// permission is requested (gmail.settings.basic would also allow CHANGING Gmail settings). Any of these lets the portal read the signature.
export const SETTINGS_SCOPE = 'https://www.googleapis.com/auth/gmail.settings.basic';
export const SIGNATURE_READ_SCOPES = [READ_SCOPE, SETTINGS_SCOPE, 'https://www.googleapis.com/auth/gmail.modify', 'https://mail.google.com/'];
export const SCOPES = ['openid', 'email', SEND_SCOPE, READ_SCOPE];
export const hasSettingsScope = (granted) => { const g = String(granted || '').split(/\s+/); return SIGNATURE_READ_SCOPES.some((x) => g.includes(x)); };
// the signature Gmail adds for the default send-as address (else the primary one), sanitized like any email body
export function pickSendAsSignature(body) {
  const list = (body && Array.isArray(body.sendAs)) ? body.sendAs : [];
  const a = list.find((x) => x && x.isDefault) || list.find((x) => x && x.isPrimary) || null;
  return a ? sanitizeHtml(String(a.signature || '')).slice(0, 20000) : '';
}
// append the signature once: not when there is none, and not when the body already ends with it
export function withSignature(bodyHtml, sigHtml) {
  const sig = sanitizeHtml(sigHtml || ''); const st = htmlToText(sig);
  if (!st) return bodyHtml;
  const flat = (t) => t.replace(/\s+/g, ' ').trim();
  if (flat(htmlToText(bodyHtml)).endsWith(flat(st))) return bodyHtml;
  return `${bodyHtml}<br><div class="gmail_signature">${sig}</div>`;
}
export const GMAIL_ROLES = ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'];
export const MAX_RECIPIENTS = 20;
export const MAX_DOCS = 10;
export const MAX_ATTACH_BYTES = 18_000_000;   // raw file bytes, before base64
export const MAX_MESSAGE_BYTES = 24_000_000;  // stay under Gmail's 25 MB limit for the whole RFC822 message
// base64 (+ line wraps) of the file bytes, plus the message text. Used to refuse before Gmail is called.
export function estimateMimeBytes(fileBytes, extra = 0) {
  const n = Math.max(0, Number(fileBytes) || 0);
  return Math.ceil(n / 3) * 4 + Math.ceil(n / 57) * 2 + (Number(extra) || 0);
}
export const MAX_SAVE_BYTES = 25_000_000;     // deal-documents bucket limit
export const MAX_BODY_CHARS = 200_000;
export const UPLOAD_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'png', 'jpg', 'jpeg', 'heic', 'heif', 'webp'];   // = private.upload_ext_ok
export const TEST_ALLOWLIST_NOTE = 'CLA Portal Live Test only sends to test addresses: clatestportal@gmail.com, clatestportal+anything@gmail.com, any @clatitle.com address, jcoester-6jkr3p@mail.grokbot.com, testbuyerjohnc@gmail.com, testsellergael@gmail.com, johncoester@gmail.com, and listingagentrosy@gmail.com. Every other address is refused.';

const EMAIL_RE = /^[a-z0-9._%+'-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/;
export const isEmail = (a) => EMAIL_RE.test(String(a || '')) && !String(a).includes('..');

/* Live Test recipient allowlist (server-side; the page only mirrors it). The four named Gmail
 * addresses are exact (case-insensitive). A plus-tag or a different domain is still refused. */
const EXACT_TEST_RECIPIENTS = new Set([
  'clatestportal@gmail.com',
  'jcoester-6jkr3p@mail.grokbot.com',
  'testbuyerjohnc@gmail.com',
  'testsellergael@gmail.com',
  'johncoester@gmail.com',
  'listingagentrosy@gmail.com',
]);
export function isAllowedTestRecipient(addr) {
  const a = String(addr || '').trim().toLowerCase();
  if (!isEmail(a)) return false;
  if (EXACT_TEST_RECIPIENTS.has(a)) return true;
  if (/^clatestportal\+[a-z0-9._-]{1,64}@gmail\.com$/.test(a)) return true;
  return /^[a-z0-9._%+'-]+@clatitle\.com$/.test(a);
}

/* "Name <a@b>, c@d; e@f" or an array -> unique lower-case addresses + the pieces that are not addresses */
export function parseAddressList(input) {
  const parts = (Array.isArray(input) ? input : String(input || '').split(/[,;\n]/)).map((x) => String(x || '').trim()).filter(Boolean);
  const ok = []; const bad = [];
  for (const p of parts) {
    const m = p.match(/<([^<>\s]+)>\s*$/); const a = (m ? m[1] : p).trim().toLowerCase().replace(/^mailto:/, '');
    if (isEmail(a)) { if (!ok.includes(a)) ok.push(a); } else bad.push(p.slice(0, 80));
  }
  return { ok, bad };
}

export const oneLine = (s, max = 250) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
// "123 Main St, Rockville MD 20850" — comma after street only; empty parts omitted (John, Nov 9)
export function formatPropertyAddress(deal = {}) {
  const street = oneLine(deal && deal.street, 120);
  const city = oneLine(deal && deal.city, 80);
  const state = oneLine(deal && deal.state, 20);
  const zip = oneLine(deal && deal.zip, 20);
  const cityStateZip = [city, state, zip].filter(Boolean).join(' ');
  return [street, cityStateZip].filter(Boolean).join(', ');
}
// [CLA #MD-26-97218] or [CLA #MD-26-97218 - 123 Main St, Rockville MD 20850]
export const fileTag = (fileNumber, address) => {
  const num = oneLine(fileNumber, 60) || 'order';
  const addr = oneLine(typeof address === 'string' ? address : formatPropertyAddress(address || {}), 160);
  return addr ? `[CLA #${num} - ${addr}]` : `[CLA #${num}]`;
};
// Match any existing tag for this file number (with or without address) so replies and old subjects are not re-tagged.
export function subjectWithTag(subject, fileNumber, address) {
  const num = oneLine(fileNumber, 60) || 'order';
  const s = oneLine(subject, 250);
  if (s.toLowerCase().includes(`[cla #${num.toLowerCase()}`)) return s;
  return oneLine(`${s} ${fileTag(num, address)}`, 300);
}

/* Remove active content. Stored mail is also shown only inside a sandboxed iframe. */
export function sanitizeHtml(html) {
  let s = String(html == null ? '' : html).slice(0, MAX_BODY_CHARS * 2);
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(script|style|iframe|object|embed|form|textarea|select|button|svg|math|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<\/?(script|style|iframe|object|embed|form|input|textarea|select|button|link|meta|base|svg|math|template|noscript|frame|frameset|applet)\b[^>]*>/gi, '');
  s = s.replace(/\s(on[a-z]+|formaction|srcdoc)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/\s(href|src|action|background|poster|xlink:href)\s*=\s*("|')?\s*(javascript|vbscript|data|file):[^"'>\s]*("|')?/gi, '');
  s = s.replace(/expression\s*\(/gi, '');
  return s;
}

const ENT = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
export function htmlToText(html) {
  return String(html == null ? '' : html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '').replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENT[m]).replace(/\n{3,}/g, '\n\n').trim();
}
export const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const textToHtml = (t) => escapeHtml(t).replace(/\r?\n/g, '<br>');

/* Wire rule: wire / bank details never go out by email from the portal (they go to the buyer only, by phone-verified process). */
export function hasWireDetails(text) {
  const t = String(text || '');
  return /\b(routing|aba|swift|iban)\b[^0-9]{0,40}\d{6,}/i.test(t) || /\baccount\s*(no\.?|number|num|#)[^0-9]{0,30}\d{5,}/i.test(t);
}
export const isWireName = (n) => /\bwir(e|ed|es|ing)\b|wire[_ -]?instruction|\bwiring/i.test(String(n || ''));
export const extOk = (n) => { const s = String(n || ''); const i = s.lastIndexOf('.'); return i > 0 && UPLOAD_EXT.includes(s.slice(i + 1).toLowerCase()); };
export const safeName = (n) => (String(n || 'attachment').replace(/[\\/\u0000-\u001f]+/g, '_').replace(/^\.+/, '').trim() || 'attachment').slice(-200);

/* Computer uploads on a portal send are already documents. The key matches gmail-sync
 * (`message id` + Gmail attachment id, or the safe file name when Gmail did not assign one)
 * so a later sync of this same sent message does not insert a second row.
 * existingNames are the documents picked from the file, in MIME order, ahead of the uploads. */
export function matchUploadKeys(messageId, existingNames, uploads, gmailAttachments) {
  const parts = Array.isArray(gmailAttachments) ? gmailAttachments : [];
  let i = 0;
  for (const name of existingNames || []) {
    if (i < parts.length && safeName(parts[i].filename) === safeName(name)) i += 1;
    else break;
  }
  const mid = String(messageId || '').slice(0, 80);
  return (uploads || []).map((u, n) => {
    const name = safeName(u.name);
    const part = parts[i + n];
    const same = part && safeName(part.filename) === name;
    const suffix = same && part.attachmentId ? String(part.attachmentId) : name;
    return { id: u.id, key: `${mid}:${suffix}`.slice(0, 200) };
  });
}

/* ---- encoding ---- */
const enc = new TextEncoder();
export const utf8 = (s) => enc.encode(String(s));
// 4096 stays under the edge runtime's apply() argument limit. 32768 can throw
// "Maximum call stack size exceeded" while a contract PDF is being encoded, which
// aborts the send before it is recorded.
export function bytesToB64(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : utf8(String(bytes == null ? '' : bytes));
  const chunks = []; const CH = 4096;
  for (let i = 0; i < u.length; i += CH) chunks.push(String.fromCharCode.apply(null, u.subarray(i, i + CH)));
  return btoa(chunks.join(''));
}
export const b64url = (x) => bytesToB64(typeof x === 'string' ? utf8(x) : x).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function b64urlToBytes(s) {
  const b = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); const pad = b.length % 4 ? '='.repeat(4 - (b.length % 4)) : '';
  const bin = atob(b + pad); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
}
export const b64urlToText = (s) => new TextDecoder().decode(b64urlToBytes(s));
const wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n');
export const encodeHeaderWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${bytesToB64(utf8(s))}?=`);
const quoteName = (n) => { const c = oneLine(n, 120).replace(/["\\]/g, ''); return c ? (/^[\x20-\x7e]*$/.test(c) ? `"${c}"` : encodeHeaderWord(c)) : ''; };
const fileParam = (n) => { const c = safeName(n).replace(/["\\]/g, ''); return /^[\x20-\x7e]*$/.test(c) ? `filename="${c}"` : `filename*=UTF-8''${encodeURIComponent(c)}`; };

/* RFC 5322 message for users.messages.send (raw, base64url). Every header value is one line. */
export function buildMime({ from, fromName, to = [], cc = [], bcc = [], subject, html, text, attachments = [], inReplyTo, references, seed }) {
  const id = String(seed || Math.random().toString(36).slice(2)).replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'x';
  const mixed = `cla_mixed_${id}`; const alt = `cla_alt_${id}`; const L = [];
  const fromH = fromName ? `${quoteName(fromName)} <${from}>` : `<${from}>`;
  L.push(`From: ${fromH}`);
  if (to.length) L.push(`To: ${to.join(', ')}`);
  if (cc.length) L.push(`Cc: ${cc.join(', ')}`);
  if (bcc.length) L.push(`Bcc: ${bcc.join(', ')}`);
  L.push(`Subject: ${encodeHeaderWord(oneLine(subject, 300))}`);
  if (inReplyTo) { L.push(`In-Reply-To: ${oneLine(inReplyTo, 300)}`); L.push(`References: ${oneLine(references || inReplyTo, 900)}`); }
  L.push('MIME-Version: 1.0');
  const altPart = [`Content-Type: multipart/alternative; boundary="${alt}"`, '', `--${alt}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '',
    wrap76(bytesToB64(utf8(text || ''))), `--${alt}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '',
    wrap76(bytesToB64(utf8(html || ''))), `--${alt}--`];
  if (!attachments.length) { L.push(...altPart, ''); return L.join('\r\n'); }
  L.push(`Content-Type: multipart/mixed; boundary="${mixed}"`, '', `--${mixed}`, ...altPart);
  for (const a of attachments) {
    const mime = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(a.mime || '') ? a.mime : 'application/octet-stream';
    const fname = fileParam(a.name);
    const quoted = fname.match(/^filename="(.*)"$/);
    L.push(`--${mixed}`, `Content-Type: ${mime}${quoted ? `; name="${quoted[1]}"` : ''}`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; ${fname}`, '', wrap76(bytesToB64(a.bytes || new Uint8Array())));
  }
  L.push(`--${mixed}--`, '');
  return L.join('\r\n');
}

/* ---- reading Gmail messages (users.messages.get format=full) ---- */
export function splitAddressHeader(v) {
  const out = []; let cur = ''; let q = false; let ang = 0;
  for (const ch of String(v || '')) { if (ch === '"') q = !q; if (!q && ch === '<') ang++; if (!q && ch === '>') ang = Math.max(0, ang - 1); if (ch === ',' && !q && !ang) { out.push(cur); cur = ''; } else cur += ch; }
  if (cur.trim()) out.push(cur);
  return out.map((p) => { const m = p.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/); return m ? { name: m[1].trim(), email: m[2].trim().toLowerCase() } : { name: '', email: p.trim().toLowerCase() }; }).filter((x) => x.email);
}
export function parseGmailMessage(msg) {
  const headers = {}; (msg.payload && msg.payload.headers || []).forEach((h) => { headers[String(h.name).toLowerCase()] = h.value; });
  let html = ''; let text = ''; const attachments = [];
  const walk = (p) => {
    if (!p) return; const mt = String(p.mimeType || '').toLowerCase(); const body = p.body || {};
    if (p.filename) { attachments.push({ filename: p.filename, mimeType: p.mimeType || 'application/octet-stream', size: body.size || 0, attachmentId: body.attachmentId || null, data: body.attachmentId ? null : body.data || null }); return; }
    if (mt === 'text/html' && body.data && !html) html = b64urlToText(body.data);
    else if (mt === 'text/plain' && body.data && !text) text = b64urlToText(body.data);
    (p.parts || []).forEach(walk);
  };
  walk(msg.payload);
  const from = splitAddressHeader(headers.from)[0] || { name: '', email: '' };
  return { id: msg.id, threadId: msg.threadId, labelIds: msg.labelIds || [], snippet: msg.snippet || '', internalDate: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null,
    from: from.email, fromName: from.name, to: splitAddressHeader(headers.to).map((x) => x.email), cc: splitAddressHeader(headers.cc).map((x) => x.email),
    subject: headers.subject || '', rfcMessageId: headers['message-id'] || '', html: html ? sanitizeHtml(html) : (text ? `<pre style="white-space:pre-wrap">${escapeHtml(text)}</pre>` : ''), attachments };
}

/* ---- OAuth helpers ---- */
export function randomToken(bytes = 32) { const b = new Uint8Array(bytes); crypto.getRandomValues(b); return b64url(b); }
export async function sha256Hex(s) { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(s))); return [...d].map((x) => x.toString(16).padStart(2, '0')).join(''); }
export async function pkceChallenge(verifier) { return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(verifier)))); }
export function authUrl({ clientId, state, challenge, loginHint }) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: REDIRECT_URI, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent',
    state, code_challenge: challenge, code_challenge_method: 'S256', hd: WORKSPACE_DOMAIN });
  if (loginHint && /@clatitle\.com$/i.test(loginHint)) q.set('login_hint', loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}
export function decodeJwtPayload(jwt) { try { return JSON.parse(b64urlToText(String(jwt || '').split('.')[1] || '')); } catch (e) { return null; } }
export const missingScopes = (granted) => { const g = String(granted || '').split(/\s+/); return [SEND_SCOPE, READ_SCOPE].filter((s) => !g.includes(s)); };
export const extraScopes = (granted) => String(granted || '').split(/\s+/).filter((s) => s && !SCOPES.includes(s) && s !== 'https://www.googleapis.com/auth/userinfo.email');

export function corsHeaders(origin) {
  const h = { 'Cache-Control': 'no-store', Vary: 'Origin', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (PORTAL_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
export const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

/* Portal invite email. The HTML is the approved TEST Auth "Invite user" template.
 * Only {{ .ConfirmationURL }} is swapped for this portal's one-time accept link. The subject stays the Auth subject.
 * kind 'agent' covers agents and buyers / sellers; kind 'hr' is a staff invite. The link path is the only difference. */
export { AUTH_INVITE_SUBJECT };
export const INVITE_TOKEN_RE = /^[0-9a-f]{64}$/;
export function inviteLink(kind, token) { return `${PORTAL_ORIGIN}/#/${kind === 'hr' ? 'hr-invite' : 'agent-invite'}/${token}`; }
export function invitePlainText(link) {
  return [
    "You're invited to the CLA Title Portal",
    'C.L.A. Title & Escrow has invited you to create an account. Once you accept, you can track your order, documents, tasks, and messages in one place.',
    `Accept invitation: ${link}`,
    "If you weren't expecting this, you can ignore this email.",
    'C.L.A. Title & Escrow',
    'clatitle.com',
  ].join('\n\n');
}
export function inviteEmailContent(info = {}, { token } = {}) {
  const kind = info.kind === 'hr' ? 'hr' : 'agent';
  const link = inviteLink(kind, token);
  const safe = escapeHtml(link);
  if (!AUTH_INVITE_HTML.includes(AUTH_INVITE_LINK_VAR)) throw new Error('Invite template is missing its link variable.');
  const html = AUTH_INVITE_HTML.split(AUTH_INVITE_LINK_VAR).join(safe);
  return { subject: AUTH_INVITE_SUBJECT, html, link, text: invitePlainText(link), to: String(info.email || '').trim().toLowerCase() };
}
