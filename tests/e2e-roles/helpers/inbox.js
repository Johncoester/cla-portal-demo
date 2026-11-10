/* Read and trash messages in the dedicated test inbox. Gmail API only.
 * Tokens and secrets are never written to the summary or the console. */

import { createHash } from 'node:crypto';

const TIMEOUT_MS = 180000;

function required(name) {
  const value = process.env[name];
  if (!value) {
    const err = new Error(`Missing secret ${name}.`);
    err.code = 'E2E_SECRET';
    throw err;
  }
  return value;
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/* When the three GitHub secrets are unset, read them from TEST Vault.
 * The service-role key is already a workflow secret. The values are not printed. */
export async function loadGmailVault(env = process.env, fetchImpl = globalThis.fetch) {
  if (env.E2E_GMAIL_CLIENT_ID && env.E2E_GMAIL_CLIENT_SECRET && env.E2E_GMAIL_REFRESH_TOKEN) return false;
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return false;
  if (url !== 'https://aqcervntopidtcazcmlv.supabase.co') {
    throw new Error('Refusing to load the test inbox from a project that is not CLA Portal Live Test.');
  }
  const res = await fetchImpl(`${url}/rest/v1/rpc/e2e_gmail_credentials`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`The test inbox Gmail credentials are not available (HTTP ${res.status}).`);
  let json;
  try { json = await res.json(); } catch (e) { throw new Error('The test inbox Gmail credentials could not be read.'); }
  const row = Array.isArray(json) ? json[0] : json;
  const id = row && row.client_id;
  const secret = row && row.client_secret;
  const refresh = row && row.refresh_token;
  if (!id || !secret || !refresh) throw new Error('The test inbox is not connected yet.');
  env.E2E_GMAIL_CLIENT_ID = id;
  env.E2E_GMAIL_CLIENT_SECRET = secret;
  env.E2E_GMAIL_REFRESH_TOKEN = refresh;
  return true;
}

const GMAIL_SECRET_NAMES = ['E2E_GMAIL_CLIENT_ID', 'E2E_GMAIL_CLIENT_SECRET', 'E2E_GMAIL_REFRESH_TOKEN'];

/* Read the vault first, then decide. Names of missing variables only: never the values.
 * E2E_REQUIRE_EMAIL=1 means the workflow is running the inbox, so a miss is a failure. */
export async function gmailCredentials(env = process.env, fetchImpl = globalThis.fetch) {
  let vaultError = '';
  try {
    await loadGmailVault(env, fetchImpl);
  } catch (e) {
    vaultError = e && e.message ? String(e.message) : 'The test inbox vault read failed.';
  }
  const missing = GMAIL_SECRET_NAMES.filter((name) => !env[name]);
  if (!missing.length) return { ok: true, message: '' };
  const message = `Gmail credentials are not in the environment or the TEST vault (${missing.join(', ')}).${vaultError ? ' ' + vaultError : ''}`;
  return { ok: false, required: env.E2E_REQUIRE_EMAIL === '1', message };
}

export async function gmailAccessToken() {
  await loadGmailVault();
  const body = new URLSearchParams({
    client_id: required('E2E_GMAIL_CLIENT_ID'),
    client_secret: required('E2E_GMAIL_CLIENT_SECRET'),
    refresh_token: required('E2E_GMAIL_REFRESH_TOKEN'),
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  if (!res.ok) throw new Error(`Gmail token request failed (HTTP ${res.status}).`);
  const json = await res.json();
  if (!json.access_token) throw new Error('Gmail token response had no access token.');
  return json.access_token;
}

async function gmail(token, path, init = {}) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Gmail API ${path.split('?')[0]} failed (HTTP ${res.status}).`);
  if (res.status === 204) return null;
  return res.json();
}

function header(msg, name) {
  const headers = (msg.payload && msg.payload.headers) || [];
  const hit = headers.find((h) => String(h.name).toLowerCase() === name);
  return hit ? hit.value : '';
}

function walkParts(part, into) {
  if (!part) return;
  if (part.filename) {
    into.push({
      filename: part.filename,
      mimeType: part.mimeType || '',
      size: (part.body && part.body.size) || 0,
      attachmentId: (part.body && part.body.attachmentId) || '',
      data: (part.body && part.body.data) || '',
    });
  }
  for (const child of part.parts || []) walkParts(child, into);
}

function decodeB64Url(data) {
  const b = String(data || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = b.length % 4 ? '='.repeat(4 - (b.length % 4)) : '';
  return Buffer.from(b + pad, 'base64');
}

export async function pollInbox({ token, subjectIncludes, timeoutMs = TIMEOUT_MS }) {
  const started = Date.now();
  const q = `subject:"${String(subjectIncludes).replace(/"/g, '')}" newer_than:2d`;
  let lastErr = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const list = await gmail(token, `/messages?q=${encodeURIComponent(q)}&maxResults=5`);
      const id = list.messages && list.messages[0] && list.messages[0].id;
      if (id) {
        const msg = await gmail(token, `/messages/${id}?format=full`);
        const attachments = [];
        walkParts(msg.payload, attachments);
        return {
          id,
          threadId: msg.threadId,
          subject: header(msg, 'subject'),
          snippet: msg.snippet || '',
          attachments,
          latencyMs: Date.now() - started,
        };
      }
    } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, 5000));
  }
  const why = lastErr ? ` Last error: ${lastErr.message}` : '';
  throw new Error(`No inbox message matching that subject within ${Math.round(timeoutMs / 1000)}s.${why}`);
}

export async function attachmentBytes(token, messageId, attachment) {
  if (attachment.data) return decodeB64Url(attachment.data);
  if (!attachment.attachmentId) return Buffer.alloc(0);
  const body = await gmail(token, `/messages/${messageId}/attachments/${attachment.attachmentId}`);
  return decodeB64Url(body.data || '');
}

export async function trashMessage(token, id) {
  if (!id) return;
  await gmail(token, `/messages/${id}/trash`, { method: 'POST' });
}

/* Reply from the test inbox back to the address that sent the file email. */
export async function replyWithAttachment({ token, threadId, to, subject, filename, bytes }) {
  const boundary = `e2e_${Date.now().toString(36)}`;
  const text = 'E2E reply. Fake attachment only.';
  const mime = [
    `To: ${to}`,
    `Subject: ${subject.startsWith('Re:') ? subject : `Re: ${subject}`}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    bytes.toString('base64').replace(/.{1,76}/g, '$&\r\n'),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const raw = Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return gmail(token, '/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw, threadId }),
  });
}
