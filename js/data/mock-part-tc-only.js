/* TC-ONLY-2 demo store: the same rules as public.tc_only_status / public.set_participant_tc_only (TC-ONLY-1). Fake data only.
 * The TCs for an agent are the Buyer Agent TC / Listing Agent TC on the same side of the same file who are linked to that agent. */
export function tcOnlyPart(x) {
  const { load, save, needUser, isManager, dealOr404, fail, log, clone } = x;
  const contact = (id) => load().contacts.find((c) => c.id === id) || {};
  const targets = (a) => {
    const role = a.role === 'Listing Agent' ? 'Listing Agent TC' : 'Buyer Agent TC';
    const links = load().agentTcLinks || [];
    const seen = new Set();
    return load().participants.filter((t) => t.dealId === a.dealId && t.role === role && !t.removed && links.some((l) => l.agentContactId === a.contactId && l.tcContactId === t.contactId))
      .filter((t) => (seen.has(t.contactId) ? false : seen.add(t.contactId)))
      .map((t) => { const c = contact(t.contactId); return { name: `${c.firstName || ''} ${c.lastName || ''}`.trim(), email: String(c.email || '').toLowerCase(), hasLogin: !!c.profileId }; })
      .sort((p, q) => p.name.localeCompare(q.name));
  };
  const allowed = (u, dealId) => { if (!(isManager(u) || u.isAdmin)) fail('Only CLA staff on this file can change who gets the agent\'s emails.'); dealOr404(u, dealId); };
  return {
    async tcOnlyStatus(dealId) {
      const u = needUser(); allowed(u, dealId);
      return clone(load().participants.filter((p) => p.dealId === dealId && (p.role === 'Buyer Agent' || p.role === 'Listing Agent') && !p.removed)
        .map((p) => ({ participantId: p.id, role: p.role, tcOnly: !!p.tcOnly, tcs: targets(p) })));
    },
    async setParticipantTcOnly(participantId, on) {
      const u = needUser();
      const a = load().participants.find((p) => p.id === participantId);
      if (!a || !(a.role === 'Buyer Agent' || a.role === 'Listing Agent')) fail('Pick the buyer\'s agent or listing agent on this file.');
      allowed(u, a.dealId);
      const side = a.role === 'Listing Agent' ? 'listing' : 'buyer';
      const tcs = targets(a);
      if (on && !tcs.length) fail(`This agent has no TC on the ${side} side of this file. Add their transaction coordinator on Contacts first, then tick Only communicate with TC.`);
      a.tcOnly = !!on;
      const c = contact(a.contactId); const name = `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'The agent';
      log(a.dealId, u.id, 'participant.tc_only', 'deal', a.dealId, on ? `${name} (${side} side): Only communicate with TC is on. Emails and alerts go to ${tcs.map((t) => t.name || t.email).join(', ')}.`
        : `${name} (${side} side): Only communicate with TC is off. The agent gets emails again.`);
      save();
      return { participantId: a.id, tcOnly: !!on, tcs: tcs.map((t) => t.name || t.email) };
    },
  };
}
