// AGENT INVITE + ACCOUNT SETUP and the "Your agent" card (John, Nov 4). Pure rules shared by the mock adapter, the Supabase adapter and the pages.
// FAKE DATA ONLY. Nothing here sends anything: the portal sends no email; staff copy the one-time link by hand.
import { isStaff, phoneOk, fmtPhone, PHONE_MSG } from './constants.js?v=202611061858';
export const INVITE_DAYS = 14;                       // a pending invite link works for 14 days, then it shows as expired (Resend makes a new link)
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;      // the picked file (before crop)
export const PHOTO_STORED_MAX = 400 * 1024;          // the cropped picture kept (data URL in the mock; Storage object in Supabase)
export const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const PHOTO_SHAPES = ['circle', 'square'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const NO_EMAIL_NOTE = 'Nothing is emailed: the portal does not send email. Copy this one-time link and send it to the agent yourself.';
// who may invite: Processor, Sales Person, Sales Team, Admin / Super admin. NOT Transaction Coordinators (John, Nov 4 1:48 PM: "No for now"):
// a TC gets no Agent Invites page, no Invite to portal button, and every invite call refuses (mirrored by private.can_invite_agents in migration 41)
export const canInviteAgents = (u) => !!u && u.status !== 'removed' && (u.isAdmin || isStaff(u.role)) && (u.isAdmin || u.role !== 'Transaction Coordinator');
export const inviteStatus = (inv, nowIso = new Date().toISOString()) => (!inv ? 'invalid' : inv.status === 'pending' && inv.expiresAt && inv.expiresAt < nowIso ? 'expired' : inv.status);
export const STATUS_LABEL = { pending: 'Pending', accepted: 'Accepted', expired: 'Expired', revoked: 'Revoked', invalid: 'Not valid' };
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// month / day only, no year. Checked against a leap year so Feb 29 is allowed; Feb 30, Apr 31, month 13 are not.
export function monthDayOk(m, d) { m = Number(m); d = Number(d); if (!Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1) return false; return d <= new Date(Date.UTC(2000, m, 0)).getUTCDate(); }
export function cleanMonthDay(month, day) {
  const m = s(month, 2); const d = s(day, 2); if (!m && !d) return { birthMonth: null, birthDay: null };
  if (!m || !d) throw new Error('Date of birth: pick both the month and the day (or leave both blank).');
  if (!monthDayOk(m, d)) throw new Error('Date of birth must be a real month and day (no year needed).');
  return { birthMonth: Number(m), birthDay: Number(d) };
}
export const monthDayText = (m, d) => (m && d ? `${MONTHS[m - 1]} ${d}` : '');
// the existing optional agent birthdate (migration 38, YYYY-MM-DD) is reused: its month / day prefill the new month / day fields
export const monthDayFromBirthdate = (iso) => { const x = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(iso || '')); return x ? { birthMonth: Number(x[1]), birthDay: Number(x[2]) } : { birthMonth: null, birthDay: null }; };
export function cleanPhoto(dataUrl) {
  if (dataUrl == null || dataUrl === '') return null;
  const v = String(dataUrl); const t = /^data:(image\/(?:png|jpeg|webp|gif));base64,[A-Za-z0-9+/=]+$/.exec(v) || /^data:(image\/svg\+xml);base64,[A-Za-z0-9+/=]+$/.exec(v);
  if (!t) throw new Error('Profile picture must be an image (PNG, JPG, WEBP or GIF).');
  if (t[1] === 'image/svg+xml' && !/^data:image\/svg\+xml;base64,/.test(v)) throw new Error('Profile picture must be an image.');
  if (Math.floor((v.length - v.indexOf(',') - 1) * 3 / 4) > PHOTO_STORED_MAX) throw new Error('Profile picture is too large after cropping (max 400 KB).');
  return v;
}
// what the agent fills in. Required: first name, last name, email, cell phone. Everything else optional.
export function cleanAgentProfile(f, { partial = false } = {}) {
  const out = {}; const req = (k, label, n) => { const v = s(f[k], n); if (!v) throw new Error(label + ' is required.'); return v; };
  const has = (k) => !partial || Object.prototype.hasOwnProperty.call(f, k);
  if (has('firstName')) out.firstName = req('firstName', 'First name', 80);
  if (has('lastName')) out.lastName = req('lastName', 'Last name', 80);
  if (has('email')) { out.email = req('email', 'Email', 160).toLowerCase(); if (!emailRe.test(out.email)) throw new Error('Email must be a valid email address.'); }
  if (has('cellPhone')) { const c = req('cellPhone', 'Cell phone', 30); if (!phoneOk(c)) throw new Error('Cell phone ' + PHONE_MSG + '.'); out.cellPhone = fmtPhone(c); }
  if (has('officePhone')) { const o = s(f.officePhone, 30); if (o && !phoneOk(o)) throw new Error('Office phone ' + PHONE_MSG + '.'); out.officePhone = o ? fmtPhone(o) : ''; }
  if (has('birthMonth') || has('birthDay')) Object.assign(out, cleanMonthDay(f.birthMonth, f.birthDay));
  for (const [k, n] of [['brokerage', 120], ['licenseNumber', 40], ['street', 120], ['city', 60], ['state', 2], ['zip', 10], ['otherContact', 200]]) if (has(k)) out[k] = s(f[k], n);
  if (out.state) { out.state = out.state.toUpperCase(); if (!/^[A-Z]{2}$/.test(out.state)) throw new Error('State must be 2 letters.'); }
  if (out.zip && !/^\d{5}(-\d{4})?$/.test(out.zip)) throw new Error('ZIP must be 5 digits (or ZIP+4).');
  if (has('photo')) out.photo = cleanPhoto(f.photo);
  if (has('photoShape')) out.photoShape = PHOTO_SHAPES.includes(f.photoShape) ? f.photoShape : 'circle';
  return out;
}
export const initialsOf = (first, last) => ((String(first || '').trim()[0] || '') + (String(last || '').trim()[0] || '')).toUpperCase() || '?';
// a generated placeholder avatar (initials on baby blue) for FAKE demo agents: an SVG data URL, never a real person
export function initialsAvatar(first, last, bg = '#89cff0', fg = '#0b2a45') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="${bg}"/><circle cx="80" cy="62" r="30" fill="#ffffff" opacity=".55"/><rect x="30" y="102" width="100" height="70" rx="50" fill="#ffffff" opacity=".55"/><text x="80" y="92" font-family="Arial,Helvetica,sans-serif" font-size="44" font-weight="700" text-anchor="middle" fill="${fg}">${initialsOf(first, last)}</text></svg>`;
  const b64 = typeof btoa === 'function' ? btoa(svg) : Buffer.from(svg).toString('base64');
  return 'data:image/svg+xml;base64,' + b64;
}
// THE CARD A CLIENT SEES: only these fields ever leave the adapter (no birthday, no license, no address, no staff notes, nothing about the file's money)
export const CARD_FIELDS = ['agentId', 'firstName', 'lastName', 'brokerage', 'cellPhone', 'email', 'officePhone', 'photo', 'photoShape', 'side', 'dealIds'];
export const cardOf = (x) => Object.fromEntries(CARD_FIELDS.map((k) => [k, x[k] == null ? (k === 'dealIds' ? [] : '') : x[k]]));
export const telHref = (p) => 'tel:+1' + String(p || '').replace(/\D/g, '').slice(-10);
