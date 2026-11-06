// Buyer / seller portal invites (John, Nov 6). A contact is not a login.
// Staff on the file create a one-time link and copy it. Nothing is emailed.
// The account role stays Outside user. Buyer / Seller is only the role on that file.
import { viewOnly } from './constants.js?v=202611061842';

export const CLIENT_PORTAL_ROLES = ['Client-Buyer', 'Client-Seller'];
export const CLIENT_INVITE_DAYS = 14;
export const CLIENT_INVITE_GENERIC = 'This invite link is not valid or has expired.';

export function canInviteClients(u, { demoView = false, locked = false } = {}) {
  if (!u || demoView || locked || u.isDemo) return false;
  if ((u.status || 'active') !== 'active') return false;
  if (u.role === 'Outside user' || u.accountRole) return false;
  if (viewOnly(u)) return false;
  if (u.role === 'Transaction Coordinator' || u.role === 'Employee') return false;
  return !!(u.isAdmin || u.role === 'Processor' || u.role === 'Preprocessor');
}

export function clientInviteStatus(inv, nowIso) {
  if (!inv || !inv.tokenHash) return inv && inv.acceptedAt ? 'accepted' : inv && inv.revokedAt ? 'revoked' : 'invalid';
  if (inv.acceptedAt) return 'accepted';
  if (inv.revokedAt) return 'revoked';
  if (Date.parse(inv.expiresAt) < Date.parse(nowIso)) return 'expired';
  return 'pending';
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newInviteToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
