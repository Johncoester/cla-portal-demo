// UNDERWRITER SPLITS, mock adapter (mirrors public.underwriter_splits / _log, migration 38). Rows added lazily (storage stays v26).
import { DEFAULT_SPLITS, DEFAULT_UNDERWRITER, SPLIT_ADMIN_ONLY, canManageSplits, canReadSplits, cleanState, cleanPct } from './underwriter.js?v=202611041802';
export function ensureUnderwriter(d) {
  if (!Array.isArray(d.underwriterSplits)) d.underwriterSplits = DEFAULT_SPLITS.map((r) => ({ ...r, updatedAt: null, updatedBy: null }));
  if (!Array.isArray(d.underwriterSplitLog)) d.underwriterSplitLog = [];
  return d;
}
export function underwriterPart({ load, save, needUser, nid, now, fail, nameOf }) {
  const db = () => ensureUnderwriter(load());
  const admin = () => { const u = needUser(); if (!canManageSplits(u)) fail(SPLIT_ADMIN_ONLY); return u; };
  const view = (r) => ({ ...r, updatedByName: r.updatedBy ? nameOf(r.updatedBy) : '' });
  const sorted = (d) => [...d.underwriterSplits].sort((a, b) => a.state.localeCompare(b.state));
  return {
    async listUnderwriterSplits() { const u = needUser(); if (!canReadSplits(u)) fail('Underwriter splits are for CLA staff who work the Accounting tab.'); const d = db();
      return { rows: sorted(d).map(view), canEdit: canManageSplits(u),
        log: canManageSplits(u) ? [...d.underwriterSplitLog].sort((a, b) => String(b.at).localeCompare(String(a.at)) || (Number(String(b.id).split('-').pop()) - Number(String(a.id).split('-').pop()))) : [] }; },
    async setUnderwriterSplit(state, pct, underwriter) { const u = admin(); const s = (() => { try { return cleanState(state); } catch (e) { return fail(e.message); } })();
      const p = (() => { try { return cleanPct(pct); } catch (e) { return fail(e.message); } })();
      const name = underwriter === undefined ? undefined : (String(underwriter || '').trim().slice(0, 120) || DEFAULT_UNDERWRITER);
      const d = db(); let r = d.underwriterSplits.find((x) => x.state === s); const added = !r;
      if (added) { r = { state: s, pct: null, underwriter: DEFAULT_UNDERWRITER, updatedAt: null, updatedBy: null }; d.underwriterSplits.push(r); }
      const oldPct = added ? null : r.pct, oldName = r.underwriter; const newName = name === undefined ? r.underwriter : name;
      if (!added && oldPct === p && oldName === newName) return view(r);
      r.pct = p; r.underwriter = newName; r.updatedAt = now(); r.updatedBy = u.id;
      d.underwriterSplitLog.push({ id: nid('uwlog'), state: s, added, oldPct, newPct: p, oldUnderwriter: added ? null : oldName, newUnderwriter: newName, at: r.updatedAt, byId: u.id, byName: nameOf(u.id) });
      save(); return view(r); },
  };
}
