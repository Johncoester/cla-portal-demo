/* Hosted methods the CRM screens call that were not on the Supabase adapter.
 * Tables only: dashboards, reports, layout sections, dup rules, search columns, activities.
 * Recent items have no table, so they last for this page session only. */
import { localDate } from './constants.js?v=202611101015';
import { canUseCrm, crmReadOnly } from './crm.js?v=202611130900';
import {
  MODULE_CODES, COMPONENT_CODES, CHART_CODES, SEARCH_MODULES, SEARCH_COLUMNS, SEARCH_KEYS, SEARCH_MAX, moduleName, moduleFields, reportFields,
  parseQuery, searchMatch, chartData, measureOf, applyCriteria, runReport, reportCsv, dashboardVisible, dashboardEditable, reportVisible,
} from './crm-analytics.js?v=202611130900';

const RECENT = new Map();
const row = (o) => o || {};
const shareOf = (raw) => { const s = raw && typeof raw === 'object' ? raw : {}; return { users: s.users || [], roles: s.roles || [], departments: s.departments || s.depts || [] }; };
// Quick Chart sends { name, type, config: { module, measure, grouping, criteria, chartType, grouping2, target } }.
// crm_dash_components has no second-grouping column (repo migrations and the table checks only describe grouping jsonb), so grouping2 stays inside that object.
// target is its own numeric column. A chart always has a chart_type; every other type sends chart_type null. Name is 1-100 trimmed with no control characters. Height is 1 or 2. Width is 1 to 3. Criteria holds at most 10 items.
const componentSpec = (v = {}) => {
  const cfg = v.config && typeof v.config === 'object' && !Array.isArray(v.config) ? v.config : null;
  const src = cfg || v;
  const measure = src.measure && typeof src.measure === 'object' ? { ...src.measure } : { fn: 'count' };
  const target = src.target != null && src.target !== '' ? src.target : measure.target;
  delete measure.target;
  const grouping = src.grouping && typeof src.grouping === 'object' ? { ...src.grouping } : {};
  const grouping2 = (src.grouping2 && src.grouping2.field ? src.grouping2 : null) || (grouping.grouping2 && grouping.grouping2.field ? grouping.grouping2 : null);
  delete grouping.grouping2;
  return { name: v.name, type: v.type || 'chart', module: src.module, chartType: src.chartType || null, measure, grouping, grouping2, criteria: Array.isArray(src.criteria) ? src.criteria : [], target, width: v.width, height: v.height, hasConfig: !!cfg };
};
const requireModule = (module) => { const m = String(module == null ? '' : module).trim(); if (!MODULE_CODES.includes(m)) throw new Error('Pick a module.'); return m; };
const componentType = (type) => { const t = String(type || 'chart'); if (!COMPONENT_CODES.includes(t)) throw new Error('That component type is not available.'); return t; };
const chartTypeFor = (type, chartType) => (type === 'chart' ? (CHART_CODES.includes(chartType) ? chartType : 'column') : null);
const componentName = (name, fallback = '') => { const n = String(name == null ? '' : name).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100); if (n) return n; if (fallback) return fallback; throw new Error('Component Name is required.'); };
const componentHeight = (h, missing = 1) => { if (h == null || h === '') return missing; if (h === 's' || h === 1 || h === '1') return 1; return 2; };
const componentWidth = (w) => { const n = Number(w); return n === 2 || n === 3 ? n : 1; };
const componentCriteria = (list) => (Array.isArray(list) ? list : []).filter((c) => c && typeof c === 'object').slice(0, 10);
const componentTarget = (spec) => { if (spec.type !== 'target') return null; if (spec.target == null || spec.target === '') return null; const n = Number(spec.target); if (!isFinite(n) || n < 0) throw new Error('Enter the target (a number that is 0 or more).'); return n; };
const packMeasure = (spec) => { const fn = ['count', 'sum', 'avg'].includes(spec.measure && spec.measure.fn) ? spec.measure.fn : 'count'; const m = { fn }; if (fn !== 'count' && spec.measure && spec.measure.field) m.field = spec.measure.field; return m; };
const packGrouping = (spec) => { const g = { ...spec.grouping }; if (spec.grouping2 && spec.grouping2.field) g.grouping2 = spec.grouping2; return g; };
const storedParts = (c) => {
  const measure = c.measure && typeof c.measure === 'object' ? { ...c.measure } : { fn: 'count' };
  delete measure.target;
  const target = c.target == null || c.target === '' || !isFinite(Number(c.target)) ? null : Number(c.target);
  const grouping = c.grouping && typeof c.grouping === 'object' ? { ...c.grouping } : {};
  const grouping2 = (grouping.grouping2 && grouping.grouping2.field ? grouping.grouping2 : null);
  delete grouping.grouping2;
  const criteria = Array.isArray(c.criteria) ? c.criteria : [];
  const chartType = c.chart_type || c.chartType || null;
  const config = { module: c.module, measure, grouping, criteria, chartType };
  if (grouping2) config.grouping2 = grouping2;
  if (target != null) config.target = target;
  return { measure, grouping, grouping2, criteria, chartType, config };
};

