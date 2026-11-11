/* mock adapter: John + Janine feedback, Nov 4 2026 (CHANGES.md in /workspace/feedback-nov4). FAKE DATA ONLY. Behind the `crm` flag (CRM staff only).
 *  * CUSTOM VIEWS (Clients / Leads / Companies / Deals): name, criteria (AND / OR), columns, sort, sharing (Only me / Everyone / selected users);
 *    each person pins the views they want as tabs above the list. A view shows only rows the viewer may already see (rowsOf).
 *  * SAVED FILTERS: a person saves the current filter-bar values of a list (or of a view) under a name; chips show them with counts.
 *  * SEARCH RESULT COLUMNS: each person picks the columns of each module's table on the search results page.
 *  * DISBURSEMENT DETAILS on a deal (Admin / Super admin edit; logged).
 * Nothing is deleted: views and saved filters are RETIRED (hidden). Mirrored by migration 56. */
import { moduleFields, cleanCriteria, applyCriteria, display, SEARCH_COLUMNS, SEARCH_MODULES } from './crm-analytics.js?v=202611130900';
import { VIEW_MODULES, VIEW_DEFAULT_COLUMNS, PINS_MAX, nameOk, cleanColumns, cleanFilterValues, SEARCH_COL_MAX } from './crm-views.js?v=202611070139';
import { cleanDisbursement, DISBURSEMENT_KEYS } from './crm-disbursement.js?v=202611070139';
import { crmReadOnly } from './crm.js?v=202611130900';

