/* [SUPABASE] Where each buyer / seller will be at closing (migration 58). Same names / shapes as mock-part-closing-location.js. NOT run against a
 * hosted project (best effort; the mock adapter and the SQL tests are the tested parts).
 *  - public.closing_locations(deal): the rows this user may see (signing_method only for CLA staff)
 *  - public.answer_closing_location(participant, in_state, state, country) / public.set_signing_method(participant, method): RLS + trigger decide. */
import { cleanLocationAnswer, locationFlag, whereText, signingLabel } from './closing-location.js?v=202611060013';
export function closingLocationSupabase({ sb, ok }) {
  const list = async (dealId) => (ok(await sb.rpc('closing_locations', { p_deal: dealId })) || []).map((r) => {
    const v = { participantId: r.participant_id, dealId, partyRole: r.party_role, name: r.name || '', propertyState: r.property_state, inStateAtClosing: r.in_state_at_closing,
      closingLocationState: r.closing_location_state || null, closingLocationCountry: r.closing_location_country || null, answeredAt: r.answered_at, updatedAt: r.updated_at, mine: !!r.mine };
    v.whereText = whereText(v, v.propertyState);
    if (r.signing_method != null) { v.signingMethod = r.signing_method; v.signingLabel = signingLabel(r.signing_method); v.flag = locationFlag(v); }
    return v; });
  const answer = async (dealId, pid, input) => { const rows = await list(dealId); const r = rows.find((z) => z.participantId === pid); if (!r) throw new Error('That buyer / seller is not on this order.');
    const v = cleanLocationAnswer(input, r.propertyState);
    ok(await sb.rpc('answer_closing_location', { p_participant: pid, p_in_state: v.inStateAtClosing, p_state: v.closingLocationState, p_country: v.closingLocationCountry }));
    return (await list(dealId)).find((z) => z.participantId === pid); };
  return {
    // an outside user reads only their own rows and (as the agent) their side's clients, and may answer both; staff rows carry signingMethod
    async listClosingLocations(dealId) { return (await list(dealId)).map((v) => ({ ...v, forClient: !v.mine && v.signingMethod === undefined, canAnswer: true })); },
    async closingLocationPrompt(dealId) { return (ok(await sb.rpc('closing_location_prompt', { p_deal: dealId })) || []).map((r) => ({ participantId: r.participant_id, partyRole: r.party_role, propertyState: r.property_state, inStateAtClosing: null })); },
    async remindClosingLocations(dealId = null) { return ok(await sb.rpc('remind_closing_locations', { p_deal: dealId })); },
    answerClosingLocation: answer, setClosingLocation: answer,
    async setSigningMethod(dealId, pid, method) { ok(await sb.rpc('set_signing_method', { p_participant: pid, p_method: method })); return (await list(dealId)).find((z) => z.participantId === pid); },
    async closingLocationFlags(dealId) { return (await list(dealId)).filter((v) => v.flag).map((v) => ({ participantId: v.participantId, ...v.flag, signingMethod: v.signingMethod, signingLabel: v.signingLabel })); },
  };
}
