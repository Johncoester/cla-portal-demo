/* [SUPABASE] John's Nov 3 call items (migration 38). Same names / shapes as mock-part-underwriter.js / mock-part-agentinfo.js. NOT run against a
 * hosted project (best effort; the mock adapter is the tested one).
 *  - public.underwriter_splits: CLA staff who work Accounting read; only public.set_underwriter_split() (active Admin / Super admin) writes; every
 *    change in public.underwriter_split_log; nothing deleted.
 *  - public.agent_private (birthdate): the agent and CLA staff read; the agent or an Admin writes through public.set_agent_birthdate(). */
import { SPLIT_ADMIN_ONLY, canManageSplits, canReadSplits, cleanState, cleanPct } from './underwriter.js?v=202611042116';
import { canSeeBirthdate, canSetBirthdate, cleanBirthdate } from './agent-info.js?v=202611042116';
const fromRow = (r) => ({ state: r.state, pct: r.underwriter_pct == null ? null : Number(r.underwriter_pct), underwriter: r.underwriter, updatedAt: r.updated_at, updatedBy: r.updated_by, updatedByName: r.updated_by_name || '' });
export function callItemsSupabase({ sb, ok, me }) {
  return {
    async listUnderwriterSplits() { const u = await me(); if (!canReadSplits(u)) throw new Error('Underwriter splits are for CLA staff who work the Accounting tab.');
      const rows = (ok(await sb.from('underwriter_splits').select('state,underwriter_pct,underwriter,updated_at,updated_by,updated_by_name').order('state')) || []).map(fromRow);
      const log = canManageSplits(u) ? ok(await sb.from('underwriter_split_log').select('*').order('changed_at', { ascending: false })) || [] : [];
      return { rows, canEdit: canManageSplits(u), log: log.map((l) => ({ id: l.id, state: l.state, added: l.added, oldPct: l.old_pct == null ? null : Number(l.old_pct), newPct: l.new_pct == null ? null : Number(l.new_pct),
        oldUnderwriter: l.old_underwriter, newUnderwriter: l.new_underwriter, at: l.changed_at, byId: l.changed_by, byName: l.changed_by_name })) }; },
    async setUnderwriterSplit(state, pct, underwriter) { const u = await me(); if (!canManageSplits(u)) throw new Error(SPLIT_ADMIN_ONLY);
      return fromRow(ok(await sb.rpc('set_underwriter_split', { p_state: cleanState(state), p_pct: cleanPct(pct), p_underwriter: underwriter === undefined ? null : String(underwriter || '') }))); },
    async getAgentBirthdate(userId) { const u = await me(); const id = String(userId || u.id); if (!canSeeBirthdate(u, id)) throw new Error('Only the agent and CLA staff can see a birthdate.');
      const r = ok(await sb.from('agent_private').select('birthdate').eq('profile_id', id).maybeSingle()); return r ? r.birthdate : null; },
    async setAgentBirthdate(userId, value) { const u = await me(); const id = String(userId || u.id); if (!canSetBirthdate(u, id)) throw new Error('Only the agent or an Admin can change a birthdate.');
      const v = cleanBirthdate(value); ok(await sb.rpc('set_agent_birthdate', { p_profile: id, p_birthdate: v })); return v; },
  };
}
