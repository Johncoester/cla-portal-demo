/* TC-2 mock store. Links live on the agent contact. A coordinator can be linked to many agents.
 * Staff who run orders, and the agent on their own contact, can add and remove. Fake data only. */
import {
  TC_NOT_AGENT, TC_NOT_ALLOWED, TC_SELF, TC_NOT_FOUND, TC_EMAIL_TAKEN,
  alreadyLinkedMessage, isRealEstateAgent, staffLoginProblem, newCoordinatorProblem, personName, formatCoordinatorPhone,
  sameContactOrEmail, normEmail,
} from './agent-tc-links.js?v=202611248300';

export function agentTcLinksPart(x) {
  const { load, save, nid, needUser, fail, prof, contactOf, now, clone, str, emailOk, C } = x;
  const runsOrders = (u) => C.runsOrders(u);
  const linksOf = (d) => { if (!Array.isArray(d.agentTcLinks)) d.agentTcLinks = []; return d.agentTcLinks; };
  const contactById = (id) => load().contacts.find((c) => c.id === id);
  const rolesOf = (id) => load().participants.filter((p) => p.contactId === id).map((p) => p.role);
  const rowOf = (link) => {
    const c = contactById(link.tcContactId) || {};
    return { id: link.id, agentContactId: link.agentContactId, contactId: link.tcContactId, firstName: c.firstName || '', lastName: c.lastName || '',
      email: c.email || '', phone: c.phone || '', company: c.company || '', profileId: c.profileId || null, createdAt: link.createdAt };
  };
  const canSee = (u, contact) => {
    if (!contact) return false;
    if (runsOrders(u) || u.isAdmin) return true;
    if (contactOf(u.id) && contactOf(u.id).id === contact.id) return true;
    const mine = new Set(x.dealsFor(u).map((d) => d.id));
    return load().participants.some((p) => p.contactId === contact.id && mine.has(p.dealId));
  };
  const canEdit = (u, agent) => {
    if (!canSee(u, agent)) return false;
    if (C.viewOnly(u)) return false;
    if (runsOrders(u)) return true;
    const mine = contactOf(u.id);
    return !!(mine && mine.id === agent.id && C.isOutside(u.role));
  };
  function needAgent(u, agentContactId, write) {
    const agent = contactById(agentContactId) || fail(TC_NOT_FOUND);
    if (!isRealEstateAgent(agent, rolesOf(agent.id))) fail(TC_NOT_AGENT);
    if (!canSee(u, agent)) fail(TC_NOT_FOUND);
    if (write && !canEdit(u, agent)) fail(TC_NOT_ALLOWED);
    return agent;
  }
  function assertTc(agent, tc) {
    if (!tc) fail(TC_NOT_FOUND);
    if (sameContactOrEmail(agent, tc)) fail(TC_SELF);
    const login = tc.profileId && prof(tc.profileId);
    const staff = staffLoginProblem(tc, login);
    if (staff) fail(staff);
    const d = load();
    if (linksOf(d).some((l) => l.agentContactId === agent.id && l.tcContactId === tc.id)) fail(alreadyLinkedMessage(tc));
  }
  return {
    async listAgentTcs(agentContactId) {
      const u = needUser();
      const agent = needAgent(u, agentContactId, false);
      return clone(linksOf(load()).filter((l) => l.agentContactId === agent.id).map(rowOf).sort((a, b) => personName(a).localeCompare(personName(b))));
    },
    async linkAgentTc(agentContactId, tcContactId) {
      const u = needUser();
      const agent = needAgent(u, agentContactId, true);
      const tc = contactById(tcContactId);
      if (!tc || !canSee(u, tc)) fail(TC_NOT_FOUND);
      assertTc(agent, tc);
      const d = load();
      const link = { id: nid('atc'), agentContactId: agent.id, tcContactId: tc.id, createdBy: u.id, createdAt: now() };
      linksOf(d).push(link);
      if (x.placeAgentTcs) x.placeAgentTcs(d, agent.id, null, u.id);
      save();
      return clone(rowOf(link));
    },
    async createAndLinkAgentTc(agentContactId, input = {}) {
      const u = needUser();
      const agent = needAgent(u, agentContactId, true);
      const problem = newCoordinatorProblem(input);
      if (problem) fail(problem);
      const email = str(input.email, 200).toLowerCase();
      const d = load();
      if (email && normEmail(agent.email) === email) fail(TC_SELF);
      if (email && (d.contacts.some((c) => c.email === email) || d.profiles.some((p) => p.email === email && p.status !== 'removed'))) fail(TC_EMAIL_TAKEN);
      if (email && !emailOk(email)) fail('Enter a valid email for this coordinator.');
      const tc = { id: nid('c'), profileId: null, contactType: null, firstName: str(input.firstName, 80), lastName: str(input.lastName, 80),
        email, phone: formatCoordinatorPhone(input.phone), company: str(input.company, 120), createdBy: u.id, createdAt: now() };
      if (tc.phone && tc.phone === String(input.phone || '').trim() && String(input.phone || '').trim()) {
        /* formatCoordinatorPhone leaves a bad value unchanged; newCoordinatorProblem already refused it. */
      }
      d.contacts.push(tc);
      const link = { id: nid('atc'), agentContactId: agent.id, tcContactId: tc.id, createdBy: u.id, createdAt: now() };
      linksOf(d).push(link);
      if (x.placeAgentTcs) x.placeAgentTcs(d, agent.id, null, u.id);
      save();
      return clone(rowOf(link));
    },
    async unlinkAgentTc(agentContactId, tcContactId) {
      const u = needUser();
      const agent = needAgent(u, agentContactId, true);
      const d = load();
      const links = linksOf(d);
      const i = links.findIndex((l) => l.agentContactId === agent.id && l.tcContactId === tcContactId);
      if (i < 0) fail('That transaction coordinator is not linked to this agent.');
      links.splice(i, 1);
      save();
      return true;
    },
  };
}