export function crmSurfaceSupabase({ sb, ok, camel, me, on, self }) {
  const who = async () => { on(); const u = await me(); if (!u || !canUseCrm(u)) throw new Error('The CRM is for CLA staff only.'); return u; };
  const editor = async () => { const u = await who(); if (crmReadOnly(u)) throw new Error('The Processor has read-only access to the CRM.'); return u; };
  const pack = async (q) => { try { return ok(await q) || []; } catch { return []; } };
  const rowsOf = async (module) => {
    if (module === 'leads') return self.listCrmLeads();
    if (module === 'contacts') return self.listCrmContacts();
    if (module === 'accounts') return self.listCrmAccounts();
    if (module === 'deals') return self.listCrmDeals({ status: 'All' });
    if (module === 'opportunities') return self.listCrmOpportunities();
    if (module === 'tasks') return self.listCrmTasks();
    if (module === 'meetings' || module === 'calls') {
      const kind = module === 'meetings' ? 'meeting' : 'call';
      const ppl = await self.listCrmAssignees();
      return (ok(await sb.from('crm_activities').select('*').eq('kind', kind)) || []).map((a) => {
        const r = camel(a); const owner = (ppl || []).find((p) => p.id === r.ownerId);
        return { ...r, name: r.subject, _link: `#/crm/${module === 'meetings' ? 'meetings' : 'calls'}/${r.id}`, ownerName: owner ? owner.name : '' };
      });
    }
    throw new Error('Unknown CRM module.');
  };
  const dashOut = (u, d) => {
    const share = shareOf(d.share);
    const view = { ...camel(d), shareUsers: share.users, shareRoles: share.roles, shareDepts: share.departments, locked: !!d.locked, retired: !!d.retired_at, mine: d.owner_id === u.id, ownerName: '', builtin: !!d.builtin };
    view.canEdit = dashboardEditable(u, view, crmReadOnly(u));
    return view;
  };
  const repOut = (u, r, folders) => {
    const share = r.share && r.share.mode ? r.share : { mode: r.share_mode || 'all', users: shareOf(r.share).users, roles: shareOf(r.share).roles };
    const folder = (folders || []).find((f) => f.id === r.folder_id);
    return { ...camel(r), related: r.related || [], columns: r.columns || [], rowGroups: r.row_groups || r.rowGroups || [], aggregates: r.aggregates || [], filters: r.filters || [],
      share, folderName: folder ? folder.name : (r.personal_owner ? 'My reports' : ''), personal: !!r.personal_owner, retired: !!r.retired_at, moduleLabel: moduleName(r.module),
      createdByName: '', canEdit: !crmReadOnly(u), canExport: !!u.isAdmin, lastAccessedAt: r.last_accessed_at || null };
  };
  const compOut = (c, data) => { const parts = storedParts(c); return { ...camel(c), chartType: parts.chartType, criteria: parts.criteria, grouping: parts.grouping, measure: parts.measure, height: c.height >= 3 ? 'l' : c.height === 2 ? 'm' : 's', data, config: parts.config, error: data && data.error }; };

  return {
    async listCrmModuleRows(module) { await who(); if (!MODULE_CODES.includes(module)) throw new Error('Unknown CRM module.'); return rowsOf(module); },
    async searchCrm(q, { module = 'all', limit = 0 } = {}) {
      const u = await who(); const pq = parseQuery(q); if (!pq.q) return { q: '', groups: [] };
      const mods = module === 'all' ? SEARCH_MODULES : [module];
      const groups = [];
      for (const m of mods) {
        let hits = []; try { hits = (await rowsOf(m)).filter((r) => searchMatch(r, pq, SEARCH_KEYS[m] || ['name'])); } catch { hits = []; }
        const cols = SEARCH_COLUMNS[m] || [['name', 'Name']];
        const list = hits.slice(0, limit > 0 ? limit : SEARCH_MAX).map((r) => ({ id: r.id, link: r._link || `#/crm/${m}/${r.id}`, title: r.name || r.subject || '', archived: !!r.archived,
          cells: Object.fromEntries(cols.map(([k]) => [k, r[k] == null ? '' : String(r[k])])), links: { name: r._link || '', subject: r._link || '' } }));
        groups.push({ module: m, label: moduleName(m), columns: cols, customColumns: false, rows: list, total: hits.length });
      }
      return { q: pq.q, phone: !!pq.digits, groups: groups.filter((g) => module !== 'all' || g.total) };
    },
    async noteCrmRecent(entity, id) { const u = await who(); const bag = RECENT.get(u.id) || { items: [], searches: [] }; const at = new Date().toISOString(); const cur = bag.items.find((z) => z.module === entity && z.id === id); if (cur) cur.at = at; else bag.items.push({ module: entity, id, at }); RECENT.set(u.id, bag); return { ok: true }; },
    async listCrmRecent() { const u = await who(); const bag = RECENT.get(u.id) || { items: [], searches: [] }; return { items: bag.items.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10), searches: bag.searches.slice(0, 10) }; },
    async saveCrmRecentSearch(q) { const u = await who(); const s = parseQuery(q).q; if (!s) return { ok: true }; const bag = RECENT.get(u.id) || { items: [], searches: [] }; bag.searches = [s, ...bag.searches.filter((z) => z !== s)].slice(0, 10); RECENT.set(u.id, bag); return { ok: true }; },
    async getCrmComposeContext(entity, id) {
      const u = await who();
      let recordName = 'Record'; let to = [];
      try { const people = await self.crmRelatedEmails(entity, id); to = (people || []).map((p) => p.email).filter(Boolean); if (people && people[0]) recordName = people[0].name || recordName; } catch { /* a report compose has no record */ }
      let signature = ''; try { const s = ok(await sb.from('crm_user_signatures').select('html').eq('user_id', u.id).maybeSingle()); signature = (s && s.html) || ''; } catch { signature = ''; }
      const from = u.email ? [String(u.email).toLowerCase()] : [];
      return { recordName, to, from, signature, sendNote: 'Gmail is not connected. Nothing is sent.', canAttachReport: !!u.isAdmin };
    },
    async getCrmEmailAttachment(emailId, fileId) {
      await who(); const f = ok(await sb.from('crm_attachments').select('id,name').eq('id', fileId).maybeSingle());
      if (!f) throw new Error('Attachment not found.');
      return { name: f.name, dataUrl: 'data:text/plain;charset=utf-8,' + encodeURIComponent('This file is stored in CRM attachments. The download bucket is not connected yet.\n' + f.name) };
    },
    async uploadCrmFieldFile() { await who(); throw new Error('CRM file fields are not stored on this portal yet.'); },
    async setCrmDupRule(key, on2) {
      const u = await editor(); if (key !== 'phone') throw new Error(key === 'email' ? 'Email duplicates are always blocked across Clients and Leads.' : 'Unknown rule.');
      ok(await sb.from('crm_dup_rules').upsert({ key: 'phone', enabled: !!on2, modified_by: u.id, modified_at: new Date().toISOString() }));
      return { key: 'phone', enabled: !!on2 };
    },
    async setCrmFieldPermission(id, perms) {
      const u = await editor();
      const view = perms && perms.view ? perms.view : null; const edit = perms && perms.edit ? perms.edit : null;
      return camel(ok(await sb.from('crm_custom_fields').update({ perm_view: view, perm_edit: edit, modified_by: u.id, modified_at: new Date().toISOString() }).eq('id', id).select('*').single()));
    },
    async addCrmSection(entity, label) {
      const u = await editor(); const key = String(label || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      if (!key) throw new Error('The section needs a name.');
      const rows = await pack(sb.from('crm_layout_sections').select('position').eq('entity', entity));
      const position = rows.reduce((n, r) => Math.max(n, r.position || 0), 0) + 1;
      return camel(ok(await sb.from('crm_layout_sections').insert({ entity, key, label: String(label).trim().slice(0, 80), position, modified_by: u.id }).select('*').single()));
    },
    async updateCrmSection(entity, key, patch = {}) {
      const u = await editor(); const cur = ok(await sb.from('crm_layout_sections').select('*').eq('entity', entity).eq('key', key).maybeSingle());
      if (!cur) throw new Error('That section does not exist.');
      const o = { modified_by: u.id, modified_at: new Date().toISOString() };
      if (patch.label != null) o.label = String(patch.label).trim().slice(0, 80);
      if (patch.hidden != null) o.hidden = !!patch.hidden;
      if (patch.move === 'up' || patch.move === 'down') o.position = Math.max(0, (cur.position || 0) + (patch.move === 'up' ? -1 : 1));
      return camel(ok(await sb.from('crm_layout_sections').update(o).eq('entity', entity).eq('key', key).select('*').single()));
    },
    async listCrmDashboards({ includeRetired = false } = {}) {
      const u = await who(); const rows = await pack(sb.from('crm_dashboards').select('*').order('position'));
      return rows.map((d) => dashOut(u, d)).filter((d) => dashboardVisible(u, d) && (includeRetired || !d.retired));
    },
    async getCrmDashboard(id) {
      const u = await who(); const d = ok(await sb.from('crm_dashboards').select('*').eq('id', id).maybeSingle());
      if (!d || !dashboardVisible(u, dashOut(u, d))) throw new Error('Dashboard not found.');
      const view = dashOut(u, d); const cfg = await self.getCrmSettings();
      const comps = await pack(sb.from('crm_dash_components').select('*').eq('dashboard_id', id).order('position'));
      const live = []; const retired = [];
      for (const c of comps) {
        if (c.retired_at) { retired.push({ id: c.id, name: c.name, retiredAt: c.retired_at }); continue; }
        let data = { groups: [], value: 0, measureLabel: 'Record Count' };
        try {
          const parts = storedParts(c); const rows = await rowsOf(c.module); const fields = moduleFields(c.module, cfg);
          data = chartData(rows, { grouping: parts.grouping || {}, grouping2: parts.grouping2 || {}, measure: parts.measure }, fields, cfg) || data;
          if (c.type === 'kpi' || c.type === 'target') { const value = measureOf(rows, parts.measure, fields) || 0; data = { ...data, value, count: rows.length }; if (c.type === 'target') { const target = Number(parts.config.target) || 0; data.target = target; data.pct = target ? Math.round((value / target) * 1000) / 10 : 0; } }
        } catch (e) { data = { error: e.message }; }
        live.push(compOut(c, data.error ? { error: data.error } : data));
      }
      return { ...view, list: live, retiredComponents: view.canEdit ? retired : [] };
    },
    async createCrmDashboard(input = {}) {
      const u = await editor(); const name = String(input.name || '').trim(); if (!name) throw new Error('Dashboard Name is required.');
      const share = { users: input.shareUsers || [], roles: input.shareRoles || [], departments: input.shareDepts || [] };
      const id = globalThis.crypto && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : '';
      if (!id) throw new Error('This browser cannot mint a dashboard id.');
      // No RETURNING on this insert. crm_dashboards_select calls crm_dash_visible, which looks the id up and cannot see this statement's new row.
      const row = { id, name: name.slice(0, 100), description: String(input.description || '').slice(0, 500), owner_id: u.id, visibility: input.visibility || 'me', share, locked: !!input.locked, created_by: u.id };
      ok(await sb.from('crm_dashboards').insert(row));
      return dashOut(u, ok(await sb.from('crm_dashboards').select('*').eq('id', id).single()));
    },
    async updateCrmDashboard(id, patch = {}) {
      const u = await editor(); const o = { modified_by: u.id, modified_at: new Date().toISOString() };
      if (patch.name != null) o.name = String(patch.name).trim().slice(0, 100);
      if (patch.description != null) o.description = String(patch.description).slice(0, 500);
      if (patch.visibility) o.visibility = patch.visibility;
      if (patch.locked != null) o.locked = !!patch.locked;
      if (patch.filters) o.filters = patch.filters;
      if (patch.shareUsers || patch.shareRoles || patch.shareDepts) o.share = { users: patch.shareUsers || [], roles: patch.shareRoles || [], departments: patch.shareDepts || [] };
      return dashOut(u, ok(await sb.from('crm_dashboards').update(o).eq('id', id).select('*').single()));
    },
    async cloneCrmDashboard(id, { name } = {}) { const d = await this.getCrmDashboard(id); return this.createCrmDashboard({ name: name || `Copy of ${d.name}`, description: d.description, visibility: 'me' }); },
    async retireCrmDashboard(id, retired = true) { const u = await editor(); return dashOut(u, ok(await sb.from('crm_dashboards').update({ retired_at: retired ? new Date().toISOString() : null, retired_by: retired ? u.id : null }).eq('id', id).select('*').single())); },
    async addCrmComponent(dashboardId, v = {}) {
      const u = await editor(); const spec = componentSpec(v); const module = requireModule(spec.module); const type = componentType(spec.type);
      const c = ok(await sb.from('crm_dash_components').insert({ dashboard_id: dashboardId, name: componentName(spec.name, 'Component'), type, module, chart_type: chartTypeFor(type, spec.chartType), measure: packMeasure(spec), grouping: packGrouping(spec), criteria: componentCriteria(spec.criteria), target: componentTarget({ ...spec, type }), width: componentWidth(spec.width), height: componentHeight(spec.height), created_by: u.id }).select('*').single());
      return compOut(c, {});
    },
    async updateCrmComponent(id, v = {}) {
      await editor(); const spec = componentSpec(v); const type = componentType(spec.type); const o = { modified_at: new Date().toISOString() };
      if (v.name != null) o.name = componentName(v.name);
      if (spec.hasConfig || Object.prototype.hasOwnProperty.call(v, 'module')) o.module = requireModule(spec.module);
      if (spec.hasConfig || v.type != null) { o.type = type; o.chart_type = chartTypeFor(type, spec.chartType); o.target = componentTarget({ ...spec, type }); }
      else if (v.chartType != null) o.chart_type = chartTypeFor('chart', spec.chartType);
      else if (v.target != null) o.target = componentTarget({ ...spec, type: 'target' });
      if (spec.hasConfig || v.measure) o.measure = packMeasure(spec);
      if (spec.hasConfig || v.grouping || v.grouping2) o.grouping = packGrouping(spec);
      if (spec.hasConfig || v.criteria) o.criteria = componentCriteria(spec.criteria);
      if (v.width) o.width = componentWidth(v.width); if (v.height != null && v.height !== '') o.height = componentHeight(v.height);
      return compOut(ok(await sb.from('crm_dash_components').update(o).eq('id', id).select('*').single()), {});
    },
    async cloneCrmComponent(id) { const c = ok(await sb.from('crm_dash_components').select('*').eq('id', id).maybeSingle()); if (!c) throw new Error('Component not found.'); return this.addCrmComponent(c.dashboard_id, { ...camel(c), name: `Copy of ${c.name}`, chartType: c.chart_type }); },
    async moveCrmComponent(id, dashboardId) { await editor(); return compOut(ok(await sb.from('crm_dash_components').update({ dashboard_id: dashboardId }).eq('id', id).select('*').single()), {}); },
    async retireCrmComponent(id, retired = true) { await editor(); ok(await sb.from('crm_dash_components').update({ retired_at: retired ? new Date().toISOString() : null }).eq('id', id)); return { ok: true }; },
    async reorderCrmDashboard(id, items = []) { await editor(); await Promise.all(items.map((it, i) => pack(sb.from('crm_dash_components').update({ position: i, width: componentWidth(it.width), height: componentHeight(it.height, 2) }).eq('id', it.id).eq('dashboard_id', id)))); return { ok: true }; },
    async previewCrmComponent(v = {}) {
      const u = await who(); const spec = componentSpec(v); const module = requireModule(spec.module); const type = componentType(spec.type); const target = componentTarget({ ...spec, type }); const cfg = await self.getCrmSettings(); const fields = moduleFields(module, cfg);
      let rows = await rowsOf(module); rows = applyCriteria(rows, componentCriteria(spec.criteria), fields, { logic: 'and', today: localDate() });
      const measure = packMeasure(spec); const chartType = chartTypeFor(type, spec.chartType); const data = chartData(rows, { grouping: spec.grouping || {}, grouping2: spec.grouping2 || {}, measure }, fields, cfg);
      if (type === 'kpi' || type === 'target') { const value = measureOf(rows, measure, fields) || 0; data.value = value; data.count = rows.length; if (type === 'target') { data.target = target; data.pct = target ? Math.round((value / target) * 1000) / 10 : 0; } }
      const config = { module, measure, grouping: spec.grouping, criteria: componentCriteria(spec.criteria), chartType }; if (spec.grouping2) config.grouping2 = spec.grouping2; if (target != null) config.target = target;
      return { name: componentName(spec.name, 'Preview'), type, module, config, data, ownerId: u.id };
    },
    async crmDrillDown() { await who(); return { title: 'Records', rows: [] }; },
    async listCrmReportFolders() {
      const u = await who(); const folders = await pack(sb.from('crm_report_folders').select('*').order('name'));
      const reports = await pack(sb.from('crm_reports').select('id,folder_id').is('retired_at', null));
      return { canCreate: !!u.isAdmin, folders: folders.map((f) => ({ ...camel(f), kind: 'shared', count: reports.filter((r) => r.folder_id === f.id).length })) };
    },
    async createCrmReportFolder(name) { const u = await editor(); if (!u.isAdmin) throw new Error('Only an Admin or Super admin can create report folders.'); const n = String(name || '').trim(); if (!n) throw new Error('Folder name is required.'); return camel(ok(await sb.from('crm_report_folders').insert({ name: n.slice(0, 80), created_by: u.id }).select('*').single())); },
    async listCrmReports({ includeRetired = false } = {}) {
      const u = await who(); const folders = await pack(sb.from('crm_report_folders').select('*'));
      return (await pack(sb.from('crm_reports').select('*').order('name'))).map((r) => repOut(u, r, folders)).filter((r) => reportVisible(u, r) && (includeRetired || !r.retired));
    },
    async getCrmReport(id) { const u = await who(); const folders = await pack(sb.from('crm_report_folders').select('*')); const r = ok(await sb.from('crm_reports').select('*').eq('id', id).maybeSingle()); if (!r) throw new Error('Report not found.'); return repOut(u, r, folders); },
    async createCrmReport(input = {}) {
      const u = await editor(); const name = String(input.name || '').trim(); if (!name) throw new Error('Report Name is required.');
      const r = ok(await sb.from('crm_reports').insert({ name: name.slice(0, 120), description: String(input.description || '').slice(0, 500), folder_id: input.folderId || null, module: input.module, related: input.related || [], columns: input.columns || [], row_groups: input.rowGroups || [], aggregates: input.aggregates || [], filters: input.filters || [], logic: input.logic || 'and', sort: input.sort || null, share_mode: (input.share && input.share.mode) || 'all', share: input.share || { mode: 'all' }, created_by: u.id }).select('*').single());
      return this.getCrmReport(r.id);
    },
    async updateCrmReport(id, patch = {}) {
      await editor(); const o = { modified_at: new Date().toISOString() };
      ['name', 'description', 'module', 'logic'].forEach((k) => { if (patch[k] != null) o[k] = patch[k]; });
      if (patch.folderId !== undefined) o.folder_id = patch.folderId; if (patch.columns) o.columns = patch.columns; if (patch.rowGroups) o.row_groups = patch.rowGroups;
      if (patch.aggregates) o.aggregates = patch.aggregates; if (patch.filters) o.filters = patch.filters; if (patch.related) o.related = patch.related; if (patch.sort) o.sort = patch.sort; if (patch.share) { o.share = patch.share; o.share_mode = patch.share.mode || 'all'; }
      ok(await sb.from('crm_reports').update(o).eq('id', id)); return this.getCrmReport(id);
    },
    async cloneCrmReport(id, { name } = {}) { const r = await this.getCrmReport(id); return this.createCrmReport({ ...r, name: name || `Copy of ${r.name}`, folderId: r.folderId }); },
    async retireCrmReport(id, retired = true) { const u = await editor(); ok(await sb.from('crm_reports').update({ retired_at: retired ? new Date().toISOString() : null, retired_by: retired ? u.id : null }).eq('id', id)); return { ok: true }; },
    async runCrmReport(idOrDef) {
      const u = await who(); const cfg = await self.getCrmSettings();
      const def = typeof idOrDef === 'string' ? await this.getCrmReport(idOrDef) : idOrDef;
      const fields = reportFields(def.module, def.related || [], cfg);
      const rows = await rowsOf(def.module);
      const out = runReport(rows, def, fields, cfg, { today: localDate() });
      return { ...out, filterText: '', groupFields: (def.rowGroups || []).map((k) => (fields.find((f) => f.key === k) || {}).label || k) };
    },
    async exportCrmReport(id) { const u = await who(); if (!u.isAdmin) throw new Error('Only an Admin or Super admin can export a report.'); const rep = await this.getCrmReport(id); const out = await this.runCrmReport(id); return { name: `${rep.name}.csv`, csv: reportCsv(out, out.groupFields || []) }; },
  };
}
