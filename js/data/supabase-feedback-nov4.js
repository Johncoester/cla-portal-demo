/* [SUPABASE] John's Nov 4 portal meeting + Janine's Nov 4 videos (migration 56). Same names / shapes as mock-part-feedback-nov4.js and the closing
 * office parts of mock-part-matt.js.
 *  - Closing office: moved to supabase-offices.js (migration 57, public.offices); the getClosingOfficeDefault below is overridden there.
 *  - Disbursement Details: public.deal_disbursements (Admin writes; trigger writes deal_disbursement_log).
 *  - Search result columns: public.crm_search_columns (each person's own).
 *  - Custom views / saved filters: public.crm_views, crm_view_criteria, crm_view_columns, crm_view_shares, crm_view_pins,
 *    crm_saved_filters, crm_saved_filter_values. Already on TEST. Views and saved filters are retired, never deleted.
 *    Criteria values are one row per value_index (no JSON). Child rows are read and replaced in batches. */
import { CLA_OFFICES, OFFICE_LOCATION } from './cla-offices.js?v=202611101215';
import { DISBURSEMENT_FIELDS, cleanDisbursement } from './crm-disbursement.js?v=202611070139';
import { VIEW_MODULES, VIEW_DEFAULT_COLUMNS, PINS_MAX, nameOk, cleanColumns, cleanFilterValues, SEARCH_COL_MAX } from './crm-views.js?v=202611070139';
import { moduleFields, cleanCriteria, applyCriteria, display, SHARE_ROLES, DEPARTMENTS } from './crm-analytics.js?v=202611070139';
import { canUseCrm, crmReadOnly } from './crm.js?v=202611070139';
import { CRM_OFF, featureFlags } from './features.js?v=202611070139';
import { localDate } from './constants.js?v=202611090935';
const snake = (k) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_FN = { contacts: 'listCrmContacts', leads: 'listCrmLeads', accounts: 'listCrmAccounts', deals: 'listCrmDeals' };
const personName = (u) => (u && (u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim())) || '';
const isAdmin = (u) => !!(u && (u.isAdmin || u.role === 'Admin' || u.role === 'Super admin'));

