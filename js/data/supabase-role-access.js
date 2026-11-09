/* [SUPABASE] ROLE ACCESS (John, Nov 9; migration 20261110010000_role_module_access). Same names / shapes as mock-part-role-access.js.
 * public.role_module_access is readable by CLA staff (one small query, cached for the page load: the nav, workspace cards and canUseCrm /
 * acctCanRead read it). Only public.set_role_access() changes it: active Super admin, never in View as, never Admin / Super admin rows,
 * only eligible (role, module) pairs; every change goes to public.role_module_access_log. The database enforces the same rows on the CRM
 * and Accounting data (private.role_can). Nothing is ever deleted. If the table cannot be read (not migrated yet), the seed applies. */
import { ROLE_ACCESS_ROLES, ROLE_ACCESS_MODULES, ELIGIBLE, setRoleAccess, canManageRoleAccess, checkRoleAccessChange, seedRows } from './role-access.js?v=202611100100';

const fromRow = (r) => ({ role: r.role, module: r.module, allowed: r.allowed === true, updatedAt: r.updated_at || null, updatedBy: r.updated_by || null });
export function roleAccessSupabase({ sb, ok, me }) {
  let cached = null;   // the rows, once a staff read returned them (an empty read is not cached: signed out / outside user / not migrated)
  const rows = async () => { const { data, error } = await sb.from('role_module_access').select('role,module,allowed,updated_at,updated_by'); if (error) throw error; return (data || []).map(fromRow); };
  const load = async (force = false) => {
    if (cached && !force) return cached;
    let list = []; try { list = await rows(); } catch (e) { list = []; }
    if (list.length) cached = list; setRoleAccess(list); return list;
  };
  const superAdmin = async () => { const u = await me(); if (!canManageRoleAccess(u)) throw new Error('Only a Super admin can see or change Role access.'); return u; };
  return {
    loadRoleAccess: load,
    async listRoleAccess() {
      await superAdmin(); const list = await load(true);
      const log = ok(await sb.from('role_module_access_log').select('id,role,module,old_allowed,new_allowed,changed_by,changed_by_name,changed_at').order('changed_at', { ascending: false }).limit(200)) || [];
      const names = {}; for (const l of log.slice().reverse()) names[`${l.role}|${l.module}`] = l.changed_by_name || '';
      const have = list.length ? list : seedRows();
      return { roles: ROLE_ACCESS_ROLES.slice(), modules: ROLE_ACCESS_MODULES.map((m) => ({ ...m, eligible: ELIGIBLE[m.id].slice() })), migrated: list.length > 0,
        rows: have.map((r) => ({ ...r, updatedByName: names[`${r.role}|${r.module}`] || '' })),
        log: log.map((l) => ({ id: l.id, role: l.role, module: l.module, label: (ROLE_ACCESS_MODULES.find((m) => m.id === l.module) || {}).label || l.module, old: l.old_allowed, new: l.new_allowed, at: l.changed_at, byId: l.changed_by, byName: l.changed_by_name || '' })) };
    },
    async setRoleAccess(role, module, allowed) {
      await superAdmin(); checkRoleAccessChange(role, module, allowed);
      const r = ok(await sb.rpc('set_role_access', { p_role: role, p_module: module, p_allowed: allowed }));
      await load(true); return fromRow(Array.isArray(r) ? r[0] || {} : r || {});
    },
  };
}