export function feedbackNov4Part(x, h) {
  const { save, now, fail, str, nid, nameOf, prof, localDate, clone, C } = x;
  const { db: db0, cfgFor, crmUser, rowsOf } = h;
  const db = () => { const d = db0(); d.crmViews ||= []; d.crmViewPins ||= []; d.crmSavedFilters ||= []; d.crmSearchColumns ||= []; d.dealDisbursements ||= []; d.dealDisbursementLog ||= []; return d; };
  const modOk = (m) => { const s = str(m, 20); if (!VIEW_MODULES.includes(s)) fail('Pick Clients, Leads, Companies or Deals.'); return s; };
  const visible = (u, v) => !v.retiredAt && (v.ownerId === u.id || v.visibility === 'all' || (v.visibility === 'custom' && (v.shareUsers || []).includes(u.id)));
  const editable = (u, v) => !crmReadOnly(u) && (v.ownerId === u.id || (u.isAdmin && v.visibility !== 'me'));
  const viewOr404 = (u, id) => { const v = db().crmViews.find((z) => z.id === str(id, 60)); if (!v || !visible(u, v)) fail('That view does not exist.'); return v; };
  const pinsOf = (u, module) => db().crmViewPins.filter((p) => p.userId === u.id && db().crmViews.some((v) => v.id === p.viewId && v.module === module && visible(u, v))).sort((a, b) => a.position - b.position);
  function cleanView(u, input, module, cfg, old = null) {
    const fields = moduleFields(module, cfg);
    const vis = str(input.visibility ?? (old ? old.visibility : 'me'), 10); if (!['me', 'all', 'custom'].includes(vis)) fail('Pick who sees this view.');
    if (vis !== 'me' && crmReadOnly(u)) fail('The Processor has read-only access to the CRM: views you make are for you only.');
    const users = vis === 'custom' ? [...new Set((input.shareUsers ?? (old ? old.shareUsers : []) ?? []).map((z) => str(z, 60)))] : [];
    users.forEach((id) => { const p = prof(id); if (!p || p.status !== 'active' || C.isOutside(p.role)) fail('Share with active CLA users only.'); });
    if (vis === 'custom' && !users.filter((z) => z !== u.id).length) fail('Pick at least one user to share with.');
    const logic = str(input.logic ?? (old ? old.logic : 'and'), 3); if (!['and', 'or'].includes(logic)) fail('Match all (AND) or any (OR).');
    let criteria; try { criteria = cleanCriteria(input.criteria ?? (old ? old.criteria : []), fields); } catch (e) { fail(e.message); }
    let columns; try { columns = cleanColumns(module, input.columns ?? (old ? old.columns : VIEW_DEFAULT_COLUMNS[module]), fields); } catch (e) { fail(e.message); }
    const sortField = str(input.sortField ?? (old ? old.sortField : 'name'), 60) || 'name'; if (!fields.some((f) => f.key === sortField)) fail('Sort by a field of this module.');
    const sortDir = str(input.sortDir ?? (old ? old.sortDir : 'asc'), 4) === 'desc' ? 'desc' : 'asc';
    let name; try { name = nameOk(input.name ?? (old ? old.name : '')); } catch (e) { fail(e.message); }
    const dup = db().crmViews.find((z) => z.module === module && z.ownerId === (old ? old.ownerId : u.id) && !z.retiredAt && z.id !== (old || {}).id && z.name.toLowerCase() === name.toLowerCase());
    if (dup) fail(`You already have a ${module === 'contacts' ? 'Clients' : module} view called "${dup.name}".`);
    return { name, visibility: vis, shareUsers: users, logic, criteria, columns, sortField, sortDir };
  }
  const viewOut = (u, v) => ({ id: v.id, module: v.module, name: v.name, ownerId: v.ownerId, ownerName: nameOf(v.ownerId), visibility: v.visibility, shareUsers: [...(v.shareUsers || [])], logic: v.logic,
    criteria: clone(v.criteria), columns: [...v.columns], sortField: v.sortField, sortDir: v.sortDir, mine: v.ownerId === u.id, canEdit: editable(u, v), retired: !!v.retiredAt,
    pinned: db().crmViewPins.some((p) => p.userId === u.id && p.viewId === v.id), createdAt: v.createdAt, modifiedAt: v.modifiedAt });
  const cellOf = (f, r, cfg) => ({ text: display(f, r, cfg), link: f.link && !f.encrypted ? r[f.link] || '' : '' });

  const api = {
    // ---------- custom views ----------
    async listCrmViews(module) { const u = crmUser(); const m = modOk(module);
      const pins = pinsOf(u, m).map((p) => p.viewId);
      return db().crmViews.filter((v) => v.module === m && visible(u, v)).map((v) => ({ ...viewOut(u, v), pinPosition: pins.indexOf(v.id) })).sort((a, b) => a.name.localeCompare(b.name)); },
    async createCrmView(input = {}) { const u = crmUser(); const m = modOk(input.module); const cfg = cfgFor(u);
      const v = { id: nid('view'), module: m, ownerId: u.id, ...cleanView(u, input, m, cfg), createdAt: now(), modifiedAt: now(), retiredAt: null };
      db().crmViews.push(v); if (input.pin !== false) { const ps = pinsOf(u, m); if (ps.length < PINS_MAX) db().crmViewPins.push({ userId: u.id, viewId: v.id, position: ps.length, pinnedAt: now() }); }
      save(); return viewOut(u, v); },
    async updateCrmView(id, input = {}) { const u = crmUser(); const v = viewOr404(u, id); if (!editable(u, v)) fail('Only the person who made this view (or an Admin, for a shared view) can change it.');
      Object.assign(v, cleanView(u, input, v.module, cfgFor(u), v), { modifiedAt: now(), modifiedBy: u.id }); save(); return viewOut(u, v); },
    async cloneCrmView(id, { name } = {}) { const u = crmUser(); const v = viewOr404(u, id);
      return api.createCrmView({ module: v.module, name: name || `Copy of ${v.name}`, visibility: 'me', logic: v.logic, criteria: clone(v.criteria), columns: [...v.columns], sortField: v.sortField, sortDir: v.sortDir }); },
    async retireCrmView(id) { const u = crmUser(); const v = viewOr404(u, id); if (!editable(u, v)) fail('Only the person who made this view (or an Admin, for a shared view) can remove it.');
      v.retiredAt = now(); v.retiredBy = u.id; save(); return { ok: true }; },
    async pinCrmView(id, on = true) { const u = crmUser(); const v = viewOr404(u, id); const d = db();
      const has = d.crmViewPins.find((p) => p.userId === u.id && p.viewId === v.id);
      if (on && !has) { const ps = pinsOf(u, v.module); if (ps.length >= PINS_MAX) fail(`At most ${PINS_MAX} pinned views per list.`); d.crmViewPins.push({ userId: u.id, viewId: v.id, position: ps.length, pinnedAt: now() }); }
      if (!on && has) { d.crmViewPins.splice(d.crmViewPins.indexOf(has), 1); pinsOf(u, v.module).forEach((p, i) => { p.position = i; }); }   // a pin is a screen preference, not a record
      save(); return { pinned: !!on }; },
    // a view's rows: only records the viewer may see, the view's criteria, its columns (display text + link)
    async runCrmView(id) { const u = crmUser(); const v = viewOr404(u, id); const cfg = cfgFor(u); const fields = moduleFields(v.module, cfg);
      const rows = applyCriteria(rowsOf(u, v.module, cfg), v.criteria, fields, { logic: v.logic, today: localDate() });
      const cols = v.columns.map((k) => fields.find((f) => f.key === k)).filter(Boolean); const sf = fields.find((f) => f.key === v.sortField) || cols[0];
      const sortVal = (r) => { const x = r[sf.key]; return x == null ? '' : typeof x === 'number' ? x : String(display(sf, r, cfg)).toLowerCase(); };
      const sorted = rows.slice().sort((a, b) => { const A = sortVal(a), B = sortVal(b); const c = typeof A === 'number' && typeof B === 'number' ? A - B : String(A).localeCompare(String(B)); return v.sortDir === 'desc' ? -c : c; });
      return { view: viewOut(u, v), fields: fields.map((f) => ({ key: f.key, label: f.label, type: f.type, list: f.list || null, options: f.options || null })), columns: cols.map((f) => ({ key: f.key, label: f.label, type: f.type })),
        total: sorted.length, rows: sorted.map((r) => ({ id: r.id, link: r._link || '', cells: Object.fromEntries(cols.map((f) => [f.key, cellOf(f, r, cfg)])) })) }; },
    // ---------- saved filters (per person; a list key = module, or view:<id>) ----------
    async listCrmSavedFilters(listKey) { const u = crmUser(); const k = str(listKey, 80);
      return db().crmSavedFilters.filter((f) => f.userId === u.id && f.listKey === k && !f.retiredAt).map((f) => clone(f)).sort((a, b) => a.name.localeCompare(b.name)); },
    async saveCrmSavedFilter({ listKey, name, values } = {}) { const u = crmUser(); const k = str(listKey, 80);
      if (!(VIEW_MODULES.includes(k) || /^view:/.test(k))) fail('Save a filter on Clients, Leads, Companies, Deals or a custom view.'); if (/^view:/.test(k)) viewOr404(u, k.slice(5));
      let nm, vals; try { nm = nameOk(name); vals = cleanFilterValues(values); } catch (e) { fail(e.message); }
      if (db().crmSavedFilters.some((f) => f.userId === u.id && f.listKey === k && !f.retiredAt && f.name.toLowerCase() === nm.toLowerCase())) fail(`You already have a saved filter called "${nm}" here.`);
      const f = { id: nid('sf'), userId: u.id, listKey: k, name: nm, values: vals, createdAt: now(), retiredAt: null }; db().crmSavedFilters.push(f); save(); return clone(f); },
    async renameCrmSavedFilter(id, name) { const u = crmUser(); const f = db().crmSavedFilters.find((z) => z.id === str(id, 60) && z.userId === u.id && !z.retiredAt) || fail('Saved filter not found.');
      let nm; try { nm = nameOk(name); } catch (e) { fail(e.message); } if (db().crmSavedFilters.some((z) => z !== f && z.userId === u.id && z.listKey === f.listKey && !z.retiredAt && z.name.toLowerCase() === nm.toLowerCase())) fail(`You already have a saved filter called "${nm}" here.`);
      f.name = nm; f.modifiedAt = now(); save(); return clone(f); },
    async retireCrmSavedFilter(id) { const u = crmUser(); const f = db().crmSavedFilters.find((z) => z.id === str(id, 60) && z.userId === u.id && !z.retiredAt) || fail('Saved filter not found.');
      f.retiredAt = now(); save(); return { ok: true }; },
    // ---------- search result columns (per person, per module) ----------
    async getCrmSearchColumns() { const u = crmUser(); const cfg = cfgFor(u);
      return Object.fromEntries(SEARCH_MODULES.map((m) => { const mine = db().crmSearchColumns.filter((z) => z.userId === u.id && z.module === m).sort((a, b) => a.position - b.position).map((z) => z.columnKey);
        const fields = moduleFields(m, cfg); return [m, { custom: mine.length > 0, columns: mine.length ? mine.filter((k) => fields.some((f) => f.key === k)) : null, defaults: SEARCH_COLUMNS[m].map(([k, l]) => ({ key: k, label: l })),
          choices: fields.filter((f) => !f.encrypted).map((f) => ({ key: f.key, label: f.label })) }]; })); },
    async saveCrmSearchColumns(module, keys) { const u = crmUser(); const m = str(module, 20); if (!SEARCH_MODULES.includes(m)) fail('Unknown module.');
      const d = db(); d.crmSearchColumns = d.crmSearchColumns.filter((z) => !(z.userId === u.id && z.module === m));   // a screen preference: replaced, not kept
      if (keys == null || (Array.isArray(keys) && !keys.length)) { save(); return { module: m, columns: null }; }
      const fields = moduleFields(m, cfgFor(u)); const list = [...new Set((Array.isArray(keys) ? keys : []).map((k) => str(k, 80)))];
      list.forEach((k) => { const f = fields.find((z) => z.key === k); if (!f || f.encrypted) fail(`"${k}" cannot be a search column.`); });
      if (list.length > SEARCH_COL_MAX) fail(`At most ${SEARCH_COL_MAX} columns.`);
      list.forEach((k, i) => d.crmSearchColumns.push({ userId: u.id, module: m, position: i, columnKey: k })); save(); return { module: m, columns: list }; },
    // ---------- disbursement details ----------
    async saveCrmDealDisbursement(dealId, input = {}) { const u = crmUser(); if (!u.isAdmin) fail('Only an Admin or Super admin can enter Disbursement Details.');
      const id = str(dealId, 60); if (!rowsOf(u, 'deals').some((r) => r.id === id)) fail('Deal not found.');
      let clean; try { clean = cleanDisbursement(input); } catch (e) { fail(e.message); }
      const d = db(); let row = d.dealDisbursements.find((z) => z.dealId === id); const before = row ? { ...row } : null;
      if (!row) { row = { dealId: id, ...Object.fromEntries(DISBURSEMENT_KEYS.map((k) => [k, null])) }; d.dealDisbursements.push(row); }
      Object.assign(row, clean, { updatedBy: u.id, updatedAt: now() });
      const changed = DISBURSEMENT_KEYS.filter((k) => (before ? before[k] : null) !== row[k]);
      changed.forEach((k) => d.dealDisbursementLog.push({ dealId: id, field: k, oldValue: before ? before[k] : null, newValue: row[k], by: u.id, at: now() }));
      save(); return { ...Object.fromEntries(DISBURSEMENT_KEYS.map((k) => [k, row[k]])), updatedBy: u.id, updatedByName: nameOf(u.id), updatedAt: row.updatedAt, changed }; },
    async getCrmDealDisbursement(dealId) { const u = crmUser(); const id = str(dealId, 60); if (!rowsOf(u, 'deals').some((r) => r.id === id)) fail('Deal not found.');
      const row = db().dealDisbursements.find((z) => z.dealId === id) || null;
      return { ...Object.fromEntries(DISBURSEMENT_KEYS.map((k) => [k, row ? row[k] : null])), updatedBy: row ? row.updatedBy : null, updatedByName: row ? nameOf(row.updatedBy) : '', updatedAt: row ? row.updatedAt : null, canEdit: !!u.isAdmin,
        history: db().dealDisbursementLog.filter((z) => z.dealId === id).map((z) => ({ ...z, byName: nameOf(z.by) })) }; },
  };
  return { api };
}
