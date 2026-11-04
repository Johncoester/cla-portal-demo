// UNDERWRITER SPLITS (John, Nov 3 call): per-state underwriter share of the title premium; CLA keeps the rest.
// MD 15% (Francis's Qualia video: 85% CLA / 15% Fidelity), FL 30%, SC 40%; VA and DC blank until an Admin sets them.
// Admin / Super admin only edit (every change logged, never deleted). Shown on the Accounting tab's title premium lines. FAKE data only.
import { acctCanRead } from './accounting.js?v=202611041755';
export const DEFAULT_UNDERWRITER = 'Fidelity National Title';
export const DEFAULT_SPLITS = [['MD', 15], ['FL', 30], ['SC', 40], ['VA', null], ['DC', null]].map(([state, pct]) => ({ state, pct, underwriter: DEFAULT_UNDERWRITER }));
export const UNSET_NOTE = 'Not set yet: an Admin sets it on the Underwriter splits page. Until then no split is shown for this state.';
export const SPLIT_ADMIN_ONLY = 'Only an Admin or Super admin can change underwriter splits.';
export const canManageSplits = (u) => !!(u && u.isAdmin && (u.status || 'active') === 'active');
// Caroline Kim, Nov 4 2026: TCs read the Accounting tab, but the CLA / underwriter premium split stays with the roles that had it (Processor,
// Sales, Admins), matching uw_reader() in migration 38. Open question for Caroline (docs/ACCOUNTING-CAROLINE-NOV4.md).
export const canReadSplits = (u) => !!(u && (u.isAdmin || (acctCanRead(u) && u.role !== 'Transaction Coordinator')));
export function cleanState(v) { const s = String(v == null ? '' : v).trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(s)) throw new Error('State must be a 2-letter code (e.g. SC).'); return s; }
export function cleanPct(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/[%\s]/g, '')); if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Underwriter % must be between 0 and 100 (or blank = not set).');
  return Math.round(n * 100) / 100;
}
const POLICY_RE = /\b(owner'?s|lender'?s|loan)\s+(title\s+)?(policy|insurance)\b|\btitle\s+(insurance\s+)?premium\b|\btitle\s+(insurance\s+)?policy\b/i;
// a title premium line: a CLA-rate owner's / lender's policy, or a hand-entered fee that reads like one (endorsements and CPLs are not premiums)
export function isTitlePremium(f) {
  if (!f || f.kind === 'credit') return false;
  if (f.calc && /^(ownersPolicy|lendersPolicy)$/.test(f.calc.key || '')) return true;
  return POLICY_RE.test(String(f.description || '')) && !/endorsement|\bCPL\b|closing protection/i.test(String(f.description || ''));
}
export function splitAmount(amount, pct) {
  if (pct === null || pct === undefined) return null; const a = Math.round(Number(amount || 0) * 100);
  const uw = Math.round(a * pct / 100); return { underwriter: uw / 100, cla: (a - uw) / 100, pct, claPct: Math.round((100 - pct) * 100) / 100 };
}
export const splitFor = (rows, state) => (rows || []).find((r) => r.state === String(state || '').toUpperCase()) || null;
