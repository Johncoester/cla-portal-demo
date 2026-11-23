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
      .map((t) => { const c = contact(t.contactId); const pr = c.profileId ? (load().profiles.find((q) => q.id === c.profileId && q.status !== 'disabled') || null) : null;
        return { name: `${c.firstName || ''} ${c.lastName || ''}`.trim(), email: String(String(c.email || '').trim() || (pr && pr.email) || '').toLowerCase(), hasLogin: !!pr }; })
      .sort((p, q) => p.name.localeCompare(q.name));
  };
  const allowed = (u, dealId) => { if (!(isManager(u) || u.isAdmin)) fail('Only CLA staff on this file can change who gets the agent\'s emails.'); dealOr404(u, dealId); };
  return {
    async tcOnlyStatus(dealId) {
      const u = needUser(); allowed(u, dealId);
      return clone(load().participants.filter((p) => p.dealId === dealId && (p.role === 'Buyer Agent' || p.role === 'Listing Agent') && !p.removed)
        .map((p) => ({ participantId: p.id, role: p.role, tcOnly: !!p.tcOnly, tcs: targets(p) })));
    },
    // TC-ONLY-2b: profileId -> portal-login email (staff only), so compose matches an agent by contact email or login email like the server
    async tcOnlyLoginEmails(profileIds) {
      needUser();
      const ids = new Set((profileIds || []).filter(Boolean));
      return Object.fromEntries(load().profiles.filter((q) => ids.has(q.id) && q.email).map((q) => [q.id, String(q.email).trim().toLowerCase()]));
    },
    async setParticipantTcOnly(participantId, on) {
      const u = needUser();
      const a = load().participants.find((p) => p.id === participantId);
      if (!a || !(a.role === 'Buyer Agent' || a.role === 'Listing Agent')) fail('Pick the buyer\'s agent or listing agent on this file.');
      allowed(u, a.dealId);
      const side = a.role === 'Listing Agent' ? 'listing' : 'buyer';
      const tcs = targets(a);
      // TC-ONLY-2c: like the server, a linked TC with no email can't stand in for the agent
      if (on && tcs.length && !tcs.some((t) => t.email)) fail(`This agent's TC on the ${side} side has no email address, so nothing could reach them. Add the TC's email on Contacts first, then tick Only communicate with TC.`);
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
