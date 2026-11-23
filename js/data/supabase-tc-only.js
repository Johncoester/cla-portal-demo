// TC-ONLY-2: read and set "Only communicate with TC" through the TC-ONLY-1 functions (public.tc_only_status, public.set_participant_tc_only).
// Both refuse anyone who is not CLA staff on the file, so the page only asks for staff.
export function tcOnlySupabase({ sb, ok }) {
  return {
    async tcOnlyStatus(dealId) {
      return (ok(await sb.rpc('tc_only_status', { p_deal: dealId })) || []).map((r) => ({ participantId: r.participant_id, role: r.role, tcOnly: !!r.tc_only,
        tcs: (Array.isArray(r.tcs) ? r.tcs : []).map((t) => ({ name: String(t.name || '').trim(), email: String(t.email || '').toLowerCase(), hasLogin: !!t.hasLogin })) }));
    },
    async setParticipantTcOnly(participantId, on) {
      const r = ok(await sb.rpc('set_participant_tc_only', { p_participant: participantId, p_on: !!on })) || {};
      return { participantId: r.participantId || participantId, tcOnly: !!r.tcOnly, tcs: Array.isArray(r.tcs) ? r.tcs : [] };
    },
  };
}
