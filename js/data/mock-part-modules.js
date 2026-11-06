/* mock adapter: MODULE SWITCHES (John, Nov 3; mirrored by migration 35 + supabase-modules.js). FAKE DATA ONLY; nothing is sent.
 * d.moduleSettings = one row per module { module, live, updatedAt, updatedBy }; d.moduleLog = every change { module, label, old, new, at, byId, byName }.
 * Both are added on first use (ensureModules) to v26 data without a storage-key bump: nothing existing changes, nothing is removed.
 * Only Admin / Super admin read the full list + log and flip a switch. Rows and log entries are never deleted. */
import { MODULES, ALWAYS_ON, BETA_LABEL, moduleById, moduleAvailable, defaultModuleSettings, canManageModules, canSwitchModule, accessMap, portalSurface } from './modules.js?v=202611061842';

export function ensureModules(d) {
  if (!Array.isArray(d.moduleSettings)) d.moduleSettings = [];
  for (const s of defaultModuleSettings()) if (!d.moduleSettings.some((x) => x.module === s.module)) d.moduleSettings.push(s);
  if (!Array.isArray(d.moduleLog)) d.moduleLog = [];
  return d;
}

export function modulesPart(x, flags) {
  const { load, save, nid, needUser, fail, now, nameOf, clone } = x;
  const db = () => ensureModules(load());
  const admin = () => { const u = needUser(); if (!canManageModules(u)) fail('Only an Admin or Super admin can see or change modules.'); return u; };
  return {
    // every signed-in user: which modules they get ('live' | 'beta' | 'off'); drives the nav and the page guards
    async getModuleAccess() { const u = needUser(); const set = db().moduleSettings; const map = accessMap(u, flags, set); for (const id of Object.keys(map)) map[id] = portalSurface(id, map[id], set); return map; },
    async listModules() {
      const u = admin(); const d = db(); const acc = accessMap(u, flags, d.moduleSettings);
      return { betaLabel: BETA_LABEL, alwaysOn: ALWAYS_ON.slice(),
        modules: MODULES.map((m) => { const s = d.moduleSettings.find((z) => z.module === m.id) || {};
          return { ...m, available: moduleAvailable(m, flags), live: m.portalDefault === false && !s.updatedBy ? false : s.live !== false, access: acc[m.id], canSwitch: canSwitchModule(u, m), updatedAt: s.updatedAt || null, updatedByName: s.updatedBy ? nameOf(s.updatedBy) : '' }; }),
        log: clone(d.moduleLog).sort((a, b) => String(b.at).localeCompare(String(a.at)) || (Number(String(b.id).split('-').pop()) - Number(String(a.id).split('-').pop()))) };
    },
    async setModuleLive(id, live) {
      const u = admin(); const m = moduleById(id) || fail('Unknown module.');
      if (typeof live !== 'boolean') fail('Live must be on or off.');
      if (!moduleAvailable(m, flags)) fail(`${m.label} is turned off in this portal's config, so it cannot be switched here.`);
      if (!canSwitchModule(u, m)) fail(`Only a Super admin can switch ${m.label}.`);
      const d = db(); const s = d.moduleSettings.find((z) => z.module === id);
      if (s.live === live && !(m.portalDefault === false && live && !s.updatedBy)) return clone(s);
      const old = s.live; s.live = live; s.updatedAt = now(); s.updatedBy = u.id;
      d.moduleLog.push({ id: nid('mlog'), module: id, label: m.label, old, new: live, at: now(), byId: u.id, byName: nameOf(u.id) });
      save(); return clone(s);
    },
  };
}