export function feedbackNov4Supabase({ sb, ok, me }) {
  const pack = async (q) => ok(await q) || [];
  const need = async () => {
    if (!featureFlags().crm) throw new Error(CRM_OFF);
    const u = await me();
    if (!u || !u.id) throw new Error('Please sign in.');
    if (!canUseCrm(u)) throw new Error('The CRM is for CLA staff only.');
    return u;
  };
  const modOk = (m) => { const s = String(m || '').slice(0, 20); if (!VIEW_MODULES.includes(s)) throw new Error('Pick Clients, Leads, Companies or Deals.'); return s; };
  const fieldsOf = async function (module) {
    const cfg = typeof this.getCrmSettings === 'function' ? await this.getCrmSettings() : null;
    return { cfg, fields: moduleFields(module, cfg) };
  };
  const canEdit = (u, v) => !crmReadOnly(u) && (v.owner_id === u.id || (isAdmin(u) && v.visibility !== 'me'));
  const canSee = (u, v, shareIds) => !v.retired_at && (v.owner_id === u.id || v.visibility === 'all' || (v.visibility === 'custom' && shareIds.includes(u.id)));
  function cleanInput(u, input, module, fields, old) {
    const vis = String(input.visibility ?? (old ? old.visibility : 'me')).slice(0, 10);
    if (!['me', 'all', 'custom'].includes(vis)) throw new Error('Pick who sees this view.');
    if (vis !== 'me' && crmReadOnly(u)) throw new Error('The Processor has read-only access to the CRM: views you make are for you only.');
    const users = vis === 'custom' ? [...new Set((input.shareUsers ?? (old ? old.shareUsers : []) ?? []).map((z) => String(z)))] : [];
    if (vis === 'custom') {
      if (users.some((id) => !UUID.test(id))) throw new Error('Share with active CLA users only.');
      if (!users.filter((id) => id !== u.id).length) throw new Error('Pick at least one user to share with.');
    }
    const logic = String(input.logic ?? (old ? old.logic : 'and')).slice(0, 3);
    if (!['and', 'or'].includes(logic)) throw new Error('Match all (AND) or any (OR).');
    const criteria = cleanCriteria(input.criteria ?? (old ? old.criteria : []), fields);
    const columns = cleanColumns(module, input.columns ?? (old ? old.columns : VIEW_DEFAULT_COLUMNS[module]), fields);
    const sortField = String((input.sortField ?? (old ? old.sortField : 'name')) || 'name').slice(0, 80);
    if (!fields.some((f) => f.key === sortField) || !/^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(sortField)) throw new Error('Sort by a field of this module.');
    const sortDir = String(input.sortDir ?? (old ? old.sortDir : 'asc')).slice(0, 4) === 'desc' ? 'desc' : 'asc';
    const name = nameOk(input.name ?? (old ? old.name : ''));
    return { name, visibility: vis, shareUsers: users, logic, criteria, columns, sortField, sortDir };
  }
  function criteriaFrom(rows) {
    const grouped = new Map();
    [...rows].sort((a, b) => a.position - b.position || a.value_index - b.value_index).forEach((r) => {
      let c = grouped.get(r.position);
      if (!c) { c = { field: r.field_key, op: r.op, values: [] }; grouped.set(r.position, c); }
      c.values.push(r.value_text == null ? '' : r.value_text);
      if (r.value2_text) c.value2 = r.value2_text;
    });
    return [...grouped.values()].map((c) => {
      const out = { field: c.field, op: c.op, value: c.values.length > 1 ? c.values : (c.values[0] ?? '') };
      if (c.value2) out.value2 = c.value2;
      return out;
    });
  }
  function criteriaRows(viewId, criteria) {
    const rows = [];
    criteria.forEach((c, position) => {
      const vals = Array.isArray(c.value) ? c.value : [c.value == null ? '' : String(c.value)];
      (vals.length ? vals : ['']).forEach((value, value_index) => rows.push({
        view_id: viewId, position, value_index, field_key: c.field, op: c.op,
        value_text: String(value).slice(0, 200), value2_text: value_index === 0 && c.value2 ? String(c.value2).slice(0, 200) : '',
      }));
    });
    return rows;
  }
  async function childMaps(ids) {
    const criteria = new Map(), columns = new Map(), shares = new Map();
    ids.forEach((id) => { criteria.set(id, []); columns.set(id, []); shares.set(id, []); });
    if (!ids.length) return { criteria, columns, shares };
    const [critRows, colRows, shareRows] = await Promise.all([
      pack(sb.from('crm_view_criteria').select('view_id,position,field_key,op,value_index,value_text,value2_text').in('view_id', ids).order('position').order('value_index')),
      pack(sb.from('crm_view_columns').select('view_id,position,column_key').in('view_id', ids).order('position')),
      pack(sb.from('crm_view_shares').select('view_id,user_id').in('view_id', ids)),
    ]);
    critRows.forEach((r) => { if (criteria.has(r.view_id)) criteria.get(r.view_id).push(r); });
    colRows.forEach((r) => { if (columns.has(r.view_id)) columns.get(r.view_id).push(r); });
    shareRows.forEach((r) => { if (shares.has(r.view_id)) shares.get(r.view_id).push(r.user_id); });
    return { criteria, columns, shares };
  }
  async function namesFor(u, ids) {
    const map = new Map([[u.id, personName(u)]]);
    const other = [...new Set(ids)].filter((id) => id && id !== u.id);
    if (!other.length) return map;
    (await pack(sb.rpc('crm_assignees'))).forEach((p) => map.set(p.id, p.name || ''));
    return map;
  }
  function shape(u, v, parts, nameMap, pinIds) {
    const shareUsers = parts.shares.get(v.id) || [];
    return {
      id: v.id, module: v.module, name: v.name, ownerId: v.owner_id, ownerName: nameMap.get(v.owner_id) || '', visibility: v.visibility, shareUsers: [...shareUsers],
      logic: v.logic, criteria: criteriaFrom(parts.criteria.get(v.id) || []), columns: (parts.columns.get(v.id) || []).sort((a, b) => a.position - b.position).map((r) => r.column_key),
      sortField: v.sort_field, sortDir: v.sort_dir, mine: v.owner_id === u.id, canEdit: canEdit(u, v), retired: !!v.retired_at,
      pinned: pinIds.includes(v.id), pinPosition: pinIds.indexOf(v.id), createdAt: v.created_at, modifiedAt: v.modified_at,
    };
  }
  async function assertUniqueName(ownerId, module, name, exceptId) {
    const rows = await pack(sb.from('crm_views').select('id,name').eq('owner_id', ownerId).eq('module', module).is('retired_at', null));
    const dup = rows.find((z) => z.id !== exceptId && String(z.name).toLowerCase() === name.toLowerCase());
    if (dup) throw new Error(`You already have a ${module === 'contacts' ? 'Clients' : module} view called "${dup.name}".`);
  }
  async function writeChildren(viewId, cleaned, replace) {
    if (replace) await Promise.all([
      pack(sb.from('crm_view_criteria').delete().eq('view_id', viewId)),
      pack(sb.from('crm_view_columns').delete().eq('view_id', viewId)),
      pack(sb.from('crm_view_shares').delete().eq('view_id', viewId)),
    ]);
    const writes = [];
    if (cleaned.columns.length) writes.push(pack(sb.from('crm_view_columns').insert(cleaned.columns.map((column_key, position) => ({ view_id: viewId, position, column_key })))));
    const crit = criteriaRows(viewId, cleaned.criteria);
    if (crit.length) writes.push(pack(sb.from('crm_view_criteria').insert(crit)));
    if (cleaned.visibility === 'custom' && cleaned.shareUsers.length) writes.push(pack(sb.from('crm_view_shares').insert(cleaned.shareUsers.map((user_id) => ({ view_id: viewId, user_id })))));
    if (writes.length) await Promise.all(writes);
  }
  async function modulePins(u, module) {
    const pins = await pack(sb.from('crm_view_pins').select('view_id,position').eq('user_id', u.id).order('position'));
    if (!pins.length) return [];
    const live = new Set((await pack(sb.from('crm_views').select('id').in('id', pins.map((p) => p.view_id)).eq('module', module).is('retired_at', null))).map((v) => v.id));
    return pins.filter((p) => live.has(p.view_id)).sort((a, b) => a.position - b.position);
  }
  async function loadOwned(u, id) {
    if (!UUID.test(String(id || ''))) throw new Error('That view does not exist.');
    const v = ok(await sb.from('crm_views').select('*').eq('id', id).maybeSingle());
    if (!v || v.retired_at) throw new Error('That view does not exist.');
    const parts = await childMaps([v.id]);
    if (!canSee(u, v, parts.shares.get(v.id) || [])) throw new Error('That view does not exist.');
    const pins = await pack(sb.from('crm_view_pins').select('view_id,position').eq('user_id', u.id).eq('view_id', v.id));
    const pinIds = pins.map((p) => p.view_id);
    return shape(u, v, parts, await namesFor(u, [v.owner_id]), pinIds);
  }
  function filterTarget(listKey) {
    const key = String(listKey || '').slice(0, 80);
    if (VIEW_MODULES.includes(key)) return { listKey: key, module: key, viewId: null };
    const m = /^view:(.+)$/.exec(key);
    if (!m || !UUID.test(m[1])) throw new Error('Save a filter on Clients, Leads, Companies, Deals or a custom view.');
    return { listKey: key, viewId: m[1] };
  }
  async function assertUniqueFilter(userId, module, viewId, name, exceptId) {
    let q = sb.from('crm_saved_filters').select('id,name').eq('user_id', userId).eq('module', module).is('retired_at', null);
    q = viewId ? q.eq('view_id', viewId) : q.is('view_id', null);
    const dup = (await pack(q)).find((z) => z.id !== exceptId && String(z.name).toLowerCase() === name.toLowerCase());
    if (dup) throw new Error(`You already have a saved filter called "${name}" here.`);
  }
  function withLinks(module, rows) {
    return rows.map((r) => {
      if (module === 'contacts') return { ...r, _link: r._link || `#/crm/contacts/${r.id}`, _companyLink: r._companyLink || (r.accountId ? `#/crm/accounts/${r.accountId}` : '') };
      if (module === 'leads') return { ...r, _link: r._link || `#/crm/leads/${r.id}` };
      if (module === 'accounts') return { ...r, _link: r._link || `#/crm/accounts/${r.id}` };
      if (module === 'deals') return { ...r, _link: r._link || `#/crm/deals/${r.id}` };
      return r;
    });
  }
  const api = {
    async getClosingOfficeDefault(dealId) {
      const offices = (ok(await sb.from('cla_offices').select('id,name,address,state,state_default,position').eq('active', true).order('position')) || [])
        .map((o) => ({ id: o.id, name: o.name, address: o.address, state: o.state, stateDefault: o.state_default }));
      const d = (ok(await sb.rpc('closing_office_default', { p_deal: dealId })) || [])[0] || {};
      return { offices: offices.length ? offices : CLA_OFFICES, officeId: d.office_id || null, reason: d.reason || 'none', text: d.office_name || '', officeLocation: OFFICE_LOCATION };
    },
    async getCrmDealDisbursement(dealId) { const u = await me();
      const r = ok(await sb.from('deal_disbursements').select('*').eq('deal_id', dealId).maybeSingle()) || {};
      const values = {}; DISBURSEMENT_FIELDS.forEach(([k, , t]) => { const v = r[snake(k)]; values[k] = v == null ? null : t === 'money' ? Number(v) : String(v); });
      const history = ok(await sb.from('deal_disbursement_log').select('*').eq('deal_id', dealId).order('changed_at', { ascending: false }).limit(50)) || [];
      return { values, canEdit: !!(u && ['Admin', 'Super admin'].includes(u.role)), history: history.map((h) => ({ field: h.field_key, from: h.old_amount ?? h.old_date, to: h.new_amount ?? h.new_date, at: h.changed_at, byId: h.changed_by })) };
    },
    async saveCrmDealDisbursement(dealId, input = {}) { const u = await me(); if (!u || !['Admin', 'Super admin'].includes(u.role)) throw new Error('Only an Admin or Super admin can enter Disbursement Details.');
      const v = cleanDisbursement(input); const row = { deal_id: dealId }; Object.keys(v).forEach((k) => { row[snake(k)] = v[k]; });
      ok(await sb.from('deal_disbursements').upsert(row, { onConflict: 'deal_id' })); return this.getCrmDealDisbursement(dealId);
    },
    async getCrmSearchColumns(module) { const u = await me();
      return (ok(await sb.from('crm_search_columns').select('column_key,position').eq('user_id', u.id).eq('module', module).order('position')) || []).map((r) => r.column_key); },
    async saveCrmSearchColumns(module, keys) { const u = await me();
      ok(await sb.from('crm_search_columns').delete().eq('user_id', u.id).eq('module', module));
      if (keys == null) return null;
      const list = [...new Set((keys || []).map(String))].slice(0, SEARCH_COL_MAX);
      if (list.length) ok(await sb.from('crm_search_columns').insert(list.map((k, i) => ({ user_id: u.id, module, position: i, column_key: k }))));
      return list; },
    async listCrmShareTargets() {
      const u = await need();
      let raw = [];
      try { raw = await pack(sb.rpc('crm_assignees')); } catch { raw = []; }
      if (!Array.isArray(raw)) raw = [];
      const users = raw.map((p) => ({ id: p.id, name: p.name || '', role: p.role || '' }));
      if (!users.some((z) => z.id === u.id)) users.push({ id: u.id, name: personName(u), role: u.role || '' });
      users.sort((a, b) => a.name.localeCompare(b.name));
      return { users, roles: SHARE_ROLES, departments: DEPARTMENTS.map(([id, name, roles]) => ({ id, name, roles })) };
    },
    async listCrmViews(module) {
      const u = await need(); const m = modOk(module);
      const views = await pack(sb.from('crm_views').select('*').eq('module', m).is('retired_at', null).order('name'));
      const ids = views.map((v) => v.id);
      const parts = await childMaps(ids);
      const seen = views.filter((v) => canSee(u, v, parts.shares.get(v.id) || []));
      const pinRows = seen.length ? await pack(sb.from('crm_view_pins').select('view_id,position').eq('user_id', u.id).in('view_id', seen.map((v) => v.id)).order('position')) : [];
      const pinIds = pinRows.sort((a, b) => a.position - b.position).map((p) => p.view_id);
      const nameMap = await namesFor(u, seen.map((v) => v.owner_id));
      return seen.map((v) => shape(u, v, parts, nameMap, pinIds)).sort((a, b) => a.name.localeCompare(b.name));
    },
    async createCrmView(input = {}) {
      const u = await need(); const m = modOk(input.module);
      const { fields } = await fieldsOf.call(this, m);
      const cleaned = cleanInput(u, input, m, fields, null);
      await assertUniqueName(u.id, m, cleaned.name);
      const row = ok(await sb.from('crm_views').insert({ module: m, name: cleaned.name, owner_id: u.id, visibility: cleaned.visibility, logic: cleaned.logic, sort_field: cleaned.sortField, sort_dir: cleaned.sortDir }).select('*').single());
      await writeChildren(row.id, cleaned, false);
      if (input.pin !== false) {
        const pins = await modulePins(u, m);
        if (pins.length < PINS_MAX) ok(await sb.from('crm_view_pins').insert({ user_id: u.id, view_id: row.id, position: pins.length }));
      }
      return loadOwned(u, row.id);
    },
    async updateCrmView(id, input = {}) {
      const u = await need(); const cur = await loadOwned(u, id);
      if (!cur.canEdit) throw new Error('Only the person who made this view (or an Admin, for a shared view) can change it.');
      const { fields } = await fieldsOf.call(this, cur.module);
      const cleaned = cleanInput(u, { ...cur, ...input, module: cur.module }, cur.module, fields, cur);
      await assertUniqueName(cur.ownerId, cur.module, cleaned.name, cur.id);
      ok(await sb.from('crm_views').update({ name: cleaned.name, visibility: cleaned.visibility, logic: cleaned.logic, sort_field: cleaned.sortField, sort_dir: cleaned.sortDir }).eq('id', cur.id).select('id').single());
      await writeChildren(cur.id, cleaned, true);
      return loadOwned(u, cur.id);
    },
    async cloneCrmView(id, { name } = {}) {
      const u = await need(); const v = await loadOwned(u, id);
      return this.createCrmView({ module: v.module, name: name || `Copy of ${v.name}`, visibility: 'me', logic: v.logic, criteria: v.criteria, columns: v.columns, sortField: v.sortField, sortDir: v.sortDir });
    },
    async retireCrmView(id) {
      const u = await need(); const v = await loadOwned(u, id);
      if (!v.canEdit) throw new Error('Only the person who made this view (or an Admin, for a shared view) can remove it.');
      ok(await sb.from('crm_views').update({ retired_at: new Date().toISOString() }).eq('id', v.id).select('id').single());
      const mine = await pack(sb.from('crm_view_pins').select('view_id').eq('user_id', u.id).eq('view_id', v.id));
      if (mine.length) ok(await sb.from('crm_view_pins').delete().eq('user_id', u.id).eq('view_id', v.id));
      return { ok: true };
    },
    async pinCrmView(id, on = true) {
      const u = await need(); const v = await loadOwned(u, id);
      const pins = await modulePins(u, v.module);
      const has = pins.find((p) => p.view_id === v.id);
      if (on && !has) {
        if (pins.length >= PINS_MAX) throw new Error(`At most ${PINS_MAX} pinned views per list.`);
        ok(await sb.from('crm_view_pins').insert({ user_id: u.id, view_id: v.id, position: pins.length }));
      }
      if (!on && has) {
        ok(await sb.from('crm_view_pins').delete().eq('user_id', u.id).eq('view_id', v.id));
        const rest = await modulePins(u, v.module);
        const moved = rest.map((p, i) => ({ user_id: u.id, view_id: p.view_id, position: i })).filter((p, i) => rest[i].position !== i);
        if (moved.length) ok(await sb.from('crm_view_pins').upsert(moved, { onConflict: 'user_id,view_id' }));
      }
      return { pinned: !!on };
    },
    async runCrmView(id) {
      const u = await need(); const v = await loadOwned(u, id);
      const { cfg, fields } = await fieldsOf.call(this, v.module);
      const fn = this[LIST_FN[v.module]];
      if (typeof fn !== 'function') throw new Error('That list is not available.');
      let rows = withLinks(v.module, await fn.call(this) || []);
      if (v.module === 'deals' && rows.length) {
        const cols = ['deal_id', ...DISBURSEMENT_FIELDS.map(([k]) => snake(k))].join(',');
        const extra = await pack(sb.from('deal_disbursements').select(cols).in('deal_id', rows.map((r) => r.id)));
        const by = new Map(extra.map((r) => [r.deal_id, r]));
        rows = rows.map((r) => {
          const d = by.get(r.id) || {}; const add = {};
          DISBURSEMENT_FIELDS.forEach(([k, , t]) => { const val = d[snake(k)]; add[k] = val == null ? null : t === 'money' ? Number(val) : String(val); });
          return { ...r, ...add };
        });
      }
      const matched = applyCriteria(rows, v.criteria, fields, { logic: v.logic, today: localDate() });
      const colFields = v.columns.map((k) => fields.find((f) => f.key === k)).filter(Boolean);
      const sf = fields.find((f) => f.key === v.sortField) || colFields[0];
      const sortVal = (r) => { const x = r[sf.key]; return x == null ? '' : typeof x === 'number' ? x : String(display(sf, r, cfg)).toLowerCase(); };
      const sorted = matched.slice().sort((a, b) => { const A = sortVal(a), B = sortVal(b); const c = typeof A === 'number' && typeof B === 'number' ? A - B : String(A).localeCompare(String(B)); return v.sortDir === 'desc' ? -c : c; });
      const cellOf = (f, r) => ({ text: display(f, r, cfg), link: f.link && !f.encrypted ? r[f.link] || '' : '' });
      return {
        view: v, fields: fields.map((f) => ({ key: f.key, label: f.label, type: f.type, list: f.list || null, options: f.options || null })),
        columns: colFields.map((f) => ({ key: f.key, label: f.label, type: f.type })), total: sorted.length,
        rows: sorted.map((r) => ({ id: r.id, link: r._link || '', cells: Object.fromEntries(colFields.map((f) => [f.key, cellOf(f, r, cfg)])) })),
      };
    },
    async listCrmSavedFilters(listKey) {
      const u = await need(); const target = filterTarget(listKey);
      let module = target.module; let viewId = target.viewId;
      if (viewId) { const v = await loadOwned(u, viewId); module = v.module; viewId = v.id; }
      let q = sb.from('crm_saved_filters').select('*').eq('user_id', u.id).eq('module', module).is('retired_at', null).order('name');
      q = viewId ? q.eq('view_id', viewId) : q.is('view_id', null);
      const filters = await pack(q);
      const ids = filters.map((f) => f.id);
      const values = ids.length ? await pack(sb.from('crm_saved_filter_values').select('filter_id,field_name,value_text').in('filter_id', ids)) : [];
      return filters.map((f) => ({
        id: f.id, userId: f.user_id, listKey: f.view_id ? `view:${f.view_id}` : f.module, name: f.name, createdAt: f.created_at, modifiedAt: f.modified_at, retiredAt: null,
        values: values.filter((z) => z.filter_id === f.id).sort((a, b) => a.field_name.localeCompare(b.field_name)).map((z) => ({ name: z.field_name, value: z.value_text })),
      }));
    },
    async saveCrmSavedFilter({ listKey, name, values } = {}) {
      const u = await need(); const target = filterTarget(listKey);
      let module = target.module; let viewId = target.viewId;
      if (viewId) { const v = await loadOwned(u, viewId); module = v.module; viewId = v.id; }
      const nm = nameOk(name); const vals = cleanFilterValues(values);
      await assertUniqueFilter(u.id, module, viewId, nm);
      const row = ok(await sb.from('crm_saved_filters').insert({ user_id: u.id, module, view_id: viewId, name: nm }).select('*').single());
      ok(await sb.from('crm_saved_filter_values').insert(vals.map((z) => ({ filter_id: row.id, field_name: z.name, value_text: z.value }))));
      return { id: row.id, userId: u.id, listKey: viewId ? `view:${viewId}` : module, name: nm, values: vals, createdAt: row.created_at, modifiedAt: row.modified_at, retiredAt: null };
    },
    async renameCrmSavedFilter(id, name) {
      const u = await need();
      if (!UUID.test(String(id || ''))) throw new Error('Saved filter not found.');
      const f = ok(await sb.from('crm_saved_filters').select('*').eq('id', id).eq('user_id', u.id).is('retired_at', null).maybeSingle());
      if (!f) throw new Error('Saved filter not found.');
      const nm = nameOk(name);
      await assertUniqueFilter(u.id, f.module, f.view_id, nm, f.id);
      const row = ok(await sb.from('crm_saved_filters').update({ name: nm }).eq('id', f.id).select('*').single());
      const values = await pack(sb.from('crm_saved_filter_values').select('field_name,value_text').eq('filter_id', f.id));
      return { id: f.id, userId: u.id, listKey: f.view_id ? `view:${f.view_id}` : f.module, name: row.name, createdAt: f.created_at, modifiedAt: row.modified_at, retiredAt: null, values: values.map((z) => ({ name: z.field_name, value: z.value_text })) };
    },
    async retireCrmSavedFilter(id) {
      const u = await need();
      if (!UUID.test(String(id || ''))) throw new Error('Saved filter not found.');
      const f = ok(await sb.from('crm_saved_filters').select('id').eq('id', id).eq('user_id', u.id).is('retired_at', null).maybeSingle());
      if (!f) throw new Error('Saved filter not found.');
      ok(await sb.from('crm_saved_filters').update({ retired_at: new Date().toISOString() }).eq('id', f.id).select('id').single());
      return { ok: true };
    },
  };
  return api;
}
