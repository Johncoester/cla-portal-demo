/* [SUPABASE] AGENT FEES (AF-2; John, Nov 12 2026). Same names and shapes as mock-part-agent-fees.js. Every read and write goes through the
 * database functions agent_fee_sides / agent_fees / agent_fee_history / save_agent_fees (migrations 20261117100000 and 20261117110000),
 * which decide what the viewer may see and change. Buyers and sellers get nothing. Nothing is sent. */
import { groupAgentFees, agentFeeError } from './agent-fees.js?v=202611171030';

const num = (x) => (x == null ? null : Number(x));
const feeOf = (r) => ({ side: r.side, kind: r.kind, slot: r.slot, basis: r.basis || null, percent: num(r.percent), amount: num(r.amount), payer: r.payer || null,
  description: r.description || '', paidTo: r.paid_to || '', source: r.source, confirmedRole: r.confirmed_role || null, confirmedByName: r.confirmed_by_name || '',
  confirmedAt: r.confirmed_at || null, updatedAt: r.updated_at || null, canEdit: !!r.can_edit });
const histOf = (r) => ({ side: r.side, kind: r.kind, slot: r.slot, oldValue: r.old_value || null, newValue: r.new_value || null, reason: r.reason || '', source: r.source,
  byName: r.changed_by_name || '', at: r.changed_at });

export function agentFeesSupabase({ sb }) {
  const call = async (fn, args) => { const r = await sb.rpc(fn, args); if (r.error) throw new Error(agentFeeError(r.error)); return r.data; };
  async function getAgentFees(dealId) {
    const [sides, rows] = await Promise.all([call('agent_fee_sides', { p_deal: dealId }), call('agent_fees', { p_deal: dealId })]);
    const access = {}; (sides || []).forEach((s) => { access[s.side] = s.access; });
    return { sides: access, fees: groupAgentFees((rows || []).map(feeOf)) };
  }
  return {
    /* { sides: { listing: 'edit'|'read', buyer: ... }, fees: groupAgentFees(rows) } for the sides this viewer may see */
    getAgentFees,
    async getAgentFeeHistory(dealId) { return ((await call('agent_fee_history', { p_deal: dealId })) || []).map(histOf); },
    async saveAgentFees(dealId, side, fees, reason = '') {
      const payload = { commission: fees.commission, admin: fees.admin, other: fees.other || [] };
      await call('save_agent_fees', { p_deal: dealId, p_side: side, p_fees: payload, p_reason: reason || null });
      return getAgentFees(dealId);
    },
  };
}
