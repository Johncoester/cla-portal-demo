// JC-AGENT-EDIT-1 (John, Nov 25 2026, 1:57 PM ET): an Admin or Super admin edits a real estate agent's profile for them:
// first and last name, brokerage, cell phone, office phone and the profile picture (upload, replace or remove; optional).
// Email stays locked (changed by the sign-in provider). License, address and birthday stay the agent's own.
// Shared by the mock adapter, the Supabase adapter and the pages. Mirrored by private.rpc_admin_update_agent_profile
// (migration 20261131060000_admin_edit_agent_profile.sql), which makes the same checks in the database.
import { cleanAgentProfile } from './agent-profile.js?v=202611302000';
export const ADMIN_AGENT_FIELDS = ['firstName', 'lastName', 'brokerage', 'cellPhone', 'officePhone', 'photo', 'photoShape'];
// the same check as User List: the isAdmin flag (role Admin or Super admin always has it). Not a Processor, Sales Person, agent or client.
export const canEditAgentProfiles = (u) => !!u && !!u.isAdmin && (u.status || 'active') === 'active';
export const AGENT_EDIT_DENIED = 'Only an Admin or Super admin can edit an agent profile.';
export const AGENT_EDIT_NOT_FOUND = 'Agent not found. Only a real estate agent with an active portal login has an agent profile.';
// only the fields above; the picture gets the same checks as the agent's own save (type, 400 KB after cropping)
export function cleanAdminAgentPatch(patch = {}) {
  const p = {};
  for (const k of ADMIN_AGENT_FIELDS) if (Object.prototype.hasOwnProperty.call(patch || {}, k)) p[k] = patch[k];
  return cleanAgentProfile(p, { partial: true });
}
export const AGENT_FILE_ROLES = ['Buyer Agent', 'Listing Agent'];
export const agentProfileHref = (profileId) => '#/users/agent-profile/' + encodeURIComponent(String(profileId || ''));
