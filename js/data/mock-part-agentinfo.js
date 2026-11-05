// AGENT BIRTHDATE, mock adapter: kept apart from profiles / contacts (d.agentBirthdates) so no order, contact or CRM view can leak it.
import { canSeeBirthdate, canSetBirthdate, cleanBirthdate } from './agent-info.js?v=202611041931';
export function agentInfoPart({ load, save, needUser, fail, prof, log }) {
  const db = () => { const d = load(); if (!d.agentBirthdates || typeof d.agentBirthdates !== 'object') d.agentBirthdates = {}; return d; };
  return {
    async getAgentBirthdate(userId) { const u = needUser(); const id = String(userId || u.id); if (!canSeeBirthdate(u, id)) fail('Only the agent and CLA staff can see a birthdate.'); return db().agentBirthdates[id] || null; },
    async setAgentBirthdate(userId, value) { const u = needUser(); const id = String(userId || u.id); if (!canSetBirthdate(u, id)) fail('Only the agent or an Admin can change a birthdate.');
      const p = prof(id) || fail('User not found.'); if (p.role !== 'Outside user') fail('A birthdate is only kept for agents (outside users).');
      let v; try { v = cleanBirthdate(value); } catch (e) { fail(e.message); } const d = db(); if (v) d.agentBirthdates[id] = v; else delete d.agentBirthdates[id]; save(); return v; },
  };
}
