/* [SUPABASE] MODULE SWITCHES (John, Nov 3; migration 35). Same names / shapes as mock-part-modules.js. NOT run against a hosted project (best effort;
 * the mock adapter is the tested one). public.module_settings is readable by every signed-in user (the nav needs it); only
 * public.set_module_live() changes it, and that function refuses anyone but an active Admin / Super admin. Every change is written to
 * public.module_settings_log (Admins read it); nothing is ever deleted. The config flags (features.crm / features.accounting) still decide
 * whether a module exists at all. Beta gating of data is done in the app; the existing database switches (private.features) still apply. */
import { MODULES, ALWAYS_ON, BETA_LABEL, moduleById, moduleAvailable, canManageModules, canSwitchModule, accessMap } from './modules.js?v=202611061730';

const fromRow = (r) => ({ module: r.module, live: r.live !== false, updatedAt: r.updated_at, updatedBy: r.updated_by });
export function modulesSupabase({ sb, ok, me, flags }) {
  const settings = async () => (ok(await sb.from('module_settings').select('module,live,updated_at,updated_by')) || []).map(fromRow);
  const admin = async () => { const u = await me(); if (!canManageModules(u)) throw new Error('Only an Admin or Super admin can see or change modules.'); return u; };
  return {
    async getModuleAccess() { const u = await me(); if (!u) throw new Error('Please sign in.'); return accessMap(u, flags, await settings()); },
    async listModules() {
      const u = await admin(); const set = await settings(); const acc = accessMap(u, flags, set);
      const log = ok(await sb.from('module_settings_log').select('id,module,old_live,new_live,changed_by,changed_by_name,changed_at').order('changed_at', { ascending: false })) || [];
      return { betaLabel: BETA_LABEL, alwaysOn: ALWAYS_ON.slice(),
        modules: MODULES.map((m) => { const s = set.find((z) => z.module === m.id) || {}; return { ...m, available: moduleAvailable(m, flags), live: s.live !== false, access: acc[m.id], canSwitch: canSwitchModule(u, m), updatedAt: s.updatedAt || null, updatedByName: '' }; }),
        log: log.map((l) => ({ id: l.id, module: l.module, label: (moduleById(l.module) || {}).label || l.module, old: l.old_live, new: l.new_live, at: l.changed_at, byId: l.changed_by, byName: l.changed_by_name })) };
    },
    async setModuleLive(id, live) {
      const u = await admin(); const m = moduleById(id); if (!m) throw new Error('Unknown module.'); if (!canSwitchModule(u, m)) throw new Error(`Only a Super admin can switch ${m.label}.`); if (typeof live !== 'boolean') throw new Error('Live must be on or off.');
      if (!moduleAvailable(m, flags)) throw new Error(`${m.label} is turned off in this portal's config, so it cannot be switched here.`);
      return fromRow(ok(await sb.rpc('set_module_live', { p_module: id, p_live: live })));
    },
  };
}
