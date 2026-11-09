/* mock adapter: ROLE ACCESS (John, Nov 9; mirrored by migration 20261110010000_role_module_access + supabase-role-access.js). FAKE DATA ONLY.
 * d.roleAccess = one row per eligible (role, module) { role, module, allowed, updatedAt, updatedBy }; d.roleAccessLog = every change.
 * Added on first use (ensureRoleAccess) from the seed, which is the portal's behaviour before this screen. Only an active Super admin changes it. */
import { ROLE_ACCESS_ROLES, ROLE_ACCESS_MODULES, ELIGIBLE, setRoleAccess, canManageRoleAccess, checkRoleAccessChange, seedRows } from './role-access.js?v=202611100100';

export function ensureRoleAccess(d) {
  if (!Array.isArray(d.roleAccess)) d.roleAccess = [];
  for (const s of seedRows()) if (!d.roleAccess.some((x) => x.role === s.role && x.module === s.module)) d.roleAccess.push(s);
  if (!Array.isArray(d.roleAccessLog)) d.roleAccessLog = [];
  return d;
}

export function roleAccessPart(x) {
  const { load, save, nid, needUser, fail, now, nameOf, clone } = x;
  const db = () => ensureRoleAccess(load());
  const superAdmin = () => { const u = needUser(); if (!canManageRoleAccess(u)) fail('Only a Super admin can see or change Role access.'); return u; };
  return {
    async loadRoleAccess() { const rows = clone(db().roleAccess); setRoleAccess(rows); return rows; },
    async listRoleAccess() {
      superAdmin(); const d = db(); setRoleAccess(d.roleAccess);
      return { roles: ROLE_ACCESS_ROLES.slice(), modules: ROLE_ACCESS_MODULES.map((m) => ({ ...m, eligible: ELIGIBLE[m.id].slice() })), migrated: true,
        rows: d.roleAccess.map((r) => ({ ...clone(r), updatedByName: r.updatedBy ? nameOf(r.updatedBy) : '' })),
        log: clone(d.roleAccessLog).sort((a, b) => String(b.at).localeCompare(String(a.at)) || (Number(String(b.id).split('-').pop()) - Number(String(a.id).split('-').pop()))) };
    },
    async setRoleAccess(role, module, allowed) {
      const u = superAdmin();
      try { checkRoleAccessChange(role, module, allowed); } catch (e) { fail(e.message); }
      const d = db(); const r = d.roleAccess.find((z) => z.role === role && z.module === module) || fail('That role cannot get that module.');
      if (r.allowed !== allowed) {
        const old = r.allowed; r.allowed = allowed; r.updatedAt = now(); r.updatedBy = u.id;
        d.roleAccessLog.push({ id: nid('ralog'), role, module, label: (ROLE_ACCESS_MODULES.find((m) => m.id === module) || {}).label || module, old, new: allowed, at: now(), byId: u.id, byName: nameOf(u.id) });
        save();
      }
      setRoleAccess(d.roleAccess); return clone(r);
    },
  };
}
