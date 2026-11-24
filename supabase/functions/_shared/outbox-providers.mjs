/* OUTBOX-SEND-1 (John, Nov 24 2026): the email service layer for the outbox-send edge function.
 * One small interface so the service can be swapped: send(message) -> { ok, id } or { ok: false, error, retry }.
 * Choose with the function secret OUTBOX_PROVIDER = 'ses' (Amazon SES, recommended) or 'resend'.
 * No secret is ever logged or returned. Pure: the caller passes env and fetch, so the Node tests use fakes. */
import { buildMime, bytesToB64, utf8, textToHtml } from './gmail-core.mjs';

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', typeof s === 'string' ? utf8(s) : s));
async function hmac(key, s) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? utf8(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, utf8(s)));
}

/* AWS Signature Version 4 for one JSON POST (or any method). Returns the headers to send. */
export async function sigv4({ method = 'POST', host, path = '/', query = '', body = '', region, service, accessKeyId, secretAccessKey, sessionToken, amzDate, headers = {} }) {
  const date = amzDate || new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = date.slice(0, 8);
  const h = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host, 'x-amz-date': date };
  if (sessionToken) h['x-amz-security-token'] = sessionToken;
  const names = Object.keys(h).sort();
  const canonical = [method, path, query, names.map((n) => `${n}:${h[n]}\n`).join(''), names.join(';'), await sha256(body)].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', date, scope, await sha256(canonical)].join('\n');
  let k = await hmac(`AWS4${secretAccessKey}`, day);
  k = await hmac(k, region); k = await hmac(k, service); k = await hmac(k, 'aws4_request');
  const signature = hex(await hmac(k, toSign));
  const out = { ...h, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
  delete out.host;
  return out;
}

// a short reason without anything that looks like a key
export function safeError(s) {
  const m = String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 300);
  return /AKIA|re_[A-Za-z0-9]{8}|secret|bearer|signature=/i.test(m) ? 'The email service refused the request.' : (m || 'The email service did not say why.');
}
// 429, 5xx and network errors are worth another try; other refusals are not
export const retryable = (status) => status === 0 || status === 429 || status >= 500;

export function sesProvider(env, fetchFn) {
  const region = env.AWS_SES_REGION;
  const host = `email.${region}.amazonaws.com`;
  return {
    name: 'ses',
    async send(m) {
      const raw = buildMime({ from: m.from, fromName: m.fromName, to: [m.to], cc: m.cc, bcc: [], subject: m.subject, text: m.text, html: m.html, attachments: m.attachments, seed: m.id });
      const payload = { FromEmailAddress: m.fromName ? `"${String(m.fromName).replace(/["\\\r\n]/g, '')}" <${m.from}>` : m.from,
        Destination: { ToAddresses: [m.to], CcAddresses: m.cc, BccAddresses: m.bcc }, Content: { Raw: { Data: bytesToB64(utf8(raw)) } },
        EmailTags: [{ Name: 'outbox_id', Value: String(m.id).replace(/[^A-Za-z0-9_-]/g, '') }] };
      if (env.AWS_SES_CONFIGURATION_SET) payload.ConfigurationSetName = env.AWS_SES_CONFIGURATION_SET;
      const body = JSON.stringify(payload);
      const headers = await sigv4({ host, path: '/v2/email/outbound-emails', body, region, service: 'ses', accessKeyId: env.AWS_SES_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY, headers: { 'content-type': 'application/json' } });
      let res;
      try { res = await fetchFn(`https://${host}/v2/email/outbound-emails`, { method: 'POST', headers, body }); }
      catch (e) { return { ok: false, error: 'Could not reach Amazon SES.', retry: true }; }
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.MessageId) return { ok: true, id: String(j.MessageId) };
      return { ok: false, error: safeError(`Amazon SES ${res.status}: ${j.message || j.Message || ''}`), retry: retryable(res.status) };
    },
  };
}

export function resendProvider(env, fetchFn) {
  return {
    name: 'resend',
    async send(m) {
      const body = JSON.stringify({ from: m.fromName ? `${String(m.fromName).replace(/[<>"\r\n]/g, '')} <${m.from}>` : m.from, to: [m.to], cc: m.cc, bcc: m.bcc,
        subject: m.subject, text: m.text, html: m.html, tags: [{ name: 'outbox_id', value: String(m.id).replace(/[^A-Za-z0-9_-]/g, '') }],
        attachments: m.attachments.map((a) => ({ filename: a.name, content: bytesToB64(a.bytes) })) });
      let res;
      try {
        res = await fetchFn('https://api.resend.com/emails', { method: 'POST', body,
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `outbox-${m.id}` } });
      } catch (e) { return { ok: false, error: 'Could not reach Resend.', retry: true }; }
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.id) return { ok: true, id: String(j.id) };
      return { ok: false, error: safeError(`Resend ${res.status}: ${j.message || ''}`), retry: retryable(res.status) };
    },
  };
}

const NEEDS = { ses: ['AWS_SES_REGION', 'AWS_SES_ACCESS_KEY_ID', 'AWS_SES_SECRET_ACCESS_KEY'], resend: ['RESEND_API_KEY'] };
/* { provider } when every secret it needs is set, else { missing: 'what is not set' } (names only, never values) */
export function pickProvider(env = {}, fetchFn = fetch) {
  const name = String(env.OUTBOX_PROVIDER || '').trim().toLowerCase();
  if (!NEEDS[name]) return { missing: 'OUTBOX_PROVIDER (ses or resend)' };
  const missing = NEEDS[name].filter((k) => !String(env[k] || '').trim());
  if (missing.length) return { missing: missing.join(', ') };
  if (name === 'ses' && !/^[a-z]{2}-[a-z]+-\d$/.test(env.AWS_SES_REGION)) return { missing: 'AWS_SES_REGION (for example us-east-1)' };
  return { provider: name === 'ses' ? sesProvider(env, fetchFn) : resendProvider(env, fetchFn) };
}

export const messageHtml = (text) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${textToHtml(text)}</div>`;
