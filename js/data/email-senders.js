/* Typed senders for the queued-only outbox (John, Nov 5). The portal never sends mail. */
import { isSuperAdmin } from './constants.js?v=202611052140';

export const EMAIL_SENDER_DEFAULTS = Object.freeze({
  hr: { email: 'hr@clatitle.com', displayName: 'CLA Title HR' },
  portal: { email: 'portal@clatitle.com', displayName: 'CLA Title Portal' },
});
export const SENDER_TYPES = Object.freeze(['hr', 'portal', 'processor', 'other']);
export function ensureEmailSenders(d) {
  if (!d.emailSenderSettings) d.emailSenderSettings = {};
  for (const type of ['hr', 'portal']) {
    const old = d.emailSenderSettings[type] || {};
    d.emailSenderSettings[type] = { ...EMAIL_SENDER_DEFAULTS[type], ...old };
  }
  if (!Array.isArray(d.emailSenderLog)) d.emailSenderLog = [];
  return d;
}
export function emailFrom(sender) { return `${sender.displayName} <${sender.email}>`; }
export function senderFor(d, type, dealId = null) {
  ensureEmailSenders(d);
  if (type === 'hr' || type === 'portal') return { fromEmail: d.emailSenderSettings[type].email, fromName: d.emailSenderSettings[type].displayName, ...d.emailSenderSettings[type], senderType: type, from: emailFrom(d.emailSenderSettings[type]), senderFallback: false };
  if (type === 'processor') {
    const deal = (d.deals || []).find((z) => z.id === dealId);
    const p = deal && deal.processorId && (d.profiles || []).find((z) => z.id === deal.processorId && z.email);
    if (p) return { fromEmail: p.email, fromName: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email, email: p.email, displayName: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email, senderType: 'processor', senderProfileId: p.id, from: emailFrom({ email: p.email, displayName: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email }), senderFallback: false };
    const s = d.emailSenderSettings.portal;
    return { fromEmail: s.email, fromName: s.displayName, ...s, senderType: 'portal', requestedSenderType: 'processor', from: emailFrom(s), senderFallback: true, senderFallbackReason: 'No processor is assigned to this file.' };
  }
  const s = d.emailSenderSettings.portal;
  return { fromEmail: s.email, fromName: s.displayName, ...s, senderType: 'other', from: emailFrom(s), senderFallback: false };
}
export function emailSendersPart({ load, save, needUser, fail, now, clone, nid }) {
  return {
    async listEmailSenderSettings() {
      const u = needUser(); if (!isSuperAdmin(u)) fail('Only a Super admin can see email sender settings.');
      return clone(ensureEmailSenders(load()).emailSenderSettings);
    },
    async updateEmailSenderSettings(input) {
      const u = needUser(); if (!isSuperAdmin(u)) fail('Only a Super admin can change email sender settings.');
      const d = ensureEmailSenders(load());
      for (const type of ['hr', 'portal']) {
        const v = input && input[type]; if (!v) continue;
        const email = String(v.email || '').trim(); const displayName = String(v.displayName || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`Enter a valid ${type.toUpperCase()} sender email.`);
        if (!displayName || displayName.length > 100) fail(`Enter a ${type.toUpperCase()} display name (100 characters or fewer).`);
        const old = { ...d.emailSenderSettings[type] };
        d.emailSenderSettings[type] = { email, displayName, updatedAt: now(), updatedBy: u.id };
        d.emailSenderLog.push({ id: nid('eslog'), senderType: type, old, new: { email, displayName }, at: now(), by: u.id });
      }
      save(); return clone(d.emailSenderSettings);
    },
  };
}
